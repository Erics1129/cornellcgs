/**
 * deck.ts — the scroll-state module. CONTRACT FILE, owner: stream "scroll-core".
 *
 * What the reader sees is render(progress, rest): a pure function of where the
 * page is plus one eased number that says it has stopped. This module is the
 * one place that knows where the page is.
 *
 *  - One computation per animation frame on the GSAP ticker (it also runs
 *    Lenis, so the order "Lenis, deck, listeners, tweens" is fixed).
 *  - Chapter geometry is read at refresh and by a ResizeObserver, never per
 *    frame. Nothing transforms a chapter root and there are no pin spacers,
 *    so the cached tops are exact.
 *  - A frame that moves more than 1.5 viewports is a teleport: everything is
 *    put in its final state in that same frame.
 *  - Rest gaps: progress intervals where the picture is between two
 *    compositions. At rest `vrun` eases to the nearer end and is HELD there
 *    when movement resumes (no pumping back and forth on a slow trackpad).
 *
 * Every export of the SPEC stub keeps its name and signature. Additions:
 * ChapterState.stageHeight, DeckFrame.vhLarge, attachLenis, remeasure,
 * onMeasure, onDeckLate, settleNow, refreshCount, filmOff, deckLenis.
 */
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type Lenis from 'lenis'
import { animationOff } from './motion'

gsap.registerPlugin(ScrollTrigger)

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
  /** height of the chapter's sticky stage, px (the stable viewport height when it has none) */
  stageHeight: number
  /** 0 when the chapter top is at the viewport bottom, 1 when it reaches the viewport top */
  enter: number
  /** 0..1 along the sticky run: (y - top) / (height - stageHeight). 0/1 steps for chapters no taller than the viewport */
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
  /** the visible viewport height right now (window.innerHeight; taller than vh while a phone's URL bar is hidden) */
  vhLarge: number
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
type Gap = [number, number]
interface Hold { a: number; b: number; r0: number; v0: number }
interface Internal {
  opaque: boolean
  gaps: Gap[]
  hold: Hold | null
  /** the ease onto a gap end while the page is at rest */
  settle: { end: number; from: number; t0: number } | null
  enterEls: HTMLElement[]
  enterShown: string
}
interface Driver {
  id: ChapterId
  key: 'vrun' | 'run' | 'through' | 'enter' | 'exit'
  tau: number
  apply: (value: number, state: ChapterState, frame: DeckFrame) => void
  last: number
  shown: number
}

const IDLE_MS = 120
/** Below this speed (px per second) the page counts as stopped: the last pixels of an inertia tail are not movement. */
const CALM_SPEED = 30
const REST_IN_MS = 250
const REST_OUT_MS = 150
const VELOCITY_TAU = 60
const TELEPORT_VIEWPORTS = 1.5
/** A glide is used up to this many viewports; farther targets are cuts. */
const GLIDE_VIEWPORTS = 2.5
const STAGE_SELECTOR = '[data-stage], .scene-stage, .universe-viewport, .soda-stage'

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const cubicOut = (t: number) => 1 - Math.pow(1 - clamp(t), 3)
const deckListeners = new Set<DeckListener>()
const lateListeners = new Set<DeckListener>()
const settleListeners = new Set<SettleListener>()
const measureListeners = new Set<() => void>()
const drivers = new Set<Driver>()
const gapTable = new Map<ChapterId, Gap[]>()
const internals = new Map<ChapterId, Internal>()
const byId = new Map<ChapterId, ChapterState>()
let states: ChapterState[] = []
let frame: DeckFrame = {
  y: 0, vh: 1, vhLarge: 1, vw: 1, progress: 0, velocity: 0, direction: 1, flying: false, idle: true, rest: 1,
  teleported: false, bgVisible: true, active: 'top', chapters: states, time: 0,
}

