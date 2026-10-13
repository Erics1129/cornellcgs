/**
 * Ink Maze level 26: the page side of the code sandbox.
 *
 * One hidden <iframe sandbox="allow-scripts"> holds the sandbox host
 * (public/minigames/ink-maze-code/sandbox.html + sandbox.js). CodeSandbox owns
 * that iframe, speaks the contract's protocol over a MessagePort, serves the
 * self-hosted runtime files the sandbox asks for, formats stdin and parses
 * stdout with problem.ts, and hands the UI a finished RunResult.
 *
 *   const sandbox = new CodeSandbox()
 *   const stop = sandbox.subscribe(() => render(sandbox.state))  // idle | loading | compiling | running | restarting
 *   sandbox.load('java')                     // when the coding level opens / the language changes
 *   const result = await sandbox.run({ language: 'java', source, tests, kind: 'run' })
 *   const judgement = judgeRun(tests, result) // problem.ts: null unless result.status is 'ok'
 *   sandbox.cancel()                         // stop the current run (it resolves as 'cancelled')
 *   sandbox.runtimeInfo('java')              // status, load info, memory, download size
 *   sandbox.dispose()                        // leaving the level: tear the iframe down
 *
 * Guarantees for the UI
 *  - run() never rejects because of the player's code: every outcome, including
 *    a dead sandbox, is a RunResult. It rejects only for a bad request (boards
 *    that formatStdin refuses), which is the UI's bug.
 *  - Runs go one at a time, in call order; later calls wait in a queue.
 *    cancel() stops only the current run (or the one loading); queued runs
 *    still run.
 *  - result.answers has exactly tests.length entries.
 *  - Toolchains load only when load() or run() asks for that language. At most
 *    one heavy runtime (RUNTIME_INFO.heavy) stays loaded: loading another
 *    unloads it (a run in flight on it resolves 'cancelled').
 *  - When the iframe stops sending heartbeats (its process ran out of memory
 *    or froze), or the host had to terminate a runaway (stoppedBy 'host'), the
 *    whole iframe is rebuilt before the next run (state 'restarting').
 *  - state is a new object on every change; subscribe() fits
 *    React's useSyncExternalStore(sandbox.subscribe, () => sandbox.state).
 */
import {
  CODE_BASE_PATH, CODE_PROTOCOL, CONNECT, HELLO, LANGUAGE_INFO, LIMITS, RUNTIME_INFO, STATUS_TITLES, isAssetPath, isRunLanguage, runtimeFor,
} from './contract.ts'
import type {
  Diagnostic, ErrorInfo, HostOutcome, HostToPage, PageToHost, RunKind, RunLanguage, RunRequest, RunResult, RunStatus, RuntimeId,
  RuntimeJob, SandboxState, SandboxStoppedBy,
} from './contract.ts'
import { formatStdin, parseStdout, timeLimitFor } from './problem.ts'

type RuntimeSlot = {
  status: 'loading' | 'ready' | 'failed'
  info: Record<string, unknown>
  error: string
  /** the runtime's own footprint() after its last run, when it has one */
  memoryBytes: number | null
  waiters: Array<{ resolve: () => void; reject: (error: Error) => void }>
}

/** What the page knows about a language's runtime (CodeSandbox.runtimeInfo). */
export type RuntimeReport = {
  status: 'idle' | 'loading' | 'ready' | 'failed'
  /** what load() resolved with (versions...), {} until ready */
  info: Record<string, unknown>
  /** why it failed to load, '' otherwise */
  error: string
  /** memory in use after the last run (Runtime.footprint), else RUNTIME_INFO's estimate */
  memoryBytes: number
  /** about how much a first load downloads (RUNTIME_INFO) */
  downloadBytes: number
}

type Pending = {
  request: RunRequest
  runId: string
  runtime: RuntimeId
  timeLimitMs: number
  compileLimitMs: number
  resolve: (result: RunResult) => void
  stdout: string[]
  stdoutChars: number
  stderr: string[]
  stderrChars: number
  /** run() was called */
  t0: number
  loadMs: number
  /** the job was posted to the host */
  tPosted: number
  tCompile: number | null
  tRun: number | null
  phase: 'queued' | 'compiling' | 'running'
  settled: boolean
}

type Link = {
  iframe: HTMLIFrameElement
  port: MessagePort | null
  ready: Promise<void>
  generation: number
}

