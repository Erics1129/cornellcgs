// WALK: teleport (or slow-scroll) to stops in every chapter, wait for rest, save a JPEG and a text audit per stop.
// usage: node walk.mjs <url> <outdir> [desktop|phone|touch] [--slow] [--reduced] [--only=id,id] [--w=1440 --h=900]
// "legible" follows the audit: a text counts when it is hit-testable and its opacity chain is at least 0.9.
import fs from 'node:fs'
import { open, auditFn, save } from './lib.mjs'
const args = process.argv.slice(2)
const [url, out, kind = 'desktop'] = args.filter(a => !a.startsWith('--'))
const flag = n => args.includes('--' + n)
const opt = (n, d) => { const a = args.find(x => x.startsWith(`--${n}=`)); return a ? a.split('=')[1] : d }
fs.mkdirSync(out, { recursive: true })
const { browser, page, errors } = await open(kind, url, { reduced: flag('reduced'), w: +opt('w', 0) || undefined, h: +opt('h', 0) || undefined, dpr: +opt('dpr', 1) })
const only = opt('only', '').split(',').filter(Boolean)
const geo = await page.evaluate(() => ({ vh: innerHeight, max: document.documentElement.scrollHeight - innerHeight, w: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
  ch: [...document.querySelectorAll('main > section, footer#contact')].map(s => { const r = s.getBoundingClientRect(); return { id: s.id, top: Math.round(r.top + scrollY), h: Math.round(r.height) } }) }))
const stops = []
for (const c of geo.ch) {
  if (only.length && !only.includes(c.id)) continue
  const run = c.h - geo.vh
  const fr = run > geo.vh * 2 ? [0, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1] : run > geo.vh * .5 ? [0, .25, .5, .75, 1] : run > 8 ? [0, 1] : [0]
  stops.push({ id: c.id, f: -0.5, y: c.top - geo.vh * 0.5 })
  for (const f of fr) stops.push({ id: c.id, f, y: c.top + Math.max(0, run) * f })
}
const lines = [`WALK ${kind} ${url} ${flag('slow') ? 'slow' : 'teleport'}  page ${geo.max + geo.vh}px  scrollWidth ${geo.w}/${geo.cw}`]
const rows = []
let n = 0
for (const s of stops) {
  const y = Math.max(0, Math.min(geo.max, Math.round(s.y)))
  if (flag('slow')) {
    const from = await page.evaluate(() => scrollY)
    const steps = Math.max(1, Math.ceil(Math.abs(y - from) / 160))
    for (let i = 1; i <= steps; i++) { await page.evaluate(v => window.scrollTo({ top: v, behavior: 'instant' }), from + (y - from) * i / steps); await page.waitForTimeout(16) }
  } else await page.evaluate(v => window.scrollTo({ top: v, behavior: 'instant' }), y)
  await page.waitForTimeout(+opt('wait', 700))
  const a = await page.evaluate(auditFn)
  const film = await page.evaluate(() => { const f = window.__film?.state?.(); if (!f) return null; return { rest: f.frame.rest, idle: f.frame.idle, active: f.frame.active, bg: f.frame.bgVisible, half: f.reveals.filter(r => r.progress > 0.001 && r.progress < 0.999).map(r => r.id), unshown: f.reveals.filter(r => r.inView && r.progress < 0.999).map(r => r.id), ch: f.chapters.filter(c => c.inView).map(c => `${c.id} run ${c.run.toFixed(3)} vrun ${c.vrun.toFixed(3)}`) } })
  // While a stage is stuck, none of its words may sit outside the screen (they could never be scrolled to).
  const cut = s.f > 0 && s.f < 1 ? await page.evaluate(id => { const out = []; const root = document.getElementById(id); const stage = root?.querySelector('[data-stage], .scene-stage, .universe-viewport, .soda-stage'); if (!stage || getComputedStyle(stage).position !== 'sticky') return out
    for (const el of stage.querySelectorAll('h1,h2,h3,p,li,a,button,figcaption')) { if (el.closest('[aria-hidden="true"],[data-phase="off"]') || el.querySelector('h1,h2,h3,p,li')) continue; let o = 1; for (let n = el; n && n !== root; n = n.parentElement) { const c = getComputedStyle(n); o *= +c.opacity; if (c.visibility === 'hidden' || c.display === 'none') o = 0 } if (o < 0.5) continue
      const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue; if (r.bottom > innerHeight + 1 || r.top < -1) out.push(`${el.tagName} "${(el.innerText || '').trim().slice(0, 24)}" ${Math.round(r.top)}..${Math.round(r.bottom)} of ${innerHeight}`) } return out }, s.id) : []
  const name = `${String(n++).padStart(3, '0')}-${s.id}-${String(s.f).replace('.', '_')}.jpg`
  await page.screenshot({ path: `${out}/${name}`, type: 'jpeg', quality: 60 })
  const bad = []
  for (const c of a.chapters) for (const t of c.texts) if (t.score < 0.9 && t.inside > 0) bad.push(`${c.id}:${t.tag}:"${t.txt}"=${t.score}`)
  const own = a.chapters.find(c => c.vis >= 0.6)
  const none = own && !own.texts.some(t => t.score >= 0.9) ? ` NO-TEXT(${own.id})` : ''
  rows.push({ ...s, y, a, film })
  lines.push(`${name}  y=${y}  ${film ? `${film.ch.join(' | ')} rest=${film.rest.toFixed(2)}` : ''}${none}${film?.half.length ? ` HALF[${film.half.join(',')}]` : ''}${film?.unshown.length ? ` UNSHOWN[${film.unshown.join(',')}]` : ''}${bad.length ? `\n      low: ${bad.slice(0, 8).join('  ')}` : ''}${cut.length ? `\n      OUTSIDE: ${cut.slice(0, 6).join('  ')}` : ''}`)
}
lines.push(`errors: ${errors.length}`, ...errors.slice(0, 12).map(e => '  ' + e))
fs.writeFileSync(`${out}/walk.txt`, lines.join('\n') + '\n'); save(`${out}/walk.json`, rows)
console.log(lines.join('\n'))
await browser.close()
