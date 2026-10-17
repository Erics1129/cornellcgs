/**
 * Duo boss fights: this device runs its own half authoritatively (zero input lag; Unity applies own ops at once and stamps them
 * own netTick + 1) and the partner's half is a replica on this device, rebuilt from their tick-stamped ops.
 *
 * Wire (kind 1): own executed tick, cumulative ack of the partner's ops, every unacknowledged own op oldest first up to
 * MAX_OP_BYTES, and the latest own digests. When the backlog does not fit, the reported exec is capped below the first op left
 * out, so the replica can never run a tick whose ops it has not received. The replica is fed {t:'replica', exec, ops, b}: it paces
 * B ticks behind the partner's reported tick and never passes it; only the partner's view freezes if frames stop.
 * Our replica's digests are compared with the partner's own digests (a pending queue, the replica can be 60+ ticks behind); a
 * mismatch asks the partner for a state blob (the session runs the transfer). The own half never changes because of the partner.
 */
import { DUO_BUFFER_TICKS, DUO_HEARTBEAT_HZ, MAX_OP_BYTES } from './protocol.ts'
import type { DeepDigest, Digest, NetIn, NetOut, Op, PathKind, Seat } from './protocol.ts'
import { fitOps, normalizeOp, validOp } from './frames.ts'
import type { DuoFrame } from './frames.ts'
import { DigestBook } from './digests.ts'
import type { DigestCheck } from './digests.ts'
import type { NetStatsTracker } from './stats.ts'

export type DuoOptions = {
  seat: Seat
  now: () => number
  /** Sends one kind-1 frame (the transport stamps seq and flags). */
  send: (frame: Omit<DuoFrame, 'seq' | 'flags'>) => void
  engine: (msg: NetIn) => void
  path: () => PathKind
  stats: NetStatsTracker
  onDesync?: (check: DigestCheck, deep: boolean) => void
}

export class DuoController {
  readonly seat: Seat
  readonly partner: Seat
  /** Every own op of this match, in order (kept for the reconnect record and a rejoining partner). */
  ownLog: Op[] = []
  ownExec = 0
  /** Highest own seq the partner has acknowledged. */
  partnerAck = 0
  private ownDigest?: Digest
  private ownDeep?: DeepDigest
  /** Partner ops by seq, and the highest contiguous seq received. */
  partnerOps = new Map<number, Op>()
  partnerContig = 0
  partnerExec = 0
  partnerExecAt = 0
  /** Partner ops already handed to the replica (by seq), and the exec last fed. */
  fedSeq = 0
  fedExec = -1
  replicaExec = 0
  readonly digests = new DigestBook(64)
  readonly deep = new DigestBook(16)
  private lastSent = 0
  private dirty = false
  private o: DuoOptions
  private lastUnityS = 0
  /** A reloaded player's replica waits for the partner's state blob (frames before it carry only the unacked tail of the log). */
  holdReplica = false
  /** Duo frames stop while the own half is being restored (a reload): the partner keeps its view of us frozen. */
  muted = false
  constructor(o: DuoOptions) { this.o = o; this.seat = o.seat; this.partner = o.seat === 0 ? 1 : 0 }

  get buffer() { return this.o.path() === 'p2p' ? DUO_BUFFER_TICKS.p2p : DUO_BUFFER_TICKS.relay }

  onEngine(msg: NetOut) {
    if (msg.t === 'own') {
      // Wire seqs are this layer's own 1, 2, 3... (contiguity is what the cumulative ack needs); Unity's s only orders ops.
      for (const raw of msg.ops) {
        if (raw.s > 0 && raw.s <= this.lastUnityS) continue
        if (raw.s > 0) this.lastUnityS = raw.s
        const op = normalizeOp({ ...raw, seat: this.seat, s: this.ownLog.length + 1 })
        if (validOp(op)) this.ownLog.push(op)
      }
      if (msg.exec > this.ownExec) this.ownExec = msg.exec
      this.dirty = true
    } else if (msg.t === 'tick') {
      if (msg.exec > this.ownExec) this.ownExec = msg.exec
      if (msg.d) this.ownDigest = [msg.d[0], msg.d[1] >>> 0, msg.d[2] >>> 0]
      if (msg.dd) this.ownDeep = [msg.dd[0], msg.dd[1] >>> 0]
      if (typeof msg.rexec === 'number') this.replicaExec = Math.max(this.replicaExec, msg.rexec)
      if (msg.rd) { this.replicaExec = Math.max(this.replicaExec, msg.rd[0]); this.report(this.digests.addLocal(msg.rd[0], [msg.rd[1] >>> 0, msg.rd[2] >>> 0]), false) }
      if (msg.rdd) this.report(this.deep.addLocal(msg.rdd[0], [msg.rdd[1] >>> 0]), true)
      this.o.stats.replicaBehind = Math.max(0, this.partnerExec - this.replicaExec)
    }
  }

