// Forge or Fold QA harness: the frozen API every feel stream builds its checks on.
// Run with Node 24 (any): node scripts/forge-qa/<check>.mjs [url]. Streams that need more
// helpers add their own module next to this one (strike.mjs, metal.mjs, ...) and fold
// generally useful helpers into this file at integration.
import fs from 'node:fs'
import path from 'node:path'

export const PLAYWRIGHT = process.env.FORGE_PLAYWRIGHT || '/Users/eric/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
const { chromium, webkit } = await import(PLAYWRIGHT)

export const GAME_PATH = '/minigames/forgeOrFold/'
export const URL = process.env.FORGE_URL || 'http://127.0.0.1:4173' + GAME_PATH
export const sleep = ms => new Promise(r => setTimeout(r, ms))

/** Device profiles. Names are frozen; every stream reports metrics per profile name. */
export const PROFILES = {
  desktop: { engine: 'chromium', viewport: { width: 1440, height: 900 }, dpr: 1 },
  'desktop-hidpi': { engine: 'chromium', viewport: { width: 2560, height: 1440 }, dpr: 2 },
  phone: { engine: 'chromium', viewport: { width: 390, height: 844 }, dpr: 3, touch: true, mobile: true },
  landscape: { engine: 'chromium', viewport: { width: 844, height: 390 }, dpr: 3, touch: true, mobile: true },
  'webkit-phone': { engine: 'webkit', viewport: { width: 390, height: 844 }, dpr: 3, touch: true, mobile: true },
  reduced: { engine: 'chromium', viewport: { width: 1440, height: 900 }, dpr: 1, reducedMotion: 'reduce' },
  throttled: { engine: 'chromium', viewport: { width: 1440, height: 900 }, dpr: 1, throttle: { downloadKbps: 12000, uploadKbps: 4000, latencyMs: 70, cpu: 4 } },
}
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
// GPU Chromium: the channel build with ANGLE on Metal, validated against the live draw-call counts.
const CHROMIUM_ARGS = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required']

/**
 * Instrumentation injected before any page script:
 * - window.__forge.events: every forge-unity CustomEvent {t, type, id, spot, x, y} (label/position/hover excluded unless all=true)
 * - window.__forge.input: keydown/keyup/pointerdown/pointerup/touchstart with page-clock timestamps
 * - window.__forge.raf: rAF timestamps (ring buffer)
 * - window.__forge.dc: per-frame WebGL draw calls and triangles (ring buffer of [calls, tris, t])
 * - window.__forge.audio / vibrate: AudioScheduledSourceNode.start and navigator.vibrate calls
 */
function INIT() {
  const T = () => performance.now()
  const F = window.__forge = { events: [], input: [], raf: [], dc: [], audio: [], vibrate: [], telemetry: [], all: false }
  const ring = (a, n) => { if (a.length > n) a.splice(0, a.length - n) }
  const orig = EventTarget.prototype.dispatchEvent
  EventTarget.prototype.dispatchEvent = function (e) {
    if (e && e.type === 'forge-unity') {
      const d = e.detail || {}
      if (F.all || (d.type !== 'position' && d.type !== 'label' && d.type !== 'hover' && d.type !== 'perf')) { F.events.push({ t: T(), type: d.type, id: d.id, spot: d.spot, x: d.x, y: d.y }); ring(F.events, 20000) }
      if (d.type === 'telemetry') { try { F.telemetry.push({ t: T(), ...JSON.parse(d.spot) }) } catch { /* malformed */ } ring(F.telemetry, 20000) }
    }
    return orig.call(this, e)
  }
  for (const ev of ['keydown', 'keyup', 'pointerdown', 'pointerup', 'touchstart', 'touchend'])
    window.addEventListener(ev, e => { F.input.push({ t: T(), type: ev, key: e.code || '', ts: e.timeStamp, x: e.clientX, y: e.clientY }); ring(F.input, 5000) }, true)
  const s = { calls: 0, tris: 0 }
  const wrap = proto => {
    for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) {
      const f = proto[name]; if (!f) continue
      proto[name] = function (...a) { s.calls++; const mode = a[0]; const count = name.startsWith('drawArrays') ? a[2] : (name === 'drawRangeElements' ? a[3] : a[1]); const inst = name.endsWith('Instanced') ? a[a.length - 1] : 1; if (mode === 4) s.tris += (count / 3) * inst; return f.apply(this, a) }
    }
  }
  if (window.WebGL2RenderingContext) wrap(WebGL2RenderingContext.prototype)
  if (window.WebGLRenderingContext) wrap(WebGLRenderingContext.prototype)
  const loop = t => { F.raf.push(t); ring(F.raf, 30000); F.dc.push([s.calls, Math.round(s.tris), t]); ring(F.dc, 30000); s.calls = 0; s.tris = 0; requestAnimationFrame(loop) }
  requestAnimationFrame(loop)
  const AS = window.AudioScheduledSourceNode
  if (AS) { const start = AS.prototype.start; AS.prototype.start = function (when, ...rest) { const c = this.context; F.audio.push({ t: T(), node: this.constructor.name, when: when || 0, now: c.currentTime, freq: this.frequency ? this.frequency.value : undefined }); ring(F.audio, 5000); return start.call(this, when, ...rest) } }
  try { const vib = navigator.vibrate ? navigator.vibrate.bind(navigator) : null; navigator.vibrate = p => { F.vibrate.push({ t: T(), p: JSON.stringify(p) }); return vib ? vib(p) : true } } catch { /* read-only */ }
}

