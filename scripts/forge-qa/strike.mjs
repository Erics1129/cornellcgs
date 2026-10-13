// strike-feel acceptance on a served build (Chromium GPU, WebKit): press-to-impact latency, settle time, swing
// telemetry (head in the frustum from press to contact, face flat at contact, hand on the handle, the head off the
// blade at rest), the hit-stop per outcome, the visible windup, the rhythm with the page's gate, and the hearth
// reach ('seated' after the heat, tongs on the tang). Needs a build whose Unity reports protocol 2.
// usage: node scripts/forge-qa/strike.mjs [--url http://127.0.0.1:4173/minigames/forgeOrFold/] [--out output/forge-qa/strike.json]
//          [--profiles desktop,phone,webkit-phone,landscape,reduced] [--n 20]
import path from 'node:path'
import { launch, open, now, sleep, press, hud, strike, ensureForging, forgeButton, unityEvents, waitEvent, screencast, frameDiff, hitStopFromFrames, contactSheet, writeJson, stats, URL } from './lib.mjs'

/** Telemetry frames since page time `since`, stamped with the page clock. lib's telemetry() spreads the frame over its
 *  receive time, so Unity's own t (realtimeSinceStartup ms) replaces the page time there; the raw 'telemetry' events
 *  keep the page time, so read those. ut = Unity's realtime ms. */
const telemetry = (h, since = 0) => h.page.evaluate(s => window.__forge.events.filter(e => e.type === 'telemetry' && e.t >= s).map(e => { try { const f = JSON.parse(e.spot); return { ...f, ut: f.t, t: e.t } } catch { return null } }).filter(Boolean), since)

const arg = (name, d) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : d }
const url = arg('url', URL), outFile = path.resolve(arg('out', 'output/forge-qa/strike.json')), N = Number(arg('n', 20))
const only = arg('profiles', 'desktop,phone,webkit-phone,landscape,reduced').split(',')
const outDir = path.dirname(outFile)
const summary = v => { const a = v.filter(x => x != null); return { n: a.length, median: stats.median(a), p90: stats.pct(a, .9), min: a.length ? Math.min(...a) : null, max: a.length ? Math.max(...a) : null } }
const COS3 = Math.cos(3 * Math.PI / 180)
// Hit-stop table (ms, Flow halves it), mirrored from ForgeStrikeTuning for the check.
const HITSTOP = { dull: 16, good: 45, chip: 65, perfect: 85, evolution: 110, shatter: 130 }
const outcomeOf = fb => { const t = (fb || '').toLowerCase(); return t.includes('evolved') ? 'evolution' : t.includes('perfect') ? 'perfect' : t.includes('chip') ? 'chip' : t.includes('shatter') || t.includes('gone') ? 'shatter' : t.includes('dull') ? 'dull' : t.includes('good') ? 'good' : null }

/** Start forging from the HUD with a screencast-free timeline: returns the hearth telemetry and 'seated' timing. */
async function hearth(h) {
  const t0 = h.profile.touch ? await forgeButton(h) : await press(h, 'Space')
  const seated = await waitEvent(h, 'seated', t0, 6000)
  await sleep(200)
  const tele = (await telemetry(h, t0)).filter(f => f.ev === 'hearth' || f.ev === 'seated')
  const jaw = tele.filter(f => f.ev === 'hearth' && f.ms >= 150 && f.jawToTang >= 0).map(f => f.jawToTang)
  return { startToSeatedMs: seated ? +(seated.t - t0).toFixed(1) : null, seatedAfterHeatMs: seated ? +(seated.t - t0 - 2000).toFixed(1) : null, jawToTangMax: jaw.length ? Math.max(...jaw) : null, frames: tele.length, timeScaleMin: tele.length ? Math.min(...tele.map(f => f.timeScale)) : null, pitch: tele.map(f => +f.pitch.toFixed(1)) }
}

