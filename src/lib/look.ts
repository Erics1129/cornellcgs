/**
 * look.ts — one input vector for pointer, touch and tilt. CONTRACT FILE, owner: stream "interaction".
 *
 * Everything that answers the hand reads the same two numbers: where the
 * reader is "looking", -1..1 on each axis. On a laptop that is the pointer.
 * On a phone it is the finger while it rests on an interactive stage, the
 * device tilt where that was granted, and otherwise a slow idle drift.
 *
 * The same module lights the cards. The room has one lamp, fixed in the
 * viewport; card containers pass through it as the page scrolls. So with no
 * pointer the vertical light on a container (--ly) is simply where that
 * container sits in the viewport, which needs no permission and no sensor:
 * scrolling a phone moves the light across the cards. A pointer takes the
 * lamp over while it is on the page.
 *
 * Rules kept here: time-based smoothing only (k = 1 - exp(-dt / tau)), one
 * frame loop that runs only while the value moves, no window scroll listener
 * (the deck is the only source of scroll), no layout reads per frame
 * (container boxes are read when the set of chapters in view changes and on
 * settle), --lx/--ly never on :root.
 *
 * Every export of the step-0 stub keeps its name and signature.
 * Additions: LOOK_TARGETS, LOOK_STAGES, lookState().
 */
import { deckFrame, onDeck, type ChapterId, type DeckFrame } from './deck'
import { tier } from './tier'

export interface Look {
  /** -1 (left) .. 1 (right), smoothed */
  x: number
  /** -1 (top) .. 1 (bottom), smoothed */
  y: number
  /** units per second */
  vx: number
  vy: number
  source: 'pointer' | 'touch' | 'tilt' | 'idle'
  /** false when nothing is driving it: consumers ease back to their rest pose */
  active: boolean
}

export type TiltState = 'unsupported' | 'off' | 'granted' | 'denied'

/** Card containers that receive --lx/--ly while their chapter is in view. Any element may opt in with [data-look]. */
export const LOOK_TARGETS = '.community-board, .project-table, .people-grid, .join-stage, .agenda-list, .hero-poker, [data-look]'
/** Stages on which a resting finger steers the vector (it never blocks the scroll). */
export const LOOK_STAGES = '.poker-location, .vision-eye-stage, .soda-stage, .earth-globe, [data-look-stage]'
/** Chapters with a picture that keeps moving on its own: the idle drift only runs here. */
const IDLE_CHAPTERS: readonly ChapterId[] = ['top', 'world', 'anyone', 'join', 'vision']

const TAU_POINTER = 0.09
const TAU_TILT = 0.12
const TAU_REST = 0.32
const IDLE_AMPLITUDE = 0.15
const TILT_CLAMP = 20
const TILT_KEY = 'cgs-tilt'

const value: Look = { x: 0, y: 0, vx: 0, vy: 0, source: 'idle', active: false }
const listeners = new Set<(l: Look) => void>()
const clamp = (v: number, lo = -1, hi = 1) => (v < lo ? lo : v > hi ? hi : v)

let started = false
let raf = 0
let lastTime = 0
/** where the vector is heading */
let tx = 0
let ty = 0
let pointerOn = false
let touchOn = false
let touchId = -1
/** last finger x on the page, -1..1: the lamp leans toward the hand on a phone */
let lastTouchX = 0
/** 0..1, how much the pointer (not the scroll) owns the card light */
let hand = 0
let reduced = false

// ---- tilt --------------------------------------------------------------------------------------
type OrientationCtor = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> }
let tilt: TiltState = 'unsupported'
let tiltListening = false
let tiltZero: { beta: number; gamma: number } | null = null
let tiltX = 0
let tiltY = 0
let tiltSeen = false

function orientationCtor(): OrientationCtor | null {
  if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return null
  return window.DeviceOrientationEvent as OrientationCtor
}

