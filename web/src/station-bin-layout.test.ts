import { describe, expect, it } from 'vitest'
import { stationBinRows } from './station-bin-layout'

describe('station bin rows', () => {
  it.each([
    { count: 3, phone: [3], portrait: [3], landscape: [3] },
    { count: 5, phone: [5], portrait: [5], landscape: [5] },
    { count: 7, phone: [4, 3], portrait: [4, 3], landscape: [7] },
    { count: 8, phone: [4, 4], portrait: [4, 4], landscape: [8] },
  ])('lays out $count bins at phone and tablet widths', ({ count, phone, portrait, landscape }) => {
    expect(stationBinRows(count, 375 - 16)).toEqual(phone)
    expect(stationBinRows(count, 820 - 32)).toEqual(portrait)
    expect(stationBinRows(count, 1024 - 32)).toEqual(landscape)
    expect(stationBinRows(count, 1180 - 32)).toEqual(landscape)
  })

  it('splits six bins only below 88 pixels of label width', () => {
    const threshold = 6 * (88 + 16) + 5 * 12
    expect(stationBinRows(6, threshold)).toEqual([6])
    expect(stationBinRows(6, threshold - 1)).toEqual([3, 3])
  })
})
