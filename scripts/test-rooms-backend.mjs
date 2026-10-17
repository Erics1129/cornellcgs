// cgs-rooms in process: backend/rooms/worker.ts + room-core.ts on a fake Workers runtime (scripts/rooms-fake-runtime.mjs), with a
// controllable clock for the grace, empty-room and TTL alarms. Ports the 23 reference checks of the netcode probe (rooms-ref) and
// adds profile, config whitelist, caps, alarm cleanup, TTL, rejoin over a half-open socket, peer-silent, host promotion, go
// stamping, pause/resume/speed serialization, results, version-mismatch detail and the quota error paths.
// Usage: node scripts/test-rooms-backend.mjs
import assert from 'node:assert/strict'
import { createFakeRooms } from './rooms-fake-runtime.mjs'

let clock = 1_790_000_000_000
const realNow = Date.now
Date.now = () => clock
const VER = 'test1+n1'
const rooms = await createFakeRooms({ env: { GRACE_MS: '60000' } })
let passed = 0
const ok = (cond, msg) => { assert.ok(cond, msg); passed++; console.log('  ok', msg) }
const flush = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)) }
const post = async (body, origin) => { const r = await rooms.fetch('/rooms', { method: 'POST', headers: { 'content-type': 'application/json', ...(origin !== undefined ? { Origin: origin } : {}) }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null), headers: r.headers } }
const peek = async (code, q = '', origin) => { const r = await rooms.fetch(`/rooms/${code}${q}`, origin !== undefined ? { headers: { Origin: origin } } : {}); return { status: r.status, body: await r.json() } }

function join(code, pid, { ver = VER, name = pid } = {}) {
  return new Promise(resolve => {
    const ws = new rooms.WebSocket(`wss://rooms.test/rooms/${code}/ws?pid=${pid}&name=${encodeURIComponent(name)}&ver=${encodeURIComponent(ver)}`)
    ws.binaryType = 'arraybuffer'
    ws.inbox = []; ws.closed = null
    ws.onmessage = ev => { const v = typeof ev.data === 'string' ? (ev.data === 'pong' ? 'pong' : JSON.parse(ev.data)) : new Uint8Array(ev.data); ws.inbox.push(v); if (v.t === 'welcome' || v.t === 'error') resolve(ws) }
    ws.onclose = ev => { ws.closed = ev; resolve(ws) }
    ws.json = o => ws.send(JSON.stringify(o))
  })
}
const take = (ws, pred) => { const i = ws.inbox.findIndex(pred); if (i < 0) return null; return ws.inbox.splice(i, 1)[0] }
const wait = async (ws, pred, label = 'message') => { for (let i = 0; i < 50; i++) { const m = take(ws, pred); if (m) return m; await flush(2) } throw new Error('timeout waiting for ' + label) }
const none = async (ws, pred) => { await flush(); return !ws.inbox.some(pred) }
const welcome = ws => ws.inbox.find(m => m.t === 'welcome')
const ready = async (A, B) => { A.json({ t: 'ready', on: true }); B.json({ t: 'ready', on: true }); await flush() }
const startMatch = async (A, B) => { await ready(A, B); A.json({ t: 'start' }); const sa = await wait(A, m => m.t === 'start', 'start'), sb = await wait(B, m => m.t === 'start', 'start'); return [sa, sb] }

console.log('create / peek / origin / CORS')
ok((await post({})).status === 400, 'create without a version is refused')
ok((await post({ ver: VER }, 'https://evil.example')).status === 403, 'foreign origin refused')
const pre = await rooms.fetch('/rooms', { method: 'OPTIONS', headers: { Origin: 'https://cornellcgs.org', 'Access-Control-Request-Method': 'POST' } })
ok(pre.status === 204 && pre.headers.get('access-control-allow-origin') === 'https://cornellcgs.org' && /POST/.test(pre.headers.get('access-control-allow-methods')), 'CORS preflight answers POST from the site')
const created = await post({ ver: VER }, 'https://cornellcgs.org')
const code = created.body.code
ok(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/.test(code) && created.headers.get('access-control-allow-origin') === 'https://cornellcgs.org', 'code is 5 unambiguous symbols with CORS: ' + code)
ok((await peek(code)).body.exists === true, 'peek sees the room')
ok((await peek('22222')).body.exists === false, 'unknown code does not exist')
ok((await peek(code.toLowerCase())).status === 200, 'lowercase code accepted')
ok((await peek('ABC0O')).status === 400, 'a code with ambiguous symbols is refused as bad-code')
ok((await peek('22222', `?ver=${encodeURIComponent(VER)}&pid=probe-0000000`)).status === 404, 'peek with ver: unknown room is HTTP 404 room-not-found (readable by fetch)')
ok((await (await rooms.fetch('/turn')).json()).iceServers.length === 0, '/turn without a TURN key returns no servers (clients use the relay)')

