import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { dailyDate, dailyItems, dailyShare, readDaily, saveDaily, type DailyStorage } from './daily'
import { PACK_IDS, type Pack } from './rules'

const packs: Pack[] = PACK_IDS.map((id) => JSON.parse(readFileSync(new URL(`../public/rules/${id}.json`, import.meta.url), 'utf8')))
const pack = packs[0]
const date = '2026-11-02'
const items = dailyItems(packs, pack.id, date)
const correct = items.map((id) => pack.items[id].bin)
function memory(): DailyStorage {
  const data = new Map<string, string>()
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value) } }
}

describe('daily challenge', () => {
  it('has three unique repeatable items, independent of object key order', () => {
    expect(items).toHaveLength(3)
    expect(new Set(items).size).toBe(3)
    expect(dailyItems(packs, pack.id, date)).toEqual(items)
    const reordered = packs.map((p) => ({ ...p, items: Object.fromEntries(Object.entries(p.items).reverse()) }))
    expect(dailyItems(reordered, pack.id, date)).toEqual(items)
    expect(dailyItems(packs, pack.id, '2026-11-03')).not.toEqual(items)
    expect(dailyItems(packs, packs[1].id, date)).not.toEqual(items)
  })
  it('uses a shared UTC date', () => {
    expect(dailyDate(new Date('2026-11-02T23:30:00-05:00'))).toBe('2026-11-03')
  })
  it('resumes partial picks and cannot overwrite a completed result', () => {
    const storage = memory()
    saveDaily(storage, pack.id, date, items, correct.slice(0, 1))
    expect(readDaily(storage, pack.id, date)?.picks).toEqual(correct.slice(0, 1))
    const completed = saveDaily(storage, pack.id, date, items, correct)
    expect(saveDaily(storage, pack.id, date, items, ['wrong'])).toEqual(completed)
    expect(readDaily(storage, 'sf', date)).toBeNull()
    expect(readDaily(storage, pack.id, '2026-11-03')).toBeNull()
  })
  it('counts consecutive completed days, resets after a miss, and crosses month boundaries', () => {
    const storage = memory()
    expect(saveDaily(storage, pack.id, '2026-10-31', items, correct).streak).toBe(1)
    expect(saveDaily(storage, pack.id, '2026-11-01', items, correct).streak).toBe(2)
    expect(saveDaily(storage, pack.id, date, items, correct).streak).toBe(3)
    expect(saveDaily(storage, pack.id, '2026-11-04', items, correct).streak).toBe(1)
    saveDaily(storage, pack.id, '2026-11-05', items, correct.slice(0, 1))
    expect(saveDaily(storage, pack.id, '2026-11-06', items, correct).streak).toBe(1)
  })
  it('handles corrupt and blocked storage', () => {
    expect(readDaily({ getItem: () => '{', setItem: () => {} }, pack.id, date)).toBeNull()
    expect(readDaily({ getItem: () => '{"items":["a","b","c"],"picks":[],"streak":-1}', setItem: () => {} }, pack.id, date)).toBeNull()
    const blocked = { getItem: () => { throw Error() }, setItem: () => { throw Error() } }
    expect(saveDaily(blocked, pack.id, date, items, correct).picks).toEqual(correct)
    expect(readDaily(blocked, pack.id, date)).toBeNull()
  })
  it('shares the exact heading, answer marks and link, counting accepted alternative bins', () => {
    const picks = [correct[0], 'wrong', correct[2]]
    expect(dailyShare(date, pack, { items, picks, streak: 1 }, 'https://example.com/#quiz')).toBe(`Cleanstream daily, ${date}, ${pack.name}: 2 of 3\n✓ ✗ ✓\nhttps://example.com/#quiz`)
    const alternative = Object.keys(pack.items).find((id) => pack.items[id].also?.length)
    if (alternative) expect(dailyShare(date, pack, { items: [alternative], picks: [pack.items[alternative].also![0]], streak: 1 }, 'link')).toContain('1 of 3\n✓')
  })
})
