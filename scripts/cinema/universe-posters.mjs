// Exports one poster per leg of the Universe journey from the real shader (dev build only).
//   1. npm run dev -- --port 5712 --strictPort --host 127.0.0.1
//   2. <node with playwright> scripts/cinema/universe-posters.mjs http://127.0.0.1:5712/ [playwright index.mjs path]
// Writes public/assets/film/posters/universe-{0,1,2}.webp (1280x800, about 60 kB or less each).
// The page exposes window.__filmShots.universe(progress) in dev (src/components/UniverseJourney.tsx).
import fs from 'node:fs'
const [url = 'http://127.0.0.1:5712/', pw = '/Users/eric/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'] = process.argv.slice(2)
const { chromium } = await import(pw)
/** One finished composition per leg: the flypast, the tunnel, the arrival. */
const SHOTS = [0.2, 0.52, 0.93]
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
await page.goto(url, { waitUntil: 'load' })
await page.waitForTimeout(4000)
await page.evaluate(() => document.getElementById('universe').scrollIntoView())
await page.waitForFunction(() => window.__filmShots?.universeReady?.(), null, { timeout: 20000 })
await page.waitForTimeout(500)
fs.mkdirSync('public/assets/film/posters', { recursive: true })
for (const [leg, p] of SHOTS.entries()) {
  let quality = 0.82
  let data
  do {
    data = await page.evaluate(([p, q]) => window.__filmShots.universe(p, 'image/webp', q), [p, quality])
    quality -= 0.08
  } while (data.length * 0.75 > 60_000 && quality > 0.3)
  const file = `public/assets/film/posters/universe-${leg}.webp`
  fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'))
  console.log(file, Math.round(data.length * 0.75 / 1024) + ' kB', 'progress', p, 'quality', (quality + 0.08).toFixed(2))
}
await browser.close()
