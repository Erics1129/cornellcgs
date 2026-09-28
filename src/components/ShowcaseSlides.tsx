import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import CodePanel, { type CodePanelFrame, type CodePanelHandle } from './CodePanel'
import { POT_EQUITY } from '../effects/codeSnippets'
import { label, margin95, parse, potEquity, type Card, type Checkpoint } from '../solver/equity'
import { chapterType } from '../lib/chapterType'
import '../styles/showcase-motion.css'
import '../styles/code-ide.css'

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

// The terminal types one real command: package.json's `equity` script runs
// src/solver/equity.ts — the file in the editor — and prints exactly the
// lines drawn below it. Every number on this screen comes from that code.
const HAND = ['As', 'Ks']
const SHELL = [`npm run equity -- ${HAND.join(' ')}`]
const REPO = 'https://github.com/Erics1129/cornellcgs'
const RUN_BATCHES = 40
const RUN_BATCH = 500
const RUN_TOTAL = RUN_BATCHES * RUN_BATCH
const CHECKPOINT_EVERY = 10 // batches — one printed line per 5,000 deals, as the CLI prints
const RETURN_ROW = Math.max(0, POT_EQUITY.findIndex((line) => line.includes('return (win')))
const windowProgress = (progress: number, from: number, to: number) =>
  Math.max(0, Math.min(1, (progress - from) / (to - from)))
const pct = (x: number) => `${(x * 100).toFixed(1)}%`
const NUMBER = new Intl.NumberFormat('en-US')
const deals = (n: number) => NUMBER.format(n)
const handCards = HAND.map(parse)
const redSuit = (c: Card) => c.s === 1 || c.s === 2

/** A run computed in small slices so it never costs a frame. */
function computeRun(onDone: (run: Checkpoint[]) => void): () => void {
  const run: Checkpoint[] = []
  let sum = 0
  let cancelled = false
  // Batches run only while the browser says it has idle time to spare (one
  // batch is well under a millisecond). Safari has no requestIdleCallback:
  // there one batch runs per short timeout instead.
  type Deadline = { timeRemaining: () => number }
  const ric = (window as { requestIdleCallback?: (fn: (deadline: Deadline) => void, options?: { timeout: number }) => number }).requestIdleCallback
  const idle = (fn: (deadline?: Deadline) => void) => (ric ? ric.call(window, fn, { timeout: 2000 }) : window.setTimeout(fn, 16))
  const slice = (deadline?: Deadline) => {
    if (cancelled) return
    do {
      sum += potEquity(handCards, [], RUN_BATCH)
      run.push({ deals: (run.length + 1) * RUN_BATCH, equity: sum / (run.length + 1) })
    } while (run.length < RUN_BATCHES && deadline && deadline.timeRemaining() > 3)
    if (run.length < RUN_BATCHES) idle(slice)
    else onDone(run)
  }
  idle(slice)
  return () => { cancelled = true }
}

type Tree = { name: string; path: string; kind: 'dir' | 'ts' | 'js' | 'json'; depth: number; open?: boolean; active?: boolean }
const TREE: Tree[] = [
  { name: 'public', path: 'tree/main/public', kind: 'dir', depth: 0 },
  { name: 'scripts', path: 'tree/main/scripts', kind: 'dir', depth: 0, open: true },
  { name: 'equity.mjs', path: 'blob/main/scripts/equity.mjs', kind: 'js', depth: 1 },
  { name: 'src', path: 'tree/main/src', kind: 'dir', depth: 0, open: true },
  { name: 'components', path: 'tree/main/src/components', kind: 'dir', depth: 1 },
  { name: 'lib', path: 'tree/main/src/lib', kind: 'dir', depth: 1 },
  { name: 'solver', path: 'tree/main/src/solver', kind: 'dir', depth: 1, open: true },
  { name: 'equity.ts', path: 'blob/main/src/solver/equity.ts', kind: 'ts', depth: 2, active: true },
  { name: 'styles', path: 'tree/main/src/styles', kind: 'dir', depth: 1 },
  { name: 'package.json', path: 'blob/main/package.json', kind: 'json', depth: 0 },
]
const FILE_BADGE = { ts: 'TS', js: 'JS', json: '{ }', dir: '' } as const

