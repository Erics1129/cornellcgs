// Integration contact sheets from the real Web player (a served build, no fixtures): heating at .6 / 1.1 / 1.6 s after
// Start, seating, the contact frames (-1, 0, +1, +3) of a strike, Perfect, Chip and Shatter (+0 / +100 / +500 ms and
// later), a sale, and a six-direction look-around. Outcomes come from real play, so the run strikes until it has seen a
// Perfect, a Chip and a Shatter (or runs out of strikes) and says which it got.
// usage: node scripts/forge-qa/sheets.mjs --url http://127.0.0.1:4173/minigames/forgeOrFold/ --out <dir>
//          [--profile desktop|phone|landscape|webkit-phone|reduced] [--max 70]
import fs from 'node:fs'
import path from 'node:path'
import { launch, open, now, sleep, press, hud, ensureForging, forgeButton, unityEvents, waitEvent, screencast, contactSheet, writeJson, URL } from './lib.mjs'

const arg = (name, d) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : d }
const url = arg('url', URL), kind = arg('profile', 'desktop'), outDir = path.resolve(arg('out', 'output/forge-qa/sheets/' + kind)), maxStrikes = +arg('max', 70)
fs.mkdirSync(outDir, { recursive: true })
let h = await launch(kind, { out: outDir })
/** A fresh browser context is a fresh run with three new blanks (one run can run out of blanks before a Perfect). */
async function newSession() { await h.close(); h = await launch(kind, { out: outDir }); await open(h, url); await sleep(1200); report.sessions = (report.sessions || 1) + 1 }
const report = { url, profile: kind, at: new Date().toISOString(), outcomes: [], picks: {} }
const touch = !!h.profile.touch
// CDP screencasts deliver their first frames 350-600 ms late; film only after they are flowing.
const WARM = 700
const nearest = (frames, t) => frames.reduce((b, f) => (Math.abs(f.t - t) < Math.abs(b.t - t) ? f : b), frames[0])
const copyAs = (f, name) => { const dst = path.join(outDir, name + path.extname(f.file)); fs.copyFileSync(f.file, dst); return dst }
const act = () => (touch ? forgeButton(h) : press(h, 'Space'))
const sheet = async (name, items, cols = 4) => { const ok = items.filter(Boolean); if (!ok.length) return null; const file = path.join(outDir, name + '.png'); await contactSheet(h, ok.map(i => i.file), file, { cols, width: touch && h.profile.viewport.height > h.profile.viewport.width ? 240 : 480, labels: ok.map(i => i.label) }); report.picks[name] = ok.map(i => i.label); return file }
const outcomeOf = text => { const t = (text || '').toLowerCase(); return /shatter/.test(t) ? 'shatter' : /perfect/.test(t) ? 'perfect' : /chip/.test(t) ? 'chip' : /evolv/.test(t) ? 'evolved' : /dull/.test(t) ? 'dull' : /good/.test(t) ? 'good' : /guard/.test(t) ? 'guarded' : 'other' }

