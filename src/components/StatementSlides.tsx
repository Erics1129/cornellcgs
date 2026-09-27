import { useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { dealCard, shadowStyle } from '../lib/cardMotion'
import { chapterType } from '../lib/chapterType'
import GoGame from './GoGame'
import '../styles/showcase-motion.css'

gsap.registerPlugin(ScrollTrigger)

type SceneBuilder = (section: HTMLElement, desktop: boolean) => void | (() => void)

/** Preference and breakpoint changes restore the original static composition. */
function useScene(root: React.RefObject<HTMLElement | null>, build: SceneBuilder, rest?: (section: HTMLElement) => void) {
  useLayoutEffect(() => {
    const section = root.current
    if (!section) return
    const media = gsap.matchMedia(section)
    media.add({
      all: 'all',
      motion: '(prefers-reduced-motion: no-preference)',
      desktop: '(min-width: 768px) and (min-height: 620px)',
    }, (context) => {
      if (context.conditions?.motion) return build(section, !!context.conditions.desktop)
      rest?.(section)
    })
    return () => media.revert()
  }, [])
}

export function AlphaGoSlide() {
  const root = useRef<HTMLElement>(null)
  const camera = useRef<HTMLDivElement>(null)
  const [paused, setPaused] = useState(false)
  useScene(root, (section, desktop) => {
    const copy = section.querySelectorAll('[data-alpha-copy]')
    gsap.set(copy, { opacity: 0, y: 12 })
    const tl = gsap.timeline({ scrollTrigger: {
      id: 'support-alphago', trigger: section,
      start: desktop ? 'top top' : 'top 85%',
      end: desktop ? '+=105%' : 'top 16%',
      pin: desktop, scrub: 0.35, anticipatePin: 1, invalidateOnRefresh: true,
    } })
    chapterType(tl, section.querySelector('[data-chapter-type]'), 'sweep', 0, 0.45)
    tl.fromTo(section.querySelector('[data-go-image]'), { xPercent: 4, yPercent: 5, opacity: 0.72 }, { xPercent: 0, yPercent: 0, opacity: 0.96, duration: 0.85, ease: 'none' }, 0)
      .fromTo(section.querySelector('[data-go-shade]'), { opacity: 0.36 }, { opacity: 0.18, duration: 0.72, ease: 'none' }, 0)
      .to(copy, { opacity: 1, y: 0, duration: 0.24, stagger: 0.08, ease: 'power2.out' }, 0.22)
      .to({}, { duration: 0.13 })
  })
  return (
    <section ref={root} id="alphago" className="section support-scene alpha-scene" data-chapter-surface="dark" aria-labelledby="alphago-title">
      <div ref={camera} className="alpha-camera">
      <div className="go-study" aria-hidden="true">
        <GoGame camera={camera} paused={paused} />
        <div data-go-shade className="go-study-shade" />
      </div>
      <div className="container-site alpha-copy">
        <h2 id="alphago-title" data-chapter-type="sweep" className="h-section alpha-word">AlphaGo</h2>
        <p data-alpha-copy className="body-muted support-lead">An inspiration for agents that learn through play.</p>
      </div>
      </div>
      <button type="button" className="alpha-pause" aria-label={paused ? 'Resume Go animation' : 'Pause Go animation'} aria-pressed={paused} onClick={() => setPaused(!paused)}>
        <span aria-hidden="true">{paused ? '▷' : 'Ⅱ'}</span>{paused ? 'Resume game' : 'Pause game'}
      </button>
    </section>
  )
}

export function ProjectSlide() {
  const root = useRef<HTMLElement>(null)
  useScene(root, (section, desktop) => {
    const cards = Array.from(section.querySelectorAll<HTMLElement>('[data-project-card]'))
    const shadows = section.querySelectorAll<HTMLElement>('[data-project-shadow]')
    const copy = section.querySelectorAll('[data-project-copy]')
    gsap.set(copy, { opacity: 0, y: 12 })
    const tl = gsap.timeline({ scrollTrigger: {
      id: 'support-project', trigger: section, start: 'top 80%', end: 'center 48%',
      scrub: 0.3, invalidateOnRefresh: true,
    } })
    chapterType(tl, section.querySelector('[data-chapter-type]'), 'rise', 0, 0.46)
    cards.forEach((card, i) => {
      const side = i ? 1 : -1
      tl.add(dealCard(card, {
        from: { x: side * (desktop ? 340 : 170), y: desktop ? -140 : -90, rotation: side * 42 },
        rotation: side * 11, duration: 0.44, lift: -34, air: 1.04,
        shadow: shadows[i], immediate: true,
      }), 0.06 + i * 0.1)
    })
    tl.to(copy, {
      opacity: 1, y: 0, duration: 0.26, stagger: 0.08, ease: 'power2.out',
    }, 0.28)
  }, section => {
    // A refresh can capture a nested deal's airborne state. Always land the
    // cards when motion is disabled, including preference changes mid-scroll.
    gsap.set(section.querySelectorAll('[data-project-card]'), {
      x: 0, y: 0, rotation: (i: number) => i ? 11 : -11, scale: 1, opacity: 1,
    })
    gsap.set(section.querySelectorAll('[data-project-shadow]'), { scale: 1, opacity: 0.48 })
  })
  return (
    <section ref={root} id="project" className="section support-scene project-scene" data-chapter-surface="world" aria-labelledby="project-title">
      <div className="container-site project-layout">
        <div className="project-copy">
          <h2 id="project-title" data-chapter-type="rise" className="project-title" aria-label="Throwing Eggs">
            <span className="chapter-type-mask" aria-hidden="true"><span data-chapter-glyph>Throwing</span></span>
            <span className="chapter-type-mask" aria-hidden="true"><span data-chapter-glyph>Eggs</span></span>
          </h2>
          <p data-project-copy className="project-description">Our card-game agent. In training.</p>
        </div>
        <div className="project-table" aria-hidden="true">
          <div className="project-table-light" />
          {[-1, 1].map((side, i) => (
            <div key={side} className={`project-card-holder project-card-holder-${i}`}>
              <div data-project-shadow style={shadowStyle()} />
              <div data-project-card className="card-back-surface project-card" style={{ transform: `rotate(${side * 11}deg)` }} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function AnyoneSlide() {
  const root = useRef<HTMLElement>(null)
  useScene(root, (section) => {
    const copy = section.querySelectorAll('[data-anyone-copy]')
    gsap.set(copy, { opacity: 0, y: 16 })
    const tl = gsap.timeline({ scrollTrigger: {
      id: 'support-anyone', trigger: section, start: 'top 82%', end: 'center 48%',
      scrub: 0.35, invalidateOnRefresh: true,
    } })
    chapterType(tl, section.querySelector('[data-chapter-type]'), 'gather', 0, 0.52)
    tl.fromTo(section.querySelector('[data-anyone-rule]'), { scaleX: 0 }, { scaleX: 1, duration: 0.38, ease: 'power2.out' }, 0.3)
      .to(copy, { opacity: 1, y: 0, duration: 0.3, stagger: 0.09, ease: 'power2.out' }, 0.5)
  })
  return (
    <section ref={root} id="anyone" className="section support-scene anyone-scene" data-chapter-surface="world" aria-labelledby="together-title">
      <div className="container-site anyone-copy">
        <h2 id="together-title" data-chapter-type="gather" className="anyone-title" aria-label="Together">
          <span aria-hidden="true">{'Together'.split('').map((letter, i) => <span key={i} data-chapter-glyph>{letter}</span>)}</span>
        </h2>
        <div data-anyone-rule className="anyone-rule" aria-hidden="true" />
        <p data-anyone-copy className="anyone-invitation">Study, build, play.</p>
      </div>
    </section>
  )
}