/** Launch a profile. Returns a handle used by every other helper. */
export async function launch(kind = 'desktop', { out, label } = {}) {
  const prof = PROFILES[kind]; if (!prof) throw new Error('unknown profile ' + kind)
  const browser = prof.engine === 'webkit' ? await webkit.launch() : await chromium.launch({ channel: 'chromium', args: CHROMIUM_ARGS })
  const opts = { viewport: prof.viewport, deviceScaleFactor: prof.dpr || 1 }
  if (prof.touch) opts.hasTouch = true
  if (prof.mobile && prof.engine !== 'webkit') { opts.isMobile = true; opts.userAgent = IPHONE_UA }
  if (prof.mobile && prof.engine === 'webkit') opts.isMobile = true
  if (prof.reducedMotion) opts.reducedMotion = prof.reducedMotion
  const context = await browser.newContext(opts)
  await context.addInitScript(INIT)
  const page = await context.newPage()
  const dir = out || path.join(process.env.FORGE_QA_OUT || path.resolve('output/forge-qa'), label || kind)
  fs.mkdirSync(dir, { recursive: true })
  const consoleLines = [], signInLines = []
  // Google Sign-In (the site's account control) refuses origins its OAuth client does not list, i.e. every local
  // server: a 403 for its button and a GSI_LOGGER line, both from accounts.google.com/gsi. Kept apart, not counted.
  page.on('console', m => { const line = `[${m.type()}] ${m.text()}`.slice(0, 500), from = m.location?.()?.url || ''; if (/^https:\/\/accounts\.google\.com\/gsi\//.test(from) && /origin is not allowed|status of 403/.test(m.text())) signInLines.push(line); else consoleLines.push(line) })
  page.on('pageerror', e => consoleLines.push(`[pageerror] ${e.message}`))
  let cdp = null
  const net = { bytes: 0, requests: [] }
  if (prof.engine === 'chromium') {
    cdp = await context.newCDPSession(page); await cdp.send('Network.enable')
    const urls = {}
    cdp.on('Network.responseReceived', e => { urls[e.requestId] = { url: e.response.url, status: e.response.status } })
    cdp.on('Network.loadingFinished', e => { net.bytes += e.encodedDataLength; const u = urls[e.requestId]; net.requests.push({ url: u?.url, status: u?.status, bytes: e.encodedDataLength }) })
    if (prof.throttle) {
      const t = prof.throttle
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: t.latencyMs, downloadThroughput: t.downloadKbps * 1000 / 8, uploadThroughput: t.uploadKbps * 1000 / 8 })
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: t.cpu })
    }
  } else {
    page.on('requestfinished', async r => { try { const s = await r.sizes(); net.bytes += s.responseBodySize + s.responseHeadersSize; net.requests.push({ url: r.url(), bytes: s.responseBodySize }) } catch { /* aborted */ } })
  }
  const h = { kind, profile: prof, browser, context, page, cdp, out: dir, net, consoleLines, signInLines, engine: prof.engine }
  h.shot = async (name, o = {}) => { const p = path.join(dir, name + '.png'); await page.screenshot({ path: p, ...o }); return p }
  h.close = async () => { await browser.close() }
  return h
}

