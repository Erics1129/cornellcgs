#!/usr/bin/env node
/**
 * Ink Maze level 26: the C and C++ runtime in real browsers (Chromium and
 * WebKit), through CodeSandbox (src/minigames/inkmaze/code/sandbox.ts) and the
 * clang runtime (public/minigames/ink-maze-code/clang/runtime.js).
 *
 *   node scripts/inkmaze-code/test-runtime-c.mjs                both browsers
 *   node scripts/inkmaze-code/test-runtime-c.mjs webkit         one browser
 *   INK_CLANG_DIR=/path/to/@yowasp/clang node .../test-runtime-c.mjs
 *       serve the 105 MB toolchain from a local copy instead of jsDelivr (offline,
 *       and faster: the CDN requests are fulfilled from disk with CORS headers).
 *       Without it, the toolchain loads from the pinned CDN over the network.
 *
 * Needs Playwright (CGS_PLAYWRIGHT_MODULE, see scripts/inkmaze-code-browser.mjs).
 * Not part of `npm test` (browsers, a big download, a few minutes).
 *
 * What it proves, in both engines:
 *  - nothing of the clang toolchain loads before load('c'); one sandboxed iframe.
 *  - the reference and naive solutions (scripts/inkmaze-code/solutions) are
 *    accepted on a full 13-board submission, C and C++; the starters return empty.
 *  - compile errors carry the player's line; runtime errors carry the board and,
 *    where the engine gives it, the line; prints and stderr reach the page.
 *  - EVERY runaway (tight loop, a loop with no memory access, a loop deep in
 *    recursion, a loop that tries to opt out of the instrumentation, an
 *    allocation bomb, an output flood, a compile bomb, a compiler memory bomb,
 *    an infinite destructor) is reported with the right status AND the browser's
 *    CPU is back to idle within ~1 s of the limit. WebKit's worker.terminate()
 *    does not stop WebAssembly, so this only passes because the fuel pass makes
 *    the program stop itself (D9). A positive control measures the CPU WHILE a
 *    program spins, to show the meter does see the sandbox's thread.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { cpuMeter, devServer, launch, openCodePage, pause, runOnPage } from '../inkmaze-code-browser.mjs'
import { judgeAll, randomBoard, submissionTests } from '../../src/minigames/inkmaze/code/problem.ts'
import { CASES } from './test-runtime-c-cases.mjs'

const names = process.argv.slice(2).filter((a) => !a.startsWith('-'))
const BROWSERS = names.length ? names : ['chromium', 'webkit']
const CPU_SLACK = 0.3
const CLANG_CDN_PREFIX = 'https://cdn.jsdelivr.net/npm/@yowasp/clang@22.0.0-git20542-10/'
const LOCAL = process.env.INK_CLANG_DIR && existsSync(`${process.env.INK_CLANG_DIR}/gen/bundle.js`) ? process.env.INK_CLANG_DIR : null

const visible = randomBoard(7)
const ONE = [visible]
const SUBMIT = submissionTests(visible)
const sol = (f) => readFileSync(new URL(`./solutions/${f}`, import.meta.url), 'utf8')

// the browser runs the safety-critical runaways plus a representative functional slice
const RUNAWAYS = CASES.filter((c) => c.runaway)
const FUNCTIONAL = [
  'compile error (C): missing semicolon',
  'compile error (C++): wrong type',
  'compile error (C): defines main()',
  'runtime error (C): null pointer',
  'runtime error (C): array index out of bounds',
  'runtime error (C++): vector index out of range (libc++ hardening)',
  'runtime error (C): unbounded recursion (stack overflow)',
  'runtime error (C): exit(3) inside solve()',
  'recursion 200 deep works (C++, a DFS-like frame)',
  'tampering: printing the answer marker (the page sees too many answers)',
  'tampering: a constructor reads the input first',
  'prints, stderr and a NUL-free answer (C)',
].map((name) => CASES.find((c) => c.name === name)).filter(Boolean)

const MIME = { '.wasm': 'application/wasm', '.tar': 'application/x-tar', '.js': 'text/javascript' }

const server = await devServer()
console.log(`ink maze c runtime: ${server.base}${LOCAL ? ` (toolchain from ${LOCAL})` : ' (toolchain from the CDN)'}`)
let failed = false
try {
  for (const name of BROWSERS) {
    try { await suite(name) } catch (error) { failed = true; console.error(`FAIL ${name}: ${error.stack || error}`) }
  }
} finally {
  server.stop()
}
if (failed) process.exit(1)
console.log(`PASS ink maze c runtime (${BROWSERS.join(', ')})`)

async function suite(name) {
  const meter = cpuMeter()
  const browser = await launch(name)
  const log = (text) => console.log(`  ${name}: ${text}`)
  try {
    const page = await openCodePage(browser, server.base)
    // serve the toolchain from a local copy when asked (keeps the jsDelivr URL, so the CSP still applies)
    if (LOCAL) {
      await page.context().route(`${CLANG_CDN_PREFIX}**`, (route) => {
        const url = new URL(route.request().url())
        const rel = url.pathname.replace('/npm/@yowasp/clang@22.0.0-git20542-10/', '')
        const file = `${LOCAL}/${rel}`
        if (!existsSync(file)) return route.fulfill({ status: 404, body: 'not found' })
        const ext = rel.slice(rel.lastIndexOf('.'))
        route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'cache-control': 'max-age=31536000' }, contentType: MIME[ext] || 'application/octet-stream', body: readFileSync(file) })
      })
    }
    meter.capture()
    const codeRequests = () => page.requests.filter((u) => u.includes('/ink-maze-code/clang/'))
    const cdnRequests = () => page.requests.filter((u) => u.includes('cdn.jsdelivr.net'))
    const run = (lang, source, tests = ONE, extra = {}) => runOnPage(page, { language: lang, source, tests, kind: 'run', ...extra })

    const cpuAfter = async (label, idle) => {
      const cores = await meter.cores(1500)
      log(`${label}: ${cores.toFixed(2)} cores (idle ${idle.toFixed(2)})${cores > idle + CPU_SLACK ? `\n      ${meter.detail.join('\n      ')}` : ''}`)
      return cores
    }

    // --------------------------------------------- lazy loading
    assert.deepEqual(codeRequests(), [], 'nothing of the clang runtime loads before load()')
    assert.deepEqual(cdnRequests(), [], 'no CDN request before load()')
    assert.equal(await page.evaluate(() => document.querySelectorAll('iframe').length), 0, 'no iframe before load()')
    const tLoad = Date.now()
    await page.evaluate(() => window.sb.load('c'))
    log(`clang ready in ${((Date.now() - tLoad) / 1000).toFixed(1)} s`)
    assert.equal(await page.evaluate(() => window.sb.runtimeStatus('c')), 'ready')
    assert.equal(await page.evaluate(() => window.sb.runtimeStatus('cpp')), 'ready', 'C and C++ share the runtime')
    assert.ok(codeRequests().some((u) => u.includes('clang/runtime.js')), 'the runtime module was fetched from the site')
    assert.ok(cdnRequests().some((u) => u.includes('bundle.js')), 'the toolchain was fetched from the pinned CDN prefix')
    assert.ok(cdnRequests().every((u) => u.startsWith(CLANG_CDN_PREFIX)), 'every CDN request is under the pinned prefix')
    const info = await page.evaluate(() => window.sb.runtimeInfo('c').info)
    assert.match(String(info.clang), /^22\./, 'load() reports the clang version to the page')
    const frame = await page.evaluate(() => {
      const iframe = document.querySelector('iframe')
      let readable = true
      try { readable = !!iframe.contentDocument } catch { readable = false }
      return { sandbox: iframe.getAttribute('sandbox'), readable, count: document.querySelectorAll('iframe').length }
    })
    assert.deepEqual(frame, { sandbox: 'allow-scripts', readable: false, count: 1 }, 'one iframe, sandbox="allow-scripts", opaque to the page')

    meter.capture()
    await pause(500)
    const idle = await cpuAfter('idle, clang loaded', 0)
    assert.ok(idle < 1.0, `the machine is quiet enough to measure (${idle.toFixed(2)} cores idle)`)

    // --------------------------------------------- reference, naive, starters
    for (const [lang, file] of [['c', 'c-reference.c'], ['cpp', 'cpp-reference.cpp'], ['c', 'c-naive.c'], ['cpp', 'cpp-naive.cpp']]) {
      const r = await run(lang, sol(file), SUBMIT, { kind: 'submit', timeLimitMs: 8000 })
      assert.equal(r.status, 'ok', `${file}: ${r.message}`)
      assert.equal(r.answers.length, SUBMIT.length, `${file}: exactly ${SUBMIT.length} answers`)
      assert.ok(judgeAll(SUBMIT, r.answers).accepted, `${file} accepted on all ${SUBMIT.length} boards`)
      log(`${file}: ok, accepted ${SUBMIT.length}/${SUBMIT.length}, ${r.timings.totalMs} ms (compile ${r.timings.compileMs}, run ${r.timings.runMs})`)
    }
    const starterC = await run('c', '#include <stdlib.h>\nchar *solve(char **grid, int rows, int cols, int ink) { return ""; }\n', ONE)
    assert.equal(starterC.status, 'ok')
    assert.deepEqual(starterC.answers, [''], 'an empty C program answers with no moves (the empty verdict)')

    // --------------------------------------------- a visible-map Run is quick
    const quick = await run('c', sol('c-reference.c'), ONE)
    assert.equal(quick.status, 'ok')
    assert.ok(judgeAll(ONE, quick.answers).accepted)
    log(`one visible board (C reference): ${quick.timings.totalMs} ms`)

    // --------------------------------------------- functional cases
    for (const c of FUNCTIONAL) await checkCase(c, run, log)

    // --------------------------------------------- positive control: the meter sees a spinning sandbox
    {
      const spin = CASES.find((c) => c.name === 'infinite loop (C)')
      const p = run(spin.lang, spin.source, ONE, { timeLimitMs: 3000 })
      await pause(700)
      const during = await cpuAfter('positive control: CPU WHILE an (instrumented) program spins', idle)
      assert.ok(during > idle + 0.5, `the meter sees the sandbox's busy thread (${during.toFixed(2)} cores)`)
      const r = await p
      assert.equal(r.status, 'time_limit')
      await pause(300)
      assert.ok((await cpuAfter('after it hits its deadline', idle)) < idle + CPU_SLACK, 'and the program stopped itself')
      assert.equal((await run('c', sol('c-reference.c'), ONE)).status, 'ok', 'the next run works')
    }

    // --------------------------------------------- runaways, CPU back to idle (D9)
    for (const c of RUNAWAYS) {
      const tests = c.tests === 'two' ? [visible, randomBoard(9)] : ONE
      const extra = {}
      if (c.timeLimitMs) extra.timeLimitMs = c.timeLimitMs
      if (c.compileLimitMs) extra.compileLimitMs = c.compileLimitMs
      const r = await run(c.lang, c.source, tests, extra)
      const want = Array.isArray(c.expect.status) ? c.expect.status : [c.expect.status]
      assert.ok(want.includes(r.status) || (c.maybeCompileError && r.status === 'compile_error'), `${c.name}: ${r.status} (want ${want.join('/')}): ${r.message}`)
      if (!c.maybeCompileError) assert.equal(r.stoppedBy, c.expect.stoppedBy ?? 'runtime', `${c.name}: stopped by the runtime, not the host`)
      assert.equal(r.sandboxRestarted, false, `${c.name}: no iframe rebuild`)
      // A stopped compile bomb leaves the runtime healthy:false, so the host rebuilds the heavy
      // compiler worker (legitimate CPU, not the runaway). For those, let the reload finish (the
      // next reference run waits for it) before measuring that the runaway itself left nothing busy.
      const compileSide = c.expect.phase === 'compile'
      if (compileSide) {
        const next = await run('c', sol('c-reference.c'), ONE)
        assert.equal(next.status, 'ok', `${c.name}: the next run works (the compiler was rebuilt)`)
        const cores = await cpuAfter(`after "${c.name}" (+ compiler reload)`, idle)
        assert.ok(cores < idle + CPU_SLACK, `${c.name}: nothing left busy once the compiler was rebuilt (${cores.toFixed(2)} cores)`)
      } else {
        await pause(300)
        const cores = await cpuAfter(`after "${c.name}"`, idle)
        assert.ok(cores < idle + CPU_SLACK, `${c.name}: CPU back to idle within ~1 s of the limit (${cores.toFixed(2)} cores)`)
        const next = await run('c', sol('c-reference.c'), ONE)
        assert.equal(next.status, 'ok', `${c.name}: the next run works`)
      }
    }

    // --------------------------------------------- the page stays responsive during a wasm spin
    const responsive = await page.evaluate(async (source) => {
      let last = performance.now()
      let worst = 0
      const timer = setInterval(() => { const t = performance.now(); worst = Math.max(worst, t - last); last = t }, 50)
      const r = await window.sb.run({ language: 'c', source, tests: [{ grid: ['o...', '....', '....', '....'], ink: 20 }], kind: 'run', timeLimitMs: 1200 })
      clearInterval(timer)
      return { status: r.status, worst }
    }, 'char *solve(char **g, int r, int c, int ink) { volatile unsigned n = 0; for (;;) n++; }\n')
    assert.equal(responsive.status, 'time_limit')
    assert.ok(responsive.worst < 300, `the page kept running its timers during a wasm spin (largest gap ${responsive.worst.toFixed(0)} ms)`)
    log(`page responsive during a spin (largest timer gap ${responsive.worst.toFixed(0)} ms)`)

    // --------------------------------------------- cancel resolves at once
    const cancelled = await page.evaluate(async (source) => {
      const sb = window.sb
      const p = sb.run({ language: 'c', source, tests: [{ grid: ['o...', '....', '....', '....'], ink: 20 }], kind: 'run', timeLimitMs: 3000 })
      await new Promise((resolve) => { if (sb.state.phase === 'running') return resolve(); const off = sb.subscribe(() => { if (sb.state.phase === 'running') { off(); resolve() } }) })
      await new Promise((r) => setTimeout(r, 300))
      const t = performance.now()
      sb.cancel()
      const r = await p
      return { status: r.status, cancelMs: performance.now() - t }
    }, 'char *solve(char **g, int r, int c, int ink) { volatile unsigned n = 0; for (;;) n++; }\n')
    assert.equal(cancelled.status, 'cancelled')
    assert.ok(cancelled.cancelMs < 500, `cancel resolves at once (${cancelled.cancelMs.toFixed(0)} ms)`)
    // the cancelled program stops itself at its own deadline (a fresh worker runs the next program meanwhile)
    await pause(3000)
    assert.ok((await cpuAfter('after a cancelled wasm spin reached its own deadline', idle)) < idle + CPU_SLACK, 'a cancelled program stops at its own deadline')
    assert.equal((await run('c', sol('c-reference.c'), ONE)).status, 'ok', 'the next run after a cancel works')

    if (page.errors.length) log(`page errors: ${page.errors.slice(0, 5).join(' | ')}`)
    log('pass')
  } finally {
    await browser.close()
  }
}

async function checkCase(c, run, log) {
  const tests = c.tests === 'two' ? [visible, randomBoard(9)] : [visible]
  const extra = {}
  if (c.timeLimitMs) extra.timeLimitMs = c.timeLimitMs
  if (c.compileLimitMs) extra.compileLimitMs = c.compileLimitMs
  const r = await run(c.lang, c.source, tests, extra)
  const e = c.expect
  const want = Array.isArray(e.status) ? e.status : [e.status]
  assert.ok(want.includes(r.status) || (c.maybeCompileError && r.status === 'compile_error'), `${c.name}: ${r.status} (want ${want.join('/')}): ${r.message}`)
  if (e.line !== undefined && !c.maybeCompileError) {
    const line = r.error?.line ?? r.diagnostics?.[0]?.line ?? null
    assert.equal(line, e.line, `${c.name}: line ${line} (want ${e.line})`)
  }
  if (e.test !== undefined && !c.maybeCompileError) assert.equal(r.error?.test ?? null, e.test, `${c.name}: board ${r.error?.test} (want ${e.test})`)
  if (e.type && r.error) assert.match(r.error.type, e.type, `${c.name}: type ${r.error.type}`)
  if (e.message) assert.match(r.message, e.message, `${c.name}: message ${JSON.stringify(r.message).slice(0, 120)}`)
  if (e.stdout) assert.match(r.stdout, e.stdout, `${c.name}: stdout ${JSON.stringify(r.stdout).slice(0, 80)}`)
  if (e.stderr) assert.match(r.stderr, e.stderr, `${c.name}: stderr`)
  if (e.answer0 !== undefined) assert.equal(r.answers[0], e.answer0, `${c.name}: answer`)
  log(`ok "${c.name}": ${r.status}${e.line !== undefined ? ` line ${r.error?.line ?? r.diagnostics?.[0]?.line}` : ''}`)
}
