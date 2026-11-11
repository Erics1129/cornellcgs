// Half-size copy of the NASA earth map for phone and tablet tiers (tier().textureMax = 2048).
//   <node with playwright> scripts/cinema/earth-2048.mjs [playwright index.mjs path]
// Source: public/assets/earth-journey/earth-nasa-july-4096.webp (NASA Blue Marble, credit unchanged: see
// public/assets/earth-journey/credits.json). Output: public/assets/film/earth-nasa-july-2048.webp.
// Resampled in Chromium with high-quality canvas scaling, WebP quality 0.86.
import fs from 'node:fs'
const pw = process.argv[2] ?? '/Users/eric/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
const { chromium } = await import(pw)
const src = 'public/assets/earth-journey/earth-nasa-july-4096.webp'
const browser = await chromium.launch()
const page = await browser.newPage()
const data = await page.evaluate(async (url) => {
  const img = new Image(); img.src = url; await img.decode()
  const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth / 2); c.height = Math.round(img.naturalHeight / 2)
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, c.width, c.height)
  return { url: c.toDataURL('image/webp', 0.86), w: c.width, h: c.height }
}, 'data:image/webp;base64,' + fs.readFileSync(src).toString('base64'))
const out = 'public/assets/film/earth-nasa-july-2048.webp'
fs.writeFileSync(out, Buffer.from(data.url.split(',')[1], 'base64'))
console.log(out, data.w + 'x' + data.h, fs.statSync(out).size + ' bytes')
await browser.close()
