#!/usr/bin/env node
/**
 * Ink Maze level generator: random wall layouts, solved exactly, ranked by
 * how much planning they ask for.
 *
 *   node scripts/inkmaze-generate.mjs                    rank 300 boards per size, sizes 6 to 9
 *   node scripts/inkmaze-generate.mjs --seed 7 --count 800 --sizes 8-9 --top 30 --show 5
 *   node scripts/inkmaze-generate.mjs --pick             also choose ten to follow the current last level
 *   node scripts/inkmaze-generate.mjs --board s1-9-0042  print one board again, by its id
 *   node scripts/inkmaze-generate.mjs --hardness 20-25   the quick measures of how hard levels 20 to 25 are
 *   node scripts/inkmaze-generate.mjs --hardness 20-25 --slow   all eleven, and how the levels compare
 *
 * Options
 *   --seed n        the run's seed (default 1); the same seed gives the same boards
 *   --count n       boards to try per size (default 300)
 *   --sizes a-b     square sizes to try (default 6-9)
 *   --walls a-b     wall share in percent (default 15-35)
 *   --limit n       most positions minInk may explore before a board is dropped as slow (default 250000)
 *   --top n         rows in the ranked table (default 25)
 *   --show n        print the grids of the top n (default 0)
 *   --pick          choose ten boards that rise in difficulty after the current last level
 *   --slots list    board sizes for the ten picks (default 7,7,8,8,8,8,9,9,9,9)
 *   --pick-limit n  most positions minInk may explore on a picked board (default 80000)
 *   --mix n         at least n picks with a roll that has no way back, and n without (default 2)
 *   --step n        least rise in score from one pick to the next (default 1)
 *   --json file     write every kept board and its numbers to a JSON file
 *   --from file     rank (and pick from) the boards in a file written by --json instead of generating
 *   --hardness a-b  print the quick measures (scripts/inkmaze-hardness.mjs) for levels a to b, or
 *                   for every level without a-b, then stop
 *   --slow          with --hardness, also the beam search, the nested Monte Carlo runs and the
 *                   planner (minutes for a large level), and how each level compares with the ones
 *                   before it on those eleven measures (the curve table in scripts/test-inkmaze.mjs
 *                   comes from scripts/inkmaze-panel.mjs instead)
 *
 * What it does with each board
 *  1. Walls at random, a random start on floor. Floor that no roll from the
 *     start can pass over is filled in as wall (repeated until nothing
 *     changes), and the board is dropped if its walls end up outside --walls.
 *     So every floor block is reachable by rolls from the start, and some
 *     single line of play must be able to color all of them: a roll with no
 *     way back is allowed only if an order of play still clears the board.
 *  2. minInk (src/minigames/inkmaze/solver.ts) finds the exact least ink, or
 *     the board is dropped when the search passes --limit positions.
 *  3. Measures: moves in that line, ink per floor block (how much rolling
 *     back over colored blocks it takes), blocks that only one or two rolls
 *     ever pass over, whether some roll has no way back ("no-return"), and
 *     the best a simple greedy player does ("stuck" when it rolls into a
 *     part of the board it cannot leave with blocks still uncolored).
 *  4. Keeps the boards a greedy player cannot clear at par that also take at
 *     least twice as many moves as the board is wide and spend at least 1.25
 *     ink per floor block, and ranks them by score (see scoreOf).
 *
 * The greedy player: on every turn it takes the roll that colors the most new
 * blocks (or the most per drop of ink), and when no roll colors anything it
 * heads for the nearest block it can start coloring from. It is run with all
 * 24 direction orders for breaking ties, and the best of those runs counts.
 *
 * Levels 11 to 20 came from `--count 1500 --sizes 7-9 --pick`, run while the
 * game had ten levels (about three minutes).
 *
 * Levels 21 to 25 were chosen differently. The score above rewards long
 * lines and rolling back over colored blocks, but it does not see what makes
 * a level hard for a player who simply never makes a move that visibly loses
 * (more blocks left than ink, or a block no roll can reach again). A first
 * set was picked on the eleven measures in scripts/inkmaze-hardness.mjs
 * (MEASURES; `--hardness --slow` still prints them), and a review found it
 * easier at several steps for players those measures leave out. So the
 * levels now in levels.ts were chosen by a held-out panel of seventeen
 * players that the searches did not aim at (PANEL in
 * scripts/inkmaze-hardness.mjs; scripts/inkmaze-panel.mjs measures them with
 * scripts/inkmaze-panel.c): careful random players looking 0 to 30 moves
 * ahead, a careful player that prefers moves coloring many new blocks for
 * little ink, beam search under four scorings, careful depth-first search in
 * random and greedy order over 201 seeds, nested Monte Carlo search over 300
 * runs, and the moves of the least-ink line that go against the careful
 * player's instinct.
 *
 * The boards came from annealing searches outside this script (written in C
 * and Python for speed: toggle a wall, move the start, keep every floor block
 * reachable, stay at least 25% away from every level already here), aimed
 * at the panel's exact measures relative to level 20, and from the pool of
 * the earlier search. About 530 9 x 9 and 8 x 8 boards were measured on the
 * whole panel and about 5,100 more 8 x 8 boards on its exact part. The five
 * picked pass the curve rule in scripts/test-inkmaze.mjs (for every pair
 * from level 20 on, the later level is harder on at least twice as many
 * panel measures as it is easier, and never easier by a large margin) with
 * a wide margin: every later level is harder than every earlier one on at
 * least nine more measures than it is easier. Among the sets that pass, they
 * were chosen so that the last level is at least level 24 on every beam
 * width, on the random-order depth-first search and on the positions a
 * careful player can reach.
 * Level 25 is an 8 x 8 with two least-ink lines; levels.ts says why.
 * `node scripts/inkmaze-panel.mjs 20-25` prints the table rows again. With
 * all twenty-five levels in levels.ts, `--pick` looks for ten more after
 * level 25 by this script's own score.
 */
