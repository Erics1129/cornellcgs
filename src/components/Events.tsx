import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import SectionIndex from './SectionIndex'
import ScrollWords from './ScrollWords'
import { events } from '../content'
import '../styles/event-agenda.css'
gsap.registerPlugin(ScrollTrigger)

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
  useLayoutEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) ScrollTrigger.refresh()
  }, [open])
  useLayoutEffect(() => {
    const media = gsap.matchMedia(root)
    media.add('(prefers-reduced-motion: no-preference)', () => {
      root.current!.querySelectorAll('.agenda-row').forEach(row => {
        gsap.fromTo(row, { opacity: 0, y: 22 }, { opacity: 1, y: 0, ease: 'power2.out',
          scrollTrigger: { trigger: row, start: 'top 96%', end: 'top 78%', scrub: .3 } })
      })
    })
    return () => media.revert()
  }, [])
  return <section ref={root} id="events" className="section event-agenda">
    <SectionIndex rank="10" />
    <div className="container-site agenda-layout">
      <header className="agenda-heading">
        <p className="agenda-eyebrow">The calendar</p>
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
          <div id={`agenda-detail-${i}`} className="agenda-reveal" aria-hidden={open !== i}
            onTransitionEnd={event => { if (event.target === event.currentTarget && event.propertyName === 'grid-template-rows') ScrollTrigger.refresh() }}>
            <div><p>{item.blurb}</p></div>
          </div>
        </article>)}
      </div>
    </div>
  </section>
}
