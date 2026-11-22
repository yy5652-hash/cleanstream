import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { clearStationSettings, hasOperatorPin, operatorPinKey, pinLockSeconds, setOperatorPin, stationResetUrl, validPin, verifyOperatorPin } from './operator-pin'
import { stationBinsKey, stationProfileKey } from './station-config'

let values: Map<string, string>
beforeEach(() => {
  values = new Map()
  vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) })
})
afterEach(() => vi.unstubAllGlobals())

it.each(['123', '123456789', '12ab', '１２３４', ''])('rejects an invalid PIN: %s', async (pin) => {
  expect(validPin(pin)).toBe(false)
  await expect(setOperatorPin('nyc', pin)).rejects.toThrow()
  expect(hasOperatorPin('nyc')).toBe(false)
})
it('stores only a random salt, SHA-256 hash and attempt state, and verifies 4–8 digit PINs', async () => {
  await setOperatorPin('nyc', '12345678')
  const stored = values.get(operatorPinKey('nyc'))!
  expect(stored).not.toContain('12345678')
  expect(JSON.parse(stored)).toMatchObject({ salt: expect.stringMatching(/^[a-f0-9]{32}$/), hash: expect.stringMatching(/^[a-f0-9]{64}$/), failures: 0, lockedUntil: 0 })
  expect(await verifyOperatorPin('nyc', '12345678')).toBe(true)
  const first = JSON.parse(stored)
  await setOperatorPin('nyc', '12345678')
  expect(JSON.parse(values.get(operatorPinKey('nyc'))!).salt).not.toBe(first.salt)
})
it('locks after five wrong tries for 60 seconds, including correct PINs and newly read state', async () => {
  await setOperatorPin('nyc', '1234')
  const now = 100000
  for (let n = 0; n < 5; n++) expect(await verifyOperatorPin('nyc', '0000', now)).toBe(false)
  expect(pinLockSeconds('nyc', now)).toBe(60)
  expect(pinLockSeconds('nyc', now + 59999)).toBe(1)
  expect(await verifyOperatorPin('nyc', '1234', now + 59999)).toBe(false)
  expect(await verifyOperatorPin('nyc', '1234', now + 60000)).toBe(true)
  expect(pinLockSeconds('nyc', now + 60000)).toBe(0)
})
it('resets failures after success or lock expiry, and counts simultaneous attempts', async () => {
  await setOperatorPin('nyc', '1234')
  await Promise.all(Array.from({ length: 5 }, () => verifyOperatorPin('nyc', '0000', 100000)))
  expect(pinLockSeconds('nyc', 100000)).toBe(60)
  expect(await verifyOperatorPin('nyc', '0000', 160000)).toBe(false)
  expect(JSON.parse(values.get(operatorPinKey('nyc'))!).failures).toBe(1)
  expect(await verifyOperatorPin('nyc', '1234', 160001)).toBe(true)
  expect(JSON.parse(values.get(operatorPinKey('nyc'))!).failures).toBe(0)
})
it('fails closed for damaged PIN records and reports unavailable storage', async () => {
  values.set(operatorPinKey('nyc'), '{bad')
  expect(hasOperatorPin('nyc')).toBe(true)
  await expect(verifyOperatorPin('nyc', '1234')).rejects.toThrow()
  vi.stubGlobal('localStorage', { setItem: () => { throw new Error('blocked') } })
  await expect(setOperatorPin('nyc', '1234')).rejects.toThrow('blocked')
})
it('keeps a known PIN guarded if storage later becomes unavailable', async () => {
  await setOperatorPin('nyc', '1234')
  expect(hasOperatorPin('nyc')).toBe(true)
  vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } })
  expect(hasOperatorPin('nyc')).toBe(true)
  await expect(verifyOperatorPin('nyc', '1234')).rejects.toThrow('blocked')
})
it('forgotten PIN recovery clears station settings and removes linked settings without clearing counts or other cities', async () => {
  await setOperatorPin('nyc', '1234')
  for (const key of [stationBinsKey('nyc'), stationProfileKey('nyc'), stationProfileKey('sf'), 'cleanstream.station.camera', 'cleanstream.station.voice', 'cleanstream.station.log']) values.set(key, 'saved')
  clearStationSettings('nyc')
  expect([...values.keys()].sort()).toEqual(['cleanstream.station.log', stationProfileKey('sf')].sort())
  expect(hasOperatorPin('nyc')).toBe(false)
  const url = new URL(stationResetUrl('https://example.com/cleanstream/?kiosk&city=nyc&bins=blue&p=profile&lang=es&source=demo'))
  expect(url.searchParams.has('bins')).toBe(false)
  expect(url.searchParams.has('p')).toBe(false)
  expect(url.searchParams.get('city')).toBe('nyc')
  expect(url.searchParams.get('source')).toBe('demo')
})
