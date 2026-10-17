/**
 * One match's data plane: the duo or lockstep controller, the transport, state blobs, ping/pong RTT and clock skew, controls,
 * and the resync procedures. The session (session.ts) owns the room, the phases and the UI snapshot; the link-model tests drive
 * this class directly with fake paths, so both run the same wiring.
 *
 * Re-entrancy: engine events are handled on a microtask, never inside Unity's dispatch, so nothing here calls engine.net()
 * while Unity is iterating a tick.
 */
import { CHUNK_PURPOSE, CONTROL, DIGEST_EVERY, RESYNC_LIMIT, RESYNC_WINDOW_MS } from './protocol.ts'
import type { EngineLink, NetIn, NetModeName, NetOut, Op, PartnerView, Seat } from './protocol.ts'
import type { ControlFrame, Frame } from './frames.ts'
import { DuoController } from './duo.ts'
import { LockstepController } from './lockstep.ts'
import type { LockstepEvent } from './lockstep.ts'
import { BlobChannel, b64ToBytes, bytesToB64, pack, unpack } from './blobs.ts'
import type { DigestCheck } from './digests.ts'
import type { NetStatsTracker } from './stats.ts'
import type { Transport, Via } from './transport.ts'
import type { ServerClock } from './clock.ts'

export type MatchEvent =
  | { type: 'desync'; check: DigestCheck; deep: boolean }
  | { type: 'resynced'; seat: Seat }
  | { type: 'resyncFailed'; reason: string }
  | { type: 'control'; frame: ControlFrame }
  | { type: 'result'; outcome: 'cleared' | 'won' | 'lost'; tick: number; health: number; score?: number }
  | { type: 'partnerView'; view: PartnerView }
  | { type: 'reject'; seat: Seat; s: number; reason: string }
  | { type: 'view'; kind: string }
  | { type: 'lockstep'; event: LockstepEvent }
  | { type: 'loaded' }
  | { type: 'unityDesync'; tick: number; reason: string }
  | { type: 'blob'; purpose: number; tick: number; body: BlobBody }
  | { type: 'blobProgress'; fraction: number }
export type BlobBody = { tick: number; b64?: string; seq?: number; ops?: Op[]; exec?: number }
export type MatchOptions = {
  mode: NetModeName
  seat: Seat
  host: boolean
  engine: EngineLink
  transport: Transport
  stats: NetStatsTracker
  clock: ServerClock
  now: () => number
  initialDelay: number
  fixedDelay?: boolean
  onEvent: (e: MatchEvent) => void
}

export class NetMatch {
  readonly mode: NetModeName
  readonly seat: Seat
  readonly duo: DuoController | null
  readonly ls: LockstepController | null
  readonly blobs: BlobChannel
  private o: MatchOptions
  private off: () => void
  private pingId = 0
  private pings = new Map<number, number>()
  private lastPing = 0
  private skews: number[] = []
  private resyncSeq = 0
  private resyncTimes: number[] = []
  /** Duo: a replica resync we asked for (id -> asked at). */
  private asked = new Map<number, number>()
  /** Lockstep: a resync in progress (both frozen; the host exports once converged). */
  lockstepResync: { id: number; exported: boolean } | null = null
  private waitingState: Array<(m: Extract<NetOut, { t: 'state' }>) => void> = []
  private waitingReplay: Array<(m: Extract<NetOut, { t: 'replayed' }>) => void> = []
  private disposed = false
  partnerView: PartnerView | null = null
  constructor(o: MatchOptions) {
    this.o = o; this.mode = o.mode; this.seat = o.seat
    const send = (f: Parameters<Transport['send']>[0]) => { this.o.transport.send(f) }
    if (o.mode === 'duo') {
      this.duo = new DuoController({ seat: o.seat, now: o.now, send, engine: m => this.net(m), path: () => o.transport.path, stats: o.stats, onDesync: (check, deep) => this.desync(check, deep) })
      this.ls = null
    } else {
      this.ls = new LockstepController({ seat: o.seat, now: o.now, send, engine: m => this.net(m), path: () => o.transport.path, rtt: () => o.stats.rttMs, stats: o.stats, initialDelay: o.initialDelay, fixedDelay: o.fixedDelay, onDesync: (check, deep) => this.desync(check, deep), onEvent: event => {
        if (event.type === 'delay') { this.control(CONTROL.delay, { a: event.ms }, false); return }
        if (event.type === 'slowed') this.control(CONTROL.slowed, { a: event.seat, b: Math.round(event.factor * 1000) })
        o.onEvent({ type: 'lockstep', event })
      } })
      this.duo = null
    }
    this.blobs = new BlobChannel(o.now, {
      sendChunk: f => { this.o.transport.sendReliable(f) },
      sendControl: f => { this.o.transport.sendReliable({ kind: 6, ...f }) },
    })
    this.blobs.onBlob = (_id, tick, purpose, bytes) => { void this.receiveBlob(tick, purpose, bytes) }
    this.blobs.onProgress = (_id, fraction) => o.onEvent({ type: 'blobProgress', fraction })
    this.off = o.engine.onNet(m => queueMicrotask(() => { if (!this.disposed) this.onEngine(m) }))
  }
  net(m: NetIn) { if (!this.disposed) this.o.engine.net(JSON.stringify(m)) }

