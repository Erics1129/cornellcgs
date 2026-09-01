import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import SectionIndex from './SectionIndex'
import { events } from '../content'
import { useSectionReveals } from '../lib/reveal'
import { prefersReducedMotion } from '../lib/motion'
import { EASE } from '../lib/eases'

gsap.registerPlugin(ScrollTrigger)

function renderEmphasis(text: string) {
  const parts = text.split('*')
  return parts.map((p, i) => (i % 2 === 1 ? <em key={i}>{p}</em> : <span key={i}>{p}</span>))
}

/* Hover/focus rotate the card toward upright by scaling --straighten, which the
   global fan transform reads through --off. Focus only counts when visible. */
function setStraighten(el: HTMLElement, on: boolean) {
  el.style.setProperty('--straighten', on ? '0.3' : '1')
}

/**
 * Events (10♠) — a fanned hand of event cards held at the bottom of the
 * section like a player holding cards. The cards are dealt into the fan on
 * arrival. Hover spreads the fan and lifts the hovered card; click opens a
 * detail panel. On mobile the fan becomes a horizontal scroll strip (§7).
 */
export default function Events() {
  const root = useRef<HTMLElement>(null)
  const fan = useRef<HTMLDivElement>(null)
  useSectionReveals(root)
  const [open, setOpen] = useState<number | null>(null)
  // Last-opened index keeps the panel content mounted while it collapses.
  const [last, setLast] = useState(0)
  // Overflow clips only while the panel animates; at rest the neon halo needs room.
  const [settled, setSettled] = useState(false)

  const n = events.items.length
  const mid = (n - 1) / 2
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

  /* Deal-in: GSAP owns only --deal and opacity; `transform` stays with the CSS
     fan math (global.css), which multiplies its rotate/translateY by --deal.
     The card transition is off while dealing so it can't chase per-frame values. */
  useEffect(() => {
    const el = fan.current
    if (!el) return

    const ctx = gsap.context(() => {
      const cards = Array.from(el.querySelectorAll<HTMLElement>('.event-card'))
      if (!cards.length) return
      const trigger = { trigger: el, start: 'top 80%', once: true }

      if (prefersReducedMotion()) {
        gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.6, scrollTrigger: trigger })
        return
      }

      gsap.fromTo(
        cards,
        { '--deal': 0, autoAlpha: 0, transition: 'none' },
        {
          '--deal': 1,
          autoAlpha: 1,
          duration: 0.9,
          ease: EASE.out,
          stagger: 0.08,
          scrollTrigger: trigger,
          onComplete: () => gsap.set(cards, { clearProps: 'transition' }),
        },
      )
    }, el)

    return () => ctx.revert()
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
          className="group relative mx-auto hidden h-[380px] max-w-4xl md:block"
          data-interactive
        >
          {events.items.map((ev, i) => {
            const off = i - mid
            return (
              <button
                key={ev.title}
                onClick={() => toggle(i)}
                aria-label={`${ev.title}, ${ev.date}`}
                onPointerEnter={(e) => setStraighten(e.currentTarget, true)}
                onPointerLeave={(e) => {
                  if (!e.currentTarget.matches(':focus-visible')) setStraighten(e.currentTarget, false)
                }}
                onFocus={(e) => {
                  if (e.currentTarget.matches(':focus-visible')) setStraighten(e.currentTarget, true)
                }}
                onBlur={(e) => {
                  if (!e.currentTarget.matches(':hover')) setStraighten(e.currentTarget, false)
                }}
                className="event-card card-face-surface neon absolute bottom-0 left-1/2 flex aspect-[5/7] w-44 flex-col justify-between p-5 text-left"
                style={
                  {
                    // --i/--ai are the raw slot offsets; --off/--abs (read by the
                    // fan transform) fold in the deal progress + hover straighten.
                    '--i': off,
                    '--ai': Math.abs(off),
                    '--off': 'calc(var(--i) * var(--deal, 1) * var(--straighten, 1))',
                    '--abs': 'calc(var(--ai) * var(--deal, 1))',
                    zIndex: 10 - Math.abs(off),
                  } as React.CSSProperties
                }
              >
                <span className="flex flex-col items-start leading-none" aria-hidden="true">
                  <span className="font-display text-xl text-[var(--ink)]">{i + 1}</span>
                  <span className="text-sm text-[var(--ink)]">♠</span>
                </span>
                <span>
                  <span className="h-card block text-[var(--ink)]">{ev.title}</span>
                  <span className="mono mt-1 block text-[max(0.8rem,13px)] text-[color-mix(in_srgb,var(--ink)_65%,#7a6a4a)]">
                    {ev.date}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        {/* Mobile strip */}
        <div
          className="-mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-4 md:hidden"
          data-interactive
        >
          {events.items.map((ev, i) => (
            <button
              key={ev.title}
              onClick={() => toggle(i)}
              className="card-face-surface flex aspect-[5/7] w-40 shrink-0 snap-center flex-col justify-between p-4 text-left"
            >
              <span className="font-display text-lg text-[var(--ink)]" aria-hidden="true">
                {i + 1}♠
              </span>
              <span>
                <span className="h-card block text-[1.15rem] text-[var(--ink)]">{ev.title}</span>
                <span className="mono mt-1 block text-[max(0.8rem,13px)] text-[color-mix(in_srgb,var(--ink)_65%,#7a6a4a)]">
                  {ev.date}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
