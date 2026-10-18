// Virtual-time link-model harness for the Carrot net layer: two peers, each a FakeEngine + Transport + NetMatch (the real
// controllers and transport from src/minigames/carrot/net), joined by seeded UDP (DataChannel 'u'/'r') and TCP (relay) link
// models with delay, jitter, loss and blackholes. Used by test-carrot-net.mjs; also runnable on its own for tables:
//   node scripts/carrot-net-sim.mjs table
import { FakeEngine } from '../src/minigames/carrot/net/fakeEngine.ts'
import { Transport } from '../src/minigames/carrot/net/transport.ts'
import { NetMatch } from '../src/minigames/carrot/net/match.ts'
import { NetStatsTracker, percentile } from '../src/minigames/carrot/net/stats.ts'
import { ServerClock } from '../src/minigames/carrot/net/clock.ts'
import { initialDelay } from '../src/minigames/carrot/net/lockstep.ts'
import { MAX_FRAME_BYTES, TOWER_KINDS } from '../src/minigames/carrot/net/protocol.ts'

export function rng(seed) { let x = (seed >>> 0) || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296 } }

/** A one-way link: FIFO delivery after rtt/2 +/- jitter; UDP drops with p=loss; TCP holds a 'lost' segment for an RTO. */
export function link(world, model, kind) {
  let last = 0
  return {
    model,
    send(fn) {
      const m = model()
      if (m.down) return
      let extra = 0
      if (kind === 'udp' && world.rand() < m.loss) return
      if (kind === 'tcp' && world.rand() < m.loss) extra = m.tcp === 'slow' ? Math.max(200, 2 * m.rtt) : Math.max(30, 2 * m.rtt)
      const d = Math.max(0, m.rtt / 2 + (world.rand() * 2 - 1) * m.jitter) + extra
      const at = Math.max(world.t + d, kind === 'tcp' || m.fifo ? last : 0)
      if (kind === 'tcp' || m.fifo) last = at
      world.at(at, fn)
    },
  }
}

export class World {
  constructor(seed = 1) { this.t = 1_000_000; this.q = []; this.rand = rng(seed); this.seq = 0; this.steps = 0 }
  now = () => this.t
  at(t, fn) { this.q.push({ t, fn, s: this.seq++ }); }
  async run(until, tickers) {
    const step = 2
    while (this.t < until) {
      this.t += step
      this.q.sort((a, b) => a.t - b.t || a.s - b.s)
      while (this.q.length && this.q[0].t <= this.t) { const e = this.q.shift(); e.fn() }
      for (const k of tickers) k(this.t)
      await null; await null; await null
      // let real async work (CompressionStream for state blobs) finish: virtual time stands still meanwhile
      if (++this.steps % 10 === 0) await new Promise(r => setImmediate(r))
    }
  }
}

/**
 * Two peers. opts: mode 'duo'|'endless', udp (model for u/r), tcp (model for the relay), p2p (true: DataChannel up), D (fixed
 * initial delay or null = from RTT), ops (bot actions per second per seat), seed.
 */
