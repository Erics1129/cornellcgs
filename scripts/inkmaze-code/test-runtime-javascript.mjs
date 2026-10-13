#!/usr/bin/env node
/*
 * Ink Maze level 26: the JavaScript runtime (QuickJS on WebAssembly) in real
 * browsers.
 *
 *   node scripts/inkmaze-code/test-runtime-javascript.mjs           both engines
 *   node scripts/inkmaze-code/test-runtime-javascript.mjs webkit    one engine
 *   CGS_TEST_URL=http://localhost:5190 node scripts/inkmaze-code/test-runtime-javascript.mjs
 *
 * Needs Playwright (CGS_PLAYWRIGHT_MODULE) and the repo's Node 24. Build the
 * bundle first: node scripts/inkmaze-code/build/build-javascript.mjs. Not part
 * of `npm test` (it drives browsers).
 *
 * It proves, against sandbox.ts + problem.ts and the production runtime in
 * public/minigames/ink-maze-code/javascript/:
 *   - the reference and the naive solution clear a full submission, accepted by
 *     the real engine, and times them;
 *   - compile errors, runtime errors (player's line + board index), a wrong
 *     return type and a printed answer-marker are reported right;
 *   - every runaway (tight loop, a loop inside catch/finally, a loop deep in
 *     recursion, deep recursion, an allocation bomb, an output flood) is stopped
 *     by QuickJS's interrupt handler / memory cap and the CPU is back to idle
 *     within ~1 s of the limit, in WebKit too (terminate() is only the backstop);
 *   - the player cannot reach the worker's globals (postMessage, close) and a
 *     re-declared harness name is harmless;
 *   - a positive control shows the meter sees the QuickJS worker's CPU.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { judgeAll, randomBoard, submissionTests } from '../../src/minigames/inkmaze/code/problem.ts'
import { LIMITS } from '../../src/minigames/inkmaze/code/contract.ts'
import { checkConsistency } from '../../src/minigames/inkmaze/code/runtimes/javascript.ts'
import { cpuMeter, devServer, launch, openCodePage, pause, runOnPage } from '../inkmaze-code-browser.mjs'

assert.deepEqual(checkConsistency(), [], 'contract.ts / problem.ts agree with the JavaScript runtime')

const SOL = fileURLToPath(new URL('./solutions/', import.meta.url))
const REF = readFileSync(SOL + 'javascript-reference.js', 'utf8')
const NAIVE = readFileSync(SOL + 'javascript-naive.js', 'utf8')
const solve = (body) => `function solve(grid, ink) {\n${body}\n}\n`

const names = process.argv.slice(2).filter((a) => !a.startsWith('-'))
const BROWSERS = names.length ? names : ['chromium', 'webkit']
const CPU_SLACK = 0.3

const visible = randomBoard(7)
const ONE = [{ grid: visible.grid, ink: visible.ink }]
const SUBMIT = submissionTests(visible).map((b) => ({ grid: b.grid, ink: b.ink }))

const server = await devServer()
console.log(`ink maze javascript runtime: ${server.base}`)
try {
  for (const name of BROWSERS) await suite(name)
} finally {
  server.stop()
}
console.log(`PASS ink maze javascript runtime (${BROWSERS.join(', ')})`)

async function suite(name) {
  const meter = cpuMeter()
  const browser = await launch(name)
  const log = (m) => console.log(`  ${name}: ${m}`)
  try {
    const page = await openCodePage(browser, server.base)
    meter.capture()
    const run = (source, tests = ONE, extra = {}) => runOnPage(page, { language: 'javascript', source, tests, kind: 'run', ...extra })
    const cpuAfter = async (label, idle) => {
      const cores = await meter.cores(1500)
      log(`${label}: ${cores.toFixed(2)} cores (idle ${idle.toFixed(2)})${cores > idle + CPU_SLACK ? `\n      ${meter.detail.join('\n      ')}` : ''}`)
      return cores
    }

    // ---- lazy, cold load (wasm self-hosted through the page, no CDN)
    assert.equal(await page.evaluate(() => document.querySelectorAll('iframe').length), 0, 'no iframe before load()')
    const tLoad = Date.now()
    await page.evaluate(() => window.sb.load('javascript'))
    const loadMs = Date.now() - tLoad
    const info = await page.evaluate(() => window.sb.runtimeInfo('javascript'))
    log(`cold load: ${loadMs} ms; ${JSON.stringify(info.info)}`)
    assert.equal(info.status, 'ready')
    assert.equal(info.info.engine, 'quickjs')
    assert.ok(!page.requests.some((u) => /cdn\.jsdelivr|unpkg|skypack/.test(u)), 'JavaScript needs nothing from a CDN')
    assert.ok(page.requests.some((u) => u.includes('/ink-maze-code/javascript/quickjs.wasm')), 'the QuickJS wasm is self-hosted')
    await pause(400)
    const idle = await cpuAfter('idle after load', 0)
    assert.ok(idle < 0.6, `quiet enough to measure (${idle.toFixed(2)})`)

    // ---- correctness + timings
    let r = await run(REF, SUBMIT, { kind: 'submit' })
    assert.equal(r.status, 'ok', r.message)
    assert.ok(judgeAll(SUBMIT, r.answers).accepted, 'reference accepted on all boards')
    log(`reference submit (${SUBMIT.length} boards): ${r.timings.runMs} ms run, ${r.timings.totalMs} ms total`)
    const warm = await run(REF, ONE)
    log(`warm run (1 board): ${warm.timings.runMs} ms`)
    r = await run(NAIVE, SUBMIT, { kind: 'submit' })
    assert.equal(r.status, 'ok', `naive: ${r.message}`)
    assert.ok(judgeAll(SUBMIT, r.answers).accepted, 'naive accepted on all boards')
    log(`naive submit (${SUBMIT.length} boards): ${r.timings.runMs} ms run (limit ${r.limits.timeLimitMs} ms)`)
    assert.ok(r.timings.runMs < r.limits.timeLimitMs, 'naive fits the submit limit')
    const legitRec = await run(solve('function f(n){ return n <= 0 ? "" : f(n - 1) }\nf(190)\nreturn ""'))
    assert.equal(legitRec.status, 'ok', `recursion to ${LIMITS.recursionDepth} is safe (${legitRec.message})`)

    // ---- the player's own mistakes
    const compile = await run('function solve(g, i) { return }}}')
    assert.equal(compile.status, 'compile_error')
    assert.ok(compile.diagnostics[0].line >= 1, 'compile error carries a line')
    const err = await run(solve('return grid[0].nope.length'))
    assert.equal(err.status, 'runtime_error')
    assert.equal(err.error.test, 0, 'the board it was on')
    assert.ok(err.error.line >= 1, "the player's own line")
    const wrong = await run(solve('return ink'))
    assert.equal(wrong.status, 'runtime_error')
    assert.equal(wrong.error.type, 'TypeError')
    assert.match(wrong.error.message, /must return a string/)
    const marker = await run(solve('console.log("@@ANSWER@@ RRRR"); return ""'))
    assert.equal(marker.status, 'crashed', `printing the marker is a crash (${marker.status})`)
    const printed = await run(solve('console.log("thinking..."); return ""'))
    assert.equal(printed.status, 'ok')
    assert.equal(printed.stdout, 'thinking...\n', 'console keeps the prints, not the answers')

    // ---- runaways: stopped, reported, CPU back to idle (D9)
    const runaway = async (name2, source, status, { timeLimitMs = 1000, settleMs = 300 } = {}) => {
      const res = await run(source, ONE, { timeLimitMs })
      assert.equal(res.status, status, `${name2}: got ${res.status} (${res.message})`)
      assert.equal(res.stoppedBy, 'runtime', `${name2}: stopped by the runtime, not the host`)
      await pause(settleMs)
      const cores = await cpuAfter(`after ${name2}`, idle)
      assert.ok(cores < idle + CPU_SLACK, `${name2}: CPU back to idle within ~1 s of the limit (${cores.toFixed(2)})`)
      assert.equal((await run(REF, ONE)).status, 'ok', `a normal run works after ${name2}`)
      return res
    }
    const spin = await runaway('tight loop', solve('while (true) {}'), 'time_limit')
    assert.equal(spin.phase, 'run')
    assert.ok(spin.timings.runMs >= 950 && spin.timings.runMs <= 1000 + LIMITS.selfStopSlackMs + 400, `stopped near its deadline (${spin.timings.runMs} ms)`)
    assert.equal(spin.sandboxRestarted, false)
    await runaway('loop in catch', solve('while (true) { try { throw 1 } catch (e) {} }'), 'time_limit')
    await runaway('looping finally', solve('try { while (true) {} } finally { while (true) {} }'), 'time_limit')
    await runaway('loop deep in recursion', solve('function f(n){ if (n > 40) while (true) {}; return f(n + 1) } return f(0)'), 'time_limit')
    await runaway('regex backtracking', solve('return "aaaaaaaaaaaaaaaaaaaaaaaaaaa!".replace(/(a+)+$/, "")'), 'time_limit')
    await runaway('output flood', solve('while (true) console.log("x".repeat(2000))'), 'output_limit', { timeLimitMs: 4000 })
    await runaway('allocation bomb', solve('const a = []; while (true) a.push(new Array(100000).fill(0))'), 'memory_limit', { timeLimitMs: 4000 })
    const deep = await run(solve('function f(n){ return f(n + 1) } return f(0)'))
    assert.equal(deep.status, 'runtime_error')
    assert.equal(deep.error.type, 'RangeError', 'deep recursion is a clean stack-overflow RangeError, not a hang')
    await pause(300)
    assert.ok((await cpuAfter('after deep recursion', idle)) < idle + CPU_SLACK, 'deep recursion left the CPU idle')

    // ---- isolation: the player cannot reach the worker's globals
    const noPost = await run(solve('postMessage({}); return ""'))
    assert.equal(noPost.status, 'runtime_error')
    assert.match(noPost.error.message, /postMessage/, 'postMessage is not defined inside QuickJS')
    const noClose = await run(solve('close(); return ""'))
    assert.equal(noClose.status, 'runtime_error', 'close() is not defined inside QuickJS')
    const redeclare = await run('let inkHarness = 1;\nfunction solve(g, i) { return "" }')
    assert.equal(redeclare.status, 'ok', 'the harness name does not leak into the player scope')

    // ---- harness integrity: the harness captured the built-ins it needs before
    // the player existed, so replacing String.prototype.charCodeAt /
    // String.fromCharCode / Array.prototype.push at top level cannot corrupt the
    // answer it writes (the answer "UDLR" comes through unchanged, H3).
    const poison = await run(
      'String.prototype.charCodeAt = () => 999999\n' +
      'String.fromCharCode = () => "Z"\n' +
      'Array.prototype.push = function () { throw new Error("no push") }\n' +
      'function solve(grid, ink) { return "UDLR" }')
    assert.equal(poison.status, 'ok', `poisoning the answer-formatting built-ins is contained (${poison.status}: ${poison.message})`)
    assert.equal(poison.answered, 1)
    assert.equal(poison.answers[0], 'UDLR', 'the harness formatted the answer with its own captured built-ins')
    assert.equal((await run(REF, ONE)).status, 'ok', 'a normal run works after the prototype poison')

    // ---- positive control: the meter DOES see the QuickJS worker's CPU
    const control = page.evaluate((tests) => window.sb.run({ language: 'javascript', source: 'function solve(g, i) { while (true) {} }', tests, kind: 'run', timeLimitMs: 3000 }), ONE)
    await pause(700)
    const busy = await meter.cores(1200)
    log(`positive control: CPU WHILE a loop runs = ${busy.toFixed(2)} cores`)
    assert.ok(busy > idle + 0.5, `the meter sees the running QuickJS worker (${busy.toFixed(2)} cores)`)
    const cres = await control
    assert.equal(cres.status, 'time_limit')
    await pause(300)
    assert.ok((await cpuAfter('positive control, after the limit', idle)) < idle + CPU_SLACK, 'and the CPU drops once QuickJS stops it')

    if (page.errors.length) log(`page errors: ${page.errors.slice(0, 4).join(' | ')}`)
    assert.equal(page.errors.length, 0, 'no uncaught page errors')
    log('pass')
  } finally {
    await browser.close()
  }
}
