// Deterministic, seeded synthesis of Carrot Defense's procedural sound LAYERS (original DSP code, no third-party code).
//
// usage: node unity/CarrotDefense/Tools/synth_carrot_sfx.mjs [--check] [--only Name]
//   (also refreshes the recorded CC0 round-robin variants; see the end of this file)
//   writes Assets/Resources/Carrot/Audio/Synth/<Name>.wav (24 kHz, mono, 16-bit, TPDF-dithered, peak -1 dBFS) with a
//   Unity .meta (stable GUID from the path; Vorbis q0.5, decompress on load) and Synth/synth-provenance.json
//   (generator, seed, parameters, duration, sha256 per file). --check re-renders in memory and fails if any
//   shipped WAV differs (determinism and drift gate).
//
// These are layers, never whole cues: CarrotAudio plays them under recorded CC0 Kenney transients (the 0-10 ms
// "click" that sells a real impact), so the synth supplies only what recordings do not have here: sub thumps,
// filtered-noise sweeps, risers, tonal bodies in the game's key and short reverberant tails.
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'Assets/Resources/Carrot/Audio/Synth')
const SR = 24000
const VERSION = 'synth_carrot_sfx.mjs v1'
const check = process.argv.includes('--check')
const only = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? process.argv[i + 1] : null })()

// ---------- primitives ----------
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const buf = s => new Float64Array(Math.ceil(s * SR))
const TAU = Math.PI * 2
const lerp = (a, b, t) => a + (b - a) * t
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const semis = (f, n) => f * Math.pow(2, n / 12)
// Exponential glide from a to b over d seconds (then holds b).
const glide = (a, b, d) => t => t >= d ? b : a * Math.pow(b / a, t / d)
// Attack/decay envelope: linear attack, exponential decay with time constant tau, optional hold.
const ad = (attack, tau, hold = 0) => t => t < 0 ? 0 : t < attack ? t / attack : t < attack + hold ? 1 : Math.exp(-(t - attack - hold) / tau)
// Smooth swell then release (for risers/pads).
const swell = (rise, fall, len) => t => t < 0 ? 0 : t < rise ? Math.pow(t / rise, 2) : t < len - fall ? 1 : Math.max(0, (len - t) / fall)

// Topology-preserving-transform state variable filter: stable under fast modulation.
function svf() {
  let ic1 = 0, ic2 = 0
  return (x, cutoff, q) => {
    const g = Math.tan(Math.PI * clamp(cutoff, 10, SR * .49) / SR), k = 1 / Math.max(.3, q)
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2
    const v3 = x - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3
    ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2
    return { lp: v2, bp: v1, hp: x - k * v1 - v2 }
  }
}
function onePoleHP(c) { let px = 0, py = 0; const a = Math.exp(-TAU * c / SR); return x => { const y = a * (py + x - px); px = x; py = y; return y } }

