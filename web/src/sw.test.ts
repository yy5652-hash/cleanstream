import { runInNewContext } from 'node:vm'
import { afterEach, expect, it, vi } from 'vitest'
import { fetchStrategy, sw } from '../sw-plugin'

afterEach(() => vi.useRealTimers())
it.each(['rules/nyc.json', 'rules/us.json?v=2', 'i18n/es.json', 'i18n/zh-Hant.json?v=3'])('uses network first for %s under any base', (path) => {
  expect(fetchStrategy(`https://example.org/trial/${path}`)).toBe('network-first')
})
it.each(['model/encoder.onnx', 'model/head.json', 'ort/runtime.wasm', 'assets/app.js'])('keeps %s cache first', (path) => {
  expect(fetchStrategy(`https://example.org/cleanstream/${path}`)).toBe('cache-first')
})

function worker() {
  const listeners: Record<string, (event: unknown) => void> = {}
  const entries = new Map<string, Response>()
  const put = vi.fn(async (request: Request, response: Response) => { entries.set(request.url, response) })
  const match = vi.fn(async (request: Request) => entries.get(request.url)?.clone())
  const fetch = vi.fn<(request: Request) => Promise<Response>>()
  const postMessage = vi.fn()
  runInNewContext(sw('test', 'model', []), {
    self: { addEventListener: (name: string, callback: (event: unknown) => void) => { listeners[name] = callback }, clients: { matchAll: async () => [{ postMessage }], claim: vi.fn() } },
    location: { origin: 'https://example.org' },
    caches: { open: async () => ({ put }), match, keys: async () => ['cleanstream-old', 'cleanstream-test', 'cleanstream-model-model'], delete: vi.fn() }, fetch, URL, Headers, Response, setTimeout, clearTimeout,
  })
  function request(path = 'rules/nyc.json') {
    const request = new Request(`https://example.org/cleanstream/${path}`)
    let response!: Promise<Response>, background!: Promise<unknown>
    listeners.fetch({ request, respondWith: (p: Promise<Response>) => { response = p }, waitUntil: (p: Promise<unknown>) => { background = p } })
    return { response, background, request }
  }
  return { entries, put, match, fetch, postMessage, request, activate: () => { let done!: Promise<unknown>; listeners.activate({ waitUntil: (promise: Promise<unknown>) => { done = promise } }); return done } }
}
it('fetches fresh rules, updates the exact cache key, notifies pages and retains isolation headers', async () => {
  const w = worker()
  w.entries.set('https://example.org/cleanstream/rules/nyc.json?v=1', new Response('old'))
  w.fetch.mockResolvedValue(new Response('{"id":"nyc","checked":"new"}'))
  const r = w.request('rules/nyc.json?v=2'), response = await r.response
  expect(await response.text()).toContain('new')
  await r.background
  expect(w.put).toHaveBeenCalledOnce()
  expect(w.entries.has(r.request.url)).toBe(true)
  expect(w.postMessage).toHaveBeenCalledWith({ type: 'rules-fetched', pack: { id: 'nyc', checked: 'new' } })
  expect(response.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin')
  expect(response.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp')
})
it.each(['offline', 'server error'])('falls back to the exact cached JSON on %s', async (failure) => {
  const w = worker(), url = 'https://example.org/cleanstream/i18n/es.json?v=2'
  w.entries.set(url, new Response('cached translation'))
  if (failure === 'offline') w.fetch.mockRejectedValue(new Error('offline'))
  else w.fetch.mockResolvedValue(new Response('unavailable', { status: 503 }))
  expect(await (await w.request('i18n/es.json?v=2').response).text()).toBe('cached translation')
  expect(w.match.mock.calls[0]).toHaveLength(1)
  expect(w.put).not.toHaveBeenCalled()
})
it('returns cached rules after 2.5 seconds and still caches a late network success', async () => {
  vi.useFakeTimers()
  const w = worker()
  w.entries.set('https://example.org/cleanstream/rules/nyc.json', new Response('old'))
  let resolve!: (response: Response) => void
  w.fetch.mockImplementation(() => new Promise((r) => { resolve = r }))
  const r = w.request()
  await vi.advanceTimersByTimeAsync(2500)
  expect(await (await r.response).text()).toBe('old')
  resolve(new Response('{"id":"nyc","checked":"late"}'))
  await r.background
  expect(await w.entries.get(r.request.url)!.text()).toContain('late')
})
it('does not use a differently versioned cached pack when offline', async () => {
  const w = worker()
  w.entries.set('https://example.org/cleanstream/rules/nyc.json?v=1', new Response('old'))
  w.fetch.mockRejectedValue(new Error('offline'))
  await expect(w.request('rules/nyc.json?v=2').response).rejects.toThrow('offline')
})
it('serves cached model files without a network fetch', async () => {
  const w = worker()
  w.entries.set('https://example.org/cleanstream/model/encoder.onnx', new Response('model'))
  expect(await (await w.request('model/encoder.onnx').response).text()).toBe('model')
  expect(w.fetch).not.toHaveBeenCalled()
})

it('broadcasts activation after claiming clients', async () => {
  const w = worker()
  await w.activate()
  expect(w.postMessage).toHaveBeenCalledWith({ type: 'rules-activated' })
})
