/**
 * Ink Maze: what the page needs from anything that draws the board.
 *
 * Two views implement this: InkMazeRenderer (2D canvas, render.ts) and
 * UnityInkMaze (WebGL, unity.ts). A view only shows states the engine has
 * already decided; it never changes what a move costs or where the ball ends.
 * See docs/INK-MAZE-UNITY.md for the full contract.
 */
import type { Art } from './assets.ts'
import type { Direction, MoveResult, State } from './engine.ts'

export type ViewEvent =
  | { type: 'cell'; index: number; step: number; of: number } // ball center entered path block `step` of `of`
  | { type: 'impact'; strength: number; surface: 'wall' | 'rim' } // strength 0..1
  | { type: 'roll'; speed: number }                              // 0..1, about 15 times a second while moving
  | { type: 'settled' }                                           // the ball is at rest on its block

export interface InkMazeView {
  setArt(art: Art): void                                   // the canvas view uses it; Unity loads its own copy
  show(state: State): void                                 // a state at rest: new level, undo, restart
  animate(result: MoveResult, done: () => void): void      // `done` runs exactly once, when the ball has stopped
  finish(): void                                           // end any roll now; its `done` still runs, exactly once
  bump(direction: Direction): void                         // the ball knocks an adjacent wall; nothing changes
  setReducedMotion(reduced: boolean): void
  onEvent: ((event: ViewEvent) => void) | null             // sound and other listeners
  destroy(): void
}
