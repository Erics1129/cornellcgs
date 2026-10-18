/**
 * Server clock: the room's Date.now() as seen from this device. The lobby takes time samples against the room and keeps the
 * offset from the lowest-RTT one (error = half the path asymmetry, usually a few ms). In a match the offset is re-estimated from
 * peer ping/pong and slewed, never jumped, so countdowns and the lockstep clock never step backwards.
 */
export class ServerClock {
  /** server = local + offset */
  private offset = 0
  private target = 0
  private bestRtt = Infinity
  private samples = 0
  private lastSlew = 0
  private now: () => number
  constructor(now: () => number) { this.now = now }

  /** A room time sample: sent at local c, server time s, received now. */
  sample(c: number, s: number, received = this.now()) {
    const rtt = received - c
    if (!(rtt >= 0) || !Number.isFinite(s)) return
    this.samples++
    if (rtt <= this.bestRtt) {
      this.bestRtt = rtt
      const offset = s - (c + rtt / 2)
      if (this.samples <= 8 || Math.abs(offset - this.offset) > 250) { this.offset = offset; this.target = offset } else this.target = offset
    }
  }
  /** A coarse sample from a server message carrying `now` (used before any proper sample exists). */
  hint(serverNow: number, received = this.now()) {
    if (this.samples === 0) { this.offset = serverNow - received; this.target = this.offset }
  }
  /** Peer skew (partner's server estimate minus ours, ms): each side moves half way, so the two meet. */
  skew(ms: number) {
    if (!Number.isFinite(ms) || Math.abs(ms) > 2000) return
    this.target = this.offset + ms / 2
  }
  /** Moves the offset toward its target at most 1 ms per 100 ms of local time. */
  tick(local = this.now()) {
    const dt = Math.min(1000, Math.max(0, local - (this.lastSlew || local)))
    this.lastSlew = local
    const step = dt / 100
    const d = this.target - this.offset
    this.offset += Math.abs(d) <= step ? d : Math.sign(d) * step
  }
  serverNow(local = this.now()) { return local + this.offset }
  toLocal(serverMs: number) { return serverMs - this.offset }
  get rtt() { return this.bestRtt }
  get synced() { return this.samples > 0 }
}
