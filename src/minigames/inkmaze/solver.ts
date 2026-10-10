/**
 * Ink Maze: exact search over positions.
 *
 * A position is the ball's block plus the set of colored blocks (ink is the
 * search cost, not part of the position). Both searches are A* with an
 * admissible, consistent heuristic: every uncolored block still needs at
 * least one more drop, and a roll of k blocks colors at most k of them.
 *
 *  - minInk(level): the least ink that clears a level. Every roll but the
 *    last runs its full length (a roll only stops early when the ink runs
 *    out, which ends the game), so the cheapest win is a sequence of full
 *    rolls, then one final roll that may be cut short as soon as the last
 *    uncolored block is reached.
 *  - solvableWith(level, ink): plays the real engine (applyMove, including
 *    its mid-roll stop) under a fixed ink budget and reports whether any line
 *    of play wins. Used by the test, and to cross-check minInk.
 *
 * Pure and plain-script importable, like engine.ts.
 */
import { DIRECTIONS, FLOOR, applyMove, blocksLeft, initialState, isWon, rollPath } from './engine.ts'
import type { Direction, Level, State } from './engine.ts'

export type Solution = {
  /** least ink (minInk) or the ink spent by the line found (solvableWith) */
  ink: number
  moves: Direction[]
  /** positions taken off the search frontier */
  explored: number
}

type Node = { f: number; g: number; key: string; state: State }

/** A small binary min-heap on f, ties broken toward the deeper g. */
class Frontier {
  private items: Node[] = []
  get size() { return this.items.length }
  push(node: Node) {
    const a = this.items
    a.push(node)
    let i = a.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (!this.less(a[i], a[parent])) break
      ;[a[i], a[parent]] = [a[parent], a[i]]
      i = parent
    }
  }
  pop(): Node | undefined {
    const a = this.items
    const top = a[0]
    const last = a.pop()
    if (a.length && last) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < a.length && this.less(a[l], a[m])) m = l
        if (r < a.length && this.less(a[r], a[m])) m = r
        if (m === i) break
        ;[a[i], a[m]] = [a[m], a[i]]
        i = m
      }
    }
    return top
  }
  private less(x: Node, y: Node) { return x.f < y.f || (x.f === y.f && x.g > y.g) }
}

const positionKey = (state: State) => `${state.ball}|${state.colored}`

function rebuild(parents: Map<string, { from: string; move: Direction }>, key: string): Direction[] {
  const moves: Direction[] = []
  for (let at = parents.get(key); at; at = parents.get(at.from)) moves.push(at.move)
  return moves.reverse()
}

/** The least ink that clears `level`, with one line of play that achieves it. Null when no amount of ink can. */
export function minInk(level: Pick<Level, 'grid'>, limit = 2_000_000): Solution | null {
  const start = initialState({ grid: level.grid, ink: Number.POSITIVE_INFINITY })
  if (isWon(start)) return { ink: 0, moves: [], explored: 0 }
  const frontier = new Frontier()
  const best = new Map<string, number>()
  const parents = new Map<string, { from: string; move: Direction }>()
  const startKey = positionKey(start)
  frontier.push({ f: blocksLeft(start), g: 0, key: startKey, state: start })
  best.set(startKey, 0)
  let answer: { ink: number; key: string; last: Direction } | null = null
  let explored = 0
  while (frontier.size) {
    const node = frontier.pop()!
    if (node.g !== best.get(node.key)) continue // a stale entry
    if (answer && node.f >= answer.ink) break // nothing left on the frontier can do better
    if (++explored > limit) throw new Error(`minInk: gave up after ${limit} positions`)
    const { state, g } = node
    const uncolored: number[] = []
    for (let i = 0; i < state.cells.length; i++) if (state.cells[i] === FLOOR && state.colored[i] !== '1') uncolored.push(i)
    for (const move of DIRECTIONS) {
      const path = rollPath(state, move)
      if (!path.length) continue
      // A final roll that reaches every uncolored block can stop at the last one
      let reach = -1
      for (const block of uncolored) {
        const at = path.indexOf(block)
        if (at < 0) { reach = -1; break }
        if (at > reach) reach = at
      }
      if (reach >= 0 && (!answer || g + reach + 1 < answer.ink)) answer = { ink: g + reach + 1, key: node.key, last: move }
      // …otherwise keep searching with the full roll
      const next = applyMove(state, move).state
      const key = positionKey(next)
      const cost = g + path.length
      if (cost >= (best.get(key) ?? Number.POSITIVE_INFINITY)) continue
      best.set(key, cost)
      parents.set(key, { from: node.key, move })
      frontier.push({ f: cost + blocksLeft(next), g: cost, key, state: next })
    }
  }
  if (!answer) return null
  return { ink: answer.ink, moves: [...rebuild(parents, answer.key), answer.last], explored }
}

/**
 * Whether `level` can be cleared starting with exactly `ink`, playing the
 * engine's own rules. Returns the cheapest winning line, or null.
 */
export function solvableWith(level: Pick<Level, 'grid'>, ink: number, limit = 2_000_000): Solution | null {
  const start = initialState({ grid: level.grid, ink })
  if (isWon(start)) return { ink: 0, moves: [], explored: 0 }
  const frontier = new Frontier()
  const best = new Map<string, number>()
  const parents = new Map<string, { from: string; move: Direction }>()
  const startKey = positionKey(start)
  frontier.push({ f: blocksLeft(start), g: 0, key: startKey, state: start })
  best.set(startKey, 0)
  let explored = 0
  while (frontier.size) {
    const node = frontier.pop()!
    if (node.g !== best.get(node.key)) continue
    if (node.f > ink) break // even the cheapest remaining line needs more ink than there is
    if (isWon(node.state)) return { ink: node.g, moves: rebuild(parents, node.key), explored }
    if (++explored > limit) throw new Error(`solvableWith: gave up after ${limit} positions`)
    for (const move of DIRECTIONS) {
      const { state: next, cost } = applyMove(node.state, move)
      if (!cost) continue
      const key = positionKey(next)
      const g = node.g + cost
      if (g >= (best.get(key) ?? Number.POSITIVE_INFINITY)) continue
      best.set(key, g)
      parents.set(key, { from: node.key, move })
      frontier.push({ f: g + blocksLeft(next), g, key, state: next })
    }
  }
  return null
}

/** Plays `moves` from the start of `level` with `ink`; returns the final state. */
export function replay(level: Pick<Level, 'grid'>, ink: number, moves: readonly Direction[]): State {
  let state = initialState({ grid: level.grid, ink })
  for (const move of moves) state = applyMove(state, move).state
  return state
}
