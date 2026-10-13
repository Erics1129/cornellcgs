/**
 * Ink Maze level 26, the coding level: the contract between the page, the
 * sandbox host and the language runtimes.
 *
 * Pure TypeScript (erasable syntax only, no browser APIs), so Node imports it:
 *
 *   import { LANGUAGES, LIMITS } from './src/minigames/inkmaze/code/contract.ts'
 *
 * Who does what
 * -------------
 *  UI        talks to two modules only: sandbox.ts (CodeSandbox: load, run,
 *            cancel, dispose, state, subscribe, runtimeInfo) and problem.ts
 *            (statement, signatures, starter code, boards, judge). It never sees
 *            a worker or a message.
 *  page      src/minigames/inkmaze/code/sandbox.ts. Owns one hidden
 *            <iframe sandbox="allow-scripts">, formats stdin, serves the
 *            self-hosted runtime files, parses stdout, builds the RunResult,
 *            watches the heartbeat and rebuilds the iframe when it stops.
 *  host      public/minigames/ink-maze-code/sandbox.html + sandbox.js, inside
 *            that iframe: an opaque origin with no storage, no cookies and no
 *            access to the page, under a CSP that allows connections only to
 *            the pinned CDN_PREFIXES. It starts one classic worker per runtime
 *            on demand, relays messages, enforces the compile and run budgets
 *            with worker.terminate() as a backstop, caps output, sends heartbeats.
 *  prelude   the first script of every runtime worker (inside sandbox.js). It
 *            imports the runtime module, hands it a RuntimeHost, and per run a
 *            RunIO (output, the cooperative deadline, the limits).
 *  runtime   public/minigames/ink-maze-code/<runtime id>/runtime.js: one ES
 *            module file whose default export implements `Runtime` (below). It
 *            is imported with import() from a blob: URL inside a CLASSIC worker
 *            (Chromium refuses module workers from blob: URLs in an opaque
 *            origin), so it has no base URL: see Containment.
 *  problem   src/minigames/inkmaze/code/problem.ts: the statement, the stdin
 *            format, the harness rules H1-H6, the answer marker, the boards and
 *            the judge. The engine decides every move; runtimes never judge.
 *
 * Files (who owns what)
 * ---------------------
 *  shared    contract.ts, problem.ts, sandbox.ts, public/.../sandbox.html and
 *            sandbox.js, public/.../echo/ (the plumbing test runtime),
 *            public/.../LICENSES.txt (each runtime fills in its own section),
 *            scripts/test-inkmaze-code.mjs (Node, npm test),
 *            scripts/test-inkmaze-code-sandbox.mjs and
 *            scripts/inkmaze-code-browser.mjs (browser helpers: devServer,
 *            launch, openCodePage, runOnPage, cpuMeter).
 *  runtime   public/minigames/ink-maze-code/<java|python|javascript|clang>/
 *            (runtime.js, its assets, LICENSE texts, PROVENANCE.txt), its own
 *            entry in RUNTIME_INFO / LANGUAGE_INFO below (sizes, cdn, version,
 *            timeFactor; a new CDN prefix also goes into sandbox.html's CSP, and
 *            the Node test checks they match), and its own browser suite,
 *            scripts/test-inkmaze-code-<runtime>.mjs, built on the helpers.
 *  UI        the level-26 page and its styles; it imports sandbox.ts and
 *            problem.ts and changes neither.
 *
 * A run, end to end
 * -----------------
 *  1. UI: result = await sandbox.run({ language, source, tests, kind })
 *  2. Page: one run at a time (later calls queue). Makes the iframe if needed,
 *     loads the runtime if needed (state 'loading'), formats stdin with
 *     problem.formatStdin(tests) and posts the RuntimeJob (state 'compiling').
 *  3. Host: hands the job to the runtime's worker and arms the compile budget
 *     (compileLimitMs + HOST_GRACE_MS). The prelude calls runtime.run(job, io).
 *  4. Runtime: compiles; calls io.started() (state 'running'; the time limit
 *     starts now and the host re-arms its budget to timeLimitMs + HOST_GRACE_MS);
 *     runs its hidden harness and the player's code on job.stdin; everything
 *     the program prints goes through io.stdout / io.stderr. The harness prints
 *     one '@@ANSWER@@ <moves>' line per board (problem.ts H1-H6).
 *  5. Runtime: run() resolves a RuntimeOutcome (or lets io.LimitError escape).
 *  6. Page: problem.parseStdout(stdout, T) splits the answers from the
 *     player's console; an 'ok' outcome with other than exactly T answer lines
 *     becomes 'crashed'. The UI gets the RunResult, judges result.answers with
 *     problem.judgeRun / judgeAll, and animates the engine's MoveResults.
 *
 * The cooperative deadline (every runtime must honour it)
 * --------------------------------------------------------
 *  Measured with scripts/test-inkmaze-code-sandbox.mjs and small probes
 *  (Chromium 151, WebKit 26.5: the engine of Safari and of every iOS browser;
 *  2026-10-12):
 *   - WebKit: worker.terminate() does NOT stop a thread that is running
 *     WebAssembly. An unchecked wasm loop kept a full core busy for as long as
 *     it was watched; so did wasm calling into a trivial JavaScript function,
 *     into performance.now() or into postMessage every few ms (earlier probes:
 *     it survives removing the iframe and navigating away, one more busy core
 *     per runaway). Only some call patterns let terminate() take effect (a
 *     postMessage every 250 ms did); nobody knows why, so never rely on it. A
 *     plain JavaScript loop does stop on terminate().
 *   - Chromium: terminate() stops a busy thread (JavaScript or wasm) only
 *     after its forcible-termination delay, about 2 s.
 *   - What stops a runaway in both, idle again within the 1.5 s window that
 *     starts 0.3 s after the limit: the program's own time-based check that
 *     throws or traps (io.check() in JavaScript, a wasm loop that calls it
 *     every 65,536 turns, a child thread comparing its clock with
 *     deadlineEpochMs). It works after terminate() too: a cancelled child's
 *     wasm loop kept a core busy after terminate() and stopped at its own
 *     deadline. A nested worker started by a worker is NOT stopped when its
 *     parent is terminated in WebKit.
 *  So:
 *
 *  D1 Clock. When the job arrives the compile deadline is now + compileLimitMs.
 *     io.started() ends compiling and sets the run deadline, now + timeLimitMs.
 *     Both live in io.deadline (the prelude's performance.now() clock) and in
 *     io.deadlineEpochMs (performance.timeOrigin + performance.now(), for other
 *     threads). A deadline never moves later. Read time only through io.now(),
 *     io.timeLeft() or io.check(): the prelude captured performance.now before
 *     any player code ran, and player code can replace the global one.
 *  D2 Check. The program must call io.check() (or compare io.now() / an
 *     in-language clock with the same deadline and call out) on every loop
 *     back-edge and every function entry; sampling is fine (e.g. a counter that
 *     reads the clock every 65,536 back-edges), as long as no more than about
 *     CHECK_INTERVAL_MS of execution passes between two clock reads. That
 *     includes library code the player can drive without bound (Python builtins
 *     over huge ranges, regex backtracking, string repetition, sort of a huge
 *     list...): cover it with checks or bound its input. The player must not be
 *     able to opt out (C: reject no_sanitize attributes and
 *     `#pragma clang attribute`; Python: refuse sys.settrace / sys.monitoring
 *     changes if the check rides on them).
 *     Starting points the research found (each runtime engineer verifies their own):
 *       C/C++   -fsanitize-coverage=trace-pc -mllvm -sanitizer-coverage-prune-blocks=0
 *               and a harness __sanitizer_cov_trace_pc (no_sanitize("coverage"))
 *               that reads clock_gettime every 65,536 calls and traps past the
 *               deadline: stopped 4 of 4 runaways in WebKit at 0.00 cores after.
 *       JS      QuickJS's interrupt handler (quickjs-emscripten
 *               runtime.setInterruptHandler) returning true past the deadline;
 *               it also stops regex backtracking.
 *       Python  CPython's eval-loop hook; Pyodide reads its interrupt buffer
 *               from JavaScript, so a non-shared object whose [0] reads 2
 *               (SIGINT) past the deadline may work without SharedArrayBuffer;
 *               otherwise sys.monitoring JUMP / CALL events. KeyboardInterrupt
 *               is catchable: keep it sticky (D3).
 *       Java    TeaVM's wasm has no hook: instrument the bytecode (a static
 *               check call at every back-edge and method entry, before TeaVM)
 *               or the wasm (a fuel counter at loop headers).
 *  D3 Stop. Past the deadline the check must STOP the program by itself, by
 *     throwing or trapping back out to the runtime. Posting a message is not a
 *     stop; neither is setting a flag the program might never read. Player code
 *     must not be able to swallow it (catch (Throwable), except BaseException,
 *     catch (...), finally that loops): io.check() is sticky and throws again at
 *     every later check, so the program stops at its next check whatever it
 *     catches, and the outcome is the limit whatever happens next. Once a limit
 *     is hit, io.stdout / io.stderr throw as well.
 *  D4 Report. run() settles within SELF_STOP_SLACK_MS after the deadline. The
 *     simplest way: let the io.LimitError escape run(); the prelude reports
 *     { status: limit, healthy: false } and the result says stoppedBy 'runtime'.
 *  D5 Backstop. If the outcome has not arrived by deadline + HOST_GRACE_MS the
 *     host terminates the worker and every child it spawned and reports
 *     time_limit with stoppedBy: 'host'; the page then rebuilds the whole
 *     iframe. In WebKit a wasm program can keep a core busy after that until the
 *     tab closes, and in Chromium it runs ~2 s more, so stoppedBy 'host' is a
 *     runtime bug, never a pass.
 *  D6 Memory and output follow the same rule. Cap every wasm memory and heap
 *     at job.memoryLimitBytes (WebAssembly.Memory maximum, or refuse
 *     memory.grow past it); when the cap refuses memory, call
 *     io.hit('memory_limit') and stop (sticky, like D3). Where the engine owns
 *     the heap (WasmGC under TeaVM, the JS engine's own objects) meter the
 *     allocations in the harness or instrumentation: WebKit gives the sandbox
 *     no process of its own, and an allocation bomb reached 24 GB in 4 s there.
 *     io.stdout / io.stderr throw LimitError('output_limit') once
 *     job.outputLimit characters are passed; let it stop the program.
 *  D7 Compile. A compiler that runs in your worker calls io.check() during
 *     compilation where it can (the compile deadline applies before started()).
 *     Otherwise the host's compile budget terminates the worker; then measure
 *     the WebKit CPU after a compile timeout as well (compile bombs exist:
 *     `static char big[600u<<20] = {1};` held clang for 60 s and 5 GB).
 *  D8 Children. A runtime that wants the program in another thread asks the
 *     host for one with host.spawn() (never `new Worker` itself: in WebKit a
 *     worker's own nested workers survive its terminate()). The host owns the
 *     child (a classic worker made from a self-hosted script) and terminates it
 *     with its parent (recycle, cancel, D5, unload). The parent passes
 *     io.deadlineEpochMs to the child; the child's program checks
 *     performance.timeOrigin + performance.now() (captured before any player
 *     code) against it, and stops itself exactly as in D2-D4. The child gets no
 *     RuntimeHost: the parent sends it what it needs (wasm bytes, source text;
 *     it may import() blob: URLs it makes itself) over the port.
 *  D9 Proof. A runtime is done only when, in both Chromium and WebKit, every
 *     runaway program in its suite (tight loop, deep recursion, allocation
 *     bomb, output flood, harness tampering, a loop inside catch/finally, a
 *     compile bomb) reports the right status with stoppedBy 'runtime', the next
 *     run works, AND the browser's CPU (WebKit: the WebContent process) drops
 *     to about 0 within 1 s of the limit. Measure it as
 *     scripts/test-inkmaze-code-sandbox.mjs does (cpuMeter() from
 *     scripts/inkmaze-code-browser.mjs, with an unchecked positive control run
 *     last); "the next run works" is not proof.
 *
 * Cancel
 * ------
 *  sandbox.cancel() makes the host terminate the worker (and its children)
 *  and the run resolves 'cancelled' at once. A synchronous program cannot be
 *  told anything without SharedArrayBuffer, so after a cancel it may keep
 *  running (Chromium ~2 s; WebKit wasm until its own deadline check stops it,
 *  D3), never longer than timeLimitMs after io.started(). The next run gets a
 *  fresh worker meanwhile.
 *
 * Containment (what the sandbox gives you, and what you must add)
 * ---------------------------------------------------------------
 *  - The iframe has an opaque origin: no cookies, no localStorage/IndexedDB,
 *    no access to the page. Workers are created from blob: URLs and inherit
 *    its CSP: scripts from 'self', blob: and CDN_PREFIXES only ('unsafe-eval'
 *    and 'wasm-unsafe-eval' are allowed for the toolchains), connections to
 *    'self', blob: and CDN_PREFIXES only. WebKit does not match 'self' inside
 *    these workers: never rely on it.
 *  - Self-hosted files (anything under public/minigames/ink-maze-code/) come
 *    through the page: host.asset / assetText / assetUrl / importModule. Do not
 *    fetch or import the site directly (cross-origin from the opaque origin,
 *    refused by WebKit's CSP). importScripts(blob:) fails in WebKit; import()
 *    of a blob: URL (host.importModule) or of a pinned CDN URL works in both.
 *    A module loaded from blob: has no base URL: its own imports must be
 *    absolute CDN URLs, or go through host.importModule (so bundle a
 *    self-hosted runtime into one file).
 *  - Before any player code runs, call host.lockdown() if player code can reach
 *    the worker's globals at all (Pyodide's `js` module, a native JS runner,
 *    TeaVM's JSO). It removes fetch, XMLHttpRequest, WebSocket, WebTransport,
 *    EventSource, importScripts, Worker, SharedWorker, BroadcastChannel,
 *    indexedDB, caches and postMessage from the worker and its prototypes (the
 *    prelude keeps private references) and turns close() into a reported
 *    crash. Children from host.spawn() remove the same globals themselves
 *    (walking the prototype chain: in Chromium they live there), as
 *    echo/child.js shows.
 *  - Recycle or restore anything the player can change between runs
 *    (builtins, module attributes, the recursion limit, audit hooks, file
 *    descriptors, prototypes...). When in doubt return healthy: false and the
 *    host starts a fresh worker for the next run.
 *  - Player code can print the answer marker itself or try to post forged
 *    messages. That only spoils its own result: the host drops messages for
 *    other run ids, checks every field, and the page judges with the engine.
 */