let started = false
let lenis: Lenis | null = null
let nativeY = 0
let lastY = 0
let moveY = 0
let lastT = 0
let lastMoveAt = -1e9
let idleSince = 0
let restAtIdle = 0
let velocity = 0
let slowSince = 0
let maxScroll = 1
let vhStable = 0
let vhLarge = 0
let vw = 0
let force = true
let driversBusy = false
let gapEasing = false
let pendingSettle: SettleReason | null = null
let teleportFollowUp = 0
let scrollAttr = ''
let geometryDirty = false
let remeasureFrame = 0
let refreshTimer = 0
let refreshReason = ''
let refreshes = 0
let resizeObserver: ResizeObserver | null = null
let lastWidth = 0
let lastHeight = 0
let lastOrientation = ''
let sizeChanged = false
/** Where the reader is: the chapter under the 32% line, kept from the last frame computed on good geometry. */
let anchor: { id: ChapterId; top: number; height: number; offset: number } | null = null

/** Dev kill switch (probe invariant 35): no deck, no reveals, no scenes. Set window.__filmOff = true before boot. */
export function filmOff(): boolean {
  return animationOff()
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/* ------------------------------------------------------------------ geometry */

let probe: HTMLElement | null = null
function readStableVh(): number {
  if (!probe) {
    probe = document.createElement('div')
    probe.id = 'deck-probe'
    probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100vh;height:100svh;visibility:hidden;pointer-events:none'
    document.documentElement.appendChild(probe)
  }
  return probe.offsetHeight || window.innerHeight
}

/** 100svh in px, from a hidden probe; stable while a phone's URL bar moves. Cached: re-read only at refresh. */
export function stableVh(): number {
  if (typeof document === 'undefined') return 1
  return vhStable || (vhStable = readStableVh())
}

function measure() {
  vhStable = readStableVh()
  vhLarge = window.innerHeight
  vw = document.documentElement.clientWidth
  const scrollY = window.scrollY
  nativeY = scrollY
  maxScroll = Math.max(1, document.documentElement.scrollHeight - vhLarge)
  const next: ChapterState[] = []
  for (const id of CHAPTER_IDS) {
    const el = document.getElementById(id)
    if (!el) {
      byId.delete(id)
      continue
    }
    const box = el.getBoundingClientRect()
    let s = byId.get(id)
    if (!s || s.el !== el) {
      s = { id, el, top: 0, height: 0, stageHeight: 0, enter: 0, run: 0, vrun: 0, through: 0, exit: 0, cover: 0, inView: false, near: false }
      byId.set(id, s)
      internals.set(id, { opaque: false, gaps: gapTable.get(id) ?? [], hold: null, settle: null, enterEls: [], enterShown: '' })
      resizeObserver?.observe(el)
    }
    s.top = box.top + scrollY
    s.height = box.height
    const stage = el.querySelector<HTMLElement>(STAGE_SELECTOR)
    s.stageHeight = stage && getComputedStyle(stage).position === 'sticky' ? stage.offsetHeight : vhStable
    const meta = internals.get(id)!
    // A chapter is opaque when CSS says so: `#id { --chapter-opaque: 1 }` (deck.css sets the first list, film.css may override)
    meta.opaque = getComputedStyle(el).getPropertyValue('--chapter-opaque').trim() === '1'
    meta.enterEls = Array.from(el.querySelectorAll<HTMLElement>('[data-film-enter]'))
    meta.enterShown = ''
    next.push(s)
  }
  states = next
  // Listeners of this re-measure read the new viewport from the frame at once.
  frame.vh = vhStable
  frame.vhLarge = vhLarge
  frame.vw = vw
  frame.chapters = states
  geometryDirty = false
  force = true
  for (const fn of measureListeners) fn()
}

/** After a re-measure: keep the reader in the same chapter at the same place when that chapter moved. */
function restoreAnchor() {
  const a = anchor
  if (!a) return
  const s = byId.get(a.id)
  if (!s) return
  const moved = Math.abs(s.top - a.top) > 2
  if (!moved && !sizeChanged) return
  // When the chapter itself changed size (viewport change, motion preference) keep the fraction; otherwise the pixel offset.
  const inside = (sizeChanged || Math.abs(s.height - a.height) > 2) && a.height > 0 ? (a.offset / a.height) * s.height : a.offset
  const y = Math.max(0, Math.min(maxScroll, s.top + inside - vhStable * 0.32))
  sizeChanged = false
  anchor = { id: a.id, top: s.top, height: s.height, offset: inside }
  if (Math.abs(y - nativeY) < 1.5) return
  scrollImmediate(y)
}

function scrollImmediate(y: number) {
  if (lenis) {
    lenis.resize()
    lenis.scrollTo(y, { immediate: true, force: true })
  } else window.scrollTo(0, y)
  nativeY = y
  force = true
  // An explicit position replaces whatever place was remembered before it.
  captureAnchor(y)
}

/**
 * Re-read the cached geometry in the next frame. No debounce and no
 * ScrollTrigger call: this is what keeps `inView` honest when an accordion
 * opens, a font swaps or an image arrives. A (debounced) refresh follows
 * only when a chapter actually moved.
 */
export function remeasure(): void {
  if (!started || remeasureFrame) return
  geometryDirty = true
  remeasureFrame = requestAnimationFrame(() => {
    remeasureFrame = 0
    const before = states.map((s) => s.top + s.height)
    measure()
    restoreAnchor()
    if (states.some((s, i) => Math.abs(s.top + s.height - (before[i] ?? -1)) > 1)) requestRefresh('layout')
  })
}

/** Runs after every re-measure (reveals re-read their trigger boxes here). */
export function onMeasure(fn: () => void): () => void {
  measureListeners.add(fn)
  return () => measureListeners.delete(fn)
}

/* ------------------------------------------------------------------ the frame */

function gapValue(s: ChapterState, meta: Internal, idle: boolean, now: number, teleported: boolean): number {
  const run = s.run
  let gap: Gap | null = null
  for (const g of meta.gaps) if (run > g[0] && run < g[1]) { gap = g; break }
  if (!gap) {
    meta.hold = null
    meta.settle = null
    return run
  }
  const [a, b] = gap
  if (teleported || (meta.hold && (meta.hold.a !== a || meta.hold.b !== b))) {
    meta.hold = null
    meta.settle = null
  }
  // While moving, the picture is held on the side it settled on and catches up linearly inside the gap.
  const h = meta.hold
  let base = run
  if (h) {
    if (run >= h.r0) base = h.r0 >= b ? b : h.v0 + ((run - h.r0) / (b - h.r0)) * (b - h.v0)
    else base = h.r0 <= a ? a : h.v0 + ((run - h.r0) / (a - h.r0)) * (a - h.v0)
  }
  if (!idle) {
    meta.settle = null
    return base
  }
  // At rest: the nearer end, by position alone, so the same stop always shows the same picture.
  // The ease onto it restarts if a slow creep carries the position past the middle of the gap.
  const end = run - a < b - run ? a : b
  if (teleported) meta.settle = { end, from: end, t0: now - REST_IN_MS }
  else if (!meta.settle || meta.settle.end !== end) meta.settle = { end, from: meta.settle ? s.vrun : base, t0: now }
  const t = (now - meta.settle.t0) / REST_IN_MS
  if (t < 1) gapEasing = true
  const v = meta.settle.from + (end - meta.settle.from) * cubicOut(t)
  meta.hold = { a, b, r0: run, v0: v }
  return v
}

function compute(now: number, y: number, teleported: boolean) {
  const vh = vhStable || 1
  const vhL = vhLarge || vh
  const idle = frame.idle
  gapEasing = false
  let active: ChapterId = frame.active
  let bgVisible = states.length === 0
  for (const s of states) {
    const top = s.top
    const bottom = top + s.height
    const travel = s.height - s.stageHeight
    s.enter = clamp((y + vhL - top) / vhL)
    s.run = travel > 1 ? clamp((y - top) / travel) : y >= top ? 1 : 0
    s.through = clamp((y + vhL - top) / (s.height + vhL))
    s.exit = clamp((y - (bottom - vhL)) / vhL)
    s.inView = y + vhL > top && y < bottom
    s.near = y + vhL * 2.5 > top && y - vhL * 1.5 < bottom
    s.cover = clamp((Math.min(y + vhL, bottom) - Math.max(y, top)) / vhL)
    const meta = internals.get(s.id)!
    s.vrun = meta.gaps.length ? gapValue(s, meta, idle, now, teleported) : s.run
    if (y + vhL / 2 >= top && y + vhL / 2 < bottom) active = s.id
    if (!meta.opaque && Math.min(y + vhL, bottom) - Math.max(y, top) > 0.5) bgVisible = true
  }
  if (y + vhL > (states.length ? states[states.length - 1].top + states[states.length - 1].height : 0) + 0.5) bgVisible = true
  if (y < (states.length ? states[0].top : 0) - 0.5) bgVisible = true
  const rest = teleported ? 1 : idle ? cubicOut(restAtIdle + (now - idleSince) / REST_IN_MS) : Math.max(0, frame.rest - (now - frame.time) / REST_OUT_MS)
  frame = {
    y, vh, vhLarge: vhL, vw, progress: clamp(y / maxScroll), velocity,
    direction: y === lastY ? frame.direction : y > lastY ? 1 : -1,
    flying: frame.flying, idle, rest, teleported, bgVisible, active, chapters: states, time: now,
  }
  if (!geometryDirty) captureAnchor(y)
}

/** Remember the reader's place against the geometry that is cached right now (the two must always belong together). */
function captureAnchor(y: number) {
  const line = y + (vhStable || 1) * 0.32
  for (const s of states) {
    if (line >= s.top && line < s.top + s.height) {
      anchor = { id: s.id, top: s.top, height: s.height, offset: line - s.top }
      return
    }
  }
}

function writeEntryDepth() {
  // Entry depth is only written under Lenis (fine pointers): script-driven motion on in-flow content lags native touch scrolling.
  for (const s of states) {
    const meta = internals.get(s.id)!
    if (!meta.enterEls.length) continue
    const value = !lenis || !s.near || s.enter >= 1 ? '1' : cubicOut(s.enter).toFixed(3)
    if (value === meta.enterShown) continue
    meta.enterShown = value
    for (const el of meta.enterEls) {
      if (value === '1') el.style.removeProperty('--e')
      else el.style.setProperty('--e', value)
    }
  }
}

function runDrivers(dt: number) {
  driversBusy = false
  const smoothing = !lenis && !frame.idle && !frame.teleported && !reducedMotion()
  for (const d of drivers) {
    const s = byId.get(d.id)
    if (!s) continue
    const target = s[d.key]
    if (!s.near) {
      // Out of range: leave the clamped end state once, so the chapter is correct when the reader returns.
      if (d.last !== target) {
        d.last = d.shown = target
        d.apply(target, s, frame)
      }
      continue
    }
    if (smoothing && d.tau > 0 && !Number.isNaN(d.shown)) {
      d.shown += (target - d.shown) * (1 - Math.exp(-dt / d.tau))
      if (Math.abs(target - d.shown) < 0.0004) d.shown = target
      else driversBusy = true
    } else d.shown = target
    if (d.shown !== d.last) {
      d.last = d.shown
      d.apply(d.shown, s, frame)
    }
  }
}

function emit(dt: number) {
  writeEntryDepth()
  runDrivers(dt)
  for (const fn of deckListeners) fn(frame)
  for (const fn of lateListeners) fn(frame)
  const attr = frame.idle ? 'rest' : frame.flying ? 'flying' : 'moving'
  if (attr !== scrollAttr) {
    scrollAttr = attr
    document.documentElement.dataset.scroll = attr
  }
}

function fireSettle(reason: SettleReason) {
  for (const fn of settleListeners) fn(frame, reason)
  window.dispatchEvent(new CustomEvent('cgs:settle', { detail: { reason } }))
}

function flushScrubs() {
  ScrollTrigger.update()
  for (const st of ScrollTrigger.getAll()) st.getTween?.()?.progress(1)
}

function tick() {
  const now = performance.now()
  if (lenis) lenis.raf(now)
  const y = lenis && lenis.isScrolling === 'smooth' ? lenis.animatedScroll : nativeY
  const dt = Math.min(100, Math.max(1, now - lastT))
  const dy = y - lastY
  const moved = Math.abs(y - moveY) > 0.5
  const teleported = Math.abs(dy) > (vhLarge || 1) * TELEPORT_VIEWPORTS && lastT > 0 && states.length > 0
  const instant = (dy / dt) * 1000
  velocity += (instant - velocity) * (1 - Math.exp(-dt / VELOCITY_TAU))
  if (Math.abs(velocity) < 1) velocity = 0
  let flying = frame.flying
  const speed = Math.abs(velocity)
  const vhL = vhLarge || 1
  if (speed > vhL * 3) {
    flying = true
    slowSince = 0
  } else if (flying && speed < vhL * 1.5) {
    if (!slowSince) slowSince = now
    else if (now - slowSince > 200) flying = false
  } else if (speed >= vhL * 1.5) slowSince = 0
  frame.flying = flying && !teleported

  let settle: SettleReason | null = null
  if (teleported) {
    // Everything is final in this frame: no easing is left to run and no reveal waits for a scroll event.
    moveY = y
    lastMoveAt = now - IDLE_MS
    velocity = 0
    frame.flying = false
    frame.idle = true
    idleSince = now - REST_IN_MS
    restAtIdle = 1
    settle = 'teleport'
    // The heavy part of a settle (decodes, exact seeks, uploads) waits until the jumping has stopped.
    window.clearTimeout(teleportFollowUp)
    teleportFollowUp = window.setTimeout(() => {
      if (frame.idle) pendingSettle = pendingSettle ?? 'rest'
    }, 90)
  } else if (moved && speed >= CALM_SPEED) {
    lastMoveAt = now
    if (frame.idle) frame.idle = false
  } else if (!frame.idle && now - lastMoveAt >= IDLE_MS) {
    // Stopped, or creeping the last few pixels of an inertia tail: the frame the reader is looking at is finished now.
    frame.idle = true
    idleSince = now
    restAtIdle = 0
    settle = 'rest'
  }
  if (moved) moveY = y
  if (pendingSettle && !settle) settle = pendingSettle
  pendingSettle = null

  const easing = frame.idle ? frame.rest < 1 : frame.rest > 0
  if (dy !== 0 || moved || easing || force || settle || driversBusy || gapEasing) {
    force = false
    compute(now, y, teleported)
    if (teleported) flushScrubs()
    emit(dt)
    if (settle) fireSettle(settle)
  }
  lastY = y
  lastT = now
}

function onNativeScroll() {
  const y = window.scrollY
  // Lenis ignores native jumps while it glides (End, Home, find in page, a Tab focus scroll) and would
  // drag the page back on its next frame. Hand it the new position instead.
  if (lenis && lenis.isScrolling === 'smooth' && Math.abs(y - lenis.animatedScroll) > 2) {
    lenis.scrollTo(y, { immediate: true, force: true })
  }
  nativeY = y
}

const NAV_KEYS = new Set(['End', 'Home', 'PageUp', 'PageDown', ' ', 'Spacebar', 'ArrowUp', 'ArrowDown'])
function onKeyDown(e: KeyboardEvent) {
  if (!lenis || !NAV_KEYS.has(e.key) || lenis.isScrolling !== 'smooth') return
  // Stop the glide where it is, so the key's own native scroll starts from here and is not fought.
  lenis.scrollTo(lenis.animatedScroll, { immediate: true, force: true })
}

function onResize() {
  const w = window.innerWidth
  const h = window.innerHeight
  const orientation = w > h ? 'l' : 'p'
  vhLarge = h
  force = true
  const fine = matchMedia('(pointer: fine)').matches
  const real = Math.abs(w - lastWidth) > 1 || orientation !== lastOrientation || (fine && Math.abs(h - lastHeight) > 120)
  if (!real) return
  lastWidth = w
  lastHeight = h
  lastOrientation = orientation
  geometryDirty = true
  sizeChanged = true
  requestRefresh('resize')
}

function onFocusIn(e: FocusEvent) {
  const el = e.target as HTMLElement | null
  if (!el?.matches?.(':focus-visible') || !el.closest('main, footer')) return
  pendingSettle = pendingSettle ?? 'focus'
}

function onVisible() {
  if (!document.hidden) pendingSettle = pendingSettle ?? 'visible'
}

function onPageShow(e: PageTransitionEvent) {
  if (e.persisted) pendingSettle = 'visible'
}

function start() {
  if (started || typeof window === 'undefined' || filmOff()) return
  started = true
  lastWidth = window.innerWidth
  lastHeight = window.innerHeight
  lastOrientation = lastWidth > lastHeight ? 'l' : 'p'
  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(() => remeasure())
    const main = document.querySelector('main')
    if (main) resizeObserver.observe(main)
  }
  measure()
  lastY = moveY = nativeY
  compute(performance.now(), nativeY, false)
  window.addEventListener('scroll', onNativeScroll, { passive: true })
  window.addEventListener('resize', onResize)
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('pageshow', onPageShow)
  document.addEventListener('focusin', onFocusIn)
  document.addEventListener('visibilitychange', onVisible)
  gsap.ticker.add(tick, false, true)
}

