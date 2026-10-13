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
 * program must stop itself at the deadline. driver.py does this three ways:
 *   1. an AST rewrite that calls __ink_tick__() at every loop body, function
 *      entry and comprehension iterable (polls the deadline through _JS_POLL and
 *      raises a sticky, uncatchable _InkStop);
 *   2. Pyodide's interrupt buffer, installed here as a ONE-SHOT getter that
 *      returns SIGINT (2) once past the deadline and then disarms; CPython's
 *      eval loop raises one KeyboardInterrupt at the next bytecode boundary, so
 *      a key= / reduce lambda or callable-iterator that the AST never saw is
 *      kicked back out to an instrumented frame. Stickiness against a swallow
 *      does NOT rely on the buffer (that is layer 1's unshadowable tick), and
 *      one shot keeps the buffer from re-firing into the tick's _InkStop or the
 *      driver's cleanup, which would abort the interpreter;
 *   3. for the C-only library loops that run with no bytecode per step
 *      (sum(range(1e18)), iter(f, s), reduce over itertools.count, deque(count),
 *      math.factorial, re backtracking), driver.py bounds the source: it wraps
 *      the C consumers and the infinite sources to tick, caps the heavy math,
 *      and refuses the re module.
 * A wasm heap cap turns allocation bombs into MemoryError; io.stdout caps the
 * output. terminate() stays only the backstop (contract D5: a bug if needed).
 */

const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/'
const RECURSION_LIMIT = 300 // WebKit kills the interpreter unwinding past ~450 Python frames

let pyodide = null
let runPy = null // the driver's _ink_run(source, stdin) -> JSON string
let hostRef = null
let currentIO = null // the RunIO of the run in flight (read by the interrupt getter and stdout)
let memCapBytes = 256 * 1024 * 1024 // wasm heap ceiling for the run in flight
let outputLimitHit = false // io.stdout refused more output this run
let interruptArmed = false // the interrupt buffer fires SIGINT only while this is true

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

    // The cooperative deadline has three layers (see the file header and
    // driver.py). The one installed HERE is layer 2: Pyodide's interrupt
    // buffer. We give Pyodide a plain (non-shared) object whose [0] getter
    // returns 2 (SIGINT) on every read while the run's deadline has passed AND
    // interruptArmed is true. CPython's Emscripten signal check reads it from
    // the eval loop, so any player code that executes bytecode per step -- a
    // key/reduce lambda, a callable-iterator -- raises KeyboardInterrupt at the
    // deadline even though the AST tick never saw it. No SharedArrayBuffer is
    // needed (this build has none on GitHub Pages); the getter is read
    // synchronously on the same thread.
    //
    // The buffer is ONE-SHOT: the first read past the deadline returns SIGINT
    // and immediately disarms, so CPython raises exactly one KeyboardInterrupt
    // and the buffer cannot keep re-firing WHILE the deadline machinery or the
    // driver's cleanup is unwinding -- a continuous re-fire collides with the
    // AST tick's own _InkStop mid-propagation and aborts the interpreter (a
    // Pyodide fatal). One shot is enough because the terminal, STICKY stop comes
    // from layer 1: driver.py's AST tick is now resolved through closure cells
    // the player cannot rebind (globals()['__ink_tick__']=... is a compile
    // error AND would not be read anyway), so a loop that swallows the single
    // KeyboardInterrupt still meets _InkStop at the top of its next body and
    // cannot run free. The buffer only has to kick a C-driven bytecode loop
    // (key/reduce lambda, callable-iterator) back out to an instrumented frame.
    const interruptBuffer = {
      get 0() {
        if (interruptArmed && currentIO && currentIO.timeLeft() <= 0) {
          interruptArmed = false
          return 2
        }
        return 0
      },
      set 0(_v) { /* Pyodide may clear it after handling; the getter owns the state */ },
    }
    pyodide.setInterruptBuffer(interruptBuffer)

    // install the driver (compiles the harness once; builds the baseline fingerprint)
    const ns = pyodide.globals.get('dict')()
    ns.set('HARNESS_SOURCE', harnessSource)
    ns.set('RECURSION_LIMIT', RECURSION_LIMIT)
    ns.set('ANSWER_CHARS', 10000)
    ns.set('_JS_STARTED', () => { if (currentIO) currentIO.started() })
    ns.set('_JS_POLL', () => (outputLimitHit || (currentIO && currentIO.timeLeft() <= 0) ? 1 : 0))
    ns.set('_JS_LIMITKIND', () => (outputLimitHit ? 'output_limit' : currentIO && currentIO.timeLeft() <= 0 ? 'time_limit' : ''))
    ns.set('_JS_DISARM', () => { interruptArmed = false })
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
    interruptArmed = true // the driver disarms it the moment it catches the stop
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
      interruptArmed = false
      return describeFatal(e, io)
    }
    currentIO = null
    interruptArmed = false

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