export async function pair(opts) {
  const world = new World(opts.seed ?? 1)
  const now = world.now
  const udp = opts.udp ?? { rtt: 30, jitter: 5, loss: 0.01 }
  const tcp = opts.tcp ?? { rtt: udp.rtt, jitter: udp.jitter, loss: udp.loss, tcp: 'fast' }
  const state = { udp: { ...udp }, tcp: { ...tcp }, p2p: opts.p2p !== false }
  const peers = []
  const maxFrame = { bytes: 0 }
  for (const seat of [0, 1]) {
    const engine = new FakeEngine({ now, waves: opts.waves ?? (() => 3), tickCostMs: opts.tickCost?.[seat] })
    const stats = new NetStatsTracker(now)
    const clock = new ServerClock(now)
    const p = { seat, engine, stats, clock, events: [], results: [], desyncs: [], frames: 0 }
    const toOther = () => peers[1 - seat]
    const uLink = link(world, () => state.udp, 'udp'), rLink = link(world, () => ({ ...state.udp, loss: 0, fifo: true }), 'udp'), wsLink = link(world, () => state.tcp, 'tcp')
    const deliver = (bytes, via) => { if (bytes.length > maxFrame.bytes) maxFrame.bytes = bytes.length; const copy = bytes.slice(); return () => toOther().transport.receive(copy, via) }
    p.relay = { open: () => !state.tcp.down, send: bytes => { if (state.tcp.down) return false; wsLink.send(deliver(bytes, 'relay')); return true } }
    p.peerPath = { open: () => state.p2p && !state.udp.closed, send: (ch, bytes) => { if (!state.p2p || state.udp.closed) return false; (ch === 'u' ? uLink : rLink).send(deliver(bytes, ch)); return true }, restartIce: () => { p.restarts = (p.restarts || 0) + 1 } }
    p.pathLog = []
    p.transport = new Transport({ now, partner: 1 - seat, relay: p.relay, stats, onFrame: (f, via) => p.match.onFrame(f, via), onPath: path => p.pathLog.push([now(), path]) })
    p.transport.setPeer(p.peerPath)
    const d0 = opts.D ?? initialDelay(udp.rtt + 2 * udp.jitter, state.p2p ? 'p2p' : 'relay')
    p.match = new NetMatch({
      mode: opts.mode, seat, host: seat === 0, engine, transport: p.transport, stats, clock, now, initialDelay: d0, fixedDelay: !!opts.fixedD,
      onEvent: e => {
        p.events.push([now(), e])
        if (e.type === 'desync') { p.desyncs.push([now(), e.check]); if (opts.mode === 'duo' && opts.resync !== false) p.match.requestReplicaResync(e.check.tick) ; if (opts.mode === 'endless' && opts.resync !== false) { p.match.beginLockstepResync(); peers[0].match.ls.freeze(); peers[1].match.ls.freeze() } }
        if (e.type === 'result') p.results.push(e)
        if (e.type === 'resynced' && opts.mode === 'endless') { const at = now() + 300; for (const q of peers) q.match.ls.resume(at); for (const q of peers) q.match.lockstepResyncDone() }
      },
    })
    peers.push(p)
  }
  // session: both engines enter net mode; start at T0; wave 1 (go) at T0 + 1 s
  const T0 = now() + 200
  for (const p of peers) p.engine.net(JSON.stringify({ t: 'session', mode: opts.mode, level: opts.level ?? 25, seat: p.seat, side: p.seat, seed: opts.seed ?? 7, names: ['A', 'B'], netVersion: 1 }))
  world.at(T0, () => {
    for (const p of peers) {
      if (opts.mode === 'duo') p.engine.net(JSON.stringify({ t: 'clock', run: true, speed: opts.speed ?? 1 }))
      else p.match.ls.begin(T0)
    }
  })
  world.at(T0 + 1000, () => {
    if (opts.mode === 'duo') for (const p of peers) p.engine.net(JSON.stringify({ t: 'go' }))
    else { peers[0].engine.send({ type: 'start' }); if (opts.speed === 2) peers[0].engine.send({ type: 'speed', value: 2 }) }
  })
  // bots: random page commands (buy on a free pad, upgrade with the precondition tier, sell, next), opsPerSec per seat
  const bots = peers.map(p => ({ r: rng((opts.seed ?? 1) * 31 + p.seat), next: T0 + 1200 }))
  let frameAt = 0
  const tickers = [
    t => { if (t - frameAt >= 16) { frameAt = t; for (const p of peers) p.engine.frame() } },
    () => { for (const p of peers) { p.transport.pump(); p.match.pump() } },
    t => {
      if (!opts.ops) return
      for (const p of peers) {
        const b = bots[p.seat]
        if (t < b.next) continue
        b.next = t + 1000 / opts.ops * (0.5 + b.r())
        const st = p.engine.stateOf(opts.mode === 'duo' ? 'own' : 'shared')
        if (!st || st.phase !== 'playing') continue
        const roll = b.r()
        const mine = st.towers
        if (roll < 0.45 || !mine.length) p.engine.send({ type: 'buy', pad: Math.floor(b.r() * 34), kind: TOWER_KINDS[Math.floor(b.r() * 5)] })
        else if (roll < 0.8) { const tw = mine[Math.floor(b.r() * mine.length)]; p.engine.send({ type: 'upgrade', id: tw.id, value: tw.tier }) }
        else if (roll < 0.93) { const tw = mine[Math.floor(b.r() * mine.length)]; p.engine.send({ type: 'sell', id: tw.id, value: tw.tier }) }
        else p.engine.send({ type: 'next' })
      }
    },
  ]
  const run = until => world.run(until, tickers)
  return { world, peers, state, run, T0, maxFrame }
}

