// Phase-0 baseline: the reference numbers every feel stream compares against, measured on a
// served build with the same metric names the streams report.
// usage: node scripts/forge-qa/baseline.mjs --url http://127.0.0.1:4173/minigames/forgeOrFold/
//          [--dev-url http://127.0.0.1:5191/minigames/forgeOrFold/]  (Flow cycle; ?forge-qa fixtures exist only in vite dev)
//          [--out <baseline.json>] [--profiles desktop,phone,webkit-phone,landscape,reduced,throttled,desktop-hidpi]
import path from 'node:path'
import { execSync } from 'node:child_process'
import { launch, open, now, sleep, press, hud, strike, ensureForging, unityEvents, waitEvent, frameTimes, drawCalls, sampleDrawCalls, transferBytes, screencast, hitStopFromFrames, contactSheet, writeJson, stats, URL } from './lib.mjs'

const arg = (name, d) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : d }
const url = arg('url', URL), devUrl = arg('dev-url'), outFile = path.resolve(arg('out', 'output/forge-qa/baseline.json'))
const only = (arg('profiles', 'desktop,phone,webkit-phone,landscape,reduced,throttled,desktop-hidpi')).split(',')
const outDir = path.dirname(outFile)
const summary = values => ({ n: values.filter(v => v != null).length, median: stats.median(values), p90: stats.pct(values, .9), min: Math.min(...values.filter(v => v != null)), max: Math.max(...values.filter(v => v != null)) })

async function strikeSeries(h, n, gapMs = 250) {
  const out = []
  for (let i = 0; i < n; i++) {
    const st = await hud(h); if (st.strike !== 'Forge') { if (!(await ensureForging(h))) break }
    const r = await strike(h); out.push(r); await sleep(gapMs)
  }
  return out
}
/** Press every `everyMs` for `forMs`; returns impact-to-impact intervals and refused presses. */
async function mash(h, everyMs, forMs) {
  const t0 = await now(h); let presses = 0
  while ((await now(h)) - t0 < forMs) { await press(h, 'Space', 20); presses++; await sleep(Math.max(0, everyMs - 20)) }
  await sleep(900)
  const ev = await unityEvents(h, t0), imp = ev.filter(e => e.type === 'impact').map(e => e.t)
  const gaps = imp.slice(1).map((t, i) => +(t - imp[i]).toFixed(1))
  return { presses, impacts: imp.length, intervals: summary(gaps), refusedShare: +((presses - imp.length) / presses).toFixed(2) }
}

