import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import CodePanel, { type CodePanelHandle } from './CodePanel'
import { POT_EQUITY } from '../effects/codeSnippets'
import '../styles/showcase-motion.css'

gsap.registerPlugin(ScrollTrigger)

const STATS = [
  { over: 'Every Throwing Eggs deck', big: '108 cards', under: 'two decks, jokers in' },
  { over: 'Four players', big: '2 teams', under: 'partners across the table' },
  { over: 'Ezra Cornell', big: 'Any person', under: 'any study.' },
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
        const tl = gsap.timeline({ scrollTrigger: {
          id: `support-stat-${i}`, trigger: row, start: 'top 88%', end: 'center 62%', scrub: 0.3,
        } })
        tl.fromTo(row.querySelector('[data-stat-rule]'), { scaleX: 0 }, { scaleX: 1, duration: 0.8, ease: 'power2.out' }, 0)
          .fromTo(row.querySelectorAll('[data-stat-glyph]'), { yPercent: 110, rotation: 3 }, {
            yPercent: 0, rotation: 0, duration: 0.6, stagger: 0.035, ease: 'power3.out',
          }, 0.06)
          .fromTo(row.querySelectorAll('[data-stat-copy]'), { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.32, stagger: 0.06, ease: 'none' }, 0.3)
      })
    })
    return () => media.revert()
  }, [])
  return (
    <section ref={root} id="stats" className="section support-scene stats-scene" aria-label="The numbers">
      <div className="container-site">
        {STATS.map((stat) => (
          <div key={stat.big} data-stat className="stat-row">
            <div data-stat-rule className="stat-rule" aria-hidden="true" />
            <p data-stat-copy className="stat-over">{stat.over}</p>
            <p className="stat-big" aria-label={stat.big}>
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
        tl.fromTo(device, { x: 90, y: 28, rotationY: -14, rotationX: 5 }, {
          x: 0, y: 0, rotationY: 0, rotationX: 0, duration: 0.32, ease: 'power2.out',
        }, 0)
          .fromTo(section.querySelectorAll('[data-code-copy]'), { opacity: 0, y: 16 }, {
            opacity: 1, y: 0, duration: 0.22, stagger: 0.045, ease: 'power2.out',
          }, 0)
          .fromTo(section.querySelector('[data-screen-reflection]'), { xPercent: -80, opacity: 0.5 }, {
            xPercent: 125, opacity: 0, duration: 0.4, ease: 'none',
          }, 0)
      }
      draw()
    })
    return () => media.revert()
  }, [])

  return (
    <section ref={root} id="code" className="section support-scene code-scene" aria-label="The code behind the club">
      <div className="container-site code-layout">
        <div className="code-copy">
          <div data-code-copy className="code-club-mark" aria-hidden="true">♠</div>
          <h2 data-code-copy className="h-section">The code<br />behind the club.</h2>
          <p data-code-copy className="body-muted support-lead">Hand evaluators, equity math, solvers — typed as you scroll.</p>
          <p data-code-copy className="code-tagline">Evaluate. Simulate. Solve.</p>
          <p data-code-copy className="code-study">Weekly study nights.</p>
        </div>
        <div className="code-device-stage">
          <div ref={laptop} className="code-laptop">
            <div className="code-laptop-lid">
              <div className="code-camera" aria-hidden="true" />
              <div className="code-screen">
                <CodePanel ref={editor} lines={POT_EQUITY} title="equity.ts" mode="ts" />
                <CodePanel ref={terminal} lines={SHELL} title="zsh — cornellcgs" mode="sh" />
                <div data-screen-reflection className="code-screen-reflection" aria-hidden="true" />
              </div>
            </div>
            <div className="code-laptop-base" aria-hidden="true"><span /></div>
          </div>
        </div>
      </div>
    </section>
  )
}
