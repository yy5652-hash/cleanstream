import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vitest'
import { record, stationId, stationLogWriter, type StationLog } from './store'
import { stationCsv } from './views/StationReport'
import type { Pack } from './rules'

const pack: Pack = JSON.parse(readFileSync(new URL('../public/rules/nyc.json', import.meta.url), 'utf8'))
afterEach(() => vi.unstubAllGlobals())

it('persists camera answers, taps and unanswered prompts but never demo or off callbacks', () => {
  let log: StationLog = {}
  const persist = vi.fn((f: (old: StationLog) => StationLog) => { log = f(log) })
  const demo = stationLogWriter('demo', persist)
  const camera = stationLogWriter('camera', persist)
  const updates = [
    (l: StationLog) => record(l, 'nyc', '2026-11-22', { bin: 'blue', item: 'metal_can' }),
    (l: StationLog) => record(l, 'nyc', '2026-11-22', { bin: 'blue', item: 'metal_can', tapped: true }),
    (l: StationLog) => record(l, 'nyc', '2026-11-22', null),
  ]
  for (const update of updates) demo(update)
  expect(log).toEqual({})
  expect(persist).not.toHaveBeenCalled()
  for (const update of updates) camera(update)
  const real = JSON.stringify(log)
  // A demo callback captured before a source switch remains a no-op afterwards.
  for (const update of updates) { demo(update); stationLogWriter('off', persist)(update) }
  expect(JSON.stringify(log)).toBe(real)
  expect(persist).toHaveBeenCalledTimes(3)
  expect(log.nyc['2026-11-22']).toMatchObject({ bins: { blue: 2 }, unsure: 1, tapped: 1 })
})

it('stores one device id across exports and includes camera source and package version on every CSV row', () => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) })
  const firstId = stationId()
  expect(firstId).toMatch(/^[0-9a-f-]{36}$/)
  expect(values.get('cleanstream.station.id')).toBe(firstId)
  expect(stationId()).toBe(firstId)
  const csv = stationCsv(pack, { '2026-11-22': { bins: { blue: 1 }, items: { metal_can: 1 }, tapped: 1, unsure: 1 } }, ['2026-11-22'])
  const rows = csv.split('\n')
  expect(rows).toHaveLength(5)
  expect(rows[0]).toBe('"date","city","type","id","name","count","physical_bin","approved_by","approval_date","station_id","source","app_version"')
  const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
  for (const row of rows.slice(1)) expect(row.endsWith(`"${firstId}","camera","${version}"`)).toBe(true)
  expect(stationCsv(pack, {}, []).split('\n')).toHaveLength(1)
})

it('retains a previously stored station id', () => {
  vi.stubGlobal('localStorage', { getItem: () => 'existing-tablet-id' })
  expect(stationId()).toBe('existing-tablet-id')
})
