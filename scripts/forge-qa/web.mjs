// web-feel browser checks (HUD stability, outcome labels, Shatter hold, odds board knife, docked trays,
// phone work band and targets, landscape rails, render resolution, a 200-press fuzz) against any
// served build, including today's pre-contract Unity build.
// usage: node scripts/forge-qa/web.mjs --url http://127.0.0.1:5481/minigames/forgeOrFold/
//          [--out output/forge-qa/web] [--profiles desktop,phone,landscape,webkit-phone,reduced] [--fuzz 200]
import fs from 'node:fs'
import path from 'node:path'
import { launch, open, sleep, now, press, tap, center, hud, ensureForging, unityEvents, waitEvent, lumaPatch, writeJson, stats, URL } from './lib.mjs'
import { createRun, act } from '../../src/minigames/forge/engine.ts'

const arg = (name, d) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : d }
const url = arg('url', URL), outDir = path.resolve(arg('out', 'output/forge-qa/web')), fuzzN = +arg('fuzz', 200)
const only = arg('profiles', 'desktop,phone,landscape,webkit-phone,reduced').split(',')
const report = { url, at: new Date().toISOString(), checks: [], profiles: {} }
const check = (profile, name, pass, detail) => { report.checks.push({ profile, name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} [${profile}] ${name}${detail !== undefined ? ' ' + JSON.stringify(detail) : ''}`) }

// ---------- fixtures: real engine saves (seed 8: knife 1 is a Paring, knife 2 a Dagger) ----------
const BASE = [{ type: 'move', id: 1, to: 'furnace' }, { type: 'heat', id: 1 }, { type: 'move', id: 1, to: 'anvil' }]
function saveAfter(seed, hits, extra = []) {
  const actions = [...BASE]; for (let i = 0; i < hits; i++) actions.push({ type: 'tick', ms: 1000 }, { type: 'hit', id: 1 })
  actions.push(...extra)
  let s = createRun(seed); for (const a of actions) { const r = act(s, a); if (!r.ok) throw new Error('fixture: ' + r.event.text); s = r.state }
  return { json: JSON.stringify({ version: 2, seed, actions, ticket: null }), state: s }
}
/** Seed 8 after 8 hits: an Iron Paring +7 whose next strike shatters. */
function shatterSave() { const f = saveAfter(8, 8); let s = f.state; s = act(s, { type: 'tick', ms: 1000 }).state; const r = act(s, { type: 'hit', id: 1 }); if (r.event.outcome !== 'shatter') throw new Error('fixture drift'); return f }
/** Seed 8: the Paring forged to +2 and kept on the rack; the crate still holds the Dagger blank. */
function rackSave() { let s = createRun(8); const actions = [...BASE]; for (const a of BASE) s = act(s, a).state; while (s.knives[0].level < 2) { s = act(s, { type: 'tick', ms: 1000 }).state; const r = act(s, { type: 'hit', id: 1 }); s = r.state; actions.push({ type: 'tick', ms: 1000 }, { type: 'hit', id: 1 }) } actions.push({ type: 'move', id: 1, to: 'rack' }); return { json: JSON.stringify({ version: 2, seed: 8, actions, ticket: null }) } }
async function withSave(h, save) { await h.context.addInitScript(json => { try { localStorage.setItem('cgs-forge-run-v1', json) } catch { /* private mode */ } }, save) }
async function allEvents(h) { await h.context.addInitScript(() => { window.__forge.all = true }) }

// ---------- colour: CIEDE2000 ----------
function lab([r, g, b]) {
  const f = c => { c /= 255; return c > .04045 ? ((c + .055) / 1.055) ** 2.4 : c / 12.92 }
  const R = f(r), G = f(g), B = f(b)
  let x = (R * .4124 + G * .3576 + B * .1805) / .95047, y = R * .2126 + G * .7152 + B * .0722, z = (R * .0193 + G * .1192 + B * .9505) / 1.08883
  const t = v => v > .008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116; x = t(x); y = t(y); z = t(z)
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}
function deltaE2000(c1, c2) {
  const [L1, a1, b1] = lab(c1), [L2, a2, b2] = lab(c2), rad = Math.PI / 180
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2, G = .5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)))
  const ap1 = a1 * (1 + G), ap2 = a2 * (1 + G), Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2)
  const hp = (b, a) => { const h = Math.atan2(b, a) / rad; return h < 0 ? h + 360 : h }, hp1 = hp(b1, ap1), hp2 = hp(b2, ap2)
  const dL = L2 - L1, dC = Cp2 - Cp1; let dh = hp2 - hp1; if (Cp1 * Cp2 === 0) dh = 0; else if (dh > 180) dh -= 360; else if (dh < -180) dh += 360
  const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin(dh / 2 * rad), Lm = (L1 + L2) / 2, Cpm = (Cp1 + Cp2) / 2
  let hm = hp1 + hp2; if (Cp1 * Cp2 !== 0) hm = Math.abs(hp1 - hp2) > 180 ? (hp1 + hp2 + (hp1 + hp2 < 360 ? 360 : -360)) / 2 : (hp1 + hp2) / 2
  const T = 1 - .17 * Math.cos((hm - 30) * rad) + .24 * Math.cos(2 * hm * rad) + .32 * Math.cos((3 * hm + 6) * rad) - .2 * Math.cos((4 * hm - 63) * rad)
  const dTh = 30 * Math.exp(-(((hm - 275) / 25) ** 2)), Rc = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7)), Sl = 1 + .015 * (Lm - 50) ** 2 / Math.sqrt(20 + (Lm - 50) ** 2), Sc = 1 + .045 * Cpm, Sh = 1 + .015 * Cpm * T, Rt = -Math.sin(2 * dTh * rad) * Rc
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh))
}
const rgb = s => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number)

// ---------- page probes ----------
const anvilLabel = h => h.page.evaluate(() => { const e = window.__forge.events.filter(x => x.type === 'label' && x.spot === 'anvil').at(-1); return e ? { x: e.x, y: e.y } : null })
const presses = (h, since = 0) => h.page.evaluate(s => (window.__forgePresses || []).filter(e => e.t >= s), since)
const rect = (h, sel) => h.page.evaluate(sel => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom, right: r.right } }, sel)
/** Visible interactive targets smaller than 44 x 44 CSS px (in the game HUD and any open dialog). */
const smallTargets = h => h.page.evaluate(() => {
  const out = []
  for (const e of document.querySelectorAll('.ff-main button, .ff-main a, dialog[open] button, dialog[open] summary, .ff-main [role=button]')) {
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e)
    if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none') continue
    let hidden = false; for (let p = e.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (s.visibility === 'hidden' || s.display === 'none') { hidden = true; break } }
    if (hidden || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue
    if (r.width < 43.5 || r.height < 43.5) out.push({ el: (e.className || e.tagName).toString().slice(0, 40), label: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) })
  }
  return out
})

async function desktop(kind = 'desktop') {
  const h = await launch(kind, { out: path.join(outDir, kind) }); const r = report.profiles[kind] = {}
  try {
    await allEvents(h)
    r.open = await open(h, url, { telemetry: true }); await sleep(1200)
    check(kind, 'loads and reports a protocol', r.open.protocol >= 0, r.open)
    check(kind, 'canvas backing store at tier 0', true, (await hud(h)).canvas)
    await ensureForging(h, 12000); await sleep(600)
    // HUD stability: action buttons keep opacity 1 through a swing, and the bar's luminance barely moves.
    await h.shot('rest')
    const restBar = await rect(h, '.ff-actionbar'), vw = h.profile.viewport.width, vh = h.profile.viewport.height
    const region = [restBar.x / vw, restBar.y / vh, restBar.right / vw, restBar.bottom / vh]
    const rest = await lumaPatch(h, path.join(h.out, 'rest.png'), region)
    const t0 = await press(h, 'Space'); const samples = []
    for (const ms of [60, 140, 220, 300, 420, 560]) { while ((await now(h)) - t0 < ms) await sleep(5); samples.push(await h.page.evaluate(() => [...document.querySelectorAll('.ff-actionbar>button, .ff-knife-card, .ff-new')].map(b => +getComputedStyle(b).opacity))); if (ms === 220) await h.shot('mid-swing') }
    const mid = await lumaPatch(h, path.join(h.out, 'mid-swing.png'), region)
    check(kind, 'action buttons keep opacity 1 mid-swing', samples.flat().every(o => o === 1), { min: Math.min(...samples.flat()) })
    check(kind, 'action bar luminance change under 3% mid-swing', Math.abs(mid - rest) / rest < .03, { rest: +rest.toFixed(1), mid: +mid.toFixed(1) })
    await waitEvent(h, 'settled', t0, 3000); await sleep(200)
    // Outcome callouts: placement above the blade, inside the band, clear of the blade centre.
    let placed = null
    for (let i = 0; i < 6 && !placed; i++) { const t = await press(h, 'Space'); await waitEvent(h, 'impact', t, 3000); await sleep(60); placed = await rect(h, '.ff-callout'); await waitEvent(h, 'settled', t, 3000); await sleep(150) }
    // Roll needle: lands inside the segment of the outcome the engine resolved, sweeping in at most 250 ms.
    const needles = []
    for (let i = 0; i < 6; i++) {
      const t = await press(h, 'Space'); await waitEvent(h, 'impact', t, 3000); await sleep(40)
      needles.push(await h.page.evaluate(() => { const n = document.querySelector('.ff-roll'), c = document.querySelector('.ff-callout'); if (!n || !c) return null; const segs = [...document.querySelectorAll('.ff-chance-track>span')].map(x => [x.className.replace('ff-prob-', ''), +x.dataset.probability]); const u = +n.dataset.roll; let acc = 0, at = null; for (const [k, p] of segs) { acc += p; if (u < acc) { at = k; break } } const kind = [...c.classList].find(x => x.startsWith('ff-outcome-') && x !== 'ff-outcome')?.slice(11); return { u: +u.toFixed(3), at, kind, sweep: getComputedStyle(n).animationDuration } }))
      await waitEvent(h, 'settled', t, 3000); await sleep(150)
    }
    const nOk = needles.filter(Boolean)
    check(kind, 'roll needle lands in the segment of the resolved outcome', nOk.length >= 4 && nOk.every(n => n.at === n.kind || (n.kind === 'evolved' && ['good', 'perfect'].includes(n.at))), needles)
    check(kind, 'roll needle sweeps in at most 250 ms', nOk.every(n => parseFloat(n.sweep) * (n.sweep.endsWith('ms') ? 1 : 1000) <= 250), nOk.map(n => n.sweep))
    const label = await anvilLabel(h), info = await rect(h, '.ff-blade-info'), bottom = await rect(h, '.ff-bottom')
    if (placed && label) {
      const cy = placed.y + placed.h / 2, by = label.y / 100 * vh
      check(kind, 'outcome callout clear of the blade centre (>= 12% of the height)', Math.abs(cy - by) >= .12 * vh - 1, { calloutY: Math.round(cy), bladeY: Math.round(by) })
      check(kind, 'outcome callout inside the HUD-free band', placed.y >= info.bottom - 1 && placed.bottom <= bottom.y + 1, { top: Math.round(placed.y), bottom: Math.round(placed.bottom), band: [Math.round(info.bottom), Math.round(bottom.y)] })
    } else check(kind, 'outcome callout shown', !!placed, { placed, label })
    // Good and Chip colours differ by deltaE2000 >= 30; every outcome has its own size.
    const looks = await h.page.evaluate(() => Object.fromEntries(['good', 'perfect', 'chip', 'dull', 'shatter', 'evolved'].map(k => { const d = document.createElement('div'); d.className = `ff-callout ff-outcome ff-outcome-${k}`; d.style.visibility = 'hidden'; document.querySelector('.ff-feedback').append(d); const cs = getComputedStyle(d), out = [cs.color, cs.fontSize]; d.remove(); return [k, out] })))
    const dE = deltaE2000(rgb(looks.good[0]), rgb(looks.chip[0]))
    check(kind, 'Good vs Chip label deltaE2000 >= 30', dE >= 30, { deltaE: +dE.toFixed(1), good: looks.good, chip: looks.chip })
    check(kind, 'outcome sizes good 34 / perfect 42 / chip 34 / dull 28 / shatter 46 / evolved 40 px', ['34px', '42px', '34px', '28px', '46px', '40px'].every((px, i) => Object.values(looks)[i][1] === px), looks)
    // Trade tray: docked right, min(400px, 34vw), rows unclipped, at least 50% of the work band visible.
    await press(h, 'KeyT'); await sleep(450); await h.shot('trade-tray')
    const tray = await rect(h, 'dialog.ff-tray[open]')
    const clip = await h.page.evaluate(() => { const d = document.querySelector('dialog.ff-tray[open]'), r = d.getBoundingClientRect(); return { scroll: d.scrollHeight, client: d.clientHeight, cut: [...d.querySelectorAll('.ff-shop-grid button')].filter(b => { const q = b.getBoundingClientRect(); return q.bottom > r.bottom + .5 || q.top < r.top - .5 || q.right > r.right + .5 }).length } })
    const insetsOpen = JSON.parse(await h.page.evaluate(() => document.querySelector('[data-testid=forge-scene]').dataset.insets || '{}'))
    check(kind, 'Trade opens as a right-hand tray of min(400px, 34vw)', tray && Math.abs(tray.w - Math.min(400, .34 * vw)) <= 1 && Math.abs(tray.right - vw) <= 1 && tray.h >= vh - 1, tray)
    check(kind, 'Trade Buy rows unclipped (no scrolling needed)', clip.cut === 0 && clip.scroll <= clip.client + 1, clip)
    check(kind, 'Trade tray leaves at least 50% of the work band visible', tray && (vw - tray.w) / vw >= .5, { visible: tray && +((vw - tray.w) / vw).toFixed(2) })
    const covered = await h.page.evaluate(() => { const t = document.querySelector('dialog.ff-tray[open]').getBoundingClientRect(); return [...document.querySelectorAll('.ff-actionbar>button, .ff-blade-info, .ff-quick-tools button')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > t.left + 1 }).map(e => e.className || e.tagName) })
    check(kind, 'with the tray open the HUD re-centres beside it (nothing under the tray)', covered.length === 0, covered)
    check(kind, 'Insets report the tray (right band, panel)', insetsOpen.panel === true && Math.abs(insetsOpen.right - Math.min(400, .34 * vw)) <= 2, insetsOpen)
    await h.page.locator('dialog.ff-tray [role=tab]').nth(1).click(); await sleep(250); await h.shot('trade-sell')
    const sellCut = await h.page.evaluate(() => { const d = document.querySelector('dialog.ff-tray[open]'), r = d.getBoundingClientRect(); return [...d.querySelectorAll('.ff-sell-list button')].filter(b => { const q = b.getBoundingClientRect(); return q.bottom > r.bottom + .5 || q.right > r.right + .5 }).length })
    check(kind, 'Trade Sell rows unclipped', sellCut === 0, { cut: sellCut })
    await h.page.keyboard.press('Escape'); await sleep(300)
    // Rest tray.
    await h.page.locator('.ff-rest').click(); await sleep(350); const rest2 = await rect(h, 'dialog.ff-tray[open]'); await h.shot('rest-tray')
    check(kind, 'Rest opens as a docked tray', rest2 && Math.abs(rest2.right - vw) <= 1, rest2)
    await h.page.keyboard.press('Escape'); await sleep(300)
    r.console = h.consoleLines.filter(l => /\[(error|pageerror)\]/.test(l) && !/loading-v3\.webp/.test(l))
    check(kind, 'no console errors (loading-v3.webp is created at integration)', r.console.length === 0, r.console.slice(0, 5))
    if (kind === 'desktop') await heatingBuffer(h, kind)
    if (kind === 'desktop' && fuzzN > 0) await fuzz(h, kind, fuzzN)
  } finally { await h.close() }
}

/** 200 presses, gaps 30-900 ms, with WASD walks and Trade openings mixed in: every press is answered. */
async function fuzz(h, kind, n) {
  let seedV = 99; const rnd = () => { seedV = (seedV * 1103515245 + 12345) % 2147483648; return seedV / 2147483648 }
  await ensureForging(h, 12000); await sleep(400)
  const t0 = await now(h); const sent = []; let rests = 0
  for (let i = 0; i < n; i++) {
    if (i % 29 === 13) { await h.page.keyboard.down('KeyW'); await sleep(140); await h.page.keyboard.up('KeyW'); await sleep(200) }
    if (i % 41 === 27) { await press(h, 'KeyT'); await sleep(350); await h.page.keyboard.press('Escape'); await sleep(250) }
    // Out of blanks: rest for three fresh ones, so the run keeps forging (stop on day 7).
    const blanks = await h.page.evaluate(() => ({ crate: [...document.querySelectorAll('.ff-knife-card')].filter(b => /, (crate|furnace)$/.test(b.getAttribute('aria-label') || '')).length, anvil: [...document.querySelectorAll('.ff-knife-card')].some(b => /, anvil$/.test(b.getAttribute('aria-label') || '')), day: +(document.querySelector('.ff-stats [title=Day] b')?.firstChild?.textContent || 1) }))
    if (!blanks.crate && !blanks.anvil) { if (blanks.day >= 7) break; await sleep(1300); await h.page.locator('.ff-rest').click(); await sleep(350); await h.page.locator('dialog[open] .ff-primary').click(); await sleep(600); rests++ }
    sent.push(await press(h, 'Space', 12))
    await sleep(Math.max(0, 30 + rnd() * 870 - 12))
  }
  await sleep(2500)
  const log = await presses(h, t0), ev = await unityEvents(h, t0)
  const decisions = log.filter(e => ['strike', 'prepare', 'buffer', 'absorb', 'refuse'].includes(e.kind))
  const hits = ev.filter(e => e.type === 'hit').map(e => e.t), impacts = ev.filter(e => e.type === 'impact').map(e => e.t)
  // Each Space keydown reaches the page as Unity 'hit' and gets exactly one decision.
  let unanswered = 0; for (const t of sent) { const hm = hits.find(x => x >= t && x < t + 120); if (hm === undefined) continue; if (!decisions.some(d => d.t >= hm - 1 && d.t < hm + 40)) unanswered++ }
  const reached = sent.filter(t => hits.some(x => x >= t && x < t + 120)).length
  const tally = decisions.reduce((m, d) => (m[d.kind + (d.reason ? ':' + d.reason : '')] = (m[d.kind + (d.reason ? ':' + d.reason : '')] || 0) + 1, m), {})
  check(kind, `fuzz: every press reaching the game was answered (strike, buffer, absorb or refusal with feedback)`, unanswered === 0 && decisions.length >= reached, { presses: sent.length, reached, decisions: decisions.length, unanswered, rests, tally })
  const refusals = decisions.filter(d => d.kind === 'refuse').length, feedback = log.filter(e => e.kind === 'feedback').length
  check(kind, 'fuzz: every refusal gave feedback (key shake + dry tick)', feedback >= refusals, { refusals, feedback })
  const gaps = impacts.slice(1).map((t, i) => t - impacts[i]); const fails = log.filter(e => e.kind === 'engine-fail')
  check(kind, 'fuzz: impacts at least 350 ms apart and no engine refusals', gaps.every(g => g >= 350) && !fails.length, { impacts: impacts.length, minGap: gaps.length ? Math.round(Math.min(...gaps)) : null, fails: fails.slice(0, 3) })
  // The HUD never stays locked more than 1.2 s after an impact (unless a newer strike was sent).
  const busy = log.filter(e => e.kind === 'busy'), sentLog = log.filter(e => e.kind === 'sent').map(e => e.t)
  const lockedAt = t => { const b = busy.filter(e => e.t <= t).at(-1); return !!b?.on }
  let worst = 0; for (const ti of impacts) { const later = sentLog.find(s => s > ti); const until = Math.min(later ?? Infinity, ti + 3000); for (let t = ti; t < until; t += 25) if (lockedAt(t)) worst = Math.max(worst, t - ti) }
  check(kind, 'fuzz: HUD never locked more than 1.2 s after an impact', worst <= 1250, { worstMs: Math.round(worst) })
  // Protocol 2: every Strike the page sent got its impact or its settled, and Unity never refused one at the
  // moment it was sent (a refusal inside the SendMessage is the frame race or a page/Unity timing mismatch).
  if (report.profiles[kind].open?.protocol >= 2) {
    const sentSeqs = log.filter(e => e.kind === 'sent'), resolved = id => ev.some(e => (e.type === 'impact' || e.type === 'settled') && e.id === id)
    const atSend = sentSeqs.filter(sq => ev.some(e => e.type === 'settled' && e.x < 0 && e.id === sq.seq && Math.abs(e.t - sq.t) < 5))
    check(kind, 'fuzz: every sent strike resolved (impact or settled), none refused by Unity when sent', sentSeqs.every(sq => resolved(sq.seq)) && atSend.length === 0, { sent: sentSeqs.length, unresolved: sentSeqs.filter(sq => !resolved(sq.seq)).map(sq => sq.seq).slice(0, 5), refusedAtSend: atSend.map(sq => sq.seq).slice(0, 5) })
  }
  report.profiles[kind].fuzz = { tally, impacts: impacts.length, worstLockMs: Math.round(worst) }
}

/** One press in the last 600 ms of heating is held and fires once the blank is seated (never into an empty anvil). */
async function heatingBuffer(h, kind) {
  // Sell the anvil knife if there is one, so Space starts forging a blank.
  if ((await hud(h)).strike === 'Forge') { await h.page.locator('.ff-quick-sell').click(); await sleep(900) }
  const t0 = await press(h, 'Space'); await sleep(1550)
  await press(h, 'Space', 12)
  const seated = await waitEvent(h, 'seated', t0, 5000); await sleep(1200)
  const log = (await presses(h, t0)).filter(e => e.kind !== 'busy'), ev = await unityEvents(h, t0)
  const held = log.find(e => e.kind === 'buffer' && e.reason === 'seated'), sent = log.find(e => e.kind === 'sent' && held && e.t > held.t)
  const impact = sent && ev.find(e => e.type === 'impact' && e.t > sent.t)
  check(kind, "a press in the last 600 ms of heating is held and fires once the blank is seated", !!held && !!sent && !!impact && (!seated || sent.t >= seated.t - 1), { held: held && Math.round(held.t - t0), seated: seated && Math.round(seated.t - t0), sent: sent && Math.round(sent.t - t0), impact: impact && Math.round(impact.t - t0) })
}

async function shatterHold(kind = 'desktop') {
  const h = await launch(kind, { out: path.join(outDir, kind + '-shatter') })
  try {
    await allEvents(h); await withSave(h, shatterSave().json)
    await open(h, url, { telemetry: true }); await sleep(1500)
    const title0 = (await hud(h)).title
    const t = await press(h, 'Space'); const imp = await waitEvent(h, 'impact', t, 3000)
    if (!imp) { check(kind, 'Shatter fixture struck', false); return }
    // Poll the callout and the selected knife; one press at +300 ms (refused), none later.
    const seen = []; let pressed300 = false, fit = null
    while ((await now(h)) - imp.t < 2200) {
      const ms = (await now(h)) - imp.t
      if (!pressed300 && ms > 300) { pressed300 = true; await press(h, 'Space', 12); seen.mark = await h.page.evaluate(() => { const m = document.querySelector('.ff-refuse-mark'); if (!m) return null; const r = m.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width) } }) }
      seen.push({ ms, callout: await h.page.evaluate(() => !!document.querySelector('.ff-outcome-shatter')), text: await h.page.evaluate(() => document.querySelector('.ff-outcome-shatter')?.textContent || ''), held: await h.page.evaluate(() => !!document.querySelector('.ff-blade-info.is-held')), selected: await h.page.evaluate(() => document.querySelector('.ff-knife-card.is-selected')?.getAttribute('aria-label') || '') })
      if (Math.abs(ms - 700) < 40) { await h.shot('shatter-held'); fit = await h.page.evaluate(() => { const c = document.querySelector('.ff-outcome-shatter'); if (!c) return null; const r = c.getBoundingClientRect(), b = c.querySelector('b').getBoundingClientRect(), sp = c.querySelector('span').getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), vw: innerWidth, oneLine: Math.abs(b.top - sp.top) < b.height / 2 } }) }
      await sleep(30)
    }
    const lastCallout = seen.filter(x => x.callout).at(-1)?.ms ?? 0, firstSel = seen.find(x => x.selected)?.ms ?? null
    check(kind, "the Shatter callout fits on screen with 'Shattered' and the loss on one line", fit && fit.left >= 0 && fit.right <= fit.vw && fit.oneLine, fit)
    check(kind, 'Shatter callout lasts at least 1.5 s', lastCallout >= 1500 - 60, { lastMs: Math.round(lastCallout), text: seen.find(x => x.text)?.text, before: title0 })
    check(kind, "Shatter callout shows the lost value ('Shattered -N')", /Shattered\s*−[\d,]+/.test(seen.find(x => x.text)?.text || ''), seen.find(x => x.text)?.text)
    check(kind, 'next knife chosen no earlier than 1.2 s after impact', firstSel === null || firstSel >= 1200 - 40, { firstSelectedMs: firstSel && Math.round(firstSel) })
    const log = await presses(h, imp.t)
    check(kind, 'a press 300 ms after a Shatter is refused (hold)', log.some(e => e.kind === 'refuse' && e.reason === 'hold'), log.filter(e => e.kind !== 'busy').slice(0, 4))
    check(kind, 'the refused press is marked on the blade, not only on the key', !!seen.mark && seen.mark.y > (await rect(h, '.ff-blade-info')).bottom && seen.mark.y < (await rect(h, '.ff-bottom')).y, seen.mark)
    // A press after 600 ms ends the hold and goes on (starts the next blank).
    const h2 = await launch(kind, { out: path.join(outDir, kind + '-shatter2') })
    try {
      await allEvents(h2); await withSave(h2, shatterSave().json); await open(h2, url, { telemetry: true }); await sleep(1500)
      const t2 = await press(h2, 'Space'); const imp2 = await waitEvent(h2, 'impact', t2, 3000)
      while ((await now(h2)) - imp2.t < 700) await sleep(10)
      await press(h2, 'Space', 12); await sleep(250)
      const st = await hud(h2), l2 = await presses(h2, imp2.t)
      check(kind, 'a press after 600 ms ends the hold and goes on (next blank heats)', st.strike === 'Heating' && l2.some(e => e.kind === 'prepare') && !(await h2.page.evaluate(() => !!document.querySelector('.ff-blade-info.is-held'))), { strike: st.strike, decisions: l2.filter(e => e.kind !== 'busy').map(e => e.kind) })
    } finally { await h2.close() }
  } finally { await h.close() }
}

async function rackBoard(kind = 'desktop') {
  const h = await launch(kind, { out: path.join(outDir, kind + '-rack') })
  try {
    await withSave(h, rackSave().json); await open(h, url); await sleep(1200)
    const title = (await hud(h)).title; await h.shot('rack-dagger')
    check(kind, 'with a rack Paring +2 and a crate Dagger, the odds board shows the Dagger', /Dagger/.test(title || '') && !/Paring/.test(title || ''), { title })
  } finally { await h.close() }
}

async function phone(kind) {
  const h = await launch(kind, { out: path.join(outDir, kind) }); const r = report.profiles[kind] = {}
  const vw = h.profile.viewport.width, vh = h.profile.viewport.height, landscape = vw > vh
  try {
    await allEvents(h)
    r.open = await open(h, url, { telemetry: true }); await sleep(1500)
    const c0 = (await hud(h)).canvas
    check(kind, `backing store at tier 1 is at least ${Math.round(vw * 1.5)}x${Math.round(vh * 1.5)}`, c0.w >= Math.floor(vw * 1.5) && c0.h >= Math.floor(vh * 1.5), c0)
    await ensureForging(h, 14000); await sleep(800); await h.shot('work')
    const focus = await h.page.evaluate(() => ({ focus: document.querySelector('.ff-main').classList.contains('is-work-focus'), pad: getComputedStyle(document.querySelector('.ff-touch-controls')).visibility }))
    check(kind, 'work focus hides the d-pad', focus.focus && focus.pad === 'hidden', focus)
    const label = await anvilLabel(h), info = await rect(h, '.ff-blade-info'), bottom = await rect(h, landscape ? '.ff-actionbar' : '.ff-bottom')
    if (!landscape) {
      const band = (bottom.y - info.bottom) / vh, ly = label ? label.y / 100 * vh : null
      check(kind, 'work band at least 60% of the height', band >= .6, { band: +band.toFixed(3), from: Math.round(info.bottom), to: Math.round(bottom.y) })
      check(kind, 'odds board is one 44 px line', Math.round(info.h) === 44, { h: info.h })
      check(kind, 'knife strip is one 48 px row', Math.round((await rect(h, '.ff-knives')).h) === 48, await rect(h, '.ff-knives'))
      // Pre-contract builds send the label once from the start-up camera, so it can be stale; the page then
      // places callouts from the work view's blade line (62% of the height), which must lie in the band.
      if (r.open.protocol >= 2) check(kind, 'the anvil label lies in the work band', ly !== null && ly > info.bottom && ly < bottom.y, { labelY: ly && Math.round(ly) })
      else check(kind, 'the work-view blade line (pre-contract build: the label is stale) lies in the work band', .62 * vh > info.bottom && .62 * vh < bottom.y, { staleLabelY: ly && Math.round(ly), bladeLine: Math.round(.62 * vh) })
    } else {
      const hudBoxes = await h.page.evaluate(() => [...document.querySelectorAll('.ff-topbar, .ff-blade-info, .ff-knives, .ff-actionbar, .ff-flow, .ff-quick-tools, .ff-buyer')].map(e => { const r = e.getBoundingClientRect(); return { el: e.className.split(' ')[0], x0: r.left, y0: r.top, x1: r.right, y1: r.bottom } }).filter(b => b.x1 > b.x0))
      if (label) {
        const lx = label.x / 100 * vw, ly = label.y / 100 * vh, zone = { x0: lx - .15 * vw, x1: lx + .15 * vw, y0: ly - .15 * vh, y1: ly + .15 * vh }
        const hits = hudBoxes.filter(b => b.x0 < zone.x1 && b.x1 > zone.x0 && b.y0 < zone.y1 && b.y1 > zone.y0 && b.el !== 'ff-topbar')
        check(kind, 'no HUD element covers the anvil label or the 15% around it', hits.length === 0, { label: [Math.round(lx), Math.round(ly)], hits })
      } else check(kind, 'anvil label reported', false)
      const left = await rect(h, '.ff-blade-info'), right = await rect(h, '.ff-actionbar')
      check(kind, 'side rails at 24vw and 22vw', Math.abs(left.right - .24 * vw + 8) <= 2 && Math.abs((vw - right.x) - .22 * vw + 8) <= 2, { leftRail: Math.round(left.right), rightRail: Math.round(vw - right.x) })
    }
    const small = await smallTargets(h)
    check(kind, 'all HUD targets at least 44 x 44 px', small.length === 0, small.slice(0, 8))
    // A touch in the lower-left reveal zone brings the d-pad back and never strikes.
    const canvas = await rect(h, 'canvas'), before = (await unityEvents(h, 0, 'hit')).length
    const bands = JSON.parse(await h.page.evaluate(() => document.querySelector('[data-testid=forge-scene]').dataset.insets || '{}'))
    const zx = canvas.x + bands.left + (canvas.w - bands.left - bands.right) * .12, zy = canvas.y + canvas.h - bands.bottom - (canvas.h - bands.top - bands.bottom) * .12
    await tap(h, zx, zy); await sleep(400)
    const after = (await unityEvents(h, 0, 'hit')).length, padNow = await h.page.evaluate(() => getComputedStyle(document.querySelector('.ff-touch-controls')).visibility)
    check(kind, 'a touch in the lower-left reveals the d-pad without a strike', padNow === 'visible' && after === before, { pad: padNow, hits: after - before, at: [Math.round(zx), Math.round(zy)] })
    await h.shot('pad-back')
    // Strike from the Forge key; the action bar keeps full opacity mid-swing.
    await ensureForging(h, 8000); const c = await center(h, '.ff-strike'); const t = await tap(h, c.x, c.y); await sleep(150)
    const op = await h.page.evaluate(() => [...document.querySelectorAll('.ff-actionbar>button')].map(b => +getComputedStyle(b).opacity))
    check(kind, 'action buttons keep opacity 1 mid-swing', op.every(o => o === 1), op)
    await waitEvent(h, 'settled', t, 3000); await sleep(200)
    // Trade sheet (portrait 60vh) or rail (landscape 46vw), targets at least 44 px inside.
    await h.page.locator('.ff-trade').click(); await sleep(450); await h.shot('trade')
    const tray = await rect(h, 'dialog.ff-tray[open]')
    if (landscape) check(kind, 'Trade opens as a 46vw rail', tray && Math.abs(tray.w - .46 * vw) <= 2 && Math.abs(tray.right - vw) <= 1, tray)
    else check(kind, 'Trade opens as a 60vh bottom sheet', tray && Math.abs(tray.h - .6 * vh) <= 2 && Math.abs(tray.bottom - vh) <= 1 && Math.abs(tray.w - vw) <= 1, tray)
    const traySmall = await smallTargets(h)
    check(kind, 'Trade targets at least 44 x 44 px', traySmall.length === 0, traySmall.slice(0, 6))
    await h.page.locator('dialog[open] .ff-modal-head button').click(); await sleep(300)
    r.console = h.consoleLines.filter(l => /\[(error|pageerror)\]/.test(l) && !/loading-v3\.webp/.test(l))
    check(kind, 'no console errors', r.console.length === 0, r.console.slice(0, 5))
  } finally { await h.close() }
}

async function reduced() {
  const h = await launch('reduced', { out: path.join(outDir, 'reduced') })
  try {
    await open(h, url); await sleep(1000); await ensureForging(h, 12000); await sleep(500)
    const t = await press(h, 'Space'); await waitEvent(h, 'impact', t, 3000); await sleep(80)
    const st = await h.page.evaluate(() => { const c = document.querySelector('.ff-callout'); return c ? { anim: getComputedStyle(c).animationName, opacity: getComputedStyle(c).opacity } : null })
    check('reduced', 'callouts are static (no animation) under reduced motion', st && (st.anim === 'none' || st.anim === '') && st.opacity === '1', st)
    // A refusal under reduced motion: a short static ring on the key (no shake), gone again after the cue.
    await waitEvent(h, 'settled', t, 3000); await sleep(150)
    await h.page.locator('.ff-quick-sell').click(); await sleep(900)
    await press(h, 'Space'); await sleep(400); await press(h, 'Space', 12); await sleep(40)
    const cue = await h.page.evaluate(() => { const b = document.querySelector('.ff-strike'); return { cls: b.classList.contains('is-refused'), shadow: getComputedStyle(b).boxShadow, anim: getComputedStyle(b).animationName } })
    await sleep(400); const gone = await h.page.evaluate(() => !document.querySelector('.ff-strike').classList.contains('is-refused'))
    check('reduced', 'a refused press shows a static ring on the key, then clears', cue.cls && /255, 122, 92/.test(cue.shadow) && gone, { ...cue, gone })
    // The Motion setting reaches Unity: Off sends shake 0 and reduced true.
    await h.page.keyboard.press('KeyH'); await sleep(300)
    await h.page.locator('.ff-segmented [role=radio]', { hasText: 'Off' }).click(); await sleep(200)
    const saved = await h.page.evaluate(() => localStorage.getItem('cgs-forge-motion'))
    check('reduced', "Motion setting persists ('off')", saved === 'off', { saved })
  } finally { await h.close() }
}

fs.mkdirSync(outDir, { recursive: true })
if (only.includes('desktop')) { await desktop('desktop'); await shatterHold('desktop'); await rackBoard('desktop') }
for (const k of ['phone', 'landscape', 'webkit-phone']) if (only.includes(k)) await phone(k)
if (only.includes('phone')) await shatterHold('phone')
if (only.includes('reduced')) await reduced()
const failed = report.checks.filter(c => !c.pass)
writeJson(path.join(outDir, 'web.json'), report)
console.log(`${failed.length ? 'FAIL' : 'PASS'} web-feel: ${report.checks.length - failed.length}/${report.checks.length} checks -> ${path.join(outDir, 'web.json')}`)
process.exitCode = failed.length ? 1 : 0