/** n isolated strikes (each from a settled hammer); per strike: latency, telemetry from press to contact. */
async function series(h, n) {
  const rows = []
  for (let i = 0; i < n; i++) {
    const st = await hud(h); if (st.strike !== 'Forge' && !(await ensureForging(h))) break
    const r = await strike(h); await sleep(120)
    const ev = await unityEvents(h, r.inputT), impact = ev.find(e => e.type === 'impact'), seq = impact ? impact.id : ev.find(e => e.type === 'swing')?.id
    const tele = (await telemetry(h, r.inputT - 5)).filter(f => f.seq === seq)
    const contact = tele.find(f => f.ev === 'contact'), stop = tele.find(f => f.ev === 'hitstop')
    const path = tele.filter(f => ['press', 'swing', 'windup', 'apex', 'down', 'contact'].includes(f.ev))
    const vp = path.flatMap(f => f.headVp || [])
    rows.push({ ...r, seq, outcome: outcomeOf(r.feedback), settleAfterImpactMs: r.settledMs != null && r.impactMs != null ? +(r.settledMs - r.impactMs).toFixed(1) : null,
      faceDot: contact?.faceDot ?? null, handToHandle: contact?.handToHandle ?? null, headVpMin: vp.length ? Math.min(...vp) : null, headVpMax: vp.length ? Math.max(...vp) : null,
      coverAtPress: tele.find(f => f.ev === 'press')?.headCoverBlade ?? null, hitStopMs: stop?.ms ?? (contact ? 0 : null), pitch: contact?.pitch ?? null, fov: contact?.fov ?? null, kick: contact?.kick ?? null,
      // Risk at the press (the contact frame already shows the next hit's risk, and 0 once Flow starts).
      risk: tele.find(f => f.ev === 'press')?.risk ?? contact?.risk ?? null })
    await sleep(250 + Math.random() * 400)
  }
  return rows
}

/** Presses every `everyMs` for `forMs`: impacts, impact gaps and 'The hammer is returning.' notices. */
async function mash(h, everyMs, forMs) {
  const t0 = await now(h); let presses = 0; const title0 = (await hud(h)).title
  while ((await now(h)) - t0 < forMs) { await press(h, 'Space', 15); presses++; await sleep(Math.max(0, everyMs - 15)) }
  await sleep(900)
  const imp = (await unityEvents(h, t0, 'impact')).map(e => e.t), gaps = imp.slice(1).map((t, i) => +(t - imp[i]).toFixed(1))
  const notices = await h.page.evaluate(() => document.body.innerText.includes('The hammer is returning.'))
  // A shatter (or a sale) ends the run on that blade: the next blank heats for 2 s, so fewer impacts are expected.
  const title1 = (await hud(h)).title, knifeChanged = (title0 || '').replace(/\+\d+$/, '') !== (title1 || '').replace(/\+\d+$/, '')
  return { presses, impacts: imp.length, gaps: summary(gaps), minGap: gaps.length ? Math.min(...gaps) : null, returningNotice: notices, title0, title1, knifeChanged }
}

