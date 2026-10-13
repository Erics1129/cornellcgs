/*
 * Ink Maze level 26: the Java runtime (the default language).
 *
 * Toolchain: TeaVM-javac, OpenJDK's javac and the TeaVM ahead-of-time compiler,
 * both compiled to WebAssembly GC, rebuilt for this site with a guard
 * (scripts/inkmaze-code/build/java/, PROVENANCE.txt next to this file):
 *   Solution.java --javac--> class files --TeaVM + GuardTransformer--> app.wasm
 * The precompiled hidden harness (InkMazeHarness.class, never seen by javac)
 * is linked in as the entry point. Everything runs in this worker; the program
 * gets a fresh WebAssembly instance per run.
 *
 * The cooperative deadline (contract.ts D1-D9), Java edition
 *  - GuardTransformer puts Guard.tick() at every loop header, at the entry of
 *    every method that calls anything and every 256 instructions of straight
 *    code, in the player's classes AND in the class library they drive; every
 *    16,384 ticks Guard calls the import inkGuard.check(), which calls
 *    io.check(). Past the deadline io.check() throws a JavaScript exception.
 *    TeaVM's catch blocks catch only the Java exception tag, so no Java code
 *    (catch Throwable, finally, a loop in either) can swallow it: the program
 *    unwinds out of main() and stops by itself, in WebKit too (D2, D3).
 *  - javac and TeaVM themselves carry the same ticks (the compiler was built
 *    with GuardTransformer in COMPILER mode), so a compile that never ends
 *    stops at the compile deadline (D7) and a compile that eats memory (javac
 *    duplicates nested finally blocks: 4 GB in 11 s) stops at its budget.
 *  - The heap is the engine's (WasmGC), so allocations are metered (D6): every
 *    new / new[] / clone / reflect.Array.newInstance first calls Guard, which
 *    asks inkGuard.memory() once the total passes a mark. One allocation over
 *    job.memoryLimitBytes (256 MiB), or ALLOC_FACTOR times that in total
 *    (512 MiB), is memory_limit. The meter counts what is allocated, not what
 *    is alive (a browser cannot tell), so the total is generous: the reference,
 *    the naive search and a copy-everything BFS allocate 0.4, 0.1 and 59 MiB on
 *    a full submission. After memory_limit the worker is replaced, which gives
 *    the garbage back at once (WebKit otherwise kept 1.8 GB after repeated bombs).
 *  - Output goes through io.stdout / io.stderr, which throw at the output limit
 *    (also uncatchable by Java).
 *  - System.exit / Runtime.exit / Runtime.halt become Guard.exit: an error
 *    ("solve() must return; it called exit(3)").
 *  - Array indexes in the player's classes are checked by Guard.index (a real,
 *    catchable ArrayIndexOutOfBoundsException, as on a JVM), and integer
 *    division by Guard.idiv & co. (ArithmeticException, MIN_VALUE / -1).
 *    TeaVM's non-strict mode turns a null dereference into a wasm trap: that
 *    one cannot be caught here and is reported as NullPointerException.
 *
 * Containment: the player's classes must be in the unnamed package and must not
 * mention org.teavm (TeaVM's JavaScript interop, its @Import, the Guard): the
 * class files are scanned after javac. The program's imports are checked
 * against a list, the instance has no auto-imports, host.lockdown() runs at
 * the end of load(), timers a program schedules (Thread.sleep) are cleared
 * when its run ends, and every import of a finished run throws.
 */

const VERSION = 'Java 25 (javac + TeaVM 0.13.1, WebAssembly)'
const ASSETS = {
  // gzip -9 of compiler.wasm (4.5 MB -> 1.7 MB), named .bin so no server labels it Content-Encoding: gzip
  compiler: 'java/compiler.gz.bin',
  teavm: 'java/teavm-runtime.js',
  deobfuscator: 'java/deobfuscator.wasm',
  sdk: 'java/compile-classlib.bin',
  classlib: 'java/runtime-classlib.bin',
  harness: 'java/InkMazeHarness.class',
}
/** about the bytes load() fetches (for the progress bar; the real sizes are in PROVENANCE.txt) */
const DOWNLOAD_BYTES = 4_400_000
const MARKER = '@@ANSWER@@'
const MIB = 1024 * 1024
/**
 * The total a program may allocate, as a multiple of job.memoryLimitBytes (one allocation: 1x). The meter
 * counts garbage too, so this is generous (the worst realistic solution measured, a BFS that copies every
 * state, allocates 59 MiB on a full submission), yet keeps what a bomb can hold to about this much.
 */
const ALLOC_FACTOR = 2
/** what one compile may allocate (javac, then TeaVM); a normal compile: javac 3-7 MiB, TeaVM 500-550 MiB */
const JAVAC_BUDGET = 384 * MIB
const TEAVM_BUDGET = 2048 * MIB
const PLAYER_FILE = 'Solution.java'
const HARNESS = 'InkMazeHarness'
const SOLVE_DESC = '([Ljava/lang/String;I)Ljava/lang/String;'
/** import modules a program may have (anything else: refused before it runs) */
const PROGRAM_IMPORTS = new Set(['teavm', 'teavmJso', 'teavmDate', 'teavmConsole', 'teavmMath', 'teavmAsync', 'inkGuard', 'inkHarness', 'wasm:js-string'])

let host = null
let teavmLoad = null
let compiler = null
let harnessBytes = null
let deobfuscatorModule = null
let deobfuscatorBytes = null
let diagnostics = []
let cache = null // { source, bytes, diagnostics }: Run then Submit with the same code compiles once
let current = null // the run in flight
let lastAllocated = 0

class ExitCalled extends Error {
  constructor(status) { super(`exit(${status})`); this.name = 'ExitCalled'; this.status = status }
}
class StaleRun extends Error {
  constructor() { super('this run is over'); this.name = 'StaleRun' }
}

// ------------------------------------------------------------ the compiler's guard

