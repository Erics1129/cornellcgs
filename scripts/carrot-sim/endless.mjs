// Two-player endless and duo bands (docs/carrot-defense/duo/sim.md). Runs the pre-registered reference bots in parallel
// slices on the standalone simulation, merges their JSON lines and evaluates the fairness targets.
//   node scripts/carrot-sim.mjs --endless-bands [--r0 50 --r1 200 --r2 200 --solo 50 --jobs J --out file --raw file --seed-offset K
//                                               --gen Key:v,... --dial id:v,... (tuning only)]
//   node scripts/carrot-sim.mjs --duo-bands [--r1 1000 --variants 20 --levels 4,8,... --jobs J --out file]
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'

const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const quantile = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo) }
const round = (x, d = 3) => x == null ? null : Math.round(x * 10 ** d) / 10 ** d
const hashOf = (repo, file) => { try { return createHash('sha256').update(readFileSync(join(repo, file))).digest('hex').slice(0, 16) } catch { return 'missing' } }
const commitOf = repo => { try { return execSync('git rev-parse --short HEAD', { cwd: repo }).toString().trim() } catch { return 'unknown' } }

async function pool(specs, jobs, fn) {
  let next = 0, failed = 0
  await Promise.all(Array.from({ length: Math.max(1, jobs) }, async () => { while (next < specs.length) { const spec = specs[next++]; if (!(await fn(spec))) failed++ } }))
  return failed
}

export const ENDLESS_TARGETS = {
  medians: { 'E-R2': [12, 20], 'E-R1': [25, 35], 'E-R0': [40, 60] },
  r2EarlySurvival: 0.98,      // E-R2 survives the first four waves
  hazardDrop: 0.03,           // from wave 6 the 3-wave smoothed hazard never falls by more than this
  bossSpike: 2, miniSpike: 1.5,
  hazardCapBelowR1Median: 0.25,
  seedIqr: 10,                // E-R1 interquartile range of waves survived
  gateShare: [0.43, 0.57],    // each gate takes 50% +-7% of the leaks
  peakLive: 110,
  // A wave's hazard is judged only where it is a reliable estimate: at least max(30, a quarter of the bot's runs) reached it (with
  // 200 runs that is 50, a standard error of about .05 on one wave). The tail beyond is reported, never judged.
  minReached: 30, minReachedShare: 0.25,
}

