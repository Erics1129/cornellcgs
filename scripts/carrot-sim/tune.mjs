// Pressure-dial fit (pass-2 step 6): the dial is the only per-level knob. For each level it bisects (on the logit of the
// win rate) for the dial that puts the median-player bot R1 at its band's target, while the expert R0 must win every
// sampled seed (a dial at which R0 loses counts as too hard; polish: RN's rotation on the same seed also counts as a solution). Progression gates are hard limits too: on L1-L24 the
// novice R2 must keep >= 40% (so three attempts clear >= 75% of seeds) and on L1-L8 the naive bot RN must win every seed.
// Ceilings (polish): from L9 the naive rotation at a human cadence (RNH) may win at most 90% of a mid-chapter, pre-boss or boss
// level (97% of a chapter opener); a dial where it wins more counts as too easy even when R1 is under its target.
// Prints the fitted table; never edits sources.
//   node scripts/carrot-sim.mjs --tune-dials [--levels 1-28] [--iters 7] [--r1 200] [--r0 10] [--step 6]
export const rnhLimit = l => l >= 9 && l <= 24 ? ([9, 13, 17, 21].includes(l) ? .97 : .9) : 1
export const TARGETS = { 1: .99, 2: .99, 3: .94, 4: .87, 5: .9, 9: .9, 13: .9, 17: .9, 21: .9, 6: .775, 10: .775, 14: .775, 18: .775, 22: .775, 7: .675, 11: .675, 15: .675, 19: .675, 23: .675, 8: .6, 12: .6, 16: .6, 20: .6, 24: .6, 25: .675, 26: .325, 27: .14, 28: .225 }
const logit = p => Math.log(Math.min(.995, Math.max(.005, p)) / (1 - Math.min(.995, Math.max(.005, p))))
export async function tuneDials({ exe, run, value, range, repo, jobs }) {
  const { readFileSync } = await import('node:fs')
  const cs = readFileSync(`${repo}/unity/CarrotDefense/Assets/Scripts/CarrotData.cs`, 'utf8')
  const current = cs.match(/float\[\] Pressure=\{([^}]*)\}/)[1].split(',').map(x => Number(x.replace('f', '')))
  const levels = range(value('levels', '1-28'), 28), iters = Number(value('iters', 7)), n1 = Number(value('r1', 200)), n0 = Number(value('r0', 10)), n2 = Number(value('r2', 100)), nn = Number(value('rn', 10)), nh = Number(value('rnh', 20)), step = value('step')
  const state = Object.fromEntries(levels.map(l => [l, { d: current[l - 1], lo: null, hi: null, history: [] }]))
  for (let it = 0; it < iters; it++) {
    const specs = []
    for (const l of levels) { const d = state[l].d.toFixed(4); for (let a = 0; a < n1; a += 50) specs.push({ l, args: [`dial=${l}:${d}`, `R1:${l}:${a}-${Math.min(n1, a + 50) - 1}`] }); for (let a = 0; a < n0; a += 10) { specs.push({ l, args: [`dial=${l}:${d}`, `R0p0:${l}:${a}-${Math.min(n0, a + 10) - 1}`] }); specs.push({ l, args: [`dial=${l}:${d}`, `R0p1:${l}:${a}-${Math.min(n0, a + 10) - 1}`] }) }
     if (l <= 24) for (let a = 0; a < n2; a += 50) specs.push({ l, args: [`dial=${l}:${d}`, `R2:${l}:${a}-${Math.min(n2, a + 50) - 1}`] })
     specs.push({ l, args: [`dial=${l}:${d}`, `RN:${l}:0-${nn - 1}`] })
     if (rnhLimit(l) < 1) for (let a = 0; a < nh; a += 10) specs.push({ l, args: [`dial=${l}:${d}`, `RNH:${l}:${a}-${Math.min(nh, a + 10) - 1}`] }) }
    const runs = []; let next = 0
    await Promise.all(Array.from({ length: jobs }, async () => { while (next < specs.length) { const s = specs[next++]; const r = await run(exe, ['BandJobs', ...(step ? [`step=${step}`] : []), ...s.args], { quiet: true }); for (const line of r.out.split('\n')) if (line.startsWith('CARROT_BAND ')) runs.push(JSON.parse(line.slice(12))) } }))
    const lines = []
    for (const l of levels) {
      const st = state[l], r1 = runs.filter(r => r.level === l && r.bot === 'R1'), r0 = runs.filter(r => r.level === l && r.bot === 'R0')
      // A legal solution exists when, for every sampled seed, one of the reference policies wins with earned coins: R0's two
      // policies or RN's rotation (polish: R0's heuristics lose to the plain rotation on several levels, so it counts too).
      const r2 = runs.filter(r => r.level === l && r.bot === 'R2'), rn = runs.filter(r => r.level === l && r.bot === 'RN')
      const seeds = [...new Set(r0.map(r => r.seed))], r0clean = seeds.every(sd => r0.some(r => r.seed === sd && r.won) || rn.some(r => r.seed === sd && r.won))
      const r2rate = r2.length ? r2.filter(r => r.won).length / r2.length : 1, rnok = l > 8 || rn.every(r => r.won)
      const rnh = runs.filter(r => r.level === l && r.bot === 'RNH'), rnhRate = rnh.length ? rnh.filter(r => r.won).length / rnh.length : 0, rnhOk = rnhRate <= rnhLimit(l) + 1e-9
      const r0ok = r0clean && (l > 24 || r2rate >= .40) && rnok
      const rate = r1.filter(r => r.won).length / Math.max(1, r1.length), target = TARGETS[l]
      const easy = (rate > target || !rnhOk) && r0ok
      st.history.push({ d: st.d, rate, r0ok, r0clean, r2rate, rnok, rnhRate, rnhOk, r0wins: r0.filter(r => r.won).length, r0n: r0.length })
      if (easy) st.lo = { d: st.d, rate }; else st.hi = { d: st.d, rate: r0ok ? rate : Math.min(rate, target - .05) }
      let d
      if (st.lo && st.hi) { const a = logit(st.lo.rate) - logit(target), b = logit(st.hi.rate) - logit(target); const t = a - b !== 0 ? a / (a - b) : .5; d = Math.exp(Math.log(st.lo.d) + Math.min(.85, Math.max(.15, t)) * (Math.log(st.hi.d) - Math.log(st.lo.d))) }
      else if (st.lo) d = st.d * (rate > .97 ? 1.25 : 1.12); else d = st.d / (rate < .1 ? 1.25 : 1.12)
      st.d = Math.min(1.6, Math.max(.65, d)) // the shipped dial range (CarrotSimulationTests: [0.65, 1.60])
      lines.push(`L${l} d=${st.history.at(-1).d.toFixed(3)} R1=${(100 * rate).toFixed(0)}% (target ${(100 * target).toFixed(0)}) R0 ${st.history.at(-1).r0wins}/${r0.length}${r0clean ? '' : ' UNSOLVED'} R2=${(100 * r2rate).toFixed(0)}%${rnok ? '' : ' RN-loses'}${rnh.length ? ` RNH=${(100 * rnhRate).toFixed(0)}%${rnhOk ? '' : ' (over its ceiling)'}` : ''} -> ${st.d.toFixed(3)}`)
    }
    console.log(`--- iteration ${it + 1}\n` + lines.join('\n'))
  }
  // Best observed: the feasible (R0 clean) dial whose rate is closest to the target.
  const best = {}
  // Best observed: among dials meeting every hard limit, the one whose R1 rate is closest to the target without being
  // harder than it (a feasible point above the target beats any below it); else the easiest dial tried.
  for (const l of levels) { const ok = state[l].history.filter(x => x.r0ok), capped = ok.filter(x => x.rnhOk), h = capped.length ? capped : ok, T = TARGETS[l]; const score = x => (x.rnhOk ? 0 : 10) + (x.rate >= T ? x.rate - T : 2 * (T - x.rate)); const pick = h.length ? h.reduce((a, b) => score(b) < score(a) ? b : a) : state[l].history.reduce((a, b) => b.d < a.d ? b : a); best[l] = { dial: Math.round(pick.d * 1000) / 1000, rate: pick.rate, r2rate: pick.r2rate, rnhRate: pick.rnhRate, feasible: !!h.length, history: state[l].history } }
  console.log('FITTED ' + JSON.stringify(Object.fromEntries(Object.entries(best).map(([l, b]) => [l, b.dial]))))
  return best
}
