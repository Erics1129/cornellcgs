/**
 * Ink Maze: how hard a level is, measured exactly, above all for a player
 * who never makes a move that visibly loses. Used by scripts/test-inkmaze.mjs
 * (the quick, exact measures) and by scripts/inkmaze-generate.mjs --hardness
 * (all of them, including the slow search players).
 *
 *   import { hardness, smallestBeam, nmcsWins, plannerDepth, MEASURES, compare, difference } from './inkmaze-hardness.mjs'
 *   import { panel, PANEL, panelCompare } from './inkmaze-hardness.mjs'
 *
 * Every measure plays the level with exactly par ink, under the rules in
 * src/minigames/inkmaze/engine.ts (rolls stop at walls, each block entered
 * costs one ink, the ink running out ends a roll where it is). A move
 * "visibly loses" when it leaves more uncolored blocks than ink, or when it
 * strands a block: no roll from where the ball stops, however many, can ever
 * pass over it again. The careful player only ever rejects such moves.
 *
 * hardness(level) returns, all exact:
 *   lines       winning lines at par ink (fewer is harder)
 *   careful     chance that the careful player, picking at random among the
 *               moves that do not visibly lose, clears the level (lower is harder)
 *   uniform     the same chance for a player picking among all moves
 *   moves       moves in the first least-ink line (U, D, L, R order)
 *   decisions   positions on that line with 2 or more moves of which only 1 wins
 *   wrong       moves offered on the line that cannot win any more
 *   safeWrong   of those, the ones the careful player would still take
 *   hard        positions on the line with 2 or more careful moves and 1 that wins
 *   horizon     at each hard position, the most moves the careful player can
 *               still make after its worst safe-looking wrong move before
 *               every move visibly loses; the mean over hard positions (higher
 *               is harder: the trap shows itself later). horizonMax is the largest.
 *   inkPerFloor par ink over the floor blocks (higher: more rolling over colored blocks)
 *   memo        positions the exact search kept (a cost guide)
 *
 * smallestBeam(level) (or beamWidth for one scoring), nmcsWins(level) and
 * plannerDepth(level) are search players, slower in plain JS (seconds to a
 * few minutes for a large level) and deterministic: the smallest beam width
 * (a power of two) that clears the level, how many of six seeded nested
 * Monte Carlo searches (level 5) clear it, and the least lookahead with which
 * a simple planner does.
 *
 * panel(level) gives the exact part of the held-out player panel that levels
 * 20 to 25 are ordered by (careful players with lookahead, the soft player,
 * counter-instinct moves; see PANEL for all seventeen and panelCompare for
 * the rule), the measures scripts/test-inkmaze.mjs recomputes; the search
 * players of the panel come from scripts/inkmaze-panel.c.
 *
 * MEASURES lists eleven of these numbers and which way is harder; compare(a,
 * b) counts on how many of them b is harder than a and on how many easier.
 * The test and the generator call one level harder than another when it is
 * harder on more of them than it is easier, both over all eleven and over
 * the five that model the careful player. difference(a, b) is the
 * generator's near-copy rule: the share of blocks two layouts differ in,
 * after the best rotation or mirror.
 */
import { parseGrid } from '../src/minigames/inkmaze/engine.ts'
import { minInk } from '../src/minigames/inkmaze/solver.ts'

const DX = [0, 0, -1, 1]
const DY = [-1, 1, 0, 0]
const LETTERS = 'UDLR'

// --------------------------------------------------------------- the board
/** The board as bit masks: rolls, what they color, and what can still be reached from each block. */
function compile(grid) {
  const { width: W, height: H, cells, start } = parseGrid(grid)
  const N = W * H
  if (N > 128) throw new Error('boards of up to 128 blocks')
  const NW = Math.ceil(N / 32)
  const floor = new Int32Array(NW)
  let floors = 0
  for (let i = 0; i < N; i++) if (cells[i] === '.') { floor[i >> 5] |= 1 << (i & 31); floors++ }
  // roll from block i in direction d: length, the blocks in order, and the
  // mask of its first k blocks for k = 0..len
  const len = new Int32Array(N * 4)
  const path = new Int32Array(N * 4 * 16)
  const pre = new Int32Array(N * 4 * 17 * NW)
  for (let i = 0; i < N; i++) for (let d = 0; d < 4; d++) {
    if (cells[i] !== '.') continue
    let x = i % W
    let y = (i / W) | 0
    let k = 0
    const base = (i * 4 + d) * 17 * NW
    for (;;) {
      const nx = x + DX[d]
      const ny = y + DY[d]
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || cells[ny * W + nx] !== '.') break
      x = nx; y = ny
      if (k >= 16) throw new Error('rolls of up to 16 blocks')
      const j = y * W + x
      path[(i * 4 + d) * 16 + k] = j
      for (let w = 0; w < NW; w++) pre[base + (k + 1) * NW + w] = pre[base + k * NW + w]
      pre[base + (k + 1) * NW + (j >> 5)] |= 1 << (j & 31)
      k++
    }
    len[i * 4 + d] = k
  }
  // every block some roll can pass over, from each block, with unlimited ink
  const cover = new Int32Array(N * NW)
  for (let s = 0; s < N; s++) {
    if (cells[s] !== '.') continue
    const seen = new Uint8Array(N)
    const queue = [s]
    seen[s] = 1
    cover[s * NW + (s >> 5)] |= 1 << (s & 31)
    while (queue.length) {
      const a = queue.pop()
      for (let d = 0; d < 4; d++) {
        const L = len[a * 4 + d]
        if (!L) continue
        const m = ((a * 4 + d) * 17 + L) * NW
        for (let w = 0; w < NW; w++) cover[s * NW + w] |= pre[m + w]
        const b = path[(a * 4 + d) * 16 + L - 1]
        if (!seen[b]) { seen[b] = 1; queue.push(b) }
      }
    }
  }
  return { W, H, N, NW, cells, start, floor, floors, len, path, pre, cover }
}

