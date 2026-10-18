/**
 * WebRTC DataChannel pair over public STUN (plus TURN when the room Worker can mint it), negotiated with the perfect-negotiation
 * pattern (the host is impolite) and trickled ICE through the room's signal relay. Two pre-negotiated channels:
 *   u  id 0, ordered:false, maxRetransmits:0   every tick and op frame (redundancy is in the payload)
 *   r  id 1, ordered, reliable                 state chunks and controls
 * Never waits for ICE gathering to finish (WebKit never signals end-of-candidates); liveness is the transport's job.
 */
import { STUN_URLS } from './protocol.ts'

type Signal = { description?: RTCSessionDescriptionInit | null; candidate?: RTCIceCandidateInit | null }
export type PeerLinkOptions = {
  polite: boolean
  signal: (data: Signal) => void
  onMessage: (channel: 'u' | 'r', data: ArrayBuffer) => void
  onOpen?: () => void
  onState?: (state: string) => void
  iceServers?: RTCIceServer[]
  /** Injected for tests; defaults to globalThis.RTCPeerConnection. */
  RTCPeerConnection?: typeof RTCPeerConnection
}

export const rtcSupported = () => typeof globalThis.RTCPeerConnection === 'function'

export class PeerLink {
  pc: RTCPeerConnection
  u: RTCDataChannel | null = null
  r: RTCDataChannel | null = null
  openedAt = 0
  closed = false
  private makingOffer = false
  private ignoreOffer = false
  private settingAnswer = false
  private pendingCandidates: RTCIceCandidateInit[] = []
  private o: PeerLinkOptions
  constructor(o: PeerLinkOptions) {
    this.o = o
    const PC = o.RTCPeerConnection ?? globalThis.RTCPeerConnection
    this.pc = new PC({ iceServers: o.iceServers ?? [{ urls: [...STUN_URLS] }] })
    this.pc.onicecandidate = e => { if (e.candidate) o.signal({ candidate: e.candidate.toJSON() }) }
    this.pc.onnegotiationneeded = () => { void this.offer() }
    this.pc.onconnectionstatechange = () => o.onState?.(this.pc.connectionState)
    // The impolite side (host) creates the channels first, which starts negotiation; the polite side adds its
    // pre-negotiated twins when the first offer arrives (no second offer, so no glare in the common case).
    if (!o.polite) this.channels()
  }
  private channels() {
    if (this.u) return
    this.u = this.pc.createDataChannel('u', { negotiated: true, id: 0, ordered: false, maxRetransmits: 0 })
    this.r = this.pc.createDataChannel('r', { negotiated: true, id: 1, ordered: true })
    for (const [name, ch] of [['u', this.u], ['r', this.r]] as const) {
      ch.binaryType = 'arraybuffer'
      ch.onmessage = e => { if (e.data instanceof ArrayBuffer) this.o.onMessage(name, e.data) }
      ch.onopen = () => { if (this.open() && !this.openedAt) { this.openedAt = performance.now(); this.o.onOpen?.() } }
    }
  }
  private async offer() {
    try {
      this.makingOffer = true
      await this.pc.setLocalDescription()
      this.o.signal({ description: this.pc.localDescription?.toJSON() ?? null })
    } catch { /* superseded by a newer negotiation */ } finally { this.makingOffer = false }
  }
  /** A signal from the partner (relayed by the room). */
  async handle(data: Signal) {
    if (this.closed || !data) return
    try {
      if (data.description) {
        const d = data.description
        const ready = !this.makingOffer && (this.pc.signalingState === 'stable' || this.settingAnswer)
        const collision = d.type === 'offer' && !ready
        this.ignoreOffer = !this.o.polite && collision
        if (this.ignoreOffer) return
        this.settingAnswer = d.type === 'answer'
        await this.pc.setRemoteDescription(d)
        this.settingAnswer = false
        if (d.type === 'offer') {
          this.channels()
          await this.pc.setLocalDescription()
          this.o.signal({ description: this.pc.localDescription?.toJSON() ?? null })
        }
        for (const c of this.pendingCandidates.splice(0)) await this.pc.addIceCandidate(c).catch(() => {})
      } else if (data.candidate) {
        if (!this.pc.remoteDescription) { this.pendingCandidates.push(data.candidate); return }
        await this.pc.addIceCandidate(data.candidate).catch(e => { if (!this.ignoreOffer) throw e })
      }
    } catch { /* a stale description after a restart; the next negotiation fixes it */ }
  }
  open() { return !!this.u && !!this.r && this.u.readyState === 'open' && this.r.readyState === 'open' }
  send(channel: 'u' | 'r', bytes: Uint8Array): boolean {
    const ch = channel === 'u' ? this.u : this.r
    if (!ch || ch.readyState !== 'open') return false
    // A congested channel would only add latency: drop the redundant frame and let the next one carry it.
    if (channel === 'u' && ch.bufferedAmount > 64 * 1024) return false
    try { ch.send(bytes as Uint8Array<ArrayBuffer>); return true } catch { return false }
  }
  restartIce() { if (!this.closed) try { this.pc.restartIce() } catch { /* old browsers: the next offer does it */ } }
  /** Bytes on the selected candidate pair and its type, from getStats. */
  async stats(): Promise<{ bytesSent: number; bytesReceived: number; local?: string; remote?: string; rttMs?: number }> {
    const out = { bytesSent: 0, bytesReceived: 0 } as { bytesSent: number; bytesReceived: number; local?: string; remote?: string; rttMs?: number }
    try {
      const report = await this.pc.getStats()
      let pair: RTCIceCandidatePairStats | undefined
      report.forEach((s: RTCStats & { selectedCandidatePairId?: string }) => { if (s.type === 'transport' && s.selectedCandidatePairId) pair = report.get(s.selectedCandidatePairId) })
      if (!pair) report.forEach((s: RTCStats) => { const p = s as RTCIceCandidatePairStats; if (s.type === 'candidate-pair' && p.nominated && p.state === 'succeeded') pair = p })
      if (pair) {
        out.bytesSent = pair.bytesSent ?? 0; out.bytesReceived = pair.bytesReceived ?? 0
        out.rttMs = pair.currentRoundTripTime != null ? pair.currentRoundTripTime * 1000 : undefined
        const l = report.get(pair.localCandidateId), r = report.get(pair.remoteCandidateId)
        out.local = l?.candidateType; out.remote = r?.candidateType
      }
    } catch { /* closed */ }
    return out
  }
  close() { this.closed = true; try { this.u?.close(); this.r?.close(); this.pc.close() } catch { /* already closed */ } }
}
