/**
 * Ink Maze coding level: plays judged answers on a board view.
 *
 * The judge (problem.ts) has already played every move with the engine; a
 * clip is one board and its verdict, and playing it hands each step's
 * MoveResult to the view (view.ts) in order, one roll after another. A move
 * the judge stopped at because it hits a wall is shown as a bump. Nothing
 * here decides what a move does.
 */
import { initialState } from '../../engine.ts'
import type { InkMazeView } from '../../view.ts'
import type { BoardInput } from '../contract.ts'
import { MOVE_LETTERS } from '../problem.ts'
import type { JudgeStep, Verdict } from '../problem.ts'

export type Clip = {
  board: BoardInput
  /** index of the board in the run's tests */
  index: number
  /** what the screen calls it: 'Your map', 'Hidden test 3 of 12' */
  label: string
  /** the board's name: 'Random map', 'Corridor' */
  name: string
  verdict: Verdict
  /** roll speed (1 = the game's own pace) */
  speed: number
  /** pause after each roll, in ms */
  gapMs: number
  /** part of a fast montage: the rolls make no sound */
  quiet?: boolean
}

export type PlaybackHooks = {
  /** a clip begins: its board is now shown at rest */
  clipStart?(clip: Clip, n: number, of: number): void
  /** a roll begins (the game updates its HUD at this moment too) */
  step?(clip: Clip, step: JudgeStep): void
  /** a move the judge refused because a wall or the edge is right there: the ball knocks it */
  bump?(clip: Clip): void
  /** the clip's last roll has stopped */
  clipEnd?(clip: Clip, n: number, of: number): void
}

/** A view that can also change its roll speed (the 2D renderer can). */
export type SpeedView = InkMazeView & { setSpeed?(speed: number): void }

/** How long the 2D board takes for a roll of `blocks` at speed 1 (render.ts timing). */
export const rollMs = (blocks: number) => Math.min(720, 90 + 58 * blocks)

/** How long a verdict's rolls take at speed 1, without pauses. */
export function verdictMs(verdict: Verdict): number {
  return verdict.steps.reduce((sum, step) => sum + rollMs(step.result.path.length), 0)
}

export class Playback {
  private token = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private wake: (() => void) | null = null
  private _playing = false

  constructor(private view: SpeedView, private hooks: PlaybackHooks = {}) {}

  get playing() { return this._playing }

  /**
   * Plays the clips in order, holding `holdMs` between them. Resolves true
   * when every clip played to its end, false when stop() (or another play())
   * cut it short.
   */
  async play(clips: readonly Clip[], holdMs = 600): Promise<boolean> {
    this.stop()
    const token = ++this.token
    this._playing = true
    try {
      for (let n = 0; n < clips.length; n++) {
        const clip = clips[n]
        this.view.setSpeed?.(clip.speed)
        this.view.show(initialState(clip.board))
        this.hooks.clipStart?.(clip, n, clips.length)
        if (!(await this.wait(token, n === 0 ? Math.max(120, 260 / clip.speed) : 90))) return false
        for (const step of clip.verdict.steps) {
          this.hooks.step?.(clip, step)
          await new Promise<void>((resolve) => this.view.animate(step.result, resolve))
          if (token !== this.token) return false
          if (!(await this.wait(token, clip.gapMs))) return false
        }
        if (clip.verdict.kind === 'blocked') {
          this.view.bump(MOVE_LETTERS[clip.verdict.letter])
          this.hooks.bump?.(clip)
          if (!(await this.wait(token, 240))) return false
        }
        this.hooks.clipEnd?.(clip, n, clips.length)
        if (n < clips.length - 1 && !(await this.wait(token, holdMs))) return false
      }
      return true
    } finally {
      if (token === this.token) {
        this._playing = false
        this.view.setSpeed?.(1)
      }
    }
  }

  /** Ends any playback now: the roll in progress lands, nothing more plays. */
  stop() {
    this.token++
    this._playing = false
    clearTimeout(this.timer)
    const wake = this.wake
    this.wake = null
    wake?.()
    this.view.finish()
    this.view.setSpeed?.(1)
  }

  private wait(token: number, ms: number): Promise<boolean> {
    if (token !== this.token) return Promise.resolve(false)
    return new Promise((resolve) => {
      this.wake = () => resolve(false)
      this.timer = setTimeout(() => {
        this.wake = null
        resolve(token === this.token)
      }, ms)
    })
  }
}
