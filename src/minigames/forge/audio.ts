/**
 * Synthesized workshop sound, built from the pure layer specs in audio-spec.ts. No audio assets, and
 * no context before a gesture. Master chain: buses -> compressor -> makeup -> volume -> soft clipper; a generated
 * stone-room convolver on a send. Noise and textures are generated once; at most 48 voices (the
 * always-running beds included), stealing the lowest-priority, oldest one. The strike plays in the
 * same task as Unity's impact event; when the output latency is above 30 ms the outcome-neutral
 * contact layers are pre-scheduled from 'swing' on the AudioContext clock.
 */
import { AUDIO, VoiceBudget, softClipCurve, crackle, crackleInterval, creak, creakRate, fireHiss, fireLapping, foley, heartInterval, heartbeat, neutralVoices, pinkNoise, quenchTexture, seeded, shatterTinkles, chipTick, stoneRoomIR, strikeSpec, uiVoices, voiceEnd, whiteNoise } from './audio-spec.ts'
import type { AudioTuning, Bus, Rand, StrikeContext, Voice } from './audio-spec.ts'

export type StrikeEvent = Omit<StrikeContext, 'rand' | 'skipNeutral'> & { seq?: number }
type Live = { src: AudioScheduledSourceNode; gain: GainNode; at: number }
type Options = { context?: BaseAudioContext; rand?: Rand; tuning?: AudioTuning; ambience?: boolean; persist?: boolean; legacy?: boolean }
const db = (d: number) => Math.pow(10, d / 20)

