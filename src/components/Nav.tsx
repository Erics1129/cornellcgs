import { useEffect, useRef, useState } from 'react'
import { nav } from '../content'
import { scrollToId } from '../lib/scroll'
import { useActiveSection } from '../lib/useActiveSection'

/**
 * Corner menu — a small glass chip that opens a dropdown with the chapters.
 * (The user vetoed a top bar; the left rail tracks position, this navigates.)
 */
export default function Nav() {
  const [open, setOpen] = useState(false)
  const active = useActiveSection()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const go = (id: string) => {
    setOpen(false)
    scrollToId(id)
  }

  return (
    <div ref={rootRef} data-interactive className="fixed right-5 top-5 z-50">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Menu"
        className="glass flex items-center gap-2.5 rounded-full py-2 pl-2 pr-4 shadow-[0_10px_34px_-14px_rgba(10,30,63,0.45)]"
      >
        <span
          aria-hidden="true"
          className="flex h-9 w-7 items-center justify-center rounded-[5px] border border-[color-mix(in_srgb,var(--silver)_45%,transparent)] bg-[var(--ink)]"
        >
          <span className="mono text-[9px] leading-none tracking-tight text-[var(--ivory)]">CGS</span>
        </span>
        <span className="mono text-[max(0.85rem,14px)] text-[var(--text)]">Menu</span>
        <span
          aria-hidden="true"
          className={`text-[10px] text-[var(--muted)] transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
        >
          ▼
        </span>
      </button>

      <div
        role="menu"
        className={`glass absolute right-0 mt-2 w-60 origin-top-right rounded-2xl border border-[color-mix(in_srgb,var(--neon-dim)_65%,transparent)] p-2 shadow-[0_24px_60px_-20px_rgba(10,30,63,0.5)] transition-all duration-300 ${
          open
            ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
            : 'pointer-events-none -translate-y-1 scale-[0.97] opacity-0'
        }`}
      >
        {nav.map(({ id, label, rank }) => (
          <button
            key={id}
            role="menuitem"
            onClick={() => go(id)}
            className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--neon-mid)_10%,transparent)] ${
              active === id ? 'text-[var(--text)]' : 'text-[var(--muted)]'
            }`}
          >
            <span aria-hidden="true" className="font-display w-6 text-center text-[15px]">
              {rank}
            </span>
            <span className="mono text-[max(0.9rem,14px)]">{label}</span>
            <span
              aria-hidden="true"
              className={`ml-auto text-[11px] text-[var(--neon-mid)] ${active === id ? 'opacity-100' : 'opacity-0'}`}
            >
              ♠
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
