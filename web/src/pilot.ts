import type { Pack } from './rules'

export type Arm = 'with' | 'without'
export type Outcome = 'weight' | 'count'
export type Phase = 'before' | 'after'
export type Weights = { totalKg: number; contaminantKg: number }
export type PilotAudit = {
  id: string; site: string; pack: string; bin: string; date: string
  arm: Arm; phase: Phase; n?: number; bad?: number; weights?: Weights
  conditions?: { item: string; condition: string; n: number; bad: number }[]
  auditor?: string; notes?: string; pendingRecheck?: boolean
}
export type Pilot = { id: string; name: string; pack: string; created: string; outcome: Outcome; primaryBin: string; audits: PilotAudit[]; example?: boolean; runComplete?: boolean }
export const auditBins = (pack: Pick<Pack, 'bins'>) => pack.bins.filter((bin) => bin.kind !== 'special')
export const siteKey = (site: string) => site.trim().replace(/\s+/g, ' ').toLowerCase()
export const defaultPrimaryBin = (pack: Pick<Pack, 'bins'>): string => pack.bins.find((b) => b.kind === 'recycle')?.id ?? auditBins(pack)[0]?.id ?? ''
// Migrate once at the storage/import boundary, then keep both choices fixed.
export function migratePilot(pilot: Omit<Pilot, 'outcome' | 'primaryBin'> & { outcome?: Outcome; primaryBin?: string }, fallbackBin = ''): Pilot {
  const bins = new Map<string, number>()
  for (const audit of pilot.audits) bins.set(audit.bin, (bins.get(audit.bin) ?? 0) + 1)
  const primaryBin = [...bins].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallbackBin
  return { ...pilot, primaryBin: pilot.primaryBin || primaryBin, outcome: pilot.outcome ?? (pilot.audits.some((a) => !validWeights(a.weights)) ? 'count' : 'weight') }
}
export function createPilot(data: Pick<Pilot, 'id' | 'name' | 'pack' | 'created'> & { primaryBin?: string }, pack: Pick<Pack, 'bins'>, outcome: Outcome = 'weight'): Pilot {
  return { ...data, primaryBin: auditBins(pack).some((bin) => bin.id === data.primaryBin) ? data.primaryBin! : defaultPrimaryBin(pack), outcome, audits: [] }
}
export const hasCounts = (a: PilotAudit): a is PilotAudit & { n: number; bad: number } => count(a.n) && count(a.bad) && a.n > 0 && a.bad <= a.n
export type Rate = { n: number; bad: number; rate: number | null; weights: Weights | null; weightRate: number | null; weighedAudits: number; audits: number }
export type Estimate = { value: number; low: number; high: number }
const Z = 1.959963984540054

export function rate(pilot: Pilot, arm: Arm, phase: Phase): Rate {
  const xs = pilot.audits.filter((a) => !a.pendingRecheck && a.arm === arm && a.phase === phase)
  const n = xs.reduce((s, a) => s + (a.n ?? 0), 0)
  const bad = xs.reduce((s, a) => s + (a.bad ?? 0), 0)
  const weighed = xs.filter((a) => validWeights(a.weights))
  const weights = weighed.length ? weighed.reduce((s, a) => ({ totalKg: s.totalKg + a.weights!.totalKg, contaminantKg: s.contaminantKg + a.weights!.contaminantKg }), { totalKg: 0, contaminantKg: 0 }) : null
  return { n, bad, rate: n ? bad / n : null, weights, weightRate: weights ? weights.contaminantKg / weights.totalKg : null, weighedAudits: weighed.length, audits: xs.length }
}

export function wilson(bad: number, n: number): [number, number] | null {
  if (!Number.isInteger(n) || !Number.isInteger(bad) || n <= 0 || bad < 0 || bad > n) return null
  const p = bad / n, z2 = Z * Z, den = 1 + z2 / n
  const center = (p + z2 / (2 * n)) / den
  const half = Z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / den
  return [Math.max(0, center - half), Math.min(1, center + half)]
}

// Newcombe's unpooled Wilson interval for after minus before.
export function change(pilot: Pilot, arm: Arm): Estimate | null {
  const b = rate(pilot, arm, 'before'), a = rate(pilot, arm, 'after')
  if (b.rate === null || a.rate === null) return null
  const [bl, bu] = wilson(b.bad, b.n)!, [al, au] = wilson(a.bad, a.n)!
  const value = a.rate - b.rate
  return { value, low: value - Math.hypot(a.rate - al, bu - b.rate), high: value + Math.hypot(au - a.rate, b.rate - bl) }
}

export type StationPhase = { audits: number; rate: number | null; basis: Outcome }
export type StationResult = { site: string; bin: string; arm: Arm | null; before: StationPhase; after: StationPhase; change: number | null; incomplete: Outcome | null; chronologyInvalid: boolean; nameVariants: boolean }
export type StationEstimate = Estimate & { withStations: number; withoutStations: number; df: number }

