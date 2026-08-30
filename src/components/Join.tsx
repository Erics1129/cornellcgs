import { useRef } from 'react'
import CardShell from './CardShell'
import { join } from '../content'
import { useSectionReveals } from '../lib/reveal'

function renderEmphasis(text: string) {
  const parts = text.split('*')
  return parts.map((p, i) => (i % 2 === 1 ? <em key={i}>{p}</em> : <span key={i}>{p}</span>))
}

/** Join (Joker) — one big card-shaped invitation. */
export default function Join() {
  const root = useRef<HTMLElement>(null)
  useSectionReveals(root)

  return (
    <section ref={root} id="join" className="section">
      {/* Joker corner index */}
      <div className="card-index" aria-hidden="true">
        <span className="rank" style={{ fontSize: 'clamp(1.6rem, 2.4vw, 2.4rem)' }}>
          JOKER
        </span>
        <span className="suit">★</span>
      </div>
      <div className="container-site">
        <div data-reveal="card">
          <CardShell
            className="panel neon relative mx-auto flex max-w-3xl flex-col items-center gap-6 overflow-hidden rounded-[2rem] px-8 py-20 text-center md:py-24"
            tiltMax={2}
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_70%_at_50%_110%,color-mix(in_srgb,var(--glow)_28%,transparent),transparent_70%)]"
            />
            <h2 data-reveal="heading" className="h-section relative max-w-[14ch]">
              {renderEmphasis(join.heading)}
            </h2>
            <p data-reveal="para" className="body-muted relative max-w-[44ch]">
              {join.text}
            </p>
            {/* TODO form url */}
            <a
              data-reveal="para"
              href={join.cta.href}
              className="btn btn-primary neon relative rounded-full text-[max(1.05rem,17px)]"
              data-interactive
            >
              {join.cta.label} <span aria-hidden="true">♠</span>
            </a>
          </CardShell>
        </div>
      </div>
    </section>
  )
}