export function evaluateEndless(runs, meta) {
  const T = ENDLESS_TARGETS, bots = [...new Set(runs.map(r => r.bot))].sort(), out = { meta, targets: T, bots: {}, checks: [] }
  const check = (name, pass, detail) => out.checks.push({ name, pass: !!pass, detail })
  for (const bot of bots) {
    const rs = runs.filter(r => r.bot === bot), scores = rs.map(r => r.score), judged = Math.max(T.minReached, Math.ceil(T.minReachedShare * rs.length))
    const maxW = Math.max(...rs.map(r => r.score + 1)), hazard = [], reached = [], died = []
    for (let w = 1; w <= maxW; w++) { const n = rs.filter(r => r.score >= w - 1).length, d = rs.filter(r => r.score === w - 1 && !r.capped).length; reached.push(n); died.push(d); hazard.push(n ? d / n : null) }
    const smooth = hazard.map((h, i) => { const xs = [hazard[i - 1], h, hazard[i + 1]].filter((x, j) => x != null && reached[i - 1 + j] >= judged); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null })
    const leaks = rs.reduce((a, r) => [a[0] + r.gateLeaks[0], a[1] + r.gateLeaks[1]], [0, 0])
    out.bots[bot] = {
      n: rs.length, median: median(scores), q1: quantile(scores, .25), q3: quantile(scores, .75), iqr: round(quantile(scores, .75) - quantile(scores, .25), 2), min: Math.min(...scores), max: Math.max(...scores),
      first4: round(rs.filter(r => r.score >= 4).length / rs.length), medianSeconds: round(median(rs.map(r => r.seconds)), 1), peakLive: Math.max(...rs.map(r => r.peakLive)), folded: rs.reduce((a, r) => a + r.folded, 0),
      gateShare: round(leaks[0] / Math.max(1, leaks[0] + leaks[1])), leaks, capped: rs.filter(r => r.capped).length,
      hazard: hazard.map(round), smoothed: smooth.map(round), reached, judgedFrom: judged,
    }
  }
  const b = out.bots
  for (const [bot, [lo, hi]] of Object.entries(T.medians)) if (b[bot]) check(`${bot} median waves in [${lo}, ${hi}]`, b[bot].median >= lo && b[bot].median <= hi, b[bot].median)
  if (b['E-R2']) check(`E-R2 survives the first 4 waves >= ${T.r2EarlySurvival}`, b['E-R2'].first4 >= T.r2EarlySurvival, b['E-R2'].first4)
  for (const bot of bots) {
    const s = b[bot].smoothed, h = b[bot].hazard, reached = b[bot].reached, judged = b[bot].judgedFrom; let worstDrop = 0, at = 0, spikes = []
    for (let w = 7; w <= s.length; w++) { const a = s[w - 2], c = s[w - 1]; if (a != null && c != null && reached[w - 1] >= judged && a - c > worstDrop) { worstDrop = a - c; at = w } }
    check(`${bot}: from wave 6 the smoothed hazard never falls by more than ${T.hazardDrop}`, worstDrop <= T.hazardDrop + 1e-9, `${round(worstDrop)} at wave ${at}`)
    for (let w = 3; w <= h.length; w++) {
      if (reached[w - 1] < judged || h[w - 1] == null) continue
      const before = [h[w - 2], h[w - 3]].filter(x => x != null), base = before.length ? before.reduce((a, c) => a + c, 0) / before.length : 0
      const limit = w % 10 === 0 ? T.bossSpike : w % 10 === 5 ? T.miniSpike : null
      // With a near-zero base the ratio is meaningless: the spike is judged against max(base, 0.02).
      if (limit && h[w - 1] > limit * Math.max(base, 0.02) + 1e-9) spikes.push(`w${w} ${round(h[w - 1])} vs ${round(base)}`)
    }
    check(`${bot}: boss waves <= ${T.bossSpike}x and miniboss waves <= ${T.miniSpike}x the two waves before`, spikes.length === 0, spikes.join('; ') || 'none')
    check(`${bot}: peak live enemies <= ${T.peakLive}`, b[bot].peakLive <= T.peakLive, b[bot].peakLive)
    check(`${bot}: gates share the leaks 50% +-7%`, b[bot].gateShare >= T.gateShare[0] && b[bot].gateShare <= T.gateShare[1], b[bot].gateShare)
  }
  if (b['E-R1']) {
    const m = b['E-R1'].median, h = b['E-R1'].hazard, reached = b['E-R1'].reached; let worst = 0, at = 0
    for (let w = 1; w < m && w <= h.length; w++) if (reached[w - 1] >= b['E-R1'].judgedFrom && h[w - 1] > worst) { worst = h[w - 1]; at = w }
    check(`E-R1: no wave below its median has hazard > ${T.hazardCapBelowR1Median}`, worst <= T.hazardCapBelowR1Median, `${round(worst)} at wave ${at}`)
    check(`E-R1 seed IQR <= ${T.seedIqr} waves`, b['E-R1'].iqr <= T.seedIqr, b['E-R1'].iqr)
  }
  out.pass = out.checks.every(c => c.pass)
  return out
}

