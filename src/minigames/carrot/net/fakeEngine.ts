/**
 * A deterministic toy simulation that speaks the Unity net bridge (protocol.ts NetIn/NetOut) exactly as CarrotNetBridge.cs
 * does: duo own half + replica, lockstep endless, export/import/replay, results, partner view, rejects. It drives every Node
 * and Playwright test of the net layer, so none of them waits on a Unity build. Integer state, xorshift32, no Math.random.
 *
 * Like Unity it dispatches events synchronously from inside its frame (and from inside net() for 'state'/'replayed'); the
 * net layer must never call net() synchronously from an event handler (reentry is counted and must stay 0).
 */
import { DIGEST_EVERY, DEEP_DIGEST_EVERY, OP_CODE, PARTNER_VIEW_HZ, TOWER_KINDS } from './protocol.ts'
import type { EngineLink, NetIn, NetModeName, NetOut, Op, PageCommand, Seat, SnapshotNet } from './protocol.ts'

type Tower = { id: number; pad: number; kind: number; tier: number; builder: number }
type SimState = {
  tick: number; phase: 'ready' | 'playing' | 'won' | 'lost'; coins: number; health: number; wave: number; waves: number
  waveTick: number; rng: number; nextId: number; towers: Tower[]; kills: number; speed: 1 | 2; hold: boolean; endless: boolean
  lastMerge: number; focus: number; spent: number[]
}
const COST = [50, 70, 90, 80, 100]
const WAVE_TICKS = 240
const xorshift = (x: number) => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; return x >>> 0 }
function fnv(s: string): number { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h >>> 0 }
// The toy state is ASCII JSON, so plain btoa/atob round-trip it (browsers and Node 24).
const b64 = (s: string) => btoa(s)
const unb64 = (s: string) => atob(s)

