import { readFileSync } from 'node:fs'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Pack } from './rules'
import type { Audit as AuditT } from './store'
import { createPilot } from './pilot'
import { snapshotAudit, auditCsv } from './audit'

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effects: [] as (() => void)[], cleanups: [] as (() => void)[] }))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++
    if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? initial() : initial
    return [hooks.values[index], (next: unknown) => { hooks.values[index] = typeof next === 'function' ? next(hooks.values[index]) : next }]
  },
  useRef: (initial: unknown) => { const index = hooks.cursor++; hooks.values[index] ??= { current: initial }; return hooks.values[index] },
  useCallback: (callback: unknown) => { const index = hooks.cursor++; hooks.values[index] ??= callback; return hooks.values[index] },
  useEffect: (effect: () => (() => void) | undefined, deps?: unknown[]) => {
    const index = hooks.cursor++
    const previous = hooks.values[index] as { deps?: unknown[]; cleanup?: () => void } | undefined
    if (!previous || !deps || deps.some((dep, i) => !Object.is(dep, previous.deps?.[i]))) hooks.effects.push(() => {
      previous?.cleanup?.()
      const cleanup = effect()
      hooks.values[index] = { deps, cleanup }
      if (cleanup) hooks.cleanups.push(cleanup)
    })
  },
}))
vi.mock('./model/client', () => ({ useModel: () => ({ status: 'idle', classes: [] }), loadModel: vi.fn(), classify: vi.fn() }))
import Audit from './views/Audit'
import Pilot from './views/Pilot'
import { Sheet } from './components/Sheet'
import { useRulesUpdate } from './components/RulesUpdate'

const pack: Pack = JSON.parse(readFileSync(new URL('../public/rules/nyc.json', import.meta.url), 'utf8'))
const packs = [pack]
type Props = { children?: ReactNode; onClick?: () => void; onChange?: (event: { target: { value: string } }) => void; value?: string; title?: string; onPick?: (id: string) => void; save?: (weights: { totalKg: number; contaminantKg: number } | undefined) => void }
function elements(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Props>(node)) return []
  return [node, ...elements(node.props.children)]
}
function draw<T>(render: () => T): T {
  hooks.cursor = 0
  const tree = render()
  hooks.effects.splice(0).forEach((effect) => effect())
  return tree
}
const drawAudit = () => draw(() => Audit({ pack, packs }))
const drawPilot = () => draw(() => Pilot({ pack, packs }))
const labelled = (tree: ReactNode, text: string, type: string) => {
  const label = elements(tree).find((element) => element.type === 'label' && Array.isArray(element.props.children) && element.props.children[0] === text)!
  return elements(label).find((element) => element.type === type)!
}
let values: Map<string, string>
beforeEach(() => {
  hooks.values = []; hooks.effects = []; hooks.cleanups = []; hooks.cursor = 0
  values = new Map()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) })
  vi.stubGlobal('location', { hash: '#audit', search: '' })
  const events = new EventTarget()
  vi.stubGlobal('addEventListener', events.addEventListener.bind(events))
  vi.stubGlobal('removeEventListener', events.removeEventListener.bind(events))
  vi.stubGlobal('dispatchEvent', events.dispatchEvent.bind(events))
})
afterEach(() => { hooks.cleanups.forEach((cleanup) => cleanup()); vi.useRealTimers(); vi.unstubAllGlobals() })
const p = (id: string, primaryBin: string) => createPilot({ id, primaryBin, pack: pack.id, name: id, created: '2026-11-01' }, pack)

