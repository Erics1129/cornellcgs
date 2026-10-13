/*
 * Ink Maze level 26: the JavaScript runtime. The player's JavaScript runs
 * inside QuickJS compiled to WebAssembly (quickjs-emscripten), never as the
 * worker's own JavaScript, so it cannot see the worker's globals, gets a hard
 * memory cap (QuickJS's own allocator) and a cooperative time limit (QuickJS's
 * interrupt handler, which makes even a tight loop return to JS so the worker
 * thread goes idle without terminate() -- the WebKit-safe stop of contract
 * D1-D9). A fresh QuickJS runtime and context per run means nothing a program
 * does can reach the next run.
 *
 * Default-exports a Runtime (src/minigames/inkmaze/code/contract.ts). This file
 * is the esbuild entry; scripts/inkmaze-code/build/build-javascript.mjs bundles
 * it (with quickjs-emscripten-core and the harness) into
 * public/minigames/ink-maze-code/javascript/runtime.js and copies the QuickJS
 * wasm to .../javascript/quickjs.wasm (loaded through host.asset).
 */
import { newQuickJSWASMModuleFromVariant, newVariant } from 'quickjs-emscripten-core'
import releaseSync from '@jitl/quickjs-wasmfile-release-sync'
import harnessSource from './js-harness.js?text'

const FILE = 'solution.js'
const STACK_BYTES = 64 * 1024 // past ~64 KB the browser's native stack can overflow first in WebKit
// the harness as a plain expression that yields inkHarness, with no global binding (so a player `let inkHarness` cannot clash)
const HARNESS = '(function(){' + harnessSource.replace(/^export\s+/m, '') + '\nreturn inkHarness;})()'
// console inside QuickJS: stringify args in-VM and strip NUL (QuickJS's host
// string boundary stops at NUL), then hand one string to the host.
const PREAMBLE = `(function(){
  // capture the host output functions into this closure, then revoke the
  // globals so player code cannot call __inkLog/__inkErr directly (forging an
  // answer marker is already caught as 'crashed', but they need not stay
  // reachable). console routes through the captured copies.
  var L = __inkLog, E = __inkErr;
  try { delete globalThis.__inkLog; delete globalThis.__inkErr; } catch (e) {}
  try { globalThis.__inkLog = undefined; globalThis.__inkErr = undefined; } catch (e) {}
  function s(v){ try { return typeof v === 'string' ? v : (v === undefined ? 'undefined' : JSON.stringify(v)) ?? String(v) } catch (e) { return String(v) } }
  function emit(args, err){ var t = Array.prototype.map.call(args, s).join(' ') + '\\n'; (err ? E : L)(t.replace(/\\u0000/g, '\\u2400')) }
  globalThis.console = { log:function(){emit(arguments,false)}, info:function(){emit(arguments,false)}, debug:function(){emit(arguments,false)}, warn:function(){emit(arguments,true)}, error:function(){emit(arguments,true)} };
})()`

let QuickJS = null
let hostRef = null

