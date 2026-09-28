import { useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import SectionIndex from './SectionIndex'
import ScrollWords from './ScrollWords'
import Dice from './Dice'
import { whoWeAre } from '../content'
import '../styles/identity-chapter.css'

gsap.registerPlugin(ScrollTrigger)

/** A sculptural identity chapter with a scroll-led entrance. */
export default function WhoWeAre() {
  const root = useRef<HTMLElement>(null)
  const [paused, setPaused] = useState(false)
  useLayoutEffect(() => {
    const media = gsap.matchMedia(root)
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const section = root.current!
      const timeline = gsap.timeline({ scrollTrigger: { trigger: section, start: 'top 85%', end: 'center 55%', scrub: .4 } })
      timeline.fromTo(section.querySelector('.identity-object'), { y: 70, scale: .84, rotation: -8 },
        { y: 0, scale: 1, rotation: 0, duration: 1, ease: 'power2.out' }, 0)
        .fromTo(section.querySelectorAll('[data-identity-copy]'), { opacity: 0, y: 25 },
          { opacity: 1, y: 0, duration: .65, stagger: .12, ease: 'power2.out' }, .12)
    })
    return () => media.revert()
  }, [])
  const facts = whoWeAre.counters.filter(counter => counter.value !== null)
  return <section ref={root} id="who-we-are" className="section identity-chapter">
    <SectionIndex rank="K" />
    <div className="container-site identity-layout">
      <div className="identity-copy">
        <p data-identity-copy className="identity-eyebrow">Cornell CGS</p>
        <h2 className="identity-title"><ScrollWords text={whoWeAre.heading} treatment="illuminate" /></h2>
        {whoWeAre.paragraphs.map(line => <p data-identity-copy className="identity-lead" key={line}>{line}</p>)}
        <a data-identity-copy href="/whoWeAre/" className="identity-link">About us <span aria-hidden="true">↗</span></a>
        {facts.length > 0 && <dl className="identity-facts">{facts.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>}
      </div>
      <figure className="identity-figure" aria-label="The CGS logo: an illuminated cube assembled from moving metallic blocks">
        <div className="identity-object"><Dice size={640} paused={paused} /></div>
        <figcaption><span>Built together.</span><button type="button" onClick={() => setPaused(!paused)} aria-pressed={paused}
          aria-label={paused ? 'Play logo animation' : 'Pause logo animation'}><span aria-hidden="true">{paused ? '▷' : 'Ⅱ'}</span>{paused ? 'Play' : 'Pause'}</button></figcaption>
      </figure>
    </div>
  </section>
}
