import { useEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { EASE } from './eases'
import { prefersReducedMotion } from './motion'

gsap.registerPlugin(ScrollTrigger, SplitText)

/**
 * Scroll-entrance choreography (§5.8). Any element inside the watched root can
 * opt in with data-reveal:
 *   data-reveal="heading"  — split into masked lines rising with a slight uncurl
 *   data-reveal="para"     — fade up 24px
 *   data-reveal="card"     — settle from a 6° 3D tilt, scale 0.94 → 1
 *   data-reveal="colossal" — scrubbed swell tied to scroll, both directions
 * Elements sharing a .section ancestor ride ONE section timeline so co-viewport
 * elements arrive as a phrase: heading at 0, paras at 0.12, cards and counter
 * panels staggered from 0.2. Reduced motion turns everything into a simple fade.
 */
export function useSectionReveals(rootRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const ctx = gsap.context(() => {
      const reduced = prefersReducedMotion()
      const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'))

      if (reduced) {
        targets.forEach((el) => {
          gsap.fromTo(
            el,
            { opacity: 0 },
            {
              opacity: 1,
              duration: 0.6,
              scrollTrigger: { trigger: el, start: 'top 86%', once: true },
            },
          )
        })
        return
      }

      // Masked lines; the whole cascade must land inside 1.2 s
      const headingLines = (el: HTMLElement) => {
        const split = SplitText.create(el, {
          type: 'lines',
          mask: 'lines',
          autoSplit: true,
          linesClass: 'reveal-line',
        })
        gsap.set(el, { opacity: 1 })
        return split.lines
      }
      const headingVars = (lines: Element[]) => ({
        yPercent: 112,
        rotation: 2.5,
        transformOrigin: '0% 100%',
        duration: 0.95,
        ease: EASE.out,
        stagger: {
          each: lines.length > 1 ? Math.min(0.06, (1.2 - 0.95) / (lines.length - 1)) : 0.06,
          from: 'start' as const,
        },
      })

      const paraFrom = { opacity: 0, y: 24 }
      const paraTo = { opacity: 1, y: 0, duration: 0.65, ease: EASE.out }

      // Prose leads arrive a word at a time — the whole phrase inside ~0.6 s
      const paraWords = (el: HTMLElement) => {
        const split = SplitText.create(el, { type: 'words', autoSplit: true })
        gsap.set(el, { opacity: 1 })
        return split.words
      }
      const wordVars = (words: Element[]) => ({
        autoAlpha: 0,
        y: 10,
        duration: 0.55,
        ease: EASE.out,
        stagger: { amount: Math.min(0.6, words.length * 0.028), from: 'start' as const },
      })
      const cardFrom = { opacity: 0, scale: 0.94, rotateX: 6, transformPerspective: 900, y: 30 }
      const cardTo = { opacity: 1, scale: 1, rotateX: 0, y: 0, duration: 0.8, ease: EASE.out }

      // Siblings of one grid/row read as a unit — tighter stagger
      const groupEach = (els: HTMLElement[]) =>
        els.length > 1 && els.every((el) => el.parentElement === els[0].parentElement)
          ? 0.06
          : 0.08

      // Counter panels group with cards, not with prose
      const isCounterPanel = (el: HTMLElement) =>
        !!el.parentElement?.querySelector('[data-counter]')

      // Colossal breathes with the scroll in both directions — never `once`
      targets
        .filter((el) => el.dataset.reveal === 'colossal')
        .forEach((el) => {
          gsap.fromTo(
            el,
            { scale: 0.82, yPercent: 14, autoAlpha: 0 },
            {
              scale: 1,
              yPercent: 0,
              autoAlpha: 1,
              ease: 'none',
              scrollTrigger: { trigger: el, start: 'top 96%', end: 'top 42%', scrub: true },
            },
          )
        })

      const flow = targets.filter((el) => el.dataset.reveal !== 'colossal')
      const bySection = new Map<HTMLElement | null, HTMLElement[]>()
      flow.forEach((el) => {
        const section = el.closest<HTMLElement>('.section')
        bySection.set(section, [...(bySection.get(section) ?? []), el])
      })

      bySection.forEach((els, section) => {
        if (!section) {
          // Outside any .section — per-element entrance
          els.forEach((el) => {
            const trigger = { trigger: el, start: 'top 86%', once: true }
            const kind = el.dataset.reveal
            if (kind === 'heading') {
              const lines = headingLines(el)
              gsap.from(lines, { ...headingVars(lines), scrollTrigger: trigger })
            } else if (kind === 'card') {
              gsap.fromTo(el, cardFrom, { ...cardTo, scrollTrigger: trigger })
            } else if (kind === 'para' && !isCounterPanel(el)) {
              const words = paraWords(el)
              gsap.from(words, { ...wordVars(words), scrollTrigger: trigger })
            } else {
              gsap.fromTo(el, paraFrom, { ...paraTo, scrollTrigger: trigger })
            }
          })
          return
        }

        const tl = gsap.timeline({
          defaults: { ease: EASE.out },
          scrollTrigger: {
            trigger: section,
            start: 'top 78%',
            once: true,
            fastScrollEnd: true,
          },
        })

        const headings = els.filter((el) => el.dataset.reveal === 'heading')
        const paras = els.filter((el) => el.dataset.reveal === 'para' && !isCounterPanel(el))
        const counters = els.filter((el) => el.dataset.reveal === 'para' && isCounterPanel(el))
        const cards = els.filter((el) => el.dataset.reveal === 'card')
        const rest = els.filter(
          (el) => el.dataset.reveal !== 'heading' && el.dataset.reveal !== 'para' && el.dataset.reveal !== 'card',
        )

        // Start states must paint at build time, not when the trigger fires
        const now = { immediateRender: true }
        headings.forEach((el) => {
          const lines = headingLines(el)
          tl.from(lines, { ...headingVars(lines), ...now }, 0)
        })
        paras.forEach((el, i) => {
          const words = paraWords(el)
          tl.from(words, { ...wordVars(words), ...now }, 0.12 + i * 0.1)
        })
        if (counters.length)
          tl.fromTo(counters, paraFrom, { ...paraTo, ...now, stagger: groupEach(counters) }, 0.2)
        if (cards.length)
          tl.fromTo(cards, cardFrom, { ...cardTo, ...now, stagger: groupEach(cards) }, 0.2)
        if (rest.length)
          tl.fromTo(rest, paraFrom, { ...paraTo, ...now, stagger: groupEach(rest) }, 0.2)
      })
    }, root)

    return () => ctx.revert()
  }, [rootRef])
}

/**
 * Scrubbed depth pass — [data-depth="N"] drifts y +N → −N px across the
 * section's full viewport transit. Transforms only; fixed elements are skipped.
 */
export function useSectionDepth(rootRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (prefersReducedMotion()) return

    const ctx = gsap.context(() => {
      root.querySelectorAll<HTMLElement>('[data-depth]').forEach((el) => {
        const depth = Number(el.dataset.depth)
        if (!depth || getComputedStyle(el).position === 'fixed') return
        gsap.fromTo(
          el,
          { y: depth },
          {
            y: -depth,
            ease: 'none',
            scrollTrigger: { trigger: root, start: 'top bottom', end: 'bottom top', scrub: true },
          },
        )
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
