// Open the built site in a real browser, the way GitHub Pages will serve it, and fail on anything broken:
//   node scripts/film-smoke.mjs [--dist dist] [--also public] [--out dir] [--live] [--throttle] [--only /join/,/minigames/]
// For each page (the film's home, a film page, an old address, a scene's page, the mini games, a game, the admin):
// every request the page makes (none may fail), console errors, whether the film site or the game really started,
// and a screenshot. Then every link and asset the pages name is fetched once (nothing may 404).
// --live      also shoot the same game pages on https://cornellcgs.org and report how much the pictures differ
// --throttle  the first screen of / on a throttled phone line (Lighthouse's mobile preset: 150 ms, 1.6 Mbps, 4x CPU):
//             bytes and requests before the first picture, the film's first live frame and the opening scene ready
// Exit 1 when something failed. Playwright: the repo's, else the Codex runtime's (CGS_PLAYWRIGHT_MODULE to override).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { startPages } from './pages-serve.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d }
const flag = (k) => argv.includes(k)
const DIST = path.resolve(opt('--dist', path.join(REPO, 'dist')))
const ALSO = opt('--also', null)
const OUT = path.resolve(opt('--out', path.join(REPO, 'output/film-smoke')))
const CODEX_PLAYWRIGHT = process.env.CGS_PLAYWRIGHT_MODULE || '/Users/eric/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
async function playwright() {
  try { return await import('playwright') } catch { /* not installed here */ }
  if (fs.existsSync(CODEX_PLAYWRIGHT)) return import(pathToFileURL(CODEX_PLAYWRIGHT).href)
  throw new Error('Playwright was not found: set CGS_PLAYWRIGHT_MODULE to its index.mjs')
}

const PAGES = [
  { path: '/', kind: 'film' },
  { path: '/join/', kind: 'film' },
  { path: '/contact/', kind: 'film' },
  { path: '/film/poker/', kind: 'film' },
  { path: '/minigames/', kind: 'game' },
  { path: '/minigames/inkMaze/', kind: 'game' },
  { path: '/admin/', kind: 'admin' },
]
const only = opt('--only', null)
const pages = only ? PAGES.filter((p) => only.split(',').includes(p.path)) : PAGES
fs.mkdirSync(OUT, { recursive: true })

const { chromium } = await playwright()
const launch = () => chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] }).catch(() => chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] }))
const server = await startPages({ dir: DIST, also: ALSO })
const failures = []
const fail = (m) => { failures.push(m); console.log('  FAIL ' + m) }
const browser = await launch()
const report = { server: server.url, pages: [] }
const sameOrigin = (u) => u.startsWith(server.url)

async function visit(page, url, kind) {
  const reqs = []
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('requestfinished', async (r) => { const res = await r.response(); reqs.push({ url: r.url(), status: res ? res.status() : 0 }) })
  page.on('requestfailed', (r) => reqs.push({ url: r.url(), status: 0, failure: r.failure() && r.failure().errorText }))
  const t0 = Date.now()
  await page.goto(url, { waitUntil: 'load', timeout: 60000 })
  let started = null
  if (kind === 'film') {
    started = await page.waitForFunction(() => window.__site && (window.__site.film || window.__site.calm), null, { timeout: 30000 }).then(() => true, () => false)
    await page.waitForTimeout(6000)
  } else {
    started = await page.waitForFunction(() => { const r = document.getElementById('root'); return r && r.children.length > 0 }, null, { timeout: 30000 }).then(() => true, () => false)
    await page.waitForTimeout(3000)
  }
  const state = await page.evaluate(() => ({
    title: document.title,
    boot: document.documentElement.classList.contains('boot'),
    calm: document.documentElement.classList.contains('calm'),
    host: (document.querySelector('meta[name="cgs-host"]') || {}).content || null,
    canvases: document.querySelectorAll('canvas').length,
    film: window.__cgsFilm || null,
    route: window.__site && window.__site.router ? window.__site.router.current : null,
    words: !!document.querySelector('#words'),
    links: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')),
    assets: [...document.querySelectorAll('link[href],script[src],img[src],source[src]')].map((e) => e.getAttribute('href') || e.getAttribute('src')),
  }))
  return { reqs, errors, started, state, ms: Date.now() - t0 }
}

