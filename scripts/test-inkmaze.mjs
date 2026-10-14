#!/usr/bin/env node
/**
 * Ink Maze: rules, session, plain-data state, every level clearable with its
 * ink, and levels that keep getting harder from level 20 on (by a held-out
 * panel of players, see the curve table).
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
import { PANEL, difference, panel, panelCompare } from './inkmaze-hardness.mjs'

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
assert.ok(sizes.at(-1) < sizes.at(-2), `the final level is smaller than the ${sizes.at(-2)} by ${sizes.at(-2)} boards before it (the hardest to plan, not the biggest), not ${sizes.at(-1)} by ${sizes.at(-1)}`)
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
// Levels 21 to 25 get harder at every step from level 20, judged by a panel
// of seventeen players that were not what the search for these levels aimed
// at (PANEL in scripts/inkmaze-hardness.mjs says what each one is): careful
// random players looking 0 to 30 moves ahead, a careful player that prefers
// moves coloring many new blocks for little ink, beam search under four
// scorings, a careful depth-first search in random and in greedy move order,
// nested Monte Carlo search, and how many moves of the least-ink line go
// against the careful player's instinct. All play at par ink.
// The rule, for every pair of levels from 20 on (not only neighbours): the
// later one is harder on at least twice as many panel measures as it is
// easier, and it is never easier by a large margin (10 times the chance to
// clear it, 2 times less search, a 4 times narrower beam, 3 fewer
// counter-instinct moves, or twice the Monte Carlo wins). The table also
// records where a later level is easier; the panel players disagree with
// each other, so no level is harder on every one of them.
// The exact columns (careful*, soft, counterFresh, counterEff, lines, states)
// are recomputed here with panel() and must match; the search players come
// from scripts/inkmaze-panel.c and are written down. After changing any of
// these levels, run
//   node scripts/inkmaze-panel.mjs 20-25
// (a few minutes) and paste the rows it prints.
const CURVE = [
  { id: 'dead-end', careful0: 6.729e-13, careful2: 1.615e-11, careful4: 4.845e-11, careful8: 1.454e-9, careful12: 1.861e-8, careful20: 9.303e-8, careful30: 0.000004207, soft: 4.27e-16, beamGainInk: 32768, beamAStar: 32768, beamRareFirst: 16384, beamTwiceColored: 32768, dfsRandom: 78495, dfsGreedy: 124408, counterFresh: 7, counterEff: 2, nmcs: [4, 300], lines: 2, states: 68830 },
  { id: 'scullery', careful0: 3.988e-13, careful2: 4.785e-12, careful4: 7.178e-12, careful8: 1.938e-10, careful12: 7.752e-10, careful20: 6.202e-9, careful30: 0.000002009, soft: 3.557e-15, beamGainInk: 131072, beamAStar: 65536, beamRareFirst: 16384, beamTwiceColored: 32768, dfsRandom: 147443, dfsGreedy: 291434, counterFresh: 5, counterEff: 3, nmcs: [4, 300], lines: 1, states: 143432 },
  { id: 'the-gallery', careful0: 1.682e-13, careful2: 2.019e-12, careful4: 4.038e-12, careful8: 9.69e-11, careful12: 1.211e-10, careful20: 1.569e-9, careful30: 4.14e-7, soft: 4.412e-16, beamGainInk: 131072, beamAStar: 131072, beamRareFirst: 8192, beamTwiceColored: 65536, dfsRandom: 519817, dfsGreedy: 331573, counterFresh: 6, counterEff: 1, nmcs: [3, 300], lines: 2, states: 315788 },
  { id: 'bell-tower', careful0: 8.412e-14, careful2: 6.729e-13, careful4: 6.729e-13, careful8: 4.038e-12, careful12: 1.211e-11, careful20: 5.814e-10, careful30: 3.489e-9, soft: 1.779e-15, beamGainInk: 131072, beamAStar: 131072, beamRareFirst: 16384, beamTwiceColored: 32768, dfsRandom: 894994, dfsGreedy: 1084447, counterFresh: 7, counterEff: 2, nmcs: [0, 300], lines: 1, states: 545054 },
  { id: 'clock-room', careful0: 2.215e-14, careful2: 4.431e-14, careful4: 6.646e-14, careful8: 5.982e-13, careful12: 2.393e-12, careful20: 2.871e-11, careful30: 7.752e-10, soft: 1.16e-15, beamGainInk: 262144, beamAStar: 262144, beamRareFirst: 16384, beamTwiceColored: 65536, dfsRandom: 789038, dfsGreedy: 649155, counterFresh: 9, counterEff: 2, nmcs: [5, 300], lines: 1, states: 451106 },
  { id: 'the-vault', careful0: 2.532e-18, careful2: 1.519e-17, careful4: 1.519e-17, careful8: 1.368e-16, careful12: 3.282e-15, careful20: 5.908e-13, careful30: 1.595e-11, soft: 1.274e-18, beamGainInk: 262144, beamAStar: 262144, beamRareFirst: 131072, beamTwiceColored: 262144, dfsRandom: 1049775, dfsGreedy: 986150, counterFresh: 11, counterEff: 9, nmcs: [0, 300], lines: 2, states: 524864 },
]
{
  const first = LEVELS.findIndex((level) => level.id === CURVE[0].id)
  assert.equal(first, 19, 'the curve starts at level 20')
  assert.deepEqual(LEVELS.slice(first).map((level) => level.id), CURVE.map((row) => row.id), 'the curve table lists level 20 and every level after it, in order')
  const columns = ['id', ...Object.keys(PANEL), 'lines', 'states'].sort()
  const exactKeys = ['careful0', 'careful2', 'careful4', 'careful8', 'careful12', 'careful20', 'careful30', 'soft', 'counterFresh', 'counterEff', 'lines', 'states']
  for (const row of CURVE) {
    assert.deepEqual(Object.keys(row).sort(), columns, `${row.id}: the table gives every panel measure`)
    const level = LEVELS.find((entry) => entry.id === row.id)
    const exact = panel(level, level.par) // par was checked against minInk above
    for (const key of exactKeys) {
      if (key.startsWith('careful') || key === 'soft') {
        // the C tool prints five significant digits and the table keeps four
        assert.ok(Math.abs(row[key] - exact[key]) <= 1e-3 * exact[key], `${row.id}: ${key} is ${exact[key].toExponential(3)}, the table says ${row[key]}`)
      } else {
        assert.equal(row[key], exact[key], `${row.id}: ${key} is ${exact[key]}, the table says ${row[key]}`)
      }
    }
  }
  const notes = []
  let margin = Infinity
  CURVE.forEach((row, i) => {
    for (const other of CURVE.slice(0, i)) {
      const { harder, easier, easierOn, large } = panelCompare(other, row)
      margin = Math.min(margin, harder - easier)
      assert.deepEqual(large, [], `${row.id} is much easier than ${other.id} on ${large.join(', ')}`)
      assert.ok(harder >= 2 * easier && harder > easier, `${row.id} is harder than ${other.id} on ${harder} panel measures and easier on ${easier} (${easierOn.join(', ')}): not a clear majority`)
      if (other === CURVE[i - 1]) notes.push(`${i + 20} ${harder}-${easier}`)
    }
  })
  console.log(`  curve from level 20, each level against the one before (harder-easier of ${Object.keys(PANEL).length}): ${notes.join(', ')}; every pair at least ${margin} more harder than easier`)
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

console.log(`PASS ink maze: rules, sessions, plain-data state, ${LEVELS.length} levels clearable with their ink, the player panel's order from level 20 to ${LEVELS.length}`)
