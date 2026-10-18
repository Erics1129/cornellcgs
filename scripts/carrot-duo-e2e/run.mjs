// Duo boss fights and two-player endless, end to end: two real browsers, the release Unity player, a real cgs-rooms Worker.
//   BASE=http://127.0.0.1:4890 ROOMS=http://127.0.0.1:8795 <codex node> scripts/carrot-duo-e2e/run.mjs [scenario ...] [--out DIR]
// BASE serves a site built with VITE_ROOMS_URL=$ROOMS (vite preview of the build). Scenarios: win, lossA, lossB, endless,
// reconnect, latency, latencyEndless, solo (default: all); extra: winCrWk, latencyCr, latencyEndlessCr, lossPhones. Writes results.json and screenshots to --out.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  openGame, createRoom, joinRoom, waitLoaded, chooseFight, readyAndStart, sessionOf, pressStart, startBot, stopBot, rankPads, levelDef,
  compareDigests, until, sleep, stat, closeBrowsers, seedSave,
} from './lib.mjs'

const argv = process.argv.slice(2)
const outArg = argv.indexOf('--out')
const out = outArg >= 0 ? argv[outArg + 1] : join(process.cwd(), 'output', 'carrot-duo-e2e')
mkdirSync(out, { recursive: true })
const picks = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--out')
const BASE = process.env.BASE || 'http://127.0.0.1:4890'
const ROOMS = process.env.ROOMS || 'http://127.0.0.1:8795'
const resultsFile = join(out, 'results.json')
const all = existsSync(resultsFile) ? JSON.parse(readFileSync(resultsFile, 'utf8')) : {}
let failures = 0
const checks = []
const check = (name, ok, detail) => { checks.push({ name, ok: !!ok, detail }); if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  ' + JSON.stringify(detail).slice(0, 600) : ''}`); return !!ok }
const shot = (g, name) => g.page.screenshot({ path: join(out, `${name}.png`) }).catch(() => {})
const phaseOf = g => g.page.evaluate(() => window.__qa.last?.phase)
const banner = g => g.page.evaluate(() => document.querySelector('.ct-duo-banner')?.textContent || '')
const resultsText = g => g.page.evaluate(() => document.querySelector('.ct-duo-results')?.textContent || '')
const storageOf = (g, key) => g.page.evaluate(k => { try { return JSON.parse(localStorage.getItem(k) || 'null') } catch { return null } }, key)
const desyncsOf = g => g.page.evaluate(() => window.__qa.desyncs.length)
async function camera(g, mode) {
  const i = { own: 0, both: 1, partner: 2 }[mode]
  if (await g.page.isVisible('.ct-duo-camera__toggle') && !(await g.page.isVisible('.ct-duo-camera__btn >> nth=0'))) await g.page.click('.ct-duo-camera__toggle')
  await g.page.click(`.ct-duo-camera__btn >> nth=${i}`)
}
async function pair(kinds, { level, mode = 'duoBoss', viewports = [null, null], storage = [seedSave(5), seedSave(5)], impair = null }) {
  const A = await openGame(kinds[0], { base: BASE, storage: storage[0], viewport: viewports[0] || undefined, impair, label: 'A:' + kinds[0] })
  const code = await createRoom(A, 'Ada')
  const B = await openGame(kinds[1], { base: BASE, storage: storage[1], viewport: viewports[1] || undefined, impair, label: 'B:' + kinds[1] })
  await joinRoom(B, 'Bo', code)
  await Promise.all([waitLoaded(A), waitLoaded(B)])
  await chooseFight(A, B, mode, level)
  const reveal = await readyAndStart(A, B)
  const [sa, sb] = await Promise.all([sessionOf(A), sessionOf(B)])
  return { A, B, code, reveal, sa, sb }
}
async function playing(A, B, speed2 = true) {
  await Promise.all([A, B].map(g => until(g, () => document.querySelector('.ct-page')?.dataset.duoPhase === 'playing' && window.__qa.last?.phase === 'playing', 30000, 'playing')))
  if (speed2) { await A.page.evaluate(() => document.activeElement?.blur?.()); await A.page.keyboard.press('f') }
}
async function ended(gs, ms) { await Promise.all(gs.map(g => until(g, () => ['won', 'lost'].includes(window.__qa.last?.phase), ms, 'match end'))) }
async function collect(g) {
  return g.page.evaluate(() => {
    const q = window.__qa
    return { phase: q.last?.phase, wave: q.last?.wave, waves: q.last?.waves, health: q.last?.health, towers: q.last?.towerCount, net: q.last?.net ? { mode: q.last.net.mode, seat: q.last.net.seat, side: q.last.net.side, score: q.last.net.score, bossWave: q.last.net.bossWave, bossKind: q.last.net.bossKind, bossName: q.last.net.bossName, miniWave: q.last.net.miniWave } : null,
      results: q.results.map(r => r[1]), desyncs: q.desyncs.map(d => d[1]), errors: q.errors.map(e => e[1]), rejects: q.rejects.length, views: q.views.map(v => v[1]),
      bossSeen: q.bossSeen, miniSeen: q.miniSeen, plan: q.plan, partnerLog: q.partnerLog.slice(-40), netTypes: q.net.types, botActions: q.bot ? q.bot.actions : 0,
      waveHp: Object.fromEntries(Object.entries(q.waves).map(([w, x]) => [w, x.maxHp])), frames: q.frames.length }
  })
}
const sidesOk = (sa, sb, reveal) => sa && sb && sa.mode === sb.mode && sa.level === sb.level && sa.seat !== sb.seat && (sa.mode === 'endless' || sa.side !== sb.side)

// ---------------------------------------------------------------- scenarios
const scenarios = {
  /** Duo L4 to a win on two Chromium pages: pairing, random sides, camera and the wall, doubled waves and bosses, saves for both. */
  async win(kinds = ['chromium', 'chromium'], tag = 'win') {
    const { A, B, code, reveal, sa, sb } = await pair(kinds, { level: 4 })
    check(`[${tag}] room code ${code} joined; reveals ${reveal.join(' / ')}`, /^[A-HJ-NP-Z2-9]{5}$/.test(code) && reveal[0] !== reveal[1])
    check(`[${tag}] the host drew the sides at random: seat 0 side ${sa?.side}, seat 1 side ${sb?.side} (opposite, same level and seed)`, sidesOk(sa, sb), { sa, sb })
    const pads = rankPads(levelDef(4)).map(p => p.id)
    await Promise.all([startBot(A, { pads }), startBot(B, { pads })])
    await sleep(3000)
    await Promise.all([pressStart(A), pressStart(B)])
    await playing(A, B)
    await until(A, () => (window.__qa.last?.wave || 0) >= 2, 120000, 'wave 2')
    // the partner's half: watch it, drag across, tap it; nothing changes there or here
    const before = await A.page.evaluate(() => ({ towers: window.__qa.last.towerCount, views: window.__qa.views.length, sent: (window.__qaSent || []).length }))
    await camera(A, 'partner'); await sleep(1200); await shot(A, `${tag}-A-watch-partner`)
    const box = await A.page.locator('#carrot-unity-canvas').boundingBox()
    const cx = box.x + box.width / 2, cy = box.y + box.height * 0.55
    for (let i = 0; i < 6; i++) { await A.page.mouse.click(cx + (i - 3) * 30, cy + ((i % 2) * 40 - 20)); await sleep(250) }
    const afterTaps = await A.page.evaluate(() => ({ towers: window.__qa.last.towerCount, views: window.__qa.views.filter(v => v[1] === 'partnerTap').length, ops: window.__qa.own.length, sel: window.__qa.last.selection }))
    await camera(A, 'both'); await sleep(1200); await shot(A, `${tag}-A-both`)
    await A.page.mouse.move(cx - 200, cy); await A.page.mouse.down(); await A.page.mouse.move(cx + 200, cy, { steps: 12 }); await A.page.mouse.up(); await sleep(600)
    await shot(A, `${tag}-A-dragged`)
    await camera(A, 'own'); await sleep(800)
    check(`[${tag}] taps on the partner's half raise partnerTap (${afterTaps.views}) and change nothing on either half`, afterTaps.views >= 3 && afterTaps.towers === before.towers && (!afterTaps.sel || afterTaps.sel.type === ''), { before, afterTaps })
    await ended([A, B], 12 * 60_000)
    await sleep(2500)
    const [ca, cb] = await Promise.all([collect(A), collect(B)])
    const dig = await compareDigests(A, B, 'duo')
    await shot(A, `${tag}-A-results`); await shot(B, `${tag}-B-results`)
    const [ra, rb] = await Promise.all([resultsText(A), resultsText(B)])
    check(`[${tag}] both halves won: ${ca.phase}/${cb.phase} at wave ${ca.wave}/${ca.waves} and ${cb.wave}/${cb.waves}`, ca.phase === 'won' && cb.phase === 'won', { ca: ca.results, cb: cb.results })
    check(`[${tag}] the results card says the win is recorded for both`, /recorded for both/i.test(ra) && /recorded for both/i.test(rb), [ra.slice(0, 160), rb.slice(0, 160)])
    const [sva, svb] = await Promise.all([storageOf(A, 'cgs-carrot-defense-v1'), storageOf(B, 'cgs-carrot-defense-v1')])
    check(`[${tag}] the duo win records the single-player L4 win on both devices (medals ${sva?.medals?.[4]} / ${svb?.medals?.[4]})`, (sva?.medals?.[4] & 1) && (svb?.medals?.[4] & 1), { sva, svb })
    check(`[${tag}] doubled: each device saw its own boss and the partner's boss (${Object.values(ca.bossSeen)[0] || '-'} + partner ${ca.partnerLog.find(p => p[5])?.[5] || '-'})`, Object.keys(ca.bossSeen).length && Object.keys(cb.bossSeen).length && ca.partnerLog.some(p => p[5]) && cb.partnerLog.some(p => p[5]))
    check(`[${tag}] replica digests agree with their owners on every compared tick`, dig.aOwnVsBReplica.compared > 20 && dig.bOwnVsAReplica.compared > 20 && !dig.aOwnVsBReplica.mismatches && !dig.bOwnVsAReplica.mismatches && !dig.aDeepVsBReplica.mismatches && !dig.bDeepVsAReplica.mismatches, dig)
    check(`[${tag}] no desync or bridge error on either device`, !ca.desyncs.length && !cb.desyncs.length && !ca.errors.length && !cb.errors.length, { a: ca.desyncs, b: cb.desyncs })
    all[tag] = { code, reveal, sa, sb, ca, cb, dig, logs: { a: A.log.slice(0, 20), b: B.log.slice(0, 20) } }
    await A.ctx.close(); await B.ctx.close()
  },
  /** Duo L4 where one side never builds: that carrot falls and both lose (either carrot ends it). */
  async loss(kinds, idle, tag, viewports = [null, null]) {
    const { A, B, sa, sb } = await pair(kinds, { level: 4, viewports })
    check(`[${tag}] sides opposite (${sa?.side}/${sb?.side})`, sidesOk(sa, sb))
    await shot(A, `${tag}-A-prep`); await shot(B, `${tag}-B-prep`)
    const pads = rankPads(levelDef(4)).map(p => p.id)
    const builder = idle === 'A' ? B : A, idler = idle === 'A' ? A : B
    await startBot(builder, { pads })
    await sleep(2500)
    await Promise.all([pressStart(A), pressStart(B)])
    await playing(A, B)
    await sleep(8000); await shot(A, `${tag}-A-play`); await shot(B, `${tag}-B-play`)
    await ended([A, B], 6 * 60_000)
    await sleep(2500)
    const [ci, cb_] = await Promise.all([collect(idler), collect(builder)])
    await shot(A, `${tag}-A-results`); await shot(B, `${tag}-B-results`)
    const rIdle = ci.results.find(r => r.outcome === 'lost'), rBuild = cb_.results.find(r => r.outcome === 'lost')
    check(`[${tag}] ${idle}'s carrot fell: both lost (${ci.phase}/${cb_.phase}); causes ${rIdle?.cause}/${rBuild?.cause}`, ci.phase === 'lost' && cb_.phase === 'lost' && rIdle?.cause === 'self' && rBuild?.cause === 'partner', { ci: ci.results, cb: cb_.results })
    check(`[${tag}] the builder's own half still had hearts (${cb_.health}) when the match ended`, cb_.health > 0)
    const [ta, tb] = await Promise.all([resultsText(idler), resultsText(builder)])
    check(`[${tag}] both results cards name whose carrot fell`, /carrot fell/i.test(ta) && /carrot fell/i.test(tb), [ta.slice(0, 160), tb.slice(0, 160)])
    const endTick = Math.min(...[...ci.results, ...cb_.results].filter(r => r.outcome === 'lost').map(r => r.tick))
    const dig = await compareDigests(A, B, 'duo', endTick)
    check(`[${tag}] digests agree before the end tick ${endTick} (${dig.aOwnVsBReplica.compared}+${dig.bOwnVsAReplica.compared} compared)`, !dig.aOwnVsBReplica.mismatches && !dig.bOwnVsAReplica.mismatches && dig.aOwnVsBReplica.compared > 3, dig)
    const sv = await storageOf(idler, 'cgs-carrot-defense-v1')
    check(`[${tag}] a duo loss records no win (L4 medal ${sv?.medals?.[4] ?? 'none'})`, !(sv?.medals?.[4] & 1))
    all[tag] = { sa, sb, idle: ci, builder: cb_, dig, logs: { a: A.log.slice(0, 20), b: B.log.slice(0, 20) } }
    await A.ctx.close(); await B.ctx.close()
  },
  /** Two-player endless on Twin Gates: shared map and purse, rising waves, random boss and minibosses, score and the record. */
  async endless(kinds = ['chromium', 'webkit'], tag = 'endless', { impair = null, stopAt = 11, maxMin = 16 } = {}) {
    const { A, B, sa, sb } = await pair(kinds, { mode: 'endless2p', level: 90, impair })
    check(`[${tag}] endless session: same seed ${sa?.seed}, seats ${sa?.seat}/${sb?.seat}`, sa?.mode === 'endless' && sb?.mode === 'endless' && sa.seed === sb.seed && sa.seat !== sb.seat, { sa, sb })
    const def = levelDef(90)
    const west = rankPads(def, { only: p => p.x <= 14 }).map(p => p.id), east = rankPads(def, { only: p => p.x >= 14 }).map(p => p.id)
    await startBot(A, { pads: west, kinds: ['seed', 'mortar', 'frost', 'storm'] }); await startBot(B, { pads: east, kinds: ['seed', 'mortar', 'frost', 'storm'] })
    await sleep(3500)
    await shot(A, `${tag}-A-prep`)
    await Promise.all([pressStart(A), pressStart(B)])
    await playing(A, B)
    // shared editing: B upgrades a tower A built, A sells one B built
    await until(A, () => (window.__qa.last?.wave || 0) >= 3, 240000, 'wave 3')
    // both bots hold their coins for a moment (they share the purse), so the cross-seat edits below can be afforded
    await Promise.all([A, B].map(g => g.page.evaluate(() => { window.__qa.bot.paused = true })))
    await until(A, () => (window.__qa.last?.coins || 0) >= 400, 240000, 'a purse of 400')
    const [botA, botB] = await Promise.all([A, B].map(g => g.page.evaluate(() => window.__qa.bot.towers)))
    const aTower = Object.values(botA)[0], bTower = Object.values(botB).slice(-1)[0]
    const upgradeBy = await B.page.evaluate(id => { window.__qa.send({ type: 'select', selectionType: 'tower', id }); return window.__qa.last?.selection }, aTower?.id)
    await sleep(1500)
    const selB = await B.page.evaluate(() => window.__qa.last?.selection)
    await B.page.evaluate(() => window.__qa.send({ type: 'upgrade' }))
    await sleep(2000)
    const selB2 = await B.page.evaluate(() => window.__qa.last?.selection)
    const aSees = await A.page.evaluate(id => { const before = window.__qa.last?.selection; window.__qa.send({ type: 'select', selectionType: 'tower', id }); return before }, aTower?.id)
    await sleep(800)
    const selA = await A.page.evaluate(() => window.__qa.last?.selection)
    check(`[${tag}] B upgraded the tower A built (builder ${selB?.builder}, tier ${selB?.tier} -> ${selB2?.tier}); A sees tier ${selA?.tier}`, selB?.builder === sa.seat && selB2?.tier === (selB?.tier || 0) + 1 && selA?.tier === selB2?.tier, { upgradeBy, selB, selB2, selA, aSees })
    const towersBefore = await A.page.evaluate(() => window.__qa.last.towerCount)
    await A.page.evaluate(id => { window.__qa.send({ type: 'select', selectionType: 'tower', id }); window.__qa.send({ type: 'sell' }) }, bTower?.id)
    await sleep(2000)
    const [ta, tb] = await Promise.all([A, B].map(g => g.page.evaluate(() => window.__qa.last.towerCount)))
    check(`[${tag}] A sold a tower B built: towers ${towersBefore} -> ${ta} on A and ${tb} on B`, ta === towersBefore - 1 && tb === ta)
    await A.page.evaluate(id => { for (const t of Object.values(window.__qa.bot.towers)) if (t.id === id) t.tier++ }, aTower?.id)
    await B.page.evaluate(id => { for (const [p, t] of Object.entries(window.__qa.bot.towers)) if (t.id === id) delete window.__qa.bot.towers[p] }, bTower?.id)
    await Promise.all([A, B].map(g => g.page.evaluate(() => { window.__qa.bot.paused = false })))
    // let the waves climb; the bots stop building at stopAt so the shared carrot eventually falls
    await until(A, w => (window.__qa.last?.wave || 0) >= w, maxMin * 60_000, `wave ${stopAt}`, stopAt)
    await Promise.all([stopBot(A), stopBot(B)])
    await shot(A, `${tag}-A-wave${stopAt}`); await shot(B, `${tag}-B-wave${stopAt}`)
    await ended([A, B], maxMin * 60_000)
    await sleep(3000)
    const [ca, cb] = await Promise.all([collect(A), collect(B)])
    await shot(A, `${tag}-A-results`); await shot(B, `${tag}-B-results`)
    const dig = await compareDigests(A, B, 'lockstep')
    check(`[${tag}] one shared carrot: both ended lost on the same score (${ca.net?.score}/${cb.net?.score}) at wave ${ca.wave}`, ca.phase === 'lost' && cb.phase === 'lost' && ca.net?.score === cb.net?.score && ca.net.score >= stopAt - 1, { a: ca.net, b: cb.net })
    const hp = Object.entries(ca.waveHp).map(([w, h]) => [+w, h]).filter(([w, h]) => w >= 1 && h > 0).sort((x, y) => x[0] - y[0])
    const rising = hp.length >= 4 && hp[hp.length - 1][1] > hp[0][1] * 1.5
    check(`[${tag}] difficulty rises: strongest creature HP by wave ${hp.map(([w, h]) => w + ':' + Math.round(h)).join(' ')}`, rising)
    const firstBoss = ca.plan[0]?.[1] ?? 0
    check(`[${tag}] seeded random boss and minibosses: plan ${JSON.stringify(ca.plan)}; boss seen at waves ${Object.keys(ca.bossSeen).join(',') || '-'} (${[...new Set(Object.values(ca.bossSeen))].join(',')}), minibosses at ${Object.keys(ca.miniSeen).join(',') || '-'}`, Object.keys(ca.miniSeen).length > 0 && (firstBoss > ca.wave || Object.keys(ca.bossSeen).length > 0), { bossSeen: ca.bossSeen, miniSeen: ca.miniSeen, plan: ca.plan })
    check(`[${tag}] lockstep digests identical on both peers (${dig.own.compared} + ${dig.deep.compared} deep)`, dig.own.compared > 30 && !dig.own.mismatches && !dig.deep.mismatches, dig)
    check(`[${tag}] no desync on either peer`, !ca.desyncs.length && !cb.desyncs.length, { a: ca.desyncs, b: cb.desyncs })
    const [ea, eb] = await Promise.all([storageOf(A, 'cgs-carrot-endless2p-v1'), storageOf(B, 'cgs-carrot-endless2p-v1')])
    const [rta, rtb] = await Promise.all([resultsText(A), resultsText(B)])
    check(`[${tag}] the best-score record is saved on both devices (${ea?.best?.waves} / ${eb?.best?.waves} waves) and shown`, ea?.best?.waves === ca.net?.score && eb?.best?.waves === cb.net?.score && /wave/i.test(rta), [rta.slice(0, 160), rtb.slice(0, 160)])
    all[tag] = { sa, sb, ca, cb, dig, ea, eb, logs: { a: A.log.slice(0, 20), b: B.log.slice(0, 20) } }
    await A.ctx.close(); await B.ctx.close()
  },
  /** Duo L4: B's tab dies mid-match; the same code brings it back into its seat; the restored halves still agree. */
  async reconnect(kinds = ['chromium', 'chromium'], tag = 'reconnect') {
    const { A, B, code } = await pair(kinds, { level: 4 })
    const pads = rankPads(levelDef(4)).map(p => p.id)
    await Promise.all([startBot(A, { pads }), startBot(B, { pads })])
    await sleep(3000)
    await Promise.all([pressStart(A), pressStart(B)])
    await playing(A, B, false)
    await until(B, () => (window.__qa.last?.wave || 0) >= 2, 180000, 'wave 2')
    const bTowers = await B.page.evaluate(() => window.__qa.last.towerCount)
    const t0 = Date.now()
    await B.page.close()
    await sleep(5000)
    const away = await banner(A), pausedA = await A.duoPhase()
    check(`[${tag}] the survivor pauses with the grace clock: "${away}"`, pausedA === 'paused' && /stepped away|paused|Waiting/i.test(away), { pausedA, away })
    const B2 = await openGame(kinds[1], { base: BASE, context: B.ctx, hash: `#room=${code}`, label: 'B2' })
    await waitLoaded(B2)
    await until(B2, () => document.querySelector('.ct-page')?.dataset.duoPhase === 'playing', 90000, 'B back playing')
    await until(A, () => document.querySelector('.ct-page')?.dataset.duoPhase === 'playing', 30000, 'A playing again')
    const back = Date.now() - t0
    const b2 = await B2.page.evaluate(() => ({ towers: window.__qa.last.towerCount, wave: window.__qa.last.wave, phase: window.__qa.last.phase }))
    check(`[${tag}] B is back in its seat ${(back / 1000).toFixed(1)} s after the tab closed, its half rebuilt (towers ${bTowers} -> ${b2.towers}, wave ${b2.wave})`, b2.towers >= bTowers && b2.phase === 'playing', b2)
    await startBot(B2, { pads })
    await sleep(25000)
    const dig = await compareDigests(A, B2, 'duo')
    check(`[${tag}] after the restore both replicas agree with their owners (${dig.aOwnVsBReplica.compared} + ${dig.bOwnVsAReplica.compared} compared)`, dig.aOwnVsBReplica.compared >= 10 && dig.bOwnVsAReplica.compared >= 10 && !dig.aOwnVsBReplica.mismatches && !dig.bOwnVsAReplica.mismatches, dig)
    const [da, db] = await Promise.all([desyncsOf(A), desyncsOf(B2)])
    check(`[${tag}] no desync reported after the rejoin`, da === 0 && db === 0, { da, db })
    await shot(A, `${tag}-A-after`); await shot(B2, `${tag}-B2-after`)
    all[tag] = { code, back, b2, dig, logs: { a: A.log.slice(0, 20), b: B2.log.slice(0, 20) } }
    await A.ctx.close(); await B.ctx.close()
  },
  /** Duo under 100 ms RTT, 30 ms jitter, 2% loss (UDP proxies on the DataChannel, a TCP proxy on the relay socket). */
  async latency(kinds = ['chromium', 'webkit'], tag = 'latency') {
    const model = { rtt: 100, jitter: 30, loss: 0.02 }
    const { A, B } = await pair(kinds, { level: 4, impair: { ...model } })
    await Promise.all([pressStart(A), pressStart(B)])
    await playing(A, B, false)
    // A builds and sells on its best pads, one action every 1.5 s; B only watches
    const pads = rankPads(levelDef(4)).map(p => p.id).slice(0, 3)
    const marks = []
    for (let i = 0; i < 10; i++) {
      const pad = pads[i % pads.length]
      const t = await A.page.evaluate(pad => { const t = Date.now(); window.__qa.send({ type: 'select', selectionType: 'pad', id: pad }); window.__qa.send({ type: 'buy', kind: 'seed' }); return t }, pad)
      marks.push(['buy', t]); await sleep(1500)
      const t2 = await A.page.evaluate(() => { const t = Date.now(); window.__qa.send({ type: 'sell' }); return t })
      marks.push(['sell', t2]); await sleep(1500)
    }
    await sleep(2000)
    const qa = await A.page.evaluate(() => ({ own: window.__qa.own, towerAt: window.__qa.towerAt, frames: window.__qa.frames.slice(-3000) }))
    const qb = await B.page.evaluate(() => ({ rexec: window.__qa.rexec, frames: window.__qa.frames.slice(-3000), ticks: window.__qa.ticks.slice(-5000) }))
    const ownLat = [], partnerLat = []
    for (const [kind, t] of marks) {
      const vis = qa.towerAt.find(x => x[0] >= t); if (vis) ownLat.push(vis[0] - t)
      const op = qa.own.find(o => o[0] >= t && o[2] === kind); if (!op) continue
      const seen = qb.rexec.find(r => r[1] >= op[1]); if (seen) partnerLat.push(seen[0] - t)
    }
    // replica pacing on B: ticks per wall second and the gaps between replica advances while the match ran
    const rx = qb.rexec.filter(r => r[0] >= marks[0][1] && r[0] <= marks[marks.length - 1][1])
    const gaps = []; for (let i = 1; i < rx.length; i++) gaps.push(rx[i][0] - rx[i - 1][0])
    const rate = rx.length > 1 ? (rx[rx.length - 1][1] - rx[0][1]) / ((rx[rx.length - 1][0] - rx[0][0]) / 1000) : 0
    const behind = rx.map(r => r[2] - r[1])
    const dig = await compareDigests(A, B, 'duo')
    const res = { model, ownMs: stat(ownLat), partnerMs: stat(partnerLat), replicaTicksPerSec: +rate.toFixed(2), replicaAdvanceGapMs: stat(gaps), replicaBehindOwnTicks: stat(behind), frameMsA: stat(qa.frames), frameMsB: stat(qb.frames), dig }
    console.log('   ', JSON.stringify(res))
    check(`[${tag}] own actions are visible at once (p90 ${res.ownMs.p90} ms): the own half is authoritative`, res.ownMs.n >= 10 && res.ownMs.p90 <= 50, res.ownMs)
    check(`[${tag}] the partner sees them after the link plus the replica buffer (p50 ${res.partnerMs.p50} ms, p90 ${res.partnerMs.p90} ms)`, res.partnerMs.n >= 10 && res.partnerMs.p90 < 600, res.partnerMs)
    check(`[${tag}] the replica advances smoothly at the match rate (${res.replicaTicksPerSec} ticks/s, advance gap p99 ${res.replicaAdvanceGapMs.p99} ms)`, Math.abs(res.replicaTicksPerSec - 30) < 4 && res.replicaAdvanceGapMs.p99 < 250, res)
    check(`[${tag}] digests agree under impairment (${dig.aOwnVsBReplica.compared} + ${dig.bOwnVsAReplica.compared})`, !dig.aOwnVsBReplica.mismatches && !dig.bOwnVsAReplica.mismatches && dig.aOwnVsBReplica.compared > 5, dig)
    all[tag] = res
    for (const g of [A, B]) for (const px of g.ctx.__proxies || []) px.close()
    await A.ctx.close(); await B.ctx.close()
  },
  /** Endless (lockstep) under the same impairment: own and partner latency are both the input delay D. */
  async latencyEndless(kinds = ['chromium', 'webkit'], tag = 'latencyEndless') {
    const model = { rtt: 100, jitter: 30, loss: 0.02 }
    const { A, B } = await pair(kinds, { mode: 'endless2p', level: 90, impair: { ...model } })
    await Promise.all([pressStart(A), pressStart(B)])
    await playing(A, B, false)
    await sleep(12000) // let the adaptive delay settle
    const def = levelDef(90), pads = rankPads(def, { only: p => p.x <= 14 }).map(p => p.id).slice(0, 3)
    const marks = []
    for (let i = 0; i < 10; i++) {
      const pad = pads[i % pads.length]
      marks.push(['buy', await A.page.evaluate(pad => { const t = Date.now(); window.__qa.send({ type: 'select', selectionType: 'pad', id: pad }); window.__qa.send({ type: 'buy', kind: 'seed' }); return t }, pad)])
      await sleep(1500)
      marks.push(['sell', await A.page.evaluate(() => { const t = Date.now(); window.__qa.send({ type: 'sell' }); return t })])
      await sleep(1500)
    }
    await sleep(2000)
    const [qa, qb] = await Promise.all([A, B].map(g => g.page.evaluate(() => ({ towerAt: window.__qa.towerAt, pendingAt: window.__qa.pendingAt, frames: window.__qa.frames.slice(-3000), ticks: window.__qa.ticks.slice(-6000), D: window.__qa.last?.net ? null : null }))))
    const ownLat = [], partnerLat = [], previewLat = []
    for (const [kind, t] of marks) {
      const a = qa.towerAt.find(x => x[0] >= t); if (a) ownLat.push(a[0] - t); const b = qb.towerAt.find(x => x[0] >= t); if (b) partnerLat.push(b[0] - t)
      if (kind === 'buy') { const p = qa.pendingAt.find(x => x[0] >= t && x[1] > 0); if (p) previewLat.push(p[0] - t) }
    }
    const tickGaps = g => { const r = []; for (let i = 1; i < g.length; i++) r.push(g[i][0] - g[i - 1][0]); return r }
    const dig = await compareDigests(A, B, 'lockstep')
    const res = { model, ownPreviewMs: stat(previewLat), ownMs: stat(ownLat), partnerMs: stat(partnerLat), tickGapA: stat(tickGaps(qa.ticks)), tickGapB: stat(tickGaps(qb.ticks)), frameMsA: stat(qa.frames), frameMsB: stat(qb.frames), dig }
    console.log('   ', JSON.stringify(res))
    check(`[${tag}] own and partner see a build after the same input delay (own p50 ${res.ownMs.p50} ms, partner p50 ${res.partnerMs.p50} ms)`, res.ownMs.n >= 10 && res.partnerMs.n >= 10 && res.ownMs.p90 < 450 && res.partnerMs.p90 < 450, res)
    check(`[${tag}] the own build shows at once as a pending ghost (p90 ${res.ownPreviewMs.p90} ms) before it lands for both`, res.ownPreviewMs.n >= 5 && res.ownPreviewMs.p90 <= 50, res.ownPreviewMs)
    check(`[${tag}] lockstep digests identical under impairment (${dig.own.compared})`, dig.own.compared > 10 && !dig.own.mismatches && !dig.deep.mismatches, dig)
    all[tag] = res
    for (const g of [A, B]) for (const px of g.ctx.__proxies || []) px.close()
    await A.ctx.close(); await B.ctx.close()
  },
  /** A window losing focus (another window clicked, devtools, a notification) never freezes a match; only a hidden tab pauses. */
  async blur(kinds = ['chromium', 'webkit'], tag = 'blur') {
    const { A, B } = await pair(kinds, { level: 25 })
    await Promise.all([pressStart(A), pressStart(B)])
    await playing(A, B, false)
    await sleep(2000)
    const before = await Promise.all([A, B].map(g => g.page.evaluate(() => window.__qa.exec)))
    await A.page.evaluate(() => { window.dispatchEvent(new Event('blur')); document.dispatchEvent(new Event('blur')); const c = document.querySelector('#carrot-unity-canvas'); c?.dispatchEvent(new FocusEvent('blur')) })
    await sleep(4000)
    const after = await Promise.all([A, B].map(g => g.page.evaluate(() => window.__qa.exec)))
    const phases = await Promise.all([A, B].map(g => g.duoPhase()))
    await A.page.evaluate(() => window.dispatchEvent(new Event('focus')))
    check(`[${tag}] after a window blur both halves kept running (A ${before[0]} -> ${after[0]}, B ${before[1]} -> ${after[1]} ticks in 4 s; phases ${phases.join('/')})`, after[0] - before[0] > 90 && after[1] - before[1] > 90 && phases.every(p => p === 'playing'))
    all[tag] = { before, after, phases }
    await A.ctx.close(); await B.ctx.close()
  },
  /** Single player is untouched: an old save loads, L1 plays to a win and the save advances. */
  async solo(kind = 'chromium', tag = 'solo') {
    const old = { 'cgs-carrot-defense-v1': JSON.stringify({ version: 1, unlocked: 1, medals: {}, sound: false }), 'cgs-carrot-records-v1': JSON.stringify({ version: 1, levels: {}, seen: { abilities: [], creatures: [] }, tutorial: true }) }
    const g = await openGame(kind, { base: BASE, storage: old, label: 'solo' })
    await g.page.waitForSelector('.ct-lobby .ct-cta--hero:not([disabled])', { timeout: 30000 })
    check(`[${tag}] the title screen offers multiplayer and single player side by side`, await g.page.isVisible('.ct-duo-entry') && await g.page.isVisible('.ct-lobby .ct-cta--hero'))
    await g.page.click('.ct-lobby .ct-cta--hero')
    await waitLoaded(g)
    await until(g, () => window.__qa.last?.level === 1 && window.__qa.last?.phase === 'ready', 60000, 'L1 ready')
    const pads = rankPads(levelDef(1)).map(p => p.id)
    await startBot(g, { pads, kinds: ['seed', 'frost', 'bamboo'] })
    await sleep(2500)
    await g.page.evaluate(() => document.activeElement?.blur?.()); await g.page.keyboard.press('Space'); await sleep(800)
    await g.page.keyboard.press('f')
    await until(g, () => ['won', 'lost'].includes(window.__qa.last?.phase), 8 * 60_000, 'L1 end')
    await sleep(2500)
    const s = await g.snap(), save = await storageOf(g, 'cgs-carrot-defense-v1'), rec = await storageOf(g, 'cgs-carrot-records-v1')
    await shot(g, `${tag}-results`)
    check(`[${tag}] L1 solo: ${s.phase}; the old save advanced to unlocked ${save?.unlocked}, medal ${save?.medals?.[1]}, grade ${rec?.levels?.[1]?.grade}`, s.phase === 'won' && save?.unlocked >= 2 && (save?.medals?.[1] & 1) && !s.net, { save, rec: rec?.levels })
    check(`[${tag}] the stock results card shows (no duo overlay)`, await g.page.isVisible('.ct-results') || await g.page.isVisible('[class*="ct-results"]'))
    all[tag] = { phase: s.phase, save, rec: rec?.levels, log: g.log.slice(0, 20) }
    await g.ctx.close()
  },
}

const plan = picks.length ? picks : ['solo', 'win', 'lossA', 'lossB', 'endless', 'reconnect', 'latency', 'latencyEndless']
const t0 = Date.now()
for (const name of plan) {
  console.log(`\n== ${name}`)
  const s0 = Date.now()
  try {
    if (name === 'win') await scenarios.win(['chromium', 'chromium'], 'win')
    else if (name === 'winCrWk') await scenarios.win(['chromium', 'webkit'], 'winCrWk')
    else if (name === 'lossA') await scenarios.loss(['chromium', 'webkit'], 'A', 'lossA')
    else if (name === 'lossB') await scenarios.loss(['chromium', 'webkit'], 'B', 'lossB', [{ width: 390, height: 844 }, { width: 844, height: 390 }])
    else if (name === 'endless') await scenarios.endless(['chromium', 'webkit'], 'endless')
    else if (name === 'reconnect') await scenarios.reconnect(['chromium', 'chromium'], 'reconnect')
    else if (name === 'latency') await scenarios.latency(['chromium', 'webkit'], 'latency')
    else if (name === 'latencyEndless') await scenarios.latencyEndless(['chromium', 'webkit'], 'latencyEndless')
    else if (name === 'blur') await scenarios.blur(['chromium', 'webkit'], 'blur')
    else if (name === 'latencyCr') await scenarios.latency(['chromium', 'chromium'], 'latencyCr')
    else if (name === 'latencyEndlessCr') await scenarios.latencyEndless(['chromium', 'chromium'], 'latencyEndlessCr')
    else if (name === 'lossPhones') await scenarios.loss(['webkit', 'chromium'], 'A', 'lossPhones', [{ width: 844, height: 390 }, { width: 390, height: 844 }])
    else if (name === 'solo') await scenarios.solo('chromium', 'solo')
    else console.log('unknown scenario', name)
  } catch (e) { failures++; checks.push({ name: `${name} threw`, ok: false, detail: String(e?.stack || e).slice(0, 800) }); console.log('THREW', String(e?.stack || e).slice(0, 800)) }
  console.log(`   (${((Date.now() - s0) / 1000).toFixed(0)} s)`)
  all.checks = [...(all.checks || []).filter(c => !c.name.startsWith(`[${name}]`) && c.name !== `${name} threw`), ...checks.filter(c => c.name.startsWith(`[${name}]`) || c.name === `${name} threw`)]
  writeFileSync(resultsFile, JSON.stringify({ ...all, when: new Date().toISOString(), base: BASE, rooms: ROOMS }, null, 1))
}
await closeBrowsers()
console.log(`\n${checks.length - failures}/${checks.length} checks passed in ${((Date.now() - t0) / 60000).toFixed(1)} min; results in ${resultsFile}`)
process.exit(failures ? 1 : 0)
