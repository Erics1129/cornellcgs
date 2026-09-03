import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { EASE } from '../lib/eases'
import { prefersReducedMotion } from '../lib/motion'
import { dealCard, shadowStyle } from '../lib/cardMotion'

gsap.registerPlugin(ScrollTrigger)

/**
 * Three statement slides — three different mechanics, three faces:
 *
 *   AlphaGo       — the one zoom: a serif italic word fills the screen and
 *                   shrinks into its sentence over a Go board that draws in
 *   Throwing Eggs — a light sweep: the headline wipes on and a highlight
 *                   travels through its gradient while two card backs are
 *                   thrown in from the wings to flank it (dealCard: arc, spin,
 *                   landing bounce, separated shadow) and a counter deals to
 *                   108. The type never scales.
 *   Anyone        — a gathering: widely spaced serif letters close ranks as a
 *                   gradient ignites through their outline
 *
 * All pin and scrub. Transforms, opacity, clip and gradient position only.
 * Word positions are measured from offsets (pinned rects read garbage
 * mid-refresh); every value is a function so a resize re-derives it.
 */

const PIN = {
  start: 'top top',
  pin: true,
  scrub: 0.4,
  anticipatePin: 1,
  invalidateOnRefresh: true,
  refreshPriority: 1,
} as const

const GRADIENT_ICE = 'linear-gradient(100deg, #f2f5ff 0%, #cfe0ff 45%, #7a9dff 100%)'
const GRADIENT_WARM = 'linear-gradient(100deg, #ffe3b0 0%, #fff5e1 35%, #9fc3ff 100%)'

const gradientText = (image: string, extra?: React.CSSProperties): React.CSSProperties => ({
  backgroundImage: image,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  ...extra,
})

/** Idle-life phase (seconds): siblings never move in lockstep. */
const life = (delay: number, dur?: number): React.CSSProperties => ({
  ['--life-delay' as string]: `${delay}s`,
  ...(dur ? { ['--life-dur' as string]: `${dur}s` } : {}),
})

/** Where the word must travel from so it starts centered and huge. */
function travel(word: HTMLElement, section: HTMLElement, maxW = 0.84, maxH = 0.42) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  let left = 0
  let top = 0
  let el: HTMLElement | null = word
  while (el && el !== section) {
    left += el.offsetLeft
    top += el.offsetTop
    el = el.offsetParent as HTMLElement | null
  }
  const cw = word.offsetWidth
  const ch = word.offsetHeight
  return {
    x: vw / 2 - (left + cw / 2),
    y: vh / 2 - (top + ch / 2),
    scale: Math.max(1.6, Math.min((vw * maxW) / cw, (vh * maxH) / ch)),
  }
}

function usePinned(
  root: React.RefObject<HTMLElement | null>,
  end: string,
  build: (tl: gsap.core.Timeline, section: HTMLElement) => void,
  statics: () => Element[],
) {
  useLayoutEffect(() => {
    const section = root.current
    if (!section) return
    if (prefersReducedMotion()) {
      gsap.set(statics(), { opacity: 1, clearProps: 'transform,clipPath' })
      return
    }
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ scrollTrigger: { trigger: section, end, ...PIN } })
      build(tl, section)
    }, section)
    return () => ctx.revert()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

/* ---------------------------------------------------------------- AlphaGo */

