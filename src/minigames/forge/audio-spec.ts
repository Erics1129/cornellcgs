/**
 * Pure audio layer specs for the workshop (no Web Audio here; importable from Node).
 * audio.ts turns Voice records into nodes; scripts/test-forge-audio.mjs checks the rules:
 * no frequency automation on ring or blade partials, ring brightness falling with heat, blade pitch
 * capped at +7 semitones, bounded per-strike variation, and the 48-voice budget.
 */
import type { Metal, Outcome } from './config.ts'

export type Bus = 'strike' | 'foley' | 'amb'
/**
 * One sound source. noise: a slice of the shared white (or pink) noise buffer through a filter.
 * osc: a sine, triangle or 'rich' oscillator (harmonics = amplitudes of partials 1..n, so low layers
 * carry energy above 300 Hz for phone and laptop speakers). buffer: a generated texture by name.
 * Envelope: linear attack to `gain`, then exponential decay with `t60` (to -60 dB), stopped at `dur`.
 */
export type Voice = {
  tag: string; src: 'noise' | 'pink' | 'osc' | 'buffer'
  wave?: 'sine' | 'triangle' | 'rich'; harmonics?: number[]
  freq: number
  /** Oscillator glide (thump and boom only). Ring and blade partials never glide. */
  freqEnd?: number
  filter?: 'bandpass' | 'highpass' | 'lowpass'; q?: number
  /** Noise filter sweep (whoosh). */
  filterEnd?: number
  gain: number; at: number; attack: number; dur: number; t60?: number
  pan?: number; wet: number; bus: Bus; buffer?: string; priority?: number
}

/** Every audio number. feel-tuning.json "web.audio" may override the scalar ones. */
export const AUDIO = {
  /**
   * One compressor (its fixed 6 ms look-ahead is the chain's only latency), a makeup gain that puts a hot
   * Good strike about 3 dB above the old mix, then the volume and a zero-latency soft clipper: linear to
   * clipKneeDb, never above ceilingDb (-1 dBFS) at any volume.
   */
  master: { volume: .4, threshold: -18, knee: 12, ratio: 3, attack: .003, release: .12, makeupDb: 10, clipKneeDb: -6, ceilingDb: -1.2, lookaheadMs: 6, voices: 48, latencyHint: 'interactive' as const },
  reverb: { seconds: .9, rt60: .7, lowpass: 4000, early: [.011, .017, .023, .031], strikeWet: .16, ambWet: .22, foleyWet: .12 },
  transient: { freq: 4200, q: .9, dur: .008, gain: .30, cents: 100 },
  body: { freq: 380, q: 1.1, dur: .06, gain: .22 },
  thump: { from: 92, to: 78, dur: .16, gain: .26, harmonics: [1, .5, .4, .34, .28, .2, .14] },
  ring: { partials: [1180, 3253, 6377, 10541], t60: [1.4, .7, .35, .18], gains: [.07, .035, .02, .01], coldC: 600, hotC: 900, scale: .55, heatDamp: .5, detuneCents: 10 },
  ringBonus: { perfect: .5, good: .25, chip: .1, dull: 0, shatter: 0 } as Record<Outcome, number>,
  blade: { t60: .55, gain: .055, overtone: 2.76, overtoneGain: .35, maxSemitones: 7, hotDamp: .4, hotFrom: 650, hotTo: 850 },
  metals: { iron: { hz: 620, decay: 1 }, bronze: { hz: 520, decay: 1.6 }, steel: { hz: 760, decay: 1 }, silver: { hz: 880, decay: 2 }, damascus: { hz: 700, decay: 1 }, obsidian: { hz: 1400, decay: .5 }, meteor: { hz: 660, decay: 1.1 }, auricite: { hz: 990, decay: 1.2 } } as Record<Metal, { hz: number; decay: number }>,
  shimmer: { ratio: 2, gain: .04, t60: .9 },
  evolution: { notes: [1, 1.26, 1.5], step: .09, gain: .045, t60: .8 },
  chip: { crackHz: 3500, crackDur: .025, crackGain: .25, tickHz: 5200, tickGain: .07, tickT60: .06, tickFallback: .42 },
  dull: { lowpass: 1200, thudHz: 120, thudGain: .24, thudDur: .13 },
  shatter: { crackHz: 2600, crackGain: .3, crackDur: .05, boomHz: 55, boomEnd: 46, boomDur: .18, boomGain: .34, boomHarmonics: [1, .6, .5, .42, .36, .3, .26, .22, .18], duckDb: 5, duckS: .3, tinkles: 8, tinkleSpan: 1.1 },
  flow: { maxSteps: 7, whoompHz: 200, whoompGain: .11, whoompDur: .12 },
  vary: { gainDb: 1.5 },
  preschedule: { latencyMs: 30 },
  fire: { crackleGain: .04, crackleRateMin: 2, crackleRateMax: 8, hissGain: .012, lapGain: .05, pan: -.45, heatBoostDb: 4 },
  room: { gain: .012, lowpass: 170 },
  tension: { droneHz: [55, 82.4], droneGain: .025, harmonics: [1, .6, .5, .42, .36, .3, .26, .22, .18], heartGain: .06, bpmFrom: 55, bpmTo: 85, clickHz: 2000, creakMin: .5, creakMax: 4 },
  /** Looping bed sources that are always running (hiss, lapping, room tone, two drone oscillators): they count against master.voices. */
  beds: { voices: 5 },
}
export type AudioTuning = typeof AUDIO
export type Rand = () => number

