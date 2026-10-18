// Frame cost of the duo/endless presentation against solo (maps-and-view stream), through harness.html + DuoQa on a CARROT_QA player.
//   cpu     Chromium, High tier, 1440x900, L24 final-wave peak, 600 frames: view CPU (CarrotQa sections, the spectator's included,
//           the loopback's replica stepping excluded) of solo, duo with both halves on screen ("Both") and duo with the partner off screen
//   phone   Chromium mobile emulation 844x390 at 4x CPU throttle: rAF frame-time p95 of solo vs duo (own view and Both), plus Unity's
//           unquantized main-thread work per frame; at the tier the game picks for that viewport (Low) unless --tier high|medium
//   first   the worst frame around each creature model's first appearance (4x throttle, from wave 1): target under 50 ms (same --tier)
//   heap    JS heap growth over a 10-minute loopback duo match (Chromium, precise memory info)
//   wasm    WebKit: the wasm heap peak and growth count across L24 and L28 duo final waves in Both (target <= 384 MB)
//   node scripts/carrot-duo-qa/perf.mjs [--only cpu,phone,first,heap,wasm] [--level 24] [--minutes 10] [--reps 3] [--tier auto]
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { serve, open, cmd, duo, send, probe, sleep, arg, flag, waitFor, frameStats, REPO } from './lib.mjs'

const OUT = process.env.CARROT_DUO_QA_OUT || '/private/tmp/claude-501/-Users-eric-Claude/c0f378b2-d447-4405-9fc6-aa152072f6bd/scratchpad/carrot-duo/maps-and-view/perf'
const only = arg('only', 'cpu,phone,first,heap,wasm').split(','), level = Number(arg('level', 24)), minutes = Number(arg('minutes', 10))
const build = resolve(REPO, arg('build', 'output/carrot-qa')), name = arg('name', 'carrot-qa')
mkdirSync(OUT, { recursive: true })
// perf.json keeps every section's latest run (a run of --only phone leaves the cpu results in place).
let previous = {}; try { previous = JSON.parse(readFileSync(join(OUT, 'perf.json'), 'utf8')).results || {} } catch {}
const report = { at: new Date().toISOString(), level, build: name, results: previous }
const save = () => writeFileSync(join(OUT, 'perf.json'), JSON.stringify(report, null, 1))
const { server, url } = await serve(build)
// The reference bot survives to these waves on every level (L24 falls to its wave-15 boss pair), so they are the peaks measured.
const waves = { 4: 8, 8: 10, 12: 12, 16: 12, 20: 13, 24: 14, 25: 6, 26: 8, 27: 10, 28: 11 }
const rafFrames = page => page.evaluate(() => window.qa.frames.length)
async function frames(page, n) { const a = await rafFrames(page); await waitFor(page, ([a, n]) => window.qa.frames.length - a >= n, [a, n], 600000, 250); return page.evaluate(([a, n]) => window.qa.frames.slice(a, a + n), [a, n]) }
async function warpTo(page, wave) { const since = await page.evaluate(() => performance.now()); await duo(page, { t: 'warp', wave }); return waitFor(page, s => window.qa.probe('warp', s), since, 900000, 500) }
async function prepare(page, mode, lv = level, side = 0) {
  if (mode === 'solo') { await duo(page, { t: 'solo', level: lv }); await waitFor(page, l => window.qa.state && window.qa.state.level === l, lv) }
  else { await duo(page, { t: 'duo', level: lv, side }); await waitFor(page, l => window.qa.state && window.qa.state.level === l, lv) }
  await sleep(3000); await duo(page, { t: 'bot', on: 1, coins: 20000 }); const w = await warpTo(page, waves[lv] || 12); await sleep(800); return w
}
async function sections(page, n = 600) { await duo(page, { t: 'probe', what: 'sections', reset: 1 }); const f = await frames(page, n); const s = await probe(page, 'sections'); return { ...s, frames: frameStats(f) } }

