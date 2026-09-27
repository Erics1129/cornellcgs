import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { mlProcess } from '../content'
import { TypedHeading } from './TypedText'
import ScrollFilm from './ScrollFilm'

gsap.registerPlugin(ScrollTrigger)

/** One continuous playhead: scrolling evolves the field and illuminates each step. */
export default function MLProcess() {
  const root = useRef<HTMLElement>(null)
  const track = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = root.current
    if (!el) return
    const rows = Array.from(el.querySelectorAll<HTMLElement>('[data-ml-step]'))
    const media = gsap.matchMedia(el)
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: 'top top', end: 'bottom bottom', scrub: true } })
      tl.fromTo(track.current, { scaleY: 0 }, { scaleY: 1, duration: 1, ease: 'none' }, 0)
      rows.forEach((row,i) => {
        tl.fromTo(row, { opacity: .8, x: 10 }, { opacity: 1, x: 0, duration: .12, ease: 'power2.out' }, i / Math.max(1, rows.length) * .8)
      })
    })
    return () => media.revert()
  }, [])
  return <section ref={root} id="ml-process" className="scene-chapter scene-chapter--ml" aria-label={mlProcess.heading}>
    <div className="scene-stage">
      <ScrollFilm src="/assets/blackhole.mp4" poster="/assets/scenes/black-hole.webp" />
      <div className="scene-edge scene-edge--top" />
      <div className="scene-edge scene-edge--bottom" />
      <div className="container-site scene-content">
        <div className="scene-copy">
          <p className="scene-eyebrow"><span />Machine learning</p>
          <TypedHeading text={mlProcess.heading} alt="Adapt" className="scene-title scene-title--serif" caret="bg-[#b8d7ff]" />
          <div className="ml-sequence">
            <div ref={track} className="ml-sequence-track" />
            {mlProcess.steps.map((step,i) => <div key={`${step.n}-${i}`} data-ml-step className="ml-step">
              <span className="ml-step-number">{step.n}</span>
              <div><h3>{step.title}</h3><p>{step.text}</p></div>
            </div>)}
          </div>
        </div>
      </div>
      <div className="scene-caption"><span>01 — 05</span><span>Keep exploring</span><span aria-hidden="true">↓</span></div>
    </div>
  </section>
}
