/**
 * Ink Maze level 26: helpers for testing the code sandbox and its language
 * runtimes in real browsers (Chromium and WebKit, through Playwright).
 *
 *   import { launch, devServer, openCodePage, cpuMeter, runOnPage } from './inkmaze-code-browser.mjs'
 *
 *   const server = await devServer()              // CGS_TEST_URL, or a Vite dev server of this checkout on a free port
 *   const browser = await launch('webkit')        // or 'chromium'
 *   const meter = cpuMeter()                      // before launch, so it knows which processes are new
 *   const page = await openCodePage(browser, server.base)
 *   const result = await runOnPage(page, { language: 'python', source, tests, kind: 'run' })
 *   meter.capture(); const cores = await meter.cores(1500)   // CPU the browser burns now (D9)
 *   await browser.close(); server.stop()
 *
 * The page is a blank document on the dev server's origin with
 * window.inkCode = { CodeSandbox, problem, contract } and one sandbox in
 * window.sb (made by openCodePage). Set CGS_PLAYWRIGHT_MODULE to a Playwright
 * module path when `playwright` is not installed in this repo.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CODEX_PLAYWRIGHT = '/Users/eric/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

export const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function playwright() {
  if (process.env.CGS_PLAYWRIGHT_MODULE) return import(process.env.CGS_PLAYWRIGHT_MODULE)
  try { return await import('playwright') } catch { /* not installed here */ }
  if (existsSync(CODEX_PLAYWRIGHT)) return import(CODEX_PLAYWRIGHT)
  throw new Error('Playwright was not found: set CGS_PLAYWRIGHT_MODULE to its index.mjs')
}

