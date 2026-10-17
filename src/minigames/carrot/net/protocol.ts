/**
 * Carrot Defense multiplayer: the frozen TypeScript protocol.
 *
 * Every type and constant shared by the web net layer (net/**), the lobby and duo UI (duo/**), the cgs-rooms Worker
 * (backend/rooms) and the Unity bridge (CarrotNetBridge.cs) lives here. Owned by the netcode-and-relay stream; after the
 * first commit it changes only through the lead, and any change to this file must bump NET_VERSION (test-carrot-net.mjs
 * fails otherwise, so an old and a new bundle can never pair in one room).
 *
 * Erasable TypeScript only (no enum, no namespace, no parameter properties) so Node 24 can import it by stripping types.
 */

// ---------------------------------------------------------------- versions and identifiers

/** Bump on any change to this file, to the wire format or to the bridge messages. Part of the room `ver` gate. */
export const NET_VERSION = 1

export type Seat = 0 | 1
/** Duo half (0: west or north on L29; 1: east or south). In endless, the seat's home wing (0 west, 1 east). */
export type Side = 0 | 1

/** 31 symbols, no 0/O, 1/I/L: 31^5 = 28.6 million codes. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const ROOM_CODE_LENGTH = 5
export const ROOM_CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/
/** Characters players type by mistake for the ones the alphabet leaves out. */
export const AMBIGUOUS_CODE_CHARS = '0O1IL'
export const NAME_MAX = 24
/** Player id per tab: 8-64 of [A-Za-z0-9_-]. */
export const PID_RE = /^[A-Za-z0-9_-]{8,64}$/

// ---------------------------------------------------------------- modes and levels

/** Room-level mode names (the lobby's choice). */
export type RoomMode = 'duoBoss' | 'endless2p'
/** Simulation mode names (the Unity bridge's `session.mode`, the snapshot's `mode`). */
export type NetModeName = 'duo' | 'endless'
export const roomModeToNet = (m: RoomMode): NetModeName => (m === 'duoBoss' ? 'duo' : 'endless')

/** The 11 boss fights offered in duo: campaign guardians 4..24 step 4, then the five Challenges 25..29. */
export const DUO_LEVELS = [4, 8, 12, 16, 20, 24, 25, 26, 27, 28, 29] as const
/** Two-player endless ("Twin Gates"); outside CarrotData.Levels, game-data.json and every award guard. */
export const ENDLESS_LEVEL = 90
export const isDuoLevel = (id: number) => (DUO_LEVELS as readonly number[]).includes(id)
export const isLevelForMode = (mode: RoomMode, level: number) => (mode === 'duoBoss' ? isDuoLevel(level) : level === ENDLESS_LEVEL)
/** L29 (Asuna) stacks its halves north/south; every other duo level splits west/east. */
export const duoLayout = (level: number): 'x' | 'z' => (level === 29 ? 'z' : 'x')
export const sideName = (level: number, side: Side): 'WEST' | 'EAST' | 'NORTH' | 'SOUTH' =>
  duoLayout(level) === 'z' ? (side === 0 ? 'NORTH' : 'SOUTH') : side === 0 ? 'WEST' : 'EAST'

/** towerIndex on the wire = index in CarrotData.Towers (= game-data.json towers order; a Node test asserts it). */
export const TOWER_KINDS = [
  'seed', 'frost', 'mortar', 'prism', 'storm', 'blossom', 'starfruit', 'gravity', 'book', 'thunder',
  'bamboo', 'chili', 'lotus', 'magnet', 'orchid', 'mushroom', 'cactus', 'clockflower', 'dragonfruit', 'moonflower',
] as const
export type TowerKind = (typeof TOWER_KINDS)[number]

// ---------------------------------------------------------------- timing

