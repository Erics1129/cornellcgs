// Ready-frame captures for a list of levels: the canvas with the HUD hidden, mean relative luminance (WCAG), and, on a QA
// build, the telemetry dump (route/ground screen samples for the path contrast ratio, visible idle FX renderers).
// usage: node scripts/carrot-qa/capture.mjs --tag before --levels 1,5,6,8,14 [--engine chromium] [--quality high|medium|low] [--phone] [--combat 8]
import * as H from './lib.mjs'
import fs from 'node:fs'
import path from 'node:path'
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d }
const levels = arg('levels', '1,2,5,6,8,9,13,14,16,17,18,20,21,24,25,26,27,28,29').split(',').map(Number)
const tag = arg('tag', 'capture'), engine = arg('engine', 'chromium'), quality = arg('quality', ''), combat = Number(arg('combat', 0))
const ctx = await H.open({ engine, tag, phone: process.argv.includes('--phone'), landscape: process.argv.includes('--landscape'), reducedMotion: process.argv.includes('--reduced') })
const { page } = ctx
const rows = []
try {
  const t = await H.enter(ctx); console.log('entered', JSON.stringify(t))
  if (quality) { await H.message(page, 'Quality', quality); await H.sleep(500) }
  for (const id of levels) {
    await H.loadLevel(ctx, id, 2600)
    await H.hideHud(page, true); await H.sleep(250)
    const file = await H.shot(ctx, `L${String(id).padStart(2, '0')}-ready`, { canvas: true })
    const L = H.luminance(file)
    await H.message(page, 'QaDump', 'routes'); await H.sleep(300)
    const dump = (await H.logs(page, /CARROT_QA_DUMP/)).filter(l => l.includes(`level=${id} `)).pop() || ''
    let pathRatio = null, fxIdle = null
    const m = /route=([0-9.,;-]+)/.exec(dump), g = /ground=([0-9.,;-]+)/.exec(dump), f = /fxIdleVisible=(\d+)/.exec(dump)
    if (m && g) { const pts = s => s.split(';').filter(Boolean).map(p => p.split(',').map(Number)).map(([x, y]) => [x * L.w, (1 - y) * L.h]).filter(([x, y]) => x > 4 && y > 4 && x < L.w - 4 && y < L.h - 4); const a = H.meanIn(L, pts(m[1]), 2), b = H.meanIn(L, pts(g[1]), 2); pathRatio = Math.max(a, b) > 0 ? (Math.max(a, b) + .05) / (Math.min(a, b) + .05) : null }
    if (f) fxIdle = Number(f[1])
    const row = { level: id, mean: +L.mean.toFixed(4), pathRatio: pathRatio && +pathRatio.toFixed(2), fxIdle }
    if (combat > 0) { await H.hideHud(page, false); const r = await H.playBot(ctx, id, { speed: 2, maxMinutes: combat / 60, until: s => s.wave >= 3 }); await H.hideHud(page, true); await H.shot(ctx, `L${String(id).padStart(2, '0')}-combat`, { canvas: true }); row.combat = r.phase + ' w' + r.wave }
    await H.hideHud(page, false)
    rows.push(row); console.log(JSON.stringify(row))
  }
  const errors = ctx.net.console.filter(c => c[1] === 'error' || c[1] === 'pageerror')
  H.save(ctx, 'capture.json', { tag, engine, quality, rows, errors: errors.slice(0, 50), tier: await H.logs(page, /CarrotQuality tier/) })
  console.log('errors', errors.length)
} catch (e) { console.log('ERROR', e.stack); H.save(ctx, 'capture.json', { tag, rows, error: String(e), console: ctx.net.console.slice(-80) }) }
finally { await ctx.browser.close() }
