import { useEffect, useRef, useState } from 'react'
import { nav } from '../content'
import { scrollToId } from '../lib/scroll'
import { deckFrame, onDeck } from '../lib/deck'
import { useActiveSection } from '../lib/useActiveSection'

/**
 * Citadel-style left rail — a thin vertical bar that tracks the chapter you
 * are in. Each stop is the chapter's card rank; the active stop shows its
 * name. Desktop only.
 */

/* Idle-life phases for the rank marks — 6–8 s periods, starts spread so the
   column never moves as one */
const railLife = (i: number) => ({
  ['--life-dur' as string]: `${[7, 6, 8, 6.4, 7.6][i % 5]}s`,
  ['--life-delay' as string]: `-${((i * 2.3) % 6).toFixed(1)}s`,
})

export default function SideRail() {
  const active = useActiveSection()
  const fillRef = useRef<HTMLDivElement>(null)
  const [surface, setSurface] = useState<'light' | undefined>(undefined)

  // The fill is the deck's own progress, written as a transform: no scroll
  // listener, no scrollHeight read, and it composites instead of relayouting.
  useEffect(() => {
    const el = fillRef.current
    if (!el) return
    el.style.transformOrigin = '50% 0%'
    let shown = -1
    const paint = () => {
      const p = Math.round(deckFrame().progress * 1000) / 1000
      if (p === shown) return
      shown = p
      el.style.transform = `scaleY(${p})`
    }
    paint()
    return onDeck(paint)
  }, [])

  // The rail prints light ink. Over a chapter that paints a light sheet it
  // switches to dark ink. The chapter says which it is in CSS
  // (--rail-surface: light | dark on its root), read once per chapter
  // change; with nothing declared, Events is the one light sheet, as before.
  useEffect(() => {
    const el = active ? document.getElementById(active) : null
    const declared = el ? getComputedStyle(el).getPropertyValue('--rail-surface').trim() : ''
    setSurface(declared === 'light' || (declared === '' && active === 'events') ? 'light' : undefined)
  }, [active])

  return (
    <aside
      data-interactive
      data-surface={surface}
      aria-label="Chapters"
      className="cgs-side-rail fixed left-3 top-1/2 z-40 hidden -translate-y-1/2 items-stretch gap-3 lg:flex"
    >
      {/* Progress line */}
      <div aria-hidden="true" className="relative w-px bg-[color-mix(in_srgb,var(--neon-dim)_80%,transparent)]">
        {/* Glow on a wrapper — the fill itself is GSAP's scaleY */}
        <div className="life-glow absolute inset-0" style={{ ['--life-dur' as string]: '5.2s' }}>
          <div ref={fillRef} className="absolute inset-0 bg-[var(--neon-mid)]" />
        </div>
      </div>

      <nav aria-label="Chapter list" className="flex flex-col justify-between gap-4 py-1">
        {nav.map(({ id, label, rank }, i) => {
          const isActive = active === id
          return (
            <button
              key={id}
              onClick={() => scrollToId(id)}
              aria-label={label}
              aria-current={isActive ? 'true' : undefined}
              className="group relative flex items-center gap-3 text-left"
            >
              {/* Float on a wrapper — the mark's own transform is the active
                  scale (block keeps w-6 now that it is no longer a flex item) */}
              <span className="life-float block" style={railLife(i)}>
                <span
                  aria-hidden="true"
                  className={`font-display block w-6 text-center text-[0.9375rem] leading-none transition-[transform,color,opacity] duration-300 [transition-timing-function:var(--ease-out)] ${
                    isActive ? 'scale-125 text-[var(--neon-mid)]' : 'text-[var(--muted)] opacity-60 group-hover:opacity-100'
                  }`}
                >
                  {rank}
                </span>
              </span>
              {/* Label is a spine — vertical, reading upward — in a fixed
                  clip box outside flow, so it stays inside the page gutter
                  (see .container-site) instead of running over the copy;
                  the rail's hit area never changes and the reveal is
                  transform/opacity only. */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-6 top-1/2 flex h-40 w-4 -translate-y-1/2 items-center justify-center overflow-hidden"
              >
                <span
                  className={`mono block rotate-180 whitespace-nowrap text-[max(0.78rem,0.75rem)] [writing-mode:vertical-rl] transition-[transform,opacity,color] duration-[350ms] [transition-timing-function:var(--ease-out)] ${
                    isActive
                      ? 'translate-y-0 text-[var(--text)] opacity-100'
                      : 'translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:text-[var(--muted)] group-hover:opacity-100'
                  }`}
                >
                  {label}
                </span>
              </span>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
