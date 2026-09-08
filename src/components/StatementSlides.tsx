import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { dealCard, shadowStyle } from '../lib/cardMotion'
import '../styles/showcase-motion.css'

gsap.registerPlugin(ScrollTrigger)

type SceneBuilder = (section: HTMLElement, desktop: boolean) => void | (() => void)

/** Preference and breakpoint changes restore the original static composition. */
function useScene(root: React.RefObject<HTMLElement | null>, build: SceneBuilder) {
  useLayoutEffect(() => {
    const section = root.current
    if (!section) return
    const media = gsap.matchMedia(section)
    media.add({
      motion: '(prefers-reduced-motion: no-preference)',
      desktop: '(min-width: 768px) and (min-height: 620px)',
    }, (context) => {
      if (context.conditions?.motion) return build(section, !!context.conditions.desktop)
    })
    return () => media.revert()
  }, [])
}

/** Layout offsets remain reliable while ScrollTrigger temporarily unpins. */
function wordOrigin(word: HTMLElement, section: HTMLElement) {
  let x = 0
  let y = 0
  let node: HTMLElement | null = word
  while (node && node !== section) {
    x += node.offsetLeft
    y += node.offsetTop
    node = node.offsetParent as HTMLElement | null
  }
  return {
    x: section.clientWidth / 2 - x - word.offsetWidth / 2,
    y: section.clientHeight / 2 - y - word.offsetHeight / 2,
    scale: Math.max(1, Math.min(section.clientWidth * 0.88 / word.offsetWidth, section.clientHeight * 0.4 / word.offsetHeight)),
  }
}

export function AlphaGoSlide() {
  const root = useRef<HTMLElement>(null)
  useScene(root, (section, desktop) => {
    const word = section.querySelector<HTMLElement>('[data-alpha-word]')!
    const tl = gsap.timeline({ scrollTrigger: {
      id: 'support-alphago', trigger: section,
      start: desktop ? 'top top' : 'top 12%',
      end: desktop ? '+=105%' : 'center 32%',
      pin: desktop, scrub: 0.35, anticipatePin: 1, invalidateOnRefresh: true,
    } })
    tl.fromTo(word, {
      x: () => wordOrigin(word, section).x,
      y: () => wordOrigin(word, section).y,
      scale: () => wordOrigin(word, section).scale,
    }, { x: 0, y: 0, scale: 1, duration: 0.62, ease: 'power2.inOut' }, 0)
      .fromTo(section.querySelector('[data-go-image]'), { xPercent: 4, yPercent: 5, opacity: 0.28 }, { xPercent: 0, yPercent: 0, opacity: 0.92, duration: 0.85, ease: 'none' }, 0)
      .fromTo(section.querySelector('[data-go-shade]'), { opacity: 0.82 }, { opacity: 0.18, duration: 0.72, ease: 'none' }, 0)
      .fromTo(section.querySelectorAll('[data-alpha-copy]'), { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.24, stagger: 0.13, ease: 'power2.out' }, 0.5)
      .to({}, { duration: 0.13 })
  })
  return (
    <section ref={root} id="alphago" className="section support-scene alpha-scene" aria-label="AlphaGo. The kind of AI we build.">
      <div className="go-study" aria-hidden="true">
        <img data-go-image src="/assets/scenes/go-study.webp" alt="" width="1536" height="1024" loading="lazy" decoding="async" />
        <div data-go-shade className="go-study-shade" />
      </div>
      <div className="container-site alpha-copy">
        <h2 className="h-section">
          <span data-alpha-word className="alpha-word">AlphaGo</span>
          <span data-alpha-copy>.<br />The kind of AI<br />we build.</span>
        </h2>
        <p data-alpha-copy className="body-muted support-lead">Solvers, agents, and the math behind every hand.</p>
      </div>
    </section>
  )
}

