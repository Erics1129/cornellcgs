/**
 * Ink Maze coding level: the game screen next to the editor.
 *
 * The board is drawn by the game's own 2D view (InkMazeRenderer, through the
 * InkMazeView interface) with its art and sound. At rest it shows the map;
 * after a run it plays the judged moves (playback.ts), so every run moves the
 * ball exactly as the engine decided: a move into a wall bumps and stops, an
 * empty pot shows the board out of ink. The HUD follows the board on screen.
 */
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { blocksLeft, floorCount, initialState } from '../../engine.ts'
import type { State } from '../../engine.ts'
import { InkMazeRenderer, boardAspect } from '../../render.ts'
import { loadArt } from '../../assets.ts'
import { createInkMazeSound } from '../../sound.ts'
import type { InkMazeSound } from '../../sound.ts'
import type { ViewEvent } from '../../view.ts'
import type { BoardInput } from '../contract.ts'
import type { Verdict } from '../problem.ts'
import { Playback } from './playback.ts'
import type { Clip } from './playback.ts'
import { SPEEDS } from './storage.ts'
import type { Speed } from './storage.ts'
import type { Tone } from './report.ts'

export type GameScreenHandle = {
  /** plays clips (one board each); resolves false when something cut it short */
  play(clips: readonly Clip[], holdMs?: number): Promise<boolean>
  /** stops playback at once */
  stop(): void
  /** a board at rest, with what to call it */
  show(board: BoardInput & { name: string }, label: string): void
  readonly playing: boolean
}

export type Banner = { tone: Tone; text: string }

type Shown = { board: BoardInput & { name: string }; label: string; state: State; moves: number; inkUsed: number }

type Props = {
  /** the visible map, shown at rest whenever nothing plays */
  board: BoardInput & { id: string; name: string; par: number }
  speed: Speed
  onSpeed: (speed: Speed) => void
  onNewBoard: () => void
  onReplay: () => void
  canReplay: boolean
  /** a run is in flight: the map cannot change */
  busy: boolean
  banner: Banner | null
  /** playback started or stopped (the parent's Replay / Skip buttons) */
  onPlaying?: (playing: boolean) => void
  /** cut the playback short (the parent shows the result line) */
  onSkip: () => void
}

declare global {
  interface Window {
    /** dev server only: the coding level's board events, for scripts/test-inkmaze-code-page.mjs */
    __inkCodeEvents?: Array<ViewEvent | { type: 'clip'; index: number; label: string } | { type: 'bump' } | { type: 'end'; index: number }>
  }
}

/** The word on the board once a clip has played out (the banner and the live region say it in full). */
function endLabel(verdict: Verdict): string {
  const left = `${verdict.blocksLeft} ${verdict.blocksLeft === 1 ? 'block' : 'blocks'} left`
  switch (verdict.kind) {
    case 'accepted': return 'Cleared'
    case 'out_of_ink': return `Out of ink · ${left}`
    case 'blocked': return verdict.steps.length ? 'Blocked' : 'Blocked at the start'
    case 'unfinished': return `Stopped · ${left}`
    case 'extra_moves': return 'Cleared, then more moves'
    case 'empty': return 'No moves'
    case 'bad_char': return 'Not a move'
  }
}

const devLog = (event: NonNullable<Window['__inkCodeEvents']>[number]) => {
  if (!import.meta.env.DEV) return
  const log = (window.__inkCodeEvents ??= [])
  log.push(event)
  if (log.length > 4000) log.splice(0, log.length - 4000)
}

