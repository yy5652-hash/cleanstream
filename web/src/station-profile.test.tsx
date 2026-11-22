import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StationBins, StationDestination } from './components/StationBins'
import { answer, binById, type Pack } from './rules'
import { kioskUrl, mergePhysicalBins, normalizeProfile, physicalBinFor, profileFromBins, readConfig, readStationProfile, saveStationProfile, splitPhysicalBin, stationBinsKey, stationLinkKey, stationProfileKey } from './station-config'
import Poster from './views/Poster'
import { itemShort } from './items'
import StationReport, { stationCsv } from './views/StationReport'
import StationSetup from './views/StationSetup'
import { readCountingSince, record, resetStationCounts, startStationPilot, type StationLog } from './store'

vi.mock('./i18n', async (original) => ({ ...await original<typeof import('./i18n')>(), useLang: () => ({ lang: 'en', ready: true }) }))

const pack: Pack = JSON.parse(readFileSync(new URL('../public/rules/nyc.json', import.meta.url), 'utf8'))
const initial = profileFromBins(pack, ['blue', 'green', 'brown', 'trash'])
const merged = mergePhysicalBins(initial, 'green', 'blue')
merged.bins[0].label = 'Recycling'
merged.note = 'Drop-off: take batteries to the front desk'
merged.approvedBy = 'Alex "Coordinator"'
merged.approvedDate = '2026-11-22'
merged.source = 'Facilities signs & policy'
let values: Map<string, string>
beforeEach(() => {
  values = new Map()
  vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) })
  vi.stubGlobal('location', { origin: 'https://example.com' })
})
afterEach(() => vi.unstubAllGlobals())

describe('physical station bins', () => {
  it.each(['paper', 'metal_can'])('lights and points at Recycling for a %s answer', (item) => {
    const result = answer(pack, [item], new Float32Array([1]))
    expect(result.sure).toBe(true)
    const target = result.bins[0].bin
    expect(physicalBinFor(merged, target.id)?.label).toBe('Recycling')
    const strip = renderToStaticMarkup(<StationBins pack={pack} profile={merged} target={target} />)
    expect(strip).toContain('data-physical-bin="blue" data-active="true"')
    expect(strip.match(/data-active="true"/g)).toHaveLength(1)
    expect(strip.match(/aria-label="Use this bin"/g)).toHaveLength(1)
    const destination = renderToStaticMarkup(<StationDestination profile={merged} target={target} prep="Empty first" />)
    expect(destination).toMatch(/<h2[^>]*>Recycling<\/h2>/)
    expect(destination).toContain(target.name)
  })
  it('shows the missing-stream note without lighting any physical bin', () => {
    const target = binById(pack, pack.items.battery.bin)
    expect(target.id).toBe('dropoff')
    expect(renderToStaticMarkup(<StationDestination profile={merged} target={target} />)).toContain(merged.note)
    expect(renderToStaticMarkup(<StationBins pack={pack} profile={merged} target={target} />)).not.toContain('data-active="true"')
  })
  it('splits a merge back into individual city streams in position', () => {
    expect(splitPhysicalBin(pack, merged, 'blue').bins).toEqual(initial.bins)
    expect(mergePhysicalBins(initial, 'missing', 'blue')).toBe(initial)
  })
  it('round-trips a compact profile including unicode, reserved characters and metadata', () => {
    const profile = { ...merged, note: '大厅 & # ? = + " <text>' }
    const config = readConfig(kioskUrl({ city: pack.id, profile }).split('?')[1])
    expect(config.profile).toEqual(normalizeProfile(profile, pack.bins))
    expect(kioskUrl({ city: pack.id, profile })).not.toMatch(/pin|hash|salt/i)
  })
  it('migrates old saved configs and gives old links explicit precedence over saved merges', () => {
    values.set(stationBinsKey(pack.id), '["trash","green","blue"]')
    expect(readStationProfile(pack).bins).toEqual(profileFromBins(pack, ['trash', 'green', 'blue']).bins)
    saveStationProfile(pack, merged)
    expect(readStationProfile(pack)).toEqual(normalizeProfile(merged, pack.bins))
    const old = readConfig('?city=nyc&bins=green,blue')
    expect(readStationProfile(pack, old.profile, old.bins)).toEqual(profileFromBins(pack, ['green', 'blue']))
    expect(values.has(stationProfileKey(pack.id))).toBe(true)
  })
  it('retains saved local changes when reopening the same station link', () => {
    const url = kioskUrl({ city: pack.id, profile: merged })
    const config = readConfig(url.split('?')[1])
    values.set(stationLinkKey(pack.id), new URLSearchParams(url.split('?')[1]).get('p')!)
    const changed = { ...merged, bins: [...merged.bins].reverse() }
    saveStationProfile(pack, changed)
    expect(readStationProfile(pack, config.profile)).toEqual(normalizeProfile(changed, pack.bins))
    // An unrelated link still imports its own selection.
    expect(readStationProfile(pack, undefined, ['trash']).bins).toEqual(profileFromBins(pack, ['trash']).bins)
  })
  it('keeps setup usable when long unicode profile details exceed QR capacity', () => {
    saveStationProfile(pack, { ...merged, bins: merged.bins.map((b) => ({ ...b, label: '回收'.repeat(40) })), note: '说明'.repeat(150), approvedBy: '姓名'.repeat(80), source: '来源'.repeat(150) })
    expect(() => renderToStaticMarkup(<StationSetup pack={pack} onCity={() => {}} />)).not.toThrow()
  })
  it('validates links and saved profiles, removes duplicate and foreign streams, and preserves empty layouts', () => {
    expect(readConfig('?city=nyc&p=garbage').profile).toBeUndefined()
    const profile = normalizeProfile({ bins: [{ id: 'bad', label: '', streams: ['blue', 'blue', 'missing'] }, { id: 'green', label: 'Another', streams: ['blue', 'green'] }] }, pack.bins)!
    expect(profile.bins).toEqual([{ id: 'blue', label: binById(pack, 'blue').name, streams: ['blue'] }, { id: 'green', label: 'Another', streams: ['green'] }])
    saveStationProfile(pack, { bins: [] })
    expect(readStationProfile(pack).bins).toEqual([])
  })
  it('prints physical labels, order, note and approval with items from both merged streams', () => {
    saveStationProfile(pack, merged)
    values.set('cleanstream.station.log', JSON.stringify({ nyc: { '2026-11-22': { bins: { blue: 1, green: 1 }, items: { metal_can: 1, paper: 1 }, unsure: 0 } } }))
    const html = renderToStaticMarkup(<Poster pack={pack} />)
    expect(html).toContain('Recycling</h3>')
    expect(html).toContain(merged.note)
    expect(html).toContain('Approval date: 2026-11-22')
    expect(html).toContain('Alex &quot;Coordinator&quot;')
    expect(html).toContain(itemShort('metal_can'))
    expect(html).toContain(itemShort('paper'))
    expect(html.indexOf('Recycling</h3>')).toBeLessThan(html.indexOf('Trash</h3>'))
  })
})