export const TICK_HZ = 30
export const TICK_MS = 1000 / 30
/** Start: the room stamps startAt = now + START_DELAY_MS (side reveal and 3-2-1). */
export const START_DELAY_MS = 3000
/** Wave 1: once both players pressed Start, the room stamps goAt = now + GO_DELAY_MS. */
export const GO_DELAY_MS = 1500
/** Every resume (manual, away, reconnect, resync) runs this countdown, stamped by the room. */
export const RESUME_DELAY_MS = 3000
/** A player's next manual pause waits this long after they resumed (away and automatic pauses are exempt). */
export const PAUSE_COOLDOWN_MS = 5000
/** Reconnect grace for a seat whose socket dropped (room-enforced with an alarm; the survivor runs its own timer too). */
export const GRACE_MS = 60_000
export const ROOM_EMPTY_MS = 10 * 60_000
export const ROOM_TTL_MS = 3 * 3600_000
/** Socket reconnect backoff; the last value repeats until the grace ends. */
export const RECONNECT_BACKOFF_MS = [250, 500, 1000, 2000, 4000] as const
/** Liveness from app heartbeats only (readyState and ICE state are not trusted). */
export const HICCUP_MS = 250
export const SWITCH_TO_RELAY_MS = 750
export const SILENCE_PAUSE_MS = 3000
/** Back to P2P after this long of clean DataChannel frames. */
export const P2P_CLEAN_MS = 2000
/** No DataChannel open this long after ICE starts: play on the relay while ICE keeps trying. */
export const P2P_DEADLINE_MS = 5000
/** A hidden tab pauses the match after this long. */
export const AWAY_PAUSE_MS = 1000
/** Lockstep: "Waiting for <name>" shows after this long of stall. */
export const STALL_NOTICE_MS = 250
export const DIGEST_EVERY = 30
/** Deep reflective state hash cadence (and at each wave start). */
export const DEEP_DIGEST_EVERY = 300
export const DIGEST_RING = 16
/** A new digest rides this many consecutive frames (redundancy against loss), then frames go without it. */
export const DIGEST_REPEAT = 6
export const RESYNC_WINDOW_MS = 60_000
/** This many resyncs inside RESYNC_WINDOW_MS end the match (duo: unfinished; endless: score to the last verified wave). */
export const RESYNC_LIMIT = 2
export const RESYNC_TIMEOUT_MS = 15_000
export const CHUNK_RETRY_MS = 1000
/** Silent replay, fast-forward and import: at most this much main-thread time per animation frame. */
export const REPLAY_BUDGET_MS = 30
/** Endless reconnect: replay the op log up to this many ticks, beyond that send a state blob. */
export const REPLAY_LOG_LIMIT = 30_000
/** Duo frames: heartbeat rate per path (plus an immediate frame after every op). */
export const DUO_HEARTBEAT_HZ = { p2p: 20, relay: 10 } as const
/** Duo replica buffer B (ticks behind the partner's reported exec) per path. */
export const DUO_BUFFER_TICKS = { p2p: 3, relay: 5 } as const
/** Lockstep frames go out every LOCKSTEP_FRAME_TICKS executed ticks at 1x (relay coalesces to <= 10 Hz). */
export const LOCKSTEP_FRAME_TICKS = { p2p: 1, relay: 3 } as const
export const LOCKSTEP_D_MIN = 2
export const LOCKSTEP_D_MAX = 12
/** Lockstep D adapts over this window; it drops by at most one tick per window, and rises at once after 2 stalls in 2 s. */
export const LOCKSTEP_D_WINDOW_MS = 10_000
/** Lockstep local clock slew from measured slack (never a jump). */
export const LOCKSTEP_SLEW = 0.03
/** Slow-peer policy: a peer executing below this fraction of the target rate for SLOW_PEER_MS slows both clocks. */
export const SLOW_PEER_RATE = 0.9
export const SLOW_PEER_MS = 5000
/** Presence (selected pad or tower) is sent at most at this rate; presentation only, never in the sim. */
export const PRESENCE_HZ = 5
/** Partner HUD view (partnerView events) rate. */
export const PARTNER_VIEW_HZ = 4

// ---------------------------------------------------------------- wire limits

