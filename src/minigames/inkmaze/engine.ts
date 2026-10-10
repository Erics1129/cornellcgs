/**
 * Ink Maze: the rules, and nothing else.
 *
 * No drawing, no DOM, no timers, no randomness: every function here is pure
 * and every state is plain data (strings and numbers), so states can be
 * copied with structuredClone or JSON, compared with sameState / stateKey,
 * and used as search nodes by a solver or an AI. Only erasable TypeScript is
 * used, so Node imports this file directly:
 *
 *   import { initialState, legalMoves, applyMove, status } from './src/minigames/inkmaze/engine.ts'
 *
 * Rules
 *  - The board is a grid of square blocks; each is floor or wall. The board
 *    edge counts as a wall.
 *  - The ball starts on a floor block, which starts colored.
 *  - A move picks up, down, left or right. The ball rolls in a straight line
 *    and stops when the next block is a wall or the edge. A move that cannot
 *    go anywhere does nothing and costs nothing.
 *  - Every block the ball rolls onto becomes colored and costs 1 ink, even if
 *    it was colored already.
 *  - If the ink reaches 0 in the middle of a roll, the ball stops right there.
 *  - Won: every floor block is colored (checked first, so coloring the last
 *    block with the last drop is a win). Lost: no ink left and some floor
 *    block is still uncolored.
 */

export type Direction = 'up' | 'down' | 'left' | 'right'

/** All four directions, in a fixed order (handy for solvers). */
export const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right']

/** Text-grid characters a level may use. */
export const WALL = '#'
export const FLOOR = '.'
export const START = 'o'

/** A level as it is written in levels.ts. */
export type Level = {
  id: string
  name: string
  /** rows of '#' (wall), '.' (floor) and exactly one 'o' (the ball, on floor) */
  grid: readonly string[]
  /** ink the player starts with: par + slack (written by scripts/inkmaze-solve.mjs) */
  ink: number
  /** the least ink that clears the level (written by scripts/inkmaze-solve.mjs) */
  par: number
  /** how much ink above par the level gives (set by hand: 0 means a perfect run is required) */
  slack: number
}

/**
 * One moment of play, as plain data. Two states are the same position when
 * their fields are equal; nothing in here refers to anything outside it.
 */
export type State = {
  width: number
  height: number
  /** one char per block, row by row from the top-left: '#' wall, '.' floor */
  cells: string
  /** the ball's block, as an index: y * width + x */
  ball: number
  /** one char per block: '1' colored, '0' not (walls are always '0') */
  colored: string
  /** ink left */
  ink: number
}

/** What a move did. `path` lists the blocks the ball rolled onto, in order. */
export type MoveResult = {
  state: State
  /** ink spent: one per block rolled onto */
  cost: number
  path: number[]
}

export type Status = 'playing' | 'won' | 'lost'

const STEP: Record<Direction, readonly [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
}

/** Column and row of a block index. */
export function toXY(state: Pick<State, 'width'>, index: number): [number, number] {
  return [index % state.width, Math.floor(index / state.width)]
}

/** Block index of a column and row. */
export function toIndex(state: Pick<State, 'width'>, x: number, y: number): number {
  return y * state.width + x
}

/**
 * Checks a level's text grid and returns its parts, or throws with a message
 * that says what to fix. Rows must be equally long and use only '#', '.' and
 * one 'o'.
 */
export function parseGrid(grid: readonly string[]): { width: number; height: number; cells: string; start: number } {
  const height = grid.length
  if (!height) throw new Error('level grid has no rows')
  const width = grid[0].length
  if (!width) throw new Error('level grid has an empty first row')
  let cells = ''
  let start = -1
  grid.forEach((row, y) => {
    if (row.length !== width) throw new Error(`row ${y + 1} has ${row.length} blocks, expected ${width}`)
    for (let x = 0; x < width; x++) {
      const char = row[x]
      if (char === START) {
        if (start >= 0) throw new Error(`a second ball at row ${y + 1}, column ${x + 1}`)
        start = y * width + x
        cells += FLOOR
      } else if (char === WALL || char === FLOOR) {
        cells += char
      } else {
        throw new Error(`unknown block '${char}' at row ${y + 1}, column ${x + 1} (use '#', '.' or 'o')`)
      }
    }
  })
  if (start < 0) throw new Error("level grid has no ball ('o')")
  return { width, height, cells, start }
}