console.log(`film-smoke: ${DIST}${ALSO ? ' + ' + ALSO : ''} at ${server.url}`)
const linkSet = new Set()
for (const p of pages) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  const r = await visit(page, server.url.replace(/\/$/, '') + p.path, p.kind)
  const shot = path.join(OUT, (p.path.replace(/\//g, '_').replace(/^_|_$/g, '') || 'home') + '.png')
  await page.screenshot({ path: shot })
  // Google's sign-in button refuses any origin but cornellcgs.org's: on a local preview that is expected, not a fault
  const localOnly = (u) => !/cornellcgs\.org/.test(server.url) && /^https:\/\/accounts\.google\.com\/gsi\//.test(u)
  const bad = r.reqs.filter((q) => (q.status === 0 || q.status >= 400) && !localOnly(q.url))
  r.errors = r.errors.filter((e) => !/GSI_LOGGER\]: The given origin is not allowed/.test(e) && !(/status of 403/.test(e) && r.reqs.some((q) => q.status === 403 && localOnly(q.url))))
  r.reqs = r.reqs.filter((q) => !/^(blob|data):/.test(q.url)) // env.asset's blob URLs are the page's own files
  const local = r.reqs.filter((q) => sameOrigin(q.url))
  console.log(`${p.path} [${p.kind}] ${r.started ? 'started' : 'DID NOT START'}; ${local.length} requests here, ${r.reqs.length - local.length} elsewhere; title "${r.state.title}"; ${r.state.canvases} canvas; ${r.errors.length} console errors`)
  if (!r.started) fail(`${p.path}: the ${p.kind === 'film' ? 'film site' : 'app'} did not start`)
  for (const q of bad) fail(`${p.path}: ${q.status || q.failure} ${q.url}`)
  for (const e of r.errors) fail(`${p.path}: console: ${e.slice(0, 300)}`)
  if (p.kind === 'film' && r.state.host !== 'live') fail(`${p.path}: no <meta name="cgs-host" content="live">`)
  if (p.kind === 'game' && r.state.host) fail(`${p.path}: a mini game page carries the film's host meta`)
  for (const h of [...r.state.links, ...r.state.assets]) if (h && !/^(mailto:|tel:|#|javascript:|data:|blob:)/.test(h)) linkSet.add(new URL(h, server.url.replace(/\/$/, '') + p.path).href)
  for (const q of local) linkSet.add(q.url.split('#')[0])
  const hosts = {}
  for (const q of r.reqs.filter((x) => !sameOrigin(x.url))) { const h = new URL(q.url).host; hosts[h] = (hosts[h] || 0) + 1 }
  if (Object.keys(hosts).length) console.log(`  elsewhere: ${Object.entries(hosts).map(([h, n]) => `${h} ${n}`).join(', ')}`)
  report.pages.push({ ...p, started: r.started, requests: local.length, external: hosts, bad, errors: r.errors, state: { ...r.state, links: r.state.links.length, assets: r.state.assets.length }, shot })
  await ctx.close()
}

// every address and file the pages name, once (same origin only), as GitHub Pages would answer it
const crawl = { checked: 0, bad: [] }
for (const u of [...linkSet].filter(sameOrigin)) {
  const res = await fetch(u, { method: 'GET', redirect: 'follow' }).catch((e) => ({ status: 0, statusText: String(e) }))
  crawl.checked++
  if (!res.ok) { crawl.bad.push({ url: u, status: res.status }); fail(`crawl: ${res.status} ${u}`) }
  if (res.body) await res.arrayBuffer().catch(() => {})
}
console.log(`crawl: ${crawl.checked} addresses and files the pages name or asked for, ${crawl.bad.length} not found`)
report.crawl = crawl

// the game pages next to the live site
if (flag('--live')) {
  report.live = []
  for (const p of pages.filter((x) => x.kind === 'game')) {
    const shots = {}
    for (const [name, base] of [['local', server.url.replace(/\/$/, '')], ['live', 'https://cornellcgs.org']]) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' })
      const page = await ctx.newPage()
      await page.goto(base + p.path, { waitUntil: 'load', timeout: 60000 })
      await page.waitForFunction(() => { const r = document.getElementById('root'); return r && r.children.length > 0 }, null, { timeout: 30000 }).catch(() => {})
      await page.waitForTimeout(4000)
      shots[name] = path.join(OUT, `cmp${p.path.replace(/\//g, '_')}${name}.png`)
      await page.screenshot({ path: shots[name] })
      await ctx.close()
    }
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    const diff = await page.evaluate(async ([a, b]) => {
      const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src })
      const [x, y] = await Promise.all([load(a), load(b)])
      const c = document.createElement('canvas'); c.width = x.width; c.height = x.height
      const g = c.getContext('2d')
      g.drawImage(x, 0, 0); const da = g.getImageData(0, 0, c.width, c.height).data
      g.clearRect(0, 0, c.width, c.height); g.drawImage(y, 0, 0); const db = g.getImageData(0, 0, c.width, c.height).data
      let sum = 0, over = 0
      for (let i = 0; i < da.length; i += 4) { const d = (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])) / 3; sum += d; if (d > 24) over++ }
      return { mean: sum / (da.length / 4), changed: over / (da.length / 4) }
    }, ['data:image/png;base64,' + fs.readFileSync(shots.local).toString('base64'), 'data:image/png;base64,' + fs.readFileSync(shots.live).toString('base64')])
    await ctx.close()
    console.log(`${p.path} local vs live: mean difference ${diff.mean.toFixed(2)} of 255, ${(diff.changed * 100).toFixed(2)} % of pixels changed by more than 24`)
    report.live.push({ path: p.path, ...diff, shots })
  }
}

