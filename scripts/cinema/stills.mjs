// Stills ladder for the black-hole film: nine evenly spaced frames of the film itself, as WebP.
// The page shows the two nearest stills, crossfaded, whenever the video frame is not exactly on the scroll's target.
// usage: node scripts/cinema/stills.mjs [film=assets/blackhole-g6.mp4] [count=9] [quality=0.72] [width=960]
// Budget: each still at most 60 kB (they are fetched together when the chapter comes near).
import path from 'node:path'
import { ROOT, assetPage, writeDataUrl } from './lib-assets.mjs'
const [film = 'assets/blackhole-g6.mp4', count = '9', quality = '0.72', width = '960'] = process.argv.slice(2)
const { browser, page } = await assetPage()
const frames = await page.evaluate(async ({ film, count, quality, width }) => {
  const v = document.createElement('video')
  v.muted = true; v.preload = 'auto'; v.playsInline = true
  document.body.appendChild(v)   // a detached video can be collected before it loads
  v.src = '/' + film
  await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('video failed to load')) })
  const c = document.createElement('canvas'); c.width = Math.min(width, v.videoWidth); c.height = Math.round(c.width * v.videoHeight / v.videoWidth)
  const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'
  const out = []
  for (let i = 0; i < count; i++) {
    const p = i / (count - 1)
    const t = Math.max(0, v.duration - 0.05) * p   // the same mapping ScrollFilm uses
    await new Promise((res) => { v.onseeked = res; v.currentTime = t; if (Math.abs(v.currentTime - t) < 1e-4 && !v.seeking) res() })
    // wait until the frame is really presented (no new frame is presented when the seek was a no-op, hence the timer)
    await new Promise((res) => { setTimeout(res, 300); v.requestVideoFrameCallback?.(() => res()) })
    x.drawImage(v, 0, 0, c.width, c.height)
    out.push({ p, t, url: c.toDataURL('image/webp', quality) })
  }
  return { w: c.width, h: c.height, duration: v.duration, out }
}, { film, count: +count, quality: +quality, width: +width })
for (const f of frames.out) {
  const name = `blackhole-${String(Math.round(f.p * 100)).padStart(3, '0')}.webp`
  const bytes = writeDataUrl(path.join(ROOT, 'public/assets/scenes', name), f.url)
  console.log(name, `${frames.w}x${frames.h}`, `t=${f.t.toFixed(3)}s`, `${(bytes / 1024).toFixed(1)} kB`)
}
await browser.close()
