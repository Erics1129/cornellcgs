/**
 * scenes.ts — one manager decides which canvases and films may draw. CONTRACT FILE, owner: stream "scroll-core".
 *
 * Scenes own no requestAnimationFrame, no IntersectionObserver and no scroll
 * trigger for gating. There is one loop here, on the GSAP ticker, after the
 * deck's:
 *
 *  - May it draw? Decided synchronously every frame from the deck's cached
 *    geometry: a chapter scene while its chapter overlaps the viewport, a page
 *    layer while the page background is visible (or, with `region`, while that
 *    element overlaps the viewport). Otherwise draw() is not called at all.
 *  - When? 'scroll' scenes when their chapter's vrun changed, on invalidate()
 *    and on settle; 'time' scenes every frame while their last draw returned
 *    true. Page layers are capped at tier().bgFps.
 *  - How many? At most tier().heavyDrawing heavy scenes per frame, the one
 *    covering most of the screen first. The others keep their last frame and
 *    are drawn in the following frames.
 *  - Settle: when the page comes to rest every scene in view gets one draw
 *    with settle:true (exact state, full quality). A teleport frame gets a
 *    plain draw at once; its settle draw follows when the jumping has stopped.
 *  - prepare() (media, textures) runs for a scene whose chapter is in view,
 *    or is the next chapter in the direction of travel; never for the whole
 *    deck and never while flying. warm() (shader compile, posters: cheap)
 *    runs for every scene in document order on idle time.
 *  - release() for scenes that have been far away for two seconds.
 *
 * Every export of the SPEC stub keeps its name and signature. Additions to
 * SceneSpec, all optional: region, warm, context, dropContext.
 */
import gsap from 'gsap'
import { CHAPTER_IDS, deckFrame, filmOff, onMeasure, onSettle, type ChapterId, type ChapterState, type DeckFrame } from './deck'
import { BOOTED_EVENT } from './motion'
import { onTier, reportFrame, tier, type Tier } from './tier'

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
   * Fetch, decode, compile, upload. Called when the scene's chapter is in
   * view or is the next one in the direction of travel (never while flying).
   * Must not block: compile with KHR_parallel_shader_compile and resolve when
   * linked; decode with createImageBitmap. May be called again after release().
   */
  prepare?(): Promise<void> | void
  /** Draw one frame. Return true to ask for another frame (a running clock or an easing value). */
  draw(now: number, tick: SceneTick): boolean | void
  /** Far away: free textures, buffers and bitmaps and zero the canvas size. Keep the context and compiled programs. */
  release?(): void
  /** The tier or the host size changed (only ever called while the page is at rest). */
  resize?(tier: Tier): void
  /** For page layers that are not fixed to the viewport (sub-page films): the element whose box gates drawing. */
  region?: HTMLElement
  /** Cheap warm-up (shader compile, a poster): run for every scene in document order on idle time, long before it is near. */
  warm?(): Promise<void> | void
  /** What the scene holds, for the context budget. */
  context?: 'webgl' | '2d' | 'video'
  /** Over the WebGL context budget and far away: give the context itself up (the manager calls release() first). */
  dropContext?(): void
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

interface Entry {
  spec: SceneSpec
  report: SceneReport
  alive: boolean
  prepared: 'no' | 'running' | 'done'
  warmed: boolean
  dirty: boolean
  settle: boolean
  again: boolean
  wasAllowed: boolean
  lastVrun: number
  lastY: number
  lastDraw: number
  farSince: number
  dropped: boolean
  draws: number
  windowStart: number
  region: { top: number; bottom: number } | null
}

const entries: Entry[] = []
let wired = false
let pendingTier: Tier | null = null
let lastLoop = 0
let bgAttr = ''
let housekeeping = 0
let warmTimer = 0
let booted = false
let quietUntil = 0
let preparedThisFrame = false

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const order = (id: ChapterId | 'page') => (id === 'page' ? -1 : CHAPTER_IDS.indexOf(id))

function stateOf(e: Entry, f: DeckFrame): ChapterState | null {
  if (e.spec.chapter === 'page') return null
  for (const c of f.chapters) if (c.id === e.spec.chapter) return c
  return null
}

function measureRegion(e: Entry) {
  const el = e.spec.region
  if (!el) return
  const box = el.getBoundingClientRect()
  const y = window.scrollY
  e.region = { top: box.top + y, bottom: box.bottom + y }
}

function allowedNow(e: Entry, f: DeckFrame, s: ChapterState | null): boolean {
  if (!e.alive) return false
  if (e.spec.chapter !== 'page') return !!s?.inView
  if (e.region) return e.region.top < f.y + f.vhLarge && e.region.bottom > f.y
  return f.bgVisible
}

/** Viewports between the scene and the screen (0 while it is on screen). */
function distance(e: Entry, f: DeckFrame, s: ChapterState | null): number {
  const top = s ? s.top : e.region ? e.region.top : f.y
  const bottom = s ? s.top + s.height : e.region ? e.region.bottom : f.y + f.vhLarge
  return Math.max(0, top - (f.y + f.vhLarge), f.y - bottom) / Math.max(1, f.vhLarge)
}