// Additive voice: partials [ratio, amp, decayTau] above a (possibly gliding) fundamental.
function tone(out, at, len, f0, partials, env, { detune = 0, vib = 0, vibRate = 5, gain = 1 } = {}) {
  const start = Math.floor(at * SR), n = Math.min(out.length - start, Math.ceil(len * SR)), fr = typeof f0 === 'function' ? f0 : () => f0
  const ph = partials.map(() => 0)
  for (let i = 0; i < n; i++) {
    const t = i / SR, base = fr(t) * (1 + vib * Math.sin(TAU * vibRate * t)) * (1 + detune)
    let s = 0
    for (let p = 0; p < partials.length; p++) { const [r, a, tau] = partials[p]; ph[p] += TAU * base * r / SR; s += Math.sin(ph[p]) * a * (tau ? Math.exp(-t / tau) : 1) }
    out[start + i] += s * env(t) * gain
  }
}
// Filtered noise: shape(t) -> {cut, q, mode}, env(t).
function noise(out, at, len, r, shape, env, gain = 1, colour = 'white') {
  const start = Math.floor(at * SR), n = Math.min(out.length - start, Math.ceil(len * SR)), f = svf()
  let b0 = 0, b1 = 0, b2 = 0
  for (let i = 0; i < n; i++) {
    const t = i / SR; let w = r() * 2 - 1
    if (colour === 'pink') { b0 = .99765 * b0 + w * .099046; b1 = .963 * b1 + w * .2965164; b2 = .57 * b2 + w * 1.0526913; w = (b0 + b1 + b2 + w * .1848) * .25 }
    const s = shape(t), y = f(w, s.cut, s.q || .707)
    out[start + i] += (s.mode === 'hp' ? y.hp : s.mode === 'bp' ? y.bp : y.lp) * env(t) * gain
  }
}
// Sub thump: sine with an exponential pitch drop and a click-free attack.
function thump(out, at, f1, f2, drop, tau, gain = 1, len = tau * 6) {
  tone(out, at, len, glide(f1, f2, drop), [[1, 1], [2, .12, tau * .4]], ad(.002, tau), { gain })
}
// Crackle grains: tiny decaying noise ticks at random times.
function crackle(out, at, len, r, count, gain = 1, cut = 5000) {
  for (let i = 0; i < count; i++) {
    const t = at + r() * len, g = gain * (.4 + .6 * r()) * Math.exp(-(t - at) / Math.max(.05, len * .6)), c = cut * (.6 + .8 * r())
    noise(out, t, .012, r, () => ({ cut: c, q: 1.2, mode: 'bp' }), ad(.0005, .0025), g)
  }
}
// Karplus-Strong pluck (wooden/needle bodies).
function pluck(out, at, f, len, r, damp = .5, gain = 1) {
  const period = Math.max(2, Math.round(SR / f)), line = new Float64Array(period)
  for (let i = 0; i < period; i++) line[i] = r() * 2 - 1
  const start = Math.floor(at * SR), n = Math.min(out.length - start, Math.ceil(len * SR)); let idx = 0, prev = 0
  for (let i = 0; i < n; i++) { const cur = line[idx]; const next = (cur * (1 - damp) + prev * damp) * .996; prev = cur; line[idx] = next; idx = (idx + 1) % period; out[start + i] += cur * gain * Math.min(1, (n - i) / (SR * .01)) }
}
// Small mono room after Freeverb's topology (8 damped parallel combs, 4 series allpasses), scaled to 24 kHz, with
// a 4-allpass input diffuser and an 8 ms predelay so short transients do not ring as flutter echoes. wet in 0..1.
function room(x, wet, size = .8, damp = .35) {
  const scale = SR / 44100, pre = Math.round(.008 * SR)
  const diff = [142, 107, 379, 277].map(d => ({ b: new Float64Array(Math.round(d * scale)), i: 0 }))
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map(d => ({ b: new Float64Array(Math.max(8, Math.round(d * scale * (.55 + .45 * size)))), i: 0, f: 0 }))
  const alls = [556, 441, 341, 225].map(d => ({ b: new Float64Array(Math.round(d * scale)), i: 0 }))
  const fb = .7 + .26 * size, y = new Float64Array(x.length), delay = new Float64Array(pre + 1); let di = 0
  for (let n = 0; n < x.length; n++) {
    let v = delay[di]; delay[di] = x[n]; di = (di + 1) % delay.length
    for (const a of diff) { const o = a.b[a.i], w = v + o * .6; a.b[a.i] = w; v = o - w * .6; a.i = (a.i + 1) % a.b.length }
    let s = 0
    for (const c of combs) { const o = c.b[c.i]; c.f = o * (1 - damp) + c.f * damp; c.b[c.i] = v * .02 + c.f * fb; c.i = (c.i + 1) % c.b.length; s += o }
    for (const a of alls) { const o = a.b[a.i], w = s + o * .5; a.b[a.i] = w; s = o - w * .5; a.i = (a.i + 1) % a.b.length }
    y[n] = x[n] * (1 - wet * .35) + s * wet * 1.6
  }
  return y
}
function finish(x, { fadeOut = .012, peakDb = -1, hp = 25, drive = 0 } = {}) {
  const h = onePoleHP(hp)
  let y = x.map(v => h(v))
  if (drive > 0) y = y.map(v => Math.tanh(v * (1 + drive)) / Math.tanh(1 + drive))
  // Tail fade: a cosine over the last 20% of the file (30-150 ms) so a still-ringing partial never ends in a click.
  const fo = Math.round(clamp(Math.max(fadeOut, y.length / SR * .2), .03, .15) * SR)
  for (let i = 0; i < fo && i < y.length; i++) y[y.length - 1 - i] *= .5 - .5 * Math.cos(Math.PI * i / fo)
  for (let i = 0; i < 24 && i < y.length; i++) y[i] *= i / 24
  let peak = 0; for (const v of y) peak = Math.max(peak, Math.abs(v))
  const g = peak > 0 ? Math.pow(10, peakDb / 20) / peak : 1
  return y.map(v => v * g)
}
// Trim trailing tails below -54 dBFS (inaudible under the game mix; keeps files short).
function trim(y, floorDb = -54) {
  const floor = Math.pow(10, floorDb / 20); let end = y.length
  while (end > SR * .05 && Math.abs(y[end - 1]) < floor) end--
  const keep = Math.min(y.length, end + Math.round(SR * .01)), out = y.slice(0, keep), fo = Math.round(SR * .01)
  for (let i = 0; i < fo && i < out.length; i++) out[out.length - 1 - i] *= i / fo
  return out
}

// Musical frame: the game's SFX palette is A natural minor; tonal bodies use its pentatonic subset.
const A4 = 440, note = n => semis(A4, n) // n semitones from A4
const PENTA = [0, 3, 5, 7, 10]

