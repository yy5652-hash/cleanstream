import { describe, expect, it } from 'vitest'
import { change, exportPilot, mergePilots, netEffect, parsePilot, rate, sampleSize, stations, t975, validWeights, verdict, wilson, type Pilot, type PilotAudit } from './pilot'
const audit = (overrides: Partial<PilotAudit> = {}): PilotAudit => ({ id: 'a', site: 'Library', pack: 'nyc', bin: 'paper', date: '2026-11-02', arm: 'with', phase: 'before', n: 100, bad: 30, ...overrides })
const pilot = (audits: PilotAudit[] = []): Pilot => ({ id: 'p', name: 'Library', pack: 'nyc', created: '2026-11-02', audits })
const design = () => pilot([
  audit(), audit({ id: 'b', phase: 'after', bad: 10 }),
  audit({ site: 'Canteen', id: 'c', arm: 'without', bad: 30 }), audit({ site: 'Canteen', id: 'd', arm: 'without', phase: 'after', bad: 25 }),
])

describe('pilot rates', () => {
  it('keeps empty cells distinct from zero contamination', () => {
    expect(rate(pilot(), 'with', 'before')).toMatchObject({ n: 0, rate: null, weightRate: null })
    expect(rate(pilot([audit({ bad: 0 })]), 'with', 'before').rate).toBe(0)
    expect(change(pilot(), 'with')).toBeNull()
    expect(netEffect(pilot(),)).toBeNull()
  })
  it('pools item counts and only weighed audits, not averages of percentages', () => {
    const p = pilot([audit({ n: 10, bad: 5, weights: { totalKg: 1, contaminantKg: 0.8 } }), audit({ id: 'b', n: 90, bad: 9, weights: { totalKg: 9, contaminantKg: 0.2 } }), audit({ id: 'c', n: 100, bad: 6 })])
    expect(rate(p, 'with', 'before')).toMatchObject({ n: 200, bad: 20, rate: 0.1, weightRate: 0.1, weighedAudits: 2, audits: 3, weights: { totalKg: 10, contaminantKg: 1 } })
  })
  it('does not mix arms or phases', () => {
    const p = design()
    expect(rate(p, 'without', 'after').bad).toBe(25)
    expect(rate(p, 'with', 'after').bad).toBe(10)
  })
})

