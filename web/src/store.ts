// Everything the app keeps lives in this browser's localStorage: audits (with small thumbnails) and station counts.
import { useCallback, useEffect, useState } from 'react'

export type AuditItem = { id: string; thumb: string; pred: string; p: number; fixed?: string }
export type Audit = {
  id: string
  site: string
  pack: string
  bin: string
  phase: 'baseline' | 'after'
  date: string
  items: AuditItem[]
}
export type StationDay = { bins: Record<string, number>; items: Record<string, number>; unsure: number }
export type StationLog = Record<string, Record<string, StationDay>> // city pack id -> day -> counts (never pictures)

// One answer at a station: the bin and item it showed, or null when it said it was not sure.
export function record(log: StationLog, pack: string, day: string, shown: { bin: string; item: string } | null): StationLog {
  const d = log[pack]?.[day] ?? { bins: {}, items: {}, unsure: 0 }
  const next = shown
    ? { ...d, bins: { ...d.bins, [shown.bin]: (d.bins[shown.bin] ?? 0) + 1 }, items: { ...d.items, [shown.item]: (d.items[shown.item] ?? 0) + 1 } }
    : { ...d, unsure: d.unsure + 1 }
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

function useStored<T>(key: string, fallback: T): [T, (f: (v: T) => T) => void] {
  const [v, setV] = useState<T>(() => read(key, fallback))
  useEffect(() => write(key, v), [key, v])
  const update = useCallback((f: (v: T) => T) => setV(f), [])
  return [v, update]
}

export const useAudits = () => useStored<Audit[]>('cleanstream.audits', [])
export const useStationLog = () => useStored<StationLog>('cleanstream.station.log', {})

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
