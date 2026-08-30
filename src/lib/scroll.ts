import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ScrollToPlugin } from 'gsap/ScrollToPlugin'
import { prefersReducedMotion } from './motion'
import { nav } from '../content'

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin)

/**
 * Forced paging — the site is a deck. One wheel gesture / swipe / key press
 * moves exactly one page; the screen never rests on half of two chapters.
 * Inside pinned scenes (the poker board, the black hole) a gesture advances
 * one beat of the scrubbed timeline instead, so the choreography still plays.
 * All movement is a single interruptible tween of the real scroll position,
 * which keeps every ScrollTrigger (pins, scrubs, reveals) working untouched.
 */

let tween: gsap.core.Tween | null = null
let lastTarget: number | null = null
let busy = false
let gen = 0

const STEP = 0.88 // beat size inside pinned scenes, in viewport heights

function chapterStops(): number[] {
  // A pinned section slides inside its pin-spacer, so its rect is only right
  // before the pin starts — use the pin trigger's own start position instead.
  const pinStarts = new Map<Element, number>()
  for (const st of ScrollTrigger.getAll()) {
    if (st.pin && st.start >= 0) pinStarts.set(st.trigger as Element, st.start)
  }
  const ids = ['top', ...nav.map((n) => n.id)]
  const ys: number[] = []
  for (const id of ids) {
    const el = document.getElementById(id)
    if (!el) continue
    const pinned = pinStarts.get(el)
    ys.push(
      pinned !== undefined
        ? Math.round(pinned)
        : Math.round(el.getBoundingClientRect().top + window.scrollY),
    )
  }
  ys.push(ScrollTrigger.maxScroll(window))
  return [...new Set(ys)].sort((a, b) => a - b)
}

function pinRanges(): Array<{ start: number; end: number }> {
  return ScrollTrigger.getAll()
    .filter((st) => !!st.pin)
    .map((st) => ({ start: st.start, end: st.end }))
    .sort((a, b) => a.start - b.start)
}

function glide(y: number) {
  const max = ScrollTrigger.maxScroll(window)
  const target = Math.max(0, Math.min(Math.round(y), max))
  gen++
  const g = gen
  tween?.kill()
  busy = true
  lastTarget = target
  tween = gsap.to(window, {
    scrollTo: { y: target, autoKill: false },
    duration: prefersReducedMotion() ? 0.05 : 1.05,
    ease: 'power3.out',
    onComplete: () => {
      if (g === gen) busy = false
    },
    onInterrupt: () => {
      if (g === gen) busy = false
    },
  })
}

/** Advance one page (or one beat of a pinned scene) in direction d = ±1. */
function page(d: 1 | -1) {
  const vh = window.innerHeight
  const from = busy && lastTarget !== null ? lastTarget : window.scrollY
  const ranges = pinRanges()

  // A beat inside a pinned scene?
  const cand = from + d * vh * STEP
  const withinPin = ranges.find((r) => cand > r.start + 6 && cand < r.end - 6)
  if (withinPin && from >= withinPin.start - vh && from <= withinPin.end + vh) {
    glide(cand)
    return
  }

  const stops = chapterStops()
  if (d > 0) {
    const next = stops.find((s) => s > from + 12)
    if (next !== undefined) glide(next)
    return
  }

  // Going up: if a pinned scene ends between here and the previous chapter
  // start, re-enter it at its last beat so the timeline scrubs backwards.
  const below = stops.filter((s) => s < from - 12)
  const prev = below.length ? below[below.length - 1] : 0
  const pinAbove = ranges.filter((r) => r.end < from - 12 && r.end > prev).pop()
  if (pinAbove) {
    glide(pinAbove.end - 6)
    return
  }
  glide(prev)
}

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return (
    el.isContentEditable ||
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT'
  )
}

/** Boot the pager. The old name is kept so App.tsx stays untouched. */
export function initSmoothScroll(): () => void {
  // One page per gesture: fire when armed and the accumulated delta crosses
  // the threshold, then stay disarmed until the wheel goes quiet (a trackpad
  // flick's momentum tail must not turn extra pages).
  let acc = 0
  let armed = true
  let quietTimer = 0

  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey) return // pinch-zoom gesture on trackpads
    e.preventDefault()
    window.clearTimeout(quietTimer)
    quietTimer = window.setTimeout(() => {
      armed = true
      acc = 0
    }, 170)
    if (!armed) return
    acc += e.deltaY
    if (Math.abs(acc) < 40) return
    const d = acc > 0 ? 1 : -1
    acc = 0
    armed = false
    page(d as 1 | -1)
  }

  const onKey = (e: KeyboardEvent) => {
    if (isEditable(e.target)) return
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'BUTTON' || t.tagName === 'A') && (e.key === ' ' || e.key === 'Enter'))
      return
    if (['ArrowDown', 'PageDown', ' '].includes(e.key)) {
      e.preventDefault()
      page(1)
    } else if (['ArrowUp', 'PageUp'].includes(e.key)) {
      e.preventDefault()
      page(-1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      glide(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      glide(ScrollTrigger.maxScroll(window))
    }
  }

  // Touch scrolls naturally: on phones the chapters can be taller than the
  // screen, so forced paging would skip content. Wheel and keys stay paged.
  window.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('keydown', onKey)

  // Late webfonts and viewport changes shift chapter tops — remeasure pins.
  document.fonts?.ready.then(() => ScrollTrigger.refresh()).catch(() => {})

  return () => {
    window.clearTimeout(quietTimer)
    window.removeEventListener('wheel', onWheel)
    window.removeEventListener('keydown', onKey)
    tween?.kill()
  }
}

// Dev-only introspection for the pager
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__cgsStops = () => ({
    stops: chapterStops(),
    pins: pinRanges(),
  })
}

/** Glide to an in-page anchor (nav, side rail, CTAs). */
export function scrollToId(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  glide(el.getBoundingClientRect().top + window.scrollY)
}
