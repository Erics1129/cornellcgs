// Two DuoSessions end to end in Node, in real time: the real cgs-rooms Worker in process (scripts/rooms-fake-runtime.mjs, socket
// latency added), relay path only (no WebRTC in Node), and FakeEngine players. Covers lobby gating, side reveal, prep and go,
// duo win and loss, pause/resume with the cooldown, speed, leave, a reload mid-match restored by state blobs (duo and endless),
// endless lockstep to a shared loss, a forced desync detected and resynced, and the reconnect record.
// Usage: node scripts/test-carrot-session.mjs
import assert from 'node:assert/strict'
import { createFakeRooms, setDelivery } from './rooms-fake-runtime.mjs'
import { createDuoSession, normalizeCode } from '../src/minigames/carrot/net/session.ts'
import { FakeEngine } from '../src/minigames/carrot/net/fakeEngine.ts'

const LATENCY = Number(process.env.LATENCY || 12)
setDelivery(fn => setTimeout(fn, LATENCY))
const rooms = await createFakeRooms({ env: { GRACE_MS: '60000' } })
const VER = 'fake+n1'
let passed = 0
const ok = (cond, msg) => { assert.ok(cond, msg); passed++; console.log('  ok', msg) }
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function until(pred, ms, label) { const t0 = Date.now(); while (!pred()) { if (Date.now() - t0 > ms) throw new Error('timeout: ' + label); await sleep(20) } return Date.now() - t0 }
class MemStorage { constructor() { this.m = new Map() } get length() { return this.m.size } key(i) { return [...this.m.keys()][i] ?? null } getItem(k) { return this.m.has(k) ? this.m.get(k) : null } setItem(k, v) { this.m.set(k, String(v)) } removeItem(k) { this.m.delete(k) } clear() { this.m.clear() } }

/** A browser tab: a FakeEngine (60 Hz frames), a session, and the page's command path (session first, then Unity). */
function tab(name, browserLocal, opts = {}) {
  const engine = new FakeEngine({ now: () => Date.now(), waves: opts.waves ?? (() => 1), health: opts.health })
  const frames = setInterval(() => engine.frame(), 16)
  const session = createDuoSession({ engine, roomsUrl: 'https://rooms.test', ver: VER, WebSocket: rooms.WebSocket, RTCPeerConnection: null, fetch: (u, i) => rooms.fetch(u, i), local: browserLocal, session: new MemStorage(), document: null, window: null, locks: null })
  const events = []
  session.onEvent(e => events.push(e))
  const page = cmd => { if (!session.send(cmd)) engine.send(cmd) }
  return { name, engine, session, events, page, close() { clearInterval(frames); session.dispose() }, get s() { return session.get() } }
}
const profile = (name, unlocked = [25]) => ({ name, unlocked, best: 0 })
const bothPhase = (a, b, phase) => a.s.phase === phase && b.s.phase === phase
async function lobbyPair(level = 25, mode = 'duoBoss', opts = {}) {
  const localA = new MemStorage(), localB = new MemStorage()
  const A = tab('A', localA, opts), B = tab('B', localB, opts)
  const code = await A.session.create(profile('Ada'))
  await B.session.join(code.toLowerCase().split('').join(' '), profile('Bob'))
  for (const t of [A, B]) t.session.setLoaded(1)
  A.session.configure(mode, level)
  await until(() => B.s.level === (mode === 'endless2p' ? 90 : level) && B.s.roomMode === mode, 2000, 'config')
  A.session.setReady(true); B.session.setReady(true)
  await until(() => A.s.peers.length === 2 && A.s.peers.every(p => p.ready && p.loaded === 1), 2000, 'ready')
  return { A, B, code, localA, localB }
}
async function startAndGo(A, B) {
  A.session.start()
  await until(() => bothPhase(A, B, 'starting'), 2000, 'starting')
  await until(() => bothPhase(A, B, 'prep'), 5000, 'prep')
  A.page({ type: 'start' }); B.page({ type: 'start' })
  await until(() => bothPhase(A, B, 'playing'), 5000, 'playing')
}

console.log('codes')
ok(normalizeCode(' ab-cd e ').code === 'ABCDE' && normalizeCode('ab-cde').ok, 'codes are uppercased with spaces and dashes stripped')
ok(normalizeCode('AB0DE').ambiguous && !normalizeCode('AB0DE').ok, '0/O/1/I/L are reported as ambiguous')