console.log('join / lobby / profile / config')
const A = await join(code, 'host-aaaaaaaa', { name: 'Ada' })
ok(welcome(A).seat === 0 && welcome(A).host === true && welcome(A).match === null, 'host gets seat 0 and the host role')
ok(rooms.objects.get(code).state.autoResponse?.request === 'ping' && rooms.objects.get(code).state.autoResponse?.response === 'pong', 'room registers the ping/pong auto-response (free keep-alive)')
const old = await join(code, 'old-version-x', { ver: 'test0+n0' })
const vm = old.inbox.find(m => m.t === 'error')
ok(vm && vm.code === 'version-mismatch' && vm.detail === 'you' && old.closed?.code === 4426, 'version mismatch: error message, detail "you" (older net version), close 4426')
ok((await peek(code, `?ver=test0%2Bn0&pid=old-version-x`)).status === 409, 'version mismatch is HTTP 409 on the fetch pre-check')
const newer = await join(code, 'new-version-x', { ver: 'test2+n2' })
ok(newer.inbox.find(m => m.t === 'error')?.detail === 'room', 'a newer joiner is told the room is the older one')
const B = await join(code, 'guest-bbbbbbbb', { name: 'Bo\u0007b‮' })
ok(welcome(B).seat === 1 && welcome(B).host === false, 'guest gets seat 1')
ok(welcome(B).room.players[1].name === 'Bob', 'names are cleaned of control and bidi characters')
const C = await join(code, 'third-cccccccc')
ok(C.inbox.find(m => m.t === 'error')?.code === 'room-full' && C.closed?.code === 4409, 'third player refused: error room-full, close 4409')
ok((await peek(code, `?ver=${encodeURIComponent(VER)}&pid=third-cccccccc`)).status === 409 && (await peek(code, `?ver=${encodeURIComponent(VER)}&pid=third-cccccccc`)).body.error === 'room-full', 'room-full is HTTP 409 on the fetch pre-check')
ok((await peek(code, `?ver=${encodeURIComponent(VER)}&pid=guest-bbbbbbbb`)).status === 200, 'pre-check for a seated pid says joinable')
A.json({ t: 'profile', name: '  Ada   Lovelace  that is far too long a name ', unlocked: [1, 2, 4, 4, 300, -1, 'x', 25], best: 17 })
const prof = await wait(B, m => m.t === 'room' && m.room.players[0].best === 17, 'profile')
ok(prof.room.players[0].name === 'Ada Lovelace that is far' && prof.room.players[0].unlocked.join() === '1,2,4,25', 'profile: name trimmed to 24, unlocked deduped and bounded')
A.json({ t: 'config', mode: 'endless2p', level: 90 })
const cfg = await wait(B, m => m.t === 'room' && m.room.mode === 'endless2p', 'config')
ok(cfg.room.level === 90, 'host config reaches guest')
A.json({ t: 'config', mode: 'duoBoss', level: 5 })
ok((await wait(A, m => m.t === 'error')).code === 'bad-config', 'config whitelist: level 5 is not a duo boss fight')
A.json({ t: 'config', mode: 'endless2p', level: 4 })
ok((await wait(A, m => m.t === 'error')).code === 'bad-config', 'config whitelist: endless is level 90 only')
B.json({ t: 'config', mode: 'duoBoss', level: 8 })
ok((await wait(B, m => m.t === 'error')).code === 'not-host', 'guest cannot change config (not-host)')
A.json({ t: 'config', mode: 'duoBoss', level: 25, union: true })
const u = await wait(B, m => m.t === 'room' && m.room.level === 25, 'union')
ok(u.room.union === true && u.room.players.every(p => !p.ready), 'union toggle travels with the config; a config change clears ready')
A.json({ t: 'start' }); ok((await wait(A, m => m.t === 'error')).code === 'not-ready', 'start refused until both ready')
await ready(A, B)
A.json({ t: 'start' }); ok((await wait(A, m => m.t === 'error')).code === 'not-ready', 'start refused until both have loaded the game')
A.json({ t: 'status', loaded: 1 }); B.json({ t: 'status', loaded: 0.5 }); await flush()
A.json({ t: 'start' }); ok((await wait(A, m => m.t === 'error')).code === 'not-ready', 'start refused while one player is still loading')
B.json({ t: 'status', loaded: 1 }); await flush()
B.json({ t: 'start' }); ok((await wait(B, m => m.t === 'error')).code === 'not-host', 'only the host can start')

