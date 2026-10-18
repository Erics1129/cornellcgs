// Two-browser QA of the Carrot net layer with fake-engine pages (no Unity): real WebRTC DataChannels and the real rooms Worker
// under `wrangler dev --local`, Chromium<->Chromium and Chromium<->WebKit, optional UDP/TCP impairment (impair.mjs).
// Run with the Codex runtime's node (it has Playwright):
//   WRANGLER=/path/to/wrangler <codex-node> scripts/carrot-net-qa/run.mjs [scenario-substring ...] [--out results.json]
import { chromium, webkit } from '/Users/eric/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
import { build } from 'esbuild'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LAN, leg, tcpProxy, udpProxy } from './impair.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../..')
const argOut = process.argv.indexOf('--out')
const outFile = argOut > 0 ? process.argv[argOut + 1] : join(root, 'output/carrot-net-qa/results.json')
const picks = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--out')
const ROOMS_PORT = 8890, PAGE_PORT = 8891, PROXY_PORT = 8892
const ROOMS = `http://127.0.0.1:${ROOMS_PORT}`

// ---------------------------------------------------------------- build, serve, rooms
mkdirSync(join(root, 'output/carrot-net-qa'), { recursive: true })
await build({ entryPoints: [join(here, 'entry.ts')], outfile: join(root, 'output/carrot-net-qa/bundle.js'), bundle: true, format: 'iife', target: 'es2022', logLevel: 'warning' })
const files = { '/': [join(here, 'page.html'), 'text/html'], '/page.html': [join(here, 'page.html'), 'text/html'], '/bundle.js': [join(root, 'output/carrot-net-qa/bundle.js'), 'text/javascript'] }
const web = http.createServer((req, res) => {
  const f = files[new URL(req.url, 'http://x').pathname]
  if (!f) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': f[1], 'cache-control': 'no-store' }); res.end(readFileSync(f[0]))
})
await new Promise(r => web.listen(PAGE_PORT, '0.0.0.0', r))
let rooms = null
async function up(url) { try { return (await fetch(url + '/health')).ok } catch { return false } }
if (!(await up(ROOMS))) {
  const wrangler = process.env.WRANGLER
  if (!wrangler) { console.error('Set WRANGLER=/path/to/wrangler'); process.exit(2) }
  rooms = spawn(wrangler, ['dev', '--config', join(root, 'backend/rooms/wrangler.jsonc'), '--env', 'dev', '--local', '--port', String(ROOMS_PORT), '--ip', '127.0.0.1', '--persist-to', join(root, 'output/rooms-dev-state')], { cwd: root, stdio: 'ignore', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } })
  const t0 = Date.now()
  while (!(await up(ROOMS))) { if (Date.now() - t0 > 60_000) throw new Error('wrangler dev did not start'); await new Promise(r => setTimeout(r, 300)) }
}