/**
 * feel-tuning.json "web.audio" overrides: nested sections of AUDIO, finite numbers only (same sign as
 * the default, at most 10x its magnitude), arrays only with the default's length. Unknown keys are ignored.
 */
export function audioTuning(overrides: unknown): AudioTuning {
  const out = structuredClone(AUDIO) as unknown as Record<string, Record<string, unknown>>
  if (!overrides || typeof overrides !== 'object') return out as unknown as AudioTuning
  // Same sign as the default, at most 10x its magnitude (20 kHz at most), so a typo cannot blow the speakers.
  const fit = (base: number, v: unknown) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return base
    const mag = Math.max(1, Math.min(20000, Math.abs(base) * 10))
    return base < 0 ? Math.max(-mag, Math.min(0, v)) : Math.max(0, Math.min(mag, v))
  }
  for (const [section, values] of Object.entries(overrides as Record<string, unknown>)) {
    const target = out[section]; if (!target || !values || typeof values !== 'object') continue
    for (const [key, v] of Object.entries(values as Record<string, unknown>)) {
      const base = target[key]
      if (typeof base === 'number') target[key] = fit(base, v)
      else if (Array.isArray(base) && Array.isArray(v) && v.length === base.length) target[key] = base.map((b, i) => typeof b === 'number' ? fit(b, v[i]) : b)
    }
  }
  const m = out.master as AudioTuning['master']
  m.voices = Math.max(16, Math.min(48, Math.round(m.voices))); m.volume = Math.max(0, Math.min(1, m.volume)); m.ceilingDb = Math.max(-12, Math.min(-1, m.ceilingDb)); m.clipKneeDb = Math.min(m.ceilingDb - 1, m.clipKneeDb); m.makeupDb = Math.min(18, m.makeupDb)
  const f = out.flow as AudioTuning['flow'], b = out.blade as AudioTuning['blade']
  f.maxSteps = Math.max(0, Math.min(7, Math.round(f.maxSteps))); b.maxSemitones = Math.max(0, Math.min(7, b.maxSemitones))
  const r = out.ring as AudioTuning['ring']; r.detuneCents = Math.max(0, Math.min(10, r.detuneCents)); (out.vary as AudioTuning['vary']).gainDb = Math.max(0, Math.min(1.5, (out.vary as AudioTuning['vary']).gainDb))
  return out as unknown as AudioTuning
}

/**
 * The output soft clipper as a WaveShaper curve over inputs [-2, 2] (fed at half gain): unity below the
 * knee, a tanh shoulder above it, and never beyond the ceiling, so stacked layers cannot clip the DAC.
 */