function onTilt(e: DeviceOrientationEvent) {
  if (e.beta === null || e.gamma === null) return
  // front-back and left-right as the reader holds the screen now, whichever way it is turned
  const angle = (screen.orientation?.angle ?? 0) % 360
  let across = e.gamma
  let along = e.beta
  if (angle === 90) { across = e.beta; along = -e.gamma }
  else if (angle === 270) { across = -e.beta; along = e.gamma }
  else if (angle === 180) { across = -e.gamma; along = -e.beta }
  // the pose at the moment tilt was granted is "level"
  tiltZero ??= { beta: along, gamma: across }
  tiltX = clamp((across - tiltZero.gamma) / TILT_CLAMP)
  tiltY = clamp((along - tiltZero.beta) / TILT_CLAMP)
  tiltSeen = true
  kick()
}

function listenTilt(on: boolean) {
  if (on === tiltListening || typeof window === 'undefined') return
  tiltListening = on
  if (on) window.addEventListener('deviceorientation', onTilt, { passive: true })
  else {
    window.removeEventListener('deviceorientation', onTilt)
    tiltSeen = false
  }
}

export function tiltState(): TiltState {
  return tilt
}

/**
 * Ask for device tilt. Must be called from a tap (iOS shows its permission
 * sheet). Nothing in the site calls this unprompted: scroll light is the
 * default on touch, tilt is an opt-in on top of it.
 */
export function requestTilt(): Promise<TiltState> {
  const ctor = orientationCtor()
  if (!ctor || reduced) return Promise.resolve(tilt)
  const grant = (state: TiltState) => {
    tilt = state
    try { sessionStorage.setItem(TILT_KEY, state) } catch { /* private mode: this page only */ }
    if (state === 'granted') {
      tiltZero = null
      syncTilt()
    }
    return state
  }
  if (typeof ctor.requestPermission !== 'function') return Promise.resolve(grant('granted'))
  return ctor.requestPermission().then((answer) => grant(answer === 'granted' ? 'granted' : 'denied'), () => grant('denied'))
}

// ---- the deck: which card containers are lit, and where they sit ------------------------------
type Target = { el: HTMLElement; mid: number; lx: string; ly: string }
let deckOn = false
let offDeck: (() => void) | null = null
let inViewKey = ''
let targets: Target[] = []
let idleAllowed = false

const pageReady = () => typeof document !== 'undefined' && !!document.getElementById('top')

function collectTargets(f: DeckFrame) {
  const next: Target[] = []
  for (const c of f.chapters) {
    if (!c.inView) continue
    for (const el of c.el.querySelectorAll<HTMLElement>(LOOK_TARGETS)) {
      const box = el.getBoundingClientRect()
      const old = targets.find((t) => t.el === el)
      next.push({ el, mid: box.top + f.y + box.height / 2, lx: old?.lx ?? '', ly: old?.ly ?? '' })
    }
  }
  for (const old of targets) {
    if (next.some((t) => t.el === old.el)) continue
    // a container that left the screen goes back to the neutral light
    old.el.style.removeProperty('--lx')
    old.el.style.removeProperty('--ly')
  }
  targets = next
}

function writeLight(f: DeckFrame) {
  if (!targets.length) return
  // With no pointer, the lamp leans a little toward the last touch and wanders with the scroll position.
  const wander = reduced ? 0 : IDLE_AMPLITUDE * Math.sin((f.y / Math.max(1, f.vh)) * 0.9)
  const roomX = clamp(lastTouchX * 0.6 + wander + (tilt === 'granted' ? tiltX : 0))
  for (const t of targets) {
    // where this container sits in the viewport: -1 at the top edge, 1 at the bottom
    const place = clamp((t.mid - f.y - f.vh / 2) / (f.vh / 2))
    const lx = (roomX + (value.x - roomX) * hand).toFixed(3)
    const ly = (place + (value.y - place) * hand).toFixed(3)
    if (lx !== t.lx) t.el.style.setProperty('--lx', (t.lx = lx))
    if (ly !== t.ly) t.el.style.setProperty('--ly', (t.ly = ly))
  }
}