console.log('signalling + relay + clock')
A.json({ t: 'signal', data: { sdp: 'x' } }); ok((await wait(B, m => m.t === 'signal')).data.sdp === 'x', 'signal relayed host -> guest')
A.send(new Uint8Array([1, 0, 7, 0, 3, 0, 0]).buffer); const bin = await wait(B, m => m instanceof Uint8Array)
ok(bin[0] === 1 && bin.length === 7 && bin[2] === 7, 'binary frame relayed unchanged')
A.json({ t: 'time', c: 12345 }); const tm = await wait(A, m => m.t === 'time'); ok(tm.c === 12345 && tm.s === clock, 'server time sample')
A.send('ping'); ok((await wait(A, m => m === 'pong')) === 'pong', 'keep-alive ping answered by the runtime auto-response')

console.log('caps')
const before = rooms.objects.get(code).object.core.state.counters.dropped
A.send('x'.repeat(5000)); A.send(new Uint8Array(1300).buffer); await flush()
ok(rooms.objects.get(code).object.core.state.counters.dropped === before + 2 && await none(B, m => m instanceof Uint8Array), 'a 5 KB text message and a 1300 B binary frame are dropped and counted')
clock += 1000
for (let i = 0; i < 70; i++) A.send(new Uint8Array([1, 0, i, 0, 0, 0, 0]).buffer)
await flush(10)
ok(B.inbox.filter(m => m instanceof Uint8Array).length === 64, 'binary relay capped at 64 frames per second per socket (6 dropped)')
B.inbox = B.inbox.filter(m => !(m instanceof Uint8Array))
for (let i = 0; i < 40; i++) A.send(new Uint8Array(1100).fill(3).buffer)
await flush(10)
const chunks = B.inbox.filter(m => m instanceof Uint8Array).length
ok(chunks === 29, `state chunks have their own 32 KB/s budget outside the frame cap (${chunks} of 40 x 1100 B passed)`)
B.inbox = B.inbox.filter(m => !(m instanceof Uint8Array))
clock += 1000

console.log('start + side draw + go')
const sides = [0, 0]
for (let i = 0; i < 12; i++) {
  const [sa, sb] = await startMatch(A, B)
  assert.deepEqual(sa.sides, sb.sides); assert.equal(sa.seed, sb.seed); assert.equal(sa.startAt, clock + 3000)
  sides[sa.sides[0]]++
  A.json({ t: 'result', outcome: 'lost', tick: 100 }); const r = await wait(B, m => m.t === 'result')
  assert.equal(r.final, true)
  await wait(A, m => m.t === 'room' && m.room.phase === 'lobby')
}
ok(sides[0] > 0 && sides[1] > 0, `side draw is random over 12 starts (host half 0: ${sides[0]}, half 1: ${sides[1]})`)
const [st] = await startMatch(A, B)
ok(st.match === 13 && st.startAt - st.now === 3000, 'start stamps startAt = now + 3 s and counts matches')
A.json({ t: 'startReady' }); ok(await none(B, m => m.t === 'go'), 'go waits for both players to press Start')
B.json({ t: 'startReady' }); const go = await wait(A, m => m.t === 'go')
ok(go.goAt === Math.max(clock, st.startAt) + 1500, 'go stamped at max(now, startAt) + 1.5 s once both pressed Start')
const D = await join(code, 'stranger-dddddddd')
ok(D.inbox.find(m => m.t === 'error')?.code === 'in-progress' || D.inbox.find(m => m.t === 'error')?.code === 'room-full', 'a stranger cannot take a seat mid-match')

