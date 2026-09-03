import { useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import SectionIndex from './SectionIndex'
import { events } from '../content'
import { useSectionReveals } from '../lib/reveal'
import { prefersReducedMotion } from '../lib/motion'
import { EASE } from '../lib/eases'
import { dealCard, fanLayout, hoverLift, shadowStyle } from '../lib/cardMotion'

gsap.registerPlugin(ScrollTrigger)

function renderEmphasis(text: string) {
  const parts = text.split('*')
  return parts.map((p, i) => (i % 2 === 1 ? <em key={i}>{p}</em> : <span key={i}>{p}</span>))
}

/** The held hand: per-card rotation/drop about a pivot below the cards. */
const FAN = { step: 9, drop: 16 } as const
/** Hovering (or tabbing into) the hand spreads it a little wider. */
const WIDEN = { step: 1.5, drop: 1.375 } as const
/** The hot card is pulled up out of the hand and turned toward upright so it reads. */
const PULL = { straighten: 0.45, up: -12 } as const

type Hand = { holders: HTMLElement[]; cards: HTMLElement[]; shadows: (HTMLElement | null)[] }

/* Each card sits in a positioned holder: [data-holder] > [data-shadow] + [data-card].
   The holder owns the card's seat in the layout; the card moves relative to it. */
function collect(root: HTMLElement): Hand {
  const holders = Array.from(root.querySelectorAll<HTMLElement>('[data-holder]')).filter((h) =>
    h.querySelector('[data-card]'),
  )
  return {
    holders,
    cards: holders.map((h) => h.querySelector<HTMLElement>('[data-card]') as HTMLElement),
    shadows: holders.map((h) => h.querySelector<HTMLElement>('[data-shadow]')),
  }
}

/**
 * Deal a hand in once on scroll. Every holder stays hidden until its card is
 * thrown; the card then flies in with dealCard (arc, spin, landing bounce,
 * separated shadow) and hover lifts attach only after the last card is down,
 * so nothing fights a flight. Reduced motion: the hand is already at rest and
 * simply fades in.
 */
function dealIn(
  self: gsap.Context,
  container: HTMLElement,
  hand: Hand,
  order: number[],
  from: (i: number) => { x: number; y: number; rotation: number },
  flight: { duration: number; lift: number; air: number; stagger: number },
  lift: { maxTilt: number; lift: number },
  cleanups: (() => void)[],
) {
  const trigger = { trigger: container, start: 'top 80%', once: true, fastScrollEnd: true }
  const attach = () =>
    self.add(() => {
      hand.cards.forEach((card, i) => cleanups.push(hoverLift(card, { ...lift, shadow: hand.shadows[i] })))
    })

  if (prefersReducedMotion()) {
    gsap.fromTo(container, { opacity: 0 }, { opacity: 1, duration: 0.5, scrollTrigger: trigger })
    attach()
    return
  }

  gsap.set(hand.holders, { autoAlpha: 0 })
  const tl = gsap.timeline({ scrollTrigger: trigger, onComplete: attach })
  order.forEach((i, k) => {
    const at = k * flight.stagger
    // The card is already moving at its fastest when it enters the frame — a
    // 0.14 s ramp hides the pre-throw state without reading as a fade.
    tl.to(hand.holders[i], { autoAlpha: 1, duration: 0.14, ease: 'none' }, at)
    tl.add(
      dealCard(hand.cards[i], {
        from: from(i),
        rotation: 0,
        duration: flight.duration,
        lift: flight.lift,
        air: flight.air,
        shadow: hand.shadows[i],
      }),
      at,
    )
  })
}

/**
 * Events (10♠) — a fanned hand of event cards held at the bottom of the
 * section like a player holding cards. On arrival a dealer throws them in
 * from above: each card falls along its own angle, spinning, and lands in
 * the fan with a bounce; the hand's outer cards go down first so every card
 * lands on top of the last. Hovering the hand spreads it; a hovered card is
 * pulled up out of the fan, straightens to read, and tilts under the pointer
 * with its shadow spreading beneath it. Click opens a detail panel. On mobile
 * the fan is a horizontal strip whose cards are dealt across the table (§7).
 */
export default function Events() {
  const root = useRef<HTMLElement>(null)
  const fan = useRef<HTMLDivElement>(null)
  const strip = useRef<HTMLDivElement>(null)
  useSectionReveals(root)
  const [open, setOpen] = useState<number | null>(null)
  // Last-opened index keeps the panel content mounted while it collapses.
  const [last, setLast] = useState(0)
  // Overflow clips only while the panel animates; at rest the neon halo needs room.
  const [settled, setSettled] = useState(false)

  const n = events.items.length
  const mid = (n - 1) / 2
  const baseZ = (i: number) => 10 - Math.abs(i - mid)
  const shown = events.items[open ?? last]

  const toggle = (i: number) => {
    if (open === i) {
      setOpen(null)
      setSettled(false)
    } else {
      if (open === null) setSettled(false)
      setLast(i)
      setOpen(i)
    }
  }

  /* Desktop fan. GSAP owns every transform: the holder carries the seat
     (fanLayout, pivot 50% 135% so the hand pivots below the cards) and the
     widen/pull pose; the card inside carries the deal and the hover lift.
     The global .event-card transform/transition is neutralised inline. */
  useLayoutEffect(() => {
    const el = fan.current
    if (!el) return
    const hand = collect(el)
    if (!hand.holders.length) return
    const rest = fanLayout(hand.holders.length, FAN)
    const reduced = prefersReducedMotion()
    const fine = window.matchMedia('(pointer: fine)').matches
    const cleanups: (() => void)[] = []
    const listen = <K extends keyof HTMLElementEventMap>(
      target: HTMLElement,
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
    ) => {
      target.addEventListener(type, fn)
      cleanups.push(() => target.removeEventListener(type, fn))
    }

    const ctx = gsap.context((self) => {
      hand.holders.forEach((h, i) =>
        gsap.set(h, { xPercent: -50, ...rest[i], transformOrigin: '50% 135%' }),
      )
      gsap.set(hand.cards, { x: 0, y: 0, rotation: 0, scale: 1, transformOrigin: '50% 50%' })

      // Pose state: the hand widens under the pointer or keyboard focus; the
      // hot card (hovered, or focus-visible) is pulled up and straightened.
      let hoverHand = false
      let focusHand = false
      let hoverCard: number | null = null
      let focusCard: number | null = null
      const pose = (i: number) => {
        const wide = hoverHand || focusHand
        const hot = hoverCard === i || focusCard === i
        const r = rest[i]
        hand.holders[i].style.zIndex = String(hot ? 30 : baseZ(i))
        if (reduced) return
        gsap.to(hand.holders[i], {
          rotation: r.rotation * (wide ? WIDEN.step : 1) * (hot ? PULL.straighten : 1),
          y: r.y * (wide ? WIDEN.drop : 1) + (hot ? PULL.up : 0),
          x: r.x * (wide ? WIDEN.step : 1),
          duration: 0.5,
          ease: EASE.out,
          overwrite: 'auto',
        })
      }
      const poseAll = () => hand.holders.forEach((_, i) => pose(i))

      if (fine) {
        listen(el, 'pointerenter', () => {
          hoverHand = true
          poseAll()
        })
        listen(el, 'pointerleave', () => {
          hoverHand = false
          poseAll()
        })
      }
      listen(el, 'focusin', () => {
        if (focusHand) return
        focusHand = true
        poseAll()
      })
      listen(el, 'focusout', (e) => {
        if (el.contains(e.relatedTarget as Node | null)) return
        focusHand = false
        poseAll()
      })
      hand.cards.forEach((card, i) => {
        if (fine) {
          listen(card, 'pointerenter', () => {
            hoverCard = i
            pose(i)
          })
          listen(card, 'pointerleave', () => {
            if (hoverCard === i) hoverCard = null
            pose(i)
          })
        }
        listen(card, 'focus', () => {
          if (!card.matches(':focus-visible')) return
          focusCard = i
          pose(i)
        })
        listen(card, 'blur', () => {
          if (focusCard !== i) return
          focusCard = null
          pose(i)
        })
      })

      // Deal in z order (outer cards first) so each card lands on top of the
      // last. From: straight above the seat along the card's own angle,
      // i.e. rest.rotation − 40° in page terms, 40° of spin bleeding off.
      const order = hand.holders.map((_, i) => i).sort((a, b) => baseZ(a) - baseZ(b) || a - b)
      dealIn(
        self,
        el,
        hand,
        order,
        () => ({ x: 0, y: -window.innerHeight * 0.6, rotation: -40 }),
        { duration: 0.85, lift: -40, air: 1.08, stagger: 0.09 },
        { maxTilt: 6, lift: -18 },
        cleanups,
      )
    }, el)

    return () => {
      cleanups.forEach((fn) => fn())
      ctx.revert()
    }
  }, [])

  /* Mobile strip: the same holder/shadow/card structure, dealt across the
     table from the right with a little spin; fine pointers get the lift. */
  useLayoutEffect(() => {
    const el = strip.current
    if (!el) return
    const hand = collect(el)
    if (!hand.holders.length) return
    const cleanups: (() => void)[] = []

    const ctx = gsap.context((self) => {
      gsap.set(hand.cards, { x: 0, y: 0, rotation: 0, scale: 1, transformOrigin: '50% 50%' })
      dealIn(
        self,
        el,
        hand,
        hand.holders.map((_, i) => i),
        () => ({ x: window.innerWidth * 0.5, y: -60, rotation: -30 }),
        { duration: 0.75, lift: -24, air: 1.06, stagger: 0.08 },
        { maxTilt: 6, lift: -10 },
        cleanups,
      )
    }, el)

    return () => {
      cleanups.forEach((fn) => fn())
      ctx.revert()
    }
  }, [])

  return (
    <section ref={root} id="events" className="section overflow-x-clip">
      <SectionIndex rank="10" />
      <div className="container-site">
        <h2 data-reveal="heading" className="h-section mb-6 max-w-[16ch]">
          {renderEmphasis(events.heading)}
        </h2>
        {/* TODO real events */}

        {/* Detail panel — grid rows 0fr→1fr so open AND close both animate;
            content stays mounted through the collapse. */}
        <div
          aria-live="polite"
          onTransitionEnd={(e) => {
            if (e.propertyName === 'grid-template-rows' && open !== null) setSettled(true)
          }}
          className={`mx-auto mb-8 grid max-w-xl ${
            open === null
              ? 'invisible [grid-template-rows:0fr] opacity-0 [transition:grid-template-rows_0.55s_var(--ease-out),opacity_0.4s_var(--ease-out),visibility_0s_linear_0.55s]'
              : 'visible [grid-template-rows:1fr] opacity-100 [transition:grid-template-rows_0.55s_var(--ease-out),opacity_0.4s_var(--ease-out)]'
          }`}
        >
          <div className={`min-h-0 ${open !== null && settled ? 'overflow-visible' : 'overflow-hidden'}`}>
            <div className="panel neon neon-on relative rounded-2xl px-7 py-6" data-interactive>
              <p className="eyebrow mb-1">{shown.date /* TODO date */}</p>
              <h3 className="h-card mb-2 text-[var(--text)]">{shown.title}</h3>
              <p className="body-muted">{shown.blurb}</p>
              <button
                onClick={() => setOpen(null)}
                aria-label="Close event details"
                className="mono absolute right-4 top-4 rounded-full px-2 py-0.5 text-[var(--muted)] hover:text-[var(--text)]"
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        {/* Desktop fan */}
        <div
          ref={fan}
          className="life-sway relative mx-auto hidden h-[23.75rem] max-w-4xl md:block"
          style={{ ['--life-dur' as string]: '11s', ['--life-delay' as string]: '-4.2s' }}
          data-interactive
        >
          {events.items.map((ev, i) => (
            <div
              key={ev.title}
              data-holder
              className="absolute bottom-0 left-1/2 aspect-[5/7] w-44"
              style={{ zIndex: baseZ(i), willChange: 'transform' }}
            >
              <div data-shadow aria-hidden="true" style={shadowStyle()} />
              <button
                data-card
                onClick={() => toggle(i)}
                aria-label={`${ev.title}, ${ev.date}`}
                className="event-card card-face-surface neon flex flex-col justify-between p-5 text-left"
                style={{
                  // Inline beats the unlayered .event-card rule: the card
                  // fills its holder and GSAP alone owns its transform.
                  position: 'absolute',
                  inset: 0,
                  transition: 'none',
                  transformOrigin: '50% 50%',
                }}
              >
                <span className="flex flex-col items-start leading-none" aria-hidden="true">
                  <span className="font-display text-xl text-[var(--ink)]">{i + 1}</span>
                  <span className="text-sm text-[var(--ink)]">♠</span>
                </span>
                <span>
                  <span className="h-card block text-[var(--ink)]">{ev.title}</span>
                  <span className="mono mt-1 block text-[max(0.8rem,0.8125rem)] text-[color-mix(in_srgb,var(--ink)_65%,#7a6a4a)]">
                    {ev.date}
                  </span>
                </span>
              </button>
            </div>
          ))}
        </div>

        {/* Mobile strip */}
        <div
          ref={strip}
          className="-mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-6 pt-2 md:hidden"
          data-interactive
        >
          {events.items.map((ev, i) => (
            <div key={ev.title} data-holder className="relative aspect-[5/7] w-40 shrink-0 snap-center">
              <div data-shadow aria-hidden="true" style={shadowStyle()} />
              <button
                data-card
                onClick={() => toggle(i)}
                className="card-face-surface absolute inset-0 flex flex-col justify-between p-4 text-left"
              >
                <span className="font-display text-lg text-[var(--ink)]" aria-hidden="true">
                  {i + 1}♠
                </span>
                <span>
                  <span className="h-card block text-[1.15rem] text-[var(--ink)]">{ev.title}</span>
                  <span className="mono mt-1 block text-[max(0.8rem,0.8125rem)] text-[color-mix(in_srgb,var(--ink)_65%,#7a6a4a)]">
                    {ev.date}
                  </span>
                </span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