// the first screen on a throttled phone line
if (flag('--throttle')) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  const net = new Map()
  cdp.on('Network.requestWillBeSent', (e) => net.set(e.requestId, { url: e.request.url, start: e.timestamp, type: e.type }))
  cdp.on('Network.loadingFinished', (e) => { const r = net.get(e.requestId); if (r) { r.end = e.timestamp; r.bytes = e.encodedDataLength } })
  await page.addInitScript(() => {
    window.__marks = {}
    const t = () => performance.now()
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__marks.fcp = e.startTime }).observe({ type: 'paint', buffered: true })
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__marks.lcp = e.startTime }).observe({ type: 'largest-contentful-paint', buffered: true })
    const watch = () => {
      if (!document.documentElement) return requestAnimationFrame(watch)
      if (window.__marks.boot == null && !document.documentElement.classList.contains('boot')) window.__marks.boot = t()
      const film = window.__site && window.__site.film
      if (film && !window.__marks.sub) { window.__marks.sub = t(); film.on('state', (s) => { if (s.ready && window.__marks.ready == null) window.__marks.ready = t() }) }
      if (window.__marks.ready == null || window.__marks.boot == null) setTimeout(watch, 16)
    }
    watch()
  })
  const wall0 = Date.now()
  await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 120000 })
  const navStart = await page.evaluate(() => performance.timeOrigin)
  await page.waitForFunction(() => window.__marks && window.__marks.ready != null, null, { timeout: 90000 }).catch(() => {})
  await page.waitForTimeout(500)
  const marks = await page.evaluate(() => window.__marks)
  const t0 = Math.min(...[...net.values()].map((r) => r.start))
  const upTo = (ms) => { const rs = [...net.values()].filter((r) => r.end != null && (r.end - t0) * 1000 <= ms); return { requests: rs.length, bytes: rs.reduce((n, r) => n + (r.bytes || 0), 0), local: rs.filter((r) => sameOrigin(r.url)).length } }
  const at = {}
  for (const k of ['fcp', 'lcp', 'boot', 'ready']) if (marks[k] != null) at[k] = { ms: Math.round(marks[k]), ...upTo(marks[k]) }
  const all = [...net.values()].filter((r) => r.end != null)
  const byType = {}
  for (const r of all.filter((r) => marks.ready == null || (r.end - t0) * 1000 <= marks.ready)) { const k = sameOrigin(r.url) ? (r.url.includes('/film/') ? r.url.split('/film/')[1].split('/')[0] : 'page') : new URL(r.url).host; byType[k] = (byType[k] || 0) + (r.bytes || 0) }
  console.log(`throttled (150 ms, 1.6 Mbps, 4x CPU, 390x844 @3x): ${JSON.stringify(at)}`)
  console.log(`  bytes before the opening scene is ready, by where: ${Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / 1e3).toFixed(0)} kB`).join(', ')}`)
  report.throttle = { at, byType, wallMs: Date.now() - wall0, navStart }
  await page.screenshot({ path: path.join(OUT, 'throttled-phone.png') })
  await ctx.close()
}

await browser.close()
await server.close()
const notFound = server.log.filter((r) => r.status === 404)
report.notFound = notFound
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1))
console.log(`server: ${server.log.length} requests, ${notFound.length} answered 404${notFound.length ? ': ' + [...new Set(notFound.map((r) => r.url))].slice(0, 12).join(' ') : ''}`)
console.log(failures.length ? `film-smoke: ${failures.length} failure(s); screenshots and report.json in ${OUT}` : `film-smoke: everything loaded; screenshots and report.json in ${OUT}`)
process.exit(failures.length ? 1 : 0)
