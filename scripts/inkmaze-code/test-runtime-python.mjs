#!/usr/bin/env node
/*
 * Ink Maze level 26: the Python runtime (Pyodide) in real browsers.
 *
 *   node scripts/inkmaze-code/test-runtime-python.mjs            both engines
 *   node scripts/inkmaze-code/test-runtime-python.mjs webkit     one engine
 *   CGS_TEST_URL=http://localhost:5190 node scripts/inkmaze-code/test-runtime-python.mjs
 *
 * Needs Playwright (CGS_PLAYWRIGHT_MODULE, see scripts/inkmaze-code-browser.mjs)
 * and runs with the repo's Node 24 (export PATH="$HOME/.local/node/bin:$PATH").
 * Not part of `npm test`: it drives browsers, loads Pyodide from the CDN and
 * takes a few minutes.
 *
 * It proves, against src/minigames/inkmaze/code/sandbox.ts + problem.ts and the
 * production runtime in public/minigames/ink-maze-code/python/:
 *   - the reference and the naive solution clear a full submission (the visible
 *     map + the 12 hidden tests), accepted by the real engine, and time them;
 *   - compile errors, runtime errors (with the player's line and the board
 *     index), wrong return types and a printed answer-marker are reported right;
 *   - every runaway is stopped BY THE RUNTIME (never the host's terminate()
 *     backstop), the next run works, and the browser's CPU is back to idle
 *     within ~1 s of the limit and stays there for 5 s (contract D5/D9) -- the
 *     WebKit case, where terminate() cannot stop a WebAssembly loop, is the
 *     point of the cooperative deadline. The cases cover a tight loop, a loop
 *     inside `except`/`finally`, a loop deep in recursion, deep recursion
 *     itself, an allocation bomb, an output flood, harness tampering, AND the
 *     C-level loops the refutation found -- a generator expression /
 *     comprehension / callable-iterator consumed by a C builtin, a pure-C
 *     sum(range)/any(iter)/reduce(count)/deque(count), a __del__ that spins a
 *     comprehension, re backtracking, math.factorial and int<->str bombs;
 *   - a positive control (CPU high WHILE a loop runs, idle after it stops)
 *     shows the meter really sees the Pyodide worker.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { judgeAll, randomBoard, submissionTests } from '../../src/minigames/inkmaze/code/problem.ts'
import { LIMITS } from '../../src/minigames/inkmaze/code/contract.ts'
import { checkConsistency } from '../../src/minigames/inkmaze/code/runtimes/python.ts'
import { cpuMeter, devServer, launch, openCodePage, pause, runOnPage } from '../inkmaze-code-browser.mjs'

assert.deepEqual(checkConsistency(), [], 'contract.ts / problem.ts agree with the Python runtime')

const SOL = fileURLToPath(new URL('./solutions/', import.meta.url))
const REF = readFileSync(SOL + 'python-reference.py', 'utf8')
const NAIVE = readFileSync(SOL + 'python-naive.py', 'utf8')
const solution = (body) => `class Solution:\n    def solve(self, grid, ink):\n${body.split('\n').map((l) => '        ' + l).join('\n')}\n`

const names = process.argv.slice(2).filter((a) => !a.startsWith('-'))
const BROWSERS = names.length ? names : ['chromium', 'webkit']
const CPU_SLACK = 0.3

const visible = randomBoard(7)
const ONE = [{ grid: visible.grid, ink: visible.ink }]
const SUBMIT = submissionTests(visible).map((b) => ({ grid: b.grid, ink: b.ink }))

const server = await devServer()
console.log(`ink maze python runtime: ${server.base}`)
try {
  for (const name of BROWSERS) await suite(name)
} finally {
  server.stop()
}
console.log(`PASS ink maze python runtime (${BROWSERS.join(', ')})`)

async function suite(name) {
  const meter = cpuMeter()
  const browser = await launch(name)
  const log = (m) => console.log(`  ${name}: ${m}`)
  try {
    const page = await openCodePage(browser, server.base)
    meter.capture()
    const run = (source, tests = ONE, extra = {}) => runOnPage(page, { language: 'python', source, tests, kind: 'run', ...extra })
    const cpuAfter = async (label, idle) => {
      const cores = await meter.cores(1500)
      log(`${label}: ${cores.toFixed(2)} cores (idle ${idle.toFixed(2)})${cores > idle + CPU_SLACK ? `\n      ${meter.detail.join('\n      ')}` : ''}`)
      return cores
    }

    // ---- lazy, cold load
    assert.equal(await page.evaluate(() => document.querySelectorAll('iframe').length), 0, 'no iframe before load()')
    const tLoad = Date.now()
    await page.evaluate(() => window.sb.load('python'))
    const loadMs = Date.now() - tLoad
    const info = await page.evaluate(() => window.sb.runtimeInfo('python'))
    log(`cold load (empty cache): ${loadMs} ms; ${JSON.stringify(info.info)}; download est ${(info.downloadBytes / 1e6).toFixed(1)} MB`)
    assert.equal(info.status, 'ready')
    assert.equal(info.info.engine, 'pyodide')
    assert.ok(!page.requests.some((u) => /unpkg|skypack/.test(u)), 'only the pinned jsDelivr CDN')
    assert.ok(page.requests.some((u) => u.includes('cdn.jsdelivr.net/pyodide/v314.0.7/full/')), 'Pyodide from the pinned CDN')
    await pause(400)
    const idle = await cpuAfter('idle after load', 0)
    assert.ok(idle < 0.6, `quiet enough to measure (${idle.toFixed(2)})`)

    // ---- correctness + timings
    let r = await run(REF, SUBMIT, { kind: 'submit' })
    assert.equal(r.status, 'ok', r.message)
    assert.equal(r.answered, SUBMIT.length)
    assert.ok(judgeAll(SUBMIT, r.answers).accepted, 'reference accepted on all 13 boards')
    log(`reference submit (13 boards): ${r.timings.runMs} ms run, ${r.timings.totalMs} ms total`)
    const warm = await run(REF, ONE)
    log(`warm run (1 board): ${warm.timings.runMs} ms`)
    r = await run(NAIVE, SUBMIT, { kind: 'submit' })
    assert.equal(r.status, 'ok', `naive: ${r.message}`)
    assert.ok(judgeAll(SUBMIT, r.answers).accepted, 'naive accepted on all 13 boards')
    log(`naive submit (13 boards): ${r.timings.runMs} ms run (limit ${r.limits.timeLimitMs} ms)`)
    assert.ok(r.timings.runMs < r.limits.timeLimitMs, 'naive fits the submit limit')
    const mem = await page.evaluate(() => window.sb.runtimeInfo('python').memoryBytes)
    log(`heap after runs: ${(mem / 1e6).toFixed(0)} MB`)

    // ---- the player's own mistakes
    const compile = await run(solution('return grid[0]\n  bad indent'))
    assert.equal(compile.status, 'compile_error')
    assert.ok(compile.diagnostics[0].line >= 1, 'compile error carries a line')
    const err = await run(solution('return grid[999]'))
    assert.equal(err.status, 'runtime_error')
    assert.equal(err.error.type, 'IndexError')
    assert.equal(err.error.test, 0, 'the board it was on')
    assert.equal(err.error.line, 3, "the player's own line")
    const wrong = await run(solution('return 42'))
    assert.equal(wrong.status, 'runtime_error')
    assert.equal(wrong.error.type, 'TypeError')
    assert.match(wrong.error.message, /must return a string/)
    const marker = await run(solution('print("@@ANSWER@@ RRRR")\nreturn ""'))
    assert.equal(marker.status, 'crashed', `printing the marker is a crash (${marker.status})`)
    assert.match(marker.message, /@@ANSWER@@/)
    const printed = await run(solution('print("thinking...")\nreturn ""'))
    assert.equal(printed.status, 'ok')
    assert.equal(printed.stdout, 'thinking...\n', 'console keeps the prints, not the answers')

    // ---- runaways: stopped, reported, CPU back to idle (D9)
    // A cooperative stop (time_limit / output_limit) keeps the worker, so the
    // CPU must be idle right away. A memory_limit recycles the worker (the wasm
    // heap never shrinks), so Pyodide reloads -- a bounded, expected ~1.5 s of
    // CPU, measured AFTER the recovering run, not counted as a leak.
    const runaway = async (name, source, status, { timeLimitMs = 1000, settleMs = 300, recycles = false } = {}) => {
      const res = await run(source, ONE, { timeLimitMs })
      assert.equal(res.status, status, `${name}: got ${res.status} (${res.message})`)
      assert.equal(res.stoppedBy, 'runtime', `${name}: stopped by the runtime, not the host`)
      if (recycles) {
        assert.equal((await run(REF, ONE)).status, 'ok', `a normal run works after ${name} (worker rebuilt)`)
        await pause(settleMs)
        const cores = await cpuAfter(`after ${name} (+ rebuild)`, idle)
        assert.ok(cores < idle + CPU_SLACK, `${name}: CPU idle once the rebuilt worker is ready (${cores.toFixed(2)})`)
      } else {
        await pause(settleMs)
        const cores = await cpuAfter(`after ${name}`, idle)
        assert.ok(cores < idle + CPU_SLACK, `${name}: CPU back to idle within ~1 s of the limit (${cores.toFixed(2)})`)
        assert.equal((await run(REF, ONE)).status, 'ok', `a normal run works after ${name}`)
      }
      return res
    }
    const spin = await runaway('tight loop', solution('while True:\n    pass'), 'time_limit')
    assert.equal(spin.phase, 'run')
    assert.ok(spin.timings.runMs >= 950 && spin.timings.runMs <= 1000 + LIMITS.selfStopSlackMs + 400, `stopped near its deadline (${spin.timings.runMs} ms)`)
    assert.equal(spin.sandboxRestarted, false, 'a cooperative stop does not rebuild the iframe')
    await runaway('loop in except', solution('while True:\n    try:\n        pass\n    except BaseException:\n        pass'), 'time_limit')
    await runaway('looping finally', solution('try:\n    while True:\n        pass\nfinally:\n    while True:\n        pass'), 'time_limit')
    await runaway('loop deep in recursion', solution('def f(n):\n    if n > 40:\n        while True:\n            pass\n    return f(n + 1)\nreturn f(0)'), 'time_limit')
    await runaway('output flood', solution('while True:\n    print("x" * 2000)'), 'output_limit', { timeLimitMs: 4000 })
    await runaway('allocation bomb', solution('x = []\nwhile True:\n    x.append(bytearray(1024 * 1024))'), 'memory_limit', { timeLimitMs: 4000, settleMs: 300, recycles: true })
    const deep = await run(solution('def f(n):\n    return f(n + 1)\nreturn f(0)'))
    assert.equal(deep.status, 'runtime_error')
    assert.equal(deep.error.type, 'RecursionError', 'deep recursion is a clean RecursionError, not a hang')
    await pause(300)
    assert.ok((await cpuAfter('after deep recursion', idle)) < idle + CPU_SLACK, 'deep recursion left the CPU idle')

    // ---- C-LEVEL runaways (the refutation): a loop that iterates inside a C
    // builtin takes no Python back-edge the AST can see, so these used to reach
    // only the host's terminate() backstop (stoppedBy 'host'), which in WebKit
    // does NOT stop a wasm thread -- each left a core burning. They must now be
    // stopped by the runtime itself: the interrupt buffer (bytecode-driven C
    // loops) or the bounded C consumers / sources (pure-C loops). Assert
    // stoppedBy 'runtime' AND sandboxRestarted false AND the CPU back to idle,
    // measured for a full 5 s starting 0.3 s after the limit (contract D5/D9).
    const cRunaway = async (name, source, { timeLimitMs = 1000 } = {}) => {
      const res = await run(source, ONE, { timeLimitMs })
      assert.equal(res.status, 'time_limit', `${name}: got ${res.status} (${res.message})`)
      assert.equal(res.stoppedBy, 'runtime', `${name}: stopped by the runtime, not the host's terminate() backstop`)
      assert.equal(res.sandboxRestarted, false, `${name}: a cooperative stop does not rebuild the iframe`)
      await pause(300)
      const cores = await meter.cores(5000)
      log(`after ${name}: ${cores.toFixed(2)} cores (idle ${idle.toFixed(2)}); ${res.timings.runMs} ms${cores > idle + 0.1 ? `\n      ${meter.detail.join('\n      ')}` : ''}`)
      assert.ok(cores <= idle + 0.1, `${name}: CPU back to <= idle+0.1 within 1 s of the limit, held for 5 s (${cores.toFixed(2)})`)
      assert.equal((await run(REF, ONE)).status, 'ok', `a normal run works after ${name}`)
    }
    // a generator expression / comprehension consumed by a C builtin
    await cRunaway('genexp sum', solution('return sum(1 for _ in range(10 ** 18))'))
    await cRunaway('any(genexp)', solution('return any(False for _ in iter(int, 1))'))
    await cRunaway('set comprehension', solution('return str({x for x in iter(int, 1)})'), { timeLimitMs: 1500 })
    await cRunaway('module-level genexp', 'X = sum(1 for _ in range(10 ** 18))\n' + solution('return ""'))
    // a pure-C loop with no bytecode per step (bounded at the source)
    await cRunaway('sum(range) pure C', solution('return sum(range(10 ** 18))'))
    await cRunaway('any(iter(int, 1)) pure C', solution('return any(iter(int, 1))'))
    await cRunaway('max(iter(lambda)) pure C', solution('return max(iter(lambda: 0, 1))'))
    await cRunaway('reduce(op.add, count)', solution('import functools, operator, itertools\nreturn str(functools.reduce(operator.add, itertools.count()))'))
    await cRunaway('deque(count, 0) pure C', solution('import collections, itertools\ncollections.deque(itertools.count(), 0)\nreturn ""'))
    // a finaliser that spins a comprehension during end-of-run gc
    await cRunaway('__del__ genexp', solution('class B:\n    def __del__(self):\n        [0 for _ in range(10 ** 18)]\nb = B()\nb2 = b\ndel b\nreturn ""'), { timeLimitMs: 1500 })

    // gc.callbacks is cleared between runs, so a poisoned callback cannot spin
    // during the NEXT run's end-of-run gc; the poisoning run is a clean ok/limit.
    const poison = await run(solution('import gc\ngc.callbacks.append(lambda *a: [0 for _ in range(10 ** 18)])\nreturn ""'), ONE, { timeLimitMs: 1500 })
    assert.ok(poison.status === 'ok' || poison.status === 'time_limit', `gc.callbacks poison is contained (${poison.status})`)
    assert.equal((await run(REF, ONE)).status, 'ok', 'a normal run works after the gc.callbacks poison')
    await pause(300)
    assert.ok((await cpuAfter('after gc.callbacks poison', idle)) < idle + CPU_SLACK, 'the poisoned callback does not keep burning CPU')

    // ---- unbounded library code is bounded, not stopped by the backstop (D2)
    const reBlocked = await run(solution('import re\nreturn str(re.match(r"(a+)+$", "a" * 64 + "!"))'))
    assert.equal(reBlocked.status, 'runtime_error', 're (catastrophic backtracking has no back-edge to tick) is refused')
    assert.match(reBlocked.error.message, /not available/i, 're is reported as unavailable, not a hang')
    const fact = await run(solution('import math\nreturn str(math.factorial(10 ** 8))'))
    assert.equal(fact.status, 'runtime_error', 'math.factorial of a huge argument is capped, not a hang')
    assert.equal(fact.error.type, 'ValueError')
    const intStr = await run(solution('import sys\nsys.set_int_max_str_digits(0)\nreturn str(int("9" * 200000))'))
    assert.equal(intStr.status, 'runtime_error', 'the int<->str digit cap cannot be lifted to 0 (unlimited)')
    assert.equal(intStr.error.type, 'ValueError')
    const osClose = await run(solution('import os\nos.close(1)\nreturn ""'))
    assert.equal(osClose.status, 'runtime_error', 'closing a standard fd is refused, so it cannot crash the interpreter')
    assert.equal((await run(REF, ONE)).status, 'ok', 'a normal run works after the os.close(1) attempt')

    // ---- harness / interpreter tampering: reported, and the next run still works
    const tamper = async (source, note) => {
      const res = await run(source, ONE, { timeLimitMs: 4000 })
      const after = await run(REF, ONE)
      log(`tamper ${note}: ${res.status}; next run ${after.status}`)
      assert.equal(after.status, 'ok', `a normal run works after ${note}`)
      return res
    }
    await tamper(solution('import io\nio.open = lambda *a, **k: None\nreturn ""'), 'poison io.open')
    await tamper(solution('import sys\nsys.addaudithook(lambda e, a: None)\nreturn ""'), 'add audit hook')
    await tamper(solution('import os\nos.close(1)\nreturn ""'), 'close stdout fd')
    await tamper(solution('import builtins\nbuiltins.len = None\nreturn ""'), 'tamper builtins')
    const reserved = await run(solution('__ink_tick__ = None\nreturn ""'))
    assert.equal(reserved.status, 'compile_error', 'player cannot touch the reserved deadline name')
    assert.match(reserved.message.toLowerCase(), /reserved/)

    // ---- the refutation's attacks: the deadline machinery is unshadowable, the
    // compile bomb is a clean error, a looping __str__ does not crash, isqrt is
    // bounded, and sys.addaudithook is actually refused. (contract D3/D5/D9)
    // 1. shadowing __ink_tick__ through a subscript/exec is a compile error --
    //    and the injected tick is a closure cell the write could not reach anyway
    for (const [src, note] of [
      ["globals()['__ink_tick__'] = lambda: None\nwhile True:\n    pass", 'globals() subscript shadow'],
      ["d = globals()\nd['__ink_iter__'] = lambda it: it\nreturn str(sum(1 for _ in range(10 ** 18)))", 'aliased globals() subscript shadow'],
      ['exec("__ink_tick__ = lambda: None")\nwhile True:\n    pass', 'exec() shadow'],
      ["setattr(__builtins__, '__ink_tick__', None)\nwhile True:\n    pass", 'setattr builtins shadow'],
      ['t = type(self).solve.__closure__\nwhile True:\n    pass', 'reach the tick via __closure__'],
    ]) {
      const r = await run(solution(src), ONE, { timeLimitMs: 1000 })
      assert.equal(r.status, 'compile_error', `${note} is a compile error (${r.status}: ${r.message})`)
    }
    // 2. even if the tick were somehow bypassed, a loop that swallows the single
    //    interrupt is still stopped (unshadowable tick), stoppedBy runtime, CPU idle
    await runaway('swallow the interrupt in a bare loop', solution('while True:\n    try:\n        x = 1\n    except BaseException:\n        pass'), 'time_limit')
    // 3. an exception whose __str__ loops is a clean runtime_error, never a
    //    Pyodide-fatal crash, and leaves the CPU idle
    const strExc = await run(solution('class E(Exception):\n    def __str__(self):\n        while True:\n            pass\nraise E()'), ONE, { timeLimitMs: 1000 })
    assert.equal(strExc.status, 'runtime_error', `a looping __str__ is a clean runtime_error (${strExc.status}: ${strExc.message})`)
    assert.ok(strExc.stoppedBy !== 'host', 'the looping __str__ was not a host-terminate backstop')
    await pause(300)
    assert.ok((await cpuAfter('after looping __str__', idle)) < idle + CPU_SLACK, 'a looping __str__ leaves the CPU idle')
    assert.equal((await run(REF, ONE)).status, 'ok', 'a normal run works after the looping __str__')
    // 4. a deeply nested paren bomb (under the source cap) is a clean compile
    //    error, never a StackOverflow runtime_error / Pyodide fatal + rebuild
    const errBefore = page.errors.length
    const bomb = await run(solution('return ' + '('.repeat(20000) + '1' + ')'.repeat(20000)), ONE, { timeLimitMs: 2000 })
    assert.equal(bomb.status, 'compile_error', `a nested-paren compile bomb is a clean compile_error (${bomb.status})`)
    assert.equal(page.errors.length, errBefore, 'the compile bomb raised no page / Pyodide fatal errors')
    // 5. math.isqrt of an astronomically large int is a clean ValueError (its true
    //    type), never masked as "module re is not available", never a hang
    const isqrt = await run(solution('import math\nreturn str(math.isqrt(1 << 400000000))'), ONE, { timeLimitMs: 2000 })
    assert.equal(isqrt.status, 'runtime_error', `isqrt bomb is a clean runtime_error (${isqrt.status})`)
    assert.equal(isqrt.error.type, 'ValueError', `isqrt bomb reports its true type, not the re error (${isqrt.error.type})`)
    assert.equal((await run(solution('import math\nreturn str(math.isqrt(1_000_000))'))).status, 'ok', 'an ordinary math.isqrt still works')
    // 6. sys.addaudithook is actually refused (the audit event is inert here, so
    //    the refusal wraps the function itself)
    const audit = await run(solution('import sys\nsys.addaudithook(lambda e, a: None)\nreturn ""'))
    assert.equal(audit.status, 'runtime_error', 'sys.addaudithook is refused')
    assert.match(audit.error.message, /addaudithook is not available/)
    // 7. the wrapper preserves module semantics: a module-level global + helper
    //    recursion + comprehension still runs
    const legit = await run('COUNT = 0\ndef bump():\n    global COUNT\n    COUNT += 1\n    return COUNT\nclass Solution:\n    def solve(self, grid, ink):\n        bump()\n        total = sum(1 for _ in range(COUNT))\n        return ""')
    assert.equal(legit.status, 'ok', `a global + helper + comprehension solution runs (${legit.status}: ${legit.message})`)

    // ---- positive control: the meter DOES see the Pyodide worker's CPU
    const control = page.evaluate((tests) => window.sb.run({ language: 'python', source: 'class Solution:\n    def solve(self, grid, ink):\n        while True:\n            pass\n', tests, kind: 'run', timeLimitMs: 3000 }), ONE)
    await pause(700)
    const busy = await meter.cores(1200)
    log(`positive control: CPU WHILE a loop runs = ${busy.toFixed(2)} cores`)
    assert.ok(busy > idle + 0.5, `the meter sees the running Pyodide worker (${busy.toFixed(2)} cores)`)
    const cres = await control
    assert.equal(cres.status, 'time_limit')
    await pause(300)
    assert.ok((await cpuAfter('positive control, after the limit', idle)) < idle + CPU_SLACK, 'and the CPU drops once it stops itself')

    if (page.errors.length) log(`page errors: ${page.errors.slice(0, 4).join(' | ')}`)
    assert.equal(page.errors.length, 0, 'no uncaught page errors')
    log('pass')
  } finally {
    await browser.close()
  }
}