import { DIRECTIONS, FLOOR, WALL, START, applyMove, floorCount, initialState, rollPath } from '../src/minigames/inkmaze/engine.ts'
import { minInk, solvableWith } from '../src/minigames/inkmaze/solver.ts'
import { LEVELS } from '../src/minigames/inkmaze/levels.ts'
import { CAREFUL_MEASURES, MEASURES, compare, difference, hardness, nmcsWins, plannerDepth, smallestBeam } from './inkmaze-hardness.mjs'
import { readFileSync, writeFileSync } from 'node:fs'

// ------------------------------------------------------------------ options
const argv = process.argv.slice(2)
const option = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback
}
const range = (text) => {
  const [a, b] = String(text).split('-').map(Number)
  return [a, Number.isFinite(b) ? b : a]
}
const SEED = Number(option('seed', 1))
const COUNT = Number(option('count', 300))
const [SIZE_MIN, SIZE_MAX] = range(option('sizes', '6-9'))
const [WALL_MIN, WALL_MAX] = range(option('walls', '15-35'))
const LIMIT = Number(option('limit', 250_000))
const TOP = Number(option('top', 25))
const SHOW = Number(option('show', 0))
const PICK = argv.includes('--pick')
const JSON_OUT = option('json', '')
const BOARD = option('board', '')
const FROM = option('from', '')
const HARDNESS = argv.includes('--hardness') ? option('hardness', 'all') : ''
const SLOW = argv.includes('--slow')

if (SIZE_MIN < 4 || SIZE_MAX > 12 || SIZE_MIN > SIZE_MAX) throw new Error('--sizes must be within 4-12, smallest first')
if (WALL_MIN < 0 || WALL_MAX > 60 || WALL_MIN > WALL_MAX) throw new Error('--walls must be within 0-60, smallest first')

// ------------------------------------------------------------- random numbers
/** A small seeded generator (mulberry32): the same seed always gives the same numbers. */
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
/** One seed per board, from the run seed, the size and the board's number. */
const boardSeed = (seed, size, n) => {
  let h = 2166136261
  for (const part of [seed, size, n]) {
    h = Math.imul(h ^ part, 16777619)
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995)
  }
  return h >>> 0
}