console.log('pause / resume / speed')
A.json({ t: 'pause', on: true, reason: 'manual' }); const pz = await wait(B, m => m.t === 'pause')
ok(pz.on === true && pz.by === 0 && pz.reason === 'manual', 'pause serialized by the room and broadcast with who paused')
B.json({ t: 'pause', on: true, reason: 'manual' }); ok((await wait(B, m => m.t === 'pause')).by === 0, 'a second pause while paused is a no-op that reports the current pause')
B.json({ t: 'pause', on: false, reason: 'manual' }); const rs = await wait(A, m => m.t === 'pause' && !m.on)
ok(rs.at === clock + 3000 && rs.by === 1, 'either player resumes; the room stamps resumeAt = now + 3 s')
B.json({ t: 'pause', on: true, reason: 'manual' }); ok((await wait(B, m => m.t === 'error')).code === 'pause-cooldown', 'the resumer cannot pause again for 5 s (cooldown)')
B.json({ t: 'pause', on: true, reason: 'away' }); A.inbox = []
ok((await wait(A, m => m.t === 'pause' && m.on)).reason === 'away', 'away pauses are exempt from the cooldown')
B.json({ t: 'pause', on: false, reason: 'away' }); await wait(A, m => m.t === 'pause' && !m.on)
A.json({ t: 'speed', v: 2 }); ok((await wait(B, m => m.t === 'speed')).v === 2, 'speed is shared through the room')

console.log('results')
A.json({ t: 'result', outcome: 'cleared', tick: 5000, health: 7 }); const cl = await wait(B, m => m.t === 'result')
ok(cl.outcome === 'cleared' && cl.final === false && cl.health === 7, 'a cleared half is relayed and is not final')
B.json({ t: 'result', outcome: 'won', tick: 5200, health: 9 }); const wn = await wait(A, m => m.t === 'result' && m.outcome === 'won')
ok(wn.final && (await wait(A, m => m.t === 'room' && m.room.phase === 'lobby')).room.players.every(p => !p.ready), 'a final result returns the room to the lobby with ready cleared')

console.log('reconnect within grace keeps the seat and the match')
const [st2] = await startMatch(A, B)
B.close(1006); const away = await wait(A, m => m.t === 'peer' && m.state === 'away')
ok(away.seat === 1 && away.graceMs === 60000, 'host told guest is away (grace 60 s)')
clock += 20_000
const B2 = await join(code, 'guest-bbbbbbbb')
const w2 = welcome(B2)
ok(w2.seat === 1 && w2.match && w2.match.seed === st2.seed && w2.match.sides.join() === st2.sides.join(), 'rejoin restores seat, seed and sides')
ok(!!(await wait(A, m => m.t === 'peer' && m.state === 'back')), 'partner told the guest is back')
// iOS: the old socket goes half-open (no close ever reaches the room); a same-pid rejoin must replace it, not get room-full
B2.vanish()
const B3 = await join(code, 'guest-bbbbbbbb')
ok(welcome(B3)?.seat === 1 && rooms.objects.get(code).state.getWebSockets('s1').length === 1, 'a same-pid rejoin over a half-open socket replaces it (no 409)')

