import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ITEMS, searchItems } from './items'
import { answer, PACK_IDS, PACK_NAMES, SURE, type Pack } from './rules'
import { lastDays, record, type StationLog } from './store'
import { contamination } from './views/Audit'
import { changedCells, focusBox, GRID_H, GRID_W, isPresent, isStill, share } from './views/motion'
import { pickQuiz, ROUNDS } from './views/Quiz'
import { summarize } from './views/StationReport'

const packs: Pack[] = PACK_IDS.map((id) => JSON.parse(readFileSync(new URL(`../public/rules/${id}.json`, import.meta.url), 'utf8')))
const classes = Object.keys(ITEMS)
const probs = (p: Record<string, number>) => new Float32Array(classes.map((c) => p[c] ?? 0))
const nyc = packs.find((p) => p.id === 'nyc')!

describe('rule packs', () => {
  it.each(packs.map((p) => [p.id, p] as const))('%s covers every item type with a known bin and a source', (_, pack) => {
    const bins = new Set(pack.bins.map((b) => b.id))
    for (const id of classes) {
      const r = pack.items[id]
      expect(r, `${pack.id}: ${id}`).toBeDefined()
      expect(bins.has(r.bin), `${pack.id}: ${id} -> ${r.bin}`).toBe(true)
      expect(r.prep.length).toBeGreaterThan(0)
      expect(r.source).toMatch(/^https:\/\//)
    }
  })

  it('the city picker names match the packs', () => {
    for (const p of packs) expect(PACK_NAMES[p.id as keyof typeof PACK_NAMES]).toBe(p.name)
  })

  it('model classes and display names agree', () => {
    const head = JSON.parse(readFileSync(new URL('../public/model/head.json', import.meta.url), 'utf8'))
    expect(head.classes).toEqual(classes)
  })
})

describe('answer', () => {
  it('is sure of the bin when look-alike items share it', () => {
    // bottle vs container is a coin flip, but both go in the same NYC bin
    const a = answer(nyc, classes, probs({ plastic_bottle: 0.4, plastic_container: 0.4, plastic_bag_film: 0.2 }))
    expect(a.items[0].p).toBeLessThan(SURE)
    expect(a.bins[0].bin.id).toBe(nyc.items.plastic_bottle.bin)
    expect(a.bins[0].p).toBeCloseTo(0.8)
    expect(a.sure).toBe(true)
  })

  it('says it is not sure when the probability is split across bins', () => {
    const a = answer(nyc, classes, probs({ plastic_bottle: 0.45, plastic_bag_film: 0.3, food_scraps: 0.25 }))
    expect(a.sure).toBe(false)
  })
})

describe('item search', () => {
  it.each([
    ['tin foil', 'aluminum_foil'],
    ['amazon box', 'cardboard'],
    ['styrofoam', 'foam'],
    ['coffee cup', 'paper_cup'],
    ['vape', 'battery'],
    ['Pizza', 'pizza_box'],
    ['milk carton', 'carton'],
    ['batt', 'battery'],
  ])('"%s" finds %s first', (q, id) => {
    expect(searchItems(q)[0]).toBe(id)
  })

  it('returns nothing for one letter or no match', () => {
    expect(searchItems('a')).toEqual([])
    expect(searchItems('xylophone')).toEqual([])
  })
})

describe('contamination', () => {
  it('counts items whose bin differs from the audited bin, using corrections', () => {
    const bin = nyc.items.metal_can.bin
    const item = (pred: string, fixed?: string) => ({ id: pred + (fixed ?? ''), thumb: '', pred, p: 0.9, fixed })
    const c = contamination(
      { id: 'a', site: 's', pack: 'nyc', bin, phase: 'baseline', date: '2026-10-23', items: [item('metal_can'), item('plastic_bag_film'), item('food_scraps', 'metal_can'), item('')] },
      nyc,
    )
    expect(c.n).toBe(3) // the unsorted photo is not counted yet
    expect(c.bad).toBe(1)
    expect(c.top[0][0]).toBe('plastic_bag_film')
  })
})

describe('station log', () => {
  it('counts bins and items per city and day, and unsure answers apart', () => {
    let log: StationLog = {}
    log = record(log, 'nyc', '2026-10-28', { bin: 'blue', item: 'plastic_bottle' })
    log = record(log, 'nyc', '2026-10-28', { bin: 'blue', item: 'metal_can' })
    log = record(log, 'nyc', '2026-10-29', { bin: 'green', item: 'cardboard' })
    log = record(log, 'nyc', '2026-10-29', null)
    log = record(log, 'nyc', '2026-10-29', { bin: 'trash', item: 'foam', tapped: true })
    log = record(log, 'sf', '2026-10-29', { bin: 'black', item: 'foam' })
    const s = summarize(log.nyc, lastDays(2, '2026-10-29'))
    expect(s.total).toBe(4)
    expect(s.tapped).toBe(1)
    expect(s.unsure).toBe(1)
    expect(s.bins).toEqual({ blue: 2, green: 1, trash: 1 })
    expect(s.perDay.map((d) => d.total)).toEqual([2, 2])
    expect(summarize(log.nyc, ['2026-10-29']).total).toBe(2)
  })

  it('lists the last n days oldest first, across a month end', () => {
    expect(lastDays(3, '2026-11-01')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01'])
  })
})

describe('quiz', () => {
  it('picks distinct items, at least half of them ones places disagree on', () => {
    const pool = classes.slice(0, 20)
    const tricky = new Set(pool.filter((id) => new Set(packs.map((p) => p.bins.find((b) => b.id === p.items[id].bin)!.kind)).size > 1))
    for (let k = 0; k < 20; k++) {
      const q = pickQuiz(packs, pool)
      expect(new Set(q).size).toBe(ROUNDS)
      expect(q.filter((id) => tricky.has(id)).length).toBeGreaterThanOrEqual(Math.min(tricky.size, ROUNDS / 2))
    }
  })
})

describe('spotting an item at the station', () => {
  // a mint wall, with an optional patch of another colour (x, y, w, h in cells)
  const frame = (patch?: [number, number, number, number], light = 0) => {
    const f = new Float32Array(GRID_W * GRID_H * 3)
    for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
      const on = patch && x >= patch[0] && x < patch[0] + patch[2] && y >= patch[1] && y < patch[1] + patch[3]
      const c = on ? [0.25, 0.55, 0.75] : [0.65, 0.85, 0.78]
      for (let k = 0; k < 3; k++) f[(y * GRID_W + x) * 3 + k] = c[k] + light
    }
    return f
  }

  it('sees a small item that hardly moves the average brightness', () => {
    expect(isPresent(frame([18, 3, 2, 10]), frame())).toBe(true)
  })

  it('is not fooled by the lights changing', () => {
    expect(isPresent(frame(undefined, 0.15), frame())).toBe(false)
  })

  it('knows when the item is being held still', () => {
    expect(isStill(frame([18, 3, 2, 10]), frame([18, 3, 2, 10]))).toBe(true)
    expect(isStill(frame([10, 3, 2, 10]), frame([18, 3, 2, 10]))).toBe(false)
  })

  it('crops to a square around the item, inside the frame', () => {
    const cells = changedCells(frame([18, 3, 2, 10]), frame())
    expect(share(cells)).toBeCloseTo(20 / (GRID_W * GRID_H))
    const b = focusBox(cells, 640, 480)!
    expect(b.w).toBe(b.h)
    expect(b.x).toBeGreaterThanOrEqual(0)
    expect(b.x + b.w).toBeLessThanOrEqual(640)
    expect(b.y + b.h).toBeLessThanOrEqual(480)
    // the item (x 480 to 533, y 80 to 347) is inside the crop
    expect(b.x).toBeLessThanOrEqual(480)
    expect(b.x + b.w).toBeGreaterThanOrEqual(533)
    expect(b.y).toBeLessThanOrEqual(80)
    expect(b.y + b.h).toBeGreaterThanOrEqual(346)
  })

  it('leaves the frame alone when the item already fills it', () => {
    expect(focusBox(changedCells(frame([0, 0, GRID_W, GRID_H - 1]), frame()), 640, 480)).toBeNull()
  })
})
