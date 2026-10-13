/*
 * Ink Maze level 26: the Python runtime (Pyodide 314.0.7, CPython 3.14 on
 * WebAssembly). Default-exports a Runtime (see src/minigames/inkmaze/code/
 * contract.ts). The sandbox host imports this file with import() from a blob:
 * URL inside a classic worker, hands it a RuntimeHost at load(host), and a
 * RunIO at run(job, io).
 *
 * Pyodide's own files (pyodide.mjs, pyodide.asm.wasm, python_stdlib.zip, ...)
 * load from the pinned CDN
 *   https://cdn.jsdelivr.net/pyodide/v314.0.7/full/
 * which sandbox.html's CSP allows; nothing self-hosted here except the two
 * small Python files (harness.py, driver.py) fetched through host.asset. The
 * toolchain loads only when this runtime is loaded, i.e. only when the player
 * picks Python.
 *
 * Safety (contract D1-D9). The worker is a WebAssembly thread, and in WebKit
 * worker.terminate() does NOT stop a running WebAssembly loop, so the Python
 * program must stop itself at the deadline. driver.py does this two ways, both
 * sticky: an AST rewrite that calls __ink_tick__() at every loop body and
 * function entry (which polls the deadline through _JS_POLL and raises an
 * uncatchable _InkStop), and Pyodide's interrupt buffer, read here as a getter
 * that returns SIGINT once the deadline passed so even a C-level loop in the
 * eval loop is interrupted. A wasm heap cap turns allocation bombs into
 * MemoryError; io.stdout caps the output. terminate() stays only the backstop.
 */

const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/'
const RECURSION_LIMIT = 300 // WebKit kills the interpreter unwinding past ~450 Python frames

let pyodide = null
let runPy = null // the driver's _ink_run(source, stdin) -> JSON string
let hostRef = null
let currentIO = null // the RunIO of the run in flight (read by the interrupt getter and stdout)
let memCapBytes = 256 * 1024 * 1024 // wasm heap ceiling for the run in flight
let outputLimitHit = false // io.stdout refused more output this run

const decoder = new TextDecoder()
let outDecoder = new TextDecoder()
let errDecoder = new TextDecoder()

/** Route Pyodide's stdout/stderr bytes to the current run's io; swallow the
 *  output-limit throw so Pyodide is not corrupted mid-write (the driver's tick
 *  and the post-run check turn it into an output_limit outcome). */
function makeWriter(stream) {
  return (bytes) => {
    const n = bytes.length
    if (!currentIO) return n
    try {
      const dec = stream === 'stderr' ? errDecoder : outDecoder
      const text = dec.decode(bytes, { stream: true })
      if (text) (stream === 'stderr' ? currentIO.stderr : currentIO.stdout)(text)
    } catch (e) {
      if (e && (e.name === 'LimitError' || e.limit)) outputLimitHit = true
      else throw e
    }
    return n
  }
}

