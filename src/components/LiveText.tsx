import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin'
import { prefersReducedMotion } from '../lib/motion'
import { ShimmerText, TypedBody, TypedHeading, WaveHeading } from './TypedText'

gsap.registerPlugin(ScrambleTextPlugin)

/**
 * Live words for the sub-pages — one design per page, none of them typing
 * (typing belongs to the hero line, the ML chapter and the laptop). Every
 * heading keeps moving between its line and its alternate; every body
 * carries its own slow light. Designs:
 *
 *   flip      letters cascade through a vertical flip into the other line
 *   scramble  the line decodes into the other line and back (lab voice)
 *   ticker    the line slides out left, the other slides in from the right
 *   wave      each letter rides its own phase of a slow swell
 *   weight    the variable font breathes between weights, tracking opens
 *   outline   stroke-only glyphs fill with navy, then blue, then empty again
 *   glitch    a chromatic split snaps the line into the other one
 *   tilt      letters lean like cards being squared, each on its own beat
 *   converge  letters scatter like a bad initialisation and settle back into
 *             the line — the other line, every other time (ML page)
 *   typed     the hero's typewriter (kept for the deck's ML chapter)
 *
 * Bodies: shimmer (light sweeps through), glow (words pulse on their own
 * phases), underline (a blue rule runs under the words), focus (words pull
 * in and out of focus), typed.
 */

export type HeadingDesign =
  | 'flip'
  | 'scramble'
  | 'ticker'
  | 'wave'
  | 'weight'
  | 'outline'
  | 'glitch'
  | 'tilt'
  | 'converge'
  | 'typed'
export type BodyDesign = 'shimmer' | 'glow' | 'underline' | 'focus' | 'typed'

const CHARS = '{}[]()<>=+*/;:#01'
const PERIOD = 5200

interface HeadingProps {
  text: string
  alt?: string
  className?: string
  as?: 'h1' | 'h2' | 'h3'
  caret?: string
}