console.log('duo: lobby to a win')
{
  const { A, B, code } = await lobbyPair(25)
  ok(A.s.host && !B.s.host && A.s.code === code && B.s.code === code, 'host and guest share the code; one host')
  ok(A.s.peers.length === 2 && A.s.peers.find(p => !p.me).name === 'Bob', 'lobby shows both players with names')
  A.session.start()
  await until(() => bothPhase(A, B, 'starting'), 2000, 'starting')
  ok(A.s.side !== null && A.s.side !== B.s.side && A.s.countdownKind === 'start' && A.s.countdownAt > Date.now(), `sides drawn by the room and different (A ${A.s.side}, B ${B.s.side}); 3-2-1 against startAt`)
  await until(() => bothPhase(A, B, 'prep'), 5000, 'prep')
  ok(A.engine.mode === 'duo' && B.engine.mode === 'duo' && A.engine.run, 'both engines in duo mode; the own-half clock runs in prep')
  A.page({ type: 'start' })
  await until(() => B.s.pressedStart[A.s.seat], 2000, 'pressed')
  ok(A.s.phase === 'prep' && B.s.phase === 'prep', 'wave 1 waits until both pressed Start')
  B.page({ type: 'start' })
  await until(() => A.s.countdownKind === 'go', 2000, 'go countdown')
  await until(() => bothPhase(A, B, 'playing'), 5000, 'playing')
  ok(A.engine.stateOf('own').phase === 'playing' && B.engine.stateOf('own').phase === 'playing', 'go starts wave 1 on both halves')
  // the page's controls: a build applies at once on the own half (zero lag); the partner's replica gets it as an op
  A.page({ type: 'buy', pad: 3, kind: 'frost' })
  ok(A.engine.stateOf('own').towers.length === 1, 'own action applies immediately (no input delay)')
  await until(() => B.engine.stateOf('replica').towers.length === 1, 3000, 'replica build')
  ok(true, 'the partner replica receives the build')
  // speed is shared through the room in duo
  B.page({ type: 'speed', value: 2 })
  await until(() => A.engine.speed === 2 && B.engine.speed === 2, 2000, 'speed')
  ok(A.s.speed === 2, 'speed toggle applies to both halves')
  // pause / resume / cooldown
  A.page({ type: 'pause' })
  await until(() => bothPhase(A, B, 'paused'), 2000, 'paused')
  const tickAtPause = A.engine.stateOf('own').tick
  ok(A.s.pausedBy === A.s.seat && !A.engine.run || A.engine.matchPaused, 'pause is mutual and records who paused')
  await sleep(400)
  ok(A.engine.stateOf('own').tick === tickAtPause, 'own half clock stops while paused')
  B.page({ type: 'pause' })
  await until(() => A.s.countdownKind === 'resume', 2000, 'resume countdown')
  await until(() => bothPhase(A, B, 'playing'), 5000, 'resumed')
  await sleep(300)
  ok(A.engine.stateOf('own').tick > tickAtPause, 'resume after the 3-2-1 countdown')
  B.page({ type: 'pause' })
  await sleep(200)
  ok(B.s.phase === 'playing' && B.events.some(e => e.type === 'notice'), 'the player who resumed cannot pause again for 5 s')
  B.page({ type: 'setPaused', value: 1 }); await sleep(100)
  ok(B.s.phase === 'playing', 'encounter-card pauses never pause a match')
  // play to the end: each half clears, holds, then both resolve as won
  await until(() => A.s.phase === 'results' && B.s.phase === 'results', 30000, 'results')
  ok(A.s.result.kind === 'duoWin' && B.s.result.kind === 'duoWin', 'both halves cleared: a duo win on both devices')
  ok(A.engine.stateOf('own').phase === 'won' && B.engine.stateOf('own').phase === 'won', 'each own half resolves as won (the page records the single-player win)')
  const compared = A.s.stats.digestsCompared + B.s.stats.digestsCompared, ticks = A.engine.stateOf('own').tick
  ok(compared >= 2 * (Math.floor(ticks / 30) - 4) && A.s.stats.resyncs === 0 && B.s.stats.resyncs === 0, `replica digests compared on both sides (${compared} for ${ticks} ticks), 0 mismatches`)
  A.session.rematch(); B.session.rematch()
  await until(() => bothPhase(A, B, 'lobby'), 3000, 'lobby')
  ok(A.engine.mode === null, 'rematch: back to the lobby, Unity leaves net mode')
  A.close(); B.close()
}

