// Re-encodes the Carrot key art as WebP (q80, at most 1600 px wide) with the browser's own encoder: Chromium's canvas.toBlob('image/webp').
// Self-made derivatives of the project's existing art; the original JPG/PNG files stay in place (the site card and social image use them).
// Usage: node scripts/carrot-ui-qa/webp.mjs [--max 1600] [--q .8] <in.jpg> [out.webp] ...   (Playwright from the Codex runtime)
import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
const { chromium } = await import(process.env.PLAYWRIGHT || '/Users/eric/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')
const args = process.argv.slice(2); let max = 1600, q = .8, crop = null; const files = []
for (let i = 0; i < args.length; i++) { if (args[i] === '--max') max = Number(args[++i]); else if (args[i] === '--q') q = Number(args[++i]); else if (args[i] === '--crop') crop = args[++i].split(',').map(Number); else files.push(args[i]) }
const pairs = []; for (let i = 0; i < files.length; i++) { const f = files[i], next = files[i + 1]; if (next && next.endsWith('.webp')) { pairs.push([f, next]); i++ } else pairs.push([f, f.replace(/\.(jpe?g|png)$/i, '.webp')]) }
const browser = await chromium.launch({ channel: 'chromium' }); const page = await browser.newPage()
const rows = []
for (const [input, output] of pairs) {
  const bytes = readFileSync(input), type = /\.png$/i.test(input) ? 'image/png' : 'image/jpeg'
  const b64 = await page.evaluate(async ({ data, type, max, q, crop }) => {
    const blob = await (await fetch(`data:${type};base64,${data}`)).blob(); const img = await createImageBitmap(blob)
    const [sx, sy, sw, sh] = crop || [0, 0, img.width, img.height]; const scale = Math.min(1, max / sw)
    const c = new OffscreenCanvas(Math.round(sw * scale), Math.round(sh * scale)); const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height)
    const out = await c.convertToBlob({ type: 'image/webp', quality: q }); const buf = new Uint8Array(await out.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); return [btoa(s), c.width, c.height]
  }, { data: bytes.toString('base64'), type, max, q, crop })
  const out = Buffer.from(b64[0], 'base64'); writeFileSync(output, out)
  rows.push({ input, output, width: b64[1], height: b64[2], bytesIn: statSync(input).size, bytesOut: out.length, sha256: createHash('sha256').update(out).digest('hex') })
}
await browser.close(); console.log(JSON.stringify(rows, null, 1))
