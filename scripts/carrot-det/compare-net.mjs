// Compares CarrotNetDet results across runtimes: every 30th-netTick NetDigest (first divergent checkpoint), the deep-hash
// checkpoints and the outcome. Prints one line per spec and runtime; exits 1 on any difference.
//   node compare-net.mjs <resultsRoot> <reference dir> <other dirs...>
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const [root, ref, ...others] = process.argv.slice(2)
const load = (dir, id) => { const f = join(root, dir, id + '.json'); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null }
const ids = readdirSync(join(root, ref)).filter(f => f.endsWith('.json') && !f.startsWith('_')).map(f => f.slice(0, -5)).sort()
const deepMap = s => new Map(s.split(';').filter(Boolean).map(x => x.split(':')))
let bad = 0; const rows = [], out = {}
for (const id of ids) {
  const a = load(ref, id)
  for (const o of others) {
    const b = load(o, id); if (!b) { rows.push(`${id.padEnd(14)} ${o.padEnd(22)} MISSING`); bad++; continue }
    const n = Math.min(a.digestLog.length, b.digestLog.length) / 16; let first = 0
    for (let i = 0; i < n; i++) if (a.digestLog.substr(i * 16, 16) !== b.digestLog.substr(i * 16, 16)) { first = (i + 1) * 30; break }
    const da = deepMap(a.deep), db = deepMap(b.deep); let deepSame = 0, deepDiff = 0; for (const [t, h] of da) { if (!db.has(t)) continue; if (db.get(t) === h) deepSame++; else if (!deepDiff) deepDiff = +t }
    const outcome = ['ticks', 'phase', 'wave', 'coins', 'health', 'score', 'refused', 'late'].filter(k => a[k] !== b[k])
    const identical = !first && a.digestLog === b.digestLog && !deepDiff && a.chain === b.chain && !outcome.length && a.schema === b.schema
    if (!identical) bad++
    out[`${id}|${o}`] = { identical, firstDigestDivergence: first, digests: n, deepEqual: deepSame, deepCheckpoints: da.size, firstDeepDivergence: deepDiff, outcomeDiffers: outcome }
    rows.push(`${id.padEnd(14)} ${o.padEnd(22)} ${identical ? 'IDENTICAL' : 'DIFFERS  '} ticks=${b.ticks}/${a.ticks} digests=${n} diverge@${first} deepEq=${deepSame}/${da.size} outcome=[${outcome}] schema=${a.schema === b.schema ? 'eq' : 'NE'}`)
  }
}
console.log(`reference: ${ref}`); console.log(rows.join('\n'))
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(out, null, 1))
process.exit(bad ? 1 : 0)