/** Bumped whenever a message shape below changes; the page, the host and the prelude must agree. */
export const CODE_PROTOCOL = 1

// ------------------------------------------------------------- languages

/** The languages the player can pick, in the order the UI lists them. */
export const LANGUAGES = ['java', 'python', 'javascript', 'c', 'cpp'] as const
export type Language = (typeof LANGUAGES)[number]
export const DEFAULT_LANGUAGE: Language = 'java'

/** 'echo' is the plumbing test runtime (public/minigames/ink-maze-code/echo/runtime.js); the UI never lists it. */
export type TestLanguage = 'echo'
export type RunLanguage = Language | TestLanguage

/** One worker per runtime. C and C++ share the clang toolchain (one big compiler, loaded once). */
export const RUNTIME_IDS = ['java', 'python', 'javascript', 'clang', 'echo'] as const
export type RuntimeId = (typeof RUNTIME_IDS)[number]

export type LanguageInfo = {
  id: RunLanguage
  /** shown in the language picker */
  label: string
  runtime: RuntimeId
  /** the editor tab's file name; diagnostics refer to this file */
  fileName: string
  /** syntax-highlighting mode for the editor */
  editor: 'java' | 'python' | 'javascript' | 'c' | 'cpp' | 'plaintext'
  /** what the player's code is compiled or run as (the runtime engineers keep it true) */
  version: string
  /** problem.TIME_LIMIT_MS is multiplied by this (LeetCode-style per-language limits); runtime engineers set it from measurements */
  timeFactor: number
}