/** Boot the deck. Called once by lib/scroll.ts (the deck) and by sub-pages; it also starts lazily on first use. */
export function initDeck(): () => void {
  if (filmOff()) return () => {}
  const fresh = !started
  start()
  if (!fresh) {
    // Started lazily by an early subscriber: read the real page now.
    const main = document.querySelector('main')
    if (main) resizeObserver?.observe(main)
    measure()
    // The place remembered by the early start was taken against a half-built page: take it again.
    captureAnchor(nativeY)
  }
  return () => {
    if (!started) return
    started = false
    gsap.ticker.remove(tick)
    window.removeEventListener('scroll', onNativeScroll)
    window.removeEventListener('resize', onResize)
    window.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('pageshow', onPageShow)
    document.removeEventListener('focusin', onFocusIn)
    document.removeEventListener('visibilitychange', onVisible)
    window.clearTimeout(refreshTimer)
    window.clearTimeout(teleportFollowUp)
    cancelAnimationFrame(remeasureFrame)
    remeasureFrame = 0
    resizeObserver?.disconnect()
    resizeObserver = null
    byId.clear()
    internals.clear()
    states = []
    lastT = 0
  }
}

/** scroll.ts hands the smooth scroller over (or null on touch and under reduced motion); the deck runs it. */
export function attachLenis(next: Lenis | null): void {
  lenis = next
  force = true
  if (!next) for (const meta of internals.values()) meta.enterShown = ''
}

