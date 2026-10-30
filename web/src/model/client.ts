// Main-thread handle on the model worker: one shared worker, promise per request, load progress for the UI.
import { useSyncExternalStore } from 'react'

export type Prediction = { probs: Float32Array; ms: number }
export type ModelState = { status: 'idle' | 'loading' | 'ready' | 'error'; loaded: number; total: number; classes: string[]; error?: string }

// On mobile data or with Data Saver on, the 96 MB model waits until someone asks for a photo answer (idle until then).
// Search needs no model, and a model cached by an earlier visit loads straight away.
type Connection = { saveData?: boolean; type?: string; effectiveType?: string }
const metered = () => {
  const c = (navigator as Navigator & { connection?: Connection }).connection
  return !!c && (!!c.saveData || c.type === 'cellular' || ['slow-2g', '2g', '3g'].includes(c.effectiveType ?? ''))
}

let state: ModelState = { status: metered() ? 'idle' : 'loading', loaded: 0, total: 0, classes: [] }
const listeners = new Set<() => void>()
const pending = new Map<number, { resolve: (p: Prediction) => void; reject: (e: Error) => void }>()
let worker: Promise<Worker> | null = null
let nextId = 1

function set(patch: Partial<ModelState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

// In the built app a service worker caches the model the first time it is fetched. Wait (briefly) until it controls
// the page, so the model worker's downloads go through it and the next visit works offline.
async function controlled() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  try {
    await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
    if (navigator.serviceWorker.controller) return
    await Promise.race([
      new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true })),
      new Promise((r) => setTimeout(r, 4000)),
    ])
  } catch {
    /* no service worker: everything still works online */
  }
}

// The service worker adds the headers that allow several threads, but only to pages it serves, so a first visit loads once
// more through it. This happens as the page opens, never after someone has picked a photo. Once per tab, in case it can't work.
let ready: Promise<void> | null = null
const prepare = () =>
  (ready ??= controlled().then(() => {
    if (self.crossOriginIsolated || !navigator.serviceWorker?.controller) return
    try {
      if (sessionStorage.getItem('cleanstream.isolating')) return
      sessionStorage.setItem('cleanstream.isolating', '1')
    } catch {
      return
    }
    location.reload()
    return new Promise<void>(() => {}) // the page is going away
  }))

function start(): Promise<Worker> {
  if (worker) return worker
  if (state.status === 'idle') set({ status: 'loading' })
  worker = prepare().then(() => {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = onMessage
    w.postMessage({ id: 0 })
    return w
  })
  return worker
}

function onMessage(e: MessageEvent) {
  const m = e.data
  if (m.type === 'progress') set({ loaded: m.loaded, total: m.total })
  else if (m.type === 'ready') set({ status: 'ready', classes: m.classes })
  else if (m.type === 'result') pending.get(m.id)?.resolve({ probs: m.probs, ms: m.ms })
  else if (m.type === 'error') {
    if (state.status !== 'ready') set({ status: 'error', error: m.message })
    pending.get(m.id)?.reject(new Error(m.message))
  }
  if (m.id) pending.delete(m.id)
}

let decided = false
function autoStart() {
  if (decided) return
  decided = true
  void prepare()
  if (state.status !== 'idle') return void start()
  if ('caches' in self) caches.match(`${import.meta.env.BASE_URL}model/encoder.onnx`).then((hit) => hit && start(), () => {})
}

/** Start the model download now (a button, or the first photo). */
export const loadModel = () => void start()

export function useModel(): ModelState {
  autoStart()
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
  )
}

export async function classify(source: Blob | ImageBitmapSource): Promise<Prediction> {
  const w = await start()
  const bitmap = await createImageBitmap(source as ImageBitmapSource)
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    w.postMessage({ id, bitmap }, [bitmap])
  })
}
