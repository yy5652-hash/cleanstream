import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { auditChecked, auditCsv, canAddAudit, contamination, needsCondition, snapshotAudit } from './audit'
import { createPilot, exportPilot, parsePilot, rate, stations, validWeights } from './pilot'
import { belongs, type Pack } from './rules'
import type { Audit, AuditItem } from './store'
import { formatKg } from './format'
import { AuditSession } from './views/Audit'

const nyc: Pack = JSON.parse(readFileSync(new URL('../public/rules/nyc.json', import.meta.url), 'utf8'))
const item = (pred: string, condition?: string): AuditItem => ({ id: pred, thumb: '', pred, p: 0.9, checked: true, condition })
const audit = (items: AuditItem[], bin = 'green'): Audit => ({ id: 'audit', site: 'Library', pack: 'nyc', bin, date: '2026-11-22', phase: 'baseline', items })
const render = (a: Audit, outcome: 'weight' | 'count' = 'weight') => renderToStaticMarkup(<AuditSession audit={a} pack={nyc} ready={false} idle classes={[]} close={() => {}} update={() => {}} remove={() => {}} addToPilot={() => {}} pilotOutcome={outcome} />)

it('rounds displayed kilograms to two decimal places and omits trailing zeroes', () => {
  const decimal = new Intl.NumberFormat().formatToParts(1.5).find((part) => part.type === 'decimal')!.value
  expect([2.8000000000000003, 1.359, 8].map(formatKg)).toEqual([`2${decimal}8`, `1${decimal}36`, '8'])
  const html = render({ ...audit([]), kind: 'weighed', weights: { totalKg: 8, contaminantKg: 2.8000000000000003 } })
  expect(html).toContain(`${formatKg(2.8)} / 8 kg contaminants`)
})