function syncTilt() {
  if (tilt !== 'granted' || document.hidden) return listenTilt(false)
  // off the deck (sub-pages) there are no chapters to ask
  if (!deckOn) return listenTilt(true)
  // only while a chapter that uses the vector is on screen
  listenTilt(targets.length > 0 || deckFrame().chapters.some((c) => c.inView && IDLE_CHAPTERS.includes(c.id)))
}

function onDeckFrame(f: DeckFrame) {
  let key = ''
  for (const c of f.chapters) if (c.inView) key += c.id + ' '
  if (key !== inViewKey) {
    inViewKey = key
    collectTargets(f)
    syncTilt()
  }
  const t = tier()
  const wasIdle = idleAllowed
  idleAllowed = listeners.size > 0 && t.continuous && IDLE_CHAPTERS.includes(f.active)
  if (idleAllowed && !wasIdle) kick()
  writeLight(f)
}

function startDeck() {
  if (deckOn || !pageReady()) return
  deckOn = true
  offDeck = onDeck(onDeckFrame)
  onDeckFrame(deckFrame())
}

/** Boxes move when cards are dealt, fonts land or the window changes: read them again whenever the page settles. */
function onSettled() {
  if (!deckOn) return startDeck()
  const f = deckFrame()
  collectTargets(f)
  writeLight(f)
}

// ---- the loop ----------------------------------------------------------------------------------
function aim(now: number): number {
  if (pointerOn || touchOn) return TAU_POINTER
  if (tilt === 'granted' && tiltSeen) {
    tx = tiltX
    ty = tiltY
    return TAU_TILT
  }
  if (idleAllowed) {
    const t = now / 1000
    tx = IDLE_AMPLITUDE * Math.sin(t * 0.31)
    ty = IDLE_AMPLITUDE * 0.6 * Math.sin(t * 0.23 + 1.7)
    return TAU_REST
  }
  tx = 0
  ty = 0
  return TAU_REST
}

function step(now: number) {
  raf = 0
  // a tab that slept must not jump: cap the step
  const dt = lastTime ? Math.min(0.1, (now - lastTime) / 1000) : 1 / 60
  lastTime = now
  const tau = aim(now)
  const k = reduced ? 1 : 1 - Math.exp(-dt / tau)
  const nx = value.x + (tx - value.x) * k
  const ny = value.y + (ty - value.y) * k
  value.vx = (nx - value.x) / dt
  value.vy = (ny - value.y) / dt
  value.x = nx
  value.y = ny
  const tilting = tilt === 'granted' && tiltSeen
  value.source = pointerOn ? 'pointer' : touchOn ? 'touch' : tilting ? 'tilt' : 'idle'
  value.active = pointerOn || touchOn || tilting
  const handTarget = pointerOn ? 1 : 0
  hand += (handTarget - hand) * (reduced ? 1 : 1 - Math.exp(-dt / 0.2))
  if (Math.abs(handTarget - hand) < 0.002) hand = handTarget

  for (const fn of listeners) fn(value)
  if (deckOn) writeLight(deckFrame())

  const moving = Math.abs(tx - value.x) > 0.0008 || Math.abs(ty - value.y) > 0.0008 || hand !== handTarget
  if (moving || (idleAllowed && !value.active && !document.hidden)) raf = requestAnimationFrame(step)
  else {
    value.x = tx
    value.y = ty
    value.vx = value.vy = 0
    lastTime = 0
  }
}

