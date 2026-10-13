// Contract tests for the web side of the Unity bridge (src/minigames/forge/bridge.ts).
import assert from 'node:assert/strict'
import { PROTOCOL, StrikeLedger, viewClass, forgeView, snapshotPayload, unityEffect, anvilRisk } from '../src/minigames/forge/bridge.ts'
import { act, createRun, odds, price, value, saleValue, knifeName, flowNeed } from '../src/minigames/forge/engine.ts'
import { METALS, CHARMS, ITEMS, RULES } from '../src/minigames/forge/config.ts'
import { profile } from '../src/minigames/forge/knives.ts'

assert.equal(PROTOCOL, 2)

// Strike ledger: an overlapping swing never loses its engine hit or unlocks early.
{
  const l = new StrikeLedger(), hits = []
  const a = l.begin(() => hits.push('a'))
  assert.equal(l.impact(a), true); assert.deepEqual(hits, ['a'])
  const b = l.begin(() => hits.push('b'))
  assert.equal(l.settle(a), false, "swing A's late settled does not settle the latest strike")
  assert.equal(l.has(b), true, "swing A's late settled keeps B's impact callback")
  assert.equal(l.impact(a), false, 'an impact resolves at most once')
  assert.equal(l.impact(b), true); assert.deepEqual(hits, ['a', 'b'])
  assert.equal(l.settle(b), true)
  const c = l.begin(() => hits.push('c'))
  assert.equal(l.settle(c), true, 'a refused or cancelled strike (settled x = -1) clears its own seq')
  assert.equal(l.impact(c), false, 'and its impact never fires afterwards')
  assert.equal(l.inFlight, 0)
  // Pre-contract Unity builds: ids are 0.
  l.begin(() => hits.push('d'))
  assert.equal(l.impact(0), true); assert.equal(hits.at(-1), 'd')
  l.begin(() => hits.push('e')); assert.equal(l.settle(0), true); assert.equal(l.inFlight, 0)
  assert.equal(l.impact(0), false)
}

// View class: the old Screen.width < 700 rule in CSS pixels, plus touch landscape phones.
assert.equal(viewClass(1440, 900, false), 'desktop')
assert.equal(viewClass(390, 844, true), 'phone-portrait')
assert.equal(viewClass(844, 390, true), 'phone-landscape')
assert.equal(viewClass(667, 375, true), 'phone-landscape')
assert.equal(viewClass(600, 900, false), 'phone-portrait', 'a narrow desktop window keeps the phone layout')
assert.equal(viewClass(1024, 768, true), 'desktop', 'tablets are desktop')
assert.equal(viewClass(844, 390, false), 'desktop', 'a short desktop window is desktop')
const v = forgeView(390, 844, 1, true, { top: 120, bottom: 200 })
assert.deepEqual(Object.keys(v), ['view', 'cssW', 'cssH', 'dpr', 'touch', 'top', 'right', 'bottom', 'left', 'goldX', 'goldY', 'panel'])
assert.equal(v.view, 'phone-portrait'); assert.equal(v.top, 120); assert.equal(v.right, 0)

// Sync payload: today's JSON byte for byte, with risk, totalHits, shake and motion appended.
const legacy = (state, selected, reduced) => ({ flowNeed:flowNeed(state),flowSpeed:RULES.flowSpeed,knives: state.knives.map(k => ({ ...k, ...METALS[k.metal], heldValue:value(k,state),saleValue:saleValue(state,k),displayName:knifeName(k),rough: METALS[k.metal].roughness, metal: k.metal, profile: profile(k).map(([x, y]) => ({ x, y })) })), selected: selected || 0, day: state.day, ended: state.ended, reduced, offers: Object.entries(state.stock).filter(([,stock])=>stock>0).map(([key,stock])=>({key,stock,price:price(state,key),label:key.startsWith('metal:')?METALS[key.slice(6)].name:key.startsWith('charm:')?CHARMS[key.slice(6)].name:ITEMS[key].name})) })
let s = createRun(7)
for (const a of [{ type: 'move', id: 1, to: 'furnace' }, { type: 'heat', id: 1 }, { type: 'move', id: 1, to: 'anvil' }]) s = act(s, a).state
for (let i = 0; i < 6; i++) { s = act(s, { type: 'tick', ms: 900 }).state; const r = act(s, { type: 'hit', id: 1 }); if (r.ok && r.state.knives.some(k => k.id === 1)) s = r.state }
for (const reduced of [false, true]) {
  const old = JSON.stringify(legacy(s, 1, reduced)), now = JSON.stringify(snapshotPayload(s, 1, { reduced }))
  assert.equal(now.slice(0, old.length - 1), old.slice(0, -1), 'existing fields are unchanged and in order')
  const p = snapshotPayload(s, 1, { reduced })
  assert.deepEqual(Object.keys(p).slice(-4), ['risk', 'totalHits', 'shake', 'motion'])
  assert.equal(p.totalHits, s.totalHits); assert.equal(p.shake, 1); assert.equal(p.motion, 'full')
}
const anvil = s.knives.find(k => k.place === 'anvil')
assert.ok(anvil && anvil.level > 0)
assert.equal(anvilRisk(s), odds(anvil, s).shatter, 'risk is the engine next-hit shatter chance')
assert.equal(anvilRisk({ ...s, knives: s.knives.map(k => ({ ...k, guard: k.id === anvil.id })) }), 0, 'Guard zeroes the shatter risk')
assert.equal(anvilRisk({ ...s, knives: s.knives.map(k => ({ ...k, flow: k.id === anvil.id ? 2 : 0 })) }), 0, 'Flow zeroes the shatter risk')
assert.equal(anvilRisk(createRun(7)), 0, 'no anvil knife, no risk')
assert.equal(unityEffect({ kind: 'tick', text: '' }), undefined); assert.equal(unityEffect({ kind: 'wait', text: '' }), undefined)
assert.equal(unityEffect({ kind: 'hit', text: 'x' }).kind, 'hit')
console.log('PASS Forge bridge: strike sequence ids (late settled, refused strike, pre-contract ids), view class, Sync payload compatibility, risk.')
