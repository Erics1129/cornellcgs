import { useRef } from 'react'
import SectionIndex from './SectionIndex'
import GlobeVideo from './GlobeVideo'
import { memberCountries, world } from '../content'
import { useSectionReveals } from '../lib/reveal'

function renderEmphasis(text: string) {
  // *word* becomes an italic display word
  const parts = text.split('*')
  return parts.map((p, i) => (i % 2 === 1 ? <em key={i}>{p}</em> : <span key={i}>{p}</span>))
}

/**
 * World (9♠) — the earth IS the page (§5.9 + the full-page override). The
 * globe video covers the entire chapter; GlobeVideo owns the seamless
 * two-element loop, drag-to-scrub and the still-image fallback. The copy sits
 * on the left over a scrim gradient (plus a soft glyph shadow) so the light
 * text keeps ≥7:1 contrast against the starfield at any video frame.
 */
export default function WorldSection() {
  const root = useRef<HTMLElement>(null)
  useSectionReveals(root)

  return (
    <section ref={root} id="world" className="section overflow-clip">
      <SectionIndex rank="9" />
      <GlobeVideo />

      {/* Left scrim behind the copy; pointer events fall through to the globe */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-full md:w-[68%]"
        style={{
          background:
            'linear-gradient(to right, color-mix(in srgb, var(--bg-top) 94%, transparent) 0%, color-mix(in srgb, var(--bg-top) 80%, transparent) 38%, color-mix(in srgb, var(--bg-top) 45%, transparent) 72%, transparent 100%)',
        }}
      />

      <div className="container-site pointer-events-none relative z-10">
        <div
          className="pointer-events-auto max-w-[34rem] lg:max-w-[40rem]"
          style={{ textShadow: '0 1px 24px rgba(2, 6, 20, 0.85), 0 1px 6px rgba(2, 6, 20, 0.6)' }}
        >
          <h2 data-reveal="heading" className="h-section mb-6">
            {renderEmphasis(world.heading)}
          </h2>
          <p data-reveal="para" className="body-muted max-w-[46ch]">
            {world.text}
          </p>
          <p
            data-reveal="para"
            className="mono mt-9 max-w-[52ch] uppercase leading-relaxed text-[var(--muted)] opacity-75"
          >
            {memberCountries.join(' · ')}
          </p>
        </div>
      </div>
    </section>
  )
}
