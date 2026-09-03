import { useEffect, useRef } from 'react'
import { pages } from '../content'
import { PAGE_THEME } from '../lib/pageTheme'
import type { PageTheme } from '../lib/pageTheme'
import { theme as technical } from './themes/Technical'
import { theme as organic } from './themes/Organic'
import { theme as kinetic } from './themes/Kinetic'
import { theme as cinematic } from './themes/Cinematic'

/**
 * A standalone info page — a REAL page at /<slug>/ (camelCase), rendered
 * instead of the deck (main.tsx decides). White, navy type, native scroll,
 * nothing overlays anything. Content that isn't already on the one-pager.
 * Each page wears one motion personality (src/lib/pageTheme.ts).
 */

/** Which deck chapter the navy band links back to. */
const CHAPTER: Record<string, string> = {
  advisors: 'people',
  contact: 'join',
}

const THEMES: Record<PageTheme['name'], PageTheme> = { technical, organic, kinetic, cinematic }

export default function SubPage({ id }: { id: string }) {
  const root = useRef<HTMLDivElement>(null)
  const def = pages[id]
  const theme = THEMES[PAGE_THEME[id] ?? 'cinematic']

  useEffect(() => {
    document.documentElement.style.background = '#ffffff'
    if (!root.current) return
    return theme.enter(root.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!def) return null
  const chapter = CHAPTER[id] ?? id
  const Backdrop = theme.Backdrop

  return (
    <div ref={root} className="sheet-light grain-light relative min-h-svh bg-white text-[#0a1e3f]">
      <Backdrop />
      {/* Site bar */}
      <div className="sticky top-0 z-10 border-b border-[#e3e9f4] bg-white">
        <div className="container-site flex h-16 items-center justify-between">
          <a
            href="/"
            className="link-wipe flex items-center gap-2 text-[max(0.95rem,15px)] font-[600] text-[#0a1e3f]"
          >
            <span aria-hidden="true">←</span> Back
          </a>
          <a
            href="/"
            className="font-display flex items-center gap-2.5 text-[max(0.85rem,13px)] font-[700] tracking-[0.26em] text-[#0a1e3f]"
          >
            <span aria-hidden="true" className="text-[#1e5eff]">♠</span> CORNELL CGS
          </a>
          <a
            href="/"
            aria-label="Back to the main page"
            className="p-2 text-[#0a1e3f] transition-transform duration-[400ms] [transition-timing-function:var(--ease-out)] hover:rotate-90"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M1 1l14 14M15 1L1 15" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </a>
        </div>
      </div>

      {/* Title block */}
      <div className="container-site pb-16 pt-16 md:pb-24 md:pt-24">
        <p data-page-item className="mono mb-5 text-[max(0.85rem,13px)] uppercase tracking-[0.18em] text-[#1e5eff]">
          Cornell Computational Game Society
        </p>
        <h1
          data-page-item
          data-page-title
          className="font-display max-w-[16ch] text-[clamp(3rem,6.5vw,5.8rem)] font-[680] leading-[1.02] tracking-[-0.02em]"
        >
          {def.title}
        </h1>
        <p data-page-item className="mt-8 max-w-[52ch] text-[max(1.15rem,19px)] leading-relaxed text-[#46587a]">
          {def.lead}
        </p>
      </div>

      {/* Sections */}
      <div className="container-site grid gap-x-10 gap-y-12 border-t border-[#e3e9f4] py-16 md:grid-cols-2 md:py-20">
        {def.sections.map((sec) => (
          <div key={sec.heading} data-page-item>
            <h2 className="font-display mb-3 text-[clamp(1.4rem,2vw,1.9rem)] font-[640]">
              {sec.heading}
            </h2>
            <p className="text-[max(1rem,17px)] leading-relaxed text-[#46587a]">{sec.body}</p>
          </div>
        ))}
      </div>

      {/* Navy band back to the deck */}
      <div className="bg-[#0a1e3f] text-white">
        <div className="container-site flex flex-col items-start justify-between gap-6 py-14 md:flex-row md:items-center">
          <p className="font-display max-w-[24ch] text-[clamp(1.5rem,2.6vw,2.3rem)] font-[640] leading-tight">
            See it live on the main page.
          </p>
          <a
            href={`/#${chapter}`}
            className="bg-white px-8 py-4 text-[max(0.95rem,16px)] font-[600] text-[#0a1e3f] transition-colors [transition-timing-function:var(--ease-out)] hover:bg-[#1e5eff] hover:text-white"
          >
            <span className="btn-label">
              <span>Take me there</span>
              <span aria-hidden="true">Take me there</span>
            </span>
          </a>
        </div>
      </div>
    </div>
  )
}