// ---------- the sound list ----------
const SOUNDS = {
  // ----- 20 plant-family shot signatures (body + tail, 0.15-0.75 s) -----
  SigSeed: { seed: 101, params: 'pop: BP noise 1.4k->600 Hz 20 ms + marimba tok A5 (1,3.9,9.2) + air tail', render(r) { const x = buf(.26); noise(x, 0, .05, r, t => ({ cut: lerp(1400, 600, Math.min(1, t / .02)), q: 2.2, mode: 'bp' }), ad(.001, .012), .9); tone(x, .002, .2, note(12), [[1, 1, .05], [3.9, .35, .018], [9.2, .12, .008]], ad(.0015, .2), { gain: .55 }); noise(x, .01, .2, r, () => ({ cut: 5200, q: .7, mode: 'hp' }), ad(.004, .05), .12); return room(x, .18, .6) } },
  SigMortar: { maxLen: 0.6, seed: 102, params: 'launch: sine 92->38 Hz drop 120 ms + LP 320 Hz noise whump + room', render(r) { const x = buf(.72); thump(x, 0, 92, 38, .12, .11, 1.1); noise(x, 0, .5, r, t => ({ cut: lerp(900, 220, Math.min(1, t / .25)), q: .9 }), ad(.003, .09), .8, 'pink'); crackle(x, .02, .2, r, 6, .25, 2500); return room(x, .3, .9, .45) } },
  SigFrost: { seed: 103, params: 'ice: 6 inharmonic partials C7-E8 staggered + HP hiss + shimmer room', render(r) { const x = buf(.5); const fs = [2093, 2637, 3322, 4186, 5274, 6645]; fs.forEach((f, i) => tone(x, i * .006, .45, f * (1 + (r() - .5) * .006), [[1, 1]], ad(.001, .05 + .04 * (5 - i)), { gain: .28 })); noise(x, 0, .3, r, () => ({ cut: 4800, q: .7, mode: 'hp' }), ad(.002, .07), .35); return room(x, .35, .7, .2) } },
  SigPrism: { seed: 104, params: 'glass chord A5/E6/A6 chorus +-4 cents, slow vibrato, room', render(r) { const x = buf(.48); [note(12), note(19), note(24)].forEach((f, i) => { tone(x, i * .008, .45, f, [[1, 1], [2.01, .18, .06]], ad(.004, .16), { detune: -.0023, vib: .002, vibRate: 6, gain: .32 }); tone(x, i * .008, .45, f, [[1, 1]], ad(.004, .16), { detune: .0023, gain: .22 }) }); noise(x, 0, .05, r, () => ({ cut: 7000, q: .8, mode: 'hp' }), ad(.001, .01), .25); return room(x, .3, .7, .2) } },
  SigStorm: { seed: 105, params: 'zap: FM carrier 220->110 Hz ratio 3.5 index 6->1 through BP 4k->1k + 14 crackle grains', render(r) { const x = buf(.34); const n = x.length; let pc = 0, pm = 0; const f = svf(); for (let i = 0; i < n; i++) { const t = i / SR, fc = 220 * Math.pow(.5, t / .25), idx = lerp(6, 1, Math.min(1, t / .2)); pm += TAU * fc * 3.5 / SR; pc += TAU * fc / SR + idx * Math.sin(pm) * TAU * fc * 3.5 / SR * .2; const y = f(Math.sin(pc), lerp(4000, 1000, Math.min(1, t / .25)), 1.4); x[i] += y.bp * ad(.001, .07)(t) * 1.4 } crackle(x, 0, .22, r, 14, .5, 6000); return room(x, .15, .5) } },
  SigThunder: { maxLen: 0.95, seed: 106, params: 'thunderhead: noise burst + LP sweep 8 kHz->300 Hz over 400 ms, crackle grains, 60 Hz thump 120 ms, rumble tail', render(r) { const x = buf(1.1); noise(x, 0, 1.05, r, t => ({ cut: t < .4 ? 8000 * Math.pow(300 / 8000, t / .4) : 300 * Math.pow(.6, (t - .4) / .6), q: .9 }), t => t < .002 ? t / .002 : Math.exp(-t / .28), 1.1); thump(x, 0, 60, 48, .12, .12, 1.2, .5); crackle(x, 0, .35, r, 22, .6, 7000); noise(x, .05, 1, r, () => ({ cut: 140, q: .8 }), swell(.08, .7, 1), .5, 'pink'); return room(x, .35, 1, .5) }, drive: .6 },
  SigBook: { seed: 107, params: 'page whoosh: BP noise 600->2400 Hz Q2 + soft E4 glow', render(r) { const x = buf(.4); noise(x, 0, .38, r, t => ({ cut: 600 * Math.pow(4, Math.min(1, t / .18)), q: 2, mode: 'bp' }), swell(.03, .3, .36), .9, 'pink'); tone(x, .01, .35, note(-5), [[1, 1], [2, .2]], ad(.02, .1), { gain: .25 }); return room(x, .25, .7) } },
  SigGravity: { seed: 108, params: 'whomp: sine 140->55 Hz + 12 Hz warble + LP noise swirl', render(r) { const x = buf(.6); tone(x, 0, .58, glide(140, 55, .3), [[1, 1], [1.5, .2, .1]], t => ad(.004, .16)(t) * (1 - .35 * (.5 + .5 * Math.sin(TAU * 12 * t))), { gain: .9 }); noise(x, 0, .5, r, t => ({ cut: lerp(1200, 300, Math.min(1, t / .4)), q: 3, mode: 'bp' }), ad(.02, .12), .35, 'pink'); return room(x, .2, .8) } },
  SigBlossom: { seed: 109, params: 'petal chime: E6 G6 A6 arpeggio 25 ms stagger, soft triangle partials + airy noise', render(r) { const x = buf(.5); [note(19), note(22), note(24)].forEach((f, i) => tone(x, i * .025, .4, f, [[1, 1], [3, .11], [5, .04]], ad(.003, .12), { gain: .3 })); noise(x, 0, .3, r, () => ({ cut: 6000, q: .7, mode: 'hp' }), swell(.02, .25, .3), .12); return room(x, .35, .7, .25) } },
  SigStarfruit: { seed: 110, params: 'twinkle: 4 pentatonic pings 2-4 kHz, 15 ms apart + shimmer room', render(r) { const x = buf(.34); for (let i = 0; i < 4; i++) { const f = note(24 + PENTA[Math.floor(r() * 5)] + (r() < .4 ? 12 : 0)); tone(x, i * .015, .25, f, [[1, 1], [2.76, .15, .02]], ad(.001, .05), { gain: .3 }) } return room(x, .38, .6, .2) } },
  SigBamboo: { seed: 111, params: 'hollow thock: resonant BP impulse 420 Hz Q18 + 1150 Hz mode + air puff', render(r) { const x = buf(.26); const imp = buf(.26); for (let i = 0; i < 40; i++) imp[i] = (r() * 2 - 1) * (1 - i / 40); const f1 = svf(), f2 = svf(); for (let i = 0; i < x.length; i++) { const a = f1(imp[i], 420, 18), b = f2(imp[i], 1150, 12); x[i] = a.bp * 3 + b.bp * 1.4 } noise(x, 0, .05, r, () => ({ cut: 2500, q: .8 }), ad(.001, .012), .2); return x } },
  SigChili: { seed: 112, params: 'fire fwoosh: LP noise 500->3500 Hz over 120 ms then decay + crackles', render(r) { const x = buf(.55); noise(x, 0, .53, r, t => ({ cut: t < .12 ? lerp(500, 3500, t / .12) : 3500 * Math.pow(.25, (t - .12) / .4), q: .8 }), swell(.05, .4, .52), .9, 'pink'); crackle(x, .03, .45, r, 18, .35, 3500); return room(x, .15, .6) } },
  SigLotus: { seed: 113, params: 'water bloop: two bubbles (sine 400->900 Hz in 60 ms) + soft LP splash', render(r) { const x = buf(.34); tone(x, 0, .12, glide(400, 900, .06), [[1, 1]], ad(.002, .035), { gain: .7 }); tone(x, .07, .1, glide(520, 1150, .05), [[1, 1]], ad(.002, .028), { gain: .45 }); noise(x, 0, .25, r, () => ({ cut: 1800, q: .7 }), ad(.003, .06), .25, 'pink'); return room(x, .3, .6, .3) } },
  SigMagnet: { seed: 114, params: 'metallic zing: ring-mod 660 x 1190 Hz dropping 4%, comb resonance', render(r) { const x = buf(.38); const n = x.length; let a = 0, b = 0; for (let i = 0; i < n; i++) { const t = i / SR, d = 1 - .04 * Math.min(1, t / .3); a += TAU * 660 * d / SR; b += TAU * 1190 * d / SR; x[i] = Math.sin(a) * Math.sin(b) * ad(.001, .08)(t) } const comb = new Float64Array(Math.round(SR / 880)); let ci = 0; for (let i = 0; i < n; i++) { const o = comb[ci]; comb[ci] = x[i] + o * .6; ci = (ci + 1) % comb.length; x[i] = x[i] * .6 + o * .5 } noise(x, 0, .03, r, () => ({ cut: 6000, q: 1, mode: 'hp' }), ad(.0005, .006), .4); return room(x, .2, .5) } },
  SigOrchid: { seed: 115, params: 'poison hiss: HP noise 3 kHz sss envelope + 3 sine bubble pops', render(r) { const x = buf(.42); noise(x, 0, .4, r, () => ({ cut: 3000, q: .9, mode: 'hp' }), swell(.04, .3, .4), .5); for (let i = 0; i < 3; i++) tone(x, .05 + i * .07 + r() * .02, .06, glide(300 + r() * 200, 800 + r() * 300, .03), [[1, 1]], ad(.002, .015), { gain: .35 }); return room(x, .15, .5) } },
  SigMushroom: { seed: 116, params: 'spore pfft: LP noise 1.2 kHz puff 150 ms + Karplus-Strong G3 pluck', render(r) { const x = buf(.32); noise(x, 0, .3, r, t => ({ cut: lerp(1600, 700, Math.min(1, t / .15)), q: .7 }), ad(.004, .05), .8, 'pink'); pluck(x, .002, 196, .28, r, .55, .45); return room(x, .2, .6, .4) } },
  SigCactus: { seed: 117, params: 'needle: 5 ms HP 6 kHz click + Karplus-Strong A5 pluck 80 ms', render(r) { const x = buf(.17); noise(x, 0, .01, r, () => ({ cut: 6000, q: .8, mode: 'hp' }), ad(.0003, .0025), 1); pluck(x, .001, 880, .15, r, .3, .5); return x } },
  SigClockflower: { seed: 118, params: 'tick-tock (BP 3 kHz clicks at 0 and 90 ms) + small bell E6 inharmonic', render(r) { const x = buf(.42); for (const at of [0, .09]) noise(x, at, .012, r, () => ({ cut: at ? 2400 : 3200, q: 4, mode: 'bp' }), ad(.0003, .003), 1); tone(x, .09, .32, note(19), [[1, 1], [2.32, .4, .08], [4.25, .2, .04], [6.63, .1, .02]], ad(.001, .12), { gain: .3 }); return room(x, .25, .6) } },
  SigDragonfruit: { maxLen: 0.66, seed: 119, params: 'meteor launch: BP noise whoosh 300->2000 Hz + low sine swell', render(r) { const x = buf(.75); noise(x, 0, .72, r, t => ({ cut: 300 * Math.pow(2000 / 300, Math.min(1, t / .5)), q: 1.6, mode: 'bp' }), swell(.4, .25, .72), 1, 'pink'); tone(x, 0, .7, glide(70, 110, .5), [[1, 1]], swell(.35, .3, .7), { gain: .35 }); return room(x, .2, .8) } },
  SigMoonflower: { maxLen: 0.5, seed: 120, params: 'ethereal swell: A4/E5 sines 40 ms attack, vibrato, HP shimmer, room', render(r) { const x = buf(.6); tone(x, 0, .55, note(0), [[1, 1], [2, .15]], swell(.04, .4, .55), { vib: .004, vibRate: 5.5, gain: .3 }); tone(x, .01, .54, note(7), [[1, 1]], swell(.05, .4, .54), { vib: .004, vibRate: 6.1, gain: .22 }); noise(x, 0, .5, r, () => ({ cut: 7000, q: .7, mode: 'hp' }), swell(.05, .4, .5), .08); return room(x, .45, .8, .2) } },

  // ----- impact and kill layers -----
  SubThump: { seed: 201, params: 'sub: sine 110->42 Hz drop 90 ms, tau 120 ms', render() { const x = buf(.42); thump(x, 0, 110, 42, .09, .12, 1, .42); return x }, drive: .3 },
  ImpactBoom: { maxLen: 0.7, seed: 202, params: 'blast: sub 80->35 Hz + pink LP 2k->200 Hz + 20 debris grains + room', render(r) { const x = buf(.85); thump(x, 0, 80, 35, .14, .16, 1.1, .8); noise(x, 0, .8, r, t => ({ cut: 2000 * Math.pow(.1, Math.min(1, t / .5)), q: .8 }), ad(.002, .14), 1, 'pink'); crackle(x, .03, .5, r, 20, .3, 3000); return room(x, .3, .9, .45) }, drive: .5 },
  KillPop: { seed: 203, params: 'kill pop: sine 780->260 Hz in 40 ms + BP noise snap 2.5 kHz', render(r) { const x = buf(.22); tone(x, 0, .2, glide(780, 260, .04), [[1, 1], [2, .25, .02]], ad(.001, .05), { gain: .8 }); noise(x, 0, .03, r, () => ({ cut: 2500, q: 1.2, mode: 'bp' }), ad(.0005, .008), .7); return room(x, .12, .5) } },
  KillPopB: { seed: 204, params: 'kill pop: sine 660->220 Hz in 45 ms + BP noise snap 3.2 kHz', render(r) { const x = buf(.22); tone(x, 0, .2, glide(660, 220, .045), [[1, 1], [2, .25, .02]], ad(.001, .055), { gain: .8 }); noise(x, 0, .03, r, () => ({ cut: 3200, q: 1.2, mode: 'bp' }), ad(.0005, .008), .7); return room(x, .12, .5) } },
  KillPopC: { seed: 206, params: 'kill pop: sine 920->300 Hz in 35 ms + BP noise snap 2 kHz', render(r) { const x = buf(.22); tone(x, 0, .2, glide(920, 300, .035), [[1, 1], [2, .25, .02]], ad(.001, .045), { gain: .8 }); noise(x, 0, .03, r, () => ({ cut: 2000, q: 1.2, mode: 'bp' }), ad(.0005, .008), .7); return room(x, .12, .5) } },
  EliteBurst: { maxLen: 0.55, seed: 205, params: 'elite kill: sub 90->40 Hz + rising sparkle (A6 E7 A7) + HP noise burst', render(r) { const x = buf(.7); thump(x, 0, 90, 40, .1, .12, .8, .5); [note(24), note(31), note(36)].forEach((f, i) => tone(x, .02 + i * .03, .45, f, [[1, 1], [2.01, .2, .05]], ad(.002, .14), { gain: .22 })); noise(x, 0, .25, r, () => ({ cut: 5000, q: .7, mode: 'hp' }), ad(.001, .05), .4); return room(x, .3, .8, .25) } },

  // ----- signature beats -----
  SuperForge: { maxLen: 1.15, seed: 301, params: 'super: 250 ms riser (BP noise 400->6000 Hz + A3 swell) then impact (sub 70->32 Hz, A5/E6/A6 shimmer, wide room)', render(r) { const x = buf(1.4); noise(x, 0, .26, r, t => ({ cut: 400 * Math.pow(15, t / .25), q: 1.8, mode: 'bp' }), t => Math.pow(Math.min(1, t / .25), 2), .9, 'pink'); tone(x, 0, .26, glide(220, 440, .25), [[1, 1], [2, .3], [3, .1]], t => Math.pow(Math.min(1, t / .25), 2), { gain: .3 }); thump(x, .25, 70, 32, .14, .2, 1.2, .9); [note(12), note(19), note(24), note(31)].forEach((f, i) => tone(x, .25 + i * .012, 1.1, f, [[1, 1], [2.003, .25, .2]], ad(.003, .35), { detune: (i % 2 ? 1 : -1) * .002, gain: .22 })); noise(x, .25, .4, r, () => ({ cut: 6000, q: .7, mode: 'hp' }), ad(.001, .08), .5); return room(x, .4, 1, .3) }, drive: .4 },
  PhaseBreak: { maxLen: 0.85, seed: 302, params: 'phase break: shatter (40 BP grains 2-7 kHz) + sub 75->34 Hz + reverse swell 120 ms', render(r) { const x = buf(1.0); noise(x, 0, .12, r, t => ({ cut: 900 * Math.pow(6, t / .12), q: 1.2, mode: 'bp' }), t => Math.pow(t / .12, 2), .6, 'pink'); thump(x, .12, 75, 34, .12, .16, 1.1, .7); for (let i = 0; i < 40; i++) { const c = 2000 + r() * 5000, tau = .01 + r() * .015; noise(x, .12 + Math.pow(r(), 2) * .45, .03, r, () => ({ cut: c, q: 6, mode: 'bp' }), ad(.0005, tau), .5 * (1 - i / 50)) }; return room(x, .35, 1, .4) }, drive: .4 },
  BossFall: { seed: 303, params: 'boss death: long sub drop 60->25 Hz + pink rumble LP 600->80 Hz 1.1 s + bright release chord', render(r) { const x = buf(1.3); thump(x, 0, 60, 25, .4, .38, 1.2, 1.25); noise(x, 0, 1.25, r, t => ({ cut: 600 * Math.pow(80 / 600, Math.min(1, t / 1.1)), q: .8 }), ad(.01, .38), 1, 'pink'); [note(-12), note(-5), note(0), note(7)].forEach((f, i) => tone(x, .12 + i * .04, 1.05, f, [[1, 1], [2, .3, .3], [3, .12, .2]], swell(.18, .75, 1.05), { gain: .14 })); return room(x, .45, 1, .45) }, drive: .5 },

  // ----- threat, warnings and states (boss windup risers are rendered at runtime by CarrotAudio to the exact windup) -----
  AlarmDeadline75: { seed: 403, params: 'guardian deadline 75%: two-tone alarm E5/C5 x2 (square-ish, 3 partials)', render() { const x = buf(.62); [[0, note(7)], [.15, note(3)], [.3, note(7)], [.45, note(3)]].forEach(([at, f]) => tone(x, at, .14, f, [[1, 1], [3, .3], [5, .12]], ad(.004, .05, .05), { gain: .35 })); return room(x, .15, .5) } },
  AlarmDeadline90: { maxLen: 0.72, seed: 404, params: 'guardian deadline 90%: rapid triple A5 alarm + low pulse', render() { const x = buf(.9); for (let i = 0; i < 6; i++) tone(x, i * .1, .08, note(12 + (i % 2 ? -1 : 0)), [[1, 1], [3, .35], [5, .15]], ad(.003, .03, .03), { gain: .32 }); tone(x, 0, .85, note(-24), [[1, 1], [2, .4]], t => (.5 + .5 * Math.sin(TAU * 10 * t)) * swell(.02, .3, .85)(t), { gain: .4 }); return room(x, .15, .5) } },
  Heartbeat: { maxLen: 0.36, seed: 406, params: 'heartbeat lub-dub: sine 58+40 Hz 70 ms, dub at 180 ms (64 Hz), LP', render() { const x = buf(.45); thump(x, 0, 70, 52, .03, .06, 1, .3); tone(x, 0, .2, 40, [[1, 1]], ad(.005, .05), { gain: .4 }); thump(x, .18, 80, 60, .03, .05, .75, .25); return x }, drive: .3 },
  HealChime: { maxLen: 0.5, seed: 407, params: 'shaman heal: soft major arpeggio C6 E6 G6 (sines) + room', render() { const x = buf(.65); [note(3 + 12), note(7 + 12), note(10 + 12)].forEach((f, i) => tone(x, i * .05, .5, f, [[1, 1], [2, .1]], ad(.006, .15), { gain: .28 })); return room(x, .4, .7, .25) } },
  CoinTick: { seed: 408, params: 'coin ting: sines 2637 + 3951 Hz, 1 ms attack, 25 ms decay', render() { const x = buf(.11); tone(x, 0, .1, 2637, [[1, 1], [1.4983, .6], [2.76, .15]], ad(.001, .025), { gain: .5 }); return x } },
  CoinTickB: { seed: 416, params: 'coin ting: sines 3136 + 4699 Hz, 1 ms attack, 22 ms decay', render() { const x = buf(.11); tone(x, 0, .1, 3136, [[1, 1], [1.4983, .6], [2.76, .15]], ad(.001, .022), { gain: .5 }); return x } },
  TornadoWind: { seed: 409, params: 'tornado: pink noise BP with 3 slow sweeps 250-1400 Hz Q3 + low LP rumble', render(r) { const L = 1.3, x = buf(L); noise(x, 0, L, r, t => ({ cut: 250 + 1150 * (.5 + .5 * Math.sin(TAU * t / .62 + 1)), q: 3, mode: 'bp' }), swell(.25, .5, L), 1, 'pink'); noise(x, 0, L, r, () => ({ cut: 160, q: .8 }), swell(.2, .5, L), .6, 'pink'); return x } },
  ZombieGroan: { seed: 410, params: 'zombie: granular groan, buzz 82 Hz with jitter through formants 450/1050 Hz', render(r) { const L = 1.1, x = buf(L), n = x.length, f1 = svf(), f2 = svf(); let ph = 0; for (let i = 0; i < n; i++) { const t = i / SR; ph += TAU * 82 * (1 + .06 * Math.sin(TAU * 3.1 * t) + (r() - .5) * .04) / SR; const src = (ph / TAU % 1) * 2 - 1, grain = .55 + .45 * Math.sin(TAU * 9 * t + Math.sin(TAU * 1.3 * t) * 3); x[i] = (f1(src, 450, 6).bp + .6 * f2(src, 1050, 8).bp) * grain * swell(.15, .6, L)(t) } return room(x, .25, .8) }, drive: .3 },
  EyeballShriek: { seed: 411, params: 'eyeball: formant shriek, saw 520->760 Hz through "ee" formants 2.3k/3.1k', render(r) { const L = .8, x = buf(L), n = x.length, f1 = svf(), f2 = svf(); let ph = 0; for (let i = 0; i < n; i++) { const t = i / SR, fr = 520 * Math.pow(760 / 520, Math.min(1, t / .5)) * (1 + .01 * Math.sin(TAU * 7 * t)); ph += fr / SR; const src = (ph % 1) * 2 - 1; x[i] = (f1(src, 2300, 9).bp + .7 * f2(src, 3100, 10).bp) * swell(.06, .45, L)(t) } noise(x, 0, L, r, () => ({ cut: 3000, q: 2, mode: 'bp' }), swell(.05, .4, L), .15); return room(x, .3, .8) } },
  HoldDown: { maxLen: 0.38, seed: 412, params: 'speed hold on: tape-stop, saw-ish A4 falling 1 octave in 300 ms through LP 2.5k->400 Hz', render() { const x = buf(.45), n = x.length, f = svf(); let ph = 0; for (let i = 0; i < n; i++) { const t = i / SR; ph += TAU * note(0) * Math.pow(.5, Math.min(1, t / .3)) / SR; const s = Math.sin(ph) + .3 * Math.sin(2 * ph) + .15 * Math.sin(3 * ph); x[i] = f(s, 2500 * Math.pow(.16, Math.min(1, t / .3)), .9).lp * ad(.005, .15)(t) } return x } },
  HoldUp: { seed: 413, params: 'speed hold off: tape-start, A3 rising 1 octave in 250 ms through LP 400->2.5k Hz', render() { const x = buf(.38), n = x.length, f = svf(); let ph = 0; for (let i = 0; i < n; i++) { const t = i / SR; ph += TAU * note(-12) * Math.pow(2, Math.min(1, t / .25)) / SR; const s = Math.sin(ph) + .3 * Math.sin(2 * ph) + .15 * Math.sin(3 * ph); x[i] = f(s, 400 * Math.pow(6.25, Math.min(1, t / .25)), .9).lp * swell(.03, .12, .38)(t) } return x } },
  IncomingAir: { seed: 414, params: 'air warning: wing flutter, BP noise 1.6 kHz amplitude-modulated at 24 Hz, rising', render(r) { const x = buf(.38); noise(x, 0, .36, r, t => ({ cut: 1300 + 900 * t / .36, q: 2.5, mode: 'bp' }), t => swell(.05, .15, .36)(t) * (.5 + .5 * Math.sin(TAU * 24 * t)), 1, 'pink'); return room(x, .2, .5) } },
  IncomingGround: { maxLen: 0.34, seed: 415, params: 'ground warning: low double tom 90->60 Hz with noise head', render(r) { const x = buf(.42); for (const at of [0, .16]) { thump(x, at, 95, 62, .05, .09, 1, .25); noise(x, at, .06, r, () => ({ cut: 900, q: 1.1, mode: 'bp' }), ad(.001, .015), .4, 'pink') } return room(x, .25, .7) } },
}

