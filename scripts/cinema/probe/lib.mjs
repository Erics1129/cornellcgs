// Shared harness for the fast-scroll audit. Read-only on the repo.
import { chromium, webkit, devices } from '/Users/eric/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
import fs from 'node:fs'
export { chromium, webkit, devices }
export const GPU = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-precise-memory-info']

// Runs in the page before any site code.
export function instrument() {
  const W = window
  W.__long = []
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) W.__long.push([Math.round(e.startTime), Math.round(e.duration)]) }).observe({ entryTypes: ['longtask'] }) } catch {}
  // rAF accounting: who asks for frames, how often
  const raf = W.requestAnimationFrame.bind(W)
  W.__raf = { on: false, by: {}, n: 0 }
  W.requestAnimationFrame = function (cb) {
    if (W.__raf.on) {
      W.__raf.n++
      const s = (new Error().stack || '').split('\n').slice(2, 5).map(l => l.trim().replace(/^at /, '').replace(/https?:\/\/[^/]+\//, '').replace(/\?[^:)]*/, '')).filter(l => !/lib\.mjs|instrument/.test(l))
      const key = s[0] || '?'
      W.__raf.by[key] = (W.__raf.by[key] || 0) + 1
    }
    return raf(cb)
  }
  // frame clock
  W.__frames = { on: false, t: [] }
  const loop = t => { if (W.__frames.on) W.__frames.t.push(t); raf(loop) }
  raf(loop)
  // canvas accounting: contexts created, draws per canvas
  W.__ctx = []
  const getContext = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (type, ...a) {
    const c = getContext.call(this, type, ...a)
    if (c && !this.__seen) { this.__seen = type; this.__draws = 0; W.__ctx.push(this) }
    return c
  }
  const count = (proto, names) => { for (const n of names) { const f = proto[n]; if (!f) continue; proto[n] = function (...a) { const cv = this.canvas; if (cv) cv.__draws = (cv.__draws || 0) + 1; return f.apply(this, a) } } }
  if (W.WebGL2RenderingContext) count(WebGL2RenderingContext.prototype, ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced'])
  if (W.WebGLRenderingContext) count(WebGLRenderingContext.prototype, ['drawArrays', 'drawElements'])
  count(CanvasRenderingContext2D.prototype, ['drawImage', 'fillRect', 'fill', 'stroke', 'fillText', 'putImageData'])
  W.__canvasReport = () => W.__ctx.filter(c => c.isConnected).map(c => {
    const r = c.getBoundingClientRect()
    const sec = c.closest('section[id],footer,[class*="gradient"],[class*="code-layer"]')
    let lost = false; try { const g = c.__seen.startsWith('webgl') ? getContext.call(c, c.__seen) : null; lost = g ? g.isContextLost() : false } catch {}
    return { type: c.__seen, where: (sec && (sec.id || sec.className.toString().slice(0, 24))) || c.className.toString().slice(0, 30) || c.parentElement?.className?.toString().slice(0, 30), cls: c.className.toString().slice(0, 30), w: c.width, h: c.height, draws: c.__draws, inView: r.bottom > 0 && r.top < innerHeight && r.width > 0 && getComputedStyle(c).display !== 'none', lost }
  })
  W.__resetDraws = () => { for (const c of W.__ctx) c.__draws = 0 }
}

// In-page audit: what a reader can actually see at this scroll position.
export function auditFn() {
  const vh = innerHeight, vw = innerWidth
  const style = document.createElement('style'); style.textContent = '*{pointer-events:auto !important}'
  document.head.appendChild(style)
  const opacityOf = el => { let o = 1, hidden = false; for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const s = getComputedStyle(n); o *= parseFloat(s.opacity); if (s.visibility === 'hidden' || s.display === 'none') hidden = true } return hidden ? 0 : o }
  const textScore = el => {
    // sample the rendered text boxes; a point counts when the text's own element is hit-testable there (not clipped) and opaque
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    const pts = []
    for (let n = walker.nextNode(); n && pts.length < 40; n = walker.nextNode()) {
      if (!n.nodeValue.trim()) continue
      const p = n.parentElement
      if (p.closest('.sr-only,.showcase-sr-only,.btn-label > [aria-hidden="true"]')) continue
      const range = document.createRange(); range.selectNodeContents(n)
      for (const r of range.getClientRects()) { if (r.width < 3 || r.height < 3) continue; pts.push({ x: r.left + r.width / 2, y: r.top + r.height / 2, p, natural: r }) ; if (pts.length >= 40) break }
    }
    if (!pts.length) return null
    const inside = pts.filter(q => q.y > 0 && q.y < vh && q.x > 0 && q.x < vw)
    // text whose boxes are moved out of the viewport by a transform while its container is in view counts as not seen
    let sum = 0
    const take = inside.length > 8 ? inside.filter((_, i) => i % Math.ceil(inside.length / 8) === 0) : inside
    for (const q of take) {
      const stack = document.elementsFromPoint(q.x, q.y)
      const hit = stack.includes(q.p)
      sum += hit ? Math.min(1, opacityOf(q.p)) : 0
    }
    return { score: take.length ? sum / take.length : 0, inside: inside.length, total: pts.length }
  }
  const chapters = [...document.querySelectorAll('main section[id], footer')].filter(s => s.tagName === 'FOOTER' || s.parentElement.tagName === 'MAIN' || s.parentElement.classList.contains('pin-spacer'))
  const out = { y: Math.round(scrollY), max: document.documentElement.scrollHeight - vh, vh, vw, html: document.documentElement.className, chapters: [], cover: {}, stripes: 0 }
  for (const s of chapters) {
    const own = s.getBoundingClientRect()
    const box = s.parentElement.classList.contains('pin-spacer') ? s.parentElement.getBoundingClientRect() : own
    const vis = Math.max(0, Math.min(own.bottom, vh) - Math.max(own.top, 0))
    if (vis < vh * 0.12) continue
    const id = s.id || 'footer'
    const ch = { id, top: Math.round(box.top), bottom: Math.round(box.bottom), vis: +(vis / vh).toFixed(2), clip: s.style.clipPath ? s.style.clipPath.slice(0, 40) : '', progress: box.height > vh ? +Math.max(0, Math.min(1, -box.top / (box.height - vh))).toFixed(3) : null, texts: [] }
    for (const el of s.querySelectorAll('h1,h2,h3,p,li,a,button,figcaption,dt,dd')) {
      if (el.closest('[aria-hidden="true"]')) continue
      if (el.closest('[data-phase="off"]')) continue   // an intended, marked phase (SPEC 2.4): not counted as missing
      if (el.querySelector('h1,h2,h3,p,li')) continue
      const r = el.getBoundingClientRect()
      if (r.width < 4 || r.height < 4) continue
      if (r.bottom < vh * 0.06 || r.top > vh * 0.94 || r.right < 0 || r.left > vw) continue
      const phases = el.querySelectorAll('[data-universe-phase]')
      let sc = textScore(el)
      if (phases.length) { const all = [...phases].map(textScore).filter(Boolean); if (all.length) sc = all.reduce((a, b) => (b.score > a.score ? b : a)) }
      if (!sc) continue
      // the layout box is in view, but the painted text may have been moved away or masked
      ch.texts.push({ tag: el.tagName, txt: (el.getAttribute('aria-label') || el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 34), score: +sc.score.toFixed(2), op: +opacityOf(el).toFixed(2), top: Math.round(r.top), inside: sc.inside, total: sc.total })
    }
    const heads = ch.texts.filter(t => t.tag === 'H1' || t.tag === 'H2')
    ch.heading = heads.length ? Math.max(...heads.map(t => t.score)) : null
    ch.seen = ch.texts.filter(t => t.score >= 0.8).length
    ch.count = ch.texts.length
    out.chapters.push(ch)
  }
  // which chapter owns each point of a grid, and how often ownership flips down a column (stripes)
  const owner = (x, y) => { for (const el of document.elementsFromPoint(x, y)) { const s = el.closest && el.closest('main section[id], footer'); if (s) return s.id || 'footer' } return 'bg' }
  let flips = 0
  for (const fx of [0.2, 0.5, 0.8]) { let prev = null, f = 0; for (let i = 1; i < 36; i++) { const o = owner(vw * fx, vh * i / 36); out.cover[o] = (out.cover[o] || 0) + 1; if (prev !== null && o !== prev) f++; prev = o } flips = Math.max(flips, f) }
  out.stripes = flips
  // media in view
  out.media = [...document.querySelectorAll('main canvas, main video, main img')].map(el => { const r = el.getBoundingClientRect(); const a = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0)); if (a < vw * vh * 0.08) return null; return { tag: el.tagName, cls: (el.className + '').slice(0, 28), sec: el.closest('section')?.id, op: +opacityOf(el).toFixed(2), area: +(a / (vw * vh)).toFixed(2), ready: el.tagName === 'VIDEO' ? el.readyState : el.tagName === 'IMG' ? (el.complete && el.naturalWidth > 0 ? 4 : 0) : undefined, t: el.tagName === 'VIDEO' ? +el.currentTime.toFixed(2) : undefined, frames: el.dataset?.frames } }).filter(Boolean)
  style.remove()
  // GSAP: scrubbed animations must sit where the scroll says
  const g = window.__gsap
  if (g) {
    out.lag = []
    for (const st of g.ScrollTrigger.getAll()) {
      const a = st.animation; if (!a || !st.vars.scrub) continue
      const want = st.progress, have = a.progress()
      if (Math.abs(want - have) > 0.02) out.lag.push({ id: st.vars.id || (st.trigger && (st.trigger.id || st.trigger.className.toString().slice(0, 24))), want: +want.toFixed(3), have: +have.toFixed(3) })
    }
  }
  return out
}

