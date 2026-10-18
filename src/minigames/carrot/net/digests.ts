/**
 * Digest bookkeeping: our own digests (a ring) against the partner's (a pending queue), compared when both exist for a tick.
 * The duo replica can run 60+ ticks behind its owner, so remote digests wait for the local one instead of being dropped. A
 * digest that can never be compared (its partner copy was lost, or it fell out of the ring) counts as unverified, never as a pass.
 */
export type DigestValue = number[]
export type DigestCheck = { tick: number; ok: boolean; local: DigestValue; remote: DigestValue }

export class DigestBook {
  private local = new Map<number, DigestValue>()
  private remote = new Map<number, DigestValue>()
  localHorizon = -1
  remoteHorizon = -1
  compared = 0
  unverified = 0
  mismatches = 0
  private keep: number
  constructor(keep = 64) { this.keep = keep }

  addLocal(tick: number, value: DigestValue): DigestCheck | null {
    if (!(tick >= 0) || this.local.has(tick)) return null
    if (tick <= this.localHorizon) return null
    this.localHorizon = tick
    const r = this.remote.get(tick)
    if (r) { this.remote.delete(tick); return this.check(tick, value, r) }
    if (tick <= this.remoteHorizon) { this.unverified++; return null }
    this.local.set(tick, value)
    this.trim(this.local)
    return null
  }
  addRemote(tick: number, value: DigestValue): DigestCheck | null {
    if (!(tick >= 0) || tick <= this.remoteHorizon) return null
    this.remoteHorizon = tick
    const l = this.local.get(tick)
    if (l) { this.local.delete(tick); return this.check(tick, l, value) }
    // The partner moved past digests we still hold: those partner copies were lost.
    for (const t of [...this.local.keys()]) if (t < tick) { this.local.delete(t); this.unverified++ }
    if (tick <= this.localHorizon) { this.unverified++; return null }
    this.remote.set(tick, value)
    this.trim(this.remote)
    return null
  }
  private check(tick: number, local: DigestValue, remote: DigestValue): DigestCheck {
    const ok = local.length === remote.length && local.every((x, i) => (x >>> 0) === (remote[i] >>> 0))
    this.compared++
    if (!ok) this.mismatches++
    for (const t of [...this.local.keys()]) if (t < tick) { this.local.delete(t); this.unverified++ }
    return { tick, ok, local, remote }
  }
  private trim(m: Map<number, DigestValue>) {
    while (m.size > this.keep) { const first = m.keys().next().value as number; m.delete(first); this.unverified++ }
  }
  /** After a state import: everything before `tick` is history. */
  reset(tick: number) {
    this.local.clear(); this.remote.clear()
    this.localHorizon = tick - 1; this.remoteHorizon = Math.min(this.remoteHorizon, tick - 1)
  }
  get pendingRemote() { return this.remote.size }
}
