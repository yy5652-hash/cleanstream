// Everything the app keeps lives in this browser's localStorage: audits (with small thumbnails) and station counts.
import { useCallback, useEffect, useState } from 'react'
import type { Pack } from './rules'
import { defaultPrimaryBin, migratePilot, type Pilot, type Weights } from './pilot'

export type AuditItem = { id: string; thumb: string; pred: string; p: number; fixed?: string; checked?: boolean; condition?: string }
export type Audit = {
  id: string
  site: string
  pack: string
  bin: string
  phase: 'baseline' | 'after'
  date: string
  items: AuditItem[]
  kind?: 'weighed'
  weights?: Weights
  auditor?: string
  notes?: string
}
export type StationEntry = { bins: Record<string, number>; items: Record<string, number>; unsure: number; tapped?: number; source?: string; appVersion?: string }
export type StationDay = StationEntry & { entries?: StationEntry[] }
export type StationLog = Record<string, Record<string, StationDay>> // city pack id -> day -> counts (never pictures)
export const STATION_PROVENANCE_VERSION = '1.0.1'

// Keep historical provenance separate when a day spans versions or contains legacy counts.
export function record(log: StationLog, pack: string, day: string, shown: { bin: string; item: string; tapped?: boolean } | null, source = 'camera', appVersion = import.meta.env.VITE_APP_VERSION): StationLog {
  const empty = () => ({ bins: {}, items: {}, unsure: 0 })
  const d = log[pack]?.[day]
  const add = (entry: StationEntry): StationEntry => shown
    ? { ...entry, bins: { ...entry.bins, [shown.bin]: (entry.bins[shown.bin] ?? 0) + 1 }, items: { ...entry.items, [shown.item]: (entry.items[shown.item] ?? 0) + 1 }, tapped: (entry.tapped ?? 0) + (shown.tapped ? 1 : 0) }
    : { ...entry, unsure: entry.unsure + 1 }
  let next: StationDay
  if (!d) next = add({ ...empty(), source, appVersion })
  else if (!d.entries && d.source === source && d.appVersion === appVersion) next = add(d)
  else {
    const { entries: previous, ...historical } = d
    const entries = [...(previous ?? [historical])]
    const index = entries.findIndex((entry) => entry.source === source && entry.appVersion === appVersion)
    if (index < 0) entries.push(add({ ...empty(), source, appVersion }))
    else entries[index] = add(entries[index])
    const totals = add(d)
    next = { bins: totals.bins, items: totals.items, unsure: totals.unsure, tapped: totals.tapped, entries }
  }
  return { ...log, [pack]: { ...log[pack], [day]: next } }
}

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* storage full or blocked: keep working in memory */
  }
}

// normalize migrates what was read (pilots); sync follows writes made in other tabs (station counts).
function useStored<T>(key: string, fallback: T, normalize: (v: T) => T = (v) => v, sync = false): [T, (f: (v: T) => T) => void] {
  const [v, setV] = useState<T>(() => normalize(read(key, fallback)))
  useEffect(() => write(key, v), [key, v])
  useEffect(() => {
    if (!sync) return
    const changed = (event: StorageEvent) => { if (event.key === key || event.key === null) setV(normalize(read(key, fallback))) }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [key, sync, fallback]) // normalize is a pure migration; a new function each render must not re-subscribe
  const update = useCallback((f: (v: T) => T) => setV(f), [])
  return [v, update]
}

export const useAudits = () => useStored<Audit[]>('cleanstream.audits', [])
// Select once per source session so delayed demo callbacks can never persist counts.
export const stationLogWriter = (source: string, persist: (f: (log: StationLog) => StationLog) => void): typeof persist => source === 'camera' ? persist : () => {}
const EMPTY_STATION_LOG: StationLog = {}
export const useStationLog = () => useStored<StationLog>('cleanstream.station.log', EMPTY_STATION_LOG, undefined, true)

export const stationSinceKey = (city: string) => `cleanstream.station.since.${city}`
export function readCountingSince(city: string): string {
  try { return localStorage.getItem(stationSinceKey(city)) ?? '' } catch { return '' }
}
export function resetStationCounts(log: StationLog, city: string): StationLog {
  const next = { ...log }
  delete next[city]
  return next
}
// Write the date before clearing counts; a storage error must leave the existing counts intact.
export function startStationPilot(city: string, clearCounts: () => void, date = today()): string {
  localStorage.setItem(stationSinceKey(city), date)
  clearCounts()
  return date
}

// Local calendar day (YYYY-MM-DD), and the n days ending on `last`, oldest first
export const today = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}
export const lastDays = (n: number, last = today()) =>
  Array.from({ length: n }, (_, k) => new Date(Date.parse(`${last}T12:00:00Z`) - (n - 1 - k) * 86400000).toISOString().slice(0, 10))
export const uid = () => Math.random().toString(36).slice(2, 10)

export async function thumbnail(blob: Blob, size = 112): Promise<string> {
  const bmp = await createImageBitmap(blob)
  const c = document.createElement('canvas')
  c.width = c.height = size
  const s = Math.min(bmp.width, bmp.height)
  c.getContext('2d')!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size)
  bmp.close()
  return c.toDataURL('image/jpeg', 0.75)
}

export function download(name: string, text: string, type = 'text/csv') {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// Pilots keep measurement summaries, never photographs.
export const usePilots = (pack?: Pack) => useStored<Pilot[]>('cleanstream.pilots', [], (ps) => ps.map((p) => migratePilot(p, pack?.id === p.pack ? defaultPrimaryBin(pack) : '')))

let deviceStationId: string | undefined
export function stationId(): string {
  try {
    const saved = localStorage.getItem('cleanstream.station.id')
    if (saved) return saved
  } catch { /* Use a stable in-memory id when storage is blocked. */ }
  deviceStationId ??= crypto.randomUUID()
  try { localStorage.setItem('cleanstream.station.id', deviceStationId) } catch { /* Storage is blocked. */ }
  return deviceStationId
}
