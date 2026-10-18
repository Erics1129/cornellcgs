// Rendered WCAG contrast of every text run on the menu surfaces (stage select and challenges, results, the pause dock, the restart
// confirm, the dialog header), with the mock player. For each state the text is hidden, the page captured, and the pixels under each
// text run compared with its colour (1st percentile and worst pixel), the same method as glass-contrast.mjs.
// Backdrops: the stage select shows its own key art (every chapter and guardian is visited); in game, real board frames (the stage
// jackets, a ready-frame capture of each board) are painted behind the HUD. Tiers are forced on the page root (real, lite, solid).
// WebKit captures never show backdrop-filter, so its "real" numbers are the lite look (the stricter case).
//   BASE=http://127.0.0.1:5630 node scripts/carrot-ui-qa/menus-contrast.mjs [chromium|webkit] [tiers=real,lite,solid] [vps=desktop,portrait,landscape]
// Writes output/carrot-ui-qa/menus-contrast-<engine>.json; prints every run under (or within 0.6 of) the minimum; exits 1 on a failure.
import fs from 'node:fs'
import path from 'node:path'
import { launch, open, enter, fixture, seed, outDir } from './lib.mjs'
const RT = '/Users/eric/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'
const pngjs = await import(RT + '/pngjs/lib/png.js'); const PNG = pngjs.PNG || pngjs.default.PNG
const BASE = process.env.BASE || 'http://127.0.0.1:5630'
const [engine = 'chromium', tierArg = 'real,lite,solid', vpArg = 'desktop,portrait,landscape'] = process.argv.slice(2)
const boards = (process.env.BOARDS || '01,05,10,16,24,29').split(',')
const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
const L = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
const ROOTS = '.ct-select, .ct-results, .ct-pause, .ct-confirm .ct-dialog__inner, .ct-dialog__head'
const rows = []
const browser = await launch(engine)
const wait = ms => new Promise(r => setTimeout(r, ms))

async function measure(page, vp, tier, state, backdrop) {
  await page.evaluate(t => { const p = document.querySelector('.ct-page'); if (p) p.dataset.glass = t }, tier)
  await wait(120)
  const boxes = await page.evaluate(roots => {
    const res = []
    for (const root of document.querySelectorAll(roots)) {
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (!n.textContent.trim()) continue
        const el = n.parentElement, cs = getComputedStyle(el)
        if (cs.visibility === 'hidden' || el.closest('.ct-sr')) continue
        let hidden = false; for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || Number(s.opacity) < .05) { hidden = true; break } } if (hidden) continue
        const r = document.createRange(); r.selectNodeContents(n); const rc = r.getBoundingClientRect()
        // text clipped by a scroller (the list, the results body) is measured only where it is on screen
        let clip = { top: 0, bottom: innerHeight, left: 0, right: innerWidth }
        for (let e = el; e && !e.matches('.ct-page'); e = e.parentElement) { const s = getComputedStyle(e); if (/(auto|scroll|hidden)/.test(s.overflowY + s.overflowX)) { const b = e.getBoundingClientRect(); clip = { top: Math.max(clip.top, b.top), bottom: Math.min(clip.bottom, b.bottom), left: Math.max(clip.left, b.left), right: Math.min(clip.right, b.right) } } }
        const x = Math.max(rc.x, clip.left), y = Math.max(rc.y, clip.top + 16), x2 = Math.min(rc.right, clip.right), y2 = Math.min(rc.bottom, clip.bottom - 16)
        if (x2 - x < 2 || y2 - y < 4) continue
        const solid = !!el.closest('.ct-band, .gl-tag, .ct-tag.is-best, .gl-jelly, .ct-cta, .ct-trackrow__new')
        res.push({ text: n.textContent.trim().slice(0, 30), cls: String(el.className || el.tagName).slice(0, 34), color: cs.color, size: parseFloat(cs.fontSize), weight: +cs.fontWeight, x, y, w: x2 - x, h: y2 - y, solid, disabled: !!el.closest('button:disabled') })
      }
    }
    return res
  }, ROOTS)
  const hide = await page.addStyleTag({ content: `:is(${ROOTS}), :is(${ROOTS}) * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; } :is(${ROOTS}) svg { visibility: hidden !important }` })
  await wait(120)
  const png = PNG.sync.read(await page.screenshot({ animations: 'disabled', scale: 'css' }))
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
    rows.push({ engine, vp, tier, state, backdrop, text: bx.text, cls: bx.cls, size: bx.size, weight: bx.weight, color: bx.color, solid: bx.solid, disabled: bx.disabled, large, worst: +cr(worst).toFixed(2), p99: +cr(p99).toFixed(2) })
  }
}
const tiers = tierArg.split(',')
const all = async (page, vp, state, backdrop) => { for (const t of tiers) await measure(page, vp, t, state, backdrop) }
const board = (page, id) => page.evaluate(id => { let s = document.getElementById('__qa_board'); if (!s) { s = document.createElement('style'); s.id = '__qa_board'; document.head.append(s) } s.textContent = `.ct-scene{background:#203018 url(/assets/minigames/carrot/jackets/${id}.webp) center/cover}.ct-scene canvas{opacity:0}` }, id)
const scene = (page, level, patch) => page.evaluate(({ level, patch }) => { const qa = window.__qa; const s = qa.base(level, { v: 2, caps: [], waveElapsed: 0, incoming: [], judgement: { seq: 0, kind: '', wave: 0, value: 0 }, carrotX: .62, carrotY: .42, spawnPoints: [] }); s.runId = Math.floor(Math.random() * 1e6); Object.assign(s, patch); qa.set(s) }, { level, patch })

