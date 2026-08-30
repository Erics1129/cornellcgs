import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { prefersReducedMotion } from './motion'

gsap.registerPlugin(ScrollTrigger)

let lenis: Lenis | null = null

export function getLenis(): Lenis | null {
  return lenis
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

  return () => {
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
