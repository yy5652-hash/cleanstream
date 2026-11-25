import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
import About from './views/About'

const hooks = vi.hoisted(() => ({
  effect: undefined as (() => () => void) | undefined,
  setMetrics: vi.fn(),
  metrics: null as unknown,
}))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useEffect: (effect: () => () => void) => { hooks.effect = effect },
  useState: () => [hooks.metrics, hooks.setMetrics],
}))

const legacyScores = { item_acc: 0.8, material_acc: 0.9, bin_acc: { nyc: 0.91 }, n_item: 10 }
const legacy = {
  classes: 32, model_mb: 95, n_train: 100,
  test: legacyScores, external: legacyScores, zero_shot: {},
  answered: {}, datasets: [],
}
const fixture = {
  ...legacy,
  app_decision: {
    nyc: {
      test: { n: 200, right_rate: 0.955, ask_rate: 0.015, wrong_rate: 0.03 },
      external: { n: 50, right_rate: 0.64, ask_rate: 0, wrong_rate: 0.36 },
    },
  },
  heldup: { n: 100, app_decision: { nyc: { right_rate: 0.78, ask_rate: 0.19, wrong_rate: 0.03, right_when_answered: 0.963 } } },
}

afterEach(() => {
  hooks.metrics = null
  hooks.effect = undefined
  hooks.setMetrics.mockReset()
  vi.unstubAllGlobals()
})

it('fetches metrics and renders the New York screen decisions by test set', async () => {
  const fetchMetrics = vi.fn(async () => ({ ok: true, json: async () => fixture }))
  vi.stubGlobal('fetch', fetchMetrics)
  About({ packs: [] })
  const stop = hooks.effect!()
  await vi.waitFor(() => expect(hooks.setMetrics).toHaveBeenCalledWith(fixture))
  stop()
  expect(fetchMetrics).toHaveBeenCalledWith(`${import.meta.env.BASE_URL}model/metrics.json`)
  hooks.metrics = hooks.setMetrics.mock.lastCall![0]
  const markup = renderToStaticMarkup(About({ packs: [] }))
  const table = markup.match(/<table.*?<\/table>/)?.[0]
  const rows = table?.match(/<tr>.*?<\/tr>/g)
  expect(rows).toEqual([
    expect.stringMatching(/Right bin shown.*Asks.*Wrong bin/),
    expect.stringMatching(/Held-out test photos.*200 photos.*95\.5%.*1\.5%.*3\.0%/),
    expect.stringMatching(/RealWaste.*50 photos.*64\.0%.*0\.0%.*36\.0%/),
    expect.stringMatching(/Held-up photos.*100 photos.*78\.0%.*19\.0%.*3\.0%/),
  ])
  expect(markup).toContain('96.3% of the photos it answered')
  expect(markup).toContain('Not tested yet')
})

it('keeps the older results and marks missing screen values with a dash', () => {
  hooks.metrics = legacy
  const legacyMarkup = renderToStaticMarkup(About({ packs: [] }))
  expect(legacyMarkup).toContain('Right bin, NYC rules')
  expect(legacyMarkup).not.toContain('What the screen does, New York rules')
  expect(legacyMarkup).toContain('Not tested yet')

  hooks.metrics = { ...legacy, app_decision: { nyc: { test: { right_rate: 0 } } } }
  const partialMarkup = renderToStaticMarkup(About({ packs: [] }))
  expect(partialMarkup).toMatch(/Held-out test photos.*0\.0%.*>—<.*>—</)
  expect(partialMarkup).not.toContain('of the photos it answered')
})
