import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import SectionIndex from './SectionIndex'
import TypeLine from './TypeLine'
import HeroCard from './HeroCard'
import { site, hero } from '../content'
import { scrollToId } from '../lib/scroll'
import { prefersReducedMotion } from '../lib/motion'

/**
 * Hero (A♠). The card animation floats in the middle of the page and the
 * words appear at the sides: the title rises line by line on the left, the
 * typing line and CTAs fade in on the right. On mobile the card sits above
 * and the words stack below.
 */
export default function Hero() {
  const root = useRef<HTMLElement>(null)

  useEffect(() => {
    if (prefersReducedMotion()) return
    const ctx = gsap.context(() => {
      gsap.from('[data-hero-line] > span', {
        yPercent: 112,
        duration: 1.15,
        ease: 'power3.out',
        stagger: 0.09,
        delay: 0.25,
      })
      gsap.from('[data-hero-fade]', {
        opacity: 0,
        y: 18,
        duration: 0.9,
        ease: 'power2.out',
        stagger: 0.12,
        delay: 0.85,
      })
    }, root)
    return () => ctx.revert()
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
      <div className="container-site pointer-events-none relative z-10 grid min-h-[100svh] grid-cols-1 content-end gap-8 pb-24 pt-[46svh] md:min-h-0 md:grid-cols-[1fr_minmax(260px,30vw)_1fr] md:content-center md:items-center md:gap-0 md:py-28">
        {/* Left side — the name */}
        <div className="md:pr-6">
          <p data-hero-fade className="eyebrow pointer-events-auto mb-5">
            {site.eyebrow}
          </p>
          <h1 className="font-display pointer-events-auto text-[clamp(2.5rem,4.6vw,4.8rem)] leading-[0.98] tracking-[-0.02em] text-[var(--text)]">
            <span data-hero-line className="block overflow-hidden">
              <span className="block">Cornell</span>
            </span>
            <span data-hero-line className="block overflow-hidden">
              <span className="block">Computational</span>
            </span>
            <span data-hero-line className="block overflow-hidden">
              <span className="block">
                Game <em>Society</em>
              </span>
            </span>
          </h1>
        </div>

        {/* Center — kept clear for the card */}
        <div aria-hidden="true" className="hidden md:block" />

        {/* Right side — the appearing words */}
        <div className="flex flex-col items-start gap-8 md:items-end md:pl-6 md:text-right">
          <div data-hero-fade className="pointer-events-auto min-h-[3.4em] md:max-w-[24ch]">
            <TypeLine />
          </div>
          <div data-hero-fade className="pointer-events-auto flex flex-wrap gap-4 md:justify-end">
            <a
              href={hero.ctaPrimary.href}
              onClick={(e) => {
                e.preventDefault()
                scrollToId('join')
              }}
              className="btn btn-primary neon rounded-full"
            >
              {hero.ctaPrimary.label}
            </a>
            <a
              href={hero.ctaSecondary.href}
              onClick={(e) => {
                e.preventDefault()
                scrollToId('what-we-do')
              }}
              className="btn neon rounded-full"
            >
              {hero.ctaSecondary.label}
            </a>
          </div>
          <p data-hero-fade className="mono pointer-events-auto text-[max(0.8rem,13px)] text-[var(--muted)]">
            Click the card. See what happens.
          </p>
        </div>
      </div>

      {/* Scroll hint — a tiny card that tips forward and back */}
      <div
        data-hero-fade
        aria-hidden="true"
        className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2"
      >
        <div className="h-9 w-[26px] animate-[card-tip_2.6s_ease-in-out_infinite] rounded-[4px] border border-[color-mix(in_srgb,var(--silver)_50%,transparent)] bg-[var(--ink)]" />
        <span className="mono text-[max(0.75rem,12px)] text-[var(--muted)]">{hero.scrollHint}</span>
      </div>
    </section>
  )
}
