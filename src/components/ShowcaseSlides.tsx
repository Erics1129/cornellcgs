import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import CodePanel, { type CodePanelHandle } from './CodePanel'
import { POT_EQUITY } from '../effects/codeSnippets'
import { chapterType } from '../lib/chapterType'
import '../styles/showcase-motion.css'

gsap.registerPlugin(ScrollTrigger)

const STATS = [
  { over: 'The deck', big: '108 cards', under: 'two decks, jokers included' },
  { over: 'Four players', big: '2 teams', under: 'partners across the table' },
  { over: 'The match', big: '2 → A', under: 'win rounds to climb the levels' },
]

/** An unpinned editorial sequence: each figure clears its own baseline. */
export function StatsSlide() {
  const root = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const section = root.current
    if (!section) return
    const media = gsap.matchMedia(section)
    media.add('(prefers-reduced-motion: no-preference)', () => {
      section.querySelectorAll<HTMLElement>('[data-stat]').forEach((row, i) => {
        const glyphs = row.querySelectorAll('[data-stat-glyph]')
        const copy = row.querySelectorAll('[data-stat-copy]')
        gsap.set(glyphs, { yPercent: 110 })
        gsap.set(copy, { opacity: 0, y: 8 })
        const tl = gsap.timeline({ scrollTrigger: {
          id: `support-stat-${i}`, trigger: row, start: 'top 88%', end: 'center 62%', scrub: 0.3,
        } })
        tl.fromTo(row.querySelector('[data-stat-rule]'), { scaleX: 0 }, { scaleX: 1, duration: 0.8, ease: 'power2.out' }, 0)
          .to(glyphs, {
            yPercent: 0, duration: 0.6, stagger: 0.035, ease: 'power3.out',
          }, 0.06)
          .to(copy, { opacity: 1, y: 0, duration: 0.32, stagger: 0.06, ease: 'none' }, 0.3)
      })
    })
    return () => media.revert()
  }, [])
  return (
    <section ref={root} id="stats" className="section support-scene stats-scene" data-chapter-surface="world" aria-label="Throwing Eggs rules">
      <div className="container-site">
        {STATS.map((stat) => (
          <div key={stat.big} data-stat className="stat-row">
            <div data-stat-rule className="stat-rule" aria-hidden="true" />
            <p data-stat-copy className="stat-over">{stat.over}</p>
            <p data-chapter-type="rise" className="stat-big" aria-label={stat.big === '2 → A' ? 'Two through Ace' : stat.big}>
              <span aria-hidden="true">{stat.big.split('').map((char, i) => (
                <span key={i} className="stat-glyph-mask"><span data-stat-glyph>{char === ' ' ? '\u00a0' : char}</span></span>
              ))}</span>
            </p>
            <p data-stat-copy className="stat-under">{stat.under}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

// Executable shell commands, with a continuation to keep the URL readable.
// No invented terminal output or commands queued behind a foreground server.
const SHELL = [
  'git clone \\',
  '  https://github.com/Erics1129/cornellcgs.git',
  'cd cornellcgs',
  'npm install',
  'npm run dev',
]
const windowProgress = (progress: number, from: number, to: number) =>
  Math.max(0, Math.min(1, (progress - from) / (to - from)))

export function CodeSlide() {
  const root = useRef<HTMLElement>(null)
  const laptop = useRef<HTMLDivElement>(null)
  const editor = useRef<CodePanelHandle>(null)
  const terminal = useRef<CodePanelHandle>(null)

  useLayoutEffect(() => {
    const section = root.current
    const device = laptop.current
    if (!section || !device) return
    const media = gsap.matchMedia(section)
    media.add({
      all: 'all',
      motion: '(prefers-reduced-motion: no-preference)',
      desktop: '(min-width: 900px) and (min-height: 680px)',
    }, (context) => {
      const desktop = !!context.conditions?.desktop
      if (!context.conditions?.motion) {
        editor.current?.setProgress(1, false)
        terminal.current?.setProgress(1, false)
        editor.current?.rewindViewport()
        terminal.current?.rewindViewport()
        return
      }
      const playhead = { progress: 0 }
      const draw = () => {
        editor.current?.setProgress(windowProgress(playhead.progress, desktop ? 0.12 : 0, desktop ? 0.67 : 0.55))
        terminal.current?.setProgress(windowProgress(playhead.progress, desktop ? 0.7 : 0.52, 0.94))
      }
      const tl = gsap.timeline({
        onUpdate: draw,
        scrollTrigger: {
          id: 'support-code', trigger: desktop ? section : device,
          start: desktop ? 'top top' : 'top 85%',
          end: desktop ? '+=165%' : 'bottom 70%',
          pin: desktop, scrub: 0.28, anticipatePin: 1, invalidateOnRefresh: true,
          onRefresh: draw,
        },
      })
      // The sole clock for both panels: seeks and reversals write exact
      // characters rather than starting timers or a second scroll range.
      tl.to(playhead, { progress: 1, duration: 1, ease: 'none' }, 0)
      if (desktop) {
        const copy = section.querySelectorAll('[data-code-copy]')
        gsap.set(copy, { opacity: 0, y: 16 })
        chapterType(tl, section.querySelector('[data-chapter-type]'), 'slide', 0, 0.26)
        tl.fromTo(device, { x: 90, y: 28, rotationY: -14, rotationX: 5 }, {
          x: 0, y: 0, rotationY: 0, rotationX: 0, duration: 0.32, ease: 'power2.out',
        }, 0)
          .to(copy, {
            opacity: 1, y: 0, duration: 0.22, stagger: 0.045, ease: 'power2.out',
          }, 0)
          .fromTo(section.querySelector('[data-screen-reflection]'), { xPercent: -80, opacity: 0.5 }, {
            xPercent: 125, opacity: 0, duration: 0.4, ease: 'none',
          }, 0)
      }
      // On small screens the copy arrives before the laptop. It needs its own
      // unpinned entrance; the typing clock still belongs solely to the device.
      if (!desktop) {
        const copy = section.querySelector<HTMLElement>('.code-copy')!
        const captions = copy.querySelectorAll('[data-code-copy]')
        gsap.set(captions, { opacity: 0, y: 10 })
        const entrance = gsap.timeline({ scrollTrigger: {
          id: 'support-code-copy', trigger: copy, start: 'top 90%', end: 'top 62%', scrub: 0.2,
        } })
        chapterType(entrance, copy.querySelector('[data-chapter-type]'), 'slide', 0, 0.35)
        entrance.to(captions, {
          opacity: 1, y: 0, duration: 0.25, stagger: 0.05, ease: 'power2.out',
        }, 0.1)
      }
      draw()
    })
    return () => media.revert()
  }, [])

  return (
    <section ref={root} id="code" className="section support-scene code-scene" data-chapter-surface="world" aria-labelledby="code-title">
      <div className="container-site code-layout">
        <div className="code-copy">
          <p data-code-copy className="code-eyebrow">Behind the game</p>
          <h2 id="code-title" data-chapter-type="slide" className="h-section">Source</h2>
          <p data-code-copy className="body-muted support-lead">Hand evaluators, equity math, solvers.</p>
        </div>
        <div className="code-device-stage">
          <div ref={laptop} className="code-laptop code-workspace">
            <div className="code-workspace-titlebar">
              <span className="code-window-lights" aria-hidden="true"><i /><i /><i /></span>
              <span className="code-workspace-project"><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 4.5h4l1.5 1.5H14v7H2zM2 4.5V3h4l1.5 1.5H14V6" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>cornellcgs</span>
              <span className="code-workspace-branch"><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="4" cy="3" r="1.5" stroke="currentColor" /><circle cx="12" cy="4" r="1.5" stroke="currentColor" /><circle cx="4" cy="13" r="1.5" stroke="currentColor" /><path d="M4 4.5v7M12 5.5v1A3.5 3.5 0 0 1 8.5 10H4" stroke="currentColor" /></svg>main</span>
            </div>
              <div className="code-screen">
                <CodePanel ref={editor} lines={POT_EQUITY} title="equity.ts" mode="ts" />
                <CodePanel ref={terminal} lines={SHELL} title="zsh — cornellcgs" mode="sh" />
                <div data-screen-reflection className="code-screen-reflection" aria-hidden="true" />
              </div>
            <div className="code-workspace-footnote"><span>Monte Carlo equity</span><span>TypeScript <span aria-hidden="true">·</span> UTF-8</span></div>
          </div>
        </div>
      </div>
    </section>
  )
}
