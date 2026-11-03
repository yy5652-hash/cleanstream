import { t } from './i18n'
import { belongs, type Pack } from './rules'
import { pickQuiz } from './views/Quiz'

export type DailyRecord = { items: string[]; picks: string[]; streak: number }
export type DailyStorage = Pick<Storage, 'getItem' | 'setItem'>
export const dailyDate = (now = new Date()) => now.toISOString().slice(0, 10)
const key = (city: string, date: string) => `cleanstream.daily.${city}.${date}`

export function seededRandom(seed: string): () => number {
  let state = 2166136261
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619)
  return () => {
    state += 0x6d2b79f5
    let x = Math.imul(state ^ (state >>> 15), state | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

export function dailyItems(packs: Pack[], city: string, date: string): string[] {
  const pack = packs.find((p) => p.id === city)!
  const pool = Object.keys(pack.items).filter((id) => packs.every((p) => p.items[id])).sort()
  return pickQuiz(packs, pool, 3, seededRandom(`${date}:${city}`))
}

export function readDaily(storage: DailyStorage | null, city: string, date: string): DailyRecord | null {
  try {
    const r = JSON.parse(storage?.getItem(key(city, date)) ?? 'null')
    if (r && Array.isArray(r.items) && r.items.length === 3 && new Set(r.items).size === 3 && r.items.every((v: unknown) => typeof v === 'string') && Array.isArray(r.picks) && r.picks.length <= 3 && r.picks.every((v: unknown) => typeof v === 'string') && Number.isInteger(r.streak) && r.streak >= 0) return r
  } catch { /* Storage may be unavailable. */ }
  return null
}

export function saveDaily(storage: DailyStorage | null, city: string, date: string, items: string[], picks: string[]): DailyRecord {
  const existing = readDaily(storage, city, date)
  if (existing?.picks.length === 3) return existing
  const yesterday = new Date(`${date}T00:00:00Z`)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const previous = readDaily(storage, city, dailyDate(yesterday))
  const streak = (previous?.picks.length === 3 ? previous.streak : 0) + (picks.length === 3 ? 1 : 0)
  const record = { items: [...items], picks: [...picks], streak }
  try { storage?.setItem(key(city, date), JSON.stringify(record)) } catch { /* Keep playing in memory. */ }
  return record
}

export function dailyShare(date: string, pack: Pack, record: DailyRecord, url: string): string {
  const marks = record.picks.map((pick, i) => belongs(pack, record.items[i], pick))
  return `${t('Cleanstream daily, {date}, {city}: {right} of 3', { date, city: pack.name, right: marks.filter(Boolean).length })}\n${marks.map((ok) => ok ? '✓' : '✗').join(' ')}\n${url}`
}
