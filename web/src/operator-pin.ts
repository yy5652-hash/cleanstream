import { useSyncExternalStore } from 'react'
import { stationBinsKey, stationLinkKey, stationProfileKey } from './station-config'

type PinRecord = { salt: string; hash: string; failures: number; lockedUntil: number }
export const operatorPinKey = (city: string) => `cleanstream.station.pin.${city}`
const fallback = new Map<string, string>()
function raw(city: string): string | null {
  try {
    const saved = localStorage.getItem(operatorPinKey(city))
    if (saved === null) fallback.delete(city)
    else fallback.set(city, saved)
    return saved
  } catch { return fallback.get(city) ?? null }
}
function read(city: string): PinRecord | null {
  const saved = raw(city)
  if (!saved) return null
  const pin = JSON.parse(saved) as PinRecord
  if (!/^[a-f0-9]{32}$/.test(pin.salt) || !/^[a-f0-9]{64}$/.test(pin.hash) || !Number.isInteger(pin.failures) || pin.failures < 0 || !Number.isFinite(pin.lockedUntil)) throw new Error('Invalid PIN record')
  return pin
}
function notify() { if (typeof window !== 'undefined') window.dispatchEvent(new Event('station-pin')) }
function write(city: string, pin: PinRecord) {
  const saved = JSON.stringify(pin)
  fallback.set(city, saved)
  localStorage.setItem(operatorPinKey(city), saved)
  notify()
}
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')
const digest = async (salt: string, pin: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}`)))
export const validPin = (pin: string) => /^\d{4,8}$/.test(pin)
export const hasOperatorPin = (city: string) => raw(city) !== null

// Called only from authenticated settings, or initial setup before a PIN exists.
export async function setOperatorPin(city: string, pin: string): Promise<void> {
  if (!validPin(pin)) throw new Error('Invalid PIN length')
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)).buffer)
  write(city, { salt, hash: await digest(salt, pin), failures: 0, lockedUntil: 0 })
}
export function removeOperatorPin(city: string) {
  localStorage.removeItem(operatorPinKey(city))
  fallback.delete(city)
  notify()
}
export function pinLockSeconds(city: string, now = Date.now()): number {
  return Math.max(0, Math.ceil(((read(city)?.lockedUntil ?? 0) - now) / 1000))
}
export async function verifyOperatorPin(city: string, input: string, now = Date.now()): Promise<boolean> {
  const pin = read(city)
  if (!pin) return true
  if (pin.lockedUntil > now) return false
  const hash = await digest(pin.salt, input)
  // Re-read after hashing so concurrent attempts cannot overwrite each other's counters.
  const current = read(city)
  if (!current || current.hash !== pin.hash || current.lockedUntil > now) return false
  if (validPin(input) && hash === pin.hash) {
    write(city, { ...current, failures: 0, lockedUntil: 0 })
    return true
  }
  const failures = (current.lockedUntil ? 0 : current.failures) + 1
  write(city, { ...current, failures: failures >= 5 ? 0 : failures, lockedUntil: failures >= 5 ? now + 60000 : 0 })
  return false
}

function subscribe(listener: () => void) {
  window.addEventListener('storage', listener)
  window.addEventListener('station-pin', listener)
  return () => { window.removeEventListener('storage', listener); window.removeEventListener('station-pin', listener) }
}
export const useHasOperatorPin = (city: string) => useSyncExternalStore(subscribe, () => hasOperatorPin(city), () => hasOperatorPin(city))

export function clearStationSettings(city: string) {
  for (const key of [stationBinsKey(city), stationProfileKey(city), stationLinkKey(city), 'cleanstream.station.camera', 'cleanstream.station.voice']) localStorage.removeItem(key)
  removeOperatorPin(city)
}
export function stationResetUrl(href: string): string {
  const url = new URL(href)
  for (const key of ['bins', 'p']) url.searchParams.delete(key)
  return url.href
}
