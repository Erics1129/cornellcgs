// Difficulty bands: runs the reference bots in parallel slices, merges their CARROT_BAND lines, evaluates the bands
// and fairness invariants of docs/carrot-defense/giant-update/difficulty.md, and writes difficulty-bands.json.
// Options (after --bands): --r1 N --r2 N --r0 N --rn N --rs N --levels 1-29 --step K --jobs J --out path --raw path
//   --quick        small seed counts (directional only; never certifies a band)
//   --bots R1,R2   only these bots
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'

export const BANDS = {
  // level groups: [R1 lo, R1 hi], [R2 lo, R2 hi]
  rows: [
    { name: 'L1-L2', levels: [1, 2], r1: [0.98, 1], r2: [0.9, 1] },
    { name: 'L3', levels: [3], r1: [0.9, 1], r2: null },
    { name: 'L4', levels: [4], r1: [0.8, 1], r2: null },
    { name: 'Chapter openers', levels: [5, 9, 13, 17, 21], r1: [0.85, 0.95], r2: [0.6, 0.8] },
    { name: 'Mid-chapter', levels: [6, 10, 14, 18, 22], r1: [0.7, 0.85], r2: [0.4, 0.65] },
    { name: 'Pre-boss', levels: [7, 11, 15, 19, 23], r1: [0.6, 0.75], r2: [0.3, 0.5] },
    { name: 'Boss levels', levels: [8, 12, 16, 20, 24], r1: [0.5, 0.65], r2: [0.2, 0.4] },
    { name: 'Tornado (Easy)', levels: [25], r1: [0.6, 0.75], r2: null },
    { name: 'Zombie (Hard)', levels: [26], r1: [0.25, 0.4], r2: null },
    { name: 'Portal (????)', levels: [28], r1: [0.15, 0.3], r2: null },
    { name: 'Eyeball (Insane)', levels: [27], r1: [0.08, 0.2], r2: null },
    { name: 'Asuna (Insane)', levels: [29], r1: [0.08, 0.2], r2: null },
  ],
}
const Z90 = 1.6448536269514722
export function wilson(k, n, z = Z90) {
  if (!n) return [0, 1]
  const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
  return [Math.max(0, (c - h) / d), Math.min(1, (c + h) / d)]
}
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0
const sd = a => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)) }
const round = (x, d = 3) => x == null ? null : Math.round(x * 10 ** d) / 10 ** d

export async function runBands({ exe, run, value, flag, range, repo, jobs }) {
  const quick = flag('quick')
  const counts = { R1: Number(value('r1', quick ? 16 : 200)), R1F: Number(value('r1f', quick ? 0 : 100)), R2: Number(value('r2', quick ? 8 : 100)), R0: Number(value('r0', quick ? 3 : 20)), RN: Number(value('rn', quick ? 1 : 10)), RS: Number(value('rs', quick ? 4 : 100)) }
  const levels = range(value('levels', '1-29'), 29)
  const only = value('bots') ? new Set(value('bots').split(',')) : null
  const step = value('step')
  const specs = []
  const slice = (bot, level, n, size) => { for (let a = 0; a < n; a += size) specs.push(`${bot}:${level}:${a}-${Math.min(n, a + size) - 1}`) }
  for (const level of levels) {
    if (!only || only.has('R0')) { slice('R0p0', level, counts.R0, 10); if (level !== 29) slice('R0p1', level, counts.R0, 10) }
    if (!only || only.has('R1')) slice('R1', level, counts.R1, 50)
    if ((!only || only.has('R1F')) && counts.R1F > 0) slice('R1F', level, counts.R1F, 50)
    if (!only || only.has('R2')) slice('R2', level, counts.R2, 50)
    if ((!only || only.has('RN')) && level <= 28) slice('RN', level, counts.RN, 10)
    if ((!only || only.has('R3')) && [1, 4, 8, 12, 16, 20, 24, 25, 27, 28].includes(level)) specs.push(`R3:${level}:0`)
    if ((!only || only.has('RS')) && level === 29) slice('RS', 29, counts.RS, 25)
  }
  const started = Date.now(), runs = []
  let next = 0, failed = 0
  async function worker() {
    while (next < specs.length) {
      const spec = specs[next++]
      const r = await run(exe, ['BandJobs', ...(step ? [`step=${step}`] : []), spec], { quiet: true })
      if (r.code !== 0) { failed++; console.error(`bands: ${spec} failed\n${r.out.slice(-2000)}`); continue }
      for (const line of r.out.split('\n')) if (line.startsWith('CARROT_BAND ')) runs.push(JSON.parse(line.slice(12)))
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, jobs) }, worker))
  const seconds = (Date.now() - started) / 1000
  console.log(`bands: ${runs.length} runs from ${specs.length} slices on ${jobs} jobs in ${seconds.toFixed(1)} s${failed ? `, ${failed} failed slices` : ''}`)
  const rawPath = value('raw')
  if (rawPath) { mkdirSync(dirname(rawPath), { recursive: true }); writeFileSync(rawPath, runs.map(r => JSON.stringify(r)).join('\n') + '\n') }
  const result = evaluate(runs, { counts, quick, step, repo })
  result.meta.seconds = round(seconds, 1)
  const out = value('out', quick ? join(repo, 'output/carrot-bands-quick.json') : join(repo, 'docs/carrot-defense/giant-update/difficulty-bands.json'))
  mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(result, null, 1) + '\n')
  printSummary(result)
  console.log('bands: wrote ' + out)
  return failed ? 1 : 0
}

