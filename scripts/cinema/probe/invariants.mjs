// INVARIANTS for the cinema build (SPEC section 8 plus the critique's additions), scroll-core's part.
// usage: node invariants.mjs <url> <outdir> [desktop|phone|touch] [--reduced] [--off] [--quick]
//   desktop = Chromium 1440x900 with GPU; touch = Chromium with iPhone 13 metrics; phone = WebKit iPhone 13.
//   --off sets window.__filmOff (no deck, no reveals, no scenes): every text must still be visible.
// "At rest" = 600 ms after the page stopped moving. Needs a dev build (window.__film, window.__gsap).
// Exit code 1 when any invariant fails. Film's and interaction's invariants (looks, tiers, touch) are theirs to add.
import fs from 'node:fs'
import { open, auditFn, save } from './lib.mjs'
const args = process.argv.slice(2)
const [url, out, kind = 'desktop'] = args.filter(a => !a.startsWith('--'))
const flag = n => args.includes('--' + n)
fs.mkdirSync(out, { recursive: true })
const reducedMode = flag('reduced'), off = flag('off'), quick = flag('quick')
const { browser, page, errors } = await open(kind, url, { reduced: reducedMode, init: off ? 'window.__filmOff = true' : undefined })
const R = {}; const ran = []
const check = (name, fails) => { ran.push(name); if (fails.length) R[name] = fails }
const rest = async (ms = 600) => {
  // wait until the deck says the page stopped, then the settle time
  await page.waitForTimeout(60)
  for (let i = 0; i < 80; i++) { const moving = await page.evaluate(() => document.documentElement.dataset.scroll && document.documentElement.dataset.scroll !== 'rest'); if (!moving) break; await page.waitForTimeout(50) }
  await page.waitForTimeout(ms)
}
const tele = async y => { await page.evaluate(v => window.scrollTo({ top: v, behavior: 'instant' }), y); await rest() }
const film = () => page.evaluate(() => { const s = window.__film?.state?.(); return s ? { frame: s.frame, chapters: s.chapters, reveals: s.reveals, scenes: s.scenes, refreshCount: s.refreshCount } : null })
const geo = () => page.evaluate(() => ({ vh: innerHeight, vw: innerWidth, max: document.documentElement.scrollHeight - innerHeight,
  ch: [...document.querySelectorAll('main > section, footer#contact')].map(s => { const r = s.getBoundingClientRect(); return { id: s.id, top: r.top + scrollY, h: r.height } }) }))
let g = await geo()
const stopsOf = g => { const st = []; for (const c of g.ch) { const run = Math.max(0, c.h - g.vh); st.push({ id: c.id, why: 'boundary -5%', y: c.top - g.vh * 0.05 }, { id: c.id, why: 'boundary +5%', y: c.top + g.vh * 0.05 }); for (const f of [0.1, 0.5, 0.9]) st.push({ id: c.id, why: `at ${f}`, y: c.top + run * f }) } return st.map(s => ({ ...s, y: Math.round(Math.max(0, Math.min(g.max, s.y))) })) }
let stops = stopsOf(g)
if (quick) stops = stops.filter((_, i) => i % 3 === 0)

// ---- 2, 4: structure
{
  const bad = await page.evaluate(() => { const out = []; const roots = [...document.querySelectorAll('main > section, footer#contact')]
    for (const s of roots) { const c = getComputedStyle(s); for (const k of ['clipPath', 'transform', 'translate', 'scale', 'rotate']) if (c[k] && c[k] !== 'none') out.push(`${s.id}: ${k} ${c[k]}`); if (c.opacity !== '1') out.push(`${s.id}: opacity ${c.opacity}`) }
    if (document.querySelector('.pin-spacer')) out.push('a .pin-spacer exists'); if (document.querySelector('svg.tx-edges')) out.push('svg.tx-edges exists')
    for (let i = 0; i + 1 < roots.length; i++) { const a = roots[i].getBoundingClientRect(), b = roots[i + 1].getBoundingClientRect(); if (Math.abs(a.bottom - b.top) > 1) out.push(`${roots[i].id} and ${roots[i + 1].id} do not abut (${(b.top - a.bottom).toFixed(1)} px)`) }
    return out })
  check('I2/I4 chapter roots are never clipped, moved or faded; no pin spacers; chapters abut', bad)
}