export type CodeSandboxOptions = {
  /** the site's base URL (default import.meta.env.BASE_URL, then '/') */
  base?: string
  /** where the hidden iframe goes (default document.body) */
  container?: HTMLElement
  /** log the runtimes' host.log() lines to the iframe's console */
  debug?: boolean
}

const now = () => performance.now()
const seconds = (ms: number) => `${Math.round(ms / 100) / 10} s`
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** What a browser needs for any runtime; the runtimes check their own extras (WasmGC, exceptions). */
export function sandboxSupport(): { ok: boolean; missing: string[] } {
  const missing: string[] = []
  if (typeof WebAssembly !== 'object') missing.push('WebAssembly')
  if (typeof Worker !== 'function') missing.push('Web Workers')
  if (typeof MessageChannel !== 'function') missing.push('MessageChannel')
  if (typeof Blob !== 'function' || typeof URL?.createObjectURL !== 'function') missing.push('Blob URLs')
  return { ok: !missing.length, missing }
}

function firstError(diagnostics: Diagnostic[]): Diagnostic | undefined {
  return diagnostics.find((d) => d.severity === 'error') ?? diagnostics[0]
}

function defaultMessage(language: RunLanguage, status: RunStatus, diagnostics: Diagnostic[], error: ErrorInfo | null, timeLimitMs: number): string {
  switch (status) {
    case 'ok': return 'Your code ran on every board.'
    case 'compile_error': {
      const first = firstError(diagnostics)
      if (!first) return 'Your code did not compile.'
      return first.line ? `Line ${first.line}: ${first.message}` : first.message
    }
    case 'runtime_error': {
      if (!error) return 'Your code stopped with an error.'
      const where = [error.line ? `line ${error.line}` : '', error.test !== null ? `board ${error.test + 1}` : ''].filter(Boolean).join(', ')
      return `${error.type}${error.message ? `: ${error.message}` : ''}${where ? ` (${where})` : ''}`
    }
    case 'time_limit': return `Your code ran longer than ${seconds(timeLimitMs)}.`
    case 'memory_limit': return `Your code used more than ${LIMITS.memoryBytes >> 20} MiB of memory.`
    case 'output_limit': return `Your code printed more than ${LIMITS.outputChars.toLocaleString('en-US')} characters.`
    case 'crashed': return "Your code broke the game's runner."
    case 'cancelled': return 'Stopped.'
    case 'unavailable': return `${LANGUAGE_INFO[language].label} could not be loaded.`
  }
}

export class CodeSandbox {
  /** the absolute URL of public/minigames/ink-maze-code/ */
  readonly base: string
  private readonly container: HTMLElement | null
  private readonly debug: boolean

  private link: Link | null = null
  private generation = 0
  private runtimes = new Map<RuntimeId, RuntimeSlot>()
  private current: Pending | null = null
  private queue: Promise<unknown> = Promise.resolve()
  private disposed = false
  private restarting: Promise<void> | null = null
  private runSeq = 0

  private lastBeat = 0
  private lastWatch = 0
  private watchdog: ReturnType<typeof setInterval> | null = null

  private _state: SandboxState = { phase: 'idle' }
  private listeners = new Set<() => void>()

  constructor(options: CodeSandboxOptions = {}) {
    // written out in full so Vite replaces it in a build (sandbox.ts is browser-only; Node never imports it)
    const baseUrl = options.base ?? import.meta.env.BASE_URL ?? '/'
    this.base = new URL(CODE_BASE_PATH, new URL(baseUrl, typeof location !== 'undefined' ? location.href : 'http://localhost/')).href
    this.container = options.container ?? null
    this.debug = !!options.debug
  }

  // ------------------------------------------------------------- observable

  /** The current state; a new object on every change (useSyncExternalStore-ready). */
  get state(): SandboxState { return this._state }

  /** Calls `listener` on every state change; returns the unsubscribe. Bound, so it can be passed around as is. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Where a language's runtime stands: not asked for yet, loading, ready or failed. */
  runtimeStatus(language: RunLanguage): 'idle' | RuntimeSlot['status'] {
    return this.runtimes.get(runtimeFor(language))?.status ?? 'idle'
  }

