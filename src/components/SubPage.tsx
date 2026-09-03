import { useEffect, useRef } from 'react'
import { advisors, pages } from '../content'
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

      {/* Advisors — photo, name, title, research line */}
      {id === 'advisors' && (
        <div className="container-site border-t border-[#e3e9f4] py-16 md:py-20">
          <h2 data-page-item className="font-display mb-8 text-[clamp(1.4rem,2vw,1.9rem)] font-[640]">
            Faculty Advisors
          </h2>
          <div className="grid gap-10 md:grid-cols-2">
            {advisors.map((a) => (
              <div key={a.name} data-page-item className="flex gap-6">
                <img
                  src={a.photo}
                  alt={a.name}
                  width={144}
                  height={144}
                  className="h-28 w-28 shrink-0 rounded-full object-cover md:h-36 md:w-36"
                />
                <div className="flex flex-col gap-2">
                  <p className="font-display text-[clamp(1.25rem,1.8vw,1.6rem)] font-[640] leading-tight">
                    <a href={a.url} className="link-wipe" target="_blank" rel="noreferrer">
                      {a.name}
                    </a>
                  </p>
                  <p className="mono text-[max(0.8rem,12px)] uppercase tracking-[0.14em] text-[#1e5eff]">
                    {a.role}
                  </p>
                  <p className="text-[max(0.95rem,15px)] text-[#0a1e3f]">{a.title}</p>
                  <p className="text-[max(0.95rem,15px)] leading-relaxed text-[#46587a]">{a.bio}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* Quiet navy foot — no call to action, just the wordmark */}
      <div className="bg-[#0a1e3f] text-white">
        <div className="container-site flex items-center justify-between py-8">
          <a href="/" className="font-display flex items-center gap-2.5 text-[max(0.85rem,13px)] font-[700] tracking-[0.26em] text-white">
            <span aria-hidden="true" className="text-[#7a85ff]">♠</span> CORNELL CGS
          </a>
          <span className="mono text-[max(0.8rem,12px)] text-[#93a6cc]">cornellcgs.org</span>
        </div>
      </div>
    </div>
  )
}