// Screenshot statistics, decoded in a helper page: a 24x15 grid of mean luminance and contrast.
export async function makeAnalyzer(browser) {
  const ctx = await browser.newContext(); const page = await ctx.newPage()
  await page.setContent('<canvas id=c></canvas>')
  return {
    async stats(buf) {
      return page.evaluate(async b64 => {
        const blob = await (await fetch('data:image/jpeg;base64,' + b64)).blob(); const bmp = await createImageBitmap(blob)
        const GW = 24, GH = 15, S = 8; const c = document.getElementById('c'); c.width = GW * S; c.height = GH * S
        const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(bmp, 0, 0, c.width, c.height)
        const d = x.getImageData(0, 0, c.width, c.height).data; const cells = []; let dark = 0, flat = 0, tot = 0, tot2 = 0
        for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) { let s = 0, s2 = 0; for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) { const i = ((gy * S + yy) * c.width + gx * S + xx) * 4; const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; s += l; s2 += l * l } const m = s / (S * S), sd = Math.sqrt(Math.max(0, s2 / (S * S) - m * m)); cells.push(Math.round(m)); if (m < 14) dark++; if (sd < 2.5) flat++; tot += m; tot2 += m * m }
        const n = GW * GH, mean = tot / n
        return { mean: +mean.toFixed(1), sd: +Math.sqrt(Math.max(0, tot2 / n - mean * mean)).toFixed(1), dark: +(dark / n).toFixed(2), flat: +(flat / n).toFixed(2), cells }
      }, buf.toString('base64'))
    },
    close: () => ctx.close(),
  }
}
export const gridDiff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return +(s / a.length).toFixed(1) }

