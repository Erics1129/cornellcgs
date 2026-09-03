import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { EASE } from '../lib/eases'
import { prefersReducedMotion } from '../lib/motion'
import CodePanel from './CodePanel'
import { POT_EQUITY } from '../effects/codeSnippets'

gsap.registerPlugin(ScrollTrigger)

/**
 * Two showcase slides in the product-page idiom, drawn from scratch:
 *
 *   CodeSlide  — a laptop bleeding off the right edge: its editor types the
 *                club's pot-equity Monte Carlo, then a terminal beneath it
 *                runs the site's own repo, both under the reader's scroll
 *   StatsSlide  — a horizontal strip of huge gradient statements with
 *                 hairline rules, panned by scroll
 * Both pin and scrub; transform/opacity/clip only.
 */

const PIN = {
  start: 'top top',
  pin: true,
  scrub: 0.4,
  anticipatePin: 1,
  invalidateOnRefresh: true,
  refreshPriority: 1,
} as const

/* ------------------------------------------------------------------------ */

/** Idle-life phase (seconds): siblings never move in lockstep. */
const life = (delay: number, dur?: number): React.CSSProperties => ({
  ['--life-delay' as string]: `${delay}s`,
  ...(dur ? { ['--life-dur' as string]: `${dur}s` } : {}),
})

/* ------------------------------------------------------------------------ */

const STATS = [
  { over: 'Every Throwing Eggs deck', big: '108 cards', under: 'two decks, jokers in' },
  { over: 'Four players', big: '2 teams', under: 'partners across the table' },
  { over: 'Ezra Cornell', big: 'Any person', under: 'any study.' },
]