export const LANGUAGE_INFO: Record<RunLanguage, LanguageInfo> = {
  java: { id: 'java', label: 'Java', runtime: 'java', fileName: 'Solution.java', editor: 'java', version: 'Java 25 (javac + TeaVM 0.13.1, WebAssembly)', timeFactor: 1 },
  python: { id: 'python', label: 'Python', runtime: 'python', fileName: 'solution.py', editor: 'python', version: 'Python 3.14 (Pyodide 314.0.7)', timeFactor: 1 },
  javascript: { id: 'javascript', label: 'JavaScript', runtime: 'javascript', fileName: 'solution.js', editor: 'javascript', version: 'ES2023 (QuickJS)', timeFactor: 1 },
  c: { id: 'c', label: 'C', runtime: 'clang', fileName: 'solution.c', editor: 'c', version: 'C17 (Clang 22, wasm32-wasi)', timeFactor: 1 },
  cpp: { id: 'cpp', label: 'C++', runtime: 'clang', fileName: 'solution.cpp', editor: 'cpp', version: 'C++20 (Clang 22, wasm32-wasi)', timeFactor: 1 },
  echo: { id: 'echo', label: 'Echo (test)', runtime: 'echo', fileName: 'program.echo', editor: 'plaintext', version: 'echo test runtime 1', timeFactor: 1 },
}

