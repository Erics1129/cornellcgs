/**
 * Ink Maze level 26, the coding level: the problem, the stdin format, the
 * answer protocol, the boards and the judge.
 *
 * Pure, like engine.ts: no browser APIs, no Math.random (boards come from a
 * seed), erasable TypeScript only, so Node imports it directly. The engine
 * (applyMove) decides every move; the judge only reports what it says.
 *
 * stdin (what every harness reads; formatStdin writes it)
 * --------------------------------------------------------
 *   T                       number of boards, 1..LIMITS.tests
 *   H W INK                 per board: rows, columns, ink in the pot
 *   row 1                   H rows of W characters: '#' wall, '.' floor, 'o' the ball
 *   ...
 *   row H
 * Single spaces, '\n' line ends, a final '\n', nothing else. Example (T = 1):
 *   1\n4 4 10\no...\n..##\n..##\n..##\n
 *
 * The harness (each runtime writes one for its language)
 * -------------------------------------------------------
 *  H1 Read all of stdin before calling the player's code. Player code must not
 *     be able to read or change the input (if it does anyway, the run is
 *     'crashed', never 'ok').
 *  H2 For each board, in order, build that language's grid as a fresh private
 *     copy (String[] / list[str] / string[] / char** of NUL-terminated rows /
 *     vector<string>) and call the player's solve once (SIGNATURES). A new
 *     Solution object per board for the class-based languages.
 *  H3 After solve returns, flush what the player printed, then print to
 *     stdout exactly one line:
 *       @@ANSWER@@ <moves>\n                      (answerLine(), escapeAnswer())
 *     where <moves> is the returned string after escapeAnswer(): control
 *     characters (U+0000-U+001F, U+007F) become their visible U+2400 symbols,
 *     so a line break or NUL inside the answer can never end or cut the line;
 *     '@' becomes U+FF20, so the answer can never hold the marker; lone
 *     surrogates / invalid UTF-8 become U+FFFD. Print at most
 *     LIMITS.answerChars characters of it. null / None / undefined / a NULL
 *     char* print an empty answer ("@@ANSWER@@ \n"). Any other non-string is
 *     a runtime_error with type 'TypeError', message
 *     "solve() must return a string, not <type>", and test = the board index.
 *  H4 If solve throws, traps, overflows the stack or exits, stop there: report
 *     runtime_error (or the limit that stopped it) with the player's line when
 *     known and test = the board index. Print no answer for that board or any
 *     later one. exit() / System.exit / sys.exit / process.exit inside solve
 *     is a runtime_error ("solve() must return; it called exit(3)").
 *  H5 Print nothing else to stdout. The harness's own problems go in the
 *     RuntimeOutcome (contract.ts), never in stdout or stderr.
 *  H6 One time limit covers every board together, from io.started().
 * The page then requires exactly T answer lines (parseStdout): fewer after an
 * 'ok' outcome, or more at all (the player printed the marker), make the run
 * 'crashed': the program broke the game's harness.
 */
import { DIRECTIONS, FLOOR, START, WALL, applyMove, blocksLeft, initialState, isWon, parseGrid, rollPath, toXY } from '../engine.ts'
import type { Direction, MoveResult, State } from '../engine.ts'
import { minInk } from '../solver.ts'
import { LANGUAGE_INFO, LIMITS } from './contract.ts'
import type { BoardInput, Language, RunKind, RunLanguage, RunResult } from './contract.ts'

// ------------------------------------------------------------------ the boards

/** A board for the coding level. `ink` is `par + slack`. */
export type Board = BoardInput & {
  /** stable id: 'random-<seed>' or 'hidden-<name>' */
  id: string
  /** a short label for a failing test: 'Corridor', 'Trap roll' */
  name: string
  /** the least ink that clears it (solver.minInk) */
  par: number
  /** 0, 1 or 2 */
  slack: number
}

/** Rows and columns of every board the level hands out (hidden tests and random maps), each 4 to 6. */
export const BOARD_SIZES = { min: 4, max: 6 } as const
/** The visible random map is at least this big (5 x 5 to 6 x 6). */
export const VISIBLE_MIN_SIZE = 5
export const MAX_SLACK = 2
/** Random maps keep at least this share of their blocks as floor, so they read as mazes, not walls. */
export const MIN_FLOOR_SHARE = 0.5
/** No board hands out more ink than this (the statement promises it), so no answer needs more than 60 moves. */
export const MAX_INK = 60

/**
 * The time limit for all boards of a run together, from io.started(), before
 * the language's timeFactor. A correct plain search (PLAIN_SEARCH_BUDGET) needs
 * a small part of it in every runtime.
 */
export const TIME_LIMIT_MS: Record<RunKind, number> = { run: 4000, submit: 8000 }

/** The time limit a run gets: TIME_LIMIT_MS[kind] times LANGUAGE_INFO[language].timeFactor. */
export function timeLimitFor(language: RunLanguage, kind: RunKind): number {
  return Math.round(TIME_LIMIT_MS[kind] * LANGUAGE_INFO[language].timeFactor)
}

/**
 * The cost of a plain brute force on a board: positions (calls) visited by a
 * depth-first search that tries the four moves in a fixed order, skips moves
 * that do not move the ball, rolls exactly as the engine does (the ink can run
 * dry mid-roll), stops at the first win and gives up on a line when the ink is
 * gone. No pruning and no memo. Every board the level hands out is cleared
 * within this many calls in EVERY one of the 24 move orders, so a correct
 * brute force passes in every language: native CPython runs about 2 million
 * such calls a second, Pyodide and QuickJS several times fewer.
 */
export const PLAIN_SEARCH_BUDGET = 200_000
/** The same measure summed over a whole submission (worst order per board). */
export const SUBMISSION_SEARCH_BUDGET = 1_000_000

/** A small seeded generator (mulberry32, as in scripts/inkmaze-generate.mjs). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Mixes numbers into one 32-bit seed. */
function mix(...parts: number[]): number {
  let h = 2166136261
  for (const part of parts) {
    h = Math.imul(h ^ (part >>> 0), 16777619)
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995)
  }
  return h >>> 0
}

