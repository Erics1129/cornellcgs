#!/usr/bin/env node
/**
 * Ink Maze: rules, session, plain-data state, every level clearable with its
 * ink, and levels that keep getting harder from level 20 on.
 *
 *   node scripts/test-inkmaze.mjs        (also part of `npm test`)
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  applyMove, blocksLeft, floorCount, initialState, isLost, isWon, legalMoves, parseGrid, rollPath, sameState, stateKey, status,
} from '../src/minigames/inkmaze/engine.ts'
import { createSession, current, inkUsed, movesUsed, play, restart, undo } from '../src/minigames/inkmaze/session.ts'
import { minInk, replay, solvableWith } from '../src/minigames/inkmaze/solver.ts'
import { LEVELS } from '../src/minigames/inkmaze/levels.ts'
import { CAREFUL_MEASURES, MEASURES, compare, difference, hardness } from './inkmaze-hardness.mjs'

const at = (state, x, y) => y * state.width + x

// ---------------------------------------------------------------- the rules
{
  // . . . #
  // o . # .
  const level = { grid: ['...#', 'o.#.'], ink: 10 }
  const s = initialState(level)
  assert.equal(s.ball, at(s, 0, 1), 'the ball starts on its block')
  assert.equal(s.colored[s.ball], '1', 'the starting block starts colored')
  assert.equal(blocksLeft(s), floorCount(s) - 1)
  assert.deepEqual(legalMoves(s), ['up', 'right'], 'down and left are the edge; up and right are open')

  const blocked = applyMove(s, 'left')
  assert.equal(blocked.state, s, 'a move into the edge changes nothing')
  assert.equal(blocked.cost, 0, '…and costs nothing')
  assert.deepEqual(blocked.path, [])

  const right = applyMove(s, 'right')
  assert.equal(right.state.ball, at(s, 1, 1), 'the ball stops before a wall')
  assert.deepEqual(right.path, [at(s, 1, 1)])
  assert.equal(right.cost, 1)
  assert.equal(right.state.ink, 9)

  const up = applyMove(right.state, 'up')
  assert.equal(up.state.ball, at(s, 1, 0), 'the ball stops at the edge')
  const across = applyMove(up.state, 'right')
  assert.equal(across.state.ball, at(s, 2, 0), 'and before a wall along a row')
  const back = applyMove(across.state, 'left')
  assert.deepEqual(back.path, [at(s, 1, 0), at(s, 0, 0)], 'rolls the whole way back')
  assert.equal(back.cost, 2, 'rolling onto already colored blocks still costs ink')
  assert.equal(s.colored, initialState(level).colored, 'states are never mutated')
}

{
  // ink runs dry mid-roll: the ball stops right there
  const s = initialState({ grid: ['o....'], ink: 2 })
  const r = applyMove(s, 'right')
  assert.deepEqual(r.path, [1, 2], 'two blocks, then no ink')
  assert.equal(r.state.ball, 2)
  assert.equal(r.state.ink, 0)
  assert.equal(status(r.state), 'lost', 'no ink with blocks left is a loss')
  assert.ok(isLost(r.state))
  assert.deepEqual(legalMoves(r.state), [], 'nothing is legal without ink')
  assert.equal(applyMove(r.state, 'right').cost, 0)
}

{
  // coloring the last block with the last drop is a win
  const s = initialState({ grid: ['o..'], ink: 2 })
  const r = applyMove(s, 'right')
  assert.equal(r.state.ink, 0)
  assert.equal(status(r.state), 'won')
  assert.ok(isWon(r.state) && !isLost(r.state))
  // …and so is winning partway through a roll that the ink cuts short
  const t = applyMove(initialState({ grid: ['o..', '###'], ink: 2 }), 'right').state
  assert.equal(status(t), 'won')
}

{
  // the rolls stop at walls and edges in every direction
  const s = initialState({ grid: ['..#..', '.....', '..o..', '.#...', '.....'], ink: 99 })
  assert.deepEqual(rollPath(s, 'up'), [at(s, 2, 1)], 'up stops under the wall')
  assert.deepEqual(rollPath(s, 'down'), [at(s, 2, 3), at(s, 2, 4)])
  assert.deepEqual(rollPath(s, 'left'), [at(s, 1, 2), at(s, 0, 2)])
  assert.deepEqual(rollPath(s, 'right'), [at(s, 3, 2), at(s, 4, 2)])
}

{
  // bad grids say what is wrong
  assert.throws(() => parseGrid(['..', '...']), /row 2/)
  assert.throws(() => parseGrid(['..', '..']), /no ball/)
  assert.throws(() => parseGrid(['o.', '.o']), /second ball/)
  assert.throws(() => parseGrid(['o.', '.x']), /unknown block/)
}

// ------------------------------------------------- state is plain data
{
  const s = applyMove(initialState(LEVELS[0]), 'right').state
  const copy = structuredClone(s)
  assert.deepEqual(copy, s)
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s, 'survives a JSON round trip')
  assert.ok(sameState(copy, s))
  assert.equal(stateKey(copy), stateKey(s))
  for (const value of Object.values(s)) assert.ok(['string', 'number'].includes(typeof value), 'only strings and numbers')
  assert.ok(!sameState(s, applyMove(s, 'left').state), 'a different position is a different state')
}

// The logic modules must not touch the browser: no DOM, no timers
for (const file of ['engine', 'session', 'solver', 'levels']) {
  const source = readFileSync(new URL(`../src/minigames/inkmaze/${file}.ts`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
  assert.doesNotMatch(source, /\b(window|document|canvas|requestAnimationFrame|setTimeout|localStorage|HTMLElement|Math\.random)\b/, `${file}.ts stays free of browser code and randomness`)
}

// -------------------------------------------------------------- sessions
{
  let session = createSession(LEVELS[0])
  assert.equal(movesUsed(session), 0)
  const before = session
  session = play(session, 'up').session
  assert.equal(session, before, 'a move that goes nowhere is not counted')
  session = play(session, 'right').session
  session = play(session, 'down').session
  assert.equal(movesUsed(session), 2)
  assert.equal(inkUsed(session), 3 + 1)
  const two = current(session)
  session = undo(session)
  assert.equal(movesUsed(session), 1)
  assert.equal(current(session).ink, LEVELS[0].ink - 3, 'undo gives the ink back')
  assert.ok(!sameState(current(session), two))
  session = restart(play(session, 'down').session)
  assert.ok(sameState(current(session), initialState(LEVELS[0])), 'restart returns to the start')
  assert.equal(undo(session), session, 'nothing to undo at the start')
}
{
  // no moves after the game is over
  let session = createSession({ id: 'x', name: 'x', slack: 0, par: 2, ink: 2, grid: ['o..'] })
  session = play(session, 'right').session
  assert.equal(status(current(session)), 'won')
  assert.equal(play(session, 'left').session, session)
}

// ----------------------------------------------------------------- levels
assert.equal(LEVELS.length, 25, 'twenty-five levels ship')
assert.equal(new Set(LEVELS.map((l) => l.id)).size, LEVELS.length, 'level ids are unique')
assert.equal(new Set(LEVELS.map((l) => l.name)).size, LEVELS.length, 'level names are unique')
const sizes = LEVELS.map((l) => initialState(l)).map((s) => Math.max(s.width, s.height))
assert.equal(sizes[0], 4, 'the first level is 4 by 4')
assert.equal(Math.max(...sizes), 9, 'the largest boards are 9 by 9 (the 3D view is tested up to 9 by 9)')
// boards never shrink, except the final level: a small board on purpose
sizes.slice(0, -1).forEach((size, i) => i && assert.ok(size >= sizes[i - 1], `level ${i + 1} is not smaller than level ${i}`))
assert.ok(sizes.at(-1) <= 7, `the final level is a small board (at most 7 by 7), not ${sizes.at(-1)} by ${sizes.at(-1)}`)
for (const level of LEVELS) {
  const s = initialState(level)
  assert.equal(s.width, s.height, `${level.id} is square`)
  assert.equal(level.ink, level.par + level.slack, `${level.id}: ink is par + slack`)
}
assert.ok(LEVELS.slice(0, 3).every((l) => l.slack > 0), 'early levels give some slack')
assert.ok(LEVELS.slice(17).every((l) => l.slack === 0), 'from level 18 on, no level gives any slack')
// the generator's rule for picks: no near copy (under 25% of blocks different, rotations and mirrors included) of another level
LEVELS.forEach((level, i) => {
  if (i < 20) return
  for (const other of LEVELS) {
    if (other === level) continue
    const d = difference(level.grid, other.grid)
    assert.ok(d >= 0.25, `${level.id} is a near copy of ${other.id} (${(100 * d).toFixed(1)}% different)`)
  }
})

for (const level of LEVELS) {
  const win = solvableWith(level, level.ink)
  assert.ok(win, `${level.id} cannot be cleared with its ${level.ink} ink`)
  assert.equal(status(replay(level, level.ink, win.moves)), 'won', `${level.id}: the found line wins when replayed`)
  const best = minInk(level)
  assert.equal(best.ink, level.par, `${level.id}: par is the least ink (${best.ink}), not ${level.par}. Run npm run inkmaze:solve -- --write`)
  assert.ok(best.explored < 200_000, `${level.id}: the solver explored ${best.explored} positions; keep levels quick to check`)
  if (level.par > 0) assert.equal(solvableWith(level, level.par - 1), null, `${level.id}: one drop under par must not be enough`)
}

// ------------------------------------------------------- the difficulty curve
// Each of levels 21 to 25 must be harder than level 20 and than each of them
// before it. Eleven measures, all at par ink (MEASURES in
// scripts/inkmaze-hardness.mjs says what each is and which way is harder).
// Five model a careful player, one who never makes a move that visibly loses
// (more blocks left than ink, or a block no roll can reach again):
//   careful    its chance to clear the level, picking at random among the moves it would make
//   safeWrong  moves offered on the least-ink line that look safe but can no longer win
//   horizon    how many moves such a move lets it go on, on average, before the dead end shows
//   beam       the smallest beam search width that clears the level, best of five scorings
//   nmcs       how many of six seeded nested Monte Carlo searches clear it
// and six are plainer ones, the ones the first picks for these levels were judged by:
//   lines, decisions, planner (the least lookahead a simple planner needs),
//   greedy (ink over par a greedy player needs; Infinity: it gets stuck),
//   moves, inkPerFloor
// A level is harder than another when it is harder on more of the eleven
// than it is easier, and also on more of the five careful-player ones. On
// top of that careful, safeWrong and horizon must rise at every step. The
// last level is a small board: a narrower beam search clears it, and it has
// a second least-ink line, but it is harder on every other measure that
// differs.
// The quick, exact measures are recomputed here and must match the table;
// beam, nmcs, planner and greedy take longer, so they are written down.
// After changing any of these levels, run
//   node scripts/inkmaze-generate.mjs --hardness 20-25 --slow
// (about a quarter of an hour) and paste the rows it prints.
const CURVE = [
  { id: 'dead-end', careful: 6.729e-13, safeWrong: 45, horizon: 30.53, beam: 16384, nmcs: 2, lines: 2, decisions: 34, planner: 38, greedy: Infinity, moves: 38, inkPerFloor: 1.951 },
  { id: 'the-pantry', careful: 2.243e-13, safeWrong: 47, horizon: 31.31, beam: 32768, nmcs: 0, lines: 1, decisions: 36, planner: 22, greedy: Infinity, moves: 39, inkPerFloor: 1.642 },
  { id: 'long-hall', careful: 8.412e-14, safeWrong: 48, horizon: 31.38, beam: 32768, nmcs: 0, lines: 1, decisions: 37, planner: 33, greedy: Infinity, moves: 40, inkPerFloor: 1.691 },
  { id: 'boiler-room', careful: 4.206e-14, safeWrong: 49, horizon: 31.47, beam: 65536, nmcs: 0, lines: 1, decisions: 39, planner: 43, greedy: Infinity, moves: 43, inkPerFloor: 1.717 },
  { id: 'the-study', careful: 9.346e-15, safeWrong: 52, horizon: 31.64, beam: 65536, nmcs: 0, lines: 1, decisions: 39, planner: 44, greedy: Infinity, moves: 44, inkPerFloor: 1.732 },
  { id: 'locked-room', careful: 2.769e-15, safeWrong: 55, horizon: 32.15, beam: 2048, nmcs: 0, lines: 2, decisions: 39, planner: 45, greedy: Infinity, moves: 45, inkPerFloor: 2.184 },
]
{
  const first = LEVELS.findIndex((level) => level.id === CURVE[0].id)
  assert.equal(first, 19, 'the curve starts at level 20')
  assert.deepEqual(LEVELS.slice(first).map((level) => level.id), CURVE.map((row) => row.id), 'the curve table lists level 20 and every level after it, in order')
  for (const row of CURVE) {
    assert.deepEqual(Object.keys(row).sort(), ['id', ...Object.keys(MEASURES)].sort(), `${row.id}: the table gives every measure`)
    const level = LEVELS.find((entry) => entry.id === row.id)
    const h = hardness(level, level.par) // par was checked against minInk above
    const exact = {
      careful: Number(h.careful.toExponential(3)), safeWrong: h.safeWrong, horizon: Number(h.horizon.toFixed(2)),
      lines: h.lines, decisions: h.decisions, moves: h.moves, inkPerFloor: Number(h.inkPerFloor.toFixed(3)),
    }
    for (const [key, value] of Object.entries(exact)) assert.equal(row[key], value, `${row.id}: ${key} is ${value}, the table says ${row[key]}`)
  }
  CURVE.forEach((row, i) => {
    if (!i) return
    const before = CURVE[i - 1]
    for (const key of ['careful', 'safeWrong', 'horizon']) assert.equal(compare(before, row, [key]).harder, 1, `${row.id} is harder than ${before.id} on ${key}`)
    for (const other of CURVE.slice(0, i)) {
      const all = compare(other, row)
      const careful = compare(other, row, CAREFUL_MEASURES)
      assert.ok(all.harder > all.easier, `${row.id} is harder than ${other.id} on most measures (${all.harder} harder, ${all.easier} easier)`)
      assert.ok(careful.harder > careful.easier, `${row.id} is harder than ${other.id} for the careful player (${careful.harder} harder, ${careful.easier} easier)`)
    }
  })
}

// The search-result text for /minigames/inkMaze/ (scripts/stubs.mjs) is typed by hand: keep its numbers true
{
  const stubs = readFileSync(new URL('./stubs.mjs', import.meta.url), 'utf8')
  const desc = stubs.match(/'ink-maze':\s*\{[^}]*?desc:\s*'([^']*)'/)?.[1]
  assert.ok(desc, 'stubs.mjs has a description for ink-maze')
  const side = (level) => { const s = initialState(level); return `${s.width} × ${s.height}` }
  const largest = LEVELS.reduce((a, b) => (b.grid.length * b.grid[0].length > a.grid.length * a.grid[0].length ? b : a))
  assert.match(desc, new RegExp(`\\b${LEVELS.length} levels\\b`), `stubs.mjs says how many levels there are (${LEVELS.length}): "${desc}"`)
  assert.ok(desc.includes(`from ${side(LEVELS[0])} to ${side(largest)}`), `stubs.mjs gives the board sizes (${side(LEVELS[0])} to ${side(largest)}): "${desc}"`)
}

console.log(`PASS ink maze: rules, sessions, plain-data state, ${LEVELS.length} levels clearable with their ink, harder at every step from level 20 to ${LEVELS.length}`)