  private onEngine(m: NetOut) {
    switch (m.t) {
      case 'own': case 'tick': this.duo?.onEngine(m); this.ls?.onEngine(m); return
      case 'intent': this.ls?.onEngine(m); return
      case 'loaded': this.o.onEvent({ type: 'loaded' }); return
      case 'result': this.o.onEvent({ type: 'result', outcome: m.outcome, tick: m.tick, health: m.health, ...(m.score !== undefined ? { score: m.score } : {}) }); return
      case 'partnerView': { const { t: _t, ...view } = m; this.partnerView = view; this.o.onEvent({ type: 'partnerView', view }); return }
      case 'reject': this.o.onEvent({ type: 'reject', seat: m.seat, s: m.s, reason: m.reason }); return
      case 'view': this.o.onEvent({ type: 'view', kind: m.kind }); return
      case 'desync': this.o.onEvent({ type: 'unityDesync', tick: m.tick, reason: m.reason || 'engine' }); return
      case 'state': { const w = this.waitingState.shift(); if (w) w(m); return }
      case 'replayed': { const w = this.waitingReplay.shift(); if (w) w(m); return }
    }
  }
  /** Asks Unity for a full-state export of one instance. */
  exportState(target: 'self' | 'replica'): Promise<{ tick: number; b64: string }> {
    return new Promise(resolve => { this.waitingState.push(m => resolve({ tick: m.tick, b64: m.b64 })); this.net({ t: 'export', target }) })
  }
  replay(target: 'self' | 'replica', ops: Op[], to: number): Promise<{ tick: number; ms: number }> {
    return new Promise(resolve => { this.waitingReplay.push(m => resolve({ tick: m.tick, ms: m.ms })); this.net({ t: 'replay', target, ops, to }) })
  }

  // ---------------------------------------------------------------- network in
  onFrame(f: Frame, _via: Via) {
    switch (f.kind) {
      case 1: this.duo?.onFrame(f); return
      case 2: this.ls?.onFrame(f); return
      case 3: this.blobs.receive(f); return
      case 4: this.o.transport.send({ kind: 5, id: f.id, time: f.time, reply: this.o.clock.serverNow() }); return
      case 5: {
        const sent = this.pings.get(f.id)
        if (sent === undefined) return
        this.pings.delete(f.id)
        const rtt = this.o.now() - sent
        this.o.stats.rtt(rtt)
        // skew = partner's server estimate at reply minus ours at the same instant (sent + rtt/2)
        this.skews.push(f.reply - (f.time + rtt / 2))
        if (this.skews.length >= 4) { const s = [...this.skews].sort((a, b) => a - b); this.o.clock.skew(s[s.length >> 1]); this.skews = [] }
        return
      }
      case 6:
        if (f.code === CONTROL.chunkAck) { this.blobs.receive(f); return }
        if (f.code === CONTROL.resyncRequest) { void this.answerResync(f.a ?? 0, f.b ?? 0); return }
        if (f.code === CONTROL.slowed && this.ls) this.ls.setPartnerSlow((f.b ?? 1000) / 1000)
        if (f.code === CONTROL.delay && this.ls) { this.ls.setPartnerRequest(f.a ?? 0); return }
        if (f.code === CONTROL.resyncDone && this.ls) { this.lockstepResync = null }
        this.o.onEvent({ type: 'control', frame: f })
        return
    }
  }

  // ---------------------------------------------------------------- the loop
  pump() {
    if (this.disposed) return
    const t = this.o.now()
    // RTT and clock skew: a ping every 2 s is plenty (each one costs a packet and an SCTP ack both ways)
    if (t - this.lastPing >= (this.o.stats.rttSamples.length < 4 ? 500 : 2000)) {
      this.lastPing = t
      const id = (++this.pingId) >>> 0
      this.pings.set(id, t)
      if (this.pings.size > 16) this.pings.delete(this.pings.keys().next().value as number)
      this.o.transport.send({ kind: 4, id, time: this.o.clock.serverNow(t) })
    }
    this.o.clock.tick(t)
    this.duo?.pump()
    this.ls?.pump()
    this.blobs.pump()
    if (this.ls && this.lockstepResync && !this.lockstepResync.exported && this.o.host && this.ls.converged()) void this.lockstepExport()
    for (const [id, at] of this.asked) if (t - at > 20_000) { this.asked.delete(id); this.o.onEvent({ type: 'resyncFailed', reason: 'timeout' }) }
  }
  control(code: number, fields: Omit<ControlFrame, 'kind' | 'seq' | 'flags' | 'code'> = {}, dual = true) { this.o.transport.sendReliable({ kind: 6, code, ...fields }, dual) }

