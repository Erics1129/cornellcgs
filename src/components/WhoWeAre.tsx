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
 * Who we are (K♠) — two hole cards laid side by side like a player peeking,
 * with four count-up counters styled as card corner indices beneath.
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
        <div className="grid gap-8 md:grid-cols-2 md:gap-10">
          {/* Left hole card — the text card */}
          <div data-reveal="card" className="md:rotate-[-2.5deg] md:translate-y-2">
            <CardShell
              className="card-face-surface neon relative flex min-h-[440px] flex-col justify-center px-8 py-12 md:px-12"
              tiltMax={3}
            >
              <span
                aria-hidden="true"
                className="absolute left-5 top-5 flex flex-col items-center leading-none"
              >
                <span className="font-display text-2xl text-[var(--ink)]">K</span>
                <span className="text-lg text-[var(--ink)]">♠</span>
              </span>
              <h2 className="h-section mb-6 text-[var(--ink)]">
                {renderEmphasis(whoWeAre.heading)}
              </h2>
              {whoWeAre.paragraphs.map((p) => (
                <p key={p.slice(0, 18)} className="mb-4 max-w-[52ch] text-[color-mix(in_srgb,var(--ink)_82%,#5a4a30)]">
                  {p}
                </p>
              ))}
            </CardShell>
          </div>

          {/* Right hole card — photo placeholder */}
          <div data-reveal="card" className="md:rotate-[2.5deg]">
            <CardShell
              className="card-back-surface neon relative flex min-h-[440px] items-center justify-center overflow-hidden"
              tiltMax={3}
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
          className="mt-16 grid grid-cols-2 gap-4 md:mt-20 md:grid-cols-4 md:gap-6"
        >
          {whoWeAre.counters.map((c) => (
            <div
              key={c.label}
              data-reveal="para"
              className="panel neon flex flex-col items-start gap-1 rounded-2xl px-6 py-7"
            >
              <span
                data-counter={c.value}
                data-no-separator={c.noSeparator ? 'true' : 'false'}
                className="font-display text-[clamp(2.6rem,4.5vw,4rem)] leading-none text-[var(--ivory)]"
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
