import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ScrollToPlugin } from 'gsap/ScrollToPlugin'
import { prefersReducedMotion } from './motion'
import { nav } from '../content'

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin)

/**
 * Forced paging — the site is a deck driven by an explicit BEAT MAP.
 * Every possible landing position is precomputed: each chapter's start, plus
 * evenly spaced beats through the pinned scenes ending exactly on the pin
 * release (which is itself a full-screen frame of that chapter). One gesture
 * moves one beat in either direction, so paging is perfectly symmetric, the
 * screen always lands on a position some chapter fully covers, and scrolling
 * back is always the exact reverse of scrolling forward.
 */

let tween: gsap.core.Tween | null = null
let lastTarget: number | null = null
let busy = false
let gen = 0

/** Stops closer together than this collapse into one. */
const MERGE_PX = 60

function pinRanges(): Array<{ start: number; end: number }> {
  return ScrollTrigger.getAll()
    .filter((st) => !!st.pin && st.start >= 0)
    .map((st) => ({ start: st.start, end: st.end }))
    .sort((a, b) => a.start - b.start)
}

/** Pin-aware chapter top: a pinned chapter starts where its trigger starts. */
function chapterTop(el: HTMLElement): number {
  for (const st of ScrollTrigger.getAll()) {
    if (st.pin && st.trigger === el && st.start >= 0) return Math.round(st.start)
  }
  return Math.round(el.getBoundingClientRect().top + window.scrollY)
}

/** The full beat map: chapter starts + pinned-scene beats + the page bottom. */
function beatStops(): number[] {
  const vh = window.innerHeight || 1
  const ranges = pinRanges()
  const ys: number[] = []

  for (const id of ['top', ...nav.map((n) => n.id)]) {
    const el = document.getElementById(id)
    if (!el) continue
    const top = chapterTop(el)
    ys.push(top)
    const r = ranges.find((r) => Math.abs(r.start - top) < 8)
    if (r) {
      // Beats through the pin, landing exactly on the release. The released
      // position still shows this chapter full-screen, so no gap can appear.
      const len = r.end - r.start
      const n = Math.max(1, Math.round(len / (vh * 0.85)))
      for (let k = 1; k <= n; k++) ys.push(Math.round(r.start + (len * k) / n))
    }
  }
  ys.push(ScrollTrigger.maxScroll(window))

  ys.sort((a, b) => a - b)
  const merged: number[] = []
  for (const y of ys) {
    if (!merged.length || y - merged[merged.length - 1] > MERGE_PX) merged.push(y)
  }
  return merged
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
    duration: prefersReducedMotion() ? 0.05 : 0.85,
    ease: 'power3.out',
    onComplete: () => {
      if (g === gen) busy = false
    },
    onInterrupt: () => {
      if (g === gen) busy = false
    },
  })
}

/** Advance exactly one beat in direction d = ±1. */
function page(d: 1 | -1) {
  const stops = beatStops()
  const from = busy && lastTarget !== null ? lastTarget : window.scrollY
  if (d > 0) {
    const next = stops.find((s) => s > from + 40)
    if (next !== undefined) glide(next)
  } else {
    const below = stops.filter((s) => s < from - 40)
    if (below.length) glide(below[below.length - 1])
    else if (from > 20) glide(0)
  }
}

/**
 * If the viewport somehow rests between beats (a resize, a font reflow, a
 * restored scroll position), glide onto the nearest one — self-healing, so a
 * "half of two chapters" or empty-gap frame can never persist.
 */
function settleToNearest() {
  if (busy) return
  const stops = beatStops()
  if (!stops.length) return
  const y = window.scrollY
  let best = stops[0]
  let bd = Infinity
  for (const s of stops) {
    const dist = Math.abs(s - y)
    if (dist < bd) {
      bd = dist
      best = s
    }
  }
  if (bd > 40) glide(best)
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
  // A deck always opens on its first page — never on a restored mid-scroll.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
  window.scrollTo(0, 0)

  // One page per gesture: fire when armed and the accumulated delta crosses
  // the threshold, then stay disarmed until the wheel goes quiet — EXCEPT
  // that reversing direction re-arms instantly, so a quick "back up" swipe
  // during a trackpad flick's momentum tail is never swallowed.
  let acc = 0
  let armed = true
  let lastDir = 0
  let quietTimer = 0

  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey) return // pinch-zoom gesture on trackpads
    e.preventDefault()
    window.clearTimeout(quietTimer)
    quietTimer = window.setTimeout(() => {
      armed = true
      acc = 0
      lastDir = 0
    }, 170)

    const dir = Math.sign(e.deltaY)
    if (dir !== 0 && lastDir !== 0 && dir !== lastDir) {
      armed = true
      acc = 0
    }
    if (dir !== 0) lastDir = dir

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

  // Late webfonts and viewport changes shift chapter tops — remeasure the
  // pins, then heal the resting position if it fell between beats.
  // Pins must refresh in document order no matter which mounted first.
  window.setTimeout(() => {
    ScrollTrigger.sort()
    ScrollTrigger.refresh()
  }, 60)
  document.fonts?.ready
    .then(() => {
      ScrollTrigger.sort()
      ScrollTrigger.refresh()
    })
    .catch(() => {})
  const onRefresh = () => settleToNearest()
  ScrollTrigger.addEventListener('refresh', onRefresh)

  let resizeTimer = 0
  const onResize = () => {
    window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(settleToNearest, 250)
  }
  window.addEventListener('resize', onResize)

  return () => {
    window.clearTimeout(quietTimer)
    window.clearTimeout(resizeTimer)
    window.removeEventListener('wheel', onWheel)
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('resize', onResize)
    ScrollTrigger.removeEventListener('refresh', onRefresh)
    tween?.kill()
  }
}

// Dev-only introspection for the pager
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__cgsStops = () => ({
    stops: beatStops(),
    pins: pinRanges(),
    busy,
    lastTarget,
  })
}

/** True while a page glide is in flight (the auto-flip waits it out). */
export function isPaging(): boolean {
  return busy
}

/** Glide to a chapter (nav, side rail, CTAs) — always onto its exact beat. */
export function scrollToId(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  glide(chapterTop(el))
}