/** Every binary frame, on either path. The room drops larger ones. */
export const MAX_FRAME_BYTES = 1200
/** Redundant op bytes per frame (oldest unacknowledged first); the rest waits for acks. */
export const MAX_OP_BYTES = 1100
/** State-chunk payload on the relay (and the room's cap). */
export const RELAY_CHUNK_BYTES = 1100
/** State-chunk payload on DataChannel 'r' (reliable, ordered). */
export const DC_CHUNK_BYTES = 16 * 1024
/** Room per-socket caps: excess is dropped and counted. */
export const ROOM_CAPS = {
  textBytes: 4096,
  binaryBytes: MAX_FRAME_BYTES,
  binaryPerSec: 64,
  textPerSec: 50,
  /** Kind-3 state chunks have their own budget (bytes per second), outside binaryPerSec. */
  chunkBytesPerSec: 32 * 1024,
} as const
export const STUN_URLS = ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] as const

// ---------------------------------------------------------------- ops (one vocabulary: C# NetOp, bridge JSON, wire)

/**
 * Op codes (C# NetOpCode). Payload semantics follow CarrotNetContract.cs:
 *   buy {pad, kind} | upgrade {id, v = fromTier} | sell {id, v = tier} | merge {id = src, target = dst}
 *   mergeUndo {id = the merge's target id} | next | speed {v 1|2} (lockstep) | start | focus {type 'enemy'|'blocker'|'', id}
 * upgrade/sell carry a precondition tier (v; 0 = none): an op whose tower changed under it is rejected at execution.
 * Reserved, never executed by the sim: 8 pause (a control), 10 mapPing, 12 presence.
 */
export const OP_CODE = {
  buy: 1, upgrade: 2, sell: 3, merge: 4, mergeUndo: 5, next: 6, speed: 7, pause: 8, start: 9, mapPing: 10, focus: 11, presence: 12,
} as const
export type OpName = 'buy' | 'upgrade' | 'sell' | 'merge' | 'mergeUndo' | 'next' | 'speed' | 'start' | 'focus'
export const EXECUTABLE_OPS: readonly OpName[] = ['buy', 'upgrade', 'sell', 'merge', 'mergeUndo', 'next', 'speed', 'start', 'focus']
export const opName = (code: number): OpName | null => {
  for (const name of EXECUTABLE_OPS) if (OP_CODE[name] === code) return name
  return null
}
export type FocusType = 'enemy' | 'blocker' | ''
export const FOCUS_CODE = { '': 0, enemy: 1, blocker: 2 } as const

/**
 * One tick-stamped input, exactly the C# NetOp JSON. Absent fields mean the C# defaults (pad -1, kind '', id 0, target 0,
 * type '', v 0); the wire carries only non-default fields. s = the issuing seat's sequence (1, 2, 3...; per seat, per match),
 * k = the netTick it applies before, seat = the issuer. A receiver takes seat from the transport, never from the wire.
 */
export type Op = {
  s: number
  k: number
  seat: Seat
  op: OpName
  pad?: number
  kind?: string
  id?: number
  target?: number
  type?: string
  v?: number
}
/** A lockstep intent before stamping (Unity emits it; JS stamps k and seat). */
export type Intent = Omit<Op, 'k' | 'seat'> & { k?: number; seat?: number }
/** Bounds the wire and the bridge enforce before anything reaches C#. */
export const OP_BOUNDS = { pad: 63, id: 2 ** 31 - 1, target: 2 ** 31 - 1, v: 64, seq: 2 ** 31 - 1, tick: 2 ** 31 - 1 } as const

/** Within one netTick: seat 0 first on even ticks, seat 1 first on odd ticks, then by s. */
export function canonicalOrder(a: Op, b: Op): number {
  if (a.k !== b.k) return a.k - b.k
  if (a.seat !== b.seat) {
    const first = a.k % 2 === 0 ? 0 : 1
    return a.seat === first ? -1 : 1
  }
  return a.s - b.s
}

// ---------------------------------------------------------------- Unity bridge (JS -> Unity: SendMessage('CarrotGame','Net',json))

/** [netTick, discrete32, float32] (low 32 bits of NetDigest, unsigned). */
export type Digest = [tick: number, disc: number, float: number]
/** [netTick, deep32]: the reflective full-state hash (every DEEP_DIGEST_EVERY ticks and at wave starts). */
export type DeepDigest = [tick: number, deep: number]

