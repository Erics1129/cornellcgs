/**
 * Pure web feel model (no DOM, importable from Node: scripts/test-forge-feel.mjs).
 * The strike gate, survival odds, outcome labels, haptics, render resolution, label placement,
 * the sale coin schedule and the presentation-only blade temperature estimate used by the audio.
 * Every number lives in WEB_TUNING; src/minigames/forge/feel-tuning.json "web" overrides it.
 */
import { FAMILIES, METALS, RULES, TITLES } from './config.ts'
import type { Metal, Outcome } from './config.ts'
import { flowDuration, flowNeed, odds, stage, value } from './engine.ts'
import type { GameEvent, Knife, Run } from './engine.ts'
import type { Motion, ViewClass } from './bridge.ts'

/** Web feel numbers. The strike numbers mirror ForgeStrikeTuning (unity/.../ForgeFeel.cs). */
export const WEB_TUNING = {
  gate: {
    /** Next-hit shatter chance (at the predicted contact, outside Flow) from which early presses are refused. */
    riskGate: .2,
    /** Unity schedules a Strike that arrives at least this long after the previous contact. */
    scheduleAfterContactMs: 150,
    /** At high risk, presses before contact + this are refused so the player sees the result first. */
    riskAfterContactMs: 250,
    /** Shatter: presses this soon are refused; a later press ends the hold and goes on. */
    shatterIgnoreMs: 600,
    /** Shatter: the broken knife's card and loss stay this long; the next knife is chosen at chooseMs. */
    shatterHoldMs: 1500, shatterChooseMs: 1200,
    /** One press in the last heatBufferMs of heating fires on 'seated'. */
    heatBufferMs: 600,
    /** No 'seated' this long after the engine's move to the anvil: fire anyway (Unity waits up to 400 ms). */
    seatTimeoutMs: 600,
    /** Heating that never reached the anvil (the blank left the coals) is abandoned this long after it was due. */
    heatWatchdogMs: 1500,
    /** Pre-contract builds send no 'seated': the blank lands about this long after the move. */
    legacySeatMs: 450,
    /** The HUD never stays locked longer than this after an impact without its 'settled'. */
    settleWatchdogMs: 1200,
    /** A sent strike with no impact for this long (an old build's cancelled walk) unlocks. */
    strikeWatchdogMs: 8000,
    /** Swing timeline predictions (ForgeStrikeTuning): contact after the windup, apex before contact. */
    contactMs: 190, firstContactMs: 215, flowContactMs: 125, apexBeforeContactMs: 85, flowApexBeforeContactMs: 60,
    cycleMs: 640, flowCycleMs: 595,
    /** After this long without a contact the next swing starts from rest (the longer first windup). */
    restIdleMs: 1200,
    /** Pre-contract builds: impact at 340 ms, apex at 240 ms, settled at 760 ms of swing time (Flow: /1.5). */
    legacyContactMs: 340, legacyApexMs: 240, legacyFlowContactMs: 227, legacySettleAfterContactMs: 420,
  },
  hud: {
    /** Outcome labels keep at least this fraction of the view height from the blade centre. */
    labelClearance: .12,
    /** Label offset above the anvil label as a fraction of the view height. */
    labelLift: .16,
    /** Refusal feedback: the Forge key shakes this many px for this long. */
    refuseShakePx: 2, refuseShakeMs: 120,
    /** A scene-side refusal hint is shown at most once per this many ms. */
    refuseHintMs: 1800,
    /** Flow edge glow pulses at most once per this many ms. */
    flowPulseMs: 1000,
    /** Survive-N-more horizon and the outcome history length. */
    surviveStrikes: 3, historyLength: 10,
    /** Roll needle: sweeps onto the odds bar in rollSweepMs (at most 250), stays rollHoldMs after the impact. */
    rollSweepMs: 220, rollHoldMs: 600,
    /** Sale count: no coin-land events by fallbackStartMs, then count up until fallbackEndMs. */
    coinFallbackStartMs: 480, coinFallbackEndMs: 1100,
    /** How long each outcome callout stays (the Shatter callout uses gate.shatterHoldMs). */
    goodHoldMs: 900, perfectHoldMs: 1200, chipHoldMs: 1100, dullHoldMs: 800, evolvedHoldMs: 1600,
    /** Phone work focus: a touch in this lower-left fraction of the canvas brings the d-pad back. */
    padRevealX: .3, padRevealY: .7,
  },
  render: {
    /** Unity quality tier -> Module.devicePixelRatio (capped at the device DPR). */
    phoneDpr: [2, 1.5, 1.25, 1], desktopDpr: [1.5, 1.5, 1.25, 1],
    /** Tier used until Unity reports one. Integration may start phones at 2 (critique: real-device check). */
    phoneStartTier: 1, desktopStartTier: 0,
  },
  heat: {
    /** Presentation-only temperature estimate, mirroring ForgeMetalTuning (hot-metal-vfx). */
    coolK: 1.87e-14, bodyThicknessM: .003, anvilTauScale: 2, floorBodyC: 650, restoredC: 950, roomC: 20,
  },
}
export type WebTuning = typeof WEB_TUNING
type Section = Record<string, number | number[]>

