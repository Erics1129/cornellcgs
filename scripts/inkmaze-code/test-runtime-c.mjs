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
 *    accepted on a full submission (the map and every hidden test), C and C++;
 *    the starters return empty.
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
import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { promisify } from 'node:util'
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
  'compile error (C): hijacks a function the harness uses (fflush)',
  'compile error (C): static arrays too big to compile (100 MB)',
  'macros cannot reach the harness (#define scanf, malloc, fflush)',
  'runtime error (C): null pointer',
  'runtime error (C++): missing return',
  'runtime error (C): array index out of bounds',
  'runtime error (C++): vector index out of range (libc++ hardening)',
  'runtime error (C): unbounded recursion (stack overflow)',
  'runtime error (C): exit(3) inside solve()',
  'runtime error (C): returns a pointer outside memory',
  'recursion 200 deep works (C++, a DFS-like frame)',
  'one huge allocation (C, 2 GB)',
  'one 200 MB write to stdout (C)',
  'tampering: printing the answer marker (the page sees too many answers)',
  'tampering: a constructor reads the input first',
  "tampering: calling the harness's answer import directly",
  'tampering: scribbling over a wide span of memory',
  'tampering: corrupting the heap the harness uses next',
  'fclose(stdout) and stdin reads are harmless',
  'prints, stderr and a NUL-free answer (C)',
  'C++ cout with sync_with_stdio(false) is flushed before the answer',
].map((name) => { const c = CASES.find((k) => k.name === name); assert.ok(c, `no case named ${name}`); return c })

const MIME = { '.wasm': 'application/wasm', '.tar': 'application/x-tar', '.js': 'text/javascript' }

// ------------------------------------------------------------ memory (resident set of the browser's processes)
// Asynchronous on purpose: Playwright serves the toolchain from this process (INK_CLANG_DIR), so a
// blocking ps every 100 ms would starve its route handler on a busy machine.
const exec = promisify(execFile)
/** { total, top } bytes resident: every descendant of this Node process (all of Chromium) plus the
 * given pids (WebKit's launchd-started WebContent), and the biggest one (where the iframe's workers run) */
