/**
 * EngineLink over the real Unity player: JS -> Unity through CarrotUnity.net(json) (SendMessage('CarrotGame','Net',json)),
 * Unity -> JS through the window event 'carrot-net' (CarrotNet.jslib). Every incoming message is validated and normalized
 * (unsigned digests, ops bounds-checked and stripped of C# defaults) before the net layer sees it; malformed ones are counted.
 *
 * Page commands: intercept() installs CarrotUnity's send filter, so every page command (keyboard, HUD, results, settings,
 * level select) passes the session first; the session's own commands to Unity bypass the filter.
 */
import { normalizeOp, validOp } from './frames.ts'
import type { EngineLink, NetOut, Op, PageCommand, SnapshotNet } from './protocol.ts'

/** The slice of CarrotUnity the bridge needs (unity.ts). */
export type NetUnity = {
  net(json: string): void
  send(cmd: PageCommand): void
  setSendFilter?(filter?: (cmd: PageCommand) => boolean): void
  quality?(setting: string): void
}

const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x)
const u32 = (x: unknown) => (num(x) ? (x as number) >>> 0 : 0)
function digest(x: unknown, n: number): number[] | undefined {
  if (!Array.isArray(x) || x.length !== n || !x.every(num)) return undefined
  return x.map((v, i) => (i === 0 ? Math.max(0, Math.floor(v)) : u32(v)))
}
function ops(x: unknown, bad: { n: number }): Op[] {
  if (!Array.isArray(x)) return []
  const out: Op[] = []
  for (const raw of x) {
    if (!raw || typeof raw !== 'object') { bad.n++; continue }
    const op = normalizeOp({ ...(raw as Op), seat: (raw as Op).seat === 1 ? 1 : 0 })
    if (validOp(op)) out.push(op); else bad.n++
  }
  return out
}

/** Validates one Unity -> JS message; null when it is not a known, well-formed message. */
export function parseNetOut(raw: unknown, bad = { n: 0 }): NetOut | null {
  let m: Record<string, unknown>
  try { m = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown> } catch { bad.n++; return null }
  if (!m || typeof m !== 'object' || typeof m.t !== 'string') { bad.n++; return null }
  const int = (k: string) => (num(m[k]) ? Math.max(0, Math.floor(m[k] as number)) : 0)
  switch (m.t) {
    case 'loaded': return { t: 'loaded', exec: int('exec') }
    case 'own': return { t: 'own', exec: int('exec'), ops: ops(m.ops, bad) }
    case 'intent': {
      const o = m.op as Record<string, unknown> | undefined
      if (!o || typeof o.op !== 'string') { bad.n++; return null }
      const op = normalizeOp({ ...(o as unknown as Op), k: 0, seat: 0, s: num(o.s) ? (o.s as number) : 0 })
      if (!validOp(op)) { bad.n++; return null }
      const { k: _k, seat: _seat, ...intent } = op
      return { t: 'intent', op: intent }
    }
    case 'tick': {
      const out: Extract<NetOut, { t: 'tick' }> = { t: 'tick', exec: int('exec') }
      if (num(m.rexec)) out.rexec = int('rexec')
      const d = digest(m.d, 3), rd = digest(m.rd, 3), dd = digest(m.dd, 2), rdd = digest(m.rdd, 2)
      if (d) out.d = d as [number, number, number]
      if (rd) out.rd = rd as [number, number, number]
      if (dd) out.dd = dd as [number, number]
      if (rdd) out.rdd = rdd as [number, number]
      if (m.hold !== undefined) out.hold = !!m.hold
      return out
    }
    case 'result': {
      if (m.outcome !== 'cleared' && m.outcome !== 'won' && m.outcome !== 'lost') { bad.n++; return null }
      return { t: 'result', outcome: m.outcome, tick: int('tick'), health: int('health'), ...(num(m.score) ? { score: int('score') } : {}) }
    }
    case 'partnerView': {
      const b = m.boss as Record<string, unknown> | null | undefined
      return {
        t: 'partnerView', ...(typeof m.name === 'string' ? { name: m.name } : {}), health: int('health'), wave: int('wave'), waves: int('waves'), coins: int('coins'),
        phase: typeof m.phase === 'string' ? m.phase : '', exec: int('exec'), behind: int('behind'),
        boss: b && typeof b === 'object' && typeof b.name === 'string' && b.name ? { name: b.name, hp: num(b.hp) ? (b.hp as number) : 0, maxHp: num(b.maxHp) ? (b.maxHp as number) : 0, phase: num(b.phase) ? (b.phase as number) : 0 } : null,
      }
    }
    case 'state':
      if (typeof m.b64 !== 'string' || (m.target !== 'self' && m.target !== 'replica')) { bad.n++; return null }
      return { t: 'state', target: m.target, tick: int('tick'), b64: m.b64 }
    case 'reject': return { t: 'reject', seat: m.seat === 1 ? 1 : 0, s: int('s'), reason: typeof m.reason === 'string' ? m.reason : '' }
    case 'replayed': return { t: 'replayed', target: m.target === 'replica' ? 'replica' : 'self', tick: int('tick'), ms: num(m.ms) ? (m.ms as number) : 0 }
    case 'desync': {
      const pair = (x: unknown): [number, number] => (Array.isArray(x) && x.length === 2 ? [u32(x[0]), u32(x[1])] : [0, 0])
      return { t: 'desync', tick: int('tick'), local: pair(m.local), remote: pair(m.remote), ...(typeof m.reason === 'string' ? { reason: m.reason } : {}) }
    }
    case 'view': return typeof m.kind === 'string' ? { t: 'view', kind: m.kind } : null
    default: bad.n++; return null
  }
}