/** Merge JSON overrides onto the defaults: known numeric keys only, finite values, clamped to [0, 10x default]. */
export function webTuning(overrides: unknown): WebTuning {
  const out = structuredClone(WEB_TUNING) as unknown as Record<string, Section>
  if (!overrides || typeof overrides !== 'object') return out as unknown as WebTuning
  for (const [section, values] of Object.entries(overrides as Record<string, unknown>)) {
    const target = out[section]; if (!target || !values || typeof values !== 'object') continue
    for (const [key, v] of Object.entries(values as Record<string, unknown>)) {
      const base = target[key]
      if (typeof base === 'number' && typeof v === 'number' && Number.isFinite(v)) target[key] = Math.max(0, Math.min(Math.max(1, Math.abs(base) * 10), v))
      else if (Array.isArray(base) && Array.isArray(v) && v.length === base.length && v.every(n => typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= 4)) target[key] = v as number[]
    }
  }
  const g = out.gate as WebTuning['gate']
  // The gate may never send earlier than Unity accepts (a refused Strike would drop the press).
  g.scheduleAfterContactMs = Math.max(150, g.scheduleAfterContactMs as number)
  g.riskAfterContactMs = Math.max(g.scheduleAfterContactMs, g.riskAfterContactMs as number)
  g.settleWatchdogMs = Math.min(1200, Math.max(400, g.settleWatchdogMs as number))
  // Balance floors (ForgeTuning.cs): the page predicts with the same clamped cycles Unity enforces.
  g.cycleMs = Math.min(900, Math.max(640, g.cycleMs as number)); g.flowCycleMs = Math.min(605, Math.max(585, g.flowCycleMs as number))
  g.shatterIgnoreMs = Math.min(g.shatterChooseMs as number, g.shatterIgnoreMs as number)
  const h = out.hud as WebTuning['hud']; h.rollSweepMs = Math.min(250, h.rollSweepMs as number)
  return out as unknown as WebTuning
}

// ---------------------------------------------------------------------------------------------
// Strike gate
// ---------------------------------------------------------------------------------------------

/**
 * What the gate needs to know about the moment of a press. risk = shatter chance at the predicted
 * contact; flow = that contact is a Flow swing (Flow running, or a full bar that starts it);
 * armed = a heated knife lies on the anvil (otherwise a free press starts forging a blank).
 */
export type GateInput = { risk: number; flow: boolean; protocol: number; armed?: boolean }
/** busy: a tray, a sale or Unity itself is not ready; cancelled: Unity cancelled the swing (settled x = -1). */
export type RefuseReason = 'risk' | 'hold' | 'heating' | 'busy' | 'cancelled'
/**
 * strike: send a Strike now. prepare: no armed knife, start forging a blank (the page's prepare()).
 * buffer: one press is held and fires later (at contact + 150 ms, at an old build's 'settled', or on
 * 'seated'). absorb: the press joins the strike already in flight or the press already held (at most
 * one buffered, so it never adds a blow); the key acknowledges it. refuse: nothing is sent, with
 * feedback. endHold: this press also ended a Shatter hold.
 */
export type PressDecision =
  | { kind: 'strike'; endHold?: boolean }
  | { kind: 'prepare'; endHold?: boolean }
  | { kind: 'buffer'; until: 'contact' | 'settled' | 'seated'; endHold?: boolean }
  | { kind: 'absorb'; reason: 'queued' | 'early' }
  | { kind: 'refuse'; reason: RefuseReason }