// Second takes of the busiest plant bodies: another seed (new noise, new pings) and a varispeed retune, so two shots in
// a row of the same plant are never the same buffer (CarrotSfxBank deals Sig<Family> and Sig<Family>B round-robin).
function varispeed(x, k) { const n = Math.floor(x.length / k), y = new Float64Array(n); for (let i = 0; i < n; i++) { const p = i * k, a = Math.floor(p), f = p - a; y[i] = (x[a] || 0) * (1 - f) + (x[a + 1] || 0) * f } return y }
const TAKES = { SigSeed: [2, .22], SigFrost: [1.5, .36], SigPrism: [2, .34], SigStorm: [1.5, .3], SigStarfruit: [3, .3], SigBamboo: [2, .12], SigCactus: [2, .17], SigMagnet: [1, .28], SigMushroom: [2, .26] }
for (const [base, [st, cap]] of Object.entries(TAKES)) {
  const spec = SOUNDS[base]
  SOUNDS[base + 'B'] = { seed: spec.seed + 1000, maxLen: cap, drive: spec.drive, fadeOut: spec.fadeOut, params: `${spec.params}; second take: seed ${spec.seed + 1000}, varispeed +${st} st`, render: r => varispeed(spec.render(r), Math.pow(2, st / 12)) }
}

