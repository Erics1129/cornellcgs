import { useEffect, useState } from 'react'
import { nav } from '../content'
import { scrollToId } from '../lib/scroll'
import { useActiveSection } from '../lib/useActiveSection'

/**
 * Citadel-style left rail — a thin vertical bar that tracks the chapter you
 * are in. Each stop is the chapter's card rank; the active stop shows its
 * name. Desktop only.
 */
export default function SideRail() {
  const active = useActiveSection()
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const onScroll = () => {
      const docH = document.documentElement.scrollHeight - window.innerHeight
      setProgress(docH > 0 ? window.scrollY / docH : 0)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <aside
      data-interactive
      aria-label="Chapters"
      className="fixed left-7 top-1/2 z-40 hidden -translate-y-1/2 items-stretch gap-4 lg:flex"
    >
      {/* Progress line */}
      <div aria-hidden="true" className="relative w-px bg-[color-mix(in_srgb,var(--neon-dim)_80%,transparent)]">
        <div
          className="absolute left-0 top-0 w-px bg-[var(--neon-mid)] transition-[height] duration-300 ease-out"
          style={{ height: `${Math.round(progress * 100)}%` }}
        />
      </div>

      <nav aria-label="Chapter list" className="flex flex-col justify-between gap-4 py-1">
        {nav.map(({ id, label, rank }) => {
          const isActive = active === id
          return (
            <button
              key={id}
              onClick={() => scrollToId(id)}
              aria-label={label}
              aria-current={isActive ? 'true' : undefined}
              className="group flex items-center gap-3 text-left"
            >
              <span
                aria-hidden="true"
                className={`font-display w-6 text-center text-[15px] leading-none transition-all duration-300 ${
                  isActive ? 'scale-125 text-[var(--neon-mid)]' : 'text-[var(--muted)] opacity-60 group-hover:opacity-100'
                }`}
              >
                {rank}
              </span>
              <span
                className={`mono overflow-hidden whitespace-nowrap text-[max(0.78rem,12px)] transition-all duration-300 ${
                  isActive
                    ? 'max-w-[10rem] text-[var(--text)] opacity-100'
                    : 'max-w-0 opacity-0 group-hover:max-w-[10rem] group-hover:text-[var(--muted)] group-hover:opacity-100'
                }`}
              >
                {label}
              </span>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
