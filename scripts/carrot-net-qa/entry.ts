/**
 * Browser entry for the net-layer QA page (scripts/carrot-net-qa/page.html): the real session, rooms client, WebRTC link,
 * transport and controllers from src/minigames/carrot/net, driven by the FakeEngine instead of Unity. Bundled by run.mjs with
 * esbuild into output/carrot-net-qa/bundle.js. Exposes window.qa for Playwright.
 *
 * Candidate filters (?filter=) are applied to what this page SENDS: all | host | srflx | proxy. In proxy mode each IPv4 UDP host
 * candidate is replaced by a UDP impairment proxy the harness opens (window.__proxyFor), so the DataChannel path can be delayed,
 * jittered, dropped or blackholed while the room relay keeps working.
 */
import { createDuoSession } from '../../src/minigames/carrot/net/session.ts'
import { FakeEngine } from '../../src/minigames/carrot/net/fakeEngine.ts'
import type { DuoSession, PageCommand, Profile, RoomMode, SessionEvent } from '../../src/minigames/carrot/net/protocol.ts'

declare global {
  interface Window {
    qa: unknown
    __proxyFor?: (ip: string, port: number, type: string) => Promise<{ ip: string; port: number }>
  }
}
const q = new URLSearchParams(location.search)
const filter = q.get('filter') || 'all'
const rooms = q.get('rooms') || 'http://127.0.0.1:8890'
const stun = q.get('stun') || 'on'
const ver = q.get('ver') || 'qa+n1'
const health = Number(q.get('health') || 0) || undefined
const waves = Number(q.get('waves') || 1)

const candType = (c: string) => / typ (\w+)/.exec(c)?.[1] || '?'
function keep(c: string) {
  const t = candType(c)
  if (filter === 'all') return true
  if (filter === 'host') return t === 'host'
  if (filter === 'srflx') return t === 'srflx'
  if (filter === 'proxy') return (t === 'host' || t === 'srflx') && !/\.local /.test(c) && / udp /i.test(c) && /^candidate:\S+ 1 /.test(c) && !/:/.test(c.split(' ')[4])
  return true
}
const pcs: RTCPeerConnection[] = []
/** RTCPeerConnection with outgoing candidate filtering/rewriting and STUN control, recorded for getStats. */
class QaPeerConnection extends RTCPeerConnection {
  constructor(config?: RTCConfiguration) {
    super({ ...config, iceServers: stun === 'on' ? config?.iceServers : stun === 'bogus' ? [{ urls: 'stun:192.0.2.1:3478' }] : [] })
    pcs.push(this)
  }
  set onicecandidate(fn: ((ev: RTCPeerConnectionIceEvent) => void) | null) {
    super.onicecandidate = !fn ? null : (ev: RTCPeerConnectionIceEvent) => {
      if (!ev.candidate) return fn(ev)
      const c = ev.candidate.candidate
      if (!keep(c)) return
      if (filter !== 'proxy' || !window.__proxyFor) return fn(ev)
      const parts = c.split(' ')
      void window.__proxyFor(parts[4], Number(parts[5]), parts[7]).then(r => {
        const s = [parts[0], parts[1], parts[2], parts[3], r.ip, String(r.port), 'typ', 'host', 'generation', '0'].join(' ')
        const cand = new RTCIceCandidate({ candidate: s, sdpMid: ev.candidate!.sdpMid, sdpMLineIndex: ev.candidate!.sdpMLineIndex })
        fn({ candidate: cand } as RTCPeerConnectionIceEvent)
      })
    }
  }
  get onicecandidate() { return super.onicecandidate }
  setLocalDescription(desc?: RTCLocalSessionDescriptionInit): Promise<void> { return super.setLocalDescription(desc) }
}
// strip candidates embedded in descriptions (trickle carries them; filters must apply to all of them)
const origLocal = Object.getOwnPropertyDescriptor(RTCPeerConnection.prototype, 'localDescription')!
Object.defineProperty(QaPeerConnection.prototype, 'localDescription', {
  get(this: RTCPeerConnection) {
    const d = origLocal.get!.call(this) as RTCSessionDescription | null
    if (!d || filter === 'all') return d
    const sdp = d.sdp.split('\r\n').filter(l => !l.startsWith('a=candidate')).join('\r\n')
    return { type: d.type, sdp, toJSON: () => ({ type: d.type, sdp }) }
  },
})