export async function open(kind, url, opts = {}) {
  const phoneWk = kind === 'phone'
  const browser = await (phoneWk ? webkit : chromium).launch({ headless: true, args: phoneWk ? [] : GPU })
  const ctxOpts = kind === 'desktop' ? { viewport: { width: opts.w || 1440, height: opts.h || 900 }, deviceScaleFactor: opts.dpr || 1 }
    : kind === 'phone' ? { ...devices['iPhone 13'] }
    : { ...devices['iPhone 13'], defaultBrowserType: undefined } // 'touch': Chromium with the iPhone 13 metrics, for real touch flings through CDP
  if (opts.reduced) ctxOpts.reducedMotion = 'reduce'
  if (kind !== 'desktop' && opts.w && opts.h) ctxOpts.viewport = { width: opts.w, height: opts.h }
  const ctx = await browser.newContext(ctxOpts)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0, 240)))
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 240)) })
  await page.addInitScript(instrument)
  if (opts.init) await page.addInitScript(opts.init)
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForTimeout(opts.settle ?? 4500)
  return { browser, ctx, page, errors }
}
export const sections = page => page.evaluate(() => [...document.querySelectorAll('main > *, footer')].map(el => { const s = el.matches('section,footer') ? el : el.querySelector('section'); const r = el.getBoundingClientRect(); return { id: s?.id || el.tagName.toLowerCase(), top: Math.round(r.top + scrollY), h: Math.round(r.height), pinned: el.classList.contains('pin-spacer') } }))
export const save = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 1))
export const wait = ms => new Promise(r => setTimeout(r, ms))
