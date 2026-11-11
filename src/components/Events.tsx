import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import SectionIndex from './SectionIndex'
import ScrollWords from './ScrollWords'
import { events } from '../content'
import { reveal } from '../lib/reveal'
import '../styles/event-agenda.css'

export default function Events() {
  const root = useRef<HTMLElement>(null)
  const [open, setOpen] = useState<number | null>(null)
  useEffect(() => {
    if (open === null) return
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      root.current?.querySelectorAll<HTMLButtonElement>('.agenda-trigger')[open]?.focus()
      setOpen(null)
    }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [open])
  // Opening a row changes the chapter's height. Nothing is asked for here: the deck's
  // ResizeObserver re-reads the geometry in the next frame and refreshes once if a chapter moved.
  useLayoutEffect(() => {
    const media = gsap.matchMedia(root)
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const offs = Array.from(root.current!.querySelectorAll<HTMLElement>('.agenda-row'), (row, i) => reveal((tl) => {
        tl.fromTo(row, { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 1, ease: 'power2.out' })
      }, { id: `events-row-${i}`, source: { trigger: row, start: 'top 96%', end: 'top 78%' } }))
      return () => offs.forEach((off) => off())
    })
    return () => media.revert()
  }, [])
  return <section ref={root} id="events" className="section event-agenda">
    <SectionIndex rank="10" />
    <div className="container-site agenda-layout" data-film-enter="copy">
      <header className="agenda-heading">
        <p className="agenda-eyebrow">Events</p>
        <h2><ScrollWords text={events.heading} treatment="spread" /></h2>
        <a className="agenda-more" href="/events/">All events <span aria-hidden="true">↗</span></a>
      </header>
      <div className="agenda-list">
        {!events.items.length && <p>New events will appear here when announced.</p>}
        {events.items.map((item, i) => <article key={`${item.title}-${i}`} className="agenda-row" data-open={open === i}>
          <h3><button className="agenda-trigger" type="button" aria-expanded={open === i} aria-controls={`agenda-detail-${i}`}
            onClick={() => setOpen(open === i ? null : i)}>
            <span className="agenda-number" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
            <span className="agenda-name">{item.title}<span className="agenda-date">{item.date}</span></span>
            <span className="agenda-plus" aria-hidden="true">+</span>
          </button></h3>
          <div id={`agenda-detail-${i}`} className="agenda-reveal" aria-hidden={open !== i}>
            <div><p>{item.blurb}</p></div>
          </div>
        </article>)}
      </div>
    </div>
  </section>
}
