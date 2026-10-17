/**
 * Two-player endless: deterministic lockstep with an adaptive input delay D.
 *
 *  - A local intent typed at executed tick E is stamped k = max(E + D, committedThrough + 1); a commit never moves backwards,
 *    so lowering D only lets commits idle. Each frame says "committed through E + D - 1" (capped below the first op a full
 *    frame had to leave out), and tick T runs only when both commits reach T and the local clock does.
 *  - D lives in wall time: it is re-derived on every speed or SpeedHold change (a tick at 2x is 16.7 ms), from the measured
 *    delivery time of the partner's commits (p99 over 10 s; lateness plus the partner's own D - 1 ticks, read from its frames):
 *    D = 1 + ceil((p99 delivery + 15 ms) / tick), clamped; it rises
 *    at once after 2 stalls in 2 s and drops by at most one tick per 10 s.
 *  - The clock is anchored on the room's startAt/resumeAt and slews +/-3% from the measured advantage over the partner; a peer
 *    whose engine cannot keep the rate for 5 s slows both clocks (slow-peer policy) instead of stuttering.
 *  - Pause freezes the commit: both peers stop at min(commits), the same tick, and resume at the room-stamped time.
 *  - Ops of one tick are delivered in canonical order (seat 0 first on even ticks, seat 1 on odd, then by seq).
 */
import { DIGEST_EVERY, DIGEST_REPEAT, LOCKSTEP_D_MAX, LOCKSTEP_D_MIN, LOCKSTEP_D_WINDOW_MS, LOCKSTEP_SLEW, MAX_OP_BYTES, SLOW_PEER_MS, SLOW_PEER_RATE, STALL_NOTICE_MS, TICK_MS, canonicalOrder } from './protocol.ts'
import type { DeepDigest, Digest, Intent, NetIn, NetOut, Op, PathKind, Seat } from './protocol.ts'
import { FLAG } from './protocol.ts'
import { fitOps, normalizeOp, validOp } from './frames.ts'
import type { LockstepFrame } from './frames.ts'
import { DigestBook } from './digests.ts'
import type { DigestCheck } from './digests.ts'
import { percentile } from './stats.ts'
import type { NetStatsTracker } from './stats.ts'

export type LockstepEvent =
  | { type: 'stall'; on: boolean }
  | { type: 'slowed'; seat: Seat; factor: number }
  | { type: 'protocol'; reason: string }
  /** Ask the partner to use at least this input delay (ms); sent as CONTROL.delay. */
  | { type: 'delay'; ms: number }
export type LockstepOptions = {
  seat: Seat
  now: () => number
  send: (frame: Omit<LockstepFrame, 'seq' | 'flags'> & { flags?: number }) => void
  engine: (msg: NetIn) => void
  path: () => PathKind
  /** Current round trip to the partner (ms). */
  rtt: () => number
  stats: NetStatsTracker
  /** Starting D at 1x, from the lobby RTT on the selected path. */
  initialDelay: number
  /** QA: hold D fixed (no adaptation) to measure a stall table. */
  fixedDelay?: boolean
  onDesync?: (check: DigestCheck, deep: boolean) => void
  onEvent?: (e: LockstepEvent) => void
}
/**
 * Starting delay from the lobby RTT p95: 2 + ceil((rtt/2 + 15 ms + frame interval) / tick), and one more tick on the relay for
 * TCP loss recovery. P2P frames go out when the commit moves (no interval); the relay coalesces to 10 Hz (100 ms).
 */
export function initialDelay(rttP95: number, path: PathKind): number {
  const relay = path === 'relay'
  const d = 2 + Math.ceil((Math.max(0, rttP95) / 2 + 15 + (relay ? 100 : 0)) / TICK_MS) + (relay ? 1 : 0)
  return Math.max(LOCKSTEP_D_MIN, Math.min(LOCKSTEP_D_MAX, d))
}

