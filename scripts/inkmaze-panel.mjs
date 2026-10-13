#!/usr/bin/env node
/**
 * Ink Maze: measures levels on the held-out player panel and prints the rows
 * of the curve table in scripts/test-inkmaze.mjs.
 *
 *   node scripts/inkmaze-panel.mjs 20-25            (levels by number; default 20 to the last)
 *   node scripts/inkmaze-panel.mjs 20-25 --quick    fewer seeds, for a first look
 *
 * It compiles scripts/inkmaze-panel.c (the panel's independent C
 * implementation) with `cc` into the system temp folder and runs, per level,
 * at par ink: the exact careful and soft players (dp), the counter-instinct
 * walk over every least-ink line (lines), the smallest beam width under four
 * scorings, the median nodes of a careful depth-first search over 201 seeds
 * in random and in greedy move order, and nested Monte Carlo search at level
 * 4 over 300 seeds. A 9 x 9 level takes about half a minute to a few minutes
 * per level on a desktop; levels run in parallel.
 */
import { execFile, execFileSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { LEVELS } from '../src/minigames/inkmaze/levels.ts'

const run = promisify(execFile)
const SOURCE = fileURLToPath(new URL('./inkmaze-panel.c', import.meta.url))
const BINARY = join(tmpdir(), 'inkmaze-panel')
if (!existsSync(BINARY) || statSync(BINARY).mtimeMs < statSync(SOURCE).mtimeMs) {
  execFileSync('cc', ['-O2', '-o', BINARY, SOURCE, '-lm'], { stdio: 'inherit' })
}

const args = process.argv.slice(2)
const quick = args.includes('--quick')
const range = args.find((a) => /^\d+(-\d+)?$/.test(a)) ?? `20-${LEVELS.length}`
const [from, to = from] = range.split('-').map(Number)
const SEEDS = quick ? 41 : 201
const NMCS_SEEDS = quick ? 60 : 300

const tool = async (...a) => (await run(BINARY, a.map(String), { maxBuffer: 1 << 24 })).stdout
const num = (re, text) => {
  const m = re.exec(text)
  if (!m) throw new Error(`no match for ${re} in ${text.slice(0, 200)}`)
  return Number(m[1])
}
const p4 = (v) => Number(v.toExponential(3))

async function measure(level) {
  const grid = level.grid.join('/')
  const par = level.par
  const dp = await tool('dp', grid, par)
  const look = Object.fromEntries([...dp.matchAll(/\bL(\d+)=(\S+)/g)].map(([, l, v]) => [l, Number(v)]))
  const lines = await tool('lines', grid, par)
  const beams = await Promise.all([0, 1, 2, 3].map(async (sc) => {
    const w = num(/beam scoring \d+: (-?\d+)/, await tool('beam', grid, par, sc, 22))
    return w > 0 ? w : Infinity
  }))
  const dfs = await Promise.all([0, 1].map(async (order) => {
    const out = await tool('dfs', grid, par, SEEDS, 100_000_000, order)
    return num(/solved \d+ median (\d+)/, out)
  }))
  const nmcs = num(/wins (\d+) of/, await tool('nmcs', grid, par, 4, NMCS_SEEDS))
  return {
    id: level.id,
    careful0: p4(look[0]), careful2: p4(look[2]), careful4: p4(look[4]), careful8: p4(look[8]),
    careful12: p4(look[12]), careful20: p4(look[20]), careful30: p4(look[30]),
    soft: p4(num(/\bsoft1=(\S+)/, dp)),
    beamGainInk: beams[0], beamAStar: beams[1], beamRareFirst: beams[2], beamTwiceColored: beams[3],
    dfsRandom: dfs[0], dfsGreedy: dfs[1],
    counterFresh: num(/counterFresh (\d+)/, lines), counterEff: num(/counterEff (\d+)/, lines),
    nmcs: [nmcs, NMCS_SEEDS],
    lines: num(/^lines (\S+)/m, dp), states: num(/states (\d+)/, dp),
  }
}

const levels = LEVELS.slice(from - 1, to)
const rows = await Promise.all(levels.map(measure))
const show = (v) => (Array.isArray(v) ? `[${v.join(', ')}]` : typeof v === 'string' ? `'${v}'` : v === Infinity ? 'Infinity' : String(v))
for (const row of rows) console.log(`  { ${Object.entries(row).map(([k, v]) => `${k}: ${show(v)}`).join(', ')} },`)
