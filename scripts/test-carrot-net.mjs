// Carrot net layer, fast checks in Node 24 (virtual time; no browser, no Unity):
//   protocol (tower order vs game-data.json, the NET_VERSION lock), codec fuzz (100k frames), digest book, bridge validation,
//   the golden bridge fixture when present, and the link models: lockstep adaptive D and stalls, duo replica buffer, digests
//   with positive controls, the redundancy backlog through an outage, UDP blackhole -> relay -> P2P, a forced-relay 37 KB
//   state blob, 2x speed, and the slow-peer policy. Writes a JSON summary to $CARROT_NET_OUT when set.
// Usage: node scripts/test-carrot-net.mjs [--update-lock]
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { CHUNK_PURPOSE, FLAG, MAX_FRAME_BYTES, NET_VERSION, OP_CODE, TOWER_KINDS } from '../src/minigames/carrot/net/protocol.ts'
import { decodeFrame, encodeFrame, normalizeOp, opSize } from '../src/minigames/carrot/net/frames.ts'
import { DigestBook } from '../src/minigames/carrot/net/digests.ts'
import { parseNetOut } from '../src/minigames/carrot/net/bridge.ts'
import { percentile } from '../src/minigames/carrot/net/stats.ts'
import { pair, rng, lagSampler } from './carrot-net-sim.mjs'

const root = new URL('..', import.meta.url).pathname
let passed = 0
const summary = {}
/** Key-order independent JSON (typed arrays as plain arrays). */
const canon = v => JSON.stringify(v, (_k, x) => x instanceof Uint8Array ? [...x] : x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x)
const ok = (cond, msg) => { assert.ok(cond, msg); passed++; console.log('  ok', msg) }

console.log('protocol')
{
  const data = JSON.parse(readFileSync(root + 'public/assets/minigames/carrot/game-data.json', 'utf8'))
  ok(JSON.stringify(data.towers.map(t => t.id)) === JSON.stringify(TOWER_KINDS), 'TOWER_KINDS matches game-data.json towers order (wire towerIndex)')
  const sha = createHash('sha256').update(readFileSync(root + 'src/minigames/carrot/net/protocol.ts')).digest('hex')
  const lockFile = root + 'scripts/carrot-net-protocol.lock.json'
  if (process.argv.includes('--update-lock')) writeFileSync(lockFile, JSON.stringify({ netVersion: NET_VERSION, sha256: sha }, null, 1) + '\n')
  const lock = JSON.parse(readFileSync(lockFile, 'utf8'))
  ok(lock.sha256 === sha || lock.netVersion !== NET_VERSION, `protocol.ts unchanged for NET_VERSION ${NET_VERSION} (a change must bump NET_VERSION, then --update-lock)`)
  ok(lock.netVersion === NET_VERSION, 'the lock records the current NET_VERSION')
}