export class LockstepController {
  readonly seat: Seat
  readonly partner: Seat
  /** Executed tick (Unity's report) and the limit already handed to Unity. */
  E = 0
  stepTo = 0
  myCommit = 0
  partnerCommit = 0
  partnerExec = 0
  partnerExecAt = 0
  D: number
  ownLog: Op[] = []
  /** Wire seq -> Unity's own s, so own ops come back to Unity with the s its previews know. */
  private unityS = new Map<number, number>()
  partnerOps = new Map<number, Op>()
  partnerContig = 0
  partnerAck = 0
  private deliveredOwn = 0
  private deliveredPartner = 0
  private pendingSpeed: Array<{ k: number; v: 1 | 2 }> = []
  readonly digests = new DigestBook(64)
  readonly deep = new DigestBook(16)
  private ownDigest?: Digest
  private ownDeep?: DeepDigest
  private digestLeft = 0
  private deepLeft = 0
  // clock
  running = false
  private anchorTick = 0
  private anchorTime = 0
  speed: 1 | 2 = 1
  hold = false
  private slew = 1
  private ownSlow = 1
  private partnerSlow = 1
  frozen = false
  partnerFrozen = false
  solo = false
  // measurements
  private lateness: Array<[number, number]> = []
  private stallSince = 0
  private stallsRecent: number[] = []
  private lastLower = 0
  /** D we measured for the partner (from its commits' delivery), the stall bump, and what we last asked it to use. */
  private measured = 0
  private bump = 0
  private bumpAt = 0
  private requested = 0
  private requestedAt = 0
  /** The partner's request for our D, in ms. */
  private partnerRequest = 0
  private lastAdapt = 0
  private lastSent = 0
  private dirty = false
  private advEma = 0
  private rateSamples: Array<[number, number, number]> = []
  private lagSince = 0
  private okSince = 0
  waiting = false
  private o: LockstepOptions
  constructor(o: LockstepOptions) {
    this.o = o; this.seat = o.seat; this.partner = o.seat === 0 ? 1 : 0
    this.D = Math.max(LOCKSTEP_D_MIN, Math.min(LOCKSTEP_D_MAX, Math.round(o.initialDelay)))
    this.myCommit = this.D - 1
    this.partnerCommit = this.D - 1
    this.publishDelay()
  }

  // ---------------------------------------------------------------- clock
  private get nominalRate() { return this.hold ? 1 : this.speed }
  get rate() { return this.solo ? this.nominalRate : this.nominalRate * this.slew * Math.min(this.ownSlow, this.partnerSlow) }
  private targetF(now: number) { return !this.running || now <= this.anchorTime ? this.anchorTick : this.anchorTick + (now - this.anchorTime) * 0.03 * this.rate }
  target(now = this.o.now()) { return Math.floor(this.targetF(now)) }
  private reanchor(now: number) { if (this.running && now > this.anchorTime) { this.anchorTick = this.targetF(now); this.anchorTime = now } }
  /** The clock starts (tick 0) at the room's startAt, in local ms. */
  begin(startAtLocal: number) { this.running = true; this.anchorTick = 0; this.anchorTime = startAtLocal; this.lastAdapt = startAtLocal }
  /** Resume after a pause: the clock re-anchors at the executed tick and the room-stamped resume time. */
  resume(atLocal: number) { this.frozen = false; this.anchorTick = this.E; this.anchorTime = atLocal; this.stallSince = 0; this.lateness = []; this.advEma = 0 }
  freeze() { this.frozen = true; this.stallSince = 0; this.setWaiting(false) }
  private setRate(change: () => void) {
    const now = this.o.now(), before = this.nominalRate
    this.reanchor(now)
    change()
    const after = this.nominalRate
    if (after !== before) {
      // D is wall time: the same delay is twice the ticks at 2x.
      this.D = this.clampD(Math.ceil(this.D * after / before))
      this.publishDelay()
    }
  }
  private clampD(d: number) { return Math.max(LOCKSTEP_D_MIN, Math.min(LOCKSTEP_D_MAX * this.nominalRate, d)) }
  private publishDelay() { const tick = TICK_MS / this.nominalRate; this.o.stats.delayTicks = this.D; this.o.stats.inputDelayMs = this.solo ? tick / 2 : (this.D - 0.5) * tick; this.o.stats.rate = this.rate }

