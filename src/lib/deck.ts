/**
 * deck.ts — the scroll-state module. CONTRACT FILE, owner: stream "scroll-core".
 *
 * This is the STUB from SPEC.md §9. It is a small, working reference
 * implementation so the other streams can build and test against the real
 * interface. The owner replaces the body; every export below keeps its name
 * and signature (additions are allowed, removals and changes are not).
 * Consumer streams copy this file byte for byte and never edit it.
 */
export type ChapterId =
  | 'top' | 'who-we-are' | 'alphago' | 'what-we-do' | 'project' | 'stats' | 'code' | 'ml-process'
  | 'events' | 'world' | 'universe' | 'people' | 'anyone' | 'join' | 'vision' | 'contact'

/** Document order. 'anyone' is the soda chapter, 'contact' is the footer. */
export const CHAPTER_IDS: readonly ChapterId[] = [
  'top', 'who-we-are', 'alphago', 'what-we-do', 'project', 'stats', 'code', 'ml-process',
  'events', 'world', 'universe', 'people', 'anyone', 'join', 'vision', 'contact',
]

export interface ChapterState {
  id: ChapterId
  el: HTMLElement
  /** document px, cached at refresh (never read from layout per frame) */
  top: number
  height: number
  /** 0 when the chapter top is at the viewport bottom, 1 when it reaches the viewport top */
  enter: number
  /** 0..1 along the sticky run: (y - top) / (height - vh). 0/1 steps for chapters no taller than the viewport */
  run: number
  /** run, eased out of any "rest gap" while the page is at rest (see setRestGaps). Scenes draw THIS */
  vrun: number
  /** 0 when the top enters at the viewport bottom, 1 when the bottom leaves at the viewport top */
  through: number
  /** 0 until the chapter bottom reaches the viewport bottom, 1 when it reaches the viewport top */
  exit: number
  /** fraction of the viewport height this chapter covers, 0..1 */
  cover: number
  /** any overlap with the viewport, from cached geometry (synchronous, not an observer) */
  inView: boolean
  /** within 1.5 viewports of the viewport */
  near: boolean
}

export type SettleReason = 'boot' | 'rest' | 'teleport' | 'refresh' | 'resize' | 'visible' | 'focus'

export interface DeckFrame {
  /** scroll position, px */
  y: number
  /** stable viewport height (100svh), px */
  vh: number
  vw: number
  /** page progress 0..1 */
  progress: number
  /** px per second, low-passed, signed */
  velocity: number
  direction: 1 | -1
  /** |velocity| above 3 viewports per second: skip optional work, never start decodes or uploads */
  flying: boolean
  /** no scroll movement for 120 ms */
  idle: boolean
  /** 0 while moving, eases to 1 in 250 ms once idle, back to 0 in 150 ms when motion resumes; 1 at once after a teleport */
  rest: number
  /** true for the one frame in which the position jumped by more than 1.5 viewports */
  teleported: boolean
  /** false while opaque chapters cover the whole viewport: fixed background layers must not draw */
  bgVisible: boolean
  /** chapter under the viewport centre */
  active: ChapterId
  chapters: readonly ChapterState[]
  /** performance.now() of this frame */
  time: number
}

type DeckListener = (frame: DeckFrame) => void
type SettleListener = (frame: DeckFrame, reason: SettleReason) => void

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const deckListeners = new Set<DeckListener>()
const settleListeners = new Set<SettleListener>()
const gaps = new Map<ChapterId, [number, number][]>()
const opaque = new Map<ChapterId, boolean>()
let states: ChapterState[] = []
let frame: DeckFrame = {
  y: 0, vh: 1, vw: 1, progress: 0, velocity: 0, direction: 1, flying: false, idle: true, rest: 1,
  teleported: false, bgVisible: true, active: 'top', chapters: states, time: 0,
}
let started = false
let raf = 0
let idleTimer = 0
let lastY = 0
let lastT = 0

function collect() {
  states = []
  for (const id of CHAPTER_IDS) {
    const el = document.getElementById(id)
    if (!el) continue
    const box = el.getBoundingClientRect()
    states.push({
      id, el, top: box.top + window.scrollY, height: box.height,
      enter: 0, run: 0, vrun: 0, through: 0, exit: 0, cover: 0, inView: false, near: false,
    })
    // A chapter is opaque when CSS says so: `#id { --chapter-opaque: 1 }` (deck.css sets the list, film.css may override)
    opaque.set(id, getComputedStyle(el).getPropertyValue('--chapter-opaque').trim() === '1')
  }
}

function outOfGap(id: ChapterId, run: number): number {
  for (const [a, b] of gaps.get(id) ?? []) if (run > a && run < b) return run - a < b - run ? a : b
  return run
}

