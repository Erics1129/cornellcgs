#!/usr/bin/env node
/**
 * Ink Maze level 26: the code sandbox in real browsers (Chromium and WebKit),
 * driven through CodeSandbox (src/minigames/inkmaze/code/sandbox.ts) with the
 * 'echo' test runtime (public/minigames/ink-maze-code/echo/runtime.js).
 *
 *   node scripts/test-inkmaze-code-sandbox.mjs                 both browsers, own Vite server
 *   node scripts/test-inkmaze-code-sandbox.mjs webkit          one browser
 *   CGS_TEST_URL=http://localhost:5190 node scripts/test-inkmaze-code-sandbox.mjs
 *
 * Needs Playwright (CGS_PLAYWRIGHT_MODULE, see scripts/inkmaze-code-browser.mjs).
 * Not part of `npm test` (it needs browsers and takes about two minutes).
 *
 * What it proves: nothing loads before load(); the iframe is sandboxed and
 * opaque; every status reaches the page with the right fields; runaway
 * programs (a JavaScript loop, a WebAssembly loop, a loop that swallows the
 * limit, a tampered clock, a child thread in JavaScript and in WebAssembly, an
 * output flood, a heap that grows) are stopped and reported, the page stays
 * responsive, and the browser's CPU drops back to idle within about a second
 * of the limit (D9), in WebKit too; cancel, the run queue, a lost heartbeat
 * (iframe rebuilt), a runtime that fails to load, forged messages, and
 * dispose. Last, a positive control: a WebAssembly loop with no deadline check
 * at all, which in WebKit keeps a core busy after terminate(). That reading
 * shows the CPU meter does see the sandbox's threads, so the zero readings
 * before it mean something. It is run last because nothing short of closing
 * the browser stops that thread.
 */
import assert from 'node:assert/strict'
import { HIDDEN_TESTS, formatStdin, judgeAll, randomBoard, submissionTests } from '../src/minigames/inkmaze/code/problem.ts'
import { LIMITS } from '../src/minigames/inkmaze/code/contract.ts'
import { cpuMeter, devServer, launch, openCodePage, pause, runOnPage } from './inkmaze-code-browser.mjs'

const names = process.argv.slice(2).filter((a) => !a.startsWith('-'))
const BROWSERS = names.length ? names : ['chromium', 'webkit']
/** cores above the idle reading that still count as "stopped" (the sandbox restarting a worker, GC) */
const CPU_SLACK = 0.3

const visible = randomBoard(7)
const ONE = [visible]
const SUBMIT = submissionTests(visible)

const server = await devServer()
console.log(`ink maze code sandbox: ${server.base}`)
try {
  for (const name of BROWSERS) await suite(name)
} finally {
  server.stop()
}
console.log(`PASS ink maze code sandbox (${BROWSERS.join(', ')})`)