/** Page clock now (ms since navigation start). */
export const now = h => h.page.evaluate(() => performance.now())

/**
 * Open the game and wait until it is playable (Unity 'ready' plus an enabled Forge button).
 * telemetry: adds ?forge-telemetry=1 (Unity streams 'telemetry' messages after Qa('telemetry')).
 * qa: Unity QA modes for ?forge-unity-qa= (steady, void, swatch). fixture: dev-only ?forge-qa= replay fixture.
 * Every launch() is a fresh browser context, so the run starts from a new save.
 * Returns {readyMs (Unity ready, page clock), playableMs, dclMs, protocol (ready.x: 0 = pre-contract build)}.
 */
export async function open(h, url = URL, { telemetry = false, qa = [], fixture, timeout = 120000 } = {}) {
  const u = new globalThis.URL(url)
  if (telemetry) u.searchParams.set('forge-telemetry', '1')
  if (qa.length) u.searchParams.set('forge-unity-qa', qa.join(','))
  if (fixture) u.searchParams.set('forge-qa', fixture)
  await h.page.goto(u.toString(), { waitUntil: 'domcontentloaded', timeout })
  await h.page.waitForFunction(() => window.__forge.events.some(e => e.type === 'ready'), null, { timeout })
  await h.page.waitForFunction(() => { const b = document.querySelector('.ff-strike'); return b && !b.disabled }, null, { timeout })
  return h.page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; const r = window.__forge.events.find(e => e.type === 'ready'); return { readyMs: Math.round(r.t), playableMs: Math.round(performance.now()), dclMs: Math.round(n?.domContentLoadedEventEnd || 0), protocol: r.x || 0 } })
}

/** Unity-to-web messages since page time `since` (optionally of one type). */
export const unityEvents = (h, since = 0, type) => h.page.evaluate(([s, ty]) => window.__forge.events.filter(e => e.t >= s && (!ty || e.type === ty)), [since, type])
/** Wait for a Unity message of `type` after `since`; resolves to the event or null. */
export async function waitEvent(h, type, since = 0, timeout = 5000) {
  try { return await h.page.waitForFunction(([ty, s]) => window.__forge.events.find(e => e.type === ty && e.t >= s) || null, [type, since], { timeout, polling: 10 }).then(r => r.jsonValue()) } catch { return null }
}
/** Telemetry frames (parsed JSON of Unity 'telemetry' messages) since `since`. */
export const telemetry = (h, since = 0) => h.page.evaluate(s => window.__forge.telemetry.filter(e => e.t >= s), since)
export const inputs = (h, since = 0) => h.page.evaluate(s => window.__forge.input.filter(e => e.t >= s), since)
export const audioStarts = (h, since = 0) => h.page.evaluate(s => window.__forge.audio.filter(e => e.t >= s), since)

/** Press a key (code) and return the page-clock time of its keydown. */
export async function press(h, code = 'Space', holdMs = 30) {
  const before = await now(h)
  await h.page.keyboard.down(code); await sleep(holdMs); await h.page.keyboard.up(code)
  const e = (await inputs(h, before)).find(x => x.type === 'keydown' && x.key === code)
  return e ? e.t : before
}
/** Tap at CSS pixel (x, y) on a touch profile (mouse click otherwise); returns the pointerdown time. */
export async function tap(h, x, y) {
  const before = await now(h)
  if (h.profile.touch) await h.page.touchscreen.tap(x, y); else await h.page.mouse.click(x, y)
  const e = (await inputs(h, before)).find(i => i.type === 'pointerdown' || i.type === 'touchstart')
  return e ? e.t : before
}
/** Centre of the first element matching `sel` in CSS pixels, or null. */
export async function center(h, sel) { const b = await h.page.locator(sel).first().boundingBox(); return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2, box: b } : null }
/** Activate the HUD's Forge/Start button (tap on touch profiles); returns the input time. */
export async function forgeButton(h) { const c = await center(h, '.ff-strike'); return c ? tap(h, c.x, c.y) : null }

