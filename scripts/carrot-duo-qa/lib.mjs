// Shared helpers of the duo/endless presentation QA (shots.mjs, perf.mjs): a static server for harness.html plus a CARROT_QA Web
// player (CarrotDuoBuild.WebQaDuo, output/carrot-qa), Playwright pages (Chromium and WebKit from the Codex runtime) and the DuoQa
// command wrappers. Nothing here touches the live site or saves; every browser context is throwaway.
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, extname, normalize, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const RT = process.env.CGS_PLAYWRIGHT_MODULE ? dirname(dirname(process.env.CGS_PLAYWRIGHT_MODULE)) : '/Users/eric/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'
export const pw = await import(RT + '/playwright/index.mjs')
const pngjs = await import(RT + '/pngjs/lib/png.js'); export const PNG = pngjs.PNG || pngjs.default.PNG
export const pixelmatch = (await import(RT + '/pixelmatch/index.js')).default

const here = dirname(fileURLToPath(import.meta.url))
export const REPO = resolve(here, '../..')
export const sleep = ms => new Promise(r => setTimeout(r, ms))
export const arg = (name, d) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : d }
export const flag = name => process.argv.includes('--' + name)

const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.wasm': 'application/wasm', '.data': 'application/octet-stream', '.json': 'application/json', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg' }
/** Serves harness.html at / and a Unity Web build (gzip .unityweb with Content-Encoding) from `build`. Resolves to the base URL. */
export function serve(build, port = 0) {
  return new Promise(res => {
    const server = createServer((req, out) => {
      let path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
      const file = path === '/' || path === '/harness.html' ? join(here, 'harness.html') : join(build, normalize(path).replace(/^(\.\.[/\\])+/, ''))
      if (!existsSync(file) || statSync(file).isDirectory()) { out.writeHead(404); out.end('missing ' + path); return }
      const headers = { 'Cache-Control': 'no-store' }; let name = file
      if (name.endsWith('.unityweb')) { headers['Content-Encoding'] = 'gzip'; name = name.slice(0, -'.unityweb'.length) }
      headers['Content-Type'] = types[extname(name)] || 'application/octet-stream'
      out.writeHead(200, headers); out.end(readFileSync(file))
    })
    server.listen(port, '127.0.0.1', () => res({ server, url: `http://127.0.0.1:${server.address().port}/` }))
  })
}

/** Launches a browser context on the harness. size: [w,h]; phone: emulate a touch phone (Pixel 7 / iPhone 13 metrics). */
export async function open({ engine = 'chromium', url, name = 'carrot-qa', size = [1440, 900], phone = false, reducedMotion = false, dpr = 1, throttle = 0, headed = false } = {}) {
  const type = engine === 'webkit' ? pw.webkit : pw.chromium
  const browser = await type.launch(engine === 'chromium' ? { channel: 'chromium', headless: !headed, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] } : { headless: !headed })
  const opts = { viewport: { width: size[0], height: size[1] }, deviceScaleFactor: dpr }
  if (phone) { opts.hasTouch = true; if (engine === 'chromium') opts.isMobile = true; opts.userAgent = engine === 'webkit' ? pw.devices['iPhone 13'].userAgent : pw.devices['Pixel 7'].userAgent }
  if (reducedMotion) opts.reducedMotion = 'reduce'
  const context = await browser.newContext(opts)
  await context.addInitScript('window.__carrotDisplayPeriod = 16.67;')
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(String(e)))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)) })
  let cdp = null
  if (engine === 'chromium' && throttle > 1) { cdp = await context.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle }) }
  const t0 = Date.now()
  await page.goto(url + '?name=' + name, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.qa && (window.qa.ready || window.qa.error), null, { timeout: 300000 })
  const err = await page.evaluate(() => window.qa.error)
  if (err) throw new Error('unity failed: ' + err)
  return { browser, context, page, errors, engine, size, phone, cdp, loadSeconds: (Date.now() - t0) / 1000 }
}
export const cmd = (page, c) => page.evaluate(c => window.qa.cmd(c), c)
export const duo = (page, c) => page.evaluate(c => window.qa.duo(c), c)
export const send = (page, m, v = '') => page.evaluate(([m, v]) => window.qa.send(m, v), [m, v])
export const state = page => page.evaluate(() => window.qa.state)
export async function waitFor(page, fn, a, timeout = 120000, every = 200) {
  const t0 = Date.now()
  for (;;) { const v = await page.evaluate(fn, a).catch(() => null); if (v) return v; if (Date.now() - t0 > timeout) throw new Error('timeout ' + fn.toString().slice(0, 90)); await sleep(every) }
}
/** Sends DuoQa {t:'probe', what} and waits for its CARROT_DUO_QA line. */
export async function probe(page, what = 'view', extra = {}) {
  const since = await page.evaluate(() => performance.now())
  await duo(page, { t: 'probe', what, ...extra })
  return waitFor(page, ([k, s]) => window.qa.probe(k, s), [what, since], 30000, 100)
}
export async function loadSolo(page, level, settle = 2600) {
  await cmd(page, { type: 'load', level })
  await waitFor(page, l => window.qa.state && window.qa.state.level === l && window.qa.state.phase === 'ready', level, 120000)
  await sleep(settle)
}
export function savePng(file, buffer) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, buffer) }
/** Pixel difference of two same-size PNG files: { diff fraction over threshold, mean abs luminance delta }. */
export function diffPng(a, b, out, threshold = .12) {
  const A = PNG.sync.read(readFileSync(a)), B = PNG.sync.read(readFileSync(b))
  if (A.width !== B.width || A.height !== B.height) return { error: 'size', a: [A.width, A.height], b: [B.width, B.height] }
  const D = new PNG({ width: A.width, height: A.height })
  const n = pixelmatch(A.data, B.data, D.data, A.width, A.height, { threshold, includeAA: false })
  if (out) writeFileSync(out, PNG.sync.write(D))
  let sum = 0; for (let i = 0; i < A.data.length; i += 4) sum += Math.abs((A.data[i] * .2126 + A.data[i + 1] * .7152 + A.data[i + 2] * .0722) - (B.data[i] * .2126 + B.data[i + 1] * .7152 + B.data[i + 2] * .0722))
  return { pixels: n, fraction: n / (A.width * A.height), meanLumaDelta: sum / (A.width * A.height) }
}
export function frameStats(frames) {
  const iv = frames.map(f => f[0]).sort((a, b) => a - b); if (!iv.length) return null
  const q = p => iv[Math.min(iv.length - 1, Math.floor(p * iv.length))]; const total = iv.reduce((s, x) => s + x, 0)
  const d = frames.map(f => f[2] || 0).filter(x => x > 0).sort((a, b) => a - b)
  return { frames: iv.length, mean: Math.round(total / iv.length * 100) / 100, p50: q(.5), p95: q(.95), p99: q(.99), max: iv[iv.length - 1], drawsMedian: d.length ? d[d.length >> 1] : 0 }
}