// ---------- output ----------
function wav(samples, seed) {
  const r = rng(seed ^ 0x5eed), n = samples.length, b = Buffer.alloc(44 + n * 2)
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22)
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) { const d = (r() - r()) / 32768; b.writeInt16LE(Math.round(clamp(samples[i] + d, -1, 32767 / 32768) * 32767), 44 + i * 2) }
  return b
}
const guid = rel => createHash('md5').update('carrot-audio:' + rel).digest('hex')
function meta(rel, quality = .5) {
  return `fileFormatVersion: 2\nguid: ${guid(rel)}\nAudioImporter:\n  externalObjects: {}\n  serializedVersion: 8\n  defaultSettings:\n    serializedVersion: 2\n    loadType: 0\n    sampleRateSetting: 0\n    sampleRateOverride: 24000\n    compressionFormat: 1\n    quality: ${quality}\n    conversionMode: 0\n    preloadAudioData: 1\n  platformSettingOverrides: {}\n  forceToMono: 1\n  normalize: 0\n  loadInBackground: 0\n  ambisonic: 0\n  3D: 1\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n`
}
function folderMeta(rel) { return `fileFormatVersion: 2\nguid: ${guid(rel)}\nfolderAsset: yes\nDefaultImporter:\n  externalObjects: {}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n` }