describe('pilot count boundary', () => {
  it('exports physical labels and escaped approval metadata while keeping city stream ids', () => {
    let log: StationLog = {}
    for (const [bin, item] of [['blue', 'metal_can'], ['green', 'paper']]) log = record(log, pack.id, '2026-11-01', { bin, item })
    const csv = stationCsv(pack, log.nyc, ['2026-11-01'], merged)
    expect(csv).toContain('"physical_bin","approved_by","approval_date"')
    expect(csv.match(/"Recycling"/g)).toHaveLength(2)
    expect(csv).toContain('"Alex ""Coordinator""","2026-11-22"')
    expect(csv).toContain('"bin","blue"')
    expect(csv).toContain('"bin","green"')
  })
  it('clears only this city and persists and renders the counting start date', () => {
    const log = record(record({}, 'nyc', '2026-11-01', null), 'sf', '2026-11-01', null)
    let fresh = log
    const since = startStationPilot('nyc', () => { fresh = resetStationCounts(log, 'nyc') }, '2026-11-22')
    expect(fresh).toEqual({ sf: log.sf })
    expect(log.nyc).toBeDefined()
    expect(since).toBe('2026-11-22')
    expect(readCountingSince('nyc')).toBe(since)
    expect(renderToStaticMarkup(<StationReport pack={pack} log={{}} onReset={() => {}} />)).toContain('Counting since 2026-11-22')
  })
  it('leaves counts intact if saving the pilot start date fails', () => {
    const clear = vi.fn()
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('full') } })
    expect(() => startStationPilot('nyc', clear)).toThrow('full')
    expect(clear).not.toHaveBeenCalled()
  })
})
