import { useRef, useState } from 'react'
import SectionIndex from './SectionIndex'
import { events } from '../content'
import { useSectionReveals } from '../lib/reveal'

function renderEmphasis(text: string) {
  const parts = text.split('*')
  return parts.map((p, i) => (i % 2 === 1 ? <em key={i}>{p}</em> : <span key={i}>{p}</span>))
}

/**
 * Events (10♠) — a fanned hand of event cards held at the bottom of the
 * section like a player holding cards. Hover spreads the fan and lifts the
 * hovered card; click opens a detail panel. On mobile the fan becomes a
 * horizontal scroll strip (§7).
 */
export default function Events() {
  const root = useRef<HTMLElement>(null)
  useSectionReveals(root)
  const [open, setOpen] = useState<number | null>(null)

  const n = events.items.length
  const mid = (n - 1) / 2

  return (
    <section ref={root} id="events" className="section overflow-x-clip">
      <SectionIndex rank="10" />
      <div className="container-site">
        <h2 data-reveal="heading" className="h-section mb-6 max-w-[16ch]">
          {renderEmphasis(events.heading)}
        </h2>
        <p data-reveal="para" className="body-muted mb-4 max-w-[46ch]">
          Hover the hand, pick a card. {/* TODO real events */}
        </p>

        {/* Detail panel */}
        <div
          aria-live="polite"
          className={`mx-auto mb-8 max-w-xl transition-all duration-500 ${
            open === null ? 'pointer-events-none h-0 opacity-0' : 'h-auto opacity-100'
          }`}
        >
          {open !== null && (
            <div className="panel neon neon-on relative rounded-2xl px-7 py-6" data-interactive>
              <p className="eyebrow mb-1">{events.items[open].date /* TODO date */}</p>
              <h3 className="h-card mb-2 text-[var(--text)]">{events.items[open].title}</h3>
              <p className="body-muted">{events.items[open].blurb}</p>
              <button
                onClick={() => setOpen(null)}
                aria-label="Close event details"
                className="mono absolute right-4 top-4 rounded-full px-2 py-0.5 text-[var(--muted)] hover:text-[var(--text)]"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Desktop fan */}
        <div
          data-reveal="para"
          className="group relative mx-auto hidden h-[380px] max-w-4xl md:block"
          data-interactive
        >
          {events.items.map((ev, i) => {
            const off = i - mid
            return (
              <button
                key={ev.title}
                onClick={() => setOpen(open === i ? null : i)}
                aria-label={`${ev.title}, ${ev.date}`}
                className="event-card card-face-surface neon absolute bottom-0 left-1/2 flex aspect-[5/7] w-44 flex-col justify-between p-5 text-left"
                style={
                  {
                    '--off': off,
                    '--abs': Math.abs(off),
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
              onClick={() => setOpen(open === i ? null : i)}
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