function SoundIcon({ on }: { on: boolean }) {
  return <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
    <path d="M3.5 7.5h3l4-3.5v12l-4-3.5h-3z" fill="currentColor" />
    {on
      ? <path d="M13.2 7.2a4 4 0 0 1 0 5.6M15.4 5a7 7 0 0 1 0 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      : <path d="M13.5 7.5l4 5M17.5 7.5l-4 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
  </svg>
}

const GameScreen = forwardRef<GameScreenHandle, Props>(function GameScreen({ board, speed, onSpeed, onNewBoard, onReplay, canReplay, busy, banner, onPlaying, onSkip }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const renderer = useRef<InkMazeRenderer | null>(null)
  const playback = useRef<Playback | null>(null)
  /** the clips playing (or played last), for Skip */
  const clipsRef = useRef<readonly Clip[]>([])
  const sound = useRef<InkMazeSound | null>(null)
  const rolling = useRef(false)
  const [soundOn, setSoundOn] = useState(true)
  const [playing, setPlaying] = useState(false)
  /** how the last clip ended, shown on the board until something else is */
  const [end, setEnd] = useState<{ kind: Verdict['kind']; text: string } | null>(null)
  const onPlayingRef = useRef(onPlaying)
  onPlayingRef.current = onPlaying
  const atRest = (b: Shown['board'], label: string): Shown => ({ board: b, label, state: initialState(b), moves: 0, inkUsed: 0 })
  const [shown, setShown] = useState<Shown>(() => atRest(board, 'Your map'))
  const shownRef = useRef(shown)
  shownRef.current = shown

  // the view, its art, the sound and the player live as long as the screen
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const r = new InkMazeRenderer(c)
    renderer.current = r
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    const applyMotion = () => r.setReducedMotion(reduce.matches)
    applyMotion()
    reduce.addEventListener?.('change', applyMotion)
    r.show(shownRef.current.state)
    let alive = true
    loadArt().then((art) => { if (alive) r.setArt(art) })
    const s = createInkMazeSound()
    sound.current = s
    setSoundOn(!s.muted)
    r.onEvent = (event) => {
      devLog(event)
      if ((event.type === 'impact' || event.type === 'roll') && !rolling.current) return
      s.event(event)
    }
    const wake = () => s.unlock()
    const types = ['pointerdown', 'keydown'] as const
    for (const type of types) document.addEventListener(type, wake, true)
    const p = new Playback(r, {
      clipStart(clip) {
        devLog({ type: 'clip', index: clip.index, label: clip.label })
        setEnd(null)
        setShown(atRest(clip.board as Shown['board'], clip.label))
      },
      step(clip, step) {
        rolling.current = true
        if (!clip.quiet) s.rollStart(step.result.cost) // a fast montage rolls silently
        setShown((before) => ({ ...before, state: step.result.state, moves: step.index + 1, inkUsed: clip.board.ink - step.result.state.ink }))
      },
      bump() { rolling.current = false; devLog({ type: 'bump' }); s.bump() },
      clipEnd(clip, n, of) {
        rolling.current = false
        devLog({ type: 'end', index: clip.index })
        const kind = clip.verdict.kind
        setEnd({ kind, text: endLabel(clip.verdict) })
        if (kind === 'accepted' && n === of - 1) s.win(clip.verdict.inkUsed === (clip.board as { par?: number }).par)
        else if (kind === 'out_of_ink') s.lose()
      },
    })
    playback.current = p
    return () => {
      alive = false
      p.stop()
      reduce.removeEventListener?.('change', applyMotion)
      for (const type of types) document.removeEventListener(type, wake, true)
      r.destroy()
      s.destroy()
      renderer.current = null
      playback.current = null
      sound.current = null
    }
  }, [])

  // a new map shows at once (the parent stops any playback first)
  useEffect(() => {
    if (playback.current?.playing) return
    const next = atRest(board, 'Your map')
    setShown(next)
    setEnd(null)
    renderer.current?.show(next.state)
  }, [board.id])

  const setPlayingBoth = (value: boolean) => { setPlaying(value); onPlayingRef.current?.(value) }

  useImperativeHandle(ref, () => ({
    async play(clips, holdMs) {
      const p = playback.current
      if (!p || !clips.length) return false
      clipsRef.current = clips
      setPlayingBoth(true)
      try {
        return await p.play(clips, holdMs)
      } finally {
        if (!p.playing) { rolling.current = false; setPlayingBoth(false) }
      }
    },
    stop() {
      playback.current?.stop()
      rolling.current = false
      setPlayingBoth(false)
    },
    show(b, label) {
      playback.current?.stop()
      rolling.current = false
      setPlayingBoth(false)
      const next = atRest(b, label)
      setShown(next)
      setEnd(null)
      renderer.current?.show(next.state)
    },
    get playing() { return !!playback.current?.playing },
  }), [])

  const { state } = shown
  const floors = useMemo(() => floorCount(state), [state.cells])
  const left = blocksLeft(state)
  const aspect = boardAspect(state.width, state.height)
  const inkShare = shown.board.ink ? state.ink / shown.board.ink : 0
  /** a test board is on screen (after a submission), not the map */
  const onMap = shown.label === 'Your map'

  /** Skip: the last clip's final position, at once */
  const skipToEnd = () => {
    playback.current?.stop()
    rolling.current = false
    setPlayingBoth(false)
    const end = clipsRef.current[clipsRef.current.length - 1]
    if (end) {
      const { final, steps, inkUsed } = end.verdict
      renderer.current?.show(final)
      setShown({ board: end.board as Shown['board'], label: end.label, state: final, moves: steps.length, inkUsed })
      setEnd({ kind: end.verdict.kind, text: endLabel(end.verdict) })
    }
    onSkip()
  }

  const toggleSound = () => {
    const s = sound.current
    if (!s) return
    s.unlock()
    s.setMuted(!s.muted)
    setSoundOn(!s.muted)
  }

  return <section className="imc-screen" aria-label="Game screen">
    <div className="imc-screen__top">
      <p className="imc-screen__label">
        <strong>{shown.label}</strong>
        <span>{shown.board.name !== 'Random map' ? `${shown.board.name} · ` : ''}{state.width} × {state.height} · {shown.board.ink} ink</span>
      </p>
      <dl className="imc-hud">
        <div className="imc-hud__ink">
          <dt>Ink</dt>
          <dd><strong>{state.ink}</strong><span> / {shown.board.ink}</span></dd>
          <span className="imc-inkbar" aria-hidden="true"><span style={{ transform: `scaleX(${Math.max(0, Math.min(1, inkShare))})` }} data-low={inkShare <= 0.2 ? 'true' : undefined} /></span>
        </div>
        <div><dt>Moves</dt><dd><strong>{shown.moves}</strong></dd></div>
        <div><dt>Blocks left</dt><dd><strong>{left}</strong></dd></div>
      </dl>
    </div>

    <div className="imc-stage" data-playing={playing ? 'true' : 'false'} data-end={end?.kind}>
      <div className="imc-board" style={{ aspectRatio: String(aspect), '--imc-aspect': String(aspect) } as CSSProperties}
        role="img" aria-label={`${shown.label}: a ${state.width} by ${state.height} board. ${floors - left} of ${floors} blocks colored, ${state.ink} of ${shown.board.ink} ink left.`}>
        <canvas ref={canvas} className="imc-canvas" aria-hidden="true" />
      </div>
      {end && <span className="imc-stage__end" data-kind={end.kind} aria-hidden="true">{end.text}</span>}
    </div>
    {banner && <p className="imc-banner" data-tone={banner.tone}>{banner.text}</p>}

    <div className="imc-screen__tools">
      <button type="button" className="imc-tool" onClick={onNewBoard} disabled={busy} title="Roll a new random map">
        <span aria-hidden="true">⟳</span> New board
      </button>
      {playing && !busy
        ? <button type="button" className="imc-tool" onClick={skipToEnd} title="Jump to the end">
            <span aria-hidden="true">⏭</span> Skip
          </button>
        : <button type="button" className="imc-tool" onClick={onReplay} disabled={!canReplay || busy} title="Play the last run again">
            <span aria-hidden="true">▶</span> Replay
          </button>}
      <div className="imc-speed" role="group" aria-label="Playback speed">
        {SPEEDS.map((s) => <button key={s} type="button" className="imc-speed__option" aria-pressed={speed === s} onClick={() => onSpeed(s)}>{s === 0.5 ? '½' : s}×</button>)}
      </div>
      <button type="button" className="imc-tool imc-tool--icon" onClick={toggleSound} aria-pressed={soundOn} aria-label={soundOn ? 'Sound on' : 'Sound off'} title={soundOn ? 'Sound on' : 'Sound off'}>
        <SoundIcon on={soundOn} />
      </button>
      {!onMap && !playing && <span className="imc-screen__note">Showing a test board. New board or a run brings your map back.</span>}
    </div>
  </section>
})

export default GameScreen