/** The wall layout and start for board `n` of `size`: a text grid like the ones in levels.ts. */
function makeGrid(seed, size, n) {
  const random = mulberry32(boardSeed(seed, size, n))
  const cells = size * size
  // filling in unreachable floor (below) adds walls, so start a little under the range
  const share = (WALL_MIN * 0.6 + random() * (WALL_MAX - WALL_MIN * 0.6)) / 100
  const walls = Math.max(1, Math.round(cells * share))
  const order = [...Array(cells).keys()]
  for (let i = cells - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  const chars = Array(cells).fill(FLOOR)
  for (const i of order.slice(0, walls)) chars[i] = WALL
  const floors = order.slice(walls)
  chars[floors[Math.floor(random() * floors.length)]] = START
  const toGrid = () => {
    const grid = []
    for (let y = 0; y < size; y++) grid.push(chars.slice(y * size, y * size + size).join(''))
    return grid
  }
  // Floor that no roll from the start ever passes over becomes wall. Filling
  // it changes where rolls stop, so repeat until nothing changes.
  for (;;) {
    const graph = rollGraph(toGrid())
    const touched = new Set([graph.base.ball])
    for (const e of graph.edges) for (const i of e.path) touched.add(i)
    let filled = 0
    for (let i = 0; i < cells; i++) if (chars[i] === FLOOR && !touched.has(i)) { chars[i] = WALL; filled++ }
    if (!filled) return toGrid()
  }
}

// ------------------------------------------------------- the roll graph
/**
 * The blocks the ball can stop on, starting from the start, and every roll
 * between them (colors do not change where a roll goes).
 */
function rollGraph(grid) {
  const base = initialState({ grid, ink: Number.POSITIVE_INFINITY })
  const stops = [base.ball]
  const seen = new Set(stops)
  const edges = [] // { from, to, dir, path }
  for (let k = 0; k < stops.length; k++) {
    const at = stops[k]
    for (const dir of DIRECTIONS) {
      const path = rollPath({ ...base, ball: at }, dir)
      if (!path.length) continue
      const to = path[path.length - 1]
      edges.push({ from: at, to, dir, path })
      if (!seen.has(to)) { seen.add(to); stops.push(to) }
    }
  }
  return { base, stops, edges }
}

/** Strongly connected parts of the roll graph (Tarjan), as a block → part map. */
function components(stops, edges) {
  const out = new Map(stops.map((s) => [s, []]))
  for (const e of edges) out.get(e.from).push(e.to)
  const index = new Map()
  const low = new Map()
  const onStack = new Set()
  const stack = []
  const part = new Map()
  let counter = 0
  let parts = 0
  const visit = (v) => {
    index.set(v, counter); low.set(v, counter); counter++
    stack.push(v); onStack.add(v)
    for (const w of out.get(v)) {
      if (!index.has(w)) { visit(w); low.set(v, Math.min(low.get(v), low.get(w))) }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)))
    }
    if (low.get(v) === index.get(v)) {
      for (;;) {
        const w = stack.pop()
        onStack.delete(w)
        part.set(w, parts)
        if (w === v) break
      }
      parts++
    }
  }
  for (const s of stops) if (!index.has(s)) visit(s)
  return { part, parts }
}

/**
 * Can one line of play color every floor block? Inside a strongly connected
 * part the ball can take every roll, as often as it likes; between parts the
 * line goes one way only, through one roll per step. Tries those chains.
 */
function coverable(graph) {
  const { base, stops, edges } = graph
  const bit = (i) => 1n << BigInt(i)
  let all = 0n
  for (let i = 0; i < base.cells.length; i++) if (base.cells[i] === FLOOR) all |= bit(i)
  const mask = (path) => path.reduce((m, i) => m | bit(i), 0n)
  // reachable: every floor block lies on some roll from a reachable stop
  let anywhere = bit(base.ball)
  for (const e of edges) anywhere |= mask(e.path)
  if (anywhere !== all) return { reachable: false, coverable: false }
  const { part } = components(stops, edges)
  const inside = new Map()
  const leaving = new Map()
  for (const e of edges) {
    const a = part.get(e.from)
    const b = part.get(e.to)
    if (a === b) inside.set(a, (inside.get(a) ?? 0n) | mask(e.path))
    else {
      if (!leaving.has(a)) leaving.set(a, [])
      leaving.get(a).push({ to: b, mask: mask(e.path) })
    }
  }
  let budget = 50_000
  const walk = (p, covered) => {
    covered |= inside.get(p) ?? 0n
    if (covered === all) return true
    if (--budget < 0) return false
    for (const next of leaving.get(p) ?? []) if (walk(next.to, covered | next.mask)) return true
    return false
  }
  return { reachable: true, coverable: walk(part.get(base.ball), bit(base.ball)) }
}