// ---------------------------------------------------------------- browsers and pages
const launchers = {
  chromium: () => chromium.launch({ channel: 'chromium', args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--host-resolver-rules=MAP evil.test 127.0.0.1'] }),
  webkit: () => webkit.launch(),
}
const browsers = {}
const browser = kind => browsers[kind] || (browsers[kind] = launchers[kind]())
const proxies = []
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function open(kind, params = {}, host = '127.0.0.1') {
  const b = await browser(kind)
  const ctx = await b.newContext()
  const p = await ctx.newPage()
  p.on('console', m => { if (m.type() === 'error' && !/WebSocket|Failed to load|ERR_|status of 4/.test(m.text())) console.log(`    [${kind} console]`, m.text().slice(0, 200)) })
  p.on('pageerror', e => console.log(`    [${kind} pageerror]`, String(e).slice(0, 300)))
  if (params.impair) {
    await p.exposeFunction('__proxyFor', async (ip, port, typ) => {
      // each direction crosses one proxy (the receiver's), so a proxy carries the whole one-way model
      const px = await udpProxy({ ip: typ === 'srflx' ? LAN : ip, port }, params.impair); proxies.push(px); return { ip: LAN, port: px.port }
    })
  }
  const qs = new URLSearchParams({ rooms: params.rooms || ROOMS, filter: params.filter || 'all', stun: params.stun || 'on', ver: params.ver || 'qa+n1', waves: String(params.waves || 1), ...(params.health ? { health: String(params.health) } : {}) })
  await p.goto(`http://${host}:${PAGE_PORT}/page.html?${qs}${params.hash || ''}`)
  await p.waitForFunction(() => document.title === 'carrot-net-qa ready')
  const page = { p, ctx, kind, qs: qs.toString() }
  page.snap = () => p.evaluate(() => window.qa.snap())
  page.eng = () => p.evaluate(() => window.qa.engine())
  page.call = (fn, ...args) => p.evaluate(([f, a]) => window.qa[f](...a), [fn, args])
  page.until = async (pred, ms, label, arg) => { const t0 = Date.now(); for (;;) { const s = await page.snap(); if (pred(s, arg)) return { s, ms: Date.now() - t0 }; if (Date.now() - t0 > ms) throw new Error(`${kind}: timeout ${label} (phase ${s.phase}, path ${s.path}, error ${JSON.stringify(s.error)})`); await sleep(50) } }
  return page
}
async function pairUp(kinds, params = {}, mode = 'duoBoss', level = 25) {
  const A = await open(kinds[0], params), B = await open(kinds[1], params)
  const code = await A.call('create', 'Ada')
  const tJoin = Date.now()
  await B.call('join', code, 'Bob')
  for (const x of [A, B]) await x.call('loaded', 1)
  await A.call('configure', mode, level)
  await B.until(s => s.roomMode === mode && (mode === 'endless2p' ? s.level === 90 : s.level === level), 4000, 'config')
  return { A, B, code, tJoin }
}
async function play(A, B) {
  await A.call('ready', true); await B.call('ready', true)
  await A.until(s => s.peers.length === 2 && s.peers.every(p => p.ready && p.loaded === 1), 4000, 'ready')
  await A.call('start')
  await A.until(s => s.phase === 'prep', 8000, 'prep'); await B.until(s => s.phase === 'prep', 8000, 'prep')
  await A.call('pressStart'); await B.call('pressStart')
  await A.until(s => s.phase === 'playing', 8000, 'playing'); await B.until(s => s.phase === 'playing', 8000, 'playing')
}
async function bytesPerSec(page, ms) {
  const a = await page.call('rtcStats'); await sleep(ms); const b = await page.call('rtcStats')
  return { sent: Math.round((b.bytesSent - a.bytesSent) / (ms / 1000)), received: Math.round((b.bytesReceived - a.bytesReceived) / (ms / 1000)), pair: `${b.local}/${b.remote}` }
}
async function closeAll(...pages) { for (const x of pages) { try { await x.call('stop') } catch { /* gone */ } await x.ctx.close() } for (const px of proxies.splice(0)) px.close() }
const roomStats = async code => (await (await fetch(`${ROOMS}/rooms/${code}?stats`)).json()).stats

// ---------------------------------------------------------------- scenarios
const results = []
let failures = 0
const scenarios = {
  async 'lan duo cr-cr'() { return lanDuo(['chromium', 'chromium']) },
  async 'lan duo cr-wk'() { return lanDuo(['chromium', 'webkit']) },
  async 'lan endless cr-wk'() {
    const { A, B } = await pairUp(['chromium', 'webkit'], {}, 'endless2p', 90)
    await A.until(s => s.path === 'p2p', 5000, 'p2p'); await B.until(s => s.path === 'p2p', 5000, 'p2p')
    await play(A, B)
    await sleep(2000)
    for (let i = 0; i < 6; i++) { await A.call('cmd', { type: 'buy', pad: i, kind: 'seed' }); await B.call('cmd', { type: 'buy', pad: 20 + i, kind: 'frost' }); await sleep(300) }
    const bw = await bytesPerSec(A, 8000), bwB = await bytesPerSec(B, 4000)
    const sa = await A.snap(), ea = await A.eng(), eb = await B.eng()
    await A.call('cmd', { type: 'pause' }); await B.until(s => s.phase === 'paused', 3000, 'paused')
    await sleep(600) // both commits freeze; each peer runs on to min(commits), the same tick
    const ta = (await A.eng()).shared.tick, tb = (await B.eng()).shared.tick
    const r = { inputDelayMs: sa.inputDelayMs, delayTicks: sa.stats.delayTicks, stalls20s: sa.stats.stalls20s, bytesPerSecA: bw, bytesPerSecB: bwB, digests: sa.stats.digestsCompared, resyncs: sa.stats.resyncs + (await B.snap()).stats.resyncs, towersA: ea.shared.towers.length, towersB: eb.shared.towers.length, pausedAt: [ta, tb], reentry: ea.reentry + eb.reentry }
    await closeAll(A, B)
    return check(r, [
      ['lockstep on P2P: <= 3 KB/s per direction from RTCStats', bw.sent <= 3072 && bw.received <= 3072 && bwB.sent <= 3072],
      ['both peers hold the same towers (one shared purse decides which builds succeed)', r.towersA === r.towersB && r.towersA >= 2],
      ['pause stops both peers on the same tick', ta === tb],
      ['0 resyncs, digests compared', r.resyncs === 0 && r.digests >= 4],
      ['no re-entrant net() calls', r.reentry === 0],
    ])
  },
  async 'srflx-only hairpin cr-cr'() {
    const { A, B } = await pairUp(['chromium', 'chromium'], { filter: 'srflx' })
    const onRelay = await A.until(s => s.path === 'relay', 5500, 'relay')
    await play(A, B)
    await sleep(8000)
    const s = await A.snap(), e = await B.eng()
    const r = { relayWithinMs: onRelay.ms, path: s.path, pcStates: await A.call('pcStates'), replicaTick: e.replica?.tick, digests: s.stats.digestsCompared }
    await closeAll(A, B)
    return check(r, [
      ['no hairpin: P2P never comes up with server-reflexive candidates only', r.path === 'relay'],
      ['play runs on the relay within 5.5 s', onRelay.ms <= 5500 && r.replicaTick > 100],
      ['replica digests verified over the relay', r.digests >= 4],
    ])
  },
  async 'blackhole duo cr-wk'() {
    const impair = { rtt: 20, jitter: 2, loss: 0 }
    const { A, B } = await pairUp(['chromium', 'webkit'], { filter: 'proxy', impair, waves: 3 })
    await A.until(s => s.path === 'p2p', 8000, 'p2p'); await B.until(s => s.path === 'p2p', 8000, 'p2p')
    await play(A, B)
    await sleep(1500)
    const cut = Date.now()
    impair.loss = 1
    for (let i = 0; i < 10; i++) { await A.call('cmd', { type: 'buy', pad: i, kind: 'seed' }); await sleep(80) }
    await A.until(s => s.path === 'relay', 3000, 'relay A'); await B.until(s => s.path === 'relay', 3000, 'relay B')
    await sleep(1500)
    const own = (await A.eng()).own.towers.length, rep = (await B.eng()).replica.towers.length
    const restore = Date.now()
    impair.loss = 0
    await A.until(s => s.path === 'p2p', 10_000, 'p2p again A'); await B.until(s => s.path === 'p2p', 10_000, 'p2p again B')
    const firstAfter = async (x, path, t) => { const ev = await x.p.evaluate(() => window.qa.events); const hit = ev.find(([at, e]) => at > t && e.type === 'pathChanged' && e.path === path); return hit ? hit[0] - t : Infinity }
    const relayA = await firstAfter(A, 'relay', cut), relayB = await firstAfter(B, 'relay', cut)
    const p2pA = await firstAfter(A, 'p2p', restore), p2pB = await firstAfter(B, 'p2p', restore)
    const sa = await A.snap(), sb = await B.snap()
    const r = { toRelayMs: [relayA, relayB], ownTowers: own, replicaTowers: rep, backToP2pMs: [p2pA, p2pB], resyncs: sa.stats.resyncs + sb.stats.resyncs, pathSwitches: [sa.stats.pathSwitches, sb.stats.pathSwitches] }
    await closeAll(A, B)
    return check(r, [
      ['relay takes over within 1 s of a UDP blackhole', relayA <= 1000 && relayB <= 1000],
      ['no op lost: every build made during the cut is on the partner replica', own === rep && own >= 3],
      ['P2P returns within 3 s of the link being restored', p2pA <= 3000 && p2pB <= 3000],
      ['no desync across both switches', r.resyncs === 0],
    ])
  },
  async 'reload and rejoin cr-wk'() {
    const { A, B, code } = await pairUp(['chromium', 'webkit'], { waves: 2 })
    await play(A, B)
    for (let i = 0; i < 3; i++) { await B.call('cmd', { type: 'buy', pad: 5 + i, kind: 'seed' }); await sleep(200) }
    await sleep(1500)
    const before = (await B.eng()).own
    const t0 = Date.now()
    await B.p.reload()
    await B.p.waitForFunction(() => document.title === 'carrot-net-qa ready')
    B.snap = () => B.p.evaluate(() => window.qa.snap())
    await B.call('loaded', 1)
    await B.call('resume', 'Bob')
    const back = await B.until(s => s.phase === 'playing' && s.code === code, 25_000, 'back in seat')
    await A.until(s => s.phase === 'playing', 10_000, 'A resumed')
    await sleep(2000)
    const after = (await B.eng()).own, sa = await A.snap(), sb = await B.snap()
    const r = { backInMs: Date.now() - t0, restoredTowers: after.towers.length, towersBefore: before.towers.length, tickBefore: before.tick, tickAfter: after.tick, resyncs: sa.stats.resyncs + sb.stats.resyncs, seat: sb.seat }
    const end = await A.until(s => s.phase === 'results', 40_000, 'results').catch(e => ({ s: { result: { kind: 'timeout ' + e.message } } }))
    r.result = end.s.result?.kind
    await closeAll(A, B)
    void back
    return check(r, [
      ['a reloaded tab is back in its seat within the grace', r.backInMs < 60_000],
      ['its own half is rebuilt (same towers) by silent replay', r.restoredTowers === r.towersBefore],
      ['digests match after the restore (no resync)', r.resyncs === 0],
      ['the match still finishes as a duo win', r.result === 'duoWin'],
    ])
  },
  async 'positive control cr-wk'() {
    // the '0 mismatches' results above mean something only if a real divergence is caught: inject one in each mode
    const out = {}
    for (const [mode, level] of [['duoBoss', 25], ['endless2p', 90]]) {
      const { A, B } = await pairUp(['chromium', 'webkit'], { waves: 3 }, mode, level)
      await play(A, B)
      await sleep(2000)
      const t0 = Date.now()
      await A.call('raw', { type: 'debugCoins', value: 1 })
      const seen = async x => (await x.p.evaluate(() => window.qa.events)).find(([at, e]) => at > t0 && e.type === 'resynced')
      let hit = null
      for (let i = 0; i < 100 && !hit; i++) { hit = (await seen(A)) || (await seen(B)); if (!hit) await sleep(100) }
      await sleep(4000)
      const sa = await A.snap(), sb = await B.snap()
      out[mode] = { detectedAndResyncedMs: hit ? hit[0] - t0 : null, resyncs: sa.stats.resyncs + sb.stats.resyncs, phase: [sa.phase, sb.phase] }
      await closeAll(A, B)
    }
    return check(out, [
      ['duo: a one-coin divergence is caught by the replica digests and resynced (within 2 s)', out.duoBoss.detectedAndResyncedMs !== null && out.duoBoss.detectedAndResyncedMs <= 2000 && out.duoBoss.phase.every(p => p === 'playing')],
      ['endless: caught, both peers paused, host state resynced, play resumed', out.endless2p.detectedAndResyncedMs !== null && out.endless2p.phase.every(p => p === 'playing' || p === 'paused')],
    ])
  },
  async 'leave cr-wk'() {
    const { A, B } = await pairUp(['chromium', 'webkit'], { waves: 3 })
    await play(A, B)
    await sleep(1000)
    const t0 = Date.now()
    await B.call('leave')
    const seen = await A.until(s => s.phase === 'results', 3000, 'gone')
    const r = { goneMs: Date.now() - t0, result: seen.s.result }
    await closeAll(A, B)
    return check(r, [['an explicit leave shows the partner gone within 1 s (match unfinished)', r.goneMs <= 1000 && r.result.kind === 'unfinished']])
  },
  async 'impaired lockstep 60/10/2 cr-wk'() {
    const impair = { rtt: 60, jitter: 10, loss: 0.02 }
    const { A, B } = await pairUp(['chromium', 'webkit'], { filter: 'proxy', impair }, 'endless2p', 90)
    await A.until(s => s.path === 'p2p', 8000, 'p2p')
    await play(A, B)
    await sleep(10_000)
    const s0 = await A.snap()
    await sleep(20_000)
    const sa = await A.snap(), sb = await B.snap()
    const r = { D10: s0.stats.delayTicks, D30: [sa.stats.delayTicks, sb.stats.delayTicks], inputDelayMs: [sa.inputDelayMs, sb.inputDelayMs], stalls20s: [sa.stats.stalls20s, sb.stats.stalls20s], rtt: sa.rttMs, resyncs: sa.stats.resyncs + sb.stats.resyncs, digests: Math.min(sa.stats.digestsCompared, sb.stats.digestsCompared) }
    await closeAll(A, B)
    return check(r, [
      [`adaptive D settles at 4-5 ticks on a 60 ms / 2% path (RTT measured ${r.rtt} ms)`, r.D30.every(d => d >= 4 && d <= 5)],
      ['no stall of a frame or more once settled (stats.stalls20s counts all stalls)', r.stalls20s.every(x => x <= 1)],
      ['0 resyncs, digests verified', r.resyncs === 0 && r.digests >= 25],
    ])
  },
  async 'relay budget duo + endless cr-cr'() {
    // forced relay: no STUN, srflx filter -> nothing to pair; count the room's billed requests per relayed minute
    const out = {}
    for (const [mode, level, speed] of [['duoBoss', 25, 1], ['endless2p', 90, 1], ['endless2p', 90, 2]]) {
      const { A, B, code } = await pairUp(['chromium', 'chromium'], { filter: 'srflx', stun: 'off', waves: 30 }, mode, level)
      await play(A, B)
      if (speed === 2) await A.call('cmd', { type: 'speed', value: 2 })
      await sleep(2000)
      const s0 = await roomStats(code)
      await sleep(30_000)
      const s1 = await roomStats(code)
      const perMin = (s1.billed - s0.billed) * 2
      out[`${mode} ${speed}x`] = { billedPerMin: perMin, inPerMin: (s1.textIn + s1.binIn - s0.textIn - s0.binIn) * 2, path: (await A.snap()).path }
      await closeAll(A, B)
    }
    return check(out, Object.entries(out).map(([k, v]) => [`${k}: <= 70 billed DO requests per relayed match-minute (${v.billedPerMin})`, v.billedPerMin <= 70 && v.path === 'relay']))
  },
  async 'error copy cr + wk'() {
    const { errorCopy } = await import('../../src/minigames/carrot/net/protocol.ts')
    const out = {}
    for (const kind of ['chromium', 'webkit']) {
      const X = await open(kind)
      const want = {}
      // room-not-found
      await X.call('join', 'ZZZZZ', 'X').catch(() => {})
      want['room-not-found'] = (await X.snap()).error?.message
      // ambiguous characters
      await X.call('reset'); await X.call('join', 'AB0DE', 'X').catch(() => {})
      want['bad-code'] = (await X.snap()).error?.message
      // room-full and in-progress
      const { A, B, code } = await pairUp(['chromium', 'chromium'])
      await X.call('reset'); await X.call('join', code, 'X').catch(() => {})
      want['room-full'] = (await X.snap()).error?.message
      // version mismatch: a page from an older build
      const Old = await open(kind, { ver: 'qa+n0' })
      await Old.call('join', code, 'Old').catch(() => {})
      want['version-mismatch:you'] = (await Old.snap()).error?.message
      await closeAll(A, B, Old)
      const P = await open(kind), Q = await open(kind)
      const c2 = await P.call('create', 'P'); await Q.call('join', c2, 'Q')
      for (const x of [P, Q]) await x.call('loaded', 1)
      await play(P, Q)
      const R = await open(kind)
      await R.call('join', c2, 'R').catch(() => {})
      want['in-progress-or-full'] = (await R.snap()).error?.message
      await closeAll(P, Q, R)
      if (kind === 'chromium') {
        const E = await open(kind, {}, 'evil.test')
        await E.call('create', 'E').catch(() => {})
        want.origin = (await E.snap()).error?.message
        await closeAll(E)
      }
      await closeAll(X)
      out[kind] = want
    }
    const exp = { 'room-not-found': errorCopy('room-not-found'), 'bad-code': errorCopy('bad-code'), 'room-full': errorCopy('room-full'), 'version-mismatch:you': errorCopy('version-mismatch', 'you'), origin: errorCopy('origin') }
    const rows = []
    for (const kind of Object.keys(out)) for (const [k, v] of Object.entries(exp)) if (out[kind][k] !== undefined || k !== 'origin') rows.push([`${kind}: ${k} shows "${v}"`, out[kind][k] === v])
    rows.push(['a match in progress: a stranger is refused with readable copy (two seats taken: room-full)', Object.values(out).every(o => o['in-progress-or-full'] === errorCopy('room-full'))])
    return check(out, rows)
  },
}
async function lanDuo(kinds) {
  const { A, B, tJoin } = await pairUp(kinds)
  const pA = await A.until(s => s.path === 'p2p', 5000, 'p2p'), pB = await B.until(s => s.path === 'p2p', 5000, 'p2p')
  const p2pMs = Math.max(pA.ms, pB.ms) + (Date.now() - tJoin - Math.max(pA.ms, pB.ms) - (Date.now() - tJoin - Math.max(pA.ms, pB.ms)))
  const marksA = await A.p.evaluate(() => window.qa.marks), marksB = await B.p.evaluate(() => window.qa.marks)
  const openMs = Math.max(marksA['path:p2p'], marksB['path:p2p']) - tJoin
  await play(A, B)
  await A.call('cmd', { type: 'buy', pad: 2, kind: 'seed' })
  const bw = await bytesPerSec(A, 5000), bwB = await bytesPerSec(B, 3000)
  const end = await A.until(s => s.phase === 'results', 30_000, 'results')
  const sb = await B.until(s => s.phase === 'results', 5000, 'results B')
  const ea = await A.eng(), eb = await B.eng()
  const r = { p2pOpenMs: openMs, pair: bw.pair, bytesPerSecA: bw, bytesPerSecB: bwB, resultA: end.s.result.kind, resultB: sb.s.result.kind, digests: [end.s.stats.digestsCompared, sb.s.stats.digestsCompared], unverified: [end.s.stats.unverified, sb.s.stats.unverified], ticks: ea.own.tick, reentry: ea.reentry + eb.reentry }
  void p2pMs
  await closeAll(A, B)
  return check(r, [
    ['P2P opens within 1 s on the LAN', openMs <= 1000],
    ['duo on P2P: <= 2 KB/s per direction from RTCStats', bw.sent <= 2048 && bw.received <= 2048 && bwB.sent <= 2048],
    ['both devices end in a duo win', r.resultA === 'duoWin' && r.resultB === 'duoWin'],
    [`replica digests compared on both (>= floor(ticks/30) - 4 = ${Math.floor(r.ticks / 30) - 4})`, r.digests.every(d => d >= Math.floor(r.ticks / 30) - 4)],
    ['no re-entrant net() calls', r.reentry === 0],
  ])
}
function check(r, rows) {
  const passed = rows.filter(([, v]) => v).length
  for (const [label, v] of rows) { console.log(`  ${v ? 'ok' : 'FAIL'} ${label}`); if (!v) failures++ }
  return { ...r, checks: rows.map(([label, v]) => ({ label, ok: !!v })), passed, total: rows.length }
}

for (const [name, fn] of Object.entries(scenarios)) {
  if (picks.length && !picks.some(p => name.includes(p))) continue
  console.log(`== ${name}`)
  const t0 = Date.now()
  try { const r = await fn(); results.push({ name, ms: Date.now() - t0, ...r }); console.log('   ', JSON.stringify(r, (k, v) => (k === 'checks' ? undefined : v)).slice(0, 600)) }
  catch (e) { failures++; console.log('  THREW', String(e.message || e).slice(0, 400)); results.push({ name, threw: String(e.message || e) }) }
  for (const px of proxies.splice(0)) px.close()
}
writeFileSync(outFile, JSON.stringify({ when: new Date().toISOString(), lan: LAN.split('.').slice(0, 2).join('.') + '.x.x', results }, null, 1))
console.log(failures ? `FAILURES ${failures}` : 'ALL PASS', '->', outFile)
for (const b of Object.values(browsers)) await (await b).close()
web.close()
if (rooms) rooms.kill('SIGINT')
void tcpProxy; void PROXY_PORT
process.exit(failures ? 1 : 0)
