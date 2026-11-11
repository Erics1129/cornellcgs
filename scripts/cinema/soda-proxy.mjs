// Proxy atlas for the soda film: all 96 frames at thumbnail size in one image (16 columns x 6 rows).
// The page draws the cell of the current frame, scaled up, whenever the sharp frame is not decoded yet
// (right after a teleport, during a fling), so the stage always has the right picture at once.
// usage: node scripts/cinema/soda-proxy.mjs [quality=0.72]
import path from 'node:path'
import { ROOT, assetPage, writeDataUrl } from './lib-assets.mjs'
const quality = +(process.argv[2] || 0.72)
const SETS = { d: { w: 160, h: 90 }, m: { w: 90, h: 160 } }
const { browser, page } = await assetPage()
for (const [set, cell] of Object.entries(SETS)) {
  const url = await page.evaluate(async ({ set, cell, quality }) => {
    const COLS = 16, ROWS = 6, COUNT = 96
    const c = document.createElement('canvas'); c.width = cell.w * COLS; c.height = cell.h * ROWS
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'
    for (let i = 0; i < COUNT; i++) {
      const blob = await (await fetch(`/soda/${set}/${String(i).padStart(3, '0')}.webp`)).blob()
      // resize in one high-quality step, then place the cell
      const bmp = await createImageBitmap(blob, { resizeWidth: cell.w, resizeHeight: cell.h, resizeQuality: 'high' })
      x.drawImage(bmp, (i % COLS) * cell.w, Math.floor(i / COLS) * cell.h)
      bmp.close()
    }
    return c.toDataURL('image/webp', quality)
  }, { set, cell, quality })
  const bytes = writeDataUrl(path.join(ROOT, `public/soda/${set}/proxy.webp`), url)
  console.log(`soda/${set}/proxy.webp`, `${cell.w * 16}x${cell.h * 6}`, `${(bytes / 1024).toFixed(1)} kB`)
}
await browser.close()