// ---- 5, 6, 9, 10: every stop, by teleport, at rest
const teleRows = []
{
  const low = [], none = [], half = [], unshown = [], roots = [], poster = []
  const order = stops.map((_, i) => i).sort((a, b) => ((a * 7919) % stops.length) - ((b * 7919) % stops.length))
  for (const i of order) {
    const s = stops[i]; await tele(s.y)
    const a = await page.evaluate(auditFn); const f = await film()
    teleRows[i] = { y: s.y, f }
    const tag = `${s.id} ${s.why} (y=${s.y})`
    for (const c of a.chapters) for (const t of c.texts) if (t.score < 0.9 && t.inside > 0 && !(c.id === 'universe' || (c.id === 'people' && t.tag === 'BUTTON'))) low.push(`${tag}: ${c.id} ${t.tag} "${t.txt}" ${t.score}`)
    const own = a.chapters.find(c => c.vis >= 0.6)
    if (own && own.id !== 'universe' && !own.texts.some(t => t.score >= 0.9)) none.push(`${tag}: ${own.id}`)
    if (f) { const h = f.reveals.filter(r => r.progress > 0.001 && r.progress < 0.999 && !/typing/.test(r.id)); if (h.length) half.push(`${tag}: ${h.map(r => r.id).join(',')}`)
      const u = f.reveals.filter(r => r.inView && r.progress < 0.999); if (u.length) unshown.push(`${tag}: ${u.map(r => r.id).join(',')}`) }
    const st = await page.evaluate(() => { const out = []; for (const s of document.querySelectorAll('main > section, footer#contact')) { if (s.style.clipPath || s.style.transform || s.style.opacity) out.push(s.id) }
      const hosts = [...document.querySelectorAll('[data-scene-host]')].filter(h => { const r = h.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0 })
      return { out, hosts: hosts.map(h => { const p = h.querySelector('[data-poster]'); return { cls: h.className.toString().slice(0, 24), state: h.dataset.sceneState, poster: !!p && p.getBoundingClientRect().height > 0 } }) } })
    if (st.out.length) roots.push(`${tag}: inline clip/transform/opacity on ${st.out.join(',')}`)
    for (const h of st.hosts) if (h.state !== 'live' && !h.poster) poster.push(`${tag}: ${h.cls} is ${h.state} with no poster box`)
  }
  check('I5 at rest every text in view is legible (marked phases excepted; universe and the people flip button belong to film)', low)
  check('I6 at rest the chapter filling the screen shows legible text of its own', none)
  if (!off && !reducedMode) check('I9 at rest every reveal is at 0 or 1, and every reveal in view is at 1', [...half.map(x => 'half: ' + x), ...unshown.map(x => 'not shown: ' + x)])
  check('I2 no inline clip, transform or opacity on a chapter root at any stop', roots)
  check('I10 a scene in view is live or has its poster box', poster)
}

// ---- 8: path independence (slow walk vs teleport), by the deck's own numbers
if (!off && !reducedMode) {
  const diff = []
  await tele(0)
  const sorted = stops.map((s, i) => ({ ...s, i })).sort((a, b) => a.y - b.y)
  for (const s of sorted) {
    const from = await page.evaluate(() => scrollY); const steps = Math.max(1, Math.ceil(Math.abs(s.y - from) / 120))
    for (let k = 1; k <= steps; k++) { await page.evaluate(v => window.scrollTo({ top: v, behavior: 'instant' }), from + (s.y - from) * k / steps); await page.waitForTimeout(16) }
    await rest()
    const f = await film(); const t = teleRows[s.i]?.f; if (!f || !t) continue
    for (const c of f.chapters) { const o = t.chapters.find(x => x.id === c.id); if (o && (c.inView || o.inView) && Math.abs(c.vrun - o.vrun) > 0.001) diff.push(`${s.id} ${s.why}: ${c.id} vrun slow ${c.vrun.toFixed(4)} teleport ${o.vrun.toFixed(4)}`) }
    const a = new Map(f.reveals.map(r => [r.id, r.progress])); for (const r of t.reveals) if (a.has(r.id) && Math.abs(a.get(r.id) - r.progress) > 0.1 && !/typing/.test(r.id)) diff.push(`${s.id} ${s.why}: reveal ${r.id} slow ${a.get(r.id)} teleport ${r.progress}`)
  }
  check('I8 the state at rest is the same whether a stop was reached by slow scrolling or by a teleport', diff)
}

