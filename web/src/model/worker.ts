/// <reference lib="webworker" />
// Runs the image encoder and the item-type head off the main thread. Images never leave the device.
import * as ort from 'onnxruntime-web/wasm'
import { resizeBicubic } from './resample'

type Head = { classes: string[]; temperature: number; dim: number; W: number[][]; b: number[] }
type Prep = { size: number; mean: number[]; std: number[]; resize: 'squash' | 'shortest' }

const base = new URL(import.meta.env.BASE_URL, self.location.origin).href
let session: ort.InferenceSession | null = null
let head: { classes: string[]; t: number; W: Float32Array; b: Float32Array; dim: number } | null = null
let prep: Prep | null = null

async function init() {
  ort.env.wasm.wasmPaths = base + 'ort/'
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1
  const fetchStart = performance.now()
  const [h, p, model] = await Promise.all([
    fetch(base + 'model/head.json').then((r) => r.json() as Promise<Head>),
    fetch(base + 'model/preprocess.json').then((r) => r.json() as Promise<Prep>),
    fetchWithProgress(base + 'model/encoder.onnx'),
  ])
  const fetchMs = performance.now() - fetchStart
  prep = p
  head = { classes: h.classes, t: h.temperature, dim: h.dim, W: new Float32Array(h.W.flat()), b: new Float32Array(h.b) }
  const sessionStart = performance.now()
  session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' })
  self.postMessage({ type: 'ready', classes: h.classes, cropSize: p.resize === 'shortest' ? p.size : undefined,
    fetchMs, sessionMs: performance.now() - sessionStart, numThreads: ort.env.wasm.numThreads })
}

async function fetchWithProgress(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Model fetch failed')
  // Fetch exposes decoded bytes. A compressed response's wire length is not a buffer size.
  const encoding = res.headers.get('content-encoding')
  const total = !encoding || encoding === 'identity' ? Number(res.headers.get('content-length')) || 0 : 0
  const progress = (loaded: number) => self.postMessage({ type: 'progress', loaded, total })
  if (!res.body) {
    const bytes = new Uint8Array(await res.arrayBuffer())
    progress(bytes.length)
    return bytes
  }
  const reader = res.body.getReader()
  const buffer = total ? new Uint8Array(total) : null
  const chunks: Uint8Array[] = []
  let got = 0
  let reported = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (buffer) buffer.set(value, got)
    else chunks.push(value)
    got += value.length
    if (got - reported >= 262144) {
      progress(got)
      reported = got
    }
  }
  progress(got)
  if (buffer) {
    if (got !== total) throw new Error('Incomplete model')
    return buffer
  }
  const out = new Uint8Array(got)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

function pixels(data: Uint8ClampedArray, width: number, height: number): Float32Array {
  const { size, mean, std, resize } = prep!
  const squash = resize === 'squash'
  const bytes = squash ? resizeBicubic(data, width, height, size, size) : data
  const channels = squash ? 3 : 4
  const out = new Float32Array(3 * size * size)
  const plane = size * size
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) out[c * plane + i] = (bytes[i * channels + c] / 255 - mean[c]) / std[c]
  }
  return out
}

function classify(embedding: Float32Array): Float32Array {
  const { W, b, t, dim, classes } = head!
  const logits = new Float32Array(classes.length)
  let max = -Infinity
  for (let k = 0; k < classes.length; k++) {
    let z = b[k]
    for (let j = 0; j < dim; j++) z += W[k * dim + j] * embedding[j]
    logits[k] = z / t
    max = Math.max(max, logits[k])
  }
  let sum = 0
  for (let k = 0; k < logits.length; k++) sum += logits[k] = Math.exp(logits[k] - max)
  for (let k = 0; k < logits.length; k++) logits[k] /= sum
  return logits
}

self.onmessage = async (e: MessageEvent) => {
  const { id, data, width, height } = e.data
  try {
    if (id === 0) return await init()
    const t0 = performance.now()
    const size = prep!.size
    const input = new ort.Tensor('float32', pixels(data, width, height), [1, 3, size, size])
    const inferStart = performance.now()
    const out = await session!.run({ pixels: input })
    const inferMs = performance.now() - inferStart
    const probs = classify(out.embedding.data as Float32Array)
    self.postMessage({ type: 'result', id, probs, ms: performance.now() - t0, prepMs: inferStart - t0, inferMs }, [probs.buffer])
  } catch {
    self.postMessage({ type: 'error', id })
  }
}