async function residentBytes(extra) {
  const { stdout } = await exec('ps', ['-A', '-o', 'pid=,ppid=,rss='], { maxBuffer: 1 << 24 })
  const rows = stdout.trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number))
  const kids = new Map()
  for (const [pid, ppid] of rows) { if (!kids.has(ppid)) kids.set(ppid, []); kids.get(ppid).push(pid) }
  const mine = new Set(extra)
  const walk = (pid) => { for (const k of kids.get(pid) || []) if (!mine.has(k)) { mine.add(k); walk(k) } }
  walk(process.pid)
  let total = 0
  let top = 0
  for (const [pid, , rss] of rows) if (mine.has(pid)) { total += rss * 1024; top = Math.max(top, rss * 1024) }
  return { total, top }
}
/** the peak resident memory while `promise` runs, sampled every 250 ms */
async function peakDuring(extra, promise) {
  const peak = await residentBytes(extra)
  let done = false
  const sampler = (async () => {
    while (!done) {
      const m = await residentBytes(extra)
      peak.total = Math.max(peak.total, m.total)
      peak.top = Math.max(peak.top, m.top)
      await pause(250)
    }
  })()
  try { return [await promise, peak] } finally { done = true; await sampler }
}
const mb = (bytes) => `${Math.round(bytes / 1e6)} MB`

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
    const pagePids = meter.capture()
    const memory = (m) => `${mb(m.top)} in the biggest process, ${mb(m.total)} in all`
    log(`memory before load: ${memory(await residentBytes(pagePids))}`)
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
    const [, loadPeak] = await peakDuring(pagePids, page.evaluate(() => window.sb.load('c')))
    log(`clang ready in ${((Date.now() - tLoad) / 1000).toFixed(1)} s (${LOCAL ? 'toolchain from disk' : 'cold: empty cache, from the CDN'}); load timings ${JSON.stringify((await page.evaluate(() => window.sb.runtimeInfo('c').info)).timings)}`)
    log(`memory: peak during load ${memory(loadPeak)}; after load ${memory(await residentBytes(pagePids))}`)
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
    let runPeak = { total: 0, top: 0 }
    for (const [lang, file] of [['c', 'c-reference.c'], ['cpp', 'cpp-reference.cpp'], ['c', 'c-naive.c'], ['cpp', 'cpp-naive.cpp']]) {
      const [r, peak] = await peakDuring(pagePids, run(lang, sol(file), SUBMIT, { kind: 'submit' }))
      runPeak = { total: Math.max(runPeak.total, peak.total), top: Math.max(runPeak.top, peak.top) }
      assert.equal(r.status, 'ok', `${file}: ${r.message}`)
      assert.equal(r.answers.length, SUBMIT.length, `${file}: exactly ${SUBMIT.length} answers`)
      assert.ok(judgeAll(SUBMIT, r.answers).accepted, `${file} accepted on all ${SUBMIT.length} boards`)
      log(`${file}: submit ok, accepted ${SUBMIT.length}/${SUBMIT.length} (limit ${r.limits.timeLimitMs} ms): ${r.timings.totalMs} ms (compile ${r.timings.compileMs}, run ${r.timings.runMs})`)
    }
    log(`memory: peak while compiling and running C and C++ ${memory(runPeak)}`)
    // the naive search (ink pruning only) on the larger hidden boards alone (problem.ts `large`), to see the margin
    for (const [lang, file] of [['c', 'c-naive.c'], ['cpp', 'cpp-naive.cpp']]) {
      const large = SUBMIT.filter((b) => b.large)
      if (!large.length) break
      const r = await run(lang, sol(file), large, { kind: 'submit' })
      assert.equal(r.status, 'ok', `${file} on the larger boards: ${r.message}`)
      assert.ok(judgeAll(large, r.answers).accepted)
      log(`${file} on the ${large.length} larger hidden boards: run ${r.timings.runMs} ms`)
    }
    // warm compile + run of a program the runtime has not seen (a new comment each time), then
    // Run followed by Submit with the same code: the second compiles nothing (the program is kept)
    for (const [lang, file] of [['c', 'c-reference.c'], ['cpp', 'cpp-reference.cpp']]) {
      const times = []
      for (let i = 0; i < 3; i++) {
        const r = await run(lang, `${sol(file)}\n// ${name} warm ${i}\n`, ONE)
        assert.equal(r.status, 'ok')
        times.push(`${r.timings.totalMs} (compile ${r.timings.compileMs})`)
      }
      log(`warm ${lang} compile+run on the map: ${times.join(', ')} ms`)
      const source = `${sol(file)}\n// ${name} run then submit\n`
      const first = await run(lang, source, ONE)
      const again = await run(lang, source, SUBMIT, { kind: 'submit' })
      assert.equal(again.status, 'ok')
      assert.ok(again.timings.compileMs < first.timings.compileMs / 2 + 20, `${lang}: a Submit after a Run of the same code does not compile again (${again.timings.compileMs} ms)`)
      log(`${lang}: Run ${first.timings.totalMs} ms, then Submit of the same code ${again.timings.totalMs} ms (compile ${again.timings.compileMs} ms)`)
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

    // --------------------------------------------- how deep recursion goes (documented in c.ts and PROVENANCE.txt)
    for (const [label, frame] of [['a DFS-sized frame (48 bytes of locals)', 48], ['a 1 KiB frame', 1024]]) {
      const source = `#include <stdio.h>\n__attribute__((noinline)) static int dive(int d, char **g) {\n    volatile char frame[${frame}];\n    frame[d % ${frame}] = g[0][0];\n    if (d % 100 == 0) printf("%d\\n", d);\n    return dive(d + 1, g) + frame[(d * 7) % ${frame}];\n}\nchar *solve(char **grid, int rows, int cols, int ink) { return dive(0, grid) ? "" : ""; }\n`
      const r = await run('c', source, ONE)
      const reached = Math.max(0, ...r.stdout.trim().split('\n').map(Number).filter(Number.isFinite))
      assert.equal(r.status, 'runtime_error', `unbounded recursion is a runtime error: ${r.message}`)
      assert.match(r.message, /Stack overflow/)
      assert.ok(reached >= 200, `recursion reaches at least LIMITS.recursionDepth (200) frames (${reached})`)
      assert.match(r.message, /in dive\(\)/, 'the stack overflow names the player\'s function')
      log(`recursion with ${label}: about ${reached} frames before "${r.message}"${r.error?.trace ? ` (trace: ${r.error.trace.replace(/\n/g, ' | ')})` : ''}`)
    }

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
    // Cancel is terminate(): the host drops the worker and at once starts a fresh one, which
    // reloads the compiler (seconds of legitimate, multi-threaded CPU). WebKit's terminate() does
    // not stop the old worker's wasm loop, so that program keeps a core until its OWN deadline,
    // where the fuel check stops it. So: let the reload finish (the next run waits for it), look
    // at the CPU while the cancelled program would still be inside its time limit (informational:
    // about 1 core in WebKit, 0 in Chromium, whose terminate() stops wasm after ~2 s), then
    // measure again just after that deadline: it must be idle.
    const CANCEL_LIMIT_MS = 8000
    const cancelled = await page.evaluate(async ({ source, limit }) => {
      const sb = window.sb
      const p = sb.run({ language: 'c', source, tests: [{ grid: ['o...', '....', '....', '....'], ink: 20 }], kind: 'run', timeLimitMs: limit })
      await new Promise((resolve) => { if (sb.state.phase === 'running') return resolve(); const off = sb.subscribe(() => { if (sb.state.phase === 'running') { off(); resolve() } }) })
      const running = performance.now()
      await new Promise((r) => setTimeout(r, 300))
      const t = performance.now()
      sb.cancel()
      const r = await p
      return { status: r.status, cancelMs: performance.now() - t, sinceRunning: performance.now() - running }
    }, { source: 'char *solve(char **g, int r, int c, int ink) { volatile unsigned n = 0; for (;;) n++; }\n', limit: CANCEL_LIMIT_MS })
    // the program's own deadline, in this process's clock (its io.started() came just before 'running')
    const cancelDeadline = Date.now() - cancelled.sinceRunning + CANCEL_LIMIT_MS
    assert.equal(cancelled.status, 'cancelled')
    assert.ok(cancelled.cancelMs < 500, `cancel resolves at once (${cancelled.cancelMs.toFixed(0)} ms)`)
    const afterCancel = await run('c', sol('c-reference.c'), ONE)
    assert.equal(afterCancel.status, 'ok', 'the next run after a cancel works (a fresh worker, the compiler reloaded)')
    const reloadedAt = Date.now()
    log(`after a cancel: the next run (with the compiler reload) took ${afterCancel.timings.totalMs} ms; the cancelled program's deadline is ${Math.max(0, cancelDeadline - reloadedAt)} ms away`)
    if (cancelDeadline - reloadedAt > 2000) {
      await pause(200)
      const zombie = await meter.cores(1500)
      log(`while the cancelled program is still inside its limit: ${zombie.toFixed(2)} cores (informational: WebKit's terminate() can leave wasm running until its own deadline)`)
    }
    await pause(Math.max(0, cancelDeadline + 300 - Date.now()))
    assert.ok((await cpuAfter('just after the cancelled wasm spin reached its own deadline', idle)) < idle + CPU_SLACK, 'a cancelled program stops at its own deadline')
    assert.equal((await run('c', sol('c-reference.c'), ONE)).status, 'ok', 'the next run after that works')

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
  log(`ok "${c.name}": ${r.status}${e.line !== undefined ? ` line ${r.error?.line ?? r.diagnostics?.[0]?.line}` : ''}: ${JSON.stringify(r.message).slice(0, 160)}`)
}