export function deckLenis(): Lenis | null {
  return lenis
}

/** The latest frame. Cheap: returns the cached object, never touches layout. */
export function deckFrame(): DeckFrame {
  start()
  return frame
}

export function chapter(id: ChapterId): ChapterState | undefined {
  start()
  return byId.get(id)
}

/** Called once per animation frame while the page moves or `rest` is easing, and once on every settle. */
export function onDeck(fn: DeckListener): () => void {
  start()
  deckListeners.add(fn)
  return () => deckListeners.delete(fn)
}

/** Like onDeck, but runs after every onDeck listener (the scene manager draws last). */
export function onDeckLate(fn: DeckListener): () => void {
  start()
  lateListeners.add(fn)
  return () => lateListeners.delete(fn)
}

/** Called when the page comes to rest (120 ms without movement) and after teleports, refreshes, resizes, tab return and focus moves. */
export function onSettle(fn: SettleListener): () => void {
  start()
  settleListeners.add(fn)
  return () => settleListeners.delete(fn)
}

/** Ask for a settle in the next frame (boot, the curtain lifting). */
export function settleNow(reason: SettleReason): void {
  start()
  pendingSettle = reason
}

export interface DriveOptions {
  /** which number to follow; default 'vrun' */
  key?: 'vrun' | 'run' | 'through' | 'enter' | 'exit'
  /** seconds of smoothing on touch devices (native scrolling); ignored under Lenis, on teleport and on settle. Default 0.09 */
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
  if (filmOff()) return () => {}
  start()
  const d: Driver = { id, key: opts.key ?? 'vrun', tau: (opts.smooth ?? 0.09) * 1000, apply, last: NaN, shown: NaN }
  const s = byId.get(id)
  if (s) {
    d.last = d.shown = s[d.key]
    apply(d.shown, s, frame)
  }
  drivers.add(d)
  return () => drivers.delete(d)
}