/** The toy rules: build, upgrade (with a precondition tier), sell, merge, undo, early call, start, speed, focus. */
export class ToySim {
  st: SimState
  constructor(seed: number, waves: number, endless: boolean) {
    this.st = { tick: 0, phase: 'ready', coins: 200, health: 10, wave: 0, waves, waveTick: 0, rng: (seed >>> 0) || 0x9e3779b9, nextId: 1, towers: [], kills: 0, speed: 1, hold: false, endless, lastMerge: 0, focus: -1, spent: [0, 0] }
  }
  /** Applies one op; returns '' when accepted, else the rejection reason. */
  apply(op: Op): string {
    const s = this.st
    if (s.hold || s.phase === 'won' || s.phase === 'lost') return 'over'
    switch (op.op) {
      case 'start': if (s.phase !== 'ready') return 'started'; s.phase = 'playing'; s.wave = 1; s.waveTick = s.tick; return ''
      case 'buy': {
        const kind = TOWER_KINDS.indexOf((op.kind || '') as (typeof TOWER_KINDS)[number]), pad = op.pad ?? -1
        if (kind < 0 || pad < 0) return 'bad'
        if (s.towers.some(t => t.pad === pad)) return 'Pad taken'
        const cost = COST[kind % COST.length]
        if (s.coins < cost) return 'More coins needed'
        s.coins -= cost; s.spent[op.seat] += cost
        s.towers.push({ id: s.nextId++, pad, kind, tier: 1, builder: op.seat })
        return ''
      }
      case 'upgrade': {
        const t = s.towers.find(x => x.id === op.id)
        if (!t) return 'gone'
        if (op.v && t.tier !== op.v) return 'changed'
        if (t.tier >= 4) return 'max'
        const cost = 40 * t.tier
        if (s.coins < cost) return 'More coins needed'
        s.coins -= cost; s.spent[op.seat] += cost; t.tier++
        return ''
      }
      case 'sell': {
        const i = s.towers.findIndex(x => x.id === op.id)
        if (i < 0) return 'gone'
        if (op.v && s.towers[i].tier !== op.v) return 'changed'
        s.coins += 30 * s.towers[i].tier; s.towers.splice(i, 1)
        return ''
      }
      case 'merge': {
        const a = s.towers.find(x => x.id === op.id), b = s.towers.find(x => x.id === op.target)
        if (!a || !b || a === b || a.kind !== b.kind || a.tier !== 4 || b.tier !== 4) return 'cannot merge'
        b.tier = 5; s.towers.splice(s.towers.indexOf(a), 1); s.lastMerge = b.id
        return ''
      }
      case 'mergeUndo': {
        const b = s.towers.find(x => x.id === op.id)
        if (!b || s.lastMerge !== op.id || b.tier !== 5) return 'no merge'
        b.tier = 4; s.towers.push({ id: s.nextId++, pad: b.pad + 100, kind: b.kind, tier: 4, builder: op.seat }); s.lastMerge = 0
        return ''
      }
      case 'next': if (s.phase !== 'playing' || (!s.endless && s.wave >= s.waves)) return 'no wave'; s.coins += 10; this.nextWave(); return ''
      case 'speed': s.speed = op.v === 2 ? 2 : 1; return ''
      case 'focus': s.focus = op.type ? op.id ?? -1 : -1; return ''
    }
    return 'bad'
  }
  private nextWave() { const s = this.st; s.wave++; s.waveTick = s.tick }
  /** One fixed step of the match clock. The rules only run while playing; a held (cleared) duo half is frozen. */
  step() {
    const s = this.st
    s.tick++
    if (s.phase !== 'playing' || s.hold) return
    s.rng = xorshift(s.rng)
    if (s.tick % 30 === 0) s.coins += 3 + s.wave
    const defense = s.towers.reduce((a, t) => a + t.tier, 0)
    const pressure = s.endless ? 4 + s.wave * 3 : 3 + s.wave
    if (s.rng % 2000 < Math.max(0, pressure - defense)) s.health--
    if (s.rng % 7 === 0) s.kills++
    if (s.health <= 0) { s.health = 0; s.phase = 'lost'; return }
    if (s.tick - s.waveTick >= WAVE_TICKS) {
      if (!s.endless && s.wave >= s.waves) { s.hold = true; return }
      this.nextWave()
    }
  }
  digest(): [number, number, number] {
    const s = this.st
    const disc = fnv(`${s.tick}|${s.phase}|${s.coins}|${s.health}|${s.wave}|${s.rng}|${s.nextId}|${s.kills}|${s.towers.map(t => `${t.id}.${t.pad}.${t.kind}.${t.tier}`).join(',')}`)
    const f = new Float32Array([s.coins * 1.25 + s.health * 0.5 + s.tick / 3])
    return [s.tick, disc, new Uint32Array(f.buffer)[0]]
  }
  deepDigest(): [number, number] { return [this.st.tick, fnv(JSON.stringify(this.st))] }
  export(): string { return b64(JSON.stringify(this.st)) }
  import(data: string) { this.st = JSON.parse(unb64(data)) }
}

type Instance = { sim: ToySim; queue: Op[]; acc: number }
export type FakeEngineOptions = {
  now: () => number
  /** Waves per duo level (default 2; L25 3). */
  waves?: (level: number) => number
  /** Live ticks per frame cap (Unity: 8 in lockstep, 4 for the replica). */
  maxLive?: number
  /** Simulated cost per tick (ms of busy time), to emulate a slow phone. */
  tickCostMs?: number
  /** Starting hearts (default 10). */
  health?: number
}

export class FakeEngine implements EngineLink {
  mode: NetModeName | null = null
  seat: Seat = 0
  level = 0
  own: Instance | null = null
  replica: Instance | null = null
  shared: Instance | null = null
  run = false
  speed: 1 | 2 = 1
  matchPaused = false
  replicaExec = 0
  replicaB = 3
  stepTo = 0
  reentry = 0
  ticksRun = 0
  commands: PageCommand[] = []
  rejects = 0
  private listeners = new Set<(m: NetOut) => void>()
  private inFrame = false
  private lastFrame = 0
  private lastView = 0
  private ownOut: Op[] = []
  private unitySeq = 0
  private reported = new Set<string>()
  /** The partner's half cleared before ours did (C# keeps the same memory). */
  private partnerCleared = false
  private o: FakeEngineOptions
  constructor(o: FakeEngineOptions) { this.o = o }

