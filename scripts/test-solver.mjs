#!/usr/bin/env node
/**
 * The Source chapter claims its code is real and runs. This keeps that true:
 * hand rankings, tiebreaks, known equities within Monte Carlo error, and the
 * `npm run equity` output the chapter's terminal mirrors.
 *
 *   node scripts/test-solver.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { best7, equityRun, margin95, parse, potEquity } from '../src/solver/equity.ts'

const hand = (s) => s.split(' ').map(parse)
const category = (s) => best7(hand(s), []) >> 20
const order = (a, b) => Math.sign(best7(hand(a), []) - best7(hand(b), []))

const CATEGORIES = [
  ['As Ks Qs Js Ts 2d 3c', 8, 'royal flush'], ['As 2s 3s 4s 5s Kd Kc', 8, 'wheel straight flush'],
  ['9h 9d 9s 9c 2d 3c 4h', 7, 'quads'], ['Kh Kd Ks 2c 2d 7h 8s', 6, 'full house'],
  ['Kh Kd Ks 2c 2d 2h 8s', 6, 'two trips = full house'], ['Ah 7h 4h 2h 9h Kd Kc', 5, 'flush over a pair'],
  ['Ad 2c 3h 4s 5d Kc Qh', 4, 'wheel'], ['6d 7c 8h 9s Td 2c 2h', 4, 'straight over a pair'],
  ['7d 7c 7h Ks 2d 4c 9h', 3, 'trips'], ['7d 7c Kh Ks 2d 2c 9h', 2, 'two pair of three'],
  ['7d 7c Kh 3s 2d 4c 9h', 1, 'pair'], ['Ad Jc 8h 6s 4d 3c 2h', 0, 'high card'],
  ['9h 9d 9s 9c Kh Kd Ks', 7, 'quads beat the full house in the same seven'],
  ['Ah Kh Qh Jh 9h Ad Ac', 5, 'flush beats trips'],
]
for (const [cards, want, name] of CATEGORIES) assert.equal(category(cards), want, name)

const ORDERS = [
  ['As Ad Kc Qd 2h 3c 4d', 'Ah Ac Kd Js 2c 3d 4h', 1, 'pair of aces, queen kicker beats jack'],
  ['Ts Td 4c 4d Ah 2c 3s', 'Tc Th 4h 4s Kh 2d 3d', 1, 'two pair, ace kicker'],
  ['Ad 2c 3h 4s 5d Kc Qh', '2d 3c 4h 5s 6d Kh Qd', -1, 'the wheel is the lowest straight'],
  ['Kh Kd Ks 2c 2d 2h 8s', 'Kc Ks Kd 3c 3d 7h 8d', -1, 'kings full of threes beat kings full of twos'],
  ['As Ks 9d 8c 2h 3c 4d', 'Ac Kc 9h 8d 2s 3h 4s', 0, 'identical ranks split'],
]
for (const [a, b, want, name] of ORDERS) assert.equal(order(a, b), want, name)
// Flush tiebreak: A K 7 4 3 beats A K 7 4 2
assert.equal(order('Ah Kh 7h 4h 3h 2c 9d', 'Ad Kd 7d 4d 2d 3c 9s'), 1, 'flush kickers compare all five')

// Published preflop equities against one random hand, within 3 standard errors
const KNOWN = [['As Ah', 0.852], ['As Ks', 0.670], ['7c 2d', 0.346], ['Kh Qh', 0.634], ['2c 2d', 0.503]]
for (const [cards, want] of KNOWN) {
  const got = potEquity(hand(cards), [], 2e4)
  assert.ok(Math.abs(got - want) < 3 * Math.sqrt(want * (1 - want) / 2e4) + 0.004, `${cards}: ${got} vs ${want}`)
}

// A run's checkpoints are its batches' running mean, and end at the total
const run = equityRun(hand('Qs Qd'), [], 8, 250)
assert.equal(run.length, 8)
assert.equal(run.at(-1).deals, 2000)
assert.ok(margin95(0.5, 20000) > 0.006 && margin95(0.5, 20000) < 0.008)

// The editor shows the file: the region the chapter types is in the source verbatim
const source = readFileSync(new URL('../src/solver/equity.ts', import.meta.url), 'utf8')
assert.match(source, /\/\/ #region potEquity\n\/\/ Pot equity by Monte Carlo[\s\S]*function potEquity\(hole: Card\[\], board: Card\[\], n = 2e4\)[\s\S]*\/\/ #endregion/)

// The command the terminal types prints the lines the terminal draws
const out = execFileSync(process.execPath, ['scripts/equity.mjs', 'As', 'Ks'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' })
const lines = out.trim().split('\n')
assert.equal(lines[0], 'A♠ K♠ vs a random hand · preflop')
assert.deepEqual(lines.slice(1, 5).map((l) => l.trim().split(/\s+/)[0]), ['5,000', '10,000', '15,000', '20,000'])
assert.match(lines[5], /^equity \d+\.\d% {2}±0\.\d% \(95%\)$/)

console.log(`PASS solver: ${CATEGORIES.length} categories, ${ORDERS.length} orderings, ${KNOWN.length} known equities, chapter excerpt, CLI output`)
