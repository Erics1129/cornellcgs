#!/usr/bin/env node
/**
 * Ink Maze level 26, the C/C++ runtime: Node tests.
 *
 *   node scripts/inkmaze-code/test-runtime-c-node.mjs          pure helpers only (fast, no toolchain)
 *   INK_CLANG_BUNDLE=/path/to/@yowasp/clang/gen/bundle.js \
 *     node scripts/inkmaze-code/test-runtime-c-node.mjs        also compiles and runs every case
 *
 * The pure part needs nothing but the repo: it checks the WebAssembly fuel
 * pass (instrumentWasm) and the object-symbol reader on real modules, the
 * compiler/linker diagnostic parsers, escapeAnswer against problem.ts, and the
 * demangler. The toolchain part, when INK_CLANG_BUNDLE points at a local
 * @yowasp/clang, loads the real runtime and runs every program in
 * test-runtime-c-cases.mjs (also the browser suite's cases) plus the reference
 * and naive solutions on a full submission, exactly as the page would judge
 * them. The browser suite scripts/inkmaze-code/test-runtime-c.mjs proves the
 * same cases, and the CPU-after-timeout requirement (D9), in Chromium and WebKit.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  C_FLAGS, CXX_FLAGS, demangleSimple, escapeAnswer, instrumentWasm, makeClangRuntime, objectSymbols,
  parseCompilerOutput, parseDriverCommands, parseLinkerOutput, WasmError,
} from '../../src/minigames/inkmaze/code/runtimes/c.ts'
import { LIMITS } from '../../src/minigames/inkmaze/code/contract.ts'
import { STARTER_CODE, escapeAnswer as problemEscape, formatStdin, judgeAll, parseStdout, randomBoard, submissionTests } from '../../src/minigames/inkmaze/code/problem.ts'
import { CASES } from './test-runtime-c-cases.mjs'

const REPO = fileURLToPath(new URL('../../', import.meta.url))
const CODE = `${REPO}public/minigames/ink-maze-code/`
const read = (p) => readFileSync(`${CODE}${p}`, 'utf8')

// ----------------------------------------------------- the WebAssembly fuel pass
{
  // a hand-built module: an exported function with a loop calling an imported check
  // (module (import "ink" "check" (func)) (memory 1 10) (global $sp (mut i32) i32.const 0)
  //  (func (export "spin") (loop (call 0) (br 0))))
  const mod = [
    0, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
    1, 4, 1, 0x60, 0, 0, // type: [] -> []
    2, 0x0d, 1, 3, 0x69, 0x6e, 0x6b, 5, 0x63, 0x68, 0x65, 0x63, 0x6b, 0, 0, // import ink.check
    3, 2, 1, 0, // function 1 uses type 0
    5, 4, 1, 1, 1, 10, // memory min 1 max 10
    6, 6, 1, 0x7f, 1, 0x41, 0, 0x0b, // a mutable i32 global = 0
    7, 8, 1, 4, 0x73, 0x70, 0x69, 0x6e, 0, 1, // export spin = func 1
    10, 11, 1, 9, 0, 3, 0x40, 0x10, 0, 0x0c, 0, 0x0b, 0x0b, // body: loop call 0; br 0; end end
  ]
  const bytes = new Uint8Array(mod)
  assert.ok(WebAssembly.validate(bytes), 'the hand-built module is valid')
  const report = instrumentWasm(bytes, { checkImport: { module: 'ink', name: 'check' }, fuel: 4 })
  assert.ok(WebAssembly.validate(report.bytes), 'the instrumented module is valid')
  assert.equal(report.checkIndex, 0)
  assert.ok(report.loops >= 1 && report.functions === 1)
  // run it: the loop calls check (so instrumentation added checks too); it must stop at the deadline
  let calls = 0
  const instance = new WebAssembly.Instance(new WebAssembly.Module(report.bytes), { ink: { check: () => { if (++calls > 1000) throw new Error('deadline') } } })
  assert.throws(() => instance.exports.spin(), /deadline/, 'the instrumented loop calls out and can be stopped')
  assert.ok(calls > 1000)

  // adding the import (no existing check): defined-function indices shift, calls still resolve
  const added = instrumentWasm(bytes, { addImport: { module: 'ink', name: 'check' }, fuel: 4 })
  assert.ok(WebAssembly.validate(added.bytes), 'adding the check import keeps the module valid')
  assert.equal(added.checkIndex, 1, 'the added check is the second function import (after ink.check already present)')
  let added2 = 0
  const inst2 = new WebAssembly.Instance(new WebAssembly.Module(added.bytes), { ink: { check: () => { if (++added2 > 500) throw new Error('stop') } } })
  assert.throws(() => inst2.exports.spin(), /stop/)

  // the memory cap is applied
  const capped = instrumentWasm(bytes, { addImport: { module: 'ink', name: 'check' }, memoryMaxPages: 5 })
  assert.equal(capped.memoryMaxPages, 5)
  assert.throws(() => instrumentWasm(bytes, { addImport: { module: 'ink', name: 'check' }, memoryMaxPages: 0 }), /memory at start/, 'a cap below the start size is refused')

  // fails closed on things it must not let through
  assert.throws(() => instrumentWasm(new Uint8Array([1, 2, 3]), { addImport: { module: 'ink', name: 'check' } }), WasmError, 'not a module')
  assert.throws(() => instrumentWasm(bytes, {}), WasmError, 'needs a check import or an added one')
  // an exception tag section (0x0d) is refused: exception handling could catch the stop
  const withTag = new Uint8Array([...bytes, 13, 1, 0])
  assert.throws(() => instrumentWasm(withTag, { addImport: { module: 'ink', name: 'check' } }), /exception/, 'a tag section is refused')

  console.log(`ok  fuel pass: valid, stops the loop, caps memory, fails closed (${report.loops} loops in the toy module)`)
}

// ----------------------------------------------------- object symbols
{
  // objectSymbols on a tiny relocatable object would need the compiler; instead
  // check it reads a non-relocatable module's lack of a linking section as an error
  const minimal = new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0])
  assert.throws(() => objectSymbols(minimal), /relocatable/, 'a linked module has no linking section')
  console.log('ok  object symbols: a non-relocatable module is rejected')
}

// ----------------------------------------------------- escapeAnswer agrees with problem.ts
{
  for (const moves of ['', 'RDLU', 'R@D', 'a\nb\tc', '\u0000\u001f\u007f', 'U'.repeat(20000), 'R\u{1f600}D', '\ud800lone']) {
    assert.equal(escapeAnswer(moves, LIMITS.answerChars), problemEscape(moves), `escapeAnswer('${JSON.stringify(moves)}') matches problem.ts`)
  }
  assert.equal(escapeAnswer('@'.repeat(100), 5).length, 5, 'escapeAnswer honours the cap')
  console.log("ok  escapeAnswer matches problem.ts (incl. '@', control chars, surrogates, the cap)")
}

// ----------------------------------------------------- the diagnostic parsers
{
  const cc = parseCompilerOutput([
    "solution.c:2:13: error: expected ';' at end of declaration",
    "solution.c:5:9: warning: unused variable 'x' [-Wunused-variable]",
    'clang: error: no such file or directory',
  ].join('\n'), 'c')
  assert.equal(cc[0].line, 2)
  assert.equal(cc[0].severity, 'error')
  assert.ok(cc.some((d) => d.severity === 'warning' && d.line === 5))

  // an error inside libc++ takes the player's "requested here" note line
  const tmpl = parseCompilerOutput([
    '/usr/include/c++/v1/__algorithm/sort.h:42:1: error: invalid operands to binary expression',
    'solution.cpp:10:5: note: in instantiation of function template specialization requested here',
  ].join('\n'), 'cpp')
  assert.equal(tmpl[0].line, 10, 'a libc++ error is reported at the player call that caused it')

  // the glue header's error becomes a plain message at a player line (or null)
  const glue = parseCompilerOutput([
    "(game harness):17:17: error: variable has incomplete type 'Solution'",
    '/ink/pre.hpp:17:17: error: variable has incomplete type \'Solution\'',
  ].join('\n'), 'cpp')
  assert.ok(glue.some((d) => /must define class Solution/.test(d.message)), 'the glue error is turned into advice')

  const link = parseLinkerOutput('wasm-ld: error: solution.o: undefined symbol: solve', 'c')
  assert.match(link[0].message, /does not define solve\(\)/)
  const dup = parseLinkerOutput('wasm-ld: error: duplicate symbol: main', 'cpp')
  assert.match(dup[0].message, /defines main\(\)/)
  console.log('ok  diagnostic parsers: compiler lines, libc++ instantiation notes, linker messages')
}

// ----------------------------------------------------- the driver-command parser
{
  const output = [
    'clang version 22.1.0',
    'Target: wasm32-unknown-wasip1',
    ' (in-process)',
    ' "/clang" "-cc1" "-emit-obj" "solution.c" "-o" "solution.o"',
    '',
  ].join('\n')
  const commands = parseDriverCommands(output)
  assert.equal(commands.length, 1)
  assert.deepEqual(commands[0].slice(0, 3), ['/clang', '-cc1', '-emit-obj'])
  console.log('ok  driver-command parser')
}

// ----------------------------------------------------- the demangler
{
  assert.equal(demangleSimple('solve'), 'solve')
  assert.equal(demangleSimple('_Z3dfsii'), 'dfs')
  assert.equal(demangleSimple('_ZN8Solution5solveERNSt3__16vectorINS0_12basic_stringIcNS0_11char_traitsIcEENS0_9allocatorIcEEEENS6_IS8_EEEEi'), 'Solution::solve')
  console.log('ok  demangler')
}

// ----------------------------------------------------- flags sanity
{
  assert.ok(C_FLAGS.includes('-std=gnu17') && C_FLAGS.includes('-O2'))
  assert.ok(CXX_FLAGS.includes('-fno-exceptions'), 'C++ has no exceptions here')
  assert.ok(CXX_FLAGS.some((f) => /_LIBCPP_HARDENING_MODE/.test(f)), 'libc++ hardening is on')
  console.log('ok  compile flags')
}

// ----------------------------------------------------- the real toolchain (optional)
const BUNDLE = process.env.INK_CLANG_BUNDLE
if (!BUNDLE) {
  console.log('\nPASS ink maze c runtime (pure helpers). Set INK_CLANG_BUNDLE to a local @yowasp/clang bundle.js to also run every program.')
} else {
  class LimitError extends Error {
    constructor(limit, message) { super(message || limit); this.name = 'LimitError'; this.limit = limit }
  }
  const host = {
    runtime: 'clang', protocol: 1, base: 'file:',
    progress: () => {}, assetText: async (p) => read(p), lockdown: () => {}, now: () => performance.now(), log: () => {}, LimitError,
  }
  const runtime = makeClangRuntime({ importBundle: (url) => import(BUNDLE) })
  const t0 = performance.now()
  const info = await runtime.load(host)
  console.log(`\nloaded the real toolchain in ${(performance.now() - t0).toFixed(0)} ms (${info.clang})`)

  const nodeIO = (job) => {
    const start = performance.now()
    let runDeadline = Infinity
    let started = false
    let limit = null
    let chars = 0
    const streams = { stdout: '', stderr: '' }
    const deadline = () => (started ? runDeadline : start + job.compileLimitMs)
    const write = (s, t) => { if (limit) throw new LimitError(limit); if (chars + t.length > job.outputLimit) { limit = 'output_limit'; throw new LimitError(limit) } chars += t.length; streams[s] += t }
    return {
      job, LimitError, streams,
      stdout: (t) => write('stdout', String(t)), stderr: (t) => write('stderr', String(t)),
      started() { if (!started) { started = true; runDeadline = performance.now() + job.timeLimitMs } },
      check() { if (limit) throw new LimitError(limit); if (performance.now() > deadline()) { limit = 'time_limit'; throw new LimitError(limit) } },
      now: () => performance.now(), timeLeft: () => deadline() - performance.now(), hit(l) { limit ??= l },
      get deadline() { return deadline() }, get deadlineEpochMs() { return performance.timeOrigin + deadline() }, get limit() { return limit },
    }
  }
  const run = async (language, source, tests, extra = {}) => {
    const job = {
      runId: `n${Math.random()}`, language, kind: 'run', source, stdin: formatStdin(tests), tests: tests.length,
      timeLimitMs: 4000, compileLimitMs: LIMITS.compileMs, memoryLimitBytes: LIMITS.memoryBytes, outputLimit: LIMITS.outputChars,
      answerChars: LIMITS.answerChars, recursionDepth: LIMITS.recursionDepth, ...extra,
    }
    const io = nodeIO(job)
    let outcome
    try { outcome = await runtime.run(job, io) } catch (e) { outcome = { status: e?.limit ?? 'crashed', message: String(e?.message ?? e) } }
    return { outcome, parsed: parseStdout(io.streams.stdout, tests.length), io }
  }

  // reference and naive, both languages, on a full submission
  const visible = randomBoard(7)
  const SUB = submissionTests(visible)
  const sol = (f) => readFileSync(`${REPO}scripts/inkmaze-code/solutions/${f}`, 'utf8')
  for (const [lang, file] of [['c', 'c-reference.c'], ['c', 'c-naive.c'], ['cpp', 'cpp-reference.cpp'], ['cpp', 'cpp-naive.cpp']]) {
    const r = await run(lang, sol(file), SUB, { kind: 'submit', timeLimitMs: 8000 })
    assert.equal(r.outcome.status, 'ok', `${file}: ${r.outcome.message}`)
    assert.ok(judgeAll(SUB, r.parsed.answers).accepted, `${file} is accepted on all ${SUB.length} boards`)
  }
  for (const lang of ['c', 'cpp']) {
    const r = await run(lang, STARTER_CODE[lang], [visible])
    assert.equal(r.outcome.status, 'ok', `${lang} starter compiles and runs`)
    assert.deepEqual(r.parsed.answers, [''], `${lang} starter returns no moves (the 'empty' verdict)`)
  }
  console.log(`ok  reference and naive solutions accepted on ${SUB.length} boards (C and C++); starters return empty`)

  // every case
  const ONE = [visible]
  const TWO = [visible, randomBoard(9)]
  let pass = 0
  for (const c of CASES) {
    const tests = c.tests === 'two' ? TWO : c.tests === 'submit' ? SUB : ONE
    const extra = {}
    if (c.timeLimitMs) extra.timeLimitMs = c.timeLimitMs
    if (c.compileLimitMs) extra.compileLimitMs = c.compileLimitMs
    if (c.tests === 'submit') { extra.kind = 'submit'; extra.timeLimitMs ??= 8000 }
    const r = await run(c.lang, c.source, tests, extra)
    let status = r.outcome.status
    if (status === 'ok' && (r.parsed.found > tests.length || r.parsed.answered < tests.length)) status = 'crashed'
    const want = Array.isArray(c.expect.status) ? c.expect.status : [c.expect.status]
    const ok = want.includes(status) || (c.maybeCompileError && status === 'compile_error')
    assert.ok(ok, `${c.name}: status ${status} (want ${want.join('/')}); message ${JSON.stringify(r.outcome.message)}`)
    if (c.expect.line !== undefined && !c.maybeCompileError) {
      const line = r.outcome.error?.line ?? (r.outcome.diagnostics ?? [])[0]?.line ?? null
      assert.equal(line, c.expect.line, `${c.name}: line ${line} (want ${c.expect.line})`)
    }
    if (c.expect.test !== undefined && !c.maybeCompileError) assert.equal(r.outcome.error?.test ?? null, c.expect.test, `${c.name}: board index`)
    if (c.expect.type && r.outcome.error) assert.match(r.outcome.error.type, c.expect.type, `${c.name}: error type`)
    pass++
  }
  console.log(`ok  all ${pass} C/C++ cases (compile errors with lines, runtime errors with the board, runaways, tampering, prints)`)
  console.log('\nPASS ink maze c runtime (pure helpers + the real toolchain)')
}