export function softClipCurve(n = 2048, kneeDb = AUDIO.master.clipKneeDb, ceilingDb = AUDIO.master.ceilingDb) {
  const k = db(kneeDb), c = db(ceilingDb), out = new Float32Array(n)
  for (let i = 0; i < n; i++) { const x = (i / (n - 1) * 2 - 1) * 2, a = Math.abs(x); out[i] = Math.sign(x) * (a <= k ? a : k + (c - k) * Math.tanh((a - k) / (c - k))) }
  return out
}
/** Deterministic PRNG (mulberry32) for tests and offline renders. */
export function seeded(seed = 1): Rand { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const cents = (c: number) => Math.pow(2, c / 1200)
const db = (d: number) => Math.pow(10, d / 20)

/**
 * Anvil ring brightness by temperature: hot steel absorbs the blow (a dull thwack), cooling steel rings.
 * clamp01((900 - T)/300) x .55 plus the outcome bonus; the bonus is damped a little by heat too, so the
 * curve keeps falling across the whole working range (600-1250 C).
 */
export function ringGain(tempC: number, outcome: Outcome, a: AudioTuning = AUDIO) {
  const r = a.ring
  const cold = clamp01((r.hotC - tempC) / (r.hotC - r.coldC))
  const heat = clamp01((tempC - r.coldC) / 650)
  return cold * r.scale + a.ringBonus[outcome] * (1 - r.heatDamp * heat)
}
/** Blade partial frequency: one semitone per level, capped at +7, then the metal's base pitch. */
export function bladeHz(metal: Metal, level: number, a: AudioTuning = AUDIO) {
  return a.metals[metal].hz * Math.pow(2, Math.min(a.blade.maxSemitones, Math.max(0, level)) / 12)
}
/** Blade partial gain factor: damped to .4x while hot. */
export function bladeDamp(tempC: number, a: AudioTuning = AUDIO) {
  const b = a.blade; return 1 - (1 - b.hotDamp) * clamp01((tempC - b.hotFrom) / (b.hotTo - b.hotFrom))
}

export type StrikeContext = {
  outcome: Outcome; metal: Metal; level: number; tempC: number
  /** Strikes so far in this Flow window (0 = not in Flow). */
  flowStep?: number; evolution?: boolean
  /** The outcome-neutral transient and body were already scheduled from 'swing'. */
  skipNeutral?: boolean
  rand?: Rand
}
export type StrikeSpec = { voices: Voice[]; detuneCents: number; gainDb: number; duckDb: number; duckS: number }

/** The outcome-neutral contact layers (transient, body, thump), also used for pre-scheduling. */
export function neutralVoices(rand: Rand, at = 0, a: AudioTuning = AUDIO, gainScale = 1, transientCents = (rand() * 2 - 1) * a.transient.cents): Voice[] {
  const t = a.transient, b = a.body, h = a.thump
  return [
    { tag: 'transient', src: 'noise', filter: 'bandpass', freq: t.freq * cents(transientCents), q: t.q, gain: t.gain * gainScale, at, attack: .0005, dur: t.dur, t60: t.dur, wet: a.reverb.strikeWet, bus: 'strike', priority: 3 },
    { tag: 'body', src: 'noise', filter: 'bandpass', freq: b.freq, q: b.q, gain: b.gain * gainScale, at, attack: .001, dur: b.dur, t60: b.dur, wet: a.reverb.strikeWet, bus: 'strike', priority: 3 },
    { tag: 'thump', src: 'osc', wave: 'rich', harmonics: h.harmonics, freq: h.from, freqEnd: h.to, gain: h.gain * gainScale, at, attack: .002, dur: h.dur, t60: h.dur, wet: a.reverb.strikeWet * .5, bus: 'strike', priority: 3 },
  ]
}

/** Every layer of one strike, by outcome. The ring and blade partials have no frequency automation. */
export function strikeSpec(c: StrikeContext, a: AudioTuning = AUDIO): StrikeSpec {
  const rand = c.rand || Math.random
  const detune = (rand() * 2 - 1) * a.ring.detuneCents
  const gainDb = (rand() * 2 - 1) * a.vary.gainDb
  const g = db(gainDb), dt = cents(detune), wet = a.reverb.strikeWet
  const out: Voice[] = []
  const flowStep = Math.max(0, Math.min(a.flow.maxSteps, c.flowStep || 0))
  const transientCents = (rand() * 2 - 1) * a.transient.cents
  if (c.outcome === 'dull') {
    // Dull: low-passed knock, no ring, a 120 Hz thud (with harmonics for small speakers). When the
    // neutral contact layers were pre-scheduled from 'swing', only the thud is added.
    if (!c.skipNeutral) {
      out.push({ tag: 'transient', src: 'noise', filter: 'lowpass', freq: a.dull.lowpass, q: .7, gain: a.transient.gain * .7 * g, at: 0, attack: .0005, dur: .02, t60: .02, wet, bus: 'strike', priority: 3 })
      out.push({ tag: 'body', src: 'noise', filter: 'bandpass', freq: a.body.freq, q: a.body.q, gain: a.body.gain * g, at: 0, attack: .001, dur: a.body.dur, t60: a.body.dur, wet, bus: 'strike', priority: 3 })
    }
    out.push({ tag: 'thud', src: 'osc', wave: 'rich', harmonics: a.thump.harmonics, freq: a.dull.thudHz, freqEnd: a.dull.thudHz * .9, gain: a.dull.thudGain * g, at: 0, attack: .002, dur: a.dull.thudDur, t60: a.dull.thudDur, wet: wet * .5, bus: 'strike', priority: 3 })
    return { voices: out, detuneCents: detune, gainDb, duckDb: 0, duckS: 0 }
  }
  if (!c.skipNeutral) out.push(...neutralVoices(rand, 0, a, g, transientCents))
  // Anvil ring: free-bar partials, brighter as the steel cools; Flow raises it a semitone per strike.
  const rg = ringGain(c.tempC, c.outcome, a), flowRatio = Math.pow(2, flowStep / 12)
  a.ring.partials.forEach((hz, i) => out.push({ tag: 'ring', src: 'osc', wave: 'sine', freq: hz * dt * flowRatio, gain: a.ring.gains[i] * rg * g, at: 0, attack: .001, dur: a.ring.t60[i], t60: a.ring.t60[i], wet, bus: 'strike', priority: i ? 1 : 2 }))
  // Blade partials by metal and level (+7 semitones at most), damped while hot.
  const metal = a.metals[c.metal] || a.metals.iron, bh = bladeHz(c.metal, c.level, a) * dt, bd = bladeDamp(c.tempC, a), bt = a.blade.t60 * metal.decay
  out.push({ tag: 'blade', src: 'osc', wave: 'sine', freq: bh, gain: a.blade.gain * bd * g, at: 0, attack: .001, dur: bt, t60: bt, wet, bus: 'strike', priority: 2 })
  out.push({ tag: 'blade', src: 'osc', wave: 'sine', freq: bh * a.blade.overtone, gain: a.blade.gain * a.blade.overtoneGain * bd * g, at: 0, attack: .001, dur: bt * .5, t60: bt * .5, wet, bus: 'strike', priority: 1 })
  if (c.outcome === 'perfect') out.push({ tag: 'shimmer', src: 'osc', wave: 'sine', freq: bh * a.shimmer.ratio, gain: a.shimmer.gain * g, at: .004, attack: .01, dur: a.shimmer.t60, t60: a.shimmer.t60, wet: wet * 1.4, bus: 'strike', priority: 1 })
  if (c.evolution) a.evolution.notes.forEach((r, i) => out.push({ tag: 'arpeggio', src: 'osc', wave: 'sine', freq: bh * r * 2, gain: a.evolution.gain * g, at: .06 + i * a.evolution.step, attack: .006, dur: a.evolution.t60, t60: a.evolution.t60, wet: wet * 1.6, bus: 'strike', priority: 2 }))
  if (c.outcome === 'chip') out.push({ tag: 'crack', src: 'noise', filter: 'highpass', freq: a.chip.crackHz, q: .7, gain: a.chip.crackGain * g, at: .002, attack: .0005, dur: a.chip.crackDur, t60: a.chip.crackDur, wet, bus: 'strike', priority: 3 })
  let duckDb = 0, duckS = 0
  if (c.outcome === 'shatter') {
    const s = a.shatter
    out.push({ tag: 'crack', src: 'noise', filter: 'highpass', freq: s.crackHz, q: .7, gain: s.crackGain * g, at: .003, attack: .0005, dur: s.crackDur, t60: s.crackDur, wet, bus: 'strike', priority: 3 })
    out.push({ tag: 'boom', src: 'osc', wave: 'rich', harmonics: s.boomHarmonics, freq: s.boomHz, freqEnd: s.boomEnd, gain: s.boomGain * g, at: 0, attack: .004, dur: s.boomDur, t60: s.boomDur, wet: wet * .6, bus: 'strike', priority: 3 })
    duckDb = s.duckDb; duckS = s.duckS
  }
  if (flowStep > 0) out.push({ tag: 'whoomp', src: 'osc', wave: 'rich', harmonics: a.thump.harmonics, freq: a.flow.whoompHz, freqEnd: a.flow.whoompHz * .82, gain: a.flow.whoompGain * g, at: 0, attack: .012, dur: a.flow.whoompDur, t60: a.flow.whoompDur, wet: wet * 1.2, bus: 'strike', priority: 1 })
  return { voices: out, detuneCents: detune, gainDb, duckDb, duckS }
}

/** A chip landing (5.2 kHz tick) and a shard tinkle. */
export function chipTick(at = 0, a: AudioTuning = AUDIO): Voice { return { tag: 'chip-tick', src: 'osc', wave: 'sine', freq: a.chip.tickHz, gain: a.chip.tickGain, at, attack: .0005, dur: a.chip.tickT60, t60: a.chip.tickT60, wet: a.reverb.foleyWet, bus: 'foley', priority: 1 } }
export function tinkle(rand: Rand, at = 0, impulse = 1): Voice[] {
  const f = 2000 + rand() * 4000, g = .03 * Math.max(.3, Math.min(1.5, impulse))
  return [{ tag: 'tinkle', src: 'osc', wave: 'sine', freq: f, gain: g, at, attack: .0005, dur: .25, t60: .25, wet: .2, bus: 'foley', pan: rand() * 1.2 - .6, priority: 0 }, { tag: 'tinkle', src: 'osc', wave: 'sine', freq: f * 2.41, gain: g * .45, at, attack: .0005, dur: .12, t60: .12, wet: .2, bus: 'foley', priority: 0 }]
}
/** Fallback shard tinkles when the build sends no shard-land events. */
export function shatterTinkles(rand: Rand, a: AudioTuning = AUDIO): Voice[] {
  const out: Voice[] = []
  for (let i = 0; i < a.shatter.tinkles; i++) out.push(...tinkle(rand, .22 + Math.pow(rand(), .8) * a.shatter.tinkleSpan, .5 + rand()))
  return out
}

/** Foley for Unity sfx events (names in bridge.ts SFX). x and y follow the contract. */
export function foley(name: string, x: number, y: number, rand: Rand = Math.random, a: AudioTuning = AUDIO): Voice[] {
  const w = a.reverb.foleyWet
  const n = (tag: string, freq: number, q: number, gain: number, dur: number, at = 0, filter: Voice['filter'] = 'bandpass', extra: Partial<Voice> = {}): Voice => ({ tag, src: 'noise', filter, freq, q, gain, at, attack: Math.min(.004, dur / 4), dur, t60: dur, wet: w, bus: 'foley', priority: 0, ...extra })
  const o = (tag: string, freq: number, gain: number, dur: number, at = 0, extra: Partial<Voice> = {}): Voice => ({ tag, src: 'osc', wave: 'sine', freq, gain, at, attack: .0008, dur, t60: dur, wet: w, bus: 'foley', priority: 0, ...extra })
  switch (name) {
    case 'swing': case 'grip': return [n('creak', 1100 + rand() * 200, 6, .025, .04)]
    case 'whoosh': { const speed = Number.isFinite(x) && x > 0 ? x : 8; return [n('whoosh', 600, 1.4, .05 * Math.min(1.6, speed / 8), .07, 0, 'bandpass', { filterEnd: 1800, attack: .02 })] }
    case 'step': return [n('step', 180, 1.2, .05, .07), n('heel', 2000, 3, .025, .012, .01)]
    case 'tongs': return [o('clink', 2100, .03, .09), o('clink', 5300, .015, .07), o('clink', 7900, .008, .05)]
    case 'coals-in': case 'coals-out': { const out: Voice[] = []; const count = 7 + Math.floor(rand() * 4); for (let i = 0; i < count; i++) out.push(n('crunch', 900 + rand() * 1600, 1.5, .05 * (.5 + rand() * .5), .012 + rand() * .02, i * (.02 + rand() * .018), 'bandpass', { pan: a.fire.pan })); return out }
    case 'bellows': return [n('breath', 400, .8, .05, .7, 0, 'bandpass', { attack: .25, t60: 1.2, pan: a.fire.pan }), n('roar', 450, .5, .04, .9, .15, 'bandpass', { attack: .2, t60: 1.4, pan: a.fire.pan })]
    case 'place': {
      if (x === 1) return [n('knock', 700, 2, .05, .08), o('knock', 320, .04, .1)]
      if (x === 2) return [o('ting', 2600, .035, .5), o('ting', 6100, .012, .25)]
      if (x === 3) return [o('thunk', 250, .05, .1), n('thunk', 900, 1.5, .04, .06)]
      return [o('clank', 1900, .045, .25), o('clank', 4400, .02, .15), n('clank', 1200, 2, .05, .03)]
    }
    case 'quench': { const hot = Number.isFinite(x) ? Math.max(.3, Math.min(1, (x - 100) / 800)) : 1; return [{ tag: 'quench', src: 'buffer', buffer: 'quench', freq: 0, gain: .22 * hot, at: 0, attack: .002, dur: 2.4, wet: w * 1.4, bus: 'foley', priority: 2 }] }
    case 'flake-land': return [o('flake', 5500 + rand() * 2500, .006, .02)]
    case 'chip-land': return [chipTick(0, a)]
    case 'shard-land': return tinkle(rand, 0, Number.isFinite(x) ? x : 1)
    case 'coin-land': { const r = [1, 1.12, 1.34, 1.6, 1.8, 2][Math.abs(Math.round(x || 0)) % 6]; const last = y > 0 && x + 1 >= y; return [o('coin', 1600 * r, last ? .075 : .055, .14), o('coin', 1600 * r * 2.17, .022, .07)] }
    case 'dawn': return [o('dawn', 2400, .04, .8), o('dawn', 3100, .02, .6, .05)]
    default: return []
  }
}

/** The old event chimes, kept for transitions with no Unity foley yet (sell, buy, heat, flow, refusal). */
export function uiVoices(kind: string, a: AudioTuning = AUDIO): Voice[] {
  const w = a.reverb.foleyWet
  const o = (freq: number, gain: number, dur: number, at = 0, wave: Voice['wave'] = 'sine'): Voice => ({ tag: 'ui', src: 'osc', wave, freq, gain, at, attack: .006, dur, t60: dur, wet: w, bus: 'foley', priority: 0 })
  switch (kind) {
    case 'sell': return [o(180, .07, .09, 0, 'triangle'), ...[1, 1.34, 1.12, 1.6, 1.8, 2].flatMap((f, i) => [o(1600 * f, .05, .14, .1 + i * .065), o(1600 * f * 2.17, .02, .07, .1 + i * .065)])]
    case 'buy': return [o(660, .06, .22), o(990, .05, .3, .08)]
    case 'heat': return [{ tag: 'ui', src: 'noise', filter: 'bandpass', freq: 500, q: .7, gain: .05, at: 0, attack: .08, dur: .8, t60: 1.2, wet: w, bus: 'foley', pan: a.fire.pan, priority: 0 }]
    case 'flow': return [1, 1.25, 1.5, 2].map((f, i) => o(392 * f, .045, .6, i * .07))
    case 'refuse': return [{ tag: 'refuse', src: 'noise', filter: 'bandpass', freq: 1700, q: 3, gain: .05, at: 0, attack: .0005, dur: .018, t60: .018, wet: 0, bus: 'foley', priority: 2 }]
    case 'move': case 'use': return [o(520, .03, .06)]
    default: return []
  }
}

/** Poisson crackle: the next interval (s) at `rate` per second, and one crackle voice (Farnell). */
export function crackleInterval(rand: Rand, rate: number) { return -Math.log(1 - rand() * .999) / Math.max(.1, rate) }
export function crackle(rand: Rand, a: AudioTuning = AUDIO, gainScale = 1): Voice {
  const f = 1500 * Math.pow(16000 / 1500, rand()), dur = .002 + rand() * .028
  return { tag: 'crackle', src: 'noise', filter: 'bandpass', freq: f, q: 1, gain: a.fire.crackleGain * (.4 + rand() * .6) * gainScale, at: 0, attack: .0005, dur, t60: dur, wet: a.reverb.ambWet, bus: 'amb', pan: a.fire.pan + (rand() - .5) * .2, priority: 0 }
}
/** One heartbeat (lub-dub with a click so it reads on phone speakers) at tension tau. */
export function heartbeat(tau: number, a: AudioTuning = AUDIO): Voice[] {
  const t = a.tension, g = t.heartGain * tau
  const beat = (at: number, k: number): Voice[] => [
    { tag: 'heart', src: 'osc', wave: 'rich', harmonics: t.harmonics, freq: 58, freqEnd: 50, gain: g * k, at, attack: .006, dur: .09, t60: .09, wet: .1, bus: 'amb', priority: 1 },
    { tag: 'heart-click', src: 'noise', filter: 'bandpass', freq: t.clickHz, q: 1.4, gain: g * .35 * k, at, attack: .0005, dur: .008, t60: .008, wet: .1, bus: 'amb', priority: 1 },
  ]
  return [...beat(0, 1), ...beat(.16, .7)]
}
export function heartInterval(tau: number, a: AudioTuning = AUDIO) { return 60 / (a.tension.bpmFrom + (a.tension.bpmTo - a.tension.bpmFrom) * clamp01(tau)) }
export function creak(rand: Rand, tau: number): Voice { const f = 500 + rand() * 900, d = .06 + rand() * .07; return { tag: 'creak', src: 'noise', filter: 'bandpass', freq: f, q: 9, gain: .02 * tau, at: 0, attack: .01, dur: d, t60: d * 1.5, wet: .2, bus: 'amb', pan: rand() - .5, priority: 0 } }
export function creakRate(tau: number, a: AudioTuning = AUDIO) { return a.tension.creakMin + (a.tension.creakMax - a.tension.creakMin) * clamp01(tau) }

/** When a voice is effectively silent (-40 dB) and can be stopped. */
export function voiceEnd(v: Voice) { const t60 = v.t60 ?? v.dur; return v.at + v.attack + Math.min(v.dur, t60 * 2 / 3 + .01) }

/**
 * Voice budget with stealing. admit() returns the index of a voice to steal (the lowest priority, then
 * the oldest) when the pool is full, or -1. Voices that ended are released by time.
 */
export class VoiceBudget {
  max: number
  private live: { end: number; priority: number; start: number; id: number }[] = []
  private nextId = 1
  constructor(max = AUDIO.master.voices) { this.max = max }
  /** Live voices at `now`. */
  count(now: number) { this.prune(now); return this.live.length }
  private prune(now: number) { this.live = this.live.filter(v => v.end > now) }
  /** Add a voice; returns {id, steal} where steal is the id of a voice to stop now (0 for none). */
  admit(now: number, start: number, end: number, priority = 0): { id: number; steal: number } {
    this.prune(now)
    let steal = 0
    if (this.live.length >= this.max) {
      let pick = 0
      for (let i = 1; i < this.live.length; i++) { const a = this.live[i], b = this.live[pick]; if (a.priority < b.priority || (a.priority === b.priority && a.start < b.start)) pick = i }
      steal = this.live[pick].id; this.live.splice(pick, 1)
    }
    const id = this.nextId++
    this.live.push({ end, priority, start, id })
    return { id, steal }
  }
  release(id: number) { this.live = this.live.filter(v => v.id !== id) }
}

// ---------------------------------------------------------------------------------------------
// Generated buffers (pure sample math, deterministic with a seeded rand)
// ---------------------------------------------------------------------------------------------

/** RBJ biquad for offline generation. */
export function biquad(type: 'lowpass' | 'highpass' | 'bandpass', f: number, q: number, sr: number) {
  const w = 2 * Math.PI * Math.min(f, sr * .45) / sr, cs = Math.cos(w), al = Math.sin(w) / (2 * q)
  let b0, b1, b2
  if (type === 'lowpass') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0 } else if (type === 'highpass') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0 } else { b0 = al; b1 = 0; b2 = -al }
  const a0 = 1 + al, a1 = -2 * cs, a2 = 1 - al
  const B0 = b0 / a0, B1 = b1 / a0, B2 = b2 / a0, A1 = a1 / a0, A2 = a2 / a0
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  return (x: number) => { const y = B0 * x + B1 * x1 + B2 * x2 - A1 * y1 - A2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y }
}
/**
 * Long textures are built as jobs that yield every SLICE samples (well under a millisecond each), so the page
 * can spread them over several tasks and never drop a frame (the whole lapping bed is about 25 ms of work).
 * finish() runs a job to the end; the plain functions below are exactly that and give the same samples.
 */
