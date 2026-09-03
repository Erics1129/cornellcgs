import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import SectionIndex from './SectionIndex'
import TypeLine from './TypeLine'
import HeroCard from './HeroCard'
import { hero } from '../content'
import { EASE } from '../lib/eases'
import { scrollToId } from '../lib/scroll'
import { BOOTED_EVENT, prefersReducedMotion } from '../lib/motion'

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

  useEffect(() => {
    if (prefersReducedMotion()) return
    const ctx = gsap.context(() => {
      gsap.set('[data-hero-line] > span', { yPercent: 112, rotation: 2.5, transformOrigin: '0% 100%' })
      gsap.set('[data-hero-fade]', { opacity: 0, y: 18 })
      gsap.set('[data-hero-hint]', { opacity: 0, y: 12 })

      const play = () => {
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

        // The hint retires on first scroll — it did its job.
        ScrollTrigger.create({
          start: '40px top',
          once: true,
          onEnter: () =>
            gsap.to('[data-hero-hint]', { opacity: 0, y: 8, duration: 0.35, ease: 'power2.out' }),
        })
      }

      if ((window as { __cgsShown?: boolean }).__cgsShown) play()
      else window.addEventListener(BOOTED_EVENT, play, { once: true })
    }, root)
    return () => ctx.revert()
  }, [])

  // Counter-parallax: the words drift opposite the card's cursor tilt, so the
  // hero reads as layered space. Transform-only on two elements.
  useEffect(() => {
    if (prefersReducedMotion()) return
    if (!window.matchMedia('(pointer: fine)').matches) return
    const el = root.current
    if (!el) return
    const left = el.querySelector('[data-hero-left]')
    const right = el.querySelector('[data-hero-right]')
    if (!left || !right) return
    const lx = gsap.quickTo(left, 'x', { duration: 1.4, ease: 'power2.out' })
    const ly = gsap.quickTo(left, 'y', { duration: 1.4, ease: 'power2.out' })
    const rx = gsap.quickTo(right, 'x', { duration: 1.4, ease: 'power2.out' })
    const ry = gsap.quickTo(right, 'y', { duration: 1.4, ease: 'power2.out' })
    const onMove = (e: PointerEvent) => {
      const nx = e.clientX / window.innerWidth - 0.5
      const ny = e.clientY / window.innerHeight - 0.5
      lx(nx * -12)
      ly(ny * -8)
      rx(nx * -8)
      ry(ny * -6)
    }
    el.addEventListener('pointermove', onMove)
    return () => el.removeEventListener('pointermove', onMove)
  }, [])

  return (
    <section
      ref={root}
      id="top"
      className="relative flex min-h-[100svh] items-center overflow-hidden"
    >
      <SectionIndex rank="A" />

      {/* The animation, front and center */}
      <HeroCard />

      {/* Words at the sides */}
      <div className="container-site pointer-events-none relative z-10 grid min-h-[100svh] grid-cols-1 content-end gap-8 pb-24 pt-[46svh] md:min-h-0 md:grid-cols-[1fr_minmax(16.25rem,30vw)_1fr] md:content-center md:items-center md:gap-0 md:py-28">
        {/* Left side — the name */}
        <div data-hero-left className="md:pr-6">
          <h1 className="font-display pointer-events-auto text-[clamp(2.5rem,4.8vw,5.4rem)] leading-[0.98] tracking-[-0.028em] text-[var(--text)]">
            <span data-hero-line className="-mb-[0.12em] block overflow-hidden pb-[0.12em]">
              <span className="block">Cornell</span>
            </span>
            <span data-hero-line className="-mb-[0.12em] block overflow-hidden pb-[0.12em]">
              <span className="block">Computational</span>
            </span>
            <span data-hero-line className="-mb-[0.12em] block overflow-hidden pb-[0.12em]">
              <span className="block">
                {/* Breathe on an inner wrapper — the masked line span is GSAP's */}
                Game{' '}
                <em>
                  <span
                    className="life-breathe inline-block"
                    style={{ ['--life-dur' as string]: '8.6s', ['--life-delay' as string]: '-2.9s' }}
                  >
                    Society
                  </span>
                </em>
              </span>
            </span>
          </h1>
        </div>

        {/* Center — kept clear for the card */}
        <div aria-hidden="true" className="hidden md:block" />

        {/* Right side — the appearing words */}
        <div data-hero-right className="flex flex-col items-start gap-8 md:items-end md:pl-6">
          {/* Right-positioned but left-typed, so the line's edge never re-rags */}
          <div data-hero-fade className="pointer-events-auto min-h-[3.4em] md:w-[24ch] md:text-left">
            <TypeLine />
          </div>
          <div data-hero-fade className="pointer-events-auto">
            {/* Float on a wrapper — the fade above is GSAP's. The neon laps at
                a whisper at rest; the second comet starts half a turn away. */}
            <div
              className="life-float flex flex-wrap gap-4 md:justify-end"
              style={{ ['--life-dur' as string]: '12s', ['--life-delay' as string]: '-4.1s' }}
            >
              <a
                href={hero.ctaPrimary.href}
                onClick={(e) => {
                  e.preventDefault()
                  scrollToId('join')
                }}
                className="btn btn-primary neon neon-idle"
              >
                <RollLabel text={hero.ctaPrimary.label} />
              </a>
              <a
                href={hero.ctaSecondary.href}
                onClick={(e) => {
                  e.preventDefault()
                  scrollToId('what-we-do')
                }}
                className="btn neon neon-idle"
                style={{ ['--neon-from' as string]: '180deg' }}
              >
                <RollLabel text={hero.ctaSecondary.label} />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll hint — a tiny card that tips forward and back */}
      <div
        data-hero-hint
        aria-hidden="true"
        className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2"
      >
        <div className="h-9 w-[1.625rem] animate-[card-tip_2.6s_ease-in-out_infinite] rounded-[0.25rem] border border-[color-mix(in_srgb,var(--silver)_50%,transparent)] bg-[var(--ink)]" />
        <span
          className="life-glow mono text-[max(0.75rem,0.75rem)] text-[var(--muted)]"
          style={{ ['--life-dur' as string]: '4.4s', ['--life-delay' as string]: '-1.6s' }}
        >
          {hero.scrollHint}
        </span>
      </div>
    </section>
  )
}
