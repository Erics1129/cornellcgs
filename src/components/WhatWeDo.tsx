import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import SectionIndex from './SectionIndex'
import { whatWeDo } from '../content'
import { useSectionReveals } from '../lib/reveal'
import { dealCard, flipCard, hoverLift, shadowStyle } from '../lib/cardMotion'

gsap.registerPlugin(ScrollTrigger)

function renderEmphasis(text: string) {
  const parts = text.split('*')
  return parts.map((p, i) => (i % 2 === 1 ? <em key={i}>{p}</em> : <span key={i}>{p}</span>))
}

/** Each card's resting tilt on the table (deg) — a dealt row is never dead straight. */
const REST_TILT = [-2.2, 1.6, -1.1, 2.4, -1.8]
/** The spin each card carries off the deck (deg) — alternating hands, within −30..30. */
const THROW_SPIN = [-30, 22, -26, 28, -18]
/** Flight of one deal as a fraction of the pin; consecutive deals start DEAL_GAP apart. */
const FLIGHT = 0.12
const DEAL_GAP = 0.055
/**
 * dealCard's landing bounce is a fixed 0.31 s of real time after the flight,
 * so the deal is built in real seconds and time-scaled into the pin: the
 * flight spans FLIGHT of the pin and the bounce keeps its proportion (~0.04)
 * instead of stretching over a third of the scroll.
 */
const DEAL_SECS = 0.9
/**
 * Flip marks are pin-progress fractions: flop 0.34–0.63, turn 0.68–0.77,
 * river 0.85–0.94 — each run clears the paging beats (1/3, 2/3, 1) so no
 * card ever freezes edge-on at a rest point.
 */
const FLIP_MARKS = [0.34, 0.44, 0.54, 0.68, 0.85]
const FLIP_LEN = 0.09
/** The pile at the deck spot is deck-sized (deck width / card width), within these bounds. */
const PILE_SCALE = { min: 0.25, max: 0.5 }

/** The surfaces' baked drop shadow is dropped: the table shadow is a separate element. */
const BACK_STYLE = { position: 'absolute', boxShadow: 'none' } as const
const FACE_STYLE = {
  boxShadow: '0 1px 0 rgba(255,255,255,0.5) inset, 0 -2px 12px rgba(64,41,12,0.14) inset',
} as const
/** The lit band that sweeps across a face as it comes round (flipCard's sheen). */
const SHEEN_STYLE = {
  background:
    'linear-gradient(105deg, rgba(255,255,255,0) 40%, rgba(255,255,255,0.55) 50%, rgba(255,255,255,0) 60%)',
} as const

/**
 * What we do (Q♠) — the poker board. The section pins for ~2.5 viewport
 * heights; five community cards are dealt from the deck spot and flip face up,
 * scrubbed to scroll: deals fill 0–0.38, flop flips 0.34–0.63, turn at 0.68,
 * river at 0.85 (§5.8).
 *
 * Every move is lib/cardMotion: each card leaves the pile along a shallow arc
 * with spin, peaks closer to the eye and lands with a bounce while its table
 * shadow (a separate element, never box-shadow) falls away and pools back
 * under it; each flip turns with real depth — the face lifts at the edge-on
 * moment, comes round out of shade and the light sweeps across it; resting
 * cards rise and tilt under a fine pointer. Transforms and opacity only.
 *
 * Layers per card (outer → inner), each with one owner:
 *   [data-community-card] deal (x, y, rotation, scale)
 *   └ [data-card-grow]    deck-sized on the pile → table-sized on landing;
 *     │                   the shadow lives here so it grows with the card
 *     └ [data-card-lift]  hoverLift (tilt, lift); carries the flip's perspective
 *       └ [data-flip-inner] flipCard (rotationY, lift), preserve-3d
 *         └ back / face (backface hidden); the edge and sheen overlays sit
 *           inside the face so they turn with it and never z-fight the faces
 */
