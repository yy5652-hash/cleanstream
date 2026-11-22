import { useEffect, useMemo, useState } from 'react'
import { LANGS, type Lang } from './i18n'
import { PACK_IDS, type Bin, type Pack } from './rules'

// Import only bin metadata, so link validation follows the shipped rules.
const cityBins = import.meta.glob<Bin[]>('../public/rules/*.json', { eager: true, import: 'bins' })
export type StationConfig = {
  city: string
  bins?: string[]
  profile?: StationProfile
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
  const profile = decodeProfile(params.get('p'), cityBins[`../public/rules/${city}.json`])
  return {
    city,
    ...(profile ? { profile } : {}),
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
  const profile = normalizeProfile(config.profile, cityBins[`../public/rules/${city}.json`])
  return `${import.meta.env.BASE_URL}?kiosk&city=${city}`
    + (bins === undefined ? '' : `&bins=${bins.map(encodeURIComponent).join(',')}`)
    + (profile ? `&p=${encodeURIComponent(encodeProfile(profile))}` : '')
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

export type PhysicalBin = { id: string; label: string; streams: string[] }
export type StationProfile = { bins: PhysicalBin[]; note?: string; approvedBy?: string; approvedDate?: string; source?: string }
export const stationProfileKey = (city: string) => `cleanstream.station.profile.${city}`
export const stationLinkKey = (city: string) => `cleanstream.station.link.${city}`
const shortText = (value: unknown, max = 160) => typeof value === 'string' ? value.trim().slice(0, max) : ''

export function profileFromBins(pack: Pick<Pack, 'bins'>, ids: string[]): StationProfile {
  return { bins: cleanBins(ids, pack.bins).map((id) => ({ id, label: pack.bins.find((b) => b.id === id)!.name, streams: [id] })) }
}

export function normalizeProfile(value: unknown, bins: Bin[]): StationProfile | undefined {
  if (!value || typeof value !== 'object' || !('bins' in value) || !Array.isArray(value.bins)) return
  const used = new Set<string>()
  const physical: PhysicalBin[] = []
  for (const row of value.bins.slice(0, bins.length)) {
    if (!row || !Array.isArray(row.streams)) continue
    const streams = cleanBins(row.streams, bins).filter((id) => !used.has(id))
    if (!streams.length) continue
    streams.forEach((id) => used.add(id))
    // Stream ids give each physical bin a stable, validated identity.
    const id = streams.includes(row.id) ? row.id : streams[0]
    physical.push({ id, label: shortText(row.label, 80) || bins.find((b) => b.id === streams[0])!.name, streams })
  }
  if (value.bins.length && !physical.length) return
  const meta = value as Record<string, unknown>
  return { bins: physical, note: shortText(meta.note, 300), approvedBy: shortText(meta.approvedBy), approvedDate: /^\d{4}-\d{2}-\d{2}$/.test(shortText(meta.approvedDate)) ? shortText(meta.approvedDate) : '', source: shortText(meta.source, 300) }
}

// Compact versioned tuples avoid repeating field names in QR codes. Credentials never enter this format.
function encodeProfile(profile: StationProfile): string {
  const tuple: unknown[] = [1, profile.bins.map((b) => [b.id, b.label, b.streams]), profile.note || '', profile.approvedBy || '', profile.approvedDate || '', profile.source || '']
  while (tuple[tuple.length - 1] === '') tuple.pop()
  return btoa(Array.from(new TextEncoder().encode(JSON.stringify(tuple)), (b) => String.fromCharCode(b)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function decodeProfile(encoded: string | null, bins: Bin[]): StationProfile | undefined {
  if (!encoded || encoded.length > 8000) return
  try {
    const bytes = Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
    const [version, rows, note, approvedBy, approvedDate, source] = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (version !== 1 || !Array.isArray(rows)) return
    return normalizeProfile({ bins: rows.filter(Array.isArray).map(([id, label, streams]) => ({ id, label, streams })), note, approvedBy, approvedDate, source }, bins)
  } catch { return }
}

export function readStationProfile(pack: Pack, linked?: StationProfile, linkedBins?: string[]): StationProfile {
  const fromLink = linked ? normalizeProfile(linked, pack.bins) : linkedBins !== undefined ? profileFromBins(pack, readStationBins(pack, linkedBins)) : undefined
  const signature = linked && fromLink ? encodeProfile(fromLink) : JSON.stringify(linkedBins)
  try {
    // Import a new link once; later reloads of that same link retain the operator's local changes.
    if (fromLink && localStorage.getItem(stationLinkKey(pack.id)) !== signature) return fromLink
    const saved = normalizeProfile(JSON.parse(localStorage.getItem(stationProfileKey(pack.id)) ?? 'null'), pack.bins)
    if (saved) return saved
  } catch { /* Fall back to the old saved layout. */ }
  return fromLink ?? profileFromBins(pack, readStationBins(pack))
}

export function saveStationProfile(pack: Pack, profile: StationProfile): void {
  const clean = normalizeProfile(profile, pack.bins)
  if (!clean) return
  try { localStorage.setItem(stationProfileKey(pack.id), JSON.stringify(clean)) } catch { /* Keep working in memory. */ }
  saveStationBins(pack, clean.bins.flatMap((b) => b.streams))
}

export function useStationProfile(pack: Pack, linked?: StationProfile, linkedBins?: string[]): [StationProfile, (profile: StationProfile) => void] {
  const initial = useMemo(() => readStationProfile(pack, linked, linkedBins), [pack, linked, linkedBins])
  const [profiles, setProfiles] = useState<Record<string, StationProfile>>({})
  const profile = profiles[pack.id] ?? initial
  useEffect(() => {
    saveStationProfile(pack, profile)
    const fromLink = linked ? normalizeProfile(linked, pack.bins) : linkedBins !== undefined ? profileFromBins(pack, linkedBins) : undefined
    if (fromLink) {
      try { localStorage.setItem(stationLinkKey(pack.id), linked ? encodeProfile(fromLink) : JSON.stringify(linkedBins)) } catch { /* Keep working in memory. */ }
    }
  }, [pack, profile, linked, linkedBins])
  return [profile, (next) => setProfiles((old) => ({ ...old, [pack.id]: next }))]
}

export const physicalBinFor = (profile: StationProfile, stream: string) => profile.bins.find((b) => b.streams.includes(stream))
export const physicalBinStyle = (pack: Pack, bin: PhysicalBin): Bin => ({ ...pack.bins.find((b) => b.id === bin.streams[0])!, id: bin.id, name: bin.label })

export function mergePhysicalBins(profile: StationProfile, from: string, into: string): StationProfile {
  const a = profile.bins.find((b) => b.id === from), b = profile.bins.find((b) => b.id === into)
  if (!a || !b || a === b) return profile
  return { ...profile, bins: profile.bins.filter((bin) => bin !== a).map((bin) => bin === b ? { ...bin, streams: [...bin.streams, ...a.streams] } : bin) }
}
export function splitPhysicalBin(pack: Pack, profile: StationProfile, id: string): StationProfile {
  return { ...profile, bins: profile.bins.flatMap((bin) => bin.id === id && bin.streams.length > 1 ? profileFromBins(pack, bin.streams).bins : [bin]) }
}


// Camera ids belong to this tablet, never to shared station links.
export const cameraConstraints = (id: string): MediaTrackConstraints => ({
  ...(id ? { deviceId: { exact: id } } : { facingMode: 'user' }), width: { ideal: 1280 },
})
export function useStationCamera(): [string, (id: string) => void] {
  const [id, setId] = useState(() => {
    try { return localStorage.getItem('cleanstream.station.camera') ?? '' } catch { return '' }
  })
  useEffect(() => {
    try { localStorage.setItem('cleanstream.station.camera', id) } catch { /* Keep the in-memory choice. */ }
  }, [id])
  return [id, setId]
}