describe('intervals and verdicts', () => {
  it('matches reference Wilson limits and includes uncertainty at both boundaries', () => {
    expect(wilson(50, 100)![0]).toBeCloseTo(0.4038315304, 8)
    expect(wilson(50, 100)![1]).toBeCloseTo(0.5961684696, 8)
    expect(wilson(0, 10)![1]).toBeCloseTo(0.2775327999, 8)
    expect(wilson(10, 10)![0]).toBeCloseTo(0.7224672001, 8)
    expect(wilson(0, 0)).toBeNull()
    expect(wilson(11, 10)).toBeNull()
  })
  it('uses Newcombe-Wilson, with reverse-sign symmetry', () => {
    const p = design(), e = change(p, 'with')!
    expect(e.value).toBeCloseTo(-0.2)
    expect(e.low).toBeCloseTo(-0.3057892906, 5)
    expect(e.high).toBeCloseTo(-0.0900020907, 5)
    const reverse = change(pilot([audit({ phase: 'after' }), audit({ id: 'b', bad: 10 })]), 'with')!
    expect(reverse.low).toBeCloseTo(-e.high)
    expect(reverse.high).toBeCloseTo(-e.low)
  })
  const paired = (withChanges = [-0.2, -0.1, 0], withoutChanges = [-0.1, 0, 0.1]) => pilot((['with', 'without'] as const).flatMap((arm) => (arm === 'with' ? withChanges : withoutChanges).flatMap((delta, k) => [
    audit({ id: `${arm}-${k}-b`, site: `${arm}-${k}`, arm, n: 1000, bad: 500 }),
    audit({ id: `${arm}-${k}-a`, site: `${arm}-${k}`, arm, phase: 'after', n: 1000, bad: Math.round(500 + delta * 1000) }),
  ])))
  it('matches a hand-checked Welch interval on equally weighted station changes', () => {
    // Means -0.1 and 0; sample variances both .01; SE=sqrt(.02/3), df=4.
    // t(.975,4)=2.7764451051977987, half-width=.226695793552752.
    const e = netEffect(paired())!
    expect(e.value).toBeCloseTo(-0.1, 12)
    expect(e.df).toBeCloseTo(4, 12)
    expect(e.low).toBeCloseTo(-0.326695793552752, 10)
    expect(e.high).toBeCloseTo(0.126695793552752, 10)
    expect(e.withStations).toBe(3)
    expect(netEffect(design())).toBeNull()
    expect(netEffect(paired([-0.2], [0, 0.1]))).toBeNull()
  })
  it('uses Welch–Satterthwaite degrees of freedom for unequal variances and sample sizes', () => {
    const e = netEffect(paired([-0.2, -0.1, 0], [-0.1, 0.1]))!
    // Variance-of-mean terms .01/3 and .02/2 give df=32/19.
    expect(e.df).toBeCloseTo(32 / 19, 12)
    expect(e.high - e.value).toBeCloseTo(t975(32 / 19) * Math.sqrt(0.01 / 3 + 0.02 / 2), 12)
    const reverse = netEffect(paired([0.2, 0.1, 0], [0.1, 0, -0.1]))!
    expect(reverse.low).toBeCloseTo(-netEffect(paired())!.high, 12)
  })
  it('numerically inverts the t distribution, including small and fractional df', () => {
    expect(t975(1)).toBeCloseTo(12.7062047364, 8)
    expect(t975(2)).toBeCloseTo(4.3026527297, 8)
    expect(t975(4)).toBeCloseTo(2.7764451052, 8)
    expect(t975(2.5)).toBeCloseTo(3.574654842, 8)
    expect(t975(Infinity)).toBeCloseTo(1.95996398454, 10)
  })
  it('does not let extra items or repeated audits create extra independent stations', () => {
    const p = paired()
    const e = netEffect(p)!
    p.audits = p.audits.flatMap((a) => [a, { ...a, id: `${a.id}-copy`, n: a.n * 100, bad: a.bad * 100 }])
    expect(netEffect(p)).toEqual(e)
    expect(stations(p)).toHaveLength(6)
  })
  it('handles zero variance without a spurious infinite interval', () => {
    const e = netEffect(paired([-0.2, -0.2, -0.2], [0, 0, 0]))!
    expect(e.low).toBeCloseTo(-0.2)
    expect(e.high).toBeCloseTo(-0.2)
    expect(verdict(e)).toBe('Lower with stations')
  })
  it('only returns a directional verdict when the entire interval clears zero', () => {
    expect(verdict({ withStations: 3, withoutStations: 3, df: 4, value: -0.2, low: -0.3, high: -0.1 })).toBe('Lower with stations')
    expect(verdict({ withStations: 3, withoutStations: 3, df: 4, value: 0.2, low: 0.1, high: 0.3 })).toBe('Higher with stations')
    expect(verdict({ withStations: 3, withoutStations: 3, df: 4, value: -0.1, low: -0.2, high: 0 })).toBe('Not enough to tell yet')
    expect(verdict({ withStations: 3, withoutStations: 3, df: 4, value: 0, low: -0.1, high: 0.1 })).toBe('Not enough to tell yet')
    expect(verdict(null)).toBe('Not enough to tell yet')
  })
  it('requires three paired stations in each arm even with an interval below zero', () => {
    for (const [withStations, withoutStations] of [[2, 3], [3, 2], [2, 2]]) {
      expect(verdict({ value: -0.2, low: -0.3, high: -0.1, df: 2, withStations, withoutStations })).toBe('Not enough to tell yet')
      expect(verdict({ value: 0.2, low: 0.1, high: 0.3, df: 2, withStations, withoutStations })).toBe('Not enough to tell yet')
    }
  })
  it('retains uncertainty for two zero-count samples', () => {
    const e = change(pilot([audit({ bad: 0 }), audit({ id: 'b', phase: 'after', bad: 0 })]), 'with')!
    expect(e.low).toBeLessThan(0)
    expect(e.high).toBeGreaterThan(0)
    expect(verdict(null)).toBe('Not enough to tell yet')
  })
})