for (const vp of vpArg.split(',')) {
  console.log(engine, vp)
  const challenges = { 'cgs-carrot-challenges-v1': JSON.stringify({ version: 3, best: { tornado: { cleared: true, health: 10, seconds: 200, towers: 8 } } }) }
  { // ---- stage select and challenges: their own key art
    const { context, page } = await open(browser, { viewport: vp, storage: seed(14, challenges), base: BASE })
    await page.waitForSelector('.ct-lobby .ct-cta--hero:not([disabled])'); await wait(600)
    await page.click('.ct-lobby .ct-ghost >> text=Stage select'); await wait(1400)
    for (const [ch, ids] of [[1, [4, 1]], [2, [5]], [3, [9]], [4, [14, 16, 20]], [5, [25, 26, 27, 28, 29]]]) {
      await page.click(`.ct-chapter:nth-child(${ch})`); await wait(500)
      for (const id of ids) { if (!await page.$(`.ct-trackrow.is-focus[data-id="${id}"]`)) await page.click(`.ct-trackrow[data-id="${id}"]`); await wait(1100); await all(page, vp, `select-ch${ch}-${id}`, 'key art') }
    }
    await page.keyboard.press('Escape'); await wait(300)
    await page.click('.ct-lobby [aria-label="Settings"]'); await wait(700); await all(page, vp, 'dialog-head', 'lobby art')
    await context.close()
  }
  { // ---- in game: pause, confirm, results over real board frames
    const { context, page } = await open(browser, { viewport: vp, storage: seed(8), base: BASE })
    await enter(page); await wait(300)
    for (const id of boards) {
      await board(page, id)
      await fixture(page, 'waveAir'); await page.evaluate(() => window.__qa.patch({ paused: true })); await wait(700); await all(page, vp, 'pause', 'board ' + id)
      await page.click('.ct-pause [aria-label="Restart stage"]'); await page.waitForSelector('.ct-confirm'); await wait(600); await all(page, vp, 'confirm', 'board ' + id)
      await page.click('.ct-confirm >> text=Keep playing'); await wait(300)
      await page.evaluate(() => window.__qa.patch({ paused: false }))
      for (const [name, level, patch] of [['won', 0, null], ['lost', 0, null], ['challenge-won', 25, { phase: 'won', wave: 6, elapsed: 230, coins: 400, health: 10, progress: 1, stats: { kills: 80, leaks: 0, earned: 900, streak: 6, bestStreak: 6, perfectWaves: 6, waveLeaks: [0, 0, 0, 0, 0, 0], leakKinds: [], leakCounts: [], dmgKinds: ['mortar', 'thunder', 'seed'], dmgValues: [9000, 7000, 3000] } }], ['challenge-lost', 27, { phase: 'lost', wave: 4, elapsed: 300, coins: 120, health: 0, progress: .6, lossCauses: [{ kind: 'boss', route: 0, wave: 4, count: 1, airUncovered: false, counter: 'mortar' }] }]]) {
        await fixture(page, 'ready'); await wait(150)
        if (level) await scene(page, level, patch); else await fixture(page, name)
        await page.waitForSelector('.ct-results', { timeout: 5000 }); await wait(2600)
        await all(page, vp, 'results-' + name, 'board ' + id)
      }
    }
    await context.close()
  }
}
await browser.close()
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, `menus-contrast-${engine}.json`), JSON.stringify(rows, null, 1))
const key = r => `${r.vp} ${r.tier} ${r.state.replace(/-\d+$/, '')} ${r.cls} ${r.text}`
const agg = new Map()
for (const r of rows) { const k = key(r); const a = agg.get(k); if (!a || r.p99 < a.p99) agg.set(k, r) }
let fails = 0
for (const r of [...agg.values()].sort((a, b) => a.p99 - b.p99)) {
  const need = r.disabled ? 0 : r.large ? 3 : 4.5, bad = r.p99 < need
  if (bad) fails++
  if (bad || r.p99 < need + 0.6) console.log(`${bad ? 'FAIL' : 'tight'} ${r.vp.padEnd(9)} ${r.tier.padEnd(5)} ${r.state.padEnd(20)} ${r.text.padEnd(30)} ${String(r.size).padStart(5)}px ${r.weight} ${r.color.padEnd(20)} p99 ${String(r.p99).padStart(5)} worst ${String(r.worst).padStart(5)}  (${r.cls}, ${r.backdrop}${r.solid ? ', solid' : ''})`)
}
console.log(`${rows.length} samples, ${agg.size} text runs x tier x viewport, ${fails} below the WCAG minimum at the 1st percentile`)
process.exitCode = fails ? 1 : 0