async function suite(name) {
  const meter = cpuMeter()
  const browser = await launch(name)
  const log = (text) => console.log(`  ${name}: ${text}`)
  try {
    const page = await openCodePage(browser, server.base)
    meter.capture()
    const run = (source, tests = ONE, extra = {}) => runOnPage(page, { language: 'echo', source, tests, kind: 'run', ...extra })
    const states = () => page.evaluate(() => window.states.splice(0))
    const codeRequests = () => page.requests.filter((u) => u.includes('/minigames/ink-maze-code/'))
    /** the CPU now, against the idle reading */
    const cpuAfter = async (label, idle) => {
      const cores = await meter.cores(1500)
      log(`${label}: ${cores.toFixed(2)} cores (idle ${idle.toFixed(2)})${cores > idle + CPU_SLACK ? `\n      ${meter.detail.join('\n      ')}` : ''}`)
      return cores
    }

    // ------------------------------------------------ lazy loading, the iframe
    assert.deepEqual(codeRequests(), [], 'nothing of the sandbox loads before load()')
    assert.equal(await page.evaluate(() => document.querySelectorAll('iframe').length), 0, 'no iframe before load()')
    const tLoad = Date.now()
    await page.evaluate(() => window.sb.load('echo'))
    log(`echo ready in ${Date.now() - tLoad} ms`)
    const loadStates = await states()
    assert.ok(loadStates.includes('loading:echo') && loadStates.at(-1) === 'idle', `state: loading, then idle (${loadStates})`)
    assert.equal(await page.evaluate(() => window.sb.runtimeStatus('echo')), 'ready')
    const report = await page.evaluate(() => window.sb.runtimeInfo('echo'))
    assert.equal(report.status, 'ready')
    assert.equal(report.info.engine, 'echo', "load()'s info reaches the page")
    for (const file of ['sandbox.html', 'sandbox.js', 'echo/runtime.js']) assert.ok(codeRequests().some((u) => u.includes(`/ink-maze-code/${file}`)), `${file} was fetched`)
    assert.ok(!page.requests.some((u) => /cdn\.jsdelivr|unpkg|pyodide/.test(u)), 'echo needs nothing from a CDN')
    const frame = await page.evaluate(() => {
      const iframe = document.querySelector('iframe')
      let readable = true
      try { readable = !!iframe.contentDocument } catch { readable = false }
      return { sandbox: iframe.getAttribute('sandbox'), readable, count: document.querySelectorAll('iframe').length }
    })
    assert.deepEqual(frame, { sandbox: 'allow-scripts', readable: false, count: 1 }, 'one iframe, sandbox="allow-scripts", opaque to the page')
    meter.capture()
    await pause(500)
    const idle = await cpuAfter('idle, echo loaded', 0)
    assert.ok(idle < 0.5, `the machine is quiet enough to measure (${idle.toFixed(2)} cores idle: ${meter.detail.join('; ')})`)

    // ------------------------------------------------ results reach the page
    const solved = await run('solve', SUBMIT, { kind: 'submit' })
    assert.equal(solved.status, 'ok', solved.message)
    assert.equal(solved.answers.length, SUBMIT.length, 'exactly T answers')
    assert.equal(solved.answered, SUBMIT.length)
    assert.ok(judgeAll(SUBMIT, solved.answers).accepted, 'the reference search is accepted on every board')
    assert.equal(solved.phase, null)
    assert.equal(solved.stoppedBy, null)
    assert.equal(solved.kind, 'submit')
    assert.ok(solved.timings.totalMs >= solved.timings.runMs && solved.timings.runMs >= 0)
    const runStates = await states()
    assert.ok(runStates.includes('compiling:echo') && runStates.includes('running:echo') && runStates.at(-1) === 'idle', `state: compiling, running, idle (${runStates})`)
    log(`submission of ${SUBMIT.length} boards: ok, accepted, ${solved.timings.totalMs} ms`)

    const blank = await run('', SUBMIT.slice(0, 3))
    assert.equal(blank.status, 'ok')
    assert.deepEqual(blank.answers, ['', '', ''])
    assert.deepEqual(judgeAll(SUBMIT.slice(0, 3), blank.answers).verdicts.map((v) => v.kind), ['empty', 'empty', 'empty'])

    const printed = await run('print hello\nwarn careful\nprint-json "no line break "\nanswer-each RD')
    assert.equal(printed.status, 'ok')
    assert.equal(printed.stdout, 'hello\nno line break \n', 'console: the prints, answer lines removed')
    assert.equal(printed.stderr, 'careful\n')
    assert.deepEqual(printed.answers, ['RD'])

    const stdin = await run('stdin', HIDDEN_TESTS.slice(0, 2))
    assert.equal(stdin.stdout, formatStdin(HIDDEN_TESTS.slice(0, 2)), 'the runtime gets problem.formatStdin(tests) as stdin')

    const compile = await run('print never\ncompile-error expected a semicolon')
    assert.equal(compile.status, 'compile_error')
    assert.equal(compile.phase, 'compile')
    assert.equal(compile.diagnostics[0].line, 2)
    assert.equal(compile.message, 'Line 2: expected a semicolon')
    assert.equal(compile.title, 'Compile Error')

    const thrown = await run('answer RD\nthrow index 7 out of bounds', SUBMIT.slice(0, 3))
    assert.equal(thrown.status, 'runtime_error')
    assert.equal(thrown.phase, 'run')
    assert.equal(thrown.error.test, 1, 'the board it was on')
    assert.equal(thrown.error.type, 'EchoError')
    assert.deepEqual(thrown.answers, ['RD', '', ''], 'answers so far are kept, the rest padded')

    for (const [source, pattern, what] of [
      ['crash broke the runtime', /runtime failed: broke the runtime/, 'run() threw'],
      ['exit-early', /stopped after 2 of 3 boards/, 'too few answers after ok'],
      ['fake-answer RDLU\nsolve', /answer marker/, 'the player printed the marker'],
      ['return bogus', /unknown/, 'an unknown status'],
      ['close', /closed the worker/, 'close() in the worker'],
    ]) {
      const r = await run(source, SUBMIT.slice(0, 3))
      assert.equal(r.status, 'crashed', `${what}: crashed (${r.status}: ${r.message})`)
      assert.match(r.message, pattern, what)
      assert.equal(r.title, 'Bug: Your Code Broke the Game')
    }
    const unhealthy = await run('unhealthy')
    assert.equal(unhealthy.status, 'ok')
    assert.equal((await run('solve')).status, 'ok', 'a fresh worker after an unhealthy run')

    // ------------------------------------------------ containment
    const escape = await run('escape')
    assert.equal(escape.status, 'ok')
    assert.match(escape.stdout, /^reachable: none\nprototype: none\nimport: blocked\n$/, `lockdown and CSP (${escape.stdout.trim()})`)
    const forged = await run('forge')
    assert.equal(forged.status, 'ok')
    assert.match(forged.stdout, /forged posts that went through: 0/)
    assert.equal((await run('solve')).status, 'ok', 'forged dispose / run events did nothing')
    const child = await run('spawn-echo hi')
    assert.equal(child.status, 'ok', child.message)
    assert.match(child.stdout, /^child got hi \(protocol 1, child fetch: undefined\)/, 'host.spawn(): a child with no network')

    // ------------------------------------------------ runaways (D2-D9)
    /**
     * A run that must be stopped and reported, with the CPU back to idle afterwards: within ~1 s of the
     * limit when the program stops itself (D9), or after `settleMs` when only terminate() can stop it
     * (Chromium force-stops a busy JavaScript thread about 2 s after terminate()).
     */
    const runaway = async (source, status, { stoppedBy = 'runtime', timeLimitMs = 1200, extra = {}, tests = ONE, settleMs = 300 } = {}) => {
      const r = await run(source, tests, { timeLimitMs, ...extra })
      assert.equal(r.status, status, `${source}: ${status} (${r.status}: ${r.message})`)
      assert.equal(r.stoppedBy, stoppedBy, `${source}: stopped by the ${stoppedBy}`)
      await pause(settleMs)
      const cores = await cpuAfter(`after ${source.split('\n')[0]}${settleMs > 300 ? ` (+${settleMs} ms)` : ''}`, idle)
      assert.ok(cores < idle + CPU_SLACK, `${source}: the CPU is back to idle ${settleMs > 300 ? `${settleMs} ms after` : 'within ~1 s of'} the limit (${cores.toFixed(2)} cores)`)
      return r
    }
    const TERMINATE_MS = 2300
    const spin = await runaway('spin', 'time_limit')
    assert.ok(spin.timings.runMs >= 1150 && spin.timings.runMs <= 1200 + LIMITS.selfStopSlackMs + 300, `stopped at its deadline (${spin.timings.runMs} ms)`)
    assert.ok(spin.ticks >= 3, `the checks ran (${spin.ticks} ticks)`)
    assert.equal(spin.title, 'Time Limit Exceeded')
    assert.equal(spin.phase, 'run')
    assert.equal(spin.sandboxRestarted, false)
    await runaway('spin-catch', 'time_limit') // swallows the first LimitError; the sticky check stops it anyway
    await runaway('clock-tamper', 'time_limit')
    const compileSpin = await runaway('compile-spin', 'time_limit', { extra: { compileLimitMs: 1200 } })
    assert.equal(compileSpin.phase, 'compile', 'a compile that never ends is a time limit while compiling')

    // the page stays responsive while a WebAssembly loop runs in the worker
    const responsive = await page.evaluate(async (tests) => {
      let last = performance.now()
      let worst = 0
      const timer = setInterval(() => { const t = performance.now(); worst = Math.max(worst, t - last); last = t }, 50)
      const r = await window.sb.run({ language: 'echo', source: 'spin-wasm', tests, kind: 'run', timeLimitMs: 1200 })
      clearInterval(timer)
      return { status: r.status, stoppedBy: r.stoppedBy, worst }
    }, ONE)
    assert.deepEqual([responsive.status, responsive.stoppedBy], ['time_limit', 'runtime'], 'a WebAssembly loop that calls io.check() stops itself')
    assert.ok(responsive.worst < 300, `the page kept running its timers (largest gap ${responsive.worst.toFixed(0)} ms)`)
    await pause(300)
    assert.ok((await cpuAfter('after spin-wasm', idle)) < idle + CPU_SLACK, 'spin-wasm: the CPU is back to idle')

    await runaway('spawn-spin', 'time_limit')
    await runaway('spawn-spin-wasm', 'time_limit')
    // a child with no check of its own: the host terminates it with its parent (a runtime bug, but bounded)
    await runaway('spawn-spin-hot', 'time_limit', { settleMs: TERMINATE_MS })
    const flood = await runaway('flood', 'output_limit')
    assert.ok(flood.consoleTruncated && flood.stdout.length <= LIMITS.consoleChars)
    await runaway('grow', 'memory_limit')
    const hot = await runaway('spin-hot', 'time_limit', { stoppedBy: 'host', settleMs: TERMINATE_MS })
    assert.equal(hot.sandboxRestarted, true, 'a runaway the host had to terminate rebuilds the iframe')
    assert.match(hot.message, /did not stop by itself/)
    assert.equal((await run('solve')).status, 'ok', 'the rebuilt sandbox runs the next program')
    assert.equal(await page.evaluate(() => document.querySelectorAll('iframe').length), 1, 'the old iframe is gone')

    // ------------------------------------------------ cancel
    /** starts a run, cancels it 400 ms into 'running', and returns the result and when */
    const cancelRun = (source, timeLimitMs) => page.evaluate(async ({ source, tests, timeLimitMs }) => {
      const sb = window.sb
      const p = sb.run({ language: 'echo', source, tests, kind: 'run', timeLimitMs })
      await new Promise((resolve) => {
        if (sb.state.phase === 'running') return resolve()
        const off = sb.subscribe(() => { if (sb.state.phase === 'running') { off(); resolve() } })
      })
      const since = performance.now()
      await new Promise((resolve) => setTimeout(resolve, 400))
      const t = performance.now()
      sb.cancel()
      const r = await p
      return { status: r.status, stoppedBy: r.stoppedBy, title: r.title, cancelMs: performance.now() - t, runningFor: t - since }
    }, { source, tests: ONE, timeLimitMs })
    for (const source of ['spin-wasm', 'spawn-spin-wasm']) {
      const tCancel = Date.now()
      const cancelled = await cancelRun(source, 2500)
      assert.equal(cancelled.status, 'cancelled', `${source}: cancelled`)
      assert.equal(cancelled.title, 'Stopped')
      assert.ok(cancelled.cancelMs < 500, `cancel answers at once (${cancelled.cancelMs.toFixed(0)} ms)`)
      // for the record: terminate() alone (Chromium: ~2 s late; WebKit: wasm may run on)
      await cpuAfter(`${source}, 0-1.5 s after cancel (terminate() alone)`, idle)
      // the program's own deadline check stops it in any case (D3)
      const deadlineIn = 2500 - cancelled.runningFor - cancelled.cancelMs - (Date.now() - tCancel - cancelled.cancelMs)
      await pause(Math.max(0, deadlineIn) + 300)
      assert.ok((await cpuAfter(`${source}, cancelled: from 0.3 s past its own deadline`, idle)) < idle + CPU_SLACK, `${source}: a cancelled program stops at its own deadline`)
      assert.equal((await run('solve')).status, 'ok', 'the next run after a cancel works')
    }

    // ------------------------------------------------ one run at a time
    const queued = await page.evaluate(async (tests) => {
      const sb = window.sb
      const order = []
      const a = sb.run({ language: 'echo', source: 'sleep 300\nanswer-each R', tests, kind: 'run' }).then((r) => { order.push('a'); return r.answers })
      const b = sb.run({ language: 'echo', source: 'answer-each L', tests, kind: 'run' }).then((r) => { order.push('b'); return r.answers })
      return { answers: [await a, await b], order }
    }, ONE)
    assert.deepEqual(queued, { answers: [['R'], ['L']], order: ['a', 'b'] }, 'runs go one at a time, in call order')
    const bad = await page.evaluate(() => window.sb.run({ language: 'echo', source: '', tests: [], kind: 'run' }).then(() => 'resolved', (e) => `rejected: ${e.message}`))
    assert.match(bad, /^rejected: a run needs 1-/, 'a malformed request rejects')
    const badLimit = await page.evaluate((tests) => window.sb.run({ language: 'echo', source: '', tests, kind: 'run', timeLimitMs: 0 }).then(() => 'resolved', (e) => `rejected: ${e.message}`), ONE)
    assert.match(badLimit, /^rejected: run\(\): timeLimitMs must be/, 'a bad time limit rejects')
    const unknown = await runOnPage(page, { language: 'ruby', source: 'puts 1', tests: ONE, kind: 'run' })
    assert.equal(unknown.status, 'unavailable', 'an unknown language is unavailable, not a crash')

    // ------------------------------------------------ a lost heartbeat rebuilds the iframe
    const lost = await page.evaluate(async (tests) => {
      const sb = window.sb
      const original = sb.onHostMessage
      sb.onHostMessage = function (message) { if (message && message.type === 'beat') return; return original.call(this, message) }
      const p = sb.run({ language: 'echo', source: 'sleep 6000', tests, kind: 'run', timeLimitMs: 8000 })
      const seen = []
      const off = sb.subscribe(() => seen.push(sb.state.phase))
      const r = await p
      sb.onHostMessage = original
      await new Promise((resolve) => setTimeout(resolve, 300))
      off()
      return { status: r.status, stoppedBy: r.stoppedBy, restarted: r.sandboxRestarted, seen }
    }, ONE)
    assert.deepEqual([lost.status, lost.stoppedBy, lost.restarted], ['memory_limit', 'sandbox', true], `no heartbeat for ${LIMITS.heartbeatTimeoutMs} ms: the sandbox is rebuilt (${JSON.stringify(lost)})`)
    assert.ok(lost.seen.includes('restarting'), 'state: restarting')
    assert.equal((await run('solve')).status, 'ok', 'the rebuilt sandbox works')
    assert.equal(await page.evaluate(() => document.querySelectorAll('iframe').length), 1)

    // ------------------------------------------------ dispose
    await page.evaluate(() => window.sb.dispose())
    assert.equal(await page.evaluate(() => document.querySelectorAll('iframe').length), 0, 'dispose() removes the iframe')
    assert.equal((await run('solve')).status, 'cancelled', 'a run after dispose() is cancelled')
    await page.context().close()

    // ------------------------------------------------ a runtime that cannot load
    {
      const page2 = await openCodePage(browser, server.base)
      await page2.route('**/ink-maze-code/echo/runtime.js', (route) => route.fulfill({ status: 404, body: 'gone' }))
      const failed = await page2.evaluate(() => window.sb.load('echo').then(() => 'loaded', (e) => e.message))
      assert.match(failed, /HTTP 404/, `load() rejects with the reason (${failed})`)
      assert.equal(await page2.evaluate(() => window.sb.runtimeStatus('echo')), 'failed')
      const unavailable = await runOnPage(page2, { language: 'echo', source: 'solve', tests: ONE, kind: 'run' })
      assert.equal(unavailable.status, 'unavailable')
      assert.equal(unavailable.phase, 'load')
      assert.equal(unavailable.title, 'Could Not Load')
      await page2.unroute('**/ink-maze-code/echo/runtime.js')
      const again = await runOnPage(page2, { language: 'echo', source: 'solve', tests: ONE, kind: 'run' })
      assert.equal(again.status, 'ok', 'a failed runtime loads again on the next run')
      await page2.evaluate(() => window.sb.dispose())
      await page2.context().close()
    }

    // ------------------------------------------------ positive control (last)
    {
      meter.mark()
      const page3 = await openCodePage(browser, server.base)
      meter.capture()
      await page3.evaluate(() => window.sb.load('echo'))
      const r = await runOnPage(page3, { language: 'echo', source: 'spin-wasm-hot', tests: ONE, kind: 'run', timeLimitMs: 800 })
      assert.equal(r.status, 'time_limit')
      assert.equal(r.stoppedBy, 'host', 'with no deadline check only the host can step in')
      const soon = await cpuAfter('positive control: WebAssembly with no check, 0-1.5 s after terminate()', idle)
      assert.ok(soon > idle + 0.6, `the meter sees the runaway thread (${soon.toFixed(2)} cores); without this the readings above prove nothing`)
      await pause(TERMINATE_MS - 1500)
      const later = await cpuAfter(`positive control, ${TERMINATE_MS}-${TERMINATE_MS + 1500} ms after terminate()`, idle)
      if (name === 'webkit') {
        assert.ok(later > idle + 0.6, `WebKit keeps an unchecked WebAssembly loop running after terminate() (${later.toFixed(2)} cores): this is why runtimes must stop themselves`)
      } else {
        assert.ok(later < idle + CPU_SLACK, `Chromium force-stops it about 2 s after terminate() (${later.toFixed(2)} cores)`)
      }
    }
    if (page.errors.length) log(`page errors: ${page.errors.slice(0, 5).join(' | ')}`)
    log('pass')
  } finally {
    await browser.close()
  }
}