export type RuntimeInfo = {
  id: RuntimeId
  /** the runtime module, relative to the code base (CODE_BASE_PATH) */
  script: string
  /** about how much a first load downloads, for "downloads about 6 MB" in the UI */
  downloadBytes: number
  /** about how much memory it holds once loaded */
  memoryBytes: number
  /** the page keeps at most one heavy runtime loaded: loading a heavy one unloads the others */
  heavy: boolean
  /** the pinned CDN URL prefixes it loads from; each must also be in sandbox.html's CSP (the Node test checks) */
  cdn: readonly string[]
}

const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/'
const CLANG_CDN = 'https://cdn.jsdelivr.net/npm/@yowasp/clang@22.0.0-git20542-10/'

export const RUNTIME_INFO: Record<RuntimeId, RuntimeInfo> = {
  java: { id: 'java', script: 'java/runtime.js', downloadBytes: 4_300_000, memoryBytes: 400_000_000, heavy: true, cdn: [] },
  python: { id: 'python', script: 'python/runtime.js', downloadBytes: 6_000_000, memoryBytes: 300_000_000, heavy: true, cdn: [PYODIDE_CDN] },
  javascript: { id: 'javascript', script: 'javascript/runtime.js', downloadBytes: 600_000, memoryBytes: 80_000_000, heavy: false, cdn: [] },
  clang: { id: 'clang', script: 'clang/runtime.js', downloadBytes: 23_100_000, memoryBytes: 1_300_000_000, heavy: true, cdn: [CLANG_CDN] },
  echo: { id: 'echo', script: 'echo/runtime.js', downloadBytes: 20_000, memoryBytes: 10_000_000, heavy: false, cdn: [] },
}

