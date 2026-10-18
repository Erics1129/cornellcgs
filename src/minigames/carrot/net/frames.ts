/**
 * Binary codec for gameplay frames (identical on DataChannel 'u'/'r' and on the room WebSocket relay).
 * Little-endian; v = unsigned LEB128, zv = zigzag LEB128. Layout in protocol.ts (FRAME). Decoding never throws: a malformed
 * or hostile frame decodes to null and is counted, so nothing out of bounds ever reaches the Unity bridge.
 */
import { CONTROL, FLAG, FOCUS_CODE, FRAME, MAX_FRAME_BYTES, OP_BOUNDS, OP_CODE, TOWER_KINDS, opName } from './protocol.ts'
import type { DeepDigest, Digest, Op, Seat } from './protocol.ts'

export type FrameBase = { flags: number; seq: number }
export type DuoFrame = FrameBase & { kind: 1; exec: number; ack: number; cmds: Op[]; digest?: Digest; deep?: DeepDigest }
export type LockstepFrame = FrameBase & { kind: 2; commit: number; exec: number; ack: number; cmds: Op[]; digest?: Digest; deep?: DeepDigest }
export type ChunkFrame = FrameBase & { kind: 3; resyncId: number; tick: number; index: number; count: number; purpose: number; bytes: Uint8Array }
export type PingFrame = FrameBase & { kind: 4; id: number; time: number }
export type PongFrame = FrameBase & { kind: 5; id: number; time: number; reply: number }
/** A control: generic fields whose meaning depends on code (protocol.ts CONTROL). */
export type ControlFrame = FrameBase & { kind: 6; code: number; a?: number; b?: number; c?: number; f?: number }
export type Frame = DuoFrame | LockstepFrame | ChunkFrame | PingFrame | PongFrame | ControlFrame

class Writer {
  buf = new Uint8Array(64)
  n = 0
  private room(k: number) {
    if (this.n + k <= this.buf.length) return
    let size = this.buf.length * 2
    while (size < this.n + k) size *= 2
    const next = new Uint8Array(size)
    next.set(this.buf.subarray(0, this.n))
    this.buf = next
  }
  u8(x: number) { this.room(1); this.buf[this.n++] = x & 0xff }
  u16(x: number) { this.room(2); this.buf[this.n++] = x & 0xff; this.buf[this.n++] = (x >>> 8) & 0xff }
  u32(x: number) { this.room(4); x >>>= 0; for (let i = 0; i < 4; i++) { this.buf[this.n++] = x & 0xff; x >>>= 8 } }
  f64(x: number) { this.room(8); new DataView(this.buf.buffer).setFloat64(this.n, x, true); this.n += 8 }
  v(x: number) {
    if (!Number.isFinite(x) || x < 0) x = 0
    x = Math.floor(x)
    this.room(8)
    while (x >= 0x80) { this.buf[this.n++] = (x % 0x80) | 0x80; x = Math.floor(x / 0x80) }
    this.buf[this.n++] = x
  }
  zv(x: number) { x = Math.trunc(Number.isFinite(x) ? x : 0); this.v(x >= 0 ? x * 2 : -x * 2 - 1) }
  bytes(b: Uint8Array) { this.room(b.length); this.buf.set(b, this.n); this.n += b.length }
  out() { return this.buf.slice(0, this.n) }
}

class FrameError extends Error {}
class Reader {
  i = 0
  readonly b: Uint8Array
  private dv: DataView
  constructor(b: Uint8Array) { this.b = b; this.dv = new DataView(b.buffer, b.byteOffset, b.byteLength) }
  private need(k: number) { if (this.i + k > this.b.length) throw new FrameError('short') }
  u8() { this.need(1); return this.b[this.i++] }
  u16() { this.need(2); const x = this.b[this.i] | (this.b[this.i + 1] << 8); this.i += 2; return x }
  u32() { this.need(4); const x = this.dv.getUint32(this.i, true); this.i += 4; return x }
  f64() { this.need(8); const x = this.dv.getFloat64(this.i, true); this.i += 8; return x }
  v() {
    let x = 0, mul = 1
    for (let k = 0; k < 8; k++) {
      const byte = this.u8()
      x += (byte & 0x7f) * mul
      if (!(byte & 0x80)) return x
      mul *= 0x80
    }
    throw new FrameError('varint')
  }
  zv() { const z = this.v(); return z % 2 === 0 ? z / 2 : -(z + 1) / 2 }
  rest() { const r = this.b.subarray(this.i); this.i = this.b.length; return r }
  done() { return this.i === this.b.length }
}

// ---------------------------------------------------------------- ops

