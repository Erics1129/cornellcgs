// INVARIANTS: one pass/fail report an integration run can gate on.
// usage: node invariants.mjs <url> <outdir> [desktop|phone|touch] [--reduced]
// Dev build required for the GSAP checks (window.__gsap). Exit code 1 when any invariant fails.
import fs from 'node:fs'
import { open, auditFn, makeAnalyzer, sections, save } from './lib.mjs'
const [url, out, kind = 'desktop', flag = ''] = process.argv.slice(2)
fs.mkdirSync(out, { recursive: true })
const reduced = flag === '--reduced'
const { browser, page, errors } = await open(kind, url, { reduced })
const an = await makeAnalyzer(browser)
const secs = await sections(page)
const vh = await page.evaluate(() => innerHeight)
const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
const R = {}; const fail = (k, what) => { (R[k] ||= []).push(what) }; const ran = new Set()
const table = () => page.evaluate(() => window.__gsap ? window.__gsap.ScrollTrigger.getAll().map(st => ({ k: `${st.trigger?.closest?.('section,footer')?.id || '-'}|${st.vars.id || st.trigger?.className?.toString().slice(0, 22) || ''}`, start: Math.round(st.start), end: Math.round(st.end), pin: !!st.pin, sec: st.trigger?.closest?.('section,footer')?.id || '' })) : null)
const idx = list => { const m = new Map(), c = {}; for (const t of list) { c[t.k] = (c[t.k] || 0) + 1; m.set(t.k + '#' + c[t.k], t) } return m }
const diffTables = (a, b) => { const A = idx(a), B = idx(b); const off = []; for (const [k, t] of A) { const r = B.get(k); if (r && (Math.abs(t.start - r.start) > 4 || Math.abs(t.end - r.end) > 4)) off.push(`${k} ${t.start}..${t.end} want ${r.start}..${r.end}`) } return off }
const FILM = new Set(['world', 'universe', 'anyone'])   // chapters that are films by design: judged separately in I6b
// ---------- stops: every chapter at entering / start / quarter points / end, and every boundary
const stops = []
for (const [i, s] of secs.entries()) {
  if (s.id === 'footer' || s.id === 'contact') { stops.push({ y: max, why: 'end' }); continue }
  const run = Math.max(0, s.h - vh)
  stops.push({ y: s.top - vh * 0.5, why: `${s.id} entering (top at 50%)` })
  stops.push({ y: s.top - vh * 0.2, why: `${s.id} entering (top at 20%)` })
  for (const f of run > vh * 0.5 ? [0, 0.12, 0.25, 0.5, 0.75, 0.9, 1] : run > 8 ? [0, 1] : [0]) stops.push({ y: s.top + run * f, why: `${s.id} at ${f}` })
}
const uniq = [...new Map(stops.map(s => [Math.round(Math.max(0, Math.min(max, s.y))), s])).entries()].map(([y, s]) => ({ ...s, y }))
// teleport in a shuffled order, audit at rest + 600 ms
const order = uniq.map((_, i) => i).sort((a, b) => ((a * 7919) % uniq.length) - ((b * 7919) % uniq.length))
const rows = []
let refreshes = 0
await page.evaluate(() => { window.__refreshN = 0; window.__gsap?.ScrollTrigger.addEventListener('refresh', () => window.__refreshN++) })
for (const i of order) {
  const s = uniq[i]
  await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), s.y); await page.waitForTimeout(600)
  const a = await page.evaluate(auditFn); const buf = await page.screenshot({ type: 'jpeg', quality: 50 }); const px = await an.stats(buf)
  const tx = await page.evaluate(() => [...document.querySelectorAll('.tx-edges g')].filter(g => +g.style.opacity > 0.02).length)
  rows.push({ ...s, a, px, tx })
  const tag = `y=${s.y} (${s.why})`
  let bad = false
  // I4 no resting cut frames
  ran.add('I4 no chapter is clipped or edge-lit at rest')
  const clipped = a.chapters.filter(c => c.clip && c.vis > 0.15)
  if (clipped.length || tx) { fail('I4 no chapter is clipped or edge-lit at rest', `${tag}: ${clipped.map(c => c.id).join('+') || 'edge only'}`); bad = true }
  // I5 no bare background
  ran.add('I5 at rest no more than 5% of the screen is bare page background')
  const total = Object.values(a.cover).reduce((x, y) => x + y, 0); const bg = (a.cover.bg || 0) / total
  if (bg > 0.05) { fail('I5 at rest no more than 5% of the screen is bare page background', `${tag}: ${(bg * 100).toFixed(0)}%`); bad = true }
  // I6 the chapter that owns the screen shows a legible heading
  ran.add('I6 the chapter filling the screen shows a legible heading (films excepted)'); ran.add('I6b a film chapter shows some legible text (title or caption) wherever the reader stops')
  const main = a.chapters.filter(c => c.vis >= 0.6)[0]
  if (main && main.id !== 'footer' && main.id !== 'contact' && main.id !== 'stats') {
    if (FILM.has(main.id)) { if (!main.texts.some(t => t.score >= 0.9)) { fail('I6b a film chapter shows some legible text (title or caption) wherever the reader stops', `${tag}`); bad = true } }
    else if (main.heading === null ? main.seen < 1 : !(main.heading >= 0.9)) { fail('I6 the chapter filling the screen shows a legible heading (films excepted)', `${tag}: heading ${main.heading}, legible texts ${main.seen}/${main.count}`); bad = true }  // a heading that is on screen must be legible; if it has scrolled away, some text must be
  }
  // I7 no near-black frame
  ran.add('I7 no resting frame is more than 85% near-black')
  if (px.dark > 0.85) { fail('I7 no resting frame is more than 85% near-black', `${tag}: ${(px.dark * 100).toFixed(0)}% dark`); bad = true }
  // I10 scrubbed animations sit where the scroll says
  if (a.lag) { ran.add('I10 600 ms after rest every scrubbed animation matches its scroll position'); if (a.lag.length) { fail('I10 600 ms after rest every scrubbed animation matches its scroll position', `${tag}: ${a.lag.map(l => l.id).join(',')}`); bad = true } }
  if (bad) fs.writeFileSync(`${out}/fail-${String(s.y).padStart(5, '0')}.jpg`, buf)
}
// I8 coverage: every text is fully legible somewhere
ran.add('I8 every text element is fully legible at some stop')
{ const best = new Map(); for (const r of rows) for (const c of r.a.chapters) for (const t of c.texts) { const k = `${c.id}|${t.tag}|${t.txt}`; best.set(k, Math.max(best.get(k) || 0, t.score)) } for (const [k, v] of best) if (v < 0.9 && !/Show biography|Show portrait/.test(k)) fail('I8 every text element is fully legible at some stop', `${k} best ${v}`) }
// I14 no refresh while only scrolling
if (await page.evaluate(() => !!window.__gsap)) { ran.add('I14 scrolling alone never triggers a ScrollTrigger.refresh'); const n = await page.evaluate(() => window.__refreshN); if (n > 0) fail('I14 scrolling alone never triggers a ScrollTrigger.refresh', `${n} refreshes during ${rows.length} teleports`) }
// I9 layout order
ran.add('I9 chapters abut with no overlap and pins refresh before later triggers')
{ const gaps = await page.evaluate(() => { const kids = [...document.querySelectorAll('main > *')]; const bad = []; for (let i = 1; i < kids.length; i++) { const a = kids[i - 1].getBoundingClientRect(), b = kids[i].getBoundingClientRect(); if (Math.abs(b.top - a.bottom) > 2) bad.push(`${(kids[i].querySelector('section') || kids[i]).id}: gap ${Math.round(b.top - a.bottom)}`) } return bad }); for (const g of gaps) fail('I9 chapters abut with no overlap and pins refresh before later triggers', g)
  const t = await table(); if (t) { const i = t.findIndex((p, n) => p.pin && t.slice(0, n).some(u => !u.pin && u.sec !== p.sec && u.start > p.start + 5)); if (i >= 0) fail('I9 chapters abut with no overlap and pins refresh before later triggers', `pin ${t[i].sec} is listed after a later trigger`) } }