const popcount = (v) => {
  v -= (v >>> 1) & 0x55555555
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333)
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24
}

/**
 * Open-addressing hash table from a position (color mask words, ball, ink)
 * to a few numbers. Keys live in an Int32Array; it doubles when half full.
 */
class Table {
  constructor(nw, values) {
    this.nw = nw
    this.stride = nw + 1
    this.values = values
    this.alloc(1 << 14)
  }
  alloc(cap) {
    this.cap = cap
    this.n = 0
    this.keys = new Int32Array(cap * this.stride)
    this.used = new Uint8Array(cap)
    this.vals = new Float64Array(cap * this.values)
  }
  hash(words, off, tag) {
    let h = Math.imul(tag, 0x9e3779b1)
    for (let w = 0; w < this.nw; w++) {
      h = Math.imul(h ^ words[off + w], 0x85ebca6b)
      h ^= h >>> 13
    }
    h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35)
    return (h ^ (h >>> 16)) >>> 0
  }
  /** slot of the position, or -1 */
  find(words, off, tag) {
    const { stride, nw, keys, used } = this
    const mask = this.cap - 1
    for (let i = this.hash(words, off, tag) & mask; ; i = (i + 1) & mask) {
      if (!used[i]) return -1
      const k = i * stride
      if (keys[k + nw] !== tag) continue
      let same = true
      for (let w = 0; w < nw; w++) if (keys[k + w] !== words[off + w]) { same = false; break }
      if (same) return i
    }
  }
  /** adds a position that is not in the table yet; returns its slot */
  add(words, off, tag) {
    if ((this.n + 1) * 2 > this.cap) this.grow()
    const { stride, nw, keys, used } = this
    const mask = this.cap - 1
    let i = this.hash(words, off, tag) & mask
    while (used[i]) i = (i + 1) & mask
    used[i] = 1
    for (let w = 0; w < nw; w++) keys[i * stride + w] = words[off + w]
    keys[i * stride + nw] = tag
    this.n++
    return i
  }
  grow() {
    const { keys, used, vals, cap, stride, values } = this
    this.alloc(cap * 2)
    for (let i = 0; i < cap; i++) {
      if (!used[i]) continue
      const j = this.add(keys, i * stride, keys[i * stride + this.nw])
      for (let v = 0; v < values; v++) this.vals[j * values + v] = vals[i * values + v]
    }
  }
}

// --------------------------------------------------------------- positions
/**
 * Scratch space for positions, one row of color words per search depth, so
 * the searches below allocate nothing per move.
 */
function positions(board, depth = 400) {
  const { NW, len, path, pre, cover, floors } = board
  const col = new Int32Array(depth * NW)
  /** uncolored floor blocks at depth t */
  const left = (t) => {
    let c = 0
    for (let w = 0; w < NW; w++) c += popcount(col[t * NW + w])
    return floors - c
  }
  /** some uncolored block can never be rolled over again from `ball` */
  const stranded = (t, ball) => {
    for (let w = 0; w < NW; w++) if ((board.floor[w] & ~col[t * NW + w] & ~cover[ball * NW + w]) !== 0) return true
    return false
  }
  /** plays direction d from (depth t, ball, ink) into depth t + 1; returns the blocks rolled onto (0: nothing) */
  const move = (t, ball, ink, d) => {
    if (ink <= 0) return 0
    const L = len[ball * 4 + d]
    if (!L) return 0
    const k = L < ink ? L : ink
    const m = ((ball * 4 + d) * 17 + k) * NW
    for (let w = 0; w < NW; w++) col[(t + 1) * NW + w] = col[t * NW + w] | pre[m + w]
    return k
  }
  const stop = (ball, d, k) => path[(ball * 4 + d) * 16 + k - 1]
  const reset = (start) => {
    col.fill(0, 0, NW)
    col[start >> 5] |= 1 << (start & 31)
  }
  const copy = (from, to) => { for (let w = 0; w < NW; w++) col[to * NW + w] = col[from * NW + w] }
  return { col, left, stranded, move, stop, reset, copy }
}

// ------------------------------------------------------------ exact measures
/**
 * The exact measures described at the top of this file, at par ink. Pass
 * `par` when it is already known (it must be the least ink that clears the
 * level) to skip solving the level again.
 */