  // ---------------------------------------------------------------- engine
  onEngine(msg: NetOut) {
    if (msg.t === 'intent') this.stamp(msg.op)
    else if (msg.t === 'tick') {
      if (msg.exec > this.E) this.E = msg.exec
      if (msg.hold !== undefined && !!msg.hold !== this.hold) this.setRate(() => { this.hold = !!msg.hold })
      while (this.pendingSpeed.length && this.pendingSpeed[0].k <= this.E) { const v = this.pendingSpeed.shift()!.v; if (v !== this.speed) this.setRate(() => { this.speed = v }) }
      if (msg.d) { this.ownDigest = [msg.d[0], msg.d[1] >>> 0, msg.d[2] >>> 0]; this.digestLeft = DIGEST_REPEAT; this.report(this.digests.addLocal(msg.d[0], [msg.d[1] >>> 0, msg.d[2] >>> 0]), false) }
      if (msg.dd) { this.ownDeep = [msg.dd[0], msg.dd[1] >>> 0]; this.deepLeft = DIGEST_REPEAT; this.report(this.deep.addLocal(msg.dd[0], [msg.dd[1] >>> 0]), true) }
    }
  }
  /** Stamps a local intent: k = max(E + D, committed + 1); solo: the next tick Unity has not been told about. */
  stamp(intent: Intent): Op | null {
    // stepTo is the tick already released to Unity (its frame runs it at once): the commit and the stamp count from it.
    const k = this.solo ? Math.max(this.E + 1, this.stepTo + 1) : Math.max(this.stepTo + this.D, this.myCommit + 1)
    const op = normalizeOp({ ...intent, s: this.ownLog.length + 1, k, seat: this.seat } as Op)
    if (!validOp(op)) return null
    this.ownLog.push(op)
    this.unityS.set(op.s, intent.s)
    if (op.op === 'speed') this.queueSpeed(op)
    this.dirty = true
    return op
  }
  private queueSpeed(op: Op) {
    this.pendingSpeed.push({ k: op.k, v: op.v === 2 ? 2 : 1 })
    this.pendingSpeed.sort((a, b) => a.k - b.k)
  }

  // ---------------------------------------------------------------- network
  onFrame(f: LockstepFrame) {
    const now = this.o.now()
    if (f.ack > this.partnerAck) this.partnerAck = Math.min(f.ack, this.ownLog.length)
    for (const raw of f.cmds) {
      if (raw.s <= this.partnerContig || this.partnerOps.has(raw.s)) continue
      if (raw.k <= this.stepTo) { this.o.onEvent?.({ type: 'protocol', reason: `partner op ${raw.s} stamped ${raw.k} at or below executed ${this.stepTo}` }); continue }
      const op = { ...raw, seat: this.partner }
      this.partnerOps.set(op.s, op)
      if (op.op === 'speed') this.queueSpeed(op)
    }
    while (this.partnerOps.has(this.partnerContig + 1)) this.partnerContig++
    if (f.commit > this.partnerCommit) {
      if (this.running && !this.frozen && now > this.anchorTime) {
        // delivery(T) = arrival of the commit covering T minus the moment the partner could first commit it (its exec reached
        // T - Dp + 1, Dp = commit - exec + 1 as this frame shows): one-way delay, frame cadence and lost frames, in ms.
        const tickMs = 1000 / (30 * this.rate), dp = Math.max(1, f.commit - f.exec + 1)
        for (let T = Math.max(this.partnerCommit + 1, f.commit - 64); T <= f.commit; T++) {
          const due = this.anchorTime + (T - (dp - 1) - this.anchorTick) * tickMs
          this.lateness.push([now, now - due])
        }
        while (this.lateness.length && now - this.lateness[0][0] > LOCKSTEP_D_WINDOW_MS) this.lateness.shift()
      }
      this.partnerCommit = f.commit
    }
    if (f.exec > this.partnerExec) { this.partnerExec = f.exec; this.partnerExecAt = now }
    this.partnerFrozen = !!(f.flags & FLAG.paused)
    if (f.digest) this.report(this.digests.addRemote(f.digest[0], [f.digest[1] >>> 0, f.digest[2] >>> 0]), false)
    if (f.deep) this.report(this.deep.addRemote(f.deep[0], [f.deep[1] >>> 0]), true)
  }
  private report(check: DigestCheck | null, deep: boolean) {
    if (!check) return
    this.o.stats.digestsCompared = this.digests.compared + this.deep.compared
    this.o.stats.unverified = this.digests.unverified + this.deep.unverified
    if (!check.ok) this.o.onDesync?.(check, deep)
  }

