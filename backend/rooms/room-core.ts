/**
 * cgs-rooms core: the room state machine for Carrot Defense duo play, with no Cloudflare types in it.
 *
 * worker.ts adapts it to one SQLite-backed Durable Object per room code (WebSocket hibernation); scripts/test-rooms-backend.mjs
 * drives it in process. Every entry point takes `now` and returns Actions (send, relay, close, alarm, save, delete) that the
 * adapter executes, so nothing here keeps timers: the room can hibernate between messages.
 *
 * Roles: lobby (players, profiles, loading, ready, the host's mode and level), the crypto side draw and seed, start and go
 * stamping, WebRTC signalling relay, the binary gameplay relay (fallback path), pause/resume/speed serialization, result relay,
 * presence with a reconnect grace enforced by an alarm, caps, and cleanup.
 */
import {
  CLOSE_CODE, DUO_LEVELS, GO_DELAY_MS, GRACE_MS, NAME_MAX, PAUSE_COOLDOWN_MS, PID_RE, RESUME_DELAY_MS,
  ROOM_CAPS, ROOM_CODE_ALPHABET, ROOM_CODE_RE, ROOM_EMPTY_MS, ROOM_TTL_MS, START_DELAY_MS, isLevelForMode,
} from '../../src/minigames/carrot/net/protocol.ts'
import type {
  ClientMsg, ErrorCode, MatchInfo, PauseReason, ResultOutcome, RoomMode, RoomPause, RoomPeek, RoomPlayer, RoomView, Seat,
  ServerMsg, Side,
} from '../../src/minigames/carrot/net/protocol.ts'

export type Player = RoomPlayer & { pid: string; leftAt: number; lastResume: number }
export type Counters = {
  connects: number; refused: number; textIn: number; binIn: number; textOut: number; binOut: number; dropped: number
  alarms: number; http: number; chunkBytes: number; relayedBytes: number
}
export type RoomState = {
  code: string
  created: number
  ver: string
  phase: 'lobby' | 'playing'
  mode: RoomMode
  level: number
  union: boolean
  players: Player[]
  host: Seat
  seed: number
  sides: [Side, Side]
  startAt: number
  goAt: number
  match: number
  pause: RoomPause | null
  resumeAt: number
  speed: 1 | 2
  /** When the last player went missing (0 while someone is seated). */
  emptySince: number
  counters: Counters
}
/** The socket attachment (survives hibernation through serializeAttachment). */
export type Conn = { pid: string; seat: Seat }
/** Per-socket rate window (adapter memory; resets on wake, which only forgives a burst). */
export type RateWindow = { sec: number; text: number; bin: number; chunk: number }
export type Action =
  | { a: 'send'; to: Seat; msg: ServerMsg }
  | { a: 'reply'; msg: ServerMsg }
  | { a: 'binary'; to: Seat; data: ArrayBuffer | Uint8Array }
  | { a: 'close'; to: Seat | 'self'; code: number; reason: string }
  | { a: 'alarm'; at: number }
  | { a: 'save' }
  | { a: 'delete' }
export type RoomConfig = { graceMs: number; ttlMs: number; emptyMs: number; random: (n: number) => Uint32Array }
export type ConnectResult =
  | { ok: true; seat: Seat; rejoin: boolean; actions: Action[] }
  | { ok: false; code: ErrorCode; close: number; status: number; detail?: string; actions: Action[] }

export const defaultRandom = (n: number) => crypto.getRandomValues(new Uint32Array(n))
export const roomConfig = (env: { GRACE_MS?: string; ROOM_TTL_MS?: string; ROOM_EMPTY_MS?: string }, random = defaultRandom): RoomConfig => ({
  graceMs: Number(env.GRACE_MS) || GRACE_MS,
  ttlMs: Number(env.ROOM_TTL_MS) || ROOM_TTL_MS,
  emptyMs: Number(env.ROOM_EMPTY_MS) || ROOM_EMPTY_MS,
  random,
})

