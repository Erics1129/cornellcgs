/**
 * Ink Maze, the coding level (the level after the last board): write a
 * program that clears any board, LeetCode style.
 *
 * Left: the game screen (the game's own 2D board, HUD, a new random map,
 * playback speed and replay) above the problem (problem.ts). Right: the editor
 * (CodeMirror 6; Java, Python, JavaScript, C and C++; code kept per language
 * in this browser) and the console (Output, Result, Tests).
 *
 * Run sends the code and the map on screen to the sandbox (sandbox.ts);
 * Submit adds the hidden tests. The judge (problem.ts) plays the answers with
 * the engine, and the game screen plays the judged moves, so every run moves
 * the ball: a move into a wall bumps and stops with the error, an empty pot
 * shows the board out of ink, and code that does not compile, throws, runs
 * too long or breaks the harness shows a bug instead. An accepted submission
 * plays a quick montage of every board and marks the level cleared
 * (progress.ts).
 *
 * This file is a lazy chunk: CodeMirror, the problem and the sandbox load
 * only when the coding level opens, and a language's toolchain only when it
 * is picked (the sandbox fetches nothing before load()).
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { minigames } from '../../../content'
import { pagePath } from '../../../lib/router'
import MinigameShell from '../../MinigameShell'
import { recordWin, loadBests } from '../progress.ts'
import { CodeSandbox, sandboxSupport } from './sandbox.ts'
import { LANGUAGES, LANGUAGE_INFO, RUNTIME_INFO, runtimeFor } from './contract.ts'
import type { Language, RunKind, RunLanguage, RunResult, RuntimeId, SandboxState } from './contract.ts'
import { BoardGenerationError, HIDDEN_TESTS, PROBLEM, STARTER_CODE, judgeRun, randomBoard, submissionTests } from './problem.ts'
import type { Board } from './problem.ts'
import { CODE_LEVEL } from './ui/level.ts'
import { buildReport, testLabel } from './ui/report.ts'
import type { Report } from './ui/report.ts'
import { verdictMs } from './ui/playback.ts'
import type { Clip } from './ui/playback.ts'
import { loadPrefs, loadSource, savePrefs, saveSource } from './ui/storage.ts'
import type { Speed } from './ui/storage.ts'
import Editor from './ui/Editor.tsx'
import type { EditorHandle } from './ui/Editor.tsx'
import GameScreen from './ui/GameScreen.tsx'
import type { Banner, GameScreenHandle } from './ui/GameScreen.tsx'
import ProblemPanel from './ui/ProblemPanel.tsx'
import ConsolePanel from './ui/ConsolePanel.tsx'
import type { ConsoleTab, LastRun } from './ui/ConsolePanel.tsx'
import '../../../styles/ink-maze-code.css'

const copy = minigames.inkMaze
const IDLE: SandboxState = { phase: 'idle' }
const noSubscribe = () => () => {}

/** What each toolchain is called while it loads: "Loading Java compiler (4.3 MB)" */
const TOOLCHAIN: Record<RuntimeId, string> = {
  java: 'Java compiler',
  python: 'Python',
  javascript: 'JavaScript engine',
  clang: 'C and C++ compiler',
  echo: 'echo test runtime',
}

const ECHO_STARTER = '# the echo test runtime: one command per line (see public/minigames/ink-maze-code/echo/runtime.js)\nsolve\n'
const starterFor = (language: RunLanguage) => (language === 'echo' ? ECHO_STARTER : STARTER_CODE[language])

/** Dev server only: ?codeRuntime=echo lists the echo test runtime (scripts/test-inkmaze-code-page.mjs). */
const echoListed = () => import.meta.env.DEV && new URLSearchParams(location.search).get('codeRuntime') === 'echo'

/** a download size: '600 KB', '4.3 MB', '23 MB' */
const mb = (bytes: number) => (bytes < 1_000_000 ? `${Math.max(1, Math.round(bytes / 1000))} KB` : `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`)

/** Speeds for the montage: each board takes about this long. */
const MONTAGE_BOARD_MS = 420

function newSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff)
}