export function StatsSlide() {
  const root = useRef<HTMLElement>(null)
  const track = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const section = root.current
    const t = track.current
    if (!section || !t) return
    const cards = Array.from(t.children) as HTMLElement[]
    const rules = cards.map((c) => c.querySelector<HTMLElement>('[data-rule]')!)

    if (prefersReducedMotion()) {
      // No pan: the section becomes a native horizontal scroller (see the
      // motion-reduce classes) and needs a tab stop so keyboards can reach it.
      section.tabIndex = 0
      return
    }

    const ctx = gsap.context(() => {
      gsap.set(rules, { scaleX: 0, transformOrigin: '0% 50%' })
      const tl = gsap.timeline({ scrollTrigger: { trigger: section, end: '+=180%', ...PIN } })
      // Pan the strip until its last card sits in view
      tl.to(t, { x: () => -(t.scrollWidth - window.innerWidth + window.innerWidth * 0.06), duration: 1, ease: 'none' }, 0)
      // Each rule draws as its card comes into view
      rules.forEach((r, i) => {
        tl.to(r, { scaleX: 1, duration: 0.18, ease: EASE.out }, Math.max(0, (i / rules.length) * 0.85 - 0.05))
      })
    }, section)

    return () => ctx.revert()
  }, [])

  return (
    <section
      ref={root}
      id="stats"
      className="section overflow-x-clip !justify-center motion-reduce:overflow-x-auto motion-reduce:overscroll-x-contain"
      aria-label="The numbers"
    >
      <div ref={track} className="flex w-max gap-[8vw] pl-[max(1.5rem,calc((100vw-80rem)/2))] will-change-transform motion-reduce:pr-[6vw]">
        {STATS.map((s, i) => (
          <div key={s.big} className="flex w-[min(70vw,45rem)] shrink-0 flex-col gap-5">
            {/* The rule is GSAP-drawn (scaleX), so its glow rides a wrapper */}
            <div className="life-glow" style={life(-(1.1 + i * 1.4), 4 + (i % 3) * 0.7)}>
              <div data-rule className="h-px w-full bg-[linear-gradient(90deg,var(--neon-mid),rgba(78,168,255,0.15))]" />
            </div>
            <p className="life-float text-[clamp(1.3rem,2.4vw,2.2rem)] leading-tight text-[var(--text)]" style={life(-(1.5 + i * 2.1), 6.4 + i * 0.9)}>
              {s.over}
            </p>
            <p
              className="life-shimmer font-display text-[clamp(3.6rem,9vw,8.5rem)] font-[700] leading-[0.95] tracking-[-0.03em] text-transparent [background-clip:text] [background-image:linear-gradient(100deg,#f2f5ff_0%,#cfe0ff_45%,#7a9dff_100%)] [-webkit-background-clip:text]"
              style={life(-(0.9 + i * 2.3), 7 + (i - 1) * 1.2)}
            >
              {s.big}
            </p>
            <p className="life-float text-[clamp(1.3rem,2.4vw,2.2rem)] leading-tight text-[var(--text)]" style={life(-(4.2 + i * 1.7), 7.9 - i * 0.8)}>
              {s.under}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}


/* ------------------------------------------------------------------------ */

/** After the code: the site's own repo, run for real. */
const SHELL: string[] = [
  '$ git clone https://github.com/Erics1129/cornellcgs.git',
  '$ cd cornellcgs && npm install',
  '$ npm run dev',
  '> vite: ready — http://localhost:5190',
  '$ open http://localhost:5190',
  '✓ see you at study night',
]

export function CodeSlide() {
  const root = useRef<HTMLElement>(null)
  const laptop = useRef<HTMLDivElement>(null)
  const copy = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const section = root.current
    const lap = laptop.current
    if (!section || !lap) return
    const items = Array.from(copy.current?.querySelectorAll<HTMLElement>('[data-lab-item]') ?? [])
    if (prefersReducedMotion()) {
      gsap.set([lap, ...items], { opacity: 1, clearProps: 'transform' })
      return
    }
    const mm = gsap.matchMedia(section)
    // Desktop: the chapter pins for 2.6 screens; the laptop dollies in, the
    // editor and terminal type through the pin (CodePanel reads the same range)
    mm.add('(min-width: 768px)', () => {
      gsap.set(lap, { transformOrigin: '30% 50%', willChange: 'transform' })
      gsap.set(items, { opacity: 0, y: 18 })
      const tl = gsap.timeline({ scrollTrigger: { trigger: section, end: '+=260%', ...PIN } })
      tl.fromTo(
        lap,
        { scale: 1.5, x: () => -window.innerWidth * 0.12, opacity: 0.85 },
        { scale: 1, x: 0, opacity: 1, duration: 0.3, ease: 'power1.inOut' },
        0,
      )
      tl.to(items, { opacity: 1, y: 0, duration: 0.2, ease: EASE.out, stagger: 0.04 }, 0.2)
    })
    // Phones: no pin (the laptop sits below the copy) — the copy rises once,
    // and the panels type against their own passage through the screen
    mm.add('(max-width: 767px)', () => {
      gsap.set(lap, { clearProps: 'transform,opacity' })
      gsap.fromTo(
        items,
        { opacity: 0, y: 18 },
        {
          opacity: 1,
          y: 0,
          duration: 0.6,
          ease: EASE.out,
          stagger: 0.06,
          scrollTrigger: { trigger: section, start: 'top 75%', once: true, fastScrollEnd: true },
        },
      )
    })
    return () => mm.revert()
  }, [])

  return (
    <section ref={root} id="code" className="section overflow-x-clip" aria-label="The code behind the club">
      <div className="container-site relative z-10 grid gap-10 md:grid-cols-[5fr_7fr]">
        <div ref={copy} className="flex flex-col gap-6 md:pr-8">
          {/* Every [data-lab-item] is GSAP-risen: the idle life rides wrappers and inner spans */}
          <div className="life-bob w-16" style={life(-1.4, 6.6)}>
            <div
              data-lab-item
              aria-hidden="true"
              className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,#1a2a5e,#070b1e)] shadow-[0_18px_40px_-1rem_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.12)]"
            >
              <span className="font-display flex flex-col items-center leading-none text-[var(--neon-core)]">
                <span className="text-2xl">♠</span>
                <span className="mono mt-1 text-[0.625rem] tracking-[0.2em]">CGS</span>
              </span>
            </div>
          </div>
          <div className="life-float" style={life(-3.3, 8.2)}>
            <h2 data-lab-item className="h-card !text-[clamp(1.9rem,3.2vw,3rem)] max-w-[16ch]">
              The code behind the club.
            </h2>
          </div>
          <div className="life-float" style={life(-5.1, 7.1)}>
            <p data-lab-item className="body-muted max-w-[34ch] text-[max(1.05rem,1.0625rem)]">
              Hand evaluators, equity math, solvers — typed as you scroll.
            </p>
          </div>
          <p data-lab-item className="font-display text-[clamp(1.4rem,2.4vw,2.2rem)] font-[640] leading-tight">
            <span
              className="life-shimmer inline-block text-transparent [background-clip:text] [background-image:linear-gradient(90deg,#e8fbff,#7a9dff)] [-webkit-background-clip:text]"
              style={life(-2.4, 7)}
            >
              Evaluate. Simulate. Solve.
            </span>
          </p>
          <p data-lab-item className="font-display text-[clamp(1.4rem,2.4vw,2.2rem)] font-[640] leading-tight">
            <span
              className="life-shimmer inline-block text-transparent [background-clip:text] [background-image:linear-gradient(90deg,#e8fbff,#7a9dff)] [-webkit-background-clip:text]"
              style={life(-5.5, 8.4)}
            >
              Weekly study nights.
            </span>
          </p>
        </div>
      </div>

      {/* The laptop: off the right edge on purpose; below the copy on phones */}
      <div
        ref={laptop}
        aria-hidden="true"
        className="pointer-events-none relative mx-auto mt-10 w-[94vw] md:absolute md:left-[44%] md:top-1/2 md:mt-0 md:w-[80vw] md:max-w-[73.75rem] md:-translate-y-1/2"
      >
        {/* The laptop is GSAP-dollied (scale/x); the idle float rides its frame */}
        <div className="life-float" style={life(-2.8, 8.6)}>
          <div className="rounded-[1.375rem] border border-[rgba(201,205,214,0.18)] bg-[#0b0e18] p-[1.4%] shadow-[0_60px_120px_-2.5rem_rgba(0,0,0,0.85)]">
            <div className="overflow-hidden rounded-[0.75rem] bg-[#0d1220]">
              {/* The equity Monte Carlo types through the first half of the pin… */}
              <CodePanel
                trigger={root}
                lines={POT_EQUITY}
                title="equity.ts — cornellcgs"
                mode="ts"
                start="top top"
                end="+=260%"
                from={0.1}
                to={0.56}
                small={{ trigger: laptop, start: 'top 85%', end: 'bottom 35%', from: 0.02, to: 0.5 }}
                className="!rounded-none !border-0 !shadow-none"
              />
              {/* …then the terminal runs the repo through the second */}
              <CodePanel
                trigger={root}
                lines={SHELL}
                title="zsh — cornellcgs"
                mode="sh"
                start="top top"
                end="+=260%"
                from={0.58}
                to={0.95}
                small={{ trigger: laptop, start: 'top 85%', end: 'bottom 35%', from: 0.52, to: 0.97 }}
                className="!rounded-none !border-0 !border-t !border-t-[rgba(201,205,214,0.1)] !bg-[#080b14] !shadow-none"
              />
            </div>
          </div>
          <div className="mx-[3%] h-[0.625rem] rounded-b-[0.875rem] bg-[linear-gradient(to_bottom,#1a1f2e,#080b14)]" />
        </div>
      </div>
    </section>
  )
}
