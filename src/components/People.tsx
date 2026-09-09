import { useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import SectionIndex from './SectionIndex'
import ScrollWords from './ScrollWords'
import { people } from '../content'
import { dealCard, flipCard, hoverLift, observeCardLayout, shadowStyle } from '../lib/cardMotion'
import { useSectionReveals } from '../lib/reveal'

gsap.registerPlugin(ScrollTrigger)
const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((word) => word[0]).slice(0, 3).join('')
type Member = (typeof people.leaders)[number]

function PersonCard({ member, index }: { member: Member; index: number }) {
  const slot = useRef<HTMLElement>(null)
  const lift = useRef<HTMLDivElement>(null)
  const turn = useRef<HTMLDivElement>(null)
  const animation = useRef<gsap.core.Timeline | null>(null)
  const face = useRef(false)
  const [flipped, setFlipped] = useState(false)
  const [noPhoto, setNoPhoto] = useState(false)
  face.current = flipped
  const toggle = () => setFlipped((previous) => !previous)

  useLayoutEffect(() => {
    if (!slot.current || !lift.current || !turn.current) return
    const off = hoverLift(lift.current, { hitArea: slot.current, maxTilt: 3.5, lift: -6 })
    const mm = gsap.matchMedia()
    mm.add({ all: 'all', reduce: '(prefers-reduced-motion: reduce)' }, () => {
      animation.current?.kill()
      gsap.set(turn.current, { rotationY: face.current ? 180 : 0, y: 0, z: 0 })
    })
    return () => { off(); animation.current?.kill(); mm.revert() }
  }, [])

  useLayoutEffect(() => {
    const element = turn.current
    if (!element) return
    animation.current?.kill()
    if (!flipped && !Number(gsap.getProperty(element, 'rotationY'))) return
    animation.current = flipCard(element, flipped, { duration: 0.62 })
    return () => { animation.current?.kill() }
  }, [flipped])

  return (
    <article ref={slot} data-person-slot className="people-slot" data-flipped={flipped ? 'true' : 'false'}>
      <div data-person-shadow aria-hidden="true" style={shadowStyle()} />
      <div data-person-deal className="card-deal">
        <div ref={lift} className="card-lift people-lift">
          <div ref={turn} className="card-turn people-turn" onClick={(event) => {
            // The full portrait is clickable; bio text remains selectable and scrollable.
            if (!flipped && !(event.target as HTMLElement).closest('button')) toggle()
          }}>
            <div className="card-face-surface card-material card-side people-front" aria-hidden={flipped}>
              <span className="material-index" aria-hidden="true"><span>8</span><span>♠</span></span>
              {member.photo && !noPhoto ? <img src={member.photo} alt="" width={160} height={160} loading="lazy" decoding="async"
                onError={() => setNoPhoto(true)} className="people-portrait" /> : <span className="people-initials" aria-hidden="true">{member.name === 'To be added' ? '♠' : initials(member.name)}</span>}
              <div className="people-name"><h3 className="h-card">{member.name}</h3><p className="mono">{member.role}</p></div>
            </div>
            <div className="card-back-surface card-material card-side card-reverse people-back" aria-hidden={!flipped}>
              <div id={`person-bio-${index}`} data-bio-copy data-lenis-prevent className="people-bio" tabIndex={flipped ? 0 : -1}
                aria-label={`${member.name}'s biography`} onKeyDown={(event) => { if (event.key === 'Escape') { setFlipped(false); slot.current?.querySelector<HTMLButtonElement>('button')?.focus() } }}>
                <h3 className="h-card">{member.name}</h3>
                <p className="mono people-bio-role">{member.role}</p>
                {member.major && <p>{member.major}</p>}
                {!!member.experience?.length && <div className="people-bio-group"><h4 className="mono">Experience</h4>{member.experience.map((experience, i) => <p key={`${experience}-${i}`}>{experience}</p>)}</div>}
                {!!member.skills?.length && <div className="people-bio-group"><h4 className="mono">Skills</h4><p>{member.skills.join(' · ')}</p></div>}
                {!member.major && !member.experience?.length && !member.skills?.length && <p>Bio to be added.</p>}
              </div>
            </div>
          </div>
          <button type="button" className="people-flip-control mono" onClick={toggle}
            aria-pressed={flipped} aria-controls={`person-bio-${index}`}
            aria-label={`${flipped ? 'Show portrait of' : 'Show biography of'} ${member.name}`}
            onKeyDown={(event) => { if (event.key === 'Escape') setFlipped(false) }}>
            <span>{flipped ? 'Show portrait' : 'View bio'}</span><span aria-hidden="true">↻</span>
          </button>
        </div>
      </div>
    </article>
  )
}

export default function People() {
  const root = useRef<HTMLElement>(null)
  const grid = useRef<HTMLDivElement>(null)
  useSectionReveals(root)
  useLayoutEffect(() => {
    const container = grid.current
    if (!container) return
    const slots = Array.from(container.querySelectorAll<HTMLElement>('[data-person-slot]'))
    if (!slots.length) return
    const mm = gsap.matchMedia()
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      slots.forEach((slot, i) => {
        const card = slot.querySelector<HTMLElement>('[data-person-deal]')!
        const shadow = slot.querySelector<HTMLElement>('[data-person-shadow]')
        const tl = gsap.timeline({ scrollTrigger: {
          trigger: slot, start: 'top 96%', end: 'top 62%', scrub: 0.18, invalidateOnRefresh: true,
        } })
        tl.add(dealCard(card, {
          from: { x: () => Math.min(24, slot.offsetWidth * 0.09) * (i % 2 ? 1 : -1), y: 54, rotation: i % 2 ? 5 : -5 },
          duration: 0.75, lift: -16, shadow,
        }), 0)
      })
    })
    const unobserve = observeCardLayout([container, ...slots])
    return () => { unobserve(); mm.revert() }
  }, [people.leaders.length])

  return (
    <section ref={root} id="people" className="section">
      <SectionIndex rank="8" />
      <div className="container-site">
        <h2 className="h-section mb-10 max-w-[16ch] md:mb-14"><ScrollWords text={people.heading} treatment="illuminate" /></h2>
        <div ref={grid} className="people-grid" data-interactive>
          {people.leaders.map((member, index) => <PersonCard key={`${member.name}-${index}`} member={member} index={index} />)}
        </div>
      </div>
    </section>
  )
}