  ready() { return true }
  onNet(fn: (m: NetOut) => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  private emit(m: NetOut) { for (const fn of [...this.listeners]) fn(m) }
  /** The page sends a command (only the session's unfiltered sends reach here in a match). */
  send(cmd: PageCommand) {
    this.commands.push(cmd)
    if (!this.mode) return
    if (cmd.type === 'debugCoins') { const inst = this.mode === 'duo' ? this.own : this.shared; if (inst) inst.sim.st.coins += Number(cmd.value) || 0; return }
    const op = this.opFrom(cmd)
    if (!op) return
    if (this.mode === 'duo') {
      if (!this.own) return
      const stamped: Op = { ...op, k: this.own.sim.st.tick + 1, seat: this.seat }
      const why = this.own.sim.apply(stamped)
      if (why) { this.rejects++; this.emit({ t: 'reject', seat: this.seat, s: op.s, reason: why }); return }
      this.ownOut.push(stamped)
    } else this.emit({ t: 'intent', op: { s: op.s, op: op.op, ...(op.pad !== undefined ? { pad: op.pad } : {}), ...(op.kind ? { kind: op.kind } : {}), ...(op.id ? { id: op.id } : {}), ...(op.target ? { target: op.target } : {}), ...(op.type ? { type: op.type } : {}), ...(op.v ? { v: op.v } : {}) } })
  }
  private opFrom(cmd: PageCommand): Op | null {
    const name = cmd.type === 'select' ? 'focus' : cmd.type
    if (!(name in OP_CODE) || name === 'pause' || name === 'mapPing' || name === 'presence') return null
    if (cmd.type === 'select' && cmd.selectionType !== 'enemy' && cmd.selectionType !== 'blocker') return null
    const op: Op = { s: ++this.unitySeq, k: 0, seat: this.seat, op: name as Op['op'] }
    if (cmd.pad !== undefined) op.pad = Number(cmd.pad)
    if (cmd.kind) op.kind = String(cmd.kind)
    if (cmd.id !== undefined) op.id = Number(cmd.id)
    if (cmd.target !== undefined) op.target = Number(cmd.target)
    if (cmd.selectionType) op.type = String(cmd.selectionType)
    if (cmd.value !== undefined) op.v = Number(cmd.value)
    return op
  }

  net(json: string) {
    if (this.inFrame) this.reentry++
    let m: NetIn
    try { m = JSON.parse(json) } catch { return }
    switch (m.t) {
      case 'session': {
        this.mode = m.mode; this.seat = m.seat; this.level = m.level
        const waves = this.o.waves?.(m.level) ?? (m.level === 25 ? 3 : 2)
        if (m.mode === 'duo') {
          this.own = { sim: new ToySim(m.level, waves, false), queue: [], acc: 0 }
          this.replica = { sim: new ToySim(m.level, waves, false), queue: [], acc: 0 }
          this.shared = null
        } else { this.shared = { sim: new ToySim(m.seed, 999, true), queue: [], acc: 0 }; this.own = this.replica = null }
        if (this.o.health) for (const inst of [this.own, this.replica, this.shared]) if (inst) inst.sim.st.health = this.o.health
        this.run = false; this.replicaExec = 0; this.stepTo = 0; this.unitySeq = 0; this.ownOut = []; this.reported.clear(); this.partnerCleared = false
        this.emit({ t: 'loaded', exec: 0 })
        return
      }
      case 'clock': this.run = m.run; this.speed = m.speed; return
      case 'go': this.send({ type: 'start' }); return
      case 'replica': if (this.replica) { for (const op of m.ops) this.replica.queue.push(op); this.replica.queue.sort((a, b) => a.k - b.k || a.s - b.s); this.replicaExec = Math.max(this.replicaExec, m.exec); if (m.b !== undefined) this.replicaB = m.b } return
      case 'partner': {
        const own = this.own?.sim.st
        if (!own) return
        if (m.outcome === 'lost' && own.phase !== 'won' && own.phase !== 'lost') { own.phase = 'lost'; this.result('lost') }
        if (m.outcome === 'cleared') this.partnerCleared = true
        if (this.partnerCleared && own.hold && own.phase === 'playing') { own.phase = 'won'; this.result('won') }
        return
      }
      case 'step': if (this.shared) { for (const op of m.ops) this.shared.queue.push(op); this.stepTo = Math.max(this.stepTo, m.to) } return
      case 'pause': this.matchPaused = m.on; return
      case 'export': { const inst = m.target === 'replica' ? this.replica : this.own ?? this.shared; if (inst) this.emit({ t: 'state', target: m.target ?? 'self', tick: inst.sim.st.tick, b64: inst.sim.export() }); return }
      case 'import': {
        const inst = m.target === 'replica' ? this.replica : this.own ?? this.shared
        if (!inst) return
        inst.sim.import(m.b64); inst.queue = []; inst.acc = 0
        if (m.target === 'replica') this.replicaExec = Math.max(this.replicaExec, inst.sim.st.tick)
        else if (this.shared) this.stepTo = inst.sim.st.tick
        return
      }
      case 'replay': {
        const inst = m.target === 'replica' ? this.replica : this.own ?? this.shared
        if (!inst) return
        const t0 = this.o.now()
        const ops = [...m.ops].sort((a, b) => a.k - b.k || a.s - b.s)
        let i = 0
        while (inst.sim.st.tick < m.to) {
          while (i < ops.length && ops[i].k <= inst.sim.st.tick + 1) inst.sim.apply(ops[i++])
          inst.sim.step()
        }
        if (this.shared && m.target === 'self') this.stepTo = Math.max(this.stepTo, inst.sim.st.tick)
        this.emit({ t: 'replayed', target: m.target, tick: inst.sim.st.tick, ms: this.o.now() - t0 })
        return
      }
      case 'end': this.mode = null; this.own = this.replica = this.shared = null; return
      default: return
    }
  }
  private result(outcome: 'cleared' | 'won' | 'lost') {
    const inst = this.mode === 'duo' ? this.own : this.shared
    if (!inst) return
    const key = outcome
    if (this.reported.has(key)) return
    this.reported.add(key)
    const st = inst.sim.st
    this.emit({ t: 'result', outcome, tick: st.tick, health: st.health, ...(st.endless ? { score: Math.max(0, st.wave - 1) } : {}) })
  }
  /** Runs one instance up to `to`, applying ops stamped T before tick T. Returns ticks run. */
  private advance(inst: Instance, to: number, max: number): number {
    let n = 0
    while (inst.sim.st.tick < to && n < max) {
      const T = inst.sim.st.tick + 1
      while (inst.queue.length && inst.queue[0].k <= T) {
        const op = inst.queue.shift()!
        const why = inst.sim.apply(op)
        if (why) { this.rejects++; if (inst === this.shared) this.emit({ t: 'reject', seat: op.seat, s: op.s, reason: why }) }
      }
      inst.sim.step(); n++; this.ticksRun++
      if (this.o.tickCostMs) { const end = this.o.now() + this.o.tickCostMs; while (this.o.now() < end) { /* busy */ } }
    }
    return n
  }
  /** One Unity frame (Update + LateUpdate): advance the instances, then flush events. */
  frame() {
    const now = this.o.now()
    const dt = this.lastFrame ? Math.min(250, now - this.lastFrame) : 16
    this.lastFrame = now
    if (!this.mode) return
    this.inFrame = true
    try {
      const live = this.o.maxLive ?? 8
      let d: [number, number, number] | undefined, dd: [number, number] | undefined, rd: [number, number, number] | undefined, rdd: [number, number] | undefined
      if (this.mode === 'duo' && this.own && this.replica) {
        const own = this.own
        if (this.run && !this.matchPaused) {
          own.acc += dt * 0.03 * this.speed
          const n = Math.min(live, Math.floor(own.acc)); own.acc -= n
          for (let i = 0; i < n; i++) {
            this.advance(own, own.sim.st.tick + 1, 1)
            if (own.sim.st.tick % DIGEST_EVERY === 0) d = own.sim.digest()
            if (own.sim.st.tick % DEEP_DIGEST_EVERY === 0) dd = own.sim.deepDigest()
          }
          if (own.acc > live) own.acc = 0
          if (own.sim.st.hold && own.sim.st.phase === 'playing') { this.result('cleared'); if (this.partnerCleared) { own.sim.st.phase = 'won'; this.result('won') } }
          if (own.sim.st.phase === 'lost') this.result('lost')
        }
        // replica: B ticks behind the partner's report, never past it; silent catch-up when far behind
        const rep = this.replica
        const target = this.replicaExec - this.replicaB
        const behind = target - rep.sim.st.tick
        let n = 0
        if (behind > 60) n = Math.min(120, behind)
        else if (this.run && !this.matchPaused) {
          rep.acc += dt * 0.03 * this.speed * (behind > 1 ? 1.1 : behind < -1 ? 0.9 : 1)
          n = Math.min(4, Math.floor(rep.acc)); rep.acc -= n
          if (rep.acc > 4) rep.acc = 0
        }
        n = Math.max(0, Math.min(n, this.replicaExec - rep.sim.st.tick))
        for (let i = 0; i < n; i++) {
          this.advance(rep, rep.sim.st.tick + 1, 1)
          if (rep.sim.st.tick % DIGEST_EVERY === 0) rd = rep.sim.digest()
          if (rep.sim.st.tick % DEEP_DIGEST_EVERY === 0) rdd = rep.sim.deepDigest()
        }
        if (this.ownOut.length) { this.emit({ t: 'own', exec: own.sim.st.tick, ops: this.ownOut }); this.ownOut = [] }
        this.emit({ t: 'tick', exec: own.sim.st.tick, rexec: rep.sim.st.tick, ...(d ? { d } : {}), ...(rd ? { rd } : {}), ...(dd ? { dd } : {}), ...(rdd ? { rdd } : {}), hold: own.sim.st.hold })
        if (now - this.lastView >= 1000 / PARTNER_VIEW_HZ) {
          this.lastView = now
          const r = rep.sim.st
          this.emit({ t: 'partnerView', health: r.health, wave: r.wave, waves: r.waves, coins: r.coins, phase: r.phase, exec: r.tick, behind: Math.max(0, this.replicaExec - r.tick), boss: r.phase === 'playing' && r.wave === r.waves ? { name: 'Toy Guardian', hp: 100 - ((r.tick - r.waveTick) * 100 / WAVE_TICKS | 0), maxHp: 100, phase: 1 } : null })
        }
      } else if (this.mode === 'endless' && this.shared) {
        const inst = this.shared
        const far = this.stepTo - inst.sim.st.tick > 60
        const start = this.o.now()
        let n = 0
        while (inst.sim.st.tick < this.stepTo && (far ? this.o.now() - start < 8 && n < 120 : n < live)) {
          n += this.advance(inst, inst.sim.st.tick + 1, 1)
          if (inst.sim.st.tick % DIGEST_EVERY === 0) d = inst.sim.digest()
          if (inst.sim.st.tick % DEEP_DIGEST_EVERY === 0) dd = inst.sim.deepDigest()
        }
        if (inst.sim.st.phase === 'lost') this.result('lost')
        this.emit({ t: 'tick', exec: inst.sim.st.tick, ...(d ? { d } : {}), ...(dd ? { dd } : {}), hold: false })
      }
    } finally { this.inFrame = false }
  }
  snapshotNet(): SnapshotNet | null {
    const inst = this.mode === 'duo' ? this.own : this.shared
    if (!inst || !this.mode) return null
    const st = inst.sim.st
    return { mode: this.mode, seat: this.seat, side: this.seat, hold: st.hold, netTick: st.tick, matchPaused: this.matchPaused, pausedBy: -1, pending: [], ...(st.endless ? { score: Math.max(0, st.wave - 1) } : {}) }
  }
  /** QA: the local state (for asserting both peers agree). */
  stateOf(which: 'own' | 'replica' | 'shared') { const inst = which === 'own' ? this.own : which === 'replica' ? this.replica : this.shared; return inst ? inst.sim.st : null }
}