/** Snapshot of the HUD and scene datasets. */
export function hud(h) {
  return h.page.evaluate(() => {
    const q = s => document.querySelector(s), txt = s => q(s)?.textContent?.trim()
    const scene = q('[data-testid=forge-scene]')
    return { renderer: scene?.dataset.renderer, quality: scene?.dataset.quality, station: scene?.dataset.station, title: txt('.ff-blade-title'), value: txt('.ff-blade-value strong'), feedback: txt('.ff-feedback'), strike: q('.ff-strike')?.getAttribute('aria-label'), strikeDisabled: q('.ff-strike')?.disabled, flow: q('.ff-flow')?.getAttribute('aria-label'), dialog: q('dialog[open] h2')?.textContent || null, canvas: (c => c ? { w: c.width, h: c.height, cssW: c.clientWidth, cssH: c.clientHeight } : null)(q('canvas')) }
  })
}

/** rAF frame-time stats between page times a and b. */
export function frameTimes(h, a, b) {
  return h.page.evaluate(([a, b]) => {
    const r = window.__forge.raf.filter(t => t >= a && t <= b), d = []
    for (let i = 1; i < r.length; i++) d.push(r[i] - r[i - 1])
    d.sort((x, y) => x - y); const q = p => d.length ? +d[Math.min(d.length - 1, Math.floor(p * d.length))].toFixed(2) : null
    const sum = d.reduce((x, y) => x + y, 0)
    return { frames: r.length, fps: d.length ? +(1000 / (sum / d.length)).toFixed(1) : null, p50: q(.5), p95: q(.95), p99: q(.99), max: d.length ? +d[d.length - 1].toFixed(2) : null, over33: d.filter(x => x > 33.4).length, over100: d.filter(x => x > 100).length }
  }, [a, b])
}
/** Run fn while sampling; returns {result, frames: frameTimes} over the run. */
export async function sampleFrames(h, fn) { const a = await now(h); const result = await fn(); const b = await now(h); return { result, frames: await frameTimes(h, a, b) } }

/** Per-frame draw calls and triangles between page times a and b. */
export function drawCalls(h, a, b) {
  return h.page.evaluate(([a, b]) => {
    const f = window.__forge.dc.filter(x => x[2] >= a && x[2] <= b && x[0] > 0)
    const c = f.map(x => x[0]).sort((x, y) => x - y), t = f.map(x => x[1]).sort((x, y) => x - y)
    const q = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : null
    return { frames: f.length, calls_med: q(c, .5), calls_p95: q(c, .95), calls_max: c.at(-1) ?? null, tris_med: q(t, .5), tris_max: t.at(-1) ?? null }
  }, [a, b])
}
/** Sample draw calls for `ms` of wall time from now. */
export async function sampleDrawCalls(h, ms = 1200) { const a = await now(h); await sleep(ms); return drawCalls(h, a, await now(h)) }