export type DueResult = 'fire' | 'drop' | null
type Committed = { seq: number; sentAt: number; contactAt: number; apexAt: number }

/**
 * One Strike in flight, at most one buffered press, every press answered.
 * Risk-aware (critique #32): below riskGate, or in Flow, a press from the apex of the current swing
 * onward is buffered (Flow: from the swing's start, so mashing never gets scolded) and earlier
 * presses join the swing in flight. At riskGate or more outside Flow, presses before contact + 250 ms
 * are refused with feedback, so the player sees the result before committing to the next blow.
 * Pre-contract builds (protocol 0) ignore a Strike until their 'settled', so a buffered press fires
 * on that 'settled'. Every press still needs its own input; nothing auto-repeats.
 */
export class StrikeGate {
  t: WebTuning['gate']
  private committed: Committed | null = null
  private lastContact = -Infinity
  private impactAt = -Infinity
  private awaitingSettle = false
  private buffer: { at: number; until: 'contact' | 'settled' | 'seated'; high?: boolean } | null = null
  private shatterAt = -Infinity
  private holding = false
  private heatUntil: number | null = null
  private anvilAt: number | null = null
  private seatedAt: number | null = null
  constructor(tuning: WebTuning['gate'] = WEB_TUNING.gate) { this.t = tuning }

  get queued() { return !!this.buffer }
  get inFlight() { return !!this.committed }
  get heating() { return this.heatUntil !== null }
  get holdingShatter() { return this.holding }
  get lastContactAt() { return this.lastContact }
  get shatteredAt() { return this.shatterAt }
  highRisk(input: GateInput) { return !input.flow && input.risk >= this.t.riskGate }

  /** Predicted contact time of a press at `now` (for the risk shown and for the gate's own risk). */
  predictContact(now: number, input: Pick<GateInput, 'flow' | 'protocol'>) {
    const t = this.t, legacy = input.protocol < 2
    if (this.committed) return this.committed.contactAt
    if (legacy) {
      const start = this.awaitingSettle ? Math.max(now, this.impactAt + t.legacySettleAfterContactMs) : now
      return start + (input.flow ? t.legacyFlowContactMs : t.legacyContactMs)
    }
    const idle = now - this.lastContact > t.restIdleMs
    const swing = input.flow ? t.flowContactMs : idle ? t.firstContactMs : t.contactMs
    return Math.max(now + swing, this.lastContact + (input.flow ? t.flowCycleMs : t.cycleMs))
  }

  /** A press (Space, a tap on the blade or the Forge key). */
  press(now: number, input: GateInput): PressDecision {
    const t = this.t
    let endHold = false
    if (this.holding) {
      if (now - this.shatterAt < t.shatterIgnoreMs) return { kind: 'refuse', reason: 'hold' }
      this.holding = false; endHold = true
    }
    if (this.heatUntil !== null) {
      if (this.buffer) return { kind: 'absorb', reason: 'queued' }
      if (now >= this.heatUntil - t.heatBufferMs) { this.buffer = { at: now, until: 'seated' }; return { kind: 'buffer', until: 'seated', endHold } }
      return { kind: 'refuse', reason: 'heating' }
    }
    const high = this.highRisk(input)
    if (this.committed) {
      if (high) return { kind: 'refuse', reason: 'risk' }
      if (this.buffer) return { kind: 'absorb', reason: 'queued' }
      if (!input.flow && now < this.committed.apexAt) return { kind: 'absorb', reason: 'early' }
      this.buffer = { at: now, until: input.protocol < 2 ? 'settled' : 'contact' }
      return { kind: 'buffer', until: this.buffer.until, endHold }
    }
    if (input.armed === false) {
      // No heated knife on the anvil: the press starts forging a blank, once the last swing has settled
      // (New and Start never move knives under a hammer that is still rebounding).
      if (!this.settling(now)) { this.buffer = null; return { kind: 'prepare', endHold } }
      if (this.buffer) return { kind: 'absorb', reason: 'queued' }
      this.buffer = { at: now, until: 'settled' }
      return { kind: 'buffer', until: 'settled', endHold }
    }
    if (high && now < this.lastContact + t.riskAfterContactMs) return { kind: 'refuse', reason: 'risk' }
    if (now >= this.earliest(now, input)) { this.buffer = null; return { kind: 'strike', endHold } }
    if (this.buffer) return { kind: 'absorb', reason: 'queued' }
    this.buffer = { at: now, until: input.protocol < 2 ? 'settled' : 'contact', high }
    return { kind: 'buffer', until: this.buffer.until, endHold }
  }

