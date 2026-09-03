import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { prefersReducedMotion } from './motion'

gsap.registerPlugin(ScrollTrigger)

// Dev-only: lets automated probes step the clock when the tab is throttled
if (import.meta.env.DEV) {
  ;(window as unknown as { __gsap?: unknown }).__gsap = { gsap, ScrollTrigger }
}

/**
 * Buttery free scrolling (the hard one-page-per-gesture deck was removed at
 * the user's request — resting on half of two chapters is allowed, and the
 * chapter boundaries are visually blended instead). Lenis supplies the
 * inertia; ScrollTrigger drives the pins and scrubs off native scroll, so
 * the board deal, the burst and the globe birth all play continuously.
 */

let lenis: Lenis | null = null

/** True while the page is moving fast (auto-flip and the code lens wait). */
export function isPaging(): boolean {
  return !!lenis && Math.abs(lenis.velocity) > 0.6
}

/** Signed scroll momentum for layers that express it (code rain, skew). */
export function scrollVelocity(): number {
  return lenis ? lenis.velocity : 0
}

/** Pin-aware chapter top: a pinned chapter starts where its trigger starts. */
function chapterTop(el: HTMLElement): number {
  for (const st of ScrollTrigger.getAll()) {
    if (st.pin && st.trigger === el && st.start >= 0) return Math.round(st.start)
  }
  return Math.round(el.getBoundingClientRect().top + window.scrollY)
}

/**
 * Where the reader left the deck. Stashed on every exit (pagehide), consumed
 * on the next deck load so coming back from a sub-page lands on the exact
 * spot — no hero, no glide. A bfcache restore (pageshow persisted) never
 * reloads, so the stash is cleared there instead.
 */
const RETURN_KEY = 'cgs-return'
let pendingRestore: number | null = null

export function hasPendingRestore(): boolean {
  return pendingRestore !== null
}

/** Boot smooth scrolling. The old name is kept so App.tsx stays untouched. */
export function initSmoothScroll(): () => void {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
  try {
    const saved = sessionStorage.getItem(RETURN_KEY)
    if (saved !== null) {
      sessionStorage.removeItem(RETURN_KEY)
      const y = Number(saved)
      if (Number.isFinite(y) && y > 0) pendingRestore = y
    }
  } catch {
    /* private mode — open on the hero */
  }
  window.scrollTo(0, pendingRestore ?? 0)

  const onPageHide = () => {
    try {
      sessionStorage.setItem(RETURN_KEY, String(Math.round(window.scrollY)))
    } catch {
      /* ignore */
    }
  }
  const onPageShow = (e: PageTransitionEvent) => {
    if (e.persisted) {
      try {
        sessionStorage.removeItem(RETURN_KEY)
      } catch {
        /* ignore */
      }
    }
  }
  window.addEventListener('pagehide', onPageHide)
  window.addEventListener('pageshow', onPageShow)

  // Pins must refresh in document order no matter which mounted first
  // (the ML pin mounts from a layout effect, before the board's). A pending
  // restore is re-applied after each refresh, once the pins have their size.
  const settle = () => {
    ScrollTrigger.sort()
    ScrollTrigger.refresh()
    if (pendingRestore !== null) window.scrollTo(0, pendingRestore)
  }
  window.setTimeout(settle, 60)
  document.fonts?.ready
    .then(() => {
      settle()
      pendingRestore = null
    })
    .catch(() => {})

  if (prefersReducedMotion()) return () => {}

  // 120Hz-safe pin behavior; a mobile URL-bar resize must not re-measure pins
  ScrollTrigger.config({ ignoreMobileResize: true })

  // wheelMultiplier 0.9: a slightly heavier, more deliberate page
  lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.9 })
  lenis.on('scroll', ScrollTrigger.update)
  const tick = (time: number) => lenis?.raf(time * 1000)
  gsap.ticker.add(tick)
  gsap.ticker.lagSmoothing(0)

  return () => {
    gsap.ticker.remove(tick)
    lenis?.destroy()
    lenis = null
  }
}

/** Glide to a chapter (nav, side rail, CTAs) on the free-scroll physics. */
export function scrollToId(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const y = chapterTop(el)
  if (lenis) {
    // easeOutExpo decays like the Lenis inertia, so glides and flicks feel
    // like one physics engine; long jumps get a longer runway.
    const far = Math.abs(y - window.scrollY) > window.innerHeight * 1.5
    lenis.scrollTo(y, {
      duration: far ? 1.6 : 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    })
  } else {
    window.scrollTo(0, y)
  }
}
