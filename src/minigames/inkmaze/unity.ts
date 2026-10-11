/**
 * Ink Maze: the 3D board, a Unity WebGL build (project ~/UnityProjects/InkMaze).
 *
 * UnityInkMaze is a board view like the canvas renderer (see view.ts). The
 * page still decides every move with engine.ts; this class only passes the
 * result to Unity ('Show', 'Animate', 'Finish', 'Bump', 'SetReducedMotion')
 * and listens for what Unity reports back on the window ('inkmaze:unity'
 * events: ready, cell, impact, roll, settled, error). docs/INK-MAZE-UNITY.md
 * is the contract between the two.
 *
 * It never leaves the page waiting: every `done` runs exactly once, on
 * Unity's 'settled', on finish(), or after a safety timeout.
 */
import type { Art } from './assets.ts'
import type { Direction, MoveResult, State } from './engine.ts'
import type { InkMazeView, ViewEvent } from './view.ts'
import { UNITY_BUILD_VERSION } from './unityBuildVersion.ts'

/**
 * Where the WebGL build lives and the names its files may have. For the
 * framework, code and data files, the first name that exists on the server is
 * used, so a build with or without compression (.unityweb when Decompression
 * Fallback is on, .gz or .br without it) loads the same way.
 */
export const UNITY_BUILD = {
  base: '/minigames/ink-maze-unity/Build/',
  loader: 'InkMaze.loader.js',
  framework: ['InkMaze.framework.js.unityweb', 'InkMaze.framework.js.gz', 'InkMaze.framework.js.br', 'InkMaze.framework.js'],
  code: ['InkMaze.wasm.unityweb', 'InkMaze.wasm.gz', 'InkMaze.wasm.br', 'InkMaze.wasm'],
  data: ['InkMaze.data.unityweb', 'InkMaze.data.gz', 'InkMaze.data.br', 'InkMaze.data'],
} as const

/** The window event Unity's jslib dispatches. */
export const UNITY_EVENT = 'inkmaze:unity'
/** The GameObject that receives SendMessage calls. */
const BRIDGE = 'Bridge'
/** load() gives up after this long, counting only time the page is in view (a hidden tab draws no frames) */
const LOAD_TIMEOUT_MS = 20000
/** a roll that has not settled after this long is finished by the page */
const SETTLE_TIMEOUT_MS = 1500
/** this many missed rolls in a row (with the tab in view) counts as a failure */
const MAX_MISSES = 2

type UnityInstance = {
  SendMessage(gameObject: string, method: string, value?: string | number): void
  Quit(): Promise<void>
}

type UnityConfig = {
  dataUrl: string
  frameworkUrl: string
  codeUrl: string
  streamingAssetsUrl?: string
  companyName?: string
  productName?: string
  productVersion?: string
  devicePixelRatio?: number
  matchWebGLToCanvasSize?: boolean
  showBanner?: (message: string, type: 'error' | 'warning' | 'info') => void
}

type UnityFactory = (canvas: HTMLCanvasElement, config: UnityConfig, onProgress?: (progress: number) => void) => Promise<UnityInstance>
/**
 * The loader script defines a global createUnityInstance. Forge or Fold's
 * loader declares that global with its own type, so this file reads it
 * through a local one instead of adding a second global declaration.
 */
const unityFactory = () => (window as unknown as { createUnityInstance?: UnityFactory }).createUnityInstance

/**
 * The build targets WebAssembly 2023 (SIMD and native exceptions). A browser
 * without them (Safari before 16.4, for one) would download the build and
 * then fail, so the page asks first with two tiny modules: one that uses a
 * v128 instruction and one with a try/catch block.
 */
const WASM_SIMD = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])
const WASM_EXCEPTIONS = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 10, 8, 1, 6, 0, 6, 64, 25, 11, 11])

function wasmFeatures(): boolean {
  try {
    return typeof WebAssembly === 'object' && WebAssembly.validate(WASM_SIMD) && WebAssembly.validate(WASM_EXCEPTIONS)
  } catch {
    return false
  }
}

