import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { mlProcess } from '../content'
import { drive } from '../lib/deck'
import { RUNWAY_MEDIA } from '../lib/motion'
import { TypedHeading } from './TypedText'
import ScrollFilm from './ScrollFilm'

/** Nine frames of the film itself, evenly spaced (scripts/cinema/stills.mjs): the picture whenever the video is not exactly there. */
const ML_STILLS = Array.from({ length: 9 }, (_, i) => `/assets/scenes/blackhole-${String(Math.round(i * 12.5)).padStart(3, '0')}.webp`)

/** One continuous playhead: scrolling evolves the field and illuminates each step. */
export default function MLProcess() {
  const root = useRef<HTMLElement>(null)
  const track = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = root.current
    if (!el) return
    const rows = Array.from(el.querySelectorAll<HTMLElement>('[data-ml-step]'))
    const media = gsap.matchMedia(el)
    media.add(RUNWAY_MEDIA, () => {
      // A paused timeline that follows the chapter's run: no trigger, nothing to refresh.
      const tl = gsap.timeline({ paused: true })
      tl.fromTo(track.current, { scaleY: 0 }, { scaleY: 1, duration: 1, ease: 'none' }, 0)
      rows.forEach((row,i) => {
        tl.fromTo(row, { opacity: .9, x: 10 }, { opacity: 1, x: 0, duration: .12, ease: 'power2.out' }, i / Math.max(1, rows.length) * .8)
      })
      const off = drive('ml-process', (v) => tl.progress(v))
      return () => { off(); tl.revert() }
    })
    return () => media.revert()
  }, [])
  return <section ref={root} id="ml-process" className="scene-chapter scene-chapter--ml" aria-label={mlProcess.heading}>
    <div className="scene-stage">
      <ScrollFilm src="/assets/blackhole-g6.mp4" srcSmall="/assets/blackhole-g6-540.mp4" poster="/assets/scenes/black-hole.webp" stills={ML_STILLS} />
      <div className="scene-edge scene-edge--top" />
      <div className="scene-edge scene-edge--bottom" />
      <div className="container-site scene-content">
        <div className="scene-copy">
          <p className="scene-eyebrow"><span />How our AI learns</p>
          <TypedHeading text={mlProcess.heading} alt="Adapt" className="scene-title scene-title--serif" caret="bg-[#ebe0cc]" />
          <div className="ml-sequence">
            <div ref={track} className="ml-sequence-track" />
            {mlProcess.steps.map((step,i) => <div key={`${step.n}-${i}`} data-ml-step className="ml-step">
              <span className="ml-step-number">{step.n}</span>
              <div><h3>{step.title}</h3><p>{step.text}</p></div>
            </div>)}
          </div>
        </div>
      </div>
      <div className="scene-caption"><span>5 steps</span><span>Events are next</span><span aria-hidden="true">↓</span></div>
    </div>
  </section>
}
