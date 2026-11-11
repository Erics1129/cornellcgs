// Fast-scroll stress probe. usage: node stress.mjs <url> <desktop|phone> <outdir>
import { chromium, webkit, devices } from '/Users/eric/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
import fs from 'node:fs'
const [url, kind, out] = process.argv.slice(2)
fs.mkdirSync(out, { recursive: true })
const phone = kind === 'phone'
const browser = await (phone ? webkit : chromium).launch({ headless: true, args: phone ? [] : ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const ctx = await browser.newContext(phone ? { ...devices['iPhone 13'] } : { viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0, 200)))
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)) })
await page.addInitScript(() => { window.__long = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__long.push([Math.round(e.startTime), Math.round(e.duration)]) }).observe({ entryTypes: ['longtask'] }) } catch {} })
await page.goto(url, { waitUntil: 'load' }); await page.waitForTimeout(4500)
// What is in the viewport and invisible although it has text or is an image/canvas: the "user can't see it" probe.
const audit = () => page.evaluate(() => {
  const vh = innerHeight, vw = innerWidth, bad = []
  const seen = new Set()
  for (const el of document.querySelectorAll('main h1,main h2,main h3,main p,main li,main a,main button,main figure,main img,main canvas,main video,footer p,footer a')) {
    const r = el.getBoundingClientRect(); if (r.bottom < vh * 0.15 || r.top > vh * 0.85 || r.width < 8 || r.height < 8) continue
    if (r.right < 0 || r.left > vw) continue
    let op = 1, hidden = false, n = el
    while (n && n !== document.documentElement) { const s = getComputedStyle(n); op *= parseFloat(s.opacity); if (s.visibility === 'hidden' || s.display === 'none') hidden = true; n = n.parentElement }
    if (el.closest('[aria-hidden="true"]') || el.closest('.sr-only')) continue
    const txt = (el.innerText || el.alt || el.tagName).trim().slice(0, 50); if (!txt) continue
    if (op < 0.2 || hidden) { const key = el.tagName + txt; if (!seen.has(key)) { seen.add(key); bad.push({ tag: el.tagName, txt, op: +op.toFixed(2), hidden, top: Math.round(r.top), cls: (el.className + '').slice(0, 60) }) } }
  }
  return { y: Math.round(scrollY), max: document.documentElement.scrollHeight - vh, bad }
})
const info = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, vh: innerHeight, sections: [...document.querySelectorAll('main > *')].map(s => ({ id: s.id || s.className.toString().slice(0, 30), top: Math.round(s.getBoundingClientRect().top + scrollY), h: Math.round(s.getBoundingClientRect().height) })), st: window.ScrollTrigger ? window.ScrollTrigger.getAll().length : null }))
const report = { url, kind, info, runs: [] }
const max = info.h - info.vh
const shot = async name => { await page.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 60 }) }
// Run A: slow reference pass (20 stops), settled.
for (let i = 0; i <= 20; i++) { await page.evaluate(y => window.scrollTo(0, y), Math.round(max * i / 20)); await page.waitForTimeout(1100); const a = await audit(); if (i % 2 === 0) await shot(`A-slow-${String(i).padStart(2, '0')}`); report.runs.push({ run: 'slow', i, ...a }) }
// Run B: fling. Jump top, then flick to stops with huge instant jumps, short settle, then audit after 1.5 s.
await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(800)
if (!phone) {
  await page.mouse.move(700, 450)
  for (let k = 0; k < 10; k++) { for (let j = 0; j < 40; j++) await page.mouse.wheel(0, 900); await page.waitForTimeout(1500); const a = await audit(); await shot(`B-fling-${k}`); report.runs.push({ run: 'fling', i: k, ...a }) }
  for (let k = 0; k < 4; k++) { for (let j = 0; j < 60; j++) await page.mouse.wheel(0, -1200); await page.waitForTimeout(1500); const a = await audit(); await shot(`B-flingup-${k}`); report.runs.push({ run: 'flingUp', i: k, ...a }) }
}
// Run C: teleports (scrollbar drag / End key / anchor): random far jumps, audit 1.2 s after landing.
const stops = [0.93, 0.08, 0.61, 0.27, 0.99, 0.44, 0.76, 0.15, 0.52, 0.85, 0.35, 1, 0]
for (const [k, f] of stops.entries()) { await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), Math.round(max * f)); await page.waitForTimeout(1200); const a = await audit(); await shot(`C-jump-${String(k).padStart(2, '0')}-${Math.round(f * 100)}`); report.runs.push({ run: 'jump', f, ...a }) }
// Run D: rapid oscillation across the whole page (10 round trips in 3 s), then land mid and audit.
await page.evaluate(async m => { for (let i = 0; i < 60; i++) { window.scrollTo(0, (i % 2 ? 0.1 : 0.9) * m * Math.random()); await new Promise(r => requestAnimationFrame(r)) } }, max)
for (const f of [0.2, 0.5, 0.8]) { await page.evaluate(y => window.scrollTo(0, y), Math.round(max * f)); await page.waitForTimeout(1500); const a = await audit(); await shot(`D-osc-${Math.round(f * 100)}`); report.runs.push({ run: 'osc', f, ...a }) }
report.long = await page.evaluate(() => ({ n: window.__long.length, worst: window.__long.sort((a, b) => b[1] - a[1]).slice(0, 8), total: window.__long.reduce((s, x) => s + x[1], 0) }))
report.errors = [...new Set(errors)].slice(0, 20)
fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1))
const badRuns = report.runs.filter(r => r.bad.length)
console.log(kind, 'height', info.h, 'sections', info.sections.length, 'runs', report.runs.length, 'runs with invisible content', badRuns.length, 'longtasks', report.long.n, 'total ms', report.long.total, 'errors', report.errors.length)
for (const r of badRuns.slice(0, 40)) console.log(' ', r.run, r.i ?? r.f, 'y', r.y, r.bad.slice(0, 4).map(b => `${b.tag}[${b.txt.slice(0, 28)}] op${b.op}`).join(' | '))
console.log(report.errors.join('\n'))
await browser.close()