export function hardness(level, par = minInk(level)?.ink) {
  if (par === undefined) throw new Error(`${level.id ?? 'level'}: no solution`)
  const board = compile(level.grid)
  const { NW } = board
  const P = positions(board)
  const { col, left, stranded, move, stop } = P

  // lines, uniform, careful: one pass over every position reachable at par ink
  const memo = new Table(NW, 3)
  let ra = 0
  let rb = 0
  let rd = 0
  const rec = (t, ball, ink) => {
    const lf = left(t)
    if (lf === 0) { ra = 1; rb = 1; rd = 1; return }
    if (ink <= 0 || lf > ink) { ra = 0; rb = 0; rd = 0; return }
    const tag = ball * 4096 + ink + 1
    const found = memo.find(col, t * NW, tag)
    if (found >= 0) { ra = memo.vals[found * 3]; rb = memo.vals[found * 3 + 1]; rd = memo.vals[found * 3 + 2]; return }
    let a = 0
    let b = 0
    let d2 = 0
    let legal = 0
    let careful = 0
    const ca = [0, 0, 0, 0]
    const cb = [0, 0, 0, 0]
    const cd = [0, 0, 0, 0]
    const ok = [false, false, false, false]
    const safe = [false, false, false, false]
    for (let d = 0; d < 4; d++) {
      const k = move(t, ball, ink, d)
      if (!k) continue
      ok[d] = true
      legal++
      const to = stop(ball, d, k)
      const lf2 = left(t + 1)
      const won = lf2 === 0
      safe[d] = won || (lf2 <= ink - k && !stranded(t + 1, to))
      if (safe[d]) careful++
      rec(t + 1, to, ink - k)
      ca[d] = ra; cb[d] = rb; cd[d] = rd
    }
    for (let d = 0; d < 4; d++) {
      if (!ok[d]) continue
      a += ca[d]
      b += cb[d] / legal
      if (safe[d]) d2 += cd[d] / careful
    }
    const slot = memo.add(col, t * NW, tag)
    memo.vals[slot * 3] = a; memo.vals[slot * 3 + 1] = b; memo.vals[slot * 3 + 2] = d2
    ra = a; rb = b; rd = d2
  }

  // horizon: the most moves the careful player can make from a position before every move visibly loses
  const reach = new Table(NW, 1)
  const unsafe = (t, ball, ink) => {
    const lf = left(t)
    if (lf === 0) return false
    return ink <= 0 || lf > ink || stranded(t, ball)
  }
  const horizonFrom = (t, ball, ink) => {
    if (unsafe(t, ball, ink)) return 0
    const tag = ball * 4096 + ink + 1
    const found = reach.find(col, t * NW, tag)
    if (found >= 0) return reach.vals[found]
    let most = 0
    for (let d = 0; d < 4; d++) {
      const k = move(t, ball, ink, d)
      if (!k) continue
      const r = horizonFrom(t + 1, stop(ball, d, k), ink - k)
      if (r > most) most = r
    }
    const slot = reach.add(col, t * NW, tag)
    reach.vals[slot] = most + 1
    return most + 1
  }

  P.reset(board.start)
  rec(0, board.start, par)
  const lines = ra
  const uniform = rb
  const careful = rd

  // walk the first least-ink line (U, D, L, R order), looking at every move offered on it
  let ball = board.start
  let ink = par
  let line = ''
  let decisions = 0
  let wrong = 0
  let safeWrong = 0
  let hard = 0
  let horizonSum = 0
  let horizonMax = 0
  while (left(0) > 0) {
    let legal = 0
    let good = 0
    let safe = 0
    let worst = 0
    let next = -1
    for (let d = 0; d < 4; d++) {
      const k = move(0, ball, ink, d)
      if (!k) continue
      legal++
      const to = stop(ball, d, k)
      rec(1, to, ink - k)
      const wins = ra > 0
      if (wins) { good++; if (next < 0) next = d }
      if (!unsafe(1, to, ink - k)) {
        safe++
        if (!wins) {
          safeWrong++
          const h = horizonFrom(1, to, ink - k)
          if (h > worst) worst = h
        }
      }
    }
    if (next < 0) throw new Error('lost the line')
    if (legal >= 2 && good === 1) decisions++
    wrong += legal - good
    if (safe >= 2 && good === 1) {
      hard++
      horizonSum += worst
      if (worst > horizonMax) horizonMax = worst
    }
    const k = move(0, ball, ink, next)
    ball = stop(ball, next, k)
    ink -= k
    P.copy(1, 0)
    line += LETTERS[next]
  }
  return {
    par, lines, careful, uniform, moves: line.length, line, decisions, wrong, safeWrong, hard,
    horizon: hard ? horizonSum / hard : 0, horizonMax, inkPerFloor: par / board.floors, memo: memo.n, floors: board.floors,
  }
}

// ------------------------------------------------------- the player panel
/**
 * Lookahead depths of the careful players in panel(): careful<L> is the
 * chance that a player who looks L moves ahead clears the level, picking at
 * random among the moves from which some line of L more moves does not
 * visibly lose (careful0 is hardness().careful).
 */
export const LOOKAHEADS = [0, 2, 4, 8, 12, 20, 30]

const H_INF = 100000

/**
 * The exact part of the held-out player panel the curve test checks (all at
 * par ink, nothing sampled):
 *   lines          least-ink lines
 *   careful0 ... careful30   the careful players of LOOKAHEADS (lower is harder)
 *   soft           a careful player that weighs each move by exp(new blocks - ink spent) (lower is harder)
 *   counterFresh   the fewest moves on any least-ink line that color fewer new blocks than the
 *                  best careful move there (higher is harder: the line goes against the instinct)
 *   counterEff     the same for new blocks per ink spent
 *   states         positions a careful player can reach (the search space; higher is harder)
 * The rules are those of the panel's C tool (scratchpad rx.c, an independent
 * implementation: the test's table came from it and these numbers must match
 * it). The slow search players of the panel (beam widths, depth-first search
 * effort, nested Monte Carlo) are recorded in the test's table.
 */