mkdirSync(OUT, { recursive: true })
const provenancePath = join(ROOT, 'Assets/Resources/Carrot/Audio/Licenses/synth-provenance.json')
const rows = [], drift = []
let total = 0
for (const [name, spec] of Object.entries(SOUNDS)) {
  if (only && name !== only) continue
  let raw = spec.render(rng(spec.seed))
  // maxLen: a hard length cap with a 40 ms cosine fade (keeps the 1.2 MB raw budget; tails past it sit under the mix).
  if (spec.maxLen && raw.length > spec.maxLen * SR) { const n = Math.round(spec.maxLen * SR), f = Math.round(.04 * SR); raw = raw.slice(0, n); for (let i = 0; i < f; i++) raw[n - 1 - i] *= .5 - .5 * Math.cos(Math.PI * i / f) }
  const y = trim(finish(raw, { fadeOut: spec.fadeOut ?? .012, drive: spec.drive ?? 0 }))
  const bytes = wav(y, spec.seed), sha = createHash('sha256').update(bytes).digest('hex'), file = join(OUT, name + '.wav')
  let peak = 0, sq = 0; for (const v of y) { peak = Math.max(peak, Math.abs(v)); sq += v * v }
  total += bytes.length
  rows.push({ resource: 'Carrot/Audio/Synth/' + name, file: 'Synth/' + name + '.wav', generator: VERSION, seed: spec.seed, parameters: spec.params, sampleRate: SR, seconds: Math.round(y.length / SR * 1000) / 1000, peakDbfs: Math.round(200 * Math.log10(peak)) / 10, rmsDbfs: Math.round(100 * Math.log10(sq / y.length)) / 10, bytes: bytes.length, sha256: sha, license: 'Self-made (procedural), CC0 dedication by the project' })
  if (check) { if (!existsSync(file) || createHash('sha256').update(readFileSync(file)).digest('hex') !== sha) drift.push(name) }
  else {
    writeFileSync(file, bytes)
    const rel = 'Assets/Resources/Carrot/Audio/Synth/' + name + '.wav'
    if (!existsSync(file + '.meta')) writeFileSync(file + '.meta', meta(rel))
  }
}
if (!check && !only) {
  if (!existsSync(OUT + '.meta')) writeFileSync(OUT + '.meta', folderMeta('Assets/Resources/Carrot/Audio/Synth'))
  writeFileSync(provenancePath, JSON.stringify({ generator: VERSION, sampleRate: SR, format: 'PCM 16-bit mono WAV, TPDF dither, peak -1 dBFS, 25 Hz one-pole high-pass', license: 'Self-made procedural audio (no samples, no third-party code); dedicated CC0 by the project', totalBytes: total, files: rows }, null, 1) + '\n')
  if (!existsSync(provenancePath + '.meta')) writeFileSync(provenancePath + '.meta', `fileFormatVersion: 2\nguid: ${guid('synth-provenance.json')}\nTextScriptImporter:\n  externalObjects: {}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n`)
}
for (const row of rows) console.log(`${row.resource.padEnd(36)} ${row.seconds.toFixed(3)} s  peak ${row.peakDbfs} dBFS  rms ${row.rmsDbfs} dBFS  ${row.bytes} B`)
console.log(`${rows.length} layers, ${(total / 1024).toFixed(0)} KiB raw PCM (budget 1.2 MB)`)
if (total > 1.2e6) { console.error('SYNTH_OVER_BUDGET'); process.exit(1) }
if (check) { if (drift.length) { console.error('SYNTH_DRIFT ' + drift.join(', ')); process.exit(1) } console.log('SYNTH_CHECK_OK') }
else console.log('SYNTH_OK')

