/**
 * State blobs (resync, reconnect restore, op logs): gzip (CompressionStream), split into RELAY_CHUNK_BYTES chunks on every path
 * so a transfer survives a path switch, acknowledged per chunk at app level and retried; a transfer that cannot finish inside
 * RESYNC_TIMEOUT_MS fails loudly (the session turns that into the desync error, never a silent hang).
 */
import { CHUNK_RETRY_MS, CONTROL, RELAY_CHUNK_BYTES, RESYNC_TIMEOUT_MS } from './protocol.ts'
import type { ChunkFrame, ControlFrame, Frame } from './frames.ts'

export function bytesToB64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
export function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}
/** 1-byte header: 0 raw, 1 gzip. */
export async function pack(raw: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'function') {
    try {
      const gz = new Uint8Array(await new Response(new Blob([raw as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer())
      const out = new Uint8Array(gz.length + 1); out[0] = 1; out.set(gz, 1); return out
    } catch { /* fall through to raw */ }
  }
  const out = new Uint8Array(raw.length + 1); out[0] = 0; out.set(raw, 1); return out
}
export async function unpack(packed: Uint8Array): Promise<Uint8Array> {
  if (packed[0] === 0) return packed.slice(1)
  if (packed[0] !== 1 || typeof DecompressionStream !== 'function') throw new Error('blob format')
  return new Uint8Array(await new Response(new Blob([packed.slice(1) as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer())
}

type Outgoing = { id: number; tick: number; purpose: number; chunks: Uint8Array[]; acked: boolean[]; sentAt: number[]; started: number; done: boolean; resolve: (ok: boolean) => void }
export type BlobSink = { sendChunk(frame: Omit<ChunkFrame, 'seq' | 'flags'>): void; sendControl(frame: Omit<ControlFrame, 'seq' | 'flags' | 'kind'>): void }

export class BlobChannel {
  private out = new Map<number, Outgoing>()
  private inbound = new Map<number, { tick: number; purpose: number; parts: Array<Uint8Array | undefined>; got: number; done: boolean }>()
  private now: () => number
  private sink: BlobSink
  /** Send times of the last chunks: any 1 s window holds at most 24 (26 KB), under the room's 32 KB/s chunk budget. */
  private sendTimes: number[] = []
  onBlob: (id: number, tick: number, purpose: number, bytes: Uint8Array) => void = () => {}
  /** Inbound progress (0..1) for the restore overlay. */
  onProgress: (id: number, fraction: number) => void = () => {}
  constructor(now: () => number, sink: BlobSink) { this.now = now; this.sink = sink }

  /** Sends packed bytes; resolves true once every chunk is acknowledged, false on timeout. */
  send(id: number, tick: number, purpose: number, bytes: Uint8Array): Promise<boolean> {
    const chunks: Uint8Array[] = []
    for (let i = 0; i < Math.max(1, bytes.length); i += RELAY_CHUNK_BYTES) chunks.push(bytes.subarray(i, i + RELAY_CHUNK_BYTES))
    if (chunks.length > 65535) return Promise.resolve(false)
    return new Promise(resolve => {
      const o: Outgoing = { id, tick, purpose, chunks, acked: chunks.map(() => false), sentAt: chunks.map(() => 0), started: this.now(), done: false, resolve }
      this.out.set(id, o)
      this.pump()
    })
  }
  /** Sends unacked chunks (first time at once, then every CHUNK_RETRY_MS); fails transfers older than the timeout. */
  pump() {
    const t = this.now()
    for (const o of this.out.values()) {
      if (o.done) continue
      if (t - o.started > RESYNC_TIMEOUT_MS) { o.done = true; this.out.delete(o.id); o.resolve(false); continue }
      while (this.sendTimes.length && t - this.sendTimes[0] >= 1000) this.sendTimes.shift()
      for (let i = 0; i < o.chunks.length && this.sendTimes.length < 24; i++) {
        if (o.acked[i] || (o.sentAt[i] && t - o.sentAt[i] < CHUNK_RETRY_MS)) continue
        o.sentAt[i] = t; this.sendTimes.push(t)
        this.sink.sendChunk({ kind: 3, resyncId: o.id, tick: o.tick, index: i, count: o.chunks.length, purpose: o.purpose, bytes: o.chunks[i] })
      }
    }
  }
  /** Handles chunk frames and chunk acks; returns true when the frame was one of ours. */
  receive(f: Frame): boolean {
    if (f.kind === 6 && f.code === CONTROL.chunkAck) {
      const o = this.out.get(f.a ?? -1)
      if (o && !o.done && f.b !== undefined && f.b >= 0 && f.b < o.acked.length) {
        o.acked[f.b] = true
        if (o.acked.every(Boolean)) { o.done = true; this.out.delete(o.id); o.resolve(true) }
      }
      return true
    }
    if (f.kind !== 3) return false
    let r = this.inbound.get(f.resyncId)
    if (!r) { r = { tick: f.tick, purpose: f.purpose, parts: new Array(f.count), got: 0, done: false }; this.inbound.set(f.resyncId, r) }
    this.sink.sendControl({ code: CONTROL.chunkAck, a: f.resyncId, b: f.index })
    if (r.done || f.count !== r.parts.length || r.parts[f.index]) return true
    r.parts[f.index] = f.bytes; r.got++
    this.onProgress(f.resyncId, r.got / r.parts.length)
    if (r.got === r.parts.length) {
      r.done = true
      const total = r.parts.reduce((a, p) => a + (p ? p.length : 0), 0)
      const all = new Uint8Array(total)
      let at = 0
      for (const p of r.parts) { all.set(p!, at); at += p!.length }
      r.parts = []
      this.onBlob(f.resyncId, r.tick, r.purpose, all)
    }
    return true
  }
  get busy() { return [...this.out.values()].some(o => !o.done) }
  cancel() { for (const o of this.out.values()) if (!o.done) { o.done = true; o.resolve(false) } this.out.clear() }
}