try {
  report.open = await open(h, url)
  await sleep(1500)
  await h.shot('ready')
  // 1. Heating and seating, filmed from the Start press.
  let t0, heatEv, seatedEv
  const heat = await screencast(h, 'cast-heat', async () => { await sleep(WARM); t0 = await act(); heatEv = await waitEvent(h, 'seated', t0, 6000); await sleep(500) }, { quality: 85 })
  seatedEv = (await unityEvents(h, t0, 'seated'))[0]
  const heating = [600, 1100, 1600].map(ms => ({ ...nearest(heat.frames, t0 + ms), label: `+${ms} ms after Start` }))
  const seatF = seatedEv ? { ...nearest(heat.frames, seatedEv.t + 60), label: `seated (+${Math.round(seatedEv.t - t0)} ms)` } : null
  heating.forEach((f, i) => copyAs(f, ['heat-0.6', 'heat-1.1', 'heat-1.6'][i])); if (seatF) copyAs(seatF, 'seated')
  report.heat = { seatedAfterStartMs: seatedEv ? Math.round(seatedEv.t - t0) : null, frames: heat.frames.length }
  await sheet('sheet-heating', [...heating, seatF])
  await ensureForging(h)
  // 2. Strikes: film each one; keep the contact frames of the first, and the first Perfect / Chip / Shatter / evolution.
  const want = new Set(['perfect', 'chip', 'shatter']); const got = {}
  let sold = false, onBlade = 0
  for (let i = 0; i < maxStrikes && (want.size || !sold); i++) {
    if (!(await ensureForging(h, 12000))) { await sleep(800); if (!(await ensureForging(h, 12000))) { if ((report.sessions || 1) >= 4) break; await newSession(); if (!(await ensureForging(h, 12000))) break } onBlade = 0 }
    if (!sold && onBlade >= 5) {
      // The sale: Sell on the HUD, filmed while the view glances at the scale and the coins land.
      const c = await h.page.locator('.ff-quick-sell').boundingBox()
      if (c) {
        let ts
        const cast = await screencast(h, 'cast-sell', async () => { await sleep(WARM); ts = await now(h); if (touch) await h.page.touchscreen.tap(c.x + c.width / 2, c.y + c.height / 2); else await h.page.mouse.click(c.x + c.width / 2, c.y + c.height / 2); await sleep(2600) }, { quality: 85 })
        const picks = [150, 400, 800, 1300, 2000].map(ms => ({ ...nearest(cast.frames, ts + ms), label: `sell +${ms} ms` }))
        picks.forEach(p => copyAs(p, 'sell-' + p.label.split('+')[1].replace(' ms', '')))
        await sheet('sheet-sell', picks, 5); sold = true; onBlade = 0; continue
      }
    }
    let tp
    let text = ''
    const cast = await screencast(h, 'cast-strike-' + i, async () => { await sleep(WARM); tp = await act(); const im = await waitEvent(h, 'impact', tp, 4000); if (im) { await sleep(120); text = (await hud(h)).feedback || '' } const s = await waitEvent(h, 'settled', tp, 4000); await sleep(s ? 650 : 200) }, { quality: 85 })
    const imp = (await unityEvents(h, tp, 'impact'))[0]
    const outcome = outcomeOf(text); report.outcomes.push({ i, outcome, text: text.replace(/\s+/g, ' ').slice(0, 40), impactMs: imp ? Math.round(imp.t - tp) : null })
    onBlade++
    if (outcome === 'shatter') onBlade = 0
    if (!imp) { fs.rmSync(cast.dir, { recursive: true, force: true }); continue }
    const after = cast.frames.filter(f => f.t > imp.t), before = cast.frames.filter(f => f.t <= imp.t)
    const keep = (got.contact == null) || (want.has(outcome) && !got[outcome]) || (outcome === 'evolved' && !got.evolved)
    if (keep) {
      if (got.contact == null && before.length && after.length > 3) {
        got.contact = true
        // Frames around the impact message, labelled by their offset from it (the contact pose is composited a frame or
        // two after the message); pick -1 / 0 / +1 by eye from this strip.
        const strip = [...before.slice(-3), ...after.slice(0, 5)]
        const c = strip.map(f => ({ ...f, label: `${outcome} ${f.t - imp.t >= 0 ? '+' : ''}${(f.t - imp.t).toFixed(1)} ms` }))
        c.forEach((f, k) => copyAs(f, 'contact-strip-' + k))
        report.contactStrip = c.map(f => f.label)
        await sheet('sheet-contact', c, 4)
      }
      if (want.has(outcome) || outcome === 'evolved') {
        got[outcome] = true; want.delete(outcome)
        const ms = outcome === 'shatter' ? [0, 100, 500, 1000] : [0, 33, 100, 400]
        const picks = ms.map(m => ({ ...nearest(after, imp.t + m), label: `${outcome} +${m} ms` }))
        picks.forEach(p => copyAs(p, `${outcome}-${p.label.split('+')[1].replace(' ms', '')}`))
        await sheet('sheet-' + outcome, picks)
        if (outcome === 'shatter') { await sleep(400); await h.shot('shatter-hold') }
      }
    }
    if (!keep) fs.rmSync(cast.dir, { recursive: true, force: true })
    await sleep(250)
  }
  report.got = got
  // 3. Look-around: drag the view (mouse or touch) through six directions from the work stance.
  await ensureForging(h).catch(() => {})
  const vp = h.profile.viewport, cx = vp.width / 2, cy = vp.height * .45
  const drag = async (dx, dy) => {
    if (touch) {
      const c = await h.context.newCDPSession(h.page).catch(() => null)
      if (c) { await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] }); for (let k = 1; k <= 12; k++) { await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + dx * k / 12, y: cy + dy * k / 12 }] }); await sleep(16) } await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); return }
    }
    await h.page.mouse.move(cx, cy); await h.page.mouse.down(); for (let k = 1; k <= 12; k++) { await h.page.mouse.move(cx + dx * k / 12, cy + dy * k / 12); await sleep(16) } await h.page.mouse.up()
  }
  const looks = []
  const W = vp.width
  for (const [name, dx, dy] of [['look-work', 0, 0], ['look-right', -W * .35, 0], ['look-back', -W * .35, 0], ['look-left', -W * .35, 0], ['look-up', 0, vp.height * .35], ['look-down', 0, -vp.height * .7]]) {
    if (dx || dy) await drag(dx, dy); await sleep(700); looks.push({ file: await h.shot(name), label: name })
  }
  await sheet('sheet-look', looks, 3)
  report.console = h.consoleLines.filter(l => /\[error\]|pageerror/i.test(l)).slice(0, 20)
} catch (e) { report.error = String(e.stack || e).slice(0, 1500); await h.shot('error').catch(() => {}) }
finally { await h.close() }
writeJson(path.join(outDir, 'sheets.json'), report)
console.log(JSON.stringify({ profile: kind, got: report.got, outcomes: report.outcomes.map(o => o.outcome).join(','), heat: report.heat, error: report.error?.slice(0, 300) }))