/** Alternates between the two lines on a timer; the caller animates the swap. */
function useLines(text: string, alt: string | undefined, period: number, swap: (next: string, done: () => void) => void) {
  const lines = alt ? [text, alt] : [text]
  const li = useRef(0)
  useEffect(() => {
    if (lines.length < 2 || prefersReducedMotion()) return
    let alive = true
    let busy = false
    const id = window.setInterval(() => {
      if (document.hidden || busy || !alive) return
      busy = true
      li.current = (li.current + 1) % lines.length
      swap(lines[li.current], () => {
        busy = false
      })
    }, period)
    return () => {
      alive = false
      window.clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, alt])
}

function Letters({ text, cls, phase = 0.11 }: { text: string; cls: string; phase?: number }) {
  return (
    <>
      {Array.from(text).map((ch, i) =>
        ch === ' ' ? (
          <span key={i}> </span>
        ) : (
          <span key={i} className={cls} style={{ ['--life-delay' as string]: `${-(i * phase)}s` }}>
            {ch}
          </span>
        ),
      )}
    </>
  )
}

/* ------------------------------------------------------------------------ */

function FlipHeading({ text, alt, className = '', as: Tag = 'h2' }: HeadingProps) {
  const ref = useRef<HTMLHeadingElement>(null)
  const [line, setLine] = useState(text)
  const pending = useRef<(() => void) | null>(null)

  useLines(text, alt, PERIOD + 800, (next, done) => {
    const letters = ref.current?.querySelectorAll<HTMLElement>('.flip-letter') ?? []
    gsap.to(letters, {
      rotateX: -90,
      duration: 0.32,
      ease: 'power2.in',
      stagger: 0.028,
      onComplete: () => {
        pending.current = done
        setLine(next)
      },
    })
  })

  // the new line arrives letter by letter from the other side of the flip
  useLayoutEffect(() => {
    const letters = ref.current?.querySelectorAll<HTMLElement>('.flip-letter') ?? []
    if (line === text && !pending.current) return
    gsap.fromTo(
      letters,
      { rotateX: 90 },
      {
        rotateX: 0,
        duration: 0.5,
        ease: 'back.out(1.6)',
        stagger: 0.03,
        onComplete: () => {
          pending.current?.()
          pending.current = null
        },
      },
    )
  }, [line, text])

  return (
    <Tag ref={ref} className={`[perspective:37.5rem] ${className}`} aria-label={text}>
      <span aria-hidden="true">
        <Letters text={line} cls="flip-letter" />
      </span>
    </Tag>
  )
}

function ScrambleHeading({ text, alt, className = '', as: Tag = 'h2' }: HeadingProps) {
  const ref = useRef<HTMLHeadingElement>(null)
  const inner = useRef<HTMLSpanElement>(null)
  useLines(text, alt, PERIOD + 1300, (next, done) => {
    const el = inner.current
    if (!el) return done()
    gsap.to(el, {
      duration: 1.0,
      ease: 'none',
      scrambleText: { text: next, chars: CHARS, revealDelay: 0.2, tweenLength: true, speed: 0.5 },
      onComplete: done,
    })
  })
  return (
    <Tag ref={ref} className={className} aria-label={text}>
      <span ref={inner} aria-hidden="true">
        {text}
      </span>
    </Tag>
  )
}

function TickerHeading({ text, alt, className = '', as: Tag = 'h2' }: HeadingProps) {
  const inner = useRef<HTMLSpanElement>(null)
  const [line, setLine] = useState(text)
  useLines(text, alt, PERIOD, (next, done) => {
    const el = inner.current
    if (!el) return done()
    gsap
      .timeline({ onComplete: done })
      .to(el, { xPercent: -110, opacity: 0, duration: 0.42, ease: 'power3.in' })
      .add(() => setLine(next))
      .set(el, { xPercent: 110 })
      .to(el, { xPercent: 0, opacity: 1, duration: 0.6, ease: 'power3.out' })
  })
  return (
    <Tag className={`ticker-clip ${className}`} aria-label={text}>
      <span ref={inner} aria-hidden="true" className="inline-block">
        {line}
      </span>
    </Tag>
  )
}

function GlitchHeading({ text, alt, className = '', as: Tag = 'h2' }: HeadingProps) {
  const inner = useRef<HTMLSpanElement>(null)
  const [line, setLine] = useState(text)
  useLines(text, alt, PERIOD + 400, (next, done) => {
    const el = inner.current
    if (!el) return done()
    el.classList.remove('glitch-on')
    void el.offsetWidth
    el.classList.add('glitch-on')
    window.setTimeout(() => setLine(next), 200)
    window.setTimeout(() => {
      el.classList.remove('glitch-on')
      done()
    }, 560)
  })
  return (
    <Tag className={className} aria-label={text}>
      <span ref={inner} aria-hidden="true" className="glitch-word" data-text={line}>
        {line}
      </span>
    </Tag>
  )
}

function ConvergeHeading({ text, alt, className = '', as: Tag = 'h2' }: HeadingProps) {
  const ref = useRef<HTMLHeadingElement>(null)
  const [line, setLine] = useState(text)
  const pending = useRef<(() => void) | null>(null)

  const scatter = (letters: NodeListOf<HTMLElement> | HTMLElement[]) =>
    gsap.to(letters, {
      x: () => gsap.utils.random(-18, 18),
      y: () => gsap.utils.random(-14, 14),
      rotation: () => gsap.utils.random(-16, 16),
      opacity: 0.35,
      filter: 'blur(2px)',
      duration: 0.5,
      ease: 'power2.in',
      stagger: { each: 0.02, from: 'random' },
    })

  useLines(text, alt, PERIOD + 1600, (next, done) => {
    const letters = ref.current?.querySelectorAll<HTMLElement>('.converge-letter') ?? []
    scatter(letters).then(() => {
      pending.current = done
      setLine(next)
    })
  })

  // the fresh line lands from scattered positions and settles with a little overshoot
  useLayoutEffect(() => {
    const letters = Array.from(ref.current?.querySelectorAll<HTMLElement>('.converge-letter') ?? [])
    if (prefersReducedMotion()) return
    gsap.fromTo(
      letters,
      {
        x: () => gsap.utils.random(-22, 22),
        y: () => gsap.utils.random(-16, 16),
        rotation: () => gsap.utils.random(-20, 20),
        opacity: 0.2,
        filter: 'blur(3px)',
      },
      {
        x: 0,
        y: 0,
        rotation: 0,
        opacity: 1,
        filter: 'blur(0px)',
        duration: 0.9,
        ease: 'elastic.out(1, 0.55)',
        stagger: { each: 0.025, from: 'random' },
        onComplete: () => {
          pending.current?.()
          pending.current = null
        },
      },
    )
  }, [line])

  return (
    <Tag ref={ref} className={className} aria-label={text}>
      <span aria-hidden="true">
        <Letters text={line} cls="converge-letter" />
      </span>
    </Tag>
  )
}

/* ------------------------------------------------------------------------ */

export function LiveHeading({ design, ...p }: HeadingProps & { design: HeadingDesign }) {
  const { text, alt, className = '', as: Tag = 'h2' } = p
  switch (design) {
    case 'typed':
      return <TypedHeading {...p} />
    case 'flip':
      return <FlipHeading {...p} />
    case 'scramble':
      return <ScrambleHeading {...p} />
    case 'ticker':
      return <TickerHeading {...p} />
    case 'glitch':
      return <GlitchHeading {...p} />
    case 'converge':
      return <ConvergeHeading {...p} />
    case 'wave':
      return <WaveHeading text={text} className={className} as={Tag} />
    case 'tilt':
      return (
        <Tag className={className} aria-label={text}>
          <span aria-hidden="true">
            <Letters text={text} cls="tilt-letter" phase={0.23} />
          </span>
        </Tag>
      )
    case 'weight':
      return (
        <Tag className={`weight-breathe ${className}`} style={{ ['--life-delay' as string]: `${-(text.length % 5)}s` }}>
          {text}
        </Tag>
      )
    case 'outline':
      return (
        <Tag className={`outline-fill ${className}`} style={{ ['--life-delay' as string]: `${-(text.length % 6)}s` }}>
          {text}
        </Tag>
      )
  }
  return null
}

export function LiveBody({
  design,
  text,
  className = '',
  index = 0,
  caret,
}: {
  design: BodyDesign
  text: string
  className?: string
  index?: number
  caret?: string
}) {
  switch (design) {
    case 'typed':
      return <TypedBody text={text} className={className} caret={caret} />
    case 'shimmer':
      return <ShimmerText text={text} className={className} delay={index * 1.7} />
    case 'underline':
      return (
        <p className={className} aria-label={text}>
          <span className="underline-run" style={{ ['--life-delay' as string]: `${-(index * 1.4)}s` }}>
            {text}
          </span>
        </p>
      )
    case 'focus':
      return (
        <p className={className} aria-label={text}>
          {text.split(' ').map((w, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="focus-word"
              style={{ ['--life-delay' as string]: `${-((i * 0.53 + index * 1.3) % 5)}s` }}
            >
              {w}
              {i < text.split(' ').length - 1 ? ' ' : ''}
            </span>
          ))}
        </p>
      )
    case 'glow':
      return (
        <p className={className} aria-label={text}>
          {text.split(' ').map((w, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="glow-word"
              style={{ ['--life-delay' as string]: `${-((i * 0.37 + index * 1.1) % 4)}s` }}
            >
              {w}
              {i < text.split(' ').length - 1 ? ' ' : ''}
            </span>
          ))}
        </p>
      )
  }
  return null
}
