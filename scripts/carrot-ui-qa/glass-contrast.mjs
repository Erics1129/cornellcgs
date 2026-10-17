// Rendered WCAG contrast of every text run on the DEV glass lab (?carrot-glass-lab): hide the text, capture, read the pixels under
// each text run and compare them with its colour (worst pixel and 1st percentile). Covers the tint, sheen, lips, rim, grain and the
// real blur (Chromium; WebKit captures never show backdrop-filter, so WebKit numbers are the lite look, the stricter case).
// Backdrops: the five chapter key arts; add game frames with BACKDROPS=<dir of .png> (served at /__lab/<name>).
//   BASE=http://127.0.0.1:5480 node scripts/carrot-ui-qa/glass-contrast.mjs [chromium|webkit] [tiers=lite,real,solid] [vps=desktop,phone]
// Writes output/carrot-ui-qa/glass-contrast-<engine>.json and prints every run under (or within 0.6 of) the WCAG minimum.
import fs from 'node:fs'
import path from 'node:path'
const RT = '/Users/eric/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'
const { chromium, webkit } = await import(process.env.PLAYWRIGHT || RT + '/playwright/index.mjs')
const pngjs = await import(RT + '/pngjs/lib/png.js'); const PNG = pngjs.PNG || pngjs.default.PNG
const BD = process.env.BACKDROPS || ''
const OUT = process.env.CARROT_QA_OUT || path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../output/carrot-ui-qa')
const BASE = process.env.BASE || 'http://127.0.0.1:5480'
const [engine = 'chromium', tierArg = 'lite,real,solid', vpArg = 'desktop,phone'] = process.argv.slice(2)
const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
const L = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
const backdrops = [['garden-art', 'garden', ''], ['frost-art', 'frost', ''], ['marsh-art', 'marsh', ''], ['orchard-art', 'orchard', ''], ['prism-art', 'prism', ''],
  ...(BD ? fs.readdirSync(BD).filter(f => f.endsWith('.png')).map(f => [f.replace(/\.png$/, ''), 'garden', '/__lab/' + f]) : [])]
