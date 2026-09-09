import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import SectionIndex from './SectionIndex'
import ScrollWords from './ScrollWords'
import { whatWeDo } from '../content'
import { useSectionReveals } from '../lib/reveal'
import { dealCard, flipCard, hoverLift, observeCardLayout, shadowStyle } from '../lib/cardMotion'

gsap.registerPlugin(ScrollTrigger)
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
    mm.add({ all: 'all', wide: '(min-width: 1200px) and (min-height: 760px)', reduce: '(prefers-reduced-motion: reduce)' }, (context) => {
      if (context.conditions?.reduce) return
      const wide = context.conditions?.wide && slots.length <= 5
      const deck = section.querySelector<HTMLElement>('[data-deck-spot]')
      const parts = slots.map((slot) => ({
        slot,
        deal: slot.querySelector<HTMLElement>('[data-community-card]')!,
        turn: slot.querySelector<HTMLElement>('[data-community-turn]')!,
        shadow: slot.querySelector<HTMLElement>('[data-card-shadow]')!,
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
      const addCard = (tl: gsap.core.Timeline, i: number, at: number) => {
        const p = parts[i]
        tl.add(dealCard(p.deal, {
          from: { x: () => origins[i].x, y: () => origins[i].y, rotation: i % 2 ? 10 : -12 },
          rotation: REST[i % REST.length], duration: 0.65, lift: -18, shadow: p.shadow,
          fromScale: () => origins[i].scale,
        }), at)
        tl.add(flipCard(p.turn, true, { fromRotation: 0, duration: 0.56, shadow: p.shadow }), at + 0.69)
      }
      if (wide) {
        const tl = gsap.timeline({ scrollTrigger: {
          trigger: section, start: 'top top', end: () => `+=${Math.round(window.innerHeight * 1.6)}`,
          pin: true, scrub: 0.24, anticipatePin: 1, refreshPriority: 1, invalidateOnRefresh: true,
          onRefreshInit: measure,
        } })
        parts.forEach((_, i) => addCard(tl, i, i * 0.12))
        tl.to({}, { duration: 0.2 })
      } else {
        // Each stationary slot is its own scroll range, including on phones.
        // A fast down/up gesture seeks the same timeline in either direction.
        parts.forEach((p, i) => {
          const tl = gsap.timeline({ scrollTrigger: {
            trigger: p.slot, start: 'top 94%', end: 'top 38%', scrub: 0.2,
            invalidateOnRefresh: true, onRefreshInit: measure,
          } })
          addCard(tl, i, 0)
        })
      }
    })
    const off = slots.map((slot) => hoverLift(slot.querySelector<HTMLElement>('[data-card-lift]')!, { hitArea: slot, maxTilt: 3.5, lift: -5 }))
    const unobserve = observeCardLayout(slots)
    return () => { unobserve(); off.forEach((cleanup) => cleanup()); mm.revert() }
  }, [whatWeDo.threads.length])

  return (
    <section ref={root} id="what-we-do" className="section card-board-section">
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
    </section>
  )
}