/** The compiler's own inkGuard imports: the compile deadline and the compile memory budget. */
const compileGuard = { io: null, base: 0, budget: Infinity, last: 0, phase: '' }
const compilerImports = {
  check(allocated) {
    compileGuard.last = allocated
    if (compileGuard.io) compileGuard.io.check()
    return compileGuard.base + compileGuard.budget
  },
  limit() { return 1024 * MIB },
  memory(bytes, total) {
    compileGuard.last = total
    const io = compileGuard.io
    if (io && (total - compileGuard.base > compileGuard.budget || bytes > 1024 * MIB)) {
      io.hit('memory_limit', `Compiling your code used too much memory (the ${compileGuard.phase} step allocated more than ${Math.round(compileGuard.budget / MIB)} MiB).`)
      io.check()
    }
    return compileGuard.base + compileGuard.budget
  },
  exit() { throw new Error('the compiler called exit()') },
}

function startCompilePhase(io, phase, budget) {
  compileGuard.io = io
  compileGuard.phase = phase
  compileGuard.base = compileGuard.last
  compileGuard.budget = budget
}
function endCompile() {
  compileGuard.io = null
  compileGuard.budget = Infinity
}

// ------------------------------------------------------------ loading

async function inflate(buffer) {
  const head = new Uint8Array(buffer, 0, 4)
  if (head[0] === 0 && head[1] === 0x61 && head[2] === 0x73 && head[3] === 0x6d) return buffer // a server already inflated it
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).arrayBuffer()
}

function supportMessage(error) {
  return 'This browser cannot run the Java compiler: it needs WebAssembly GC and exception handling ' +
    `(Chrome 119+, Edge 119+, Safari 18.2+, Firefox 120+). (${String(error && error.message || error).slice(0, 160)})`
}

const RUNTIME = {
  id: 'java',
  version: VERSION,

  async load(h) {
    host = h
    if (typeof DecompressionStream !== 'function') throw new Error(supportMessage('no DecompressionStream'))
    const t0 = host.now()
    let done = 0
    const step = (label, bytes) => { done += bytes; host.progress(label, Math.min(done, DOWNLOAD_BYTES), DOWNLOAD_BYTES) }
    host.progress('Downloading the Java compiler', 0, DOWNLOAD_BYTES)
    const [teavmModule, compilerGz, sdk, classlib, harness, deob] = await Promise.all([
      host.importModule(ASSETS.teavm),
      host.asset(ASSETS.compiler).then((b) => { step('Downloading the Java compiler', b.byteLength); return b }),
      host.asset(ASSETS.sdk).then((b) => { step('Downloading the Java class library', b.byteLength); return b }),
      host.asset(ASSETS.classlib).then((b) => { step('Downloading the Java class library', b.byteLength); return b }),
      host.asset(ASSETS.harness),
      host.asset(ASSETS.deobfuscator),
    ])
    teavmLoad = teavmModule.load
    if (typeof teavmLoad !== 'function') throw new Error('the TeaVM runtime has no load()')
    host.progress('Starting the Java compiler', DOWNLOAD_BYTES, DOWNLOAD_BYTES)
    const compilerBytes = await inflate(compilerGz)
    let teavm
    try {
      teavm = await teavmLoad(new Uint8Array(compilerBytes), {
        stackDeobfuscator: { enabled: false },
        noAutoImports: true,
        installImports(o) {
          o.inkGuard = compilerImports
          // the compiler prints nothing we want; keep its console quiet
          o.teavmConsole = { putcharStdout() {}, putcharStderr() {} }
        },
      })
    } catch (error) {
      throw new Error(supportMessage(error))
    }
    compiler = teavm.exports.createCompiler()
    compiler.setSdk(new Int8Array(sdk))
    compiler.setTeaVMClasslib(new Int8Array(classlib))
    compiler.onDiagnostic((d) => {
      diagnostics.push({
        type: String(d.type),
        severity: String(d.severity),
        file: d.fileName ? String(d.fileName) : null,
        line: d.lineNumber > 0 ? d.lineNumber : null,
        column: d.type === 'javac' && d.columnNumber > 0 ? d.columnNumber : null,
        start: d.type === 'javac' ? d.startPosition : -1,
        end: d.type === 'javac' ? d.endPosition : -1,
        message: String(d.message),
      })
    })
    harnessBytes = new Int8Array(harness)
    deobfuscatorBytes = deob
    try { deobfuscatorModule = await WebAssembly.compile(deob, { builtins: ['js-string'] }) } catch { deobfuscatorModule = null }
    installAsyncErrorHandlers()
    // nothing is fetched after this; TeaVM's java.net.URL would use XMLHttpRequest
    host.lockdown()
    return {
      version: VERSION,
      engine: 'teavm-javac',
      javac: 'OpenJDK javac 25 (jdk25u 6c48f4e)',
      teavm: '0.13.1 (teavm-javac 2ddcf02 + Ink Maze guard)',
      loadMs: Math.round(host.now() - t0),
    }
  },

  async warm() {
    // compile and run a throwaway program, so the first real run finds javac and TeaVM warm
    const source = 'class Solution {\n    public String solve(String[] grid, int ink) {\n        StringBuilder sb = new StringBuilder();\n' +
      '        for (int r = 0; r < grid.length; r++) if (grid[r].indexOf(\'o\') >= 0) sb.append(r % 2 == 0 ? "D" : "R");\n        return sb.toString();\n    }\n}\n'
    const compiled = compileSource(source, null)
    if (compiled.bytes) {
      const io = warmIO('1\n2 2 3\no.\n..\n')
      const outcome = await execute(compiled.bytes, io.job, io)
      if (outcome.status !== 'ok') host.log('warm-up run:', outcome)
    }
    cache = null
  },

  async run(job, io) {
    let compiled
    if (cache && cache.source === job.source) {
      compiled = cache
    } else {
      cache = null
      try {
        compiled = compileSource(job.source, io)
      } catch (error) {
        endCompile()
        return compileFailure(error, io)
      }
      endCompile()
      if (compiled.outcome) return compiled.outcome
    }
    const outcome = await execute(compiled.bytes, job, io)
    if (compiled.diagnostics.length) outcome.diagnostics = [...compiled.diagnostics, ...(outcome.diagnostics || [])]
    if (outcome.status === 'ok' || outcome.status === 'runtime_error' || outcome.status === 'crashed' || isLimit(outcome.status)) {
      cache = { source: job.source, bytes: compiled.bytes, diagnostics: compiled.diagnostics }
    }
    return outcome
  },

  footprint() {
    // javac + TeaVM and their class libraries stay loaded; the last program's allocations come on top
    return { memoryBytes: 360 * MIB + Math.min(lastAllocated, 2048 * MIB) }
  },
}

