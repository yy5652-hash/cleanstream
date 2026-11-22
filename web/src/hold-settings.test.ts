import type { ReactElement } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

// Exercise the rendered control's event handlers and timers without a browser or camera.
const hooks = vi.hoisted(() => ({ progress: vi.fn(), cleanups: [] as (() => void)[] }))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: () => [0, hooks.progress],
  useRef: (value: unknown) => ({ current: value }),
  useEffect: (effect: () => () => void) => { hooks.cleanups.push(effect()) },
}))
import { HoldSettings } from './components/HoldSettings'

type Key = { key: string; repeat: boolean; preventDefault: () => void }
type Pointer = { button: number; isPrimary: boolean; pointerId: number; preventDefault: () => void; currentTarget: { setPointerCapture: (id: number) => void } }
type Handlers = {
  onKeyDown: (e: Key) => void; onKeyUp: (e: Key) => void
  onPointerDown: (e: Pointer) => void; onPointerUp: () => void
  onPointerCancel: () => void; onBlur: () => void; onLostPointerCapture: () => void
  onClick?: () => void
}
function control() {
  const open = vi.fn()
  const tree = HoldSettings({ onOpen: open, children: 'settings' }) as ReactElement<{ children: ReactElement<Handlers>[] }>
  return { open, button: tree.props.children[0].props }
}
const key = (name: string, repeat = false): Key => ({ key: name, repeat, preventDefault: vi.fn() })
const pointer = (): Pointer => ({ button: 0, isPrimary: true, pointerId: 1, preventDefault: vi.fn(), currentTarget: { setPointerCapture: vi.fn() } })
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('document', new EventTarget())
  hooks.progress.mockClear()
})
afterEach(() => {
  hooks.cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it.each(['Enter', ' '])('opens only after holding %j for two seconds, ignoring key repeats', (name) => {
  const { open, button } = control()
  button.onKeyDown(key(name))
  vi.advanceTimersByTime(1000)
  expect(hooks.progress).toHaveBeenLastCalledWith(0.5)
  button.onKeyDown(key(name, true))
  vi.advanceTimersByTime(999)
  expect(open).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  expect(open).toHaveBeenCalledTimes(1)
  button.onKeyUp(key(name))
  vi.advanceTimersByTime(3000)
  expect(open).toHaveBeenCalledTimes(1)
})
it('does not open for a click or a short press and restarts progress on the next hold', () => {
  const { open, button } = control()
  button.onClick?.()
  button.onKeyDown(key('Enter'))
  vi.advanceTimersByTime(1000)
  button.onKeyUp(key('Enter'))
  expect(hooks.progress).toHaveBeenLastCalledWith(0)
  vi.advanceTimersByTime(2000)
  expect(open).not.toHaveBeenCalled()
  button.onKeyDown(key('Enter'))
  vi.advanceTimersByTime(2000)
  expect(open).toHaveBeenCalledTimes(1)
})
it('supports a two-second primary pointer hold', () => {
  const { open, button } = control(), event = pointer()
  button.onPointerDown(event)
  expect(event.currentTarget.setPointerCapture).toHaveBeenCalledWith(1)
  vi.advanceTimersByTime(1999)
  expect(open).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  expect(open).toHaveBeenCalledOnce()
  button.onPointerUp()
})
it.each(['onPointerCancel', 'onLostPointerCapture', 'onBlur'] as const)('cancels an interrupted hold: %s', (event) => {
  const { open, button } = control()
  button.onPointerDown(pointer())
  vi.advanceTimersByTime(1000)
  button[event]()
  vi.advanceTimersByTime(2000)
  expect(open).not.toHaveBeenCalled()
})
it('cancels on window blur and ignores other keys and secondary pointers', () => {
  const { open, button } = control()
  button.onKeyDown(key('Escape'))
  button.onPointerDown({ ...pointer(), button: 2 })
  vi.advanceTimersByTime(2000)
  expect(open).not.toHaveBeenCalled()
  button.onKeyDown(key(' '))
  vi.advanceTimersByTime(1000)
  window.dispatchEvent(new Event('blur'))
  vi.advanceTimersByTime(2000)
  expect(open).not.toHaveBeenCalled()
})