export function evaluate(runs, { counts, quick, step, repo }) {
  const by = (bot, level) => runs.filter(r => r.bot === bot && r.level === level)
  const commit = (() => { try { return execSync('git rev-parse --short HEAD', { cwd: repo }).toString().trim() } catch { return 'unknown' } })()
  const dirty = (() => { try { return execSync('git status --porcelain -- unity/CarrotDefense/Assets/Scripts scripts/carrot-waves.mjs', { cwd: repo }).toString().trim().length > 0 } catch { return true } })()
  const botsHash = (() => { try { return createHash('sha256').update(readFileSync(join(repo, 'unity/CarrotDefense/Assets/Scripts/CarrotBotTests.cs'))).digest('hex').slice(0, 16) } catch { return 'missing' } })()
  const levels = []
  for (let level = 1; level <= 29; level++) {
    const stat = bot => {
      const rs = by(bot, level); if (!rs.length) return null
      const wins = rs.filter(r => r.won).length, [lo, hi] = wilson(wins, rs.length)
      const losses = rs.filter(r => !r.won)
      return { n: rs.length, wins, rate: round(wins / rs.length), ci90: [round(lo), round(hi)], medianSeconds: round(median(rs.filter(r => r.won).map(r => r.seconds)), 1), medianIdle: median(rs.map(r => r.idle)), meanLowest: round(mean(rs.map(r => r.lowest)), 2), sdLowest: round(sd(rs.map(r => r.lowest)), 2), lossWaves: losses.map(r => r.wave) }
    }
    const r0runs = [...by('R0', level)]
    const seeds = [...new Set(r0runs.map(r => r.seed))], bestRuns = seeds.map(sd => { const xs = r0runs.filter(r => r.seed === sd); return xs.find(r => r.won && r.lowest === Math.max(...xs.filter(x => x.won).map(x => x.lowest))) || xs[0] })
    const r0 = r0runs.length ? { n: r0runs.length, wins: r0runs.filter(r => r.won).length, bestWins: bestRuns.filter(r => r.won).length, bestN: bestRuns.length, sdLowestBest: round(sd(bestRuns.map(r => r.lowest)), 2), medianSeconds: round(median(r0runs.filter(r => r.won).map(r => r.seconds)), 1), lowestMedian: median(r0runs.map(r => r.lowest)), sdLowestP0: round(sd(r0runs.filter(r => r.policy === 0).map(r => r.lowest)), 2), sdLowestP1: round(sd(r0runs.filter(r => r.policy === 1).map(r => r.lowest)), 2), fullHearts: r0runs.filter(r => r.won && r.health === 10).length, minLowest: Math.min(...r0runs.map(r => r.lowest)) } : null
    levels.push({ level, r0, r1: stat('R1'), r1f: stat('R1F'), r2: stat('R2'), rn: stat('RN'), rs: stat('RS'), r3: stat('R3') })
  }
  // Rows: a row passes when the 90% Wilson interval of every member level lies inside the band.
  const certifying = !quick && counts.R1 >= 200 && counts.R2 >= 100
  const rows = BANDS.rows.map(row => {
    const members = row.levels.map(l => levels[l - 1])
    const check = (key, band) => band ? members.map(m => { const s = m[key]; if (!s) return { level: m.level, missing: true }; const inside = s.ci90[0] >= band[0] - 1e-9 && s.ci90[1] <= band[1] + 1e-9; const point = s.rate >= band[0] && s.rate <= band[1]; return { level: m.level, rate: s.rate, ci90: s.ci90, inside, point } }) : []
    const r1 = check('r1', row.r1), r2 = check('r2', row.r2)
    return { name: row.name, levels: row.levels, r1Band: row.r1, r2Band: row.r2, r1, r2, pass: [...r1, ...r2].every(x => x.inside), pointPass: [...r1, ...r2].every(x => x.point) }
  })
  // Invariants.
  const inv = {}
  const R0 = runs.filter(r => r.bot === 'R0')
  // (a) A legal solution always exists: on every level and seed variant at least one of the expert's two policies wins
  // (L29: the moving policy). Both-policy results are reported alongside.
  const bestOf = new Map(); for (const r of R0) { const k = r.level + '/' + r.seed, b = bestOf.get(k); if (!b || (r.won && !b.won) || (r.won === b.won && r.lowest > b.lowest)) bestOf.set(k, r) }
  const best = [...bestOf.values()]
  inv.a = { name: 'R0 (best of its two policies) wins every level on every seed', pass: best.length > 0 && best.every(r => r.won), losses: best.filter(r => !r.won).map(r => `L${r.level} s${r.seed} w${r.wave}`), bothPolicyLosses: R0.filter(r => !r.won).length }
  const R3 = runs.filter(r => r.bot === 'R3')
  inv.b = { name: 'R3 loses every gated level', pass: R3.length > 0 && R3.every(r => !r.won), wins: R3.filter(r => r.won).map(r => r.level) }
  // (c) is a statement about a level's wave curve, so it is judged on the campaign (L1-L24); the challenges (a guardian
  // walking from mid-level, Asuna's single-wave duel) are reported alongside.
  const R1 = runs.filter(r => r.bot === 'R1')
  const cliff = set => { let late = 0, total = 0; for (const r of set) { const cut = Math.ceil(r.waves * 0.6); r.hearts.forEach((h, i) => { total += h; if (i >= cut) late += h }) } const losses = set.filter(r => !r.won); return { lateHeartShare: round(late / Math.max(1, total)), earlyLossShare: round(losses.filter(r => r.wave <= 2).length / Math.max(1, losses.length)), wave3LossShare: round(losses.filter(r => r.wave === 3).length / Math.max(1, losses.length)) } }
  const campaignCliff = cliff(R1.filter(r => r.level <= 24)), allCliff = cliff(R1)
  inv.c = { name: 'no early cliff (R1, campaign L1-L24)', ...campaignCliff, allLevels: allCliff, pass: campaignCliff.lateHeartShare >= 0.7 && campaignCliff.earlyLossShare <= 0.15 && campaignCliff.wave3LossShare <= 0.15 }
  inv.e = { name: 'R0 lowest-HP sd <= 1.5 per level (best policy per seed)', worst: Math.max(0, ...levels.filter(l => l.r0).map(l => l.r0.sdLowestBest || 0)), worstLevels: levels.filter(l => l.r0 && l.r0.sdLowestBest > 1.5).map(l => l.level), perPolicyWorst: Math.max(0, ...levels.filter(l => l.r0).flatMap(l => [l.r0.sdLowestP0 || 0, l.r0.sdLowestP1 || 0])), pass: levels.filter(l => l.r0).every(l => (l.r0.sdLowestBest || 0) <= 1.5) }
  const fRows = levels.filter(l => l.r1 && l.r1f && l.r1.rate < 0.75).map(l => ({ level: l.level, gain: round(l.r1f.rate - l.r1.rate) }))
  inv.f = { name: 'preview knowledge helps where R1 < 75%: R1F - R1 >= 10 pts', rows: fRows, pass: fRows.length === 0 ? null : fRows.every(x => x.gain >= 0.1) }
  const L29 = levels[28]
  inv.g = { name: 'RS loses >= 90%; R0 moving policy wins with lowest 2-6', rsLossRate: L29.rs ? round(1 - L29.rs.rate) : null, r0Lowest: L29.r0 ? L29.r0.lowestMedian : null, pass: !!(L29.rs && 1 - L29.rs.rate >= 0.9 && L29.r0 && L29.r0.wins === L29.r0.n && L29.r0.lowestMedian >= 2 && L29.r0.lowestMedian <= 6) }
  const campaign = R0.filter(r => r.level <= 27)
  const RN = runs.filter(r => r.bot === 'RN')
  let leakWaves = 0, lateWaves = 0, rnEarly = 0, rnTotal = 0
  for (const r of RN) { r.hearts.forEach((h, i) => { if (i >= r.wave) return; rnTotal += h; if (i < 2) rnEarly += h; if (r.level >= 4 && r.level <= 24 && i >= 2) { lateWaves++; if (r.bites[i] > 0) leakWaves++ } }) }
  const rnEarlyLevels = RN.filter(r => r.level <= 8)
  const r1Idle = levels.filter(l => l.r1 && l.level <= 24).map(l => ({ level: l.level, medianIdle: l.r1.medianIdle }))
  inv.h = { name: 'overall difficulty rises', r0FullHeartShare: round(campaign.filter(r => r.won && r.health === 10).length / Math.max(1, campaign.length)), rnLateLeakShare: round(leakWaves / Math.max(1, lateWaves)), rnEarlyHeartShare: round(rnEarly / Math.max(1, rnTotal)), rnWinsL1toL8: rnEarlyLevels.length > 0 && rnEarlyLevels.every(r => r.won), r1MedianIdle: r1Idle,
    pass: campaign.filter(r => r.won && r.health === 10).length / Math.max(1, campaign.length) <= 0.4 && leakWaves / Math.max(1, lateWaves) >= 0.3 && rnEarly / Math.max(1, rnTotal) <= 0.35 && rnEarlyLevels.every(r => r.won) && r1Idle.every(x => x.medianIdle == null || x.medianIdle <= 600) }
  // Progression fairness: R2 wins within three independent attempts on >= 75% of seed triples, every campaign level.
  const prog = levels.filter(l => l.level <= 24 && l.r2).map(l => { const rs = by('R2', l.level).sort((a, b) => a.seed - b.seed); let triples = 0, ok = 0; for (let i = 0; i + 2 < rs.length; i += 3) { triples++; if (rs[i].won || rs[i + 1].won || rs[i + 2].won) ok++ } return { level: l.level, share: round(ok / Math.max(1, triples)) } })
  inv.progression = { name: 'R2 wins within 3 attempts on >= 75% of seeds; RN wins L1-L8', rows: prog, pass: prog.every(x => x.share >= 0.75) && rnEarlyLevels.every(r => r.won) }
  return { meta: { generated: new Date().toISOString(), commit, dirty, botsVersion: 'bots-v1', botsHash, counts, step: step ? Number(step) : (runs[0] ? runs[0].step : null), certifying, rule: certifying ? 'row passes when every member level\'s 90% Wilson interval lies inside its band' : 'DIRECTIONAL ONLY: seed counts below 200 R1 / 100 R2 cannot certify a band' }, rows, invariants: inv, levels }
}