const MASK = { pad: 1, kind: 2, id: 4, target: 8, type: 16, v: 32 } as const
const towerIndex = (kind: string) => (TOWER_KINDS as readonly string[]).indexOf(kind)

/** True when an op is safe to hand to C#: a known executable code, fields inside OP_BOUNDS, a known tower kind. */
export function validOp(op: Op): boolean {
  if (!op || typeof op !== 'object') return false
  const code = OP_CODE[op.op as keyof typeof OP_CODE]
  if (!code || !opName(code)) return false
  const int = (x: unknown, lo: number, hi: number) => x === undefined || (Number.isInteger(x) && (x as number) >= lo && (x as number) <= hi)
  if (!int(op.s, 0, OP_BOUNDS.seq) || !int(op.k, 0, OP_BOUNDS.tick) || (op.seat !== 0 && op.seat !== 1)) return false
  if (!int(op.pad, -1, OP_BOUNDS.pad) || !int(op.id, -OP_BOUNDS.id, OP_BOUNDS.id) || !int(op.target, -OP_BOUNDS.target, OP_BOUNDS.target) || !int(op.v, -OP_BOUNDS.v, OP_BOUNDS.v)) return false
  if (op.kind !== undefined && op.kind !== '' && towerIndex(op.kind) < 0) return false
  if (op.type !== undefined && !(op.type in FOCUS_CODE)) return false
  if (op.op === 'buy' && ((op.pad ?? -1) < 0 || !op.kind)) return false
  return true
}

/** Strips C# defaults so equal ops compare equal whichever side produced them. */
export function normalizeOp(op: Op): Op {
  const o: Op = { s: op.s, k: op.k, seat: op.seat, op: op.op }
  if (op.pad !== undefined && op.pad !== -1) o.pad = op.pad
  if (op.kind) o.kind = op.kind
  if (op.id) o.id = op.id
  if (op.target) o.target = op.target
  if (op.type) o.type = op.type
  if (op.v) o.v = op.v
  return o
}

function writeOp(w: Writer, op: Op) {
  w.v(op.s); w.v(op.k); w.u8(OP_CODE[op.op])
  const pad = op.pad ?? -1, kind = op.kind ? towerIndex(op.kind) : -1
  let mask = 0
  if (pad >= 0) mask |= MASK.pad
  if (kind >= 0) mask |= MASK.kind
  if (op.id) mask |= MASK.id
  if (op.target) mask |= MASK.target
  if (op.type) mask |= MASK.type
  if (op.v) mask |= MASK.v
  w.u8(mask)
  if (mask & MASK.pad) w.v(pad)
  if (mask & MASK.kind) w.u8(kind)
  if (mask & MASK.id) w.zv(op.id!)
  if (mask & MASK.target) w.zv(op.target!)
  if (mask & MASK.type) w.u8(FOCUS_CODE[op.type as keyof typeof FOCUS_CODE] ?? 0)
  if (mask & MASK.v) w.zv(op.v!)
}
function readOp(r: Reader, seat: Seat): Op {
  const s = r.v(), k = r.v(), code = r.u8(), mask = r.u8()
  const name = opName(code)
  if (!name || mask & ~63) throw new FrameError('op')
  const op: Op = { s, k, seat, op: name }
  if (mask & MASK.pad) op.pad = r.v()
  if (mask & MASK.kind) { const i = r.u8(); if (i >= TOWER_KINDS.length) throw new FrameError('kind'); op.kind = TOWER_KINDS[i] }
  if (mask & MASK.id) op.id = r.zv()
  if (mask & MASK.target) op.target = r.zv()
  if (mask & MASK.type) { const t = r.u8(); const type = t === 1 ? 'enemy' : t === 2 ? 'blocker' : t === 0 ? '' : null; if (type === null) throw new FrameError('type'); op.type = type }
  if (mask & MASK.v) op.v = r.zv()
  if (!validOp(op)) throw new FrameError('bounds')
  return op
}
const scratch = new Writer()
/** Encoded size of one op in bytes. */
export function opSize(op: Op): number { scratch.n = 0; writeOp(scratch, op); return scratch.n }
/** The longest prefix of `ops` (oldest first) whose encoding fits in `budget` bytes. */
export function fitOps(ops: readonly Op[], budget: number): number {
  let used = 0, n = 0
  for (const op of ops) { const size = opSize(op); if (used + size > budget || n >= 255) break; used += size; n++ }
  return n
}

// ---------------------------------------------------------------- frames