describe('condition-aware audits', () => {
  it('uses only the chosen case and also bins, preserving unspecified non-audit acceptance', () => {
    expect(belongs(nyc, 'pizza_box', 'green')).toBe(true)
    expect(belongs(nyc, 'pizza_box', 'green', 'greasy')).toBe(false)
    expect(belongs(nyc, 'pizza_box', 'green', 'clean')).toBe(true)
    expect(belongs(nyc, 'pizza_box', 'green', 'unknown')).toBe(false)
    const pack = { ...nyc, items: { ...nyc.items, pizza_box: { ...nyc.items.pizza_box, also: ['blue'] } } }
    expect(belongs(pack, 'pizza_box', 'blue', 'greasy')).toBe(true)
    expect(belongs(pack, 'pizza_box', 'green', 'greasy')).toBe(false)
  })
  it('counts greasy pizza as contamination, preserving its condition in offenders, CSV and portable snapshots', () => {
    const a = audit([item('pizza_box', 'greasy'), { ...item('pizza_box', 'clean'), id: 'clean' }])
    expect(auditChecked(a, nyc)).toBe(true)
    expect(contamination(a, nyc)).toMatchObject({ n: 2, bad: 1, rate: 0.5, checked: 2, top: [['pizza_box', 1, 'greasy']] })
    const csv = auditCsv(a, nyc)!
    expect(csv.split('\n')[0]).toContain('"condition"')
    expect(csv.split('\n')[1]).toContain('"Pizza box","greasy"')
    expect(csv.split('\n')[1]).toContain('"Brown bin","yes"')
    expect(csv.split('\n')[2]).toContain('"Green bin","no"')
    const snapshot = snapshotAudit(a, nyc, 'with', 'before')!
    expect(snapshot.conditions).toEqual([{ item: 'pizza_box', condition: 'greasy', n: 1, bad: 1 }, { item: 'pizza_box', condition: 'clean', n: 1, bad: 0 }])
    const p = { ...createPilot({ id: 'p', name: 'Pilot', pack: 'nyc', created: a.date, primaryBin: snapshot.bin }, nyc), audits: [snapshot] }
    expect(parsePilot(exportPilot(p)).pilot?.audits).toEqual([snapshot])
    expect(exportPilot(p)).not.toContain('thumb')
    const html = render(a)
    expect(html).toContain('Greasy, or food stuck to it')
    expect(html).toContain('Brown bin')
    expect(html).toContain('50%')
  })
  it('requires a battery condition even after the label is confirmed or bulk checked', () => {
    const a = audit([item('battery')], 'trash')
    expect(needsCondition(a, a.items[0], nyc)).toBe(true)
    expect(auditChecked(a, nyc)).toBe(false)
    expect(auditCsv(a, nyc)).toBeNull()
    expect(snapshotAudit(a, nyc, 'with', 'before')).toBeNull()
    expect(contamination(a, nyc)).toMatchObject({ n: 0, checked: 0 })
    const html = render(a)
    expect(html).toContain('Choose the condition')
    expect(html).toContain('Single-use alkaline')
    expect(html).toContain('Rechargeable, lithium, button or coin')
    expect(html).toMatch(/disabled=""[^>]*>.*?Export CSV/)
    expect(html).toMatch(/disabled=""[^>]*>Add checked audit to pilot/)
    a.items[0].condition = 'rechargeable'
    expect(auditChecked(a, nyc)).toBe(true)
    expect(contamination(a, nyc)).toMatchObject({ n: 1, bad: 1, rate: 1 })
    a.items[0].condition = 'alkaline'
    expect(contamination(a, nyc)).toMatchObject({ n: 1, bad: 0, rate: 0 })
  })
  it('keeps saved checked pizza labels provisional until a valid condition is chosen', () => {
    for (const condition of [undefined, 'stale']) {
      const a = audit([item('pizza_box', condition)])
      expect(auditChecked(a, nyc)).toBe(false)
      expect(canAddAudit(a, nyc, 'weight')).toBe(false)
    }
  })
  it('does not need a choice when every case agrees about the audited bin, including also acceptance', () => {
    const a = audit([item('battery')], 'blue')
    expect(auditChecked(a, nyc)).toBe(true)
    expect(contamination(a, nyc)).toMatchObject({ n: 1, bad: 1, checked: 1 })
    const pack = { ...nyc, items: { ...nyc.items, battery: { ...nyc.items.battery, also: ['blue'] } } }
    expect(auditChecked(a, pack)).toBe(true)
    expect(contamination(a, pack).bad).toBe(0)
  })
  it('preserves label checks and contamination for items without cases', () => {
    const a = audit([item('metal_can')], 'blue')
    expect(auditChecked(a, nyc)).toBe(true)
    expect(contamination(a, nyc)).toMatchObject({ n: 1, bad: 0, checked: 1 })
    a.items[0].checked = false
    expect(auditChecked(a, nyc)).toBe(false)
  })
})

