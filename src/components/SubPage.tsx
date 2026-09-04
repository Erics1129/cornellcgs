import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { advisors, pages, site, team } from '../content'
import { PAGE_THEME } from '../lib/pageTheme'
import type { PageTheme } from '../lib/pageTheme'
import { theme as technical } from './themes/Technical'
import { theme as organic } from './themes/Organic'
import { theme as kinetic } from './themes/Kinetic'
import { theme as cinematic } from './themes/Cinematic'
import { LiveBody, LiveHeading } from './LiveText'
import type { BodyDesign, HeadingDesign } from './LiveText'
import NetworkFlow from './NetworkFlow'
import GraphAlgo from './GraphAlgo'
import type { Algo } from './GraphAlgo'
import Dice from './Dice'

/**
 * A standalone info page — a REAL page at /<slug>/ (camelCase), rendered
 * instead of the deck (main.tsx decides). White, navy type, native scroll,
 * nothing overlays anything. Content that isn't already on the one-pager.
 * Each page wears one motion personality (src/lib/pageTheme.ts).
 */

const THEMES: Record<PageTheme['name'], PageTheme> = { technical, organic, kinetic, cinematic }

/** Leaving a page returns the reader to the chapter it belongs to. */
const CHAPTER: Record<string, string> = { advisors: 'people', contact: 'join' }

/* One word design per page (LiveText.tsx). No typing here — that is the deck's. */
const WORDS: Record<string, { h: HeadingDesign; b: BodyDesign }> = {
  'who-we-are': { h: 'flip', b: 'glow' },
  'what-we-do': { h: 'scramble', b: 'shimmer' },
  'ml-process': { h: 'converge', b: 'focus' },
  events: { h: 'ticker', b: 'underline' },
  world: { h: 'wave', b: 'shimmer' },
  people: { h: 'weight', b: 'glow' },
  advisors: { h: 'outline', b: 'shimmer' },
  join: { h: 'glitch', b: 'underline' },
  contact: { h: 'tilt', b: 'underline' },
}

/* One algorithm each, on the main pages only (GraphAlgo.tsx); the advisors
   page runs the layered network under Kleinberg instead (NetworkFlow). */
const ALGO: Record<string, Algo> = {
  'what-we-do': 'dijkstra',
  'ml-process': 'astar',
  world: 'kruskal',
  people: 'prim',
}

/* Idle-life phase for the i-th sibling (global.css .life-*): a negative delay
   spread over the period plus a ±20% duration jitter, so neighbours never
   move in lockstep. Life classes ride wrappers, never the [data-page-item]
   elements themselves — those carry the themes' entrance transforms. */
const JITTER = [1, 0.84, 1.16, 0.92, 1.08, 0.8, 1.2]
function life(i: number, base: number): CSSProperties {
  const dur = base * JITTER[i % JITTER.length]
  const delay = (i * 0.382 * base) % base
  return { '--life-dur': `${dur.toFixed(2)}s`, '--life-delay': `-${delay.toFixed(2)}s` } as CSSProperties
}