export function panel(level, par = minInk(level)?.ink) {
  if (par === undefined) throw new Error(`${level.id ?? 'level'}: no solution`)
  const board = compile(level.grid)
  const { NW, floors, floor, cover } = board
  const P = positions(board)
  const { col, left, move, stop } = P
  const NL = LOOKAHEADS.length
  // per position: lines, h (most moves the careful player can still make; H_INF: it wins), careful[NL], soft
  const STRIDE = 3 + NL
  const WIN = -1
  const LOST = -2
  const NONE = -3
  const memo = new Table(NW, 1)
  let vals = new Float64Array(STRIDE * 4096)
  let count = 0
  const kids = new Int32Array(400 * 4)
  const fresh = new Int32Array(400 * 4)
  const cost = new Int32Array(400 * 4)
  const get = (id, j) => (id >= 0 ? vals[id * STRIDE + j] : id === WIN ? (j === 1 ? H_INF : 1) : 0)
  const rec = (t, ball, ink) => {
    const lf = left(t)
    if (lf === 0) return WIN
    if (lf > ink) return LOST
    for (let w = 0; w < NW; w++) if ((floor[w] & ~col[t * NW + w] & ~cover[ball * NW + w]) !== 0) return LOST
    const tag = ball * 4096 + ink + 1
    const found = memo.find(col, t * NW, tag)
    if (found >= 0) return memo.vals[found]
    const before = floors - lf
    const base = t * 4
    let legal = 0
    for (let d = 0; d < 4; d++) {
      const k = move(t, ball, ink, d)
      if (!k) { kids[base + d] = NONE; continue }
      legal++
      cost[base + d] = k
      fresh[base + d] = floors - left(t + 1) - before
      kids[base + d] = rec(t + 1, stop(ball, d, k), ink - k)
    }
    if ((count + 1) * STRIDE > vals.length) { const bigger = new Float64Array(vals.length * 2); bigger.set(vals); vals = bigger }
    const o = count * STRIDE
    if (legal) {
      let lines = 0
      let most = 0
      for (let d = 0; d < 4; d++) {
        const id = kids[base + d]
        if (id === NONE) continue
        lines += get(id, 0)
        const h = get(id, 1)
        if (h > most) most = h
      }
      vals[o] = lines
      vals[o + 1] = most >= H_INF ? H_INF : most + 1
      for (let l = 0; l < NL; l++) {
        let c = 0
        let s = 0
        for (let d = 0; d < 4; d++) {
          const id = kids[base + d]
          if (id !== NONE && get(id, 1) > LOOKAHEADS[l]) { c++; s += get(id, 2 + l) }
        }
        vals[o + 2 + l] = c ? s / c : 0
      }
      let ws = 0
      let s = 0
      for (let d = 0; d < 4; d++) {
        const id = kids[base + d]
        if (id === NONE || get(id, 1) <= 0) continue
        const w = Math.exp(fresh[base + d] - cost[base + d])
        ws += w
        s += w * get(id, 2 + NL)
      }
      vals[o + 2 + NL] = ws > 0 ? s / ws : 0
    } else {
      vals.fill(0, o, o + STRIDE)
    }
    memo.vals[memo.add(col, t * NW, tag)] = count
    return count++
  }
  P.reset(board.start)
  const root = rec(0, board.start, par)
  const result = { par, lines: get(root, 0), states: count }
  LOOKAHEADS.forEach((l, i) => { result[`careful${l}`] = get(root, 2 + i) })
  result.soft = get(root, 2 + NL)
  // every least-ink line, counting its moves that go against the careful player's instinct
  let counterFresh = Infinity
  let counterEff = Infinity
  const walk = (t, ball, ink, a, b) => {
    if (left(t) === 0) { counterFresh = Math.min(counterFresh, a); counterEff = Math.min(counterEff, b); return }
    const before = floors - left(t)
    const options = []
    for (let d = 0; d < 4; d++) {
      const k = move(t, ball, ink, d)
      if (!k) continue
      const id = rec(t + 1, stop(ball, d, k), ink - k)
      if (get(id, 1) <= 0) continue
      const f = floors - left(t + 1) - before
      options.push({ d, k, f, e: f / k, wins: get(id, 0) > 0 })
    }
    const maxF = Math.max(...options.map((o) => o.f))
    const maxE = Math.max(...options.map((o) => o.e))
    for (const o of options) {
      if (!o.wins) continue
      move(t, ball, ink, o.d)
      walk(t + 1, stop(ball, o.d, o.k), ink - o.k, a + (o.f < maxF ? 1 : 0), b + (o.e < maxE - 1e-12 ? 1 : 0))
    }
  }
  if (result.lines > 0) { P.reset(board.start); walk(0, board.start, par, 0, 0) }
  result.counterFresh = counterFresh
  result.counterEff = counterEff
  return result
}

/**
 * The held-out player panel that levels 20 to 25 are ordered by: seventeen
 * players, none of them the target of the search that found the levels.
 * `kind` says how two values compare:
 *   chance  a chance to clear the level (lower is harder); within 1.5 times is a tie, 10 times or more is large
 *   beam    a beam width (higher is harder); powers of two, any change counts, 4 times or more is large
 *   nodes   search effort (higher is harder); within 1.25 times is a tie, 2 times or more is large
 *   count   moves (higher is harder); any change counts, 3 or more is large
 *   rate    [wins, runs] (lower is harder); within two standard errors is a tie, large when the
 *           easier level is won at least twice as often and by at least 5 points
 * careful*, soft, counterFresh and counterEff are exact (panel() above); the
 * rest come from scripts/inkmaze-panel.c (scripts/inkmaze-panel.mjs prints them).
 */
