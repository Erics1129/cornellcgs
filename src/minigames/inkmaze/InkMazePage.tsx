/**
 * /minigames/inkMaze/: the Ink Maze page.
 *
 * Sits in the same frame as the info pages (MinigameShell) and wires the game
 * together: the rules come from engine.ts via session.ts, keys and swipes from
 * input.ts, sound from sound.ts. This component only holds the session and
 * forwards moves; it never decides what a move does.
 *
 * Two views can draw the board (view.ts). The 2D canvas (render.ts) draws
 * from the first frame, so the game is playable at once. Unless the browser
 * cannot run it or asks to save data, the 3D Unity build (unity.ts) loads in
 * the background into a second canvas; once it is ready and the ball is at
 * rest, it takes over the board. If it fails at any point, the 2D canvas
 * comes back showing the same position. `data-renderer` on the stage says
 * which view is showing.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { minigames, site } from '../../content'
import { pagePath } from '../../lib/router'
import MinigameShell from '../MinigameShell'
import { LEVELS } from './levels'
import { blocksLeft, floorCount } from './engine'
import type { Direction } from './engine'
import { createSession, current, inkUsed, movesUsed, play, restart, sessionStatus, undo } from './session'
import type { Session } from './session'
import { InkMazeRenderer, boardAspect } from './render'
import { UnityInkMaze, unityAllowed } from './unity'
import type { InkMazeView, ViewEvent } from './view'
import { createInkMazeSound } from './sound'
import type { InkMazeSound } from './sound'
import { loadArt } from './assets'
import { attachInput } from './input'
import { beats, loadBests, recordWin } from './progress'
import type { Bests } from './progress'
import '../../styles/ink-maze.css'

const copy = minigames.inkMaze

const ARROWS: Array<{ direction: Direction; label: string; glyph: string }> = [
  { direction: 'up', label: 'Roll up', glyph: '↑' },
  { direction: 'left', label: 'Roll left', glyph: '←' },
  { direction: 'down', label: 'Roll down', glyph: '↓' },
  { direction: 'right', label: 'Roll right', glyph: '→' },
]

/** the 3D board fades in over the 2D one (keep in step with ink-maze.css) */
const FADE_MS = 300
/** wait this long after the page appears before fetching the 3D build */
const UNITY_START_MS = 250
/**
 * On the 3D board the result waits for Unity's beat (the marble's hops after a
 * win, the pulses after a loss), so the player sees the moment first. The
 * sound and the announcement do not wait.
 */
const RESULT_DELAY_MS = { won: 700, lost: 450 } as const
const SOUND_KEY = 'cgs-inkmaze-sound-v1'
/** keys pressed during a roll wait their turn: up to this many, in order (more are dropped) */
const QUEUE_MAX = 2
/** the 3D board's start-up waits for the ball to rest and the browser to idle, but never longer than this */
const QUIET_WAIT_MS = 6000

type RendererName = 'canvas' | 'unity'
/** off: not tried here; loading; on: showing; failed: gave up, the 2D board stays */
type UnityPhase = 'off' | 'loading' | 'on' | 'failed'

/** ?level=3 opens level 3; anything else opens the first level not yet cleared. */
function startingLevel(bests: Bests): number {
  const asked = Number(new URLSearchParams(location.search).get('level'))
  if (Number.isInteger(asked) && asked >= 1 && asked <= LEVELS.length) return asked - 1
  const open = LEVELS.findIndex((level) => !bests[level.id])
  return open < 0 ? 0 : open
}

/** The saved sound choice, for the button's first render (sound.ts owns the setting). */
function soundStartsOn(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off'
  } catch {
    return true
  }
}

const parOf = (levelId: string) => LEVELS.find((level) => level.id === levelId)?.par

declare global {
  interface Window {
    /** dev server only: the showing view's recent events, for scripts/test-inkmaze-page.mjs */
    __inkMazeEvents?: Array<ViewEvent & { view: RendererName }>
  }
}

