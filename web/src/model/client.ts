// Main-thread handle on the model worker: one shared worker, promise per request, load progress for the UI.
import { useSyncExternalStore } from 'react'

export type Prediction = { probs: Float32Array; ms: number }
export type ModelState = { status: 'loading' | 'ready' | 'error'; loaded: number; total: number; classes: string[]; error?: string }

let state: ModelState = { status: 'loading', loaded: 0, total: 0, classes: [] }
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

function start(): Promise<Worker> {
  if (worker) return worker
  worker = controlled().then(() => {
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

export function useModel(): ModelState {
  start()
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