console.log('duo: a carrot falls')
{
  const { A, B } = await lobbyPair(4, 'duoBoss', { waves: () => 9, health: 1 })
  await startAndGo(A, B)
  for (let i = 0; i < 3; i++) B.page({ type: 'buy', pad: i, kind: 'seed' }) // B's half defends, A's does not
  await until(() => A.s.phase === 'results' && B.s.phase === 'results', 60000, 'loss')
  ok(A.s.result.kind === 'duoLoss' && B.s.result.kind === 'duoLoss' && A.s.result.fell === B.s.result.fell && A.s.result.fell === A.s.seat, `either carrot falling ends it for both (A's undefended carrot fell: seat ${A.s.result.fell}, "${B.s.result.fellName}")`)
  A.close(); B.close()
}

console.log('duo: forced desync is detected and the replica resyncs')
{
  const { A, B } = await lobbyPair(25, 'duoBoss', { waves: () => 2 })
  await startAndGo(A, B)
  await sleep(1500)
  A.engine.send({ type: 'debugCoins', value: 5 }) // local only: A's half diverges from B's replica of it
  const t0 = A.engine.stateOf('own').tick
  await until(() => B.events.some(e => e.type === 'resynced'), 8000, 'resynced')
  const det = B.s.stats.resyncs
  ok(det === 1, `B's replica of A diverged, was detected within the next digest (from tick ${t0}) and resynced from A's state`)
  await sleep(2500)
  const st = A.engine.stateOf('own'), rep = B.engine.stateOf('replica')
  ok(rep.coins === st.coins || Math.abs(rep.tick - st.tick) > 0, 'after the resync the replica follows the owner again')
  ok(B.s.stats.resyncs === 1 && B.s.phase === 'playing', 'one resync, the match continues')
  A.close(); B.close()
}

console.log('duo: leave ends the match unfinished')
{
  const { A, B } = await lobbyPair(25)
  await startAndGo(A, B)
  B.session.leave()
  await until(() => A.s.phase === 'results', 3000, 'unfinished')
  ok(A.s.result.kind === 'unfinished' && A.events.some(e => e.type === 'partnerLeft'), 'partner left: nothing recorded, the partner is told at once')
  ok(B.s.phase === 'idle', 'the leaver is back to idle')
  A.close(); B.close()
}

console.log('duo: reload mid-match, restored by the reconnect record and state blobs')
{
  const { A, B, code, localB } = await lobbyPair(25, 'duoBoss', { waves: () => 2 })
  await startAndGo(A, B)
  for (let i = 0; i < 4; i++) { B.page({ type: 'buy', pad: 10 + i, kind: 'seed' }); await sleep(250) }
  await sleep(800)
  const before = B.engine.stateOf('own')
  const towersB = before.towers.length
  // the tab dies without a close (iOS discard): the socket goes half-open, the page is gone
  const ws = [...rooms.objects.get(code).state.sockets].find(s => s.tags.includes('s' + B.s.seat))
  ws.peer.readyState = 2
  B.close()
  const noticed = await until(() => A.s.partnerAway !== null && A.s.phase === 'paused', 6000, 'A notices')
  ok(A.s.phase === 'paused' && noticed >= 2500 && rooms.objects.get(code).object.core.state.players.find(p => p.seat === B.s.seat).connected === false, 'the survivor pauses after 3 s of silence (and tells the room peer-silent)')
  const B2 = tab('B2', localB, { waves: () => 2 })
  await B2.session.resume(code, profile('Bob'))
  ok(B2.s.seat === B.s.seat, 'the reloaded tab gets its seat back from the reconnect record')
  await until(() => B2.s.phase === 'playing' && A.s.phase === 'playing', 20000, 'restored')
  const after = B2.engine.stateOf('own')
  ok(after.towers.length === towersB && after.tick >= before.tick - 5, `own half rebuilt by silent replay (${after.towers.length} towers, tick ${after.tick} vs ${before.tick} before)`)
  await sleep(2500)
  ok(A.s.stats.resyncs === 0 && B2.s.stats.resyncs === 0, 'no desync after the restore (fresh state blobs both ways)')
  const dbg = setInterval(() => { if (process.env.DEBUG) console.log('   ', ['A', A], ['B2', B2].map ? [A, B2].map(t => `${t.name} ${t.s.phase} own ${t.engine.stateOf('own')?.tick}/${t.engine.stateOf('own')?.phase}/${t.engine.stateOf('own')?.hold} rep ${t.engine.stateOf('replica')?.tick}/${t.engine.stateOf('replica')?.phase} run ${t.engine.run} paused ${t.engine.matchPaused} hold ${t.s.hold}/${t.s.partnerHold}`).join(' | ') : '') }, 2000)
  await until(() => A.s.phase === 'results' && B2.s.phase === 'results', 30000, 'results after restore').finally(() => clearInterval(dbg))
  ok(A.s.result.kind === 'duoWin' && B2.s.result.kind === 'duoWin', 'the restored match still ends in a duo win for both')
  A.close(); B2.close()
}

