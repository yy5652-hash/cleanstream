import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ITEMS } from './items'
import { answer, type Pack } from './rules'
import { readStationBins } from './station-config'
import { stationDecision } from './station-decision'

// The seven-stream EU station (Waste Framework Directive).
const eu: Pack = JSON.parse(readFileSync(new URL('../public/rules/eu.json', import.meta.url), 'utf8'))
const classes = Object.keys(ITEMS)
const sees = (item: string) => answer(eu, classes, new Float32Array(classes.map((id) => (id === item ? 0.95 : 0.05 / (classes.length - 1)))))

describe('EU common streams', () => {
  it('sets up a station with all seven bins in the pack order', () => {
    expect(readStationBins(eu)).toEqual(['bio', 'paper', 'glass', 'packaging', 'textiles', 'hazardous', 'residual'])
  })

  it.each([
    ['paper_cup', 'residual'],
    ['battery', 'hazardous'],
    ['electronics', 'hazardous'],
    ['metal_can', 'packaging'],
    ['carton', 'packaging'],
    ['food_scraps', 'bio'],
    ['textile', 'textiles'],
    ['shoes', 'textiles'],
    ['glass_bottle_jar', 'glass'],
    ['drinking_glass_ceramic', 'residual'],
  ])('shows a %s in %s', (item, bin) => {
    const decision = stationDecision(eu, sees(item))
    expect(decision.kind).toBe('resolved')
    if (decision.kind === 'resolved') expect(decision.rule.bin).toBe(bin)
  })

  it('asks about grease before answering for a pizza box', () => {
    expect(stationDecision(eu, sees('pizza_box')).kind).toBe('needs-condition')
    const greasy = stationDecision(eu, sees('pizza_box'), undefined, 'greasy')
    expect(greasy.kind === 'resolved' && greasy.rule.bin).toBe('residual')
  })

  it('never shows a battery or a device a regular bin', () => {
    for (const item of ['battery', 'electronics']) expect(eu.items[item].bin, item).toBe('hazardous')
  })
})
