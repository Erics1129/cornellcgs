import { useEffect, useRef, useState } from 'react'
import { nav } from '../content'
import { scrollToId } from '../lib/scroll'

/**
 * Floating glass pill nav. Slides out of view on scroll down, back on scroll
 * up. The active section gets a small suit glyph under its link.
 */
export default function Nav() {
  const [hidden, setHidden] = useState(false)
  const [active, setActive] = useState('')
  const lastY = useRef(0)

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      setHidden(y > 140 && y > lastY.current)
      lastY.current = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id)
        }
      },
      { rootMargin: '-40% 0px -55% 0px' },
    )
    nav.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (el) io.observe(el)
    })
    return () => io.disconnect()
  }, [])

  return (
    <header
      data-interactive
      className={`fixed left-1/2 top-5 z-50 -translate-x-1/2 transition-transform duration-500 ease-out ${
        hidden ? '-translate-y-[130%]' : 'translate-y-0'
      }`}
    >
      <nav
        aria-label="Site"
        className="neon glass flex items-center gap-1 rounded-full py-2 pl-2 pr-2 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)]"
      >
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault()
            scrollToId('top')
          }}
          aria-label="Cornell CGS — back to top"
          className="mr-1 flex h-10 w-8 items-center justify-center rounded-[5px] border border-[color-mix(in_srgb,var(--silver)_45%,transparent)] bg-[var(--ink)]"
        >
          <span className="mono text-[10px] leading-none tracking-tight text-[var(--ivory)]">
            CGS
          </span>
        </a>
        <ul className="hidden items-center md:flex">
          {nav.map(({ id, label }) => (
            <li key={id} className="relative">
              <a
                href={`#${id}`}
                onClick={(e) => {
                  e.preventDefault()
                  scrollToId(id)
                }}
                className={`mono block rounded-full px-3.5 py-2 text-[max(0.85rem,14px)] transition-colors ${
                  active === id ? 'text-[var(--text)]' : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                {label}
              </a>
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute -bottom-0.5 left-1/2 -translate-x-1/2 text-[10px] text-[var(--neon-mid)] transition-opacity ${
                  active === id ? 'opacity-100' : 'opacity-0'
                }`}
              >
                ♠
              </span>
            </li>
          ))}
        </ul>
        <a
          href="#join"
          onClick={(e) => {
            e.preventDefault()
            scrollToId('join')
          }}
          className="mono ml-1 rounded-full bg-[color-mix(in_srgb,var(--neon-mid)_24%,transparent)] px-4 py-2 text-[max(0.85rem,14px)] text-[var(--text)] md:hidden"
        >
          Join
        </a>
      </nav>
    </header>
  )
}