function prepare(e: Entry) {
  if (e.prepared !== 'no' || !e.alive) return
  e.prepared = 'running'
  e.report.released = false
  e.dropped = false
  preparedThisFrame = true
  let job: Promise<void> | void
  try {
    job = e.spec.prepare?.()
  } catch {
    e.prepared = 'no'
    return
  }
  Promise.resolve(job).then(() => {
    if (e.prepared === 'running') e.prepared = 'done'
    e.dirty = true
  }, () => {
    if (e.prepared === 'running') e.prepared = 'no'
  })
}

function release(e: Entry) {
  if (e.prepared === 'no') return
  e.prepared = 'no'
  e.report.released = true
  e.report.ready = false
  e.spec.host.dataset.sceneState = 'poster'
  try {
    e.spec.release?.()
  } catch {
    /* a scene that cannot free itself keeps what it has */
  }
}

/** Is this scene's chapter where the reader is, or the next chapter in the direction of travel? */
function wanted(e: Entry, f: DeckFrame, s: ChapterState | null, allowed: boolean): boolean {
  if (allowed) return true
  if (!s) return false
  const t = tier()
  // On a metered or slow connection nothing is fetched ahead of the reader.
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  if (t.saveData || connection?.saveData || /(^|-)2g|3g/.test(connection?.effectiveType ?? '')) return false
  const active = CHAPTER_IDS.indexOf(f.active)
  return order(e.spec.chapter) === active + f.direction && distance(e, f, s) < 1.5
}

function houseKeep(f: DeckFrame, now: number) {
  const t = tier()
  const far = t.coarse ? 2 : 3
  let contexts = 0
  for (const e of entries) {
    const s = stateOf(e, f)
    const d = distance(e, f, s)
    if (e.spec.chapter !== 'page' || e.region) {
      if (d > far) {
        if (!e.farSince) e.farSince = now
        else if (now - e.farSince > 2000) release(e)
      } else e.farSince = 0
    }
    if (e.spec.context === 'webgl' && !e.dropped && e.prepared !== 'no') contexts++
  }
  // Over the context budget: the farthest released scene gives its context up. Never one that is in use.
  if (contexts > t.contextsAlive) {
    let victim: Entry | null = null
    let worst = 0
    for (const e of entries) {
      if (e.spec.context !== 'webgl' || e.dropped || !e.spec.dropContext) continue
      const d = distance(e, f, stateOf(e, f))
      if (d > worst && d > 1) {
        worst = d
        victim = e
      }
    }
    if (victim) {
      release(victim)
      victim.dropped = true
      victim.spec.dropContext?.()
    }
  }
}

function loop() {
  const now = performance.now()
  const interval = lastLoop ? now - lastLoop : 16.7
  lastLoop = now
  if (!entries.length || document.hidden) return
  const f = deckFrame()
  const t = tier()
  const still = t.reducedMotion || reduced()
  preparedThisFrame = false

  const bg = f.bgVisible ? 'on' : 'off'
  if (bg !== bgAttr) {
    bgAttr = bg
    document.documentElement.dataset.bg = bg
  }

  // A tier change reallocates buffers: only while the page is at rest, and each resized scene is redrawn in this frame.
  if (pendingTier && f.idle) {
    const next = pendingTier
    pendingTier = null
    for (const e of entries) {
      if (e.prepared === 'no') continue
      e.spec.resize?.(next)
      e.settle = true
    }
  }

  if (++housekeeping >= 30) {
    housekeeping = 0
    houseKeep(f, now)
  }

  let heavyBudget = t.heavyDrawing
  let drew = false
  let continuous = false
  let heavyChapterDrew = false
  // Heavy scenes in order of how much of the screen they cover; everything else in registration order.
  const pass = entries.length > 1 ? [...entries].sort((a, b) => (stateOf(b, f)?.cover ?? 0) - (stateOf(a, f)?.cover ?? 0)) : entries
  for (const e of pass) {
    const s = stateOf(e, f)
    const allowed = allowedNow(e, f, s)
    e.report.allowed = allowed
    if (!f.flying && !f.teleported && e.prepared === 'no' && wanted(e, f, s, allowed)) prepare(e)
    if (!allowed) {
      e.wasAllowed = false
      continue
    }
    if (!e.wasAllowed) {
      e.wasAllowed = true
      e.dirty = true
    }
    const page = e.spec.chapter === 'page'
    const moved = page ? f.y !== e.lastY : s !== null && s.vrun !== e.lastVrun
    let want = e.settle || e.dirty
    if (!want && !still) {
      if (e.spec.clock === 'time') want = e.again && t.level < 4
      else want = moved
      if (e.spec.clock === 'time' && !e.again && moved) want = true
    }
    if (!want) continue
    if (page && !e.settle) {
      // Background layers: capped, and on one-heavy-scene devices they wait while a chapter's own film is drawing.
      if (t.bgFps === 0 && !e.dirty) continue
      if (t.bgFps === 30 && now - e.lastDraw < 30) continue
      if (e.spec.weight === 'heavy' && t.heavyDrawing <= 1 && heavyChapterDrew) continue
    }
    if (e.spec.weight === 'heavy' && !(page && t.heavyDrawing > 1)) {
      if (heavyBudget <= 0) continue // keeps its last frame; its flags stay set for the next frame
      heavyBudget--
      if (!page) heavyChapterDrew = true
    }
    const settle = e.settle
    e.settle = false
    e.dirty = false
    e.lastVrun = s ? s.vrun : 0
    e.lastY = f.y
    const dt = e.lastDraw ? Math.min(0.05, (now - e.lastDraw) / 1000) : 0
    e.lastDraw = now
    let again: boolean | void = false
    try {
      again = e.spec.draw(now, { chapter: s, frame: f, tier: t, dt, settle })
    } catch (error) {
      if (import.meta.env.DEV) console.error(`[scenes] ${e.spec.id} draw failed`, error)
    }
    e.again = !!again && !still
    if (e.again) continuous = true
    drew = true
    e.report.lastDrawAt = now
    if (now - e.windowStart >= 1000) {
      e.report.drawsLastSecond = e.draws
      e.draws = 0
      e.windowStart = now
    }
    e.draws++
  }
  for (const e of entries) {
    if (e.windowStart && now - e.windowStart >= 2000) {
      e.report.drawsLastSecond = 0
      e.draws = 0
      e.windowStart = now
    }
  }
  // The governor only hears about clean frames: not ones in which a prepare started, and not the first half second of a returning tab.
  if (drew && !preparedThisFrame && now > quietUntil) reportFrame(interval, continuous)
}

