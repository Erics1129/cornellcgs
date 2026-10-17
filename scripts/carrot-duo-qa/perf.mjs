// Frame cost of the duo/endless presentation against solo (maps-and-view stream), through harness.html + DuoQa on a CARROT_QA player.
//   cpu     Chromium, High tier, 1440x900, L24 final-wave peak, 600 frames: view CPU (CarrotQa sections, the spectator's included,
//           the loopback's replica stepping excluded) of solo, duo with both halves on screen ("Both") and duo with the partner off screen
//   phone   Chromium mobile emulation 844x390 at 4x CPU throttle: rAF frame-time p95 of solo vs duo (own view and Both)
//   first   the worst frame around each creature model's first appearance (4x throttle, from wave 1): target under 50 ms
//   heap    JS heap growth over a 10-minute loopback duo match (Chromium, precise memory info)
//   wasm    WebKit: the wasm heap peak and growth count across L24 and L28 duo final waves in Both (target <= 384 MB)
//   node scripts/carrot-duo-qa/perf.mjs [--only cpu,phone,first,heap,wasm] [--level 24] [--minutes 10]
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { serve, open, cmd, duo, send, probe, sleep, arg, flag, waitFor, frameStats, REPO } from './lib.mjs'

const OUT = process.env.CARROT_DUO_QA_OUT || '/private/tmp/claude-501/-Users-eric-Claude/c0f378b2-d447-4405-9fc6-aa152072f6bd/scratchpad/carrot-duo/maps-and-view/perf'
const only = arg('only', 'cpu,phone,first,heap,wasm').split(','), level = Number(arg('level', 24)), minutes = Number(arg('minutes', 10))
const build = resolve(REPO, arg('build', 'output/carrot-qa')), name = arg('name', 'carrot-qa')
mkdirSync(OUT, { recursive: true })
const report = { at: new Date().toISOString(), level, results: {} }
const save = () => writeFileSync(join(OUT, 'perf.json'), JSON.stringify(report, null, 1))
const { server, url } = await serve(build)
const waves = { 4: 8, 8: 10, 12: 12, 16: 12, 20: 14, 24: 16, 25: 6, 26: 9, 27: 11, 28: 12 }
const rafFrames = page => page.evaluate(() => window.qa.frames.length)
async function frames(page, n) { const a = await rafFrames(page); await waitFor(page, ([a, n]) => window.qa.frames.length - a >= n, [a, n], 600000, 250); return page.evaluate(([a, n]) => window.qa.frames.slice(a, a + n), [a, n]) }
async function warpTo(page, wave) { const since = await page.evaluate(() => performance.now()); await duo(page, { t: 'warp', wave }); return waitFor(page, s => window.qa.probe('warp', s), since, 900000, 500) }
async function prepare(page, mode, lv = level, side = 0) {
  if (mode === 'solo') { await duo(page, { t: 'solo', level: lv }); await waitFor(page, l => window.qa.state && window.qa.state.level === l, lv) }
  else { await duo(page, { t: 'duo', level: lv, side }); await waitFor(page, l => window.qa.state && window.qa.state.level === l, lv) }
  await sleep(3000); await duo(page, { t: 'bot', on: 1, coins: 7000 }); const w = await warpTo(page, waves[lv] || 12); await sleep(800); return w
}
async function sections(page, n = 600) { await duo(page, { t: 'probe', what: 'sections', reset: 1 }); const f = await frames(page, n); const s = await probe(page, 'sections'); return { ...s, frames: frameStats(f) } }