console.log('codec')
{
  const r = rng(12345)
  const int = n => Math.floor(r() * n)
  const ops = ['buy', 'upgrade', 'sell', 'merge', 'mergeUndo', 'next', 'speed', 'start', 'focus']
  const randOp = (seat) => {
    const op = ops[int(ops.length)]
    const o = { s: 1 + int(1e6), k: int(2e6), seat, op }
    if (op === 'buy') { o.pad = int(64); o.kind = TOWER_KINDS[int(20)] }
    if (op === 'upgrade' || op === 'sell') { o.id = int(5000); if (r() < 0.7) o.v = 1 + int(4) }
    if (op === 'merge') { o.id = int(5000); o.target = int(5000) }
    if (op === 'mergeUndo') o.id = int(5000)
    if (op === 'speed') o.v = 1 + int(2)
    if (op === 'focus') { const t = ['', 'enemy', 'blocker'][int(3)]; o.type = t; o.id = t ? int(9999) : -1 }
    return normalizeOp(o)
  }
  let errors = 0, maxBytes = 0, n = 0
  for (let i = 0; i < 100_000; i++) {
    const kind = 1 + int(6)
    let f
    const flags = int(16) & ~(FLAG.digest | FLAG.deep)
    if (kind === 1 || kind === 2) {
      const cmds = []; let budget = 1100
      for (let c = int(20); c > 0; c--) { const op = randOp(1); const sz = opSize(op); if (sz > budget) break; budget -= sz; cmds.push(op) }
      f = { kind, flags, seq: int(65536), exec: int(2e6), ack: int(1e6), cmds, ...(kind === 2 ? { commit: int(2e6) } : {}), ...(r() < 0.5 ? { digest: [int(2e6), int(2 ** 32), int(2 ** 32)] } : {}), ...(r() < 0.2 ? { deep: [int(2e6), int(2 ** 32)] } : {}) }
    } else if (kind === 3) f = { kind, flags, seq: int(65536), resyncId: int(2e6), tick: int(2e6), index: 0, count: 1 + int(40), purpose: 1 + int(3), bytes: new Uint8Array(int(1101)).map(() => int(256)) }
    else if (kind === 4) f = { kind, flags, seq: int(65536), id: int(2 ** 32), time: r() * 2e12 }
    else if (kind === 5) f = { kind, flags, seq: int(65536), id: int(2 ** 32), time: r() * 2e12, reply: r() * 2e12 }
    else f = { kind, flags, seq: int(65536), code: 1 + int(16), ...(r() < 0.8 ? { a: int(2e6) - 1e6 } : {}), ...(r() < 0.5 ? { b: int(1e5) } : {}), ...(r() < 0.3 ? { c: int(100) } : {}), ...(r() < 0.3 ? { f: r() * 2e12 } : {}) }
    if (kind === 3) f.index = int(f.count)
    const bytes = encodeFrame(f)
    if (bytes.length > maxBytes) maxBytes = bytes.length
    const back = decodeFrame(bytes, 1)
    const want = { ...f, flags: f.flags | (f.digest ? FLAG.digest : 0) | (f.deep ? FLAG.deep : 0) }
    if (!back || canon(back) !== canon(want)) { if (errors < 3) console.log('    mismatch', canon(want), '\n          ->', back && canon(back)); errors++ }
    n++
  }
  ok(errors === 0, `${n} random frames round-trip with 0 codec errors`)
  ok(maxBytes <= MAX_FRAME_BYTES, `every frame <= ${MAX_FRAME_BYTES} B (largest ${maxBytes})`)
  let threw = 0, accepted = 0
  for (let i = 0; i < 50_000; i++) {
    const b = new Uint8Array(int(60)).map(() => int(256))
    try { const f = decodeFrame(b, 0); if (f) accepted++ } catch { threw++ }
  }
  ok(threw === 0, `50k garbage buffers never throw (${accepted} happened to parse, all bounds-checked)`)
  const evil = encodeFrame({ kind: 1, flags: 0, seq: 1, exec: 1, ack: 0, cmds: [{ s: 1, k: 2, seat: 0, op: 'buy', pad: 3, kind: 'seed' }] })
  evil[evil.length - 1] = 250 // towerIndex out of range
  ok(decodeFrame(evil, 0) === null, 'an op with an out-of-range tower index is refused before it can reach C#')
  summary.codec = { frames: n, maxBytes }
}

console.log('digest book')
{
  const d = new DigestBook(8)
  ok(d.addRemote(30, [1, 2]) === null && d.addLocal(30, [1, 2]).ok, 'remote first (replica behind), then local: compared and equal')
  ok(d.addLocal(60, [1, 3]) === null && d.addRemote(60, [1, 4]).ok === false, 'a mismatch is reported')
  d.addLocal(90, [5, 5]); d.addRemote(120, [6, 6])
  ok(d.unverified === 1, 'a local digest whose partner copy was lost counts as unverified, not as a pass')
  for (let t = 150; t <= 600; t += 30) d.addRemote(t, [0, 0])
  ok(d.unverified > 1 && d.pendingRemote <= 8, 'an overflowing pending queue counts unverified digests')
}