const RUNTIME = {
  id: 'python',
  version: 'Python 3.14 (Pyodide 314.0.7)',

  async load(host) {
    hostRef = host
    host.progress('Downloading Python (Pyodide)', 0, 0)

    // Pyodide refuses to load in a "classic web worker": it probes
    // globalThis.importScripts("data:..."), which would also trip the CSP. We
    // need neither importScripts nor nested workers, so shadow them with
    // undefined (they live on the worker prototype, so a plain delete leaves
    // them reachable; an own `undefined` makes the probe fail cleanly).
    for (const name of ['importScripts', 'Worker', 'SharedWorker']) {
      try { Object.defineProperty(self, name, { value: undefined, writable: true, configurable: true }) } catch { try { self[name] = undefined } catch { /* ignore */ } }
    }

    const [{ loadPyodide }, harnessSource, driverSource] = await Promise.all([
      import(PYODIDE_CDN + 'pyodide.mjs'),
      host.assetText('python/harness.py'),
      host.assetText('python/driver.py'),
    ])
    host.progress('Starting Python', 0, 0)
    pyodide = await loadPyodide({ indexURL: PYODIDE_CDN, fullStdLib: false })

    // Cap the wasm heap: Emscripten grows memory by calling memory.grow() from
    // JS, so refusing past the cap makes malloc fail and CPython raise MemoryError.
    const realGrow = WebAssembly.Memory.prototype.grow
    WebAssembly.Memory.prototype.grow = function grow(pages) {
      if (this.buffer.byteLength + pages * 65536 > memCapBytes) throw new RangeError('ink maze memory cap')
      return realGrow.call(this, pages)
    }

    pyodide.setStdout({ write: makeWriter('stdout'), isatty: false })
    pyodide.setStderr({ write: makeWriter('stderr'), isatty: false })
    pyodide.setStdin({ stdin: () => null })

    // The cooperative deadline is driver.py's AST rewrite (every loop body and
    // function entry calls __ink_tick__, which polls _JS_POLL and raises a
    // sticky, uncatchable _InkStop once the deadline or an output/memory limit
    // passed). It stops the program by unwinding back to JS, so the WebAssembly
    // eval loop exits and the worker thread goes idle without terminate() --
    // the WebKit-safe stop of contract D1-D9. (Pyodide's interrupt buffer is
    // NOT used: without SharedArrayBuffer it re-fires during cleanup and
    // escapes as a KeyboardInterrupt fatal that loses sys.stderr.)

    // install the driver (compiles the harness once; builds the baseline fingerprint)
    const ns = pyodide.globals.get('dict')()
    ns.set('HARNESS_SOURCE', harnessSource)
    ns.set('RECURSION_LIMIT', RECURSION_LIMIT)
    ns.set('ANSWER_CHARS', 10000)
    ns.set('_JS_STARTED', () => { if (currentIO) currentIO.started() })
    ns.set('_JS_POLL', () => (outputLimitHit || (currentIO && currentIO.timeLeft() <= 0) ? 1 : 0))
    ns.set('_JS_LIMITKIND', () => (outputLimitHit ? 'output_limit' : currentIO && currentIO.timeLeft() <= 0 ? 'time_limit' : ''))
    pyodide.runPython(driverSource, { globals: ns, filename: 'driver.py' })
    runPy = ns.get('_ink_run')
    ns.destroy()

    // the network is no longer needed: drop fetch/XHR/WebSocket/... and messaging
    host.lockdown()

    return { engine: 'pyodide', version: pyodide.version, python: pyodide.runPython('import sys; sys.version.split()[0]') }
  },

  async run(job, io) {
    currentIO = io
    outputLimitHit = false
    outDecoder = new TextDecoder()
    errDecoder = new TextDecoder()
    memCapBytes = job.memoryLimitBytes
    let res
    try {
      res = JSON.parse(runPy(job.source, job.stdin))
    } catch (e) {
      // a JS-level failure that escaped Python: os._exit, a fatal wasm stack
      // overflow, a corrupted interpreter. Pyodide is unusable; recycle.
      currentIO = null
      return describeFatal(e, io)
    }
    currentIO = null

    const footprint = heapBytes()
    const healthy = res.healthy !== false && footprint < 384 * 1024 * 1024

    if (res.limit) {
      // the program stopped itself (or we stopped it) at a limit. Record it on
      // io so the prelude locks the outcome, then return the limit outcome.
      const message = res.limit === 'time_limit' ? `Your code ran longer than ${seconds(job.timeLimitMs)}.`
        : res.limit === 'memory_limit' ? `Your code used more than ${job.memoryLimitBytes >> 20} MiB of memory.`
          : `Your code printed more than ${job.outputLimit.toLocaleString('en-US')} characters.`
      io.hit(res.limit, message)
      return { status: res.limit, message, error: res.error || null, healthy: res.limit !== 'memory_limit' && healthy }
    }
    if (res.phase === 'compile') {
      return { status: 'compile_error', diagnostics: [diagnostic(res.error)], healthy: true }
    }
    if (res.error) {
      return { status: 'runtime_error', error: errorInfo(res.error), healthy }
    }
    return { status: 'ok', healthy }
  },

  footprint() { return { memoryBytes: heapBytes() } },
}

function heapBytes() {
  try { return pyodide._module.HEAPU8.length } catch { return 0 }
}

function seconds(ms) { return `${Math.round(ms / 100) / 10} s` }

function diagnostic(error) {
  return {
    line: error && error.line != null ? error.line : null,
    column: error && error.col != null ? error.col : null,
    endLine: error && error.endLine != null ? error.endLine : null,
    endColumn: error && error.endCol != null ? error.endCol : null,
    severity: 'error',
    message: (error && error.message) || 'your code did not compile',
  }
}

function errorInfo(error) {
  return {
    type: (error && error.type) || 'Error',
    message: (error && error.message) || '',
    line: error && error.line != null ? error.line : null,
    column: null,
    test: error && typeof error.test === 'number' ? error.test : null,
    trace: error && typeof error.traceback === 'string' ? error.traceback.slice(0, 8000) : undefined,
  }
}

function describeFatal(e, io) {
  const message = String((e && e.message) || e).slice(0, 2000)
  if (/call stack|too much recursion|stack overflow|maximum call stack/i.test(message)) {
    return {
      status: 'runtime_error',
      error: { type: 'StackOverflow', message: 'the program went deeper than the browser stack allows (for example repr() of a very deeply nested value)', line: null, column: null, test: null },
      healthy: false,
    }
  }
  const exit = /exit\((-?\d+)\)/.exec(message)
  if (exit) {
    return { status: 'runtime_error', message: `Your code called exit(${exit[1]}).`, error: { type: 'SystemExit', message: `the program called exit(${exit[1]})`, line: null, column: null, test: null }, healthy: false }
  }
  return { status: 'crashed', message: `The Python runtime failed: ${message}`, healthy: false }
}

export default RUNTIME