export function AlphaGoSlide() {
  const root = useRef<HTMLElement>(null)
  const word = useRef<HTMLSpanElement>(null)
  const rest = useRef<HTMLSpanElement>(null)
  const lead = useRef<HTMLParagraphElement>(null)
  const board = useRef<SVGSVGElement>(null)

  usePinned(
    root,
    '+=160%',
    (tl, section) => {
      const w = word.current!
      const dots = Array.from(board.current!.querySelectorAll('circle'))
      gsap.set(w, { transformOrigin: '50% 50%', willChange: 'transform' })
      gsap.set([rest.current, lead.current], { opacity: 0 })
      gsap.set(dots, { scale: 0, transformOrigin: '50% 50%' })

      tl.to(dots, { scale: 1, duration: 0.42, ease: 'none', stagger: { each: 0.004, from: 'center', grid: [9, 9] } }, 0)
      tl.fromTo(
        w,
        { x: () => travel(w, section).x, y: () => travel(w, section).y, scale: () => travel(w, section).scale },
        { x: 0, y: 0, scale: 1, duration: 0.62, ease: 'power1.inOut' },
        0,
      )
      tl.to(board.current, { opacity: 0.35, scale: 1.08, duration: 0.3, ease: 'none' }, 0.6)
      tl.fromTo(rest.current, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.28, ease: EASE.out }, 0.5)
      tl.fromTo(lead.current, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.3, ease: EASE.out }, 0.7)
    },
    () => [rest.current!, lead.current!],
  )

  const n = 9
  const cells = Array.from({ length: n * n }, (_, i) => ({ cx: 20 + (i % n) * 30, cy: 20 + Math.floor(i / n) * 30 }))

  return (
    <section ref={root} id="alphago" className="section overflow-x-clip" aria-label="AlphaGo. The kind of AI we build.">
      {/* The board is GSAP-scaled, so the centering and the breath live on wrappers */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[min(74vh,74vw)] w-[min(74vh,74vw)] -translate-x-1/2 -translate-y-1/2"
      >
        <div className="life-breathe h-full w-full" style={life(-2.6, 9)}>
          <svg ref={board} viewBox="0 0 280 280" className="h-full w-full opacity-70">
            {cells.map((c, i) => (
              <circle key={i} cx={c.cx} cy={c.cy} r={2.2} fill="var(--neon-mid)" opacity={0.55} />
            ))}
          </svg>
        </div>
      </div>
      <div className="container-site relative">
        {/* The word is the scaled element; its gradient (and shimmer) ride an inner span */}
        <div className="life-float" style={life(-3.1, 8.4)}>
          <h2 className="h-section max-w-[18ch]">
            <span
              ref={word}
              className="inline-block italic"
              style={{ fontFamily: 'var(--font-serif)', fontWeight: 500, letterSpacing: '-0.01em' }}
            >
              <span className="life-shimmer inline-block" style={gradientText(GRADIENT_ICE, { paddingRight: '0.06em' })}>
                AlphaGo
              </span>
            </span>
            <span ref={rest} className="inline">
              . The kind of AI we build.
            </span>
          </h2>
        </div>
        <div className="life-float" style={life(-5.4, 7)}>
          <p ref={lead} className="body-muted mt-6 max-w-[40ch] text-[max(1.1rem,1.125rem)]">
            Solvers, agents, and the math behind every hand.
          </p>
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------- Throwing Eggs */

const PROJECT_LINE = 'Our current project — a four-player, two-team climbing card game.'

export function ProjectSlide() {
  const root = useRef<HTMLElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const line = useRef<HTMLParagraphElement>(null)
  const lead = useRef<HTMLParagraphElement>(null)
  const counter = useRef<HTMLSpanElement>(null)
  const cardL = useRef<HTMLDivElement>(null)
  const cardR = useRef<HTMLDivElement>(null)
  const shadowL = useRef<HTMLDivElement>(null)
  const shadowR = useRef<HTMLDivElement>(null)

  usePinned(
    root,
    '+=150%',
    (tl) => {
      const t = title.current!
      const words = Array.from(line.current!.querySelectorAll('span'))
      gsap.set(t, { clipPath: 'inset(0 100% 0 0)', backgroundPosition: '100% 0' })
      gsap.set(words, { opacity: 0, y: 8 })
      gsap.set(lead.current, { opacity: 0 })

      // The headline wipes on, then a highlight travels through its gradient
      tl.to(t, { clipPath: 'inset(0 0% 0 0)', duration: 0.42, ease: 'none' }, 0)
      tl.to(t, { backgroundPosition: '0% 0', duration: 0.6, ease: 'none' }, 0.2)
      // Two card backs are thrown in from the wings: up from below the table
      // edge along a shallow arc, spinning off a ∓70° release, peaking a hair
      // closer to the eye, landing with a bounce on a shadow that stays on the
      // table. Each holder already sits at the resting spot (±34vw), so the
      // deal is relative to it and ends at x:0. Off-screen at release (holder
      // −34vw, card −70vw more), so no opacity fade is needed.
      const vw = window.innerWidth
      const vh = window.innerHeight
      const throwIn = (card: HTMLElement, shadow: HTMLElement | null, side: -1 | 1) =>
        dealCard(card, {
          from: { x: side * vw * 0.7, y: vh * 0.3, rotation: side * -70 },
          rotation: side * -8,
          duration: 0.45,
          lift: -60,
          air: 1.1,
          shadow,
          immediate: true,
        })
      tl.add(throwIn(cardL.current!, shadowL.current, -1), 0.12)
      tl.add(throwIn(cardR.current!, shadowR.current, 1), 0.18)
      // The description, a word at a time; the counter deals to 108
      tl.to(words, { opacity: 1, y: 0, duration: 0.2, ease: EASE.out, stagger: 0.012 }, 0.5)
      tl.to(lead.current, { opacity: 1, duration: 0.2, ease: 'none' }, 0.66)
      const n = { v: 0 }
      tl.to(
        n,
        {
          v: 108,
          duration: 0.3,
          ease: 'none',
          onUpdate: () => {
            if (counter.current) counter.current.textContent = String(Math.round(n.v))
          },
        },
        0.68,
      )
    },
    () => [title.current!, line.current!, lead.current!, ...Array.from(line.current?.querySelectorAll('span') ?? [])],
  )

  // Each card back rides in a holder parked at its resting spot — ±34vw off
  // centre, exactly where the old fly-in settled — over a separated shadow.
  // The throw moves only the inner card, relative to the holder, so a resize
  // re-derives the rest for free. The static box-shadow is dropped: the
  // shadow element under the card is the one that reacts to the flight.
  // Reduced motion never runs the deal: the holder's CSS already parks it and
  // the card keeps the same ±8° via motion-reduce, as before.
  const holder = 'pointer-events-none absolute top-1/2 aspect-[5/7] w-[clamp(96px,13vw,190px)] -translate-x-1/2 -translate-y-1/2'
  const card = 'card-back-surface absolute inset-0'

  return (
    <section ref={root} id="project" className="section overflow-x-clip" aria-label="Throwing Eggs. Our current project.">
      {/* The holder owns the centering transform, the card the deal — the sway sits between */}
      <div aria-hidden="true" className={`${holder} left-[calc(50%-34vw)] motion-reduce:left-[16%]`}>
        <div className="life-sway absolute inset-0" style={life(-2.2, 9)}>
          <div ref={shadowL} style={shadowStyle()} />
          <div ref={cardL} className={`${card} motion-reduce:-rotate-8`} style={{ boxShadow: 'none' }} />
        </div>
      </div>
      <div aria-hidden="true" className={`${holder} left-[calc(50%+34vw)] motion-reduce:left-[84%]`}>
        <div className="life-sway absolute inset-0" style={life(-6.1, 10.6)}>
          <div ref={shadowR} style={shadowStyle()} />
          <div ref={cardR} className={`${card} motion-reduce:rotate-8`} style={{ boxShadow: 'none' }} />
        </div>
      </div>
      <div className="container-site relative">
        <h2
          ref={title}
          className="max-w-[10ch] text-[clamp(3rem,10vw,10rem)] font-[800] leading-[0.92] tracking-[-0.03em]"
          style={gradientText(GRADIENT_WARM, {
            fontFamily: "'Bricolage Grotesque', 'Hanken Grotesk', system-ui, sans-serif",
            backgroundSize: '300% 100%',
            fontVariationSettings: '"opsz" 96',
          })}
        >
          Throwing Eggs
        </h2>
        <p ref={line} className="mt-6 max-w-[38ch] text-[clamp(1.2rem,2vw,1.7rem)] leading-snug text-[var(--text)]">
          {PROJECT_LINE.split(' ').map((w, i) => (
            <span key={i} className="inline-block">
              {w}
              {i < PROJECT_LINE.split(' ').length - 1 ? ' ' : ''}
            </span>
          ))}
        </p>
        <div className="life-float" style={life(-4.4, 7.8)}>
          <p ref={lead} className="body-muted mt-5 text-[max(1.1rem,1.125rem)]">
            4 players, 2 teams,{' '}
            {/* Rests at the true value so reduced motion and screen readers get
                "108 cards"; the deal tween overwrites it from 0 once it starts. */}
            <span ref={counter} data-counter className="text-[var(--text)]">
              108
            </span>{' '}
            cards.
          </p>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ Anyone */

export function AnyoneSlide() {
  const root = useRef<HTMLElement>(null)
  const word = useRef<HTMLSpanElement>(null)
  const outline = useRef<HTMLSpanElement>(null)
  const fill = useRef<HTMLSpanElement>(null)
  const rest = useRef<HTMLSpanElement>(null)
  const lead = useRef<HTMLParagraphElement>(null)
  const rule = useRef<HTMLDivElement>(null)

  usePinned(
    root,
    '+=150%',
    (tl) => {
      // Phones: 0.55em on a 60px serif pushes the last letter past the clip
      // edge, so the ranks start a little closer together (same mechanic).
      const startSpacing = window.matchMedia('(max-width: 480px)').matches ? '0.3em' : '0.55em'
      gsap.set(word.current, { letterSpacing: startSpacing })
      gsap.set(fill.current, { opacity: 0 })
      gsap.set([rest.current, lead.current], { opacity: 0 })
      gsap.set(rule.current, { scaleX: 0, transformOrigin: '0% 50%' })

      // The letters close ranks while the gradient ignites through the outline
      tl.to(word.current, { letterSpacing: '-0.01em', duration: 0.6, ease: 'power2.inOut' }, 0)
      tl.to(fill.current, { opacity: 1, duration: 0.35, ease: 'none' }, 0.25)
      tl.to(outline.current, { opacity: 0, duration: 0.25, ease: 'none' }, 0.45)
      tl.to(rule.current, { scaleX: 1, duration: 0.3, ease: EASE.out }, 0.55)
      tl.fromTo(rest.current, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.28, ease: EASE.out }, 0.6)
      tl.fromTo(lead.current, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.3, ease: EASE.out }, 0.76)
    },
    () => [fill.current!, rest.current!, lead.current!],
  )

  const serif = { fontFamily: "'Instrument Serif', 'STIX Two Text', Georgia, serif", fontStyle: 'italic' as const }

  return (
    <section ref={root} id="anyone" className="section overflow-x-clip" aria-label="Anyone. Any person, any study.">
      <div className="container-site relative">
        <h2 className="text-[clamp(3.8rem,11vw,11rem)] font-[400] leading-[0.95]" style={serif}>
          <span ref={word} className="relative inline-block">
            <span
              ref={outline}
              aria-hidden="true"
              className="text-transparent motion-reduce:opacity-0"
              style={{ WebkitTextStroke: '1px color-mix(in srgb, var(--muted) 70%, transparent)' }}
            >
              Anyone
            </span>
            <span ref={fill} className="life-shimmer absolute inset-0" style={gradientText(GRADIENT_ICE, life(-1.7, 8))}>
              Anyone
            </span>
          </span>
        </h2>
        {/* The rule is GSAP-drawn (scaleX), so its glow rides a wrapper */}
        <div aria-hidden="true" className="life-glow mt-6" style={life(-1.3, 4.6)}>
          <div ref={rule} className="h-px w-[min(36ch,80vw)] bg-[linear-gradient(90deg,var(--neon-mid),rgba(78,168,255,0.1))]" />
        </div>
        <p className="life-float mt-6 max-w-[30ch] text-[clamp(1.6rem,3.2vw,3rem)] leading-tight text-[var(--text)]" style={{ ...serif, ...life(-2.9, 8.2) }}>
          <span ref={rest}>Any person, any study.</span>
        </p>
        <div className="life-float" style={life(-5.6, 6.6)}>
          <p ref={lead} className="body-muted mt-5 max-w-[40ch] text-[max(1.1rem,1.125rem)]">
            Every school, every major, every background.
          </p>
        </div>
      </div>
    </section>
  )
}