function stationPhase(audits: PilotAudit[], outcome: Outcome): StationPhase {
  const complete = audits.every((a) => outcome === 'weight' ? validWeights(a.weights) : hasCounts(a))
  const total = complete ? audits.reduce((s, a) => s + (outcome === 'weight' ? a.weights!.totalKg : a.n!), 0) : 0
  const bad = complete ? audits.reduce((s, a) => s + (outcome === 'weight' ? a.weights!.contaminantKg : a.bad!), 0) : 0
  return { audits: audits.length, rate: total > 0 ? bad / total : null, basis: outcome }
}

export function stations(pilot: Pilot, outcome = pilot.outcome, bin = pilot.primaryBin): StationResult[] {
  const groups = new Map<string, PilotAudit[]>()
  for (const audit of pilot.audits) {
    const group = groups.get(siteKey(audit.site)) ?? []
    group.push(audit)
    groups.set(siteKey(audit.site), group)
  }
  return [...groups.entries()].map(([, allAudits]) => {
    const site = allAudits[0].site
    const nameVariants = new Set(allAudits.map((audit) => audit.site)).size > 1
    const checked = allAudits.filter((audit) => !audit.pendingRecheck)
    const beforeDates = checked.filter((audit) => audit.phase === 'before').map((audit) => audit.date)
    const afterDates = checked.filter((audit) => audit.phase === 'after').map((audit) => audit.date)
    const chronologyInvalid = beforeDates.some((before) => afterDates.some((after) => after <= before))
    const audits = checked.filter((a) => a.bin === bin)
    const incomplete = audits.some((a) => outcome === 'weight' ? !validWeights(a.weights) : !hasCounts(a)) ? outcome : null
    const before = stationPhase(audits.filter((a) => a.phase === 'before'), outcome)
    const after = stationPhase(audits.filter((a) => a.phase === 'after'), outcome)
    // Check every stream: a physical station can only belong to one arm.
    const arm = allAudits.every((a) => a.arm === allAudits[0].arm) ? allAudits[0].arm : null
    return { site, bin, arm, before, after, incomplete, chronologyInvalid, nameVariants,
      change: !chronologyInvalid && !incomplete && arm && before.rate !== null && after.rate !== null ? after.rate - before.rate : null }
  })
}

// Lanczos log-gamma and the continued fraction for the regularized incomplete beta.
// Inverting the Student t CDF avoids a normal approximation with few stations.
function logGamma(z: number): number {
  const c = [676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406, 12.507343278686905, -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7]
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z)
  z -= 1
  let x = 0.9999999999998099
  c.forEach((v, i) => { x += v / (z + i + 1) })
  const t = z + 7.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
}
function betaFraction(a: number, b: number, x: number): number {
  const floor = (v: number) => Math.abs(v) < 1e-300 ? 1e-300 : v
  let c = 1, d = 1 / floor(1 - (a + b) * x / (a + 1)), h = d
  for (let m = 1; m <= 500; m++) {
    const m2 = 2 * m
    let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2))
    d = 1 / floor(1 + aa * d); c = floor(1 + aa / c); h *= d * c
    aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1))
    d = 1 / floor(1 + aa * d); c = floor(1 + aa / c)
    const delta = d * c
    h *= delta
    if (Math.abs(delta - 1) < 3e-14) break
  }
  return h
}
function beta(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x))
  return x < (a + 1) / (a + b + 2) ? bt * betaFraction(a, b, x) / a : 1 - bt * betaFraction(b, a, 1 - x) / b
}
export function t975(df: number): number {
  if (df === Infinity) return Z
  if (!(df > 0)) return NaN
  const cdf = (t: number) => 1 - beta(df / (df + t * t), df / 2, 0.5) / 2
  let low = 0, high = 1
  while (cdf(high) < 0.975) high *= 2
  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2
    if (cdf(mid) < 0.975) low = mid
    else high = mid
  }
  return (low + high) / 2
}

function stationChanges(pilot: Pilot, arm: Arm): number[] {
  return stations(pilot).filter((s) => s.arm === arm && s.change !== null).map((s) => s.change!)
}
const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length
export function observedEffect(pilot: Pilot): Pick<StationEstimate, 'value' | 'withStations' | 'withoutStations'> | null {
  const w = stationChanges(pilot, 'with'), c = stationChanges(pilot, 'without')
  return w.length && c.length ? { value: mean(w) - mean(c), withStations: w.length, withoutStations: c.length } : null
}
export function netEffect(pilot: Pilot): StationEstimate | null {
  const w = stationChanges(pilot, 'with'), c = stationChanges(pilot, 'without')
  if (w.length < 3 || c.length < 3) return null
  const variance = (xs: number[]) => xs.reduce((s, v) => s + (v - mean(xs)) ** 2, 0) / (xs.length - 1)
  const vw = variance(w) / w.length, vc = variance(c) / c.length
  // Identical changes contain no empirical station-level uncertainty to estimate.
  const constant = (xs: number[]) => xs.every((v) => Math.abs(v - xs[0]) <= 4 * Number.EPSILON)
  if (constant(w) || constant(c)) return null
  const se2 = vw + vc
  const df = se2 ** 2 / (vw ** 2 / (w.length - 1) + vc ** 2 / (c.length - 1))
  const value = mean(w) - mean(c), half = t975(df) * Math.sqrt(se2)
  return { value, low: value - half, high: value + half, df, withStations: w.length, withoutStations: c.length }
}