export class ForgeAudio {
 private ctx: BaseAudioContext | null = null
 private injected: BaseAudioContext | null
 private a: AudioTuning
 private rand: Rand
 private persist: boolean
 private ambience: boolean
 private volumeNode: GainNode | null = null
 private buses = {} as Record<Bus, GainNode>
 private duck: GainNode | null = null
 private fire: GainNode | null = null
 private firePan: AudioNode | null = null
 private drone: GainNode | null = null
 private reverb: ConvolverNode | null = null
 private buffers: Record<string, AudioBuffer> = {}
 private waves = new Map<string, PeriodicWave>()
 private budget: VoiceBudget
 private live = new Map<number, Live>()
 private pre = new Map<number, number[]>()
 private fallbackTick: number[] = []
 private fallbackTinkles: number[] = []
 private pump: ReturnType<typeof setInterval> | null = null
 private nextCrackle = 0
 private nextBeat = 0
 private nextCreak = 0
 private tau = 0
 private heatingOn = false
 /** Pre-contract Unity builds send no sfx events: timed fallbacks (chip tick, shard tinkles) play instead. */
 legacy = true
 /** Peak live voices since start, beds included (QA). */
 peakVoices = 0
 volume = AUDIO.master.volume
 muted = false
 constructor(options: Options = {}) {
  this.injected = options.context || null; this.a = options.tuning || AUDIO; this.rand = options.rand || Math.random
  this.persist = options.persist ?? !options.context; this.ambience = options.ambience ?? !options.context
  if (options.legacy !== undefined) this.legacy = options.legacy
  this.volume = this.a.master.volume
  // The always-running beds count against the voice cap.
  this.budget = new VoiceBudget(this.a.master.voices - (this.ambience ? this.a.beds.voices : 0))
  if (this.persist) try { const s = JSON.parse(localStorage.getItem('cgs-forge-audio') || 'null'); if (s) { this.volume = Number.isFinite(s.volume) ? Math.max(0, Math.min(1, s.volume)) : this.volume; this.muted = !!s.muted } } catch { /* defaults */ }
 }
 /** Output latency in ms (base + output), 0 for offline contexts. Decides whether contact layers are pre-scheduled. */
 get latencyMs() { const c = this.ctx as AudioContext | null; return c && 'outputLatency' in c ? ((c.baseLatency || 0) + (c.outputLatency || 0)) * 1000 : 0 }
 /** Everything between a scheduled start and the speaker: the output latency plus the compressor's look-ahead. */
 get pathMs() { return this.latencyMs + this.a.master.lookaheadMs }
 get started() { return !!this.ctx }
 /** Live voices now, beds included (QA). */
 get voices() { return this.ctx ? this.budget.count(this.ctx.currentTime) + (this.fire ? this.a.beds.voices : 0) : 0 }
 /** Create the context on the first gesture (or build on the injected one) and resume it. */
 start() {
  if (!this.ctx) {
   if (this.injected) this.ctx = this.injected
   else { try { this.ctx = new AudioContext({ latencyHint: this.a.master.latencyHint }) } catch { return } }
   this.build()
  }
  const c = this.ctx as AudioContext
  if (typeof c.resume === 'function' && c.state === 'suspended') void c.resume()
 }
 private build() {
  const c = this.ctx!, m = this.a.master, sr = c.sampleRate, r = seeded(20261012)
  const comp = c.createDynamicsCompressor()
  comp.threshold.value = m.threshold; comp.knee.value = m.knee; comp.ratio.value = m.ratio; comp.attack.value = m.attack; comp.release.value = m.release
  // A second compressor as a limiter would add another 6 ms look-ahead; the WaveShaper clipper adds none.
  const makeup = c.createGain(); makeup.gain.value = db(m.makeupDb)
  this.volumeNode = c.createGain(); this.volumeNode.gain.value = this.muted ? 0 : this.volume
  const half = c.createGain(); half.gain.value = .5
  const clip = c.createWaveShaper(); clip.curve = softClipCurve(2048, m.clipKneeDb, m.ceilingDb); clip.oversample = 'none'
  comp.connect(makeup).connect(this.volumeNode).connect(half).connect(clip).connect(c.destination)
  for (const bus of ['strike', 'foley', 'amb'] as Bus[]) { this.buses[bus] = c.createGain(); this.buses[bus].connect(comp) }
  this.duck = c.createGain(); this.duck.connect(this.buses.amb)
  // What the first strike needs is made in the gesture's task (about 7 ms): white noise and the room.
  this.buffers.white = this.mono(whiteNoise(sr * 2, r))
  const ir = stoneRoomIR(sr, r, this.a), irb = c.createBuffer(2, ir[0].length, sr); irb.getChannelData(0).set(ir[0]); irb.getChannelData(1).set(ir[1])
  this.reverb = c.createConvolver(); this.reverb.normalize = false; this.reverb.buffer = irb; this.reverb.connect(comp)
  // The long textures (beds, quench) follow in later tasks so the first press is never held up;
  // an offline (injected) context builds them at once.
  const later: (() => void)[] = [() => { this.buffers.quench = this.mono(quenchTexture(sr, r)) }]
  if (this.ambience) later.unshift(...this.beds(r))
  if (this.injected) later.forEach(f => f())
  else { const step = () => { if (this.ctx !== c) return; later.shift()?.(); if (later.length) setTimeout(step, 16) }; setTimeout(step, 30) }
  this.apply()
 }
 private mono(d: Float32Array) { const c = this.ctx!, b = c.createBuffer(1, d.length, c.sampleRate); b.getChannelData(0).set(d); return b }
 private panner(pan: number): AudioNode | null { const c = this.ctx!; if (typeof c.createStereoPanner !== 'function' || !pan) return null; const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); return p }
 /**
  * Fire (hiss, lapping, crackles), room tone and the tension drone. The bus, drone and crackle pump start
  * now; each looped texture starts once its buffer is generated (the returned steps).
  */
 private beds(r: Rand): (() => void)[] {
  const c = this.ctx!, sr = c.sampleRate, f = this.a.fire
  this.fire = c.createGain(); this.fire.gain.value = db(this.heatingOn ? f.heatBoostDb : 0)
  this.firePan = this.panner(f.pan)
  if (this.firePan) this.fire.connect(this.firePan).connect(this.duck!); else this.fire.connect(this.duck!)
  const loop = (name: string, gain: number, out: AudioNode, filter?: BiquadFilterNode) => { const s = c.createBufferSource(); s.buffer = this.buffers[name]; s.loop = true; const g = c.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(gain, c.currentTime, .3); if (filter) s.connect(filter).connect(g); else s.connect(g); g.connect(out); const send = c.createGain(); send.gain.value = this.a.reverb.ambWet; g.connect(send).connect(this.reverb!); s.start(0, r() * 2) }
  this.drone = c.createGain(); this.drone.gain.value = this.a.tension.droneGain * this.tau; this.drone.connect(this.duck!)
  for (const hz of this.a.tension.droneHz) { const o = c.createOscillator(); o.setPeriodicWave(this.wave(this.a.tension.harmonics)); o.frequency.value = hz; o.connect(this.drone); o.start(0) }
  this.nextCrackle = c.currentTime + .1; this.nextBeat = c.currentTime + .5; this.nextCreak = c.currentTime + 1
  if (!this.injected) this.pump = setInterval(() => this.pumpUntil((this.ctx?.currentTime || 0) + .3), 80)
  return [
   () => { this.buffers.pink = this.mono(pinkNoise(sr * 4, r)); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = this.a.room.lowpass; loop('pink', this.a.room.gain, this.duck!, lp) },
   () => { this.buffers.hiss = this.mono(fireHiss(sr, 4, r)); loop('hiss', f.hissGain, this.fire!) },
   () => { this.buffers.lapping = this.mono(fireLapping(sr, 5, r)); loop('lapping', f.lapGain, this.fire!) },
  ]
 }
 /** Schedule the stochastic beds (crackles, heartbeat, creaks) up to `until` seconds on the context clock. */
 pumpUntil(until: number) {
  if (!this.ctx || !this.fire) return
  const f = this.a.fire, rate = (f.crackleRateMin + (f.crackleRateMax - f.crackleRateMin) * (this.heatingOn ? 1 : .35))
  const now = this.ctx.currentTime
  if (this.nextCrackle < now) this.nextCrackle = now
  while (this.nextCrackle < until) { this.voice(crackle(this.rand, this.a), this.nextCrackle, this.fire); this.nextCrackle += crackleInterval(this.rand, rate) }
  if (this.tau > .02) {
   if (this.nextBeat < now) this.nextBeat = now + .05
   while (this.nextBeat < until) { for (const v of heartbeat(this.tau, this.a)) this.voice(v, this.nextBeat); this.nextBeat += heartInterval(this.tau, this.a) }
   if (this.nextCreak < now) this.nextCreak = now + .2
   while (this.nextCreak < until) { this.voice(creak(this.rand, this.tau), this.nextCreak); this.nextCreak += crackleInterval(this.rand, creakRate(this.tau, this.a)) }
  } else { this.nextBeat = until; this.nextCreak = until }
 }
 private wave(harmonics: number[]) {
  const key = harmonics.join(','); let w = this.waves.get(key)
  if (!w) { const n = harmonics.length + 1, real = new Float32Array(n), imag = new Float32Array(n); harmonics.forEach((h, i) => { imag[i + 1] = h }); w = this.ctx!.createPeriodicWave(real, imag, { disableNormalization: false }); this.waves.set(key, w) }
  return w
 }
 /** Turn one Voice into nodes starting at context time t0 (+ v.at). Returns its budget id. */
 private voice(v: Voice, t0: number, out?: AudioNode): number {
  const c = this.ctx; if (!c) return 0
  const at = Math.max(c.currentTime, t0 + v.at), end = at - v.at + voiceEnd(v)
  const { id, steal } = this.budget.admit(c.currentTime, at, end, v.priority || 0)
  if (steal) this.stop(steal)
  let src: AudioScheduledSourceNode, head: AudioNode
  if (v.src === 'osc') {
   const o = c.createOscillator()
   if (v.wave === 'rich' && v.harmonics) o.setPeriodicWave(this.wave(v.harmonics)); else o.type = v.wave === 'triangle' ? 'triangle' : 'sine'
   // Only the thump, boom, thud, whoomp and heartbeat glide; ring and blade partials never do.
   if (v.freqEnd) { o.frequency.setValueAtTime(v.freq, at); o.frequency.exponentialRampToValueAtTime(v.freqEnd, at + v.dur) } else o.frequency.value = v.freq
   src = o; head = o
  } else {
   const b = c.createBufferSource(); b.buffer = this.buffers[v.src === 'buffer' ? v.buffer || 'white' : v.src === 'pink' ? 'pink' : 'white'] || this.buffers.white
   src = b; head = b
   if (v.filter) {
    const f = c.createBiquadFilter(); f.type = v.filter; f.Q.value = v.q ?? .7
    if (v.filterEnd) { f.frequency.setValueAtTime(v.freq, at); f.frequency.exponentialRampToValueAtTime(v.filterEnd, at + v.dur) } else f.frequency.value = v.freq
    head.connect(f); head = f
   }
  }
  const g = c.createGain(), peak = Math.max(1e-5, v.gain), t60 = v.t60 ?? v.dur
  g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(peak, at + v.attack); g.gain.setTargetAtTime(0, at + v.attack, Math.max(.001, t60 / 6.908))
  head.connect(g)
  const pan = v.pan ? this.panner(v.pan) : null
  const dest = out || (v.bus === 'amb' ? this.duck! : this.buses[v.bus])
  if (pan) g.connect(pan).connect(dest); else g.connect(dest)
  if (v.wet > 0 && this.reverb) { const s = c.createGain(); s.gain.value = v.wet; g.connect(s).connect(this.reverb) }
  if (v.src === 'noise' || v.src === 'pink') (src as AudioBufferSourceNode).start(at, this.rand() * 1.5); else src.start(at)
  src.stop(end + .03)
  this.live.set(id, { src, gain: g, at })
  src.onended = () => { this.live.delete(id); this.budget.release(id); try { g.disconnect() } catch { /* gone */ } }
  this.peakVoices = Math.max(this.peakVoices, this.voices)
  return id
 }
 private stop(id: number) {
  const v = this.live.get(id); if (!v || !this.ctx) return
  const t = this.ctx.currentTime
  try { if (v.at > t) v.src.stop(); else { v.gain.gain.cancelScheduledValues(t); v.gain.gain.setTargetAtTime(0, t, .004); v.src.stop(t + .03) } } catch { /* already stopped */ }
  this.live.delete(id); this.budget.release(id)
 }
 private play(voices: Voice[], at = 0, out?: AudioNode) { if (!this.ctx) return []; const t0 = this.ctx.currentTime + at; return voices.map(v => this.voice(v, t0, out)) }
 private apply() {
  if (this.ctx && this.volumeNode) this.volumeNode.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, .04)
  if (this.persist) try { localStorage.setItem('cgs-forge-audio', JSON.stringify({ volume: this.volume, muted: this.muted })) } catch { /* optional */ }
 }
 setVolume(v: number) { this.volume = Math.max(0, Math.min(1, v)); this.apply() }
 setMuted(v: boolean) { this.muted = v; this.apply() }

 /** One strike, in the same task as Unity's impact. Pre-scheduled contact layers for this seq are kept. */
 strike(e: StrikeEvent) {
  if (!this.ctx) return 0
  const pre = e.seq ? this.pre.get(e.seq) : undefined
  if (e.seq) this.pre.delete(e.seq)
  const spec = strikeSpec({ ...e, skipNeutral: !!pre?.length, rand: this.rand }, this.a)
  this.play(spec.voices)
  if (spec.duckDb && this.duck) { const t = this.ctx.currentTime, g = this.duck.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(db(-spec.duckDb), t + .02); g.setTargetAtTime(1, t + spec.duckS, .08) }
  // Builds without sfx events get a timed chip tick and shard tinkles; chip-land / shard-land replace them.
  if (this.legacy && e.outcome === 'chip') this.fallbackTick = this.play([chipTick(this.a.chip.tickFallback, this.a)])
  if (this.legacy && e.outcome === 'shatter') this.fallbackTinkles = this.play(shatterTinkles(this.rand, this.a))
  return spec.voices.length
 }
 /** Unity 'swing': pre-schedule the outcome-neutral contact layers when the output latency is high. */
 preschedule(seq: number, msToContact: number, force = false) {
  if (!this.ctx || !seq || !(msToContact > 0)) return false
  const latency = this.latencyMs
  if (!force && latency <= this.a.preschedule.latencyMs) return false
  const at = Math.max(0, msToContact - this.pathMs) / 1000
  this.pre.set(seq, this.play(neutralVoices(this.rand, 0, this.a), at))
  return true
 }
 /** settled x = -1: the strike never landed, so its pre-scheduled layers must not play. */
 cancel(seq: number) { const ids = this.pre.get(seq); if (ids) { ids.forEach(id => this.stop(id)); this.pre.delete(seq) } }
 /** Any 'settled': forget pre-scheduled layers of strikes up to seq (their impact has played or never will). */
 settled(seq: number) { for (const k of [...this.pre.keys()]) if (k <= seq) this.pre.delete(k) }
 /** Unity sfx events (bridge.ts SFX). Returns the number of voices started. */
 sfx(name: string, x = 0, y = 0) {
  if (!this.ctx) return 0
  if (name === 'chip-land') { this.fallbackTick.forEach(id => this.stop(id)); this.fallbackTick = [] }
  if (name === 'shard-land' && this.fallbackTinkles.length) { this.fallbackTinkles.forEach(id => this.stop(id)); this.fallbackTinkles = [] }
  if (name === 'bellows' && this.fire) { const t = this.ctx.currentTime, g = this.fire.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.setTargetAtTime(db((this.heatingOn ? this.a.fire.heatBoostDb : 0) + 3), t + .3, .12); g.setTargetAtTime(db(this.heatingOn ? this.a.fire.heatBoostDb : 0), t + 1.1, .3) }
  return this.play(foley(name, x, y, this.rand, this.a)).length
 }
 /** Event chimes for transitions Unity has no foley for (sell, buy, heat, flow, move, use), and the dry refusal tick. */
 ui(kind: string) { return this.play(uiVoices(kind, this.a)).length }
 /** Builds without sfx: the grip creak now and the whoosh just before the predicted contact. */
 swingFoley(msToContact: number) { if (!this.ctx) return; this.play(foley('swing', 0, 0, this.rand, this.a)); this.play(foley('whoosh', 8, 0, this.rand, this.a), Math.max(0, msToContact - 80) / 1000) }
 /** The fire roars 4 dB louder while a blank heats. */
 setHeating(on: boolean) {
  this.heatingOn = on
  if (this.ctx && this.fire) this.fire.gain.setTargetAtTime(db(on ? this.a.fire.heatBoostDb : 0), this.ctx.currentTime, .25)
 }
 /** Tension 0..1 from the shatter risk: drone, heartbeat and creaks. */
 setTension(tau: number) {
  this.tau = Math.max(0, Math.min(1, tau || 0))
  if (this.ctx && this.drone) this.drone.gain.setTargetAtTime(this.a.tension.droneGain * this.tau, this.ctx.currentTime, .4)
 }
 suspend() { const c = this.ctx as AudioContext | null; if (c && typeof c.suspend === 'function' && !this.injected) void c.suspend() }
 dispose() { if (this.pump) clearInterval(this.pump); this.pump = null; const c = this.ctx as AudioContext | null; if (c && !this.injected && typeof c.close === 'function') void c.close(); this.ctx = null; this.live.clear() }
}
