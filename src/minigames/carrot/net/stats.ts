/** Connection statistics for the HUD chip, the debug readout and QA: RTT, input delay, stalls, path, bytes, digests, resyncs. */
import type { NetStats, PathKind, Seat } from './protocol.ts'

export function percentile(xs: readonly number[], p: number): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))]
}

export class NetStatsTracker {
  path: PathKind = 'none'
  rttSamples: Array<[number, number]> = []
  inputDelayMs = 0
  delayTicks = 0
  replicaBehind = 0
  stallTimes: number[] = []
  stallDurations: number[] = []
  bytesOut: Array<[number, number]> = []
  bytesIn: Array<[number, number]> = []
  framesOut = 0
  framesIn = 0
  framesBad = 0
  digestsCompared = 0
  unverified = 0
  resyncs = 0
  pathSwitches = 0
  slowedFor: Seat | -1 = -1
  rate = 1
  totalOut = 0
  totalIn = 0
  private now: () => number
  constructor(now: () => number) { this.now = now }

  rtt(ms: number) { if (Number.isFinite(ms) && ms >= 0) { this.rttSamples.push([this.now(), ms]); if (this.rttSamples.length > 120) this.rttSamples.shift() } }
  get rttMs() { const xs = this.rttSamples.slice(-20).map(x => x[1]); return xs.length ? percentile(xs, 0.5) : 0 }
  rttP95(windowMs = 30_000) { const t = this.now(); return percentile(this.rttSamples.filter(x => t - x[0] <= windowMs).map(x => x[1]), 0.95) }
  sent(bytes: number) { this.framesOut++; this.totalOut += bytes; this.bytesOut.push([this.now(), bytes]); this.trim(this.bytesOut) }
  received(bytes: number) { this.framesIn++; this.totalIn += bytes; this.bytesIn.push([this.now(), bytes]); this.trim(this.bytesIn) }
  stall(durationMs: number) { const t = this.now(); this.stallTimes.push(t); this.stallDurations.push(durationMs); while (this.stallTimes.length && t - this.stallTimes[0] > 60_000) { this.stallTimes.shift(); this.stallDurations.shift() } }
  stallsIn(windowMs: number) { const t = this.now(); return this.stallTimes.filter(x => t - x <= windowMs).length }
  private trim(xs: Array<[number, number]>) { const t = this.now(); while (xs.length && t - xs[0][0] > 5000) xs.shift() }
  private rateOf(xs: Array<[number, number]>) { const t = this.now(); const recent = xs.filter(x => t - x[0] <= 5000); return recent.reduce((a, x) => a + x[1], 0) / 5 }
  snapshot(): NetStats {
    return {
      path: this.path, rttMs: Math.round(this.rttMs), inputDelayMs: Math.round(this.inputDelayMs), delayTicks: this.delayTicks,
      replicaBehind: this.replicaBehind, stalls20s: this.stallsIn(20_000), bytesOutPerSec: Math.round(this.rateOf(this.bytesOut)),
      bytesInPerSec: Math.round(this.rateOf(this.bytesIn)), framesOut: this.framesOut, framesIn: this.framesIn,
      digestsCompared: this.digestsCompared, unverified: this.unverified, resyncs: this.resyncs, pathSwitches: this.pathSwitches,
      slowedFor: this.slowedFor, rate: this.rate,
    }
  }
}
