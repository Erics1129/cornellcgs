// Pure tests for the web feel model (src/minigames/forge/feel.ts): the strike gate (with a simulated
// Unity on both protocols), survival odds, outcome labels, haptics, render resolution, label placement,
// the sale count and the tuning merge. Run: node scripts/test-forge-feel.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { StrikeGate, WEB_TUNING, webTuning, nextRoll, peekRandom, survival, oddsAtContact, riskKnife, prepareTarget, outcomeLabel, HAPTICS, hapticPattern, hitHaptic, FLOW_PULSE_MAX_MS, motionOptions, renderDpr, qualityTier, labelPlacement, coinStep, coinFallback, coolC, HeatClock, tension } from '../src/minigames/forge/feel.ts'
import { StrikeLedger } from '../src/minigames/forge/bridge.ts'
import { act, createRun, odds, flowNeed } from '../src/minigames/forge/engine.ts'
import { RULES } from '../src/minigames/forge/config.ts'

let checks = 0
const ok = (cond, msg) => { assert.ok(cond, msg); checks++ }
const eq = (a, b, msg) => { assert.equal(a, b, msg); checks++ }
const near = (a, b, tol, msg) => { assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`); checks++ }
const G = WEB_TUNING.gate

// ---------------------------------------------------------------------------------------------
// Gate unit behaviour (protocol 2)
// ---------------------------------------------------------------------------------------------
{
  const g = new StrikeGate(), low = { risk: .1, flow: false, protocol: 2, armed: true }, high = { risk: .3, flow: false, protocol: 2, armed: true }
  eq(g.press(0, low).kind, 'strike', 'a first press strikes at once')
  g.sent(1, 0, low)
  ok(g.locked(10), 'a strike in flight locks Keep/Sell/Trade')
  eq(g.press(50, low).kind, 'absorb', 'a press in the windup (before the apex) joins the swing in flight')
  g.impact(1, 215)
  const r1 = g.press(300, low)
  eq(r1.kind, 'buffer', 'low risk: a press within 150 ms of contact is buffered, not refused')
  eq(g.press(320, low).kind, 'absorb', 'at most one press is buffered; another joins it')
  eq(g.nextDue(low), 215 + 150 + G.frameSlackMs, 'the buffered press is due at contact + 150 ms + one frame of slack')
  eq(G.frameSlackMs, 50)
  eq(g.due(414, low), null); eq(g.due(415, low), 'fire', 'and fires exactly then')
  g.sent(2, 415, low)
  near(g.predictContact(415, low), 855, .001, 'the scheduled contact respects the 640 ms cycle (the slack costs nothing)')
  g.swing(2, 423, 432, false)
  eq(g.press(700, low).kind, 'absorb', 'before the reported apex the press joins the swing')
  eq(g.press(800, low).kind, 'buffer', 'from the apex on, one press is buffered (critique #32)')
  g.impact(2, 855)
  eq(g.due(1054, low), null); eq(g.due(1055, low), 'fire')
  g.sent(3, 1055, low); g.impact(3, 1495)
  // High risk: refuse until contact + 250 ms, with feedback; then a press is sent at once.
  eq(g.press(1600, high).kind, 'refuse', 'high risk: a press 105 ms after contact is refused')
  eq(g.press(1700, high).kind, 'refuse', 'high risk: and 205 ms after contact')
  eq(g.press(1746, high).kind, 'strike', 'high risk: from contact + 250 ms a press is sent at once')
  g.sent(4, 1746, high)
  eq(g.press(1800, high).kind, 'refuse', 'high risk: no buffering while the swing is in flight')
  g.impact(4, 2135)
  // A press buffered at low risk is dropped (refused) when the risk has crossed the gate by its due time.
  eq(g.press(2200, low).kind, 'buffer')
  eq(g.due(2201, high), 'drop', 'a low-risk buffer never fires into a risk that crossed 20% (refused at once)')
  eq(g.queued, false)
}
// Flow: lenient buffering from the swing start, and the Flow cycle.
{
  const g = new StrikeGate(), flow = { risk: 0, flow: true, protocol: 2, armed: true }
  eq(g.press(0, flow).kind, 'strike'); g.sent(1, 0, flow)
  near(g.predictContact(10, flow), 125, .001, 'Flow contact at 125 ms')
  eq(g.press(30, flow).kind, 'buffer', 'Flow: a press during the windup is buffered (mashing never scolds)')
  g.impact(1, 125)
  eq(g.due(274, flow), null); eq(g.due(325, flow), 'fire'); g.sent(2, 325, flow)
  near(g.predictContact(330, flow), 125 + 595, .001, 'the Flow cycle (595 ms) spaces Flow contacts')
}
// Unity answers a Strike inside the SendMessage. The page tells the gate first (unity.ts strike(onImpact, onSend));
// if an answer still arrives first it is kept: a refusal makes sent() return false, a swing sets the contact.
{
  const g = new StrikeGate(), low = { risk: .05, flow: false, protocol: 2, armed: true }
  g.press(0, low); ok(g.sent(1, 0, low)); g.impact(1, 215)
  eq(g.settled(2, 420, true, true), false, 'a refusal for a seq the gate has not seen yet is noted, not lost')
  eq(g.sent(2, 420, low), false, 'sent() reports that Unity already refused it')
  ok(!g.inFlight, 'so nothing is left in flight (no 8 s phantom strike)')
  g.settled(1, 475, false, false)
  ok(!g.locked(476), 'and the HUD unlocks when the landed strike settles')
  eq(g.press(500, low).kind, 'strike')
  g.swing(3, 500, 455, false)
  ok(g.sent(3, 500, low)); near(g.predictContact(510, low), 955, .001, 'an early swing still sets the contact time')
  // Per-seq settles: a refused newer strike cannot unlock an older one that is still rebounding.
  const h = new StrikeGate(); h.press(0, low); h.sent(1, 0, low); h.impact(1, 215); h.sent(2, 420, low)
  eq(h.settled(2, 421, true, true), true, 'the refused strike in flight is dropped (the page answers it)')
  ok(h.locked(430), 'strike 1 has not settled yet: Keep/Sell stay locked')
  h.settled(1, 475, false, false); ok(!h.locked(476), 'until its own settled')
  // A Shatter drops a press held for the next blow (the page answers it), but never a heating press.
  const k = new StrikeGate(); k.press(0, low); k.sent(1, 0, low); eq(k.press(150, low).kind, 'buffer'); k.impact(1, 215)
  eq(k.shatter(215), true, 'shatter() reports the dropped held press'); ok(!k.queued)
}
// settled x = -1 clears the pending strike; the gate recovers.
{
  const g = new StrikeGate(), low = { risk: .05, flow: false, protocol: 2, armed: true }
  g.press(0, low); g.sent(1, 0, low)
  eq(g.press(150, low).kind, 'buffer')
  eq(g.settled(1, 160, true, true), true, 'a cancelled strike is reported so the page can answer the press')
  ok(!g.inFlight && !g.queued, 'settled x = -1 clears the strike and its buffered press')
  ok(!g.locked(170), 'and unlocks the HUD at once')
  eq(g.press(180, low).kind, 'strike', 'the next press strikes again')
}
// Shatter hold (critique #38): presses within 600 ms are refused, a later press ends the hold and goes on.
{
  const g = new StrikeGate(), noKnife = { risk: 0, flow: false, protocol: 2, armed: false }
  const low = { risk: .1, flow: false, protocol: 2, armed: true }
  g.press(0, low); g.sent(1, 0, low); g.impact(1, 215); g.shatter(215); g.settled(1, 475, false, true)
  eq(g.press(500, noKnife).kind, 'refuse', 'a press 285 ms after a Shatter is ignored (refused)')
  eq(g.press(814, noKnife).kind, 'refuse', 'and at 599 ms')
  const d = g.press(816, noKnife)
  eq(d.kind, 'prepare', 'after 600 ms a press continues: it starts the next blank'); eq(d.endHold, true, 'and ends the hold')
  ok(!g.holdingShatter)
  eq(G.shatterIgnoreMs, 600); eq(G.shatterChooseMs, 1200); eq(G.shatterHoldMs, 1500)
}
// Heating: one press in the last 600 ms fires on 'seated'; earlier presses are refused with feedback.
{
  const g = new StrikeGate(), p = { risk: 0, flow: false, protocol: 2, armed: false }
  g.heatingStarted(0, 2000)
  eq(g.press(500, p).kind, 'refuse', 'early in the heat a press is refused')
  const b = g.press(1500, p); eq(b.kind, 'buffer'); eq(b.until, 'seated', 'a press in the last 600 ms is held for seated')
  eq(g.press(1600, p).kind, 'absorb', 'one press only')
  ok(!g.locked(1700), 'a held heating press does not lock Keep/Sell')
  g.heated(2000)
  eq(g.due(2100, p), null, 'not before the blank is seated')
  g.seated(2230)
  eq(g.due(2231, { ...p, armed: true }), 'fire', "fires on 'seated'")
  ok(!g.heating, 'the hand-off is complete')
  // No 'seated' (an older build): fire after the seat timeout; protocol 0 after the legacy landing time.
  const g2 = new StrikeGate(); g2.heatingStarted(0, 2000); g2.press(1900, p); g2.heated(2000)
  eq(g2.nextDue({ protocol: 2 }), 2000 + G.seatTimeoutMs); eq(g2.due(2599, p), null); eq(g2.due(2600, p), 'fire')
  const g3 = new StrikeGate(), p0 = { ...p, protocol: 0 }; g3.heatingStarted(0, 2000); g3.press(1900, p0); g3.heated(2000)
  eq(g3.nextDue(p0), 2000 + G.legacySeatMs)
  // Without a held press the heating state ends at the seat deadline.
  const g4 = new StrikeGate(); g4.heatingStarted(0, 2000); g4.heated(2000); g4.settleHeating(2700, p); ok(!g4.heating)
}
// Pre-contract builds (protocol 0): Unity ignores a Strike until 'settled', so the buffer waits for it.
{
  const g = new StrikeGate(), p = { risk: .05, flow: false, protocol: 0, armed: true }
  eq(g.press(0, p).kind, 'strike'); g.sent(1, 0, p)
  eq(g.press(300, p).kind, 'buffer', 'legacy: a press after the apex is buffered')
  g.impact(0, 340)
  eq(g.due(500, p), null, 'legacy: not before settled')
  g.settled(0, 760, false, true)
  eq(g.due(761, p), 'fire', "legacy: fires on 'settled'")
  // Watchdog: a lost 'settled' unlocks after 1.2 s.
  g.sent(2, 761, p); g.impact(0, 1101)
  ok(g.locked(1500)); ok(!g.locked(1101 + G.settleWatchdogMs), 'the HUD never stays locked 1.2 s after an impact')
  ok(g.watchdog(2400))
}

// No armed knife (after a Shatter, a Sell or a Keep): a press starts the next blank, but never while the
// last swing is still settling (New and Start never move knives under a rebounding hammer). Both protocols.
for (const protocol of [2, 0]) {
  const g = new StrikeGate(), armed = { risk: .05, flow: false, protocol, armed: true }, empty = { ...armed, risk: 0, armed: false }
  g.press(0, armed); g.sent(1, 0, armed); g.impact(protocol ? 1 : 0, 215)
  const d = g.press(260, empty)
  eq(d.kind, 'buffer', `protocol ${protocol}: an unarmed press while the swing settles is held`); eq(d.until, 'settled')
  ok(g.locked(270), 'and keeps Keep/Sell locked')
  eq(g.press(280, empty).kind, 'absorb', 'at most one held press')
  eq(g.due(300, empty), null, 'not before settled'); eq(g.nextDue({ protocol }), 215 + G.settleWatchdogMs, 'the settle watchdog bounds the wait')
  g.settled(protocol ? 1 : 0, 475, false, true)
  eq(g.due(476, empty), 'fire', 'it fires (the page prepares a blank) once the swing settled')
  ok(!g.locked(477))
  eq(g.press(600, empty).kind, 'prepare', 'later unarmed presses prepare at once')
  // A lost 'settled' cannot hold the press forever.
  const g2 = new StrikeGate(); g2.press(0, armed); g2.sent(1, 0, armed); g2.impact(protocol ? 1 : 0, 215); g2.press(300, empty)
  eq(g2.due(215 + G.settleWatchdogMs - 1, empty), null); eq(g2.due(215 + G.settleWatchdogMs, empty), 'fire')
}
// 'seated' before the engine's move to the anvil (a late React timer): the held press waits for the move.
{
  const g = new StrikeGate(), p = { risk: 0, flow: false, protocol: 2, armed: false }
  g.heatingStarted(0, 2000); eq(g.press(1700, p).until, 'seated')
  g.seated(2010)
  eq(g.due(2011, p), null, "an early 'seated' alone never fires into an empty anvil")
  ok(g.heating, 'the hand-off is still open')
  g.heated(2040)
  eq(g.due(2041, { ...p, armed: true }), 'fire', 'the move lands: the remembered seat fires the press at once')
  const g2 = new StrikeGate(); g2.heatingStarted(0, 2000); g2.seated(2010); g2.heated(2040); g2.settleHeating(2041, p); ok(!g2.heating, 'without a held press the hand-off ends at the move')
}
// Heating that never reaches the anvil (the blank was dragged out of the coals): abandoned, the held press answered.
{
  const g = new StrikeGate(), p = { risk: 0, flow: false, protocol: 2, armed: false }
  g.heatingStarted(0, 2000); g.press(1800, p)
  eq(g.heatDeadline(), 2000 + G.heatWatchdogMs)
  eq(g.heatWatchdog(3000), false, 'not before the deadline'); ok(g.heating)
  eq(g.heatWatchdog(3500), true, 'the watchdog drops the held press (the page refuses it with feedback)')
  ok(!g.heating && !g.queued, 'and ends the heating state')
  eq(g.press(3600, p).kind, 'prepare', 'the next press starts forging again')
  const g2 = new StrikeGate(); g2.heatingStarted(0, 2000); g2.press(1900, p); eq(g2.cancelHeating(), true, 'cancelHeating reports a dropped held press')
}

// ---------------------------------------------------------------------------------------------
// Simulated Unity + page: fuzz and rhythm runs on the real engine
// ---------------------------------------------------------------------------------------------
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
/**
 * Unity model. Protocol 2 (ForgeStrikeTuning, ForgeStrikeMachine.Press): a Strike that reads at least 150 ms
 * after the last contact on Unity's strike clock is scheduled at max(press + windup, lastContact + cycle);
 * earlier, while a swing is current, it is refused with settled(seq, -1). Unity's strike clock advances once per
 * frame (strikeNow += unscaled dt in Update), so a Strike arriving between frames reads the last frame's start.
 * Unity answers a Strike inside the SendMessage: 'swing' or the refusal are delivered synchronously (reply).
 * Contacts and settles land on frame boundaries. Protocol 0: a Strike while swinging is ignored; contact at
 * 340 ms, settled at 760 ms. A 'seated' arrives 230 ms after a move to the anvil.
 */
class UnitySim {
  constructor(protocol, frameMs, push, reply) { this.protocol = protocol; this.frameMs = frameMs; this.push = push; this.reply = reply; this.swing = null; this.lastContact = -Infinity; this.contacts = []; this.refused = 0 }
  /** The next frame boundary at or after t. */
  frame(t) { return Math.ceil(t / this.frameMs - 1e-9) * this.frameMs }
  /** Unity's strike clock at page time t: the start of the last frame. */
  clock(t) { return Math.floor(t / this.frameMs + 1e-9) * this.frameMs }
  strike(seq, now, flow) {
    const u = this.clock(now)
    if (this.protocol < 2) {
      if (this.swing && u < this.swing.settledAt) return
      const contactAt = this.frame(now + (flow ? 227 : 340)), settledAt = this.frame(now + (flow ? 507 : 760))
      this.swing = { seq: 0, contactAt, settledAt, events: [this.push(contactAt, 'impact', 0, 0), this.push(settledAt, 'settled', 0, 0)] }
      return
    }
    if (this.swing && u < this.swing.contactAt + 150) { this.refused++; this.reply({ t: now, type: 'settled', id: seq, x: -1 }); return }
    const idle = u - this.lastContact > 1200
    const contactAt = this.frame(Math.max(u + (flow ? 125 : idle ? 215 : 190), this.lastContact + (flow ? 595 : 640)))
    const settledAt = this.frame(contactAt + (flow ? 180 : 260))
    this.lastContact = contactAt
    this.swing = { seq, contactAt, settledAt, events: [this.push(contactAt, 'impact', seq, 0), this.push(settledAt, 'settled', seq, 0)] }
    this.reply({ t: now, type: 'swing', id: seq, x: contactAt - now })
  }
  /** Walking cancels a swing that has not reached contact. */
  walk(now) {
    const s = this.swing; if (!s || now >= s.contactAt) return
    for (const e of s.events) e.dead = true
    if (this.protocol >= 2) { this.lastContact = this.contacts.at(-1) ?? -Infinity; this.push(this.frame(now + 1), 'settled', s.seq, -1) }
    else this.push(this.frame(now + 1), 'settled', 0, 0)
    this.swing = null
  }
}
/** Binary min-heap of events by (t, samples last, insertion order): the same order a stable sort gives. */
class EventQueue {
  constructor() { this.a = []; this.n = 0 }
  get length() { return this.a.length }
  less(x, y) { return x.t !== y.t ? x.t < y.t : x.sample !== y.sample ? !x.sample : x.k < y.k }
  push(e) { e.k = this.n++; e.sample = e.type === 'sample'; const a = this.a; a.push(e); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (!this.less(a[i], a[p])) break; [a[i], a[p]] = [a[p], a[i]]; i = p } }
  shift() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && this.less(a[l], a[m])) m = l; if (r < a.length && this.less(a[r], a[m])) m = r; if (m === i) break; [a[i], a[m]] = [a[m], a[i]]; i = m } } return top }
}
/**
 * A run of presses (and walks / Trade openings) against the gate, the ledger and the real engine.
 * order 'page': the page's order (ForgePage.fire: the gate learns the seq, then the SendMessage);
 * 'reply-first': Unity's synchronous answer reaches the gate before sent() (the gate must still recover).
 */
function simulate({ protocol = 2, frameMs = 8.33, presses, walks = [], trays = [], seed = 1, level = 0, flowFrom = Infinity, guard = false, pinLevel = false, tuning, order = 'page' }) {
  const queue = new EventQueue(), log = [], impacts = [], refusalsByReason = {}
  const push = (t, type, id = 0, x = 0, extra = {}) => { const e = { t, type, id, x, ...extra }; queue.push(e); return e }
  const unity = new UnitySim(protocol, frameMs, push, e => handle(e)), gate = new StrikeGate(tuning), ledger = new StrikeLedger()
  let s = createRun(seed), clock = 0
  const send = a => { const r = act(s, a); if (r.ok) s = r.state; return r }
  const tick = now => { const ms = Math.round(now - clock); if (ms > 0) { const r = act(s, { type: 'tick', ms: Math.min(ms, 60000) }); if (r.ok) s = r.state; clock = now } }
  const anvil = () => s.knives.find(k => k.place === 'anvil')
  const prepare = now => {
    // A fresh iron blank whenever the crate is empty (the fuzz should keep forging, not run out of stock).
    if (!s.knives.some(n => n.place === 'crate' && !n.heated)) { s = structuredClone(s); s.knives.push({ id: s.nextId++, metal: 'iron', family: s.nextId % 8, level: 0, heated: false, pips: 0, flow: 0, guard: false, sharpened: false, place: 'crate' }) }
    const k = s.knives.find(n => n.place === 'crate' && !n.heated); if (!k) return false
    send({ type: 'move', id: k.id, to: 'furnace' }); gate.heatingStarted(now, RULES.heatSeconds * 1000)
    push(now + RULES.heatSeconds * 1000, 'heat-done', k.id); return true
  }
  // Start with a heated blank on the anvil at `level`.
  { const k = s.knives[0]; send({ type: 'move', id: k.id, to: 'furnace' }); send({ type: 'heat', id: k.id }); send({ type: 'move', id: k.id, to: 'anvil' }); const n = s.knives.find(x => x.id === k.id); n.level = level; n.guard = guard; if (flowFrom === 0) n.pips = flowNeed(s) }
  const input = now => {
    const k = anvil(); if (!k?.heated) return { risk: 0, flow: false, protocol, armed: false }
    const flowNow = k.flow > 0 || k.pips >= flowNeed(s)
    const ms = gate.predictContact(now, { flow: flowNow, protocol }) - now
    const { odds: o, expiring } = oddsAtContact(k, s, ms)
    return { risk: o.shatter, flow: flowNow && !expiring, protocol, armed: true }
  }
  let pendingPress = null
  const fire = (now, press) => {
    tick(now); const k = anvil(); if (!k?.heated) { press.result = 'refuse:busy'; return }
    const i = input(now)
    const seq = ledger.begin(() => {
      tick(curT); const r = send({ type: 'hit', id: k.id }); impacts.push({ t: curT, ok: r.ok, outcome: r.event.outcome, text: r.event.text, press: press.i })
      if (r.ok && r.event.outcome === 'shatter' && gate.shatter(curT) && held) { held.result = 'cancelled:shatter'; held = null }
      if (pinLevel && r.ok) { const n = s.knives.find(x => x.id === k.id); if (n) n.level = level }
    })
    press.sent = now; press.seq = seq; pendingPress = press
    const strikeUnity = () => unity.strike(protocol >= 2 ? seq : 0, now, i.flow)
    if (order === 'reply-first') { strikeUnity(); if (!gate.sent(seq, now, i)) press.result = 'refuse:cancelled' }
    else { if (!gate.sent(seq, now, i)) press.result = 'refuse:cancelled'; else strikeUnity() }
  }
  let curT = 0, held = null
  const checkDue = now => {
    const r = gate.due(now, input(now)); if (!r) return
    if (r === 'fire') { const p = held; held = null; if (anvil()?.heated) fire(now, p); else { p.result = 'prepare'; prepare(now) } }
    else { held.result = 'refuse:risk-rose'; held = null }
  }
  // Unity -> page messages (from the queue, or synchronously from inside Strike).
  const handle = e => {
    if (e.type === 'swing') { gate.swing(e.id, curT, e.x, input(curT).flow) }
    else if (e.type === 'impact') { unity.contacts.push(curT); gate.impact(e.id, curT); lastImpact = curT; ledger.impact(e.id); checkDue(curT) }
    else if (e.type === 'settled') {
      const latest = ledger.settle(e.id), dropped = gate.settled(e.id, curT, e.x < 0, latest)
      if (dropped && pendingPress && pendingPress.seq === e.id && !impacts.some(m => m.press === pendingPress.i)) pendingPress.result = 'refuse:cancelled'
      if (held && !gate.queued) { held.result = 'cancelled:walk'; held = null }
      checkDue(curT)
    } else if (e.type === 'seated') { gate.seated(curT); checkDue(curT) }
  }
  for (const [i, t] of presses.entries()) push(t, 'press', i)
  for (const t of walks) push(t, 'walk')
  for (const t of trays) push(t, 'tray')
  const records = presses.map((t, i) => ({ i, t, result: null }))
  let maxLockAfterImpact = 0, lastImpact = -Infinity
  const end = Math.max(...presses) + 4000
  for (let t = 0; t <= end; t += 5) push(t, 'sample')
  while (queue.length) {
    const e = queue.shift(); if (e.dead) continue
    curT = e.t
    if (e.type === 'sample') {
      if (gate.watchdog(curT)) { /* released */ }
      if (gate.heatWatchdog(curT) && held) { held.result = 'refuse:heat-lost'; held = null }
      checkDue(curT)
      const dl = gate.seatDeadline({ protocol }); if (dl !== null && curT >= dl) gate.settleHeating(curT, { protocol })
      if (gate.locked(curT) && !gate.inFlight && !gate.queued && lastImpact > -Infinity) maxLockAfterImpact = Math.max(maxLockAfterImpact, curT - lastImpact)
      continue
    }
    if (e.type === 'press') {
      tick(curT); const rec = records[e.id], i = input(curT)
      const d = gate.press(curT, i)
      if (d.kind === 'strike') { rec.result = 'strike'; fire(curT, rec) }
      else if (d.kind === 'prepare') { rec.result = prepare(curT) ? 'prepare' : 'refuse:no-blank' }
      else if (d.kind === 'buffer') { rec.result = 'buffer'; held = rec }
      else if (d.kind === 'absorb') { rec.result = 'absorb:' + d.reason }
      else { rec.result = 'refuse:' + d.reason; refusalsByReason[d.reason] = (refusalsByReason[d.reason] || 0) + 1 }
      checkDue(curT)
    } else if (e.type === 'walk') { unity.walk(curT) }
    else if (e.type === 'tray') { if (gate.cancelBuffer() && held) { held.result = 'cancelled:tray'; held = null } }
    else if (e.type === 'heat-done') {
      tick(curT); send({ type: 'heat', id: e.id }); send({ type: 'move', id: e.id, to: 'anvil' }); gate.heated(curT)
      if (protocol >= 2) push(curT + 230, 'seated', e.id)
    } else handle(e)
  }
  return { records, impacts, refusalsByReason, maxLockAfterImpact, contacts: unity.contacts, unityRefused: unity.refused, state: s, log }
}
const ANSWERED = /^(strike|prepare|buffer|absorb:queued|absorb:early|refuse:\w[\w-]*|cancelled:\w+)$/

// 200-press fuzz: gaps 30-900 ms, WASD walks and Trade openings mixed in, both protocols.
const fuzzTally = {}
for (const protocol of [2, 0]) for (const seed of [1, 2, 3, 4, 5]) {
  const r = rng(seed * 7919), presses = []; let t = 300
  for (let i = 0; i < 200; i++) { t += 30 + r() * 870; presses.push(Math.round(t)) }
  const walks = presses.filter((_, i) => i % 23 === 11).map(x => x + 40), trays = presses.filter((_, i) => i % 31 === 17).map(x => x + 20)
  const out = simulate({ protocol, presses, walks, trays, seed, level: 2 + seed })
  for (const rec of out.records) { ok(rec.result && ANSWERED.test(rec.result), `protocol ${protocol} seed ${seed}: press ${rec.i} at ${rec.t} was answered (${rec.result})`); const key = `p${protocol} ${rec.result}`; fuzzTally[key] = (fuzzTally[key] || 0) + 1 }
  ok(out.impacts.every(m => m.ok), `protocol ${protocol} seed ${seed}: the engine accepted every hit (${out.impacts.find(m => !m.ok)?.text})`)
  const gaps = out.contacts.slice(1).map((c, i) => c - out.contacts[i])
  ok(gaps.every(g => g >= 400 - 1e-6), `protocol ${protocol} seed ${seed}: contacts are at least 400 ms apart`)
  ok(out.maxLockAfterImpact <= G.settleWatchdogMs + 5, `protocol ${protocol} seed ${seed}: the HUD never stays locked more than 1.2 s after an impact (${out.maxLockAfterImpact})`)
  const fired = new Set(out.impacts.map(m => m.press)); ok(fired.size === out.impacts.length, 'one impact per press at most (no auto-repeat)')
  ok(out.impacts.every(m => ['strike', 'buffer'].includes(out.records[m.press].result)), 'only strikes and buffered presses produce impacts')
  eq(out.unityRefused, 0, `protocol ${protocol} seed ${seed}: Unity never refuses a Strike the gate sent (its clock reads per frame)`)
}
// The frame race: Unity reads its strike clock once per frame, so a Strike sent right at contact + 150 ms reads
// under 150 there and is refused. With no slack that happens on most buffered blows at 120 Hz; with the default
// slack never, from 120 Hz down to 30 Hz, and the cadence is unchanged.
{
  const presses = Array.from({ length: 30 }, (_, i) => 300 + i * 400)
  const noSlack = simulate({ protocol: 2, presses, level: 2, pinLevel: true, tuning: { ...WEB_TUNING.gate, frameSlackMs: 0 } })
  ok(noSlack.unityRefused >= 5, `without slack Unity refuses buffered strikes at 120 Hz (${noSlack.unityRefused} of ${noSlack.impacts.length + noSlack.unityRefused})`)
  for (const frameMs of [8.33, 16.67, 33.3]) {
    const out = simulate({ protocol: 2, presses, level: 2, pinLevel: true, frameMs })
    eq(out.unityRefused, 0, `with ${G.frameSlackMs} ms slack Unity accepts every Strike at ${Math.round(1000 / frameMs)} Hz`)
    const gaps = out.contacts.slice(1).map((c, i) => c - out.contacts[i])
    const onCycle = g => [640, 595].some(c => g >= c - 1e-6 && g <= c + frameMs + 1e-6)
    ok(gaps.every(onCycle), `and the 640 ms cycle (595 once Flow starts) holds at ${Math.round(1000 / frameMs)} Hz: ${[...new Set(gaps.map(Math.round))]}`)
  }
  // If Unity's answer reached the gate before sent() (the order the page used to have), the press is still
  // answered (refused with feedback), nothing stays in flight, and the HUD never locks for the 8 s watchdog.
  for (const seed of [1, 2, 3]) {
    const r = rng(seed * 104729), ps = []; let t = 300
    for (let i = 0; i < 200; i++) { t += 30 + r() * 870; ps.push(Math.round(t)) }
    const out = simulate({ protocol: 2, presses: ps, seed, level: 2 + seed, order: 'reply-first', tuning: { ...WEB_TUNING.gate, frameSlackMs: 0 } })
    ok(out.records.every(rec => rec.result && ANSWERED.test(rec.result)), `reply-first seed ${seed}: every press answered`)
    ok(out.maxLockAfterImpact <= G.settleWatchdogMs + 5, `reply-first seed ${seed}: no phantom strike holds the HUD (${out.maxLockAfterImpact} ms)`)
    eq(out.records.filter(x => x.result === 'refuse:cancelled').length >= out.unityRefused, true, `reply-first seed ${seed}: each Unity refusal reached the player as a refusal`)
  }
}
// Rhythm run, 2-3 presses/s at low risk (the level is held below the 20% gate): refusals at most 10% of presses (critique #32).
for (const protocol of [2, 0]) for (const rate of [2, 2.5, 3]) {
  const presses = Array.from({ length: 40 }, (_, i) => 300 + Math.round(i * 1000 / rate))
  const out = simulate({ protocol, presses, level: 3, pinLevel: true })
  const refused = out.records.filter(x => x.result.startsWith('refuse')).length
  ok(refused / presses.length <= .1, `protocol ${protocol}, ${rate}/s: refusals ${refused}/${presses.length}`)
  ok(out.impacts.length >= 0.55 * presses.length * (protocol >= 2 ? Math.min(1, 1000 / 640 / rate) : Math.min(1, 1000 / 760 / rate)), `protocol ${protocol}, ${rate}/s: ${out.impacts.length} impacts keep the rhythm`)
}
// Protocol 2 rhythm cadence: a re-press 150-450 ms after an impact gives the next contact at the 640 ms cycle.
{
  const out = simulate({ protocol: 2, presses: [300, 700, 1340, 1980, 2620], level: 0 })
  const gaps = out.contacts.slice(1).map((c, i) => Math.round(c - out.contacts[i]))
  ok(gaps.every(g => g >= 640 && g <= 660), `normal cycle gaps 640-660 ms: ${gaps}`)
}
// Flow mashing: about one strike per 595 ms, so 7 protected strikes in a 4 s Flow window.
{
  const presses = Array.from({ length: 40 }, (_, i) => 300 + i * 110)
  const out = simulate({ protocol: 2, presses, level: 6, flowFrom: 0 })
  const inWindow = out.impacts.filter(m => m.t <= out.impacts[0].t + 4000)
  ok(inWindow.length >= 7 && inWindow.length <= 8, `Flow window holds 7 strikes (${inWindow.length})`)
  ok(inWindow.every(m => m.outcome !== 'shatter'), 'Flow strikes never shatter')
  const gaps = out.contacts.slice(1, 7).map((c, i) => Math.round(c - out.contacts[i]))
  ok(gaps.every(g => g >= 585 && g <= 612), `Flow cycle 595 +/- 10 ms (frame-quantised): ${gaps}`)
  ok(out.records.filter(x => x.t < out.impacts[0].t + 4000 - 2 * 595 && x.result.startsWith('refuse')).length === 0, 'mashing inside the Flow window is never refused')
  ok(out.records.some(x => x.result === 'refuse:risk-rose'), 'a press held in Flow whose contact would land after Flow ends is refused (risk at the predicted contact)')
  ok(out.records.filter(x => x.t > out.impacts[0].t + 3500).some(x => x.result === 'refuse:risk'), 'after Flow ends the risk gate returns')
}
// High risk: the player sees the result first; presses too soon are refused (with feedback), later ones strike.
{
  const presses = [300, 700, 900, 1200, 1500, 1800, 2100, 2400]
  const out = simulate({ protocol: 2, presses, level: 9 })
  ok(out.records.some(x => x.result === 'refuse:risk'), 'high risk refuses early presses')
  for (const m of out.impacts.slice(1)) { const p = out.records[m.press]; const prev = out.contacts.filter(c => c < p.sent).at(-1); ok(p.sent - prev >= G.riskAfterContactMs - 1e-6, 'at high risk no strike is sent before contact + 250 ms') }
}

// ---------------------------------------------------------------------------------------------
// Odds presentation: survival by the Markov chain over odds(), Flow at the predicted contact
// ---------------------------------------------------------------------------------------------
{
  const base = () => { let s = createRun(11); for (const a of [{ type: 'move', id: 1, to: 'furnace' }, { type: 'heat', id: 1 }, { type: 'move', id: 1, to: 'anvil' }]) s = act(s, a).state; return s }
  const s = base(), k = s.knives.find(n => n.id === 1)
  near(survival({ ...k, level: 5 }, s, 3), .464, .0005, 'level 5, three more: .464 (critique #33)')
  near(survival({ ...k, level: 8 }, s, 3), .286, .0005, 'level 8, three more: .286')
  // Independent chain written from odds() alone.
  const chain = (level, n) => { if (!n) return 1; const p = odds({ ...k, level, pips: 0, flow: 0, guard: false }, s); return p.perfect * chain(level + 2, n - 1) + p.good * chain(level + 1, n - 1) + p.dull * chain(level, n - 1) + p.chip * chain(Math.max(0, level - 1), n - 1) }
  for (const level of [0, 1, 3, 7, 12, 20]) near(survival({ ...k, level }, s, 3), chain(level, 3), 1e-12, `survival equals the chain over odds() at level ${level}`)
  near(survival({ ...k, level: 8, guard: true }, s, 1), 1, 1e-12, 'Guard: the next strike cannot shatter')
  ok(survival({ ...k, level: 8, guard: true }, s, 3) > survival({ ...k, level: 8 }, s, 3), 'Guard raises the 3-strike survival')
  near(survival({ ...k, level: 12, flow: 4 }, s, 3), 1, 1e-12, 'three strikes inside a fresh Flow window are safe')
  ok(survival({ ...k, level: 12, flow: .7 }, s, 3) < 1, 'Flow that runs out mid-horizon exposes the later strikes')
  near(survival({ ...k, level: 12, pips: flowNeed(s) }, s, 3), 1, 1e-12, 'a full bar starts Flow on the next strike')
  // Risk shown at the predicted contact: Flow that ends before contact no longer protects the hit.
  const exp = oddsAtContact({ ...k, level: 10, flow: .1 }, s, 190)
  ok(exp.expiring && exp.odds.shatter > 0, 'expiring Flow shows the non-Flow risk')
  eq(oddsAtContact({ ...k, level: 10, flow: 1 }, s, 190).odds.shatter, 0)
  // Odds board knife: the anvil knife, else the one Start forging picks (rack Paring +2 vs crate Dagger).
  let d = createRun(5); const rackK = d.knives[0], crateK = d.knives[1]
  d = { ...d, knives: d.knives.map(n => n.id === rackK.id ? { ...n, place: 'rack', level: 2, heated: true } : n) }
  eq(riskKnife(d).id, crateK.id, 'with a rack +2 and a crate blank, the board shows the crate blank Start forging will forge')
  eq(prepareTarget(d).id, crateK.id)
  const withAnvil = { ...d, knives: d.knives.map(n => n.id === rackK.id ? { ...n, place: 'anvil' } : n) }
  eq(riskKnife(withAnvil).id, rackK.id, 'the anvil knife wins')
}

// Honest roll needle (critique #34): the roll read from the pre-hit state predicts the engine's outcome for
// 10,000 seeded hits across levels, Guard, Flow, full bars, charms and level 0.
{
  let n = 0, raws = {}, guardedSeen = 0
  for (let seed = 1; n < 10000; seed++) {
    let s = createRun(seed * 2654435761 >>> 0)
    for (const a of [{ type: 'move', id: 1, to: 'furnace' }, { type: 'heat', id: 1 }, { type: 'move', id: 1, to: 'anvil' }]) s = act(s, a).state
    const r = rng(seed); if (r() < .3) s = { ...s, charms: ['shelter', 'steady', 'ember', 'patience'].filter(() => r() < .5) }
    for (let i = 0; i < 40 && n < 10000; i++) {
      s = act(s, { type: 'tick', ms: 400 + Math.floor(r() * 900) }).state
      let k = s.knives.find(x => x.place === 'anvil'); if (!k) break
      if (r() < .15 && !k.guard) { s = structuredClone(s); s.knives.find(x => x.id === k.id).guard = true; k = s.knives.find(x => x.id === k.id) }
      const roll = nextRoll(k, s), t = act(s, { type: 'hit', id: k.id })
      assert.ok(t.ok, t.event.text)
      eq(roll.outcome, t.event.outcome, `seed ${seed} hit ${i}: the roll predicts the engine outcome`)
      ok(roll.u >= 0 && roll.u < 1 && Math.abs(Object.values(roll.chances).reduce((a, b) => a + b, 0) - 1) < 1e-9)
      raws[roll.raw] = (raws[roll.raw] || 0) + 1; if (roll.guarded) guardedSeen++
      s = t.state; n++
    }
  }
  ok(Object.keys(raws).length === 5 && guardedSeen > 0, `every outcome and a Guard catch were covered: ${JSON.stringify(raws)}, guarded ${guardedSeen}`)
  const s0 = createRun(77); eq(peekRandom(s0), peekRandom(s0), 'peeking never advances the state'); eq(s0.rng, createRun(77).rng)
  ok(WEB_TUNING.hud.rollSweepMs <= 250 && webTuning({ hud: { rollSweepMs: 900 } }).hud.rollSweepMs === 250, 'the needle sweep is at most 250 ms')
}

// ---------------------------------------------------------------------------------------------
// Outcome labels, haptics, motion, render resolution, placement, coins, temperature, tuning
// ---------------------------------------------------------------------------------------------
{
  const s = createRun(3), before = { ...s.knives[0], level: 14, family: 3, heated: true, place: 'anvil' }
  const sh = outcomeLabel({ kind: 'hit', outcome: 'shatter', before, text: '' }, s)
  eq(sh.kind, 'shatter'); eq(sh.title, 'Shattered'); ok(/^−[\d,]+$/.test(sh.delta), 'Shatter shows the lost value'); eq(sh.holdMs, 1500)
  eq(outcomeLabel({ kind: 'hit', outcome: 'good', before, after: { ...before, level: 15 }, text: '' }, s).delta, '+1')
  eq(outcomeLabel({ kind: 'hit', outcome: 'good', before: { ...before, level: 2 }, after: { ...before, level: 3 }, evolution: true, text: '' }, s).title, 'Evolved')
  eq(outcomeLabel({ kind: 'hit', outcome: 'chip', before: { ...before, guard: true }, after: { ...before, guard: false, level: 13 }, text: '' }, s).sub, 'Guard spent')
  eq(outcomeLabel({ kind: 'move', text: '' }, s), null)
  const table = { dull: [8], good: [16], perfect: [12, 40, 24], chip: [26, 30, 10], shatter: [35, 25, 20, 25, 60], evolution: [10, 50, 10, 50, 30], coins: [8, 35, 8, 35, 8] }
  assert.deepEqual(HAPTICS, table); checks++
  for (const k of Object.keys(table)) { const f = hapticPattern(k, true); ok(f.every((ms, i) => i % 2 || ms <= FLOW_PULSE_MAX_MS), `Flow pulses of ${k} are at most 12 ms`) }
  eq(hitHaptic({ kind: 'hit', outcome: 'good', evolution: true, text: '' }), 'evolution'); eq(hitHaptic({ kind: 'sell', text: '' }), null)
  assert.deepEqual(motionOptions(false, 'full'), { reduced: false, motion: 'full', shake: 1 })
  assert.deepEqual(motionOptions(false, 'reduced'), { reduced: true, motion: 'reduced', shake: .5 })
  assert.deepEqual(motionOptions(true, 'full'), { reduced: true, motion: 'full', shake: 1 })
  assert.deepEqual(motionOptions(false, 'off'), { reduced: true, motion: 'off', shake: 0 }); checks += 4
  eq(renderDpr(0, 'phone-portrait', 3), 2); eq(renderDpr(1, 'phone-portrait', 3), 1.5); eq(renderDpr(2, 'phone-portrait', 3), 1.25); eq(renderDpr(3, 'phone-portrait', 3), 1)
  eq(renderDpr(0, 'desktop', 2), 1.5); eq(renderDpr(0, 'desktop', 1), 1); eq(renderDpr(1, 'phone-landscape', 1), 1, 'never above the device DPR')
  ok(390 * renderDpr(WEB_TUNING.render.phoneStartTier, 'phone-portrait', 3) >= 585 && 844 * renderDpr(1, 'phone-portrait', 3) >= 1266, 'phone backing store at tier 1 is at least 585x1266')
  eq(qualityTier('2'), 2); eq(qualityTier('low'), 2); eq(qualityTier('x'), null)
  // Labels: above the blade, inside the HUD-free band, never within 12% of the blade centre.
  for (const [w, h, bands, anvil] of [[1440, 900, { top: 230, bottom: 210, left: 0, right: 0 }, { x: 50, y: 62 }], [390, 844, { top: 106, bottom: 167, left: 0, right: 0 }, { x: 50, y: 52 }], [844, 390, { top: 48, bottom: 0, left: 203, right: 186 }, { x: 50, y: 55 }], [390, 844, { top: 106, bottom: 167, left: 0, right: 0 }, undefined]]) {
    const p = labelPlacement(anvil, w, h, bands, 46), by = (anvil?.y ?? 62) / 100 * h
    ok(p.clear && Math.abs(p.y - by) >= .12 * h - .5, `label clear of the blade at ${w}x${h}`)
    ok(p.y - 23 >= bands.top - .5 && p.y + 23 <= h - bands.bottom + .5, `label inside the band at ${w}x${h}`)
    ok(p.x >= bands.left && p.x <= w - bands.right, 'label x inside the band')
  }
  // A stale label (outside the band, e.g. sent once from the walking camera) falls back to the work view.
  const stale = labelPlacement({ x: 50, y: 98.5 }, 1440, 900, { top: 236, bottom: 208, left: 0, right: 0 }, 48)
  ok(stale.y - 24 >= 236 && stale.y + 24 <= 692 && Math.abs(stale.y - .62 * 900) >= .12 * 900, `stale label: placed in the band (${stale.y})`)
  // Sale count: one step per coin, exact on the last; the fallback holds until 480 ms and ends at 1.1 s.
  eq(coinStep(100, 900, 0, 9), 200); eq(coinStep(100, 900, 8, 9), 1000); eq(coinStep(100, 901, 8, 9), 1001); eq(coinStep(100, 50, 0, 0), 150)
  eq(coinFallback(100, 900, 300), 100); eq(coinFallback(100, 900, 1100), 1000); ok(coinFallback(100, 900, 800) > 100 && coinFallback(100, 900, 800) < 1000)
  // Temperature mirror (hot-metal-vfx): radiative cooling, faster on the anvil, floored at 650 C.
  ok(coolC(1180, 0) === 1180 && coolC(1180, 1000) < 1180 && coolC(1180, 4000) < coolC(1180, 1000), 'cooling is monotonic')
  eq(coolC(1180, 600000), 650, 'body floor 650 C')
  const hc = new HeatClock(); hc.heated(1, 'iron', 0); eq(hc.tempC(1, 0), 1180); ok(hc.tempC(1, 5000) < 1100); hc.arrived(2, 0); eq(hc.tempC(2, 0), 950); hc.left(1); eq(hc.tempC(1, 10), 20)
  eq(tension(0), 0); eq(tension(.6), 1); ok(tension(.3) > 0 && tension(.3) < tension(.45))
  // Tuning: overrides merge onto defaults; the balance floors cannot be tuned away.
  const t = webTuning({ gate: { riskGate: .3, cycleMs: 100, flowCycleMs: 999, scheduleAfterContactMs: 50, bogus: 1 }, hud: { labelLift: NaN }, render: { phoneDpr: [3, 2, 1.5, 1] }, nope: {} })
  eq(t.gate.riskGate, .3); eq(t.gate.cycleMs, 640); eq(t.gate.flowCycleMs, 605); eq(t.gate.scheduleAfterContactMs, 150); eq(t.hud.labelLift, WEB_TUNING.hud.labelLift); assert.deepEqual(t.render.phoneDpr, [3, 2, 1.5, 1]); checks++
  eq(t.gate.bogus, undefined, 'unknown keys are ignored')
  eq(webTuning(null).gate.riskGate, .2)
  // The shipped overrides file merges cleanly (web section read by the page, audio by audio-spec).
  const shipped = JSON.parse(fs.readFileSync(new URL('../src/minigames/forge/feel-tuning.json', import.meta.url), 'utf8'))
  ok(shipped.web && typeof shipped.web === 'object' && webTuning(shipped.web).gate.cycleMs >= 640, 'feel-tuning.json web section applies')
}
if (process.env.FORGE_FEEL_VERBOSE) console.log(fuzzTally)
console.log(`PASS Forge feel: strike gate (protocol 2 and 0, ${checks} checks: buffering, risk gate, Shatter hold, heating seat, settled -1, 200-press fuzz, rhythm, Flow cadence), Markov survival .464/.286, labels, haptics, render tiers, placement, coin count, temperature, tuning.`)
