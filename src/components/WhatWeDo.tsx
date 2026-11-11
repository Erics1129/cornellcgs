import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import SectionIndex from './SectionIndex'
import ScrollWords from './ScrollWords'
import { whatWeDo } from '../content'
import { reveal, useSectionReveals } from '../lib/reveal'
import { dealCard, flipCard, hoverLift, observeCardLayout, shadowStyle } from '../lib/cardMotion'

const REST = [-1.6, 1.1, -0.7, 1.5, -1.2]

export default function WhatWeDo() {
  const root = useRef<HTMLElement>(null)
  useSectionReveals(root)
  useLayoutEffect(() => {
    const section = root.current
    if (!section) return
    const slots = Array.from(section.querySelectorAll<HTMLElement>('[data-community-slot]'))
    if (!slots.length) return
    const mm = gsap.matchMedia()
    mm.add({ motion: '(prefers-reduced-motion: no-preference)', wide: '(min-width: 1200px) and (min-height: 760px)' }, (context) => {
      if (!context.conditions?.motion) return
      const wide = !!context.conditions?.wide && slots.length <= 5
      const deck = section.querySelector<HTMLElement>('[data-deck-spot]')
      const parts = slots.map((slot) => ({
        slot,
        deal: slot.querySelector<HTMLElement>('[data-community-card]')!,
        turn: slot.querySelector<HTMLElement>('[data-community-turn]')!,
        shadow: slot.querySelector<HTMLElement>('[data-card-shadow]')!,
        face: slot.querySelector<HTMLElement>('.community-face')!,
      }))
      let origins = parts.map(() => ({ x: 0, y: 64, scale: 1 }))
      const measure = () => {
        const d = deck?.getBoundingClientRect()
        const rects = slots.map((slot) => slot.getBoundingClientRect())
        origins = rects.map((rect, i) => wide && d ? {
          x: d.left + d.width / 2 - rect.left - rect.width / 2 + i * 1.5,
          y: d.top + d.height / 2 - rect.top - rect.height / 2,
          scale: gsap.utils.clamp(0.3, 0.6, d.width / Math.max(1, rect.width)),
        } : { x: (i % 2 ? 1 : -1) * Math.min(30, rect.width * 0.1), y: 64, scale: 0.96 })
      }
      measure()
      gsap.set(parts.map((part) => part.turn), { rotationY: 0 })
      // Each card is its own latched reveal (deal, then flip). While the page moves it follows
      // the scroll; when the page stops, every card that has left the deck lands and turns over
      // by itself, and the ones still in the deck wait. A stop never leaves a card mid-flip.
      const offs = parts.map((p, i) => reveal((tl) => {
        tl.add(dealCard(p.deal, {
          from: { x: () => origins[i].x, y: () => origins[i].y, rotation: i % 2 ? 10 : -12 },
          // lift 0: the flight stays under the heading (which also sits above it in z)
          rotation: REST[i % REST.length], duration: 0.65, lift: 0, shadow: p.shadow,
          fromScale: () => origins[i].scale,
        }), 0)
        tl.add(flipCard(p.turn, true, { fromRotation: 0, duration: 0.56, shadow: p.shadow }), 0.69)
      }, {
        id: `what-we-do-card-${i}`, settle: 0.45, invalidate: true, phaseOff: [p.face],
        onMeasure: i === 0 ? measure : undefined,
        source: wide
          // the wide runway: one slice of the run per card, so the board is dealt across the stage's stay
          ? { chapter: 'what-we-do', key: 'run', from: 0.04 + i * 0.15, to: 0.04 + i * 0.15 + 0.34 }
          // each stationary slot is its own range, including on phones
          : { trigger: p.slot, start: 'top 94%', end: 'top 38%' },
      }))
      return () => offs.forEach((off) => off())
    })
    const off = slots.map((slot) => hoverLift(slot.querySelector<HTMLElement>('[data-card-lift]')!, { hitArea: slot, maxTilt: 3.5, lift: -5 }))
    const unobserve = observeCardLayout(slots)
    return () => { unobserve(); off.forEach((cleanup) => cleanup()); mm.revert() }
  }, [whatWeDo.threads.length])

  return (
    <section ref={root} id="what-we-do" className="section card-board-section" data-quiet-rain data-runway={whatWeDo.threads.length <= 5 ? 'true' : 'false'}>
      <div className="deck-stage" data-stage>
      <SectionIndex rank="Q" />
      <div className="container-site">
        <div className="card-board-heading">
          <h2 className="h-section max-w-[14ch]"><ScrollWords text={whatWeDo.heading} treatment="cascade" /></h2>
          <div data-deck-spot className="card-deck-spot card-back-surface" aria-hidden="true"><span>♠</span></div>
        </div>
        <div className="community-board">
          {whatWeDo.threads.map((thread, i) => (
            <article key={`${thread.title}-${i}`} data-community-slot className="community-slot">
              <div data-community-card className="card-deal" style={{ zIndex: whatWeDo.threads.length - i }}>
                <div data-card-grow className="card-grow">
                  <div data-card-shadow aria-hidden="true" style={shadowStyle()} />
                  <div data-card-lift className="card-lift">
                    <div data-community-turn className="card-turn community-turn">
                      <div className="card-back-surface card-material card-side community-back" aria-hidden="true"><span>♠</span></div>
                      <div className="card-face-surface card-material card-side card-reverse community-face">
                        <div className="material-index" aria-hidden="true"><span>{thread.rank}</span><span>{thread.suit}</span></div>
                        <div><h3 className="h-card mb-3 text-[var(--ink)]">{thread.title}</h3><p>{thread.text}</p></div>
                        <div className="material-index material-index-bottom" aria-hidden="true"><span>{thread.rank}</span><span>{thread.suit}</span></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
      </div>
    </section>
  )
}
