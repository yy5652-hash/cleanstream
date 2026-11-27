// One shared worker. Requests include the wait for initialization and photo decoding in their deadline.
import { useEffect, useSyncExternalStore } from 'react'
import { readPhoto } from './photo'

export type Prediction = { probs: Float32Array; ms: number }
export type ModelState = { status: 'idle' | 'loading' | 'ready' | 'error'; loaded: number; total: number; classes: string[] }
export class ModelError extends Error {
  readonly code: 'worker' | 'timeout' | 'image'
  constructor(code: ModelError['code']) {
    super(code)
    this.name = 'ModelError'
    this.code = code
  }
}

type Timings = { fetchMs: number; sessionMs: number; numThreads: number; prepMs: number; inferMs: number }
declare global {
  interface Window { __cleanstreamTimings?: Partial<Timings> }
}

type Connection = { saveData?: boolean; type?: string; effectiveType?: string }
function metered() {
  const c = (navigator as Navigator & { connection?: Connection }).connection
  return !!c && (!!c.saveData || c.type === 'cellular' || ['slow-2g', '2g', '3g'].includes(c.effectiveType ?? ''))
}

let state: ModelState = { status: 'idle', loaded: 0, total: 0, classes: [] }
const listeners = new Set<() => void>()
const subscribe = (l: () => void) => (listeners.add(l), () => { listeners.delete(l) })
const pending = new Map<number, { resolve: (p: Prediction) => void; reject: (e: ModelError) => void }>()
let active: { worker: Worker; ready: Promise<number | undefined>; fail: (error: ModelError) => void } | undefined
let nextId = 1
const LOAD_TIMEOUT = 90_000
const RUN_TIMEOUT = 30_000

function set(patch: Partial<ModelState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

function start() {
  if (active) return active
  set({ status: 'loading', loaded: 0, total: 0, classes: [] })
  let worker: Worker
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  } catch {
    set({ status: 'error' })
    throw new ModelError('worker')
  }

  let resolveReady!: (cropSize?: number) => void
  let rejectReady!: (error: ModelError) => void
  const ready = new Promise<number | undefined>((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
  // A preload may have no classify caller waiting on it yet.
  void ready.catch(() => {})
  const instance = { worker, ready, fail }
  active = instance
  const initTimer = setTimeout(() => fail(new ModelError('timeout')), LOAD_TIMEOUT)
  function fail(error: ModelError) {
    if (active !== instance) return
    active = undefined
    clearTimeout(initTimer)
    worker.terminate()
    rejectReady(error)
    for (const request of pending.values()) request.reject(error)
    pending.clear()
    set({ status: 'error' })
  }
  worker.onerror = worker.onmessageerror = () => fail(new ModelError('worker'))
  worker.onmessage = ({ data: m }) => {
    if (active !== instance) return
    if (m.type === 'progress') set({ loaded: m.loaded, total: m.total })
    else if (m.type === 'ready') {
      clearTimeout(initTimer)
      window.__cleanstreamTimings = { fetchMs: m.fetchMs, sessionMs: m.sessionMs, numThreads: m.numThreads }
      set({ status: 'ready', classes: m.classes })
      resolveReady(m.cropSize)
    } else if (m.type === 'result') {
      Object.assign(window.__cleanstreamTimings!, { prepMs: m.prepMs, inferMs: m.inferMs })
      pending.get(m.id)?.resolve({ probs: m.probs, ms: m.ms })
    } else if (m.type === 'error') fail(new ModelError('worker'))
  }
  try {
    worker.postMessage({ id: 0 })
  } catch {
    fail(new ModelError('worker'))
    throw new ModelError('worker')
  }
  return instance
}

/** Start or retry a download. Preload errors are published to every subscriber. */
export function loadModel() {
  try { start() } catch { /* start has already published the error */ }
}

let decided = false
function autoStart() {
  if (decided || state.status !== 'idle') return
  decided = true
  if (!metered()) return loadModel()
  if ('caches' in self) void caches.match(`${import.meta.env.BASE_URL}model/encoder.onnx`)
    .then((hit) => { if (hit && state.status === 'idle') loadModel() }).catch(() => {})
}

export function useModel(): ModelState {
  const snapshot = useSyncExternalStore(subscribe, () => state)
  useEffect(autoStart, [])
  return snapshot
}

export async function classify(source: ImageBitmapSource): Promise<Prediction> {
  const instance = start()
  const id = nextId++
  return new Promise<Prediction>((resolve, reject) => {
    const timer = setTimeout(() => {
      // A worker can be killed silently under memory pressure. Retire it (and its other requests).
      instance.fail(new ModelError('timeout'))
    }, state.status === 'ready' ? RUN_TIMEOUT : LOAD_TIMEOUT)
    void instance.ready.then(async (cropSize) => {
      const { data, width, height } = await readPhoto(source, cropSize)
      if (!pending.has(id)) return
      try {
        instance.worker.postMessage({ id, data, width, height }, [data.buffer])
      } catch {
        instance.fail(new ModelError('worker'))
      }
    }).catch(() => pending.get(id)?.reject(new ModelError('image')))
    function cleanup() { clearTimeout(timer); pending.delete(id) }
    pending.set(id, {
      resolve: (prediction) => { cleanup(); resolve(prediction) },
      reject: (error) => { cleanup(); reject(error) },
    })
  })
}
