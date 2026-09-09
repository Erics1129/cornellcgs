import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

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

  // A preference change rebuilds pins and changes chapter heights. Remember
  // the chapter before that reflow, not the transient scroll offset during it.
  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  let reduced = motion.matches
  let anchor: { element: HTMLElement; fraction: number } | null = null
  let trackingFrame = 0, restoreFrame = 0, restoreTimer = 0, restoring = false
  const chapterBox = (element: HTMLElement) => element.parentElement?.classList.contains('pin-spacer') ? element.parentElement : element
  const rememberChapter = () => {
    trackingFrame = 0
    if (restoring || reduced !== motion.matches) return
    const line = innerHeight * .32
    for (const element of document.querySelectorAll<HTMLElement>('main > section, main > .pin-spacer > section')) {
      const box = chapterBox(element).getBoundingClientRect()
      if (box.top <= line && box.bottom > line && box.height) {
        anchor = { element, fraction: (line - box.top) / box.height }
        return
      }
    }
  }
  const trackChapter = () => { if (!trackingFrame && !restoring) trackingFrame = requestAnimationFrame(rememberChapter) }
  const tick = (time: number) => lenis?.raf(time * 1000)
  const setScrollMotion = () => {
    gsap.ticker.remove(tick)
    lenis?.destroy(); lenis = null
    if (!motion.matches) {
      lenis = new Lenis({ lerp: .13, wheelMultiplier: 1, syncTouch: false })
      lenis.on('scroll', ScrollTrigger.update)
      gsap.ticker.add(tick)
    }
  }
  const onMotionChange = () => {
    const saved = anchor
    reduced = motion.matches
    restoring = true
    cancelAnimationFrame(trackingFrame); trackingFrame = 0
    cancelAnimationFrame(restoreFrame); clearTimeout(restoreTimer)
    setScrollMotion()
    const restore = () => {
      if (!saved?.element.isConnected) return
      const box = chapterBox(saved.element).getBoundingClientRect()
      const y = Math.max(0, box.top + scrollY + box.height * saved.fraction - innerHeight * .32)
      if (lenis) { lenis.resize(); lenis.scrollTo(y, { immediate: true, force: true }) }
      else window.scrollTo(0, y)
      ScrollTrigger.update()
    }
    restore()
    restoreFrame = requestAnimationFrame(restore)
    restoreTimer = window.setTimeout(() => {
      ScrollTrigger.sort(); ScrollTrigger.refresh(); restore()
      restoring = false; rememberChapter()
    }, 180)
  }
  window.addEventListener('scroll', trackChapter, { passive: true })
  motion.addEventListener('change', onMotionChange)
  rememberChapter()

  // Pins must refresh in document order no matter which mounted first
  // (the ML pin mounts from a layout effect, before the board's). A pending
  // restore is re-applied after each refresh, once the pins have their size.
  const settle = () => {
    ScrollTrigger.sort()
    ScrollTrigger.refresh()
    if (pendingRestore !== null) window.scrollTo(0, pendingRestore)
  }
  let alive = true
  const settleTimer = window.setTimeout(() => { if (alive) settle() }, 60)
  document.fonts?.ready
    .then(() => {
      if (!alive) return
      settle()
      pendingRestore = null
    })
    .catch(() => {})

  const cleanupBase = () => {
    alive = false
    window.clearTimeout(settleTimer)
    window.removeEventListener('pagehide', onPageHide)
    window.removeEventListener('pageshow', onPageShow)
    window.removeEventListener('scroll', trackChapter)
    motion.removeEventListener('change', onMotionChange)
    cancelAnimationFrame(trackingFrame); cancelAnimationFrame(restoreFrame); clearTimeout(restoreTimer)
  }

  // 120Hz-safe pin behavior; a mobile URL-bar resize must not re-measure pins
  ScrollTrigger.config({ ignoreMobileResize: true })

  setScrollMotion()
  gsap.ticker.lagSmoothing(0)

  return () => {
    cleanupBase()
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
