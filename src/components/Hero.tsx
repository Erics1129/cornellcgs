import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import SectionIndex from './SectionIndex'
import TypeLine from './TypeLine'
import HeroCard from './HeroCard'
import GlassTitle from './GlassTitle'
import CodeCity from '../effects/CodeCity'
import { hero } from '../content'
import { EASE } from '../lib/eases'
import { BOOTED_EVENT, prefersReducedMotion } from '../lib/motion'
import { attachMagnetic } from '../lib/magnetic'
import { deckFrame, onDeck } from '../lib/deck'
import { look, onLook } from '../lib/look'

/**
 * Hero (A♠). The card animation floats in the middle of the page and the
 * words appear at the sides: the title rises line by line on the left, the
 * typing line and CTAs fade in on the right. On mobile the card sits above
 * and the words stack below.
 *
 * The entrance waits for the loader's handoff (BOOTED_EVENT) so the
 * choreography is never half-consumed behind the curtain.
 */

/** Dual-label roll for the CTA hover (markup contract in global.css). */
function RollLabel({ text }: { text: string }) {
  return (
    <span className="btn-label">
      <span>{text}</span>
      <span aria-hidden="true">{text}</span>
    </span>
  )
}

export default function Hero() {
  const root = useRef<HTMLElement>(null)
  const [effectsPaused, setEffectsPaused] = useState(false)

  useEffect(() => {
    // A live preference change restores readable text and kills the entrance.
    // Once presented, the title never hides again just because motion returns.
    let presented = prefersReducedMotion()
    const media = gsap.matchMedia(root)
    media.add('(prefers-reduced-motion: no-preference)', context => {
      if (presented) return
      gsap.set('[data-hero-line] > span', { yPercent: 112, rotation: 2.5, transformOrigin: '0% 100%' })
      gsap.set('[data-hero-fade]', { opacity: 0, y: 18 })
      gsap.set('[data-hero-hint]', { opacity: 0, y: 12 })

      const play = () => {
        if (presented) return
        presented = true
        // Boot may happen after this effect returns; record its animations in
        // the same context so unmount and live reduced motion still own them.
        context.add(() => {
          const tl = gsap.timeline()
          tl.to('[data-hero-line] > span', {
            yPercent: 0,
            rotation: 0,
            duration: 1.15,
            ease: EASE.out,
            stagger: 0.12,
          })
            .to(
              '[data-hero-fade]',
              { opacity: 1, y: 0, duration: 0.7, ease: EASE.out, stagger: 0.08 },
              0.45,
            )
            .to('[data-hero-hint]', { opacity: 1, y: 0, duration: 0.8, ease: EASE.out }, 2.2)

        })
      }

      if ((window as { __cgsShown?: boolean }).__cgsShown) play()
      else window.addEventListener(BOOTED_EVENT, play, { once: true })
      return () => window.removeEventListener(BOOTED_EVENT, play)
    })
    return () => media.revert()
  }, [])

  // The scroll hint is a function of where the page is, not of an event that
  // fired once: it fades over the first 120 px and is back when the reader
  // returns to the top. The entrance owns the outer element, this the inner.
  useEffect(() => {
    const hint = root.current?.querySelector<HTMLElement>('[data-hero-hint-fade]')
    if (!hint) return
    let shown = -1
    const paint = () => {
      const y = deckFrame().y
      const o = y <= 20 ? 1 : y >= 120 ? 0 : Math.round((1 - (y - 20) / 100) * 100) / 100
      if (o === shown) return
      shown = o
      hint.style.opacity = String(o)
      hint.style.visibility = o === 0 ? 'hidden' : 'visible'
    }
    paint()
    return onDeck(paint)
  }, [])

  // Counter-parallax: the words drift opposite the card's tilt, so the hero
  // reads as layered space. Fed by the shared look vector (pointer on a
  // laptop; finger on the card, tilt or the idle drift on a phone), which is
  // already smoothed, so two transforms are simply set while the hero shows.
  useEffect(() => {
    const el = root.current
    if (!el || effectsPaused) return
    const left = el.querySelector<HTMLElement>('[data-hero-left]')
    const right = el.querySelector<HTMLElement>('[data-hero-right]')
    if (!left || !right) return
    const media = gsap.matchMedia(root)
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const setLeft = gsap.quickSetter(left, 'css')
      const setRight = gsap.quickSetter(right, 'css')
      let lastX = NaN, lastY = NaN
      const paint = () => {
        const f = deckFrame()
        // past the hero the words are off screen: leave them where they are
        if (f.y > f.vh) return
        const l = look()
        const x = Math.round(l.x * 60) / 10, y = Math.round(l.y * 40) / 10
        if (x === lastX && y === lastY) return
        lastX = x; lastY = y
        setLeft({ x: -x, y: -y })
        setRight({ x: -x * 0.66, y: -y * 0.75 })
      }
      paint()
      const off = onLook(paint)
      return () => {
        off()
        gsap.set([left, right], { x: 0, y: 0 })
      }
    })
    return () => media.revert()
  }, [effectsPaused])

  // The two calls to action lean toward a fine pointer (5 px at most).
  useEffect(() => {
    const el = root.current
    if (!el) return
    // the pull moves a wrapper: the button keeps its own hover and press transforms
    const offs = Array.from(el.querySelectorAll<HTMLElement>('.hero-magnet')).map((wrap) => attachMagnetic(wrap, 5, 0.3))
    return () => offs.forEach((off) => off())
  }, [])

  return (
    <section
      ref={root}
      id="top"
      className="relative isolate flex min-h-[100svh] items-center overflow-hidden"
    >
      <CodeCity paused={effectsPaused} />
      <SectionIndex rank="A" />

      {/* The animation, front and center */}
      <HeroCard onPausedChange={setEffectsPaused} />

      {/* Words at the sides */}
      <div className="container-site pointer-events-none relative z-10 grid min-h-[100svh] grid-cols-1 content-end gap-8 pb-24 pt-[max(46svh,calc(4rem+39svh+3rem))] md:min-h-0 md:grid-cols-[minmax(0,1fr)_minmax(16.25rem,30vw)_minmax(0,1fr)] md:content-center md:items-center md:gap-0 md:py-28">
        {/* Left side — the name */}
        <div data-hero-left className="md:pr-6 md:[container-type:inline-size]">
          <GlassTitle />
        </div>

        {/* Center — kept clear for the card */}
        <div aria-hidden="true" className="hidden md:block" />

        {/* Right side — the appearing words */}
        <div data-hero-right className="flex flex-col items-start gap-8 md:items-end md:pl-6">
          {/* Right-positioned but left-typed, so the line's edge never re-rags */}
          <div data-hero-fade className="pointer-events-auto min-h-[3.4em] md:w-[24ch] md:text-left">
            <TypeLine />
          </div>
          <div data-hero-fade className="pointer-events-auto w-full sm:w-auto">
            {/* Float on a wrapper — the fade above is GSAP's. The neon laps at
                a whisper at rest; the second comet starts half a turn away. */}
            <div
              className="hero-actions life-float grid w-full grid-cols-2 gap-3 sm:w-[23rem] md:w-[16.5rem] md:grid-cols-1"
              style={{ ['--life-dur' as string]: '12s', ['--life-delay' as string]: '-4.1s' }}
            >
              {/* the coffee chat form opens in its own tab; the mini games are a real page */}
              <span className="hero-magnet grid">
                <a
                  href={hero.ctaPrimary.href}
                  target="_blank"
                  rel="noopener"
                  className="btn btn-primary neon neon-idle justify-center"
                >
                  <RollLabel text={hero.ctaPrimary.label} />
                </a>
              </span>
              <span className="hero-magnet grid">
                <a
                  href={hero.ctaSecondary.href}
                  className="btn hero-btn-ghost neon neon-idle justify-center"
                  style={{ ['--neon-from' as string]: '180deg' }}
                >
                  <RollLabel text={hero.ctaSecondary.label} />
                </a>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll hint — a tiny card that tips forward and back */}
      <div
        data-hero-hint
        aria-hidden="true"
        className="absolute bottom-6 left-1/2 z-10 hidden -translate-x-1/2 flex-col items-center gap-2 md:flex [@media(max-height:700px)]:hidden"
      >
        {/* a card outline that tips forward and back: glass, not a black tile */}
        <div data-hero-hint-fade className="flex flex-col items-center gap-2">
          <div className="hero-hint-card animate-[card-tip_2.6s_ease-in-out_infinite]"><span>♠</span></div>
          <span
            className="life-glow mono text-[max(0.75rem,0.75rem)] text-[var(--muted)]"
            style={{ ['--life-dur' as string]: '4.4s', ['--life-delay' as string]: '-1.6s' }}
          >
            {hero.scrollHint}
          </span>
        </div>
      </div>
    </section>
  )
}
