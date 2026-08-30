import { useEffect, useRef, useState } from 'react'
import { scrollToId } from '../lib/scroll'
import { openPage } from '../lib/router'

/**
 * Citadel-style navigation: a clean top bar — wordmark left, top-level links
 * right — and clicking a link opens a full-width panel that slides in under
 * the bar: the section's name huge on the left with a Learn More button, its
 * sub-links stacked on the right, a ✕ to close.
 */

type Group = {
  label: string
  /** chapter the big Learn More button goes to */
  target: string
  subs: Array<{ label: string; id: string }>
}

const GROUPS: Group[] = [
  {
    label: 'Who We Are',
    target: 'who-we-are',
    subs: [
      { label: 'Who we are', id: 'who-we-are' },
      { label: 'People', id: 'people' },
      { label: 'World', id: 'world' },
    ],
  },
  {
    label: 'What We Do',
    target: 'what-we-do',
    subs: [
      { label: 'What we do', id: 'what-we-do' },
      { label: 'Our ML process', id: 'ml-process' },
      { label: 'Events', id: 'events' },
    ],
  },
  {
    label: 'Events',
    target: 'events',
    subs: [
      { label: 'Events', id: 'events' },
      { label: 'Join CGS', id: 'join' },
    ],
  },
  {
    label: 'Join',
    target: 'join',
    subs: [
      { label: 'Pull up a chair', id: 'join' },
      { label: 'Contact', id: 'contact' },
    ],
  },
]

export default function Nav() {
  const [open, setOpen] = useState<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open === null) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
    }
    const onWheel = () => setOpen(null) // scrolling closes the panel, like citadel.com
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', onWheel)
    }
  }, [open])

  const go = (id: string) => {
    setOpen(null)
    scrollToId(id)
  }

  /** Dropdown items open their own Citadel-style page (#p/<id>). */
  const goPage = (id: string) => {
    setOpen(null)
    openPage(id)
  }

  const active = open !== null ? GROUPS[open] : null

  return (
    <div ref={rootRef} data-interactive className="fixed inset-x-0 top-0 z-50">
      {/* The bar */}
      <div className="relative z-10 border-b border-[color-mix(in_srgb,var(--neon-dim)_55%,transparent)] bg-[color-mix(in_srgb,var(--bg-top)_97%,transparent)]">
        <div className="container-site flex h-16 items-center justify-between">
          <button
            onClick={() => go('top')}
            aria-label="Cornell CGS — back to the top"
            className="font-display flex items-center gap-3 text-[max(0.95rem,15px)] font-[700] tracking-[0.26em] text-[var(--text)]"
          >
            <span aria-hidden="true" className="text-[1.15em] text-[var(--neon-mid)]">
              ♠
            </span>
            CORNELL CGS
          </button>

          <nav aria-label="Site" className="hidden items-center gap-8 md:flex">
            {GROUPS.map((g, i) => (
              <button
                key={g.label}
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
                className={`relative pb-1 text-[max(0.95rem,16px)] font-[550] transition-colors ${
                  open === i
                    ? 'text-[var(--neon-mid)] after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-[var(--neon-mid)]'
                    : 'text-[var(--text)] hover:text-[var(--neon-mid)]'
                }`}
              >
                {g.label}
              </button>
            ))}
          </nav>

          {/* Mobile: one Menu button opening the first group's panel-as-list */}
          <button
            onClick={() => setOpen(open === null ? 0 : null)}
            aria-expanded={open !== null}
            aria-label="Menu"
            className="text-[max(0.95rem,16px)] font-[550] text-[var(--text)] md:hidden"
          >
            Menu {open !== null ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* The overlay panel */}
      <div
        role="menu"
        aria-hidden={open === null}
        className={`absolute inset-x-0 top-16 origin-top overflow-hidden bg-white shadow-[0_40px_80px_-30px_rgba(10,30,63,0.35)] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open !== null
            ? 'pointer-events-auto max-h-[70vh] opacity-100'
            : 'pointer-events-none max-h-0 opacity-0'
        }`}
      >
        {/* Mobile: one list with every page (the bar links are hidden there) */}
        {active && (
          <div className="container-site relative flex flex-col gap-1 py-10 md:hidden">
            <button
              onClick={() => setOpen(null)}
              aria-label="Close menu"
              className="absolute right-0 top-4 p-2 text-2xl leading-none text-[#0a1e3f]"
            >
              ✕
            </button>
            {GROUPS.flatMap((g) => g.subs)
              .filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i)
              .map((s) => (
                <button
                  key={s.id}
                  role="menuitem"
                  onClick={() => goPage(s.id)}
                  className="py-3 text-left text-[max(1.15rem,19px)] font-[600] text-[#0a1e3f]"
                >
                  {s.label}
                </button>
              ))}
          </div>
        )}

        {active && (
          <div className="container-site relative hidden gap-10 py-14 md:grid md:grid-cols-2 md:py-20">
            <button
              onClick={() => setOpen(null)}
              aria-label="Close menu"
              className="absolute right-0 top-6 p-2 text-2xl leading-none text-[#0a1e3f] transition-transform hover:rotate-90 md:top-8"
            >
              ✕
            </button>

            {/* Left: the big name + Learn More, like citadel.com */}
            <div>
              <p className="font-display mb-8 text-[clamp(2.4rem,4.5vw,4.2rem)] font-[640] leading-[1.05] tracking-[-0.02em] text-[#0a1e3f]">
                {active.label}
              </p>
              <button
                onClick={() => goPage(active.target)}
                className="bg-[#0a1e3f] px-8 py-4 text-[max(0.95rem,16px)] font-[600] text-white transition-colors hover:bg-[#1e5eff]"
              >
                Learn More
              </button>
            </div>

            {/* Right: stacked sub-links */}
            <div className="flex flex-col items-start gap-5 md:pt-2">
              {active.subs.map((s) => (
                <button
                  key={s.id + s.label}
                  role="menuitem"
                  onClick={() => goPage(s.id)}
                  className="text-[max(1.05rem,18px)] font-[550] text-[#0a1e3f] transition-colors hover:text-[#1e5eff] hover:underline hover:underline-offset-4"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