/** The build's files with its version on them, so a new build is never mixed with a cached old one. */
const versioned = (url: string) => (UNITY_BUILD_VERSION ? `${url}?v=${UNITY_BUILD_VERSION}` : url)

/**
 * Should the page try the 3D board at all? Not when the URL asks for the 2D
 * one (?renderer=canvas), the browser asks to save data, WebAssembly SIMD and
 * exceptions are missing, or WebGL2 is.
 */
export function unityAllowed(): boolean {
  try {
    if (new URLSearchParams(location.search).get('renderer') === 'canvas') return false
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    if (connection?.saveData) return false
    if (!wasmFeatures()) return false
    const probe = document.createElement('canvas')
    const gl = probe.getContext('webgl2')
    if (!gl) return false
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

/** Is this file really on the server? (A dev server answers a missing file with the site's HTML.) */
async function exists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD', cache: 'no-cache' })
    return response.ok && !/text\/html/i.test(response.headers.get('content-type') ?? '')
  } catch {
    return false
  }
}

/** The first name on the server, asking one at a time (the usual build is found on the first ask). */
async function firstThatExists(names: readonly string[]): Promise<string | null> {
  for (const name of names) {
    const url = versioned(UNITY_BUILD.base + name)
    if (await exists(url)) return url
  }
  return null
}

/** The build's file URLs (with ?v= for its version), or null when there is no build. */
export async function findUnityBuild(): Promise<{ loader: string; framework: string; code: string; data: string } | null> {
  const loader = versioned(UNITY_BUILD.base + UNITY_BUILD.loader)
  if (!(await exists(loader))) return null
  const [framework, code, data] = await Promise.all([
    firstThatExists(UNITY_BUILD.framework),
    firstThatExists(UNITY_BUILD.code),
    firstThatExists(UNITY_BUILD.data),
  ])
  return framework && code && data ? { loader, framework, code, data } : null
}

let loaderScript: Promise<void> | null = null

/** Adds Unity's loader script once per page. */
function addLoader(url: string): Promise<void> {
  if (typeof unityFactory() === 'function') return Promise.resolve()
  if (!loaderScript) {
    loaderScript = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = url
      script.async = true
      script.onload = () => (typeof unityFactory() === 'function' ? resolve() : reject(new Error('the Unity loader did not define createUnityInstance')))
      script.onerror = () => reject(new Error('the Unity loader did not load'))
      document.head.appendChild(script)
    }).catch((error) => {
      loaderScript = null
      throw error
    })
  }
  return loaderScript
}

/** A state as the bridge expects it: exactly these six fields. */
const bridgeState = (state: State) => ({
  width: state.width,
  height: state.height,
  cells: state.cells,
  ball: state.ball,
  colored: state.colored,
  ink: state.ink,
})

const clamp01 = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0)
const whole = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : -1)

type Phase = 'idle' | 'loading' | 'ready' | 'failed' | 'destroyed'

export class UnityInkMaze implements InkMazeView {
  onEvent: ((event: ViewEvent) => void) | null = null
  /** Called once if Unity breaks after it was ready (an error, a lost WebGL context, rolls that never settle). */
  onFailure: ((reason: string) => void) | null = null

  private phase: Phase = 'idle'
  private instance: UnityInstance | null = null
  private readySignal = false
  private queue: Array<[string, string]> = []
  private loadPromise: Promise<void> | null = null
  private resolveLoad: (() => void) | null = null
  private rejectLoad: ((error: Error) => void) | null = null
  private loadTimer = 0
  /** what is left of the load timeout, and when its timer was last started */
  private loadLeft = LOAD_TIMEOUT_MS
  private loadArmedAt = 0
  private canvas: HTMLCanvasElement | null = null
  private rollId = 0
  private pending: { id: number; done: () => void; timer: number } | null = null
  private misses = 0
  /** the latest state sent, for the safety net to show again */
  private latest: State | null = null