  onFrame(f: DuoFrame) {
    if (f.ack > this.partnerAck) this.partnerAck = Math.min(f.ack, this.ownLog.length ? this.ownLog[this.ownLog.length - 1].s : 0)
    for (const op of f.cmds) if (op.s > this.partnerContig && !this.partnerOps.has(op.s)) this.partnerOps.set(op.s, { ...op, seat: this.partner })
    while (this.partnerOps.has(this.partnerContig + 1)) this.partnerContig++
    if (f.exec > this.partnerExec) { this.partnerExec = f.exec; this.partnerExecAt = this.o.now() }
    if (f.digest) this.report(this.digests.addRemote(f.digest[0], [f.digest[1] >>> 0, f.digest[2] >>> 0]), false)
    if (f.deep) this.report(this.deep.addRemote(f.deep[0], [f.deep[1] >>> 0]), true)
    this.feed()
  }
  private report(check: DigestCheck | null, deep: boolean) {
    if (!check || this.holdReplica) return
    this.o.stats.digestsCompared = this.digests.compared + this.deep.compared
    this.o.stats.unverified = this.digests.unverified + this.deep.unverified
    if (!check.ok) this.o.onDesync?.(check, deep)
  }

  /** Hands the replica every new contiguous partner op and the partner's tick (its ceiling). */
  feed(force = false) {
    if (this.holdReplica) return
    const ops: Op[] = []
    for (let s = this.fedSeq + 1; s <= this.partnerContig; s++) { const op = this.partnerOps.get(s); if (op) ops.push(op) }
    if (!ops.length && this.partnerExec === this.fedExec && !force) return
    this.fedSeq = this.partnerContig
    this.fedExec = this.partnerExec
    this.o.engine({ t: 'replica', exec: this.partnerExec, ops, b: this.buffer })
  }
  /** After the replica imported the partner's state at `tick`: re-send every partner op stamped after it. */
  afterImport(tick: number) {
    this.digests.reset(tick + 1)
    this.deep.reset(tick + 1)
    this.replicaExec = tick
    const ops = [...this.partnerOps.values()].filter(op => op.k > tick).sort((a, b) => a.s - b.s)
    this.fedSeq = this.partnerContig
    this.fedExec = this.partnerExec
    this.o.engine({ t: 'replica', exec: this.partnerExec, ops, b: this.buffer })
  }
  /** The partner's log (for a rejoining partner who lost theirs) and ours. */
  partnerLog(): Op[] { return [...this.partnerOps.values()].sort((a, b) => a.s - b.s) }

  pump() {
    if (this.muted) return
    const t = this.o.now()
    const hz = this.o.path() === 'p2p' ? DUO_HEARTBEAT_HZ.p2p : DUO_HEARTBEAT_HZ.relay
    if (!this.dirty && t - this.lastSent < 1000 / hz) return
    this.sendFrame()
  }
  sendFrame() {
    this.lastSent = this.o.now()
    this.dirty = false
    const unacked = this.ownLog.filter(op => op.s > this.partnerAck)
    const n = fitOps(unacked, MAX_OP_BYTES)
    let exec = this.ownExec
    if (n < unacked.length) exec = Math.min(exec, unacked[n].k - 1)
    this.o.send({ kind: 1, exec: Math.max(0, exec), ack: this.partnerContig, cmds: unacked.slice(0, n), ...(this.ownDigest ? { digest: this.ownDigest } : {}), ...(this.ownDeep ? { deep: this.ownDeep } : {}) })
  }
  /** The partner restarted (a reload): it holds our ops only up to `seq` (inside the state it imported), so resend the rest. */
  resetAckTo(seq: number) { this.partnerAck = Math.max(0, Math.min(seq, this.ownLog.length)); this.dirty = true }
  /** We restarted: the partner's half arrives as a state blob holding its ops up to `seq`; later ones come by frames. */
  adoptPartnerSeq(seq: number, tick: number) {
    this.holdReplica = false
    this.partnerOps.clear(); this.partnerContig = seq; this.fedSeq = seq; this.fedExec = -1
    this.digests.reset(tick + 1); this.deep.reset(tick + 1); this.replicaExec = tick
  }
  /** Restores our own op log (from the reconnect record or the partner's copy) before replaying it. */
  restoreOwn(ops: Op[], exec: number) { this.ownLog = ops.map((op, i) => ({ ...op, s: i + 1, seat: this.seat })); this.ownExec = Math.max(this.ownExec, exec) }
  /** Ops this device issued that the partner has not acknowledged yet. */
  get backlog() { return this.ownLog.filter(op => op.s > this.partnerAck).length }
}