export type NetIn =
  | { t: 'session'; mode: NetModeName; level: number; seat: Seat; side: Side; seed: number; names: [string, string]; netVersion: number }
  /** Duo own-half match clock: run (not paused) and speed. */
  | { t: 'clock'; run: boolean; speed: 1 | 2 }
  /** Duo: apply the own start op now (wave 1). */
  | { t: 'go' }
  /** Duo: the partner's executed tick (a ceiling the replica never passes), their new ops, and the buffer B to keep behind it. */
  | { t: 'replica'; exec: number; ops: Op[]; b?: number }
  /** Duo: the partner's half resolved. */
  | { t: 'partner'; outcome: 'cleared' | 'lost'; tick: number }
  /** Lockstep: stamped ops of both seats (canonical order) and the tick limit both peers committed through. */
  | { t: 'step'; to: number; ops: Op[] }
  | { t: 'pause'; on: boolean; by: Seat | -1 }
  /** Full-state export; Unity answers with {t:'state'}. target defaults to 'self'. */
  | { t: 'export'; target?: 'self' | 'replica' }
  | { t: 'import'; target: 'replica' | 'self'; tick: number; b64: string }
  /** Silent replay (no Effect events, no snapshot) from the instance's current tick up to `to`, applying ops on the way. */
  | { t: 'replay'; target: 'replica' | 'self'; ops: Op[]; to: number }
  | { t: 'camera'; mode: CameraMode }
  | { t: 'presence'; seat: Seat; pad: number; tower: number }
  /** Leave net mode (back to single player). */
  | { t: 'end' }
export type CameraMode = 'own' | 'partner' | 'both'

// ---------------------------------------------------------------- Unity bridge (Unity -> JS: window event 'carrot-net', detail = json)

export type BossView = { name: string; hp: number; maxHp: number; phase: number }
/** The partner's half as the HUD shows it (duo: from the replica; 4 Hz). */
export type PartnerView = {
  name?: string
  health: number
  wave: number
  waves: number
  coins: number
  phase: string
  exec: number
  behind: number
  boss: BossView | null
}
export type NetOut =
  | { t: 'loaded'; exec: number }
  /** Duo: own ops, stamped (k = own netTick + 1), and the own executed tick after them. */
  | { t: 'own'; exec: number; ops: Op[] }
  /** Lockstep: an unstamped local intent. */
  | { t: 'intent'; op: Intent }
  /** Executed tick; d = own NetDigest, rd = the replica's, dd/rdd = deep hashes, rexec = replica executed tick, hold = SpeedHold. */
  | { t: 'tick'; exec: number; rexec?: number; d?: Digest; rd?: Digest; dd?: DeepDigest; rdd?: DeepDigest; hold?: boolean | number }
  | { t: 'result'; outcome: 'cleared' | 'won' | 'lost'; tick: number; health: number; score?: number }
  | ({ t: 'partnerView' } & PartnerView)
  | { t: 'state'; target: 'self' | 'replica'; tick: number; b64: string }
  | { t: 'reject'; seat: Seat; s: number; reason: string }
  | { t: 'replayed'; target: 'self' | 'replica'; tick: number; ms: number }
  /** Unity-side divergence (e.g. the replica rejected an op its owner accepted). */
  | { t: 'desync'; tick: number; local: [number, number]; remote: [number, number]; reason?: string }
  | { t: 'view'; kind: string }

/** The 'carrot-state' snapshot's optional net block (the existing snapshot is otherwise unchanged). */
export type SnapshotNet = {
  mode: NetModeName
  seat: Seat
  side: Side
  hold: boolean
  netTick: number
  matchPaused: boolean
  pausedBy: number
  pending: Array<{ s: number; op: string; pad: number; kind: string; cost: number }>
  score?: number
}

/** The page command shape (types.ts Command), restated so this file has no imports. */
export type PageCommand = { type: string; [key: string]: string | number | boolean }

// ---------------------------------------------------------------- wire frames (binary, little-endian; v = unsigned LEB128)