/** How many different rolls (a stop and a direction) pass over each floor block. */
function waysIn(graph) {
  const ways = new Map()
  for (const e of graph.edges) for (const i of e.path) ways.set(i, (ways.get(i) ?? 0) + 1)
  let one = 0
  let two = 0
  for (let i = 0; i < graph.base.cells.length; i++) {
    if (graph.base.cells[i] !== FLOOR || i === graph.base.ball) continue
    const w = ways.get(i) ?? 0
    if (w === 1) one++
    else if (w === 2) two++
  }
  return { one, two }
}

// -------------------------------------------------------- the greedy player
const PERMUTATIONS = (function permute(items) {
  if (items.length <= 1) return [items]
  return items.flatMap((item, i) => permute([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]))
})([...DIRECTIONS])

/** Ink a greedy player spends to clear the board, or Infinity when it gets stuck. */
function greedy(grid, order, rule) {
  let state = initialState({ grid, ink: Number.POSITIVE_INFINITY })
  let ink = 0
  const fresh = (s, path) => path.filter((i) => s.colored[i] !== '1').length
  const left = (s) => {
    let n = 0
    for (let i = 0; i < s.cells.length; i++) if (s.cells[i] === FLOOR && s.colored[i] !== '1') n++
    return n
  }
  for (let turn = 0; turn < 400; turn++) {
    const remaining = left(state)
    if (!remaining) return ink
    // a roll that colors something new
    let best = null
    for (const dir of order) {
      const path = rollPath(state, dir)
      if (!path.length) continue
      const gain = fresh(state, path)
      if (!gain) continue
      // the last roll stops as soon as the last block is colored
      let cost = path.length
      if (gain === remaining) cost = Math.max(...path.map((i, k) => (state.colored[i] !== '1' ? k + 1 : 0)))
      const value = rule === 'most' ? gain * 1000 - cost : (gain / cost) * 1000 + gain
      if (!best || value > best.value) best = { dir, cost, value }
    }
    if (best) {
      ink += best.cost
      state = applyMove(state, best.dir).state
      continue
    }
    // nothing colors anything from here: head for the nearest stop that can
    const dist = new Map([[state.ball, 0]])
    const first = new Map()
    const queue = [state.ball]
    let target = null
    while (queue.length) {
      queue.sort((a, b) => dist.get(a) - dist.get(b))
      const at = queue.shift()
      const here = { ...state, ball: at }
      if (at !== state.ball && order.some((dir) => fresh(state, rollPath(here, dir)) > 0)) { target = at; break }
      for (const dir of order) {
        const path = rollPath(here, dir)
        if (!path.length) continue
        const to = path[path.length - 1]
        const d = dist.get(at) + path.length
        if (d < (dist.get(to) ?? Number.POSITIVE_INFINITY)) {
          dist.set(to, d)
          first.set(to, at === state.ball ? dir : first.get(at))
          if (!queue.includes(to)) queue.push(to)
        }
      }
    }
    if (target === null) return Number.POSITIVE_INFINITY
    const move = applyMove(state, first.get(target))
    ink += move.cost
    state = move.state
  }
  return Number.POSITIVE_INFINITY
}

const bestGreedy = (grid) => {
  let best = Number.POSITIVE_INFINITY
  for (const rule of ['most', 'rate']) for (const order of PERMUTATIONS) best = Math.min(best, greedy(grid, order, rule))
  return best
}

// ---------------------------------------------------------------- measuring
/**
 * Difficulty score: moves in the least-ink line, plus how much of that ink
 * goes over colored blocks again, plus the blocks only one or two rolls
 * reach, plus how far a greedy player falls short (capped).
 */
const scoreOf = (m) =>
  m.moves + 25 * (m.ratio - 1) + 2 * m.oneRoll + 0.75 * m.twoRolls + 0.5 * Math.min(m.gap, 20)

