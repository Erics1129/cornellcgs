import { useRef, useState } from 'react'
import SectionIndex from './SectionIndex'
import CardShell from './CardShell'
import { people } from '../content'
import { useSectionReveals } from '../lib/reveal'

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
        <h2 data-reveal="heading" className="h-section mb-14 max-w-[16ch]">
          {renderEmphasis(people.heading)}
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:gap-6" data-interactive>
          {people.members.map((m, i) => (
            <div key={m.name} data-reveal="card" className="[perspective:1100px]">
              <CardShell
                as="button"
                onClick={() => toggle(i)}
                ariaLabel={`${m.name}, ${m.role} — press to flip for bio`}
                className="group relative block aspect-[5/7] w-full cursor-pointer [transform-style:preserve-3d]"
              >
                <span
                  className={`absolute inset-0 block transition-transform duration-700 [transform-style:preserve-3d] ${
                    flipped.has(i) ? '[transform:rotateY(180deg)]' : ''
                  }`}
                >
                  {/* Front — portrait side */}
                  <span className="card-face-surface neon absolute inset-0 flex flex-col justify-between p-5 [backface-visibility:hidden]">
                    <span className="flex flex-col items-start leading-none" aria-hidden="true">
                      <span className="font-display text-xl text-[var(--ink)]">8</span>
                      <span className="text-sm text-[var(--ink)]">♠</span>
                    </span>
                    {/* TODO portrait photo */}
                    <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#1c2c52,#0b0b0f)] md:h-24 md:w-24">
                      <span className="font-display text-2xl text-[var(--ivory)]">
                        {initials(m.name)}
                      </span>
                    </span>
                    <span className="block text-center">
                      <span className="h-card block text-[1.2rem] text-[var(--ink)] md:text-[1.4rem]">
                        {m.name}
                      </span>
                      <span className="mono mt-1 block text-[max(0.8rem,13px)] text-[color-mix(in_srgb,var(--ink)_65%,#7a6a4a)]">
                        {m.role}
                      </span>
                    </span>
                  </span>
                  {/* Back — bio side */}
                  <span className="card-back-surface absolute inset-0 flex [transform:rotateY(180deg)] flex-col items-center justify-center gap-3 p-6 text-center [backface-visibility:hidden]">
                    <span aria-hidden="true" className="text-2xl text-[var(--silver)]">
                      ♠
                    </span>
                    <span className="text-[max(0.95rem,15px)] leading-relaxed text-[var(--silver)]">
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
