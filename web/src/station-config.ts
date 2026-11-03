import { useEffect, useMemo, useState } from 'react'
import { LANGS, type Lang } from './i18n'
import { PACK_IDS, type Bin, type Pack } from './rules'

// Import only bin metadata, so link validation follows the shipped rules.
const cityBins = import.meta.glob<Bin[]>('../public/rules/*.json', { eager: true, import: 'bins' })
export type StationConfig = {
  city: string
  bins?: string[]
  site?: string
  lang?: Lang
  source?: 'camera' | 'demo'
}

const cityId = (id: string | null) => PACK_IDS.find((city) => city === id) ?? 'nyc'
const language = (id: string | null | undefined): Lang => LANGS.find(([lang]) => lang === id)?.[0] ?? 'en'
const cleanBins = (ids: unknown[], bins: Bin[]) => [...new Set(ids.filter((id): id is string => typeof id === 'string' && bins.some((b) => b.id === id)))]

export function readConfig(search: string): StationConfig {
  const params = new URLSearchParams(search)
  const city = cityId(params.get('city'))
  return {
    city,
    bins: params.has('bins') ? cleanBins(params.get('bins')!.split(','), cityBins[`../public/rules/${city}.json`]) : undefined,
    site: (params.get('site') ?? '').trim().slice(0, 160),
    lang: language(params.get('lang')),
    source: params.get('source') === 'demo' ? 'demo' : 'camera',
  }
}

export function kioskUrl(config: StationConfig): string {
  const city = cityId(config.city)
  const bins = config.bins === undefined ? undefined : cleanBins(config.bins, cityBins[`../public/rules/${city}.json`])
  const site = config.site?.trim().slice(0, 160)
  return `${import.meta.env.BASE_URL}?kiosk&city=${city}`
    + (bins === undefined ? '' : `&bins=${bins.map(encodeURIComponent).join(',')}`)
    + (site ? `&site=${encodeURIComponent(site)}` : '')
    + `&lang=${language(config.lang)}&source=${config.source === 'demo' ? 'demo' : 'camera'}`
}

export const stationBinsKey = (city: string) => `cleanstream.station.bins.${city}`

export function readStationBins(pack: Pack, linked?: string[]): string[] {
  if (linked !== undefined) return cleanBins(linked, pack.bins)
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(stationBinsKey(pack.id)) ?? 'null')
    if (Array.isArray(saved)) {
      const bins = cleanBins(saved, pack.bins)
      if (!saved.length || bins.length) return bins
    }
  } catch { /* Storage can be unavailable on a shared tablet. */ }
  return pack.bins.filter((b) => b.kind !== 'special' && b.id !== 'dropoff').map((b) => b.id)
}

export function saveStationBins(pack: Pack, ids: string[]): void {
  try { localStorage.setItem(stationBinsKey(pack.id), JSON.stringify(cleanBins(ids, pack.bins))) } catch { /* Keep the in-memory order. */ }
}

export function moveBin(ids: string[], id: string, to: number): string[] {
  if (!ids.includes(id)) return ids
  const next = ids.filter((bin) => bin !== id)
  next.splice(Math.max(0, Math.min(to, next.length)), 0, id)
  return next
}

export function useStationBins(pack: Pack, linked?: string[]): [string[], (ids: string[]) => void] {
  const initial = useMemo(() => readStationBins(pack, linked), [pack, linked])
  const [layouts, setLayouts] = useState<Record<string, string[]>>({})
  const ids = layouts[pack.id] ?? initial
  useEffect(() => saveStationBins(pack, ids), [pack, ids])
  return [ids, (next) => setLayouts((old) => ({ ...old, [pack.id]: next }))]
}