/** The map for a seed; a seed that yields none (it does not happen in practice) moves on to the next. */
function boardFor(seed: number): { seed: number; board: Board } {
  for (let s = seed, tries = 0; tries < 20; s = (s + 1) % 0x7fffffff, tries++) {
    try {
      return { seed: s, board: randomBoard(s) }
    } catch (error) {
      if (!(error instanceof BoardGenerationError)) throw error
    }
  }
  return { seed, board: randomBoard(1) }
}

/** ?seed=123 pins the map (tests and shared links); otherwise the saved one, or a new one. */
function startingSeed(saved: number | null): number {
  const asked = Number(new URLSearchParams(location.search).get('seed'))
  if (Number.isInteger(asked) && asked >= 0 && new URLSearchParams(location.search).has('seed')) return asked
  return saved ?? newSeed()
}

function useMedia(query: string): boolean {
  const subscribe = useCallback((notify: () => void) => {
    const list = window.matchMedia(query)
    list.addEventListener?.('change', notify)
    return () => list.removeEventListener?.('change', notify)
  }, [query])
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches)
}

declare global {
  interface Window {
    /** dev server only: the coding level's editor and sandbox, for scripts/test-inkmaze-code-page.mjs */
    __inkCodeLevel?: { editor: EditorHandle | null; sandbox: CodeSandbox | null; board: () => Board; seed: () => number; runs: () => number; last: () => LastRun | null }
  }
}

type Props = {
  /** this level's number (one past the last board level) */
  number: number
  /** how many board levels there are */
  levelCount: number
  /** back to the board levels */
  onLeave: () => void
}

