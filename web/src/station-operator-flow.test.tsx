import { readFileSync } from 'node:fs'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

// Run the controls' real event handlers with persistent hook state, without a camera or browser.
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, cleanups: [] as (() => void)[], download: vi.fn() }))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++
    if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? initial() : initial
    return [hooks.values[index], (next: unknown) => { hooks.values[index] = typeof next === 'function' ? next(hooks.values[index]) : next }]
  },
  useRef: (initial: unknown) => {
    const index = hooks.cursor++
    hooks.values[index] ??= { current: initial }
    return hooks.values[index]
  },
  useEffect: (effect: () => (() => void) | undefined) => { const cleanup = effect(); if (cleanup) hooks.cleanups.push(cleanup) },
  useCallback: (callback: unknown) => callback,
}))
vi.mock('./store', async (original) => ({ ...await original<typeof import('./store')>(), download: hooks.download }))
import { PinChallenge } from './components/OperatorPin'
import { Sheet } from './components/Sheet'
import { setOperatorPin } from './operator-pin'
import { profileFromBins } from './station-config'
import { readCountingSince, record, resetStationCounts, useStationLog } from './store'
import type { Pack } from './rules'
import StationReport from './views/StationReport'

const pack: Pack = JSON.parse(readFileSync(new URL('../public/rules/nyc.json', import.meta.url), 'utf8'))
type Props = { children?: ReactNode; onClick?: () => void; onSubmit?: (event: { preventDefault: () => void }) => void; onClose?: () => void; value?: string; disabled?: boolean; type?: string }
function elements(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Props>(node)) return []
  return [node, ...elements(node.props.children)]
}
const button = (tree: ReactNode, text: string) => elements(tree).find((el) => el.props.children === text && el.props.onClick)!.props
function render<T>(component: () => T): T {
  hooks.cleanups.splice(0).forEach((cleanup) => cleanup())
  hooks.cursor = 0
  return component()
}
let values: Map<string, string>
beforeEach(() => {
  hooks.values = []; hooks.cursor = 0; hooks.download.mockClear()
  values = new Map()
  vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) })
  vi.stubGlobal('window', new EventTarget())
})
afterEach(() => {
  hooks.cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.unstubAllGlobals()
})

it('unlocks only after submitting the correct PIN through the number pad', async () => {
  await setOperatorPin('nyc', '1234')
  const unlock = vi.fn()
  const draw = () => render(() => PinChallenge({ city: 'nyc', onUnlock: unlock }))
  let tree = draw()
  for (const digit of '1234') { button(tree, digit).onClick!(); tree = draw() }
  expect(elements(tree).find((el) => el.type === 'input')!.props.value).toBe('1234')
  expect(unlock).not.toHaveBeenCalled()
  elements(tree).find((el) => el.type === 'form')!.props.onSubmit!({ preventDefault: vi.fn() })
  await vi.waitFor(() => expect(unlock).toHaveBeenCalledOnce())
})

it('shows the 60-second lockout after five wrong submissions', async () => {
  await setOperatorPin('nyc', '1234')
  const unlock = vi.fn()
  const draw = () => render(() => PinChallenge({ city: 'nyc', onUnlock: unlock }))
  let tree = draw()
  for (let attempt = 1; attempt <= 5; attempt++) {
    for (const digit of '0000') { button(tree, digit).onClick!(); tree = draw() }
    elements(tree).find((el) => el.type === 'form')!.props.onSubmit!({ preventDefault: vi.fn() })
    await vi.waitFor(() => {
      const saved = JSON.parse(values.get('cleanstream.station.pin.nyc')!)
      if (attempt === 5) expect(saved.lockedUntil).toBeGreaterThan(Date.now())
      else expect(saved.failures).toBe(attempt)
    })
    tree = draw()
  }
  expect(unlock).not.toHaveBeenCalled()
  expect(elements(tree).some((el) => typeof el.props.children === 'string' && el.props.children.includes('Try again in 60 seconds.'))).toBe(true)
  expect(elements(tree).find((el) => el.type === 'input')!.props.disabled).toBe(true)
})

