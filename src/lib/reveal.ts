import { useEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { EASE } from './eases'
import { prefersReducedMotion } from './motion'

gsap.registerPlugin(ScrollTrigger)

/** Short, reversible entrances. Default HTML is visible even before JS runs. */
export function useSectionReveals(rootRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const media = gsap.matchMedia()
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const ctx = gsap.context(() => {
        root.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
          // Counter timelines own their text; this only brings their container in.
          const type = el.dataset.reveal
          const distance = type === 'card' ? 36 : type === 'heading' ? 28 : 18
          gsap.fromTo(el, { y: distance, opacity: .12 }, {
            y: 0, opacity: 1, ease: 'none',
            scrollTrigger: { trigger: el, start: 'top 96%', end: 'top 68%', scrub: true, invalidateOnRefresh: true },
          })
        })
      }, root)
      return () => ctx.revert()
    })
    return () => media.revert()
  }, [rootRef])
}

/** Only decorative inner layers travel in depth; content remains easy to read. */
export function useSectionDepth(rootRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current
    if (!root || prefersReducedMotion()) return
    const ctx = gsap.context(() => {
      root.querySelectorAll<HTMLElement>('[data-depth]').forEach(el => {
        const depth = Math.max(-25, Math.min(25, Number(el.dataset.depth)))
        if (!depth || getComputedStyle(el).position === 'fixed' || el.hasAttribute('data-reveal')) return
        gsap.fromTo(el, { y: depth }, { y: -depth, ease: 'none', scrollTrigger: { trigger: root, start: 'top bottom', end: 'bottom top', scrub: true } })
      })
    }, root)
    return () => ctx.revert()
  }, [rootRef])
}

export function animateCounter(el: HTMLElement, value: number, noSeparator = false) {
  const format = (v: number) => noSeparator ? String(Math.round(v)) : Math.round(v).toLocaleString('en-US')
  const state = { v: 0 }
  return gsap.to(state, { v: value, duration: prefersReducedMotion() ? 0 : .8, ease: EASE.out,
    onUpdate: () => { el.textContent = format(state.v) },
    scrollTrigger: { trigger: el, start: 'top 88%', once: true, fastScrollEnd: true },
  })
}
