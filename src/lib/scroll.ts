import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { prefersReducedMotion } from './motion'
import { nav } from '../content'

gsap.registerPlugin(ScrollTrigger)

let lenis: Lenis | null = null

export function getLenis(): Lenis | null {
  return lenis
}

/**
 * Strict chapter separation: when scrolling settles near a chapter boundary,
 * glide the viewport onto it so every page starts clean. Far from boundaries
 * (inside pinned scenes) nothing snaps.
 */
function initChapterSnap(l: Lenis): () => void {
  let snapping = false
  let idleTimer = 0

  const boundaries = () =>
    ['top', ...nav.map((n) => n.id)]
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el)
      .map((el) => el.getBoundingClientRect().top + window.scrollY)

  const settle = () => {
    if (snapping) return
    const y = window.scrollY
    let best = -1
    let bd = Infinity
    for (const b of boundaries()) {
      const d = Math.abs(y - b)
      if (d < bd) {
        bd = d
        best = b
      }
    }
    if (best < 0 || bd < 2 || bd > window.innerHeight * 0.55) return
    snapping = true
    l.scrollTo(best, {
      duration: 0.85,
      easing: (t: number) => 1 - Math.pow(1 - t, 3),
      lock: true,
      onComplete: () => {
        snapping = false
      },
    })
  }

  const onScroll = () => {
    if (snapping) return
    window.clearTimeout(idleTimer)
    idleTimer = window.setTimeout(() => {
      if (Math.abs(l.velocity) < 0.15) settle()
    }, 160)
  }

  l.on('scroll', onScroll)
  return () => {
    window.clearTimeout(idleTimer)
    l.off('scroll', onScroll)
  }
}

/** Boot Lenis smooth scrolling and keep ScrollTrigger in sync with it. */
export function initSmoothScroll(): () => void {
  if (prefersReducedMotion()) {
    return () => {}
  }

  lenis = new Lenis({ lerp: 0.08 })
  lenis.on('scroll', ScrollTrigger.update)

  const tick = (time: number) => lenis?.raf(time * 1000)
  gsap.ticker.add(tick)
  gsap.ticker.lagSmoothing(0)

  const stopSnap = initChapterSnap(lenis)

  return () => {
    stopSnap()
    gsap.ticker.remove(tick)
    lenis?.destroy()
    lenis = null
  }
}

/** Smooth-scroll to an in-page anchor, respecting the nav offset. */
export function scrollToId(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  if (lenis) {
    lenis.scrollTo(el, { offset: 0, duration: 1.4 })
  } else {
    el.scrollIntoView({ behavior: 'auto' })
  }
}