// I11 drawing budget: nothing off screen draws; sample with three chapters on screen
ran.add('I11 canvases that are off screen or fully covered do not draw')
for (const id of ['who-we-are', 'ml-process', 'world', 'join', 'vision']) {
  const s = secs.find(s => s.id === id); if (!s) continue
  await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), Math.round(s.top + Math.max(0, s.h - vh) * 0.6)); await page.waitForTimeout(1500)
  const d = await page.evaluate(async () => { window.__resetDraws(); await new Promise(r => setTimeout(r, 1000)); return window.__canvasReport().filter(c => c.draws > 0) })
  const off = d.filter(c => !c.inView); for (const c of off) fail('I11 canvases that are off screen or fully covered do not draw', `on ${id}: ${c.where}/${c.cls || c.type} draws ${c.draws}/s off screen`)
  // full-screen fixed layers behind an opaque chapter
  if (['ml-process', 'world'].includes(id)) for (const c of d.filter(c => /code-layer|h-full w-full/.test(c.cls) && !c.where.includes(id))) fail('I11 canvases that are off screen or fully covered do not draw', `on ${id} (opaque): fixed layer "${c.cls}" draws ${c.draws}/s behind it`)
}
// I2 reload at depth == load from the top
const fresh = await table()
if (fresh && !reduced) {
  ran.add('I2 a reload deep in the page yields the same trigger positions as a load from the top')
  await page.evaluate(y => window.scrollTo(0, y), Math.round(max * 0.5)); await page.waitForTimeout(700)
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(4500)
  for (const d of diffTables(await table(), fresh)) fail('I2 a reload deep in the page yields the same trigger positions as a load from the top', d)
  const y = await page.evaluate(() => scrollY); if (Math.abs(y - Math.round(max * 0.5)) > 4) fail('I2 a reload deep in the page yields the same trigger positions as a load from the top', `position not restored: ${y} vs ${Math.round(max * 0.5)}`)
}
// I3 resize round trip == fresh, reader stays put (desktop only here; run-resize.mjs is the long form)
if (fresh && kind === 'desktop' && !reduced) {
  ran.add('I3 after a resize round trip triggers equal a fresh load and the reader is in the same chapter')
  const s = secs.find(s => s.id === 'universe'); await page.evaluate(y => window.scrollTo(0, y), Math.round(s.top + (s.h - vh) * 0.5)); await page.waitForTimeout(900)
  await page.setViewportSize({ width: 1000, height: 700 }); await page.waitForTimeout(1800)
  const mid = await page.evaluate(auditFn); if (!mid.chapters.some(c => c.id === 'universe')) fail('I3 after a resize round trip triggers equal a fresh load and the reader is in the same chapter', `at 1000x700 the reader is in ${mid.chapters.map(c => c.id).join('+')}, was in universe`)
  await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(1800)
  const d = diffTables(await table(), fresh); if (d.length) fail('I3 after a resize round trip triggers equal a fresh load and the reader is in the same chapter', `${d.length} triggers moved, e.g. ${d.slice(0, 3).join(' ; ')}`)
}
ran.add('I0 no page errors'); for (const e of new Set(errors)) fail('I0 no page errors', e)
// ---------- report
let failed = 0
console.log(`\nINVARIANTS ${kind}${reduced ? ' (reduced motion)' : ''}  ${url}  stops ${rows.length}`)
for (const k of [...ran].sort()) { const f = R[k] || []; if (f.length) failed++; console.log(`${f.length ? 'FAIL' : 'PASS'}  ${k}${f.length ? `  (${f.length})` : ''}`); for (const x of f.slice(0, 6)) console.log(`        ${x}`); if (f.length > 6) console.log(`        ... ${f.length - 6} more`) }
save(`${out}/report.json`, { url, kind, reduced, stops: rows.map(r => ({ y: r.y, why: r.why, dark: r.px.dark, tx: r.tx, cover: r.a.cover, chapters: r.a.chapters.map(c => ({ id: c.id, vis: c.vis, clip: !!c.clip, heading: c.heading, seen: c.seen, count: c.count })) })), failures: R })
await browser.close()
process.exit(failed ? 1 : 0)
