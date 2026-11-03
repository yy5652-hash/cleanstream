import { describe, expect, it } from 'vitest'
import { change, exportPilot, mergePilots, netEffect, parsePilot, rate, sampleSize, validWeights, verdict, wilson, type Pilot, type PilotAudit } from './pilot'
const audit = (overrides: Partial<PilotAudit> = {}): PilotAudit => ({ id: 'a', site: 'Library', pack: 'nyc', bin: 'paper', date: '2026-11-02', arm: 'with', phase: 'before', n: 100, bad: 30, ...overrides })
const pilot = (audits: PilotAudit[] = []): Pilot => ({ id: 'p', name: 'Library', pack: 'nyc', created: '2026-11-02', audits })
const design = () => pilot([
  audit(), audit({ id: 'b', phase: 'after', bad: 10 }),
  audit({ id: 'c', arm: 'without', bad: 30 }), audit({ id: 'd', arm: 'without', phase: 'after', bad: 25 }),
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
  it('calculates difference in differences and the sum of four variances', () => {
    const e = netEffect(design())!
    expect(e.value).toBeCloseTo(-0.15)
    const half = 1.959963984540054 * Math.sqrt((0.3 * 0.7 + 0.1 * 0.9 + 0.3 * 0.7 + 0.25 * 0.75) / 100)
    expect(e.low).toBeCloseTo(-0.15 - half)
    expect(e.high).toBeCloseTo(-0.15 + half)
    expect(netEffect(pilot([audit(), audit({ id: 'b', phase: 'after' })]))).toBeNull()
  })
  it('only returns a directional verdict when the entire interval clears zero', () => {
    expect(verdict({ value: -0.2, low: -0.3, high: -0.1 })).toBe('Lower with stations')
    expect(verdict({ value: 0.2, low: 0.1, high: 0.3 })).toBe('Higher with stations')
    expect(verdict({ value: -0.1, low: -0.2, high: 0 })).toBe('Not enough to tell yet')
    expect(verdict({ value: 0, low: -0.1, high: 0.1 })).toBe('Not enough to tell yet')
    expect(verdict(null)).toBe('Not enough to tell yet')
  })
  it('retains uncertainty for two zero-count samples', () => {
    const e = change(pilot([audit({ bad: 0 }), audit({ id: 'b', phase: 'after', bad: 0 })]), 'with')!
    expect(e.low).toBeLessThan(0)
    expect(e.high).toBeGreaterThan(0)
    expect(verdict(e)).toBe('Not enough to tell yet')
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
      expect(report).toContain('95% interval:')
      expect(report).toContain('Items in one bin are not independent')
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