/**
 * Every URL prefix the sandbox may load from besides blob:. sandbox.html's CSP
 * lists exactly these in script-src and connect-src (the Node test checks),
 * with versions pinned in the path so nothing else on the CDN can load.
 */
export const CDN_PREFIXES: readonly string[] = [...new Set(Object.values(RUNTIME_INFO).flatMap((r) => r.cdn))]

/** Where the sandbox files live, under the site's base URL (import.meta.env.BASE_URL). */
export const CODE_BASE_PATH = 'minigames/ink-maze-code/'

export const runtimeFor = (language: RunLanguage): RuntimeId => LANGUAGE_INFO[language].runtime
export const isRunLanguage = (value: unknown): value is RunLanguage =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(LANGUAGE_INFO, value)

// ----------------------------------------------------------------- limits

export const LIMITS = {
  /** the player's source, in characters; longer is refused before compiling (status compile_error) */
  sourceChars: 100_000,
  /** boards per run */
  tests: 50,
  /** everything the program prints (stdout + stderr together) per run; past it: output_limit */
  outputChars: 1_048_576,
  /** what the result keeps of the player's console (stdout without answer lines), and of stderr */
  consoleChars: 65_536,
  /** one answer, in characters (a real answer is at most 60) */
  answerChars: 10_000,
  /** the player's heap; runtimes cap their wasm memory / allocator with it (D6) */
  memoryBytes: 256 * 1024 * 1024,
  /** from the job reaching the worker to io.started(): compiling, linking, harness setup (D1, D7) */
  compileMs: 15_000,
  /** a runtime's first load (network + compile of the toolchain) */
  loadMs: 180_000,
  /** a runtime stops itself within this after its deadline (D4) */
  selfStopSlackMs: 500,
  /** the host's terminate() backstop, after the deadline (D5) */
  hostGraceMs: 1_000,
  /** how often the host sends a heartbeat to the page */
  heartbeatMs: 250,
  /** the page rebuilds the iframe after this long without a heartbeat (its process died or froze) */
  heartbeatTimeoutMs: 3_000,
  /** the most execution time between two deadline checks (D2) */
  checkIntervalMs: 50,
  /** how often io.check() reports a 'tick' (proof the checks run) */
  tickMs: 250,
  /** the iframe must say hello within this */
  connectMs: 15_000,
  /** the deepest recursion every runtime must support (WebKit's worker stacks are small: ~450 Java / ~900 C frames) */
  recursionDepth: 200,
} as const

export const CHECK_INTERVAL_MS = LIMITS.checkIntervalMs
export const SELF_STOP_SLACK_MS = LIMITS.selfStopSlackMs
export const HOST_GRACE_MS = LIMITS.hostGraceMs

// --------------------------------------------------------- what the UI uses

export type RunKind = 'run' | 'submit'

/** A board as a run needs it. problem.ts's Board adds id, name, par and slack. */
export type BoardInput = {
  /** rows of '#' wall, '.' floor and exactly one 'o' (the ball, on floor) */
  grid: readonly string[]
  ink: number
}

export type RunRequest = {
  language: RunLanguage
  /** the editor's text, as is (at most LIMITS.sourceChars) */
  source: string
  /** the boards, in order; the runtime's stdin is problem.formatStdin(tests) */
  tests: readonly BoardInput[]
  kind: RunKind
  /** for all boards together, from io.started(); default problem.timeLimitFor(language, kind) */
  timeLimitMs?: number
  /** job to io.started() (compiling, linking, harness setup); default LIMITS.compileMs */
  compileLimitMs?: number
}

/** The statuses a runtime (or the host, for a backstop) may report. */
export const OUTCOME_STATUSES = ['ok', 'compile_error', 'runtime_error', 'time_limit', 'memory_limit', 'output_limit', 'crashed'] as const
export type OutcomeStatus = (typeof OUTCOME_STATUSES)[number]

/**
 * ok              the program finished and the harness printed every answer
 *                 (the answers may still be wrong: the judge decides)
 * compile_error   the source did not compile (or was too long); see diagnostics
 * runtime_error   the program threw, trapped, overflowed its stack or exited; see error
 * time_limit      it ran past timeLimitMs (or compiling took longer than compileMs)
 * memory_limit    it asked for more than LIMITS.memoryBytes, or its sandbox ran out of memory
 * output_limit    it printed more than LIMITS.outputChars characters
 * crashed         it broke the runner or the harness ("destroyed the game"): closed
 *                 its worker, printed the reserved answer marker, ended before
 *                 answering every board, replaced the input or the harness's functions
 * cancelled       the UI called cancel() (not the program's fault)
 * unavailable     the language could not be loaded: network, old browser (not the program's fault)
 */
