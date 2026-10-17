/**
 * cgs-rooms: room codes, lobby, signalling and the gameplay relay for Carrot Defense duo play.
 *
 * One SQLite-backed Durable Object per room code (Free plan: `new_sqlite_classes`), WebSocket Hibernation API
 * (ctx.acceptWebSocket, serializeAttachment, a runtime auto-response for 'ping'), alarms instead of timers. The room logic is
 * room-core.ts; this file only adapts it. A Worker module may export only handlers and classes.
 *
 * Routes:
 *   OPTIONS *                      CORS preflight
 *   POST /rooms {ver}              -> {code}                     (429 busy when the daily quota or the DO is out)
 *   GET  /rooms/:code[?ver&pid]    -> RoomPeek                   (404/409/403 readable by fetch before opening the socket)
 *   GET  /rooms/:code/ws?pid&name&ver  WebSocket                 (refusals: accept, {t:'error',code}, close 44xx)
 *   GET  /turn                     -> {iceServers}               (Cloudflare Realtime TURN when TURN_KEY_ID/TURN_KEY_API_TOKEN are set)
 *   GET  /health                   -> ok
 */
import { DurableObject } from 'cloudflare:workers'
import { RoomCore, freshRate, newCode, roomConfig, validCode, validVer } from './room-core.ts'
import type { Action, Conn, RateWindow, RoomState } from './room-core.ts'
import { CLOSE_CODE } from '../../src/minigames/carrot/net/protocol.ts'

interface Env {
  ROOMS: DurableObjectNamespace<Room>
  /** Comma-separated exact origins (the site). */
  ALLOWED_ORIGINS: string
  /** "1" (wrangler dev / env.dev): also allow http://localhost, 127.0.0.1 and private LAN origins, plus DEV_ORIGINS. */
  DEV?: string
  /** Extra exact origins allowed when DEV is "1" (an https tunnel for phone tests). */
  DEV_ORIGINS?: string
  GRACE_MS?: string
  ROOM_TTL_MS?: string
  ROOM_EMPTY_MS?: string
  /** Cloudflare Realtime TURN key (secret); without it /turn returns no servers and clients fall back to the relay. */
  TURN_KEY_ID?: string
  TURN_KEY_API_TOKEN?: string
}

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[\w-]+\.local)(:\d+)?$/
function originOk(req: Request, env: Env): boolean {
  const o = req.headers.get('Origin')
  if (!o) return true // native and test clients; browsers always send Origin on fetch with CORS and on WebSocket
  const list = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
  if (list.includes(o)) return true
  if (env.DEV === '1') return LOCAL_ORIGIN.test(o) || (env.DEV_ORIGINS || '').split(',').map(s => s.trim()).includes(o)
  return false
}
function cors(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': req.headers.get('Origin') || '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}
const json = (req: Request, body: unknown, status = 200) => Response.json(body, { status, headers: { ...cors(req), 'Cache-Control': 'no-store' } })

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) })
    if (url.pathname === '/health') return new Response('ok', { headers: cors(req) })
    if (!originOk(req, env)) {
      // A browser cannot read the status of a refused upgrade: accept, explain, close.
      if (req.headers.get('Upgrade') === 'websocket') return refuseSocket('origin', CLOSE_CODE.origin)
      return json(req, { error: 'origin' }, 403)
    }
    try {
      if (url.pathname === '/rooms' && req.method === 'POST') {
        const body = (await req.json().catch(() => ({}))) as { ver?: unknown }
        if (!validVer(body.ver)) return json(req, { error: 'version-mismatch' }, 400)
        for (let i = 0; i < 6; i++) {
          const code = newCode()
          if (await env.ROOMS.get(env.ROOMS.idFromName(code)).claim(code, body.ver)) return json(req, { code })
        }
        return json(req, { error: 'busy' }, 503)
      }
      if (url.pathname === '/turn' && req.method === 'GET') return json(req, await turn(env))
      const m = url.pathname.match(/^\/rooms\/([^/]+)(\/ws)?$/)
      if (m) {
        const code = decodeURIComponent(m[1]).toUpperCase()
        if (!validCode(code)) {
          if (m[2] && req.headers.get('Upgrade') === 'websocket') return refuseSocket('room-not-found', CLOSE_CODE.notFound)
          return json(req, { exists: false, error: 'bad-code' }, 400)
        }
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code))
        if (!m[2]) {
          const r = await stub.peek({ ver: url.searchParams.get('ver'), pid: url.searchParams.get('pid'), stats: url.searchParams.has('stats') })
          return json(req, r.body, r.status)
        }
        if (req.headers.get('Upgrade') !== 'websocket') return json(req, { error: 'expected websocket' }, 426)
        return await stub.fetch(req)
      }
    } catch (error) {
      // Durable Object limits (the Free plan's daily requests) surface as exceptions here.
      console.log('rooms error', String(error))
      if (req.headers.get('Upgrade') === 'websocket') return refuseSocket('busy', CLOSE_CODE.busy)
      return json(req, { error: 'busy' }, 429)
    }
    return json(req, { error: 'not found' }, 404)
  },
}