/**
 * Header: u8 kind, u8 flags, u16 seq (per-sender frame counter).
 * kind 1 duo:       v exec, v ackCmd, u8 n, cmd*, [digest], [deep]
 * kind 2 lockstep:  v committedThrough, v exec, v ackCmd, u8 n, cmd*, [digest], [deep]
 *   cmd    = v seq, v tick, u8 code, u8 mask, fields (mask bit0 pad v, bit1 kind u8 towerIndex, bit2 id zv, bit3 target zv,
 *            bit4 type u8, bit5 v zv; zv = zigzag LEB128; an absent field is the C# default)
 *   digest = v tick, u32 disc, u32 float           (flag bit0)
 *   deep   = v tick, u32 deep                      (flag bit4)
 * kind 3 chunk:     v resyncId, v tick, u16 index, u16 count, u8 purpose, bytes (<= RELAY_CHUNK_BYTES on the relay)
 * kind 4/5 ping:    u32 id, f64 time (sender clock; the pong echoes it and adds f64 responder clock)
 * kind 6 control:   u8 code, payload (CONTROL)
 * Every frame repeats unacknowledged commands oldest first up to MAX_OP_BYTES, and stays <= MAX_FRAME_BYTES.
 */
export const FRAME = { duo: 1, lockstep: 2, chunk: 3, ping: 4, pong: 5, control: 6 } as const
export const FLAG = { digest: 1, relay: 2, paused: 4, away: 8, deep: 16 } as const
export const CONTROL = {
  away: 1,
  back: 2,
  pause: 3,
  resume: 4,
  speed: 5,
  startReady: 6,
  resyncRequest: 7,
  resyncDone: 8,
  leave: 9,
  presence: 10,
  /** v resyncId, u16 index: a state chunk arrived. */
  chunkAck: 11,
  /** u8 percent: restoring after a reload (the partner shows "Restoring <name>'s garden 43%"). */
  restoring: 12,
  /** v replicaExec, v ownExec: what the survivor holds, sent to a rejoining partner. */
  restoreInfo: 13,
  /** a seat, b factor x1000: the slow-peer policy slowed both clocks for this seat. */
  slowed: 14,
  /** a ms: lockstep, the input delay the sender measured this peer needs (asymmetric paths). */
  delay: 15,
  /** a request id: a reloaded player asks the survivor for its state (and, in duo, the survivor's copy of its log). */
  restoreRequest: 16,
} as const
/** Chunk purposes: a resync blob, a reconnect restore blob, an op log. */
export const CHUNK_PURPOSE = { resync: 1, restore: 2, oplog: 3 } as const

// ---------------------------------------------------------------- room protocol (cgs-rooms Worker, JSON text over the room WebSocket)

export type RoomPhase = 'lobby' | 'playing'
export type RoomPlayer = {
  seat: Seat
  name: string
  ready: boolean
  connected: boolean
  /** Unity loading progress 0..1 (1 = the game is ready to start). */
  loaded: number
  /** Level ids this player has unlocked (from their own saves; the lobby computes the offer from both). */
  unlocked: number[]
  /** Best endless waves on this device (0 = none). */
  best: number
  /** Pressed Start in the current match's prep phase. */
  startReady: boolean
}
export type RoomView = {
  code: string
  phase: RoomPhase
  mode: RoomMode
  level: number
  /** Offer fights only one of the two players has unlocked (host toggle; default false = intersection). */
  union: boolean
  ver: string
  /** Match counter; increments at every start. */
  match: number
  /** The seat holding the host role (promoted if the host leaves). */
  host: Seat
  players: RoomPlayer[]
  /** The match pause as the room serialized it (null when running). */
  pause: RoomPause | null
  speed: 1 | 2
}
export type RoomPause = { by: Seat | -1; reason: PauseReason; since: number }
export type PauseReason = 'manual' | 'away' | 'menu' | 'silence' | 'resync' | 'restore'
export type MatchInfo = {
  seed: number
  /** sides[seat]: the duo half (or endless home wing) each seat defends, drawn by the room with crypto RNG. */
  sides: [Side, Side]
  startAt: number
  mode: RoomMode
  level: number
  match: number
  goAt: number
}
export type ServerMsg =
  | { t: 'welcome'; seat: Seat; host: boolean; now: number; room: RoomView; match: MatchInfo | null }
  | { t: 'room'; room: RoomView }
  | { t: 'start'; seed: number; sides: [Side, Side]; startAt: number; now: number; mode: RoomMode; level: number; match: number }
  | { t: 'go'; goAt: number; now: number }
  | { t: 'time'; c: number; s: number }
  | { t: 'signal'; from: Seat; data: unknown }
  | { t: 'peer'; seat: Seat; state: 'away'; graceMs: number }
  | { t: 'peer'; seat: Seat; state: 'gone' }
  | { t: 'peer'; seat: Seat; state: 'back' }
  | { t: 'result'; seat: Seat; outcome: ResultOutcome; tick: number; score?: number; health?: number; final: boolean }
  /** The room serialized a pause or a resume; a resume carries `at` (server ms) when play restarts after the countdown. */
  | { t: 'pause'; on: boolean; by: Seat | -1; reason: PauseReason; at: number; now: number }
  | { t: 'speed'; v: 1 | 2; by: Seat }
  | { t: 'error'; code: ErrorCode; detail?: string }
