import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { nav } from '../content'
import { scrollToId } from '../lib/scroll'
import { prefersReducedMotion } from '../lib/motion'
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

  useEffect(() => {
    const el = fillRef.current
    if (!el) return
    // Full-height bar scaled from the top — transform-only, so continuous
    // Lenis scroll updates composite instead of relayouting the rail.
    gsap.set(el, { scaleY: 0, transformOrigin: '50% 0%' })
    const to = gsap.quickTo(el, 'scaleY', {
      duration: prefersReducedMotion() ? 0 : 0.35,
      ease: 'power3',
    })
    const onScroll = () => {
      const docH = document.documentElement.scrollHeight - window.innerHeight
      to(docH > 0 ? window.scrollY / docH : 0)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      gsap.killTweensOf(el)
    }
  }, [])

  return (
    <aside
      data-interactive
      aria-label="Chapters"
      className="fixed left-7 top-1/2 z-40 hidden -translate-y-1/2 items-stretch gap-4 lg:flex"
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
              {/* Label lives in a fixed clip box outside flow — the rail's
                  hit area and width never change, and the reveal is
                  transform/opacity only. */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-9 top-1/2 w-40 -translate-y-1/2 overflow-hidden"
              >
                <span
                  className={`mono block whitespace-nowrap text-[max(0.78rem,0.75rem)] transition-[transform,opacity,color] duration-[350ms] [transition-timing-function:var(--ease-out)] ${
                    isActive
                      ? 'translate-x-0 text-[var(--text)] opacity-100'
                      : '-translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:text-[var(--muted)] group-hover:opacity-100'
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
