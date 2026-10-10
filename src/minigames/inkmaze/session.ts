/**
 * Ink Maze: one attempt at a level, with undo and restart.
 *
 * Plain data and pure functions on top of engine.ts, so the page, a test or
 * an AI can drive a game the same way. `history[0]` is the starting state and
 * the last entry is the current one; moves used is history.length - 1.
 */
import { applyMove, initialState, status } from './engine.ts'
import type { Direction, Level, MoveResult, State, Status } from './engine.ts'

export type Session = {
  levelId: string
  history: State[]
}

export const createSession = (level: Level): Session => ({ levelId: level.id, history: [initialState(level)] })

export const current = (session: Session): State => session.history[session.history.length - 1]

export const movesUsed = (session: Session): number => session.history.length - 1

/** Ink spent so far in this attempt. */
export const inkUsed = (session: Session): number => session.history[0].ink - current(session).ink

export const sessionStatus = (session: Session): Status => status(current(session))

/**
 * Plays a move. Moves after the game is over, and moves that go nowhere,
 * leave the session unchanged (the same object comes back).
 */
export function play(session: Session, direction: Direction): { session: Session; result: MoveResult } {
  const state = current(session)
  if (status(state) !== 'playing') return { session, result: { state, cost: 0, path: [] } }
  const result = applyMove(state, direction)
  if (!result.path.length) return { session, result }
  return { session: { ...session, history: [...session.history, result.state] }, result }
}

/** Takes back the last move; at the start it changes nothing. */
export function undo(session: Session): Session {
  if (session.history.length <= 1) return session
  return { ...session, history: session.history.slice(0, -1) }
}

/** Back to the starting state of the same level. */
export function restart(session: Session): Session {
  if (session.history.length <= 1) return session
  return { ...session, history: [session.history[0]] }
}
