import { readFileSync } from 'node:fs'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Pack } from './rules'

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++
    if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? initial() : initial
    return [hooks.values[index], (next: unknown) => { hooks.values[index] = next }]
  },
  useEffect: () => {},
  useRef: () => ({ current: null }),
}))
vi.mock('./i18n', async (original) => ({ ...await original<typeof import('./i18n')>(), useLang: () => ({ lang: 'en', ready: true }) }))
vi.mock('./model/client', () => ({ useModel: () => ({ status: 'idle', classes: [] }), loadModel: vi.fn() }))
vi.mock('./ui', async (original) => ({ ...await original<typeof import('./ui')>(), useSamples: () => [] }))
import { Answer, Share } from './components/Answer'
import Scan from './views/Scan'
import { answerLink, linkedAnswer } from './ui'

const pack: Pack = JSON.parse(readFileSync(new URL('../public/rules/nyc.json', import.meta.url), 'utf8'))
type Props = { children?: ReactNode; href?: string; onClick?: () => Promise<void> | void }
function elements(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement<Props>(node)) return []
  return [node, ...elements(node.props.children)]
}
const resetHooks = () => { hooks.values = []; hooks.cursor = 0 }
const share = vi.fn()
beforeEach(() => {
  resetHooks(); share.mockReset()
  vi.stubGlobal('location', { origin: 'https://example.org', hash: '', search: '' })
  vi.stubGlobal('navigator', { share })
})
afterEach(() => vi.unstubAllGlobals())

it('links straight from Scan to the selected city’s station demo', () => {
  const selectedPack = { ...pack, id: 'sf' }
  const tree = Scan({ pack: selectedPack, packs: [selectedPack] })
  const link = elements(tree).find((el) => el.type === 'a' && el.props.children === 'See the bin station')
  expect(link?.props.href).toBe(`${import.meta.env.BASE_URL}?kiosk&source=demo&city=sf`)
})

it.each([
  ['pizza_box', 'greasy', 'Brown bin'],
  ['battery', 'rechargeable', 'Drop-off'],
])('shares and reloads a chosen %s condition through Scan', async (item, caseId, bin) => {
  const draw = () => { hooks.cursor = 0; return Answer({ ans: null, item, pack, packs: [pack], onChoose: () => {} }) }
  // Open the condition chooser and invoke its real condition button.
  let tree = draw()
  if (item === 'battery') {
    // The safe battery default is already a resolved rechargeable answer.
    expect(elements(tree).some((el) => el.type === 'h2' && el.props.children === bin)).toBe(true)
  } else {
    const label = pack.items[item].cases!.find((c) => c.id === caseId)!.label
    elements(tree).find((el) => el.type === 'button' && Array.isArray(el.props.children) && el.props.children[0] === label)!.props.onClick!()
    tree = draw()
  }
  const shared = elements(tree).find((el) => el.type === Share) as ReactElement<Parameters<typeof Share>[0]>
  expect(shared.props.caseId).toBe(caseId)
  resetHooks()
  const button = Share(shared.props)
  await button.props.onClick()
  expect(share).toHaveBeenCalledOnce()
  const url = new URL(share.mock.lastCall![0].url)
  expect(new URLSearchParams(url.hash.split('?')[1]).get('case')).toBe(caseId)
  location.hash = url.hash
  resetHooks()
  const scan = Scan({ pack, packs: [pack] })
  const restored = elements(scan).find((el) => el.type === Answer) as ReactElement<Parameters<typeof Answer>[0]>
  expect(restored.props).toMatchObject({ item, caseId })
  resetHooks()
  const answer = Answer(restored.props)
  expect(elements(answer).some((el) => el.type === 'h2' && el.props.children === bin)).toBe(true)
})

it('includes a typed matched condition and ignores unknown or cross-item case ids', () => {
  const tree = Answer({ ans: null, item: 'battery', query: 'vape', pack, packs: [pack], onChoose: () => {} })
  const shared = elements(tree).find((el) => el.type === Share) as ReactElement<Parameters<typeof Share>[0]>
  expect(shared.props.caseId).toBe('rechargeable')
  expect(linkedAnswer(pack, '#scan?item=pizza_box&case=rechargeable')).toEqual({ item: 'pizza_box', caseId: undefined })
  expect(linkedAnswer(pack, '#scan?item=missing&case=greasy')).toEqual({ item: null })
  expect(answerLink(pack, 'pizza_box', 'invalid')).not.toContain('&case=')
  resetHooks()
  const restored = Answer({ ans: null, item: 'pizza_box', caseId: 'invalid', pack, packs: [pack], onChoose: () => {} })
  expect(elements(restored).some((el) => el.props.children === pack.items.pizza_box.ask)).toBe(true)
})