/** Accepts a socket only to tell the browser why it cannot stay (close codes and the error message are readable). */
function refuseSocket(code: string, close: number, detail?: string): Response {
  const pair = new WebSocketPair()
  const [client, server] = [pair[0], pair[1]]
  server.accept()
  server.send(JSON.stringify({ t: 'error', code, ...(detail ? { detail } : {}) }))
  server.close(close, code)
  return new Response(null, { status: 101, webSocket: client })
}

/** Short-lived TURN credentials from Cloudflare Realtime (1,000 GB/month free); nothing when no key is configured. */
async function turn(env: Env): Promise<{ iceServers: unknown[] }> {
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return { iceServers: [] }
  const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl: 3600 }),
  })
  if (!r.ok) return { iceServers: [] }
  const body = (await r.json().catch(() => null)) as { iceServers?: unknown } | null
  const servers = body && body.iceServers
  return { iceServers: Array.isArray(servers) ? servers : servers ? [servers] : [] }
}

export class Room extends DurableObject<Env> {
  core: RoomCore
  rates = new Map<WebSocket, RateWindow>()
  /** Changes every time the object is constructed: a different value after idle time means it hibernated and woke. */
  readonly instance = Math.random().toString(36).slice(2, 10)
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Keep-alive answered by the runtime: never wakes the object, never billed.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
    this.core = new RoomCore(roomConfig(env))
    ctx.blockConcurrencyWhile(async () => { this.core.load((await ctx.storage.get<RoomState>('room')) ?? null) })
  }

  async claim(code: string, ver: string): Promise<boolean> {
    const r = this.core.claim(code, ver, Date.now())
    await this.apply(r.actions)
    return r.ok
  }
  async peek(q: { ver: string | null; pid: string | null; stats: boolean }) {
    const r = this.core.peek(Date.now(), q)
    if (this.core.state) await this.ctx.storage.put('room', this.core.state)
    if (r.body.stats) (r.body.stats as typeof r.body.stats & { instance?: string }).instance = this.instance
    return r
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const q = { pid: (url.searchParams.get('pid') || '').slice(0, 64), name: (url.searchParams.get('name') || '').slice(0, 64), ver: url.searchParams.get('ver') || '' }
    const r = this.core.connect(q, Date.now())
    if (!r.ok) { if (this.core.state) await this.ctx.storage.put('room', this.core.state); return refuseSocket(r.code, r.close, r.detail) }
    // Replace the seat's old sockets before accepting the new one (a same-pid rejoin, even over a half-open socket).
    for (const action of r.actions) if (action.a === 'close' && action.code === CLOSE_CODE.replaced) this.closeSeat(r.seat, CLOSE_CODE.replaced, 'replaced')
    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]
    this.ctx.acceptWebSocket(server, ['s' + r.seat])
    server.serializeAttachment({ pid: q.pid, seat: r.seat } satisfies Conn)
    await this.apply(r.actions.filter(a => !(a.a === 'close' && a.code === CLOSE_CODE.replaced)), server)
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer) {
    const conn = ws.deserializeAttachment() as Conn | null
    if (!conn) return
    let rate = this.rates.get(ws)
    if (!rate) { rate = freshRate(); this.rates.set(ws, rate) }
    const now = Date.now()
    const actions = typeof msg === 'string' ? this.core.message(conn, msg, now, rate) : this.core.binary(conn, msg, now, rate)
    await this.apply(actions, ws)
  }
  async webSocketClose(ws: WebSocket, code: number) {
    this.rates.delete(ws)
    const conn = ws.deserializeAttachment() as Conn | null
    if (!conn) return
    const others = this.ctx.getWebSockets('s' + conn.seat).filter(o => o !== ws && o.readyState === 1).length
    await this.apply(this.core.close(conn, code, others, Date.now()))
  }
  async webSocketError(ws: WebSocket) { await this.webSocketClose(ws, 1006) }
  async alarm() { await this.apply(this.core.alarm(Date.now())) }

  private closeSeat(seat: number, code: number, reason: string, except?: WebSocket) {
    for (const ws of this.ctx.getWebSockets('s' + seat)) if (ws !== except) { try { ws.close(code, reason) } catch { /* already gone */ } }
  }
  private async apply(actions: Action[], self?: WebSocket) {
    let save = false, del = false, alarm = 0
    for (const action of actions) {
      switch (action.a) {
        case 'reply': if (self) { try { self.send(JSON.stringify(action.msg)) } catch { /* closing */ } if (this.core.state) this.core.state.counters.textOut++ } break
        case 'send':
          for (const ws of this.ctx.getWebSockets('s' + action.to)) { try { ws.send(JSON.stringify(action.msg)) } catch { /* closing */ } }
          if (this.core.state) this.core.state.counters.textOut++
          break
        case 'binary': for (const ws of this.ctx.getWebSockets('s' + action.to)) { try { ws.send(action.data) } catch { /* closing */ } } break
        case 'close': if (action.to === 'self') { try { self?.close(action.code, action.reason) } catch { /* gone */ } } else this.closeSeat(action.to, action.code, action.reason, self); break
        case 'alarm': alarm = action.at; break
        case 'save': save = true; break
        case 'delete': del = true; break
      }
    }
    if (del) { await this.ctx.storage.deleteAlarm(); await this.ctx.storage.deleteAll(); return }
    if (save && this.core.state) await this.ctx.storage.put('room', this.core.state)
    if (alarm) await this.ctx.storage.setAlarm(alarm)
  }
}
