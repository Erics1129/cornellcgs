// In-process stand-in for the Cloudflare Workers runtime, enough to run backend/rooms/worker.ts (and room-core.ts) in Node 24:
// the 'cloudflare:workers' module, WebSocketPair, hibernatable sockets (acceptWebSocket, tags, attachments, getWebSockets), DO storage
// with one alarm, a 101 Response, and a browser-like WebSocket client that dials the Worker. Used by test-rooms-backend.mjs and
// test-carrot-net.mjs. Message delivery is pluggable (default: a microtask; tests may add latency).
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export class DurableObject{constructor(ctx,env){this.ctx=ctx;this.env=env}}', shortCircuit: true }
    return next(specifier, context)
  },
})

// ---- a Response that accepts status 101 + webSocket (undici refuses status < 200)
const BaseResponse = globalThis.Response
class WorkerResponse extends BaseResponse {
  constructor(body, init = {}) {
    if (init && init.status === 101) {
      super(null, { status: 200 })
      Object.defineProperty(this, 'status', { value: 101 })
      this.webSocket = init.webSocket
    } else super(body, init)
  }
  static json(data, init) { return new WorkerResponse(JSON.stringify(data), { ...init, headers: { 'content-type': 'application/json', ...(init && init.headers) } }) }
}
globalThis.Response = WorkerResponse

let deliver = fn => queueMicrotask(fn)
export function setDelivery(fn) { deliver = fn }

// ---- sockets: a pair of ends; 'server' ends are accepted by a DO (hibernatable) or by accept() (plain)
class End {
  constructor() { this.readyState = 1; this.peer = null; this.listeners = { message: [], close: [], open: [], error: [] }; this.attachment = null; this.tags = []; this.room = null; this.plain = false; this.onmessage = this.onclose = this.onopen = this.onerror = null; this.started = false; this.pending = [] }
  /** Client ends buffer what arrives before the page attaches its handlers (the runtime does the same). */
  start() { this.started = true; for (const [type, ev] of this.pending.splice(0)) this.emit(type, ev) }
  addEventListener(type, fn) { this.listeners[type].push(fn) }
  emit(type, ev) { for (const fn of this.listeners[type]) fn(ev); const h = this['on' + type]; if (h) h(ev) }
  accept() { this.plain = true }
  serializeAttachment(v) { this.attachment = structuredClone(v) }
  deserializeAttachment() { return this.attachment }
  send(data) {
    if (this.readyState !== 1) throw new Error('socket closed')
    const peer = this.peer
    const payload = typeof data === 'string' ? data : data instanceof ArrayBuffer ? data.slice(0) : new Uint8Array(data).slice().buffer
    deliver(() => peer.receive(payload))
  }
  receive(payload) {
    if (this.readyState !== 1) return
    if (this.room) { void this.room.webSocketMessage(this, payload); return }
    if (!this.started) { this.pending.push(['message', { data: payload }]); return }
    this.emit('message', { data: payload })
  }
  close(code = 1000, reason = '') {
    if (this.readyState !== 1) return
    this.readyState = 3
    const peer = this.peer
    deliver(() => peer.closedByPeer(code, reason))
  }
  closedByPeer(code, reason) {
    if (this.readyState === 3 && !this.room) return
    const was = this.readyState
    this.readyState = 3
    if (this.room) { if (was === 1 || was === 3) void this.room.webSocketClose(this, code, reason, true); return }
    if (!this.started) { this.pending.push(['close', { code, reason, wasClean: true }]); return }
    this.emit('close', { code, reason, wasClean: true })
  }
}
globalThis.WebSocketPair = class { constructor() { const a = new End(), b = new End(); a.peer = b; b.peer = a; this[0] = a; this[1] = b } }
globalThis.WebSocketRequestResponsePair = class { constructor(request, response) { this.request = request; this.response = response } }

// ---- Durable Object state
class Storage {
  constructor() { this.map = new Map(); this.alarmAt = null; this.writes = 0 }
  async get(k) { return this.map.has(k) ? structuredClone(this.map.get(k)) : undefined }
  async put(k, v) { this.writes++; this.map.set(k, structuredClone(v)) }
  async deleteAll() { this.map.clear() }
  async setAlarm(t) { this.alarmAt = t }
  async deleteAlarm() { this.alarmAt = null }
}
class State {
  constructor() { this.storage = new Storage(); this.sockets = []; this.autoResponse = null; this.ready = Promise.resolve() }
  acceptWebSocket(ws, tags = []) { ws.tags = tags; ws.room = this.object; this.sockets.push(ws) }
  getWebSockets(tag) { this.sockets = this.sockets.filter(s => s.readyState === 1); return this.sockets.filter(s => !tag || s.tags.includes(tag)) }
  setWebSocketAutoResponse(pair) { this.autoResponse = pair }
  blockConcurrencyWhile(fn) { this.ready = fn(); return this.ready }
}