export function ProjectSlide() {
  const root = useRef<HTMLElement>(null)
  useScene(root, (section, desktop) => {
    const cards = Array.from(section.querySelectorAll<HTMLElement>('[data-project-card]'))
    const shadows = section.querySelectorAll<HTMLElement>('[data-project-shadow]')
    const count = section.querySelector<HTMLElement>('[data-counter]')!
    const n = { value: 0 }
    const tl = gsap.timeline({ scrollTrigger: {
      id: 'support-project', trigger: section, start: 'top 80%', end: 'center 48%',
      scrub: 0.3, invalidateOnRefresh: true,
    } })
    tl.fromTo(section.querySelectorAll('[data-project-title]'), { yPercent: 108 }, {
      yPercent: 0, duration: 0.46, stagger: 0.065, ease: 'power3.out',
    }, 0)
    cards.forEach((card, i) => {
      const side = i ? 1 : -1
      tl.add(dealCard(card, {
        from: { x: side * (desktop ? 340 : 170), y: desktop ? -140 : -90, rotation: side * 42 },
        rotation: side * 11, duration: 0.44, lift: -34, air: 1.04,
        shadow: shadows[i], immediate: true,
      }), 0.06 + i * 0.1)
    })
    tl.fromTo(section.querySelectorAll('[data-project-copy]'), { opacity: 0, y: 12 }, {
      opacity: 1, y: 0, duration: 0.26, stagger: 0.08, ease: 'power2.out',
    }, 0.28)
      .to(n, { value: 108, duration: 0.36, ease: 'none', onUpdate: () => {
        count.textContent = String(Math.round(n.value))
      } }, 0.3)
    return () => { count.textContent = '108' }
  })
  return (
    <section ref={root} id="project" className="section support-scene project-scene" aria-label="Throwing Eggs. Our current project.">
      <div className="container-site project-layout">
        <div className="project-copy">
          <h2 className="project-title" aria-label="Throwing Eggs">
            <span className="support-mask" aria-hidden="true"><span data-project-title>Throwing</span></span>
            <span className="support-mask" aria-hidden="true"><span data-project-title>Eggs</span></span>
          </h2>
          <p data-project-copy className="project-description">Our current project — a four-player, two-team climbing card game.</p>
          <p data-project-copy className="body-muted support-lead" aria-label="4 players, 2 teams, 108 cards.">
            <span aria-hidden="true">4 players, 2 teams, <span data-counter className="project-counter">108</span> cards.</span>
          </p>
        </div>
        <div className="project-table" aria-hidden="true">
          <div className="project-table-light" />
          {[-1, 1].map((side, i) => (
            <div key={side} className={`project-card-holder project-card-holder-${i}`}>
              <div data-project-shadow style={shadowStyle()} />
              <div data-project-card className="card-back-surface project-card" style={{ transform: `rotate(${side * 11}deg)` }} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function AnyoneSlide() {
  const root = useRef<HTMLElement>(null)
  useScene(root, (section, desktop) => {
    const tl = gsap.timeline({ scrollTrigger: {
      id: 'support-anyone', trigger: section, start: 'top 82%', end: 'center 48%',
      scrub: 0.35, invalidateOnRefresh: true,
    } })
    tl.fromTo(section.querySelectorAll('[data-anyone-letter]'), {
      x: (i) => (i - 2.5) * (desktop ? 26 : 7),
      yPercent: (i) => i % 2 ? 32 : -26,
      rotation: (i) => (i - 2.5) * 1.4,
      opacity: 0.12,
    }, { x: 0, yPercent: 0, rotation: 0, opacity: 1, duration: 0.64, stagger: { each: 0.04, from: 'center' }, ease: 'power2.inOut' }, 0)
      .fromTo(section.querySelector('[data-anyone-rule]'), { scaleX: 0 }, { scaleX: 1, duration: 0.38, ease: 'power2.out' }, 0.3)
      .fromTo(section.querySelectorAll('[data-anyone-copy]'), { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.3, stagger: 0.09, ease: 'power2.out' }, 0.5)
  })
  return (
    <section ref={root} id="anyone" className="section support-scene anyone-scene" aria-label="Anyone. Any person, any study.">
      <div className="container-site anyone-copy">
        <h2 className="anyone-title" aria-label="Anyone">
          <span aria-hidden="true">{'Anyone'.split('').map((letter, i) => <span key={i} data-anyone-letter>{letter}</span>)}</span>
        </h2>
        <div data-anyone-rule className="anyone-rule" aria-hidden="true" />
        <p data-anyone-copy className="anyone-invitation">Any person, any study.</p>
        <p data-anyone-copy className="body-muted support-lead">Every school, every major, every background.</p>
      </div>
    </section>
  )
}