try {
  if (only.includes('cpu')) {
    // Each condition runs in a fresh page, three times, interleaved (solo, Both, own; then again): one page's heap history and the
    // OS's core scheduling move a lightly loaded main thread's sections by 20-60% between runs, so medians of fresh runs are compared.
    const reps = Number(arg('reps', 3)), throttle = Number(arg('throttle', 1)), runs = { solo: [], duoBoth: [], duoOwn: [] }
    for (let rep = 0; rep < reps; rep++) for (const cond of rep % 2 ? ['duoOwn', 'duoBoth', 'solo'] : ['solo', 'duoBoth', 'duoOwn']) {
      const ctx = await open({ url, name, size: [1440, 900], throttle }); const { page } = ctx; await send(page, 'Quality', 'high')
      const warp = await prepare(page, cond === 'solo' ? 'solo' : 'duo'); let view = null
      if (cond === 'duoBoth') { await duo(page, { t: 'camera', mode: 'both' }); await sleep(2500) }
      if (cond === 'duoOwn') { await sleep(2500); view = await probe(page, 'view'); if (!view.partner.dormant) { await duo(page, { t: 'zoom', value: 1.6 }); await sleep(2500); view = await probe(page, 'view') } }
      const s = await sections(page, 900); runs[cond].push({ ms: s.viewMs + s.spectatorMs, viewMs: s.viewMs, spectatorMs: s.spectatorMs, alive: s.alive, partnerAlive: s.partnerAlive, dormant: s.partnerDormant, warp, sections: s.sections, frames: s.frames, coverage: view && view.partnerCoverage })
      console.log('cpu run', rep, cond, JSON.stringify({ ms: s.viewMs + s.spectatorMs, spectatorMs: s.spectatorMs, alive: s.alive, partnerAlive: s.partnerAlive, dormant: s.partnerDormant }))
      await ctx.browser.close()
    }
    const med = a => { const v = a.map(x => x.ms).sort((x, y) => x - y); return v[v.length >> 1] }
    const r = { throttle, runs, solo: med(runs.solo), duoBoth: med(runs.duoBoth), duoOwn: med(runs.duoOwn) }
    r.ratioBoth = r.duoBoth / r.solo; r.ratioOwnPartnerOff = r.duoOwn / r.solo; r.pass = { both: r.ratioBoth <= 1.5, partnerOff: r.ratioOwnPartnerOff <= 1.15 }
    console.log('cpu', JSON.stringify({ throttle, soloMs: r.solo, bothMs: r.duoBoth, ownMs: r.duoOwn, ratioBoth: r.ratioBoth, ratioOwn: r.ratioOwnPartnerOff }))
    report.results['cpu' + (throttle > 1 ? 'x' + throttle : '')] = r; save()
  }
  if (only.includes('phone')) {
    // Fresh page per run, interleaved, three repetitions; frames are counted from the warp's wave peak (a live final-wave crowd).
    const reps = Number(arg('reps', 3)), phoneTier = arg('tier', 'auto'), runs = { solo: [], duo: [], duoBoth: [] }
    for (let rep = 0; rep < reps; rep++) for (const cond of rep % 2 ? ['duoBoth', 'duo', 'solo'] : ['solo', 'duo', 'duoBoth']) {
      // --tier auto (the default) keeps the tier the game picks for a phone-sized viewport (Low); --tier high is the stress case.
      const ctx = await open({ url, name, size: [844, 390], phone: true }); const { page } = ctx; if (phoneTier !== 'auto') await send(page, 'Quality', phoneTier)
      const cdp = await ctx.context.newCDPSession(page)
      const warp = await prepare(page, cond === 'solo' ? 'solo' : 'duo'); if (cond === 'duoBoth') { await duo(page, { t: 'camera', mode: 'both' }); await sleep(2000) }
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); await sleep(1500)
      await duo(page, { t: 'probe', what: 'sections', reset: 1 }); const f = frameStats(await frames(page, 600)); const sec = await probe(page, 'sections'); const view = await probe(page, 'view')
      const tierName = await page.evaluate(() => { for (let i = window.qa.lines.length - 1; i >= 0; i--) { const m = /CARROT_BUILD_MS .* tier=(\w+)/.exec(window.qa.lines[i][1]); if (m) return m[1] } return '' })
      runs[cond].push({ ...f, warp, tierName, viewMs: sec.viewMs, spectatorMs: sec.spectatorMs, replicaMs: sec.sections['qa.replica'] || 0, alive: sec.alive, partnerAlive: sec.partnerAlive, coverage: view.partnerCoverage, dormant: view.partner && view.partner.dormant })
      console.log('phone run', rep, cond, JSON.stringify({ tier: tierName, p95: f.p95, mean: f.mean, workP95: f.workP95, workMean: f.workMean, draws: f.drawsMedian, alive: sec.alive, partnerAlive: sec.partnerAlive, viewMs: sec.viewMs, spectatorMs: sec.spectatorMs }))
      await ctx.browser.close()
    }
    const med = (a, k) => { const v = a.map(x => x[k]).sort((x, y) => x - y); return v[v.length >> 1] }
    const r = { runs, solo: { p95: med(runs.solo, 'p95'), mean: med(runs.solo, 'mean') }, duo: { p95: med(runs.duo, 'p95'), mean: med(runs.duo, 'mean') }, duoBoth: { p95: med(runs.duoBoth, 'p95'), mean: med(runs.duoBoth, 'mean') } }
    r.ratioP95 = r.duo.p95 / r.solo.p95; r.ratioP95Both = r.duoBoth.p95 / r.solo.p95; r.pass = r.ratioP95 <= 1.25
    // Paired ratios: each repetition's three pages ran back to back, so their ratio cancels most of the shared machine's load swings.
    const pmed = v => { v = v.slice().sort((x, y) => x - y); return v[v.length >> 1] }
    r.paired = { p95: pmed(runs.duo.map((x, i) => x.p95 / runs.solo[i].p95)), p95Both: pmed(runs.duoBoth.map((x, i) => x.p95 / runs.solo[i].p95)), mean: pmed(runs.duo.map((x, i) => x.mean / runs.solo[i].mean)), meanBoth: pmed(runs.duoBoth.map((x, i) => x.mean / runs.solo[i].mean)),
      workP95: pmed(runs.duo.map((x, i) => x.workP95 / runs.solo[i].workP95)), workP95Both: pmed(runs.duoBoth.map((x, i) => x.workP95 / runs.solo[i].workP95)) }
    for (const k of ['solo', 'duo', 'duoBoth']) { r[k].workP95 = med(runs[k], 'workP95'); r[k].workMean = med(runs[k], 'workMean') }
    console.log('phone', JSON.stringify({ solo: r.solo, duo: r.duo, duoBoth: r.duoBoth, ratioP95: r.ratioP95, ratioP95Both: r.ratioP95Both, paired: r.paired }))
    r.tier = phoneTier; report.results[phoneTier === 'auto' ? 'phone' : 'phone-' + phoneTier] = r; save()
  }
  if (only.includes('first')) {
    // Same tier choice as phone: auto (the phone's own Low tier) unless --tier names one.
    const firstTier = arg('tier', 'auto'); const ctx = await open({ url, name, size: [844, 390], phone: true }); const { page } = ctx; if (firstTier !== 'auto') await send(page, 'Quality', firstTier)
    const cdp = await ctx.context.newCDPSession(page); const r = { levels: {}, tier: firstTier }
    for (const lv of [24, 27]) {
      await duo(page, { t: 'duo', level: lv, side: 0 }); await waitFor(page, l => window.qa.state && window.qa.state.level === l, lv); await sleep(5000)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); const t0 = await page.evaluate(() => performance.now())
      await duo(page, { t: 'bot', on: 1, coins: 7000 }); await cmd(page, { type: 'speed', value: 2 })
      await sleep(lv === 24 ? 150000 : 120000)
      const firsts = await page.evaluate(t0 => { const out = []; for (const [t, m] of window.qa.lines) { if (t < t0) continue; const i = m.indexOf('CARROT_DUO_QA first '); if (i >= 0) out.push([t, JSON.parse(m.slice(i + 20))]) } const f = window.qa.frames; return out.map(([t, info]) => { const near = f.filter(x => x[1] >= t - 20 && x[1] <= t + 160); return { t: Math.round(t - t0), path: info.path, spectator: info.spectator, worst: near.length ? Math.max(...near.map(x => x[0])) : null, worstWork: near.length ? Math.max(...near.map(x => x[3] || 0)) : null } }) }, t0)
      const base = frameStats(await page.evaluate(t0 => window.qa.frames.filter(x => x[1] >= t0), t0))
      r.levels[lv] = { firsts, baseline: base, worst: Math.max(...firsts.map(f => f.worst || 0)), worstWork: Math.max(...firsts.map(f => f.worstWork || 0)) }
      console.log('first', lv, JSON.stringify({ n: firsts.length, worst: r.levels[lv].worst, worstWork: r.levels[lv].worstWork, p95: base && base.p95, max: base && base.max, workP95: base && base.workP95, list: firsts.map(f => f.path.split('/').pop() + (f.spectator ? '*' : '') + ':' + f.worst) }))
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }); await cmd(page, { type: 'speed', value: 1 })
    }
    report.results[firstTier === 'auto' ? 'first' : 'first-' + firstTier] = r; save(); await ctx.browser.close()
  }
  if (only.includes('heap')) {
    const ctx = await open({ url, name, size: [1440, 900] }); const { page } = ctx; await send(page, 'Quality', 'high')
    const heap = () => page.evaluate(() => { try { if (window.gc) window.gc(); return performance.memory ? performance.memory.usedJSHeapSize : 0 } catch (e) { return 0 } })
    await duo(page, { t: 'duo', level: 25, side: 0 }); await sleep(4000); await duo(page, { t: 'bot', on: 1, coins: 5000 }); await cmd(page, { type: 'speed', value: 2 }); await sleep(20000)
    const start = await heap(), wasmStart = await page.evaluate(() => window.qa.heap()), samples = []; const t0 = Date.now(); let matches = 1
    while (Date.now() - t0 < minutes * 60000) {
      await sleep(30000); const s = await page.evaluate(() => window.qa.state && window.qa.state.phase)
      if (s === 'won' || s === 'lost') { matches++; await duo(page, { t: 'duo', level: matches % 2 ? 25 : 26, side: matches % 2 }); await sleep(4000); await duo(page, { t: 'bot', on: 1, coins: 5000 }); await cmd(page, { type: 'speed', value: 2 }) }
      samples.push([Math.round((Date.now() - t0) / 1000), await heap(), await page.evaluate(() => window.qa.heap())])
    }
    const end = await heap(); const r = { startMB: start / 1048576, endMB: end / 1048576, growthMB: (end - start) / 1048576, wasmStartMB: wasmStart / 1048576, wasmEndMB: (await page.evaluate(() => window.qa.heap())) / 1048576, matches, samples }
    r.pass = r.growthMB < 20; console.log('heap', JSON.stringify({ growthMB: r.growthMB, startMB: r.startMB, endMB: r.endMB, matches })); report.results.heap = r; save(); await ctx.browser.close()
  }
  if (only.includes('wasm')) {
    const r = {}
    for (const engine of ['webkit']) {
      const ctx = await open({ engine, url, name, size: [1440, 900] }); const { page } = ctx; await send(page, 'Quality', 'high')
      const start = await page.evaluate(() => window.qa.heap()); const runs = []
      for (const lv of [24, 28]) { await prepare(page, 'duo', lv); await duo(page, { t: 'camera', mode: 'both' }); await sleep(2000); await frames(page, 600); runs.push({ level: lv, heapMB: (await page.evaluate(() => window.qa.heap())) / 1048576, peakMB: (await page.evaluate(() => window.qa.heapPeak)) / 1048576, growths: await page.evaluate(() => window.qa.heapGrowths), view: await probe(page, 'view') }) }
      r[engine] = { startMB: start / 1048576, runs, peakMB: (await page.evaluate(() => window.qa.heapPeak)) / 1048576, growths: await page.evaluate(() => window.qa.heapGrowths) }
      r[engine].pass = r[engine].peakMB <= 384
      console.log('wasm', engine, JSON.stringify({ startMB: r[engine].startMB, peakMB: r[engine].peakMB, growths: r[engine].growths, runs: runs.map(x => [x.level, x.heapMB, x.view.alive, x.view.partner.expected]) }))
      await ctx.browser.close()
    }
    report.results.wasm = r; save()
  }
} finally { server.close(); save() }