export function encodeFrame(f: Frame): Uint8Array {
  const w = new Writer()
  let flags = f.flags & ~(FLAG.digest | FLAG.deep)
  if ((f.kind === 1 || f.kind === 2) && f.digest) flags |= FLAG.digest
  if ((f.kind === 1 || f.kind === 2) && f.deep) flags |= FLAG.deep
  w.u8(f.kind); w.u8(flags); w.u16(f.seq)
  switch (f.kind) {
    case 1:
    case 2: {
      if (f.kind === 2) w.v(f.commit)
      w.v(f.exec); w.v(f.ack)
      const n = Math.min(255, f.cmds.length)
      w.u8(n)
      for (let i = 0; i < n; i++) writeOp(w, f.cmds[i])
      if (f.digest) { w.v(f.digest[0]); w.u32(f.digest[1]); w.u32(f.digest[2]) }
      if (f.deep) { w.v(f.deep[0]); w.u32(f.deep[1]) }
      break
    }
    case 3:
      w.v(f.resyncId); w.v(f.tick); w.u16(f.index); w.u16(f.count); w.u8(f.purpose); w.bytes(f.bytes)
      break
    case 4:
      w.u32(f.id); w.f64(f.time)
      break
    case 5:
      w.u32(f.id); w.f64(f.time); w.f64(f.reply)
      break
    case 6: {
      w.u8(f.code)
      let mask = 0
      if (f.a !== undefined) mask |= 1
      if (f.b !== undefined) mask |= 2
      if (f.c !== undefined) mask |= 4
      if (f.f !== undefined) mask |= 8
      w.u8(mask)
      if (f.a !== undefined) w.zv(f.a)
      if (f.b !== undefined) w.zv(f.b)
      if (f.c !== undefined) w.zv(f.c)
      if (f.f !== undefined) w.f64(f.f)
      break
    }
  }
  return w.out()
}

/** Decodes one frame; seat is the sender's seat as the transport knows it. Returns null for anything malformed. */
export function decodeFrame(bytes: Uint8Array, seat: Seat): Frame | null {
  if (!(bytes instanceof Uint8Array) || bytes.length < 4 || bytes.length > Math.max(MAX_FRAME_BYTES, 64 * 1024)) return null
  try {
    const r = new Reader(bytes)
    const kind = r.u8(), flags = r.u8(), seq = r.u16()
    switch (kind) {
      case FRAME.duo:
      case FRAME.lockstep: {
        const commit = kind === 2 ? r.v() : 0
        const exec = r.v(), ack = r.v(), n = r.u8()
        const cmds: Op[] = []
        for (let i = 0; i < n; i++) cmds.push(readOp(r, seat))
        const digest: Digest | undefined = flags & FLAG.digest ? [r.v(), r.u32(), r.u32()] : undefined
        const deep: DeepDigest | undefined = flags & FLAG.deep ? [r.v(), r.u32()] : undefined
        if (!r.done()) return null
        if (exec > OP_BOUNDS.tick || commit > OP_BOUNDS.tick || ack > OP_BOUNDS.seq) return null
        const base = { flags, seq, exec, ack, cmds, ...(digest ? { digest } : {}), ...(deep ? { deep } : {}) }
        return kind === 1 ? { kind: 1, ...base } : { kind: 2, commit, ...base }
      }
      case FRAME.chunk: {
        const resyncId = r.v(), tick = r.v(), index = r.u16(), count = r.u16(), purpose = r.u8()
        if (count === 0 || index >= count) return null
        return { kind: 3, flags, seq, resyncId, tick, index, count, purpose, bytes: r.rest().slice() }
      }
      case FRAME.ping: {
        const id = r.u32(), time = r.f64()
        return r.done() ? { kind: 4, flags, seq, id, time } : null
      }
      case FRAME.pong: {
        const id = r.u32(), time = r.f64(), reply = r.f64()
        return r.done() ? { kind: 5, flags, seq, id, time, reply } : null
      }
      case FRAME.control: {
        const code = r.u8(), mask = r.u8()
        if (mask & ~15 || code < 1 || code > 32) return null
        const f: ControlFrame = { kind: 6, flags, seq, code }
        if (mask & 1) f.a = r.zv()
        if (mask & 2) f.b = r.zv()
        if (mask & 4) f.c = r.zv()
        if (mask & 8) f.f = r.f64()
        return r.done() ? f : null
      }
      default:
        return null
    }
  } catch {
    return null
  }
}

/** Peeks the kind byte without decoding (the room's per-kind budgets use it). */
export const frameKind = (bytes: Uint8Array) => (bytes.length ? bytes[0] : 0)
export const controlName = (code: number) => (Object.keys(CONTROL) as Array<keyof typeof CONTROL>).find(k => CONTROL[k] === code) || ''
