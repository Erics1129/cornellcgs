#!/usr/bin/env node
/**
 * The command the Source chapter's terminal types:
 *
 *   npm run equity -- As Ks            A♠ K♠ against one random hand
 *   npm run equity -- Qh Qd  Js Tc 2d  …with a flop on the board
 *
 * Runs src/solver/equity.ts (the file the chapter's editor shows) directly;
 * Node 22.18+ / 23.6+ strips the types itself. Prints the same lines the
 * chapter's terminal draws.
 */
import { equityRun, key, label, margin95, parse } from '../src/solver/equity.ts'

const USAGE = 'usage: npm run equity -- <card> <card> [3, 4 or 5 board cards]   e.g. As Ks  or  Qh Qd Js Tc 2d'
const fail = (message) => {
  console.error(`${message}\n${USAGE}`)
  process.exit(1)
}

const args = process.argv.slice(2)
if (args.length < 2) fail('two hole cards, please')

let hole, board
try {
  hole = args.slice(0, 2).map(parse)
  board = args.slice(2).map(parse)
} catch (error) {
  fail(`${error.message} (ranks 2-9 T J Q K A, suits s h d c)`)
}
if (![0, 3, 4, 5].includes(board.length)) fail(`a board is 3, 4 or 5 cards, not ${board.length}`)
const all = [...hole, ...board]
if (new Set(all.map(key)).size !== all.length) fail('each card can appear only once')

const street = { 0: 'preflop', 3: 'flop', 4: 'turn', 5: 'river' }[board.length]
const run = equityRun(hole, board)
const last = run[run.length - 1]
const pct = (x) => `${(x * 100).toFixed(1)}%`

console.log(`${hole.map(label).join(' ')} vs a random hand · ${street}${board.length ? ' · ' + board.map(label).join(' ') : ''}`)
for (const step of run.filter((_, i) => (i + 1) % 10 === 0)) {
  console.log(`  ${step.deals.toLocaleString('en-US').padStart(6)} deals   ${pct(step.equity)}`)
}
console.log(`equity ${pct(last.equity)}  ±${pct(margin95(last.equity, last.deals))} (95%)`)