async function profileRun(kind) {
  const h = await launch(kind, { out: path.join(outDir, 'baseline', kind) })
  const r = { profile: kind }
  try {
    const ttr = await open(h, url); r.timeToReady = ttr
    await sleep(kind === 'throttled' ? 500 : 1500)
    r.transfer = transferBytes(h)
    r.canvas = (await hud(h)).canvas
    if (kind === 'throttled') { await h.shot('ready'); return r }
    let a = await now(h); await sleep(1500); r.frameTimes = { idle: await frameTimes(h, a, await now(h)) }
    r.drawCalls = { idle: await drawCalls(h, a, await now(h)) }
    // First heat: Start forging, then wait for the armed Forge button.
    a = await now(h); await ensureForging(h, 12000); const b = await now(h)
    r.heat = { startToArmedMs: Math.round(b - a) }; r.frameTimes.heating = await frameTimes(h, a, b)
    await sleep(800); r.drawCalls.anvil = await sampleDrawCalls(h, 1200)
    await h.shot('on-anvil')
    // Isolated strikes: latency and settle times from an explicit press.
    a = await now(h)
    const series = await strikeSeries(h, kind === 'desktop' ? 10 : 6)
    const b2 = await now(h)
    r.latency = { impactMs: summary(series.map(s => s.impactMs)), settledMs: summary(series.map(s => s.settledMs)), swingEvent: series.some(s => s.swingMs != null) }
    r.frameTimes.striking = await frameTimes(h, a, b2)
    r.drawCalls.striking = await drawCalls(h, a, b2)
    r.outcomes = series.map(s => (s.feedback || '').replace(/\s+/g, ' ').slice(0, 24))
    if (kind === 'desktop' || kind === 'reduced' || kind === 'phone') {
      // Hit-stop: the hammer's grid cell holding still after the impact, in a screencast of one strike.
      if (await ensureForging(h)) {
        let t0
        const cap = await screencast(h, 'hitstop', async () => { t0 = await press(h, 'Space'); await waitEvent(h, 'settled', t0, 4000); await sleep(120) }, { quality: 80, maxWidth: 720 })
        const impact = (await unityEvents(h, t0, 'impact'))[0]
        r.hitStop = impact ? { ...(await hitStopFromFrames(h, cap.frames, impact.t)), method: 'hammer grid cell still after impact (screencast)', screencastFrames: cap.frames.length, impactT: impact.t, frames: path.relative(outDir, cap.dir) } : { ms: null }
        if (impact) {
          const pick = cap.frames.filter(f => f.t > impact.t - 120 && f.t < impact.t + 200)
          await contactSheet(h, pick.map(f => f.file), path.join(h.out, 'hitstop-sheet.png'), { cols: 6, width: 240, labels: pick.map(f => Math.round(f.t - impact.t) + 'ms') })
        }
      }
    }
    if (kind === 'desktop' || kind === 'webkit-phone') {
      // Mash: one press every 120 ms (buffering), and a 2.5 presses/s rhythm.
      if (await ensureForging(h)) r.cycle = { mash120: await mash(h, 120, 4000) }
      if (await ensureForging(h)) r.cycle.rhythm400 = await mash(h, 400, 4000)
      if (kind === 'desktop') await h.shot('after-mash')
    }
    r.console = h.consoleLines.filter(l => /error|pageerror/i.test(l)).slice(0, 20)
  } catch (e) { r.error = String(e.stack || e).slice(0, 1500); await h.shot('error').catch(() => {}) }
  finally { await h.close() }
  return r
}

async function flowRun() {
  const h = await launch('desktop', { out: path.join(outDir, 'baseline', 'flow') })
  const r = { profile: 'desktop', url: devUrl, fixture: 'flow' }
  try {
    await open(h, devUrl, { fixture: 'flow' }); await sleep(1500)
    r.start = await hud(h)
    const t0 = await now(h)
    // The fixture knife has full Flow charge: the next strike starts Flow. Then mash at 10 presses/s.
    let presses = 0
    while ((await now(h)) - t0 < 6000) { await press(h, 'Space', 20); presses++; await sleep(80) }
    await sleep(900)
    const imp = (await unityEvents(h, t0, 'impact')).map(e => e.t)
    const window = imp.filter(t => t - imp[0] < 4000)
    const gaps = window.slice(1).map((t, i) => +(t - window[i]).toFixed(1))
    r.presses = presses; r.impacts = imp.length
    r.cycle = { flowMs: summary(gaps), impactsInFirst4s: window.length }
    r.end = await hud(h)
  } catch (e) { r.error = String(e.stack || e).slice(0, 1500) }
  finally { await h.close() }
  return r
}

const commit = (() => { try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return null } })()
const result = { meta: { url, devUrl: devUrl || null, commit, date: new Date().toISOString(), metricNames: ['timeToReady', 'transfer', 'latency.impactMs', 'latency.settledMs', 'cycle.mash120', 'cycle.rhythm400', 'flow.cycle.flowMs', 'hitStop.ms', 'drawCalls.{idle,anvil,striking}', 'frameTimes.{idle,heating,striking}'] }, profiles: {} }
for (const kind of only) { console.log('baseline:', kind); result.profiles[kind] = await profileRun(kind); writeJson(outFile, result) }
if (devUrl) { console.log('baseline: flow (dev)'); result.flow = await flowRun() }
writeJson(outFile, result)
const d = result.profiles.desktop
if (d) console.log(JSON.stringify({ latency: d.latency, hitStop: d.hitStop, cycle: d.cycle, drawCalls: d.drawCalls, ttr: d.timeToReady, transfer: d.transfer }, null, 1))
if (result.profiles.phone) console.log('phone drawCalls', JSON.stringify(result.profiles.phone.drawCalls))
if (result.flow) console.log('flow', JSON.stringify(result.flow.cycle))
console.log('wrote', outFile)
