/*!
 * Based on Pillow 13.0.0, src/libImaging/Resample.c (MIT-CMU).
 * Copyright © 1997-2011 by Secret Labs AB
 * Copyright © 1995-2011 by Fredrik Lundh and contributors
 * Copyright © 2010 by Jeffrey 'Alex' Clark and contributors
 *
 * Permission to use, copy, modify and distribute this software and its
 * documentation for any purpose and without fee is hereby granted,
 * provided that the above copyright notice appears in all copies, and that
 * both that copyright notice and this permission notice appear in supporting
 * documentation, and that the name of Secret Labs AB or the author not be
 * used in advertising or publicity pertaining to distribution of the software
 * without specific, written prior permission.
 *
 * SECRET LABS AB AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS
 * SOFTWARE, INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS.
 * IN NO EVENT SHALL SECRET LABS AB OR THE AUTHOR BE LIABLE FOR ANY SPECIAL,
 * INDIRECT OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
 * LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE
 * OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
 * PERFORMANCE OF THIS SOFTWARE.
 */
const PRECISION_BITS = 22
const UNIT = 1 << PRECISION_BITS
const ROUNDING_BIAS = UNIT >> 1

function bicubic(distance: number) {
  const x = Math.abs(distance)
  if (x < 1) return (1.5 * x - 2.5) * x * x + 1
  if (x < 2) return (((x - 5) * x + 8) * x - 4) * -0.5
  return 0
}

function coefficients(inputSize: number, outputSize: number) {
  const scale = Math.fround(inputSize) / outputSize // Pillow receives the source box as floats.
  const filterScale = Math.max(1, scale)
  const inverse = 1 / filterScale
  const support = 2 * filterScale
  const stride = 2 * Math.ceil(support) + 1
  const first = new Int32Array(outputSize)
  const count = new Int32Array(outputSize)
  const weights = new Int32Array(outputSize * stride)
  const taps = new Float64Array(stride)
  for (let i = 0; i < outputSize; i++) {
    const center = (i + 0.5) * scale
    const start = Math.max(0, Math.trunc(center - support + 0.5))
    const end = Math.min(inputSize, Math.trunc(center + support + 0.5))
    first[i] = start
    count[i] = end - start
    let sum = 0
    for (let j = 0; j < count[i]; j++) {
      taps[j] = bicubic((start + j - center + 0.5) * inverse)
      sum += taps[j]
    }
    for (let j = 0; j < count[i]; j++) {
      const fixed = (sum ? taps[j] / sum : taps[j]) * UNIT
      weights[i * stride + j] = Math.trunc(fixed + (fixed < 0 ? -0.5 : 0.5))
    }
  }
  return { first, count, weights, stride }
}

// Rows and columns use the same fixed-point convolution. Each pass produces packed RGB.
function pass(src: Uint8ClampedArray, width: number, channels: number, horizontal: boolean,
              kernel: ReturnType<typeof coefficients>, firstLine: number, endLine: number) {
  const { first, count, weights, stride } = kernel
  const length = first.length
  const lines = endLine - firstLine
  const out = new Uint8ClampedArray(lines * length * 3)
  const inputStep = horizontal ? channels : width * channels
  const inputLineStep = horizontal ? width * channels : channels
  const outputStep = horizontal ? 3 : lines * 3
  const outputLineStep = horizontal ? length * 3 : 3

  for (let line = 0; line < lines; line++) {
    const base = (firstLine + line) * inputLineStep
    let dest = line * outputLineStep
    for (let i = 0; i < length; i++, dest += outputStep) {
      let srcIndex = base + first[i] * inputStep
      let r = ROUNDING_BIAS, g = ROUNDING_BIAS, b = ROUNDING_BIAS
      const end = i * stride + count[i]
      for (let k = i * stride; k < end; k++, srcIndex += inputStep) {
        const weight = weights[k]
        r += src[srcIndex] * weight
        g += src[srcIndex + 1] * weight
        b += src[srcIndex + 2] * weight
      }
      // The signed shift floors, then the Uint8ClampedArray saturates each channel.
      out[dest] = r >> PRECISION_BITS
      out[dest + 1] = g >> PRECISION_BITS
      out[dest + 2] = b >> PRECISION_BITS
    }
  }
  return out
}

/** Resize native RGBA bytes like Pillow's full-box RGB BICUBIC resize, discarding alpha. */
export function resizeBicubic(src: Uint8ClampedArray, w: number, h: number, outW: number, outH: number): Uint8ClampedArray {
  if (![w, h, outW, outH].every(n => Number.isSafeInteger(n) && n > 0) || src.length !== w * h * 4) {
    throw new RangeError('Invalid image dimensions or RGBA buffer length')
  }
  if (w === outW && h === outH) {
    const copy = new Uint8ClampedArray(w * h * 3)
    for (let i = 0, j = 0; i < src.length; i += 4, j += 3) {
      copy[j] = src[i]
      copy[j + 1] = src[i + 1]
      copy[j + 2] = src[i + 2]
    }
    return copy
  }
  if (w === outW) return pass(src, w, 4, false, coefficients(h, outH), 0, w)
  const x = coefficients(w, outW)
  if (h === outH) return pass(src, w, 4, true, x, 0, h)

  const y = coefficients(h, outH)
  // Pillow 13 reverses the passes for sufficiently large height reductions.
  if (h > outH && h - outH > 2 * (w - outW)) {
    const temp = pass(src, w, 4, false, y, 0, w)
    return pass(temp, w, 3, true, x, 0, outH)
  }
  const firstRow = y.first[0]
  const endRow = y.first[outH - 1] + y.count[outH - 1]
  const temp = pass(src, w, 4, true, x, firstRow, endRow)
  if (firstRow) {
    for (let i = 0; i < outH; i++) y.first[i] -= firstRow
  }
  return pass(temp, outW, 3, false, y, 0, outW)
}