/** One strike under a screencast: the windup shows within two frames of the keydown, and the on-screen hit-stop. */
async function filmed(h) {
  if (!(await ensureForging(h))) return null
  const before = (await telemetry(h, 0)).at(-1)
  let t0
  const cap = await screencast(h, 'strike', async () => { await sleep(80); t0 = await press(h, 'Space'); await waitEvent(h, 'settled', t0, 4000); await sleep(150) }, { quality: 85, maxWidth: 960 })
  const impact = (await unityEvents(h, t0, 'impact'))[0], outcome = outcomeOf((await hud(h)).feedback)
  const press0 = (await telemetry(h, t0 - 5)).find(f => f.ev === 'press') || before
  const [vx, vy] = press0?.headVp || [.6, .5], region = [Math.max(0, vx - .14), Math.max(0, 1 - vy - .2), Math.min(1, vx + .14), Math.min(1, 1 - vy + .12)]
  const pre = cap.frames.filter(f => f.t <= t0).at(-1), after = cap.frames.filter(f => f.t > t0)
  const within = after.filter(f => f.t <= t0 + 34 + 17)
  let windup = 0; for (const f of within) windup = Math.max(windup, await frameDiff(h, pre.file, f.file, region))
  const hs = impact ? await hitStopFromFrames(h, cap.frames, impact.t) : { ms: null }
  // The camera kick lands on the contact frame, during the hit-stop: a wall region (left edge, mid height: no HUD, no
  // hands or sparks) changes in the first frame or two after the impact (the old build moved only after its 60 ms freeze).
  let cameraMoveMs = null, cameraDiff = 0
  if (impact) {
    const pre = cap.frames.filter(f => f.t <= impact.t).at(-1), post = cap.frames.filter(f => f.t > impact.t).slice(0, 4)
    for (const f of post) { const d = await frameDiff(h, pre.file, f.file, [.0, .32, .12, .55]); cameraDiff = Math.max(cameraDiff, d); if (d > 1.0 && cameraMoveMs == null) cameraMoveMs = +(f.t - impact.t).toFixed(1) }
  }
  const pick = cap.frames.filter(f => f.t > t0 - 40 && f.t < (impact ? impact.t : t0) + 260)
  await contactSheet(h, pick.map(f => f.file), path.join(h.out, 'strike-sheet.png'), { cols: 8, width: 240, labels: pick.map(f => Math.round(f.t - t0) + 'ms') })
  return { outcome, windupDiff2Frames: +windup.toFixed(2), region, framesWithin34ms: within.length, hitStopOnScreen: hs, cameraMoveMs, cameraDiff: +cameraDiff.toFixed(2), impactMs: impact ? +(impact.t - t0).toFixed(1) : null }
}