  // ---------------------------------------------------------------- the loop
  pump() {
    const now = this.o.now()
    if (!this.running) return
    const committed = this.myCommit
    const T = this.target(now)
    let limit = Math.min(T, this.solo ? Infinity : Math.min(this.myCommit, this.partnerCommit))
    if (limit > this.stepTo) this.deliver(limit)
    if (!this.frozen && !this.solo) {
      this.myCommit = Math.max(this.myCommit, this.stepTo + this.D - 1)
      limit = Math.min(T, Math.min(this.myCommit, this.partnerCommit))
      if (limit > this.stepTo) this.deliver(limit)
    }
    // stalls: the clock wants a tick the partner has not committed
    const stalled = !this.frozen && !this.solo && now > this.anchorTime && T > this.stepTo && this.partnerCommit < T
    if (stalled && !this.stallSince) this.stallSince = now
    if (!stalled && this.stallSince) {
      const d = now - this.stallSince
      this.stallSince = 0
      // Every stall is counted; only one that costs a rendered frame's worth (>= 8 ms) pushes D up.
      if (d >= 1) { this.o.stats.stall(d); if (d >= 8) this.stallsRecent.push(now) }
    }
    this.setWaiting(!!this.stallSince && now - this.stallSince >= STALL_NOTICE_MS)
    const p2p = this.o.path() === 'p2p'
    // P2P: a frame as soon as the commit moves (the partner's next tick waits on it), else a 30 Hz heartbeat. Relay: 10 Hz.
    const moved = this.myCommit > committed
    if (!this.solo && (p2p ? now - this.lastSent >= 1000 / 30 || ((moved || this.dirty) && now - this.lastSent >= 8) : now - this.lastSent >= 100)) this.sendFrame()
    if (now - this.lastAdapt >= 250) { this.lastAdapt = now; this.adapt(now) }
  }
  /** An unfinished stall (ms), for the stall statistics. */
  stallingFor(now = this.o.now()) { return this.stallSince ? now - this.stallSince : 0 }
  private setWaiting(on: boolean) { if (on !== this.waiting) { this.waiting = on; this.o.onEvent?.({ type: 'stall', on }) } }
  private deliver(limit: number) {
    const ops: Op[] = []
    while (this.deliveredOwn < this.ownLog.length && this.ownLog[this.deliveredOwn].k <= limit) {
      const op = this.ownLog[this.deliveredOwn++]
      ops.push({ ...op, s: this.unityS.get(op.s) ?? op.s })
    }
    while (this.deliveredPartner < this.partnerContig) {
      const op = this.partnerOps.get(this.deliveredPartner + 1)!
      if (op.k > limit) break
      ops.push(op); this.deliveredPartner++
    }
    ops.sort(canonicalOrder)
    this.stepTo = limit
    this.o.engine({ t: 'step', to: limit, ops })
  }
  /** The latest digests, each repeated in DIGEST_REPEAT consecutive frames (every frame would cost ~18 B at 20-30 Hz). */
  private digestFields(): { digest?: Digest; deep?: DeepDigest } {
    const out: { digest?: Digest; deep?: DeepDigest } = {}
    if (this.ownDigest && this.digestLeft > 0) { this.digestLeft--; out.digest = this.ownDigest }
    if (this.ownDeep && this.deepLeft > 0) { this.deepLeft--; out.deep = this.ownDeep }
    return out
  }
  sendFrame() {
    this.lastSent = this.o.now()
    this.dirty = false
    const unacked = this.ownLog.slice(this.partnerAck)
    const n = fitOps(unacked, MAX_OP_BYTES)
    let commit = this.myCommit
    if (n < unacked.length) commit = Math.min(commit, unacked[n].k - 1)
    this.o.send({ kind: 2, commit, exec: this.stepTo, ack: this.partnerContig, cmds: unacked.slice(0, n), flags: this.frozen ? FLAG.paused : 0, ...this.digestFields() })
  }