export default RUNTIME

const isLimit = (status) => status === 'time_limit' || status === 'memory_limit' || status === 'output_limit'

/** An io for warm(): no deadline, output dropped. */
function warmIO(stdin) {
  const LimitError = host.LimitError
  return {
    job: { runId: 'warm', language: 'java', kind: 'run', source: '', stdin, tests: 1, timeLimitMs: 60000, compileLimitMs: 60000, memoryLimitBytes: 256 * MIB, outputLimit: 1 << 20, answerChars: 10000, recursionDepth: 200 },
    stdout() {}, stderr() {}, started() {}, check() {}, now: () => host.now(), deadline: Infinity, deadlineEpochMs: Infinity,
    timeLeft: () => 60000, hit() {}, limit: null, LimitError,
  }
}

// ------------------------------------------------------------ compiling

/**
 * javac + checks + TeaVM. Returns { bytes, diagnostics } or { outcome } (a
 * compile error). Throws a LimitError at the compile deadline or budget, or
 * when the compiler itself crashes (compileFailure() reports both).
 */
function compileSource(source, io) {
  const text = normalizeSource(source)
  diagnostics = []
  compiler.clearSourceFiles()
  compiler.clearOutputFiles()
  compiler.addSourceFile(PLAYER_FILE, text)
  startCompilePhase(io, 'javac', JAVAC_BUDGET)
  const javacOk = compiler.compile()
  const javacDiagnostics = diagnostics.filter((d) => d.type === 'javac').map((d) => toDiagnostic(d, text))
  if (!javacOk) {
    const out = javacDiagnostics.length ? javacDiagnostics : [{ line: null, column: null, severity: 'error', message: 'Your code did not compile.' }]
    return { outcome: { status: 'compile_error', diagnostics: out } }
  }
  const problems = checkClasses(text)
  if (problems.length) return { outcome: { status: 'compile_error', diagnostics: [...problems, ...javacDiagnostics.filter((d) => d.severity !== 'error')] } }
  compiler.addOutputClassFile(HARNESS + '.class', harnessBytes)
  diagnostics = []
  startCompilePhase(io, 'TeaVM', TEAVM_BUDGET)
  const teavmOk = compiler.generateWebAssembly({ outputName: 'app', mainClass: HARNESS, strictMode: false, guard: true })
  if (!teavmOk) {
    const seen = new Set()
    const errors = diagnostics.filter((d) => d.severity === 'error').map((d) => teavmDiagnostic(d, text))
      .filter((d) => !seen.has(d.message) && seen.add(d.message))
    return { outcome: { status: 'compile_error', diagnostics: errors.length ? errors : [{ line: null, column: null, severity: 'error', message: 'Your code compiled, but could not be turned into WebAssembly.' }] } }
  }
  const out = compiler.getWebAssemblyOutputFile('app.wasm')
  const bytes = new Uint8Array(out.buffer, out.byteOffset, out.byteLength).slice()
  const imports = importModules(bytes)
  const foreign = imports.filter((m) => !PROGRAM_IMPORTS.has(m))
  if (foreign.length) {
    return { outcome: { status: 'compile_error', diagnostics: [{ line: null, column: null, severity: 'error', message: `Your program needs something from outside the sandbox (${foreign.join(', ')}); only plain Java is available here.` }] } }
  }
  return { bytes, diagnostics: javacDiagnostics.filter((d) => d.severity !== 'error') }
}

function compileFailure(error, io) {
  const limit = io && io.limit
  if (limit || (error && error.name === 'LimitError')) {
    const status = limit || error.limit || 'time_limit'
    const message = status === 'time_limit'
      ? `Compiling your code took longer than ${Math.round(io.job.compileLimitMs / 100) / 10} s.`
      : (error && error.message) || 'Compiling your code used too much memory.'
    // the guard may have stopped javac or TeaVM anywhere, e.g. halfway through rehashing one of TeaVM's
    // cached maps: never compile with them again (a fresh worker loads in well under a second)
    return { status, message, diagnostics: [{ line: null, column: null, severity: 'error', message }], healthy: false }
  }
  // the compiler itself failed (a stack overflow on deeply nested code, or a bug in it): its state is gone
  const text = String(error && error.message || error)
  const deep = error instanceof RangeError || /call stack|too much recursion/i.test(text)
  const message = deep
    ? 'Your code is nested too deeply for the in-browser compiler (it ran out of stack). Split long expressions or deep nesting into smaller methods.'
    : `The in-browser Java compiler failed on your code (${text.slice(0, 200)}). Try writing that part another way.`
  const source = io ? io.job.source : ''
  const reference = /\b(?:Weak|Soft|Phantom)Reference\b|\bReferenceQueue\b/.exec(source)
  if (reference) {
    // TeaVM 0.13.1's WebAssembly GC backend crashes on java.lang.ref (a null dereference while compiling)
    const text = `java.lang.ref (${reference[0]}) is not available in the in-browser Java; keep ordinary references.`
    return { status: 'compile_error', message: text, diagnostics: [{ line: lineOf(source, /\b(?:Weak|Soft|Phantom)Reference\b|\bReferenceQueue\b/), column: null, severity: 'error', message: text }], healthy: false }
  }
  const annotation = annotationWithValue(source)
  const diagnostics = annotation
    ? [{ line: annotation.line, column: annotation.column, severity: 'error', message: `This in-browser javac cannot compile annotations with values (${annotation.text}); remove it.` }]
    : [{ line: null, column: null, severity: 'error', message }]
  return { status: 'compile_error', message: annotation ? diagnostics[0].message : message, diagnostics, healthy: false }
}

