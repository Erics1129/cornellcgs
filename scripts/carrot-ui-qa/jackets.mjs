// Jacket art for stage select: a ready-frame capture of each level's own board from the real Unity player (the dev server's
// ?carrot-preview mode, HUD hidden), encoded as WebP with the browser's encoder. Self-made from the project's own build; provenance
// (build version, level, viewport, sha256) goes to public/assets/minigames/carrot/jackets/provenance.json.
//   node scripts/carrot-ui-qa/jackets.mjs [base=http://localhost:5291] [levels=1-29]
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { chromium, root } from './lib.mjs'
const base = process.argv[2] || 'http://localhost:5291', range = (process.argv[3] || '1-29').split('-').map(Number)
const levels = Array.from({ length: (range[1] || range[0]) - range[0] + 1 }, (_, i) => range[0] + i)
const dir = join(root, 'public/assets/minigames/carrot/jackets'); mkdirSync(dir, { recursive: true })
const build = JSON.parse(readFileSync(join(root, 'src/minigames/carrot/unity-build.json'), 'utf8')).version
const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.addInitScript(() => { try { localStorage.setItem('cgs-carrot-records-v1', JSON.stringify({ version: 1, levels: {}, seen: { abilities: [], creatures: [] }, tutorial: true })) } catch { /* private */ } })
await page.goto(`${base}/minigames/carrotDefense/?carrot-preview=${levels[0]}`, { waitUntil: 'networkidle' })
await page.click('.ct-lobby .ct-cta--hero')
await page.waitForFunction(() => !document.querySelector('.ct-loading') && window.__carrot?.state(), null, { timeout: 240000 })
await page.addStyleTag({ content: '.ct-hud,.ct-toasts,.ct-judge,.ct-review,.ct-build,.ct-coach,.ct-encounter,.ct-minibars,.ct-monster-bars,.ct-vignette,.ct-paused{display:none!important}' })
let provenance = []; try { provenance = JSON.parse(readFileSync(join(dir, 'provenance.json'), 'utf8')).files } catch { /* first run */ }
for (const level of levels) {
  await page.evaluate(l => window.__carrot.send({ type: 'load', level: l }), level)
  await page.waitForFunction(l => window.__carrot.state()?.level === l, level, { timeout: 30000 })
  await page.waitForTimeout(3500)
  const png = await page.screenshot({ type: 'png' })
  const b64 = await page.evaluate(async data => { const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob()); const c = new OffscreenCanvas(640, 360); const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, 640, 360); const out = new Uint8Array(await (await c.convertToBlob({ type: 'image/webp', quality: .8 })).arrayBuffer()); let s = ''; for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode(...out.subarray(i, i + 0x8000)); return btoa(s) }, png.toString('base64'))
  const bytes = Buffer.from(b64, 'base64'), name = `${String(level).padStart(2, '0')}.webp`
  writeFileSync(join(dir, name), bytes)
  provenance = provenance.filter(p => p.file !== name).concat({ file: name, level, source: `Unity web player build ${build}, ready phase, 1280x720 capture with the HUD hidden`, encoder: 'Chromium canvas WebP q0.8, 640x360', sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length })
  console.log(name, bytes.length)
}
provenance.sort((a, b) => a.level - b.level)
writeFileSync(join(dir, 'provenance.json'), JSON.stringify({ about: 'Stage-select jacket art: captures of the game\'s own boards (self-made, no third-party input). Regenerate with scripts/carrot-ui-qa/jackets.mjs after a release build.', files: provenance }, null, 1) + '\n')
await browser.close()
