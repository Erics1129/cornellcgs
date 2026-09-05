/**
 * Portrait preparation in the browser: a dropped photo becomes a 480 px
 * square JPEG (the card shows a circle cut from it), cropped from the top,
 * middle or bottom of a portrait picture — faces usually sit high.
 */

/** Where the square window sits along the picture's long side. */
export type Anchor = 'start' | 'middle' | 'end'

export const SQUARE = 480

export type Shape = 'portrait' | 'landscape' | 'square'

export function shapeOf(bmp: { width: number; height: number }): Shape {
  if (bmp.height > bmp.width * 1.08) return 'portrait'
  if (bmp.width > bmp.height * 1.08) return 'landscape'
  return 'square'
}

/** What the three anchor buttons say for this picture. */
export function anchorLabels(shape: Shape): Record<Anchor, string> {
  return shape === 'landscape'
    ? { start: 'left', middle: 'center', end: 'right' }
    : { start: 'top', middle: 'middle', end: 'bottom' }
}

export function loadBitmap(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: 'from-image' })
}

export async function squareCrop(bmp: ImageBitmap, anchor: Anchor, size = SQUARE): Promise<Blob> {
  const side = Math.min(bmp.width, bmp.height)
  const spareX = bmp.width - side
  const spareY = bmp.height - side
  const f = anchor === 'start' ? 0.1 : anchor === 'end' ? 0.9 : 0.5
  // portrait pictures slide the window up and down; landscape ones side to side
  const sx = spareY > 0 ? spareX / 2 : spareX * f
  const sy = spareY > 0 ? spareY * f : 0
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no canvas')
  // JPEG has no transparency — a transparent PNG lands on white, not black
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size, size)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, sx, sy, side, side, 0, 0, size, size)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('could not encode the picture'))), 'image/jpeg', 0.88),
  )
}

/** `<slug>-<hash>.jpg` — the hash makes every distinct picture its own url. */
export async function hashedName(base: string, blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', await blob.arrayBuffer())
  const hex = [...new Uint8Array(digest)]
    .slice(0, 5)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  const slug =
    base
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'photo'
  return `${slug}-${hex}.jpg`
}