export type ResultOutcome = 'cleared' | 'won' | 'lost' | 'ended' | 'unfinished'
export type ClientMsg =
  | { t: 'profile'; name: string; unlocked: number[]; best: number }
  | { t: 'status'; loaded: number }
  | { t: 'config'; mode: RoomMode; level: number; union?: boolean }
  | { t: 'ready'; on: boolean }
  | { t: 'start' }
  | { t: 'startReady' }
  | { t: 'time'; c: number }
  | { t: 'signal'; data: unknown }
  | { t: 'result'; outcome: ResultOutcome; tick: number; score?: number; health?: number }
  | { t: 'pause'; on: boolean; reason: PauseReason }
  | { t: 'speed'; v: 1 | 2 }
  /** The sender has heard nothing from its partner for SILENCE_PAUSE_MS (a half-open socket the room cannot see). */
  | { t: 'peer-silent' }
  | { t: 'lobby' }
  | { t: 'leave' }
/** POST /rooms {ver} -> {code}; GET /rooms/:code[?ver=&pid=] -> RoomPeek (404/409 with {error} when a join would be refused). */
export type RoomPeek = { exists: boolean; phase?: RoomPhase; mode?: RoomMode; level?: number; players?: number; full?: boolean; joinable?: boolean; error?: ErrorCode }
/** Close codes the room uses after sending {t:'error'} (a browser cannot read an HTTP status on a refused upgrade). */
export const CLOSE_CODE = {
  replaced: 4001,
  closed: 4002,
  notFound: 4404,
  full: 4409,
  inProgress: 4410,
  version: 4426,
  origin: 4403,
  busy: 4429,
  left: 4000,
} as const

// ---------------------------------------------------------------- errors (codes and the copy players read)

export type ErrorCode =
  | 'room-not-found'
  | 'room-full'
  | 'in-progress'
  | 'version-mismatch'
  | 'network'
  | 'busy'
  | 'partner-left'
  | 'desync'
  | 'origin'
  | 'bad-code'
  | 'not-ready'
  | 'not-host'
  | 'bad-config'
  | 'pause-cooldown'
  | 'unavailable'
export const ERROR_COPY: Record<ErrorCode, string> = {
  'room-not-found': 'No room with that code. Check the letters with your friend.',
  'room-full': 'That room already has two players.',
  'in-progress': 'That room is in the middle of a match.',
  'version-mismatch': 'You and your friend are on different versions of the game. Reload the page and try again.',
  network: 'Could not reach the multiplayer server. Check your connection and retry.',
  busy: 'Multiplayer is busy today. Try again later.',
  'partner-left': 'Your friend left the room.',
  desync: "Connection problem: this match can't continue. Nothing was recorded.",
  origin: 'Multiplayer only works on cornellcgs.org.',
  'bad-code': 'Codes never use 0, O, 1, I or L.',
  'not-ready': 'Both players must be ready and loaded first.',
  'not-host': 'Only the host can do that.',
  'bad-config': 'That fight is not available in multiplayer.',
  'pause-cooldown': 'You can pause again in a few seconds.',
  unavailable: 'Multiplayer is not available right now.',
}
/** The daily Free-plan quota resets at 00:00 UTC; the copy names that moment in the player's own time zone. */
export function busyCopy(now = Date.now()): string {
  const d = new Date(now)
  const reset = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)
  let at: string
  try { at = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(reset)) } catch { at = '' }
  return at ? `Multiplayer is busy today. Try again after ${at}.` : ERROR_COPY.busy
}
export function errorCopy(code: ErrorCode, detail?: string): string {
  if (code === 'busy') return busyCopy()
  if (code === 'version-mismatch' && detail === 'you') return 'A newer version of the game is out. Reload the page, then join again.'
  if (code === 'version-mismatch' && detail === 'room') return 'Your friend is on an older version of the game. Ask them to reload the page.'
  return ERROR_COPY[code] ?? ERROR_COPY.network
}