export async function runEndlessBands({ exe, run, value, repo, jobs }) {
  const counts = { 'E-R0': Number(value('r0', 50)), 'E-R1': Number(value('r1', 200)), 'E-R2': Number(value('r2', 200)), 'E-solo': Number(value('solo', 50)) }
  const extra = []; if (value('dial')) extra.push('dial=' + value('dial')); if (value('gen')) extra.push('gen=' + value('gen')); if (value('gold')) extra.push('gold=' + value('gold')); if (value('d')) extra.push('d=' + value('d')); extra.push('wave=' + value('wave', 150))
  // --seed-offset K runs seeds K..K+n-1 (an independent sample for robustness checks; the bands of record use offset 0).
  const offset = Number(value('seed-offset', 0)), specs = []
  for (const [bot, n] of Object.entries(counts)) for (let a = 0; a < n; a += 10) specs.push(`${bot}:${offset + a}-${offset + Math.min(n, a + 10) - 1}`)
  const started = Date.now(), runs = []
  const failed = await pool(specs, jobs, async spec => {
    const r = await run(exe, ['EndlessJobs', ...extra, spec], { quiet: true })
    if (r.code !== 0) { console.error(`endless-bands: ${spec} failed\n${r.out.slice(-1500)}`); return false }
    for (const line of r.out.split('\n')) if (line.startsWith('CARROT_EBAND ')) runs.push(JSON.parse(line.slice(13)))
    return true
  })
  const meta = { kind: 'endless-bands', bots: runs[0]?.version, seedOffset: offset, botsHash: hashOf(repo, 'unity/CarrotDefense/Assets/Scripts/CarrotEndlessBots.cs'), generatorHash: hashOf(repo, 'unity/CarrotDefense/Assets/Scripts/CarrotEndless.cs'), tuning: runs[0]?.tuning, commit: commitOf(repo), counts, extra, seconds: round((Date.now() - started) / 1000, 1), runs: runs.length, failedSlices: failed }
  const result = evaluateEndless(runs, meta)
  const out = value('out', join(repo, 'docs/carrot-defense/duo/endless-bands.json'))
  mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(result, null, 1) + '\n')
  if (value('raw')) writeFileSync(value('raw'), runs.map(r => JSON.stringify(r)).join('\n') + '\n')
  for (const [bot, s] of Object.entries(result.bots)) console.log(`${bot.padEnd(7)} n=${s.n} median=${s.median} iqr=${s.iqr} [${s.min}-${s.max}] first4=${s.first4} peakLive=${s.peakLive} gates=${s.gateShare} folded=${s.folded} capped=${s.capped}`)
  for (const c of result.checks) console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.name}: ${c.detail}`)
  console.log(`endless-bands: ${runs.length} runs in ${meta.seconds} s; ${result.pass ? 'ALL TARGETS MET' : 'targets missed'}; wrote ${out}`)
  return failed ? 1 : 0
}

// ---- Duo bands: R1 on both halves with independent seeds (p_duo next to p_solo^2), and the statistical mirror gate
// (five bot variants x seeds: outcome agreement of half 0 with the solo map, and p_win within +-0.02).
export async function runDuoBands({ exe, run, value, repo, jobs }) {
  const levels = String(value('levels', '4,8,12,16,20,24,25,26,27,28,29')).split(',').map(Number)
  const n = Number(value('r1', 1000)), variants = Number(value('variants', 20)), bots = ['R0p0', 'R0p1', 'R1', 'R2', 'RN']
  const specs = []
  for (const level of levels) {
    for (let a = 0; a < n; a += 100) for (const map of ['solo', 'half0']) specs.push(`R1:${level}:${a}-${Math.min(n, a + 100) - 1}:${map}`)
    for (let a = n; a < 2 * n; a += 100) specs.push(`R1:${level}:${a}-${Math.min(2 * n, a + 100) - 1}:half1`)
    for (const bot of bots) for (const map of ['solo', 'half0']) specs.push(`${bot}:${level}:0-${variants - 1}:${map}`)
  }
  const started = Date.now(), runs = []
  const failed = await pool(specs, jobs, async spec => {
    const r = await run(exe, ['DuoJobs', spec], { quiet: true })
    if (r.code !== 0) { console.error(`duo-bands: ${spec} failed\n${r.out.slice(-1500)}`); return false }
    const tag = spec.split(':')[0]
    for (const line of r.out.split('\n')) if (line.startsWith('CARROT_DUOBAND ')) { const x = JSON.parse(line.slice(15)); x.variant = tag; runs.push(x) }
    return true
  })
  const out = { meta: { kind: 'duo-bands', commit: commitOf(repo), botsHash: hashOf(repo, 'unity/CarrotDefense/Assets/Scripts/CarrotBotTests.cs'), r1: n, variants, seconds: round((Date.now() - started) / 1000, 1), failedSlices: failed }, levels: [], checks: [] }
  for (const level of levels) {
    const r1 = runs.filter(r => r.level === level && r.variant === 'R1')
    const solo = r1.filter(r => r.map === 'solo'), h0 = r1.filter(r => r.map === 'half0' && r.seed < n), h1 = r1.filter(r => r.map === 'half1')
    const pSolo = solo.filter(r => r.won).length / Math.max(1, solo.length)
    // A duo match pairs half 0 seed s with half 1 seed n+s: both must win.
    const h1By = new Map(h1.map(r => [r.seed - n, r])); let pairs = 0, wins = 0
    for (const a of h0) { const b = h1By.get(a.seed); if (!b) continue; pairs++; if (a.won && b.won) wins++ }
    const pDuo = wins / Math.max(1, pairs), pHalf = h0.filter(r => r.won).length / Math.max(1, h0.length)
    // Statistical mirror gate: the same bot variant and seed on the solo map and on half 0.
    let agree = 0, total = 0; const perBot = {}
    for (const bot of bots) {
      const s = runs.filter(r => r.level === level && r.variant === bot && r.map === 'solo' && r.seed < variants), hh = new Map(runs.filter(r => r.level === level && r.variant === bot && r.map === 'half0' && r.seed < variants).map(r => [r.seed, r]))
      let a = 0, t = 0, ws = 0, wh = 0; for (const x of s) { const y = hh.get(x.seed); if (!y) continue; t++; if (x.won === y.won) a++; if (x.won) ws++; if (y.won) wh++ }
      if (t) perBot[bot] = { n: t, agree: round(a / t), pSolo: round(ws / t), pHalf: round(wh / t) }; agree += a; total += t
    }
    const row = { level, n: solo.length, pSolo: round(pSolo), pHalf: round(pHalf), pDuo: round(pDuo), pSolo2: round(pSolo * pSolo), duoGap: round(pDuo - pSolo * pSolo), mirrorAgreement: round(agree / Math.max(1, total)), pWinGap: round(pHalf - pSolo), perBot }
    out.levels.push(row)
    out.checks.push({ name: `L${level}: p_duo within +-0.05 of p_solo^2`, pass: Math.abs(row.duoGap) <= 0.05, detail: `${row.pDuo} vs ${row.pSolo2}` })
    out.checks.push({ name: `L${level}: half-vs-solo outcome agreement >= 95% (5 bots x ${variants} seeds)`, pass: row.mirrorAgreement >= 0.95, detail: row.mirrorAgreement })
    out.checks.push({ name: `L${level}: R1 p_win on the half within +-0.02 of solo`, pass: Math.abs(row.pWinGap) <= 0.02, detail: `${row.pHalf} vs ${row.pSolo}` })
  }
  out.pass = out.checks.every(c => c.pass)
  const file = value('out', join(repo, 'docs/carrot-defense/duo/duo-bands.json'))
  mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(out, null, 1) + '\n')
  for (const r of out.levels) console.log(`L${String(r.level).padEnd(3)} pSolo=${r.pSolo} pHalf=${r.pHalf} pDuo=${r.pDuo} pSolo^2=${r.pSolo2} gap=${r.duoGap} agreement=${r.mirrorAgreement} pWinGap=${r.pWinGap}`)
  for (const c of out.checks) if (!c.pass) console.log(`FAIL ${c.name}: ${c.detail}`)
  console.log(`duo-bands: ${runs.length} runs in ${out.meta.seconds} s; ${out.pass ? 'ALL GATES MET' : 'gates missed'}; wrote ${file}`)
  return failed ? 1 : 0
}
