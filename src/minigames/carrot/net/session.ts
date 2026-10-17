/**
 * createDuoSession(): the multiplayer session behind the lobby and duo UI.
 *
 *   idle -> connecting -> lobby -> starting (side reveal, 3-2-1 to startAt) -> prep (both build; Start) -> playing <-> paused
 *        -> results -> lobby (rematch) ... and error from anywhere.
 *
 * It owns the room socket (rooms.ts), the clock, the WebRTC link (rtc.ts), the transport and one NetMatch per match, and it
 * turns the page's commands into match controls: pause toggles become explicit pauses serialized by the room (with a cooldown
 * after your own resume), duo speed is shared through the room, Start is "ready for wave 1", level loads are swallowed, and
 * encounter-card pauses are ignored in net modes. Everything else goes to Unity, which turns state changes into ops.
 *
 * Presence: a hidden tab, pagehide or freeze sends 'away' at once and pauses after AWAY_PAUSE_MS; 3 s of silence from the
 * partner pauses and tells the room (peer-silent, for half-open sockets); the survivor runs its own grace timer. A reload
 * comes back by the reconnect record (localStorage, 3 h TTL, guarded against two tabs) and is restored by state blobs.
 */
import {
  AWAY_PAUSE_MS, CHUNK_PURPOSE, CONTROL, ENDLESS_LEVEL, GRACE_MS, NET_VERSION, PAUSE_COOLDOWN_MS, PRESENCE_HZ, REPLAY_BUDGET_MS,
  ROOM_CODE_RE, ROOM_TTL_MS, SILENCE_PAUSE_MS, STORAGE_KEYS, roomModeToNet,
} from './protocol.ts'
import type {
  CameraMode, CreateSessionOptions, DuoResult, DuoSession, DuoSnapshot, MatchInfo, NetModeName, Op, PageCommand, PauseReason,
  PeerInfo, Profile, RoomMode, RoomView, Seat, ServerMsg, SessionError, SessionEvent, SessionPhase, Side,
} from './protocol.ts'
import { ServerClock } from './clock.ts'
import { NetStatsTracker } from './stats.ts'
import { Transport } from './transport.ts'
import { PeerLink, rtcSupported } from './rtc.ts'
import { RoomClient, checkRoom, createRoom, fetchIceServers, sessionError } from './rooms.ts'
import type { WebSocketCtor } from './rooms.ts'
import { NetMatch } from './match.ts'
import type { BlobBody, MatchEvent } from './match.ts'
import { initialDelay } from './lockstep.ts'
import type { Frame } from './frames.ts'

export type SessionDeps = {
  WebSocket?: WebSocketCtor
  /** null disables WebRTC (relay only). */
  RTCPeerConnection?: typeof RTCPeerConnection | null
  fetch?: typeof fetch
  local?: Storage | null
  session?: Storage | null
  /** The page (visibility, pagehide, freeze, pageshow); null in Node. */
  document?: Document | null
  window?: Window | null
  pumpMs?: number
  /** Web Locks for the two-tab guard (navigator.locks); null skips the guard. */
  locks?: LockManager | null
}

type Record_ = { code: string; pid: string; seat: Seat; match: number; ops: Op[]; lastExec: number; at: number }

/** Uppercases, strips spaces and dashes; null when a character can never be in a code (0, O, 1, I, L or other). */
export function normalizeCode(raw: string): { code: string; ok: boolean; ambiguous: boolean } {
  const code = String(raw || '').toUpperCase().replace(/[\s-]+/g, '')
  return { code, ok: ROOM_CODE_RE.test(code), ambiguous: /[0O1IL]/.test(code) }
}
const newPid = () => {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('')
}
const emptyStats = (): DuoSnapshot['stats'] => ({ path: 'none', rttMs: 0, inputDelayMs: 0, delayTicks: 0, replicaBehind: 0, stalls20s: 0, bytesOutPerSec: 0, bytesInPerSec: 0, framesOut: 0, framesIn: 0, digestsCompared: 0, unverified: 0, resyncs: 0, pathSwitches: 0, slowedFor: -1, rate: 1 })

