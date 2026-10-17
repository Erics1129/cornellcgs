// Compares probe results across runtimes: per-tick digests (first divergent tick), deep-hash checkpoints and outcomes.
//   node compare.mjs <resultsRoot> <reference runtime dir> <other dirs...>
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const [root, ref, ...others] = process.argv.slice(2)
const load = (dir, id) => { const f = join(root, dir, id + '.json'); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null }
const ids = readdirSync(join(root, ref)).filter(f => /^replay-.*\.json$/.test(f)).map(f => f.slice(0, -5)).sort()
const firstTickDiff = (a, b) => { const n = Math.min(a.length, b.length) / 8; for (let i = 0; i < n; i++) if (a.substr(i * 8, 8) !== b.substr(i * 8, 8)) return i + 1; return a.length === b.length ? 0 : n + 1 }
const deepMap = s => new Map(s.split(';').filter(Boolean).map(x => x.split(':')))
const rows = [], out = {}
for (const id of ids) {
  const a = load(ref, id)
  for (const o of others) {
    const b = load(o, id); if (!b) { rows.push(`${id.padEnd(13)} ${o.padEnd(9)} MISSING`); continue }
    const tickDiff = firstTickDiff(a.perTick, b.perTick)
    const da = deepMap(a.deepLog), db = deepMap(b.deepLog); let deepDiff = 0, deepSame = 0
    for (const [t, h] of da) { if (!db.has(t)) continue; if (db.get(t) === h) deepSame++; else if (!deepDiff) deepDiff = +t }
    const outcome = ['ticks', 'phase', 'wave', 'health', 'coins', 'kills', 'towers', 'earned'].filter(k => a[k] !== b[k])
    const identical = tickDiff === 0 && !deepDiff && a.finalDeep === b.finalDeep && a.chainDeep === b.chainDeep && a.chainDigest === b.chainDigest
    out[`${id}|${o}`] = { identical, firstDigestDivergenceTick: tickDiff, firstDeepDivergenceTick: deepDiff, deepCheckpointsEqual: deepSame, deepCheckpoints: da.size, outcomeFieldsDiffer: outcome, discreteChainEqual: a.chainDiscrete === b.chainDiscrete, ref: { ticks: a.ticks, phase: a.phase, coins: a.coins, kills: a.kills, chainDigest: a.chainDigest, chainDeep: a.chainDeep }, other: { ticks: b.ticks, phase: b.phase, coins: b.coins, kills: b.kills, chainDigest: b.chainDigest, chainDeep: b.chainDeep }, dataHash: [a.dataHash, b.dataHash], schema: [a.schema, b.schema] }
    rows.push(`${id.padEnd(13)} ${o.padEnd(9)} ${identical ? 'IDENTICAL' : 'DIFFERS  '} ticks=${String(b.ticks).padStart(5)}/${String(a.ticks).padStart(5)} digestDivergesAt=${tickDiff} deepDivergesAt=${deepDiff} deepEq=${deepSame}/${da.size} discrete=${a.chainDiscrete === b.chainDiscrete ? 'eq' : 'NE'} outcomeDiff=[${outcome.join(',')}] data=${a.dataHash === b.dataHash ? 'eq' : 'NE'} schema=${a.schema === b.schema ? 'eq' : 'NE'}`)
  }
}
console.log(`reference: ${ref}`); console.log(rows.join('\n'))
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(out, null, 1))