  /** The latest strike has landed but not settled yet (bounded by the settle watchdog). */
  private settling(now: number) {
    return this.awaitingSettle && !(this.impactAt > -Infinity && now - this.impactAt >= this.t.settleWatchdogMs)
  }
  /** Earliest time a new Strike may be sent (no strike in flight). */
  private earliest(now: number, input: GateInput) {
    if (input.protocol < 2) return this.settling(now) ? Infinity : -Infinity
    return this.lastContact + (this.highRisk(input) ? this.t.riskAfterContactMs : this.t.scheduleAfterContactMs)
  }

  /** A held press is due: 'fire' (send it now), 'drop' (the risk rose past the gate: refuse it) or null. */
  due(now: number, input: GateInput): DueResult {
    const b = this.buffer; if (!b) return null
    if (b.until === 'seated') {
      if (this.heatUntil !== null && !this.seatReady(now, input)) return null
      this.heatUntil = null; this.buffer = null; return 'fire'
    }
    if (this.committed) return null
    // A press held at low risk (or in Flow) never fires into a risk that has since crossed the gate:
    // it is refused as soon as the contact that raised the risk has landed.
    if (!b.high && this.highRisk(input)) { this.buffer = null; return 'drop' }
    if (now < (b.until === 'settled' ? (this.settling(now) ? Infinity : -Infinity) : this.earliest(now, input))) return null
    this.buffer = null
    return 'fire'
  }
  /** When to call due() next by time alone (null: wait for an event). */
  nextDue(input: Pick<GateInput, 'protocol'>): number | null {
    const b = this.buffer; if (!b) return null
    if (b.until === 'seated') return this.seatDeadline(input)
    if (this.committed) return null
    if (b.until === 'settled') return this.awaitingSettle ? (this.impactAt > -Infinity ? this.impactAt + this.t.settleWatchdogMs : null) : 0
    return this.lastContact + this.t.scheduleAfterContactMs
  }
  private seatReady(now: number, input: Pick<GateInput, 'protocol'>) {
    if (this.anvilAt === null) return false
    if (this.seatedAt !== null) return true
    return now >= this.anvilAt + (input.protocol < 2 ? this.t.legacySeatMs : this.t.seatTimeoutMs)
  }

