#!/usr/bin/env node
/**
 * Ink Maze level solver.
 *
 *   npm run inkmaze:solve              report every level; exit 1 if any is off
 *   npm run inkmaze:solve -- --write   also write par and ink (par + slack) into src/minigames/inkmaze/levels.ts
 *
 * Searches positions (the ball's block + the set of colored blocks) for the
 * least ink that clears each level, then confirms it two ways with the real
 * engine: that exactly that much ink is enough, and that one drop less is not.
 *
 * The last columns are the quick, exact measures of how hard each level is
 * (scripts/inkmaze-hardness.mjs, all at par ink): `lines` least-ink lines,
 * `careful` the chance that a careful player (one who never makes a move
 * that visibly loses) clears it by picking at random among the moves it
 * would make, `safe-wrong` the moves on the line that look safe but cannot
 * win, `horizon` how many moves such a move lets it go on, on average,
 * before the dead end shows, `decisions` the positions on the line where
 * only one of two or more moves wins, and `ink/floor` par over the floor
 * blocks. `node scripts/inkmaze-generate.mjs --hardness --slow` adds the
 * slow ones.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { LEVELS } from '../src/minigames/inkmaze/levels.ts'
import { floorCount, initialState, status } from '../src/minigames/inkmaze/engine.ts'
import { minInk, replay, solvableWith } from '../src/minigames/inkmaze/solver.ts'
import { hardness } from './inkmaze-hardness.mjs'

const write = process.argv.includes('--write')
const levelsPath = fileURLToPath(new URL('../src/minigames/inkmaze/levels.ts', import.meta.url))

let problems = 0
const rows = []
const found = new Map()
for (const [n, level] of LEVELS.entries()) {
  const t0 = performance.now()
  const solution = minInk(level)
  const ms = Math.round(performance.now() - t0)
  const start = initialState(level)
  const size = `${start.width}x${start.height}`
  if (!solution) {
    problems++
    rows.push({ '#': n + 1, id: level.id, size, floors: floorCount(start), par: 'UNSOLVABLE', ink: level.ink, slack: level.slack, moves: '', explored: '', ms })
    continue
  }
  // the same answer from the engine itself, at the edge of the budget
  const atPar = solvableWith(level, solution.ink)
  const belowPar = solution.ink > 0 ? solvableWith(level, solution.ink - 1) : null
  const replayed = status(replay(level, solution.ink, solution.moves))
  const confirmed = !!atPar && !belowPar && replayed === 'won'
  if (!confirmed) problems++
  const ink = solution.ink + level.slack
  found.set(level.id, { par: solution.ink, ink })
  const stale = level.par !== solution.ink || level.ink !== ink
  if (stale && !write) problems++
  const hard = hardness(level, solution.ink)
  rows.push({
    '#': n + 1, id: level.id, size, floors: floorCount(start), par: solution.ink, ink: write ? ink : level.ink,
    slack: level.slack, moves: solution.moves.length, explored: solution.explored, ms,
    check: confirmed ? (stale && !write ? 'stale par/ink' : 'ok') : 'MISMATCH',
    lines: hard.lines, careful: hard.careful.toExponential(1), 'safe-wrong': hard.safeWrong, horizon: hard.horizon.toFixed(1),
    decisions: hard.decisions, 'ink/floor': hard.inkPerFloor.toFixed(2),
  })
}
console.table(rows)

if (write) {
  let source = readFileSync(levelsPath, 'utf8')
  for (const [id, { par, ink }] of found) {
    // within this level's entry only: from its id to the next `grid:`
    const re = new RegExp(`(id: '${id}',[\\s\\S]*?par: )\\d+(,\\s*ink: )\\d+`)
    if (!re.test(source)) { console.error(`could not find par/ink for ${id} in levels.ts`); process.exit(1) }
    source = source.replace(re, `$1${par}$2${ink}`)
  }
  writeFileSync(levelsPath, source)
  console.log('wrote par and ink into src/minigames/inkmaze/levels.ts')
}

if (problems) {
  console.error(`${problems} problem(s)${write ? '' : '. Run with --write to update par and ink.'}`)
  process.exit(1)
}