// ---- 3: nothing widens the page
{
  const bad = []
  await page.keyboard.press('End'); await rest(300); await page.keyboard.press('Home'); await rest(300)
  if (kind === 'desktop') { await page.mouse.move(700, 450); for (let k = 0; k < 3; k++) { for (let j = 0; j < 8; j++) await page.mouse.wheel(0, 900); await page.waitForTimeout(400) } for (let k = 0; k < 3; k++) { for (let j = 0; j < 8; j++) await page.mouse.wheel(0, -900); await page.waitForTimeout(400) } await rest(200) }
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  if (w[0] !== w[1]) bad.push(`scrollWidth ${w[0]} clientWidth ${w[1]}`)
  const x = await page.evaluate(async () => { window.scrollTo(200, 4000); await new Promise(r => setTimeout(r, 200)); return scrollX })
  if (x !== 0) bad.push(`scrollX ${x} after scrollTo(200, y)`)
  check('I3 nothing can widen or shift the page sideways', bad)
}

// ---- desktop input: flings, keys during a glide, jumps
if (kind === 'desktop' && !off && !reducedMode) {
  const bad = []
  // a hard fling comes to rest within 1.6 s of the last wheel event, and the frame it rests on is finished
  await tele(2000); await page.mouse.move(700, 450)
  for (let j = 0; j < 6; j++) await page.mouse.wheel(0, 900)
  const t0 = Date.now(); let restedAt = 0
  for (let i = 0; i < 80; i++) { await page.waitForTimeout(25); if (await page.evaluate(() => document.documentElement.dataset.scroll === 'rest')) { restedAt = Date.now() - t0; break } }
  if (!restedAt || restedAt > 1600) bad.push(`wheel fling took ${restedAt || '>2000'} ms to rest`)
  await page.waitForTimeout(600)
  const f = await film(); const h = f.reveals.filter(r => r.inView && r.progress < 0.999); if (h.length) bad.push(`after a fling reveals in view are unfinished: ${h.map(r => r.id).join(',')}`)
  // End pressed 100 ms after a wheel fling ends at the bottom and stays there
  await tele(3000); for (let j = 0; j < 5; j++) await page.mouse.wheel(0, 900)
  await page.waitForTimeout(100); await page.keyboard.press('End'); await page.waitForTimeout(1500)
  const end = await page.evaluate(() => [Math.round(scrollY), document.documentElement.scrollHeight - innerHeight])
  if (Math.abs(end[0] - end[1]) > 2) bad.push(`End during a glide rests at ${end[0]}, bottom is ${end[1]}`)
  await page.keyboard.press('Home'); await page.waitForTimeout(900)
  const home = await page.evaluate(() => Math.round(scrollY)); if (home > 2) bad.push(`Home rests at ${home}`)
  check('Input: a fling rests within 1.6 s on a finished frame; End and Home during a glide are honoured', bad)

  // far jump: at rest within 900 ms, within 2 px of the chapter top
  const jb = []
  for (const id of ['world', 'top', 'people', 'what-we-do']) {
    const top = await page.evaluate(i => Math.round(document.getElementById(i).getBoundingClientRect().top + scrollY), id)
    const t1 = Date.now()
    await page.evaluate(label => { const a = [...document.querySelectorAll('footer#contact a, footer#contact button')].find(e => e.textContent.trim() === label); if (!a) throw new Error('no footer control ' + label); a.click() }, { world: 'World', people: 'Our team', 'what-we-do': 'What we do', top: 'Deal again' }[id])
    let ok = 0
    for (let i = 0; i < 60; i++) { await page.waitForTimeout(30); const s = await page.evaluate(() => [Math.round(scrollY), document.documentElement.dataset.scroll, document.getElementById('deck-dip') ? +getComputedStyle(document.getElementById('deck-dip')).opacity : 0]); if (Math.abs(s[0] - top) <= 2 && s[1] === 'rest' && s[2] < 0.05) { ok = Date.now() - t1; break } }
    if (!ok) { const y = await page.evaluate(() => Math.round(scrollY)); jb.push(`jump to ${id}: at ${y}, want ${top}, not at rest within 1.8 s`) } else if (ok > 900) jb.push(`jump to ${id} took ${ok} ms`)
    await page.waitForTimeout(400)
  }
  check('I16 a far jump is a cut: at rest within 900 ms, within 2 px of the chapter top', jb)
}