  /** The page sent Strike(seq) at `now`. */
  sent(seq: number, now: number, input: Pick<GateInput, 'flow' | 'protocol'>) {
    const contactAt = this.predictContact(now, input), t = this.t
    const before = input.protocol < 2 ? (input.flow ? (t.legacyContactMs - t.legacyApexMs) / 1.5 : t.legacyContactMs - t.legacyApexMs) : input.flow ? t.flowApexBeforeContactMs : t.apexBeforeContactMs
    this.committed = { seq, sentAt: now, contactAt, apexAt: contactAt - before }
    this.awaitingSettle = true
  }
  /** Unity 'swing' (x = ms to contact). */
  swing(seq: number, now: number, msToContact: number, flow: boolean) {
    const c = this.committed; if (!c || (seq && c.seq !== seq) || !(msToContact >= 0)) return
    c.contactAt = now + msToContact; c.apexAt = c.contactAt - (flow ? this.t.flowApexBeforeContactMs : this.t.apexBeforeContactMs)
  }
  /** Unity 'impact' (contact). */
  impact(seq: number, now: number) {
    if (this.committed && (!seq || this.committed.seq === seq)) this.committed = null
    this.lastContact = now; this.impactAt = now
  }
  /**
   * Unity 'settled'. latest: it settles the newest strike. cancelled: x = -1 (refused or cancelled
   * with no impact). Returns true when it cancelled the strike in flight (the page answers that press).
   */
  settled(seq: number, now: number, cancelled: boolean, latest: boolean) {
    let dropped = false
    if (cancelled && this.committed && (!seq || this.committed.seq === seq)) { this.committed = null; dropped = true; if (this.buffer?.until !== 'seated') this.buffer = null }
    if (latest) this.awaitingSettle = false
    return dropped
  }
  /** A Shatter landed: hold the loss on screen and refuse presses for shatterIgnoreMs. */
  shatter(now: number) { this.holding = true; this.shatterAt = now; if (this.buffer?.until !== 'seated') this.buffer = null }
  endHold() { this.holding = false }
  /** Heating started; the heat event and the move to the anvil land after `ms`. */
  heatingStarted(now: number, ms: number) { this.heatUntil = now + ms; this.anvilAt = null; this.seatedAt = null }
  /** The engine moved the heated blank to the anvil. */
  heated(now: number) { if (this.heatUntil !== null) this.anvilAt = now }
  /** Unity 'seated'. */
  /**
   * Unity 'seated'. A 'seated' that arrives before the engine's move to the anvil (critique #13: it should
   * not) is remembered, and the held press fires once the move has landed, never into an empty anvil.
   */
  seated(now: number) { if (this.heatUntil !== null) { this.seatedAt = now; if (!this.buffer && this.anvilAt !== null) this.heatUntil = null } }
  /** When the heating hand-off completes by time alone (no 'seated'), or null. */
  seatDeadline(input: Pick<GateInput, 'protocol'>) { return this.heatUntil === null || this.anvilAt === null ? null : this.seatedAt ?? this.anvilAt + (input.protocol < 2 ? this.t.legacySeatMs : this.t.seatTimeoutMs) }
  /** The heating hand-off is complete without a held press (seat reached or timed out). */
  settleHeating(now: number, input: Pick<GateInput, 'protocol'>) { if (this.heatUntil !== null && !this.buffer && this.seatReady(now, input)) this.heatUntil = null }
  /** Cancel the heating hand-off. Returns true when a held press was dropped with it (the page answers it). */
  cancelHeating() { const held = this.buffer?.until === 'seated'; this.heatUntil = null; this.anvilAt = null; this.seatedAt = null; if (held) this.buffer = null; return held }
  /** Heating whose blank never reached the anvil (it left the coals, or the run changed) is abandoned. */
  heatDeadline() { return this.heatUntil !== null && this.anvilAt === null ? this.heatUntil + this.t.heatWatchdogMs : null }
  /** Returns true when the heat watchdog dropped a held press. */
  heatWatchdog(now: number) { const d = this.heatDeadline(); return d !== null && now >= d ? this.cancelHeating() : false }
  /** Drop a held press (a tray opened, focus left). Returns true when one was held. */
  cancelBuffer() { const had = !!this.buffer; this.buffer = null; return had }
  /** Watchdogs: a strike that never landed, or an impact whose 'settled' never came. Returns true when it released something. */
  watchdog(now: number) {
    let released = false
    if (this.committed && now - this.committed.sentAt > this.t.strikeWatchdogMs) { this.committed = null; this.awaitingSettle = false; this.buffer = null; released = true }
    if (!this.committed && this.awaitingSettle && this.impactAt > -Infinity && now - this.impactAt >= this.t.settleWatchdogMs) { this.awaitingSettle = false; released = true }
    return released
  }
  /** Keep, Sell, New, Trade and items wait for the latest 'settled' (about 260 ms after contact). */
  locked(now: number) {
    if (this.committed || (this.buffer && this.buffer.until !== 'seated')) return true
    return this.awaitingSettle && !(this.impactAt > -Infinity && now - this.impactAt >= this.t.settleWatchdogMs)
  }
  /** When locked() may change by time alone (for a timer), or null. */
  unlockAt() { return this.committed ? this.committed.sentAt + this.t.strikeWatchdogMs : this.awaitingSettle && this.impactAt > -Infinity ? this.impactAt + this.t.settleWatchdogMs : null }
  reset() { this.committed = null; this.buffer = null; this.awaitingSettle = false; this.holding = false; this.heatUntil = null; this.anvilAt = null; this.seatedAt = null }
}

// ---------------------------------------------------------------------------------------------
// Odds presentation (display only; the engine is untouched)
// ---------------------------------------------------------------------------------------------

/** The odds at the predicted contact: Flow that will have run out by then no longer protects the hit. */
export function oddsAtContact(k: Knife, s: Run, msToContact: number) {
  const expiring = k.flow > 0 && k.flow * 1000 <= msToContact
  return { odds: odds(expiring ? { ...k, flow: 0 } : k, s), expiring }
}

