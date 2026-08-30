import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { prefersReducedMotion } from './motion'

gsap.registerPlugin(ScrollTrigger)

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

/** Pin-aware chapter top: a pinned chapter starts where its trigger starts. */
function chapterTop(el: HTMLElement): number {
  for (const st of ScrollTrigger.getAll()) {
    if (st.pin && st.trigger === el && st.start >= 0) return Math.round(st.start)
  }
  return Math.round(el.getBoundingClientRect().top + window.scrollY)
}

/** Boot smooth scrolling. The old name is kept so App.tsx stays untouched. */
export function initSmoothScroll(): () => void {
  // The site always opens on the hero — never on a restored mid-scroll.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
  window.scrollTo(0, 0)

  // Pins must refresh in document order no matter which mounted first
  // (the ML pin mounts from a layout effect, before the board's).
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

  if (prefersReducedMotion()) return () => {}

  lenis = new Lenis({ lerp: 0.09 })
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

/** Glide to a chapter (nav, side rail, CTAs). */
export function scrollToId(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const y = chapterTop(el)
  if (lenis) lenis.scrollTo(y, { duration: 1.2, easing: (t: number) => 1 - Math.pow(1 - t, 3) })
  else window.scrollTo(0, y)
}