export async function launch(name) {
  const { chromium, webkit } = await playwright()
  if (name === 'webkit') return webkit.launch()
  if (name === 'chromium') return chromium.launch({ channel: 'chromium' })
  throw new Error(`unknown browser ${name}`)
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

/**
 * The site to test against: CGS_TEST_URL when set (a server you started),
 * otherwise a Vite dev server of this checkout on a free port, stopped by stop().
 */
export async function devServer() {
  if (process.env.CGS_TEST_URL) return { base: process.env.CGS_TEST_URL.replace(/\/$/, ''), stop() {} }
  const port = await freePort()
  const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
  const child = spawn(process.execPath, [vite, '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
  let log = ''
  child.stdout.on('data', (d) => { log += d })
  child.stderr.on('data', (d) => { log += d })
  const stop = () => { if (child.exitCode === null) child.kill('SIGTERM') }
  process.on('exit', stop)
  const base = `http://127.0.0.1:${port}`
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`vite exited: ${log}`)
    try {
      const response = await fetch(`${base}/minigames/ink-maze-code/sandbox.html`)
      if (response.ok) return { base, stop }
    } catch { /* not up yet */ }
    await pause(200)
  }
  stop()
  throw new Error(`vite did not start on ${port}: ${log}`)
}

/** The blank test page, served by page.route on the site's own origin. */
const TEST_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Ink Maze code sandbox test</title></head>
<body>
<script type="module">
  import * as sandbox from '/src/minigames/inkmaze/code/sandbox.ts'
  import * as problem from '/src/minigames/inkmaze/code/problem.ts'
  import * as contract from '/src/minigames/inkmaze/code/contract.ts'
  window.inkCode = { ...sandbox, problem, contract }
</script>
</body></html>`

export const TEST_PAGE_PATH = '/__inkmaze-code-test__.html'

/**
 * Opens the test page in a fresh context and makes window.sb, a CodeSandbox
 * whose state changes are logged in window.states. `requests` collects every
 * URL the page and its frames and workers ask for.
 */
export async function openCodePage(browser, base, { debug = false } = {}) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const requests = []
  const errors = []
  page.on('request', (request) => requests.push(request.url()))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', (error) => errors.push(String(error)))
  const url = `${base}${TEST_PAGE_PATH}`
  await page.route(url, (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: TEST_PAGE }))
  await page.goto(url)
  await page.waitForFunction(() => window.inkCode, null, { timeout: 30_000 })
  await page.evaluate((debug) => {
    window.sb = new window.inkCode.CodeSandbox({ debug })
    window.states = []
    window.sb.subscribe(() => {
      const s = window.sb.state
      window.states.push(s.phase + (s.language ? `:${s.language}` : ''))
    })
  }, debug)
  return Object.assign(page, { requests, errors })
}

/** sb.run(request) in the page; resolves the RunResult. */
export function runOnPage(page, request) {
  return page.evaluate((request) => window.sb.run(request), request)
}

// ------------------------------------------------------------ CPU (D9)

const psRows = () => spawnSync('ps', ['-A', '-o', 'pid=,ppid=,time=,command='], { encoding: 'utf8' }).stdout.trim().split('\n')
  .map((line) => { const m = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(line); return m && { pid: +m[1], ppid: +m[2], time: m[3], cmd: m[4] } })
  .filter(Boolean)
const cpuSeconds = (t) => { const parts = t.split(':').map(Number); return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1] }

/**
 * The CPU the browsers this script launched burn, in cores. Counted: every
 * descendant of this Node process (all of Chromium's processes), plus the
 * WebKit processes capture() adopted. WebKit's WebContent, Networking and GPU
 * processes (the iframe's workers run in WebContent) are started by launchd,
 * not by the browser, so they are recognised by their path in Playwright's
 * WebKit build and by having started between mark() (or cpuMeter()) and
 * capture(). Make the meter right before launching and call capture() right
 * after opening the first page; around every later page (a new context gets
 * a new WebContent process) call mark() before and capture() after. A WebKit
 * that another Playwright run starts inside such a window would be adopted
 * too; `detail` lists what each reading counted.
 */
export function cpuMeter() {
  let known = new Set(psRows().map((row) => row.pid))
  const adopted = new Set()
  const counted = (rows) => {
    const kids = new Map()
    for (const row of rows) { if (!kids.has(row.ppid)) kids.set(row.ppid, []); kids.get(row.ppid).push(row.pid) }
    const mine = new Set(adopted)
    const walk = (pid) => { for (const kid of kids.get(pid) || []) if (!mine.has(kid)) { mine.add(kid); walk(kid) } }
    walk(process.pid)
    return mine
  }
  const snapshot = () => {
    const rows = psRows()
    const mine = counted(rows)
    const out = new Map()
    for (const row of rows) if (mine.has(row.pid)) out.set(row.pid, { seconds: cpuSeconds(row.time), cmd: row.cmd })
    return out
  }
  return {
    /** the per-process breakdown of the last cores() reading, busiest first */
    detail: [],
    /** forgets the processes that exist now, so the next capture() adopts only what starts after this */
    mark() { known = new Set(psRows().map((row) => row.pid)) },
    /** adopts the WebKit processes started since mark() (or cpuMeter()); returns every pid counted */
    capture() {
      const rows = psRows()
      for (const row of rows) if (!known.has(row.pid) && /ms-playwright\/webkit-/.test(row.cmd)) adopted.add(row.pid)
      known = new Set(rows.map((row) => row.pid))
      return [...counted(rows)]
    },
    async cores(ms = 1500) {
      const a = snapshot()
      await pause(ms)
      const b = snapshot()
      let spent = 0
      const detail = []
      for (const [pid, { seconds, cmd }] of b) {
        if (!a.has(pid)) continue // began in between
        const used = seconds - a.get(pid).seconds
        spent += used
        if (used > 0.05) detail.push(`${pid} ${(used / (ms / 1000)).toFixed(2)} ${cmd.split('/').pop().slice(0, 60)}`)
      }
      this.detail = detail.sort((x, y) => Number(y.split(' ')[1]) - Number(x.split(' ')[1]))
      return spent / (ms / 1000)
    },
  }
}
