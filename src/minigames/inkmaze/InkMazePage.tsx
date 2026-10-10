/**
 * /minigames/inkMaze/: the Ink Maze page.
 *
 * Sits in the same frame as the info pages (MinigameShell) and wires the game
 * together: the rules come from engine.ts via session.ts, drawing from
 * render.ts, keys and swipes from input.ts. This component only holds the
 * session and forwards moves; it never decides what a move does.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { minigames, site } from '../../content'
import { pagePath } from '../../lib/router'
import MinigameShell from '../MinigameShell'
import { LEVELS } from './levels'
import { blocksLeft, floorCount } from './engine'
import type { Direction } from './engine'
import { createSession, current, inkUsed, movesUsed, play, restart, sessionStatus, undo } from './session'
import type { Session } from './session'
import { InkMazeRenderer, boardAspect } from './render'
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

/** ?level=3 opens level 3; anything else opens the first level not yet cleared. */
function startingLevel(bests: Bests): number {
  const asked = Number(new URLSearchParams(location.search).get('level'))
  if (Number.isInteger(asked) && asked >= 1 && asked <= LEVELS.length) return asked - 1
  const open = LEVELS.findIndex((level) => !bests[level.id])
  return open < 0 ? 0 : open
}

export default function InkMazePage() {
  const [bests, setBests] = useState<Bests>(() => loadBests())
  const [levelIndex, setLevelIndex] = useState(() => startingLevel(bests))
  const level = LEVELS[levelIndex]
  const [session, setSession] = useState<Session>(() => createSession(level))
  /** the result shown over the board once the ball has stopped */
  const [overlay, setOverlay] = useState<null | { kind: 'won' | 'lost'; newBest: boolean }>(null)
  const [announcement, setAnnouncement] = useState('')
  const [bump, setBump] = useState<Direction | null>(null)

  const canvas = useRef<HTMLCanvasElement>(null)
  const renderer = useRef<InkMazeRenderer | null>(null)
  const sessionRef = useRef(session)
  sessionRef.current = session
  const rolling = useRef(false)
  const queued = useRef<Direction | null>(null)
  const nextButton = useRef<HTMLButtonElement>(null)
  const game = useRef<HTMLElement>(null) // the main area: keys roll the ball while focus is in it (or nowhere)
  /** the latest move handler, for a queued move to call once the ball stops */
  const moveRef = useRef<(direction: Direction) => void>(() => {})
  const retryButton = useRef<HTMLButtonElement>(null)

  const state = current(session)
  const status = sessionStatus(session)
  const floors = useMemo(() => floorCount(state), [state.cells])
  const left = blocksLeft(state)

  // The renderer lives as long as the page; art arrives when it arrives
  useEffect(() => {
    if (!canvas.current) return
    const r = new InkMazeRenderer(canvas.current)
    renderer.current = r
    r.show(current(sessionRef.current))
    let alive = true
    loadArt().then((art) => { if (alive) r.setArt(art) })
    return () => { alive = false; r.destroy(); renderer.current = null }
  }, [])

  /** After the ball stops: a queued move, or the result. */
  const settle = useCallback((after: Session) => {
    rolling.current = false
    const result = sessionStatus(after)
    if (result === 'won') {
      const run = { ink: inkUsed(after), moves: movesUsed(after) }
      const before = loadBests()[after.levelId]
      setBests(recordWin(after.levelId, run))
      setOverlay({ kind: 'won', newBest: beats(run, before) })
      setAnnouncement(`Level cleared with ${run.ink} ink in ${run.moves} moves.`)
      return
    }
    if (result === 'lost') {
      setOverlay({ kind: 'lost', newBest: false })
      setAnnouncement(`Out of ink with ${blocksLeft(current(after))} blocks left. Undo or restart.`)
      return
    }
    const next = queued.current
    queued.current = null
    if (next) moveRef.current(next)
  }, [])

  const move = useCallback((direction: Direction) => {
    if (rolling.current) { queued.current = direction; return } // one move waits its turn
    const { session: after, result } = play(sessionRef.current, direction)
    if (after === sessionRef.current) {
      if (sessionStatus(after) === 'playing') {
        // a wall right there: a small knock, no ink spent
        setBump(null)
        requestAnimationFrame(() => setBump(direction))
      }
      return
    }
    rolling.current = true
    sessionRef.current = after
    setSession(after)
    const now = current(after)
    setAnnouncement(`Rolled ${direction} ${result.cost} ${result.cost === 1 ? 'block' : 'blocks'}. ${now.ink} ink left, ${blocksLeft(now)} to color.`)
    renderer.current?.animate(result, () => settle(after))
  }, [settle])
  moveRef.current = move

  const takeBack = useCallback(() => {
    renderer.current?.finish()
    queued.current = null
    rolling.current = false
    const after = undo(sessionRef.current)
    if (after === sessionRef.current) return
    sessionRef.current = after
    setSession(after)
    setOverlay(null)
    renderer.current?.show(current(after))
    setAnnouncement('Move undone.')
  }, [])

  const startOver = useCallback(() => {
    renderer.current?.finish()
    queued.current = null
    rolling.current = false
    const after = restart(sessionRef.current)
    sessionRef.current = after
    setSession(after)
    setOverlay(null)
    renderer.current?.show(current(after))
    setAnnouncement('Level restarted.')
  }, [])

  const openLevel = useCallback((index: number) => {
    renderer.current?.finish()
    queued.current = null
    rolling.current = false
    const fresh = createSession(LEVELS[index])
    sessionRef.current = fresh
    setLevelIndex(index)
    setSession(fresh)
    setOverlay(null)
    renderer.current?.show(current(fresh))
    setAnnouncement(`Level ${index + 1}, ${LEVELS[index].name}.`)
    const url = new URL(location.href)
    url.searchParams.set('level', String(index + 1))
    history.replaceState(null, '', url)
  }, [])

  // Keys (while the game, or nothing in particular, has focus) and swipes on the board
  useEffect(() => {
    if (!game.current || !canvas.current) return
    return attachInput(game.current, canvas.current, { move, undo: takeBack, restart: startOver })
  }, [move, takeBack, startOver])

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
    back={{ href: pagePath('minigames'), label: `Back to ${minigames.title}` }}
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

          <div className="im-stage" data-bump={bump ?? undefined} onAnimationEnd={() => setBump(null)}>
            <canvas
              id="ink-maze-board"
              ref={canvas}
              className="im-board"
              style={{ aspectRatio: String(boardAspect(state.width, state.height)) }}
              role="img"
              tabIndex={0}
              aria-label={`Level ${levelIndex + 1}, ${level.name}: a ${state.width} by ${state.height} board. ${floors - left} of ${floors} blocks colored, ${state.ink} ink left. Use the arrow keys or the roll buttons.`}
            />
            {overlay && (
              <div className="im-result" data-kind={overlay.kind} role="dialog" aria-modal="false" aria-labelledby="im-result-title">
                {overlay.kind === 'won' ? <>
                  <p className="im-result__eyebrow">Level {levelIndex + 1}</p>
                  <h2 id="im-result-title">Level cleared</h2>
                  <p className="im-result__stats">
                    You used {used} ink in {moves} {moves === 1 ? 'move' : 'moves'}.{' '}
                    {used === level.par ? 'That is the least this level needs.' : `It can be done with ${level.par}.`}
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
            <span className="im-hint--keys">Arrow keys or <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to roll · <kbd>Z</kbd> undo · <kbd>R</kbd> restart</span>
            <span className="im-hint--touch">Swipe on the board to roll the ball</span>
          </p>
      </section>

        <aside className="im-side" aria-label="Levels and rules">
          <div className="im-level">
            <p className="sp-eyebrow">Level {levelIndex + 1} of {LEVELS.length}</p>
            <h2>{level.name}</h2>
            <p className="im-level__meta">{state.width} × {state.height} board <span aria-hidden="true">·</span> {level.ink} ink</p>
            <p className="im-level__note">
              {level.slack > 0 ? `The least it needs is ${level.par}, so you have ${level.slack} extra.` : 'That is exactly the least it needs.'}
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