export function printSummary(result) {
  const pct = x => x == null ? '  -  ' : (100 * x).toFixed(0).padStart(3) + '%'
  console.log(`commit ${result.meta.commit}${result.meta.dirty ? '+dirty' : ''} step ${result.meta.step} bots ${result.meta.botsHash} ${result.meta.certifying ? 'CERTIFYING' : 'directional'}`)
  console.log('lvl   R0 win  R0 low  R1 rate [ci90]        R2 rate [ci90]        R1F   RN   R1 idle')
  for (const l of result.levels) {
    const r1 = l.r1 ? `${pct(l.r1.rate)} [${pct(l.r1.ci90[0])},${pct(l.r1.ci90[1])}]` : '        -          '
    const r2 = l.r2 ? `${pct(l.r2.rate)} [${pct(l.r2.ci90[0])},${pct(l.r2.ci90[1])}]` : '        -          '
    console.log(`${String(l.level).padStart(3)}  ${l.r0 ? `${l.r0.wins}/${l.r0.n}`.padStart(6) : '     -'}  ${l.r0 ? String(l.r0.lowestMedian).padStart(5) : '    -'}   ${r1}  ${r2}  ${l.r1f ? pct(l.r1f.rate) : '  -  '} ${l.rn ? pct(l.rn.rate) : '  -  '} ${l.r1 ? String(l.r1.medianIdle).padStart(6) : ''}`)
  }
  for (const row of result.rows) console.log(`${row.pass ? 'PASS' : row.pointPass ? 'near' : 'FAIL'} ${row.name}: R1 ${row.r1.map(x => `L${x.level} ${pct(x.rate)}`).join(', ')}${row.r2.length ? ' | R2 ' + row.r2.map(x => `L${x.level} ${pct(x.rate)}`).join(', ') : ''}`)
  for (const [k, v] of Object.entries(result.invariants)) console.log(`${v.pass === true ? 'PASS' : v.pass === false ? 'FAIL' : 'n/a '} (${k}) ${v.name} ${JSON.stringify(Object.fromEntries(Object.entries(v).filter(([kk]) => !['name', 'pass', 'rows'].includes(kk))))}${v.rows ? ' ' + JSON.stringify(v.rows.filter(x => (x.share != null && x.share < 0.75) || (x.gain != null && x.gain < 0.1))) : ''}`)
}