export default function SubPage({ id }: { id: string }) {
  const root = useRef<HTMLDivElement>(null)
  const def = pages[id]
  const theme = THEMES[PAGE_THEME[id] ?? 'cinematic']
  const words = WORDS[id] ?? { h: 'wave', b: 'shimmer' }

  useEffect(() => {
    document.documentElement.style.background = '#ffffff'
    if (!root.current) return
    return theme.enter(root.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!def) return null
  const Backdrop = theme.Backdrop
  const back = `/#${CHAPTER[id] ?? id}`

  // Came here from the deck? Step back through history so the browser can
  // restore the deck from its page cache — no reload, no curtain, same spot.
  // Otherwise (a direct visit, a search result) the href takes over.
  const goBack = (e: React.MouseEvent<HTMLAnchorElement>) => {
    let fromDeck = false
    try {
      fromDeck = new URL(document.referrer).origin === location.origin && history.length > 1
    } catch {
      fromDeck = false
    }
    if (fromDeck) {
      e.preventDefault()
      history.back()
    }
  }

  return (
    <div ref={root} className="sheet-light grain-light neon-light relative isolate min-h-svh bg-white text-[#0a1e3f]">
      <Backdrop />
      {/* Site bar */}
      <div className="sticky top-0 z-10 border-b border-[#e3e9f4] bg-white">
        <div className="container-site flex h-16 items-center justify-between">
          <a
            href={back}
            onClick={goBack}
            className="link-wipe flex items-center gap-2 text-[max(0.95rem,0.9375rem)] font-[600] text-[#0a1e3f]"
          >
            <span aria-hidden="true">←</span> Back
          </a>
          <a
            href="/"
            className="font-display flex items-center gap-2.5 text-[max(0.85rem,0.8125rem)] font-[700] tracking-[0.26em] text-[#0a1e3f]"
          >
            <Dice size={18} /> CORNELL CGS
          </a>
          <a
            href={back}
            onClick={goBack}
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
        <p data-page-item className="mono mb-5 text-[max(0.85rem,0.8125rem)] uppercase tracking-[0.18em] text-[#1e5eff]">
          <span className="life-glow" style={life(2, 4)}>
            Cornell Computational Game Society
          </span>
        </p>
        {/* The breathe sits on a wrapper: the h1 itself is scrambled/split/tweened by the themes. Left origin keeps the margin edge still. */}
        <div className="life-breathe" style={{ ...life(2, 9), transformOrigin: '0% 50%' }}>
          <h1
            data-page-item
            data-page-title
            className="font-display max-w-[16ch] text-[clamp(3rem,6.5vw,5.8rem)] font-[680] leading-[1.02] tracking-[-0.02em]"
          >
            {def.title}
          </h1>
        </div>
        {/* Wrapper, not an inner span: Cinematic splits the lead's own children into words. */}
        <div className="life-float" style={life(1, 12)}>
          <p data-page-item className="mt-8 max-w-[52ch] text-[max(1.15rem,1.1875rem)] leading-relaxed text-[#46587a]">
            {def.lead}
          </p>
        </div>
      </div>

      {/* Advisors — photo, name, title, research line */}
      {id === 'advisors' && (
        <div className="container-site border-t border-[#e3e9f4] py-16 md:py-20">
          <div data-page-item className="mb-8">
            <LiveHeading
              design={words.h}
              text="Faculty Advisors"
              alt="Who Keeps Us Honest"
              className="neon neon-word font-display text-[clamp(1.4rem,2vw,1.9rem)] font-[640]"
            />
          </div>
          <div className="grid gap-10 md:grid-cols-2">
            {advisors.map((a, i) => (
              <div key={a.name} data-page-item className="flex flex-col gap-8">
                <div className="flex gap-6">
                  <img
                    src={a.photo}
                    alt={a.name}
                    width={144}
                    height={144}
                    className="life-float h-28 w-28 shrink-0 rounded-full object-cover md:h-36 md:w-36"
                    style={life(i, 8)}
                  />
                  <div className="flex flex-col gap-2">
                    <p
                      className="life-glow font-display text-[clamp(1.25rem,1.8vw,1.6rem)] font-[640] leading-tight"
                      style={life(i + 3, 4)}
                    >
                      <a href={a.url} className="neon neon-word" target="_blank" rel="noreferrer">
                        {a.name}
                      </a>
                    </p>
                    <p className="mono text-[max(0.8rem,0.75rem)] uppercase tracking-[0.14em] text-[#1e5eff]">
                      <span className="life-glow inline-block" style={life(i + 1, 4)}>
                        {a.role}
                      </span>
                    </p>
                    <p className="weight-breathe text-[max(0.95rem,0.9375rem)] text-[#0a1e3f]" style={life(i + 2, 7)}>
                      {a.title}
                    </p>
                    <LiveBody design={words.b} text={a.bio} index={i + 1} className="text-[max(0.95rem,0.9375rem)] leading-relaxed" />
                  </div>
                </div>
                <NetworkFlow className="h-[clamp(180px,26vw,320px)] w-full" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Our Team — name and major only, so the whole club fits without scrolling */}
      {id === 'people' && (
        <div className="container-site border-t border-[#e3e9f4] py-16 md:py-20">
          {team.map((group, gi) => (
            <div key={group.label} className={gi ? 'mt-12' : ''}>
              <div data-page-item className="mb-6">
                <LiveHeading
                  design={words.h}
                  text={group.label}
                  alt={group.alt}
                  className="neon neon-word font-display text-[clamp(1.4rem,2vw,1.9rem)] font-[640]"
                />
              </div>
              <ul className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
                {group.people.map((person, i) => (
                  <li key={person.name + i} data-page-item>
                    <div className="life-float" style={life(i + gi, 8)}>
                      <p className="font-display text-[max(1.05rem,1.1rem)] font-[640] leading-tight">{person.name}</p>
                      <p className="mono mt-1 text-[max(0.75rem,0.75rem)] uppercase tracking-[0.12em] text-[#46587a]">
                        {person.major}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Sections */}
      <div className="container-site border-t border-[#e3e9f4] py-16 md:py-20">
        <div className="grid gap-x-10 gap-y-12 md:grid-cols-2">
        {def.sections.map((sec, i) => (
          <div key={sec.heading} data-page-item>
            {/* The heading keeps moving between its two lines in the page's own design. Life rides the wrapper — the block is what the themes tilt. */}
            <div className="life-float mb-3" style={{ ...life(i, 7), transformOrigin: '0% 50%' }}>
              <LiveHeading
                design={words.h}
                text={sec.heading}
                alt={sec.alt}
                className="neon neon-word font-display text-[clamp(1.4rem,2vw,1.9rem)] font-[640]"
              />
            </div>
            <LiveBody design={words.b} text={sec.body} index={i} className="text-[max(1rem,1.0625rem)] leading-relaxed text-[#46587a]" />
            {sec.link && (
              <a
                href={sec.link.href}
                target="_blank"
                rel="noreferrer"
                className="neon neon-idle btn-label mt-5 inline-block rounded-[6px] bg-[#0a1e3f] px-6 py-3 text-[max(0.95rem,1rem)] font-[600] text-white transition-colors duration-300 [transition-timing-function:var(--ease-out)] hover:bg-[#1e5eff]"
              >
                <span>{sec.link.label} {'\u2197'}</span>
                <span aria-hidden="true">{sec.link.label} {'\u2197'}</span>
              </a>
            )}
          </div>
        ))}
        </div>
      </div>

      {/* The page's algorithm, in its own room under the words — a fresh graph every run, forever */}
      {ALGO[id] && (
        <div className="container-site pb-16 md:pb-20">
          <div data-page-item>
            <GraphAlgo algo={ALGO[id]} className="h-[clamp(220px,34vw,420px)] w-full" />
          </div>
        </div>
      )}

      {/* Quiet navy foot — no call to action, just the wordmark */}
      <div className="bg-[#0a1e3f] text-white">
        <div className="container-site flex items-center justify-between py-8">
          <a href="/" className="font-display flex items-center gap-2.5 text-[max(0.85rem,0.8125rem)] font-[700] tracking-[0.26em] text-white">
            <Dice size={18} className="[--dice-face:#f5f1e6] [--dice-pip:#1e5eff] [--dice-edge:rgba(10,30,63,0.35)]" /> CORNELL CGS
          </a>
          <span className="mono text-[max(0.8rem,0.75rem)] text-[#93a6cc]">cornellcgs.org</span>
        </div>
        <div className="container-site border-t border-[rgba(147,166,204,0.25)] py-4">
          <p className="mono text-[max(0.75rem,0.75rem)] text-[#93a6cc]">
            <span className="life-glow inline-block" style={life(3, 5)}>
              {site.credit}
            </span>
          </p>
        </div>
      </div>
    </div>
  )
}