  /** Status, load info and footprint of a language's runtime, for an "about this language" line. */
  runtimeInfo(language: RunLanguage): RuntimeReport {
    const runtime = runtimeFor(language)
    const slot = this.runtimes.get(runtime)
    return {
      status: slot?.status ?? 'idle',
      info: slot?.info ?? {},
      error: slot?.error ?? '',
      memoryBytes: slot?.memoryBytes ?? RUNTIME_INFO[runtime].memoryBytes,
      downloadBytes: RUNTIME_INFO[runtime].downloadBytes,
    }
  }

  private setState(state: SandboxState) {
    this._state = state
    for (const listener of [...this.listeners]) {
      try { listener() } catch (error) { console.error(error) }
    }
  }

  // ------------------------------------------------------------- the iframe

  /** Makes the iframe and connects to it, once; later calls share the same promise. */
  private connect(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('the code sandbox was disposed'))
    if (this.link) return this.link.ready
    if (typeof document === 'undefined') return Promise.reject(new Error('the code sandbox needs a browser'))
    const generation = ++this.generation
    const iframe = document.createElement('iframe')
    iframe.setAttribute('sandbox', 'allow-scripts')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.setAttribute('referrerpolicy', 'no-referrer')
    iframe.tabIndex = -1
    iframe.title = 'Ink Maze code sandbox'
    // inside the viewport (1 px, transparent): browsers throttle the timers of off-screen cross-origin frames
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none'
    iframe.src = `${this.base}sandbox.html?v=${CODE_PROTOCOL}${this.debug ? '#inkdebug' : ''}`
    const link: Link = { iframe, port: null, generation, ready: Promise.resolve() }
    link.ready = new Promise<void>((resolve, reject) => {
      const channel = new MessageChannel()
      let done = false
      const finish = (error?: Error) => {
        if (done) return
        done = true
        clearTimeout(timer)
        window.removeEventListener('message', onHello)
        if (error) reject(error)
        else resolve()
      }
      const timer = setTimeout(() => finish(new Error('the code sandbox did not start')), LIMITS.connectMs)
      const onHello = (event: MessageEvent) => {
        if (event.source !== iframe.contentWindow || this.link !== link) return
        const data = event.data as { type?: unknown; protocol?: unknown } | null
        if (!data || data.type !== HELLO) return
        if (data.protocol !== CODE_PROTOCOL) { finish(new Error(`the sandbox speaks protocol ${String(data.protocol)}, not ${CODE_PROTOCOL} (reload the page)`)); return }
        link.port = channel.port1
        link.port.onmessage = (e) => {
          if (this.link !== link) return
          if (!done && (e.data as { type?: string })?.type === 'beat') finish()
          this.onHostMessage(e.data as HostToPage)
        }
        iframe.contentWindow?.postMessage({ type: CONNECT, protocol: CODE_PROTOCOL, base: this.base }, '*', [channel.port2])
      }
      window.addEventListener('message', onHello)
    })
    this.link = link
    this.lastBeat = now()
    this.startWatchdog()
    ;(this.container ?? document.body).append(iframe)
    link.ready.catch(() => { if (this.link === link) this.teardown() })
    return link.ready
  }

  private teardown() {
    const link = this.link
    this.link = null
    if (link) {
      try { link.port?.postMessage({ type: 'shutdown' } satisfies PageToHost) } catch { /* gone */ }
      try { link.port?.close() } catch { /* gone */ }
      link.iframe.remove()
    }
    for (const slot of this.runtimes.values()) for (const waiter of slot.waiters) waiter.reject(new Error('the code sandbox restarted'))
    this.runtimes.clear()
    if (this.watchdog) { clearInterval(this.watchdog); this.watchdog = null }
  }

  /** Rebuilds the whole iframe (a runtime is stuck, or the sandbox stopped answering). Runs wait for it. */
  restart(reason: string): Promise<void> {
    if (this.restarting) return this.restarting
    this.setState({ phase: 'restarting', reason })
    this.teardown()
    this.restarting = (this.disposed ? Promise.resolve() : this.connect())
      .catch(() => { /* the next run reports it */ })
      .finally(() => {
        this.restarting = null
        if (!this.current && this._state.phase === 'restarting') this.setState({ phase: 'idle' })
      })
    return this.restarting
  }

  /**
   * The heartbeat watchdog. A gap in its own ticks means the page itself was
   * throttled or asleep (a background tab), and then a missing beat proves
   * nothing, so the clock restarts instead.
   */
  private startWatchdog() {
    if (this.watchdog) return
    this.lastWatch = now()
    this.watchdog = setInterval(() => {
      const t = now()
      if (t - this.lastWatch > 1500) this.lastBeat = t
      this.lastWatch = t
      const loading = [...this.runtimes.values()].some((slot) => slot.status === 'loading')
      if (!this.link || (!this.current && !loading)) return
      if (t - this.lastBeat > LIMITS.heartbeatTimeoutMs) { this.onSandboxLost('the sandbox stopped answering'); return }
      const pending = this.current
      if (pending && pending.tCompile !== null) {
        // the host's own budgets end every run; this only catches a host that beats but never answers.
        // (Before 'compiling' the host may be restarting the runtime; its load timer covers that.)
        const budget = pending.compileLimitMs + pending.timeLimitMs + 2 * LIMITS.hostGraceMs + 5000
        if (t - pending.tCompile > budget) this.onSandboxLost('the sandbox did not finish the run')
      }
    }, 500)
  }

  private onSandboxLost(reason: string) {
    const pending = this.current
    if (pending && !pending.settled) {
      const label = LANGUAGE_INFO[pending.request.language]?.label ?? 'the language'
      if (pending.phase === 'running') {
        this.finish(pending, {
          status: 'memory_limit',
          message: 'The sandbox stopped answering while your code ran, most likely because it used too much memory.',
          healthy: false,
        }, 'sandbox', true)
      } else if (pending.tCompile !== null) {
        this.finish(pending, { status: 'crashed', message: 'The sandbox stopped answering while it compiled your code.', healthy: false }, 'sandbox', true)
      } else {
        this.finish(pending, { status: 'crashed' }, 'sandbox', true, { status: 'unavailable', message: `The sandbox stopped answering while ${label} was loading.` })
      }
    }
    void this.restart(reason)
  }

  /** Tears everything down. Pending and later runs resolve as 'cancelled'. */
  dispose() {
    if (this.disposed) return
    this.disposed = true
    const pending = this.current
    if (pending && !pending.settled) this.finish(pending, { status: 'cancelled', message: 'Stopped.' }, null, false)
    this.teardown()
    this.setState({ phase: 'idle' })
    this.listeners.clear()
  }

  // ------------------------------------------------------------- runtimes

  /**
   * Starts loading a language's toolchain (lazily: nothing is fetched before
   * this or run() asks). Resolves when it is ready; rejects when it cannot load.
   */
  async load(language: RunLanguage): Promise<void> {
    if (!isRunLanguage(language)) throw new Error(`unknown language ${String(language)}`)
    if (this.restarting) await this.restarting
    await this.connect()
    const runtime = runtimeFor(language)
    let slot = this.runtimes.get(runtime)
    if (slot?.status === 'ready') return
    if (!slot || slot.status === 'failed') {
      if (RUNTIME_INFO[runtime].heavy) {
        for (const [other, otherSlot] of this.runtimes) {
          if (other !== runtime && RUNTIME_INFO[other].heavy) {
            for (const waiter of otherSlot.waiters) waiter.reject(new Error('another language was loaded instead'))
            this.runtimes.delete(other)
            this.post({ type: 'unload', runtime: other })
          }
        }
      }
      slot = { status: 'loading', info: {}, error: '', memoryBytes: null, waiters: [] }
      this.runtimes.set(runtime, slot)
      this.post({ type: 'load', runtime, script: RUNTIME_INFO[runtime].script, loadLimitMs: LIMITS.loadMs })
    }
    if (!this.current || this.current.phase === 'queued') {
      this.setState({ phase: 'loading', language, label: `Loading ${LANGUAGE_INFO[language].label}`, done: 0, total: RUNTIME_INFO[runtime].downloadBytes })
    }
    const waiting = slot
    try {
      await new Promise<void>((resolve, reject) => waiting.waiters.push({ resolve, reject }))
    } finally {
      if (!this.current && this._state.phase === 'loading') this.setState({ phase: 'idle' })
    }
  }

  // ------------------------------------------------------------- running

  /** Runs one program (queued behind any run in flight). See the guarantees at the top. */
  run(request: RunRequest): Promise<RunResult> {
    // a malformed request is the UI's bug: refuse it at once, before queueing
    let stdin: string
    try {
      stdin = formatStdin(request.tests)
      if (typeof request.source !== 'string') throw new TypeError('run(): source must be a string')
      if (request.kind !== 'run' && request.kind !== 'submit') throw new TypeError(`run(): kind must be 'run' or 'submit', not ${String(request.kind)}`)
      for (const key of ['timeLimitMs', 'compileLimitMs'] as const) {
        const value = request[key]
        if (value !== undefined && !(Number.isInteger(value) && value >= 1 && value <= 600_000)) throw new RangeError(`run(): ${key} must be 1-600000 ms, not ${value}`)
      }
    } catch (error) {
      return Promise.reject(error)
    }
    const t0 = now()
    const next = this.queue.then(() => this.runNow(request, stdin, t0))
    this.queue = next.catch(() => undefined)
    return next
  }

  /** Stops the current run; it resolves with status 'cancelled'. Queued runs still run. */
  cancel() {
    const pending = this.current
    if (!pending || pending.settled) return
    if (pending.phase === 'queued') {
      this.finish(pending, { status: 'cancelled', message: 'Stopped.' }, null, false)
      return
    }
    this.post({ type: 'cancel', runId: pending.runId })
    // the host answers with a 'done' (cancelled) once it has terminated the worker
  }

  private async runNow(request: RunRequest, stdin: string, t0: number): Promise<RunResult> {
    const language = request.language
    if (!isRunLanguage(language)) return this.immediate(request, 'unavailable', `There is no runtime for ${String(language)}.`, t0, request.timeLimitMs ?? 0)
    const timeLimitMs = request.timeLimitMs ?? timeLimitFor(language, request.kind)
    const compileLimitMs = request.compileLimitMs ?? LIMITS.compileMs
    if (this.disposed) return this.immediate(request, 'cancelled', 'Stopped.', t0, timeLimitMs)
    if (request.source.length > LIMITS.sourceChars) {
      return this.immediate(request, 'compile_error', `Your code is longer than ${LIMITS.sourceChars.toLocaleString('en-US')} characters.`, t0, timeLimitMs)
    }
    const runtime = runtimeFor(language)
    const runId = `run-${++this.runSeq}-${Math.random().toString(36).slice(2, 8)}`
    const pending: Pending = {
      request, runId, runtime, timeLimitMs, compileLimitMs, resolve: () => {}, stdout: [], stdoutChars: 0, stderr: [], stderrChars: 0,
      t0, loadMs: 0, tPosted: 0, tCompile: null, tRun: null, phase: 'queued', settled: false,
    }
    const result = new Promise<RunResult>((resolve) => { pending.resolve = resolve })
    this.current = pending
    const tLoad = now()
    try {
      await this.load(language)
    } catch (error) {
      if (!pending.settled) this.finish(pending, { status: 'crashed', message: '' }, null, false, { status: 'unavailable', message: `${LANGUAGE_INFO[language].label} could not be loaded: ${(error as Error).message}` })
      return result
    }
    if (pending.settled) return result // cancelled or disposed while loading
    pending.loadMs = now() - tLoad
    const job: RuntimeJob = {
      runId, language, kind: request.kind, source: request.source, stdin, tests: request.tests.length,
      timeLimitMs, compileLimitMs, memoryLimitBytes: LIMITS.memoryBytes, outputLimit: LIMITS.outputChars,
      answerChars: LIMITS.answerChars, recursionDepth: LIMITS.recursionDepth,
    }
    pending.tPosted = now()
    pending.phase = 'compiling'
    this.setState({ phase: 'compiling', language, runId, kind: request.kind })
    this.post({ type: 'run', runtime, job })
    return result
  }

  private immediate(request: RunRequest, status: RunStatus, message: string, t0: number, timeLimitMs: number): RunResult {
    return {
      runId: `run-${++this.runSeq}-immediate`, language: request.language, kind: request.kind, status, title: STATUS_TITLES[status],
      message, phase: status === 'compile_error' ? 'compile' : status === 'unavailable' ? 'load' : null,
      diagnostics: status === 'compile_error' ? [{ line: null, column: null, severity: 'error', message }] : [],
      error: null, stdout: '', stderr: '', consoleTruncated: false,
      answers: request.tests.map(() => ''), answered: 0,
      timings: { totalMs: Math.round(now() - t0), loadMs: 0, compileMs: 0, runMs: 0 },
      limits: { timeLimitMs, memoryBytes: LIMITS.memoryBytes, outputChars: LIMITS.outputChars },
      stoppedBy: null, ticks: 0, sandboxRestarted: false,
    }
  }

  // ------------------------------------------------------------- messages

  private post(message: PageToHost, transfer: Transferable[] = []) {
    try { this.link?.port?.postMessage(message, transfer) } catch { /* the watchdog notices a dead link */ }
  }

  private onHostMessage(message: HostToPage) {
    if (!message || typeof message !== 'object') return
    switch (message.type) {
      case 'beat':
        this.lastBeat = now()
        break
      case 'runtime':
        this.onRuntime(message)
        break
      case 'progress': {
        const state = this._state
        if (state.phase === 'loading' && runtimeFor(state.language) === message.runtime) {
          this.setState({ ...state, label: message.label || state.label, done: message.done, total: message.total || state.total })
        }
        break
      }
      case 'phase': {
        const pending = this.current
        if (!pending || pending.runId !== message.runId || pending.settled) return
        const { language, kind } = pending.request
        if (message.phase === 'compiling') {
          pending.tCompile = now()
          this.setState({ phase: 'compiling', language, runId: pending.runId, kind })
        } else {
          pending.tRun = now()
          pending.phase = 'running'
          this.setState({ phase: 'running', language, runId: pending.runId, kind, since: Date.now(), timeLimitMs: pending.timeLimitMs })
        }
        break
      }
      case 'output': {
        const pending = this.current
        if (!pending || pending.runId !== message.runId || typeof message.text !== 'string') return
        if (message.stream === 'stdout') {
          if (pending.stdoutChars < LIMITS.outputChars) { pending.stdout.push(message.text); pending.stdoutChars += message.text.length }
        } else if (pending.stderrChars <= LIMITS.consoleChars) {
          pending.stderr.push(message.text)
          pending.stderrChars += message.text.length
        }
        break
      }
      case 'done': {
        const pending = this.current
        if (!pending || pending.runId !== message.runId) return
        const slot = this.runtimes.get(pending.runtime)
        if (slot && typeof message.memoryBytes === 'number' && message.memoryBytes >= 0) slot.memoryBytes = message.memoryBytes
        this.finish(pending, message.outcome, message.stoppedBy, false, undefined, message)
        if (message.stoppedBy === 'host' && message.outcome.status !== 'cancelled') void this.restart('a runaway program had to be terminated')
        break
      }
      case 'rejected': {
        const pending = this.current
        if (!pending || pending.runId !== message.runId) return
        if (message.reason === 'not_ready') this.finish(pending, { status: 'crashed' }, null, false, { status: 'unavailable', message: `${LANGUAGE_INFO[pending.request.language].label} could not be loaded.` })
        else this.finish(pending, { status: 'crashed', message: `The sandbox refused the run (${message.reason}).`, healthy: false }, null, false)
        break
      }
      case 'asset':
        void this.serveAsset(message.id, message.path)
        break
    }
  }

  private onRuntime(message: Extract<HostToPage, { type: 'runtime' }>) {
    const slot = this.runtimes.get(message.runtime)
    if (!slot) return
    if (message.status === 'loading') {
      slot.status = 'loading'
      const pending = this.current
      if (pending && pending.runtime === message.runtime && pending.phase === 'compiling' && pending.tCompile === null) {
        this.setState({ phase: 'loading', language: pending.request.language, label: `Starting ${LANGUAGE_INFO[pending.request.language].label}`, done: 0, total: 0 })
      }
    } else if (message.status === 'ready') {
      slot.status = 'ready'
      slot.info = message.info ?? {}
      for (const waiter of slot.waiters.splice(0)) waiter.resolve()
    } else if (message.status === 'failed') {
      slot.status = 'failed'
      slot.error = message.message ?? 'it failed to load'
      for (const waiter of slot.waiters.splice(0)) waiter.reject(new Error(slot.error))
    }
    // 'gone' confirms an unload the page asked for; the page already dropped that slot, and the slot it
    // has now (if any) is a newer load of the same runtime, so the message must not touch it
  }

  private finish(
    pending: Pending,
    outcome: HostOutcome,
    stoppedBy: SandboxStoppedBy | null,
    sandboxRestarted: boolean,
    override?: { status: RunStatus; message: string },
    done?: Extract<HostToPage, { type: 'done' }>,
  ) {
    if (pending.settled) return
    pending.settled = true
    if (this.current === pending) this.current = null
    const result = this.buildResult(pending, outcome, stoppedBy, sandboxRestarted, override, done)
    if (!this.restarting && !this.disposed) this.setState({ phase: 'idle' })
    pending.resolve(result)
  }

  private buildResult(
    pending: Pending,
    outcome: HostOutcome,
    stoppedBy: SandboxStoppedBy | null,
    sandboxRestarted: boolean,
    override: { status: RunStatus; message: string } | undefined,
    done: Extract<HostToPage, { type: 'done' }> | undefined,
  ): RunResult {
    const { request } = pending
    const T = request.tests.length
    const parsed = parseStdout(pending.stdout.join(''), T)
    const diagnostics = outcome.diagnostics ?? []
    const error = outcome.error ?? null
    let status: RunStatus = override?.status ?? outcome.status
    let message = override?.message || outcome.message || ''
    // an 'ok' run must answer every board exactly once (problem.ts H3-H5)
    if (status === 'ok') {
      if (parsed.found > T) {
        status = 'crashed'
        message = `Your code printed the answer marker (@@ANSWER@@) itself: ${parsed.found} answers for ${plural(T, 'board')}. Print anything else, but not that.`
      } else if (parsed.answered < T) {
        status = 'crashed'
        message = `Your code stopped after ${parsed.answered} of ${plural(T, 'board')} without an error. Let solve() return on every board (do not exit).`
      }
    }
    if (!message) message = defaultMessage(request.language, status, diagnostics, error, pending.timeLimitMs)
    const stderrRaw = pending.stderr.join('')
    const stderr = stderrRaw.length > LIMITS.consoleChars ? stderrRaw.slice(0, LIMITS.consoleChars) : stderrRaw
    const t = now()
    const phase: RunResult['phase'] = status === 'ok' ? null
      : status === 'unavailable' ? 'load'
        : status === 'compile_error' || pending.tRun === null ? (pending.tPosted ? 'compile' : 'load')
          : 'run'
    const isLimit = status === 'time_limit' || status === 'memory_limit' || status === 'output_limit'
    return {
      runId: pending.runId,
      language: request.language,
      kind: request.kind,
      status,
      title: STATUS_TITLES[status],
      message,
      phase,
      diagnostics,
      error,
      stdout: parsed.console,
      stderr,
      consoleTruncated: parsed.consoleTruncated || stderrRaw.length > LIMITS.consoleChars,
      answers: parsed.answers,
      answered: parsed.answered,
      timings: {
        totalMs: Math.round(t - pending.t0),
        loadMs: Math.round(pending.loadMs),
        compileMs: done ? done.compileMs : pending.tRun !== null && pending.tPosted ? Math.round(pending.tRun - pending.tPosted) : 0,
        runMs: done ? done.runMs : pending.tRun !== null ? Math.round(t - pending.tRun) : 0,
      },
      limits: { timeLimitMs: pending.timeLimitMs, memoryBytes: LIMITS.memoryBytes, outputChars: LIMITS.outputChars },
      stoppedBy: isLimit || status === 'cancelled' || stoppedBy === 'sandbox' ? stoppedBy : null,
      ticks: done?.ticks ?? 0,
      sandboxRestarted: sandboxRestarted || (stoppedBy === 'host' && status !== 'cancelled'),
    }
  }

  // ------------------------------------------------------------- assets

  /**
   * The sandbox asks for a self-hosted file by path (a runtime module, a wasm
   * file...). The page fetches it from the site (same origin, so the HTTP
   * cache works) and posts the bytes back. Only clean relative paths under the
   * code base are served.
   */
  private async serveAsset(id: number, path: string) {
    if (!Number.isInteger(id)) return
    if (!isAssetPath(path)) { this.post({ type: 'asset', id, ok: false, error: `refused path '${String(path).slice(0, 80)}'` }); return }
    try {
      const url = new URL(path, this.base)
      if (!url.href.startsWith(this.base)) throw new Error('outside the code base')
      const response = await fetch(url.href, { credentials: 'omit' })
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${path}`)
      const data = await response.arrayBuffer()
      this.post({ type: 'asset', id, ok: true, data }, [data])
    } catch (error) {
      this.post({ type: 'asset', id, ok: false, error: (error as Error).message })
    }
  }
}

/** For tests and the UI's language picker. */
export const RUN_KINDS: readonly RunKind[] = ['run', 'submit']
