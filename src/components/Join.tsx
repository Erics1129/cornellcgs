import { useRef } from 'react'
import CardShell from './CardShell'
import NodeSphere from './NodeSphere'
import { join } from '../content'
import { useSectionReveals, useSectionDepth } from '../lib/reveal'

function renderEmphasis(text: string) {
  const parts = text.split('*')
  return parts.map((p, i) => (i % 2 === 1 ? <em key={i}>{p}</em> : <span key={i}>{p}</span>))
}

/** Join (Joker) — one big card-shaped invitation. */
export default function Join() {
  const root = useRef<HTMLElement>(null)
  useSectionReveals(root)
  useSectionDepth(root)

  return (
    <section ref={root} id="join" className="section overflow-x-clip">
      {/* Joker corner index */}
      <div className="card-index" aria-hidden="true">
        <span
          className="rank life-bob"
          style={{ fontSize: 'clamp(1.6rem, 2.4vw, 2.4rem)', ['--life-delay' as string]: '-1.9s', ['--life-dur' as string]: '6.8s' }}
        >
          JOKER
        </span>
        <span className="suit life-glow" style={{ ['--life-delay' as string]: '-0.7s', ['--life-dur' as string]: '4.6s' }}>
          ★
        </span>
      </div>
      {/* The network: a node sphere behind the invitation, connections lighting up */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        data-depth="-30"
      >
        <div className="absolute inset-[-20%] rounded-full bg-[radial-gradient(50%_50%_at_50%_70%,color-mix(in_srgb,var(--glow)_30%,transparent),transparent_70%)]" />
        <NodeSphere className="relative block h-[min(88vh,88vw)] w-[min(88vh,88vw)]" />
      </div>
      <div className="container-site relative z-10">
        <div data-reveal="colossal" data-depth="20">
          {/* The swell owns the outer transform, the tilt the card's — the float sits between */}
          <div className="life-float" style={{ ['--life-delay' as string]: '-3.6s', ['--life-dur' as string]: '8.2s' }}>
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
                className="btn btn-primary neon neon-idle relative text-[max(1.05rem,1.0625rem)]"
                data-interactive
              >
                {join.cta.label} <span aria-hidden="true">♠</span>
              </a>
            </CardShell>
          </div>
        </div>
      </div>
    </section>
  )
}