export function createDuoSession(opts: CreateSessionOptions & SessionDeps): DuoSession {
  const now = opts.now ?? (() => Date.now())
  const engine = opts.engine
  const base = opts.roomsUrl
  const ver = opts.ver
  const fetchImpl = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
  const local = opts.local === undefined ? safeStorage('localStorage') : opts.local
  const sess = opts.session === undefined ? safeStorage('sessionStorage') : opts.session
  const doc = opts.document === undefined ? (typeof document !== 'undefined' ? document : null) : opts.document
  const win = opts.window === undefined ? (typeof window !== 'undefined' ? window : null) : opts.window
  const RTC = opts.RTCPeerConnection === undefined ? (rtcSupported() ? globalThis.RTCPeerConnection : null) : opts.RTCPeerConnection
  const locks = opts.locks === undefined ? (typeof navigator !== 'undefined' && navigator.locks && (globalThis as { isSecureContext?: boolean }).isSecureContext ? navigator.locks : null) : opts.locks

  const listeners = new Set<(s: DuoSnapshot) => void>()
  const eventListeners = new Set<(e: SessionEvent) => void>()
  const clock = new ServerClock(now)
  const stats = new NetStatsTracker(now)
  let snap: DuoSnapshot = {
    phase: 'idle', code: null, seat: null, host: false, roomMode: 'duoBoss', mode: 'duo', level: 25, union: false, side: null, sides: null,
    countdownAt: null, countdownKind: null, peers: [], path: 'none', rttMs: 0, inputDelayMs: 0, pausedBy: null, pauseReason: null,
    partnerAway: null, hiccup: false, waiting: false, reconnecting: false, pressedStart: [false, false], hold: false, partnerHold: false,
    partner: null, restoring: null, canContinueSolo: false, solo: false, speed: 1, result: null, error: null, resyncs: 0, stats: emptyStats(),
  }
  let profile: Profile = { name: 'Player', unlocked: [], best: 0 }
  let room: RoomClient | null = null
  let view: RoomView | null = null
  let seat: Seat | null = null
  let pid = ''
  let code = ''
  let transport: Transport | null = null
  let peer: PeerLink | null = null
  let iceServers: RTCIceServer[] | undefined
  let match: NetMatch | null = null
  let info: MatchInfo | null = null
  let goFired = false
  let startFired = false
  let resumeAt = 0
  let lastLoaded = -1
  let lastOwnResume = 0
  let lastPresence = 0
  let hidden = false
  let awayTimer = 0
  let silencePaused = false
  let partnerAwaySince = 0
  let partnerHidden = false
  let fell: Seat | -1 = -1
  let restoring: { started: number; needOwn: boolean; needPartner: boolean; replayTarget: number; ops: Op[] | null; replaying: boolean } | null = null
  let disposed = false
  let lockRelease: (() => void) | null = null
  let joinWaiter: { resolve: () => void; reject: (e: SessionError) => void } | null = null
  let lastNotify = 0
  let notifyQueued = false
  let lastRecordWrite = 0
  let timer: ReturnType<typeof setInterval> | null = null

  // ---------------------------------------------------------------- snapshot plumbing
  function set(patch: Partial<DuoSnapshot>, urgent = true) {
    snap = { ...snap, ...patch }
    if (urgent) notify()
    else if (!notifyQueued && now() - lastNotify > 100) notify()
  }
  function notify() {
    notifyQueued = false
    lastNotify = now()
    for (const fn of [...listeners]) fn(snap)
  }
  function emit(e: SessionEvent) { for (const fn of [...eventListeners]) fn(e) }
  function fail(error: SessionError) {
    set({ phase: 'error', error })
    if (joinWaiter) { joinWaiter.reject(error); joinWaiter = null }
  }
  const net = (m: Parameters<NetMatch['net']>[0]) => { if (match) match.net(m); else engine.net(JSON.stringify(m)) }
  const partnerSeat = (): Seat => (seat === 1 ? 0 : 1)
  const partnerName = () => view?.players.find(p => p.seat === partnerSeat())?.name || 'your friend'
  const local2 = (serverMs: number) => clock.toLocal(serverMs)

  // ---------------------------------------------------------------- reconnect record (localStorage, guarded, 3 h TTL)
  const recordKey = (c: string) => STORAGE_KEYS.reconnect + c
  function readRecord(c: string): Record_ | null {
    for (const store of [local, sess]) {
      try {
        const raw = store?.getItem(recordKey(c))
        if (!raw) continue
        const r = JSON.parse(raw) as Record_
        if (r && r.code === c && typeof r.pid === 'string' && now() - (r.at || 0) < ROOM_TTL_MS) return { ...r, ops: Array.isArray(r.ops) ? r.ops : [] }
      } catch { /* corrupt: ignore */ }
    }
    return null
  }
  function writeRecord(force = false) {
    if (!code || !pid || seat === null) return
    const t = now()
    if (!force && t - lastRecordWrite < 1000) return
    lastRecordWrite = t
    const r: Record_ = { code, pid, seat, match: info?.match ?? 0, ops: match?.duo ? match.duo.ownLog : [], lastExec: match?.duo ? match.duo.ownExec : match?.ls ? match.ls.E : 0, at: t }
    const text = JSON.stringify(r)
    try { (local ?? sess)?.setItem(recordKey(code), text) } catch { try { sess?.setItem(recordKey(code), text) } catch { /* storage blocked */ } }
    // stale records of other rooms
    try { for (let i = (local?.length ?? 0) - 1; i >= 0; i--) { const k = local!.key(i); if (k && k.startsWith(STORAGE_KEYS.reconnect) && k !== recordKey(code)) { const o = JSON.parse(local!.getItem(k) || 'null'); if (!o || t - (o.at || 0) > ROOM_TTL_MS) local!.removeItem(k) } } } catch { /* ignore */ }
  }
  function dropRecord() { try { local?.removeItem(recordKey(code)) } catch { /* ignore */ } try { sess?.removeItem(recordKey(code)) } catch { /* ignore */ } }
  async function guard(c: string, p: string): Promise<boolean> {
    if (!locks) return true
    return new Promise(resolve => {
      void locks.request(`cgs-carrot-duo:${c}:${p}`, { ifAvailable: true }, lock => {
        if (!lock) { resolve(false); return undefined }
        resolve(true)
        return new Promise<void>(release => { lockRelease = release })
      }).catch(() => resolve(true))
    })
  }

  // ---------------------------------------------------------------- joining
  async function connect(c: string, p: Profile, _rejoin: boolean): Promise<void> {
    const n = normalizeCode(c)
    if (!n.ok) throw sessionError(n.ambiguous ? 'bad-code' : 'room-not-found')
    profile = p
    code = n.code
    const rec = readRecord(code)
    pid = rec?.pid || readPid() || newPid()
    try { sess?.setItem(STORAGE_KEYS.pid, pid) } catch { /* ignore */ }
    set({ phase: 'connecting', code, error: null, result: null })
    await checkRoom(base, code, ver, pid, fetchImpl)
    if (!(await guard(code, pid))) throw { code: 'network', message: 'This room is already open in another tab.', retry: false } as SessionError
    if (iceServers === undefined) iceServers = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }, ...(await fetchIceServers(base, fetchImpl))]
    const done = new Promise<void>((resolve, reject) => { joinWaiter = { resolve, reject } })
    room = new RoomClient({
      base, code, pid, name: p.name, ver, now, WebSocket: opts.WebSocket,
      onMessage: onRoom, onBinary: bytes => { transport?.receive(bytes, 'relay'); kick() },
      onState: (state, error) => {
        set({ reconnecting: state === 'reconnecting' })
        if (state === 'closed' && error && !disposed) fail(error)
        if (state === 'open') room?.send({ t: 'profile', name: profile.name, unlocked: profile.unlocked, best: profile.best })
      },
    })
    room.connect()
    start()
    return done
  }
  function readPid() { try { return sess?.getItem(STORAGE_KEYS.pid) || '' } catch { return '' } }

  // ---------------------------------------------------------------- room messages
  function onRoom(m: ServerMsg) {
    if (disposed) return
    switch (m.t) {
      case 'welcome': {
        clock.hint(m.now)
        seat = m.seat
        view = m.room
        if (!transport) makeTransport()
        set({ seat: m.seat, host: m.host })
        applyView(m.room)
        sampleTime()
        if (lastLoaded >= 0) room?.send({ t: 'status', loaded: lastLoaded })
        const rec = readRecord(code)
        writeRecord(true)
        if (m.match) {
          // a rejoin into a running match (reload, lost tab, or a socket that came back)
          if (match && info && info.match === m.match.match) { /* the same tab: the match carries on */ }
          else beginMatch({ ...m.match }, rec && rec.match === m.match.match ? rec : null, true)
        } else if (snap.phase === 'connecting' || snap.phase === 'error') set({ phase: 'lobby' })
        if (joinWaiter) { joinWaiter.resolve(); joinWaiter = null }
        // a fresh tab: tell the partner to drop its old peer connection before our offer arrives (same ordered socket)
        if (view && view.players.length === 2) { room?.send({ t: 'signal', data: { reset: true } }); ensurePeer(true) }
        return
      }
      case 'room': {
        const before = view
        view = m.room
        applyView(m.room)
        if (m.room.players.length === 2 && (!before || before.players.length < 2)) ensurePeer(true)
        return
      }
      case 'time': clock.sample(m.c, m.s); return
      case 'signal': {
        const data = m.data as { reset?: boolean } | null
        if (data && data.reset) { ensurePeer(true); return }
        if (!peer && view && view.players.length === 2) ensurePeer()
        if (peer) void peer.handle(m.data as never)
        return
      }
      case 'start': beginMatch({ seed: m.seed, sides: m.sides, startAt: m.startAt, mode: m.mode, level: m.level, match: m.match, goAt: 0 }, null, false); return
      case 'go': {
        if (!info) return
        info.goAt = m.goAt
        set({ countdownAt: local2(m.goAt), countdownKind: 'go', pressedStart: [true, true] })
        return
      }
      case 'pause': onPause(m.on, m.by, m.reason, m.at); return
      case 'speed': if (snap.mode === 'duo') { set({ speed: m.v }); if (match) net({ t: 'clock', run: clockRuns(), speed: m.v }) } return
      case 'peer': {
        if (m.seat === seat) return
        if (m.state === 'away') {
          if (!partnerAwaySince) partnerAwaySince = now()
          set({ partnerAway: { since: partnerAwaySince, graceMs: m.graceMs } }); emit({ type: 'partnerAway' })
        } else if (m.state === 'back') {
          partnerAwaySince = 0; partnerHidden = false
          set({ partnerAway: null }); emit({ type: 'partnerBack' })
          transport?.resetLiveness()
        } else if (m.state === 'gone') {
          partnerAwaySince = 0
          set({ partnerAway: null })
          emit({ type: 'partnerLeft' })
          peer?.close(); peer = null; transport?.setPeer(null)
          if (match && snap.phase !== 'results') partnerGone()
        }
        return
      }
      case 'result': {
        if (m.seat === seat || !match) return
        emit({ type: 'partnerResult', outcome: m.outcome })
        if (snap.mode === 'duo') {
          if (m.outcome === 'cleared') { set({ partnerHold: true }); net({ t: 'partner', outcome: 'cleared', tick: m.tick }) }
          if (m.outcome === 'lost') { if (fell < 0) fell = m.seat; net({ t: 'partner', outcome: 'lost', tick: m.tick }) }
          if (m.outcome === 'unfinished') { finish({ kind: 'unfinished', level: snap.level, reason: 'desync', by: m.seat }); set({ error: sessionError('desync') }) }
        } else if (m.outcome === 'ended' || m.outcome === 'unfinished') finish({ kind: 'endless', waves: m.score ?? currentScore(), tick: m.tick, solo: snap.solo, endedBy: m.outcome === 'ended' ? 'player' : 'connection' })
        return
      }
      case 'error':
        if (m.code === 'pause-cooldown') { emit({ type: 'notice', message: sessionError('pause-cooldown').message }); return }
        if (m.code === 'not-ready' || m.code === 'not-host' || m.code === 'bad-config' || m.code === 'in-progress') { emit({ type: 'notice', message: sessionError(m.code).message }); return }
        return
    }
  }
  function applyView(v: RoomView) {
    const peers: PeerInfo[] = v.players.map(p => ({ ...p, me: p.seat === seat, host: p.seat === v.host, away: !p.connected || (p.seat !== seat && partnerHidden) }))
    const patch: Partial<DuoSnapshot> = { peers, host: seat === v.host, roomMode: v.mode, level: v.level, union: v.union, mode: roomModeToNet(v.mode) }
    if (v.phase === 'lobby' && !match && (snap.phase === 'starting' || snap.phase === 'connecting')) patch.phase = 'lobby'
    if (info && v.phase === 'playing') patch.pressedStart = [!!v.players.find(p => p.seat === 0)?.startReady || snap.pressedStart[0], !!v.players.find(p => p.seat === 1)?.startReady || snap.pressedStart[1]]
    set(patch)
  }
  function sampleTime() { for (let i = 0; i < 8; i++) setTimeout(() => room?.send({ t: 'time', c: now() }), i * 60) }

  // ---------------------------------------------------------------- transport and WebRTC
  function makeTransport() {
    transport = new Transport({
      now, partner: partnerSeat(), stats,
      relay: { open: () => !!room && room.open(), send: bytes => !!room && room.sendBinary(bytes) },
      onFrame: (f, via) => onFrame(f, via),
      onPath: p => { set({ path: p }); emit({ type: 'pathChanged', path: p }) },
    })
  }
  function ensurePeer(fresh = false) {
    if (!RTC || !transport || seat === null) return
    if (peer && !fresh) return
    peer?.close()
    peer = new PeerLink({
      polite: seat === 1, iceServers, RTCPeerConnection: RTC,
      signal: data => room?.send({ t: 'signal', data }),
      onMessage: (ch, data) => { transport?.receive(data, ch); kick() },
    })
    transport.setPeer(peer)
  }
  function onFrame(f: Frame, via: 'u' | 'r' | 'relay') {
    if (match) { match.onFrame(f, via); if (f.kind === 6) onControl(f); return }
    // lobby: answer pings so both sides measure the path before the match
    if (f.kind === 4) transport?.send({ kind: 5, id: f.id, time: f.time, reply: clock.serverNow() })
    else if (f.kind === 5) { const sent = lobbyPings.get(f.id); if (sent !== undefined) { lobbyPings.delete(f.id); stats.rtt(now() - sent) } }
  }
  let answeredRestore = 0
  const lobbyPings = new Map<number, number>()
  let lobbyPingAt = 0, lobbyPingId = 0
  function onControl(f: Extract<Frame, { kind: 6 }>) {
    switch (f.code) {
      case CONTROL.away: partnerHidden = true; if (!partnerAwaySince) partnerAwaySince = now(); set({ partnerAway: { since: partnerAwaySince, graceMs: GRACE_MS } }); emit({ type: 'partnerAway' }); if (view) applyView(view); return
      case CONTROL.back: partnerHidden = false; partnerAwaySince = 0; set({ partnerAway: null }); emit({ type: 'partnerBack' }); if (view) applyView(view); return
      case CONTROL.restoreRequest: if ((f.a ?? 0) !== answeredRestore) { answeredRestore = f.a ?? 0; void survivorRestore() } return
      case CONTROL.presence: if (snap.mode === 'endless') net({ t: 'presence', seat: partnerSeat(), pad: f.a ?? -1, tower: f.b ?? -1 }); return
      case CONTROL.restoring: set({ restoring: { seat: partnerSeat(), progress: Math.max(0, Math.min(1, (f.a ?? 0) / 100)) } }); return
      case CONTROL.restoreInfo: if (restoring) { restoring.replayTarget = Math.max(restoring.replayTarget, f.a ?? 0) } return
      case CONTROL.leave: return
    }
  }

  // ---------------------------------------------------------------- the match
  function beginMatch(mi: MatchInfo, rec: Record_ | null, rejoin: boolean) {
    endMatch(false)
    info = { ...mi }
    goFired = !!mi.goAt && local2(mi.goAt) <= now()
    startFired = false
    fell = -1
    silencePaused = false
    const mode: NetModeName = roomModeToNet(mi.mode)
    const side: Side = mi.sides[seat ?? 0]
    const rtt95 = stats.rttP95() || 80
    match = new NetMatch({
      mode, seat: seat ?? 0, host: seat === view?.host, engine, transport: transport!, stats, clock, now,
      initialDelay: initialDelay(rtt95, transport!.path === 'none' ? 'relay' : transport!.path),
      onEvent: onMatch,
    })
    const names: [string, string] = [view?.players.find(p => p.seat === 0)?.name || 'Player', view?.players.find(p => p.seat === 1)?.name || 'Player']
    net({ t: 'session', mode, level: mi.level, seat: seat ?? 0, side, seed: mi.seed, names, netVersion: NET_VERSION })
    if (mode === 'duo') net({ t: 'clock', run: false, speed: 1 })
    else { match.ls!.begin(local2(mi.startAt)); if (rejoin) match.ls!.freeze() }
    set({
      phase: rejoin ? 'paused' : 'starting', mode, level: mi.level, side, sides: mi.sides, countdownAt: rejoin ? null : local2(mi.startAt), countdownKind: rejoin ? null : 'start',
      pressedStart: [false, false], hold: false, partnerHold: false, partner: null, result: null, solo: false, canContinueSolo: false, speed: 1,
      pausedBy: rejoin ? -1 : null, pauseReason: rejoin ? 'restore' : null, restoring: rejoin ? { seat: seat ?? 0, progress: 0 } : null, resyncs: 0,
    })
    writeRecord(true)
    if (rejoin) void rejoinerRestore(rec)
  }
  function endMatch(toEngine: boolean) {
    if (match) { match.dispose(); match = null }
    if (toEngine) engine.net(JSON.stringify({ t: 'end' }))
    info = null; restoring = null
  }
  function clockRuns() { return !!info && startFired && snap.phase !== 'paused' && snap.phase !== 'results' && !restoring }
  function onMatch(e: MatchEvent) {
    switch (e.type) {
      case 'result': onResult(e); return
      case 'partnerView': set({ partner: { ...e.view, name: partnerName() } }, false); return
      case 'reject': if (e.seat === seat) emit({ type: 'reject', reason: e.reason, s: e.s }); return
      case 'view': if (e.kind === 'partnerTap') emit({ type: 'partnerTap' }); return
      case 'desync': case 'unityDesync': onDesync(e.type === 'desync' ? e.check.tick : e.tick); return
      case 'resynced': set({ resyncs: stats.resyncs }); emit({ type: 'resynced', seat: e.seat }); if (snap.mode === 'endless' && seat !== view?.host) room?.send({ t: 'pause', on: false, reason: 'resync' }); return
      case 'resyncFailed': connectionEnded(); return
      case 'lockstep':
        if (e.event.type === 'stall') set({ waiting: e.event.on })
        if (e.event.type === 'protocol') onDesync(match?.ls?.E ?? 0)
        return
      case 'blob': void onBlob(e.purpose, e.body); return
      case 'blobProgress': return
      case 'loaded': return
      case 'control': return
    }
  }
  function onResult(e: Extract<MatchEvent, { type: 'result' }>) {
    if (snap.phase === 'results') return
    if (snap.mode === 'duo') {
      if (e.outcome === 'cleared') { set({ hold: true }); room?.send({ t: 'result', outcome: 'cleared', tick: e.tick, health: e.health }); return }
      room?.send({ t: 'result', outcome: e.outcome, tick: e.tick, health: e.health })
      if (e.outcome === 'won') finish({ kind: 'duoWin', level: snap.level, tick: e.tick, health: e.health, partnerHealth: snap.partner?.health ?? 0 })
      else {
        const f: Seat = fell === 0 || fell === 1 ? fell : (seat ?? 0)
        finish({ kind: 'duoLoss', level: snap.level, tick: e.tick, fell: f, fellName: f === seat ? (view?.players.find(p => p.seat === seat)?.name || 'You') : partnerName(), wave: f === seat ? 0 : snap.partner?.wave ?? 0 })
      }
      return
    }
    if (e.outcome === 'lost') {
      const waves = e.score ?? currentScore()
      room?.send({ t: 'result', outcome: 'lost', tick: e.tick, score: waves })
      finish({ kind: 'endless', waves, tick: e.tick, solo: snap.solo, endedBy: 'carrot' })
    }
  }
  function finish(result: DuoResult) {
    if (snap.phase === 'results') return
    set({ phase: 'results', result, countdownAt: null, countdownKind: null, pausedBy: null, pauseReason: null, waiting: false, canContinueSolo: false })
    if (match) net({ t: 'clock', run: false, speed: snap.speed })
    dropRecordOps()
  }
  function dropRecordOps() { writeRecord(true) }
  function currentScore() { return Math.max(0, engine.snapshotNet?.()?.score ?? 0) }
  function connectionEnded() {
    if (snap.phase === 'results') return
    if (snap.mode === 'duo') { room?.send({ t: 'result', outcome: 'unfinished', tick: match?.duo?.ownExec ?? 0 }); finish({ kind: 'unfinished', level: snap.level, reason: 'desync', by: -1 }) }
    else { const waves = currentScore(); room?.send({ t: 'result', outcome: 'unfinished', tick: match?.ls?.E ?? 0, score: waves }); finish({ kind: 'endless', waves, tick: match?.ls?.E ?? 0, solo: snap.solo, endedBy: 'connection' }) }
    set({ error: sessionError('desync') })
  }
  function onDesync(tick: number) {
    if (!match || snap.phase === 'results') return
    if (!match.countResync()) { connectionEnded(); return }
    set({ resyncs: stats.resyncs })
    if (match.duo) match.requestReplicaResync(tick)
    else { match.beginLockstepResync(); room?.send({ t: 'pause', on: true, reason: 'resync' }); match.ls!.freeze() }
  }
  function partnerGone() {
    if (!match) return
    if (snap.mode === 'duo') { finish({ kind: 'unfinished', level: snap.level, reason: partnerAwaySince ? 'grace' : 'left', by: partnerSeat() }); return }
    // endless: the survivor chooses Continue solo or End run
    match.ls?.freeze()
    set({ canContinueSolo: true, phase: 'paused', pausedBy: -1, pauseReason: 'away' })
  }

  // ---------------------------------------------------------------- pause, resume, speed
  function onPause(on: boolean, by: Seat | -1, reason: PauseReason, at: number) {
    if (!match || snap.phase === 'results') return
    if (on) {
      resumeAt = 0
      set({ phase: snap.phase === 'starting' ? snap.phase : 'paused', pausedBy: by, pauseReason: reason, countdownAt: null, countdownKind: null })
      if (snap.mode === 'duo') net({ t: 'clock', run: false, speed: snap.speed })
      else match.ls!.freeze()
      net({ t: 'pause', on: true, by })
      if (by !== seat && by !== -1 && reason === 'manual') emit({ type: 'partnerPaused', by })
      return
    }
    resumeAt = local2(at)
    if (by === seat) lastOwnResume = now()
    if (restoring && reason === 'restore') restoring = null
    set({ countdownAt: resumeAt, countdownKind: 'resume', pauseReason: reason, restoring: null })
    if (snap.mode === 'endless' && match.ls) match.ls.resume(resumeAt)
    if (by !== seat && by !== -1) emit({ type: 'partnerResumed', by })
  }
  function pause(on: boolean, reason: PauseReason = 'manual') {
    if (!match || !room || snap.phase === 'results' || snap.phase === 'starting') return
    if (on && reason === 'manual' && now() - lastOwnResume < PAUSE_COOLDOWN_MS) { emit({ type: 'notice', message: sessionError('pause-cooldown').message }); return }
    const paused = snap.phase === 'paused' || (!!resumeAt && resumeAt > now())
    if (on === paused) return
    room.send({ t: 'pause', on, reason })
  }

  // ---------------------------------------------------------------- reconnect restore
  /** The rejoining side: replay our own half (duo) or wait for the survivor's state (endless); then resume. */
  async function rejoinerRestore(rec: Record_ | null) {
    if (!match) return
    room?.send({ t: 'pause', on: true, reason: 'restore' })
    restoring = { started: now(), needOwn: snap.mode === 'duo', needPartner: true, replayTarget: rec?.lastExec ?? 0, ops: rec && rec.ops.length ? rec.ops : null, replaying: false }
    startFired = true
    // ask the survivor for its state (and our own log), repeating until it arrives
    const requestId = (now() % 1e9) | 0 || 1
    const ask = () => { if (restoring && match && restoring.needPartner) { match.control(CONTROL.restoreRequest, { a: requestId }); setTimeout(ask, 1500) } }
    ask()
    if (snap.mode === 'duo') {
      // wait (briefly) for the survivor's copy of our log and its view of our tick
      const t0 = now()
      while (restoring && !restoring.ops && now() - t0 < 4000) await sleep(50)
      if (!restoring || !match) return
      const ops = restoring.ops ?? []
      match.duo!.restoreOwn(ops, restoring.replayTarget)
      await replayOwn(ops, restoring.replayTarget)
      if (!restoring || !match) return
      restoring.needOwn = false
      const body = await match.ownStateBody()
      await match.sendBlob(CHUNK_PURPOSE.restore, body)
    }
    maybeResume()
  }
  async function replayOwn(ops: Op[], target: number) {
    if (!match || !restoring) return
    restoring.replaying = true
    let at = 0, chunk = 300
    while (at < target && match && restoring) {
      const to = Math.min(target, at + chunk)
      const r = await match.replay('self', ops.filter(op => op.k > at && op.k <= to), to)
      at = r.tick
      // keep each frame's replay under the budget (heartbeats and pongs keep flowing between chunks)
      chunk = Math.max(30, Math.min(5000, Math.round(chunk * (r.ms > 0 ? Math.min(2, REPLAY_BUDGET_MS / r.ms) : 2))))
      const pct = Math.round(100 * at / Math.max(1, target))
      match.control(CONTROL.restoring, { a: pct }, false)
      set({ restoring: { seat: seat ?? 0, progress: pct / 100 } })
      await nextFrame()
    }
    if (restoring) restoring.replaying = false
  }
  /** The surviving side, when the partner came back: give it our state (and its own log), take its fresh state. */
  async function survivorRestore() {
    if (!match || snap.phase === 'results') return
    if (match.duo) {
      match.control(CONTROL.restoreInfo, { a: match.duo.replicaExec, b: match.duo.ownExec })
      await match.sendBlob(CHUNK_PURPOSE.oplog, { tick: match.duo.replicaExec, ops: match.duo.partnerLog() })
      const body = await match.ownStateBody()
      match.duo.resetAckTo(body.seq ?? 0)
      await match.sendBlob(CHUNK_PURPOSE.restore, body)
    } else if (match.ls) {
      match.ls.freeze()
      const t0 = now()
      while (match && match.ls && match.ls.E !== match.ls.stepTo && now() - t0 < 3000) await sleep(20)
      if (!match || !match.ls) return
      const body = await match.ownStateBody()
      match.ls.resetPartner(body.tick)
      await match.sendBlob(CHUNK_PURPOSE.restore, { ...body, exec: body.tick })
    }
  }
  async function onBlob(purpose: number, body: BlobBody) {
    if (!match) return
    if (purpose === CHUNK_PURPOSE.oplog && restoring && !restoring.ops) { restoring.ops = body.ops ?? []; restoring.replayTarget = Math.max(restoring.replayTarget, body.tick); return }
    if (purpose !== CHUNK_PURPOSE.restore || !body.b64) return
    if (match.duo) {
      if (restoring) {
        // we are the rejoiner: this is the partner's half for our replica
        net({ t: 'import', target: 'replica', tick: body.tick, b64: body.b64 })
        match.duo.adoptPartnerSeq(body.seq ?? 0, body.tick)
        match.duo.feed(true)
        restoring.needPartner = false
        maybeResume()
      } else {
        // we survived: the partner's freshly restored half replaces our replica of it
        net({ t: 'import', target: 'replica', tick: body.tick, b64: body.b64 })
        match.duo.afterImport(body.tick)
      }
    } else if (match.ls && restoring) {
      net({ t: 'import', target: 'self', tick: body.tick, b64: body.b64 })
      match.ls.afterImport(body.tick)
      match.ls.adoptPartnerSeq(body.seq ?? 0)
      match.ls.freeze()
      restoring.needPartner = false
      maybeResume()
    }
  }
  function maybeResume() {
    if (!restoring || restoring.needOwn || restoring.needPartner) return
    restoring = null
    set({ restoring: null })
    room?.send({ t: 'pause', on: false, reason: 'restore' })
  }

  // ---------------------------------------------------------------- the loop
  function start() {
    if (timer) return
    timer = setInterval(pump, opts.pumpMs ?? 8)
    if (doc) {
      doc.addEventListener('visibilitychange', onVisibility)
      doc.addEventListener('freeze', onHide)
      doc.addEventListener('resume', onVisibility)
    }
    if (win) { win.addEventListener('pagehide', onHide); win.addEventListener('pageshow', onShow); win.addEventListener('online', onShow) }
  }
  let kicked = false
  function kick() { if (!kicked) { kicked = true; queueMicrotask(() => { kicked = false; pump() }) } }
  function pump() {
    if (disposed) return
    const t = now()
    transport?.pump()
    if (match) match.pump()
    else if (transport && view && view.players.length === 2 && t - lobbyPingAt > 500) {
      lobbyPingAt = t
      const id = ++lobbyPingId
      lobbyPings.set(id, t)
      if (lobbyPings.size > 8) lobbyPings.delete(lobbyPings.keys().next().value as number)
      transport.send({ kind: 4, id, time: clock.serverNow(t) })
    }
    if (info && match) {
      // countdowns: the match clock starts at startAt, wave 1 at goAt, and play resumes at resumeAt
      if (!startFired && t >= local2(info.startAt)) {
        startFired = true
        if (snap.phase === 'starting') set({ phase: 'prep', countdownAt: null, countdownKind: null })
        if (snap.mode === 'duo') net({ t: 'clock', run: clockRuns(), speed: snap.speed })
      }
      if (info.goAt && !goFired && t >= local2(info.goAt)) {
        goFired = true
        if (snap.mode === 'duo') net({ t: 'go' })
        else if (seat === view?.host || snap.solo) engine.send({ type: 'start' })
        if (snap.phase === 'prep') set({ phase: 'playing', countdownAt: null, countdownKind: null })
      }
      if (resumeAt && t >= resumeAt) {
        resumeAt = 0
        silencePaused = false
        set({ phase: goFired ? 'playing' : 'prep', pausedBy: null, pauseReason: null, countdownAt: null, countdownKind: null })
        if (snap.mode === 'duo') net({ t: 'clock', run: clockRuns(), speed: snap.speed })
        net({ t: 'pause', on: false, by: -1 })
      }
      presenceChecks(t)
      writeRecord()
    }
    const s = stats.snapshot()
    set({ stats: s, path: s.path, rttMs: s.rttMs, inputDelayMs: s.inputDelayMs, hiccup: !!transport?.hiccup && !!match, waiting: !!match?.ls?.waiting }, false)
  }
  function presenceChecks(t: number) {
    if (!transport || !match || snap.phase === 'results' || restoring) return
    const silence = transport.silence()
    if (silence > SILENCE_PAUSE_MS && !silencePaused && (snap.phase === 'playing' || snap.phase === 'prep')) {
      silencePaused = true
      if (!partnerAwaySince) partnerAwaySince = t - silence
      set({ partnerAway: { since: partnerAwaySince, graceMs: GRACE_MS } })
      room?.send({ t: 'pause', on: true, reason: 'silence' })
      room?.send({ t: 'peer-silent' })
    } else if (silencePaused && silence < 500 && transport.lastHeard && snap.phase === 'paused' && snap.pauseReason === 'silence') {
      silencePaused = false
      partnerAwaySince = 0
      set({ partnerAway: null })
      room?.send({ t: 'pause', on: false, reason: 'silence' })
    }
    // partner's hidden tab: pause after AWAY_PAUSE_MS
    if (partnerHidden && partnerAwaySince && t - partnerAwaySince > AWAY_PAUSE_MS && snap.phase === 'playing') room?.send({ t: 'pause', on: true, reason: 'away' })
    // the survivor's own grace timer (the room may never hear a half-open socket close)
    if (partnerAwaySince && t - partnerAwaySince > GRACE_MS && !snap.canContinueSolo) partnerGone()
  }
  function onVisibility() {
    const h = !!doc?.hidden
    if (h) onHide()
    else if (hidden) {
      hidden = false
      clearTimeout(awayTimer)
      match?.control(CONTROL.back)
      transport?.resetLiveness()
      if (snap.phase === 'paused' && snap.pauseReason === 'away') room?.send({ t: 'pause', on: false, reason: 'away' })
    }
  }
  function onHide() {
    if (hidden) return
    hidden = true
    match?.control(CONTROL.away)
    clearTimeout(awayTimer)
    if (match && (snap.phase === 'playing' || snap.phase === 'prep')) awayTimer = setTimeout(() => { if (hidden) room?.send({ t: 'pause', on: true, reason: 'away' }) }, AWAY_PAUSE_MS) as unknown as number
  }
  function onShow() { room?.kick(); if (hidden && !doc?.hidden) onVisibility() }

  // ---------------------------------------------------------------- the public surface
  const api: DuoSession = {
    subscribe(fn) { listeners.add(fn); fn(snap); return () => { listeners.delete(fn) } },
    get: () => snap,
    onEvent(fn) { eventListeners.add(fn); return () => { eventListeners.delete(fn) } },
    async create(p) {
      set({ phase: 'connecting', error: null })
      try {
        const c = await createRoom(base, ver, fetchImpl)
        await connect(c, p, false)
        return c
      } catch (e) { const err = asError(e); fail(err); throw err }
    },
    async join(c, p) { try { await connect(c, p, false) } catch (e) { const err = asError(e); fail(err); throw err } },
    async resume(c, p) { try { await connect(c, p, true) } catch (e) { const err = asError(e); fail(err); throw err } },
    setProfile(p) { profile = p; room?.send({ t: 'profile', name: p.name, unlocked: p.unlocked, best: p.best }) },
    setLoaded(fraction) {
      const f = Math.max(0, Math.min(1, fraction))
      if (f < 1 && Math.abs(f - lastLoaded) < 0.05) return
      if (f === lastLoaded) return
      lastLoaded = f
      room?.send({ t: 'status', loaded: f })
    },
    configure(mode: RoomMode, level: number, union = false) { room?.send({ t: 'config', mode, level: mode === 'endless2p' ? ENDLESS_LEVEL : level, union }) },
    setReady(on) { room?.send({ t: 'ready', on }) },
    start() { room?.send({ t: 'start' }) },
    pressStart() {
      if (!match || snap.phase !== 'prep' || seat === null) return
      const pressed = [...snap.pressedStart] as [boolean, boolean]
      pressed[seat] = true
      set({ pressedStart: pressed })
      room?.send({ t: 'startReady' })
    },
    send(cmd: PageCommand): boolean {
      if (!match && snap.phase !== 'results') return cmd.type === 'load' && snap.phase !== 'idle' && snap.phase !== 'error'
      switch (cmd.type) {
        case 'load': return true
        case 'pause':
          if (doc?.hidden) return true // the away logic owns hidden tabs
          pause(!(snap.phase === 'paused' || (!!resumeAt && resumeAt > now())), 'manual')
          return true
        case 'setPaused': return true // encounter cards never pause a match
        case 'start': api.pressStart(); return true
        case 'speed':
          if (snap.mode === 'duo') { room?.send({ t: 'speed', v: Number(cmd.value) >= 1.5 ? 2 : 1 }); return true }
          return false
        default: return snap.phase === 'results' || !!restoring
      }
    },
    pause(on, reason = 'manual') { pause(on, reason) },
    camera(mode: CameraMode) { net({ t: 'camera', mode }) },
    presence(pad, tower) {
      if (!match || snap.mode !== 'endless') return
      const t = now()
      if (t - lastPresence < 1000 / PRESENCE_HZ) return
      lastPresence = t
      match.control(CONTROL.presence, { a: pad, b: tower, c: seat ?? 0 }, false)
    },
    continueSolo() {
      if (!match?.ls || !snap.canContinueSolo) return
      match.ls.goSolo()
      const at = now() + 3000
      match.ls.resume(at)
      resumeAt = at
      set({ solo: true, canContinueSolo: false, countdownAt: at, countdownKind: 'resume' })
    },
    endRun() {
      if (!match?.ls || snap.phase === 'results') return
      const waves = currentScore()
      room?.send({ t: 'result', outcome: 'ended', tick: match.ls.E, score: waves })
      finish({ kind: 'endless', waves, tick: match.ls.E, solo: snap.solo, endedBy: 'player' })
    },
    rematch() {
      endMatch(true)
      room?.send({ t: 'lobby' })
      room?.send({ t: 'ready', on: false })
      set({ phase: 'lobby', result: null, countdownAt: null, countdownKind: null, pausedBy: null, pauseReason: null, hold: false, partnerHold: false, partner: null, restoring: null, error: null })
    },
    leave() {
      // the partner hears 'gone' at once: duo ends unfinished, endless offers Continue solo or End run
      endMatch(true)
      dropRecord()
      room?.close(true); room = null
      peer?.close(); peer = null
      transport = null; view = null; seat = null; code = ''
      lockRelease?.(); lockRelease = null
      set({ phase: 'idle', code: null, seat: null, host: false, peers: [], result: null, error: null, path: 'none', partnerAway: null, restoring: null, countdownAt: null, countdownKind: null })
    },
    dispose() {
      if (disposed) return
      disposed = true
      if (timer) clearInterval(timer)
      if (doc) { doc.removeEventListener('visibilitychange', onVisibility); doc.removeEventListener('freeze', onHide); doc.removeEventListener('resume', onVisibility) }
      if (win) { win.removeEventListener('pagehide', onHide); win.removeEventListener('pageshow', onShow); win.removeEventListener('online', onShow) }
      endMatch(!!match)
      room?.close(false); peer?.close()
      lockRelease?.()
      listeners.clear(); eventListeners.clear()
    },
  }
  return api
}

function asError(e: unknown): SessionError {
  if (e && typeof e === 'object' && 'code' in e && 'message' in e) return e as SessionError
  return sessionError('network')
}
function safeStorage(kind: 'localStorage' | 'sessionStorage'): Storage | null {
  try { const s = (globalThis as unknown as Record<string, Storage>)[kind]; s.getItem('x'); return s } catch { return null }
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const nextFrame = () => new Promise<void>(r => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 16)))
export type { SessionPhase }