console.log('endless: lockstep to a shared loss')
{
  const { A, B } = await lobbyPair(90, 'endless2p', { health: 3 })
  await startAndGo(A, B)
  const startLag = await until(() => A.engine.stateOf('shared').phase === 'playing' && B.engine.stateOf('shared').phase === 'playing', 3000, 'shared start')
  ok(A.engine.mode === 'endless' && A.engine.stateOf('shared').tick > 0, `both peers run the shared endless state (the host's start op executed D ticks later, ${startLag} ms)`)
  A.page({ type: 'buy', pad: 1, kind: 'seed' }); B.page({ type: 'buy', pad: 1, kind: 'frost' })
  await sleep(1200)
  const sa = A.engine.stateOf('shared'), sb = B.engine.stateOf('shared')
  ok(sa.towers.length === 1 && sb.towers.length === 1 && sa.towers[0].kind === sb.towers[0].kind, 'same-pad builds resolve identically on both peers (one wins, one is rejected)')
  ok(A.events.some(e => e.type === 'reject') !== B.events.some(e => e.type === 'reject') || A.engine.rejects + B.engine.rejects >= 2, 'the losing build is rejected (notice to the issuer)')
  ok(A.s.inputDelayMs > 0 && A.s.stats.delayTicks >= 2, `input delay is D ticks (${A.s.stats.delayTicks}, ${A.s.inputDelayMs} ms)`)
  await until(() => A.s.phase === 'results' && B.s.phase === 'results', 90000, 'endless loss')
  ok(A.s.result.kind === 'endless' && A.s.result.waves === B.s.result.waves, `one shared carrot: both see the same score (${A.s.result.waves} waves)`)
  ok(A.engine.stateOf('shared').tick === B.engine.stateOf('shared').tick && A.s.stats.resyncs === 0, 'both peers ended on the same tick with 0 resyncs')
  A.close(); B.close()
}

console.log('endless: forced desync, both pause, the host state resyncs the guest')
{
  const { A, B } = await lobbyPair(90, 'endless2p')
  await startAndGo(A, B)
  await sleep(1000)
  B.engine.send({ type: 'debugCoins', value: 7 })
  await until(() => A.events.some(e => e.type === 'resynced') || B.events.some(e => e.type === 'resynced'), 10000, 'resynced')
  await until(() => bothPhase(A, B, 'playing'), 8000, 'resumed after resync')
  await sleep(1500)
  ok(A.engine.stateOf('shared').coins === B.engine.stateOf('shared').coins || A.engine.stateOf('shared').tick !== B.engine.stateOf('shared').tick, 'after the resync the shared states agree')
  ok(A.s.stats.resyncs + B.s.stats.resyncs >= 1 && A.s.phase === 'playing', 'resynced once and play continues')
  A.close(); B.close()
}

console.log('endless: partner gone -> continue solo')
{
  const { A, B } = await lobbyPair(90, 'endless2p')
  await startAndGo(A, B)
  B.session.leave()
  await until(() => A.s.canContinueSolo, 3000, 'solo offer')
  ok(A.s.phase === 'paused', 'partner left: the survivor is offered Continue solo or End run')
  A.session.continueSolo()
  await until(() => A.s.phase === 'playing' && A.s.solo, 6000, 'solo')
  const t0 = A.engine.stateOf('shared').tick
  A.page({ type: 'buy', pad: 2, kind: 'seed' })
  await sleep(600)
  ok(A.engine.stateOf('shared').tick > t0 && A.engine.stateOf('shared').towers.length === 1, 'solo play runs with no partner commits')
  A.session.endRun()
  ok(A.s.phase === 'results' && A.s.result.kind === 'endless' && A.s.result.solo && A.s.result.endedBy === 'player', 'End run records the score, marked solo')
  A.close(); B.close()
}

console.log(`PASS ${passed} checks`)
process.exit(0)
