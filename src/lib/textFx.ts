import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { EASE } from './eases'
import { prefersReducedMotion } from './motion'

gsap.registerPlugin(ScrollTrigger)

/**
 * Headline treatments the chapters share. Each returns a cleanup. All are
 * transform / opacity / clip-path / background-position only.
 *
 *   zoomWord      — the one zoom: a word fills the screen and shrinks into its
 *                   sentence as the chapter scrolls in (scrubbed, no pin)
 *   sweepHeadline — a gradient headline wipes on and a highlight travels
 *                   through it (scrubbed against a caller-supplied range)
 *   gatherWord    — widely spaced letters close ranks while a gradient ignites
 *                   through their outline (once, on enter)
 *   drawRules     — hairlines draw in left→right, staggered (once, on enter)
 */

export const GRADIENT_ICE = 'linear-gradient(100deg, #f2f5ff 0%, #cfe0ff 45%, #7a9dff 100%)'
export const GRADIENT_WARM = 'linear-gradient(100deg, #ffe3b0 0%, #fff5e1 35%, #9fc3ff 100%)'

/** Paint text with a gradient (inline, so it survives any class order). */
export function gradientText(el: HTMLElement, image: string, sweep = false) {
  el.style.backgroundImage = image
  el.style.webkitBackgroundClip = 'text'
  el.style.backgroundClip = 'text'
  el.style.color = 'transparent'
  if (sweep) el.style.backgroundSize = '300% 100%'
}

/** Where a word must travel from so it starts centered and huge. */
function travel(word: HTMLElement, section: HTMLElement, maxW: number, maxH: number) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  let left = 0
  let top = 0
  let el: HTMLElement | null = word
  while (el && el !== section) {
    left += el.offsetLeft
    top += el.offsetTop
    el = el.offsetParent as HTMLElement | null
  }
  const cw = word.offsetWidth
  const ch = word.offsetHeight
  return {
    x: vw / 2 - (left + cw / 2),
    y: vh / 2 - (top + ch / 2),
    scale: Math.max(1.5, Math.min((vw * maxW) / cw, (vh * maxH) / ch)),
  }
}

export function zoomWord(
  word: HTMLElement,
  section: HTMLElement,
  others: Element[],
  opts: { start?: string; end?: string; maxW?: number; maxH?: number } = {},
): () => void {
  if (prefersReducedMotion()) {
    gsap.set(others, { opacity: 1 })
    return () => {}
  }
  const ctx = gsap.context(() => {
    gsap.set(word, { transformOrigin: '50% 50%', willChange: 'transform' })
    gsap.set(others, { opacity: 0 })
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: opts.start ?? 'top bottom',
        end: opts.end ?? 'top 12%',
        scrub: 0.4,
        invalidateOnRefresh: true,
      },
    })
    const t = () => travel(word, section, opts.maxW ?? 0.8, opts.maxH ?? 0.4)
    tl.fromTo(
      word,
      { x: () => t().x, y: () => t().y, scale: () => t().scale },
      { x: 0, y: 0, scale: 1, duration: 0.7, ease: 'power1.inOut' },
      0,
    )
    tl.fromTo(others, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.3, ease: EASE.out, stagger: 0.06 }, 0.62)
  })
  return () => ctx.revert()
}

export function sweepHeadline(
  el: HTMLElement,
  trigger: { trigger: Element; start: string; end: string },
): () => void {
  if (prefersReducedMotion()) return () => {}
  const ctx = gsap.context(() => {
    gsap.set(el, { clipPath: 'inset(0 100% 0 0)', backgroundPosition: '100% 0' })
    const tl = gsap.timeline({ scrollTrigger: { ...trigger, scrub: 0.4, invalidateOnRefresh: true } })
    tl.to(el, { clipPath: 'inset(0 0% 0 0)', duration: 0.5, ease: 'none' }, 0)
    tl.to(el, { backgroundPosition: '0% 0', duration: 0.7, ease: 'none' }, 0.25)
  })
  return () => ctx.revert()
}

/**
 * `wrapper` holds two stacked copies of the word: `outline` (text-stroke,
 * transparent fill, aria-hidden) and `fill` (gradient text, absolute inset-0).
 */
export function gatherWord(
  wrapper: HTMLElement,
  outline: HTMLElement,
  fill: HTMLElement,
  trigger: Element,
  spread = window.matchMedia('(max-width: 480px)').matches ? '0.3em' : '0.5em',
): () => void {
  if (prefersReducedMotion()) {
    gsap.set(fill, { opacity: 1 })
    gsap.set(outline, { opacity: 0 })
    return () => {}
  }
  const ctx = gsap.context(() => {
    gsap.set(wrapper, { letterSpacing: spread })
    gsap.set(fill, { opacity: 0 })
    const tl = gsap.timeline({ scrollTrigger: { trigger, start: 'top 72%', once: true, fastScrollEnd: true } })
    tl.to(wrapper, { letterSpacing: '-0.01em', duration: 1.2, ease: 'power2.inOut' }, 0)
    tl.to(fill, { opacity: 1, duration: 0.7, ease: 'none' }, 0.45)
    tl.to(outline, { opacity: 0, duration: 0.5, ease: 'none' }, 0.8)
  })
  return () => ctx.revert()
}

export function drawRules(rules: Element[], trigger: Element): () => void {
  if (prefersReducedMotion()) return () => {}
  const ctx = gsap.context(() => {
    gsap.set(rules, { scaleX: 0, transformOrigin: '0% 50%' })
    gsap.to(rules, {
      scaleX: 1,
      duration: 0.8,
      ease: EASE.out,
      stagger: 0.12,
      scrollTrigger: { trigger, start: 'top 80%', once: true, fastScrollEnd: true },
    })
  })
  return () => ctx.revert()
}