function measure(grid, id, limit = LIMIT, checkWalls = true) {
  const share = (100 * grid.join('').split('').filter((c) => c === WALL).length) / (grid.length * grid[0].length)
  if (checkWalls && (share < WALL_MIN || share > WALL_MAX)) return { id, grid, drop: 'walls outside range after filling' }
  const graph = rollGraph(grid)
  const check = coverable(graph)
  if (!check.reachable) return { id, grid, drop: 'unreachable block' }
  if (!check.coverable) return { id, grid, drop: 'trap' }
  const t0 = performance.now()
  let solution
  try {
    solution = minInk({ grid }, limit)
  } catch {
    return { id, grid, drop: 'slow' }
  }
  const ms = performance.now() - t0
  if (!solution) return { id, grid, drop: 'no solution' }
  const start = initialState({ grid, ink: 0 })
  const floors = floorCount(start)
  const greedyInk = bestGreedy(grid)
  const { one, two } = waysIn(graph)
  const m = {
    id, grid, size: start.width, walls: start.cells.length - floors, floors, par: solution.ink, moves: solution.moves.length,
    ratio: solution.ink / floors, oneRoll: one, twoRolls: two, noReturn: components(graph.stops, graph.edges).parts > 1,
    greedy: greedyInk, gap: greedyInk - solution.ink, explored: solution.explored, ms, stops: graph.stops.length,
  }
  m.score = scoreOf(m)
  return m
}

const fmt = (m, rank) => ({
  rank, id: m.id, size: `${m.size}x${m.size}`, walls: `${Math.round((100 * m.walls) / (m.size * m.size))}%`, floors: m.floors,
  par: m.par, moves: m.moves, 'ink/floor': m.ratio.toFixed(2), '1-roll': m.oneRoll, '2-roll': m.twoRolls, 'no-return': m.noReturn ? 'yes' : '',
  greedy: Number.isFinite(m.greedy) ? m.greedy : 'stuck', gap: Number.isFinite(m.gap) ? m.gap : 'stuck',
  explored: m.explored, ms: Math.round(m.ms), score: m.score.toFixed(1),
})

const printGrid = (m, label = m.id) => {
  console.log(`\n${label}  ${m.size}x${m.size}  par ${m.par}  moves ${m.moves}  score ${m.score.toFixed(1)}`)
  for (const row of m.grid) console.log(`  '${row}',`)
}

// --------------------------------------------------------------------- run
if (BOARD) {
  const match = /^s(\d+)-(\d+)-(\d+)$/.exec(BOARD)
  if (!match) throw new Error('--board takes an id like s1-9-0042')
  const [, seed, size, n] = match.map(Number)
  const m = measure(makeGrid(seed, size, n), BOARD)
  if (m.drop) console.log(`${BOARD}: dropped (${m.drop})`)
  else { console.table([fmt(m, 1)]); printGrid(m) }
  process.exit(0)
}

if (HARDNESS) {
  // how hard some of the current levels are, on the measures in scripts/inkmaze-hardness.mjs
  const [from, to] = /^\d+(-\d+)?$/.test(HARDNESS) ? range(HARDNESS) : [1, LEVELS.length]
  const rows = []
  const curve = []
  for (let n = from; n <= Math.min(to, LEVELS.length); n++) {
    const level = LEVELS[n - 1]
    const t = performance.now()
    const h = hardness(level)
    const greedyOver = bestGreedy(level.grid) - h.par
    const row = {
      '#': n, id: level.id, size: `${level.grid[0].length}x${level.grid.length}`, par: h.par,
      careful: h.careful.toExponential(3), 'safe-wrong': h.safeWrong, horizon: h.horizon.toFixed(2),
      lines: h.lines, decisions: h.decisions, greedy: Number.isFinite(greedyOver) ? `+${greedyOver}` : 'stuck', moves: h.moves,
      'ink/floor': h.inkPerFloor.toFixed(3),
    }
    const measures = {
      id: level.id, careful: Number(h.careful.toExponential(3)), safeWrong: h.safeWrong, horizon: Number(h.horizon.toFixed(2)),
      lines: h.lines, decisions: h.decisions, greedy: greedyOver, moves: h.moves, inkPerFloor: Number(h.inkPerFloor.toFixed(3)),
    }
    if (SLOW) {
      const beam = smallestBeam(level, 17)
      measures.beam = beam.width
      measures.nmcs = nmcsWins(level)
      measures.planner = plannerDepth(level)
      row.beam = Number.isFinite(beam.width) ? `${beam.width} ${beam.scoring}` : '> 131072'
      row.nmcs = `${measures.nmcs}/6`
      row.planner = Number.isFinite(measures.planner) ? measures.planner : '> 70'
      console.log(`level ${n} measured`)
    }
    row.s = ((performance.now() - t) / 1000).toFixed(1)
    rows.push(row)
    curve.push(measures)
  }
  console.table(rows)
  if (SLOW) {
    // rows for the CURVE table in scripts/test-inkmaze.mjs, and how each level compares with the ones before it
    const keys = Object.keys(MEASURES)
    const text = (v) => (v === Infinity ? 'Infinity' : String(v))
    console.log('\nFor the CURVE table in scripts/test-inkmaze.mjs:')
    for (const m of curve) console.log(`  { id: '${m.id}', ${keys.map((key) => `${key}: ${text(m[key])}`).join(', ')} },`)
    console.log('\nHarder / easier than each level before it (all eleven measures; the five careful-player ones):')
    curve.forEach((m, i) => {
      const against = curve.slice(0, i).map((o) => {
        const all = compare(o, m)
        const careful = compare(o, m, CAREFUL_MEASURES)
        return `${o.id} ${all.harder}/${all.easier} (${careful.harder}/${careful.easier})`
      })
      if (against.length) console.log(`  ${m.id}: ${against.join(', ')}`)
    })
  }
  process.exit(0)
}

