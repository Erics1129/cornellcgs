import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import gsap from 'gsap'
import { prefersReducedMotion } from '../lib/motion'
import { scrollToId } from '../lib/scroll'
import { pagePath } from '../lib/router'
import Dice from './Dice'
import './scopedMotion.css'

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

/** A nonmodal navigation disclosure: normal links, natural Tab order. */
export default function Nav() {
  const [open, setOpen] = useState<number | null>(null)
  const lastGroup = useRef(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLButtonElement | null>(null)
  const pendingFocus = useRef<'first' | 'last' | null>(null)
  const id = useId()
  const panelId = `${id}-panel`
  const active = GROUPS[open ?? lastGroup.current]

  const close = (restore = false) => {
    setOpen(null)
    if (restore) openerRef.current?.focus({ preventScroll: true })
  }
  const show = (index: number, button: HTMLButtonElement, focus: 'first' | 'last' | null = null) => {
    openerRef.current = button
    lastGroup.current = index
    pendingFocus.current = focus
    setOpen(index)
    // ArrowDown on an already-open disclosure should still enter its links.
    if (open === index && focus) focusLinks(focus)
  }
  const focusLinks = (edge: 'first' | 'last') => {
    const links = Array.from(panelRef.current?.querySelectorAll<HTMLAnchorElement>('a[href]') ?? []).filter((el) => el.getClientRects().length > 0)
    ;(edge === 'first' ? links[0] : links.at(-1))?.focus({ preventScroll: true })
    pendingFocus.current = null
  }

  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    panel.toggleAttribute('inert', open === null)
    if (open === null) return
    if (pendingFocus.current) focusLinks(pendingFocus.current)
    if (prefersReducedMotion()) return
    const items = Array.from(panel.querySelectorAll<HTMLElement>('[data-panel-item]')).filter((el) => el.getClientRects().length > 0)
    const ctx = gsap.context(() => {
      gsap.fromTo(items, { opacity: 0, y: 8 }, {
        opacity: 1, y: 0, duration: 0.32, stagger: 0.035, ease: 'power3.out', clearProps: 'opacity,transform',
      })
    }, panel)
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onMotion = () => { if (motion.matches) ctx.revert() }
    motion.addEventListener('change', onMotion)
    return () => { motion.removeEventListener('change', onMotion); ctx.revert() }
  }, [open])

  useEffect(() => {
    if (open === null) return
    const onDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close()
    }
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(true) }
    }
    const onFocus = (event: FocusEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close()
    }
    // A breakpoint change closes the disclosure before its focused controls hide.
    const breakpoint = window.matchMedia('(min-width: 768px)')
    const onBreakpoint = () => {
      const focusInside = rootRef.current?.contains(document.activeElement)
      close()
      if (focusInside) rootRef.current?.querySelector<HTMLButtonElement>(breakpoint.matches ? '[data-nav-trigger]' : '[data-mobile-trigger]')?.focus()
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    document.addEventListener('focusin', onFocus)
    breakpoint.addEventListener('change', onBreakpoint)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('focusin', onFocus)
      breakpoint.removeEventListener('change', onBreakpoint)
    }
  }, [open])

  const triggerKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      show(index, event.currentTarget, event.key === 'ArrowDown' ? 'first' : 'last')
    } else if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      const buttons = Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>('[data-nav-trigger]') ?? [])
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length
      buttons[next]?.focus()
      if (open !== null && buttons[next]) show(next, buttons[next])
    }
  }
  const goTop = () => { close(); scrollToId('top') }

  return (
    <div ref={rootRef} data-interactive className="cgs-nav fixed inset-x-0 top-0 z-50">
      <div className="relative z-10 border-b border-[color-mix(in_srgb,var(--neon-dim)_55%,transparent)] bg-[color-mix(in_srgb,var(--bg-top)_97%,transparent)]">
        <div className="container-site flex h-16 items-center justify-between">
          <button type="button" onClick={goTop} aria-label="Cornell CGS — back to the top" className="cgs-nav-brand font-display flex min-h-11 items-center gap-3 font-[700] tracking-[0.26em] text-[var(--text)]">
            <Dice size={18} /><span>CORNELL CGS</span>
          </button>
          <nav aria-label="Site" className="hidden items-center gap-6 md:flex">
            {GROUPS.map((group, index) => (
              <button key={group.label} type="button" data-nav-trigger id={`${id}-trigger-${index}`}
                onClick={(event) => open === index ? close() : show(index, event.currentTarget)}
                onKeyDown={(event) => triggerKey(event, index)}
                aria-expanded={open === index} aria-controls={panelId}
                className="cgs-nav-trigger text-[var(--text)]">
                {group.label}<span aria-hidden="true" className="cgs-nav-chevron" />
              </button>
            ))}
          </nav>
          <button type="button" data-mobile-trigger id={`${id}-mobile`} aria-label="Menu"
            aria-controls={panelId} aria-expanded={open !== null}
            onClick={(event) => open === null ? show(0, event.currentTarget) : close()}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') { event.preventDefault(); show(0, event.currentTarget, 'first') }
            }}
            className="cgs-nav-trigger text-[var(--text)] md:hidden">
            Menu<span aria-hidden="true" className="cgs-nav-menu-icon" data-open={open !== null}><i /><i /></span>
          </button>
        </div>
      </div>
      <div ref={panelRef} id={panelId} role="region" aria-label="Site navigation" aria-hidden={open === null}
        data-open={open !== null} data-lenis-prevent className="cgs-nav-panel sheet-light neon-light">
        <div className="container-site relative py-8 md:py-12">
          <button type="button" onClick={() => close(true)} aria-label="Close menu" className="cgs-nav-close absolute right-0 top-3 md:top-5">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
          <nav aria-label="All pages" className="flex flex-col pt-4 md:hidden">
            {GROUPS.flatMap((g) => g.subs).filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i).map((s) => (
              <a key={s.id} data-panel-item href={pagePath(s.id)} className="cgs-nav-link">{s.label}<span aria-hidden="true">↗</span></a>
            ))}
          </nav>
          <div className="hidden gap-10 md:grid md:grid-cols-2">
            <div>
              <p data-panel-item className="font-display mb-7 text-[clamp(2.4rem,4.5vw,4.2rem)] font-[640] leading-[1.05] tracking-[-0.02em]">{active.label}</p>
              <div data-panel-item><a href={pagePath(active.target)} className="cgs-nav-cta">Learn More<span aria-hidden="true">↗</span></a></div>
            </div>
            <nav aria-label={active.label} className="flex flex-col pr-10">
              {active.subs.map((s) => <a key={s.id + s.label} data-panel-item href={pagePath(s.id)} className="cgs-nav-link">{s.label}<span aria-hidden="true">↗</span></a>)}
            </nav>
          </div>
        </div>
      </div>
    </div>
  )
}