describe('sample planning', () => {
  it('matches the two-proportion 80% power formula', () => {
    expect(sampleSize(0.3, 0.1)).toBe(294)
    expect(sampleSize(0.3, 0.05)).toBeGreaterThan(sampleSize(0.3, 0.1)!)
  })
  it.each([[0, 0.1], [0.2, 0], [0.2, -0.1], [0.2, 0.3], [1.1, 0.1], [NaN, 0.1], [0.3, Infinity]])('rejects invalid baseline %s and drop %s', (b, d) => expect(sampleSize(b, d)).toBeNull())
})

describe('portable pilot files', () => {
  it('round-trips a pilot without any pictures or unexpected fields', () => {
    const p = pilot([Object.assign(audit(), { thumb: 'secret photo', items: [{ thumb: 'another photo' }] })])
    const json = exportPilot(p)
    expect(json).not.toContain('photo')
    expect(json).not.toContain('thumb')
    expect(parsePilot(json).pilot).toEqual(pilot([audit()]))
  })
  it('merges multiple sites and deduplicates audit ids, keeping existing data', () => {
    const a = pilot([audit()]), b = pilot([audit({ bad: 90 }), audit({ id: 'b', site: 'Canteen' })])
    const result = mergePilots(a, [{ name: 'site1', text: exportPilot(b) }, { name: 'site2', text: exportPilot(b) }, { name: 'bad', text: '{' }])
    expect(result.added).toBe(1)
    expect(result.errors).toEqual(['bad'])
    expect(result.pilot.audits[0].bad).toBe(30)
    expect(result.pilot.name).toBe(a.name)
    expect(a.audits).toHaveLength(1)
  })
  it('rejects incompatible cities and synthetic/real mixing', () => {
    expect(mergePilots(pilot(), [{ name: 'other', text: exportPilot({ ...pilot(), pack: 'sf' }) }, { name: 'example', text: exportPilot({ ...pilot(), example: true }) }]).errors).toEqual(['other', 'example'])
  })
  it.each([
    { n: -1 }, { n: 1.5 }, { bad: 101 }, { bad: -1 }, { arm: 'other' }, { phase: 'baseline' }, { date: '2026-02-30' }, { pack: 'sf' }, { id: '' },
    { weights: { totalKg: 0, contaminantKg: 0 } }, { weights: { totalKg: 2, contaminantKg: 3 } }, { weights: { totalKg: 2, contaminantKg: -1 } },
  ])('reports invalid audit data without throwing: %j', (patch) => {
    expect(parsePilot(JSON.stringify(pilot([{ ...audit(), ...patch } as PilotAudit])))).toEqual({ pilot: null, error: true })
  })
  it('rejects duplicate ids, missing fields, wrong types and invalid dates', () => {
    for (const x of [null, [], {}, { ...pilot(), audits: {} }, { ...pilot(), created: 'yesterday' }, { ...pilot(), example: 'yes' }, pilot([audit(), audit()])]) expect(parsePilot(JSON.stringify(x)).error).toBe(true)
    expect(validWeights({ totalKg: Infinity, contaminantKg: 1 })).toBe(false)
    expect(validWeights({ totalKg: 2, contaminantKg: 0 })).toBe(true)
  })
})

