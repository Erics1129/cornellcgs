import { useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { dealCard, flipCard, shadowStyle } from '../lib/cardMotion'
import { chapterType } from '../lib/chapterType'
import { drive } from '../lib/deck'
import { reveal } from '../lib/reveal'
import GoGame from './GoGame'
import '../styles/cards-motion.css'
import '../styles/showcase-motion.css'

type SceneBuilder = (section: HTMLElement, desktop: boolean) => void | (() => void)

/** Preference and breakpoint changes restore the original static composition. */
function useScene(root: React.RefObject<HTMLElement | null>, build: SceneBuilder, rest?: (section: HTMLElement) => void) {
  useLayoutEffect(() => {
    const section = root.current
    if (!section) return
    const media = gsap.matchMedia(section)
    media.add({
      motion: '(prefers-reduced-motion: no-preference)',
      desktop: '(min-width: 768px) and (min-height: 620px)',
    }, (context) => {
      if (context.conditions?.motion) return build(section, !!context.conditions.desktop)
    })
    if (rest) media.add('(prefers-reduced-motion: reduce)', () => rest(section))
    return () => media.revert()
  }, [])
}

/**
 * AlphaGo. On a desktop the chapter is a sticky runway (deck.css): the words
 * are a latched reveal over the chapter's arrival, so heading and paragraph
 * are complete by the time the stage sticks and stay for the whole run; the
 * board's slow drift follows the run. Elsewhere it is plain flow.
 */
export function AlphaGoSlide() {
  const root = useRef<HTMLElement>(null)
  const camera = useRef<HTMLDivElement>(null)
  const [paused, setPaused] = useState(false)
  useScene(root, (section, desktop) => {
    const copy = section.querySelectorAll('[data-alpha-copy]')
    const heading = section.querySelector<HTMLElement>('[data-chapter-type]')
    const image = section.querySelector('[data-go-image]')
    const shade = section.querySelector('[data-go-shade]')
    const words = (tl: gsap.core.Timeline) => {
      chapterType(tl, heading, 'sweep', 0, 0.45)
      tl.fromTo(copy, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.24, stagger: 0.08, ease: 'power2.out' }, 0.22)
    }
    const board = (tl: gsap.core.Timeline) => {
      if (image) tl.fromTo(image, { xPercent: 4, yPercent: 5, opacity: 0.72 }, { xPercent: 0, yPercent: 0, opacity: 0.96, duration: 0.85, ease: 'none' }, 0)
      if (shade) tl.fromTo(shade, { opacity: 0.36 }, { opacity: 0.18, duration: 0.72, ease: 'none' }, 0)
    }
    if (!desktop) {
      return reveal((tl) => { words(tl); board(tl) }, { id: 'alphago', source: { trigger: section, start: 'top 85%', end: 'top 16%' } })
    }
    const offWords = reveal(words, { id: 'alphago-copy', source: { chapter: 'alphago', key: 'enter', from: 0.35, to: 0.85 } })
    const drift = gsap.timeline({ paused: true })
    board(drift)
    drift.to({}, { duration: 0.13 })
    const offDrift = drive('alphago', (v) => drift.progress(v))
    return () => { offWords(); offDrift(); drift.revert() }
  })
  return (
    <section ref={root} id="alphago" className="section support-scene alpha-scene" data-chapter-surface="dark" aria-labelledby="alphago-title">
      <div className="deck-stage" data-stage>
      <div ref={camera} className="alpha-camera">
      <div className="go-study" aria-hidden="true" data-film-enter="picture">
        <GoGame camera={camera} paused={paused} />
        <div data-go-shade className="go-study-shade" />
      </div>
      <div className="container-site alpha-copy">
        <h2 id="alphago-title" data-chapter-type="sweep" className="h-section alpha-word">AlphaGo</h2>
        <p data-alpha-copy className="body-muted support-lead">Watch the stones land. DeepMind’s AlphaGo beat Lee Sedol in 2016, and it got that strong partly by playing against itself. We train our card game AIs the same way.</p>
      </div>
      </div>
      <button type="button" className="alpha-pause" aria-label={paused ? 'Resume Go animation' : 'Pause Go animation'} aria-pressed={paused} onClick={() => setPaused(!paused)}>
        <span aria-hidden="true">{paused ? '▷' : 'Ⅱ'}</span>{paused ? 'Resume game' : 'Pause game'}
      </button>
      </div>
    </section>
  )
}

