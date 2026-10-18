// BOSS MOOD: plain-node checks of the page's despair curve (src/minigames/carrot/bossMoodCurve.ts) against the Unity contract
// (CarrotBossMoodCurve.cs SelfTest): fixture A-X (target and light) and the five Step cases to 1e-4, the profile table against
// game-data.json (boss wave from the published wave plans, wave count, challenge flag), no profile on any other level, and the
// snapshot tracker (death vs leak by the leak record, Eyeball rebirths and false dawn, minibosses after the fall, the gate).
// Standalone on purpose (not part of npm run carrot:test):   node scripts/carrot-ui-qa/boss-mood.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MOOD_PROFILES, MoodTracker, checkMoodTable, moodFear, moodGate, moodInput, moodProfile, moodStep, moodTarget } from '../../src/minigames/carrot/bossMoodCurve.ts'

let checks = 0
const ok = (cond, msg) => { checks++; assert.ok(cond, msg) }
const near = (a, b, msg, eps = 1e-4) => { checks++; assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`) }

// ---- fixture A-X: identical to CarrotBossMoodCurve.SelfTest (C(level, phase, wave, boss, route, hearts, next, relief, dawn, held, rebirths, minis, deathWave)) ----
const C = (level, phase, wave, boss, o = {}) => moodInput(level, { phase, wave, boss, route: o.route ?? 0, hearts: o.hearts ?? 10, nextWave: o.next ?? 0, reliefAge: o.relief ?? 1e9, dawnAge: o.dawn ?? 1e9, held: o.held ?? 0, rebirths: o.rebirths ?? 0, minis: o.minis ?? 0, deathWave: o.deathWave ?? 0 })
const fixture = [
 ['A', C(4, 'ready', 0, 0), .0800, .0800], ['B', C(4, 'playing', 4, 0), .2400, .2400], ['C', C(4, 'playing', 7, 0, { next: 5 }), .4500, .4500], ['D', C(4, 'playing', 7, 0), .4000, .4000],
 ['E', C(4, 'playing', 8, 1, { route: 0 }), .5500, .5500], ['F', C(4, 'playing', 8, 1, { route: .5 }), .7000, .7000], ['G', C(4, 'playing', 8, 1, { route: .9, hearts: 4 }), .8500, .8500], ['H', C(4, 'playing', 8, 1, { route: .5, relief: 0 }), .7000, .7000],
 ['I', C(20, 'playing', 14, 1, { route: .3, hearts: 7, relief: 3 }), .5969, .5969], ['J', C(4, 'playing', 8, 3), 0, 0], ['K', C(25, 'playing', 4, 1, { route: .8 }), .8971, .8971], ['L', C(25, 'playing', 4, 3), .1500, .1500],
 ['M', C(29, 'ready', 0, 0), .2000, .2000], ['N', C(28, 'playing', 2, 0), .2275, .2275], ['O', C(8, 'playing', 9, 0, { next: 3 }), .4029, .4029], ['P', C(27, 'playing', 7, 1, { route: 1, hearts: 0 }), .9400, .9400],
 ['Q', C(27, 'playing', 7, 2, { route: .6, dawn: 0 }), .5851, .7851], ['R', C(24, 'won', 16, 3), 0, 0], ['S', C(16, 'playing', 12, 4), .4500, .4500], ['T', C(12, 'lost', 12, 1, { route: .95, hearts: 0, held: .83 }), .8300, .8300],
 ['U', C(28, 'playing', 8, 3, { minis: 1 }), .3150, .1500], ['V', C(27, 'playing', 7, 1, { route: .6, dawn: 2.5, rebirths: 1 }), .9000, .8351], ['W', C(27, 'playing', 7, 1, { route: .6, rebirths: 2 }), .8851, .8851], ['X', C(26, 'playing', 9, 3, { deathWave: 6 }), .4000, .1500],
]
for (const [id, input, target, light] of fixture) { near(moodTarget(input), target, `fixture ${id} target`); near(moodTarget(input, true), light, `fixture ${id} light`) }
for (const [id, d, t, dt, e, r, want] of [['rise', .30, .55, .1, false, false, .30980], ['entrance', .30, .55, .1, true, false, .32938], ['fall', .70, .58, .1, false, false, .69226], ['clamp', .20, .90, .5, false, false, .25500], ['release', .70, 0, .5, false, true, .50157]]) near(moodStep(d, t, dt, e, r), want, `step ${id}`)
near(moodFear(4), .048, 'fear at 4 hearts')
// sub-stepping (the page integrates 0.25 s in 0.05 s steps; Unity frames are smaller): a constant target gives the same D within .005
{ let a = .3, b = .3; for (let i = 0; i < 5; i++) a = moodStep(a, .7, .05, false, false); for (let i = 0; i < 15; i++) b = moodStep(b, .7, 1 / 60, false, false); near(a, b, 'step size independence', .005) }

// ---- the table against game-data.json ----
const data = JSON.parse(readFileSync(new URL('../../public/assets/minigames/carrot/game-data.json', import.meta.url), 'utf8'))
const warn = checkMoodTable(data.levels); ok(warn === '', `profile table matches the wave plans: ${warn}`)
for (const p of MOOD_PROFILES) {
 const l = data.levels.find(x => x.id === p.level); ok(!!l, `L${p.level} exists`)
 const bw = l.wavePlan.findIndex(w => w.some(k => k.boss || k.kind === 'boss')) + 1
 ok(bw === p.bossWave, `L${p.level} boss wave ${p.bossWave} (data ${bw})`); ok(l.waves === p.waves, `L${p.level} waves ${p.waves} (data ${l.waves})`)
 ok(p.challenge === !!l.challenge, `L${p.level} challenge flag`); ok(!!l.boss, `L${p.level} has a guardian`)
 ok(p.intensity > 0 && p.intensity <= 1, `L${p.level} intensity`)
}
const bossLevels = new Set(MOOD_PROFILES.map(p => p.level)); let others = 0
for (const l of data.levels) if (!bossLevels.has(l.id)) { ok(moodProfile(l.id) === null, `L${l.id} has no mood`); others++ }
ok(others === 18, `18 non-boss levels (got ${others})`)
ok(moodProfile(90) === null, 'endless has no mood')

// ---- the gate: solo runs only ----
const snap = (level, over = {}) => ({ level, name: '', biome: 'garden', wave: 0, waves: moodProfile(level)?.waves || 8, coins: 0, health: 10, progress: 0, phase: 'ready', paused: false, speed: 1, nextWave: 0, enemyCount: 0, selection: null, boss: null, monsters: [], notice: '', elapsed: 0, v: 2, mode: 'normal', stats: { kills: 0, leaks: 0, earned: 0, streak: 0, bestStreak: 0, perfectWaves: 0, waveLeaks: [], leakKinds: [], leakCounts: [], dmgKinds: [], dmgValues: [] }, ...over })
ok(moodGate(snap(4))?.id === 'brambleback', 'L4 normal: mood'); ok(moodGate(snap(4, { mode: 'veteran' }))?.id === 'brambleback', 'L4 veteran: mood')
ok(moodGate(snap(8, { mode: 'duo' })) === null, 'duo L8: no mood'); ok(moodGate(snap(90, { mode: 'endless' })) === null, 'endless: no mood'); ok(moodGate(snap(5)) === null, 'L5: no mood')
ok(moodGate(snap(16))?.id === 'brambleback-autumn', 'L16 follows its guardian (Brambleback), not the orchard')

// ---- the tracker ----
const play = (t, from, to, paused = false) => { for (let ms = from + 100; ms <= to; ms += 100) t.time(ms, paused) }
const boss = (o = {}) => ({ id: 77, kind: 'garden', name: 'Brambleback', hp: 1000, maxHp: 2000, shield: 0, maxShield: 0, phase: 1, ability: '', castRemaining: 0, stage: 1, routeFraction: .4, ...o })
{ // a kill: the boss leaves the snapshot with no leak of its kind
 const t = new MoodTracker(); t.observe(snap(4, { phase: 'playing', wave: 8, boss: boss() }), 1000); t.time(1100, false); ok(t.state === 1 && t.stage(snap(4, { phase: 'playing', wave: 8, boss: boss() })) === 'arrival', 'arrival stage')
 play(t, 1100, 3000, true); ok(t.stage(snap(4, { phase: 'playing', wave: 8, boss: boss() })) === 'arrival', 'the arrival window stops while paused')
 play(t, 3000, 5600); ok(t.stage(snap(4, { phase: 'playing', wave: 8, boss: boss() })) === 'advance', 'advance after 2.6 s of play')
 t.observe(snap(4, { phase: 'playing', wave: 8, health: 7, enemyCount: 0, boss: null }), 5700); ok(t.state === 3, 'death (escorts biting in the same snapshot do not make it a leak)')
 ok(t.stage(snap(4, { phase: 'playing', wave: 8 })) === 'release', 'release stage'); near(moodTarget(t.input(snap(4, { phase: 'playing', wave: 8 }), 0)), 0, 'campaign target after the fall')
 ok(t.releaseDelay(snap(4, { phase: 'playing', wave: 8 })) === .15, 'front-loaded release when the guardian was the last enemy')
 { let d = .9; for (let i = 0; i < 2; i++) d = t.step(snap(4, { phase: 'playing', wave: 8 }), d, 0, .05); near(d, .9, 'release holds for the .15 s delay', 1e-9) }
 play(t, 5700, 16000); ok(t.stage(snap(4, { phase: 'playing', wave: 8 })) === 'release', 'a campaign guardian stays in release (the view: stage 4)')
}
{ // a leak: the boss kind's leak record grows as it leaves
 const t = new MoodTracker(); t.observe(snap(16, { phase: 'playing', wave: 12, boss: boss({ routeFraction: .97 }) }), 0)
 t.observe(snap(16, { phase: 'playing', wave: 12, health: 7, boss: null, stats: { ...snap(16).stats, leakKinds: ['garden'], leakCounts: [1] } }), 500); ok(t.state === 4, 'leak'); near(moodTarget(t.input(snap(16, { phase: 'playing', wave: 12 }), 0)), .45, 'leaked target')
 ok(t.stage(snap(16, { phase: 'playing', wave: 12 })) === 'advance', 'a leak keeps the advance stage (the view: stage 3)')
}
{ // a challenge loss: the bite ends the run; phase lost decides
 const t = new MoodTracker(); t.observe(snap(25, { phase: 'playing', wave: 4, boss: boss({ kind: 'tornado', routeFraction: .99 }) }), 0)
 t.observe(snap(25, { phase: 'lost', wave: 4, health: 0, boss: null }), 500); ok(t.state === 1, 'lost: no death, no leak'); near(moodTarget(t.input(snap(25, { phase: 'lost', wave: 4 }), .91)), .91, 'lost holds D')
}
{ // the Eyeball: reincarnate cast = false dawn; the life stage counts rebirths; minibosses after the fall add to the aftershock
 const t = new MoodTracker(), eye = o => snap(27, { phase: 'playing', wave: 7, ...o })
 t.observe(eye({ elapsed: 100, boss: boss({ kind: 'eyeball', routeFraction: .6 }) }), 0)
 t.observe(eye({ elapsed: 101, boss: boss({ kind: 'eyeball', routeFraction: .6, ability: 'reincarnate', castRemaining: 2.2, stage: 2 }) }), 1000)
 ok(t.rebirths === 0, 'the life stage rising with the cast is the dawn, not yet a rebirth')
 near(t.input(eye({ elapsed: 101.5 }), 0).dawnAge, .5, 'dawn age from the reincarnate cast'); near(moodTarget(t.input(eye({ elapsed: 101.5 }), 0)), moodTarget(C(27, 'playing', 7, 1, { route: .6, dawn: .5 })), 'false dawn target')
 t.observe(eye({ elapsed: 103.2, boss: boss({ kind: 'eyeball', routeFraction: .6, stage: 2 }) }), 3200)
 ok(t.rebirths === 1, 'one rebirth when the cast ends (the re-formation)'); near(t.input(eye({ elapsed: 103.2 }), 0).dawnAge, 2.2, 'reform snaps the dawn window to 2.2 s')
 t.observe(eye({ elapsed: 150, wave: 8, enemyCount: 6, boss: null }), 50000); ok(t.state === 3, 'eyeball falls'); ok(t.releaseDelay(eye({ wave: 8 })) === .6, 'challenge release delay .6 s')
 play(t, 50000, 60000); ok(t.stage(eye({ wave: 8 })) === 'post', 'a challenge with waves left goes to post after 9 s')
 t.observe(eye({ elapsed: 160, wave: 9, boss: null, minibosses: [{ id: 501, kind: 'warDrummer', hp: 100, maxHp: 100, shield: 0, maxShield: 0, phase: 1, ability: '', castRemaining: 0, x: 0, y: 0, visible: true }] }), 60000)
 ok(t.minis.size === 1, 'a miniboss after the fall'); near(moodTarget(t.input(eye({ wave: 9 }), 0)), Math.min(.45, .15 + .25 * (9 - 8) / (11 - 8) + .04), 'aftershock target')
}
console.log(`BOSS_MOOD_OK ${checks} checks: fixture A-X, 5 steps, table vs game-data, ${others} non-boss levels, gate, tracker`)