function SoundIcon({ on }: { on: boolean }) {
  return <svg className="im-button__icon" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
    <path d="M3.5 7.5h3l4-3.5v12l-4-3.5h-3z" fill="currentColor" />
    {on
      ? <path d="M13.2 7.2a4 4 0 0 1 0 5.6M15.4 5a7 7 0 0 1 0 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      : <path d="M13.5 7.5l4 5M17.5 7.5l-4 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
  </svg>
}

export default function InkMazePage() {
  const [bests, setBests] = useState<Bests>(() => loadBests())
  const [levelIndex, setLevelIndex] = useState(() => startingLevel(bests))
  const level = LEVELS[levelIndex]
  const [session, setSession] = useState<Session>(() => createSession(level))
  /** the result shown over the board once the ball has stopped */
  const [overlay, setOverlay] = useState<null | { kind: 'won' | 'lost'; newBest: boolean }>(null)
  const [announcement, setAnnouncement] = useState('')
  const [soundOn, setSoundOn] = useState(soundStartsOn)
  const [rendererName, setRendererName] = useState<RendererName>('canvas')
  const [unityPhase, setUnityPhase] = useState<UnityPhase>(() => (unityAllowed() ? 'loading' : 'off'))
  /** decided once, on the first render */
  const unityWanted = useRef(unityPhase !== 'off')

  const board = useRef<HTMLDivElement>(null)
  const flatCanvas = useRef<HTMLCanvasElement>(null)
  const unityCanvas = useRef<HTMLCanvasElement>(null)
  /** the 2D view: always there, drawing whenever it is the one showing */
  const flat = useRef<InkMazeRenderer | null>(null)
  /** the 3D view, while it is loading or showing */
  const unity = useRef<UnityInkMaze | null>(null)
  /** whichever view is showing: moves, undo and restart go to it */
  const view = useRef<InkMazeView | null>(null)
  const sound = useRef<InkMazeSound | null>(null)
  const reducedMotion = useRef(false)
  const sessionRef = useRef(session)
  sessionRef.current = session
  const rolling = useRef(false)
  /** moves pressed while the ball rolls, played in order once it stops (at most QUEUE_MAX) */
  const queued = useRef<Direction[]>([])
  /** true while undo, restart or a level change cuts a roll short */
  const interrupting = useRef(false)
  /** the 3D view became ready during a roll: it takes over once the ball stops */
  const takeOverWaiting = useRef(false)
  const hideFlatTimer = useRef(0)
  const nextButton = useRef<HTMLButtonElement>(null)
  const game = useRef<HTMLElement>(null) // the main area: keys roll the ball while focus is in it (or nowhere)
  /** the latest move handler, for a queued move to call once the ball stops */
  const moveRef = useRef<(direction: Direction) => void>(() => {})
  const retryButton = useRef<HTMLButtonElement>(null)
  /** a result waiting for the 3D board's beat, and how to show it at once */
  const resultTimer = useRef(0)
  const resultPending = useRef<(() => void) | null>(null)

  const state = current(session)
  const status = sessionStatus(session)
  const floors = useMemo(() => floorCount(state), [state.cells])
  const left = blocksLeft(state)
  const aspect = boardAspect(state.width, state.height)

  /** Events from the view that is showing go to the sound. */
  const viewEvent = useCallback((event: ViewEvent) => {
    if (import.meta.env.DEV) {
      const log = (window.__inkMazeEvents ??= [])
      log.push({ ...event, view: unity.current && view.current === unity.current ? 'unity' : 'canvas' })
      if (log.length > 200) log.splice(0, log.length - 200)
    }
    // a knock (and the little movement before it) with no roll going is a
    // bump, which move() already sounded; the 3D board reports both
    if ((event.type === 'impact' || event.type === 'roll') && !rolling.current) return
    sound.current?.event(event)
  }, [])

  /** The 3D view takes the board, once the ball is at rest. */
  const takeOver = useCallback(() => {
    const u = unity.current
    if (!u) return
    if (rolling.current) { takeOverWaiting.current = true; return }
    takeOverWaiting.current = false
    u.show(current(sessionRef.current))
    view.current = u
    performance.mark?.('inkmaze:unity-on') // how long the 3D board took, for anyone measuring
    setRendererName('unity')
    setUnityPhase('on')
    clearTimeout(hideFlatTimer.current)
    // the 2D board stays underneath while the 3D one fades in, then rests
    hideFlatTimer.current = window.setTimeout(() => {
      if (view.current === u) flat.current?.setActive(false)
    }, reducedMotion.current ? 0 : FADE_MS + 50)
  }, [])

  /** Forget a result still waiting for the 3D board's beat (undo, restart and a new level make it moot). */
  const dropResult = useCallback(() => {
    clearTimeout(resultTimer.current)
    resultTimer.current = 0
    resultPending.current = null
  }, [])

  /** Show a result now on the 2D board, or after the 3D board's beat. */
  const showResult = useCallback((kind: 'won' | 'lost', show: () => void) => {
    dropResult()
    const u = unity.current
    if (!u || view.current !== u || reducedMotion.current) { show(); return }
    resultPending.current = show
    resultTimer.current = window.setTimeout(() => {
      resultTimer.current = 0
      resultPending.current = null
      show()
    }, RESULT_DELAY_MS[kind])
  }, [dropResult])

  /** The 3D view failed: the 2D board comes back with the current position. */
  const fallBack = useCallback((reason: unknown) => {
    const u = unity.current
    if (!u) return
    // a result waiting for the 3D board's beat shows now, on the 2D board
    const pending = resultPending.current
    dropResult()
    pending?.()
    unity.current = null
    takeOverWaiting.current = false
    clearTimeout(hideFlatTimer.current)
    const f = flat.current
    if (view.current === u && f) {
      view.current = f
      f.setActive(true)
      f.show(current(sessionRef.current))
      // a roll the 3D view had going ends now; a queued move then plays on the 2D board
      u.finish()
    }
    u.destroy()
    setRendererName('canvas')
    setUnityPhase('failed')
    const message = reason instanceof Error ? reason.message : String(reason)
    // no build on this server is ordinary (a fresh checkout); anything else is worth a warning
    if (/^no Unity build/.test(message)) console.info(`Ink Maze: ${message}, so the 2D board stays.`)
    else console.warn(`Ink Maze: the 3D board stopped (${message}), so the 2D board is back.`)
  }, [dropResult])

  // a result still waiting when the page goes away is dropped with it
  useEffect(() => dropResult, [dropResult])

  // Reduced motion, now and when the setting changes (before the views start)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => {
      reducedMotion.current = query.matches
      flat.current?.setReducedMotion(query.matches)
      unity.current?.setReducedMotion(query.matches)
    }
    apply()
    query.addEventListener?.('change', apply)
    return () => query.removeEventListener?.('change', apply)
  }, [])

  // The 2D view lives as long as the page; art arrives when it arrives
  useEffect(() => {
    if (!flatCanvas.current) return
    if (import.meta.env.DEV) window.__inkMazeEvents ??= []
    const r = new InkMazeRenderer(flatCanvas.current)
    flat.current = r
    view.current = r
    r.onEvent = (event) => { if (view.current === r) viewEvent(event) }
    r.setReducedMotion(reducedMotion.current)
    r.show(current(sessionRef.current))
    let alive = true
    loadArt().then((art) => { if (alive) r.setArt(art) })
    return () => {
      alive = false
      r.destroy()
      if (view.current === r) view.current = null
      flat.current = null
      // a roll that was going will not finish now; the next view starts at rest
      rolling.current = false
      queued.current = []
    }
  }, [viewEvent])

  /**
   * Starting Unity keeps the main thread busy for a moment (a few hundred ms
   * on a phone): wait until the 2D ball is at rest and the browser is idle,
   * and wait again if a roll starts in between (never past QUIET_WAIT_MS).
   */
  const whenQuiet = useCallback(() => new Promise<void>((resolve) => {
    const giveUpAt = performance.now() + QUIET_WAIT_MS
    const idle = (then: () => void) => {
      const w = window as Window & { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number }
      if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(then, { timeout: 2000 })
      else window.setTimeout(then, 80)
    }
    const check = () => {
      if (performance.now() >= giveUpAt) { resolve(); return }
      if (rolling.current) { window.setTimeout(check, 100); return }
      idle(() => {
        if (rolling.current && performance.now() < giveUpAt) window.setTimeout(check, 100)
        else resolve()
      })
    }
    check()
  }), [])

  // The 3D view loads in the background, a moment after the page appears
  useEffect(() => {
    if (!unityWanted.current) return
    let alive = true
    const start = window.setTimeout(() => {
      const canvas = unityCanvas.current
      if (!canvas) return
      const u = new UnityInkMaze()
      unity.current = u
      performance.mark?.('inkmaze:unity-load')
      u.onEvent = (event) => { if (view.current === u) viewEvent(event) }
      u.onFailure = (reason) => { if (alive) fallBack(reason) }
      u.setReducedMotion(reducedMotion.current)
      u.load(canvas, whenQuiet).then(
        () => { if (alive && unity.current === u) takeOver() },
        (error) => { if (alive && unity.current === u) fallBack(error) },
      )
    }, UNITY_START_MS)
    return () => {
      alive = false
      clearTimeout(start)
      clearTimeout(hideFlatTimer.current)
      const u = unity.current
      unity.current = null
      takeOverWaiting.current = false
      if (u) {
        if (view.current === u) view.current = flat.current
        u.destroy()
      }
      // back to where a fresh start would be (this matters only when the effect runs again)
      flat.current?.setActive(true)
      setRendererName('canvas')
      setUnityPhase((phase) => (phase === 'off' ? phase : 'loading'))
    }
    // runs once per mount: a failed load does not start another
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sound: it may only start after a click or a key press in the game
  useEffect(() => {
    const s = createInkMazeSound()
    sound.current = s
    setSoundOn(!s.muted)
    const wake = (event: Event) => {
      const target = event.target
      if (target === document.body || target === document.documentElement || (target instanceof Node && game.current?.contains(target))) s.unlock()
    }
    const types = ['pointerdown', 'pointerup', 'keydown'] as const
    for (const type of types) document.addEventListener(type, wake, true)
    return () => {
      for (const type of types) document.removeEventListener(type, wake, true)
      s.destroy()
      if (sound.current === s) sound.current = null
    }
  }, [])

  /** After the ball stops: the result, or a queued move. */
  const settle = useCallback((after: Session) => {
    rolling.current = false
    const quiet = interrupting.current
    if (!quiet && takeOverWaiting.current) takeOver()
    const result = sessionStatus(after)
    if (result !== 'playing') queued.current = [] // the level is over: keys pressed during the last roll are dropped
    if (result === 'won') {
      const run = { ink: inkUsed(after), moves: movesUsed(after) }
      const before = loadBests()[after.levelId]
      setBests(recordWin(after.levelId, run))
      if (quiet) return
      const newBest = beats(run, before)
      showResult('won', () => setOverlay({ kind: 'won', newBest }))
      setAnnouncement(`Level cleared with ${run.ink} ink in ${run.moves} moves.`)
      sound.current?.win(run.ink === parOf(after.levelId))
      return
    }
    if (quiet) return
    if (result === 'lost') {
      showResult('lost', () => setOverlay({ kind: 'lost', newBest: false }))
      setAnnouncement(`Out of ink with ${blocksLeft(current(after))} blocks left. Undo or restart.`)
      sound.current?.lose()
      return
    }
    const next = queued.current.shift()
    if (next) moveRef.current(next)
  }, [takeOver, showResult])

  const move = useCallback((direction: Direction) => {
    if (rolling.current) { if (queued.current.length < QUEUE_MAX) queued.current.push(direction); return } // moves wait their turn, in order
    const { session: after, result } = play(sessionRef.current, direction)
    if (after === sessionRef.current) {
      if (sessionStatus(after) === 'playing') {
        // a wall right there: a small knock, no ink spent
        view.current?.bump(direction)
        sound.current?.bump()
      }
      return
    }
    rolling.current = true
    sessionRef.current = after
    setSession(after)
    const now = current(after)
    setAnnouncement(`Rolled ${direction} ${result.cost} ${result.cost === 1 ? 'block' : 'blocks'}. ${now.ink} ink left, ${blocksLeft(now)} to color.`)
    sound.current?.rollStart(result.cost)
    view.current?.animate(result, () => settle(after))
  }, [settle])
  moveRef.current = move

  /** Undo, restart and a new level end any roll at once, with no result or sound for it. */
  const interrupt = useCallback(() => {
    queued.current = []
    dropResult()
    interrupting.current = true
    try {
      view.current?.finish()
    } finally {
      interrupting.current = false
      rolling.current = false
    }
  }, [dropResult])

  /** Shows a position at rest, then lets a waiting 3D view take over. */
  const showAtRest = useCallback((after: Session) => {
    view.current?.show(current(after))
    if (takeOverWaiting.current) takeOver()
  }, [takeOver])

  const takeBack = useCallback(() => {
    interrupt()
    const after = undo(sessionRef.current)
    if (after === sessionRef.current) return
    sessionRef.current = after
    setSession(after)
    setOverlay(null)
    showAtRest(after)
    sound.current?.undo()
    setAnnouncement('Move undone.')
  }, [interrupt, showAtRest])

  const startOver = useCallback(() => {
    interrupt()
    const after = restart(sessionRef.current)
    const changed = after !== sessionRef.current
    sessionRef.current = after
    setSession(after)
    setOverlay(null)
    showAtRest(after)
    if (changed) sound.current?.restart()
    setAnnouncement('Level restarted.')
  }, [interrupt, showAtRest])

  const openLevel = useCallback((index: number) => {
    interrupt()
    // a different board on the 3D view rises from the table and the marble drops onto it: a knock as it lands
    const u = unity.current
    const landing = !!u && view.current === u && !reducedMotion.current && LEVELS[index].id !== sessionRef.current.levelId
    const fresh = createSession(LEVELS[index])
    sessionRef.current = fresh
    setLevelIndex(index)
    setSession(fresh)
    setOverlay(null)
    showAtRest(fresh)
    sound.current?.level(landing)
    setAnnouncement(`Level ${index + 1}, ${LEVELS[index].name}.`)
    const url = new URL(location.href)
    url.searchParams.set('level', String(index + 1))
    history.replaceState(null, '', url)
  }, [interrupt, showAtRest])

  const toggleSound = useCallback(() => {
    const s = sound.current
    if (!s) return
    s.unlock()
    s.setMuted(!s.muted)
    setSoundOn(!s.muted)
  }, [])

  // Keys (while the game, or nothing in particular, has focus) and swipes on the board
  useEffect(() => {
    const frame = board.current
    if (!game.current || !frame) return
    const detach = attachInput(game.current, frame, { move, undo: takeBack, restart: startOver, toggleSound })
    frame.dataset.ready = 'true' // keys and swipes work from here on (tests wait for it)
    return () => { detach(); delete frame.dataset.ready }
  }, [move, takeBack, startOver, toggleSound])

  // The result's main action takes focus, so Enter continues
  useEffect(() => {
    if (overlay?.kind === 'won') nextButton.current?.focus({ preventScroll: true })
    if (overlay?.kind === 'lost') retryButton.current?.focus({ preventScroll: true })
  }, [overlay])

  const best = bests[level.id]
  const last = levelIndex === LEVELS.length - 1
  const used = inkUsed(session)
  const inkShare = state.ink / level.ink
  const moves = movesUsed(session)

  return <MinigameShell
    pageId="ink-maze"
    title={copy.title}
    back={{ href: pagePath('minigames'), label: 'Back to the mini games' }}
    skip={{ href: '#ink-maze-board', label: 'Skip to the game' }}
    className="subpage--ink-maze">

    <main ref={game} id="page-content" tabIndex={-1} className="sp-main im-main" aria-labelledby="page-title">
      <header className="sp-intro im-intro">
        <p className="sp-eyebrow">{copy.eyebrow} <span aria-hidden="true">·</span> {site.fullName}</p>
        <h1 id="page-title">{copy.title}</h1>
        <p className="sp-lead">{copy.lead}</p>
      </header>

      <section className="im-play" aria-label={`${copy.title}, level ${levelIndex + 1}`}>
          <dl className="im-hud">
            <div className="im-hud__ink">
              <dt>Ink</dt>
              <dd><strong>{state.ink}</strong><span> / {level.ink}</span></dd>
              <span className="im-inkbar" aria-hidden="true"><span style={{ transform: `scaleX(${Math.max(0, inkShare)})` }} data-low={inkShare <= 0.2 ? 'true' : undefined} /></span>
            </div>
            <div><dt>Moves</dt><dd><strong>{moves}</strong></dd></div>
            <div><dt>Blocks left</dt><dd><strong>{left}</strong></dd></div>
          </dl>

          <div className="im-stage" data-renderer={rendererName} data-unity={unityPhase}>
            <div
              id="ink-maze-board"
              ref={board}
              className="im-board"
              style={{ aspectRatio: String(aspect), '--im-aspect': String(aspect) } as CSSProperties}
              role="img"
              tabIndex={0}
              aria-label={`Level ${levelIndex + 1}, ${level.name}: a ${state.width} by ${state.height} board. ${floors - left} of ${floors} blocks colored, ${state.ink} ink left. Use the arrow keys or the roll buttons.`}>
              <canvas ref={flatCanvas} className="im-canvas im-canvas--flat" aria-hidden="true" />
              {(unityPhase === 'loading' || unityPhase === 'on') && <canvas ref={unityCanvas} id="ink-maze-unity" className="im-canvas im-canvas--unity" aria-hidden="true" tabIndex={-1} />}
            </div>
            {overlay && (
              <div className="im-result" data-kind={overlay.kind} role="dialog" aria-modal="false" aria-labelledby="im-result-title">
                {overlay.kind === 'won' ? <>
                  <p className="im-result__eyebrow">Level {levelIndex + 1}</p>
                  <h2 id="im-result-title">Level cleared</h2>
                  <p className="im-result__stats">
                    You used {used} ink in {moves} {moves === 1 ? 'move' : 'moves'}.{' '}
                    {used === level.par ? 'That is the least this level needs.' : `It can be done with ${level.par} ink.`}
                  </p>
                  {overlay.newBest && <p className="im-result__badge">New best</p>}
                  <div className="im-result__actions">
                    {last
                      ? <button ref={nextButton} type="button" className="im-button im-button--primary" onClick={() => openLevel(0)}>Back to level 1</button>
                      : <button ref={nextButton} type="button" className="im-button im-button--primary" onClick={() => openLevel(levelIndex + 1)}>Next level <span aria-hidden="true">→</span></button>}
                    <button type="button" className="im-button" onClick={startOver}>Play again</button>
                  </div>
                </> : <>
                  <p className="im-result__eyebrow">Out of ink</p>
                  <h2 id="im-result-title">{left} {left === 1 ? 'block' : 'blocks'} left</h2>
                  <p className="im-result__stats">Undo your last move or restart the level.</p>
                  <div className="im-result__actions">
                    <button ref={retryButton} type="button" className="im-button im-button--primary" onClick={takeBack}>Undo last move</button>
                    <button type="button" className="im-button" onClick={startOver}>Restart</button>
                  </div>
                </>}
              </div>
            )}
          </div>

          <div className="im-controls">
            <div className="im-actions">
              <button type="button" className="im-button" onClick={takeBack} disabled={moves === 0} aria-keyshortcuts="Z">
                <span aria-hidden="true">↶</span> Undo
              </button>
              <button type="button" className="im-button" onClick={startOver} disabled={moves === 0} aria-keyshortcuts="R">
                <span aria-hidden="true">↻</span> Restart
              </button>
              <button type="button" className="im-button im-button--sound" onClick={toggleSound} aria-pressed={soundOn} aria-keyshortcuts="M">
                <SoundIcon on={soundOn} /> {soundOn ? 'Sound on' : 'Sound off'}
              </button>
            </div>
            <div className="im-pad" role="group" aria-label="Roll the ball">
              {ARROWS.map((arrow) => (
                <button key={arrow.direction} type="button" className={`im-pad__key im-pad__key--${arrow.direction}`}
                  onClick={() => move(arrow.direction)} aria-label={arrow.label} disabled={status !== 'playing'}>
                  <span aria-hidden="true">{arrow.glyph}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="im-hint">
            <span className="im-hint--keys">Arrow keys or <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to roll · <kbd>Z</kbd> undo · <kbd>R</kbd> restart · <kbd>M</kbd> sound</span>
            <span className="im-hint--touch">Swipe on the board to roll the ball</span>
          </p>
      </section>

        <aside className="im-side" aria-label="Levels and rules">
          <div className="im-level">
            <p className="sp-eyebrow">Level {levelIndex + 1} of {LEVELS.length}</p>
            <h2>{level.name}</h2>
            <p className="im-level__meta">{state.width} × {state.height} board <span aria-hidden="true">·</span> {level.ink} ink</p>
            <p className="im-level__note">
              {level.slack > 0 ? `The least it needs is ${level.par}, so you have ${level.slack} to spare.` : `You get ${level.ink} ink, exactly the least it needs, so there is none to spare.`}
            </p>
            <p className="im-level__best">{best ? `Your best: ${best.ink} ink in ${best.moves} moves${best.ink === level.par ? ', the least possible' : ''}` : 'Not cleared yet'}</p>
          </div>

          <nav className="im-levels" aria-label="Choose a level">
            <ol>
              {LEVELS.map((entry, index) => {
                const done = bests[entry.id]
                return <li key={entry.id}>
                  <button type="button" className="im-levels__item" onClick={() => openLevel(index)}
                    aria-current={index === levelIndex ? 'true' : undefined}
                    aria-label={`Level ${index + 1}, ${entry.name}${done ? `, best ${done.ink} ink` : ''}`}>
                    <span className="im-levels__number">{index + 1}</span>
                    <span className="im-levels__mark" aria-hidden="true" data-state={done ? (done.ink === entry.par ? 'perfect' : 'done') : 'open'} />
                  </button>
                </li>
              })}
            </ol>
          </nav>

          <div className="im-rules">
            <h2>How to play</h2>
            <ul>{copy.rules.map((rule) => <li key={rule}>{rule}</li>)}</ul>
          </div>
        </aside>
      <p className="sp-sr-only" role="status" aria-live="polite">{announcement}</p>
    </main>
  </MinigameShell>
}