console.log('bridge validation')
{
  const t = parseNetOut({ t: 'tick', exec: 30, d: [30, -1, -2147483648], rd: [27, 5, 6], hold: 1 })
  ok(t && t.d[1] === 4294967295 && t.d[2] === 2147483648 && t.hold === true, 'signed 32-bit digests from C# become unsigned; hold flag normalized')
  const own = parseNetOut({ t: 'own', exec: 9, ops: [{ s: 1, k: 10, seat: 0, op: 'buy', pad: 2, kind: 'seed', id: 0, target: 0, type: '', v: 0 }, { s: 2, k: 10, seat: 0, op: 'buy', pad: 2, kind: 'nope', id: 0, target: 0, type: '', v: 0 }] })
  ok(own.ops.length === 1 && own.ops[0].id === undefined && own.ops[0].pad === 2, 'C# NetOp JSON (all fields, defaults) normalizes; an unknown tower kind is dropped')
  ok(parseNetOut('{"t":"nope"}') === null && parseNetOut('not json') === null && parseNetOut({ t: 'result', outcome: 'maybe' }) === null, 'unknown or malformed messages are rejected')
  const golden = root + 'docs/carrot-defense/duo/bridge-golden.jsonl'
  if (existsSync(golden)) {
    const lines = readFileSync(golden, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
    const outs = lines.filter(l => l.dir === 'out' || l.dir === undefined)
    const parsed = outs.map(l => parseNetOut(l.msg ?? l))
    ok(parsed.every(Boolean), `golden bridge fixture: all ${outs.length} Unity -> JS messages parse`)
  } else console.log('  (no docs/carrot-defense/duo/bridge-golden.jsonl yet: the sim stream generates it with NetBridgeGolden)')
}

// ---------------------------------------------------------------- link models (virtual time)
const LINKS = { l30: { rtt: 30, jitter: 5, loss: 0.01 }, l60: { rtt: 60, jitter: 10, loss: 0.02 }, l150: { rtt: 150, jitter: 30, loss: 0.05 } }
async function lockstepRun(udp, p2p, seed, ms = 30_000, extra = {}) {
  const env = await pair({ mode: 'endless', udp, tcp: { ...udp, tcp: 'fast' }, p2p, ops: 2, seed, ...extra })
  await env.run(env.T0 + 10_000)
  const D10 = env.peers.map(p => p.match.ls.D)
  for (const p of env.peers) { p.stats.stallTimes = []; p.stats.stallDurations = [] }
  await env.run(env.T0 + ms)
  const ticks = env.peers[0].match.ls.E
  return {
    env, D10, ticks,
    stalls: env.peers.reduce((a, p) => a + p.stats.stallTimes.length, 0) / 2 * 20_000 / (ms - 10_000),
    // a stall that holds a tick back by a rendered frame (16.7 ms at 60 Hz) or more; shorter ones only move a tick within a frame
    bigStalls: env.peers.reduce((a, p) => a + p.stats.stallDurations.filter(x => x >= 1000 / 60).length, 0) / 2,
    mismatches: env.peers.reduce((a, p) => a + p.desyncs.length, 0),
    compared: Math.min(...env.peers.map(p => p.match.ls.digests.compared)),
    delay: env.peers[0].stats.inputDelayMs,
  }
}

console.log('lockstep: adaptive input delay over link models (10 seeds each)')
summary.lockstep = {}
for (const [name, udp, want] of [['30ms/+-5/1%', LINKS.l30, 3], ['60ms/+-10/2%', LINKS.l60, 4], ['150ms/+-30/5%', LINKS.l150, 6]]) {
  const rows = []
  for (let seed = 1; seed <= 10; seed++) rows.push(await lockstepRun(udp, true, seed))
  const D = rows.flatMap(r => r.D10), mode = [...new Set(D)].sort((a, b) => D.filter(x => x === b).length - D.filter(x => x === a).length)[0]
  const stalls = rows.map(r => r.stalls), big = rows.reduce((a, r) => a + r.bigStalls, 0)
  const mism = rows.reduce((a, r) => a + r.mismatches, 0), minCompared = Math.min(...rows.map(r => r.compared)), ticks = Math.min(...rows.map(r => r.ticks))
  summary.lockstep[name] = { D10: D, modeD: mode, stallsPer20s: stalls, framePlusStalls: big, mismatches: mism, minDigestsCompared: minCompared, ticks }
  ok(mode === want, `${name}: D settles on ${want} within 10 s (D at 10 s over 20 peers: ${D.join(' ')})`)
  // A frame-sized stall needs a lost frame plus jitter (or two losses in a row) at the minimum D: allow at most one per
  // 10 seeds x 20 s (<= 0.05 per 20 s per peer); the exact counts go to the summary.
  ok(big <= 1, `${name}: once settled, ${big} stalls of a frame or more over 10 seeds x 20 s; shorter (sub-frame) stalls per 20 s: ${stalls.map(x => x.toFixed(1)).join(',')}`)
  ok(mism === 0 && minCompared >= Math.floor(ticks / 30) - 2, `${name}: 0 digest mismatches, >= ${Math.floor(ticks / 30) - 2} digests compared per run (min ${minCompared})`)
}
{
  const rows = []
  for (let seed = 1; seed <= 5; seed++) rows.push(await lockstepRun(LINKS.l60, false, seed))
  const D = rows.flatMap(r => r.D10)
  summary.lockstep['relay 60ms/+-10/2% (TCP fast)'] = { D10: D, stallsPer20s: rows.map(r => r.stalls), framePlusStalls: rows.reduce((a, r) => a + r.bigStalls, 0), delayMs: rows.map(r => r.delay) }
  ok(rows.every(r => r.mismatches === 0), `relay 60 ms (10 Hz frames): 0 mismatches; D at 10 s ${D.join(' ')}; stalls/20 s ${rows.map(r => r.stalls.toFixed(1)).join(',')}`)
  const fixed = []
  for (const Dfix of [6, 8, 10]) { let st = 0; for (let seed = 1; seed <= 3; seed++) { const r = await lockstepRun(LINKS.l60, false, seed, 30_000, { D: Dfix, fixedD: true }); st += r.stalls / 3 } fixed.push([Dfix, +st.toFixed(1)]) }
  summary.lockstep['relay fixed D'] = fixed
  console.log('    relay 60 ms fixed-D stalls/20 s:', fixed.map(([d, s]) => `D=${d}: ${s}`).join(', '))
}
{
  const r = await lockstepRun(LINKS.l30, true, 4, 30_000, { speed: 2 })
  const D2 = r.env.peers[0].match.ls.D
  ok(D2 >= 5 && D2 <= 8 && r.mismatches === 0, `2x speed: D is wall time, so about twice the ticks (D=${D2} at 2x on 30 ms; 3 at 1x)`)
  summary.lockstep['2x 30ms'] = { D: D2, stalls: r.stalls }
}

console.log('lockstep: positive control and resync')
{
  const env = await pair({ mode: 'endless', udp: LINKS.l60, p2p: true, ops: 2, seed: 9 })
  await env.run(env.T0 + 6000)
  const tick = env.peers[1].match.ls.E
  env.peers[1].engine.send({ type: 'debugCoins', value: 3 })
  await env.run(env.T0 + 6000 + 3000)
  const det = env.peers.flatMap(p => p.desyncs)
  ok(det.length > 0 && det[0][1].tick - tick <= 31, `a one-coin perturbation on one peer is detected within 30 ticks (at tick ${det[0]?.[1].tick}, injected after ${tick})`)
  await env.run(env.T0 + 20_000)
  const a = env.peers[0].engine.stateOf('shared'), b = env.peers[1].engine.stateOf('shared')
  const after = env.peers.flatMap(p => p.desyncs).filter(([t]) => t > env.T0 + 12_000).length
  ok(after === 0 && Math.abs(a.tick - b.tick) < 20 && env.peers.some(p => p.events.some(([, e]) => e.type === 'resynced')), `the host's state resynced the guest; no mismatch afterwards (ticks ${a.tick}/${b.tick})`)
}

console.log('duo: replica buffer and digests')
summary.duo = {}
for (const [name, udp, p2p, B] of [['p2p 30ms', LINKS.l30, true, 3], ['p2p 60ms', LINKS.l60, true, 3], ['relay 60ms', LINKS.l60, false, 5]]) {
  const env = await pair({ mode: 'duo', udp, p2p, ops: 1, seed: 5 })
  const lag = lagSampler(env, env.T0 + 3000)
  for (let s = 1; s <= 250; s++) { await env.run(env.T0 + s * 100); lag.tick(env.world.t) }
  const xs = lag.xs, within = xs.filter(x => Math.abs(x - B) <= 1).length / xs.length
  const ticks = env.peers[0].engine.stateOf('own').tick
  const compared = Math.min(...env.peers.map(p => p.match.duo.digests.compared)), mism = env.peers.reduce((a, p) => a + p.desyncs.length, 0)
  summary.duo[name] = { lagP10: percentile(xs, 0.1), lagP50: percentile(xs, 0.5), lagP90: percentile(xs, 0.9), within1: +within.toFixed(3), compared, ticks, mismatches: mism }
  ok(percentile(xs, 0.5) === B && percentile(xs, 0.1) >= B - 1 && percentile(xs, 0.9) <= B + 1, `${name}: the replica holds ${B} +/- 1 ticks behind the partner's reported tick (p10/p50/p90 ${percentile(xs, 0.1)}/${percentile(xs, 0.5)}/${percentile(xs, 0.9)}, ${(within * 100).toFixed(0)}% of samples within 1)`)
  ok(mism === 0 && compared >= Math.floor((ticks - 60) / 30) - 2, `${name}: 0 replica mismatches, ${compared} digests compared over ${ticks} ticks`)
}
{
  const env = await pair({ mode: 'duo', udp: LINKS.l60, p2p: true, ops: 1, seed: 11 })
  await env.run(env.T0 + 5000)
  const tick = env.peers[0].engine.stateOf('own').tick
  env.peers[0].engine.send({ type: 'debugCoins', value: 1 })
  await env.run(env.T0 + 9000)
  const det = env.peers[1].desyncs
  ok(det.length > 0 && det[0][1].tick - tick <= 31, `duo positive control: a one-coin change on A's half is caught by B's replica within 30 ticks (tick ${det[0]?.[1].tick} after ${tick})`)
  await env.run(env.T0 + 16_000)
  const late = env.peers[1].desyncs.filter(([t]) => t > env.T0 + 10_000).length
  ok(late === 0 && env.peers[1].events.some(([, e]) => e.type === 'resynced') && env.peers[0].engine.stateOf('own').phase === env.peers[1].engine.stateOf('replica').phase, "B's replica reloaded A's state and matches again (A's own half untouched)")
}

console.log('transport: blackhole, relay, return; redundancy backlog through an outage')
{
  const env = await pair({ mode: 'duo', udp: { rtt: 40, jitter: 5, loss: 0 }, p2p: true, ops: 0, seed: 2 })
  await env.run(env.T0 + 4000)
  ok(env.peers.every(p => p.transport.path === 'p2p'), 'both peers on P2P')
  const cut = env.world.t
  env.state.udp = { ...env.state.udp, down: true }
  for (let i = 0; i < 20; i++) env.peers[0].engine.send({ type: 'buy', pad: i, kind: 'seed' })
  await env.run(cut + 3000)
  const toRelay = env.peers.map(p => (p.pathLog.find(([t, path]) => t > cut && path === 'relay') || [Infinity])[0] - cut)
  ok(toRelay.every(x => x <= 1000), `UDP blackhole: the relay takes over within 1 s (${toRelay.join(' / ')} ms)`)
  ok(env.peers[1].match.duo.partnerContig === env.peers[0].match.duo.ownLog.length && env.peers[0].match.duo.ownLog.length > 0, 'no op lost across the switch (all of A\'s ops reached B over the relay)')
  const back = env.world.t
  env.state.udp = { ...env.state.udp, down: false }
  await env.run(back + 4000)
  const toP2p = env.peers.map(p => (p.pathLog.find(([t, path]) => t > back && path === 'p2p') || [Infinity])[0] - back)
  ok(toP2p.every(x => x <= 3000), `P2P returns within 3 s of the link being restored (${toP2p.join(' / ')} ms)`)
  summary.blackhole = { toRelayMs: toRelay, toP2pMs: toP2p, restartIce: env.peers.map(p => p.restarts || 0) }
}
{
  const env = await pair({ mode: 'duo', udp: { rtt: 40, jitter: 5, loss: 0.01 }, p2p: true, ops: 0, seed: 3, waves: () => 50 })
  await env.run(env.T0 + 3000)
  env.state.udp = { ...env.state.udp, down: true }; env.state.tcp = { ...env.state.tcp, down: true }
  const out = env.world.t
  // 300 accepted ops while both paths are dead (builds, upgrades, then focus picks)
  env.peers[0].engine.stateOf('own').coins += 1e6
  for (let i = 0; i < 300; i++) env.world.at(out + 50 + i * 99, () => {
    const st = env.peers[0].engine.stateOf('own'), t = st.towers[i % Math.max(1, st.towers.length)]
    env.peers[0].engine.send(i < 30 ? { type: 'buy', pad: i, kind: TOWER_KINDS[i % 5] } : i < 60 && t && t.tier < 4 ? { type: 'upgrade', id: t.id, value: t.tier } : { type: 'select', selectionType: i % 2 ? 'enemy' : 'blocker', id: 1000 + i })
  })
  await env.run(out + 30_000)
  const queued = env.peers[0].match.duo.backlog
  env.maxFrame.bytes = 0
  env.state.udp = { ...env.state.udp, down: false }; env.state.tcp = { ...env.state.tcp, down: false }
  await env.run(out + 36_000)
  const a = env.peers[0].match.duo, b = env.peers[1].match.duo
  ok(queued >= 300, `30 s outage on both paths: ${queued} own ops queued`)
  ok(b.partnerContig === a.ownLog.length && env.maxFrame.bytes <= MAX_FRAME_BYTES, `every queued op arrived after the outage (${b.partnerContig}/${a.ownLog.length}); largest frame ${env.maxFrame.bytes} B`)
  summary.backlog = { queued, delivered: b.partnerContig, maxFrame: env.maxFrame.bytes }
}

console.log('blobs: forced-relay 37 KB state at 60 ms/+-10/2%')
{
  const env = await pair({ mode: 'duo', udp: LINKS.l60, p2p: false, ops: 0, seed: 4 })
  await env.run(env.T0 + 2000)
  const r = rng(77), raw = new Uint8Array(27_800).map(() => Math.floor(r() * 256))
  const b64 = Buffer.from(raw).toString('base64') // ~37 KB of incompressible state text
  const t0 = env.world.t
  let done = null
  void env.peers[0].match.sendBlob(CHUNK_PURPOSE.restore, { tick: 123, b64 }).then(v => { done = v })
  await env.run(t0 + 15_000)
  const got = env.peers[1].events.find(([, e]) => e.type === 'blob')
  ok(done === true && got && got[1].body.b64 === b64, `37 KB blob over the relay in ${got ? Math.round(got[0] - t0) : '?'} ms with chunk acks and retry`)
  summary.blob = { bytes: b64.length, ms: got ? Math.round(got[0] - t0) : null }
}

console.log('slow peer')
{
  const env = await pair({ mode: 'endless', udp: LINKS.l30, p2p: true, ops: 1, seed: 6, tickCost: [0, 0] })
  await env.run(env.T0 + 3000)
  env.peers[1].engine.o.maxLive = 1 // a phone that manages one tick per frame (60 Hz render -> fine) then...
  env.peers[1].engine.o.tickCostMs = 0
  let slowed = false
  const orig = env.peers[1].engine.frame.bind(env.peers[1].engine)
  let skip = 0
  env.peers[1].engine.frame = () => { if (++skip % 3 === 0) orig() } // ...renders only every third frame: 20 ticks/s
  await env.run(env.T0 + 15_000)
  slowed = env.peers.some(p => p.events.some(([, e]) => e.type === 'lockstep' && e.event.type === 'slowed'))
  const rate = env.peers[0].match.ls.rate
  ok(slowed && rate < 0.95, `a peer that cannot keep 30 ticks/s slows both clocks (rate ${rate.toFixed(2)}) instead of stuttering`)
  ok(env.peers.reduce((a, p) => a + p.desyncs.length, 0) === 0, 'still 0 mismatches while slowed')
}

if (process.env.CARROT_NET_OUT) writeFileSync(process.env.CARROT_NET_OUT, JSON.stringify(summary, null, 1))
console.log(`PASS ${passed} checks`)
void OP_CODE
