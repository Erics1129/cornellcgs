import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import SectionIndex from './SectionIndex'
import { whatWeDo } from '../content'
import { useSectionReveals } from '../lib/reveal'

gsap.registerPlugin(ScrollTrigger)

function renderEmphasis(text: string) {
  const parts = text.split('*')
  return parts.map((p, i) => (i % 2 === 1 ? <em key={i}>{p}</em> : <span key={i}>{p}</span>))
}

/**
 * What we do (Q♠) — the poker board. The section pins for ~2.5 viewport
 * heights; five community cards are dealt from the deck spot (where the 3D
 * hero card parks and fades out), then flip face up scrubbed to scroll:
 * deals fill 0–0.34, flop flips 0.34–0.63, turn at 0.68, river at 0.85 (§5.8).
 */
export default function WhatWeDo() {
  const root = useRef<HTMLElement>(null)
  useSectionReveals(root)

  useEffect(() => {
    const section = root.current
    if (!section) return

    const mm = gsap.matchMedia()

    // Desktop: pinned board, scrubbed deal + flips
    mm.add('(min-width: 769px) and (prefers-reduced-motion: no-preference)', () => {
      const cards = gsap.utils.toArray<HTMLElement>('[data-community-card]', section)
      const flips = gsap.utils.toArray<HTMLElement>('[data-flip-inner]', section)
      const deck = section.querySelector<HTMLElement>('[data-deck-spot]')

      const tl = gsap.timeline({
        defaults: { ease: 'power3.out' },
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: '+=250%',
          pin: true,
          anticipatePin: 1,
          scrub: 0.6,
          // Refresh strictly before the ML pin: its useLayoutEffect creates
          // its trigger first, and out-of-order refreshes measure ML's start
          // without this pin's spacer (the can't-scroll-back bug).
          refreshPriority: 2,
        },
      })

      // Deal: every card starts stacked on the deck spot, face down. Flights
      // fill the first third of the pin (positions i*0.055, 0.12 each — last
      // lands at 0.34) and lob: y bows ~40px above the straight-line path
      // while rotation and scale resolve over the whole flight.
      cards.forEach((card, i) => {
        const at = i * 0.055
        let dy = 0
        // One rect read resolves both axes — y must be captured here, before
        // any transform lands on this card (scale/x don't move the center,
        // but a re-measure inside the arc tweens would read a moved card).
        const measure = () => {
          const d = deck!.getBoundingClientRect()
          const c = card.getBoundingClientRect()
          dy = d.top + d.height / 2 - (c.top + c.height / 2)
          return d.left + d.width / 2 - (c.left + c.width / 2)
        }
        tl.from(card, { x: measure, rotation: 8 - i * 4, scale: 0.12, duration: 0.12 }, at)
        // Arc: decelerate up to the apex, accelerate down onto the row.
        tl.fromTo(
          card,
          { y: () => dy },
          { y: () => dy * 0.45 - 40, duration: 0.06, ease: 'power2.out' },
          at,
        )
        tl.to(card, { y: 0, duration: 0.06, ease: 'power2.in' }, at + 0.06)
      })

      // Flip marks are pin-progress fractions: flop 0.34–0.63, turn 0.68–0.77,
      // river 0.85–0.94 — each run clears the paging beats (1/3, 2/3, 1) so
      // no card ever freezes edge-on at a rest point.
      const marks = [0.34, 0.44, 0.54, 0.68, 0.85]
      flips.forEach((inner, i) => {
        tl.to(inner, { rotationY: 180, duration: 0.09, ease: 'power2.inOut' }, marks[i])
      })

      // Zero-length pad: total duration is exactly 1, so every position above
      // maps 1:1 onto the 250% pin's progress.
      tl.set({}, {}, 1)

      return () => {
        tl.scrollTrigger?.kill()
        tl.kill()
      }
    })

    // Mobile / reduced motion: vertical deal, each card flips as it arrives
    mm.add('(max-width: 768px), (prefers-reduced-motion: reduce)', () => {
      const flips = gsap.utils.toArray<HTMLElement>('[data-flip-inner]', section)
      const triggers = flips.map((inner, i) =>
        gsap.to(inner, {
          rotationY: 180,
          duration: 0.7,
          delay: (i % 3) * 0.08,
          ease: 'power2.inOut',
          scrollTrigger: { trigger: inner, start: 'top 75%', once: true },
        }),
      )
      return () => triggers.forEach((t) => t.kill())
    })

    return () => mm.revert()
  }, [])

  return (
    <section ref={root} id="what-we-do" className="section md:min-h-screen md:flex md:flex-col md:justify-center">
      <SectionIndex rank="Q" />
      <div className="container-site">
        <div className="mb-12 flex items-end justify-between md:mb-16">
          <h2 data-reveal="heading" className="h-section max-w-[14ch]">
            {renderEmphasis(whatWeDo.heading)}
          </h2>
          {/* The deck spot — where the hero card parks and becomes the deck */}
          <div
            data-deck-spot
            aria-hidden="true"
            className="hidden aspect-[5/7] w-24 md:block"
          />
        </div>

        <div className="grid grid-cols-1 items-start gap-6 sm:grid-cols-2 md:grid-cols-5 md:gap-5">
          {whatWeDo.threads.map((t, i) => (
            <div
              key={t.title}
              data-community-card
              className="mx-auto aspect-[5/7] w-full max-w-[300px] self-start [perspective:1100px]"
            >
              <div
                data-flip-inner
                className="relative h-full w-full [transform-style:preserve-3d]"
              >
                {/* Back — face down on the table */}
                <div className="card-back-surface absolute inset-0 flex items-center justify-center [backface-visibility:hidden]">
                  <span aria-hidden="true" className="text-4xl text-[var(--silver)] opacity-80">
                    ♠
                  </span>
                </div>
                {/* Face */}
                <div className="card-face-surface neon absolute inset-0 flex [transform:rotateY(180deg)] flex-col justify-between p-5 [backface-visibility:hidden] md:p-6">
                  <div className="flex flex-col items-start leading-none" aria-hidden="true">
                    <span className="font-display text-2xl text-[var(--ink)]">{t.rank}</span>
                    <span className="text-lg text-[var(--ink)]">{t.suit}</span>
                  </div>
                  <div>
                    <h3 className="h-card mb-2 text-[var(--ink)]">{t.title}</h3>
                    <p className="text-[max(0.95rem,15px)] leading-snug text-[color-mix(in_srgb,var(--ink)_78%,#5a4a30)]">
                      {t.text}
                    </p>
                  </div>
                  <div
                    className="flex rotate-180 flex-col items-start leading-none"
                    aria-hidden="true"
                  >
                    <span className="font-display text-2xl text-[var(--ink)]">{t.rank}</span>
                    <span className="text-lg text-[var(--ink)]">{t.suit}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