// ---- 14 + remeasure: refreshes, and the cached geometry follows the layout
if (!off) {
  const bad = []
  const before = (await film())?.refreshCount ?? 0
  await tele(g.max * 0.3); await tele(g.max * 0.7); if (kind === 'desktop') { await page.mouse.move(700, 450); for (let j = 0; j < 10; j++) await page.mouse.wheel(0, 500); await rest() }
  const after = (await film())?.refreshCount ?? 0
  if (after !== before) bad.push(`scrolling caused ${after - before} refresh(es)`)
  if (before > 3) bad.push(`${before} refreshes since load (want at most 3)`)
  // opening an Events row moves everything below it: cached tops must match the layout two frames later
  const moved = await page.evaluate(async () => { const b = document.querySelector('#events .agenda-trigger'); if (!b) return null; document.getElementById('events').scrollIntoView(); b.click(); await new Promise(r => setTimeout(r, 900)); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    const s = window.__film.state(); const out = []; for (const c of s.chapters) { const el = document.getElementById(c.id); const top = el.getBoundingClientRect().top + scrollY; if (Math.abs(top - c.top) > 1) out.push(`${c.id} cached ${c.top.toFixed(1)} real ${top.toFixed(1)}`) } b.click(); await new Promise(r => setTimeout(r, 900)); return out })
  if (moved?.length) bad.push(...moved.map(m => 'after opening an Events row: ' + m))
  check('I14 at most 3 refreshes at load, none from scrolling; cached geometry follows layout changes', bad)
}

// ---- 15: teleport into the ML film
if (!off && !reducedMode) {
  const bad = []
  await tele(0)
  const ml = g.ch.find(c => c.id === 'ml-process')
  await page.evaluate(v => window.scrollTo({ top: v, behavior: 'instant' }), ml.top + (ml.h - g.vh) * 0.6)
  await page.waitForTimeout(50)
  const first = await page.evaluate(() => { const h = document.querySelector('#ml-process .scroll-film'); const base = h.querySelector('[data-still-base]'); const still = [...h.querySelectorAll('[data-still]')].some(i => i.complete && i.naturalWidth > 0 && +i.style.opacity > 0); return { state: h.dataset.sceneState, base: base.complete && base.naturalWidth > 0, still } })
  if (first.state !== 'live' && !first.base && !first.still) bad.push('first frame after a teleport into ML has neither video nor a loaded still')
  await page.waitForTimeout(1200)
  const later = await page.evaluate(() => { const h = document.querySelector('#ml-process .scroll-film'); const v = h.querySelector('video'); const s = window.__film.state().chapters.find(c => c.id === 'ml-process'); return { state: h.dataset.sceneState, t: v.currentTime, want: (v.duration - 0.05) * s.vrun, ready: v.readyState } })
  if (later.ready >= 2 && Math.abs(later.t - later.want) > 0.1) bad.push(`video at ${later.t.toFixed(2)} s, target ${later.want.toFixed(2)} s`)
  if (later.ready >= 2 && later.state !== 'live') bad.push(`video loaded but the film is not live (${later.state})`)
  check('I15 after a teleport into ML a still or the video shows at once and the video lands on the target', bad)
}