  /**
   * Loads the build into `canvas`. Resolves when Unity says it has drawn its
   * first frame; rejects on an error, when there is no build, or after 20 s
   * with the page in view.
   */
  load(canvas: HTMLCanvasElement): Promise<void> {
    if (this.loadPromise) return this.loadPromise
    if (this.phase === 'destroyed') return Promise.reject(new Error('destroyed'))
    this.phase = 'loading'
    this.canvas = canvas
    this.loadPromise = new Promise<void>((resolve, reject) => {
      this.resolveLoad = resolve
      this.rejectLoad = reject
    })
    window.addEventListener(UNITY_EVENT, this.onUnity)
    canvas.addEventListener('webglcontextlost', this.onContextLost)
    document.addEventListener('visibilitychange', this.onVisibility)
    this.armLoadTimer()
    void this.start(canvas)
    return this.loadPromise
  }

  private async start(canvas: HTMLCanvasElement) {
    try {
      const build = await findUnityBuild()
      if (this.phase !== 'loading') return
      if (!build) throw new Error('no Unity build at ' + UNITY_BUILD.base)
      await addLoader(build.loader)
      if (this.phase !== 'loading') return
      const instance = await unityFactory()!(canvas, {
        dataUrl: build.data,
        frameworkUrl: build.framework,
        codeUrl: build.code,
        streamingAssetsUrl: 'StreamingAssets',
        companyName: 'Cornell CGS',
        productName: 'Ink Maze',
        productVersion: '1.0',
        devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        matchWebGLToCanvasSize: true,
        showBanner: (message, type) => {
          if (type === 'error') this.fail(message || 'Unity reported an error')
        },
      })
      if (this.phase !== 'loading') {
        // destroyed or failed while it was starting: let it go
        instance.Quit().catch(() => {})
        return
      }
      this.instance = instance
      this.becomeReady()
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error))
    }
  }

  /** Ready once the instance exists and Unity has sent 'ready', in either order. */
  private becomeReady() {
    if (this.phase !== 'loading' || !this.instance || !this.readySignal) return
    this.phase = 'ready'
    this.stopLoadTimer()
    const queued = this.queue
    this.queue = []
    for (const [method, argument] of queued) this.send(method, argument)
    if (this.phase === 'ready') this.resolveLoad?.()
  }

  // ----------------------------------------------------------- the view

  setArt(_art: Art) {
    // Unity loads its own copy of the art files
  }

  show(state: State) {
    this.latest = state
    this.send('Show', JSON.stringify(bridgeState(state)))
    // after Show, so a move that `done` starts reaches Unity after it
    this.settle()
  }

  animate(result: MoveResult, done: () => void) {
    if (this.pending) this.finish()
    if (this.phase === 'failed' || this.phase === 'destroyed' || !result.path.length) {
      this.latest = result.state
      done()
      return
    }
    const id = ++this.rollId
    this.latest = result.state
    const timer = window.setTimeout(() => this.missed(id), SETTLE_TIMEOUT_MS)
    this.pending = { id, done, timer }
    this.send('Animate', JSON.stringify({ id, path: result.path, state: bridgeState(result.state) }))
  }

  finish() {
    if (!this.pending) return
    this.send('Finish', '')
    this.settle()
  }

  bump(direction: Direction) {
    this.send('Bump', direction)
  }

  setReducedMotion(reduced: boolean) {
    this.send('SetReducedMotion', reduced ? '1' : '0')
  }

  destroy() {
    if (this.phase === 'destroyed') return
    const wasLoading = this.phase === 'loading'
    this.phase = 'destroyed'
    window.removeEventListener(UNITY_EVENT, this.onUnity)
    this.canvas?.removeEventListener('webglcontextlost', this.onContextLost)
    this.stopLoadTimer()
    if (this.pending) clearTimeout(this.pending.timer)
    this.pending = null
    this.queue = []
    this.onEvent = null
    this.onFailure = null
    if (wasLoading) this.rejectLoad?.(new Error('destroyed'))
    const instance = this.instance
    this.instance = null
    instance?.Quit().catch(() => {})
  }

  // ----------------------------------------------------------- inside

  /** Runs the pending roll's `done` (once), if `id` matches or no id is given. */
  private settle(id?: number) {
    const pending = this.pending
    if (!pending || (id !== undefined && pending.id !== id)) return
    this.pending = null
    clearTimeout(pending.timer)
    pending.done()
  }

  /** No 'settled' in time: put the right position on screen and finish the roll here. */
  private missed(id: number) {
    if (this.pending?.id !== id) return
    if (document.visibilityState === 'visible') this.misses++
    // too many in a row: give up on Unity (fail() still finishes this roll)
    if (this.misses >= MAX_MISSES) { this.fail('Unity stopped finishing rolls'); return }
    if (this.latest) this.send('Show', JSON.stringify(bridgeState(this.latest)))
    // listeners (the rolling sound) hear that the ball is at rest, as they would from Unity
    this.emit({ type: 'settled' })
    this.settle(id)
  }

  private send(method: string, argument: string) {
    if (this.phase === 'loading' || this.phase === 'idle') {
      this.queue.push([method, argument])
      return
    }
    if (this.phase !== 'ready' || !this.instance) return
    try {
      this.instance.SendMessage(BRIDGE, method, argument)
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error))
    }
  }

  private emit(event: ViewEvent) {
    const listener = this.onEvent
    if (!listener) return
    try {
      listener(event)
    } catch (error) {
      setTimeout(() => { throw error })
    }
  }

  private fail(reason: string) {
    if (this.phase === 'failed' || this.phase === 'destroyed') return
    const wasLoading = this.phase !== 'ready'
    this.phase = 'failed'
    this.stopLoadTimer()
    this.queue = []
    if (wasLoading) {
      this.rejectLoad?.(new Error(reason))
      return
    }
    // tell the page first, so it can move the board to the canvas before
    // the interrupted roll's `done` runs
    const listener = this.onFailure
    this.onFailure = null
    try {
      listener?.(reason)
    } finally {
      this.settle()
    }
  }

  private onContextLost = () => this.fail('the WebGL context was lost')

  /** Unity starts on animation frames, which a hidden tab does not get: the clock waits while hidden. */
  private armLoadTimer() {
    if (this.phase !== 'loading' || document.hidden) return
    clearTimeout(this.loadTimer)
    this.loadArmedAt = performance.now()
    this.loadTimer = window.setTimeout(() => this.fail('Unity took longer than 20 seconds to start'), Math.max(0, this.loadLeft))
  }

  private stopLoadTimer() {
    clearTimeout(this.loadTimer)
    this.loadTimer = 0
    document.removeEventListener('visibilitychange', this.onVisibility)
  }

  private onVisibility = () => {
    if (this.phase !== 'loading') return
    if (!document.hidden) { this.armLoadTimer(); return }
    if (this.loadTimer) this.loadLeft -= performance.now() - this.loadArmedAt
    clearTimeout(this.loadTimer)
    this.loadTimer = 0
  }

  private onUnity = (event: Event) => {
    const detail = (event as CustomEvent).detail as { type?: unknown; payload?: unknown } | null
    if (!detail || typeof detail.type !== 'string') return
    let payload = detail.payload
    if (typeof payload === 'string') {
      try {
        payload = payload ? JSON.parse(payload) : {}
      } catch {
        payload = {}
      }
    }
    const data = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
    switch (detail.type) {
      case 'ready':
        this.readySignal = true
        this.becomeReady()
        return
      case 'error':
        this.fail(typeof data.message === 'string' && data.message ? data.message : 'Unity reported an error')
        return
    }
    if (this.phase !== 'ready') return
    switch (detail.type) {
      case 'cell':
        this.emit({ type: 'cell', index: whole(data.index), step: whole(data.step), of: whole(data.of) })
        break
      case 'impact':
        this.emit({ type: 'impact', strength: clamp01(data.strength), surface: data.surface === 'rim' ? 'rim' : 'wall' })
        break
      case 'roll':
        this.emit({ type: 'roll', speed: clamp01(data.speed) })
        break
      case 'settled': {
        // only for the roll still waiting: a late one (after the safety net
        // finished it) would otherwise stop the next roll's sound
        const id = whole(data.id)
        if (id !== this.pending?.id) break
        this.misses = 0
        this.emit({ type: 'settled' })
        this.settle(id)
        break
      }
    }
  }
}