/**
 * Progress intervals of a chapter's run in which the picture is in between
 * two compositions (a dissolve, a card in flight, a title swap). While the
 * page is at rest inside one, `vrun` eases to the nearer end of the interval
 * and is held there when movement resumes.
 */
export function setRestGaps(id: ChapterId, intervals: [number, number][]): void {
  gapTable.set(id, intervals)
  const meta = internals.get(id)
  if (meta) {
    meta.gaps = intervals
    meta.hold = null
    meta.settle = null
  }
  force = true
}

export function refreshCount(): number {
  return refreshes
}

/** Where the viewport top sits: the chapter and the fraction of its height (for the return-to-spot stash). */
export function whereAmI(): { id: ChapterId; fraction: number } | null {
  const y = frame.y
  for (const s of states) if (y >= s.top && y < s.top + s.height) return { id: s.id, fraction: s.height > 0 ? (y - s.top) / s.height : 0 }
  return null
}

/** Put the viewport top at a fraction of a chapter (the counterpart of whereAmI), as a teleport. */
export function restoreTo(id: ChapterId, fraction: number): void {
  start()
  const s = byId.get(id)
  if (!s) return
  scrollImmediate(Math.max(0, Math.min(maxScroll, s.top + s.height * fraction)))
}

/** The ONLY way to ask for a re-measure. Debounced (200 ms) and coalesced; never call ScrollTrigger.refresh() directly. */
export function requestRefresh(reason: string): void {
  if (typeof window === 'undefined' || filmOff()) return
  start()
  if (reason === 'resize' || !refreshReason) refreshReason = reason
  window.clearTimeout(refreshTimer)
  refreshTimer = window.setTimeout(() => {
    const why = refreshReason
    refreshReason = ''
    if (!started) return
    refreshes++
    ScrollTrigger.sort()
    ScrollTrigger.refresh()
    measure()
    restoreAnchor()
    lenis?.resize()
    pendingSettle = why === 'resize' ? 'resize' : 'refresh'
  }, 200)
}