// ---- 12: reload deep in the page
if (!off) {
  const bad = []
  await tele(Math.min(g.max - 50, 16000))
  const a = await film()
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(3800)
  const b = await film()
  if (a && b) { const fa = a.chapters.find(c => c.id === a.frame.active), fb = b.chapters.find(c => c.id === a.frame.active); const pa = (a.frame.y - fa.top) / fa.height, pb = (b.frame.y - fb.top) / fb.height
    if (a.frame.active !== b.frame.active || Math.abs(pa - pb) > 0.02) bad.push(`before reload ${a.frame.active} ${pa.toFixed(3)}, after ${b.frame.active} ${pb.toFixed(3)}`)
    const au = await page.evaluate(auditFn); const h = b.reveals.filter(r => r.inView && r.progress < 0.999); if (h.length) bad.push(`after the reload reveals in view are unfinished: ${h.map(r => r.id).join(',')}`)
    for (const c of au.chapters) for (const t of c.texts) if (t.score < 0.9 && t.inside > 0 && c.id !== 'universe') bad.push(`after the reload: ${c.id} ${t.tag} "${t.txt}" ${t.score}`) }
  check('I12 a reload deep in the page restores the same chapter and place, complete', bad)
}

// ---- 13: resize round trip (desktop)
if (kind === 'desktop' && !off && !reducedMode) {
  const bad = []
  g = await geo(); const u = g.ch.find(c => c.id === 'world'); await tele(u.top + (u.h - g.vh) * 0.45)
  const at = async () => { const f = await film(); const c = f.chapters.find(x => x.id === f.frame.active); return { id: f.frame.active, frac: (f.frame.y + f.frame.vh * 0.32 - c.top) / c.height, refresh: f.refreshCount } }
  let prev = await at()
  for (const [w, h] of [[1000, 700], [700, 900], [1440, 900]]) {
    await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(900); await rest(300)
    const now = await at()
    if (now.id !== prev.id || Math.abs(now.frac - prev.frac) > 0.05) bad.push(`at ${w}x${h}: ${now.id} ${now.frac.toFixed(3)}, was ${prev.id} ${prev.frac.toFixed(3)}`)
    if (now.refresh - prev.refresh > 2) bad.push(`at ${w}x${h}: ${now.refresh - prev.refresh} refreshes for one resize`)
    const w2 = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]); if (w2[0] !== w2[1]) bad.push(`at ${w}x${h}: scrollWidth ${w2[0]} clientWidth ${w2[1]}`)
    prev = now
  }
  check('I13 a resize round trip keeps the reader in the same chapter at the same place (at most 2 refreshes each)', bad)
}

// ---- 19: scenes that are off screen do not draw
if (!off) {
  const bad = []
  await tele(0); await page.waitForTimeout(600)
  const draws = await page.evaluate(async () => { window.__resetDraws(); await new Promise(r => setTimeout(r, 1000)); return window.__canvasReport().filter(c => /soda/.test(c.cls) && c.draws > 0).map(c => `${c.cls} drew ${c.draws} times in 1 s while off screen`) })
  bad.push(...draws)
  const f = await film(); if (f) for (const [id, s] of Object.entries(f.scenes)) if (s.allowed && (id === 'soda' || id === 'ml-film')) bad.push(`${id} is allowed to draw at the top of the page`)
  check('I19 a scene that is off screen draws 0 times per second', bad)
}

check('I1 no page error and no console error', [...new Set(errors)])
const lines = [`INVARIANTS ${kind}${reducedMode ? ' reduced' : ''}${off ? ' film-off' : ''}  ${url}  stops ${stops.length}`]
for (const name of ran) { const f = R[name]; lines.push(`${f ? 'FAIL' : 'PASS'}  ${name}${f ? `  (${f.length})` : ''}`); if (f) for (const x of f.slice(0, 8)) lines.push('        ' + x); if (f && f.length > 8) lines.push(`        ... ${f.length - 8} more`) }
fs.writeFileSync(`${out}/invariants.txt`, lines.join('\n') + '\n'); save(`${out}/invariants.json`, R)
console.log(lines.join('\n'))
await browser.close()
process.exit(Object.keys(R).length ? 1 : 0)
