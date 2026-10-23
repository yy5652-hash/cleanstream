/// <reference lib="webworker" />
// Runs the image encoder and the item-type head off the main thread. Images never leave the device.
import * as ort from 'onnxruntime-web/wasm'

type Head = { classes: string[]; temperature: number; dim: number; W: number[][]; b: number[] }
type Prep = { size: number; mean: number[]; std: number[] }

const base = new URL(import.meta.env.BASE_URL, self.location.origin).href
let session: ort.InferenceSession | null = null
let head: { classes: string[]; t: number; W: Float32Array; b: Float32Array; dim: number } | null = null
let prep: Prep | null = null

async function init() {
  ort.env.wasm.wasmPaths = base + 'ort/'
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1
  const [h, p, model] = await Promise.all([
    fetch(base + 'model/head.json').then((r) => r.json() as Promise<Head>),
    fetch(base + 'model/preprocess.json').then((r) => r.json() as Promise<Prep>),
    fetchWithProgress(base + 'model/encoder.onnx'),
  ])
  prep = p
  head = { classes: h.classes, t: h.temperature, dim: h.dim, W: new Float32Array(h.W.flat()), b: new Float32Array(h.b) }
  session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' })
}

async function fetchWithProgress(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  const total = Number(res.headers.get('content-length')) || 0
  if (!res.body) return new Uint8Array(await res.arrayBuffer())
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let got = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    got += value.length
    if (total) self.postMessage({ type: 'progress', loaded: got, total })
  }
  const out = new Uint8Array(got)
  let o = 0
  for (const c of chunks) {
    out.set(c, o)
    o += c.length
  }
  return out
}

// Shorter side to `size`, then a centre crop, then per-channel normalisation (matches training).
function pixels(bitmap: ImageBitmap): Float32Array {
  const { size, mean, std } = prep!
  const canvas = new OffscreenCanvas(size, size)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  const s = Math.min(bitmap.width, bitmap.height)
  ctx.drawImage(bitmap, (bitmap.width - s) / 2, (bitmap.height - s) / 2, s, s, 0, 0, size, size)
  const { data } = ctx.getImageData(0, 0, size, size)
  const out = new Float32Array(3 * size * size)
  const plane = size * size
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) out[c * plane + i] = (data[i * 4 + c] / 255 - mean[c]) / std[c]
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

const ready = init()

self.onmessage = async (e: MessageEvent) => {
  const { id, bitmap } = e.data as { id: number; bitmap?: ImageBitmap }
  try {
    await ready
    if (!bitmap) return self.postMessage({ type: 'ready', id, classes: head!.classes })
    const t0 = performance.now()
    const size = prep!.size
    const input = new ort.Tensor('float32', pixels(bitmap), [1, 3, size, size])
    bitmap.close()
    const out = await session!.run({ pixels: input })
    const emb = out.embedding.data as Float32Array
    const probs = classify(emb)
    self.postMessage({ type: 'result', id, probs, ms: performance.now() - t0 }, [probs.buffer])
  } catch (err) {
    self.postMessage({ type: 'error', id, message: String(err) })
  }
}
