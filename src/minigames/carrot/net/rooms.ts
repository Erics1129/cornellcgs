/**
 * The room WebSocket client (lobby, signalling, presence, clock samples and the relay path) plus the HTTP helpers.
 *
 * Refusals are read before the socket opens: GET /rooms/:code?ver&pid answers 404/409/403 with a code (a browser cannot read
 * the status of a refused upgrade). A socket the room refuses anyway sends {t:'error'} and closes 44xx.
 * Reconnects back off 0.25, 0.5, 1, 2, 4, 4... s until the grace ends; a 4001 close means another tab took the seat.
 */
import { CLOSE_CODE, GRACE_MS, RECONNECT_BACKOFF_MS, ROOM_CODE_RE, errorCopy } from './protocol.ts'
import type { ClientMsg, ErrorCode, RoomPeek, ServerMsg, SessionError } from './protocol.ts'

export type RoomState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed'
type WS = {
  readyState: number; binaryType: string; send(data: string | ArrayBufferLike | ArrayBufferView): void; close(code?: number, reason?: string): void
  onopen: ((ev: unknown) => void) | null; onmessage: ((ev: { data: unknown }) => void) | null; onclose: ((ev: { code: number; reason?: string }) => void) | null; onerror: ((ev: unknown) => void) | null
}
export type WebSocketCtor = new (url: string) => WS
export type RoomClientOptions = {
  base: string
  code: string
  pid: string
  name: string
  ver: string
  now: () => number
  WebSocket?: WebSocketCtor
  onMessage: (msg: ServerMsg) => void
  onBinary: (bytes: Uint8Array) => void
  onState: (state: RoomState, error?: SessionError) => void
  graceMs?: number
}

export const sessionError = (code: ErrorCode, detail?: string): SessionError => ({ code, message: errorCopy(code, detail), retry: code === 'network' || code === 'busy' || code === 'desync' || code === 'partner-left' })
const httpBase = (base: string) => base.replace(/\/+$/, '')
const wsBase = (base: string) => httpBase(base).replace(/^http/, 'ws')
const statusCode = (status: number): ErrorCode => (status === 404 ? 'room-not-found' : status === 403 ? 'origin' : status === 429 || status === 503 ? 'busy' : 'network')