/** Transfer bytes so far: total encoded bytes plus the Unity build files. */
export function transferBytes(h) {
  const by = re => h.net.requests.filter(r => re.test(r.url || '')).reduce((s, r) => s + (r.bytes || 0), 0)
  return { total: h.net.bytes, data: by(/forge\.data/), wasm: by(/forge\.wasm/), framework: by(/forge\.framework/), loader: by(/forge\.loader/), art: by(/assets\/forge\//), requests: h.net.requests.length }
}

/**
 * CDP screencast of composited frames with page-clock timestamps (WebKit: a screenshot loop).
 * Returns {frames:[{file,t}], result, dir}.
 */
export async function screencast(h, name, fn, { quality = 70, maxWidth = 960, format = 'jpeg' } = {}) {
  const dir = path.join(h.out, name); fs.mkdirSync(dir, { recursive: true })
  const frames = []
  if (!h.cdp) {
    let stop = false, i = 0
    const loop = (async () => { while (!stop) { const t = await now(h); const f = path.join(dir, String(i++).padStart(4, '0') + '.jpg'); await h.page.screenshot({ path: f, type: 'jpeg', quality }); frames.push({ file: f, t }) } })()
    let result; try { result = await fn() } finally { stop = true; await loop }
    fs.writeFileSync(path.join(dir, 'frames.json'), JSON.stringify(frames, null, 1)); return { frames, result, dir }
  }
  const origin = await h.page.evaluate(() => performance.timeOrigin)
  let i = 0
  const handler = async e => { const f = path.join(dir, String(i++).padStart(4, '0') + (format === 'png' ? '.png' : '.jpg')); fs.writeFileSync(f, Buffer.from(e.data, 'base64')); frames.push({ file: f, t: e.metadata.timestamp * 1000 - origin }); try { await h.cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }) } catch { /* closed */ } }
  h.cdp.on('Page.screencastFrame', handler)
  await h.cdp.send('Page.startScreencast', { format, quality, maxWidth, maxHeight: 2000, everyNthFrame: 1 })
  let result
  try { result = await fn() } finally { await h.cdp.send('Page.stopScreencast'); h.cdp.off('Page.screencastFrame', handler) }
  frames.sort((a, b) => a.t - b.t)
  fs.writeFileSync(path.join(dir, 'frames.json'), JSON.stringify(frames, null, 1))
  return { frames, result, dir }
}

// ---------- Image metrics, computed in a scratch page of the same browser (no native deps) ----------
const dataUrl = f => 'data:image/' + (f.endsWith('.png') ? 'png' : 'jpeg') + ';base64,' + fs.readFileSync(f).toString('base64')
async function lab(h) {
  if (h._lab) return h._lab
  const page = await h.context.newPage()
  await page.setContent('<html><body></body></html>')
  await page.evaluate(() => {
    window.__img = async src => { const i = new Image(); i.src = src; await i.decode(); const c = new OffscreenCanvas(i.naturalWidth, i.naturalHeight), g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(i, 0, 0); return g.getImageData(0, 0, c.width, c.height) }
    // region: [x0, y0, x1, y1] as fractions of the image (default whole image)
    window.__rect = (im, r = [0, 0, 1, 1]) => [Math.floor(r[0] * im.width), Math.floor(r[1] * im.height), Math.ceil(r[2] * im.width), Math.ceil(r[3] * im.height)]
    window.__luma = (d, i) => .2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2]
  })
  h._lab = page
  return page
}
/** Mean absolute luma difference (0-255) between two frames inside a fractional region. */
export async function frameDiff(h, a, b, region) {
  return (await lab(h)).evaluate(async ([a, b, r]) => {
    const A = await window.__img(a), B = await window.__img(b); const [x0, y0, x1, y1] = window.__rect(A, r); let s = 0, n = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * A.width + x) * 4; s += Math.abs(window.__luma(A.data, i) - window.__luma(B.data, i)); n++ }
    return n ? s / n : 0
  }, [dataUrl(a), dataUrl(b), region])
}
/** Mean absolute luma difference per cell of a cols x rows grid (row-major array). */
export async function gridDiff(h, a, b, cols = 12, rows = 8) {
  return (await lab(h)).evaluate(async ([a, b, cols, rows]) => {
    const A = await window.__img(a), B = await window.__img(b); const out = new Array(cols * rows).fill(0), n = new Array(cols * rows).fill(0)
    for (let y = 0; y < A.height; y += 2) for (let x = 0; x < A.width; x += 2) { const i = (y * A.width + x) * 4, c = Math.min(rows - 1, (y * rows / A.height) | 0) * cols + Math.min(cols - 1, (x * cols / A.width) | 0); out[c] += Math.abs(window.__luma(A.data, i) - window.__luma(B.data, i)); n[c]++ }
    return out.map((s, i) => n[i] ? s / n[i] : 0)
  }, [dataUrl(a), dataUrl(b), cols, rows])
}
/**
 * Hit-stop seen on screen. The hammer cell is the grid cell the hammer moves into on the contact
 * frame and out of afterwards (min of the arrival diff and the contact-to-+220 ms diff); the
 * hit-stop is the run of frames after the impact in which that cell holds still (diff < still).
 * Returns {ms, frames, cell}. A pure ease-out start also reads as a short hold, so compare runs.
 */