it('requires an explicit forgotten-PIN reset and keeps station counts', async () => {
  await setOperatorPin('nyc', '1234')
  values.set('cleanstream.station.profile.nyc', 'profile')
  values.set('cleanstream.station.log', 'counts')
  const replace = vi.fn()
  vi.stubGlobal('location', { href: 'https://example.com/?kiosk&city=nyc&bins=blue&p=profile', replace })
  const draw = () => render(() => PinChallenge({ city: 'nyc', onUnlock: vi.fn() }))
  button(draw(), 'Forgot PIN? Clear saved station settings').onClick!()
  expect(values.has('cleanstream.station.profile.nyc')).toBe(true)
  button(draw(), 'Clear station settings and reset PIN').onClick!()
  expect(values.has('cleanstream.station.profile.nyc')).toBe(false)
  expect(values.has('cleanstream.station.pin.nyc')).toBe(false)
  expect(values.get('cleanstream.station.log')).toBe('counts')
  expect(replace).toHaveBeenCalledOnce()
  expect(new URL(replace.mock.calls[0][0]).searchParams.has('p')).toBe(false)
})

it('offers an all-history export before a separate pilot reset confirmation', () => {
  const log = record(record({}, 'nyc', '2026-01-01', { bin: 'blue', item: 'metal_can' }), 'nyc', '2026-11-22', null).nyc
  const reset = vi.fn()
  const profile = { ...profileFromBins(pack, ['blue']), approvedBy: 'Coordinator', approvedDate: '2026-11-22' }
  profile.bins[0].label = 'Recycling'
  const draw = () => render(() => StationReport({ pack, profile, log, onReset: reset }))
  let tree = draw()
  button(tree, 'Start fresh for a pilot').onClick!()
  expect(reset).not.toHaveBeenCalled()
  tree = draw()
  button(tree, 'Export all counts as CSV').onClick!()
  expect(hooks.download).toHaveBeenCalledOnce()
  const csv = hooks.download.mock.calls[0][1] as string
  expect(csv).toContain('2026-01-01')
  expect(csv).toContain('"Recycling","Coordinator","2026-11-22"')
  expect(reset).not.toHaveBeenCalled()
  tree = draw()
  button(tree, 'Clear counts and start pilot').onClick!()
  expect(reset).toHaveBeenCalledOnce()
  expect(readCountingSince('nyc')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  tree = draw()
  expect(elements(tree).some((el) => typeof el.props.children === 'string' && el.props.children.startsWith('Counting since '))).toBe(true)
})

it('keeps counts when the operator cancels the export step', () => {
  const reset = vi.fn()
  const draw = () => render(() => StationReport({ pack, log: {}, onReset: reset }))
  button(draw(), 'Start fresh for a pilot').onClick!()
  elements(draw()).find((el) => el.type === Sheet)!.props.onClose!()
  expect(reset).not.toHaveBeenCalled()
  expect(hooks.download).not.toHaveBeenCalled()
})

it('receives a pilot reset from another tab before recording the next kiosk answer', () => {
  const old = record({}, 'nyc', '2026-11-01', { bin: 'blue', item: 'metal_can' })
  values.set('cleanstream.station.log', JSON.stringify(old))
  expect(render(() => useStationLog())[0]).toEqual(old)
  values.set('cleanstream.station.log', JSON.stringify(resetStationCounts(old, 'nyc')))
  const event = new Event('storage')
  Object.defineProperty(event, 'key', { value: 'cleanstream.station.log' })
  window.dispatchEvent(event)
  const [log, update] = render(() => useStationLog())
  expect(log).toEqual({})
  update((previous) => record(previous, 'nyc', '2026-11-22', { bin: 'green', item: 'paper' }))
  const [fresh] = render(() => useStationLog())
  expect(fresh.nyc['2026-11-01']).toBeUndefined()
  expect(fresh.nyc['2026-11-22'].bins).toEqual({ green: 1 })
})
