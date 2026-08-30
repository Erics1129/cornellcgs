import { useRef } from 'react'
import SectionIndex from './SectionIndex'
import { mlProcess } from '../content'
import { useSectionReveals } from '../lib/reveal'

/**
 * Our Machine Learning process (J♠) — placeholder layout.
 * The full version (§5.10) pins on the black hole backdrop video and fires
 * the burst: shockwave, zoom blur, equation glyph particles, then the title
 * and five step cards shoot out of the hole.
 */
export default function MLProcess() {
  const root = useRef<HTMLElement>(null)
  useSectionReveals(root)

  return (
    <section ref={root} id="ml-process" className="section relative overflow-clip">
      <SectionIndex rank="J" />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[url('/assets/blackhole_math.jpg')] bg-cover bg-center opacity-60"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,var(--bg-top),transparent_30%,transparent_70%,var(--bg-top))] opacity-90"
      />
      <div className="container-site relative">
        <h2 data-reveal="heading" className="h-section mb-16 text-center text-[var(--ivory)]">
          {mlProcess.heading}
        </h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-5">
          {mlProcess.steps.map((s) => (
            <div
              key={s.n}
              data-reveal="card"
              className="panel neon flex aspect-[5/7] flex-col justify-between rounded-2xl p-5"
            >
              <span className="font-display text-4xl text-[var(--neon-mid)]">{s.n}</span>
              <div>
                <h3 className="h-card mb-2">{s.title}</h3>
                <p className="text-[max(0.95rem,15px)] leading-snug text-[var(--muted)]">{s.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