/**
 * Chance the knife survives the next n strikes, by the Markov chain over the engine's odds() transitions
 * (perfect +2, good +1, dull 0, chip -1, shatter ends), with Guard (a raw shatter becomes a chip and
 * spends it), Flow time remaining (strikes landing inside it are protected), and pips (a full bar makes
 * the next strike start Flow). Flow strikes land at the fastest Flow cadence (flowCycleMs).
 */
export function survival(k: Knife, s: Run, n: number, { firstContactMs = 0, flowCycleMs = WEB_TUNING.gate.flowCycleMs } = {}) {
  const need = flowNeed(s), memo = new Map<string, number>()
  const go = (i: number, level: number, guard: boolean, pips: number, flowMs: number): number => {
    if (i >= n) return 1
    const key = `${i}:${level}:${guard ? 1 : 0}:${pips}:${Math.round(flowMs)}`
    const hit = memo.get(key); if (hit !== undefined) return hit
    const knife = { ...k, level, guard: false, pips, flow: flowMs > 0 ? flowMs / 1000 : 0 }
    const protectedHit = flowMs > 0 || (s.version >= 2 && pips >= need)
    const p = odds(knife, s)
    let nextFlow = flowMs, nextPips = pips
    if (flowMs > 0) nextFlow = flowMs - flowCycleMs
    else if (protectedHit) { nextFlow = flowDuration(s) * 1000 - flowCycleMs; nextPips = 0 }
    else nextPips = Math.min(need, pips + 1)
    if (nextFlow < 0) nextFlow = 0
    const step = (dl: number, g: boolean) => go(i + 1, Math.max(0, level + dl), g, nextPips, nextFlow)
    let total = p.perfect * step(2, guard) + p.good * step(1, guard) + p.dull * step(0, guard) + p.chip * step(-1, guard)
    if (p.shatter > 0 && guard) total += p.shatter * (level ? step(-1, false) : step(0, false))
    memo.set(key, total); return total
  }
  // Flow left at the first contact.
  const flowAtFirst = Math.max(0, k.flow * 1000 - firstContactMs)
  return go(0, k.level, k.guard, k.pips, flowAtFirst)
}

/** The engine's next random() for a state, without advancing it: the same mulberry32 step as engine.ts random(). */
export function peekRandom(state: Pick<Run, 'rng'>) { const s = { rng: state.rng }; let t = s.rng += 0x6D2B79F5; s.rng >>>= 0; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296 }
/**
 * The honest roll of the next 'hit' on knife k, read from the pre-hit state (display only, critique #34):
 * u is the first random() call in act('hit'), placed on the unguarded distribution in the engine's order
 * perfect | good | dull | chip | shatter, after Flow starts when the bar is full. outcome is what the engine
 * resolves (a Guard turns a raw shatter into a chip, or a dull at level 0).
 */
export function nextRoll(k: Knife, s: Run) {
  const flowStarted = s.version >= 2 && !k.flow && k.pips >= flowNeed(s)
  const chances = odds({ ...(flowStarted ? { ...k, flow: flowDuration(s), pips: 0 } : k), guard: false }, s), u = peekRandom(s)
  let acc = 0, raw: Outcome = 'shatter'
  for (const o of Object.keys(chances) as Outcome[]) { acc += chances[o]; if (u < acc) { raw = o; break } }
  const outcome: Outcome = raw === 'shatter' && k.guard ? (k.level ? 'chip' : 'dull') : raw
  return { u, chances, raw, outcome, guarded: raw !== outcome }
}

/** The knife Start forging will pick (mirrors ForgePage.prepare() without an id). */
export function prepareTarget(s: Run): Knife | undefined {
  return s.knives.find(n => n.place === 'furnace') || s.knives.find(n => n.place === 'crate' && !n.heated) || s.knives.find(n => n.place === 'crate')
}
/** The knife the odds board describes: the anvil knife, otherwise the one Start forging will pick. */
export function riskKnife(s: Run): Knife | undefined { return s.knives.find(n => n.place === 'anvil') || prepareTarget(s) }

// ---------------------------------------------------------------------------------------------
// Outcome labels and haptics
// ---------------------------------------------------------------------------------------------