export type Job<T> = Generator<void, T, void>
const SLICE = 4096
export function finish<T>(job: Job<T>): T { let r = job.next(); while (!r.done) r = job.next(); return r.value }
function* normalizeJob(d: Float32Array, peak = .9): Job<Float32Array> {
  let m = 0
  for (let i = 0; i < d.length; i++) { m = Math.max(m, Math.abs(d[i])); if (i % SLICE === SLICE - 1) yield }
  if (m > 0) for (let i = 0; i < d.length; i++) { d[i] *= peak / m; if (i % SLICE === SLICE - 1) yield }
  return d
}
export function whiteNoise(len: number, rand: Rand) { const d = new Float32Array(len); for (let i = 0; i < len; i++) d[i] = rand() * 2 - 1; return d }
/** Pink noise (Paul Kellet's refined filter). */
export function* pinkNoiseJob(len: number, rand: Rand): Job<Float32Array> {
  const d = new Float32Array(len); let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  for (let i = 0; i < len; i++) { const w = rand() * 2 - 1; b0 = .99886 * b0 + w * .0555179; b1 = .99332 * b1 + w * .0750759; b2 = .969 * b2 + w * .153852; b3 = .8665 * b3 + w * .3104856; b4 = .55 * b4 + w * .5329522; b5 = -.7616 * b5 - w * .016898; d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * .5362; b6 = w * .115926; if (i % SLICE === SLICE - 1) yield }
  return yield* normalizeJob(d, .8)
}
export const pinkNoise = (len: number, rand: Rand) => finish(pinkNoiseJob(len, rand))
/** Stone-room impulse response: early reflections, then filtered noise decaying with RT60, low-passed. */
export function* stoneRoomIRJob(sr: number, rand: Rand, a: AudioTuning = AUDIO): Job<Float32Array[]> {
  const r = a.reverb, len = Math.floor(sr * r.seconds), out: Float32Array[] = []
  for (let ch = 0; ch < 2; ch++) {
    const d = new Float32Array(len), lp = biquad('lowpass', r.lowpass, .707, sr)
    // The diffuse tail builds up over the first ~40 ms, so the discrete wall reflections stand out first.
    for (let i = 0; i < len; i++) { const t = i / sr, build = Math.min(1, Math.max(0, (t - .004) / .036)); const env = Math.exp(-6.908 * t / r.rt60) * build * build; d[i] = lp((rand() * 2 - 1) * env); if (i % SLICE === SLICE - 1) yield }
    r.early.forEach((s, i) => { const at = Math.floor((s + (ch ? .0013 * (i + 1) : 0)) * sr); if (at < len) d[at] += (i % 2 ? -1 : 1) * (.9 - i * .1) })
    let e = 0; for (const v of d) e += v * v; const k = 1 / Math.sqrt(e || 1); for (let i = 0; i < len; i++) d[i] *= k * 1.6
    out.push(d)
  }
  return out
}
export const stoneRoomIR = (sr: number, rand: Rand, a: AudioTuning = AUDIO) => finish(stoneRoomIRJob(sr, rand, a))
/** Fire hiss: high-passed noise modulated by squared slow noise (Farnell). */
export function* fireHissJob(sr: number, seconds: number, rand: Rand): Job<Float32Array> {
  const len = Math.floor(sr * seconds), d = new Float32Array(len), hp = biquad('highpass', 1000, .707, sr), lfo = biquad('lowpass', 1, .707, sr)
  for (let i = 0; i < len; i++) { const m = lfo(rand() * 2 - 1) * 40; d[i] = hp(rand() * 2 - 1) * Math.min(1.5, m * m); if (i % SLICE === SLICE - 1) yield }
  return yield* normalizeJob(d, .9)
}
export const fireHiss = (sr: number, seconds: number, rand: Rand) => finish(fireHissJob(sr, seconds, rand))
/**
 * Fire lapping: band-passed 30 Hz noise, clipped, high-passed at 25 Hz (Farnell), plus a 300-700 Hz roar
 * following the lapping envelope so the bed is audible on phone speakers (critique: energy above 300 Hz).
 */
