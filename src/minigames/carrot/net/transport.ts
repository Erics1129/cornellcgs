/**
 * Path choice between the WebRTC DataChannels (P2P) and the room WebSocket relay, with liveness from app frames only.
 *
 *  - Gameplay frames ride DataChannel 'u' (unordered, no retransmits; redundancy lives in the payload) when P2P is healthy,
 *    otherwise the relay. On the relay path frames are also offered to 'u' when it is open, so its recovery is seen.
 *  - Reliable traffic (state chunks, controls) rides 'r' on P2P and the relay otherwise; important controls go both ways.
 *  - P2P is taken at once if the DataChannel opens within P2P_DEADLINE_MS of ICE starting, otherwise after P2P_CLEAN_MS of
 *    clean 'u' frames. SWITCH_TO_RELAY_MS of silence on 'u' switches to the relay and restarts ICE (readyState and ICE states
 *    were measured to lie for 6-40 s after a cut).
 *  - The frame format is identical on both paths and acks are app-level, so a switch mid-match loses nothing.
 */
import { FLAG, HICCUP_MS, MAX_FRAME_BYTES, P2P_CLEAN_MS, P2P_DEADLINE_MS, SILENCE_PAUSE_MS, SWITCH_TO_RELAY_MS } from './protocol.ts'
import type { PathKind, Seat } from './protocol.ts'
import { decodeFrame, encodeFrame } from './frames.ts'
import type { Frame } from './frames.ts'
import type { NetStatsTracker } from './stats.ts'

export type RelayPath = { open(): boolean; send(bytes: Uint8Array): boolean }
export type PeerPath = { open(): boolean; send(channel: 'u' | 'r', bytes: Uint8Array): boolean; restartIce(): void }
export type Via = 'u' | 'r' | 'relay'
type FrameIn = Frame extends infer F ? (F extends Frame ? Omit<F, 'seq' | 'flags'> & { flags?: number } : never) : never

export type TransportOptions = {
  now: () => number
  /** The partner's seat (frames carry no seat; the transport knows who is on the other end). */
  partner: Seat
  relay: RelayPath
  stats: NetStatsTracker
  onFrame: (frame: Frame, via: Via) => void
  onPath?: (path: PathKind) => void
}

export class Transport {
  path: PathKind = 'none'
  peer: PeerPath | null = null
  lastHeard = 0
  lastU = 0
  lastRelay = 0
  uCleanSince = 0
  iceStartedAt = 0
  private seq = 0
  private lastRestart = 0
  private o: TransportOptions
  /** Extra flags on every outgoing gameplay frame (paused, away). */
  flags = 0
  constructor(o: TransportOptions) { this.o = o }

  /** A PeerLink (or null when WebRTC is unavailable). ICE starts now; the deadline counts from here. */
  setPeer(peer: PeerPath | null) { this.peer = peer; this.iceStartedAt = this.o.now() }

  private encode(f: FrameIn, relay: boolean): Uint8Array {
    this.seq = (this.seq + 1) & 0xffff
    return encodeFrame({ ...f, seq: this.seq, flags: (f.flags ?? 0) | this.flags | (relay ? FLAG.relay : 0) } as Frame)
  }
  /** A gameplay frame (duo, lockstep, ping/pong): unreliable path with redundancy in the payload. */
  send(f: FrameIn): number {
    const peerOpen = !!this.peer && this.peer.open()
    if (this.path === 'p2p' && peerOpen) {
      const bytes = this.encode(f, false)
      if (this.peer!.send('u', bytes)) { this.o.stats.sent(bytes.length); return bytes.length }
    }
    const bytes = this.encode(f, true)
    if (bytes.length > MAX_FRAME_BYTES) return 0
    let sent = 0
    if (this.o.relay.open() && this.o.relay.send(bytes)) sent = bytes.length
    // Offer the same frame to 'u' while it is open, so the partner can see P2P come back.
    if (peerOpen && this.peer!.send('u', bytes)) sent = sent || bytes.length
    if (sent) this.o.stats.sent(sent)
    return sent
  }
  /** Reliable traffic (state chunks, chunk acks, controls). dual: on P2P also send over the relay (rare, important controls). */
  sendReliable(f: FrameIn, dual = false): boolean {
    const peerOpen = !!this.peer && this.peer.open()
    let ok = false
    if (this.path === 'p2p' && peerOpen) {
      const bytes = this.encode(f, false)
      ok = this.peer!.send('r', bytes)
      if (ok) this.o.stats.sent(bytes.length)
      if (ok && !dual) return true
    }
    const bytes = this.encode(f, true)
    if (bytes.length <= MAX_FRAME_BYTES && this.o.relay.open() && this.o.relay.send(bytes)) { this.o.stats.sent(bytes.length); ok = true }
    return ok
  }

  receive(data: ArrayBuffer | Uint8Array, via: Via) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
    const f = decodeFrame(bytes, this.o.partner)
    if (!f) { this.o.stats.framesBad++; return }
    const t = this.o.now()
    this.o.stats.received(bytes.length)
    this.lastHeard = t
    if (via === 'u') {
      if (!this.lastU || t - this.lastU > HICCUP_MS) this.uCleanSince = t
      this.lastU = t
    } else if (via === 'relay') this.lastRelay = t
    this.o.onFrame(f, via)
  }

  pump() {
    const t = this.o.now()
    const peerOpen = !!this.peer && this.peer.open()
    const relayOpen = this.o.relay.open()
    if (this.path === 'p2p') {
      if (!peerOpen || t - this.lastU > SWITCH_TO_RELAY_MS) {
        this.setPath(relayOpen ? 'relay' : 'none')
        this.uCleanSince = 0
        if (this.peer && t - this.lastRestart > 5000) { this.lastRestart = t; try { this.peer.restartIce() } catch { /* closed */ } }
      }
      return
    }
    const fresh = peerOpen && this.lastU && t - this.lastU < HICCUP_MS
    const early = fresh && t - this.iceStartedAt < P2P_DEADLINE_MS
    const clean = fresh && this.uCleanSince && t - this.uCleanSince >= P2P_CLEAN_MS
    if (early || clean) { this.setPath('p2p'); return }
    if (this.path === 'none' && relayOpen) this.setPath('relay')
    else if (this.path === 'relay' && !relayOpen) this.setPath('none')
  }
  private setPath(p: PathKind) {
    if (p === this.path) return
    if (this.path !== 'none' && p !== 'none') this.o.stats.pathSwitches++
    this.path = p
    this.o.stats.path = p
    this.o.onPath?.(p)
  }
  /** Milliseconds since anything was heard from the partner (any path). */
  silence() { return this.lastHeard ? this.o.now() - this.lastHeard : 0 }
  get hiccup() { return this.lastHeard > 0 && this.silence() > HICCUP_MS }
  get silent() { return this.lastHeard > 0 && this.silence() > SILENCE_PAUSE_MS }
  /** Forget liveness (a new match, or the partner rejoined): silence counts from the next frame. */
  resetLiveness() { this.lastHeard = 0; this.lastU = 0; this.uCleanSince = 0 }
}