export const PANEL = {
  careful0: { kind: 'chance', about: 'a careful player (never a move that visibly loses) picking at random' },
  careful2: { kind: 'chance', about: 'the same, looking 2 moves ahead' },
  careful4: { kind: 'chance', about: 'looking 4 moves ahead' },
  careful8: { kind: 'chance', about: 'looking 8 moves ahead' },
  careful12: { kind: 'chance', about: 'looking 12 moves ahead' },
  careful20: { kind: 'chance', about: 'looking 20 moves ahead' },
  careful30: { kind: 'chance', about: 'looking 30 moves ahead' },
  soft: { kind: 'chance', about: 'a careful player that prefers moves coloring more new blocks for less ink: weight exp(new - ink)' },
  beamGainInk: { kind: 'beam', about: 'beam search scored by blocks colored minus ink spent' },
  beamAStar: { kind: 'beam', about: 'beam search scored like A* (ink spent plus blocks left)' },
  beamRareFirst: { kind: 'beam', about: 'beam search that values blocks few rolls pass over' },
  beamTwiceColored: { kind: 'beam', about: 'beam search scored by twice the blocks colored minus ink spent' },
  dfsRandom: { kind: 'nodes', about: 'careful depth-first search with a dead-end memo, random move order: median nodes over 201 seeds' },
  dfsGreedy: { kind: 'nodes', about: 'the same, trying the move that colors the most new blocks first' },
  counterFresh: { kind: 'count', about: 'moves on the least-ink line that color fewer new blocks than the best careful move (fewest over all lines)' },
  counterEff: { kind: 'count', about: 'moves on the least-ink line that color fewer new blocks per ink than the best careful move' },
  nmcs: { kind: 'rate', about: 'nested Monte Carlo search, level 4: wins out of runs' },
}

const PANEL_TIE = { chance: 1.5, nodes: 1.25 }
const PANEL_LARGE = { chance: 10, beam: 4, nodes: 2, count: 3 }

/** +1 when b is harder than a on the panel measure, -1 easier, 0 a tie; and whether an easier is a large reversal */
export function panelStep(key, a, b) {
  const { kind } = PANEL[key]
  const x = a[key]
  const y = b[key]
  if (kind === 'rate') {
    const [wa, na] = x
    const [wb, nb] = y
    const pa = wa / na
    const pb = wb / nb
    const se = Math.sqrt(Math.max((pa * (1 - pa)) / na + (pb * (1 - pb)) / nb, 1e-9))
    if (Math.abs(pa - pb) <= 2 * se) return { step: 0, large: false }
    return pb < pa ? { step: 1, large: false } : { step: -1, large: pb >= 2 * pa && pb - pa >= 0.05 }
  }
  if (kind === 'count') {
    if (x === y) return { step: 0, large: false }
    return y > x ? { step: 1, large: false } : { step: -1, large: x - y >= PANEL_LARGE.count }
  }
  if (x === y) return { step: 0, large: false }
  // how many times harder b is
  const ratio = kind === 'chance' ? (y === 0 ? Infinity : x / y) : y / x
  const tie = PANEL_TIE[kind] ?? 1
  if (ratio > tie) return { step: 1, large: false }
  if (ratio < 1 / tie || (tie === 1 && ratio < 1)) return { step: -1, large: ratio <= 1 / PANEL_LARGE[kind] }
  return { step: 0, large: false }
}

/** On how many panel measures b is harder than a, and easier; which are easier, and which of those are large reversals. */
export function panelCompare(a, b, keys = Object.keys(PANEL)) {
  let harder = 0
  let easier = 0
  const easierOn = []
  const large = []
  for (const key of keys) {
    const { step, large: big } = panelStep(key, a, b)
    if (step > 0) harder++
    else if (step < 0) {
      easier++
      easierOn.push(key)
      if (big) large.push(key)
    }
  }
  return { harder, easier, easierOn, large }
}

/**
 * The measures behind "harder", and which way is harder for each: 'lower'
 * or 'higher'. The first five model the careful player (`careful`).
 *   careful      the careful player's chance to clear the level (hardness)
 *   safeWrong    safe-looking moves on the line that cannot win (hardness)
 *   horizon      how long such a move hides that it cannot win (hardness)
 *   beam         the smallest beam width that clears the level, best of five scorings (smallestBeam)
 *   nmcs         nested Monte Carlo searches of six that clear it (nmcsWins)
 *   lines        least-ink lines (hardness)
 *   decisions    positions on the line where only 1 of 2 or more moves wins (hardness)
 *   planner      the least lookahead with which the planner clears it (plannerDepth)
 *   greedy       ink over par the generator's greedy player spends; Infinity when it gets stuck
 *   moves        moves in the least-ink line (hardness)
 *   inkPerFloor  par ink per floor block (hardness)
 */
export const MEASURES = {
  careful: 'lower', safeWrong: 'higher', horizon: 'higher', beam: 'higher', nmcs: 'lower',
  lines: 'lower', decisions: 'higher', planner: 'higher', greedy: 'higher', moves: 'higher', inkPerFloor: 'higher',
}
/** The measures that model the careful player, who never makes a move that visibly loses. */
export const CAREFUL_MEASURES = ['careful', 'safeWrong', 'horizon', 'beam', 'nmcs']

/**
 * On how many of `keys` (default: all of MEASURES) level b is harder than
 * level a, and on how many easier; a and b are plain rows of the measures.
 * Equal values (Infinity included) count for neither.
 */
export function compare(a, b, keys = Object.keys(MEASURES)) {
  let harder = 0
  let easier = 0
  for (const key of keys) {
    const way = MEASURES[key]
    if (!way) throw new Error(`unknown measure ${key}`)
    if (a[key] === b[key]) continue
    if ((b[key] > a[key]) === (way === 'higher')) harder++
    else easier++
  }
  return { harder, easier }
}

