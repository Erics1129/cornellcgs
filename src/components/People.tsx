import { useRef, useState } from 'react'
import SectionIndex from './SectionIndex'
import CardShell from './CardShell'
import { people } from '../content'
import { useSectionReveals, useSectionDepth } from '../lib/reveal'

function renderEmphasis(text: string) {
  const parts = text.split('*')
  return parts.map((p, i) => (i % 2 === 1 ? <em key={i}>{p}</em> : <span key={i}>{p}</span>))
}

function initials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
}

/**
 * People (8♠) — the team as playing cards. Hover tilts toward the cursor,
 * click/enter flips the card to a two-line bio. TODO real people.
 */
export default function People() {
  const root = useRef<HTMLElement>(null)
  useSectionReveals(root)
  useSectionDepth(root)
  const [flipped, setFlipped] = useState<Set<number>>(new Set())

  const toggle = (i: number) => {
    setFlipped((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  return (
    <section ref={root} id="people" className="section">
      <SectionIndex rank="8" />
      <div className="container-site">
        <h2 data-reveal="heading" className="h-section mb-10 max-w-[16ch] md:mb-14">
          {renderEmphasis(people.heading)}
        </h2>
        <div data-reveal="colossal" data-depth="16" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6 lg:gap-4" data-interactive>
          {people.members.map((m, i) => (
            <div key={i} data-reveal="card" className="[perspective:1100px]">
              <CardShell
                as="button"
                onClick={() => toggle(i)}
                ariaLabel={`${m.name}, ${m.role} — press to flip for bio`}
                className="group relative block aspect-[5/7] w-full cursor-pointer [perspective:1100px] [transform-style:preserve-3d]"
              >
                <span
                  className={`absolute inset-0 block transition-transform duration-700 [transform-style:preserve-3d] ${
                    flipped.has(i) ? '[transform:rotateY(180deg)]' : ''
                  }`}
                >
                  {/* Front — portrait side */}
                  <span className="card-face-surface neon absolute inset-0 flex flex-col justify-between overflow-hidden p-3 [backface-visibility:hidden] md:p-4">
                    <span className="flex flex-col items-start leading-none" aria-hidden="true">
                      <span className="font-display text-base text-[var(--ink)] md:text-xl">8</span>
                      <span className="text-xs text-[var(--ink)] md:text-sm">♠</span>
                    </span>
                    {/* TODO portrait photo */}
                    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#1c2c52,#0b0b0f)] sm:h-14 sm:w-14 md:h-16 md:w-16">
                      <span className="font-display text-sm text-[var(--ivory)] sm:text-base md:text-lg">
                        {m.name === 'To be added' ? '♠' : initials(m.name)}
                      </span>
                    </span>
                    <span className="block text-center">
                      <span className="h-card block text-[0.95rem] leading-tight text-[var(--ink)] sm:text-[1rem] md:text-[1.1rem]">
                        {m.name}
                      </span>
                      <span className="mono mt-0.5 block text-[11px] text-[color-mix(in_srgb,var(--ink)_65%,#7a6a4a)] sm:text-[12px] md:text-[12px]">
                        {m.role}
                      </span>
                    </span>
                  </span>
                  {/* Back — bio side */}
                  <span className="card-back-surface absolute inset-0 flex [transform:rotateY(180deg)] flex-col items-center justify-center gap-2 overflow-hidden p-3 text-center [backface-visibility:hidden] md:gap-3 md:p-6">
                    <span aria-hidden="true" className="text-xl text-[var(--silver)] md:text-2xl">
                      ♠
                    </span>
                    <span className="text-[12px] leading-snug text-[var(--silver)] sm:text-[13px]">
                      {m.bio}
                    </span>
                  </span>
                </span>
              </CardShell>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
