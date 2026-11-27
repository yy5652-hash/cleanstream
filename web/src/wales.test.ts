import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ITEMS } from './items'
import { answer, matchCase, type Pack } from './rules'
import { readStationBins } from './station-config'
import { stationDecision } from './station-decision'

// The seven-bin Welsh workplace station (Welsh Government code of practice, April 2026).
const wales: Pack = JSON.parse(readFileSync(new URL('../public/rules/wales.json', import.meta.url), 'utf8'))
const classes = Object.keys(ITEMS)
const sees = (item: string) => answer(wales, classes, new Float32Array(classes.map((id) => (id === item ? 0.95 : 0.05 / (classes.length - 1)))))

describe('Wales workplace rules', () => {
  it('sets up a station with all seven bins in the pack order', () => {
    expect(readStationBins(wales)).toEqual(['food', 'paper', 'glass', 'mixed', 'cups', 'electricals', 'general'])
  })

  it.each([
    ['paper_cup', 'cups'],
    ['battery', 'electricals'],
    ['electronics', 'electricals'],
    ['metal_can', 'mixed'],
    ['carton', 'mixed'],
    ['food_scraps', 'food'],
    ['snack_wrapper', 'general'],
    ['blister_pack', 'general'],
    ['glass_bottle_jar', 'glass'],
    ['drinking_glass_ceramic', 'general'],
  ])('shows a %s in %s', (item, bin) => {
    const decision = stationDecision(wales, sees(item))
    expect(decision.kind).toBe('resolved')
    if (decision.kind === 'resolved') expect(decision.rule.bin).toBe(bin)
  })

  it('asks about grease before answering for a pizza box', () => {
    expect(stationDecision(wales, sees('pizza_box')).kind).toBe('needs-condition')
    const greasy = stationDecision(wales, sees('pizza_box'), undefined, 'greasy')
    expect(greasy.kind === 'resolved' && greasy.rule.bin).toBe('general')
  })

  it('sends a cup marked compostable to general waste', () => {
    expect(matchCase(wales.items.paper_cup, 'compostable coffee cup')?.bin).toBe('general')
    expect(matchCase(wales.items.paper_cup, 'coffee cup')).toBeUndefined()
  })

  it('never shows a battery or a device a regular bin', () => {
    for (const item of ['battery', 'electronics']) {
      const rule = wales.items[item]
      expect([rule.bin, ...(rule.cases ?? []).map((c) => c.bin)].every((b) => b === 'electricals'), item).toBe(true)
    }
  })
})