function kick() {
  if (!raf && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(step)
}

// ---- input -------------------------------------------------------------------------------------
let viewW = 1
let viewH = 1
function measureView() {
  viewW = Math.max(1, window.innerWidth)
  viewH = Math.max(1, window.innerHeight)
}

function point(clientX: number, clientY: number) {
  tx = clamp((clientX / viewW) * 2 - 1)
  ty = clamp((clientY / viewH) * 2 - 1)
}

function onPointerMove(e: PointerEvent) {
  if (e.pointerType === 'touch') {
    if (!touchOn || e.pointerId !== touchId) return
    point(e.clientX, e.clientY)
    lastTouchX = tx
    return kick()
  }
  pointerOn = true
  point(e.clientX, e.clientY)
  kick()
}

function onPointerDown(e: PointerEvent) {
  if (e.pointerType !== 'touch') return
  lastTouchX = clamp((e.clientX / viewW) * 2 - 1)
  // Android has no permission step: tilt simply starts with the first touch, if this session did not turn it down
  const ctor = orientationCtor()
  if (tilt === 'off' && ctor && typeof ctor.requestPermission !== 'function') void requestTilt()
  const target = e.target instanceof Element ? e.target.closest(LOOK_STAGES) : null
  if (target) {
    touchOn = true
    touchId = e.pointerId
    point(e.clientX, e.clientY)
  }
  if (deckOn) writeLight(deckFrame())
  kick()
}

function onPointerEnd(e: PointerEvent) {
  if (e.pointerType === 'touch') {
    if (e.pointerId !== touchId) return
    touchOn = false
    touchId = -1
  } else if (e.type !== 'pointerup') {
    pointerOn = false
  }
  kick()
}

function onLeaveWindow() {
  pointerOn = false
  kick()
}

function start() {
  if (started || typeof window === 'undefined') return
  started = true
  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  reduced = motion.matches
  motion.addEventListener('change', () => {
    reduced = motion.matches
    if (reduced) listenTilt(false)
    kick()
  })
  if (orientationCtor() && matchMedia('(pointer: coarse)').matches) {
    tilt = 'off'
    try {
      // a tilt answer is remembered for the session; iOS still needs the tap, so only "denied" is restored here
      if (sessionStorage.getItem(TILT_KEY) === 'denied') tilt = 'denied'
    } catch { /* private mode */ }
  }
  measureView()
  window.addEventListener('resize', measureView, { passive: true })
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('pointerdown', onPointerDown, { passive: true })
  window.addEventListener('pointerup', onPointerEnd, { passive: true })
  window.addEventListener('pointercancel', onPointerEnd, { passive: true })
  document.documentElement.addEventListener('pointerleave', onLeaveWindow)
  window.addEventListener('blur', onLeaveWindow)
  document.addEventListener('visibilitychange', () => {
    syncTilt()
    if (!document.hidden) kick()
  })
  // The deck is only asked once the page exists (chapters are measured on first use).
  window.addEventListener('cgs:shown', startDeck)
  window.addEventListener('cgs:settle', onSettled)
  if ((window as { __cgsShown?: boolean }).__cgsShown) startDeck()
}

/** The latest smoothed vector. The same object every call; read it, do not keep copies of its fields across frames. */
export function look(): Look {
  start()
  return value
}

/** Called at most once per animation frame, and only while the vector is changing. */
export function onLook(fn: (l: Look) => void): () => void {
  start()
  listeners.add(fn)
  if (deckOn) onDeckFrame(deckFrame())
  return () => listeners.delete(fn)
}

/** (added) For window.__film.state() and the probe. */
export function lookState() {
  return {
    x: value.x, y: value.y, vx: value.vx, vy: value.vy, source: value.source, active: value.active,
    tilt, hand, running: raf !== 0, targets: targets.length, listeners: listeners.size,
  }
}

/** Boot (listeners, tilt restore, --lx/--ly writers). Called once from main.tsx. */
export function initLook(): () => void {
  // the mini-game routes share main.tsx but are not part of this build
  if (typeof document !== 'undefined' && document.documentElement.dataset.page === 'game') return () => {}
  start()
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    ;(window as unknown as { __look?: unknown }).__look = { look, state: lookState, requestTilt, tiltState }
  }
  return () => {
    offDeck?.()
    offDeck = null
    deckOn = false
    listenTilt(false)
    cancelAnimationFrame(raf)
    raf = 0
  }
}
