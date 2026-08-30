import { useEffect, useRef } from 'react'
import SectionIndex from './SectionIndex'
import CardShell from './CardShell'
import { whoWeAre } from '../content'
import { useSectionReveals, animateCounter } from '../lib/reveal'

function renderEmphasis(text: string) {
  // *word* becomes an italic display word
  const parts = text.split('*')
  return parts.map((p, i) => (i % 2 === 1 ? <em key={i}>{p}</em> : <span key={i}>{p}</span>))
}

/**
 * Who we are (K♠) — two portrait hole cards laid side by side, slightly
 * rotated toward each other like a player peeking, with four count-up
 * counters styled as card corner indices beneath.
 */
export default function WhoWeAre() {
  const root = useRef<HTMLElement>(null)
  useSectionReveals(root)

  const countersRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const wrap = countersRef.current
    if (!wrap) return
    const tweens = Array.from(wrap.querySelectorAll<HTMLElement>('[data-counter]')).map((el) =>
      animateCounter(el, Number(el.dataset.counter), el.dataset.noSeparator === 'true'),
    )
    return () => tweens.forEach((t) => t.kill())
  }, [])

  return (
    <section ref={root} id="who-we-are" className="section">
      <SectionIndex rank="K" />
      <div className="container-site">
        <h2 data-reveal="heading" className="h-section mx-auto mb-10 max-w-[18ch] text-center md:mb-12">
          {renderEmphasis(whoWeAre.heading)}
        </h2>

        {/* The hole cards */}
        <div className="flex flex-col items-center justify-center gap-8 sm:flex-row sm:items-stretch md:gap-12">
          {/* Left hole card — the words */}
          <div data-reveal="card" className="sm:rotate-[-3.5deg] sm:translate-y-2">
            <CardShell
              className="card-face-surface neon relative flex aspect-[5/7] w-[min(76vw,300px)] flex-col justify-center px-7 py-8 md:w-[min(24vw,320px)] md:px-8"
              tiltMax={4}
            >
              <span
                aria-hidden="true"
                className="absolute left-4 top-4 flex flex-col items-center leading-none md:left-5 md:top-5"
              >
                <span className="font-display text-xl text-[var(--ink)] md:text-2xl">K</span>
                <span className="text-base text-[var(--ink)] md:text-lg">♠</span>
              </span>
              {whoWeAre.paragraphs.map((p) => (
                <p
                  key={p.slice(0, 18)}
                  className="font-display text-[clamp(1.15rem,1.6vw,1.55rem)] leading-[1.45] text-[color-mix(in_srgb,var(--ink)_88%,#5a4a30)]"
                >
                  {p}
                </p>
              ))}
              <span
                aria-hidden="true"
                className="absolute bottom-4 right-4 flex rotate-180 flex-col items-center leading-none md:bottom-5 md:right-5"
              >
                <span className="font-display text-xl text-[var(--ink)] md:text-2xl">K</span>
                <span className="text-base text-[var(--ink)] md:text-lg">♠</span>
              </span>
            </CardShell>
          </div>

          {/* Right hole card — photo placeholder */}
          <div data-reveal="card" className="sm:rotate-[3.5deg]">
            <CardShell
              className="card-back-surface neon relative flex aspect-[5/7] w-[min(76vw,300px)] items-center justify-center overflow-hidden md:w-[min(24vw,320px)]"
              tiltMax={4}
            >
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_35%,color-mix(in_srgb,var(--neon-mid)_22%,transparent),transparent_70%)]"
              />
              <div className="relative flex flex-col items-center gap-3 text-center">
                <span className="text-5xl" aria-hidden="true">
                  ♠
                </span>
                {/* TODO team photo */}
                <span className="mono text-[var(--muted)]">TODO team photo</span>
              </div>
            </CardShell>
          </div>
        </div>

        {/* Counters — card corner indices that count up */}
        <div
          ref={countersRef}
          className="mx-auto mt-10 grid max-w-4xl grid-cols-2 gap-4 md:mt-14 md:grid-cols-4 md:gap-6"
        >
          {whoWeAre.counters.map((c) => (
            <div
              key={c.label}
              data-reveal="para"
              className="panel neon flex flex-col items-start gap-1 rounded-2xl px-6 py-5"
            >
              <span
                data-counter={c.value}
                data-no-separator={c.noSeparator ? 'true' : 'false'}
                className="font-display text-[clamp(2rem,3.4vw,3rem)] leading-none text-[var(--ivory)]"
              >
                0
              </span>
              <span className="mt-1 flex items-center gap-1.5">
                <span aria-hidden="true" className="text-[max(0.9rem,14px)] text-[var(--neon-mid)]">
                  ♠
                </span>
                <span className="mono text-[var(--muted)]">{c.label}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