// ---------------------------------------------------------------- storage keys

export const STORAGE_KEYS = {
  /** Display name (localStorage). */
  name: 'cgs-carrot-duo-name',
  /** Player id (sessionStorage per tab; mirrored into the reconnect record). */
  pid: 'cgs-carrot-duo-pid',
  /** Reconnect record prefix (localStorage, + room code): {code, pid, seat, match, ops, lastExec, at}; 3 h TTL. */
  reconnect: 'cgs-carrot-duo-room-',
  /** Two-player endless best (localStorage). */
  endlessBest: 'cgs-carrot-endless2p-v1',
} as const

// ---------------------------------------------------------------- the session boundary (net layer <-> lobby and duo UI)

export type SessionPhase = 'idle' | 'connecting' | 'lobby' | 'starting' | 'prep' | 'playing' | 'paused' | 'results' | 'error'
export type PathKind = 'p2p' | 'relay' | 'none'
export type Profile = { name: string; unlocked: number[]; best: number }
export type PeerInfo = RoomPlayer & { me: boolean; host: boolean; away: boolean }
export type SessionError = { code: ErrorCode; message: string; retry: boolean }
export type DuoResult =
  /** Both halves cleared: each device records its own half's win through the page's award path. */
  | { kind: 'duoWin'; level: number; tick: number; health: number; partnerHealth: number }
  /** A carrot fell (fell = the seat whose carrot it was; -1 when both fell within the same few ticks). */
  | { kind: 'duoLoss'; level: number; tick: number; fell: Seat | -1; fellName: string; wave: number }
  /** Nothing recorded: a player left, the grace ran out, or the connection could not keep the halves in step. */
  | { kind: 'unfinished'; level: number; reason: 'left' | 'grace' | 'desync' | 'error'; by: Seat | -1 }
  /** Two-player endless ended: waves survived (the highest fully cleared wave). */
  | { kind: 'endless'; waves: number; tick: number; solo: boolean; endedBy: 'carrot' | 'player' | 'connection' }