// ----------------------------------------------------------- near copies
/** The 8 rotations and mirror images of a square wall layout (start ignored), as strings. */
function symmetries(grid) {
  const n = grid.length
  const at = (x, y) => (grid[y][x] === '#' ? '#' : '.')
  const maps = [
    (x, y) => at(x, y), (x, y) => at(n - 1 - y, x), (x, y) => at(n - 1 - x, n - 1 - y), (x, y) => at(y, n - 1 - x),
    (x, y) => at(n - 1 - x, y), (x, y) => at(x, n - 1 - y), (x, y) => at(y, x), (x, y) => at(n - 1 - y, n - 1 - x),
  ]
  return maps.map((f) => {
    let s = ''
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) s += f(x, y)
    return s
  })
}
/**
 * Share of blocks two square layouts differ in, after the best rotation or
 * mirror (1 for different sizes). Under 0.25 counts as a near copy.
 */
export function difference(a, b) {
  if (a.length !== b.length || a[0].length !== b[0].length) return 1
  const target = symmetries(b)[0]
  let fewest = Infinity
  for (const s of symmetries(a)) {
    let d = 0
    for (let i = 0; i < s.length; i++) if (s[i] !== target[i]) d++
    fewest = Math.min(fewest, d)
  }
  return fewest / target.length
}

// ------------------------------------------------------------ search players
/** Weights the beam scorings use, from the board alone. */
function weights(board) {
  const { W, H, N, cells, start, len, path } = board
  const cx = (W - 1) / 2
  const cy = (H - 1) / 2
  // blocks a roll from a stop reachable from the start passes over, counted per block
  const ways = new Int32Array(N)
  {
    const seen = new Uint8Array(N)
    const queue = [start]
    seen[start] = 1
    for (let q = 0; q < queue.length; q++) {
      const a = queue[q]
      for (let d = 0; d < 4; d++) {
        const L = len[a * 4 + d]
        if (!L) continue
        for (let k = 0; k < L; k++) ways[path[(a * 4 + d) * 16 + k]]++
        const b = path[(a * 4 + d) * 16 + L - 1]
        if (!seen[b]) { seen[b] = 1; queue.push(b) }
      }
    }
  }
  // steps from the start over floor
  const dist = new Int32Array(N).fill(-1)
  dist[start] = 0
  let most = 1
  {
    const queue = [start]
    for (let q = 0; q < queue.length; q++) {
      const a = queue[q]
      const x = a % W
      const y = (a / W) | 0
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d]
        const ny = y + DY[d]
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
        const b = ny * W + nx
        if (cells[b] === '.' && dist[b] < 0) { dist[b] = dist[a] + 1; if (dist[b] > most) most = dist[b]; queue.push(b) }
      }
    }
  }
  const far = new Float64Array(N)
  const rare = new Float64Array(N)
  const fromStart = new Float64Array(N)
  let maxR = 0
  for (let i = 0; i < N; i++) {
    if (cells[i] !== '.') continue
    const ax = Math.abs((i % W) - cx)
    const ay = Math.abs(((i / W) | 0) - cy)
    const r = Math.max(ax, ay) + (0.5 * (ax + ay)) / 2
    if (r > maxR) maxR = r
    far[i] = r
    rare[i] = ways[i] ? 1 / ways[i] : 1
    fromStart[i] = dist[i] < 0 ? 0 : dist[i] / most
  }
  for (let i = 0; i < N; i++) if (cells[i] === '.') far[i] = 0.5 + far[i] / maxR
  return { far, rare, fromStart }
}

/**
 * The beam scorings. Each rejects positions that visibly lose and ranks the
 * rest by what has been colored and spent since the start:
 *   gain-ink        blocks colored minus ink spent
 *   rare-first      6 x the blocks colored, each weighted by 1 / (the rolls that pass over it), + half the blocks - ink
 *   least-f         fewest (ink spent + blocks left), then most blocks colored
 *   far-corners     2 x the blocks colored, weighted toward the board's rim, - ink
 *   far-from-start  2 x the blocks colored, weighted by their distance from the start, + half the blocks - ink
 */
export const SCORINGS = ['gain-ink', 'rare-first', 'least-f', 'far-corners', 'far-from-start']

/**
 * The smallest power-of-two beam width (up to 2^maxPower, and below `below`)
 * with which a beam search clears the level at par ink, or Infinity. Each
 * step it expands every kept position, drops repeats and moves that visibly
 * lose, and keeps the best `width` by the scoring (ties keep the order they
 * were found in).
 */
