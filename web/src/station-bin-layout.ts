export const MIN_DENSE_BIN_COUNT = 6
export const DENSE_BIN_GAP = 12
export const DENSE_BIN_PADDING = 8
const MIN_LABEL_WIDTH = 88

export function stationBinRows(count: number, availableWidth: number): number[] {
  if (count === 0) return []
  const labelWidth = (availableWidth - (count - 1) * DENSE_BIN_GAP) / count - 2 * DENSE_BIN_PADDING
  if (count < MIN_DENSE_BIN_COUNT || labelWidth >= MIN_LABEL_WIDTH) return [count]
  const top = Math.ceil(count / 2)
  return [top, count - top]
}