export default function WhatWeDo() {
  const root = useRef<HTMLElement>(null)
  useSectionReveals(root)

  useEffect(() => {
    const section = root.current
    if (!section) return

    const pick = (sel: string) => gsap.utils.toArray<HTMLElement>(sel, section)

    // Resting cards lift and tilt under the pointer. Fine pointers only and
    // reduced-motion safe inside hoverLift; its own layer, so it never fights
    // the deal (outer) or the flip (inner).
    const lifts = pick('[data-card-lift]').map((el) => hoverLift(el, { maxTilt: 6, lift: -8 }))

    const mm = gsap.matchMedia()

    // Desktop: pinned board, scrubbed deal + flips
    mm.add('(min-width: 769px) and (prefers-reduced-motion: no-preference)', () => {
      const cards = pick('[data-community-card]')
      const grows = pick('[data-card-grow]')
      const flips = pick('[data-flip-inner]')
      const shadows = pick('[data-card-shadow]')
      const edges = pick('[data-flip-edge]')
      const sheens = pick('[data-flip-sheen]')
      const deck = section.querySelector<HTMLElement>('[data-deck-spot]')
      if (!deck) return

      // One rect read per card, all before any transform lands on it: the
      // deck-spot centre relative to the card's resting centre (px), and how
      // much smaller the deck spot is than the card. A few px of scatter so
      // the pile reads as a loose deck, not a pinwheel.
      const d = deck.getBoundingClientRect()
      const origins = cards.map((card, i) => {
        const c = card.getBoundingClientRect()
        return {
          x: d.left + d.width / 2 - (c.left + c.width / 2) + (i - 2) * 4,
          y: d.top + d.height / 2 - (c.top + c.height / 2),
          scale: gsap.utils.clamp(PILE_SCALE.min, PILE_SCALE.max, d.width / c.width),
        }
      })

      const tl = gsap.timeline({
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
          refreshPriority: 1,
        },
      })

      // A deck deals from the top: the first card out sits on top of the pile,
      // and every card in flight passes over the ones still waiting.
      gsap.set(cards, { zIndex: (i: number) => cards.length - i })

      // Deal: every card starts on the pile at the deck spot, face down.
      // Flights fill the first third of the pin (positions i*0.055, 0.12 each
      // — the last lands at 0.34, its bounce settles by 0.38).
      cards.forEach((card, i) => {
        const at = i * DEAL_GAP
        const o = origins[i]
        const deal = dealCard(card, {
          from: { x: o.x, y: o.y, rotation: THROW_SPIN[i % THROW_SPIN.length] },
          rotation: REST_TILT[i % REST_TILT.length],
          duration: DEAL_SECS,
          lift: -40,
          air: 1.08,
          shadow: shadows[i] ?? null,
          immediate: true,
        })
        deal.timeScale(DEAL_SECS / FLIGHT)
        tl.add(deal, at)
        // Deck-sized on the pile, table-sized on landing — grows with the
        // flight (same curve as dealCard's travel), shadow included.
        if (grows[i])
          tl.fromTo(
            grows[i],
            { scale: o.scale },
            { scale: 1, duration: FLIGHT, ease: 'power2.out', immediateRender: true },
            at,
          )
      })

      flips.forEach((inner, i) => {
        tl.add(
          flipCard(inner, true, {
            duration: FLIP_LEN,
            edge: edges[i] ?? null,
            sheen: sheens[i] ?? null,
            shadow: shadows[i] ?? null,
          }),
          FLIP_MARKS[i % FLIP_MARKS.length],
        )
      })

      // Zero-length pad: total duration is exactly 1, so every position above
      // maps 1:1 onto the 250% pin's progress.
      tl.set({}, {}, 1)

      return () => {
        tl.scrollTrigger?.kill()
        tl.kill()
      }
    })

    // Mobile / reduced motion: each card is dealt up onto the table as it
    // arrives, then flips. Reduced motion → both helpers place the rest state.
    mm.add('(max-width: 768px), (prefers-reduced-motion: reduce)', () => {
      const cards = pick('[data-community-card]')
      const flips = pick('[data-flip-inner]')
      const shadows = pick('[data-card-shadow]')
      const edges = pick('[data-flip-edge]')
      const sheens = pick('[data-flip-sheen]')
      const triggers = flips.map((inner, i) => {
        const card = cards[i]
        const side = i % 2 ? 1 : -1
        const tl = gsap.timeline({ paused: true })
        if (card)
          tl.add(
            dealCard(card, {
              from: { x: side * 32, y: 110, rotation: side * 12 },
              rotation: REST_TILT[i % REST_TILT.length],
              duration: 0.6,
              lift: -28,
              air: 1.05,
              shadow: shadows[i] ?? null,
              immediate: true,
            }),
            (i % 3) * 0.08,
          )
        tl.add(
          flipCard(inner, true, {
            duration: 0.7,
            edge: edges[i] ?? null,
            sheen: sheens[i] ?? null,
            shadow: shadows[i] ?? null,
          }),
          card ? '>' : (i % 3) * 0.08,
        )
        const st = ScrollTrigger.create({
          trigger: inner,
          start: 'top 75%',
          once: true,
          onEnter: () => tl.play(),
        })
        return () => {
          st.kill()
          tl.kill()
        }
      })
      return () => triggers.forEach((kill) => kill())
    })

    return () => {
      lifts.forEach((off) => off())
      mm.revert()
    }
  }, [])

  return (
    <section ref={root} id="what-we-do" className="section md:min-h-screen md:flex md:flex-col md:justify-center">
      <SectionIndex rank="Q" />
      <div className="container-site">
        <div className="mb-12 flex items-end justify-between md:mb-16">
          <h2 data-reveal="heading" className="h-section max-w-[14ch]">
            {renderEmphasis(whatWeDo.heading)}
          </h2>
          {/* The deck spot — the pile the community cards are dealt from */}
          <div
            data-deck-spot
            aria-hidden="true"
            className="hidden aspect-[5/7] w-24 md:block"
          />
        </div>

        {/* The whole board floats; each card's own transforms belong to the deal/flip/lift */}
        <div
          className="life-float grid grid-cols-1 items-start gap-6 sm:grid-cols-2 md:grid-cols-5 md:gap-5"
          style={{ ['--life-dur' as string]: '9.5s', ['--life-delay' as string]: '-3.7s' }}
        >
          {whatWeDo.threads.map((t) => (
            <div
              key={t.title}
              data-community-card
              className="relative mx-auto aspect-[5/7] w-full max-w-[18.75rem] self-start"
            >
              <div data-card-grow className="relative h-full w-full">
                {/* Table shadow — its own element under the card, never box-shadow */}
                <div data-card-shadow aria-hidden="true" style={shadowStyle()} />
                <div data-card-lift className="relative h-full w-full [perspective:68.75rem]">
                  <div
                    data-flip-inner
                    className="relative h-full w-full [transform-style:preserve-3d]"
                  >
                    {/* Back — face down on the table */}
                    <div
                      className="card-back-surface absolute inset-0 flex items-center justify-center [backface-visibility:hidden]"
                      style={BACK_STYLE}
                    >
                      <span aria-hidden="true" className="text-4xl text-[var(--silver)] opacity-80">
                        ♠
                      </span>
                    </div>
                    {/* Face */}
                    <div
                      className="card-face-surface neon absolute inset-0 flex [transform:rotateY(180deg)] flex-col justify-between p-5 [backface-visibility:hidden] md:p-6"
                      style={FACE_STYLE}
                    >
                      <div className="flex flex-col items-start leading-none" aria-hidden="true">
                        <span className="font-display text-2xl text-[var(--ink)]">{t.rank}</span>
                        <span className="text-lg text-[var(--ink)]">{t.suit}</span>
                      </div>
                      <div>
                        <h3 className="h-card mb-2 text-[var(--ink)]">{t.title}</h3>
                        <p className="text-[max(0.95rem,0.9375rem)] leading-snug text-[color-mix(in_srgb,var(--ink)_78%,#5a4a30)]">
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
                      {/* Flip overlays — inside the face so they turn with it:
                          shade at the edge-on moment, then the lit band sweeps across */}
                      <div
                        data-flip-edge
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 rounded-[inherit] bg-black opacity-0"
                      />
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
                      >
                        <div data-flip-sheen className="absolute inset-0 opacity-0" style={SHEEN_STYLE} />
                      </div>
                    </div>
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