/**
 * TeaVM-javac overflows its stack on a java.lang annotation that has a value,
 * e.g. @SuppressWarnings("unchecked") or @Deprecated(since = "9"). Both only
 * change warnings, so they become spaces (same length, line breaks kept, so
 * every line and column stays where it was).
 */
const HARMLESS_ANNOTATION = /@\s*(?:java\s*\.\s*lang\s*\.\s*)?(?:SuppressWarnings|Deprecated)\s*\((?:[^()"]|"(?:[^"\\\n]|\\.)*")*\)/g
function normalizeSource(source) {
  return source.replace(HARMLESS_ANNOTATION, (m) => m.replace(/[^\n]/g, ' '))
}
function annotationWithValue(source) {
  const m = /@\s*[\w.]+\s*\(/.exec(normalizeSource(source || ''))
  if (!m) return null
  const before = source.slice(0, m.index).split('\n')
  return { line: before.length, column: before[before.length - 1].length + 1, text: m[0].replace(/\s*\($/, '(...)') }
}

/** javac diagnostic -> contract Diagnostic, lines and columns in the player's file */
function toDiagnostic(d, text) {
  const severity = d.severity === 'error' ? 'error' : d.severity === 'warning' ? 'warning' : 'note'
  const mine = !d.file || d.file.replace(/^.*\//, '') === PLAYER_FILE
  const out = { line: mine ? d.line : null, column: mine ? d.column : null, severity, message: d.message }
  if (mine && d.start >= 0 && d.end > d.start && d.end <= text.length) {
    const end = position(text, d.end)
    out.endLine = end.line
    out.endColumn = end.column
  }
  return out
}
function position(text, offset) {
  let line = 1
  let lineStart = 0
  for (let i = text.indexOf('\n'); i >= 0 && i < offset; i = text.indexOf('\n', i + 1)) { line++; lineStart = i + 1 }
  return { line, column: offset - lineStart + 1 }
}

/** TeaVM's link errors: the class library has no such class or method, or cannot build it for WasmGC */
const ENCODING_CLASSES = /\b(PrintStream|PrintWriter|InputStreamReader|OutputStreamWriter|BufferedReader|BufferedWriter|Scanner|Charset|StandardCharsets|getBytes|ByteArrayOutputStream|Formatter)\b/
function teavmDiagnostic(d, text) {
  let message = d.message
  const mine = d.file && d.file.replace(/^.*\//, '') === PLAYER_FILE
  let line = mine ? d.line : null
  const missing = /^(Class|Method|Field) (\S+?) (?:was not found|not found)/.exec(message)
  if (missing) {
    const what = missing[2].replace(/\(.*$/, '').replace(/^java\.lang\./, '')
    message = `Your code uses ${what}, which the in-browser Java class library does not have. Use something simpler (plain arrays, StringBuilder, java.util collections).`
  } else if (/is not annotated with org\.teavm\.interop\.Import/.test(message)) {
    // reflection over methods pulls native methods into the build that WebAssembly GC cannot link
    message = 'Your code uses reflection over methods or fields (getDeclaredMethods, getMethods, Method.invoke...), which the in-browser compiler cannot build. Call the methods directly.'
    if (line === null) line = lineOf(text, /\b(getDeclared\w*|getMethods|getFields|getConstructors|invoke)\s*\(/)
  } else if (/JSByRef|not supported in Wasm GC|org\.teavm\.jso/.test(message)) {
    // text encodings (java.nio.charset) cannot be built for WebAssembly GC by this TeaVM
    message = 'Your code uses a part of the Java library that the in-browser compiler cannot build: text encodings ' +
      '(PrintStream, PrintWriter, readers and writers, String.getBytes, Scanner). Print with System.out and work with Strings, char arrays and StringBuilder.'
    if (line === null) line = lineOf(text, ENCODING_CLASSES)
  }
  return { line, column: null, severity: 'error', message }
}

// ------------------------------------------------------------ class-file checks

/**
 * After javac: the player's classes are in the unnamed package, none is named
 * like the harness, none mentions org.teavm (JavaScript interop, @Import, the
 * Guard: banned), and Solution has `String solve(String[], int)` and a
 * constructor with no arguments, which the harness calls.
 */
function checkClasses(text) {
  const problems = []
  const names = Array.from(compiler.listOutputFiles(), String)
  let solution = null
  for (const name of names) {
    if (!name.endsWith('.class')) continue
    const data = compiler.getOutputFile(name)
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    let info
    try { info = parseClass(bytes) } catch (error) {
      problems.push(problem(`javac produced a class file this runtime cannot read (${name}).`))
      continue
    }
    if (info.name.includes('/')) {
      const pkg = info.name.slice(0, info.name.lastIndexOf('/')).replace(/\//g, '.')
      problems.push(problem(`Remove the package declaration (package ${pkg};): ${PLAYER_FILE} must use the default package.`, lineOf(text, /^\s*package\b/m)))
      break
    }
    if (info.name.startsWith(HARNESS)) {
      problems.push(problem(`The class name ${info.name} is reserved for the game's harness; rename it.`, lineOf(text, new RegExp(`\\b${info.name.replace(/\$.*/, '')}\\b`))))
    }
    if (containsAscii(bytes, 'org/teavm') || containsAscii(bytes, 'org.teavm')) {
      problems.push(problem('org.teavm.* (TeaVM\'s JavaScript interop) is not available in this level; use plain Java.', lineOf(text, /org\s*\.\s*teavm/)))
    }
    if (info.name === 'Solution') solution = info
  }
  if (problems.length) return problems
  const signature = 'public String solve(String[] grid, int ink)'
  if (!solution) return [problem(`Your file must define a class named Solution with the method ${signature}.`, lineOf(text, /\bclass\s+\w+/))]
  const ACC_PRIVATE = 0x0002
  const ACC_STATIC = 0x0008
  const ACC_INTERFACE = 0x0200
  const ACC_ABSTRACT = 0x0400
  if (solution.access & (ACC_INTERFACE | ACC_ABSTRACT)) {
    return [problem('Solution must be a plain class (not an interface or abstract): the game makes one with new Solution().', lineOf(text, /\b(?:interface|abstract\s+class|class)\s+Solution\b/))]
  }
  const solves = solution.methods.filter((m) => m.name === 'solve')
  const exact = solves.find((m) => m.desc === SOLVE_DESC)
  const solveLine = lineOf(text, /\bsolve\s*\(/)
  if (!exact) {
    const found = solves.length ? ` (yours: ${solves.map((m) => describeMethod(m)).join('; ')})` : ''
    return [problem(`Solution must keep the method ${signature}${found}.`, solveLine)]
  }
  if (exact.access & ACC_STATIC) return [problem(`solve must not be static: keep ${signature}.`, solveLine)]
  if (exact.access & ACC_ABSTRACT) return [problem(`solve needs a body: keep ${signature}.`, solveLine)]
  if (exact.access & ACC_PRIVATE) return [problem(`solve must not be private: keep ${signature}.`, solveLine)]
  const init = solution.methods.find((m) => m.name === '<init>' && m.desc === '()V')
  if (!init || (init.access & ACC_PRIVATE)) {
    return [problem('Solution needs a constructor with no arguments that is not private (the game calls new Solution() for every board).', lineOf(text, /\bSolution\s*\(/))]
  }
  return []
}

const problem = (message, line = null) => ({ line, column: null, severity: 'error', message })
function lineOf(text, re) {
  const m = re.exec(text)
  return m ? text.slice(0, m.index + (m[0].length - m[0].trimStart().length)).split('\n').length : null
}
function describeMethod(m) {
  const types = []
  let i = 1
  const one = () => {
    let dims = 0
    while (m.desc[i] === '[') { dims++; i++ }
    let t
    const c = m.desc[i++]
    if (c === 'L') { const end = m.desc.indexOf(';', i); t = m.desc.slice(i, end).replace(/^java\/lang\//, '').replace(/\//g, '.'); i = end + 1 } else t = { Z: 'boolean', B: 'byte', C: 'char', S: 'short', I: 'int', J: 'long', F: 'float', D: 'double', V: 'void' }[c] || c
    return t + '[]'.repeat(dims)
  }
  while (i < m.desc.length && m.desc[i] !== ')') types.push(one())
  i++
  const ret = one()
  return `${m.access & 0x0008 ? 'static ' : ''}${ret} solve(${types.join(', ')})`
}

/** The parts of a class file the checks need: its name, its access flags, its methods. */
function parseClass(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (dv.getUint32(0) !== 0xcafebabe) throw new Error('not a class file')
  let p = 8
  const count = dv.getUint16(p); p += 2
  const utf8 = []
  const classes = []
  for (let i = 1; i < count; i++) {
    const tag = bytes[p++]
    switch (tag) {
      case 1: { const len = dv.getUint16(p); p += 2; utf8[i] = modifiedUtf8(bytes, p, len); p += len; break }
      case 7: classes[i] = dv.getUint16(p); p += 2; break
      case 8: case 16: case 19: case 20: p += 2; break
      case 3: case 4: case 9: case 10: case 11: case 12: case 17: case 18: p += 4; break
      case 5: case 6: p += 8; i++; break
      case 15: p += 3; break
      default: throw new Error(`constant pool tag ${tag}`)
    }
  }
  const access = dv.getUint16(p); p += 2
  const name = utf8[classes[dv.getUint16(p)]]; p += 2
  p += 2
  p += 2 + 2 * dv.getUint16(p)
  const members = (into) => {
    const n = dv.getUint16(p); p += 2
    for (let k = 0; k < n; k++) {
      const member = { access: dv.getUint16(p), name: utf8[dv.getUint16(p + 2)], desc: utf8[dv.getUint16(p + 4)] }
      const attributes = dv.getUint16(p + 6); p += 8
      for (let a = 0; a < attributes; a++) { p += 2; const len = dv.getUint32(p); p += 4 + len }
      if (into) into.push(member)
    }
  }
  members(null)
  const methods = []
  members(methods)
  return { access, name: String(name), methods }
}
function modifiedUtf8(bytes, at, len) {
  let s = ''
  for (let i = at; i < at + len;) {
    const b = bytes[i++]
    if (b < 0x80) s += String.fromCharCode(b)
    else if ((b & 0xe0) === 0xc0) s += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 0x3f))
    else { const b2 = bytes[i++]; const b3 = bytes[i++]; s += String.fromCharCode(((b & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f)) }
  }
  return s
}
function containsAscii(bytes, text) {
  const first = text.charCodeAt(0)
  outer: for (let i = bytes.indexOf(first); i >= 0 && i + text.length <= bytes.length; i = bytes.indexOf(first, i + 1)) {
    for (let k = 1; k < text.length; k++) if (bytes[i + k] !== text.charCodeAt(k)) continue outer
    return true
  }
  return false
}

/** The import modules a wasm binary declares (its import section), read without compiling it. */
function importModules(bytes) {
  const seen = new Set()
  let p = 8
  const leb = () => { let r = 0; let shift = 0; let b; do { b = bytes[p++]; r += (b & 0x7f) * 2 ** shift; shift += 7 } while (b & 0x80); return r }
  const name = () => { const n = leb(); const s = new TextDecoder().decode(bytes.subarray(p, p + n)); p += n; return s }
  while (p < bytes.length) {
    const id = bytes[p++]
    const size = leb()
    const end = p + size
    if (id === 2) {
      const n = leb()
      for (let i = 0; i < n; i++) {
        seen.add(name())
        name()
        const kind = bytes[p++]
        if (kind === 0) leb()
        else if (kind === 1) { p++; const flags = bytes[p++]; leb(); if (flags & 1) leb() } // table: reftype + limits
        else if (kind === 2) { const flags = bytes[p++]; leb(); if (flags & 1) leb() } // memory
        else if (kind === 3) { valueType(); p++ } // global: type + mutability
        else if (kind === 4) { p++; leb() } // tag
        else { seen.add(`<unknown import kind ${kind}>`); return [...seen] }
      }
      return [...seen]
    }
    p = end
  }
  return [...seen]
  function valueType() {
    const t = bytes[p++]
    if (t === 0x63 || t === 0x64) { const h = bytes[p]; if (h >= 0x40 && h < 0x80 && h !== 0x40) p++; else leb() }
  }
}

// ------------------------------------------------------------ running

/** answers as problem.ts escapeAnswer() writes them (H3) */
function escapeAnswer(moves, max) {
  let out = ''
  for (let i = 0; i < moves.length && out.length < max; i++) {
    const code = moves.charCodeAt(i)
    if (code < 0x20) out += String.fromCharCode(0x2400 + code)
    else if (code === 0x7f) out += '␡'
    else if (code === 0x40) out += '＠'
    else if (code >= 0xd800 && code <= 0xdbff) {
      const low = moves.charCodeAt(i + 1)
      if (low >= 0xdc00 && low <= 0xdfff) { out += moves[i] + moves[i + 1]; i++ } else out += '�'
    } else if (code >= 0xdc00 && code <= 0xdfff) out += '�'
    else out += moves[i]
  }
  return out.slice(0, max)
}

/**
 * An uncaught error outside any call this runtime made: never to the host (it would end the run in flight or
 * restart the worker). The program's own timers report to their run in teavmAsync.offer; what is left is an
 * old instance's FinalizationRegistry callback calling into it after its run ended (its first import throws
 * StaleRun), which belongs to no run at all, so it is dropped.
 */
function installAsyncErrorHandlers() {
  self.addEventListener('error', (event) => {
    event.preventDefault()
    host.log('dropped an error from outside the run:', String(event.message || event.error))
  })
  self.addEventListener('unhandledrejection', (event) => {
    event.preventDefault()
    host.log('dropped a rejection from outside the run:', String(event.reason))
  })
}

/**
 * Instantiates the program and runs the harness. Every program outcome
 * resolves; a LimitError (deadline, heap, output) is turned into its outcome
 * here, with where the program was.
 */
async function execute(bytes, job, io) {
  const stdin = job.stdin
  const single = job.memoryLimitBytes
  const total = job.memoryLimitBytes * ALLOC_FACTOR
  const R = {
    stale: false,
    board: -1,
    answered: 0,
    out: '',
    err: '',
    answer: '',
    failText: '',
    fail: null,
    done: false,
    allocated: 0,
    exited: null,
    timers: new Set(),
    settle: null,
    finished: null,
  }
  R.finished = new Promise((resolve) => { R.settle = resolve })
  const live = () => { if (R.stale) throw new StaleRun() }
  const flush = () => {
    if (R.out) { const s = R.out; R.out = ''; io.stdout(s) }
    if (R.err) { const s = R.err; R.err = ''; io.stderr(s) }
  }
  R.asyncError = (error) => { if (!R.stale) R.settle({ error }) }

  const guardImports = {
    check(allocated) {
      live()
      R.allocated = allocated
      flush()
      io.check()
      return total
    },
    limit() { live(); return single },
    memory(size, sum) {
      live()
      R.allocated = sum
      if (size > single) {
        io.hit('memory_limit', `Your code asked for ${Math.ceil(size / MIB)} MiB at once; one array or object may use at most ${Math.round(single / MIB)} MiB.`)
      } else if (sum > total) {
        io.hit('memory_limit', `Your code allocated more than ${Math.round(total / MIB)} MiB in total. (The browser cannot tell what is still in use, so Java here counts every object and array you create: reuse arrays instead of making new ones in the search.)`)
      }
      flush()
      io.check()
      return total
    },
    exit(status) { live(); R.exited = status; throw new ExitCalled(status) },
  }
  const harnessImports = {
    inputLength() { live(); return stdin.length },
    input(i) { live(); return stdin.charCodeAt(i) },
    board(t) { live(); flush(); R.board = t },
    answer(code) { live(); if (R.answer.length < job.answerChars + 2) R.answer += String.fromCharCode(code) },
    answerEnd() {
      live()
      flush()
      io.stdout(`${MARKER} ${escapeAnswer(R.answer, job.answerChars)}\n`)
      R.answer = ''
      R.answered++
    },
    failChar(code) { live(); if (R.failText.length < 2000) R.failText += String.fromCharCode(code) },
    failEnd(kind) {
      live()
      if (!R.fail) R.fail = { type: '', message: null, frames: [] }
      if (kind === 0) R.fail.type = R.failText
      else if (kind === 1) R.fail.message = R.failText
      else if (kind === 2) R.fail.frames.push(R.failText)
      R.failText = ''
    },
    failed() { live(); flush(); R.settle({ failed: true }) },
    done(allocated) { live(); flush(); R.allocated = allocated; R.done = true; R.settle({ done: true }) },
  }

  let program
  try {
    program = await teavmLoad(bytes, {
      stackDeobfuscator: deobfuscatorModule ? { enabled: true, path: deobfuscatorModule } : { enabled: false },
      noAutoImports: true,
      installImports(o) {
        o.inkGuard = guardImports
        o.inkHarness = harnessImports
        o.teavmConsole = {
          putcharStdout(code) { live(); R.out += String.fromCharCode(code); if (R.out.length >= 4096) flush() },
          putcharStderr(code) { live(); R.err += String.fromCharCode(code); if (R.err.length >= 4096) flush() },
        }
        o.teavmAsync = {
          // Thread.sleep / join / wait: TeaVM's green threads run on timers, owned by this run
          offer(ref, fn, at) {
            live()
            const id = setTimeout(() => {
              R.timers.delete(id)
              if (R.stale) return
              try { fn(ref) } catch (error) { R.asyncError(error) }
            }, Math.max(0, at - Date.now()))
            R.timers.add(id)
            return id
          },
          kill(id) { clearTimeout(id); R.timers.delete(id) },
        }
        hardenJso(o.teavmJso)
        // every Throwable takes a JavaScript stack trace when it is made: keep the deadline in view (a loop that
        // only throws spends its time here), and keep only what WebKit needs (its stacks have names, no offsets)
        const take = o.teavm.takeStackTrace
        let throws = 0
        o.teavm.takeStackTrace = function () {
          live()
          if ((++throws & 63) === 0) { flush(); io.check() }
          const native = take.call(this)
          const stack = String(new Error().stack || '')
          const named = /wasm-function\[\d+\]:0x/.test(stack) ? null : stack.slice(0, 4096)
          return {
            getStack() {
              let frames = []
              try { frames = Array.from(native.getStack() || []) } catch { frames = [] }
              if (named !== null && (!frames.length || frames.every((f) => /FakeClass/.test(String(f.className))))) frames = namedFrames(named)
              return frames
            },
          }
        }
      },
    })
  } catch (error) {
    // the browser refused the module TeaVM produced
    const fn = /"([\w$.]+)::([\w$<>]+)"/.exec(String(error && error.message))
    return {
      status: 'compile_error',
      diagnostics: [{ line: null, column: null, severity: 'error', message: `This browser could not load the WebAssembly made from your code${fn ? ` (in ${fn[1]}.${fn[2]})` : ''}: ${String(error && error.message || error).slice(0, 200)}` }],
    }
  }

  current = R
  io.started() // the time limit starts now (D1, H6)
  let thrown = null
  try {
    program.exports.main([])
  } catch (error) {
    thrown = error
  }
  let settled = null
  if (thrown === null && !R.done && !R.fail) {
    // main() returned with the program parked on a timer (Thread.sleep / join / wait): wait for it,
    // and for the deadline (no Java runs while it waits, so the timer below is what notices the deadline)
    let deadlineTimer = 0
    const deadline = new Promise((resolve) => { deadlineTimer = setTimeout(() => resolve({ deadline: true }), Math.max(0, io.timeLeft()) + 20) })
    settled = await Promise.race([R.finished, deadline])
    clearTimeout(deadlineTimer)
    if (settled && settled.error) thrown = settled.error
  }
  // the run is over: nothing of this instance runs again
  R.stale = true
  current = null
  for (const id of R.timers) clearTimeout(id)
  R.timers.clear()
  lastAllocated = R.allocated

  try { flush() } catch (error) { if (!thrown) thrown = error }
  const where = thrown ? await locate(thrown, bytes) : null
  const at = (base) => describeWhere(base, where, R.board)

  // a limit, whatever else happened (D3, D6)
  if (io.limit || (thrown && thrown.name === 'LimitError') || (settled && settled.deadline)) {
    let status = io.limit || (thrown && thrown.limit)
    if (!status) { try { io.check() } catch (error) { status = error.limit || 'time_limit' } }
    status = status || 'time_limit'
    const message = (thrown && thrown.name === 'LimitError' && thrown.message) || defaultLimitMessage(status, job)
    // the program stopped itself and nothing of it runs again, so the worker (and its warm compiler) stays; but
    // after memory_limit the engine may keep the garbage for a while (WebKit held 1.8 GB after repeated bombs),
    // and a fresh worker gives all of it back at once
    return { status, message: at(message), error: limitError(status, message, where, R.board), healthy: status !== 'memory_limit' }
  }
  if (R.fail) {
    return { status: 'runtime_error', error: javaError(R.fail, R.board) }
  }
  if (thrown instanceof ExitCalled) {
    return {
      status: 'runtime_error',
      message: `solve() must return; it called exit(${thrown.status})${R.board >= 0 ? ` on board ${R.board + 1}` : ''}.`,
      error: { type: 'SystemExit', message: `solve() must return; it called exit(${thrown.status})`, line: where && where.line, column: null, test: R.board >= 0 ? R.board : null, trace: where && where.trace },
    }
  }
  if (thrown) {
    const trap = trapError(thrown)
    if (trap.memory) {
      const message = 'The browser could not allocate the memory your code asked for.'
      return { status: 'memory_limit', message: at(message), error: limitError('memory_limit', message, where, R.board), healthy: false }
    }
    return {
      status: 'runtime_error',
      error: { type: trap.type, message: trap.message, line: where && where.line, column: null, test: R.board >= 0 ? R.board : null, trace: where && where.trace },
      healthy: !trap.internal,
    }
  }
  if (R.done) return { status: 'ok' }
  return { status: 'crashed', message: "Your code stopped the game's harness before it answered every board.", healthy: false }
}

function defaultLimitMessage(status, job) {
  if (status === 'time_limit') return `Your code ran longer than ${Math.round(job.timeLimitMs / 100) / 10} s.`
  if (status === 'memory_limit') return 'Your code used more memory than it may.'
  return `Your code printed more than ${job.outputLimit} characters.`
}
function limitError(status, message, where, board) {
  const type = { time_limit: 'TimeLimitExceeded', memory_limit: 'MemoryLimitExceeded', output_limit: 'OutputLimitExceeded' }[status]
  return { type, message, line: where ? where.line : null, column: null, test: board >= 0 ? board : null, trace: where ? where.trace : undefined }
}
function describeWhere(message, where, board) {
  const parts = []
  if (where && where.method) parts.push(`in ${where.method}${where.line ? `, line ${where.line}` : ''}`)
  if (board >= 0) parts.push(`on board ${board + 1}`)
  return parts.length ? `${message.replace(/\.$/, '')} (stopped ${parts.join(', ')}).` : message
}

/** A Java exception the harness caught (H4): its class, message and the player's frames. */
function javaError(fail, board) {
  const frames = fail.frames.map((f) => {
    const [className, method, file, line] = f.split('\t')
    return { className, method, file: file || null, line: Number(line) > 0 ? Number(line) : null }
  })
  const mine = frames.filter(isPlayerFrame)
  return {
    type: fail.type || 'java.lang.Throwable',
    message: fail.message || '',
    line: mine.length && mine[0].line ? mine[0].line : null,
    column: null,
    test: board >= 0 ? board : null,
    trace: formatTrace(mine) || undefined,
  }
}

/** The player's classes are all in Solution.java and in the unnamed package (checkClasses); the harness is not theirs. */
function isPlayerFrame(f) {
  const cls = String(f.className)
  if (cls.startsWith(HARNESS)) return false
  return f.file ? f.file.replace(/^.*\//, '') === PLAYER_FILE : !cls.includes('.')
}

function formatTrace(frames) {
  const lines = []
  let last = ''
  let repeats = 0
  for (const f of frames) {
    const text = `at ${f.className}.${f.method}(${f.file ? `${f.file.replace(/^.*\//, '')}${f.line ? `:${f.line}` : ''}` : 'Solution.java'})`
    if (text === last) { repeats++; continue }
    if (repeats) lines.push(`... ${repeats} more like the line above`)
    repeats = 0
    last = text
    lines.push(text)
    if (lines.length >= 24) break
  }
  if (repeats) lines.push(`... ${repeats} more like the line above`)
  return lines.join('\n')
}

/** What a trap or an engine error means in Java terms. */
function trapError(error) {
  const message = String(error && error.message || error)
  if (error instanceof RangeError && /call stack|stack size|too much recursion/i.test(message)) {
    return { type: 'java.lang.StackOverflowError', message: 'the recursion went too deep (the browser\'s stack ran out)' }
  }
  if (/too large|allocat|out of memory/i.test(message)) return { memory: true }
  if (error instanceof WebAssembly.RuntimeError || /wasm|WebAssembly/.test(String(error && error.constructor && error.constructor.name))) {
    if (/null/i.test(message)) return { type: 'java.lang.NullPointerException', message: 'a null reference was used (a field, method or array of an object that is null)' }
    if (/out of bounds|index out of range/i.test(message)) return { type: 'java.lang.ArrayIndexOutOfBoundsException', message: 'an array index was out of bounds' }
    if (/by zero|division|unrepresentable|overflow/i.test(message)) return { type: 'java.lang.ArithmeticException', message: '/ by zero' }
    if (/cast/i.test(message)) return { type: 'java.lang.ClassCastException', message: 'an object was cast to a class it does not belong to' }
    if (/unreachable/i.test(message)) return { type: 'java.lang.Error', message: 'the program reached code that should never run (an internal error of the in-browser Java)', internal: true }
    return { type: 'java.lang.Error', message, internal: true }
  }
  if (error instanceof StaleRun) return { type: 'java.lang.Error', message: 'the program kept running after its run ended', internal: true }
  // a Java exception that escaped outside solve(), or something in this runtime
  return { type: (error && error.name && error.name !== 'Error' ? error.name : 'java.lang.Error'), message, internal: true }
}

/** Where an error happened: the player's first frame (Chromium: line numbers; WebKit: method names). */
async function locate(error, bytes) {
  const stack = String(error && error.stack || '')
  let frames = []
  const addresses = [...stack.matchAll(/wasm-function\[\d+\]:0x([0-9a-f]+)/g)].map((m) => parseInt(m[1], 16))
  if (addresses.length && deobfuscatorBytes) {
    try {
      // the deobfuscator reads the program's embedded debug information (only compiled when an error needs it)
      const module = await WebAssembly.compile(bytes, { builtins: ['js-string'] })
      const deob = await deobfuscatorFor(module)
      frames = Array.from(deob.deobfuscate(addresses.slice(0, 256)) || [], (f) => ({ className: String(f.className), method: String(f.method), file: f.file ? String(f.file) : null, line: f.line > 0 ? f.line : null }))
    } catch { frames = [] }
  }
  if (!frames.length) frames = namedFrames(stack)
  const mine = frames.filter(isPlayerFrame)
  if (!mine.length) return null
  return { line: mine[0].line || null, method: `${mine[0].className}.${mine[0].method}()`, trace: formatTrace(mine) }
}

let deobfuscatorInstance = null
async function deobfuscatorFor(module) {
  if (!deobfuscatorInstance) deobfuscatorInstance = await teavmLoad(new Uint8Array(deobfuscatorBytes), { stackDeobfuscator: { enabled: false }, noAutoImports: true })
  return deobfuscatorInstance.exports.createForModule(module)
}

/** Frames from an engine stack that has names but no offsets (WebKit): "Solution::dfs". */
function namedFrames(stack) {
  const frames = []
  for (const m of stack.matchAll(/([A-Za-z_$][\w$.]*)::([\w$<>]+)/g)) {
    if (m[1].startsWith('org.teavm.') || m[1].startsWith('java.')) continue
    frames.push({ className: m[1], method: m[2], file: null, line: null })
    if (frames.length >= 256) break
  }
  return frames
}

/** TeaVM's JavaScript interop reaches globals when given no object; programs never need that. */
function hardenJso(jso) {
  if (!jso) return
  const refuse = () => { throw new Error('global JavaScript access is not available') }
  jso.global = refuse
  for (const key of Object.keys(jso)) {
    if (key === 'getProperty' || key === 'apply' || /^callMethod\d+$/.test(key)) {
      const original = jso[key]
      jso[key] = function (instance, ...rest) {
        if (instance === null || instance === undefined) refuse()
        return original.call(this, instance, ...rest)
      }
    }
  }
}