/** POST /rooms {ver} -> code. Throws a SessionError. */
export async function createRoom(base: string, ver: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  let r: Response
  try { r = await fetchImpl(httpBase(base) + '/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ver }) }) } catch { throw sessionError('network') }
  const body = (await r.json().catch(() => null)) as { code?: string; error?: ErrorCode } | null
  if (r.ok && body && typeof body.code === 'string' && ROOM_CODE_RE.test(body.code)) return body.code
  throw sessionError(body?.error && body.error !== 'version-mismatch' ? body.error : statusCode(r.status))
}
/** GET /rooms/:code?ver&pid: whether a join would be refused, with a readable code. Throws a SessionError when refused. */
export async function checkRoom(base: string, code: string, ver: string, pid: string, fetchImpl: typeof fetch = fetch): Promise<RoomPeek> {
  let r: Response
  try { r = await fetchImpl(`${httpBase(base)}/rooms/${encodeURIComponent(code)}?${new URLSearchParams({ ver, pid })}`) } catch { throw sessionError('network') }
  const body = (await r.json().catch(() => null)) as (RoomPeek & { detail?: string }) | null
  if (r.ok && body && body.exists) return body
  if (body && body.error) throw sessionError(body.error, body.detail)
  throw sessionError(r.ok ? 'room-not-found' : statusCode(r.status))
}
/** GET /turn: TURN servers when the Worker has a key; [] otherwise. Never throws. */
export async function fetchIceServers(base: string, fetchImpl: typeof fetch = fetch): Promise<RTCIceServer[]> {
  try {
    const r = await fetchImpl(httpBase(base) + '/turn')
    const body = (await r.json()) as { iceServers?: RTCIceServer[] }
    return Array.isArray(body.iceServers) ? body.iceServers : []
  } catch { return [] }
}

export class RoomClient {
  state: RoomState = 'idle'
  private ws: WS | null = null
  private o: RoomClientOptions
  private queue: string[] = []
  private attempt = 0
  private droppedAt = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private keepAlive: ReturnType<typeof setInterval> | null = null
  private ended = false
  private gotError: SessionError | null = null
  /** Messages and bytes sent over the room socket (QA: relay budget). */
  sentText = 0
  sentBinary = 0
  constructor(o: RoomClientOptions) { this.o = o }

  connect() {
    if (this.ended) return
    this.setState(this.attempt ? 'reconnecting' : 'connecting')
    const Ctor = this.o.WebSocket ?? (globalThis.WebSocket as unknown as WebSocketCtor)
    const q = new URLSearchParams({ pid: this.o.pid, name: this.o.name, ver: this.o.ver })
    let ws: WS
    try { ws = new Ctor(`${wsBase(this.o.base)}/rooms/${this.o.code}/ws?${q}`) } catch { this.retry(); return }
    ws.binaryType = 'arraybuffer'
    this.ws = ws
    ws.onopen = () => {
      if (this.ws !== ws) return
      this.attempt = 0; this.droppedAt = 0
      this.setState('open')
      for (const m of this.queue.splice(0)) ws.send(m)
      if (this.keepAlive) clearInterval(this.keepAlive)
      // Answered by the runtime's auto-response: never wakes the room, never billed.
      this.keepAlive = setInterval(() => { if (ws.readyState === 1) ws.send('ping') }, 25_000)
    }
    ws.onmessage = ev => {
      if (this.ws !== ws) return
      const d = ev.data
      if (typeof d === 'string') {
        if (d === 'pong') return
        let m: ServerMsg
        try { m = JSON.parse(d) } catch { return }
        if (m && m.t === 'error' && (m.code === 'room-not-found' || m.code === 'room-full' || m.code === 'in-progress' || m.code === 'version-mismatch' || m.code === 'origin' || m.code === 'busy')) this.gotError = sessionError(m.code, m.detail)
        this.o.onMessage(m)
      } else if (d instanceof ArrayBuffer) this.o.onBinary(new Uint8Array(d))
      else if (ArrayBuffer.isView(d)) this.o.onBinary(new Uint8Array(d.buffer, d.byteOffset, d.byteLength))
    }
    ws.onerror = () => {}
    ws.onclose = ev => {
      if (this.ws !== ws) return
      this.ws = null
      if (this.keepAlive) { clearInterval(this.keepAlive); this.keepAlive = null }
      if (this.ended) return
      if (this.gotError) { this.end(this.gotError); return }
      if (ev.code === CLOSE_CODE.replaced) { this.end({ code: 'network', message: 'This room is open in another tab.', retry: false }); return }
      if (ev.code === CLOSE_CODE.closed) { this.end(sessionError('room-not-found')); return }
      if (ev.code === 1000 || (ev.code >= 4400 && ev.code < 4500)) { this.end(sessionError(ev.code === 1000 ? 'partner-left' : 'network')); return }
      this.retry()
    }
  }
  private retry() {
    if (this.ended) return
    const t = this.o.now()
    if (!this.droppedAt) this.droppedAt = t
    if (t - this.droppedAt > (this.o.graceMs ?? GRACE_MS)) { this.end(sessionError('network')); return }
    const wait = RECONNECT_BACKOFF_MS[Math.min(this.attempt, RECONNECT_BACKOFF_MS.length - 1)]
    this.attempt++
    this.setState('reconnecting')
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => { this.timer = null; this.connect() }, wait)
  }
  /** Reconnect now (pageshow from the back-forward cache, coming back online). */
  kick() { if (!this.ended && this.state !== 'open') { if (this.timer) clearTimeout(this.timer); this.timer = null; this.attempt = 0; this.connect() } }
  /** Drops a socket the page knows is dead (after a freeze) and reconnects. */
  recycle() { if (this.ended) return; const ws = this.ws; this.ws = null; try { ws?.close(4000, 'recycle') } catch { /* gone */ } this.retry() }
  private setState(s: RoomState, error?: SessionError) { this.state = s; this.o.onState(s, error) }
  private end(error?: SessionError) {
    if (this.ended) return
    this.ended = true
    if (this.timer) clearTimeout(this.timer)
    if (this.keepAlive) clearInterval(this.keepAlive)
    this.setState('closed', error)
  }
  open() { return !!this.ws && this.ws.readyState === 1 && this.state === 'open' }
  send(msg: ClientMsg) {
    const text = JSON.stringify(msg)
    this.sentText++
    if (this.open()) { try { this.ws!.send(text); return } catch { /* fall through to the queue */ } }
    // Lobby and match controls survive a reconnect; signalling and time samples are only useful now.
    if (msg.t !== 'signal' && msg.t !== 'time') { this.queue.push(text); if (this.queue.length > 64) this.queue.shift() }
  }
  sendBinary(bytes: Uint8Array): boolean {
    if (!this.open()) return false
    try { this.ws!.send(bytes); this.sentBinary++; return true } catch { return false }
  }
  /** Leaves the room for good (explicit leave) or just closes (dispose). */
  close(leave = false) {
    if (leave && this.open()) { try { this.ws!.send(JSON.stringify({ t: 'leave' })) } catch { /* gone */ } }
    const ws = this.ws
    this.end()
    try { ws?.close(1000, leave ? 'left' : 'closed') } catch { /* gone */ }
  }
}