const t0 = performance.now()
const kept = []
const dropped = {}
let tried = 0
if (FROM) {
  // JSON has no Infinity: a greedy player that got stuck was saved as null
  for (const m of JSON.parse(readFileSync(FROM, 'utf8'))) {
    kept.push({ ...m, greedy: m.greedy ?? Infinity, gap: m.gap ?? Infinity, checked: undefined })
    tried++
  }
}
for (let size = SIZE_MIN; size <= SIZE_MAX && !FROM; size++) {
  for (let n = 0; n < COUNT; n++) {
    tried++
    const id = `s${SEED}-${size}-${String(n).padStart(4, '0')}`
    const m = measure(makeGrid(SEED, size, n), id)
    if (m.drop) { dropped[m.drop] = (dropped[m.drop] ?? 0) + 1; continue }
    // needs real planning: a greedy player cannot clear it at par, it takes
    // a fair number of moves, and it rolls back over colored blocks a lot
    if (m.gap <= 0) { dropped['greedy clears it'] = (dropped['greedy clears it'] ?? 0) + 1; continue }
    if (m.moves < 2 * size) { dropped['few moves'] = (dropped['few moves'] ?? 0) + 1; continue }
    if (m.ratio < 1.25) { dropped['little doubling back'] = (dropped['little doubling back'] ?? 0) + 1; continue }
    kept.push(m)
  }
}
kept.sort((a, b) => b.score - a.score)

if (FROM) console.log(`read ${tried} boards from ${FROM}`)
else console.log(`seed ${SEED}: tried ${tried} boards (${COUNT} per size, ${SIZE_MIN}x${SIZE_MIN} to ${SIZE_MAX}x${SIZE_MAX}, walls ${WALL_MIN} to ${WALL_MAX}%) in ${((performance.now() - t0) / 1000).toFixed(1)} s`)
console.log(`kept ${kept.length}; dropped: ${Object.entries(dropped).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'}`)

console.log('\nThe current levels, measured the same way:')
const current = LEVELS.map((level) => ({ ...measure(level.grid, level.id, 5_000_000, false), slack: level.slack }))
console.table(current.map((m, i) => fmt(m, i + 1)))

console.log(`\nTop ${Math.min(TOP, kept.length)} of ${kept.length}, by score:`)
console.table(kept.slice(0, TOP).map((m, i) => fmt(m, i + 1)))
for (const size of new Set(kept.map((m) => m.size))) {
  const some = kept.filter((m) => m.size === size)
  const slowest = some.reduce((a, b) => (b.explored > a.explored ? b : a))
  console.log(`${size}x${size}: ${some.length} kept, best score ${some[0].score.toFixed(1)}, slowest solve ${slowest.explored} positions in ${Math.round(slowest.ms)} ms (${slowest.id})`)
}
kept.slice(0, SHOW).forEach((m, i) => printGrid(m, `#${i + 1} ${m.id}`))