const positions = (process.env.POS || '0% 0%|50% 50%|100% 100%').split('|')
const vps = { desktop: { width: 1440, height: 900, dpr: 1 }, phone: { width: 390, height: 844, dpr: 1 } }
const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ channel: 'chromium', args: ['--enable-gpu', '--ignore-gpu-blocklist'] })
const rows = []
for (const vp of vpArg.split(',')) for (const tier of tierArg.split(',')) for (const [name, biome, bg] of backdrops) for (const pos of positions) {
  const v = vps[vp]
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.dpr })
  await ctx.route('**/__lab/*', r => r.fulfill({ path: path.join(BD, path.basename(new URL(r.request().url()).pathname)), contentType: 'image/png' }))
  const page = await ctx.newPage()
  const q = new URLSearchParams({ biome, glass: tier, pos }); if (bg) q.set('bg', bg)
  await page.goto(`${BASE}/minigames/carrotDefense/?carrot-glass-lab&${q}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(700)
  // every probe block, scrolled into view one viewport at a time (phones stack the columns)
  const height = await page.evaluate(() => document.querySelector('.ct-lab').scrollHeight)
  for (let y = 0; y < height; y += v.height - 60) {
    await page.evaluate(y => { document.querySelector('.ct-lab').scrollTop = y }, y); await page.waitForTimeout(250)
    const boxes = await page.evaluate(() => {
      const res = []
      for (const root of document.querySelectorAll('[data-probe]')) {
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
        for (let n = w.nextNode(); n; n = w.nextNode()) {
          if (!n.textContent.trim()) continue
          const el = n.parentElement, cs = getComputedStyle(el)
          if (cs.visibility === 'hidden') continue
          const r = document.createRange(); r.selectNodeContents(n); const rc = r.getBoundingClientRect()
          if (rc.width < 2 || rc.bottom < 0 || rc.top > innerHeight) continue
          const solid = !!el.closest('.ct-band, .gl-tag, .ct-tag.is-best, .gl-jelly, .ct-cta')
          const disabled = !!el.closest('button:disabled')
          res.push({ probe: root.dataset.probe, text: n.textContent.trim().slice(0, 28), color: cs.color, size: parseFloat(cs.fontSize), weight: +cs.fontWeight, x: rc.x, y: rc.y, w: rc.width, h: rc.height, solid, disabled, inner: !!el.closest('.gl .gl, .gl .ct-icon-btn, .gl .ct-ghost') })
        }
      }
      return res
    })
    const hide = await page.addStyleTag({ content: '[data-probe], [data-probe] * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; } [data-probe] svg { visibility: hidden !important }' })
    await page.waitForTimeout(150)
    const png = PNG.sync.read(await page.screenshot({ animations: 'disabled' }))
    await hide.evaluate(n => n.remove())
    for (const bx of boxes) {
      const [r, g, bl] = bx.color.match(/[\d.]+/g).map(Number); const Lt = L(r, g, bl)
      const ls = []
      for (let yy = Math.max(0, Math.floor(bx.y)); yy < Math.min(png.height, Math.ceil(bx.y + bx.h)); yy++)
        for (let xx = Math.max(0, Math.floor(bx.x)); xx < Math.min(png.width, Math.ceil(bx.x + bx.w)); xx++) { const k = (yy * png.width + xx) * 4; ls.push(L(png.data[k], png.data[k + 1], png.data[k + 2])) }
      if (!ls.length) continue
      ls.sort((a, c) => a - c)
      const cr = Lb => { const [hi, lo] = Lt > Lb ? [Lt, Lb] : [Lb, Lt]; return (hi + 0.05) / (lo + 0.05) }
      const light = Lt > 0.3
      const worst = light ? ls[ls.length - 1] : ls[0], p99 = light ? ls[Math.floor(ls.length * 0.99)] : ls[Math.floor(ls.length * 0.01)]
      const large = bx.size >= 24 || (bx.size >= 18.66 && bx.weight >= 700)
      rows.push({ engine, vp, tier, backdrop: name, pos, probe: bx.probe, text: bx.text, size: bx.size, weight: bx.weight, color: bx.color, solid: bx.solid, inner: bx.inner, disabled: bx.disabled, large, worst: +cr(worst).toFixed(2), p99: +cr(p99).toFixed(2) })
    }
  }
  await ctx.close()
}
await browser.close()
fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, `glass-contrast-${engine}.json`), JSON.stringify(rows, null, 1))
// summary: worst case per text run across every backdrop and position
const key = r => `${r.vp} ${r.tier} ${r.probe} ${r.text}`
const agg = new Map()
for (const r of rows) { const k = key(r); const a = agg.get(k); if (!a || r.p99 < a.p99) agg.set(k, r) }
let fails = 0
for (const r of [...agg.values()].sort((a, b) => a.p99 - b.p99)) {
  const need = r.disabled ? 0 : r.large ? 3 : 4.5, bad = r.p99 < need
  if (bad) fails++
  if (bad || r.p99 < need + 0.6) console.log(`${bad ? 'FAIL' : 'tight'} ${r.vp.padEnd(7)} ${r.tier.padEnd(5)} ${r.probe.padEnd(6)} ${r.text.padEnd(28)} ${String(r.size).padStart(4)}px ${r.weight} ${r.color.padEnd(20)} p99 ${String(r.p99).padStart(5)} worst ${String(r.worst).padStart(5)}  (${r.backdrop} @ ${r.pos}${r.inner ? ', inner fill' : ''}${r.solid ? ', solid' : ''})`)
}
console.log(`${rows.length} samples, ${agg.size} text runs x tier x viewport, ${fails} below the WCAG minimum at the 1st percentile`)
process.exitCode = fails ? 1 : 0
