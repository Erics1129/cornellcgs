import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { pages } from '../content'
import { EASE } from '../lib/eases'
import { attachMagnetic } from '../lib/magnetic'
import { prefersReducedMotion } from '../lib/motion'
import { closePage, currentPage, onPage } from '../lib/router'
import { scrollToId } from '../lib/scroll'

/**
 * Citadel-style sub-pages — every dropdown item is its own page (#p/<id>)
 * that slides in over the deck: white, navy type, a sticky mini-header, the
 * big title, TBD sections, and a navy band linking back to the live chapter.
 */

/* .btn-label's roll and .link-wipe's underline key off .btn/a or self hover —
   these triggers are <button>s, so they need their own hover hooks. */
const localCss = `
.roll-hover:hover .btn-label > span,
.roll-hover:focus-visible .btn-label > span { transform: translateY(-100%); }
.wipe-parent:hover .link-wipe,
.wipe-parent:focus-visible .link-wipe { background-size: 100% 1px; background-position: 0% calc(100% - 0.05em); }
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

export default function SubPage() {
  const [id, setId] = useState<string | null>(() => currentPage())
  const [shown, setShown] = useState(false)
  const closing = useRef(0)
  const rootEl = useRef<HTMLDivElement>(null)
  const closeBtn = useRef<HTMLButtonElement>(null)
  const ctaBtn = useRef<HTMLButtonElement>(null)

  useEffect(() => onPage((next) => {
    window.clearTimeout(closing.current)
    if (next) {
      setId(next)
      requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
    } else {
      setShown(false)
      closing.current = window.setTimeout(() => setId(null), 400)
    }
  }), [])

  // First paint when arriving directly on a #p/… URL
  useEffect(() => {
    if (id) requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!id) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePage()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id])

  // Interior rises in behind the sheet slide; close needs no tween — the
  // sheet carries it out. Layout effect so items never paint un-hidden first.
  useLayoutEffect(() => {
    if (!id || !shown || prefersReducedMotion()) return
    const items = rootEl.current?.querySelectorAll<HTMLElement>('[data-sheet-item]')
    if (!items || items.length === 0) return
    const tween = gsap.fromTo(
      items,
      { autoAlpha: 0, y: 18 },
      { autoAlpha: 1, y: 0, duration: 0.5, ease: EASE.out, stagger: 0.06, delay: 0.18, clearProps: 'all' },
    )
    return () => {
      tween.kill()
      gsap.set(items, { clearProps: 'all' })
    }
  }, [id, shown])

  // Magnetic pull on the header ✕ and the navy-band CTA (fine pointers only).
  useEffect(() => {
    if (!id) return
    const cleanups: Array<() => void> = []
    if (closeBtn.current) cleanups.push(attachMagnetic(closeBtn.current, 3))
    if (ctaBtn.current) cleanups.push(attachMagnetic(ctaBtn.current, 5))
    return () => cleanups.forEach((fn) => fn())
  }, [id])

  if (!id) return null
  const def = pages[id]
  if (!def) return null

  const goChapter = () => {
    closePage()
    window.setTimeout(() => scrollToId(id === 'contact' ? 'join' : id === 'advisors' ? 'people' : id), 80)
  }

  return (
    <div
      ref={rootEl}
      data-subpage
      data-interactive
      data-lenis-prevent
      role="dialog"
      aria-label={def.title}
      className={`sheet-light grain-light fixed inset-0 z-[70] overflow-y-auto bg-white text-[#0a1e3f] shadow-[-60px_0_120px_-20px_rgba(4,8,28,0.5)] transition-transform [transition-timing-function:var(--ease-in-out)] ${
        shown ? 'translate-x-0 duration-[560ms]' : 'translate-x-full duration-[380ms]'
      }`}
    >
      <style>{localCss}</style>

      {/* Sticky mini-header */}
      <div className="sticky top-0 z-10 border-b border-[#e3e9f4] bg-white">
        <div className="container-site flex h-16 items-center justify-between">
          <button
            onClick={closePage}
            className="wipe-parent group flex items-center gap-2 text-[max(0.95rem,15px)] font-[600] text-[#0a1e3f] transition-colors duration-300 [transition-timing-function:var(--ease-out)] hover:text-[#1e5eff]"
          >
            <span
              aria-hidden="true"
              className="transition-transform duration-300 [transition-timing-function:var(--ease-out)] group-hover:-translate-x-0.5"
            >
              ←
            </span>
            <span className="link-wipe">Back</span>
          </button>
          <span className="font-display flex items-center gap-2.5 text-[max(0.85rem,13px)] font-[700] tracking-[0.26em]">
            <span aria-hidden="true" className="text-[#1e5eff]">♠</span> CORNELL CGS
          </span>
          <button
            ref={closeBtn}
            onClick={closePage}
            aria-label="Close page"
            className="group p-2"
          >
            <IconX />
          </button>
        </div>
      </div>

      {/* Second arrival layer: content trails the sheet by its own slide */}
      <div
        className={`transition-transform duration-700 [transition-timing-function:var(--ease-out)] ${
          shown ? 'translate-x-0' : 'translate-x-20'
        }`}
      >
        {/* Title block */}
        <div className="container-site pb-16 pt-16 md:pb-24 md:pt-24">
          <p
            data-sheet-item
            className="mono mb-5 text-[max(0.85rem,13px)] uppercase tracking-[0.18em] text-[#1e5eff]"
          >
            Cornell Computational Game Society
          </p>
          <h1
            data-sheet-item
            className="font-display max-w-[16ch] text-[clamp(3rem,6.5vw,5.8rem)] font-[680] leading-[1.02] tracking-[-0.02em]"
          >
            {def.title}
          </h1>
          <p
            data-sheet-item
            className="mt-8 max-w-[52ch] text-[max(1.15rem,19px)] leading-relaxed text-[#46587a]"
          >
            {def.lead}
          </p>
        </div>

        {/* Sections — all TBD until the club fills them in */}
        <div className="container-site grid gap-x-10 gap-y-12 border-t border-[#e3e9f4] py-16 md:grid-cols-2 md:py-20">
          {def.sections.map((sec) => (
            <div key={sec.heading} data-sheet-item>
              <h2 className="font-display mb-3 text-[clamp(1.4rem,2vw,1.9rem)] font-[640]">
                {sec.heading}
              </h2>
              <p className="text-[max(1rem,17px)] leading-relaxed text-[#46587a]">{sec.body}</p>
            </div>
          ))}
        </div>

        {/* Navy band back to the live chapter */}
        <div data-sheet-item className="bg-[#0a1e3f] text-white">
          <div className="container-site flex flex-col items-start justify-between gap-6 py-14 md:flex-row md:items-center">
            <p className="font-display max-w-[24ch] text-[clamp(1.5rem,2.6vw,2.3rem)] font-[640] leading-tight">
              See it live on the main page.
            </p>
            <button
              ref={ctaBtn}
              onClick={goChapter}
              className="roll-hover bg-white px-8 py-4 text-[max(0.95rem,16px)] font-[600] text-[#0a1e3f] transition-colors duration-300 [transition-timing-function:var(--ease-out)] hover:bg-[#1e5eff] hover:text-white"
            >
              <span className="btn-label">
                <span>Take me there</span>
                <span aria-hidden="true">Take me there</span>
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