it('defaults to the linked primary stream, marks secondary choices, and resets stale selections on switching pilots', () => {
  values.set('cleanstream.pilots', JSON.stringify([p('p1', 'green'), p('p2', 'brown')]))
  location.hash = '#audit?pilot=p1&arm=with&phase=before'
  drawAudit()
  let tree = drawAudit()
  expect(labelled(tree, 'Bin audited', 'select').props.value).toBe('green')
  labelled(tree, 'Bin audited', 'select').props.onChange!({ target: { value: 'trash' } })
  tree = drawAudit()
  labelled(tree, 'Site or station', 'input').props.onChange!({ target: { value: 'Old site' } })
  tree = drawAudit()
  expect(elements(tree).some((element) => element.props.children === 'secondary stream (not in the primary effect)')).toBe(true)
  location.hash = '#audit?pilot=p2&arm=without&phase=after'
  dispatchEvent(new Event('hashchange'))
  drawAudit()
  tree = drawAudit()
  expect(labelled(tree, 'Bin audited', 'select').props.value).toBe('brown')
  expect(labelled(tree, 'Site or station', 'input').props.value).toBe('')
  expect(labelled(tree, 'Phase', 'select').props.value).toBe('after')
})
it('offers existing site suggestions and excludes special streams from pilot choices', () => {
  const a: AuditT = { id: 'a', site: 'Library Lobby', bin: 'blue', pack: pack.id, phase: 'baseline', date: '2026-11-01', items: [] }
  values.set('cleanstream.audits', JSON.stringify([{ ...a, id: 'b', site: ' library   lobby ' }, a]))
  drawAudit()
  const tree = drawAudit()
  const suggestions = elements(tree).find((element) => element.type === 'datalist')!
  expect(elements(suggestions).filter((element) => element.type === 'option').map((element) => element.props.value)).toEqual(['Library Lobby'])
  hooks.values = []; hooks.effects = []; hooks.cursor = 0
  drawPilot()
  const pilotTree = drawPilot()
  const binSelect = labelled(pilotTree, 'Primary bin stream', 'select')
  const ids = elements(binSelect).filter((element) => element.type === 'option').map((element) => element.props.value)
  expect(ids).not.toContain('dropoff')
  expect(ids).toContain('blue')
  expect(createPilot({ id: 'invalid', pack: pack.id, name: 'P', created: '2026-11-01', primaryBin: 'dropoff' }, pack).primaryBin).toBe('blue')
})
it('writes pilot weight edits to the canonical audit and removes weights from both stores', () => {
  const a: AuditT = { id: 'a', site: 'Library', bin: 'blue', pack: pack.id, phase: 'baseline', date: '2026-11-01', items: [{ id: 'can', pred: 'metal_can', thumb: 'data:test', p: 1, checked: true }] }
  values.set('cleanstream.audits', JSON.stringify([a]))
  values.set('cleanstream.pilots', JSON.stringify([{ ...p('p1', 'blue'), audits: [snapshotAudit(a, pack, 'with', 'before')] }]))
  drawPilot()
  let tree = drawPilot()
  elements(tree).find((element) => element.props.children === 'Enter weights')!.props.onClick!()
  tree = drawPilot()
  const sheet = elements(tree).find((element) => element.type === Sheet && element.props.title === 'Sample weights')!
  const form = elements(sheet.props.children)[0]
  form.props.save!({ totalKg: 10, contaminantKg: 2 })
  drawPilot(); drawPilot()
  const saved = JSON.parse(values.get('cleanstream.audits')!)[0]
  const snapshot = JSON.parse(values.get('cleanstream.pilots')!)[0].audits[0]
  expect(saved.weights).toEqual({ totalKg: 10, contaminantKg: 2 })
  expect(snapshot.weights).toEqual(saved.weights)
  expect(auditCsv(saved, pack)).toContain('"10","2"')
  tree = drawPilot()
  elements(tree).find((element) => element.props.children === 'Enter weights')!.props.onClick!()
  tree = drawPilot()
  const removeForm = elements(elements(tree).find((element) => element.type === Sheet && element.props.title === 'Sample weights')!.props.children)[0]
  removeForm.props.save!(undefined)
  drawPilot(); drawPilot()
  expect(JSON.parse(values.get('cleanstream.audits')!)[0].weights).toBeUndefined()
  expect(JSON.parse(values.get('cleanstream.pilots')!)[0].audits[0].weights).toBeUndefined()
})
it('notifies a returning page when its worker activates or fetched rules differ from the loaded pack', async () => {
  vi.useFakeTimers()
  const worker = Object.assign(new EventTarget(), { controller: {}, getRegistration: async () => undefined })
  vi.stubGlobal('navigator', { serviceWorker: worker })
  vi.stubGlobal('window', new EventTarget())
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => pack })
  vi.stubGlobal('fetch', fetch)
  expect(draw(() => useRulesUpdate(packs))).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  expect(draw(() => useRulesUpdate(packs))).toBe(false)
  worker.dispatchEvent(new MessageEvent('message', { data: { type: 'rules-fetched', pack: { ...pack, checked: '2099-01-01' } } }))
  expect(draw(() => useRulesUpdate(packs))).toBe(true)
  hooks.cleanups.forEach((cleanup) => cleanup()); hooks.cleanups = []; hooks.values = []
  draw(() => useRulesUpdate(packs))
  worker.dispatchEvent(new MessageEvent('message', { data: { type: 'rules-activated' } }))
  expect(draw(() => useRulesUpdate(packs))).toBe(true)
})
it('detects a rule-only update on periodic revalidation without replacing an answer mid-session', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('navigator', {})
  vi.stubGlobal('window', new EventTarget())
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => pack })
  vi.stubGlobal('fetch', fetch)
  draw(() => useRulesUpdate(packs))
  await vi.advanceTimersByTimeAsync(1)
  expect(draw(() => useRulesUpdate(packs))).toBe(false)
  fetch.mockResolvedValue({ ok: true, json: async () => ({ ...pack, items: {} }) })
  await vi.advanceTimersByTimeAsync(60000)
  expect(draw(() => useRulesUpdate(packs))).toBe(true)
  expect(packs[0].items).toHaveProperty('battery')
})