export type OutcomeLabel = { kind: Outcome | 'evolved'; title: string; delta: string; sub?: string; holdMs: number }
const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
/** The HUD callout for a hit event. Shatter shows the value that was lost (event.before). */
export function outcomeLabel(e: GameEvent, s: Run, t: WebTuning = WEB_TUNING): OutcomeLabel | null {
  if (e.kind !== 'hit' || !e.outcome) return null
  const guarded = !!e.before?.guard && !!e.after && !e.after.guard
  const sub = guarded ? 'Guard spent' : undefined
  const h = t.hud
  if (e.outcome === 'shatter') return { kind: 'shatter', title: 'Shattered', delta: `−${fmt(e.before ? value(e.before, s) : 0)}`, sub: e.before ? `${METALS[e.before.metal].name} ${FAMILIES[e.before.family]} +${e.before.level}` : undefined, holdMs: t.gate.shatterHoldMs }
  if (e.evolution && e.after) return { kind: 'evolved', title: 'Evolved', delta: e.outcome === 'perfect' ? '+2' : '+1', sub: TITLES[stage(e.after)], holdMs: h.evolvedHoldMs }
  const map: Record<Exclude<Outcome, 'shatter'>, [string, string, number]> = { perfect: ['Perfect', '+2', h.perfectHoldMs], good: ['Good', '+1', h.goodHoldMs], chip: ['Chip', '−1', h.chipHoldMs], dull: ['Dull', '—', h.dullHoldMs] }
  const [title, delta, holdMs] = map[e.outcome]
  return { kind: e.outcome, title, delta, sub, holdMs }
}

/** Vibration patterns (ms). Flow pulses are clamped to 12 ms. iOS has none: callers feature-detect. */
export const HAPTICS: Record<'dull' | 'good' | 'perfect' | 'chip' | 'shatter' | 'evolution' | 'coins', number[]> = {
  dull: [8], good: [16], perfect: [12, 40, 24], chip: [26, 30, 10], shatter: [35, 25, 20, 25, 60], evolution: [10, 50, 10, 50, 30], coins: [8, 35, 8, 35, 8],
}
export const FLOW_PULSE_MAX_MS = 12
export function hapticPattern(kind: keyof typeof HAPTICS, flow = false): number[] {
  const p = HAPTICS[kind]
  return flow ? p.map((ms, i) => i % 2 ? ms : Math.min(FLOW_PULSE_MAX_MS, ms)) : [...p]
}
/** The haptic for a hit event. */
export function hitHaptic(e: GameEvent): keyof typeof HAPTICS | null {
  if (e.kind !== 'hit' || !e.outcome) return null
  return e.evolution ? 'evolution' : e.outcome
}

// ---------------------------------------------------------------------------------------------
// Motion setting, render resolution, label placement
// ---------------------------------------------------------------------------------------------

export const MOTION_SHAKE: Record<Motion, number> = { full: 1, reduced: .5, off: 0 }
/** Sync options: reduced stays the OS flag OR a Motion setting other than Full. */
export function motionOptions(osReduced: boolean, motion: Motion) { return { reduced: osReduced || motion !== 'full', motion, shake: MOTION_SHAKE[motion] } }

/** Module.devicePixelRatio for a Unity quality tier (0 best .. 3 lowest), never above the device DPR. */
export function renderDpr(tier: number, view: ViewClass, deviceDpr: number, r: WebTuning['render'] = WEB_TUNING.render) {
  const table = view === 'desktop' ? r.desktopDpr : r.phoneDpr
  const i = Math.max(0, Math.min(3, Math.round(Number.isFinite(tier) ? tier : 0)))
  return Math.max(1, Math.min(deviceDpr || 1, table[i]))
}
/** Map a Unity 'quality' spot to a tier: '0'..'3', or the pre-contract 'low'. */
export function qualityTier(spot: string): number | null {
  if (/^[0-3]$/.test(spot)) return Number(spot)
  return spot === 'low' ? 2 : null
}

export type Bands = { top: number; bottom: number; left: number; right: number }
/**
 * Where the outcome callout goes, in CSS px from the canvas top-left: above the anvil label, inside the
 * HUD-free band, and never within `clearance` of the view height from the blade centre.
 */
