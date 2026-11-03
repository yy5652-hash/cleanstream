export type Arm = 'with' | 'without'
export type Phase = 'before' | 'after'
export type Weights = { totalKg: number; contaminantKg: number }
export type PilotAudit = {
  id: string; site: string; pack: string; bin: string; date: string
  arm: Arm; phase: Phase; n: number; bad: number; weights?: Weights
}
export type Pilot = { id: string; name: string; pack: string; created: string; audits: PilotAudit[]; example?: boolean; runComplete?: boolean }
export type Rate = { n: number; bad: number; rate: number | null; weights: Weights | null; weightRate: number | null; weighedAudits: number; audits: number }
export type Estimate = { value: number; low: number; high: number }
const Z = 1.959963984540054

export function rate(pilot: Pilot, arm: Arm, phase: Phase): Rate {
  const xs = pilot.audits.filter((a) => a.arm === arm && a.phase === phase)
  const n = xs.reduce((s, a) => s + a.n, 0)
  const bad = xs.reduce((s, a) => s + a.bad, 0)
  const weighed = xs.filter((a) => a.weights)
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

export function netEffect(pilot: Pilot): Estimate | null {
  const w = change(pilot, 'with'), c = change(pilot, 'without')
  if (!w || !c) return null
  const variance = (['with', 'without'] as const).flatMap((arm) => (['before', 'after'] as const).map((phase) => rate(pilot, arm, phase))).reduce((s, r) => s + r.rate! * (1 - r.rate!) / r.n, 0)
  const value = w.value - c.value, half = Z * Math.sqrt(variance)
  return { value, low: value - half, high: value + half }
}

export function verdict(e: Estimate | null): 'Lower with stations' | 'Higher with stations' | 'Not enough to tell yet' {
  return e && e.high < 0 ? 'Lower with stations' : e && e.low > 0 ? 'Higher with stations' : 'Not enough to tell yet'
}

// Equal groups, two-sided alpha .05, power .80; items in each phase of an arm.
export function sampleSize(baseline: number, drop: number): number | null {
  if (!Number.isFinite(baseline) || !Number.isFinite(drop) || baseline <= 0 || baseline > 1 || drop <= 0 || drop > baseline) return null
  const after = baseline - drop, pooled = (baseline + after) / 2
  return Math.ceil((Z * Math.sqrt(2 * pooled * (1 - pooled)) + 0.8416212335729143 * Math.sqrt(baseline * (1 - baseline) + after * (1 - after))) ** 2 / drop ** 2)
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
    if (!obj(x) || !str(x.id) || !str(x.name) || !str(x.pack) || !date(x.created) || (x.example !== undefined && typeof x.example !== 'boolean') || (x.runComplete !== undefined && typeof x.runComplete !== 'boolean') || !Array.isArray(x.audits) || x.audits.length > 100000) throw Error()
    const ids = new Set<string>()
    const audits = x.audits.map((a: unknown): PilotAudit => {
      if (!obj(a) || !str(a.id) || ids.has(a.id) || !str(a.site) || a.pack !== x.pack || !str(a.bin) || !date(a.date) || !['with', 'without'].includes(String(a.arm)) || !['before', 'after'].includes(String(a.phase)) || !count(a.n) || !count(a.bad) || a.bad > a.n || (a.weights !== undefined && !validWeights(a.weights))) throw Error()
      ids.add(a.id)
      return { id: a.id, site: a.site, pack: a.pack as string, bin: a.bin, date: a.date, arm: a.arm as Arm, phase: a.phase as Phase, n: a.n, bad: a.bad, ...(a.weights ? { weights: { totalKg: (a.weights as Weights).totalKg, contaminantKg: (a.weights as Weights).contaminantKg } } : {}) }
    })
    return { pilot: { id: x.id, name: x.name, pack: x.pack, created: x.created, audits, ...(x.example ? { example: true } : {}), ...(x.runComplete ? { runComplete: true } : {}) }, error: false }
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
    if (!p || p.pack !== target.pack || !!p.example !== !!target.example) { errors.push(f.name); continue }
    for (const a of p.audits) if (!ids.has(a.id)) { audits.push(a); ids.add(a.id) }
  }
  return { pilot: { ...target, audits }, errors, added: audits.length - target.audits.length }
}
