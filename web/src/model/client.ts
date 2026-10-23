// Main-thread handle on the model worker: one shared worker, promise per request, load progress for the UI.
import { useSyncExternalStore } from 'react'

export type Prediction = { probs: Float32Array; ms: number }
export type ModelState = { status: 'loading' | 'ready' | 'error'; loaded: number; total: number; classes: string[]; error?: string }

let state: ModelState = { status: 'loading', loaded: 0, total: 0, classes: [] }
const listeners = new Set<() => void>()
const pending = new Map<number, { resolve: (p: Prediction) => void; reject: (e: Error) => void }>()
let worker: Worker | null = null
let nextId = 1

function set(patch: Partial<ModelState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

function start() {
  if (worker) return worker
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e) => {
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
  worker.postMessage({ id: 0 })
  return worker
}

export function useModel(): ModelState {
  start()
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
  )
}

export async function classify(source: Blob | ImageBitmapSource): Promise<Prediction> {
  const w = start()
  const bitmap = await createImageBitmap(source as ImageBitmapSource)
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    w.postMessage({ id, bitmap }, [bitmap])
  })
}
