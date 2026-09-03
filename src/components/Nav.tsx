import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { EASE } from '../lib/eases'
import { attachMagnetic } from '../lib/magnetic'
import { prefersReducedMotion } from '../lib/motion'
import { scrollToId } from '../lib/scroll'
import { pagePath } from '../lib/router'
import Dice from './Dice'

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
      { label: 'Our Team', id: 'people' },
      { label: 'Advisors', id: 'advisors' },
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
      { label: 'Contact Us', id: 'contact' },
    ],
  },
]

/* Idle-life phases for the bar labels — no two share a period or a start */
const LABEL_LIFE = [
  { dur: '11s', delay: '-2.6s' },
  { dur: '13.2s', delay: '-7.1s' },
  { dur: '10.4s', delay: '-4.4s' },
  { dur: '12.4s', delay: '-9.3s' },
]

/* .btn-label's roll only keys off .btn/a ancestors — these triggers are
   <button>s, so they need their own hover hook. */
const localCss = `
.roll-hover:hover .btn-label > span,
.roll-hover:focus-visible .btn-label > span { transform: translateY(-100%); }
`

function IconX() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className="transition-transform duration-[400ms] [transition-timing-function:var(--ease-out)] group-hover:rotate-90"
    >
      <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export default function Nav() {
  const [open, setOpen] = useState<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const learnMoreRef = useRef<HTMLAnchorElement>(null)

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

  // Panel content rises in behind the clip wipe; close needs no tween — the
  // clip swallows it. Layout effect so items never paint un-hidden first.
  useLayoutEffect(() => {
    if (open === null || prefersReducedMotion()) return
    const items = panelRef.current?.querySelectorAll<HTMLElement>('[data-panel-item]')
    if (!items || items.length === 0) return
    const tween = gsap.fromTo(
      items,
      { autoAlpha: 0, y: 18 },
      { autoAlpha: 1, y: 0, duration: 0.5, ease: EASE.out, stagger: 0.05, delay: 0.12, clearProps: 'all' },
    )
    return () => {
      tween.kill()
      gsap.set(items, { clearProps: 'all' })
    }
  }, [open])

  // Magnetic pull on the panel's ✕ and Learn More (fine pointers only).
  useEffect(() => {
    if (open === null) return
    const cleanups: Array<() => void> = []
    if (closeRef.current) cleanups.push(attachMagnetic(closeRef.current, 3))
    if (learnMoreRef.current) cleanups.push(attachMagnetic(learnMoreRef.current, 5))
    return () => cleanups.forEach((fn) => fn())
  }, [open])

  const go = (id: string) => {
    setOpen(null)
    scrollToId(id)
  }


  const active = open !== null ? GROUPS[open] : null

  return (
    <div ref={rootRef} data-interactive className="fixed inset-x-0 top-0 z-50">
      <style>{localCss}</style>

      {/* The bar */}
      <div className="relative z-10 border-b border-[color-mix(in_srgb,var(--neon-dim)_55%,transparent)] bg-[color-mix(in_srgb,var(--bg-top)_97%,transparent)]">
        <div className="container-site flex h-16 items-center justify-between">
          <button
            onClick={() => go('top')}
            aria-label="Cornell CGS — back to the top"
            className="font-display flex items-center gap-3 text-[max(0.95rem,0.9375rem)] font-[700] tracking-[0.26em] text-[var(--text)]"
          >
            <Dice size={18} />
            <span
              className="life-breathe inline-block"
              style={{ ['--life-dur' as string]: '9s', ['--life-delay' as string]: '-3.1s' }}
            >
              CORNELL CGS
            </span>
          </button>

          <nav aria-label="Site" className="hidden items-center gap-8 md:flex">
            {GROUPS.map((g, i) => (
              <button
                key={g.label}
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
                className={`neon neon-word roll-hover relative pb-1 text-[max(0.95rem,1rem)] font-[550] transition-colors duration-300 [transition-timing-function:var(--ease-out)] after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:origin-left after:bg-[var(--neon-mid)] after:transition-transform after:duration-[350ms] after:[transition-timing-function:var(--ease-out)] ${
                  open === i
                    ? 'text-[var(--neon-mid)] after:scale-x-100'
                    : 'text-[var(--text)] after:scale-x-0 hover:text-[var(--neon-mid)]'
                }`}
              >
                <span
                  className="btn-label life-float"
                  style={{
                    ['--life-dur' as string]: LABEL_LIFE[i].dur,
                    ['--life-delay' as string]: LABEL_LIFE[i].delay,
                  }}
                >
                  <span>{g.label}</span>
                  <span aria-hidden="true">{g.label}</span>
                </span>
              </button>
            ))}
          </nav>

          {/* Mobile: one Menu button opening the first group's panel-as-list */}
          <button
            onClick={() => setOpen(open === null ? 0 : null)}
            aria-expanded={open !== null}
            aria-label="Menu"
            className="flex items-center gap-2.5 text-[max(0.95rem,1rem)] font-[550] text-[var(--text)] md:hidden"
          >
            <span
              className="life-float inline-block"
              style={{ ['--life-dur' as string]: '11.6s', ['--life-delay' as string]: '-5.2s' }}
            >
              Menu
            </span>
            {/* The bob rides the mark's box; its two lines keep their own open/close transforms */}
            <span
              aria-hidden="true"
              className="life-bob relative h-3 w-4"
              style={{ ['--life-dur' as string]: '6.8s', ['--life-delay' as string]: '-2.4s' }}
            >
              <span
                className={`absolute left-0 top-[2.75px] h-[1.5px] w-4 bg-current transition-transform duration-[400ms] [transition-timing-function:var(--ease-out)] ${
                  open !== null ? 'translate-y-[2.5px] rotate-45' : ''
                }`}
              />
              <span
                className={`absolute left-0 top-[0.4844rem] h-[1.5px] w-4 bg-current transition-transform duration-[400ms] [transition-timing-function:var(--ease-out)] ${
                  open !== null ? '-translate-y-[2.5px] -rotate-45' : ''
                }`}
              />
            </span>
          </button>
        </div>
      </div>

      {/* The overlay panel — natural height, revealed by a clip wipe
          (clip-path animates on the compositor; no layout per frame) */}
      <div
        ref={panelRef}
        role="menu"
        aria-hidden={open === null}
        className={`sheet-light grain-light neon-light absolute inset-x-0 top-16 bg-white shadow-[0_40px_80px_-1.875rem_rgba(10,30,63,0.35)] transition-[clip-path] duration-[600ms] [transition-timing-function:var(--ease-out)] ${
          open !== null
            ? 'pointer-events-auto [clip-path:inset(0_0_0%_0)]'
            : 'pointer-events-none [clip-path:inset(0_0_100%_0)]'
        }`}
      >
        {/* Mobile: one list with every page (the bar links are hidden there) */}
        {active && (
          <div className="container-site relative flex flex-col gap-1 py-10 md:hidden">
            <button
              onClick={() => setOpen(null)}
              aria-label="Close menu"
              className="group absolute right-0 top-4 p-2 text-[#0a1e3f]"
            >
              <IconX />
            </button>
            {GROUPS.flatMap((g) => g.subs)
              .filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i)
              .map((s) => (
                <a
                  key={s.id}
                  data-panel-item
                  role="menuitem"
                  href={pagePath(s.id)}
                  className="neon neon-word self-start py-3 text-left text-[max(1.15rem,1.1875rem)] font-[600] text-[#0a1e3f]"
                >
                  {s.label}
                </a>
              ))}
          </div>
        )}

        {active && (
          <div className="container-site relative hidden gap-10 py-14 md:grid md:grid-cols-2 md:py-20">
            <button
              ref={closeRef}
              onClick={() => setOpen(null)}
              aria-label="Close menu"
              className="group absolute right-0 top-6 p-2 text-[#0a1e3f] md:top-8"
            >
              <IconX />
            </button>

            {/* Left: the big name + Learn More, like citadel.com */}
            <div>
              <p
                data-panel-item
                className="font-display mb-8 text-[clamp(2.4rem,4.5vw,4.2rem)] font-[640] leading-[1.05] tracking-[-0.02em] text-[#0a1e3f]"
              >
                {active.label}
              </p>
              {/* Wrapper takes the stagger so GSAP never fights the magnetic
                  transform on the button itself */}
              <div data-panel-item>
                <a
                  ref={learnMoreRef}
                  href={pagePath(active.target)}
                  className="neon roll-hover group inline-block rounded-[0.375rem] bg-[#0a1e3f] px-8 py-4 text-[max(0.95rem,1rem)] font-[600] text-white transition-colors duration-300 [transition-timing-function:var(--ease-out)] hover:bg-[#1e5eff]"
                >
                  <span className="btn-label transition-transform duration-300 [transition-timing-function:var(--ease-out)] group-hover:-translate-y-0.5">
                    <span>Learn More</span>
                    <span aria-hidden="true">Learn More</span>
                  </span>
                </a>
              </div>
            </div>

            {/* Right: stacked sub-links */}
            <div className="flex flex-col items-start gap-5 md:pt-2">
              {active.subs.map((s) => (
                <a
                  key={s.id + s.label}
                  data-panel-item
                  role="menuitem"
                  href={pagePath(s.id)}
                  className="neon neon-word text-[max(1.05rem,1.125rem)] font-[550] text-[#0a1e3f] hover:text-[#1e5eff]"
                >
                  {s.label}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