export async function hitStopFromFrames(h, frames, impactT, { cols = 12, rows = 8, still = .3 } = {}) {
  // The contact pose is first composited in the frame after the impact message.
  const before = frames.filter(f => f.t <= impactT).at(-1), post = frames.filter(f => f.t > impactT && f.t < impactT + 400)
  if (!before || post.length < 3) return { ms: null, frames: 0 }
  const later = frames.find(f => f.t >= post[0].t + 220) || frames.at(-1)
  const arrive = await gridDiff(h, before.file, post[0].file, cols, rows), leave = await gridDiff(h, post[0].file, later.file, cols, rows)
  let cell = 0; const score = arrive.map((v, i) => Math.min(v, leave[i])); score.forEach((v, i) => { if (v > score[cell]) cell = i })
  let start = null, end = null, n = 0
  for (let i = 1; i < post.length; i++) {
    const d = (await gridDiff(h, post[i - 1].file, post[i].file, cols, rows))[cell]
    if (d < still) { if (start == null) start = post[i - 1].t; end = post[i].t; n++ } else if (start != null) break
  }
  return { ms: start == null ? 0 : +(end - start).toFixed(1), frames: n, cell: [cell % cols, (cell / cols) | 0] }
}
/** Mean luma (0-255) of a fractional region. */
export async function lumaPatch(h, file, region) {
  return (await lab(h)).evaluate(async ([f, r]) => { const A = await window.__img(f); const [x0, y0, x1, y1] = window.__rect(A, r); let s = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += window.__luma(A.data, (y * A.width + x) * 4); n++ } return n ? s / n : 0 }, [dataUrl(file), region])
}
/** Hue (deg), saturation (0-1) and luma of the brightest `pct` of pixels in a region (optionally excluding near-white). */
export async function hueSatOfBrightest(h, file, region, pct = .02) {
  return (await lab(h)).evaluate(async ([f, r, pct]) => {
    const A = await window.__img(f); const [x0, y0, x1, y1] = window.__rect(A, r); const px = []
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * A.width + x) * 4; px.push([window.__luma(A.data, i), A.data[i], A.data[i + 1], A.data[i + 2]]) }
    px.sort((p, q) => q[0] - p[0]); const top = px.slice(0, Math.max(1, Math.floor(px.length * pct)))
    let R = 0, G = 0, B = 0, L = 0; for (const p of top) { L += p[0]; R += p[1]; G += p[2]; B += p[3] } const n = top.length; R /= n; G /= n; B /= n; L /= n
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn; let hue = 0
    if (d > 0) hue = mx === R ? 60 * (((G - B) / d) % 6) : mx === G ? 60 * ((B - R) / d + 2) : 60 * ((R - G) / d + 4); if (hue < 0) hue += 360
    return { hue: +hue.toFixed(1), sat: +(mx ? d / mx : 0).toFixed(3), luma: +L.toFixed(1), rgb: [Math.round(R), Math.round(G), Math.round(B)], pixels: n }
  }, [dataUrl(file), region, pct])
}
/**
 * Bright streaks: connected components of pixels with luma > threshold whose bounding-box
 * aspect exceeds `aspect` and whose length exceeds `minLen` of the image width (the laser-trail bug).
 * Also returns `blobs`: components of at least `minBlobPx` pixels (for flake visibility checks).
 */
