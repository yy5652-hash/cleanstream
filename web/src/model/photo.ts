// Above this limit an iPhone can silently return blank canvas pixels. Only those
// photos get a browser resize before the Pillow-exact training resampler.
const MAX_PIXELS = 16_000_000

export function photoSize(width: number, height: number) {
  if (width * height <= MAX_PIXELS) return { width, height }
  const scale = Math.sqrt(MAX_PIXELS / (width * height))
  return {
    width: Math.max(1, Math.min(MAX_PIXELS, Math.floor(width * scale))),
    height: Math.max(1, Math.min(MAX_PIXELS, Math.floor(height * scale))),
  }
}

export async function readPhoto(source: ImageBitmapSource, cropSize?: number) {
  // Keep default EXIF orientation and ignore embedded ICC profiles, as in training.
  const options = { colorSpaceConversion: 'none', premultiplyAlpha: 'none' } as const
  let bitmap = await createImageBitmap(source, options)
  const canvas = document.createElement('canvas')
  try {
    const { width, height } = photoSize(bitmap.width, bitmap.height)
    if (width !== bitmap.width || height !== bitmap.height) {
      const smaller = await createImageBitmap(bitmap, { ...options, resizeWidth: width, resizeHeight: height, resizeQuality: 'high' })
      bitmap.close()
      bitmap = smaller
    }
    canvas.width = cropSize ?? width
    canvas.height = cropSize ?? height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas unavailable')
    if (cropSize) {
      // Preserve the center-crop path used by shortest-side preprocessing.
      const side = Math.min(bitmap.width, bitmap.height)
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, cropSize, cropSize)
    } else {
      // Bound the canvas even on decoders that ignore bitmap resize options.
      ctx.drawImage(bitmap, 0, 0, width, height)
    }
    return ctx.getImageData(0, 0, canvas.width, canvas.height)
  } finally {
    bitmap.close()
    canvas.width = canvas.height = 0
  }
}