export function labelPlacement(anvil: { x: number; y: number } | undefined, w: number, h: number, bands: Bands, labelH: number, hud: WebTuning['hud'] = WEB_TUNING.hud) {
  const inBand = (px: number, py: number) => px > bands.left && px < w - bands.right && py > bands.top && py < h - bands.bottom
  // A label outside the HUD-free band is stale (an older build sends it once, from the walking camera).
  const known = !!anvil && Number.isFinite(anvil.x) && Number.isFinite(anvil.y) && inBand(anvil.x / 100 * w, anvil.y / 100 * h)
  const bladeX = known ? anvil!.x / 100 * w : (bands.left + w - bands.right) / 2
  const bladeY = known ? anvil!.y / 100 * h : h * .62
  const minY = bands.top + labelH / 2 + 6, maxY = h - bands.bottom - labelH / 2 - 6
  const clear = hud.labelClearance * h + labelH / 2
  let y = Math.min(maxY, Math.max(minY, bladeY - Math.max(hud.labelLift * h, clear)))
  // If the band is too short above the blade, go below it instead, still clear of the centre.
  if (Math.abs(y - bladeY) < clear) y = Math.min(maxY, bladeY + clear)
  const x = Math.max(bands.left + 40, Math.min(w - bands.right - 40, bladeX))
  return { x: Math.round(x), y: Math.round(y), clear: Math.abs(y - bladeY) >= clear - .5 }
}

/** The gold shown while a sale's coins land: steps once per coin, exact on the last one. */
export function coinStep(from: number, amount: number, index: number, total: number) {
  if (!(total > 0) || index + 1 >= total) return from + amount
  return from + Math.round(amount * (index + 1) / total)
}
/** Fallback count when no coin-land events arrive: holds until startMs, eases to the total by endMs. */
export function coinFallback(from: number, amount: number, ms: number, hud: WebTuning['hud'] = WEB_TUNING.hud) {
  const q = Math.max(0, Math.min(1, (ms - hud.coinFallbackStartMs) / (hud.coinFallbackEndMs - hud.coinFallbackStartMs)))
  return from + amount * (1 - (1 - q) ** 3)
}

// ---------------------------------------------------------------------------------------------
// Presentation-only blade temperature (audio ring), mirroring hot-metal-vfx's model
// ---------------------------------------------------------------------------------------------

/** Pull temperature by metal (ForgeMetalTuning). */
export const PULL_C: Record<Metal, number> = { iron: 1180, bronze: 820, steel: 1150, silver: 720, damascus: 1150, obsidian: 950, meteor: 1200, auricite: 1250 }
/** Body temperature `ms` after leaving the coals at t0C, cooling radiatively, faster on the anvil. */
export function coolC(t0C: number, ms: number, h: WebTuning['heat'] = WEB_TUNING.heat) {
  if (!(ms > 0)) return t0C
  const T0 = t0C + 273.15, tau = ms / 1000 * h.anvilTauScale
  const T = Math.pow(Math.pow(T0, -3) + 3 * h.coolK * tau / h.bodyThicknessM, -1 / 3) - 273.15
  return Math.max(Math.min(t0C, h.floorBodyC), T)
}
/** Tracks when each knife came out of the fire so the strike ring can follow its temperature. */
export class HeatClock {
  private hot = new Map<number, { at: number; t0: number }>()
  /** The engine heat event (the blank leaves the coals at its pull temperature). */
  heated(id: number, metal: Metal, now: number) { this.hot.set(id, { at: now, t0: PULL_C[metal] }) }
  /** A heated knife arrived on the anvil without a heat event (from the rack or a reload). */
  arrived(id: number, now: number, h: WebTuning['heat'] = WEB_TUNING.heat) { if (!this.hot.has(id)) this.hot.set(id, { at: now, t0: h.restoredC }) }
  left(id: number) { this.hot.delete(id) }
  tempC(id: number, now: number, h: WebTuning['heat'] = WEB_TUNING.heat) { const e = this.hot.get(id); return e ? coolC(e.t0, now - e.at, h) : h.roomC }
}

// ---------------------------------------------------------------------------------------------
// Tension
// ---------------------------------------------------------------------------------------------

/** Tension 0..1 from the shatter risk (strike-feel's riskLow .15 / riskHigh .6). */
export function tension(risk: number, low = .15, high = .6) { const x = Math.max(0, Math.min(1, (risk - low) / (high - low))); return x * x * (3 - 2 * x) }

/** Engine replay floor, for documentation in tests (RULES.replayMinHitMs). */
export const REPLAY_FLOOR_MS = RULES.replayMinHitMs