/** A fresh 5-symbol code: rejection sampling keeps all 31 symbols equally likely (256 is not a multiple of 31). */
export function newCode(random: (n: number) => Uint32Array = defaultRandom): string {
  let s = ''
  while (s.length < 5) for (const word of random(4)) { const b = word & 0xff; if (b < 248 && s.length < 5) s += ROOM_CODE_ALPHABET[b % 31] }
  return s
}
export const validCode = (code: string) => ROOM_CODE_RE.test(code)
export const validVer = (ver: unknown): ver is string => typeof ver === 'string' && ver.length > 0 && ver.length <= 64 && /^[\w.+-]+$/.test(ver)
/** `${unity}+n${NET_VERSION}`: the numeric net version, when present, orders two stamps. */
function netVersionOf(ver: string): number { const m = /\+n(\d+)$/.exec(ver); return m ? Number(m[1]) : -1 }
export function cleanName(raw: unknown): string {
  // Control, zero-width and bidi-override characters never reach the other player's screen.
  // eslint-disable-next-line no-control-regex
  const s = String(raw ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim()
  return Array.from(s).slice(0, NAME_MAX).join('') || 'Player'
}
const freshCounters = (): Counters => ({ connects: 0, refused: 0, textIn: 0, binIn: 0, textOut: 0, binOut: 0, dropped: 0, alarms: 0, http: 0, chunkBytes: 0, relayedBytes: 0 })
const isMode = (v: unknown): v is RoomMode => v === 'duoBoss' || v === 'endless2p'
const PAUSE_REASONS: readonly PauseReason[] = ['manual', 'away', 'menu', 'silence', 'resync', 'restore']
const OUTCOMES: readonly ResultOutcome[] = ['cleared', 'won', 'lost', 'ended', 'unfinished']
const FINAL: readonly ResultOutcome[] = ['won', 'lost', 'ended', 'unfinished']
const ERROR_CLOSE: Partial<Record<ErrorCode, number>> = {
  'room-not-found': CLOSE_CODE.notFound, 'room-full': CLOSE_CODE.full, 'in-progress': CLOSE_CODE.inProgress,
  'version-mismatch': CLOSE_CODE.version, origin: CLOSE_CODE.origin, busy: CLOSE_CODE.busy,
}
const ERROR_STATUS: Partial<Record<ErrorCode, number>> = {
  'room-not-found': 404, 'room-full': 409, 'in-progress': 409, 'version-mismatch': 409, origin: 403, busy: 429, network: 400,
}
export const errorClose = (code: ErrorCode) => ERROR_CLOSE[code] ?? 4400
export const errorStatus = (code: ErrorCode) => ERROR_STATUS[code] ?? 400

export class RoomCore {
  state: RoomState | null = null
  readonly cfg: RoomConfig
  constructor(cfg: RoomConfig) { this.cfg = cfg }

  load(saved: RoomState | null | undefined) {
    this.state = saved ?? null
    if (this.state && !this.state.counters) this.state.counters = freshCounters()
  }
  private live(now: number): RoomState | null {
    const s = this.state
    return s && now - s.created < this.cfg.ttlMs ? s : null
  }

  // ---------------------------------------------------------------- HTTP-side (RPC from the Worker)

  /** Atomically claims this object for a new room code; false when a live room already holds it. */
  claim(code: string, ver: string, now: number): { ok: boolean; actions: Action[] } {
    if (this.live(now)) return { ok: false, actions: [] }
    this.state = {
      code, created: now, ver, phase: 'lobby', mode: 'duoBoss', level: DUO_LEVELS[6], union: false, players: [], host: 0,
      seed: 0, sides: [0, 1], startAt: 0, goAt: 0, match: 0, pause: null, resumeAt: 0, speed: 1, emptySince: now, counters: freshCounters(),
    }
    this.state.counters.http++
    return { ok: true, actions: [{ a: 'save' }, { a: 'alarm', at: now + this.cfg.emptyMs }] }
  }

  /** GET /rooms/:code: what a joiner would meet; with ver and pid it also says whether the join would be refused. */
  peek(now: number, q: { ver?: string | null; pid?: string | null; stats?: boolean } = {}): { status: number; body: RoomPeek & { stats?: Counters & { billed: number } } } {
    const s = this.live(now)
    if (s) s.counters.http++
    if (!s) return { status: q.ver ? 404 : 200, body: { exists: false, ...(q.ver ? { error: 'room-not-found' as ErrorCode } : {}) } }
    const body: RoomPeek & { stats?: Counters & { billed: number } } = {
      exists: true, phase: s.phase, mode: s.mode, level: s.level, players: s.players.length, full: s.players.length >= 2,
    }
    if (q.stats) body.stats = { ...s.counters, billed: billed(s.counters) }
    if (q.ver) {
      const refusal = this.refusal(s, q.ver, q.pid || '')
      body.joinable = !refusal
      if (refusal) { body.error = refusal.code; return { status: errorStatus(refusal.code), body: { ...body, ...(refusal.detail ? { detail: refusal.detail } : {}) } } }
    }
    return { status: 200, body }
  }

  private refusal(s: RoomState, ver: string, pid: string): { code: ErrorCode; detail?: string } | null {
    if (ver !== s.ver) {
      const mine = netVersionOf(ver), room = netVersionOf(s.ver)
      return { code: 'version-mismatch', detail: mine >= 0 && room >= 0 && mine !== room ? (mine < room ? 'you' : 'room') : 'unknown' }
    }
    if (s.players.some(p => p.pid === pid)) return null
    if (s.players.length >= 2) return { code: 'room-full' }
    if (s.phase === 'playing') return { code: 'in-progress' }
    return null
  }

  // ---------------------------------------------------------------- sockets

  connect(q: { pid: string; name: string; ver: string }, now: number): ConnectResult {
    const s = this.live(now)
    const refuse = (code: ErrorCode, detail?: string): ConnectResult => {
      if (s) s.counters.refused++
      return { ok: false, code, close: errorClose(code), status: errorStatus(code), detail, actions: [] }
    }
    if (!s) return refuse('room-not-found')
    if (!PID_RE.test(q.pid)) return refuse('network', 'pid')
    const no = this.refusal(s, q.ver, q.pid)
    if (no) return refuse(no.code, no.detail)
    const actions: Action[] = []
    let p = s.players.find(x => x.pid === q.pid)
    const rejoin = !!p
    if (!p) {
      const seat: Seat = s.players.some(x => x.seat === 0) ? 1 : 0
      p = { pid: q.pid, seat, name: cleanName(q.name), ready: false, connected: true, loaded: 0, unlocked: [], best: 0, startReady: false, leftAt: 0, lastResume: 0 }
      s.players.push(p)
      s.players.sort((a, b) => a.seat - b.seat)
      if (s.players.length === 1) s.host = seat
    } else {
      // A rejoin replaces the old socket (same pid keeps the seat, side and match, even if the old socket is half-open).
      actions.push({ a: 'close', to: p.seat, code: CLOSE_CODE.replaced, reason: 'replaced' })
    }
    const wasAway = !p.connected
    p.connected = true; p.leftAt = 0; p.name = cleanName(q.name || p.name)
    s.emptySince = 0
    s.counters.connects++
    actions.push({ a: 'save' })
    // The welcome goes out on the new socket after the adapter has accepted it (reply = that socket).
    actions.push({ a: 'reply', msg: { t: 'welcome', seat: p.seat, host: p.seat === s.host, now, room: this.view(), match: this.matchInfo() } })
    if (wasAway && rejoin) actions.push({ a: 'send', to: other(p.seat), msg: { t: 'peer', seat: p.seat, state: 'back' } })
    actions.push({ a: 'send', to: other(p.seat), msg: { t: 'room', room: this.view() } })
    actions.push(this.schedule(now))
    return { ok: true, seat: p.seat, rejoin, actions }
  }

  message(conn: Conn, text: string, now: number, rate: RateWindow): Action[] {
    const s = this.live(now)
    if (!s) return [{ a: 'close', to: 'self', code: CLOSE_CODE.closed, reason: 'room closed' }]
    s.counters.textIn++
    if (text.length > ROOM_CAPS.textBytes || !this.allow(rate, now, 'text')) { s.counters.dropped++; return [] }
    let m: ClientMsg
    try { m = JSON.parse(text) } catch { s.counters.dropped++; return [] }
    if (!m || typeof m !== 'object' || typeof (m as { t?: unknown }).t !== 'string') { s.counters.dropped++; return [] }
    const me = s.players.find(p => p.pid === conn.pid)
    if (!me) return [{ a: 'close', to: 'self', code: CLOSE_CODE.closed, reason: 'not in room' }]
    const out: Action[] = []
    if (!me.connected) out.push(...this.back(me, now))
    const err = (code: ErrorCode, detail?: string) => { out.push({ a: 'reply', msg: { t: 'error', code, ...(detail ? { detail } : {}) } }); return out }
    const lobbyChanged = () => { out.push({ a: 'save' }, ...this.broadcast({ t: 'room', room: this.view() })); return out }
    switch (m.t) {
      case 'time': out.push({ a: 'reply', msg: { t: 'time', c: Number(m.c) || 0, s: now } }); return out
      case 'signal': out.push({ a: 'send', to: other(me.seat), msg: { t: 'signal', from: me.seat, data: m.data } }); return out
      case 'profile': {
        me.name = cleanName(m.name)
        me.unlocked = Array.isArray(m.unlocked) ? [...new Set(m.unlocked.filter(x => Number.isInteger(x) && x >= 1 && x <= 99))].slice(0, 99).sort((a, b) => a - b) : []
        me.best = Number.isInteger(m.best) && m.best >= 0 && m.best <= 1e6 ? m.best : 0
        return lobbyChanged()
      }
      case 'status': {
        const loaded = Math.max(0, Math.min(1, Number(m.loaded) || 0))
        if (Math.abs(loaded - me.loaded) < 0.001) return out
        me.loaded = loaded
        return lobbyChanged()
      }
      case 'config': {
        if (me.seat !== s.host) return err('not-host')
        if (s.phase !== 'lobby') return err('in-progress')
        if (!isMode(m.mode) || !Number.isInteger(m.level) || !isLevelForMode(m.mode, m.level)) return err('bad-config')
        s.mode = m.mode; s.level = m.level; s.union = !!m.union
        for (const p of s.players) p.ready = false
        return lobbyChanged()
      }
      case 'ready':
        if (s.phase !== 'lobby') return out
        me.ready = !!m.on
        return lobbyChanged()
      case 'start': {
        if (me.seat !== s.host) return err('not-host')
        if (s.phase !== 'lobby') return err('in-progress')
        if (s.players.length !== 2 || !s.players.every(p => p.ready && p.connected && p.loaded >= 1)) return err('not-ready')
        if (!isLevelForMode(s.mode, s.level)) return err('bad-config')
        const r = this.cfg.random(2)
        // The side draw happens here, on neutral ground, so neither client can pick its half.
        s.sides = r[0] & 1 ? [0, 1] : [1, 0]
        s.seed = r[1] >>> 0
        s.startAt = now + START_DELAY_MS; s.goAt = 0; s.phase = 'playing'; s.match++
        s.pause = null; s.resumeAt = 0; s.speed = 1
        for (const p of s.players) { p.startReady = false; p.lastResume = 0 }
        out.push({ a: 'save' }, ...this.broadcast({ t: 'start', seed: s.seed, sides: s.sides, startAt: s.startAt, now, mode: s.mode, level: s.level, match: s.match }))
        out.push(...this.broadcast({ t: 'room', room: this.view() }))
        return out
      }
      case 'startReady': {
        if (s.phase !== 'playing' || s.goAt) return out
        me.startReady = true
        if (s.players.length === 2 && s.players.every(p => p.startReady)) {
          s.goAt = Math.max(now, s.startAt) + GO_DELAY_MS
          out.push({ a: 'save' }, ...this.broadcast({ t: 'go', goAt: s.goAt, now }))
        }
        return lobbyChanged()
      }
      case 'pause': {
        if (s.phase !== 'playing') return out
        const reason: PauseReason = PAUSE_REASONS.includes(m.reason) ? m.reason : 'manual'
        if (m.on) {
          if (s.pause) { out.push({ a: 'reply', msg: { t: 'pause', on: true, by: s.pause.by, reason: s.pause.reason, at: s.pause.since, now } }); return out }
          if (reason === 'manual' && me.lastResume && now - me.lastResume < PAUSE_COOLDOWN_MS) return err('pause-cooldown')
          s.pause = { by: me.seat, reason, since: now }
          s.resumeAt = 0
          out.push({ a: 'save' }, ...this.broadcast({ t: 'pause', on: true, by: me.seat, reason, at: now, now }))
          return out
        }
        // Already running (or counting down): tell the asker when play (re)starts, so a late resume never leaves it waiting.
        if (!s.pause) { out.push({ a: 'reply', msg: { t: 'pause', on: false, by: me.seat, reason, at: Math.max(s.resumeAt, now), now } }); return out }
        const was = s.pause.reason
        s.pause = null
        s.resumeAt = now + RESUME_DELAY_MS
        me.lastResume = now
        out.push({ a: 'save' }, ...this.broadcast({ t: 'pause', on: false, by: me.seat, reason: was, at: s.resumeAt, now }))
        return out
      }
      case 'speed': {
        if (s.phase !== 'playing') return out
        s.speed = m.v === 2 ? 2 : 1
        out.push({ a: 'save' }, ...this.broadcast({ t: 'speed', v: s.speed, by: me.seat }))
        return out
      }
      case 'result': {
        if (s.phase !== 'playing' || !OUTCOMES.includes(m.outcome)) return out
        const final = FINAL.includes(m.outcome)
        const msg: ServerMsg = { t: 'result', seat: me.seat, outcome: m.outcome, tick: Math.max(0, Math.floor(Number(m.tick) || 0)), final }
        if (Number.isFinite(m.score)) msg.score = Math.max(0, Math.floor(Number(m.score)))
        if (Number.isFinite(m.health)) msg.health = Math.max(0, Math.floor(Number(m.health)))
        out.push(...this.broadcast(msg))
        if (final) { this.toLobby(s); return lobbyChanged() }
        return out
      }
      case 'peer-silent': {
        // The sender hears nothing from its partner: treat a socket the runtime still thinks is open as away (iOS half-open TCP).
        const o = s.players.find(p => p.seat !== me.seat)
        if (!o || !o.connected) return out
        o.connected = false; o.leftAt = now
        out.push(...this.broadcast({ t: 'peer', seat: o.seat, state: 'away', graceMs: this.cfg.graceMs }))
        out.push(this.schedule(now))
        return lobbyChanged()
      }
      case 'lobby':
        if (s.phase === 'playing') this.toLobby(s)
        return lobbyChanged()
      case 'leave':
        out.push(...this.drop(me.seat, true, now), { a: 'close', to: 'self', code: 1000, reason: 'left' })
        return out
      default:
        s.counters.dropped++
        return out
    }
  }

  /** Binary gameplay frames: relayed byte for byte to the other seat, inside the caps. */
  binary(conn: Conn, data: ArrayBuffer | Uint8Array, now: number, rate: RateWindow): Action[] {
    const s = this.live(now)
    if (!s) return []
    s.counters.binIn++
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
    if (bytes.length === 0 || bytes.length > ROOM_CAPS.binaryBytes) { s.counters.dropped++; return [] }
    const chunk = bytes[0] === 3
    if (chunk ? !this.allow(rate, now, 'chunk', bytes.length) : !this.allow(rate, now, 'bin')) { s.counters.dropped++; return [] }
    const me = s.players.find(p => p.pid === conn.pid)
    if (!me) return []
    const out: Action[] = me.connected ? [] : this.back(me, now)
    const peer = s.players.find(p => p.seat !== me.seat)
    if (!peer) { s.counters.dropped++; return out }
    s.counters.binOut++
    s.counters.relayedBytes += bytes.length
    if (chunk) s.counters.chunkBytes += bytes.length
    out.push({ a: 'binary', to: peer.seat, data })
    return out
  }

  /** A socket closed; `others` = sockets the seat still holds (a rejoin replaced this one). */
  close(conn: Conn, code: number, others: number, now: number): Action[] {
    const s = this.live(now)
    if (!s || code === CLOSE_CODE.replaced || others > 0) return []
    if (!s.players.some(p => p.pid === conn.pid)) return []
    return this.drop(conn.seat, false, now)
  }

  alarm(now: number): Action[] {
    const s = this.state
    if (!s) return [{ a: 'delete' }]
    s.counters.alarms++
    const out: Action[] = []
    if (now - s.created >= this.cfg.ttlMs) return this.closeRoom()
    for (const p of [...s.players]) if (!p.connected && p.leftAt && now - p.leftAt >= this.cfg.graceMs - 50) out.push(...this.drop(p.seat, true, now))
    if (!this.state) return out
    if (s.players.length === 0 && s.emptySince && now - s.emptySince >= this.cfg.emptyMs - 50) return [...out, ...this.closeRoom()]
    out.push({ a: 'save' }, this.schedule(now))
    return out
  }

  // ---------------------------------------------------------------- helpers

  view(): RoomView {
    const s = this.state!
    return {
      code: s.code, phase: s.phase, mode: s.mode, level: s.level, union: s.union, ver: s.ver, match: s.match, host: s.host,
      players: s.players.map(p => ({ seat: p.seat, name: p.name, ready: p.ready, connected: p.connected, loaded: p.loaded, unlocked: p.unlocked, best: p.best, startReady: p.startReady })),
      pause: s.pause, speed: s.speed,
    }
  }
  matchInfo(): MatchInfo | null {
    const s = this.state!
    return s.phase === 'playing' ? { seed: s.seed, sides: s.sides, startAt: s.startAt, mode: s.mode, level: s.level, match: s.match, goAt: s.goAt } : null
  }
  private broadcast(msg: ServerMsg): Action[] {
    return (this.state?.players ?? []).map(p => ({ a: 'send', to: p.seat, msg }) as Action)
  }
  private back(p: Player, now: number): Action[] {
    p.connected = true; p.leftAt = 0
    return [{ a: 'save' }, { a: 'send', to: other(p.seat), msg: { t: 'peer', seat: p.seat, state: 'back' } }, this.schedule(now)]
  }
  private toLobby(s: RoomState) {
    s.phase = 'lobby'; s.pause = null; s.resumeAt = 0; s.goAt = 0
    for (const p of s.players) { p.ready = false; p.startReady = false }
  }
  private drop(seat: Seat, left: boolean, now: number): Action[] {
    const s = this.state
    if (!s) return []
    const p = s.players.find(x => x.seat === seat)
    if (!p) return []
    const out: Action[] = []
    if (left) {
      s.players = s.players.filter(x => x !== p)
      out.push({ a: 'send', to: other(seat), msg: { t: 'peer', seat, state: 'gone' } })
      // The last player leaving closes the room now (its code can be drawn again later).
      if (s.players.length === 0) return [...out, ...this.closeRoom()]
      if (s.host === seat) s.host = s.players[0].seat
      if (s.phase === 'playing') this.toLobby(s)
    } else {
      // An earlier peer-silent report already started this seat's grace: a late close does not extend it.
      if (p.connected || !p.leftAt) { p.connected = false; p.leftAt = now }
      out.push({ a: 'send', to: other(seat), msg: { t: 'peer', seat, state: 'away', graceMs: this.cfg.graceMs } })
    }
    out.push({ a: 'save' }, this.schedule(now), ...this.broadcast({ t: 'room', room: this.view() }))
    return out
  }
  private closeRoom(): Action[] {
    this.state = null
    return [{ a: 'close', to: 0, code: CLOSE_CODE.closed, reason: 'room closed' }, { a: 'close', to: 1, code: CLOSE_CODE.closed, reason: 'room closed' }, { a: 'delete' }]
  }
  /** One alarm per object: the earliest of a grace deadline, the empty-room timeout and the TTL. */
  private schedule(now: number): Action {
    const s = this.state!
    const times = [s.created + this.cfg.ttlMs]
    for (const p of s.players) if (!p.connected && p.leftAt) times.push(p.leftAt + this.cfg.graceMs)
    if (s.players.length === 0) { if (!s.emptySince) s.emptySince = now; times.push(s.emptySince + this.cfg.emptyMs) }
    return { a: 'alarm', at: Math.min(...times) }
  }
  private allow(rate: RateWindow, now: number, kind: 'text' | 'bin' | 'chunk', bytes = 0): boolean {
    const sec = Math.floor(now / 1000)
    if (rate.sec !== sec) { rate.sec = sec; rate.text = 0; rate.bin = 0; rate.chunk = 0 }
    if (kind === 'text') return ++rate.text <= ROOM_CAPS.textPerSec
    if (kind === 'bin') return ++rate.bin <= ROOM_CAPS.binaryPerSec
    rate.chunk += bytes
    return rate.chunk <= ROOM_CAPS.chunkBytesPerSec
  }
}

const other = (seat: Seat): Seat => (seat === 0 ? 1 : 0)
export const freshRate = (): RateWindow => ({ sec: 0, text: 0, bin: 0, chunk: 0 })
/** Durable Object requests the Free plan bills: connects, HTTP RPCs and alarms count 1; incoming WebSocket messages 1 per 20. */
export const billed = (c: Counters) => c.connects + c.refused + c.http + c.alarms + Math.ceil((c.textIn + c.binIn) / 20)