const engine = new FakeEngine({ now: () => Date.now(), waves: () => waves, health })
let raf = 0
const frame = () => { engine.frame(); raf = requestAnimationFrame(frame) }
raf = requestAnimationFrame(frame)
const events: Array<[number, SessionEvent]> = []
const marks: Record<string, number> = {}
let session: DuoSession = make()
function make(): DuoSession {
  const s = createDuoSession({ engine, roomsUrl: rooms, ver, RTCPeerConnection: QaPeerConnection as unknown as typeof RTCPeerConnection })
  s.onEvent(e => { events.push([Date.now(), e]); if (e.type === 'pathChanged') marks['path:' + e.path] = marks['path:' + e.path] || Date.now() })
  s.subscribe(snap => { if (!marks['phase:' + snap.phase]) marks['phase:' + snap.phase] = Date.now() })
  return s
}
const page = (cmd: PageCommand) => { if (!session.send(cmd)) engine.send(cmd) }
const profile = (name: string): Profile => ({ name, unlocked: [4, 8, 12, 16, 20, 24, 25, 26, 27, 28, 29], best: 0 })
async function rtcStats() {
  const out = { bytesSent: 0, bytesReceived: 0, local: '', remote: '', state: '' }
  for (const pc of pcs) {
    if (pc.connectionState === 'closed') continue
    try {
      const r = await pc.getStats()
      r.forEach((s: RTCStats & Record<string, unknown>) => {
        if (s.type === 'transport' && typeof s.selectedCandidatePairId === 'string') {
          const p = r.get(s.selectedCandidatePairId) as RTCIceCandidatePairStats | undefined
          if (p) { out.bytesSent += p.bytesSent ?? 0; out.bytesReceived += p.bytesReceived ?? 0; out.local = (r.get(p.localCandidateId) as { candidateType?: string })?.candidateType ?? ''; out.remote = (r.get(p.remoteCandidateId) as { candidateType?: string })?.candidateType ?? '' }
        }
        if (s.type === 'data-channel') { /* app level counts live in the session stats */ }
      })
      out.state = pc.connectionState
    } catch { /* closed */ }
  }
  return out
}
window.qa = {
  marks, events,
  async create(name: string) { const code = await session.create(profile(name)); location.hash = 'room=' + code; return code },
  async join(code: string, name: string) { await session.join(code, profile(name)); location.hash = 'room=' + code },
  async resume(name: string) { const code = /room=(\w+)/.exec(location.hash)?.[1]; if (!code) throw new Error('no room'); await session.resume(code, profile(name)); return code },
  loaded: (f: number) => session.setLoaded(f),
  configure: (mode: RoomMode, level: number) => session.configure(mode, level),
  ready: (on: boolean) => session.setReady(on),
  start: () => session.start(),
  pressStart: () => page({ type: 'start' }),
  cmd: (c: PageCommand) => page(c),
  raw: (c: PageCommand) => engine.send(c),
  pause: (on: boolean) => session.pause(on),
  leave: () => session.leave(),
  snap: () => session.get(),
  engine: () => ({ mode: engine.mode, own: engine.stateOf('own'), replica: engine.stateOf('replica'), shared: engine.stateOf('shared'), reentry: engine.reentry, rejects: engine.rejects }),
  rtcStats,
  pcStates: () => pcs.map(p => [p.connectionState, p.iceConnectionState]),
  stop() { cancelAnimationFrame(raf); session.dispose() },
  reset() { session.dispose(); session = make() },
}
document.title = 'carrot-net-qa ready'
