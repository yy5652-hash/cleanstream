// Spotting an item held up in front of an empty view, from a tiny colour thumbnail of each camera frame.
export const GRID_W = 24
export const GRID_H = 18

const CELL = 0.07 // a cell has changed when a colour channel moves this far (0 to 1), beyond any overall change in light
const PRESENT = 0.04 // an item is there when this share of the view has changed
const STILL = 0.015 // and it is being held still when this share changes from one frame to the next

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b)
  return s[s.length >> 1]
}

/** Which cells differ between two RGB thumbnails. The median shift per channel is removed, so a light going on is not an item. */
export function changedCells(now: Float32Array, ref: Float32Array): boolean[] {
  const n = now.length / 3
  const shift = [0, 1, 2].map((c) => median(Array.from({ length: n }, (_, i) => now[i * 3 + c] - ref[i * 3 + c])))
  return Array.from({ length: n }, (_, i) => [0, 1, 2].some((c) => Math.abs(now[i * 3 + c] - ref[i * 3 + c] - shift[c]) > CELL))
}

export const share = (cells: boolean[]) => cells.filter(Boolean).length / cells.length
export const isPresent = (now: Float32Array, empty: Float32Array) => share(changedCells(now, empty)) > PRESENT
export const isStill = (now: Float32Array, prev: Float32Array) => share(changedCells(now, prev)) < STILL

export type Box = { x: number; y: number; w: number; h: number } // in pixels of the frame

/**
 * A square around the changed cells, with some margin, in pixels of a frame of this size. The model trained on photos that
 * the item mostly fills, so it reads the crop better than a whole room. Null when the change already fills most of the view.
 */
export function focusBox(cells: boolean[], frameW: number, frameH: number, margin = 0.2): Box | null {
  const on = cells.flatMap((c, i) => (c ? [[i % GRID_W, Math.floor(i / GRID_W)]] : []))
  if (!on.length) return null
  // ignore stray cells: the middle 96% of the changed cells on each axis
  const trim = (v: number[]) => {
    const s = [...v].sort((a, b) => a - b)
    const k = Math.floor(s.length * 0.02)
    return [s[k], s[s.length - 1 - k] + 1]
  }
  const [x0, x1] = trim(on.map((p) => p[0])).map((v) => (v / GRID_W) * frameW)
  const [y0, y1] = trim(on.map((p) => p[1])).map((v) => (v / GRID_H) * frameH)
  const side = Math.max(x1 - x0, y1 - y0) * (1 + margin * 2)
  if (side >= Math.min(frameW, frameH) * 0.95) return null
  const x = Math.min(Math.max(0, (x0 + x1 - side) / 2), frameW - side)
  const y = Math.min(Math.max(0, (y0 + y1 - side) / 2), frameH - side)
  return { x, y, w: side, h: side }
}
