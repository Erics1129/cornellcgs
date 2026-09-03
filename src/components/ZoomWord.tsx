import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { EASE } from '../lib/eases'
import { prefersReducedMotion } from '../lib/motion'

gsap.registerPlugin(ScrollTrigger)

/**
 * A statement slide. One word fills the screen; keep scrolling and it
 * shrinks into its place in the sentence, then the rest of the line and the
 * lead arrive. The section pins for ~1.5 viewports and everything is
 * scrubbed, so the reader drives it forward and back — transforms only.
 *
 * The word's final layout position is measured from offsets (pinned rects
 * read garbage mid-refresh), and every value is a function so a resize or
 * font swap re-derives it (invalidateOnRefresh).
 */
export default function ZoomWord({
  id,
  word,
  rest,
  lead,
}: {
  id: string
  word: string
  /** the rest of the sentence after the word (may start with punctuation) */
  rest: string
  lead: string
}) {
  const root = useRef<HTMLElement>(null)
  const wordRef = useRef<HTMLSpanElement>(null)
  const restRef = useRef<HTMLSpanElement>(null)
  const leadRef = useRef<HTMLParagraphElement>(null)

  useLayoutEffect(() => {
    const section = root.current
    const w = wordRef.current
    const r = restRef.current
    const l = leadRef.current
    if (!section || !w || !r || !l) return

    if (prefersReducedMotion()) {
      gsap.set([r, l], { opacity: 1 })
      return
    }

    // Final position of the word when the section is pinned at the top
    const target = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      let left = 0
      let top = 0
      let el: HTMLElement | null = w
      while (el && el !== section) {
        left += el.offsetLeft
        top += el.offsetTop
        el = el.offsetParent as HTMLElement | null
      }
      const cw = w.offsetWidth
      const ch = w.offsetHeight
      const scale = Math.min((vw * 0.84) / cw, (vh * 0.42) / ch)
      return {
        x: vw / 2 - (left + cw / 2),
        y: vh / 2 - (top + ch / 2),
        scale: Math.max(1.6, scale),
      }
    }

    const ctx = gsap.context(() => {
      gsap.set(w, { transformOrigin: '50% 50%', willChange: 'transform' })
      gsap.set([r, l], { opacity: 0 })

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: '+=160%',
          pin: true,
          scrub: 0.4,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          refreshPriority: 1,
        },
      })

      // 0 → 0.62: the word travels from the middle of the screen into the line
      tl.fromTo(
        w,
        { x: () => target().x, y: () => target().y, scale: () => target().scale },
        { x: 0, y: 0, scale: 1, duration: 0.62, ease: 'power1.inOut' },
        0,
      )
      // 0.5 → 0.78: the rest of the sentence rises in behind it
      tl.fromTo(r, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.28, ease: EASE.out }, 0.5)
      // 0.7 → 1: the lead line
      tl.fromTo(l, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.3, ease: EASE.out }, 0.7)
    }, section)

    return () => ctx.revert()
  }, [])

  return (
    <section ref={root} id={id} className="section overflow-x-clip" aria-label={`${word}${rest}`}>
      <div className="container-site">
        <h2 className="h-section max-w-[18ch]">
          <span ref={wordRef} className="inline-block">
            {word}
          </span>
          <span ref={restRef} className="inline">
            {rest}
          </span>
        </h2>
        <p ref={leadRef} className="body-muted mt-6 max-w-[40ch] text-[max(1.1rem,18px)]">
          {lead}
        </p>
      </div>
    </section>
  )
}