export function* fireLappingJob(sr: number, seconds: number, rand: Rand): Job<Float32Array> {
  const len = Math.floor(sr * seconds), d = new Float32Array(len), bp = biquad('bandpass', 30, 5, sr), hp = biquad('highpass', 25, .707, sr), roar = biquad('bandpass', 480, .9, sr), env = biquad('lowpass', 8, .707, sr)
  for (let i = 0; i < len; i++) { const lap = Math.max(-.9, Math.min(.9, bp(rand() * 2 - 1) * 60)); const l = hp(lap); const e = Math.abs(env(Math.abs(l)) * 3); d[i] = l * .7 + roar(rand() * 2 - 1) * Math.min(1.2, e) * 1.6; if (i % SLICE === SLICE - 1) yield }
  // Loop seam: crossfade the last 50 ms into the start.
  const x = Math.floor(sr * .05); for (let i = 0; i < x; i++) { const k = i / x; d[i] = d[i] * k + d[len - x + i] * (1 - k) }
  return yield* normalizeJob(d.subarray(0, len - x).slice(), .9)
}
export const fireLapping = (sr: number, seconds: number, rand: Rand) => finish(fireLappingJob(sr, seconds, rand))
/** Quench: film-boiling hiss with crackles (0-.3 s), nucleate boiling with pops (.3-1.5 s), steam tail (to 2.4 s). */
export function* quenchTextureJob(sr: number, rand: Rand): Job<Float32Array> {
  const len = Math.floor(sr * 2.4), d = new Float32Array(len), hp3 = biquad('highpass', 3000, .707, sr), boil = biquad('bandpass', 700, .6, sr), hp5 = biquad('highpass', 5000, .707, sr)
  let next = 0, popF = 0, popLeft = 0, popAmp = 0, phase = 0
  for (let i = 0; i < len; i++) {
    const t = i / sr, w = rand() * 2 - 1
    let v = 0
    if (t < .3) v += hp3(w) * (.6 + .4 * Math.min(1, t / .02))
    else if (t < 1.5) v += boil(w) * .55 * (1 - (t - .3) / 1.6)
    if (t > 1.2) v += hp5(w) * .35 * Math.max(0, 1 - (t - 1.2) / 1.2)
    if (t >= next && t < 1.5) {
      const rate = t < .3 ? 40 : 80 - (t - .3) / 1.2 * 60
      next = t + crackleInterval(rand, rate); popF = t < .3 ? 2500 + rand() * 3000 : 300 + rand() * 1200; popLeft = Math.floor(sr * (t < .3 ? .003 : .012)); popAmp = t < .3 ? .7 : .9; phase = 0
    }
    if (popLeft > 0) { phase += 2 * Math.PI * popF / sr; v += Math.sin(phase) * popAmp * (popLeft / (sr * .012)); popLeft-- }
    d[i] = v
    if (i % SLICE === SLICE - 1) yield
  }
  return yield* normalizeJob(d, .9)
}
export const quenchTexture = (sr: number, rand: Rand) => finish(quenchTextureJob(sr, rand))