function compute(teleported: boolean) {
  const y = window.scrollY
  const vh = stableVh()
  const now = performance.now()
  const dt = Math.max(1, now - lastT)
  const velocity = ((y - lastY) / dt) * 1000
  let active: ChapterId = frame.active
  let opaqueTop = Infinity
  let opaqueBottom = -Infinity
  for (const s of states) {
    s.enter = clamp((y + vh - s.top) / vh)
    s.run = s.height > vh ? clamp((y - s.top) / (s.height - vh)) : y >= s.top ? 1 : 0
    s.through = clamp((y + vh - s.top) / (s.height + vh))
    s.exit = clamp((y - (s.top + s.height - vh)) / vh)
    s.inView = y + vh > s.top && y < s.top + s.height
    s.near = y + vh * 2.5 > s.top && y - vh * 1.5 < s.top + s.height
    s.cover = clamp((Math.min(y + vh, s.top + s.height) - Math.max(y, s.top)) / vh)
    s.vrun = frame.rest >= 1 ? outOfGap(s.id, s.run) : s.run
    if (y + vh / 2 >= s.top && y + vh / 2 < s.top + s.height) active = s.id
    if (s.inView && opaque.get(s.id)) {
      opaqueTop = Math.min(opaqueTop, s.top)
      opaqueBottom = Math.max(opaqueBottom, s.top + s.height)
    }
  }
  const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
  frame = {
    y, vh, vw: document.documentElement.clientWidth, progress: clamp(y / max), velocity,
    direction: y >= lastY ? 1 : -1, flying: Math.abs(velocity) > vh * 3, idle: frame.idle, rest: frame.rest,
    teleported, bgVisible: !(opaqueTop <= y && opaqueBottom >= y + vh), active, chapters: states, time: now,
  }
  lastY = y
  lastT = now
}

function emit() {
  for (const fn of deckListeners) fn(frame)
}

function settle(reason: SettleReason) {
  frame.idle = true
  frame.rest = 1
  compute(reason === 'teleport')
  emit()
  for (const fn of settleListeners) fn(frame, reason)
  window.dispatchEvent(new CustomEvent('cgs:settle', { detail: { reason } }))
}

function onScroll() {
  if (raf) return
  raf = requestAnimationFrame(() => {
    raf = 0
    const jump = Math.abs(window.scrollY - lastY) > stableVh() * 1.5
    frame.idle = false
    frame.rest = 0
    compute(jump)
    emit()
    window.clearTimeout(idleTimer)
    if (jump) settle('teleport')
    else idleTimer = window.setTimeout(() => settle('rest'), 120)
  })
}

function start() {
  if (started || typeof window === 'undefined') return
  started = true
  collect()
  compute(false)
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', () => requestRefresh('resize'))
}

/** Boot the deck. Called once by lib/scroll.ts; the stub also starts lazily on first use. */
export function initDeck(): () => void {
  start()
  return () => {}
}

/** The latest frame. Cheap: returns the cached object, never touches layout. */
export function deckFrame(): DeckFrame {
  start()
  return frame
}

export function chapter(id: ChapterId): ChapterState | undefined {
  start()
  return states.find((s) => s.id === id)
}

/** Called once per animation frame while the page moves or `rest` is easing, and once on every settle. */
export function onDeck(fn: DeckListener): () => void {
  start()
  deckListeners.add(fn)
  return () => deckListeners.delete(fn)
}

/** Called when the page comes to rest (120 ms without movement) and after teleports, refreshes, resizes, tab return and focus moves. */
export function onSettle(fn: SettleListener): () => void {
  start()
  settleListeners.add(fn)
  return () => settleListeners.delete(fn)
}

export interface DriveOptions {
  /** which number to follow; default 'vrun' */
  key?: 'vrun' | 'run' | 'through' | 'enter' | 'exit'
  /** seconds of smoothing on touch devices (native scrolling); the real deck ignores it under Lenis, on teleport and on settle. Default 0.09 */
  smooth?: number
}

/**
 * Follow one chapter's progress. `apply` runs only while the chapter is near
 * the viewport and the value changed, plus once with the clamped end value
 * (0 or 1) when the chapter goes out of range, so state is correct on return.
 */
export function drive(
  id: ChapterId,
  apply: (value: number, state: ChapterState, frame: DeckFrame) => void,
  opts: DriveOptions = {},
): () => void {
  const key = opts.key ?? 'vrun'
  let last = NaN
  const tick = (f: DeckFrame) => {
    const s = f.chapters.find((c) => c.id === id)
    if (!s) return
    const v = s[key]
    if (v === last || (!s.near && (last === 0 || last === 1))) return
    last = v
    apply(v, s, f)
  }
  tick(deckFrame())
  return onDeck(tick)
}

/**
 * Progress intervals of a chapter's run in which the picture is in between
 * two compositions (a dissolve, a card in flight, a title swap). While the
 * page is at rest inside one, `vrun` eases to the nearer end of the interval.
 */
export function setRestGaps(id: ChapterId, intervals: [number, number][]): void {
  gaps.set(id, intervals)
}

let probe: HTMLElement | null = null
/** 100svh in px, from a hidden probe; stable while a phone's URL bar moves. */
export function stableVh(): number {
  if (typeof document === 'undefined') return 1
  if (!probe) {
    probe = document.createElement('div')
    probe.id = 'deck-probe'
    probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100svh;visibility:hidden;pointer-events:none'
    document.documentElement.appendChild(probe)
  }
  return probe.offsetHeight || window.innerHeight
}

let refreshTimer = 0
/** The ONLY way to ask for a re-measure. Debounced (200 ms) and coalesced; never call ScrollTrigger.refresh() directly. */
export function requestRefresh(_reason: string): void {
  window.clearTimeout(refreshTimer)
  refreshTimer = window.setTimeout(() => {
    collect()
    settle('refresh')
  }, 200)
}

/** Go to a chapter top or a pixel position. Far targets (over 2.5 viewports) are cuts, not glides. */
export function jumpTo(target: ChapterId | number, _opts: { cut?: boolean } = {}): void {
  start()
  const y = typeof target === 'number' ? target : chapter(target)?.top ?? 0
  window.scrollTo(0, y)
}