/** Replica lag samples (partner exec - replica exec) every 100 ms after warm-up. */
export function lagSampler(env, from) {
  const xs = []
  let last = 0
  return { xs, tick: t => { if (t < from || t - last < 100) return; last = t; for (const p of env.peers) { const d = p.match.duo; if (d) xs.push(d.partnerExec - d.replicaExec) } } }
}

if (process.argv[2] === 'stalls') {
  const rows = []
  for (const [name, udp, p2p, tcpMode] of [['30/5/1 p2p', { rtt: 30, jitter: 5, loss: 0.01 }, true], ['60/10/2 p2p', { rtt: 60, jitter: 10, loss: 0.02 }, true], ['150/30/5 p2p', { rtt: 150, jitter: 30, loss: 0.05 }, true], ['60/10/2 relay fast', { rtt: 60, jitter: 10, loss: 0.02 }, false, 'fast'], ['60/10/2 relay slow', { rtt: 60, jitter: 10, loss: 0.02 }, false, 'slow']]) {
    for (const D of [2, 3, 4, 5, 6, 7, 8, 10]) {
      let stalls = 0, del = 0
      for (const seed of [1, 2, 3]) {
        const env = await pair({ mode: 'endless', udp, tcp: { ...udp, tcp: tcpMode || 'fast' }, p2p, ops: 1, seed, D, fixedD: true })
        await env.run(env.T0 + 22_000)
        stalls += env.peers.reduce((a, q) => a + q.stats.stallsIn(20_000) + (q.match.ls.stallingFor() > 100 ? 1 : 0), 0) / 2
        del += env.peers[0].match.ls.delivery(0.99)
      }
      rows.push({ name, D, stalls20s: +(stalls / 3).toFixed(1), p99deliveryMs: Math.round(del / 3) })
    }
  }
  console.table(rows)
}
if (process.argv[2] === 'table') {
  const rows = []
  for (const [name, udp, p2p] of [['30/5/1 p2p', { rtt: 30, jitter: 5, loss: 0.01 }, true], ['60/10/2 p2p', { rtt: 60, jitter: 10, loss: 0.02 }, true], ['150/30/5 p2p', { rtt: 150, jitter: 30, loss: 0.05 }, true], ['60/10/2 relay', { rtt: 60, jitter: 10, loss: 0.02 }, false]]) {
    const env = await pair({ mode: 'endless', udp, p2p, ops: 2, seed: 3 })
    await env.run(env.T0 + 10_000)
    const p = env.peers[0]
    p.D10 = p.match.ls.D
    p.stats.stallTimes = []; p.stats.stallDurations = []
    await env.run(env.T0 + 30_000)
    rows.push({ name, D: `${env.peers[0].match.ls.D}/${env.peers[1].match.ls.D}`, Dat10s: p.D10, inputDelayMs: Math.round(p.stats.inputDelayMs), stalls20s: p.stats.stallsIn(20_000), digests: p.stats.digestsCompared, maxFrame: env.maxFrame.bytes, p95late: Math.round(percentile([], 0.95)) })
  }
  console.table(rows)
  void MAX_FRAME_BYTES
}
