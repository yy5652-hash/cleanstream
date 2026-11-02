import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PACK_IDS, type Pack } from './rules'
import { kioskUrl, moveBin, readConfig, readStationBins, saveStationBins, stationBinsKey } from './station-config'

const packs: Pack[] = PACK_IDS.map((id) => JSON.parse(readFileSync(new URL(`../public/rules/${id}.json`, import.meta.url), 'utf8')))
const nyc = packs[0]
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('station links', () => {
  it('round-trips the physical order, site, language and source', () => {
    const config = { city: 'nyc', bins: ['blue', 'green', 'brown', 'trash'], site: 'Engineering Lobby', lang: 'es', source: 'camera' } as const
    const url = kioskUrl({ ...config, bins: [...config.bins] })
    expect(url).toBe('/?kiosk&city=nyc&bins=blue,green,brown,trash&site=Engineering%20Lobby&lang=es&source=camera')
    expect(readConfig(url.slice(url.indexOf('?')))).toEqual(config)
  })

  it('keeps the deployed base path in tablet and demo links', () => {
    vi.stubEnv('BASE_URL', '/cleanstream/')
    expect(kioskUrl({ city: 'sf', bins: ['black', 'blue'], source: 'demo' })).toBe('/cleanstream/?kiosk&city=sf&bins=black,blue&lang=en&source=demo')
  })

  it.each(packs)('drops foreign and duplicate bins using $id rules', (pack) => {
    const ids = pack.bins.map((b) => b.id).reverse()
    const config = readConfig(`?city=${pack.id}&bins=unknown,${ids.join(',')},${ids[0]}`)
    expect(config.bins).toEqual(ids)
    expect(readConfig(kioskUrl(config).split('?')[1]).bins).toEqual(ids)
  })

  it('distinguishes an absent layout from an explicitly empty layout', () => {
    expect(readConfig('?city=nyc').bins).toBeUndefined()
    expect(readConfig('?city=nyc&bins=unknown').bins).toEqual([])
    expect(readConfig('?city=nyc&bins=').bins).toEqual([])
  })

  it('uses safe defaults and escapes site text without adding parameters', () => {
    expect(readConfig('?city=missing&lang=missing&source=missing')).toMatchObject({ city: 'nyc', lang: 'en', source: 'camera' })
    const site = '大厅 & source=demo # ? <test>'
    expect(readConfig(kioskUrl({ city: 'sea', site, lang: 'zh-Hant' }).split('?')[1])).toMatchObject({ city: 'sea', site, lang: 'zh-Hant', source: 'camera' })
    expect(readConfig(kioskUrl({ city: 'sf', source: 'demo' }).split('?')[1]).source).toBe('demo')
  })
})

describe('station layout', () => {
  const storage = (value: string | null) => {
    const store = { getItem: vi.fn(() => value), setItem: vi.fn() }
    vi.stubGlobal('localStorage', store)
    return store
  }

  it.each(packs)('defaults to ordinary bins for $id', (pack) => {
    storage(null)
    expect(readStationBins(pack)).toEqual(pack.bins.filter((b) => b.kind !== 'special' && b.id !== 'dropoff').map((b) => b.id))
  })

  it('gives URL bins precedence over storage and saves their order', () => {
    const store = storage('["green","blue"]')
    const bins = readStationBins(nyc, ['trash', 'blue', 'unknown', 'trash'])
    expect(bins).toEqual(['trash', 'blue'])
    saveStationBins(nyc, bins)
    expect(store.setItem).toHaveBeenCalledWith(stationBinsKey('nyc'), '["trash","blue"]')
    expect(readStationBins(nyc, [])).toEqual([])
  })

  it.each(['{bad', '{}', '"blue"', '[null,1,"missing"]'])('recovers from malformed storage: %s', (saved) => {
    storage(saved)
    expect(readStationBins(nyc)).toEqual(['blue', 'green', 'brown', 'trash'])
  })

  it('retains a saved order, filters removed bins and preserves an empty selection', () => {
    storage('["trash","blue","missing","blue"]')
    expect(readStationBins(nyc)).toEqual(['trash', 'blue'])
    storage('[]')
    expect(readStationBins(nyc)).toEqual([])
  })

  it('works when storage is blocked', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } })
    expect(readStationBins(nyc)).toEqual(['blue', 'green', 'brown', 'trash'])
    expect(() => saveStationBins(nyc, ['blue'])).not.toThrow()
  })

  it('moves a bin without mutating or losing the physical layout', () => {
    const ids = ['blue', 'green', 'brown', 'trash']
    expect(moveBin(ids, 'blue', 2)).toEqual(['green', 'brown', 'blue', 'trash'])
    expect(moveBin(ids, 'trash', -1)).toEqual(['trash', 'blue', 'green', 'brown'])
    expect(moveBin(ids, 'blue', 99)).toEqual(['green', 'brown', 'trash', 'blue'])
    expect(moveBin(ids, 'missing', 1)).toEqual(ids)
    expect(ids).toEqual(['blue', 'green', 'brown', 'trash'])
  })
})