/** The starting state of a level: the ball on its block, that block colored, a full pot of ink. */
export function initialState(level: Pick<Level, 'grid' | 'ink'>): State {
  const { width, height, cells, start } = parseGrid(level.grid)
  const colored = cells.split('').map((_, i) => (i === start ? '1' : '0')).join('')
  return { width, height, cells, ball: start, colored, ink: level.ink }
}

/** The block next to `index` in a direction, or -1 past the edge. */
function neighbour(state: State, index: number, direction: Direction): number {
  const [x, y] = toXY(state, index)
  const [dx, dy] = STEP[direction]
  const nx = x + dx
  const ny = y + dy
  if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) return -1
  return ny * state.width + nx
}

const isFloor = (state: State, index: number) => index >= 0 && state.cells[index] === FLOOR

/**
 * The blocks a full roll would pass onto, ignoring ink: from the ball's
 * block up to where the next block is a wall or the edge.
 */
export function rollPath(state: State, direction: Direction): number[] {
  const path: number[] = []
  let at = state.ball
  for (;;) {
    const next = neighbour(state, at, direction)
    if (!isFloor(state, next)) return path
    path.push(next)
    at = next
  }
}

/** The directions that move the ball. Empty when there is no ink left. */
export function legalMoves(state: State): Direction[] {
  if (state.ink <= 0) return []
  return DIRECTIONS.filter((direction) => isFloor(state, neighbour(state, state.ball, direction)))
}

/**
 * Rolls the ball. Returns the new state, the ink it cost and the blocks
 * rolled onto. A move that goes nowhere (a wall or the edge right next to the
 * ball, or no ink) returns the same state object, cost 0 and an empty path.
 */
export function applyMove(state: State, direction: Direction): MoveResult {
  const full = state.ink > 0 ? rollPath(state, direction) : []
  const path = full.slice(0, Math.max(0, state.ink)) // the ink runs dry mid-roll: stop there
  if (!path.length) return { state, cost: 0, path }
  const colored = state.colored.split('')
  for (const index of path) colored[index] = '1'
  return {
    state: { ...state, ball: path[path.length - 1], colored: colored.join(''), ink: state.ink - path.length },
    cost: path.length,
    path,
  }
}

/** How many floor blocks are still uncolored. */
export function blocksLeft(state: State): number {
  let left = 0
  for (let i = 0; i < state.cells.length; i++) if (state.cells[i] === FLOOR && state.colored[i] !== '1') left++
  return left
}

/** How many floor blocks the board has. */
export function floorCount(state: State): number {
  let floors = 0
  for (const char of state.cells) if (char === FLOOR) floors++
  return floors
}

export const isWon = (state: State): boolean => blocksLeft(state) === 0
export const isLost = (state: State): boolean => !isWon(state) && state.ink <= 0

export function status(state: State): Status {
  if (isWon(state)) return 'won'
  if (state.ink <= 0) return 'lost'
  return 'playing'
}

/** A compact string that is equal exactly when two positions are equal (ball, colors and ink). */
export function stateKey(state: State): string {
  return `${state.ball}|${state.colored}|${state.ink}`
}

/** Field-by-field equality of two states. */
export function sameState(a: State, b: State): boolean {
  return a.width === b.width && a.height === b.height && a.cells === b.cells &&
    a.ball === b.ball && a.colored === b.colored && a.ink === b.ink
}
