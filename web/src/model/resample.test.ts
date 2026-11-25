import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { resizeBicubic } from './resample'

function source(width: number, height: number) {
  const rgba = new Uint8ClampedArray(width * height * 4)
  let i = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const mix = (x * y) % 251
      rgba[i++] = (17 * x + 31 * y + mix) % 256
      rgba[i++] = (7 * x + 53 * mix) % 256
      rgba[i++] = (43 * y + 11 * mix) % 256
      rgba[i++] = (x + y) % 256
    }
  }
  return rgba
}

const cases = [
  ['large', 1000, 700],
  ['odd', 333, 217],
  ['upscale', 200, 150],
  ['wide', 1200, 90],
  ['identity', 256, 256],
  ['portrait', 500, 1200],
] as const

test.each(cases)('%s (%i × %i) matches Pillow byte for byte', (name, width, height) => {
  const expected = readFileSync(new URL(`./__fixtures__/resize_${name}.bin`, import.meta.url))
  const actual = resizeBicubic(source(width, height), width, height, 256, 256)
  expect(actual.length).toBe(256 * 256 * 3)
  expect(expected.length).toBe(actual.length)
  let maxDiff = 0
  for (let i = 0; i < actual.length; i++) maxDiff = Math.max(maxDiff, Math.abs(actual[i] - expected[i]))
  expect(maxDiff).toBe(0)
})
