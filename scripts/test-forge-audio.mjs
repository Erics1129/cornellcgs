// Pure tests for the workshop audio layer specs (src/minigames/forge/audio-spec.ts).
// Offline renders in real browsers live in scripts/forge-qa/audio.mjs. Run: node scripts/test-forge-audio.mjs
import assert from 'node:assert/strict'
import { AUDIO, audioTuning, softClipCurve, ringGain, bladeHz, bladeDamp, strikeSpec, neutralVoices, foley, uiVoices, heartbeat, crackle, VoiceBudget, voiceEnd, seeded, fireLapping, fireHiss, stoneRoomIR, quenchTexture, pinkNoise, shatterTinkles, chipTick } from '../src/minigames/forge/audio-spec.ts'
import { METALS } from '../src/minigames/forge/config.ts'

let checks = 0
const ok = (c, m) => { assert.ok(c, m); checks++ }
const OUTCOMES = ['perfect', 'good', 'dull', 'chip', 'shatter']
const metals = Object.keys(METALS)
const rand = seeded(42)

// No frequency automation on ring or blade partials (the old 30% 'pew' glide), for every outcome and metal.
for (const outcome of OUTCOMES) for (const metal of metals) for (const level of [0, 3, 9, 20]) for (const flowStep of [0, 3, 9]) {
  const spec = strikeSpec({ outcome, metal, level, tempC: 700 + level * 20, flowStep, evolution: level === 3, rand })
  for (const v of spec.voices) if (['ring', 'blade', 'shimmer', 'arpeggio'].includes(v.tag)) ok(v.freqEnd === undefined, `${v.tag} never glides (${outcome} ${metal})`)
  if (outcome === 'dull') ok(!spec.voices.some(v => v.tag === 'ring'), 'Dull has no ring')
  else ok(spec.voices.filter(v => v.tag === 'ring').length === 4, 'four anvil ring partials')
}
// Ring brightness by temperature: strictly decreasing across the working range for outcomes with a bonus.
for (const outcome of ['good', 'perfect', 'chip']) for (let t = 600; t < 1250; t += 5) ok(ringGain(t + 5, outcome) < ringGain(t, outcome), `${outcome} ring gain strictly falls from ${t} C`)
for (const outcome of OUTCOMES) for (let t = 400; t < 1300; t += 10) ok(ringGain(t + 10, outcome) <= ringGain(t, outcome), `${outcome} ring gain never rises with heat`)
// The 1180 Hz partial is at least 10 dB louder at 600 C than at 1100 C (the 'getting cold' cue).
for (const outcome of ['good', 'perfect', 'chip']) { const r = 20 * Math.log10(ringGain(600, outcome) / ringGain(1100, outcome)); ok(r >= 10, `${outcome}: 600 C rings ${r.toFixed(1)} dB above 1100 C`) }
ok(Math.abs(ringGain(600, 'good') - (.55 + .25)) < 1e-9, 'cold ring = .55 + outcome bonus')
// Blade pitch: one semitone per level, never above +7 semitones; damped to .4x while hot.
for (const metal of metals) for (let level = 0; level <= 40; level++) ok(bladeHz(metal, level) <= AUDIO.metals[metal].hz * Math.pow(2, 7 / 12) + 1e-9, `${metal} +${level} capped at +7 semitones`)
ok(Math.abs(bladeHz('iron', 1) / bladeHz('iron', 0) - Math.pow(2, 1 / 12)) < 1e-12, 'one semitone per level')
ok(AUDIO.metals.iron.hz === 620 && AUDIO.metals.bronze.hz === 520 && AUDIO.metals.steel.hz === 760 && AUDIO.metals.silver.hz === 880 && AUDIO.metals.damascus.hz === 700 && AUDIO.metals.obsidian.hz === 1400 && AUDIO.metals.meteor.hz === 660 && AUDIO.metals.auricite.hz === 990, 'metal pitch table')
ok(AUDIO.metals.bronze.decay === 1.6 && AUDIO.metals.silver.decay === 2, 'bronze 1.6x and silver 2x decay')
ok(Math.abs(bladeDamp(1100) - .4) < 1e-9 && bladeDamp(600) === 1, 'blade partials damped to .4x while hot')
for (const outcome of OUTCOMES) for (const metal of metals) for (let level = 0; level <= 30; level += 3) {
  const s = strikeSpec({ outcome, metal, level, tempC: 800, rand }), blade = s.voices.find(v => v.tag === 'blade')
  if (blade) ok(blade.freq <= AUDIO.metals[metal].hz * Math.pow(2, 7 / 12) * Math.pow(2, 10 / 1200) + 1e-6, 'blade partial (with detune) stays within +7 semitones')
}
// Per-strike variation: detune within +/- 10 cents, gain within +/- 1.5 dB; partial ratios exact.
{
  const r = seeded(7)
  for (let i = 0; i < 4000; i++) {
    const s = strikeSpec({ outcome: OUTCOMES[i % 5], metal: metals[i % 8], level: i % 12, tempC: 600 + (i % 60) * 10, rand: r })
    ok(Math.abs(s.detuneCents) <= 10, 'detune within 10 cents'); ok(Math.abs(s.gainDb) <= 1.5, 'gain variation within 1.5 dB')
    const ring = s.voices.filter(v => v.tag === 'ring')
    if (ring.length) ok(ring.every((v, k) => Math.abs(v.freq / AUDIO.ring.partials[k] - Math.pow(2, s.detuneCents / 1200)) < 1e-9), 'ring partials 1180/3253/6377/10541 Hz, detuned together')
  }
  const tr = neutralVoices(seeded(3))[0]
  ok(tr.tag === 'transient' && Math.abs(Math.log2(tr.freq / 4200) * 1200) <= 100 && tr.dur === .008 && tr.gain === .3, 'transient: 4.2 kHz +/- 100 cents, 8 ms, gain .30')
}
// Outcome layers.
{
  const tags = o => strikeSpec({ outcome: o, metal: 'iron', level: 4, tempC: 800, rand: seeded(1), evolution: o === 'good', flowStep: 0 }).voices.map(v => v.tag)
  ok(tags('perfect').includes('shimmer'), 'Perfect adds a shimmer'); ok(tags('good').filter(t => t === 'arpeggio').length === 3, 'Evolution plays a 3-note arpeggio')
  ok(tags('chip').includes('crack'), 'Chip adds a crack'); ok(tags('shatter').includes('boom') && tags('shatter').includes('crack'), 'Shatter adds a crack and a boom')
  ok(tags('dull').includes('thud') && !tags('dull').includes('blade'), 'Dull: a thud, no ring or blade')
  const sh = strikeSpec({ outcome: 'shatter', metal: 'iron', level: 9, tempC: 900, rand }); ok(sh.duckDb === 5 && sh.duckS === .3, 'Shatter ducks the ambience 5 dB for 300 ms')
  const flow = strikeSpec({ outcome: 'good', metal: 'iron', level: 4, tempC: 800, rand: seeded(5), flowStep: 3 }), plain = strikeSpec({ outcome: 'good', metal: 'iron', level: 4, tempC: 800, rand: seeded(5), flowStep: 0 })
  ok(Math.abs(flow.voices.find(v => v.tag === 'ring').freq / plain.voices.find(v => v.tag === 'ring').freq - Math.pow(2, 3 / 12)) < 1e-9, 'Flow raises the ring a semitone per strike')
  const f9 = strikeSpec({ outcome: 'good', metal: 'iron', level: 4, tempC: 800, rand: seeded(5), flowStep: 12 })
  ok(Math.abs(f9.voices.find(v => v.tag === 'ring').freq / plain.voices.find(v => v.tag === 'ring').freq - Math.pow(2, 7 / 12)) < 1e-9, 'up to +7 semitones')
  ok(flow.voices.some(v => v.tag === 'whoomp'), 'Flow adds a 200 Hz whoomp')
  ok(!strikeSpec({ outcome: 'good', metal: 'iron', level: 4, tempC: 800, rand, skipNeutral: true }).voices.some(v => ['transient', 'body', 'thump'].includes(v.tag)), 'pre-scheduled neutral layers are not doubled')
  ok(!strikeSpec({ outcome: 'dull', metal: 'iron', level: 4, tempC: 800, rand, skipNeutral: true }).voices.some(v => ['transient', 'body'].includes(v.tag)), 'nor on Dull')
  ok(chipTick().freq === 5200, 'chip-land tick at 5.2 kHz')
}
// Phone and laptop speakers: every weight layer carries harmonic energy above 300 Hz (critique #35).
{
  const above = v => { const h = v.harmonics || [1]; let hi = 0, all = 0; h.forEach((a, i) => { const f = v.freq * (i + 1), e = a * a; all += e; if (f >= 300) hi += e }); return hi / all }
  const layers = [...neutralVoices(seeded(1)).filter(v => v.tag === 'thump'), ...strikeSpec({ outcome: 'shatter', metal: 'iron', level: 9, tempC: 900, rand }).voices.filter(v => v.tag === 'boom'), ...strikeSpec({ outcome: 'dull', metal: 'iron', level: 4, tempC: 900, rand }).voices.filter(v => v.tag === 'thud'), ...heartbeat(1).filter(v => v.tag === 'heart'), ...strikeSpec({ outcome: 'good', metal: 'iron', level: 4, tempC: 900, rand, flowStep: 2 }).voices.filter(v => v.tag === 'whoomp')]
  for (const v of layers) ok(v.src === 'osc' && v.wave === 'rich' && above(v) >= .1, `${v.tag} (${v.freq} Hz) has ${(above(v) * 100).toFixed(0)}% of its energy above 300 Hz`)
  const drone = AUDIO.tension; for (const hz of drone.droneHz) ok(above({ freq: hz, harmonics: drone.harmonics }) >= .1, `drone ${hz} Hz has energy above 300 Hz`)
  ok(heartbeat(1).some(v => v.tag === 'heart-click' && v.freq >= 1000 && v.freq <= 3000), 'the heartbeat has a 1-3 kHz click')
  // Fire lapping: the 30 Hz lap plus a roar that follows it; measure energy above 300 Hz with a DFT.
  const sr = 8000, d = fireLapping(sr, 2, seeded(9)), N = 4096, seg = d.subarray(2000, 2000 + N)
  let hi = 0, all = 0; for (let k = 1; k < N / 2; k++) { let re = 0, im = 0; for (let n = 0; n < N; n += 1) { const w = 2 * Math.PI * k * n / N; re += seg[n] * Math.cos(w); im -= seg[n] * Math.sin(w) } const e = re * re + im * im; all += e; if (k * sr / N >= 300) hi += e }
  ok(hi / all >= .2, `fire lapping has ${(hi / all * 100).toFixed(0)}% of its energy above 300 Hz`)
}
// Voice budget: at most 48 voices (beds included) at 6 strikes per second, stealing low priority first.
{
  const budget = new VoiceBudget(AUDIO.master.voices - AUDIO.beds.voices), r = seeded(11)
  let peak = 0, stolen = 0, highStolen = 0
  const prio = new Map()
  for (let i = 0; i < 60; i++) {
    const now = i / 6
    const spec = strikeSpec({ outcome: OUTCOMES[i % 5], metal: 'steel', level: 8, tempC: 650, flowStep: i % 8, evolution: i % 7 === 0, rand: r })
    const voices = [...spec.voices, ...foley('swing', 0, 0, r), ...foley('whoosh', 8, 0, r), ...foley('flake-land', 0, 0, r), ...(i % 5 === 4 ? shatterTinkles(r) : []), crackle(r)]
    for (const v of voices) { const { id, steal } = budget.admit(now, now + v.at, now + voiceEnd(v), v.priority || 0); prio.set(id, v.priority || 0); if (steal) { stolen++; if (prio.get(steal) >= 3) highStolen++ } peak = Math.max(peak, budget.count(now) + AUDIO.beds.voices) }
  }
  ok(peak <= 48, `at most 48 voices at 6 strikes/s (peak ${peak})`)
  ok(stolen > 0 && highStolen <= stolen * .1, `stealing takes low-priority voices first (${highStolen}/${stolen} high-priority)`)
  ok(AUDIO.master.voices === 48)
}
// Master chain numbers and the reverb.
{
  const m = AUDIO.master, rv = AUDIO.reverb
  ok(m.threshold === -18 && m.knee === 12 && m.ratio === 3 && m.attack === .003 && m.release === .12 && m.latencyHint === 'interactive', 'compressor -18 dB / 12 dB knee / 3:1 / 3 ms / 120 ms, interactive latency')
  ok(rv.seconds === .9 && rv.rt60 === .7 && rv.lowpass === 4000 && rv.strikeWet === .16 && rv.ambWet === .22 && rv.early.join() === '0.011,0.017,0.023,0.031', 'stone room: .9 s, RT60 .7 s, 4 kHz, early 11/17/23/31 ms, 16% / 22% wet')
  // Output soft clipper: unity below -6 dBFS, never above the -1 dBFS ceiling, monotonic, odd.
  const curve = softClipCurve(2049), x = i => (i / 2048 * 2 - 1) * 2
  ok(Math.max(...curve.map(Math.abs)) <= Math.pow(10, -1 / 20), 'the soft clipper never exceeds -1 dBFS')
  ok(curve.every((v, i) => Math.abs(x(i)) > Math.pow(10, -6 / 20) || Math.abs(v - x(i)) < 1e-6), 'unity gain below -6 dBFS')
  ok(curve.every((v, i) => !i || v >= curve[i - 1]) && Math.abs(curve[0] + curve[2048]) < 1e-9, 'monotonic and odd')
  ok(m.makeupDb > 0 && m.lookaheadMs === 6, 'makeup gain and the 6 ms compressor look-ahead are declared')
  const sr = 16000, ir = stoneRoomIR(sr, seeded(2))
  ok(ir.length === 2 && ir[0].length === Math.floor(sr * .9), 'stereo .9 s impulse response')
  // RT60 from the energy decay: the level 300 ms apart falls by about 60 dB * .3 / .7.
  const energy = (a, b) => { let e = 0; for (let i = Math.floor(a * sr); i < Math.floor(b * sr); i++) e += ir[0][i] ** 2; return e }
  const drop = 10 * Math.log10(energy(.1, .2) / energy(.4, .5)); ok(Math.abs(drop - 60 * .3 / .7) < 6, `IR decays ${drop.toFixed(1)} dB over 300 ms (RT60 .7 s)`)
  for (const s of rv.early) { const i = Math.floor(s * sr); ok(Math.abs(ir[0][i]) > 3 * Math.sqrt(energy(s + .002, s + .006) / (.004 * sr)), `early reflection at ${s * 1000} ms`) }
  const q = quenchTexture(8000, seeded(4)); ok(q.length === 8000 * 2.4, 'quench texture lasts 2.4 s')
  const pk = pinkNoise(8000, seeded(1)); ok(pk.every(v => Math.abs(v) <= .8 + 1e-6), 'pink noise normalised')
  ok(fireHiss(8000, 1, seeded(1)).length === 8000)
}
// Foley table for every frozen sfx name, and UI chimes.
{
  const names = ['swing', 'whoosh', 'step', 'tongs', 'coals-in', 'coals-out', 'bellows', 'place', 'quench', 'flake-land', 'chip-land', 'shard-land', 'coin-land', 'dawn']
  for (const n of names) ok(foley(n, 0, 0, seeded(1)).length > 0, `foley for ${n}`)
  ok(foley('nope', 0, 0).length === 0, 'unknown sfx are silent')
  const w = foley('whoosh', 16, 0, seeded(1))[0]; ok(w.freq === 600 && w.filterEnd === 1800 && w.dur === .07 && Math.abs(w.gain - .05 * 1.6) < 1e-9, 'whoosh: 600 -> 1800 Hz over 70 ms, gain .05 x speed/8 (capped)')
  const t = foley('tongs', 0, 0).map(v => v.freq).join(); ok(t === '2100,5300,7900', 'tongs clink at 2.1, 5.3 and 7.9 kHz')
  ok(foley('coin-land', 8, 9).some(v => v.gain === .075), 'the last coin clinks louder')
  for (const k of ['sell', 'buy', 'heat', 'flow', 'refuse', 'move', 'use']) ok(uiVoices(k).length > 0, `UI chime ${k}`)
  ok(uiVoices('refuse')[0].dur <= .03, 'the refusal is a dry tick')
}
// Tuning overrides: nested, clamped, and the hard caps hold.
{
  const t = audioTuning({ ring: { scale: .7, gains: [.1, .05, .03, .02], detuneCents: 50 }, master: { voices: 200, ceilingDb: 3, makeupDb: 40 }, blade: { maxSemitones: 12 }, nope: { x: 1 }, fire: { pan: 'left' } })
  ok(t.ring.scale === .7 && t.ring.gains[0] === .1 && t.ring.detuneCents === 10 && t.master.voices === 48 && t.master.ceilingDb === -1 && t.master.makeupDb === 18 && t.blade.maxSemitones === 7 && t.fire.pan === AUDIO.fire.pan, 'audio overrides merge and clamp')
  ok(audioTuning(null).ring.scale === .55)
}
console.log(`PASS Forge audio: ${checks} checks (no partial glides, ring falls with heat and is 10+ dB brighter at 600 C than 1100 C, blade pitch <= +7 st, detune <= 10 cents, gain <= 1.5 dB, outcome layers, energy above 300 Hz, <= 48 voices at 6 strikes/s, compressor and stone-room IR, foley, tuning).`)