  private adapt(now: number) {
    if (this.solo || this.frozen || now <= this.anchorTime) { this.publishDelay(); return }
    const tick = TICK_MS / this.nominalRate
    // Input delay. Our stalls and the delivery of the partner's commits measure what the PARTNER's D must be; we tell it
    // (a 'delay' request in ms) and take max(its request for us, our own measure) for ourselves, so an asymmetric path is
    // covered on both sides. D drops by at most one tick per window; a stall pair raises the request at once.
    while (this.stallsRecent.length && now - this.stallsRecent[0] > 2000) this.stallsRecent.shift()
    if (!this.o.fixedDelay) {
      if (this.lateness.length >= 30) {
        // 15 ms of margin with a +/-5 ms hysteresis band, so a p99 sitting on a tick boundary does not flap D.
        const p99 = percentile(this.lateness.map(x => x[1]), 0.99)
        const up = this.clampD(1 + Math.ceil((p99 + 10) / tick)), down = this.clampD(1 + Math.ceil((p99 + 20) / tick))
        if (up > this.measured) this.measured = up
        else if (down < this.measured) this.measured = down
      }
      if (this.stallsRecent.length >= 2) { this.bump += 1; this.stallsRecent = []; this.bumpAt = now }
      if (this.bump && now - this.bumpAt >= LOCKSTEP_D_WINDOW_MS) { this.bump -= 1; this.bumpAt = now }
      const request = this.clampD(Math.max(this.measured, LOCKSTEP_D_MIN) + this.bump)
      if (request !== this.requested || now - this.requestedAt > 10_000) { this.requested = request; this.requestedAt = now; this.o.onEvent?.({ type: 'delay', ms: Math.round(request * tick) }) }
      const want = this.clampD(Math.max(this.measured, this.partnerRequest ? Math.ceil(this.partnerRequest / tick - 1e-6) : 0))
      if (want > this.D) this.D = want
      else if (want < this.D && now - this.lastLower >= LOCKSTEP_D_WINDOW_MS) { this.D -= 1; this.lastLower = now }
    }
    // slew toward the partner's tick (estimated from its last report)
    if (now - this.partnerExecAt < 500 && this.partnerExecAt && this.o.stats.rttSamples.length >= 2) {
      const partnerEst = this.partnerExec + (now - this.partnerExecAt + this.o.rtt() / 2) * 0.03 * this.rate
      const adv = this.targetF(now) - partnerEst
      this.advEma = this.advEma * 0.8 + adv * 0.2
      const slew = Math.max(1 - LOCKSTEP_SLEW, Math.min(1 + LOCKSTEP_SLEW, 1 - 0.01 * this.advEma))
      if (Math.abs(slew - this.slew) > 0.001) { this.reanchor(now); this.slew = slew }
    }
    // slow-peer policy: this engine cannot execute what it is allowed to
    this.rateSamples.push([now, this.E, this.stepTo])
    while (this.rateSamples.length && now - this.rateSamples[0][0] > SLOW_PEER_MS) this.rateSamples.shift()
    const lag = this.stepTo - this.E
    if (lag > 4) { this.okSince = 0; if (!this.lagSince) this.lagSince = now } else { this.lagSince = 0; if (!this.okSince) this.okSince = now }
    if (this.lagSince && now - this.lagSince >= SLOW_PEER_MS && this.rateSamples.length > 4) {
      const [t0, e0] = this.rateSamples[0]
      const achieved = (this.E - e0) / ((now - t0) / 1000), nominal = 30 * this.nominalRate
      if (achieved < SLOW_PEER_RATE * nominal * this.ownSlow) {
        this.reanchor(now)
        this.ownSlow = Math.max(0.5, Math.min(0.95, achieved / nominal))
        this.lagSince = now
        this.o.onEvent?.({ type: 'slowed', seat: this.seat, factor: this.ownSlow })
      }
    } else if (this.ownSlow < 1 && this.okSince && now - this.okSince >= SLOW_PEER_MS) {
      this.reanchor(now)
      this.ownSlow = Math.min(1, this.ownSlow + 0.05)
      this.okSince = now
      this.o.onEvent?.({ type: 'slowed', seat: this.seat, factor: this.ownSlow })
    }
    this.o.stats.slowedFor = this.ownSlow < 1 ? this.seat : this.partnerSlow < 1 ? this.partner : -1
    this.publishDelay()
  }
  /** The partner's measured requirement for our input delay (ms). */
  setPartnerRequest(ms: number) { if (ms > 0 && ms < 2000) this.partnerRequest = ms }
  /** The partner announced its slow-peer factor (both clocks follow the slower engine). */
  setPartnerSlow(factor: number) { this.reanchor(this.o.now()); this.partnerSlow = Math.max(0.5, Math.min(1, factor)) }