export type RunStatus = OutcomeStatus | 'cancelled' | 'unavailable'
export const RUN_STATUSES: readonly RunStatus[] = [...OUTCOME_STATUSES, 'cancelled', 'unavailable']

/** The result banner for each status, LeetCode style. */
export const STATUS_TITLES: Record<RunStatus, string> = {
  ok: 'Finished',
  compile_error: 'Compile Error',
  runtime_error: 'Runtime Error',
  time_limit: 'Time Limit Exceeded',
  memory_limit: 'Memory Limit Exceeded',
  output_limit: 'Output Limit Exceeded',
  crashed: 'Bug: Your Code Broke the Game',
  cancelled: 'Stopped',
  unavailable: 'Could Not Load',
}

export type Diagnostic = {
  /** 1-based, in the player's file; null when the problem is outside it (e.g. a changed signature) */
  line: number | null
  /** 1-based; null when unknown */
  column: number | null
  endLine?: number | null
  endColumn?: number | null
  severity: 'error' | 'warning' | 'note'
  message: string
}

export type ErrorInfo = {
  /** the language's own name: 'java.lang.ArrayIndexOutOfBoundsException', 'IndexError', 'Segmentation fault', 'TypeError' */
  type: string
  message: string
  /** 1-based line in the player's file, when known (WebKit often gives only a function name) */
  line: number | null
  column: number | null
  /** 0-based index of the board solve() was working on, when known */
  test: number | null
  /** the player's frames only, as text */
  trace?: string
}

export type SandboxStoppedBy =
  /** the runtime's own deadline / heap / output check stopped it (D3-D6): the good case */
  | 'runtime'
  /** the host had to terminate() the worker (D5, or a cancel): in WebKit wasm may keep burning CPU */
  | 'host'
  /** the whole iframe stopped answering (its process ran out of memory or froze) and was rebuilt */
  | 'sandbox'

export type RunResult = {
  runId: string
  language: RunLanguage
  kind: RunKind
  status: RunStatus
  /** STATUS_TITLES[status] */
  title: string
  /** one line for the UI, e.g. "Line 5: ';' expected", "Your code ran longer than 4 s." */
  message: string
  /** where it stopped: null when status is ok */
  phase: 'load' | 'compile' | 'run' | null
  /** compile errors and warnings, lines in the player's file */
  diagnostics: Diagnostic[]
  /** the runtime error, when there was one */
  error: ErrorInfo | null
  /** what the player printed to stdout, answer lines removed, control characters made visible, at most LIMITS.consoleChars */
  stdout: string
  /** what the program printed to stderr (the player's, plus the runtime's own traceback), at most LIMITS.consoleChars */
  stderr: string
  /** stdout or stderr was cut to LIMITS.consoleChars */
  consoleTruncated: boolean
  /** exactly tests.length entries: answers[i] is board i's moves, '' when none came */
  answers: string[]
  /** how many boards the harness answered (the rest of answers is '' padding) */
  answered: number
  timings: {
    /** run() call to result, including any wait in the queue */
    totalMs: number
    /** waiting for the iframe and the runtime to load (0 when warm) */
    loadMs: number
    /** job posted to io.started() */
    compileMs: number
    /** io.started() to the outcome */
    runMs: number
  }
  /** the limits that applied, for "Time limit: 4 s" */
  limits: { timeLimitMs: number; memoryBytes: number; outputChars: number }
  /** who stopped it, for limits and lost sandboxes; null otherwise */
  stoppedBy: SandboxStoppedBy | null
  /** deadline-check ticks the host saw while it ran (D2 at work; 0 for short runs) */
  ticks: number
  /** the iframe was rebuilt because of this run */
  sandboxRestarted: boolean
}

/** What the UI shows while it waits: CodeSandbox.state and subscribe() (useSyncExternalStore-ready). */
export type SandboxState =
  | { phase: 'idle' }
  /** downloading / starting a runtime; done and total in bytes when known (total 0: unknown) */
  | { phase: 'loading'; language: RunLanguage; label: string; done: number; total: number }
  | { phase: 'compiling'; language: RunLanguage; runId: string; kind: RunKind }
  | { phase: 'running'; language: RunLanguage; runId: string; kind: RunKind; since: number; timeLimitMs: number }
  /** the iframe is being rebuilt; runs wait for it */
  | { phase: 'restarting'; reason: string }

// -------------------------------------------- what a runtime implements

