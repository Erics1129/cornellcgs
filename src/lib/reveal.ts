import { useEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { prefersReducedMotion } from './motion'

gsap.registerPlugin(ScrollTrigger, SplitText)

/**
 * Scroll-entrance choreography (§5.8). Any element inside the watched root can
 * opt in with data-reveal:
 *   data-reveal="heading" — split into lines, each masked, rising with blur
 *   data-reveal="para"    — fade up 24px
 *   data-reveal="card"    — settle from a 6° 3D tilt, scale 0.94 → 1
 * Reduced motion turns everything into a simple fade.
 */
export function useSectionReveals(rootRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const ctx = gsap.context(() => {
      const reduced = prefersReducedMotion()
      const targets = root.querySelectorAll<HTMLElement>('[data-reveal]')

      targets.forEach((el) => {
        const kind = el.dataset.reveal
        const trigger = {
          trigger: el,
          start: 'top 82%',
          once: true,
        }

        if (reduced) {
          gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.6, scrollTrigger: trigger })
          return
        }

        if (kind === 'heading') {
          const split = SplitText.create(el, {
            type: 'lines',
            mask: 'lines',
            autoSplit: true,
            linesClass: 'reveal-line',
          })
          gsap.set(el, { opacity: 1 })
          gsap.from(split.lines, {
            yPercent: 110,
            filter: 'blur(8px)',
            duration: 1.1,
            ease: 'power3.out',
            stagger: 0.06,
            scrollTrigger: trigger,
          })
        } else if (kind === 'card') {
          gsap.fromTo(
            el,
            { opacity: 0, scale: 0.94, rotateX: 6, transformPerspective: 900, y: 30 },
            {
              opacity: 1,
              scale: 1,
              rotateX: 0,
              y: 0,
              duration: 1.1,
              ease: 'power3.out',
              scrollTrigger: trigger,
            },
          )
        } else {
          gsap.fromTo(
            el,
            { opacity: 0, y: 24 },
            { opacity: 1, y: 0, duration: 0.9, ease: 'power2.out', scrollTrigger: trigger },
          )
        }
      })
    }, root)

    return () => ctx.revert()
  }, [rootRef])
}

/** Count-up counters over 1.4 s when they enter the viewport. */
export function animateCounter(el: HTMLElement, value: number, noSeparator = false) {
  const format = (v: number) =>
    noSeparator ? String(Math.round(v)) : Math.round(v).toLocaleString('en-US')
  const state = { v: 0 }
  return gsap.to(state, {
    v: value,
    duration: prefersReducedMotion() ? 0 : 1.4,
    ease: 'power2.out',
    onUpdate: () => {
      el.textContent = format(state.v)
    },
    scrollTrigger: { trigger: el, start: 'top 85%', once: true },
  })
}