// Invariant (d): disabling any one boss cast flips at most 10% of R1's losses into wins. Each boss level's kit is muted
// cast by cast (the telegraph and cooldowns stay, the consequence is gone) on the same R1 seeds as the unmuted run.
export const KITS = { 4: ['bark', 'root', 'uproot', 'brambleSurge'], 8: ['mist', 'summon', 'blind', 'tithe', 'lanternFlood'], 12: ['mantle', 'breath', 'shatter', 'whiteout', 'glacierLance'], 16: ['bark', 'root', 'uproot', 'brambleSurge'], 20: ['rush', 'flock', 'heap', 'uproot', 'dusk', 'harvestMoon'], 24: ['rush', 'flock', 'heap', 'uproot', 'dusk', 'harvestMoon'], 25: ['gust', 'liftoff', 'cycloneCall'], 26: ['raise', 'uproot', 'graveMarch'], 27: ['blind', 'gaze', 'eyeClones', 'blackout'], 28: ['portalSummon', 'portalStorm', 'portalBlink', 'portalShift'] }
export async function runMute({ exe, run, value, repo, jobs }) {
  const n = Number(value('r1', 200)), specs = []
  for (const [lv, kit] of Object.entries(KITS)) { specs.push({ lv: +lv, cast: '', args: [`R1:${lv}:0-${n - 1}`] }); for (const cast of kit) specs.push({ lv: +lv, cast, args: [`mute=${cast}`, `R1:${lv}:0-${n - 1}`] }) }
  const results = new Map(); let next = 0
  await Promise.all(Array.from({ length: jobs }, async () => { while (next < specs.length) { const sp = specs[next++]; const r = await run(exe, ['BandJobs', ...sp.args], { quiet: true }); results.set(sp.lv + '/' + sp.cast, r.out.split('\n').filter(l => l.startsWith('CARROT_BAND ')).map(l => JSON.parse(l.slice(12)))) } }))
  const rows = []
  for (const [lv, kit] of Object.entries(KITS)) {
    const base = results.get(lv + '/'), lost = new Set(base.filter(r => !r.won).map(r => r.seed))
    for (const cast of kit) { const m = results.get(lv + '/' + cast), flips = m.filter(r => r.won && lost.has(r.seed)).length; rows.push({ level: +lv, cast, losses: lost.size, flips, share: lost.size ? Math.round(1000 * flips / lost.size) / 1000 : 0 }) }
  }
  const worst = rows.reduce((a, b) => b.share > a.share ? b : a, rows[0])
  const out = { generated: new Date().toISOString(), seeds: n, rule: 'muting one cast flips <= 10% of R1 losses (same seeds)', pass: rows.every(r => r.share <= 0.1 || r.losses < 10), worst, rows }
  console.log(rows.map(r => `L${r.level} ${r.cast}: ${r.flips}/${r.losses} losses flip (${(100 * r.share).toFixed(0)}%)`).join('\n'))
  console.log(`(d) ${out.pass ? 'PASS' : 'FAIL'} worst L${worst.level} ${worst.cast} ${(100 * worst.share).toFixed(0)}%`)
  return out
}