/** The job a runtime receives for one run. */
export type RuntimeJob = {
  runId: string
  /** which language the source is in (clang serves 'c' and 'cpp') */
  language: RunLanguage
  kind: RunKind
  source: string
  /** problem.formatStdin(tests): "T\n" then per board "H W INK\n" and H rows */
  stdin: string
  /** T, the number of boards; the harness prints exactly this many answer lines */
  tests: number
  timeLimitMs: number
  compileLimitMs: number
  memoryLimitBytes: number
  /** characters, stdout + stderr together */
  outputLimit: number
  /** the most characters of one answer the harness prints */
  answerChars: number
  /** the deepest recursion the player may rely on (LIMITS.recursionDepth); give at least this */
  recursionDepth: number
}

/** What a runtime's run() resolves to. Anything not listed is dropped by the host. */
export type RuntimeOutcome = {
  status: OutcomeStatus
  /** optional: replaces the page's generic one-liner (keep it short, plain words, no JS internals) */
  message?: string
  /** compile errors and warnings (also on 'ok', for warnings) */
  diagnostics?: Diagnostic[]
  error?: ErrorInfo | null
  /**
   * false: throw this worker away and start a fresh one before the next run.
   * Default: true for ok / compile_error / runtime_error, false otherwise.
   */
  healthy?: boolean
}

export type LimitKind = 'time_limit' | 'memory_limit' | 'output_limit'

/** Thrown by io.check() / io.stdout(); run() may let it escape (D4). `limit` says which. */
export interface LimitErrorLike extends Error {
  readonly limit: LimitKind
}

/** A worker the host started for a runtime (D8). Talk to it over `port`. */
export interface SpawnedWorker {
  /** a MessagePort whose other end is the child's (see CHILD_HELLO) */
  readonly port: MessagePort
  /** the host terminates the child (also done automatically with the parent) */
  terminate(): void
  /** set to hear about an uncaught error in the child */
  onerror: ((message: string) => void) | null
}

/** Given to load(). Lives as long as the worker. */
export interface RuntimeHost {
  readonly runtime: RuntimeId
  readonly protocol: number
  /** the code base URL as the page sees it (for messages only: do not fetch it) */
  readonly base: string
  /** loading progress for the UI: "Downloading the compiler", 3.1e6 of 6e6 bytes */
  progress(label: string, done?: number, total?: number): void
  /** a self-hosted file, by path relative to the code base, e.g. 'java/compiler.wasm.gz' */
  asset(path: string): Promise<ArrayBuffer>
  assetText(path: string): Promise<string>
  /** a blob: URL holding that file, for loaders that want a URL (fetch(), WebAssembly.instantiateStreaming) */
  assetUrl(path: string, type?: string): Promise<string>
  /** a self-hosted ES module (one file, absolute imports only), imported from a blob: URL */
  importModule(path: string): Promise<Record<string, unknown>>
  /** a child (classic) worker made by the host from a self-hosted script, e.g. 'java/exec-child.js' (D8) */
  spawn(path: string): Promise<SpawnedWorker>
  /** removes network, storage, worker and messaging globals; call before any player code */
  lockdown(): void
  /** the prelude's clock: performance.now() as captured before any player code */
  now(): number
  readonly LimitError: new (limit: LimitKind, message?: string) => LimitErrorLike
  /** to the iframe's console when the CodeSandbox was made with { debug: true }; dropped otherwise */
  log(...args: unknown[]): void
}

/** Given to run(), one per run. */
export interface RunIO {
  readonly job: RuntimeJob
  /** appends the program's output; throws LimitError('output_limit') past job.outputLimit (D6) */
  stdout(text: string): void
  stderr(text: string): void
  /** compiling is done: the time limit starts now (D1) */
  started(): void
  /** the cooperative deadline check (D2, D3): cheap; throws LimitError past the deadline or once any limit was hit */
  check(): void
  /** the prelude's clock (D1) */
  now(): number
  /** io.now() moment of the current deadline (the compile deadline before started()) */
  readonly deadline: number
  /** the same moment as performance.timeOrigin + performance.now(), for children (D8) */
  readonly deadlineEpochMs: number
  /** ms to the current deadline (negative past it) */
  timeLeft(): number
  /** records a limit (e.g. the heap cap refused memory); sticky: check() throws from now on */
  hit(limit: LimitKind, message?: string): void
  /** the first limit hit in this run, or null */
  readonly limit: LimitKind | null
  readonly LimitError: new (limit: LimitKind, message?: string) => LimitErrorLike
}

/** The default export of <runtime id>/runtime.js. */
export interface Runtime {
  /** must equal the runtime id it is loaded as */
  id: RuntimeId
  version: string
  /**
   * Fetch and compile the toolchain; report progress; call host.lockdown()
   * once the network is no longer needed (or before the first run). Resolves
   * extra info for the UI's "about this language" line (versions...).
   */
  load(host: RuntimeHost): Promise<Record<string, unknown> | void>
  /** optional: compile and run a throwaway program so the first real run is fast; failures are ignored */
  warm?(): Promise<void>
  /** one run; never called twice at once; must honour the cooperative deadline */
  run(job: RuntimeJob, io: RunIO): Promise<RuntimeOutcome>
  /** stop children, free memory; the worker is terminated right after */
  dispose?(): void | Promise<void>
  /** optional: memory in use now, a hint for the page's keep-or-drop policy */
  footprint?(): { memoryBytes?: number }
}

