/**
 * scenes.ts — one manager decides which canvases may draw. CONTRACT FILE, owner: stream "scroll-core".
 * STUB from SPEC.md §9: every registered scene draws whenever its element is on screen.
 * Keep every export's name and signature.
 */
import { deckFrame, onDeck, onSettle, type ChapterId, type ChapterState, type DeckFrame } from './deck'
import { tier, type Tier } from './tier'

export interface SceneTick {
  /** the scene's chapter; null for page-level layers */
  chapter: ChapterState | null
  frame: DeckFrame
  tier: Tier
  /** seconds since this scene's previous draw, clamped to 0.05; 0 on the first */
  dt: number
  /** true on a settle draw: render the exact current state at full quality, with no easing left over */
  settle: boolean
}

export interface SceneSpec {
  /** stable name, also used by window.__film.state() */
  id: string
  /** owning chapter, or 'page' for the fixed background layers */
  chapter: ChapterId | 'page'
  /** element with [data-scene-host]; holds the canvas or video and its [data-poster] */
  host: HTMLElement
  /** heavy = full-viewport WebGL, or a 2D canvas over 1 megapixel */
  weight: 'heavy' | 'light'
  /** 'scroll' = redraw only when progress, pointer or size changed; 'time' = has its own clock */
  clock: 'scroll' | 'time'
  /**
   * Fetch, decode, compile, upload. Called from the warm-up queue in document
   * order during idle time, long before the chapter is near; a teleport
   * target jumps the queue. Must not block: compile with
   * KHR_parallel_shader_compile and resolve when linked; decode with
   * createImageBitmap. May be called again after release().
   */
  prepare?(): Promise<void> | void
  /** Draw one frame. Return true to ask for another frame (a running clock or an easing value). */
  draw(now: number, tick: SceneTick): boolean | void
  /** Far away or over the context budget: free textures, bitmaps and the context; zero the canvas size. */
  release?(): void
  /** The tier or the host size changed (only ever called while the page is at rest). */
  resize?(tier: Tier): void
}

export interface SceneHandle {
  /** ask for one draw (pointer moved, a texture arrived, pause toggled) */
  invalidate(): void
  /** the first real frame is on screen: the manager fades the canvas in over the poster */
  ready(): void
  /** context lost or media failed: the manager shows the poster again */
  lost(): void
  dispose(): void
  /** true while the manager lets this scene draw */
  readonly allowed: boolean
}

export interface SceneReport {
  ready: boolean
  allowed: boolean
  released: boolean
  drawsLastSecond: number
  lastDrawAt: number
}

const reports = new Map<string, SceneReport>()

export function registerScene(spec: SceneSpec): SceneHandle {
  const report: SceneReport = { ready: false, allowed: false, released: false, drawsLastSecond: 0, lastDrawAt: 0 }
  reports.set(spec.id, report)
  spec.host.dataset.sceneState = 'poster'
  let raf = 0
  let alive = true
  let last = 0
  let prepared: Promise<void> | void
  const state = (f: DeckFrame) => (spec.chapter === 'page' ? null : f.chapters.find((c) => c.id === spec.chapter) ?? null)
  const visible = (f: DeckFrame) => (spec.chapter === 'page' ? f.bgVisible : !!state(f)?.inView) && !document.hidden
  const run = (settle: boolean) => (now: number) => {
    raf = 0
    const f = deckFrame()
    report.allowed = alive && visible(f)
    if (!report.allowed) return
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0
    last = now
    report.lastDrawAt = now
    if (spec.draw(now, { chapter: state(f), frame: f, tier: tier(), dt, settle }) && spec.clock === 'time') request()
  }
  const request = (settle = false) => {
    if (!alive || raf) return
    prepared ??= spec.prepare?.()
    raf = requestAnimationFrame(run(settle))
  }
  const offDeck = onDeck(() => request())
  const offSettle = onSettle(() => request(true))
  request(true)
  return {
    invalidate: () => request(),
    ready() {
      report.ready = true
      spec.host.dataset.sceneState = 'live'
    },
    lost() {
      report.ready = false
      spec.host.dataset.sceneState = 'poster'
    },
    dispose() {
      alive = false
      cancelAnimationFrame(raf)
      offDeck()
      offSettle()
      reports.delete(spec.id)
    },
    get allowed() {
      return report.allowed
    },
  }
}

/** For window.__film.state() and the integration probe. */
export function sceneReports(): Record<string, SceneReport> {
  return Object.fromEntries(reports)
}