  // ---------------------------------------------------------------- desync and resync
  private desync(check: DigestCheck, deep: boolean) { this.o.onEvent({ type: 'desync', check, deep }) }
  /** True when this resync is still within the limit (RESYNC_LIMIT per RESYNC_WINDOW_MS); false means end the match. */
  countResync(): boolean {
    const t = this.o.now()
    this.resyncTimes = this.resyncTimes.filter(x => t - x < RESYNC_WINDOW_MS)
    this.resyncTimes.push(t)
    this.o.stats.resyncs++
    return this.resyncTimes.length < RESYNC_LIMIT
  }
  /** Duo: our replica diverged; ask its owner for a state blob (our own half never changes). */
  requestReplicaResync(tick: number) {
    if (!this.duo || this.asked.size) return
    const id = this.seat * 1_000_000 + ++this.resyncSeq
    this.asked.set(id, this.o.now())
    this.control(CONTROL.resyncRequest, { a: id, b: tick })
  }
  /** The partner asked for our state (duo: their replica of our half). */
  private async answerResync(id: number, _tick: number) {
    if (this.duo) {
      const s = await this.exportState('self')
      const body: BlobBody = { tick: s.tick, b64: s.b64, seq: this.lastOwnSeqAt(s.tick) }
      void this.blobs.send(id, s.tick, CHUNK_PURPOSE.resync, await pack(new TextEncoder().encode(JSON.stringify(body))))
    } else if (this.ls) this.lockstepResync = this.lockstepResync ?? { id, exported: false }
  }
  /** Lockstep: begin a resync (both peers freeze through the room's pause; the host exports once converged). */
  beginLockstepResync() {
    if (!this.ls || this.lockstepResync) return
    const id = this.seat * 1_000_000 + ++this.resyncSeq
    this.lockstepResync = { id, exported: false }
    this.control(CONTROL.resyncRequest, { a: id, b: this.ls.E })
  }
  private async lockstepExport() {
    if (!this.ls || !this.lockstepResync) return
    this.lockstepResync.exported = true
    const s = await this.exportState('self')
    const body: BlobBody = { tick: s.tick, b64: s.b64, seq: this.lastOwnSeqAt(s.tick) }
    const ok = await this.blobs.send(this.lockstepResync.id, s.tick, CHUNK_PURPOSE.resync, await pack(new TextEncoder().encode(JSON.stringify(body))))
    if (!ok) this.o.onEvent({ type: 'resyncFailed', reason: 'transfer' })
  }
  private lastOwnSeqAt(tick: number): number {
    const log = this.duo ? this.duo.ownLog : this.ls ? this.ls.ownLog : []
    let s = 0
    for (const op of log) if (op.k <= tick) s = op.s
    return s
  }
  private async receiveBlob(tick: number, purpose: number, bytes: Uint8Array) {
    let body: BlobBody
    try { body = JSON.parse(new TextDecoder().decode(await unpack(bytes))) } catch { this.o.onEvent({ type: 'resyncFailed', reason: 'blob' }); return }
    if (purpose === CHUNK_PURPOSE.resync) {
      if (this.duo && body.b64) {
        this.asked.clear()
        this.net({ t: 'import', target: 'replica', tick: body.tick, b64: body.b64 })
        this.duo.afterImport(body.tick)
        this.o.onEvent({ type: 'resynced', seat: this.duo.partner })
      } else if (this.ls && body.b64) {
        this.net({ t: 'import', target: 'self', tick: body.tick, b64: body.b64 })
        this.ls.afterImport(body.tick)
        this.lockstepResync = null
        this.control(CONTROL.resyncDone, { a: 0, b: body.tick })
        this.o.onEvent({ type: 'resynced', seat: this.ls.partner })
      }
      return
    }
    this.o.onEvent({ type: 'blob', purpose, tick, body })
  }
  /** Sends a restore blob (reconnect): our own half (duo) or the shared state (endless), or an op log. */
  async sendBlob(purpose: number, body: BlobBody): Promise<boolean> {
    const id = this.seat * 1_000_000 + ++this.resyncSeq
    return this.blobs.send(id, body.tick, purpose, await pack(new TextEncoder().encode(JSON.stringify(body))))
  }
  /** Lockstep resync finished on the host side (the guest said done). */
  lockstepResyncDone() { this.lockstepResync = null }
  /** Exports our own state for a restore blob. */
  async ownStateBody(): Promise<BlobBody> { const s = await this.exportState('self'); return { tick: s.tick, b64: s.b64, seq: this.lastOwnSeqAt(s.tick) } }
  /** Digest cadence check for QA (ticks per digest). */
  static readonly digestEvery = DIGEST_EVERY
  /** Base64 helpers re-exported for the session's reconnect record. */
  static readonly codec = { bytesToB64, b64ToBytes }
  dispose() { this.disposed = true; this.off(); this.blobs.cancel(); this.waitingState = []; this.waitingReplay = [] }
}