export function CodeSlide() {
  const root = useRef<HTMLElement>(null)
  const laptop = useRef<HTMLDivElement>(null)
  const editor = useRef<CodePanelHandle>(null)
  const terminal = useRef<CodePanelHandle>(null)
  const output = useRef<HTMLDivElement>(null)
  const caretStatus = useRef<HTMLSpanElement>(null)
  const runStatus = useRef<HTMLSpanElement>(null)
  const summary = useRef<HTMLSpanElement>(null)
  // The run on screen: the scroll's own, or one the reader asked for with Run
  const runs = useRef<{ scroll: Checkpoint[] | null; manual: Checkpoint[] | null }>({ scroll: null, manual: null })
  const scrollOutput = useRef(0)
  const [rerunning, setRerunning] = useState(false)

  const outputNodes = useRef<Record<'banner' | 'head' | 'checkpoint' | 'final', HTMLElement[]> | null>(null)
  const lastOutput = useRef('')
  const lastRun = useRef<Checkpoint[] | null>(null)

  /** Draw the terminal's output for a share q of the run. */
  const drawOutput = useCallback((q: number) => {
    const box = output.current
    const device = laptop.current
    if (!box || !device) return
    const run = runs.current.manual ?? runs.current.scroll
    // Scrubbing calls this every frame: only a new batch, state or run redraws
    const reachedNow = Math.max(0, Math.min(RUN_BATCHES, Math.floor(q * RUN_BATCHES)))
    const stamp = `${run === runs.current.manual ? 'm' : 's'}${run ? run.length : 0}:${reachedNow}:${q <= 0 ? 0 : q > 0.03 ? q < 1 ? 2 : 3 : 1}:${box.clientWidth < 330 ? 'n' : 'w'}`
    if (stamp === lastOutput.current && run === lastRun.current) return
    lastOutput.current = stamp
    lastRun.current = run
    const nodes = (outputNodes.current ??= {
      banner: [...box.querySelectorAll<HTMLElement>('[data-out="banner"]')],
      head: [...box.querySelectorAll<HTMLElement>('[data-out="head"]')],
      checkpoint: [...box.querySelectorAll<HTMLElement>('[data-out="checkpoint"]')],
      final: [...box.querySelectorAll<HTMLElement>('[data-out="final"]')],
    })
    const shown = (name: keyof typeof nodes, on: boolean) => {
      for (const node of nodes[name]) node.dataset.shown = String(on)
    }
    shown('banner', q > 0)
    shown('head', q > 0.03)
    const state = q <= 0 ? 'idle' : q < 1 ? 'running' : 'done'
    if (device.dataset.run !== state) device.dataset.run = state
    if (!run) {
      shown('checkpoint', false); shown('final', false)
      return
    }
    const reached = Math.max(0, Math.min(RUN_BATCHES, Math.floor(q * RUN_BATCHES)))
    const current = reached > 0 ? run[reached - 1] : null
    const done = q >= 1
    // Like the CLI: printed lines stay, and the progress bar redraws on the
    // line below the last one printed until the run is done.
    const printed = Math.floor(reached / CHECKPOINT_EVERY)
    // Narrow phones get a shorter bar so the percentage never truncates
    const width = box.clientWidth < 330 ? 12 : 22
    const filled = Math.round((reached / RUN_BATCHES) * width)
    const bar = `${'█'.repeat(filled)}${'░'.repeat(width - filled)} ${deals(current?.deals ?? 0).padStart(6)} deals   ${current ? pct(current.equity) : '…'}`
    nodes.checkpoint.forEach((node, i) => {
      const at = (i + 1) * CHECKPOINT_EVERY
      const isPrinted = i < printed
      const isBar = !done && q > 0.03 && i === printed
      node.dataset.shown = String(isPrinted || isBar)
      node.dataset.live = String(isBar)
      const text = isPrinted ? `${deals(run[at - 1].deals).padStart(8)} deals   ${pct(run[at - 1].equity)}` : isBar ? bar : ''
      if (node.textContent !== text) node.textContent = text
    })
    const final = nodes.final[0]
    final.dataset.shown = String(done)
    const last = run[run.length - 1]
    if (done) {
      const text = `equity ${pct(last.equity)}  ±${pct(margin95(last.equity, last.deals))} (95%)`
      if (final.textContent !== text) final.textContent = text
    }
    // The value potEquity returns, shown where it returns it
    const value = done ? last : current
    editor.current?.setInlay(q > 0.03 && value ? `≈ ${value.equity.toFixed(3)}` : null)
    if (runStatus.current) {
      const text = state === 'idle' ? '' : done ? `✓ equity ${pct(last.equity)}` : `▶ equity.mjs · ${deals(current?.deals ?? 0)} deals`
      if (runStatus.current.textContent !== text) runStatus.current.textContent = text
    }
  }, [])

  /** What a screen reader hears for a finished run (the terminal itself is visual) */
  const announce = (run: Checkpoint[]) => {
    const last = run[run.length - 1]
    if (summary.current) summary.current.textContent = `Running npm run equity -- ${HAND.join(' ')}: ${HAND.join(' ')} against a random hand has ${pct(last.equity)} equity over ${deals(last.deals)} deals.`
  }

  // The scroll's run is computed once, when the chapter is a screen away
  useEffect(() => {
    const section = root.current
    if (!section) return
    let stop: (() => void) | null = null
    const io = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting || stop) return
      io.disconnect()
      stop = computeRun((run) => {
        runs.current.scroll = run
        announce(run)
        drawOutput(scrollOutput.current)
      })
    }, { rootMargin: '100% 0px' })
    io.observe(section)
    return () => { io.disconnect(); stop?.() }
  }, [drawOutput])

  const rerun = () => {
    if (rerunning) return
    setRerunning(true)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    computeRun((run) => {
      runs.current.manual = run
      announce(run)
      const t0 = performance.now()
      const DURATION = reduced ? 0 : 1600
      const step = (now: number) => {
        // Scrolling back past the command takes the terminal back mid-run
        if (runs.current.manual !== run) return setRerunning(false)
        const t = DURATION ? Math.min(1, (now - t0) / DURATION) : 1
        drawOutput(t)
        if (t < 1) requestAnimationFrame(step)
        else setRerunning(false)
      }
      requestAnimationFrame(step)
    })
  }

  const onEditorFrame = useCallback((frame: CodePanelFrame) => {
    const node = caretStatus.current
    if (node) node.textContent = `Ln ${frame.line}, Col ${frame.column}`
  }, [])

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
        scrollOutput.current = 1
        drawOutput(1)
        return
      }
      const [edit, type, out] = desktop
        ? [[0.06, 0.56], [0.58, 0.68], [0.7, 0.95]]
        : [[0, 0.48], [0.5, 0.6], [0.62, 0.94]]
      const playhead = { progress: 0 }
      let previousQ = 0
      const draw = () => {
        const p = playhead.progress
        editor.current?.setProgress(windowProgress(p, edit[0], edit[1]))
        terminal.current?.setProgress(windowProgress(p, type[0], type[1]))
        const q = windowProgress(p, out[0], out[1])
        scrollOutput.current = q
        // Rewinding back across the command hands the terminal to the scroll
        if (q <= 0 && previousQ > 0) runs.current.manual = null
        previousQ = q
        if (!runs.current.manual) drawOutput(q)
      }
      const tl = gsap.timeline({
        onUpdate: draw,
        scrollTrigger: {
          id: 'support-code', trigger: desktop ? section : device,
          start: desktop ? 'top top' : 'top 85%',
          end: desktop ? '+=190%' : 'bottom 90%',
          pin: desktop, scrub: 0.28, anticipatePin: 1, invalidateOnRefresh: true,
          onRefresh: draw,
        },
      })
      // The sole clock for every pane: seeks and reversals write exact
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
  }, [drawOutput])

  return (
    <section ref={root} id="code" className="section support-scene code-scene" data-chapter-surface="world" aria-labelledby="code-title">
      <div className="container-site code-layout">
        <div className="code-copy">
          <p data-code-copy className="code-eyebrow">Behind the game</p>
          <h2 id="code-title" data-chapter-type="slide" className="h-section">Source</h2>
          <p data-code-copy className="body-muted support-lead">Hand evaluators, equity math, solvers.</p>
          <a data-code-copy className="code-source-link" href={`${REPO}/blob/main/src/solver/equity.ts`} target="_blank" rel="noreferrer">
            <span>Real code. It runs.</span>
            <span className="showcase-sr-only"> Read src/solver/equity.ts on GitHub (opens a new tab)</span>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 11 11 5M6 5h5v5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </a>
        </div>
        <div className="code-device-stage">
          <div ref={laptop} className="code-laptop code-workspace ide" data-run="idle">
            <div className="code-workspace-titlebar ide-titlebar">
              <span className="code-window-lights" aria-hidden="true"><i /><i /><i /></span>
              <span className="ide-command" aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.3" /><path d="m10.2 10.2 3.3 3.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
                cornellcgs
              </span>
              <button type="button" className="ide-run" onClick={rerun} aria-disabled={rerunning || undefined}
                aria-label={`Run equity for ${HAND.join(' ')} again`}>
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.5v9l7-4.5z" fill="currentColor" /></svg>
                <span className="ide-run-label">Run</span>
              </button>
            </div>
            <div className="ide-body">
              <nav className="ide-explorer" aria-label="Project files on GitHub">
                <p className="ide-explorer-title">Explorer</p>
                <p className="ide-explorer-root">cornellcgs</p>
                <ul>
                  {TREE.map((item) => (
                    <li key={item.path} style={{ ['--depth' as string]: item.depth }}>
                      <a href={`${REPO}/${item.path}`} target="_blank" rel="noreferrer"
                        className="ide-tree-item" data-kind={item.kind} data-open={item.open ? 'true' : undefined}
                        aria-current={item.active ? 'true' : undefined}>
                        {item.kind === 'dir'
                          ? <svg className="ide-tree-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          : <span className="ide-tree-badge" aria-hidden="true">{FILE_BADGE[item.kind]}</span>}
                        <span>{item.name}</span>
                        <span className="showcase-sr-only"> (opens on GitHub)</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
              <div className="code-screen ide-main">
                <CodePanel ref={editor} lines={POT_EQUITY} title="equity.ts" mode="ts" minimap inlayRow={RETURN_ROW}
                  onFrame={onEditorFrame} extraTabs={['equity.mjs']} breadcrumb={['src', 'solver', 'equity.ts', 'potEquity']} />
                <div className="ide-dock">
                  <CodePanel ref={terminal} lines={SHELL} title="zsh — cornellcgs" mode="sh" />
                  <div ref={output} className="ide-output" aria-hidden="true">
                    <p data-out="banner" className="ide-out-dim">&gt; cornellcgs@0.1.0 equity</p>
                    <p data-out="banner" className="ide-out-dim">&gt; node scripts/equity.mjs {HAND.join(' ')}</p>
                    <p data-out="head">
                      {handCards.map((card, i) => (
                        <span key={i} className="ide-out-card" data-red={redSuit(card) ? 'true' : undefined}>{label(card)}</span>
                      ))}
                      <span className="ide-out-dim"> vs a random hand · preflop</span>
                    </p>
                    {Array.from({ length: RUN_BATCHES / CHECKPOINT_EVERY }, (_, i) => (
                      <p key={i} data-out="checkpoint" />
                    ))}
                    <p data-out="final" className="ide-out-final" />
                  </div>
                  <span ref={summary} className="showcase-sr-only" role="status" />
                </div>
                <div data-screen-reflection className="code-screen-reflection" aria-hidden="true" />
              </div>
            </div>
            <div className="code-workspace-footnote ide-status" aria-hidden="true">
              <span className="ide-status-branch">
                <svg viewBox="0 0 16 16" fill="none"><circle cx="4" cy="3" r="1.5" stroke="currentColor" /><circle cx="12" cy="4" r="1.5" stroke="currentColor" /><circle cx="4" cy="13" r="1.5" stroke="currentColor" /><path d="M4 4.5v7M12 5.5v1A3.5 3.5 0 0 1 8.5 10H4" stroke="currentColor" /></svg>
                main
              </span>
              <span className="ide-status-problems">⊘ 0  ⚠ 0</span>
              <span ref={runStatus} className="ide-status-run" />
              <span className="ide-status-right">
                <span ref={caretStatus}>Ln 1, Col 1</span>
                <span>Spaces: 2</span>
                <span>UTF-8</span>
                <span>TypeScript</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