let dip: HTMLElement | null = null
let dipTimer = 0
function cutTo(y: number) {
  if (!dip) {
    dip = document.createElement('div')
    dip.id = 'deck-dip'
    dip.setAttribute('aria-hidden', 'true')
    document.body.appendChild(dip)
    void dip.offsetWidth
  }
  const veil = dip
  window.clearTimeout(dipTimer)
  veil.style.transitionDuration = '140ms'
  veil.style.opacity = '1'
  dipTimer = window.setTimeout(() => {
    scrollImmediate(y)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      veil.style.transitionDuration = '220ms'
      veil.style.opacity = '0'
    }))
  }, 150)
}

/** Go to a chapter top or a pixel position. Far targets (over 2.5 viewports) are cuts, not glides. */
export function jumpTo(target: ChapterId | number, opts: { cut?: boolean } = {}): void {
  if (filmOff()) {
    const el = typeof target === 'number' ? null : document.getElementById(target)
    window.scrollTo(0, typeof target === 'number' ? target : el ? el.getBoundingClientRect().top + window.scrollY : 0)
    return
  }
  start()
  const raw = typeof target === 'number' ? target : target === 'top' ? 0 : chapter(target)?.top ?? 0
  const y = Math.max(0, Math.min(maxScroll, Math.round(raw)))
  const from = lenis && lenis.isScrolling === 'smooth' ? lenis.animatedScroll : nativeY
  const distance = Math.abs(y - from)
  if (distance < 1) return
  if (reducedMotion()) return scrollImmediate(y)
  const far = distance > (vhLarge || 1) * GLIDE_VIEWPORTS
  if (opts.cut || far) return cutTo(y)
  if (lenis) {
    // easeOutExpo decays like the Lenis inertia, so glides and flicks feel like one physics engine
    lenis.scrollTo(y, { duration: distance > vhLarge * 1.2 ? 1.2 : 0.9, easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)) })
  } else window.scrollTo({ top: y, behavior: 'smooth' })
}