// ---------- recorded CC0 variants (round-robin banks for CarrotSfxBank) ----------
// Copies round-robin variants of recorded CC0 Kenney sounds into Assets/Resources/Carrot/Audio/Variants/<Bank>/ from the
// preproduction archive already on this machine (no downloads; override with CARROT_KENNEY_SOURCE): each .ogg unchanged,
// a Unity .meta (stable GUID, Vorbis, decompress on load, mono) and Licenses/kenney-variants-provenance.json
// (source pack, file, sha256, CC0). The bank table must match CarrotSfxBank.Banks (CarrotMusicTests loads every clip).
if (only) process.exit(0)
const SOURCE = process.env.CARROT_KENNEY_SOURCE || '/Users/eric/Claude/carrot-defense-preproduction/source-assets'
const VOUT = join(ROOT, 'Assets/Resources/Carrot/Audio/Variants')
const IMPACT = 'kenney-impact-sounds/Audio', RPG = 'kenney-rpg-audio/Audio'
const range = (stem, from, to) => Array.from({ length: to - from + 1 }, (_, i) => `${stem}_${String(from + i).padStart(3, '0')}.ogg`)
// Bank -> [pack folder, files]. The existing single clips (ImpactMetal = impactMetal_medium_000 and so on) stay
// where they are and join their bank at runtime, so they are not duplicated here.
const BANKS = {
  Metal: [IMPACT, range('impactMetal_medium', 1, 4)],
  Glass: [IMPACT, range('impactGlass_medium', 1, 4)],
  GlassLight: [IMPACT, range('impactGlass_light', 0, 4)],
  Wood: [IMPACT, range('impactWood_medium', 1, 4)],
  Plate: [IMPACT, range('impactPlate_light', 0, 4)],
  Mining: [IMPACT, range('impactMining', 0, 4)],
  Punch: [IMPACT, range('impactPunch_medium', 0, 4)],
  Bell: [IMPACT, range('impactBell_heavy', 0, 1)],
  Soft: [IMPACT, range('impactSoft_medium', 0, 4)],
  SoftHeavy: [IMPACT, range('impactSoft_heavy', 1, 4)],
  Grass: [IMPACT, range('footstep_grass', 1, 4)],
  Snow: [IMPACT, range('footstep_snow', 1, 4)],
  Slice: [RPG, ['knifeSlice2.ogg', 'drawKnife1.ogg', 'drawKnife2.ogg', 'drawKnife3.ogg']],
  Coin: [RPG, ['handleCoins2.ogg']],
}
const variantMeta = rel => `fileFormatVersion: 2\nguid: ${guid(rel)}\nAudioImporter:\n  externalObjects: {}\n  serializedVersion: 8\n  defaultSettings:\n    serializedVersion: 2\n    loadType: 0\n    sampleRateSetting: 1\n    sampleRateOverride: 44100\n    compressionFormat: 1\n    quality: 0.5\n    conversionMode: 0\n    preloadAudioData: 1\n  platformSettingOverrides: {}\n  forceToMono: 1\n  normalize: 1\n  loadInBackground: 0\n  ambisonic: 0\n  3D: 1\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n`
const vrows = [], problems = []; let vbytes = 0
if (!check) { mkdirSync(VOUT, { recursive: true }); if (!existsSync(VOUT + '.meta')) writeFileSync(VOUT + '.meta', folderMeta('Assets/Resources/Carrot/Audio/Variants')) }
for (const [bank, [pack, files]] of Object.entries(BANKS)) {
  const dir = join(VOUT, bank), relDir = 'Assets/Resources/Carrot/Audio/Variants/' + bank
  if (!check) { mkdirSync(dir, { recursive: true }); if (!existsSync(dir + '.meta')) writeFileSync(dir + '.meta', folderMeta(relDir)) }
  files.forEach((file, i) => {
    const src = join(SOURCE, pack, file), name = `${bank}${i + 1}.ogg`, dest = join(dir, name)
    if (!existsSync(src)) { problems.push('missing source ' + src); return }
    const sha = createHash('sha256').update(readFileSync(src)).digest('hex')
    if (check) { if (!existsSync(dest) || createHash('sha256').update(readFileSync(dest)).digest('hex') !== sha) problems.push('drift ' + name) }
    else { copyFileSync(src, dest); if (!existsSync(dest + '.meta')) writeFileSync(dest + '.meta', variantMeta(relDir + '/' + name)) }
    vbytes += statSync(src).size
    vrows.push({ resource: `Carrot/Audio/Variants/${bank}/${bank}${i + 1}`, source: `${pack.split('/')[0]}/${pack.split('/').slice(1).join('/')}/${file}`, pack: pack.startsWith('kenney-impact') ? 'Kenney Impact Sounds 1.0 (https://kenney.nl/assets/impact-sounds)' : 'Kenney RPG Audio (https://kenney.nl/assets/rpg-audio)', license: 'CC0-1.0', sha256: sha, bytes: statSync(src).size, processing: 'none (byte copy; Unity downmixes to mono and re-encodes at import)' })
  })
}
if (problems.length) { console.error(problems.join('\n')); process.exit(1) }
if (!check) {
  const vp = join(ROOT, 'Assets/Resources/Carrot/Audio/Licenses/kenney-variants-provenance.json')
  writeFileSync(vp, JSON.stringify({ note: 'Round-robin variants for CarrotSfxBank; packs are the same CC0 archives recorded in kenney-impact-sounds-provenance.json and kenney-rpg-audio-provenance.json.', totalBytes: vbytes, files: vrows }, null, 1) + '\n')
  if (!existsSync(vp + '.meta')) writeFileSync(vp + '.meta', `fileFormatVersion: 2\nguid: ${guid('kenney-variants-provenance.json')}\nTextScriptImporter:\n  externalObjects: {}\n  userData: \n  assetBundleName: \n  assetBundleVariant: \n`)
}
console.log(`${vrows.length} variants in ${Object.keys(BANKS).length} banks, ${(vbytes / 1024).toFixed(0)} KiB source Ogg (budget 0.5 MB)`)
if (vbytes > 512 * 1024) { console.error('VARIANTS_OVER_BUDGET'); process.exit(1) }
console.log(check ? 'VARIANTS_CHECK_OK' : 'VARIANTS_OK')