if (JSON_OUT) {
  writeFileSync(JSON_OUT, JSON.stringify(kept, null, 1))
  console.log(`\nwrote ${kept.length} boards to ${JSON_OUT}`)
}

// --------------------------------------------------------------------- pick
/**
 * Ten boards to follow the current last level. Sizes come from --slots
 * (never smaller than the level before). Scores rise from one pick to the
 * next by at least --step, and the first scores above the current last
 * level. No pick is a near copy (rotation and mirror included) of another
 * pick or of a current level. Each is quick to check: minInk under
 * --pick-limit positions, and the exhaustive "one drop under par is not
 * enough" search that npm test runs under 2 seconds. At least --mix of the
 * picks have a roll with no way back, and at least --mix do not. Among the
 * sets that fit, it takes the one with the highest total score.
 */
if (PICK) {
  const slots = String(option('slots', '7,7,8,8,8,8,9,9,9,9')).split(',').map(Number)
  const pickLimit = Number(option('pick-limit', 80_000))
  const mix = Number(option('mix', 2))
  const step = Number(option('step', 1))
  const last = current.at(-1)
  const floor = last.score
  const fast = (m) => {
    if (m.explored > pickLimit) return false
    if (m.checked === undefined) {
      const t = performance.now()
      const below = solvableWith({ grid: m.grid }, m.par - 1, LIMIT * 4)
      m.checkMs = performance.now() - t
      m.checked = below === null && m.checkMs < 2000
    }
    return m.checked
  }
  // the best few boards of each size that could fill a slot, of both kinds
  const pool = new Map()
  for (const size of new Set(slots)) {
    const need = slots.filter((s) => s === size).length
    const fits = kept.filter((m) => m.size === size && m.score > floor && current.every((o) => difference(m.grid, o.grid) >= 0.25))
    const some = (noReturn) => fits.filter((m) => m.noReturn === noReturn).filter(fast).slice(0, need * 4)
    pool.set(size, [...some(true), ...some(false)].sort((a, b) => b.score - a.score))
  }
  let best = null
  let bestTotal = -Infinity
  let budget = 2_000_000
  const picked = []
  const search = (slot, total) => {
    if (--budget < 0) return
    if (slot === slots.length) {
      if (total > bestTotal) { bestTotal = total; best = [...picked] }
      return
    }
    // bound: even the best boards left cannot beat the best set found
    let bound = total
    for (let k = slot; k < slots.length; k++) bound += pool.get(slots[k])[0]?.score ?? -Infinity
    if (bound <= bestTotal) return
    const below = picked.length ? picked.at(-1).score + step : floor
    const oneWay = picked.filter((p) => p.noReturn).length
    for (const m of pool.get(slots[slot])) {
      if (m.score < below || picked.includes(m)) continue
      const left = slots.length - slot - 1
      const ow = oneWay + (m.noReturn ? 1 : 0)
      if (Math.max(0, mix - ow) + Math.max(0, mix - (slot + 1 - ow)) > left) continue
      if (!picked.every((p) => difference(m.grid, p.grid) >= 0.25)) continue
      picked.push(m)
      search(slot + 1, total + m.score)
      picked.pop()
    }
  }
  search(0, 0)
  if (!best) console.log(`\nno set of ${slots.length} fits (sizes ${slots.join(',')}, scores above ${floor.toFixed(1)}); try a larger --count`)
  else {
    const first = LEVELS.length + 1
    console.log(`\nPicked for levels ${first} to ${first + slots.length - 1} (level ${LEVELS.length}, ${last.id}, scores ${floor.toFixed(1)}):`)
    console.table(best.map((m, i) => ({ ...fmt(m, first + i), 'par-1 check ms': Math.round(m.checkMs) })))
    console.log('\nAs levels.ts entries (name them, set slack, then run npm run inkmaze:solve -- --write):')
    for (const m of best) {
      console.log(`  {\n    id: '${m.id}',\n    name: '${m.id}',\n    slack: 0,\n    par: ${m.par},\n    ink: ${m.par},\n    grid: [`)
      for (const row of m.grid) console.log(`      '${row}',`)
      console.log('    ],\n  },')
    }
  }
}