function warmNext() {
  warmTimer = 0
  if (!booted) return
  const f = deckFrame()
  const next = entries.filter((e) => e.alive && !e.warmed && e.spec.warm).sort((a, b) => order(a.spec.chapter) - order(b.spec.chapter))[0]
  if (!next) return
  if (!f.flying && !document.hidden) {
    next.warmed = true
    try {
      void Promise.resolve(next.spec.warm?.()).catch(() => {})
    } catch {
      /* warm-up is optional */
    }
  }
  scheduleWarm()
}

function scheduleWarm() {
  if (warmTimer || !booted) return
  if (!entries.some((e) => e.alive && !e.warmed && e.spec.warm)) return
  const ric = (window as { requestIdleCallback?: (fn: () => void, options?: { timeout: number }) => number }).requestIdleCallback
  // One scene per idle slice (Safari has no requestIdleCallback: a short timer loop instead).
  warmTimer = ric ? ric.call(window, warmNext, { timeout: 1500 }) : window.setTimeout(warmNext, 50)
}

function wire() {
  if (wired || typeof window === 'undefined') return
  wired = true
  gsap.ticker.add(loop)
  onSettle((f, reason) => {
    for (const e of entries) {
      const s = stateOf(e, f)
      if (!allowedNow(e, f, s)) continue
      // A teleport frame gets a plain draw at once; the exact, full-quality one follows when the jumping stops.
      if (reason === 'teleport') e.dirty = true
      else e.settle = true
    }
  })
  onMeasure(() => {
    for (const e of entries) {
      measureRegion(e)
      e.dirty = true
    }
  })
  onTier((t) => {
    pendingTier = t
  })
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) quietUntil = performance.now() + 500
  })
  const onBoot = () => {
    booted = true
    scheduleWarm()
  }
  if ((window as { __cgsShown?: boolean }).__cgsShown || document.documentElement.dataset.page !== 'deck') onBoot()
  else window.addEventListener(BOOTED_EVENT, onBoot, { once: true })
}

export function registerScene(spec: SceneSpec): SceneHandle {
  const report: SceneReport = { ready: false, allowed: false, released: false, drawsLastSecond: 0, lastDrawAt: 0 }
  spec.host.dataset.sceneState = 'poster'
  if (filmOff()) {
    // Animation layer switched off (probe): the poster is the picture.
    return { invalidate() {}, ready() {}, lost() {}, dispose() {}, get allowed() { return false } }
  }
  wire()
  const e: Entry = {
    spec, report, alive: true, prepared: 'no', warmed: false, dirty: true, settle: true, again: false,
    wasAllowed: false, lastVrun: NaN, lastY: NaN, lastDraw: 0, farSince: 0, dropped: false, draws: 0, windowStart: performance.now(), region: null,
  }
  measureRegion(e)
  entries.push(e)
  scheduleWarm()
  return {
    invalidate() {
      e.dirty = true
    },
    ready() {
      report.ready = true
      spec.host.dataset.sceneState = 'live'
    },
    lost() {
      report.ready = false
      spec.host.dataset.sceneState = 'poster'
    },
    dispose() {
      e.alive = false
      const i = entries.indexOf(e)
      if (i >= 0) entries.splice(i, 1)
    },
    get allowed() {
      return report.allowed
    },
  }
}

/** For window.__film.state() and the integration probe. */
export function sceneReports(): Record<string, SceneReport> {
  return Object.fromEntries(entries.map((e) => [e.spec.id, e.report]))
}