export function beamWidth(level, scoring, maxPower = 16, below = Infinity) {
  const board = compile(level.grid)
  const par = minInk(level).ink
  const w8 = weights(board)
  const { NW, N, floor, cover } = board
  const sc = SCORINGS.indexOf(scoring)
  if (sc < 0) throw new Error(`unknown scoring ${scoring}`)
  const P = positions(board, 2)
  const { col, move, stop } = P
  const pop = (arr, off) => { let c = 0; for (let w = 0; w < NW; w++) c += popcount(arr[off + w]); return c }
  const tryWidth = (width) => {
    let cur = { cols: new Int32Array(NW), ball: new Int32Array(1), ink: new Int32Array(1), n: 1 }
    cur.cols[board.start >> 5] |= 1 << (board.start & 31)
    cur.ball[0] = board.start
    cur.ink[0] = par
    for (let step = 0; step < 300 && cur.n; step++) {
      const cap = cur.n * 4
      const cols = new Int32Array(cap * NW)
      const balls = new Int32Array(cap)
      const inks = new Int32Array(cap)
      const values = new Float64Array(cap)
      let n = 0
      const seen = new Table(NW, 0)
      for (let i = 0; i < cur.n; i++) {
        for (let w = 0; w < NW; w++) col[w] = cur.cols[i * NW + w]
        const ball = cur.ball[i]
        const ink = cur.ink[i]
        for (let d = 0; d < 4; d++) {
          const k = move(0, ball, ink, d)
          if (!k) continue
          const lf = board.floors - pop(col, NW)
          if (lf === 0) return true
          const to = stop(ball, d, k)
          const left = ink - k
          if (left <= 0) continue
          const tag = to * 4096 + left + 1
          if (seen.find(col, NW, tag) >= 0) continue
          seen.add(col, NW, tag)
          // the careful scorings reject moves that visibly lose
          let strand = false
          for (let w = 0; w < NW; w++) if ((floor[w] & ~col[NW + w] & ~cover[to * NW + w]) !== 0) { strand = true; break }
          if (lf > left || strand) continue
          const gain = pop(col, NW) - 1
          const spent = par - left
          let v
          if (sc === 0) v = gain - spent
          else if (sc === 2) v = -(spent + lf) * 1000 + gain
          else {
            // weights of the blocks colored so far, in block order (the same sums as the C tool)
            const weight = sc === 1 ? w8.rare : sc === 3 ? w8.far : w8.fromStart
            let s = 0
            for (let j = 0; j < N; j++) if (((col[NW + (j >> 5)] >>> (j & 31)) & 1) && j !== board.start) s += weight[j]
            v = sc === 1 ? 6 * s + 0.5 * gain - spent : 2 * s + (sc === 4 ? 0.5 * gain : 0) - spent
          }
          for (let w = 0; w < NW; w++) cols[n * NW + w] = col[NW + w]
          balls[n] = to
          inks[n] = left
          values[n] = v
          n++
        }
      }
      const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => values[b] - values[a] || a - b)
      const keep = Math.min(width, n)
      const next = { cols: new Int32Array(keep * NW), ball: new Int32Array(keep), ink: new Int32Array(keep), n: keep }
      for (let j = 0; j < keep; j++) {
        const i = order[j]
        for (let w = 0; w < NW; w++) next.cols[j * NW + w] = cols[i * NW + w]
        next.ball[j] = balls[i]
        next.ink[j] = inks[i]
      }
      cur = next
    }
    return false
  }
  for (let p = 0; p <= maxPower && 2 ** p < below; p++) if (tryWidth(2 ** p)) return 2 ** p
  return Infinity
}

/**
 * The smallest beam width that clears the level with any of the scorings:
 * { width, scoring }, width Infinity when none clears up to 2^maxPower.
 * Rare-first usually clears first, so it goes first and the others only try
 * narrower beams.
 */
export function smallestBeam(level, maxPower = 17) {
  let best = { width: Infinity, scoring: '' }
  for (const scoring of ['rare-first', 'far-corners', 'far-from-start', 'gain-ink', 'least-f']) {
    const width = beamWidth(level, scoring, maxPower, best.width)
    if (width < best.width) best = { width, scoring }
  }
  return best
}

/**
 * How many of `runs` nested Monte Carlo searches (Cazenave's NMCS, at
 * `nest` levels) clear the level at par ink. The playouts are careful random
 * players; each run has its own fixed seed (a 64-bit xorshift), so the count
 * is the same every time.
 */
export function nmcsWins(level, runs = 6, nest = 5) {
  const board = compile(level.grid)
  const par = minInk(level).ink
  const { NW, len, path, pre, cover, floor, floors } = board
  const left = (c) => { let n = 0; for (let w = 0; w < NW; w++) n += popcount(c[w]); return floors - n }
  const colored = (c) => floors - left(c)
  const stranded = (c, ball) => { for (let w = 0; w < NW; w++) if ((floor[w] & ~c[w] & ~cover[ball * NW + w]) !== 0) return true; return false }
  const roll = (c, ball, ink, d, out) => {
    if (ink <= 0) return 0
    const L = len[ball * 4 + d]
    if (!L) return 0
    const k = L < ink ? L : ink
    const m = ((ball * 4 + d) * 17 + k) * NW
    for (let w = 0; w < NW; w++) out[w] = c[w] | pre[m + w]
    return k
  }
  const stop = (ball, d, k) => path[(ball * 4 + d) * 16 + k - 1]
  // xorshift64 in two 32-bit halves
  let hi = 0
  let lo = 0
  const random = (n) => {
    let h = (hi ^ ((hi << 13) | (lo >>> 19))) >>> 0
    let l = (lo ^ (lo << 13)) >>> 0
    hi = h; lo = l
    h = (hi ^ (hi >>> 7)) >>> 0
    l = (lo ^ ((lo >>> 7) | (hi << 25))) >>> 0
    hi = h; lo = l
    h = (hi ^ ((hi << 17) | (lo >>> 15))) >>> 0
    l = (lo ^ (lo << 17)) >>> 0
    hi = h; lo = l
    return ((hi % n) * (4294967296 % n) + (lo % n)) % n
  }
  const careful = (o, to, inkLeft) => {
    const lf = left(o)
    return !(lf && (lf > inkLeft || stranded(o, to)))
  }
  const playout = (c0, ball, ink, seq) => {
    let c = Int32Array.from(c0)
    const kids = [new Int32Array(NW), new Int32Array(NW), new Int32Array(NW), new Int32Array(NW)]
    for (let step = 0; step < 300; step++) {
      if (left(c) === 0) return 1000
      if (ink <= 0) break
      const dirs = []
      const tos = []
      const costs = []
      for (let d = 0; d < 4; d++) {
        const k = roll(c, ball, ink, d, kids[dirs.length])
        if (!k) continue
        const to = stop(ball, d, k)
        if (!careful(kids[dirs.length], to, ink - k)) continue
        dirs.push(d); tos.push(to); costs.push(k)
      }
      if (!dirs.length) break
      const pick = random(dirs.length)
      seq.push(dirs[pick])
      c = Int32Array.from(kids[pick])
      ball = tos[pick]
      ink -= costs[pick]
    }
    return colored(c)
  }
  const search = (c0, ball, ink, level, out) => {
    if (level === 0) return playout(c0, ball, ink, out)
    let c = Int32Array.from(c0)
    const line = []
    let best = -1
    let bestSeq = []
    const kid = new Int32Array(NW)
    for (;;) {
      if (left(c) === 0) { out.push(...line); return 1000 }
      if (ink <= 0) break
      let moved = false
      for (let d = 0; d < 4; d++) {
        const k = roll(c, ball, ink, d, kid)
        if (!k) continue
        const to = stop(ball, d, k)
        if (!careful(kid, to, ink - k)) continue
        moved = true
        const seq = []
        const score = search(kid, to, ink - k, level - 1, seq)
        if (score > best) { best = score; bestSeq = [...line, d, ...seq] }
        if (best === 1000) break
      }
      if (!moved || bestSeq.length <= line.length) break
      const d = bestSeq[line.length]
      const k = roll(c, ball, ink, d, kid)
      ball = stop(ball, d, k)
      ink -= k
      c = Int32Array.from(kid)
      line.push(d)
    }
    out.push(...bestSeq)
    return best < 0 ? colored(c) : best
  }
  const start = new Int32Array(NW)
  start[board.start >> 5] |= 1 << (board.start & 31)
  let wins = 0
  for (let r = 0; r < runs; r++) {
    hi = 0
    lo = 777 + r * 13 + nest
    if (search(start, board.start, par, nest, []) === 1000) wins++
  }
  return wins
}