describe('direct weighed audits', () => {
  const weighed = (): Audit => ({ ...audit([]), kind: 'weighed', weights: { totalKg: 10, contaminantKg: 2 }, auditor: 'AB', notes: 'Whole sample, including wet waste.' })
  it('is checked without photos and contributes weight without inventing counts', () => {
    const a = weighed()
    expect(auditChecked(a, nyc)).toBe(true)
    expect(canAddAudit(a, nyc, 'weight')).toBe(true)
    expect(canAddAudit(a, nyc, 'count')).toBe(false)
    const snapshot = snapshotAudit(a, nyc, 'with', 'before')!
    expect(snapshot).not.toHaveProperty('n')
    expect(snapshot).not.toHaveProperty('bad')
    expect(snapshot).toMatchObject({ weights: a.weights, auditor: 'AB', notes: a.notes })
    const p = { ...createPilot({ id: 'p', name: 'Pilot', pack: 'nyc', created: a.date, primaryBin: snapshot.bin }, nyc), audits: [snapshot, { ...snapshot, id: 'after', date: '2026-11-23', phase: 'after' as const, weights: { totalKg: 10, contaminantKg: 1 } }] }
    expect(rate(p, 'with', 'before')).toMatchObject({ n: 0, rate: null, weightRate: 0.2 })
    expect(stations(p)[0].change).toBeCloseTo(-0.1)
    expect(stations(p, 'count')[0]).toMatchObject({ incomplete: 'count', change: null })
    expect(parsePilot(exportPilot(p)).pilot).toEqual(p)
    expect(auditCsv(a, nyc)).toContain('"10","2","AB","Whole sample, including wet waste."')
    expect(render(a)).toContain('Contamination by weight')
    expect(render(a, 'count')).toContain('This pilot uses item counts.')
  })
  it.each([{ totalKg: 0, contaminantKg: 0 }, { totalKg: -1, contaminantKg: 0 }, { totalKg: 2, contaminantKg: -1 }, { totalKg: 2, contaminantKg: 3 }, { totalKg: Infinity, contaminantKg: 1 }, { totalKg: 2, contaminantKg: NaN }])('rejects invalid weights %j', (weights) => {
    const a = { ...weighed(), weights }
    expect(validWeights(weights)).toBe(false)
    expect(auditChecked(a, nyc)).toBe(false)
    expect(snapshotAudit(a, nyc, 'with', 'before')).toBeNull()
  })
  it('accepts zero or all contaminants and keeps diagnostic photos out of item counts', () => {
    for (const contaminantKg of [0, 10]) {
      const a = { ...weighed(), weights: { totalKg: 10, contaminantKg }, items: [item('pizza_box', 'greasy')] }
      expect(snapshotAudit(a, nyc, 'with', 'before')).not.toHaveProperty('n')
      expect(auditChecked(a, nyc)).toBe(true)
    }
  })
})

describe('pilot corrections and canonical weights', () => {
  it('keeps a pending snapshot and its weights, excludes it, and restores it after recheck', async () => {
    const { syncPilotAudits } = await import('./audit')
    const { migrateAuditWeights } = await import('./store')
    const a = audit([item('metal_can')], 'blue')
    const snapshot = { ...snapshotAudit(a, nyc, 'with', 'before')!, weights: { totalKg: 8, contaminantKg: 2 } }
    const p = { ...createPilot({ id: 'p', name: 'Pilot', pack: 'nyc', created: a.date, primaryBin: 'blue' }, nyc), audits: [snapshot] }
    const migrated = migrateAuditWeights([a], [p])[0]
    expect(migrated.weights).toEqual(snapshot.weights)
    migrated.items[0].checked = false
    const pending = syncPilotAudits([p], [migrated], [nyc])[0]
    expect(pending.audits).toHaveLength(1)
    expect(pending.audits[0]).toMatchObject({ id: a.id, weights: snapshot.weights, pendingRecheck: true, arm: 'with', phase: 'before' })
    expect(rate(pending, 'with', 'before')).toMatchObject({ audits: 0, n: 0, weightRate: null })
    expect(parsePilot(exportPilot(pending)).pilot).toEqual(pending)
    migrated.items[0].checked = true
    migrated.weights = { totalKg: 10, contaminantKg: 1 }
    const restored = syncPilotAudits([pending], [migrated], [nyc])[0]
    expect(restored.audits[0]).toEqual({ ...snapshot, weights: migrated.weights })
    expect(rate(restored, 'with', 'before').weightRate).toBe(0.1)
    expect(auditCsv(migrated, nyc)).toContain('"10","1"')
    migrated.weights = undefined
    expect(syncPilotAudits([restored], [migrated], [nyc])[0].audits[0].weights).toBeUndefined()
  })
  it('does not overwrite canonical audit weights with a stale snapshot', async () => {
    const { migrateAuditWeights } = await import('./store')
    const a = { ...audit([item('metal_can')], 'blue'), weights: { totalKg: 5, contaminantKg: 1 } }
    const p = { ...createPilot({ id: 'p', name: 'P', pack: 'nyc', created: a.date }, nyc), audits: [{ ...snapshotAudit(a, nyc, 'with', 'before')!, weights: { totalKg: 99, contaminantKg: 99 } }] }
    expect(migrateAuditWeights([a], [p])[0].weights).toEqual(a.weights)
  })
})