async function run(kind) {
  const h = await launch(kind, { out: path.join(outDir, 'strike', kind) }); const r = { profile: kind }
  try {
    r.open = await open(h, url, { telemetry: true })
    if (r.open.protocol < 2) r.warning = 'pre-contract Unity build (protocol ' + r.open.protocol + ')'
    await sleep(1200)
    r.tuned = await h.page.evaluate(() => !!document.querySelector('[data-testid=forge-scene]')?.dataset.tuning)
    r.hearth = await hearth(h)
    await h.shot('seated')
    if (kind === 'desktop' || kind === 'reduced') { await sleep(600); r.filmed = await filmed(h) }
    // Rhythm on a fresh blade (before the series pushes the risk up): a press every 120 ms for 3 s, then every 940 ms.
    if (kind === 'desktop') {
      const arm = async name => { if (await ensureForging(h)) return true; r[name] = { skipped: await hud(h) }; return false }
      await sleep(800); if (await arm('mash120')) r.mash120 = await mash(h, 120, 3000)
      await sleep(800); if (await arm('rhythm940')) r.rhythm940 = await mash(h, 640 + 300, 4000)
    }
    const rows = await series(h, kind === 'desktop' ? N : Math.min(N, 10))
    r.strikes = rows
    const lowRisk = rows.filter(x => (x.risk ?? 0) < .3)
    r.latency = { impactMs: summary(rows.map(x => x.impactMs)), lowRiskImpactMs: summary(lowRisk.map(x => x.impactMs)), settleAfterImpactMs: summary(rows.map(x => x.settleAfterImpactMs)) }
    r.pose = { faceDotMin: Math.min(...rows.map(x => x.faceDot ?? 1)), handToHandleMax: Math.max(...rows.map(x => x.handToHandle ?? 0)), headVp: [Math.min(...rows.map(x => x.headVpMin ?? .5)), Math.max(...rows.map(x => x.headVpMax ?? .5))], coverAtPressMax: Math.max(...rows.map(x => x.coverAtPress ?? 0)), pitch: summary(rows.map(x => x.pitch)), fov: summary(rows.map(x => x.fov)) }
    r.hitStop = rows.filter(x => x.outcome).map(x => ({ outcome: x.outcome, ms: x.hitStopMs, want: kind === 'reduced' ? 0 : HITSTOP[x.outcome] }))
    if (kind === 'reduced') { const tele = await telemetry(h, 0); r.reducedCheck = { timeScaleMin: Math.min(...tele.map(f => f.timeScale)), kickMax: Math.max(...tele.map(f => Math.abs(f.kick))), traumaMax: Math.max(...tele.map(f => f.trauma)) } }
    r.console = h.consoleLines.filter(l => /\[error\]|pageerror/i.test(l)).slice(0, 20)
    // Acceptance (strike-feel plan, critique amendments). Rhythm buffering needs web-feel's gate and is reported, not judged.
    const lim = { desktop: [200, 230], phone: [215, 260], 'webkit-phone': [225, 270], landscape: [215, 260], reduced: [200, 230] }[kind]
    r.pass = {
      latencyMedian: (r.latency.lowRiskImpactMs.median ?? 1e9) <= lim[0], latencyMax: (r.latency.lowRiskImpactMs.max ?? 1e9) <= lim[1],
      settleWithin300: (r.latency.settleAfterImpactMs.max ?? 1e9) <= 300,
      faceFlat: r.pose.faceDotMin >= COS3 - 1e-4, handOnHandle: r.pose.handToHandleMax <= .0105, headInFrustum: r.pose.headVp[0] >= .02 && r.pose.headVp[1] <= .98, restOffBlade: r.pose.coverAtPressMax <= .10,
      seatedAfterHeat: r.hearth.seatedAfterHeatMs != null && r.hearth.seatedAfterHeatMs <= 250 + 50, tongsOnTang: r.hearth.jawToTangMax == null || r.hearth.jawToTangMax <= .01,
      hitStopTable: r.hitStop.every(x => x.want == null || Math.abs((x.ms ?? 0) - x.want) <= 9 || Math.abs((x.ms ?? 0) - x.want / 2) <= 9),
      noConsoleErrors: r.console.length === 0,
    }
    if (r.filmed) { r.pass.windupVisible = kind === 'reduced' || r.filmed.windupDiff2Frames > 2.0; if (kind !== 'reduced' && r.filmed.outcome && r.filmed.outcome !== 'dull') r.pass.cameraOnContact = r.filmed.cameraMoveMs != null && r.filmed.cameraMoveMs <= 34 }
    // Impacts never closer than the 640 ms cycle (a frame of slack on the page clock); one impact per spaced press.
    if (r.mash120?.impacts) Object.assign(r.pass, { mashSpacing: (r.mash120.minGap ?? 1e9) >= 640 - 9, mashCount: r.mash120.impacts >= 4 || r.mash120.knifeChanged, noReturningNotice: !r.mash120.returningNotice })
    if (r.rhythm940?.impacts) r.pass.rhythmOnePerPress = r.rhythm940.impacts === r.rhythm940.presses || r.rhythm940.knifeChanged
    if (r.reducedCheck) Object.assign(r.pass, { reducedNoTimeScale: r.reducedCheck.timeScaleMin >= 1, reducedKick: r.reducedCheck.kickMax <= 1.6 * .25 + 1e-3, reducedNoTrauma: r.reducedCheck.traumaMax === 0 })
  } catch (e) { r.error = String(e.stack || e).slice(0, 1500); await h.shot('error').catch(() => {}) }
  finally { await h.close() }
  return r
}

const results = []
for (const kind of only) { console.log('strike:', kind); const r = await run(kind); results.push(r); console.log(JSON.stringify({ profile: kind, latency: r.latency?.lowRiskImpactMs, settle: r.latency?.settleAfterImpactMs, hearth: r.hearth && { seatedAfterHeatMs: r.hearth.seatedAfterHeatMs, jawToTangMax: r.hearth.jawToTangMax }, pose: r.pose, filmed: r.filmed && { windup: r.filmed.windupDiff2Frames, hitStop: r.filmed.hitStopOnScreen?.ms }, pass: r.pass, error: r.error, warning: r.warning })) }
writeJson(outFile, { url, at: new Date().toISOString(), results })
console.log('strike.mjs ->', outFile)