/**
 * The least lookahead with which a simple planner clears the level at par
 * ink, or Infinity when none up to `kmax` does. The planner looks k moves
 * ahead, scores each line by the blocks it colors minus the ink it spends
 * (a win counts far more than anything else, a loss far less), plays the
 * first move of the best line and looks again. Three scorings: that one;
 * that one also counting a position with more blocks left than ink as lost;
 * and the second with ties broken toward more colored blocks. Each runs
 * with all 24 orders for breaking ties between directions, and the level
 * counts as cleared at depth k when any of the 72 runs clears it. A level
 * that needs a deep lookahead punishes moves that look good for a while.
 */
export function plannerDepth(level, kmax = 70) {
  const board = compile(level.grid)
  const par = minInk(level).ink
  if (par > 255 || kmax > 127) throw new Error('planner: par up to 255, depth up to 127')
  const { NW, floors } = board
  const P = positions(board, kmax + 3)
  const { left, move, stop } = P
  const WIN = 1e8
  const orders = []
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) for (let d = 0; d < 4; d++) {
    if (a !== b && a !== c && a !== d && b !== c && b !== d && c !== d) orders.push([a, b, c, d])
  }
  let scoring = 0
  let memo = null
  // the score of the move that took depth t (blocks `before` colored) to depth t + 1, plus the best j - 1 moves after it
  const value = (t, ball, ink, d, k, before, j) => {
    const lf = left(t + 1)
    const fresh = floors - lf - before
    const v = scoring === 2 ? (fresh - k) * 1024 + fresh : fresh - k
    const after = ink - k
    if (lf === 0) return v + WIN
    if (after === 0) return v - WIN
    if (scoring >= 1 && lf > after) return v - WIN
    return j > 1 ? v + best(t + 1, stop(ball, d, k), after, j - 1) : v
  }
  // the best score of a line of j moves from depth t
  const best = (t, ball, ink, j) => {
    const tag = ((ball + 1) * 256 + ink) * 128 + j
    const found = memo.find(P.col, t * NW, tag)
    if (found >= 0) return memo.vals[found]
    const before = floors - left(t)
    let top = -Infinity
    for (let d = 0; d < 4; d++) {
      const k = move(t, ball, ink, d)
      if (!k) continue
      const v = value(t, ball, ink, d, k, before, j)
      if (v > top) top = v
    }
    memo.vals[memo.add(P.col, t * NW, tag)] = top
    return top
  }
  const play = (k, order) => {
    P.reset(board.start)
    let ball = board.start
    let ink = par
    const values = [0, 0, 0, 0]
    for (let turn = 0; turn < 1000; turn++) {
      const before = floors - left(0)
      let pick = -1
      for (let d = 0; d < 4; d++) {
        const kk = move(0, ball, ink, d)
        values[d] = kk ? value(0, ball, ink, d, kk, before, k) : NaN
      }
      for (const d of order) if (!Number.isNaN(values[d]) && (pick < 0 || values[d] > values[pick])) pick = d
      if (pick < 0) return false
      const kk = move(0, ball, ink, pick)
      P.copy(1, 0)
      if (left(0) === 0) return true
      ink -= kk
      if (ink === 0) return false
      ball = stop(ball, pick, kk)
    }
    return false
  }
  let first = Infinity
  for (scoring = 0; scoring < 3; scoring++) {
    memo = new Table(NW, 1)
    for (let k = 1; k <= kmax && k < first; k++) {
      if (orders.some((order) => play(k, order))) { first = k; break }
    }
  }
  memo = null
  return first
}
