import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import SectionIndex from './SectionIndex'
import ScrollWords from './ScrollWords'
import { events } from '../content'
import { useSectionReveals } from '../lib/reveal'
import { dealCard, fanLayout, hoverLift, observeCardLayout, shadowStyle } from '../lib/cardMotion'

gsap.registerPlugin(ScrollTrigger)

export default function Events() {
  const root = useRef<HTMLElement>(null)
  const hand = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLButtonElement | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  useSectionReveals(root)
  const count = events.items.length
  const shown = open === null ? undefined : events.items[open]
  const rest = fanLayout(count, { step: 5, drop: 7 })

  useLayoutEffect(() => {
    const container = hand.current
    if (!container) return
    const slots = Array.from(container.querySelectorAll<HTMLElement>('[data-event-slot]'))
    if (!slots.length) return
    const mm = gsap.matchMedia()
    mm.add({ all: 'all', wide: '(min-width: 1024px)', reduce: '(prefers-reduced-motion: reduce)' }, (context) => {
      const fan = context.conditions?.wide && count <= 7
      if (context.conditions?.reduce) return
      const add = (tl: gsap.core.Timeline, slot: HTMLElement, i: number, at: number) => {
        const surface = slot.querySelector<HTMLElement>('[data-event-deal]')!
        const shadow = slot.querySelector<HTMLElement>('[data-event-shadow]')
        tl.add(dealCard(surface, {
          from: {
            x: () => fan ? -(i - (count - 1) / 2) * Math.min(90, container.clientWidth / (count + 1)) : (i % 2 ? 18 : -18),
            y: fan ? 88 : 56, rotation: i % 2 ? 9 : -9,
          }, duration: 0.8, rotation: 0, lift: -20, shadow,
        }), at)
      }
      if (fan) {
        const tl = gsap.timeline({ scrollTrigger: {
          trigger: container, start: 'top 93%', end: 'top 40%', scrub: 0.22, invalidateOnRefresh: true,
        } })
        // Outside seats land first, with the centre card on top.
        slots.map((_, i) => i).sort((a, b) => Math.abs(b - (count - 1) / 2) - Math.abs(a - (count - 1) / 2))
          .forEach((i, order) => add(tl, slots[i], i, order * 0.09))
      } else {
        slots.forEach((slot, i) => {
          const tl = gsap.timeline({ scrollTrigger: {
            trigger: slot, start: 'top 95%', end: 'top 55%', scrub: 0.2, invalidateOnRefresh: true,
          } })
          add(tl, slot, i, 0)
        })
      }
    })
    const lifts = slots.map((slot) => hoverLift(slot.querySelector<HTMLElement>('[data-event-lift]')!, { hitArea: slot, maxTilt: 3, lift: -9 }))
    const unobserve = observeCardLayout([container, ...slots])
    return () => { unobserve(); lifts.forEach((off) => off()); mm.revert() }
  }, [count])

  useLayoutEffect(() => {
    if (!root.current) return
    const unobserve = observeCardLayout([root.current])
    return unobserve
  }, [])

  const close = () => { setOpen(null); opener.current?.focus({ preventScroll: true }) }

  return (
    <section ref={root} id="events" className="section card-events-section">
      <SectionIndex rank="10" />
      <div className="container-site">
        <h2 className="h-section mb-6 max-w-[16ch]"><ScrollWords text={events.heading} treatment="spread" /></h2>
        {count === 0 && <p className="body-muted">New events will appear here when announced.</p>}
        <div ref={hand} className={`event-hand ${count <= 7 ? 'event-hand-fan' : ''}`} data-interactive>
          {events.items.map((event, i) => (
            <div key={`${event.title}-${i}`} data-event-slot className="event-slot" style={{
              '--seat': i - (count - 1) / 2,
              '--seat-angle': `${rest[i].rotation}deg`,
              '--seat-drop': `${rest[i].y}px`,
              '--seat-z': Math.round(count - Math.abs(i - (count - 1) / 2)),
            } as CSSProperties}>
              <div data-event-shadow aria-hidden="true" style={shadowStyle()} />
              <div data-event-deal className="card-deal">
                <div data-event-lift className="card-lift">
                  <button type="button" onClick={(event) => {
                    opener.current = event.currentTarget
                    setOpen((previous) => previous === i ? null : i)
                  }} aria-label={`${event.title}, ${event.date}. ${open === i ? 'Hide' : 'Show'} event details`}
                    aria-expanded={open === i} aria-controls="event-details"
                    className="card-face-surface card-material event-surface">
                    <span className="material-index" aria-hidden="true"><span>{i + 1}</span><span>♠</span></span>
                    <span><span className="h-card block text-[var(--ink)]">{event.title}</span><span className="event-date mono">{event.date}</span></span>
                    <span className="event-invitation mono">{open === i ? 'Close details −' : 'View event +'} </span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div ref={panel} id="event-details" role="region" aria-labelledby={shown ? 'event-detail-title' : undefined} hidden={!shown}
          className="event-details panel" onKeyDown={(event) => { if (event.key === 'Escape') close() }}>
          {shown && <>
            <p className="eyebrow mb-2">{shown.date}</p>
            <h3 id="event-detail-title" className="h-card mb-3 text-[var(--text)]">{shown.title}</h3>
            <p className="body-muted">{shown.blurb}</p>
            <button type="button" onClick={close} className="event-details-close mono" aria-label="Close event details">Close ×</button>
          </>}
        </div>
      </div>
    </section>
  )
}