  // ---------------------------------------------------------------- pause, solo, resync, restore
  /** Both commits frozen and both peers at the same tick: a pause or resync point. */
  converged() { return this.frozen && this.partnerFrozen && this.E === this.stepTo && this.stepTo === Math.min(this.myCommit, this.partnerCommit) && this.partnerExec === this.stepTo }
  /** Continue solo: the partner's grace ran out; this device commands the whole map with no input delay. */
  goSolo() { this.solo = true; this.partnerCommit = Number.MAX_SAFE_INTEGER; this.frozen = false; this.publishDelay() }
  /** After importing a state blob at `tick` (resync guest or a rejoining player). */
  afterImport(tick: number) {
    this.E = tick; this.stepTo = tick
    this.myCommit = Math.max(this.myCommit, tick); this.partnerCommit = Math.max(this.partnerCommit, tick)
    this.digests.reset(tick + 1); this.deep.reset(tick + 1)
    // ops at or below the import tick are inside the imported state
    while (this.deliveredOwn < this.ownLog.length && this.ownLog[this.deliveredOwn].k <= tick) this.deliveredOwn++
    while (this.deliveredPartner < this.partnerContig && this.partnerOps.get(this.deliveredPartner + 1)!.k <= tick) this.deliveredPartner++
  }
  /** The partner reloaded (its wire seqs restart): forget its ops; ours up to `tick` are in the state it imported. */
  resetPartner(tick: number) {
    this.partnerOps.clear(); this.partnerContig = 0; this.deliveredPartner = 0
    let acked = 0
    for (const op of this.ownLog) if (op.k <= tick) acked = op.s
    this.partnerAck = acked
    this.partnerCommit = Math.max(this.partnerCommit, tick)
  }
  /** A rejoining player starts from the survivor's state: the survivor's ops up to seq are inside it. */
  adoptPartnerSeq(seq: number) { this.partnerContig = seq; this.deliveredPartner = seq; this.partnerOps.clear() }
  /** p-quantile of the commit delivery samples in the window (ms), for QA tables. */
  delivery(p: number) { return percentile(this.lateness.map(x => x[1]), p) }
  /** Last tick whose digests both peers verified (the score of a run ended by a desync counts up to here). */
  get verifiedTick() { return Math.max(0, this.digests.localHorizon - (this.digests.pendingRemote ? DIGEST_EVERY : 0)) }
}