const PROJECT_CARDS = [
  { rank: 'A', suit: '♥', red: true, name: 'Guandan', note: 'in training' },
  { rank: 'K', suit: '♠', red: false, name: 'Poker', note: 'equity calculator' },
]

export function ProjectSlide() {
  const root = useRef<HTMLElement>(null)
  useScene(root, (section, desktop) => {
    const cards = Array.from(section.querySelectorAll<HTMLElement>('[data-project-card]'))
    const turns = Array.from(section.querySelectorAll<HTMLElement>('[data-project-turn]'))
    const shadows = section.querySelectorAll<HTMLElement>('[data-project-shadow]')
    const copy = section.querySelectorAll('[data-project-copy]')
    gsap.set(turns, { rotationY: 0 })
    // One latched reveal: it follows the scroll while the page moves and finishes by itself
    // when the page stops, so the reader never rests on a card in mid-air or half turned.
    return reveal((tl) => {
      chapterType(tl, section.querySelector('[data-chapter-type]'), 'rise', 0, 0.46)
      cards.forEach((card, i) => {
        const side = i ? 1 : -1
        tl.add(dealCard(card, {
          from: { x: side * (desktop ? 340 : 170), y: desktop ? -140 : -90, rotation: side * 42 },
          rotation: side * 11, duration: 0.44, lift: -34, air: 1.04,
          shadow: shadows[i], immediate: true,
        }), 0.06 + i * 0.1)
        // once both have landed, they turn over to show what is being built
        tl.add(flipCard(turns[i], true, { fromRotation: 0, duration: 0.42, shadow: shadows[i] }), 0.62 + i * 0.09)
      })
      tl.fromTo(copy, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.26, stagger: 0.08, ease: 'power2.out' }, 0.28)
    }, { id: 'project', settle: 0.45, source: { trigger: section, start: 'top 80%', end: 'center 48%' } })
  }, section => {
    // A refresh can capture a nested deal's airborne state. Always land the
    // cards when motion is disabled, including preference changes mid-scroll.
    gsap.set(section.querySelectorAll('[data-project-card]'), {
      x: 0, y: 0, rotation: (i: number) => i ? 11 : -11, scale: 1, opacity: 1,
    })
    gsap.set(section.querySelectorAll('[data-project-shadow]'), { scale: 1, opacity: 0.48 })
    gsap.set(section.querySelectorAll('[data-project-turn]'), { rotationY: 180 })
  })
  return (
    <section ref={root} id="project" className="section support-scene project-scene" data-chapter-surface="world" aria-labelledby="project-title">
      <div className="container-site project-layout">
        <div className="project-copy">
          <h2 id="project-title" data-chapter-type="rise" className="project-title" aria-label="Current projects">
            <span className="chapter-type-mask" aria-hidden="true"><span data-chapter-glyph>Current</span></span>
            <span className="chapter-type-mask" aria-hidden="true"><span data-chapter-glyph>projects</span></span>
          </h2>
          <p data-project-copy className="project-description">Two cards on the table. Watch them flip to see what we’re building.</p>
        </div>
        <div className="project-table" aria-hidden="true" data-film-enter="picture">
          <div className="project-table-light" />
          {PROJECT_CARDS.map((card, i) => {
            const side = i ? 1 : -1
            return (
              <div key={card.name} className={`project-card-holder project-card-holder-${i}`}>
                <div data-project-shadow style={shadowStyle()} />
                <div data-project-card className="project-card" style={{ transform: `rotate(${side * 11}deg)` }}>
                  <div data-project-turn className="card-turn project-turn">
                    <div className="card-side card-material card-back-surface project-back"><span>{card.suit}</span></div>
                    <div className={`card-side card-reverse card-material card-face-surface project-face${card.red ? ' is-red' : ''}`}>
                      <div className="material-index"><span>{card.rank}</span><span>{card.suit}</span></div>
                      <div className="project-face-name"><span>{card.name}</span><small>{card.note}</small></div>
                      <div className="material-index material-index-bottom"><span>{card.rank}</span><span>{card.suit}</span></div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