const RUNTIME = {
  id: 'javascript',
  version: 'ES2023 (QuickJS)',

  async load(host) {
    hostRef = host
    host.progress('Starting the JavaScript engine (QuickJS)', 1, 2)
    // wasmBinary supplies the bytes (fetched through the page, under the CSP);
    // locateFile keeps Emscripten from doing new URL('...', import.meta.url),
    // which throws here because this module was imported from a blob: URL.
    const variant = newVariant(releaseSync, {
      wasmBinary: () => host.asset('javascript/quickjs.wasm'),
      locateFile: (file) => file,
    })
    QuickJS = await newQuickJSWASMModuleFromVariant(variant)
    host.progress('Starting the JavaScript engine (QuickJS)', 2, 2)
    host.lockdown() // nothing more from the network; the player is inside QuickJS regardless
    return { engine: 'quickjs', version: 'quickjs-emscripten 0.32.0' }
  },

  async run(job, io) {
    const rt = QuickJS.newRuntime()
    rt.setMemoryLimit(job.memoryLimitBytes)
    rt.setMaxStackSize(STACK_BYTES)
    let outputHit = false
    let interrupted = false
    rt.setInterruptHandler(() => {
      if (outputHit) return true
      if (io.timeLeft() <= 0) { interrupted = true; return true }
      return false
    })
    const ctx = rt.newContext()
    const enc = new TextEncoder()

    const outWrite = (text) => { try { io.stdout(text) } catch (e) { if (isLimit(e)) outputHit = true; else throw e } }
    const errWrite = (text) => { try { io.stderr(text) } catch (e) { if (isLimit(e)) outputHit = true; else throw e } }
    let currentTest = null

    const done = (res) => {
      try { ctx.dispose() } catch { /* ignore */ }
      try { rt.dispose() } catch { /* ignore */ }
      return res
    }

    try {
      // host functions reachable from inside QuickJS
      const log = ctx.newFunction('__inkLog', (h) => outWrite(ctx.getString(h)))
      const errFn = ctx.newFunction('__inkErr', (h) => errWrite(ctx.getString(h)))
      const write = ctx.newFunction('__inkWrite', (h) => outWrite(ctx.getString(h)))
      const progress = ctx.newFunction('__inkProgress', (h) => { currentTest = Number(ctx.getNumber(h)) })
      ctx.setProp(ctx.global, '__inkLog', log)
      ctx.setProp(ctx.global, '__inkErr', errFn)
      for (const h of [log, errFn]) h.dispose()

      // ---- compile only (no run): syntax errors carry the player's line/col, before any output
      const compiled = ctx.evalCode(job.source, FILE, { type: 'global', compileOnly: true })
      if (compiled.error) {
        const e = ctx.dump(compiled.error); compiled.error.dispose()
        write.dispose(); progress.dispose()
        const where = locate(e && e.stack)
        return done({ status: 'compile_error', diagnostics: [{ line: where.line, column: where.col, severity: 'error', message: String((e && e.message) || e) }], healthy: true })
      }
      compiled.value.dispose()

      // ---- run
      io.started()
      ctx.unwrapResult(ctx.evalCode(PREAMBLE, '<preamble>', { type: 'global' })).dispose()
      // H1: the harness parses every board BEFORE the player's code exists, with
      // built-ins it captured itself, and hands back run(solve, write, progress)
      const harness = ctx.unwrapResult(ctx.evalCode(HARNESS, '<harness>', { type: 'global' }))
      const stdinHandle = ctx.newString(job.stdin)
      const runner = ctx.unwrapResult(ctx.callFunction(harness, ctx.undefined, stdinHandle))
      stdinHandle.dispose(); harness.dispose()
      const player = ctx.evalCode(job.source + '\n;(typeof solve === "function" ? solve : undefined)', FILE, { type: 'global' })

      let errorDump = null
      if (player.error) { errorDump = ctx.dump(player.error); player.error.dispose() }
      else if (ctx.typeof(player.value) !== 'function') { player.value.dispose(); errorDump = { name: 'TypeError', message: 'solution.js must define a function solve(grid, ink)', stack: '' } }
      else {
        const call = ctx.callFunction(runner, ctx.undefined, player.value, write, progress)
        player.value.dispose()
        if (call.error) { errorDump = ctx.dump(call.error); call.error.dispose() } else call.value.dispose()
      }
      runner.dispose()
      write.dispose(); progress.dispose()

      if (outputHit) {
        const message = `Your code printed more than ${job.outputLimit.toLocaleString('en-US')} characters.`
        io.hit('output_limit', message)
        return done({ status: 'output_limit', message, healthy: true })
      }
      if (interrupted || (errorDump && /interrupted/i.test(String(errorDump.message)))) {
        const message = `Your code ran longer than ${seconds(job.timeLimitMs)}.`
        io.hit('time_limit', message)
        return done({ status: 'time_limit', message, healthy: true })
      }
      if (errorDump) {
        const info = describe(errorDump, currentTest)
        if (info.type === 'MemoryError' || /out of memory|memory/i.test(info.message)) {
          const message = `Your code used more than ${job.memoryLimitBytes >> 20} MiB of memory.`
          io.hit('memory_limit', message)
          // a fresh QuickJS runtime is built per run and disposed here, so the
          // worker stays healthy: no rebuild needed after a memory bomb
          return done({ status: 'memory_limit', message, healthy: true })
        }
        return done({ status: 'runtime_error', error: info, healthy: true })
      }
      return done({ status: 'ok', healthy: true })
    } catch (e) {
      // a failure of QuickJS itself (e.g. a wasm trap): this runtime instance is done
      if (isLimit(e)) {
        io.hit(e.limit)
        return done({ status: e.limit, healthy: true })
      }
      return done({ status: 'crashed', message: `The JavaScript runtime failed: ${String((e && e.message) || e).slice(0, 500)}`, healthy: false })
    }
  },
}

function isLimit(e) { return !!e && (e.name === 'LimitError' || typeof e.limit === 'string') }
function seconds(ms) { return `${Math.round(ms / 100) / 10} s` }

function locate(stack) {
  const m = /solution\.js:(\d+)(?::(\d+))?/.exec(String(stack || ''))
  return m ? { line: Number(m[1]), col: m[2] ? Number(m[2]) : null } : { line: null, col: null }
}

function describe(dump, test) {
  const stack = String((dump && dump.stack) || '')
  const frames = stack.split('\n').filter((l) => /solution\.js:\d+/.test(l)).slice(0, 20)
  const where = locate(frames[0] || stack)
  let type = (dump && dump.name) || 'Error'
  const message = String((dump && dump.message) != null ? dump.message : dump).slice(0, 2000)
  if (/stack overflow|maximum call stack/i.test(message)) type = 'RangeError'
  if (/out of memory/i.test(message)) type = 'MemoryError'
  return {
    type,
    message,
    line: where.line,
    column: where.col,
    test: typeof test === 'number' ? test : null,
    trace: frames.length ? `${type}: ${message}\n` + frames.map((f) => '    ' + f.trim()).join('\n') : undefined,
  }
}

export default RUNTIME
