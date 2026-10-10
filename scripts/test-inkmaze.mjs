#!/usr/bin/env node
/**
 * Ink Maze: rules, session, plain-data state, and every level clearable with its ink.
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
assert.equal(LEVELS.length, 10, 'ten levels ship')
assert.equal(new Set(LEVELS.map((l) => l.id)).size, LEVELS.length, 'level ids are unique')
const sizes = LEVELS.map((l) => initialState(l)).map((s) => Math.max(s.width, s.height))
assert.equal(sizes[0], 4, 'the first level is 4 by 4')
assert.equal(sizes.at(-1), 7, 'the last level is 7 by 7')
sizes.forEach((size, i) => i && assert.ok(size >= sizes[i - 1], `level ${i + 1} is not smaller than level ${i}`))
for (const level of LEVELS) {
  const s = initialState(level)
  assert.equal(s.width, s.height, `${level.id} is square`)
  assert.equal(level.ink, level.par + level.slack, `${level.id}: ink is par + slack`)
}
assert.ok(LEVELS.slice(0, 3).every((l) => l.slack > 0), 'early levels give some slack')
assert.ok(LEVELS.slice(-3).every((l) => l.slack === 0), 'the last three give none')

for (const level of LEVELS) {
  const win = solvableWith(level, level.ink)
  assert.ok(win, `${level.id} cannot be cleared with its ${level.ink} ink`)
  assert.equal(status(replay(level, level.ink, win.moves)), 'won', `${level.id}: the found line wins when replayed`)
  const best = minInk(level)
  assert.equal(best.ink, level.par, `${level.id}: par is the least ink (${best.ink}), not ${level.par}. Run npm run inkmaze:solve -- --write`)
  if (level.par > 0) assert.equal(solvableWith(level, level.par - 1), null, `${level.id}: one drop under par must not be enough`)
}

console.log(`PASS ink maze: rules, sessions, plain-data state, ${LEVELS.length} levels clearable with their ink`)