console.log('peer-silent: grace without a close')
B3.vanish()
A.json({ t: 'peer-silent' }); const ps = await wait(A, m => m.t === 'peer' && m.state === 'away')
ok(ps.seat === 1 && rooms.objects.get(code).state.storage.alarmAt === clock + 60000, 'peer-silent marks the half-open partner away and arms the grace alarm')
clock += 30_000; await rooms.runAlarm(code)
ok(await none(A, m => m.t === 'peer' && m.state === 'gone'), 'no removal before the grace ends')
clock += 30_000; await rooms.runAlarm(code)
const gone = await wait(A, m => m.t === 'peer' && m.state === 'gone')
ok(gone.seat === 1 && (await wait(A, m => m.t === 'room')).room.phase === 'lobby', 'guest removed after the grace; the match ends')

console.log('host promotion')
const E = await join(code, 'guest2-eeeeeeee')
ok(welcome(E).seat === 1, 'a new player takes the free seat in the lobby')
A.json({ t: 'leave' }); await flush()
const promo = await wait(E, m => m.t === 'room' && m.room.players.length === 1)
ok(promo.room.host === 1, 'the host leaving promotes the remaining player to host')
E.json({ t: 'config', mode: 'duoBoss', level: 29 }); ok((await wait(E, m => m.t === 'room' && m.room.level === 29)).room.level === 29, 'the promoted host can configure')
E.json({ t: 'leave' }); await flush()
ok((await peek(code)).body.exists === false && rooms.objects.get(code).state.storage.map.size === 0, 'last player leaving closes the room and deletes its storage')

console.log('alarm cleanup and TTL')
const empty = (await post({ ver: VER })).body.code
clock += 9 * 60_000; await rooms.runAlarm(empty)
ok((await peek(empty)).body.exists === true, 'an empty new room survives 9 minutes')
clock += 10 * 60_000; await rooms.runAlarm(empty)
ok((await peek(empty)).body.exists === false && rooms.objects.get(empty).state.storage.map.size === 0, 'an abandoned room deletes itself after 10 minutes empty')
const ttl = (await post({ ver: VER })).body.code
const T1 = await join(ttl, 'ttl-aaaaaaaa'), T2 = await join(ttl, 'ttl-bbbbbbbb')
clock += 3 * 3600_000; await rooms.runAlarm(ttl); await flush()
ok(T1.closed?.code === 4002 && T2.closed?.code === 4002 && (await peek(ttl)).body.exists === false, 'the 3 h TTL closes the sockets (4002) and deletes the room')

console.log('hibernation, counters and quota errors')
const hib = (await post({ ver: VER })).body.code
const H1 = await join(hib, 'hib-aaaaaaaa'), H2 = await join(hib, 'hib-bbbbbbbb')
await rooms.hibernate(hib)
H1.json({ t: 'signal', data: 1 }); ok((await wait(H2, m => m.t === 'signal')).from === 0, 'after a rebuild (hibernation) the room still knows both seats')
H1.send(new Uint8Array([2, 0, 0, 0, 0, 0, 0, 0]).buffer); await wait(H2, m => m instanceof Uint8Array)
const stats = (await peek(hib, '?stats')).body.stats
ok(stats.connects === 2 && stats.binIn === 1 && stats.billed >= 3, `server counters count connects, messages and billed requests (${JSON.stringify({ c: stats.connects, t: stats.textIn, b: stats.binIn, billed: stats.billed })})`)
rooms.failing.on = true
ok((await post({ ver: VER })).status === 429 && (await post({ ver: VER })).body.error === 'busy', 'a Durable Object quota error answers 429 busy on create')
const Q = await join(hib, 'quota-qqqqqqqq')
ok(Q.inbox.find(m => m.t === 'error')?.code === 'busy' && Q.closed?.code === 4429, 'a quota error on join: error busy, close 4429')
rooms.failing.on = false
const evil = await new Promise(resolve => { const ws = new rooms.WebSocket(`wss://rooms.test/rooms/${hib}/ws?pid=evil-eeeeeeee&ver=${encodeURIComponent(VER)}`, undefined, { origin: 'https://evil.example' }); const box = []; ws.onmessage = ev => box.push(JSON.parse(ev.data)); ws.onclose = ev => resolve({ box, ev }) })
ok(evil.box[0]?.code === 'origin' && evil.ev.code === 4403, 'a socket from a foreign origin is told why (error origin, close 4403)')
Date.now = realNow
console.log(`PASS ${passed} checks`)
process.exit(0)