export default function CodeLevel({ number, levelCount, onLeave }: Props) {
  const prefs = useMemo(loadPrefs, [])
  const withEcho = useMemo(echoListed, [])
  const languages: RunLanguage[] = withEcho ? [...LANGUAGES, 'echo'] : [...LANGUAGES]
  const [language, setLanguage] = useState<RunLanguage>(() => (withEcho ? 'echo' : prefs.language))
  const [speed, setSpeed] = useState<Speed>(prefs.speed)
  const [{ seed, board }, setMap] = useState(() => boardFor(startingSeed(prefs.seed)))
  const [sandbox, setSandbox] = useState<CodeSandbox | null>(null)
  const sandboxState = useSyncExternalStore(sandbox?.subscribe ?? noSubscribe, () => sandbox?.state ?? IDLE)
  const [, setLoadTick] = useState(0)
  const [retry, setRetry] = useState(0)
  const [busy, setBusy] = useState<RunKind | null>(null)
  const busyRef = useRef<RunKind | null>(null)
  const [last, setLast] = useState<LastRun | null>(null)
  const [tab, setTab] = useState<ConsoleTab>('result')
  const [banner, setBanner] = useState<Banner | null>(null)
  const [playing, setPlaying] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [cleared, setCleared] = useState(() => !!loadBests()[CODE_LEVEL.id])
  const [cursor, setCursor] = useState({ line: 1, column: 1 })
  const [saved, setSaved] = useState(true)
  const phone = useMedia('(max-width: 760px)')
  const phoneRef = useRef(phone)
  phoneRef.current = phone
  const [problemCollapsed, setProblemCollapsed] = useState(() => window.matchMedia('(max-width: 760px)').matches)
  const [leftShare, setLeftShare] = useState(44)
  const [consoleShare, setConsoleShare] = useState(36)

  const editor = useRef<EditorHandle>(null)
  const screen = useRef<GameScreenHandle>(null)
  const main = useRef<HTMLElement>(null)
  const right = useRef<HTMLDivElement>(null)
  const alive = useRef(true)
  /** finished runs, for the dev hook */
  const runCount = useRef(0)
  const lastRef = useRef<LastRun | null>(null)
  lastRef.current = last
  const saveTimer = useRef(0)
  const pendingSave = useRef<{ language: RunLanguage; source: string } | null>(null)
  const support = useMemo(sandboxSupport, [])

  // the sandbox lives as long as the level; nothing is fetched until load()
  useEffect(() => {
    alive.current = true
    const sb = new CodeSandbox()
    setSandbox(sb)
    return () => {
      alive.current = false
      sb.dispose()
    }
  }, [])

  // the chosen language's toolchain loads as soon as the level opens or the language changes
  useEffect(() => {
    if (!sandbox || !support.ok) return
    let current = true
    sandbox.load(language).catch(() => { /* the status line says so; a run reports 'unavailable' */ })
      .finally(() => { if (current) setLoadTick((n) => n + 1) })
    return () => { current = false }
  }, [sandbox, language, retry, support.ok])

  useEffect(() => {
    savePrefs({ seed })
    // a pinned map (?seed=) follows New board, so a reload or a shared link shows the same one
    const url = new URL(location.href)
    if (url.searchParams.has('seed') && url.searchParams.get('seed') !== String(seed)) {
      url.searchParams.set('seed', String(seed))
      history.replaceState(null, '', url)
    }
  }, [seed])

  // dev server: hooks for the browser test
  useEffect(() => {
    if (!import.meta.env.DEV) return
    window.__inkCodeLevel = { editor: editor.current, sandbox, board: () => board, seed: () => seed, runs: () => runCount.current, last: () => lastRef.current }
  })
  useEffect(() => () => { if (import.meta.env.DEV) delete window.__inkCodeLevel }, [])

  // ------------------------------------------------------------- code, saved per language

  const flushSave = useCallback(() => {
    clearTimeout(saveTimer.current)
    const pending = pendingSave.current
    pendingSave.current = null
    if (pending) setSaved(saveSource(pending.language, pending.source, starterFor(pending.language)))
  }, [])

  const onChange = useCallback((lang: RunLanguage, source: string) => {
    pendingSave.current = { language: lang, source }
    clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(flushSave, 400)
  }, [flushSave])

  useEffect(() => {
    const away = () => flushSave()
    window.addEventListener('pagehide', away)
    return () => { window.removeEventListener('pagehide', away); flushSave() }
  }, [flushSave])

  const initialSource = useCallback((lang: RunLanguage) => loadSource(lang) ?? starterFor(lang), [])
  const onCursor = useCallback((line: number, column: number) => setCursor({ line, column }), [])

  const changeLanguage = (next: RunLanguage) => {
    if (busyRef.current || next === language) return
    flushSave()
    setLanguage(next)
    if (next !== 'echo') savePrefs({ language: next as Language })
    setAnnouncement(`${LANGUAGE_INFO[next].label}. ${loadSource(next) ? 'Your saved code is back.' : 'Starter code.'}`)
  }

  const resetCode = () => {
    editor.current?.setSource(starterFor(language))
    editor.current?.clearDiagnostics()
    editor.current?.focus()
    setAnnouncement('Back to the starter code. Undo (Ctrl+Z or Cmd+Z) brings your code back.')
  }

  // ------------------------------------------------------------- playing a result on the board

  const clipsFor = useCallback((report: Report, tests: readonly Board[], playSpeed: Speed): Clip[] => {
    const clip = (i: number, s: number, gapMs: number): Clip => ({
      board: tests[i], index: i, label: testLabel(tests, i), name: tests[i].name, verdict: report.rows[i].verdict!, speed: s, gapMs,
    })
    if (report.montage) {
      return tests.map((_, i) => {
        const verdict = report.rows[i].verdict!
        const fast = Math.min(14, Math.max(2.5, verdictMs(verdict) / MONTAGE_BOARD_MS))
        return { ...clip(i, fast, 20), quiet: true }
      })
    }
    if (report.animate && report.rows[report.focus]?.verdict) return [clip(report.focus, playSpeed, Math.round(150 / playSpeed))]
    return []
  }, [])

  /** Plays a report on the game screen, then puts its line under the board. */
  const playReport = useCallback(async (report: Report, tests: readonly Board[], playSpeed: Speed) => {
    const s = screen.current
    if (!s) return
    setBanner(null)
    const clips = clipsFor(report, tests, playSpeed)
    if (!clips.length) {
      const focus = report.focus
      s.show(tests[focus], testLabel(tests, focus))
      setBanner({ tone: report.tone, text: report.banner })
      return
    }
    const finished = await s.play(clips, report.montage ? 160 : 600)
    if (finished && alive.current) setBanner({ tone: report.tone, text: report.banner })
  }, [clipsFor])

  const replay = () => {
    if (!last || busyRef.current) return
    void playReport(last.report, last.tests, speed)
  }

  /** the game screen skipped to the end of its playback: the result line shows now */
  const skip = () => {
    if (last) setBanner({ tone: last.report.tone, text: last.report.banner })
  }

  // ------------------------------------------------------------- Run and Submit

  const execute = useCallback(async (kind: RunKind) => {
    if (busyRef.current || !sandbox) return
    flushSave()
    const source = editor.current?.getSource() ?? ''
    const tests = kind === 'run' ? [board] : submissionTests(board)
    busyRef.current = kind
    setBusy(kind)
    screen.current?.show(board, 'Your map')
    setBanner(null)
    setTab('result')
    editor.current?.clearDiagnostics()
    setAnnouncement(kind === 'run' ? 'Running your code on the map.' : `Submitting: your map and ${HIDDEN_TESTS.length} hidden tests.`)
    let result: RunResult
    try {
      result = await sandbox.run({ language, source, tests, kind })
    } catch (error) {
      // only a malformed request rejects: a bug on this page, not in the player's code
      console.error(error)
      busyRef.current = null
      setBusy(null)
      setBanner({ tone: 'neutral', text: 'Something went wrong on this page. Reload it and try again.' })
      return
    }
    if (!alive.current) return
    busyRef.current = null
    setBusy(null)
    const judgement = judgeRun(tests, result)
    const report = buildReport(kind, tests, result, judgement)
    const run: LastRun = { report, result, tests, stale: false }
    lastRef.current = run
    runCount.current++
    setLast(run)
    if (result.status === 'compile_error') editor.current?.showDiagnostics(result.diagnostics)
    else if (result.status === 'runtime_error' && result.error?.line) {
      editor.current?.showDiagnostics([{ line: result.error.line, column: result.error.column, severity: 'error', message: `${result.error.type}${result.error.message ? `: ${result.error.message}` : ''}` }])
    }
    setAnnouncement(`${report.title}. ${report.message}${report.accepted && kind === 'submit' ? ` Level ${number} cleared.` : ''}`)
    if (report.accepted && kind === 'submit') {
      const verdict = report.rows[0].verdict!
      recordWin(CODE_LEVEL.id, { ink: verdict.inkUsed, moves: verdict.steps.length })
      setCleared(true)
    }
    // on a phone the board is above the editor: bring it into view so the ball is seen to move
    if (phoneRef.current) {
      const box = main.current?.querySelector('.imc-screen')?.getBoundingClientRect()
      const bar = document.querySelector('.sp-bar')?.getBoundingClientRect().height ?? 0
      if (box && (box.top < bar || box.top > innerHeight * 0.5)) {
        window.scrollTo({ top: scrollY + box.top - bar - 8, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
      }
    }
    await playReport(report, tests, speed)
  }, [sandbox, board, language, speed, number, flushSave, playReport])

  const executeRef = useRef(execute)
  executeRef.current = execute
  const onRun = useCallback(() => { void executeRef.current('run') }, [])
  const onSubmit = useCallback(() => { void executeRef.current('submit') }, [])

  // Ctrl/Cmd+Enter and Ctrl/Cmd+Shift+Enter work anywhere on the level (the editor handles its own first)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== 'Enter' || !(event.ctrlKey || event.metaKey) || event.altKey) return
      event.preventDefault()
      void executeRef.current(event.shiftKey ? 'submit' : 'run')
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const stop = () => sandbox?.cancel()

  const newBoard = () => {
    if (busyRef.current) return
    screen.current?.stop()
    setBanner(null)
    const next = boardFor(newSeed())
    setMap(next)
    setLast((run) => (run ? { ...run, stale: true } : run))
    setAnnouncement(`A new ${next.board.grid.length} by ${next.board.grid[0].length} map with ${next.board.ink} ink.`)
  }

  const leave = () => {
    flushSave()
    screen.current?.stop()
    onLeave()
  }

  // ------------------------------------------------------------- the pane dividers

  const dragSplit = (axis: 'x' | 'y') => (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = (axis === 'x' ? main.current : right.current)?.getBoundingClientRect()
    if (!box) return
    event.preventDefault()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    const move = (e: PointerEvent) => {
      if (axis === 'x') setLeftShare(Math.min(66, Math.max(28, ((e.clientX - box.left) / box.width) * 100)))
      else setConsoleShare(Math.min(70, Math.max(16, ((box.bottom - e.clientY) / box.height) * 100)))
    }
    const up = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', up)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
    handle.addEventListener('pointercancel', up)
  }
  const keySplit = (axis: 'x' | 'y') => (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 8 : 3
    const delta = axis === 'x'
      ? (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0)
      : (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0)
    if (!delta) return
    event.preventDefault()
    if (axis === 'x') setLeftShare((v) => Math.min(66, Math.max(28, v + delta)))
    else setConsoleShare((v) => Math.min(70, Math.max(16, v + delta)))
  }

  // ------------------------------------------------------------- what to say about the toolchain

  const info = LANGUAGE_INFO[language]
  const runtimeId = runtimeFor(language)
  const runtime = sandbox?.runtimeInfo(language)
  const loading = sandboxState.phase === 'loading' && sandboxState.language === language ? sandboxState : null
  const total = loading?.total || RUNTIME_INFO[runtimeId].downloadBytes
  const percent = loading && loading.total && loading.done ? Math.min(100, Math.round((loading.done / loading.total) * 100)) : null
  // the runtime's own step ("Starting the compiler"), when it has said one
  const step = loading && loading.label !== `Loading ${info.label}` ? ` ${loading.label}` : ''
  const loadingText = `Loading ${TOOLCHAIN[runtimeId]} (${mb(total)})…${step}${percent !== null ? ` ${percent}%` : ''}`
  let status: { kind: 'loading' | 'ready' | 'failed' | 'idle' | 'unsupported'; text: string }
  if (!support.ok) status = { kind: 'unsupported', text: `This browser cannot run code here (it lacks ${support.missing.join(', ')}).` }
  else if (loading || runtime?.status === 'loading') status = { kind: 'loading', text: loadingText }
  else if (runtime?.status === 'failed') status = { kind: 'failed', text: `${info.label} could not be loaded.` }
  else if (runtime?.status === 'ready') status = { kind: 'ready', text: `${info.label} ready` }
  else status = { kind: 'idle', text: '' }

  let progress = ''
  if (busy) {
    const what = busy === 'run' ? 'your map' : `${HIDDEN_TESTS.length + 1} boards`
    switch (sandboxState.phase) {
      case 'loading': progress = loadingText; break
      case 'compiling': progress = info.runtime === 'python' || info.runtime === 'javascript' || info.runtime === 'echo' ? `Starting ${info.label}…` : `Compiling ${info.fileName}…`; break
      case 'running': progress = `Running on ${what} (time limit ${Math.round(sandboxState.timeLimitMs / 100) / 10} s)…`; break
      case 'restarting': progress = 'Restarting the sandbox…'; break
      default: progress = busy === 'run' ? 'Starting the run…' : 'Starting the submission…'
    }
  }

  const style = { '--imc-left': `${leftShare}%`, '--imc-console': `${consoleShare}%` } as CSSProperties

  return <MinigameShell
    pageId="ink-maze"
    title={`${copy.title}: ${PROBLEM.title}`}
    back={{ href: pagePath('minigames'), label: 'Back to the mini games' }}
    skip={{ href: '#ink-code-editor', label: 'Skip to the code editor' }}
    className="subpage--ink-maze subpage--ink-code">

    <main ref={main} id="page-content" tabIndex={-1} className="imc-main" aria-labelledby="imc-title" style={style} data-busy={busy ?? undefined}>
      <div className="imc-left">
        <header className="imc-head">
          <button type="button" className="imc-back" onClick={leave}><span aria-hidden="true">←</span> Levels 1–{levelCount}</button>
          <h1 id="imc-title" className="imc-head__title">
            <span className="imc-head__number">Level {number}</span>
            <span className="imc-head__name">{copy.title}: {PROBLEM.title}</span>
          </h1>
          <span className="imc-head__badge" data-cleared={cleared ? 'true' : 'false'}>{cleared ? 'Cleared' : 'Code it'}</span>
        </header>

        <GameScreen ref={screen} board={board} speed={speed}
          onSpeed={(s) => { setSpeed(s); savePrefs({ speed: s }) }}
          onNewBoard={newBoard} onReplay={replay} canReplay={!!last && !last.stale} busy={!!busy}
          banner={banner} onPlaying={setPlaying} onSkip={skip} />

        <div className="imc-left__scroll">
          <ProblemPanel language={language} board={board} collapsed={phone && problemCollapsed} onToggle={() => setProblemCollapsed((c) => !c)} />
        </div>
      </div>

      <div className="imc-split imc-split--x" role="separator" aria-orientation="vertical" aria-label="Resize the game and the editor"
        aria-valuemin={28} aria-valuemax={66} aria-valuenow={Math.round(leftShare)} tabIndex={0}
        onPointerDown={dragSplit('x')} onKeyDown={keySplit('x')} />

      <div ref={right} className="imc-right">
        <section className="imc-ide" aria-label="Code editor">
          <div className="imc-toolbar">
            <span className="imc-file" title={info.version}>{info.fileName}</span>
            <label className="imc-lang">
              <span className="sp-sr-only">Language</span>
              <select value={language} onChange={(e) => changeLanguage(e.target.value as RunLanguage)} disabled={!!busy} aria-label="Language">
                {languages.map((lang) => <option key={lang} value={lang}>{LANGUAGE_INFO[lang].label}</option>)}
              </select>
              <span aria-hidden="true" className="imc-lang__chevron">▾</span>
            </label>
            <button type="button" className="imc-btn imc-btn--ghost" onClick={resetCode} disabled={!!busy} title="Replace your code with the starter code (undo brings it back)">Reset</button>
            <div className="imc-run">
              {busy
                ? <button type="button" className="imc-btn imc-btn--stop" onClick={stop}><span aria-hidden="true">■</span> Stop</button>
                : <>
                    <button type="button" className="imc-btn imc-btn--run" onClick={onRun} aria-keyshortcuts="Control+Enter Meta+Enter" title="Run on the map (Ctrl/Cmd+Enter)">
                      <span aria-hidden="true">▶</span> Run
                    </button>
                    <button type="button" className="imc-btn imc-btn--submit" onClick={onSubmit} aria-keyshortcuts="Control+Shift+Enter Meta+Shift+Enter" title="Run on the map and the hidden tests (Ctrl/Cmd+Shift+Enter)">
                      Submit
                    </button>
                  </>}
            </div>
          </div>
          {(status.kind === 'loading' || status.kind === 'failed' || status.kind === 'unsupported') && (
            <div className="imc-loadline" data-kind={status.kind} role={status.kind === 'loading' ? undefined : 'alert'}>
              <span>{status.text}</span>
              {status.kind === 'loading' && <span className="imc-loadline__bar" aria-hidden="true"><span style={{ transform: `scaleX(${percent !== null ? percent / 100 : 0.08})` }} data-unknown={percent === null ? 'true' : undefined} /></span>}
              {status.kind === 'failed' && <>
                {runtime?.error && <span className="imc-loadline__why">{runtime.error}</span>}
                <button type="button" className="imc-link" onClick={() => setRetry((n) => n + 1)}>Try again</button>
              </>}
            </div>
          )}
          <div className="imc-editor" id="ink-code-editor" tabIndex={-1}>
            <Editor ref={editor} language={language} initialSource={initialSource} onChange={onChange} onCursor={onCursor} onRun={onRun} onSubmit={onSubmit} />
          </div>
          <p className="imc-statusbar">
            <span>{info.version}</span>
            <span>Ln {cursor.line}, Col {cursor.column}</span>
            <span>{saved ? 'Saved in this browser' : 'Not saved: this browser blocks storage'}</span>
            {status.kind === 'ready' && <span className="imc-statusbar__ready">{status.text}</span>}
            <span className="imc-statusbar__keys"><kbd>Esc</kbd> <kbd>Tab</kbd> leaves the editor</span>
          </p>
        </section>

        <div className="imc-split imc-split--y" role="separator" aria-orientation="horizontal" aria-label="Resize the editor and the console"
          aria-valuemin={16} aria-valuemax={70} aria-valuenow={Math.round(consoleShare)} tabIndex={0}
          onPointerDown={dragSplit('y')} onKeyDown={keySplit('y')} />

        <ConsolePanel tab={tab} onTab={setTab} last={last} progress={progress} onGoTo={(line, column) => editor.current?.goTo(line, column)} />
      </div>
      <p className="sp-sr-only" role="status" aria-live="polite">{announcement}</p>
    </main>
  </MinigameShell>
}