export type UnityLink = EngineLink & {
  /** Routes every page command through fn first (fn returns true when it consumed the command). */
  intercept(fn: (cmd: PageCommand) => boolean): () => void
  dispose(): void
  /** QA: messages that failed validation, and net() calls made while a 'carrot-net' dispatch was running. */
  readonly bad: number
  readonly reentry: number
}

export function createUnityLink(unity: NetUnity, target: EventTarget = window, isReady: () => boolean = () => true): UnityLink {
  const listeners = new Set<(m: NetOut) => void>()
  const bad = { n: 0 }
  let dispatching = false
  let reentry = 0
  let bypass = false
  let lastNet: SnapshotNet | null = null
  const onNet = (event: Event) => {
    const m = parseNetOut((event as CustomEvent).detail, bad)
    if (!m) return
    dispatching = true
    try { for (const fn of [...listeners]) fn(m) } finally { dispatching = false }
  }
  const onState = (event: Event) => {
    const d = (event as CustomEvent<{ net?: SnapshotNet }>).detail
    if (d && typeof d === 'object' && d.net && typeof d.net === 'object') lastNet = d.net
  }
  target.addEventListener('carrot-net', onNet)
  target.addEventListener('carrot-state', onState)
  return {
    net(json) {
      // Never into Unity from inside its own dispatch: defer instead (the net layer already does; this is the backstop).
      if (dispatching) { reentry++; queueMicrotask(() => unity.net(json)); return }
      unity.net(json)
    },
    onNet(fn) { listeners.add(fn); return () => { listeners.delete(fn) } },
    send(cmd) { bypass = true; try { unity.send(cmd) } finally { bypass = false } },
    ready: isReady,
    quality(tier) { unity.quality?.(tier) },
    snapshotNet: () => lastNet,
    intercept(fn) {
      unity.setSendFilter?.(cmd => bypass || !fn(cmd))
      return () => unity.setSendFilter?.(undefined)
    },
    dispose() { target.removeEventListener('carrot-net', onNet); target.removeEventListener('carrot-state', onState); listeners.clear(); unity.setSendFilter?.(undefined) },
    get bad() { return bad.n },
    get reentry() { return reentry },
  }
}