/** Every block any roll from any reachable stop passes over, plus the start. */
function touchedByRolls(grid: readonly string[]): { touched: Set<number>; state: State } {
  const state = initialState({ grid, ink: Number.POSITIVE_INFINITY })
  const stops = [state.ball]
  const seen = new Set(stops)
  const touched = new Set(stops)
  for (let k = 0; k < stops.length; k++) {
    for (const direction of DIRECTIONS) {
      const path = rollPath({ ...state, ball: stops[k] }, direction)
      for (const i of path) touched.add(i)
      const end = path[path.length - 1]
      if (path.length && !seen.has(end)) { seen.add(end); stops.push(end) }
    }
  }
  return { touched, state }
}

/** Random walls and start; floor no roll can reach is filled in until nothing changes. */
function makeGrid(random: () => number, rows: number, cols: number): string[] {
  const cells = rows * cols
  const share = 0.1 + random() * 0.25
  const walls = Math.round(cells * share)
  const order = [...Array(cells).keys()]
  for (let i = cells - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  const chars: string[] = Array(cells).fill(FLOOR)
  for (const i of order.slice(0, walls)) chars[i] = WALL
  const floors = order.slice(walls)
  chars[floors[Math.floor(random() * floors.length)]] = START
  const toGrid = () => Array.from({ length: rows }, (_, y) => chars.slice(y * cols, y * cols + cols).join(''))
  for (;;) {
    const { touched } = touchedByRolls(toGrid())
    let filled = 0
    for (let i = 0; i < cells; i++) if (chars[i] === FLOOR && !touched.has(i)) { chars[i] = WALL; filled++ }
    if (!filled) return toGrid()
  }
}

// ------------------------------------------------------- the plain brute force

/** A board as flat arrays, for searches that must be fast (many calls per board). */
type Packed = {
  /** floor blocks, numbered 0..n-1 in reading order */
  n: number
  start: number
  /** per floor block and direction (index b * 4 + d, d in DIRECTIONS order): the floor blocks a full roll passes onto */
  rolls: Int16Array[]
}

function pack(grid: readonly string[]): Packed {
  const { width, height, cells, start } = parseGrid(grid)
  const id = new Int16Array(cells.length).fill(-1)
  let n = 0
  for (let i = 0; i < cells.length; i++) if (cells[i] === FLOOR) id[i] = n++
  const rolls: Int16Array[] = []
  const steps = [[0, -1], [0, 1], [-1, 0], [1, 0]]
  for (let i = 0; i < cells.length; i++) {
    if (id[i] < 0) continue
    for (const [dx, dy] of steps) {
      const path: number[] = []
      let x = i % width
      let y = Math.floor(i / width)
      for (;;) {
        x += dx
        y += dy
        if (x < 0 || y < 0 || x >= width || y >= height || cells[y * width + x] !== FLOOR) break
        path.push(id[y * width + x])
      }
      rolls.push(Int16Array.from(path))
    }
  }
  return { n, start: id[start], rolls }
}

export type SearchOptions = {
  /** the move order, as indexes into DIRECTIONS (0 up, 1 down, 2 left, 3 right); default [0, 1, 2, 3] */
  order?: readonly number[]
  /** give up past this many calls (the result is then Infinity); default PLAIN_SEARCH_BUDGET */
  cap?: number
  /** also give up on a line when the ink left is less than the blocks still uncolored */
  prune?: boolean
  /** only rolls that fit in the ink left (a solver that does not know the ball stops when the ink runs dry) */
  fullRollsOnly?: boolean
  /** never roll straight back the way the ball just came (a common wrong shortcut) */
  noReversal?: boolean
}

export type SearchResult = {
  /** calls the search made (Infinity past the cap) */
  nodes: number
  /** the moves it found, as letters, or null when it found none (or gave up) */
  moves: string | null
}

const OPPOSITE = [1, 0, 3, 2]
const DIGIT_LETTERS = ['U', 'D', 'L', 'R'] as const

/**
 * A depth-first search as a player would write it (see PLAIN_SEARCH_BUDGET),
 * on packed arrays so it is quick enough to run while a board is generated.
 * It follows the engine's rules exactly; the tests check it against applyMove.
 */
export function plainSearch(board: BoardInput, options: SearchOptions = {}): SearchResult {
  const { order = [0, 1, 2, 3], cap = PLAIN_SEARCH_BUDGET, prune = false, fullRollsOnly = false, noReversal = false } = options
  const { n, start, rolls } = pack(board.grid)
  const colored = new Uint8Array(n)
  colored[start] = 1
  let count = 1
  let nodes = 0
  const path: number[] = []
  const fresh = new Int16Array(64 * 64)
  const go = (at: number, left: number, last: number, depth: number): boolean => {
    if (++nodes > cap) return false
    if (count === n) return true
    if (left <= 0) return false
    if (prune && left < n - count) return false
    const base = depth * 64
    for (const d of order) {
      if (noReversal && last >= 0 && d === OPPOSITE[last]) continue
      const roll = rolls[at * 4 + d]
      if (!roll.length) continue
      if (fullRollsOnly && roll.length > left) continue
      const length = Math.min(roll.length, left)
      let added = 0
      for (let k = 0; k < length; k++) {
        const b = roll[k]
        if (!colored[b]) { colored[b] = 1; fresh[base + added++] = b }
      }
      count += added
      path.push(d)
      if (go(roll[length - 1], left - length, d, depth + 1)) return true
      path.pop()
      count -= added
      for (let k = 0; k < added; k++) colored[fresh[base + k]] = 0
      if (nodes > cap) return false
    }
    return false
  }
  const found = go(start, board.ink, -1, 0)
  if (nodes > cap) return { nodes: Number.POSITIVE_INFINITY, moves: null }
  return { nodes, moves: found ? path.map((d) => DIGIT_LETTERS[d]).join('') : null }
}

/** All 24 move orders. */
export const MOVE_ORDERS: readonly (readonly number[])[] = (() => {
  const out: number[][] = []
  const walk = (prefix: number[], rest: number[]) => {
    if (!rest.length) { out.push(prefix); return }
    rest.forEach((d, i) => walk([...prefix, d], [...rest.slice(0, i), ...rest.slice(i + 1)]))
  }
  walk([], [0, 1, 2, 3])
  return out
})()

/** The most calls a plain search needs on a board, over all 24 move orders (Infinity past the cap). */
export function plainSearchCost(board: BoardInput, cap = PLAIN_SEARCH_BUDGET): number {
  let worst = 0
  for (const order of MOVE_ORDERS) {
    const { nodes, moves } = plainSearch(board, { order, cap })
    if (!Number.isFinite(nodes) || moves === null) return Number.POSITIVE_INFINITY
    if (nodes > worst) worst = nodes
  }
  return worst
}

// --------------------------------------------------------- checking a board

/** True when one roll from the start colors every floor block (the board must need at least two moves). */
export function oneRollWins(grid: readonly string[]): boolean {
  const start = initialState({ grid, ink: Number.POSITIVE_INFINITY })
  return DIRECTIONS.some((direction) => {
    const { state, cost } = applyMove(start, direction)
    return cost > 0 && isWon(state)
  })
}

/**
 * What is wrong with a board, as messages; [] for a good one. A good board
 * has 4-6 rows and 4-6 columns, exactly one ball, every floor block lies on
 * some roll, it needs at least two moves, par is the least ink (minInk), ink
 * is par plus 0 to 2 and at most MAX_INK, and a plain search clears it within
 * PLAIN_SEARCH_BUDGET calls in every move order.
 */
export function boardProblems(board: BoardInput & { par?: number; slack?: number }): string[] {
  const problems: string[] = []
  let parsed: ReturnType<typeof parseGrid>
  try {
    parsed = parseGrid(board.grid)
  } catch (error) {
    return [(error as Error).message]
  }
  const { width, height } = parsed
  const { min, max } = BOARD_SIZES
  if (width < min || width > max || height < min || height > max) problems.push(`size ${height} x ${width} is outside ${min}-${max}`)
  const { touched, state } = touchedByRolls(board.grid)
  for (let i = 0; i < state.cells.length; i++) {
    if (state.cells[i] === FLOOR && !touched.has(i)) {
      const [x, y] = toXY(state, i)
      problems.push(`no roll reaches the block at row ${y + 1}, column ${x + 1}`)
    }
  }
  if (oneRollWins(board.grid)) problems.push('one roll clears it')
  const best = minInk(board)
  if (!best) return [...problems, 'no line of play colors every block']
  if (!Number.isInteger(board.ink)) problems.push('ink is not a whole number')
  if (board.par !== undefined && board.par !== best.ink) problems.push(`par is ${best.ink}, not ${board.par}`)
  if (board.ink < best.ink) problems.push(`ink ${board.ink} is under par ${best.ink}`)
  if (board.ink > best.ink + MAX_SLACK) problems.push(`ink ${board.ink} is more than par ${best.ink} + ${MAX_SLACK}`)
  if (board.slack !== undefined && board.slack !== board.ink - best.ink) problems.push(`slack is ${board.ink - best.ink}, not ${board.slack}`)
  if (board.ink > MAX_INK) problems.push(`ink ${board.ink} is more than ${MAX_INK}`)
  if (problems.length) return problems
  if (!Number.isFinite(plainSearchCost(board))) problems.push(`a plain search needs more than ${PLAIN_SEARCH_BUDGET} calls in some move order`)
  return problems
}

/** Thrown when no good board turned up for a seed (it does not happen in practice). */
export class BoardGenerationError extends Error {}

export type BoardOptions = {
  /** rows, 4-6 (default: the seed picks 5-6) */
  rows?: number
  /** columns, 4-6 (default: the seed picks 5-6) */
  cols?: number
  /** extra ink, 0-2 (default: the seed picks) */
  slack?: number
}

const checkSize = (name: string, value: number | undefined) => {
  if (value !== undefined && !(Number.isInteger(value) && value >= BOARD_SIZES.min && value <= BOARD_SIZES.max)) throw new RangeError(`${name} must be ${BOARD_SIZES.min}-${BOARD_SIZES.max}, not ${value}`)
}

/**
 * The random map for a seed: the same seed always gives the same board, and
 * every board passes boardProblems. The UI shows it and runs it first; pick
 * the seed any way you like (a new one for "New map").
 */
export function randomBoard(seed: number, options: BoardOptions = {}): Board {
  if (!Number.isInteger(seed)) throw new RangeError(`seed must be an integer, not ${seed}`)
  const { rows, cols, slack } = options
  checkSize('rows', rows)
  checkSize('cols', cols)
  if (slack !== undefined && !(Number.isInteger(slack) && slack >= 0 && slack <= MAX_SLACK)) throw new RangeError(`slack must be 0-${MAX_SLACK}, not ${slack}`)
  const span = BOARD_SIZES.max - VISIBLE_MIN_SIZE + 1
  for (let attempt = 0; attempt < 400; attempt++) {
    const random = mulberry32(mix(seed, attempt, rows ?? 0, cols ?? 0))
    const h = rows ?? VISIBLE_MIN_SIZE + Math.floor(random() * span)
    const w = cols ?? VISIBLE_MIN_SIZE + Math.floor(random() * span)
    const grid = makeGrid(random, h, w)
    const extra = slack ?? Math.floor(random() * (MAX_SLACK + 1))
    const floors = grid.join('').split('').filter((c) => c !== WALL).length
    if (floors < MIN_FLOOR_SHARE * h * w || oneRollWins(grid)) continue
    const best = minInk({ grid })
    if (!best || best.moves.length < 2) continue
    const board: Board = { id: `random-${seed}`, name: 'Random map', grid, ink: best.ink + extra, par: best.ink, slack: extra }
    if (boardProblems(board).length) continue
    return board
  }
  throw new BoardGenerationError(`no good board for seed ${seed}`)
}

// --------------------------------------------------------- the hidden tests

/** A hidden test, frozen: the grids never change by accident when the generator does. */
export type HiddenTest = Board & {
  /** what it catches, in plain words (shown after a failed submission) */
  catches: string
}

const hidden = (id: string, name: string, catches: string, ink: number, par: number, grid: string[]): HiddenTest =>
  Object.freeze({ id: `hidden-${id}`, name, catches, grid: Object.freeze(grid) as string[], ink, par, slack: ink - par })

/**
 * The hidden tests, in the order a submission runs them (after the visible
 * map). Frozen literals; scripts/test-inkmaze-code.mjs re-derives par with
 * minInk and checks that each board still has the property `catches` claims.
 */
export const HIDDEN_TESTS: readonly HiddenTest[] = Object.freeze([
  hidden('two-moves', 'Two moves', 'the fewest moves a board can need', 6, 6, [
    'o...',
    '###.',
    '###.',
    '###.',
  ]),
  hidden('corridor', 'Corridor', 'a single winding line of play, with no ink to spare', 20, 20, [
    'o.....',
    '#####.',
    '......',
    '.#####',
    '......',
    '#####.',
  ]),
  hidden('wide', 'Wide board', 'more columns than rows (a solution that mixes up rows and columns fails)', 24, 24, [
    '..###.',
    '......',
    '...#..',
    '...#.o',
  ]),
  hidden('tall', 'Tall board', 'more rows than columns (a solution that mixes up rows and columns fails)', 23, 22, [
    '.###',
    '..o#',
    '....',
    '....',
    '###.',
    '....',
  ]),
  hidden('corner', 'Corner start', 'a ball in a corner, where two of the four moves hit the edge', 33, 32, [
    'o..#.#',
    '.....#',
    '##.#.#',
    '.....#',
    '......',
  ]),
  hidden('last-drop', 'Last drop', 'the ink runs dry in the middle of the last roll, exactly on the last block', 26, 26, [
    '.....',
    '...#.',
    '...#.',
    '#.##.',
    '.o...',
    '.....',
  ]),
  hidden('trap-roll', 'Trap roll', 'the first legal move (in U, D, L, R order) can never lead to a win', 31, 31, [
    '.#...',
    '..o.#',
    '.....',
    '.##..',
    '.....',
  ]),
  hidden('dead-ends', 'Dead ends', 'every win rolls straight back the way it came at least once', 23, 23, [
    '.#....',
    '.#.##.',
    '.#.##.',
    '....o.',
    '.#...#',
  ]),
  hidden('backtrack', 'Backtrack', 'most of the ink goes on blocks that are colored already', 27, 27, [
    '..#...',
    '...o##',
    '#.#.##',
    '#.#.##',
    '#.#.##',
  ]),
  hidden('open-floor', 'Open floor', 'few walls and many legal moves at every step, with 2 ink to spare', 43, 41, [
    '.....#',
    '......',
    '.o....',
    '..##..',
    '......',
    '#.....',
  ]),
  hidden('long-way', 'Long way round', 'a long line of play: at least 18 moves', 39, 38, [
    'o..#..',
    '#.....',
    '......',
    '.#....',
    '.#...#',
    '..#...',
  ]),
  hidden('exact-ink', 'Exact ink', 'a full-size board on exact ink where a plain search must look hard', 30, 30, [
    '......',
    '####.#',
    '..##..',
    '#.....',
    '#.###.',
    '#....o',
  ]),
])

/** What a Submit runs: the visible map first, then the hidden tests. */
export function submissionTests(visible: Board): Board[] {
  return [visible, ...HIDDEN_TESTS]
}

// -------------------------------------------------------------------- stdin

/** The text every harness reads (see the header). Throws on a malformed board. */
export function formatStdin(tests: readonly BoardInput[]): string {
  if (!Array.isArray(tests) || tests.length < 1 || tests.length > LIMITS.tests) throw new RangeError(`a run needs 1-${LIMITS.tests} boards, not ${tests?.length}`)
  const out: string[] = [String(tests.length)]
  tests.forEach((test, i) => {
    const { width, height } = parseGrid(test.grid)
    if (width > 12 || height > 12) throw new RangeError(`board ${i} is larger than 12 x 12`)
    if (!Number.isInteger(test.ink) || test.ink < 1 || test.ink > 10_000) throw new RangeError(`board ${i} has ink ${test.ink}`)
    out.push(`${height} ${width} ${test.ink}`, ...test.grid)
  })
  return out.join('\n') + '\n'
}

/** Reads formatStdin's text back (for reference harnesses and tests). Throws on anything else. */
export function parseStdin(text: string): BoardInput[] {
  const lines = text.split('\n')
  if (lines.pop() !== '') throw new SyntaxError('stdin must end with a line break')
  let at = 0
  const next = () => {
    if (at >= lines.length) throw new SyntaxError('stdin ended early')
    return lines[at++]
  }
  const count = next()
  if (!/^[1-9]\d*$/.test(count)) throw new SyntaxError(`bad board count '${count}'`)
  const tests: BoardInput[] = []
  for (let t = 0; t < Number(count); t++) {
    const head = next()
    const match = /^([1-9]\d*) ([1-9]\d*) ([1-9]\d*)$/.exec(head)
    if (!match) throw new SyntaxError(`bad board header '${head}'`)
    const [h, w, ink] = match.slice(1).map(Number)
    const grid: string[] = []
    for (let y = 0; y < h; y++) {
      const row = next()
      if (row.length !== w || !/^[#.o]+$/.test(row)) throw new SyntaxError(`bad row '${row}' in board ${t}`)
      grid.push(row)
    }
    parseGrid(grid)
    tests.push({ grid, ink })
  }
  if (at !== lines.length) throw new SyntaxError('extra lines after the last board')
  return tests
}

// ------------------------------------------------------------------- stdout

/** What the harness prints before each answer. Reserved: the player printing it makes the run 'crashed'. */
export const ANSWER_MARKER = '@@ANSWER@@'

/** What escapeAnswer turns '@' into (FULLWIDTH COMMERCIAL AT), so an answer can never contain ANSWER_MARKER. */
export const ESCAPED_AT = '＠'

/**
 * H3's escaping, as every harness must do it: control characters become their
 * visible U+2400 symbols (U+0000-U+001F -> U+2400-U+241F, U+007F -> U+2421),
 * '@' becomes U+FF20 (so the answer can never hold the marker, and the
 * harness's own marker is always the last one on its line), lone surrogates
 * (invalid UTF-8 in C) become U+FFFD, and the result is cut to
 * LIMITS.answerChars UTF-16 code units. Only answers with a character other
 * than U, D, L, R change, and the judge rejects those anyway (bad_char).
 */
export function escapeAnswer(moves: string): string {
  let out = ''
  for (let i = 0; i < moves.length && out.length < LIMITS.answerChars; i++) {
    const code = moves.charCodeAt(i)
    if (code < 0x20) out += String.fromCharCode(0x2400 + code)
    else if (code === 0x7f) out += '␡'
    else if (code === 0x40) out += ESCAPED_AT
    else if (code >= 0xd800 && code <= 0xdbff) {
      const low = moves.charCodeAt(i + 1)
      if (low >= 0xdc00 && low <= 0xdfff) { out += moves[i] + moves[i + 1]; i++ } else out += '�'
    } else if (code >= 0xdc00 && code <= 0xdfff) out += '�'
    else out += moves[i]
  }
  return out.slice(0, LIMITS.answerChars)
}

/** One answer line exactly as a harness prints it. */
export const answerLine = (moves: string): string => `${ANSWER_MARKER} ${escapeAnswer(moves)}\n`

export type ParsedStdout = {
  /** exactly `expected` entries; '' where no answer came */
  answers: string[]
  /** answer lines kept: min(found, expected) */
  answered: number
  /** every answer line seen (more than expected means the program printed the marker itself) */
  found: number
  /** the player's prints, answer lines removed, control characters made visible, at most LIMITS.consoleChars */
  console: string
  consoleTruncated: boolean
  /** some answer was longer than LIMITS.answerChars and was cut */
  answerTruncated: boolean
}

/** Control characters other than tab and line break, made visible (U+2400 block) for the console. */
const visible = (text: string) =>
  text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, (c) => (c === '\u007f' ? '␡' : String.fromCharCode(0x2400 + c.charCodeAt(0))))

/**
 * Splits a run's stdout into answers and the player's console. A line holds an
 * answer when it contains ANSWER_MARKER. The answer is what follows the LAST
 * marker on the line (one space skipped, a trailing '\r' dropped): the harness
 * prints its marker last, and escapeAnswer keeps '@' out of answers. What the
 * player printed before the first marker on that line (output without a line
 * break of its own) goes to the console. Every marker counts in `found`, so a
 * marker the player printed shows up as found > expected. Any odd character in
 * an answer stays in it, so the judge can point at it. Linear in the size of
 * stdout, whatever it holds.
 */
export function parseStdout(stdout: string, expected: number): ParsedStdout {
  const answers: string[] = []
  const consoleParts: string[] = []
  let consoleRoom: number = LIMITS.consoleChars
  let consoleTruncated = false
  let answerTruncated = false
  let found = 0
  /** copies stdout[from, to) to the console, at most what still fits (so a flood costs nothing) */
  const toConsole = (from: number, to: number, lineBreak: boolean) => {
    if (consoleTruncated || to <= from && !lineBreak) return
    if (lineBreak && to > from && stdout.charCodeAt(to - 1) === 13) to-- // '\r\n'
    const length = to - from + (lineBreak ? 1 : 0)
    if (length > consoleRoom) {
      consoleParts.push(stdout.slice(from, from + consoleRoom))
      consoleRoom = 0
      consoleTruncated = true
      return
    }
    consoleParts.push(lineBreak ? stdout.slice(from, to) + '\n' : stdout.slice(from, to))
    consoleRoom -= length
  }
  let marker = stdout.indexOf(ANSWER_MARKER)
  let start = 0
  while (start < stdout.length) {
    const end = stdout.indexOf('\n', start)
    const stop = end < 0 ? stdout.length : end
    if (marker >= 0 && marker < start) marker = stdout.indexOf(ANSWER_MARKER, start)
    if (marker < 0 || marker >= stop) {
      toConsole(start, stop, end >= 0)
    } else {
      if (marker > start) toConsole(start, marker, true)
      // every marker on the line counts; the answer follows the last one
      let last = marker
      while (marker >= 0 && marker < stop) {
        found++
        last = marker
        marker = stdout.indexOf(ANSWER_MARKER, marker + ANSWER_MARKER.length)
      }
      let from = last + ANSWER_MARKER.length
      if (stdout[from] === ' ') from++
      let to = stop
      if (to > from && stdout.charCodeAt(to - 1) === 13) to--
      if (to - from > LIMITS.answerChars) { to = from + LIMITS.answerChars; answerTruncated = true }
      if (answers.length < expected) answers.push(stdout.slice(from, to))
    }
    start = stop + 1
  }
  const answered = answers.length
  while (answers.length < expected) answers.push('')
  return { answers, answered, found, console: visible(consoleParts.join('')), consoleTruncated, answerTruncated }
}

// -------------------------------------------------------------------- judge

export const MOVE_LETTERS = { U: 'up', D: 'down', L: 'left', R: 'right' } as const
export type MoveLetter = keyof typeof MOVE_LETTERS
const LETTERS: Record<Direction, MoveLetter> = { up: 'U', down: 'D', left: 'L', right: 'R' }
export const letterOf = (direction: Direction): MoveLetter => LETTERS[direction]
const isLetter = (char: string): char is MoveLetter => char === 'U' || char === 'D' || char === 'L' || char === 'R'

/** One move the engine applied: what the game screen animates. */
export type JudgeStep = {
  /** 0-based position in the answer */
  index: number
  letter: MoveLetter
  direction: Direction
  /** the engine's MoveResult: the new state, the ink spent and the blocks rolled onto */
  result: MoveResult
}

type VerdictBase = {
  /** one line for the UI */
  message: string
  /** the moves the engine applied, in order: the ball's whole journey up to the verdict */
  steps: JudgeStep[]
  /** the state after the last applied move (the start state when none was) */
  final: State
  inkUsed: number
  blocksLeft: number
}

export type Verdict =
  /** every floor block colored, and the answer ends right there */
  | (VerdictBase & { kind: 'accepted'; moves: number })
  /** the answer was '' ("your code returned no moves, so the ball never moved") */
  | (VerdictBase & { kind: 'empty' })
  /** answer[index] is not U, D, L or R; checked over the whole answer before any move is played */
  | (VerdictBase & { kind: 'bad_char'; index: number; char: string })
  /** move `index` does not move the ball: a wall or the edge is right next to it */
  | (VerdictBase & { kind: 'blocked'; index: number; letter: MoveLetter; against: 'wall' | 'edge' })
  /** the ink ran out during move `index` with blocks still uncolored; `cutShort`: in the middle of the roll */
  | (VerdictBase & { kind: 'out_of_ink'; index: number; letter: MoveLetter; cutShort: boolean })
  /** every move played, ink left, blocks still uncolored */
  | (VerdictBase & { kind: 'unfinished'; inkLeft: number })
  /** every block was colored before move `index`; `extra` moves follow it */
  | (VerdictBase & { kind: 'extra_moves'; index: number; extra: number })

export type VerdictKind = Verdict['kind']
export const VERDICT_KINDS: readonly VerdictKind[] = ['accepted', 'empty', 'bad_char', 'blocked', 'out_of_ink', 'unfinished', 'extra_moves']

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const CONTROL_NAMES: Record<number, string> = {
  0x00: 'a NUL byte (\\0)', 0x09: 'a tab (\\t)', 0x0a: 'a line break (\\n)', 0x0d: 'a carriage return (\\r)', 0x1b: 'an escape character',
}

/** How to name a character that is not a move (the U+2400 symbols name the control character they stand for). */
export function describeChar(char: string): string {
  const code = char.codePointAt(0) ?? 0
  if (char === ' ') return 'a space'
  if (/^[udlr]$/.test(char)) return `'${char}' (moves are capital letters: ${char.toUpperCase()})`
  const control = code < 0x20 ? code : code >= 0x2400 && code <= 0x241f ? code - 0x2400 : code === 0x7f || code === 0x2421 ? 0x7f : -1
  if (control >= 0) return CONTROL_NAMES[control] ?? `the control character U+${control.toString(16).toUpperCase().padStart(4, '0')}`
  const hex = `U+${code.toString(16).toUpperCase().padStart(4, '0')}`
  if (code === 0xfffd) return 'an invalid character (U+FFFD)'
  if (char === ESCAPED_AT) return "'@'" // the harness escaped it (escapeAnswer)
  if (code >= 0x80 && code < 0xa0) return `the control character ${hex}`
  if (code > 0x20 && code < 0x7f) return `'${char}'`
  return `'${char}' (${hex})`
}

const SIDE: Record<Direction, string> = { up: 'above', down: 'below', left: 'to the left of', right: 'to the right of' }

/**
 * Plays an answer on a board with the engine and says what happened.
 * Order of checks: empty; then every character (before any move is played);
 * then each move in turn: moves after a win, a move that does not move the
 * ball, the ink running out with blocks left; finally a win or blocks left.
 */
export function judge(grid: readonly string[], ink: number, moves: string): Verdict {
  const start = initialState({ grid, ink })
  const steps: JudgeStep[] = []
  let state = start
  const base = () => ({ steps, final: state, inkUsed: start.ink - state.ink, blocksLeft: blocksLeft(state) })
  if (moves === '') return { kind: 'empty', message: 'Your code returned no moves, so the ball never moved.', ...base() }
  for (let i = 0; i < moves.length; i++) {
    if (isLetter(moves[i])) continue
    const char = String.fromCodePoint(moves.codePointAt(i) ?? 0)
    return { kind: 'bad_char', index: i, char, message: `Move ${i + 1} is ${describeChar(char)}: use only U, D, L and R.`, ...base() }
  }
  for (let i = 0; i < moves.length; i++) {
    const letter = moves[i] as MoveLetter
    if (isWon(state)) {
      const extra = moves.length - i
      return { kind: 'extra_moves', index: i, extra, message: `Every block was colored after move ${i}, but your answer has ${plural(extra, 'more move')}.`, ...base() }
    }
    const direction = MOVE_LETTERS[letter]
    const result = applyMove(state, direction)
    if (!result.cost) {
      const [x, y] = toXY(state, state.ball)
      const nx = x + (direction === 'left' ? -1 : direction === 'right' ? 1 : 0)
      const ny = y + (direction === 'up' ? -1 : direction === 'down' ? 1 : 0)
      const against = nx < 0 || ny < 0 || nx >= state.width || ny >= state.height ? 'edge' : 'wall'
      const where = against === 'edge' ? `the edge of the board is ${SIDE[direction]} it` : `the block ${SIDE[direction]} it is a wall`
      return { kind: 'blocked', index: i, letter, against, message: `Move ${i + 1} (${letter}) does not move the ball: ${where}.`, ...base() }
    }
    steps.push({ index: i, letter, direction, result })
    const full = rollPath(state, direction).length
    state = result.state
    if (!isWon(state) && state.ink <= 0) {
      const cutShort = result.cost < full
      const left = blocksLeft(state)
      return {
        kind: 'out_of_ink', index: i, letter, cutShort,
        message: `The ink ran out ${cutShort ? 'in the middle of' : 'at the end of'} move ${i + 1} (${letter}) with ${plural(left, 'block')} still uncolored.`,
        ...base(),
      }
    }
  }
  if (isWon(state)) {
    return { kind: 'accepted', moves: moves.length, message: `Accepted: every block colored in ${plural(moves.length, 'move')}, using ${start.ink - state.ink} of ${start.ink} ink.`, ...base() }
  }
  const left = blocksLeft(state)
  return { kind: 'unfinished', inkLeft: state.ink, message: `After your last move (move ${moves.length}) ${plural(left, 'block is', 'blocks are')} still uncolored, with ${state.ink} ink left.`, ...base() }
}

export type Judgement = {
  accepted: boolean
  passed: number
  total: number
  verdicts: Verdict[]
  /** index of the first board that was not accepted, or -1 */
  firstFailure: number
}

/** Judges one answer per board ('' for a missing one). */
export function judgeAll(tests: readonly BoardInput[], answers: readonly string[]): Judgement {
  const verdicts = tests.map((test, i) => judge(test.grid, test.ink, answers[i] ?? ''))
  const passed = verdicts.filter((v) => v.kind === 'accepted').length
  return { accepted: passed === tests.length, passed, total: tests.length, verdicts, firstFailure: verdicts.findIndex((v) => v.kind !== 'accepted') }
}

/**
 * The verdicts for a finished run: judgeAll on its answers when the program
 * ran to the end (status 'ok'), null otherwise (the UI then shows the bug:
 * compile error, runtime error, a limit, a crash).
 */
export function judgeRun(tests: readonly BoardInput[], result: Pick<RunResult, 'status' | 'answers'>): Judgement | null {
  return result.status === 'ok' ? judgeAll(tests, result.answers) : null
}

/** Plain-words lines for a line of play, e.g. "R: rolls 3 blocks right (all new), 6 ink left". Stops at the first bad move. */
export function describeMoves(board: BoardInput, moves: string): string[] {
  let state = initialState(board)
  const lines: string[] = []
  for (const char of moves) {
    if (!isLetter(char) || isWon(state)) break
    const direction = MOVE_LETTERS[char]
    const { state: next, cost } = applyMove(state, direction)
    if (!cost) break
    let fresh = 0
    for (let i = 0; i < next.colored.length; i++) if (next.colored[i] === '1' && state.colored[i] !== '1') fresh++
    const cut = cost < rollPath(state, direction).length
    state = next
    lines.push(`${char}: rolls ${plural(cost, 'block')} ${direction} (${fresh === cost ? 'all new' : fresh ? `${fresh} new` : 'none new'}), ${state.ink} ink left${cut ? ' (the ink ran out mid-roll)' : ''}${isWon(state) ? ': every block is colored' : ''}`)
  }
  return lines
}

// ------------------------------------------------------------------ the problem

export type Example = {
  grid: readonly string[]
  ink: number
  output: string
  /** generated from the engine (describeMoves), so it is always true */
  explanation: string[]
}

export type Problem = {
  id: string
  title: string
  /** one line under the title */
  summary: string
  /** paragraphs; text in `backticks` is code */
  statement: string[]
  /** what solve() gets */
  input: string[]
  /** what it returns */
  output: string[]
  constraints: string[]
  examples: Example[]
  hints: string[]
}

const example = (grid: string[], ink: number, output: string): Example => ({ grid, ink, output, explanation: describeMoves({ grid, ink }, output) })

export const PROBLEM: Problem = {
  id: 'ink-maze-26',
  title: 'Paint the Floor',
  summary: 'Write a program that finds the moves for any Ink Maze board.',
  statement: [
    'You are given an Ink Maze board and a pot of ink. Return moves that color every floor block before the ink runs out.',
    'A move rolls the ball up (`U`), down (`D`), left (`L`) or right (`R`) in a straight line. It stops when the next block is a wall or the edge of the board.',
    'Every block the ball rolls onto becomes colored and costs 1 ink, even if it was colored already. If the ink runs out in the middle of a roll, the ball stops right there.',
    'You win as soon as every floor block is colored, even with the very last drop. Any line of play that wins is accepted.',
    'Run tries your code on the map next to the editor. Submit runs it on that map and then on hidden boards. Anything you print shows up in the console; only the string you return counts.',
  ],
  input: [
    '`grid`: the board, one string per row. `#` is a wall, `.` is floor, and `o` is the ball, which sits on a floor block that starts colored.',
    '`ink`: the ink in the pot.',
  ],
  output: [
    'The moves as one string of `U`, `D`, `L` and `R`, for example `"RDLU"`.',
    'Every move must move the ball (rolling straight into a wall or the edge is a mistake), and the string must end as soon as the last block is colored.',
  ],
  constraints: [
    `\`${BOARD_SIZES.min} <= rows, columns <= ${BOARD_SIZES.max}\` (boards are not always square)`,
    'The grid has exactly one `o`, and every floor block can be reached.',
    'Every board can be cleared with the ink given; some need every drop.',
    `\`ink <= ${MAX_INK}\`, so an answer never needs more than ${MAX_INK} moves and a search never goes deeper than that.`,
    `Run tries your code on the map shown, within ${TIME_LIMIT_MS.run / 1000} seconds. Submit runs ${HIDDEN_TESTS.length + 1} boards, and all of them together get ${TIME_LIMIT_MS.submit / 1000} seconds.`,
    `Recursion up to ${LIMITS.recursionDepth} calls deep is safe in every language (a search never needs more than ${MAX_INK + 1}).`,
  ],
  examples: [
    // a straight line of play, with 1 ink to spare
    example([
      'o...',
      '..##',
      '..##',
      '..##',
    ], 10, 'DRUR'),
    // the second roll goes back over colored blocks: they cost ink again
    example([
      '.###',
      '.##.',
      '.##.',
      'o...',
    ], 11, 'UDRU'),
    // exact ink: the last roll stops when the ink runs out, just as the last block is colored
    example([
      '....',
      '#...',
      '#.##',
      'o.##',
    ], 10, 'RULRDL'),
  ],
  hints: [
    'Try every move with a depth-first search, and undo it when it leads nowhere.',
    'Give up on a line early when the ink left is less than the number of blocks still uncolored.',
    'Remember the positions you have already reached (where the ball is and which blocks are colored) with at least as much ink left.',
  ],
}

/** The function each language's player writes, as the statement shows it. */
export const SIGNATURES: Record<Language, string> = {
  java: 'public String solve(String[] grid, int ink)',
  python: 'def solve(self, grid: list[str], ink: int) -> str',
  javascript: 'function solve(grid, ink)',
  c: 'char *solve(char **grid, int rows, int cols, int ink)',
  cpp: 'string solve(vector<string>& grid, int ink)',
}

/**
 * The editor's starting text per language. Each compiles, finds the ball and
 * returns no moves, so the first Run shows the 'empty' verdict.
 *  java       class Solution with that method (the harness news one Solution per board)
 *  python     class Solution with that method (one Solution() per board)
 *  javascript a top-level function solve (a function declaration, or var/let/const solve = ...)
 *  c          a function; grid is a private copy of `rows` NUL-terminated strings;
 *             return a NUL-terminated string (static or malloc'd; nobody frees it)
 *  cpp        class Solution with that method (one Solution per board)
 */
export const STARTER_CODE: Record<Language, string> = {
  java: `import java.util.*;

class Solution {
    // The four moves, in the order you try them: up, down, left, right
    static final char[] MOVES = {'U', 'D', 'L', 'R'};
    static final int[] DR = {-1, 1, 0, 0};
    static final int[] DC = {0, 0, -1, 1};

    /**
     * grid: one string per row. '#' wall, '.' floor, 'o' the ball (on floor, already colored).
     * ink:  the ink in the pot. Every block the ball rolls onto costs 1.
     * Return the moves as a string of U, D, L and R, for example "RDLU".
     */
    public String solve(String[] grid, int ink) {
        int rows = grid.length, cols = grid[0].length();
        int ballRow = 0, ballCol = 0;
        for (int r = 0; r < rows; r++)
            for (int c = 0; c < cols; c++)
                if (grid[r].charAt(c) == 'o') { ballRow = r; ballCol = c; }

        // TODO: try every move (a depth-first search), undo the ones that lead
        // nowhere, and return the first line of moves that colors every floor block.
        return "";
    }
}
`,
  python: `class Solution:
    # The four moves: (letter, row step, column step)
    MOVES = [('U', -1, 0), ('D', 1, 0), ('L', 0, -1), ('R', 0, 1)]

    def solve(self, grid: list[str], ink: int) -> str:
        # grid: one string per row. '#' wall, '.' floor, 'o' the ball (on floor, already colored).
        # ink:  the ink in the pot. Every block the ball rolls onto costs 1.
        # Return the moves as a string of U, D, L and R, for example "RDLU".
        rows, cols = len(grid), len(grid[0])
        ball = next((r, c) for r in range(rows) for c in range(cols) if grid[r][c] == 'o')

        # TODO: try every move (a depth-first search), undo the ones that lead
        # nowhere, and return the first line of moves that colors every floor block.
        return ""
`,
  javascript: `/**
 * @param {string[]} grid  one string per row. '#' wall, '.' floor, 'o' the ball (on floor, already colored)
 * @param {number} ink     the ink in the pot. Every block the ball rolls onto costs 1.
 * @return {string}        the moves as a string of U, D, L and R, for example "RDLU"
 */
function solve(grid, ink) {
  // The four moves: [letter, row step, column step]
  const MOVES = [['U', -1, 0], ['D', 1, 0], ['L', 0, -1], ['R', 0, 1]]
  const rows = grid.length, cols = grid[0].length
  let ballRow = 0, ballCol = 0
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (grid[r][c] === 'o') { ballRow = r; ballCol = c }

  // TODO: try every move (a depth-first search), undo the ones that lead
  // nowhere, and return the first line of moves that colors every floor block.
  return ""
}
`,
  c: `#include <stdbool.h>
#include <stdlib.h>
#include <string.h>

/* The four moves, in the order you try them: up, down, left, right */
static const char MOVES[4] = {'U', 'D', 'L', 'R'};
static const int DR[4] = {-1, 1, 0, 0};
static const int DC[4] = {0, 0, -1, 1};

/*
 * grid: rows strings of cols characters. '#' wall, '.' floor, 'o' the ball
 *       (on floor, already colored). It is your own copy: change it if you like.
 * ink:  the ink in the pot. Every block the ball rolls onto costs 1.
 * Return the moves as a string of U, D, L and R, for example "RDLU"
 * (a static buffer or malloc'd memory; it is never freed).
 */
char *solve(char **grid, int rows, int cols, int ink) {
    static char moves[64];
    int ballRow = 0, ballCol = 0;
    for (int r = 0; r < rows; r++)
        for (int c = 0; c < cols; c++)
            if (grid[r][c] == 'o') { ballRow = r; ballCol = c; }

    /* TODO: try every move (a depth-first search), undo the ones that lead
       nowhere, and return the first line of moves that colors every floor block. */
    moves[0] = '\\0';
    return moves;
}
`,
  cpp: `#include <string>
#include <vector>
using namespace std;

class Solution {
public:
    /**
     * grid: one string per row. '#' wall, '.' floor, 'o' the ball (on floor, already colored).
     * ink:  the ink in the pot. Every block the ball rolls onto costs 1.
     * Return the moves as a string of U, D, L and R, for example "RDLU".
     */
    string solve(vector<string>& grid, int ink) {
        // The four moves, in the order you try them: up, down, left, right
        const string MOVES = "UDLR";
        const int DR[4] = {-1, 1, 0, 0}, DC[4] = {0, 0, -1, 1};
        int rows = grid.size(), cols = grid[0].size();
        int ballRow = 0, ballCol = 0;
        for (int r = 0; r < rows; r++)
            for (int c = 0; c < cols; c++)
                if (grid[r][c] == 'o') { ballRow = r; ballCol = c; }

        // TODO: try every move (a depth-first search), undo the ones that lead
        // nowhere, and return the first line of moves that colors every floor block.
        return "";
    }
};
`,
}