export type CountdownKind = 'start' | 'go' | 'resume'
export type NetStats = {
  path: PathKind
  rttMs: number
  /** Lockstep input delay (D ticks in ms at the current rate); duo: 0 for own actions. */
  inputDelayMs: number
  delayTicks: number
  /** Duo: how far the replica runs behind the partner's reported tick. */
  replicaBehind: number
  stalls20s: number
  bytesOutPerSec: number
  bytesInPerSec: number
  framesOut: number
  framesIn: number
  digestsCompared: number
  unverified: number
  resyncs: number
  pathSwitches: number
  /** The slow-peer policy is holding both clocks down for this seat. */
  slowedFor: Seat | -1
  rate: number
}
export type DuoSnapshot = {
  phase: SessionPhase
  code: string | null
  seat: Seat | null
  host: boolean
  roomMode: RoomMode
  mode: NetModeName
  level: number
  union: boolean
  /** This player's half (duo) or home wing (endless); null before the side draw. */
  side: Side | null
  sides: [Side, Side] | null
  /** Local epoch ms when the running countdown ends (start reveal, wave 1 go, or resume). */
  countdownAt: number | null
  countdownKind: CountdownKind | null
  peers: PeerInfo[]
  path: PathKind
  rttMs: number
  inputDelayMs: number
  /** Who paused (seat), -1 for an automatic pause, null when running. */
  pausedBy: Seat | -1 | null
  pauseReason: PauseReason | null
  /** Partner's socket or tab is away: since (local ms) and the grace. */
  partnerAway: { since: number; graceMs: number } | null
  /** No frame from the partner for HICCUP_MS. */
  hiccup: boolean
  /** Lockstep stalled on the partner for STALL_NOTICE_MS. */
  waiting: boolean
  reconnecting: boolean
  /** Prep phase: which seats pressed Start. */
  pressedStart: [boolean, boolean]
  /** Duo: own half cleared and frozen, waiting for the partner. */
  hold: boolean
  partnerHold: boolean
  partner: PartnerView | null
  /** A rejoining player's garden is being rebuilt (seat, 0..1). */
  restoring: { seat: Seat; progress: number } | null
  /** Endless: continue solo after the partner's grace ran out. */
  canContinueSolo: boolean
  solo: boolean
  speed: 1 | 2
  result: DuoResult | null
  error: SessionError | null
  resyncs: number
  stats: NetStats
}
/** Transient events for toasts and aria-live (the snapshot holds state, these hold moments). */
export type SessionEvent =
  | { type: 'resynced'; seat: Seat }
  | { type: 'partnerTap' }
  | { type: 'reject'; reason: string; s: number }
  | { type: 'partnerPaused'; by: Seat }
  | { type: 'partnerResumed'; by: Seat }
  | { type: 'partnerAway' }
  | { type: 'partnerBack' }
  | { type: 'partnerLeft' }
  | { type: 'pathChanged'; path: PathKind }
  | { type: 'partnerResult'; outcome: ResultOutcome }
  | { type: 'notice'; message: string }
export type DuoSession = {
  subscribe(fn: (snapshot: DuoSnapshot) => void): () => void
  get(): DuoSnapshot
  onEvent(fn: (event: SessionEvent) => void): () => void
  /** Create a room (host) and connect; resolves with the code. */
  create(profile: Profile): Promise<string>
  /** Join a room by code (already normalized or not). */
  join(code: string, profile: Profile): Promise<void>
  /** Rejoin the room this tab (or a lost tab) was in, from the reconnect record or #room=CODE. */
  resume(code: string, profile: Profile): Promise<void>
  setProfile(profile: Profile): void
  /** Unity loading progress 0..1 (the room gates Start on both players at 1). */
  setLoaded(fraction: number): void
  configure(mode: RoomMode, level: number, union?: boolean): void
  setReady(on: boolean): void
  /** Host: start the match (both ready and loaded). */
  start(): void
  /** Prep phase: this player is ready for wave 1 (the page's Start button). */
  pressStart(): void
  /** Every page command goes through here while a session is active; returns true when the session consumed it. */
  send(cmd: PageCommand): boolean
  pause(on: boolean, reason?: PauseReason): void
  camera(mode: CameraMode): void
  /** Selected pad or tower, for the partner's presence ring (endless; rate-limited). */
  presence(pad: number, tower: number): void
  continueSolo(): void
  /** Endless: end the run now (the score is recorded). */
  endRun(): void
  /** Back to the room's lobby with the same choice. */
  rematch(): void
  leave(): void
  dispose(): void
}
/** The net layer's view of the Unity player (bridge.ts implements it over CarrotUnity; fakeEngine.ts for tests). */
export type EngineLink = {
  net(json: string): void
  onNet(fn: (message: NetOut) => void): () => void
  /** A page command straight to Unity (never filtered again). */
  send(cmd: PageCommand): void
  ready(): boolean
  /** Optional: drop the view quality tier (slow-peer policy). */
  quality?(tier: 'low' | 'medium' | 'high'): void
  /** Optional: ask Unity for a low frame rate while an overlay covers the canvas. */
  idle?(on: boolean): void
  /** Optional: the latest snapshot's net block (the endless score for End run and a connection-ended run). */
  snapshotNet?(): SnapshotNet | null
}
export type CreateSessionOptions = {
  engine: EngineLink
  roomsUrl: string
  /** The room version gate: `${unityBuild.version}+n${NET_VERSION}`. */
  ver: string
  /** Injected for tests (defaults: Date.now, globalThis.WebSocket, RTCPeerConnection, storage). */
  now?: () => number
}
