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
 * flop across 0.2–0.5, turn at 0.65, river at 0.85 (§5.8).
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
          scrub: 0.6,
        },
      })

      // Deal: every card starts stacked on the deck spot, face down
      cards.forEach((card, i) => {
        tl.from(
          card,
          {
            x: () => {
              const d = deck!.getBoundingClientRect()
              const c = card.getBoundingClientRect()
              return d.left + d.width / 2 - (c.left + c.width / 2)
            },
            y: () => {
              const d = deck!.getBoundingClientRect()
              const c = card.getBoundingClientRect()
              return d.top + d.height / 2 - (c.top + c.height / 2)
            },
            rotation: 8 - i * 4,
            scale: 0.12,
            duration: 0.09,
          },
          i * 0.014,
        )
      })

      // Flop, turn, river — scrubbed to fixed progress marks
      const marks = [0.22, 0.33, 0.44, 0.65, 0.85]
      flips.forEach((inner, i) => {
        tl.to(inner, { rotationY: 180, duration: 0.09, ease: 'power2.inOut' }, marks[i])
      })

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
