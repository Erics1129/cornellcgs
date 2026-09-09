import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import '../styles/scroll-words.css'

gsap.registerPlugin(ScrollTrigger)
type Treatment = 'mask' | 'cascade' | 'illuminate' | 'spread'

/** Real text with reversible, per-word choreography. No cloned accessibility text. */
export default function ScrollWords({ text, treatment = 'mask' }: { text: string; treatment?: Treatment }) {
  const root = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const media = gsap.matchMedia()
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const words = el.querySelectorAll<HTMLElement>('[data-scroll-word]')
      const timeline = gsap.timeline({ scrollTrigger: {
        trigger: el.parentElement, start: 'top 94%', end: 'top 48%',
        scrub: true, invalidateOnRefresh: true,
      } })
      words.forEach((word, i) => {
        const from = treatment === 'mask' ? { yPercent: 112, rotation: 1.3, opacity: 1 }
          : treatment === 'cascade' ? { x: i % 2 ? 32 : -20, y: 12, opacity: .08 }
          : treatment === 'spread' ? { x: (i - (words.length - 1) / 2) * 16, y: 8, opacity: .14 }
          : { y: 0, opacity: .16 }
        timeline.fromTo(word, from, {
          x: 0, y: 0, yPercent: 0, rotation: 0, opacity: 1,
          duration: treatment === 'illuminate' ? .22 : .55,
          ease: treatment === 'illuminate' ? 'none' : 'power2.out',
        }, i * (treatment === 'illuminate' ? .12 : .065))
      })
      return () => { timeline.scrollTrigger?.kill(); timeline.revert() }
    }, el)
    return () => media.revert()
  }, [text, treatment])

  return <span ref={root} className={`scroll-words scroll-words--${treatment}`} data-word-treatment={treatment}>
    {text.split('*').flatMap((part, segment) => part.split(/(\s+)/).map((word, index) => {
      if (!word || /^\s+$/.test(word)) return word
      const inner = segment % 2 ? <em data-scroll-word>{word}</em> : <span data-scroll-word>{word}</span>
      return <span className="scroll-word-frame" key={`${segment}-${index}`}>{inner}</span>
    }))}
  </span>
}