// ------------------------------------------------- the message protocol

/**
 * Page <-> host. The iframe posts { type: HELLO, protocol } to its parent;
 * the page checks event.source and answers with { type: CONNECT, protocol,
 * base } carrying a MessagePort. Everything after that goes over the port.
 * Children from host.spawn() get one message, { type: CHILD_HELLO, protocol }
 * with event.ports[0], the port to their parent; everything else goes over it.
 */
export const HELLO = 'ink-sandbox-hello'
export const CONNECT = 'ink-sandbox-connect'
export const CHILD_HELLO = 'ink-sandbox-child'

export type PageToHost =
  | { type: 'load'; runtime: RuntimeId; script: string; loadLimitMs: number }
  | { type: 'unload'; runtime: RuntimeId }
  | { type: 'run'; runtime: RuntimeId; job: RuntimeJob }
  | { type: 'cancel'; runId: string }
  | { type: 'asset'; id: number; ok: true; data: ArrayBuffer }
  | { type: 'asset'; id: number; ok: false; error: string }
  /** terminate every worker now (the page is about to remove the iframe) */
  | { type: 'shutdown' }

export type RuntimeStatus = 'loading' | 'ready' | 'failed' | 'gone'

/** The host's own outcome for a run: a runtime's, or one the host made up (backstop, cancel, crash). */
export type HostOutcome = Omit<RuntimeOutcome, 'status'> & { status: OutcomeStatus | 'cancelled' }

export type HostToPage =
  | { type: 'beat'; at: number; busy: RuntimeId[] }
  | { type: 'runtime'; runtime: RuntimeId; status: RuntimeStatus; message?: string; info?: Record<string, unknown>; ms?: number }
  | { type: 'progress'; runtime: RuntimeId; label: string; done: number; total: number }
  | { type: 'phase'; runId: string; phase: 'compiling' | 'running' }
  | { type: 'output'; runId: string; stream: 'stdout' | 'stderr'; text: string }
  /**
   * compileMs / runMs: the host's clock, job to io.started() and io.started() to the outcome.
   * memoryBytes: the runtime's footprint() after the run, when it has one.
   */
  | { type: 'done'; runId: string; outcome: HostOutcome; stoppedBy: SandboxStoppedBy | null; compileMs: number; runMs: number; ticks: number; outputChars: number; memoryBytes?: number }
  | { type: 'rejected'; runId: string; reason: 'not_ready' | 'busy' | 'unknown_runtime' | 'bad_job' }
  | { type: 'asset'; id: number; path: string }

/**
 * Host <-> worker (the prelude speaks this; runtimes never see it).
 *  host -> worker  { type: 'init', runtime, script, protocol, base, debug }
 *                  { type: 'run', job }
 *                  { type: 'asset', id, ok, data | error }
 *                  { type: 'spawned', id, ok, error? }        (+ the port, transferred)
 *                  { type: 'child-error', id, message }
 *                  { type: 'dispose' }
 *  worker -> host  see WorkerToHost
 */
export type WorkerToHost =
  | { type: 'ready'; info: Record<string, unknown>; ms: number }
  | { type: 'fatal'; message: string }
  | { type: 'progress'; label: string; done: number; total: number }
  | { type: 'asset'; id: number; path: string }
  | { type: 'spawn'; id: number; path: string }
  | { type: 'kill'; id: number }
  | { type: 'phase'; runId: string; phase: 'running' }
  /** batched: at most every 50 ms or 16 KiB, and on every check() that finds text waiting */
  | { type: 'output'; runId: string; stream: 'stdout' | 'stderr'; text: string }
  /** from io.check(), at most every LIMITS.tickMs */
  | { type: 'tick'; runId: string }
  /** footprint: runtime.footprint() right after the run, when the runtime has one */
  | { type: 'done'; runId: string; outcome: RuntimeOutcome; footprint?: { memoryBytes?: number } }
  /** close() was called (after lockdown) */
  | { type: 'closed' }

/** A self-hosted path the page will serve to the sandbox: relative, no '..', plain characters. */
export function isAssetPath(path: unknown): path is string {
  return typeof path === 'string' && path.length > 0 && path.length <= 200 &&
    /^[A-Za-z0-9_][A-Za-z0-9_.\-/]*$/.test(path) && !path.split('/').some((part) => part === '..' || part === '.' || part === '')
}
