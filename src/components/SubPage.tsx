import { useEffect, useRef, useState } from 'react'
import { pages } from '../content'
import { closePage, currentPage, onPage } from '../lib/router'
import { scrollToId } from '../lib/scroll'

/**
 * Citadel-style sub-pages — every dropdown item is its own page (#p/<id>)
 * that slides in over the deck: white, navy type, a sticky mini-header, the
 * big title, TBD sections, and a navy band linking back to the live chapter.
 */
export default function SubPage() {
  const [id, setId] = useState<string | null>(() => currentPage())
  const [shown, setShown] = useState(false)
  const closing = useRef(0)

  useEffect(() => onPage((next) => {
    window.clearTimeout(closing.current)
    if (next) {
      setId(next)
      requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
    } else {
      setShown(false)
      closing.current = window.setTimeout(() => setId(null), 560)
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

  if (!id) return null
  const def = pages[id]
  if (!def) return null

  const goChapter = () => {
    closePage()
    window.setTimeout(() => scrollToId(id === 'contact' ? 'join' : id), 80)
  }

  return (
    <div
      data-subpage
      data-interactive
      role="dialog"
      aria-label={def.title}
      className={`fixed inset-0 z-[70] overflow-y-auto bg-white text-[#0a1e3f] transition-transform duration-[560ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
        shown ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      {/* Sticky mini-header */}
      <div className="sticky top-0 z-10 border-b border-[#e3e9f4] bg-white">
        <div className="container-site flex h-16 items-center justify-between">
          <button
            onClick={closePage}
            className="flex items-center gap-2 text-[max(0.95rem,15px)] font-[600] text-[#0a1e3f] transition-colors hover:text-[#1e5eff]"
          >
            <span aria-hidden="true">←</span> Back
          </button>
          <span className="font-display flex items-center gap-2.5 text-[max(0.85rem,13px)] font-[700] tracking-[0.26em]">
            <span aria-hidden="true" className="text-[#1e5eff]">♠</span> CORNELL CGS
          </span>
          <button
            onClick={closePage}
            aria-label="Close page"
            className="p-2 text-xl leading-none transition-transform hover:rotate-90"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Title block */}
      <div className="container-site pb-16 pt-16 md:pb-24 md:pt-24">
        <p className="mono mb-5 text-[max(0.85rem,13px)] uppercase tracking-[0.18em] text-[#1e5eff]">
          Cornell Computational Game Society
        </p>
        <h1 className="font-display max-w-[16ch] text-[clamp(3rem,6.5vw,5.8rem)] font-[680] leading-[1.02] tracking-[-0.02em]">
          {def.title}
        </h1>
        <p className="mt-8 max-w-[52ch] text-[max(1.15rem,19px)] leading-relaxed text-[#46587a]">
          {def.lead}
        </p>
      </div>

      {/* Sections — all TBD until the club fills them in */}
      <div className="container-site grid gap-x-10 gap-y-12 border-t border-[#e3e9f4] py-16 md:grid-cols-2 md:py-20">
        {def.sections.map((sec) => (
          <div key={sec.heading}>
            <h2 className="font-display mb-3 text-[clamp(1.4rem,2vw,1.9rem)] font-[640]">
              {sec.heading}
            </h2>
            <p className="text-[max(1rem,17px)] leading-relaxed text-[#46587a]">{sec.body}</p>
          </div>
        ))}
      </div>

      {/* Navy band back to the live chapter */}
      <div className="bg-[#0a1e3f] text-white">
        <div className="container-site flex flex-col items-start justify-between gap-6 py-14 md:flex-row md:items-center">
          <p className="font-display max-w-[24ch] text-[clamp(1.5rem,2.6vw,2.3rem)] font-[640] leading-tight">
            See it live on the main page.
          </p>
          <button
            onClick={goChapter}
            className="bg-white px-8 py-4 text-[max(0.95rem,16px)] font-[600] text-[#0a1e3f] transition-colors hover:bg-[#1e5eff] hover:text-white"
          >
            Take me there
          </button>
        </div>
      </div>
    </div>
  )
}
