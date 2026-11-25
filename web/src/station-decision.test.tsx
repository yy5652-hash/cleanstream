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
let rulesUpdated = false
const speak = vi.fn()
const video = { videoWidth: 640, videoHeight: 480, play: async () => {} }
function draw(start: 'off' | 'camera' | 'demo' = 'camera') {
  hooks.cursor = 0
  const tree = Station({ pack, start, rulesUpdated })
  for (const el of elements(tree)) if (el.type === 'video' && el.props.ref) el.props.ref.current = video
  hooks.effects.splice(0).forEach((effect) => effect())
  return tree
}
const log = () => JSON.parse(values.get('cleanstream.station.log') ?? '{}').nyc?.[today()]
beforeEach(() => {
  vi.useFakeTimers()
  hooks.values = []; hooks.cursor = 0; hooks.effects = []; hooks.cleanups = []; hooks.classify.mockReset(); hooks.model.classes = ['battery', 'paper_bag', 'pizza_box']; speak.mockClear()
  rulesUpdated = false
  values = new Map([['cleanstream.station.voice', '1']])
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) })
  vi.stubGlobal('location', { search: '', reload: vi.fn() })
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

it.each(['off', 'demo', 'camera'] as const)('shows the camera privacy line only when the %s source has a live stream', async (source) => {
  const hasLine = (tree: ReactNode) => elements(tree).some((el) => el.type === 'p' && el.props.children === 'Camera on · no photos are kept')
  expect(hasLine(draw(source))).toBe(false)
  await vi.advanceTimersByTimeAsync(0)
  expect(hasLine(draw(source))).toBe(source === 'camera')
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

async function uncertain() {
  hooks.model.classes = ['battery', 'metal_can', 'foam']
  hooks.classify.mockResolvedValue({ probs: new Float32Array([0.34, 0.33, 0.33]) })
  draw()
  await vi.advanceTimersByTimeAsync(800)
  return draw()
}
const click = (tree: ReactNode, text: string) => elements(tree).find((el) => el.props.children === text && el.props.onClick)?.props.onClick!()

it('opens the shared picker, suspends the timeout, and resolves its selection', async () => {
  const { ItemPicker } = await import('./components/Search')
  let tree = await uncertain()
  click(tree, 'Neither — choose another item')
  tree = draw()
  const picker = elements(tree).find((el) => el.type === ItemPicker)!
  expect(picker).toBeDefined()
  expect(elements(tree).some((element) => (element.props as unknown as { title: string; open: boolean }).title === 'What is it?' && (element.props as unknown as { open: boolean }).open)).toBe(true)
  await vi.advanceTimersByTimeAsync(12000)
  tree = draw()
  expect(log()).toBeUndefined()
  expect(elements(tree)[0].props).toHaveProperty('data-phase', 'result')
  ;(picker.props as unknown as { onPick: (id: string) => void }).onPick('metal_can')
  tree = draw()
  expect(elements(tree).find((el) => el.type === StationDestination)?.props.target?.id).toBe('blue')
  expect(log()).toMatchObject({ bins: { blue: 1 }, tapped: 1, unsure: 0 })
})
it('asks the pizza condition after a picker selection', async () => {
  const { ItemPicker } = await import('./components/Search')
  let tree = await uncertain()
  click(tree, 'Neither — choose another item')
  tree = draw()
  const picker = elements(tree).find((el) => el.type === ItemPicker)!
  ;(picker.props as unknown as { onPick: (id: string) => void }).onPick('pizza_box')
  tree = draw()
  expect(elements(tree).some((el) => el.props.children === pack.items.pizza_box.ask)).toBe(true)
  expect(log()).toBeUndefined()
})
it('restarts a full six-second timeout when the picker closes', async () => {
  const { Sheet } = await import('./components/Sheet')
  let tree = await uncertain()
  await vi.advanceTimersByTimeAsync(4000)
  click(tree, 'Neither — choose another item')
  tree = draw()
  await vi.advanceTimersByTimeAsync(10000)
  const sheet = elements(tree).find((el) => el.type === Sheet && (el.props as unknown as { title: string }).title === 'What is it?')!
  ;(sheet.props as unknown as { onClose: () => void }).onClose()
  draw()
  await vi.advanceTimersByTimeAsync(5900)
  draw()
  expect(log()).toBeUndefined()
  await vi.advanceTimersByTimeAsync(101)
  draw()
  expect(log()).toMatchObject({ unsure: 1 })
})
it('logs the explicit unsure exit once and shows the staff instruction and profile note', async () => {
  values.set('cleanstream.station.profile.nyc', JSON.stringify({ bins: [], note: 'Ask at the library desk.' }))
  let tree = await uncertain()
  click(tree, "I don't know")
  tree = draw()
  expect(elements(tree).some((el) => el.props.children === 'Keep this item out of these bins and ask staff.')).toBe(true)
  expect(elements(tree).some((el) => el.props.children === 'Ask at the library desk.')).toBe(true)
  expect(log()).toMatchObject({ bins: {}, unsure: 1 })
  await vi.advanceTimersByTimeAsync(6500)
  draw()
  expect(log().unsure).toBe(1)
})

it('defers a rules-update reload until the answer and thanks have ended and the station is idle', async () => {
  await recognise('paper_bag')
  rulesUpdated = true
  draw()
  await vi.advanceTimersByTimeAsync(3500)
  draw()
  expect(location.reload).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(200)
  draw()
  expect(location.reload).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1500)
  draw()
  expect(location.reload).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1500)
  expect(location.reload).toHaveBeenCalledOnce()
})
it('does not reload a station while its item picker is open', async () => {
  let tree = await uncertain()
  click(tree, 'Neither — choose another item')
  rulesUpdated = true
  tree = draw()
  await vi.advanceTimersByTimeAsync(20000)
  draw()
  expect(location.reload).not.toHaveBeenCalled()
  expect(elements(tree)[0].props).toHaveProperty('data-phase', 'result')
})