/**
 * Loads worker.ts and returns a fake deployment: fetch (to the Worker), a browser-like WebSocket class, and the live objects.
 * objects: Map(code -> {object, state}); `hibernate(code)` rebuilds an object from storage (the constructor runs again).
 */
export async function createFakeRooms({ env: envOver = {}, origin = 'http://localhost:5190', workerUrl = new URL('../backend/rooms/worker.ts', import.meta.url).href } = {}) {
  const mod = await import(workerUrl)
  const objects = new Map()
  const env = { ALLOWED_ORIGINS: 'https://cornellcgs.org', DEV: '1', ...envOver }
  const make = name => {
    const state = new State()
    const object = new mod.Room(state, env)
    state.object = object
    for (const s of state.sockets) s.room = object
    return { object, state }
  }
  const failing = { on: false }
  env.ROOMS = {
    idFromName: name => ({ name, toString: () => name }),
    get: id => {
      if (!objects.has(id.name)) objects.set(id.name, make(id.name))
      const entry = objects.get(id.name)
      const call = fn => async (...args) => { if (failing.on) throw new Error('Exceeded allowed volume of requests in Durable Objects free tier.'); await entry.state.ready; return fn.apply(entry.object, args) }
      return { claim: call(entry.object.claim), peek: call(entry.object.peek), fetch: call(entry.object.fetch) }
    },
  }
  const worker = mod.default
  const fetchWorker = (url, init = {}) => worker.fetch(new Request(new URL(url, 'https://rooms.test'), { ...init, headers: { ...(origin ? { Origin: origin } : {}), ...(init.headers || {}) } }), env)
  /** Rebuilds a room object from its storage, as after hibernation (sockets survive with their attachments). */
  async function hibernate(code) {
    const entry = objects.get(code)
    const state = entry.state
    const object = new mod.Room(state, env)
    state.object = object
    for (const s of state.sockets) s.room = object
    entry.object = object
    await state.ready
  }
  async function runAlarm(code) { const entry = objects.get(code); if (entry && entry.state.storage.alarmAt != null) { entry.state.storage.alarmAt = null; await entry.object.alarm() } }
  /** A browser-like WebSocket (onopen/onmessage/onclose, binaryType, send, close) that dials the Worker. */
  class FakeWebSocket {
    static OPEN = 1
    constructor(url, _protocols, opts = {}) {
      this.url = url; this.readyState = 0; this.binaryType = 'blob'; this.onopen = this.onmessage = this.onclose = this.onerror = null; this.end = null
      const u = new URL(url)
      fetchWorker('https://rooms.test' + u.pathname + u.search, { headers: { Upgrade: 'websocket', ...(opts.origin ? { Origin: opts.origin } : {}) } }).then(res => {
        if (res.status !== 101) { this.readyState = 3; deliver(() => { this.onerror?.({}); this.onclose?.({ code: 1006, reason: '', wasClean: false }) }); return }
        const end = res.webSocket; this.end = end
        end.addEventListener('message', ev => { if (this.readyState === 1) this.onmessage?.({ data: ev.data }) })
        end.addEventListener('close', ev => { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.(ev) })
        this.readyState = 1
        this.onopen?.({})
        end.start()
      }, () => { this.readyState = 3; this.onerror?.({}); this.onclose?.({ code: 1006 }) })
    }
    send(data) {
      if (this.readyState !== 1) throw new Error('not open')
      // The runtime answers 'ping' itself (setWebSocketAutoResponse) without waking the object.
      const entry = [...objects.values()].find(e => e.state.sockets.includes(this.end.peer))
      if (data === 'ping' && entry && entry.state.autoResponse) { deliver(() => this.onmessage?.({ data: entry.state.autoResponse.response })); return }
      this.end.send(data)
    }
    close(code = 1000, reason = '') { if (this.readyState !== 1) return; this.readyState = 3; this.end.close(code, reason); deliver(() => this.onclose?.({ code, reason, wasClean: true })) }
    /** Test-only: the network dies without a close frame (iOS suspension); the server never hears about it. */
    vanish() { this.readyState = 3; this.end.readyState = 2 }
  }
  return { env, objects, fetch: fetchWorker, WebSocket: FakeWebSocket, hibernate, runAlarm, failing, worker }
}
