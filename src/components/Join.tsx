import { useRef } from 'react'
import CardShell from './CardShell'
import ScrollWords from './ScrollWords'
import { join } from '../content'
import { useSectionReveals, useSectionDepth } from '../lib/reveal'

/** Join (Joker) — one big card-shaped invitation. */
export default function Join() {
  const root = useRef<HTMLElement>(null)
  useSectionReveals(root)
  useSectionDepth(root)

  return (
    <section ref={root} id="join" className="section overflow-x-clip" data-quiet-rain>
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
      <div className="container-site relative z-10 join-layout">
        <p data-reveal="para" className="join-aside">
          The joker is the card that fits any hand. That’s the whole pitch.
        </p>
        <div data-reveal="colossal" data-depth="20" className="join-card-wrap">
          {/* A real joker: ivory stock, ink type, the index in both corners */}
          <CardShell className="join-card neon relative flex flex-col items-start gap-6" tiltMax={3}>
            <span className="join-card-index" aria-hidden="true">JOKER<br />★</span>
            <span className="join-card-index join-card-index--flip" aria-hidden="true">JOKER<br />★</span>
            <h2 className="join-card-title">
              <ScrollWords text={join.heading} treatment="mask" />
            </h2>
            <p data-reveal="para" className="join-card-text">
              {join.text}
            </p>
            {/* TODO form url */}
            <a data-reveal="para" href={join.cta.href} className="join-card-cta" data-interactive>
              {join.cta.label} <span aria-hidden="true">♠</span>
            </a>
          </CardShell>
        </div>
      </div>
    </section>
  )
}
