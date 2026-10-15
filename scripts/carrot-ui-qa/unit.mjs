// Plain-node unit checks for the page's pure modules (no browser): wave plans, traits and flags, ability card word limits, the flash
// governor and the snapshot store/run tracker.   node scripts/carrot-ui-qa/unit.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { wavePackets, waveNotes, waveBounds, waveFlags, traitsOf, trackPlan, firstAirWave, parseComposition } from '../../src/minigames/carrot/waves.ts'
import { abilityIds, abilityText, words } from '../../src/minigames/carrot/abilities.ts'
const data = JSON.parse(readFileSync(new URL('../../public/assets/minigames/carrot/game-data.json', import.meta.url), 'utf8'))
const L = id => data.levels.find(l => l.id === id)

// BeginWave's route formula: (wave + packetIndex + floor(i / max(2, floor(count / routes)))) % routes, boss on route 0
// the rebuild (used only when game-data publishes no wavePlan) groups each packet's units by route
const rebuilt = l => ({ ...l, wavePlan: undefined })
const w1 = wavePackets(rebuilt(L(1)), 1)
assert.deepEqual(w1.map(p => [p.kind, p.route, p.n]), [['nibble', 1, 5], ['nibble', 0, 4]], 'level 1 wave 1: nine nibbles split 5/4 across the two routes')
// the published wavePlan (CarrotData.PlanWave, blocks in spawn order) keeps the same units on the same routes as the rebuild
const tally = ps => { const m = {}; for (const p of ps) { const k = `${p.kind}@${p.route}`; m[k] = (m[k] || 0) + p.n } return m }
for (const l of data.levels) if (l.wavePlan) l.waveCompositions.forEach((_, i) => assert.deepEqual(tally(wavePackets(l, i + 1)), tally(wavePackets(rebuilt(l), i + 1)), `level ${l.id} wave ${i + 1}: published plan and rebuild agree per route`))
assert.deepEqual(wavePackets(L(1), 1).map(p => [p.kind, p.route, p.n]), [['nibble', 1, 4], ['nibble', 0, 4], ['nibble', 1, 1]], 'level 1 wave 1 as published: blocks of four alternate routes')
assert.ok(Math.abs(w1[0].at - .65) < 1e-9, 'first spawn 0.65 s after the wave starts')
assert.ok(Math.abs(w1[1].at - (.65 + 4 * .78)) < 1e-9, 'the second block starts four gaps later')
const bossWave = wavePackets(L(8), 10)
assert.deepEqual(bossWave.find(p => p.kind === 'boss'), { kind: 'boss', n: 1, route: 0, at: .65, span: 0 }, 'the guardian always walks route 0 and leads its wave')
// every composition is fully accounted for
for (const l of data.levels) l.waveCompositions.forEach((c, i) => { const total = parseComposition(c).reduce((s, p) => s + p.n, 0); assert.equal(wavePackets(l, i + 1).reduce((s, p) => s + p.n, 0), total, `level ${l.id} wave ${i + 1} keeps every unit`) })
// a published wavePlan wins over the rebuild
const planned = { ...L(5), wavePlan: [[{ kind: 'moth', n: 3, route: 1, at: 2, span: 1.5 }]] }
assert.deepEqual(wavePackets(planned, 1), [{ kind: 'moth', n: 3, route: 1, at: 2, span: 1.5 }])
assert.equal(waveNotes(planned, 1, data.enemies)[0].traits.air, true, 'moths fly')
// traits: the eight originals and the added kinds
assert.equal(traitsOf('shell', data.enemies).armor, true); assert.equal(traitsOf('crystal', data.enemies).shield, true); assert.equal(traitsOf('shaman', data.enemies).heal, true)
assert.equal(traitsOf('bat', data.enemies).air, true); assert.equal(traitsOf('chronoMoth', data.enemies).mini, true); assert.equal(traitsOf('boss', data.enemies, 'Brambleback').name, 'Brambleback')
// progress-bar flags at the work-weighted start of the guardian's wave (boss = 8 units, miniboss = 4)
const b = waveBounds(L(4), data.enemies); assert.equal(b.length, 8); assert.ok(Math.abs(b[7] - 1) < 1e-9)
assert.deepEqual(waveFlags(L(4), data.enemies).map(f => [f.wave, f.kind]), [[6, 'mini'], [8, 'boss']])
assert.equal(firstAirWave(L(5), data.enemies), 1, 'Lantern Causeway opens with moths')
assert.equal(firstAirWave(L(1), data.enemies), 0, 'First Sprout has no flyers')
// the track plan: ready shows wave 1 queued; a breather shows the next wave with its countdown; v2 incoming wins
let t = trackPlan({ phase: 'ready', wave: 0, waves: 5, nextWave: 0 }, L(1), data.enemies)
assert.equal(t.current.length, 0); assert.equal(t.next.length, 3, "wave 1 queued as its three published blocks"); assert.equal(t.nextIn, null)
t = trackPlan({ phase: 'playing', wave: 2, waves: 5, nextWave: 3.5 }, L(1), data.enemies)
assert.equal(t.nextWave, 3); assert.equal(t.nextIn, 3.5); assert.ok(t.current.length > 0 && t.next.length > 0)
t = trackPlan({ phase: 'playing', wave: 3, waves: 8, nextWave: 0, waveElapsed: 1, incoming: [{ kind: 'moth', count: 8, route: 0, at: .65, span: 5, air: true, armor: false, shield: false, heal: false, mini: false }, { kind: 'dash', count: 4, route: 1, at: 2, span: 2, air: false, armor: false, shield: false, heal: false, mini: false, wave: 4 }] }, L(6), data.enemies)
assert.deepEqual([t.current.map(n => n.kind), t.next.map(n => n.kind)], [['moth'], ['dash']], 'v2 incoming splits the current and the next wave')
// v2 incoming names the guardian by its boss id with boss:true (CarrotContract.WriteGroup); the track still shows a guardian note
t = trackPlan({ phase: 'playing', wave: 9, waves: 10, nextWave: 4, waveElapsed: 3, incoming: [{ kind: 'marsh', count: 1, route: 0, at: .65, span: 0, air: false, armor: false, shield: false, heal: false, mini: false, boss: true, wave: 10, eta: 4.65 }] }, L(8), data.enemies, 'Bog King')
assert.equal(t.next[0].kind, 'boss'); assert.equal(t.next[0].traits.boss, true); assert.equal(t.next[0].traits.name, 'Bog King')
assert.equal(wavePackets(L(8), 10).filter(p => p.kind === 'boss').length, 1, 'the published plan keys the guardian as boss')
// first-encounter cards: at most 12 words, every verb two words
for (const id of abilityIds) { const a = abilityText(id); assert.ok(words(a.card) <= 12, `${id} card is ${words(a.card)} words`); assert.equal(words(a.verb), 2, `${id} verb "${a.verb}"`); assert.ok(a.name) }
console.log(`Carrot UI units: wave plans for ${data.levels.length} levels, traits, flags, track plan, ${abilityIds.length} ability cards pass.`)