// Render the actual views without starting a server, including saved browser data.
describe('measuring screens', () => {
  it('renders the empty pilot method and clearly labelled example report', async () => {
    const { createElement } = await import('react')
    const { renderToStaticMarkup } = await import('react-dom/server')
    const { default: PilotView } = await import('./views/Pilot')
    const { readFileSync } = await import('node:fs')
    const pack = JSON.parse(readFileSync(new URL('../public/rules/nyc.json', import.meta.url), 'utf8'))
    const values = new Map<string, string>()
    const { vi } = await import('vitest')
    vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null })
    try {
      const empty = renderToStaticMarkup(createElement(PilotView, { pack, packs: [pack] }))
      expect(empty).toContain('Start a pilot')
      expect(empty).toContain('All data stays on this device')
      const p = { ...design(), name: 'Example data', example: true }
      values.set('cleanstream.pilots', JSON.stringify([p]))
      const report = renderToStaticMarkup(createElement(PilotView, { pack, packs: [pack] }))
      expect(report).toContain('Example data')
      expect(report).toContain('At least two paired stations per arm')
      expect(report).toContain('All items pooled (not independent)')
      expect(report.indexOf('Contamination by station')).toBeLessThan(report.indexOf('Net effect on contamination'))
      expect(report).toContain('measure-print pilot-print')
      expect(report).toContain('Print or save as PDF')
      expect(report).not.toContain('#audit?pilot=')
    } finally { vi.unstubAllGlobals() }
  })
  it('renders station questions in stored bin order and encodes the city scan URL', async () => {
    const { createElement } = await import('react')
    const { renderToStaticMarkup } = await import('react-dom/server')
    const { default: PosterView } = await import('./views/Poster')
    const { readFileSync } = await import('node:fs')
    const { encode } = await import('uqr')
    const { vi } = await import('vitest')
    const pack = JSON.parse(readFileSync(new URL('../public/rules/nyc.json', import.meta.url), 'utf8'))
    const order = pack.bins.filter((b: { kind: string }) => b.kind !== 'special').map((b: { id: string }) => b.id).reverse()
    const values = new Map<string, string>([
      ['cleanstream.station.bins.nyc', JSON.stringify(order)],
      ['cleanstream.station.log', JSON.stringify({ nyc: { '2026-11-02': { items: { paper_cup: 10, pizza_box: 3 }, bins: {}, unsure: 0 } } })],
    ])
    vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null })
    vi.stubGlobal('location', { origin: 'https://example.org' })
    try {
      const html = renderToStaticMarkup(createElement(PosterView, { pack }))
      expect(html).toContain('Uses the most-asked items at this station')
      const url = `https://example.org${import.meta.env.BASE_URL}#scan?city=nyc`
      expect(html.includes(url)).toBe(true)
      const qr = encode(url, { border: 4, ecc: 'M' })
      expect(html).toContain(`viewBox="0 0 ${qr.size} ${qr.size}"`)
      const sections = html.slice(html.indexOf('poster-columns'))
      const names = order.map((id: string) => pack.bins.find((b: { id: string }) => b.id === id).name)
      expect(sections.indexOf(names[0])).toBeLessThan(sections.indexOf(names[1]))
      expect(html).toContain('Checked ' + pack.checked)
      values.set('cleanstream.station.bins.nyc', '{')
      values.set('cleanstream.station.log', '{}')
      const fallback = renderToStaticMarkup(createElement(PosterView, { pack }))
      expect(fallback).toContain('Uses a built-in list of commonly confused items')
      expect(fallback).toContain('Which bin?')
    } finally { vi.unstubAllGlobals() }
  })
})

describe('station grouping and measurement basis', () => {
  it('groups by the site and bin pair, retaining incomplete and conflicting stations', () => {
    const rows = stations(pilot([audit(), audit({ id: 'b', phase: 'after', bad: 10 }), audit({ id: 'c', bin: 'blue' }), audit({ id: 'd', site: 'Hall' }), audit({ id: 'e', arm: 'without' })]))
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({ site: 'Library', bin: 'paper', arm: null, change: null, before: { audits: 2 }, after: { audits: 1 } })
    expect(rows[1]).toMatchObject({ before: { audits: 1 }, after: { audits: 0, rate: null }, change: null })
  })
  it('uses weight only when every audit of the station is weighed, so both phases share one basis', () => {
    const p = pilot([audit({ weights: { totalKg: 1, contaminantKg: 0.8 } }), audit({ id: 'b', weights: { totalKg: 9, contaminantKg: 0.2 } }), audit({ id: 'c', phase: 'after', n: 20, bad: 2, weights: { totalKg: 1, contaminantKg: 0.5 } }), audit({ id: 'd', phase: 'after', n: 80, bad: 8 })])
    const counted = stations(p)[0]
    expect(counted).toMatchObject({ before: { rate: 0.3, basis: 'count', audits: 2 }, after: { rate: 0.1, basis: 'count', audits: 2 } })
    expect(counted.change).toBeCloseTo(-0.2)
    p.audits[3].weights = { totalKg: 4, contaminantKg: 0.5 }
    const weighed = stations(p)[0]
    expect(weighed).toMatchObject({ before: { rate: 0.1, basis: 'weight' }, after: { rate: 0.2, basis: 'weight' } })
    expect(weighed.change).toBeCloseTo(0.1)
  })
  it('does not treat an empty count sample as a measured zero', () => {
    expect(stations(pilot([audit({ n: 0, bad: 0 })]))[0].before.rate).toBeNull()
  })
})
