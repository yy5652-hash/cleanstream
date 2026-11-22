import { readFileSync } from 'node:fs'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Pack } from './rules'

// Exercise the real camera recognition path and button handlers with persistent hooks.
const hooks = vi.hoisted(() => ({
  values: [] as unknown[], cursor: 0, effects: [] as (() => void)[], cleanups: [] as (() => void)[],
  classify: vi.fn(), model: { status: 'ready', classes: ['battery', 'paper_bag', 'pizza_box'], loaded: 0, total: 0 },
}))
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
  useMemo: (factory: () => unknown, deps: unknown[]) => {
    const index = hooks.cursor++
    const previous = hooks.values[index] as { deps: unknown[]; value: unknown } | undefined
    if (!previous || deps.some((d, i) => !Object.is(d, previous.deps[i]))) hooks.values[index] = { deps, value: factory() }
    return (hooks.values[index] as { value: unknown }).value
  },
  useEffect: (effect: () => (() => void) | undefined, deps?: unknown[]) => {
    const index = hooks.cursor++
    const previous = hooks.values[index] as { deps?: unknown[]; cleanup?: () => void } | undefined
    if (!previous || !deps || deps.some((d, i) => !Object.is(d, previous.deps?.[i]))) {
      hooks.effects.push(() => {
        previous?.cleanup?.()
        const cleanup = effect()
        hooks.values[index] = { deps, cleanup }
        if (cleanup) hooks.cleanups.push(cleanup)
      })
    }
  },
  useCallback: (fn: unknown) => fn,
}))
vi.mock('./model/client', () => ({ useModel: () => hooks.model, classify: hooks.classify, loadModel: vi.fn() }))
vi.mock('./ui', async (original) => ({ ...await original<typeof import('./ui')>(), useSamples: () => [] }))
vi.mock('./i18n', async (original) => ({ ...await original<typeof import('./i18n')>(), useLang: () => ({ lang: 'en', ready: true }) }))
vi.mock('./views/motion', async (original) => ({ ...await original<typeof import('./views/motion')>(), isPresent: () => true, isStill: () => true, focusBox: () => null }))
import Station from './views/Station'
import { StationDestination } from './components/StationBins'
import { today } from './store'

const pack: Pack = JSON.parse(readFileSync(new URL('../public/rules/nyc.json', import.meta.url), 'utf8'))
type Props = { children?: ReactNode; ref?: { current: unknown }; target?: { id: string }; onClick?: () => void }
function elements(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Props>(node)) return []
  return [node, ...elements(node.props.children)]
}
let values: Map<string, string>
const speak = vi.fn()
const video = { videoWidth: 640, videoHeight: 480, play: async () => {} }
function draw() {
  hooks.cursor = 0
  const tree = Station({ pack, start: 'camera' })
  for (const el of elements(tree)) if (el.type === 'video' && el.props.ref) el.props.ref.current = video
  hooks.effects.splice(0).forEach((effect) => effect())
  return tree
}
const log = () => JSON.parse(values.get('cleanstream.station.log') ?? '{}').nyc?.[today()]
beforeEach(() => {
  vi.useFakeTimers()
  hooks.values = []; hooks.cursor = 0; hooks.effects = []; hooks.cleanups = []; hooks.classify.mockReset(); speak.mockClear()
  values = new Map([['cleanstream.station.voice', '1']])
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) })
  vi.stubGlobal('location', { search: '' })
  vi.stubGlobal('window', Object.assign(new EventTarget(), { setTimeout, setInterval, speechSynthesis: { cancel: vi.fn(), speak } }))
  vi.stubGlobal('speechSynthesis', window.speechSynthesis)
  vi.stubGlobal('SpeechSynthesisUtterance', class { text: string; lang = ''; constructor(text: string) { this.text = text } })
  vi.stubGlobal('document', Object.assign(new EventTarget(), { createElement: () => ({ getContext: () => ({ drawImage: () => {}, getImageData: () => ({ data: new Uint8ClampedArray(200 * 200 * 4) }) }), toDataURL: () => 'data:image/jpeg,test' }) }))
  vi.stubGlobal('navigator', { mediaDevices: Object.assign(new EventTarget(), { enumerateDevices: async () => [], getUserMedia: async () => ({ getTracks: () => [{ stop: () => {} }] }) }) })
})
afterEach(() => {
  hooks.cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.useRealTimers(); vi.unstubAllGlobals()
})
async function recognise(item: string) {
  hooks.classify.mockResolvedValue({ probs: new Float32Array(hooks.model.classes.map((id) => id === item ? 1 : 0)) })
  draw()
  await vi.advanceTimersByTimeAsync(800)
  expect(hooks.classify).toHaveBeenCalledOnce()
  return draw()
}
it.each([['battery', 'dropoff', 'Drop-off'], ['paper_bag', 'green', 'Green bin']])('resolves a confident %s photo consistently on screen, in voice and in counts', async (item, bin, name) => {
  const tree = await recognise(item)
  expect(elements(tree).find((el) => el.type === StationDestination)?.props.target?.id).toBe(bin)
  expect(log()).toMatchObject({ bins: { [bin]: 1 }, items: { [item]: 1 }, unsure: 0 })
  expect(speak.mock.lastCall?.[0].text).toContain(name)
  expect(speak.mock.lastCall?.[0].text).not.toContain('Not sure')
  await vi.advanceTimersByTimeAsync(6500)
  draw()
  expect(log().unsure).toBe(0)
  expect(log().bins[bin]).toBe(1)
})
it('asks the condition for a confident pizza box and resolves the tapped bin once', async () => {
  let tree = await recognise('pizza_box')
  expect(elements(tree).some((el) => el.type === StationDestination)).toBe(false)
  expect(elements(tree).some((el) => el.props.children === pack.items.pizza_box.ask)).toBe(true)
  expect(speak.mock.lastCall?.[0].text).toBe(pack.items.pizza_box.ask)
  expect(log()).toBeUndefined()
  const greasy = pack.items.pizza_box.cases!.find((c) => c.id === 'greasy')!
  elements(tree).find((el) => el.type === 'button' && elements(el.props.children).some((child) => child.props.children === greasy.label))!.props.onClick!()
  tree = draw()
  expect(elements(tree).find((el) => el.type === StationDestination)?.props.target?.id).toBe('brown')
  expect(log()).toMatchObject({ bins: { brown: 1 }, tapped: 1, unsure: 0 })
  expect(speak.mock.lastCall?.[0].text).toContain('Brown bin')
  await vi.advanceTimersByTimeAsync(6500)
  draw()
  expect(log().unsure).toBe(0)
  expect(log().bins.brown).toBe(1)
})