try {
  if (only.includes('cpu')) {
    const ctx = await open({ url, name, size: [1440, 900] }); const { page } = ctx; await send(page, 'Quality', 'high')
    const r = {}
    r.soloWarp = await prepare(page, 'solo'); r.solo = await sections(page)
    r.duoWarp = await prepare(page, 'duo'); await duo(page, { t: 'camera', mode: 'both' }); await sleep(2500); r.duoBoth = await sections(page); r.duoBothView = await probe(page, 'view')
    await duo(page, { t: 'camera', mode: 'own' }); await sleep(2500); let v = await probe(page, 'view')
    if (!v.partner.dormant) { await duo(page, { t: 'zoom', value: 1.6 }); await sleep(2500); v = await probe(page, 'view') }
    r.duoOwn = await sections(page); r.duoOwnView = v
    const solo = r.solo.viewMs + r.solo.spectatorMs
    r.ratioBoth = (r.duoBoth.viewMs + r.duoBoth.spectatorMs) / solo; r.ratioOwnPartnerOff = (r.duoOwn.viewMs + r.duoOwn.spectatorMs) / solo
    r.pass = { both: r.ratioBoth <= 1.5, partnerOff: r.ratioOwnPartnerOff <= 1.15 }
    console.log('cpu', JSON.stringify({ soloMs: solo, bothMs: r.duoBoth.viewMs + r.duoBoth.spectatorMs, ownMs: r.duoOwn.viewMs + r.duoOwn.spectatorMs, ratioBoth: r.ratioBoth, ratioOwn: r.ratioOwnPartnerOff, alive: [r.solo.alive, r.duoBoth.alive, r.duoBoth.partnerAlive], dormantOwn: r.duoOwn.partnerDormant }))
    report.results.cpu = r; save(); await ctx.browser.close()
  }
  if (only.includes('phone')) {
    const ctx = await open({ url, name, size: [844, 390], phone: true }); const { page } = ctx; await send(page, 'Quality', 'high')
    const cdp = await ctx.context.newCDPSession(page); const r = {}
    for (const mode of ['solo', 'duo']) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }); await prepare(page, mode)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); await sleep(3000)
      r[mode] = frameStats(await frames(page, 600)); r[mode + 'Sections'] = await probe(page, 'sections')
      if (mode === 'duo') { await duo(page, { t: 'camera', mode: 'both' }); await sleep(3000); r.duoBoth = frameStats(await frames(page, 600)) }
    }
    r.ratioP95 = r.duo.p95 / r.solo.p95; r.ratioP95Both = r.duoBoth.p95 / r.solo.p95; r.pass = r.ratioP95 <= 1.25
    console.log('phone', JSON.stringify({ solo: r.solo, duo: r.duo, duoBoth: r.duoBoth, ratioP95: r.ratioP95, ratioP95Both: r.ratioP95Both }))
    report.results.phone = r; save(); await ctx.browser.close()
  }
  if (only.includes('first')) {
    const ctx = await open({ url, name, size: [844, 390], phone: true }); const { page } = ctx; await send(page, 'Quality', 'high')
    const cdp = await ctx.context.newCDPSession(page); const r = { levels: {} }
    for (const lv of [24, 27]) {
      await duo(page, { t: 'duo', level: lv, side: 0 }); await waitFor(page, l => window.qa.state && window.qa.state.level === l, lv); await sleep(5000)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); const t0 = await page.evaluate(() => performance.now())
      await duo(page, { t: 'bot', on: 1, coins: 7000 }); await cmd(page, { type: 'speed', value: 2 })
      await sleep(lv === 24 ? 150000 : 120000)
      const firsts = await page.evaluate(t0 => { const out = []; for (const [t, m] of window.qa.lines) { if (t < t0) continue; const i = m.indexOf('CARROT_DUO_QA first '); if (i >= 0) out.push([t, JSON.parse(m.slice(i + 20))]) } const f = window.qa.frames; return out.map(([t, info]) => { const near = f.filter(x => x[1] >= t - 20 && x[1] <= t + 160).map(x => x[0]); return { t: Math.round(t - t0), path: info.path, spectator: info.spectator, worst: near.length ? Math.max(...near) : null } }) }, t0)
      const base = frameStats(await page.evaluate(t0 => window.qa.frames.filter(x => x[1] >= t0), t0))
      r.levels[lv] = { firsts, baseline: base, worst: Math.max(...firsts.map(f => f.worst || 0)) }
      console.log('first', lv, JSON.stringify({ n: firsts.length, worst: r.levels[lv].worst, p95: base && base.p95, list: firsts.map(f => f.path.split('/').pop() + (f.spectator ? '*' : '') + ':' + f.worst) }))
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }); await cmd(page, { type: 'speed', value: 1 })
    }
    report.results.first = r; save(); await ctx.browser.close()
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
