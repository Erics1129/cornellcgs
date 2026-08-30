import { useRef } from 'react'
import SectionIndex from './SectionIndex'
import { world } from '../content'
import { useSectionReveals } from '../lib/reveal'

function renderEmphasis(text: string) {
  const parts = text.split('*')
  return parts.map((p, i) => (i % 2 === 1 ? <em key={i}>{p}</em> : <span key={i}>{p}</span>))
}

/**
 * World (9♠) — placeholder player. The full version (§5.9) crossfade-loops
 * the globe video seamlessly, lets a drag scrub it, and falls back to a
 * drifting still if the video is missing.
 */
export default function WorldSection() {
  const root = useRef<HTMLElement>(null)
  useSectionReveals(root)

  return (
    <section ref={root} id="world" className="section">
      <SectionIndex rank="9" />
      <div className="container-site grid items-center gap-10 md:grid-cols-2">
        <div data-reveal="card" data-interactive className="relative">
          <video
            className="aspect-square w-full rounded-3xl object-cover shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]"
            src="/assets/globe.mp4"
            poster="/assets/globe_reference.png"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-label="A rotating globe of dotted continents with member countries marked"
          />
        </div>
        <div>
          <h2 data-reveal="heading" className="h-section mb-6">
            {renderEmphasis(world.heading)}
          </h2>
          <p data-reveal="para" className="body-muted max-w-[46ch]">
            {world.text}
          </p>
        </div>
      </div>
    </section>
  )
}