export function verdict(e: StationEstimate | null): 'Lower with stations' | 'Higher with stations' | 'Not enough to tell yet' {
  if (!e || e.withStations < 3 || e.withoutStations < 3) return 'Not enough to tell yet'
  return e.high < 0 ? 'Lower with stations' : e.low > 0 ? 'Higher with stations' : 'Not enough to tell yet'
}

const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const str = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0 && x.length <= 500
const count = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0
const date = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(x)) && new Date(x).toISOString().slice(0, 10) === x
export function validWeights(x: unknown): x is Weights {
  return obj(x) && typeof x.totalKg === 'number' && Number.isFinite(x.totalKg) && x.totalKg > 0 && typeof x.contaminantKg === 'number' && Number.isFinite(x.contaminantKg) && x.contaminantKg >= 0 && x.contaminantKg <= x.totalKg
}
export function parsePilot(input: string): { pilot: Pilot | null; error: boolean } {
  try {
    const x: unknown = JSON.parse(input)
    if (!obj(x) || !str(x.id) || !str(x.name) || !str(x.pack) || !date(x.created) || (x.example !== undefined && typeof x.example !== 'boolean') || (x.runComplete !== undefined && typeof x.runComplete !== 'boolean') || (x.outcome !== undefined && x.outcome !== 'weight' && x.outcome !== 'count') || (x.primaryBin !== undefined && x.primaryBin !== '' && !str(x.primaryBin)) || !Array.isArray(x.audits) || x.audits.length > 100000) throw Error()
    const ids = new Set<string>()
    const audits = x.audits.map((a: unknown): PilotAudit => {
      if (!obj(a) || !str(a.id) || ids.has(a.id) || !str(a.site) || a.pack !== x.pack || !str(a.bin) || !date(a.date) || !['with', 'without'].includes(String(a.arm)) || !['before', 'after'].includes(String(a.phase)) || !((count(a.n) && count(a.bad) && a.bad <= a.n) || (a.n === undefined && a.bad === undefined && validWeights(a.weights))) || (a.weights !== undefined && !validWeights(a.weights)) || (a.pendingRecheck !== undefined && typeof a.pendingRecheck !== 'boolean')) throw Error()
      if ((a.auditor !== undefined && !str(a.auditor)) || (a.notes !== undefined && (typeof a.notes !== 'string' || a.notes.length > 10000))) throw Error()
      const conditions: NonNullable<PilotAudit['conditions']> = []
      if (a.conditions !== undefined) {
        if (!Array.isArray(a.conditions) || a.conditions.length > 100000) throw Error()
        for (const c of a.conditions) {
          if (!obj(c) || !str(c.item) || !str(c.condition) || !count(c.n) || !count(c.bad) || c.bad > c.n) throw Error()
          conditions.push({ item: c.item, condition: c.condition, n: c.n, bad: c.bad })
        }
      }
      ids.add(a.id)
      return { ...(a.pendingRecheck ? { pendingRecheck: true } : {}), id: a.id, site: a.site, pack: a.pack as string, bin: a.bin, date: a.date, arm: a.arm as Arm, phase: a.phase as Phase, ...(a.n !== undefined ? { n: a.n as number, bad: a.bad as number } : {}),
        ...(conditions.length ? { conditions } : {}), ...(a.auditor ? { auditor: a.auditor as string } : {}), ...(a.notes ? { notes: a.notes as string } : {}), ...(a.weights ? { weights: { totalKg: (a.weights as Weights).totalKg, contaminantKg: (a.weights as Weights).contaminantKg } } : {}) }
    })
    return { pilot: migratePilot({ id: x.id, name: x.name, pack: x.pack, created: x.created, outcome: x.outcome as Outcome | undefined, primaryBin: x.primaryBin as string | undefined, audits, ...(x.example ? { example: true } : {}), ...(x.runComplete ? { runComplete: true } : {}) }), error: false }
  } catch { return { pilot: null, error: true } }
}
export function exportPilot(pilot: Pilot): string {
  const result = parsePilot(JSON.stringify(pilot))
  return JSON.stringify(result.pilot, null, 2)
}
export function mergePilots(target: Pilot, files: { name: string; text: string }[]): { pilot: Pilot; errors: string[]; added: number } {
  const audits = [...target.audits], ids = new Set(audits.map((a) => a.id)), errors: string[] = []
  for (const f of files) {
    const p = parsePilot(f.text).pilot
    if (!p || p.pack !== target.pack || p.outcome !== target.outcome || p.primaryBin !== target.primaryBin || !!p.example !== !!target.example) { errors.push(f.name); continue }
    for (const a of p.audits) if (!ids.has(a.id)) { audits.push(a); ids.add(a.id) }
  }
  return { pilot: { ...target, audits }, errors, added: audits.length - target.audits.length }
}