export async function laserTrailCount(h, file, { threshold = 200, aspect = 12, minLen = .06, region, minBlobPx = 4 } = {}) {
  return (await lab(h)).evaluate(async ([f, o]) => {
    const A = await window.__img(f); const [x0, y0, x1, y1] = window.__rect(A, o.region); const W = x1 - x0, H = y1 - y0
    const on = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) on[y * W + x] = window.__luma(A.data, ((y + y0) * A.width + x + x0) * 4) > o.threshold ? 1 : 0
    const seen = new Uint8Array(W * H); let trails = 0, blobs = 0; const stack = []
    for (let s = 0; s < W * H; s++) { if (!on[s] || seen[s]) continue; let mnx = 1e9, mny = 1e9, mxx = -1, mxy = -1, n = 0; stack.push(s); seen[s] = 1
      while (stack.length) { const p = stack.pop(), x = p % W, y = (p / W) | 0; n++; if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y
        for (const q of [p - 1, p + 1, p - W, p + W, p - W - 1, p - W + 1, p + W - 1, p + W + 1]) if (q >= 0 && q < W * H && on[q] && !seen[q] && Math.abs((q % W) - x) <= 1) { seen[q] = 1; stack.push(q) } }
      const bw = mxx - mnx + 1, bh = mxy - mny + 1, len = Math.hypot(bw, bh), wid = Math.max(1, n / len)
      if (len / wid > o.aspect && len > o.minLen * A.width) trails++; if (n >= o.minBlobPx) blobs++ }
    return { trails, blobs }
  }, [dataUrl(file), { threshold, aspect, minLen, region, minBlobPx }])
}
/** Contact sheet PNG of frames (labels optional), rendered in the lab page. */
export async function contactSheet(h, files, outFile, { cols = 6, width = 320, labels = [] } = {}) {
  const page = await lab(h)
  const html = `<html><body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${cols},${width}px);gap:2px;font:12px monospace;color:#ff0">${files.map((f, i) => `<div style="position:relative"><img src="${dataUrl(f)}" style="width:${width}px;display:block"><span style="position:absolute;left:3px;top:2px;background:#000a;padding:1px 3px">${labels[i] ?? i}</span></div>`).join('')}</body></html>`
  await page.setContent(html); await page.waitForTimeout(150); await page.screenshot({ path: outFile, fullPage: true })
  await page.setContent('<html><body></body></html>')
  return outFile
}

// ---------- Common measurements ----------
const median = a => { const s = [...a].filter(x => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null }
const pct = (a, p) => { const s = [...a].filter(x => x != null).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null }
export const stats = { median, pct }

/** Ensure a heated knife is on the anvil (Start forging if needed). Returns true when Forge is armed. */
export async function ensureForging(h, timeout = 9000) {
  const st = await hud(h); if (st.strike === 'Forge') return true
  if (h.profile.touch) await forgeButton(h); else await press(h, 'Space')
  try { await h.page.waitForFunction(() => document.querySelector('.ff-strike')?.getAttribute('aria-label') === 'Forge' && !document.querySelector('.ff-strike').disabled, null, { timeout }) } catch { return false }
  await sleep(300); return true
}
/**
 * One strike from an explicit press: returns {inputT, swingMs, impactMs, settledMs, outcome}. Times are ms after input.
 * how: 'key' (Space) or 'button' (HUD Forge button).
 */
export async function strike(h, how = h.profile.touch ? 'button' : 'key', { wait = true } = {}) {
  const t0 = how === 'key' ? await press(h, 'Space') : await forgeButton(h)
  if (!wait) return { inputT: t0 }
  const settled = await waitEvent(h, 'settled', t0, 4000)
  const ev = await unityEvents(h, t0)
  const at = type => { const e = ev.find(x => x.type === type); return e ? +(e.t - t0).toFixed(1) : null }
  const st = await hud(h)
  return { inputT: t0, swingMs: at('swing'), impactMs: at('impact'), settledMs: settled ? +(settled.t - t0).toFixed(1) : null, feedback: st.feedback }
}

export function save(h, name, data) { const f = path.join(h.out, name); fs.writeFileSync(f, typeof data === 'string' ? data : JSON.stringify(data, null, 1)); return f }
export function writeJson(file, data) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 1) + '\n'); return file }
