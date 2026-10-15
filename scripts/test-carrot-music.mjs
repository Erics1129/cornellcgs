import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

// VM harness for CarrotMusic.jslib with a fake AudioContext: nodes record their connections and AudioParams evaluate
// their automation timelines, so the bus topology, ducks, sweeps and beat clock are checked without a browser.
const bridge = await readFile(new URL('../unity/CarrotDefense/Assets/Plugins/WebGL/CarrotMusic.jslib', import.meta.url), 'utf8')

function param(audio, initial) {
  const p = {
    _v: initial, events: [],
    get value() { return valueAt(this, audio.currentTime) },
    set value(v) { this._v = v; this.events = [] },
    setValueAtTime(v, t) { this.events.push({ k: 'set', v, t }); return this },
    linearRampToValueAtTime(v, t) { this.events.push({ k: 'lin', v, t }); return this },
    exponentialRampToValueAtTime(v, t) { this.events.push({ k: 'exp', v, t }); return this },
    setTargetAtTime(v, t, tc) { this.events.push({ k: 'target', v, t, tc }); return this },
    cancelScheduledValues(t) { this.events = this.events.filter(e => e.t < t); return this },
  }
  return p
}
// Web Audio automation semantics: a ramp runs from the previous event's time and value to its own.
function valueAt(p, now) {
  let v = p._v, t0 = 0
  for (const e of p.events) {
    if (e.k === 'set') { if (e.t <= now) { v = e.v; t0 = e.t; continue } return v }
    if (e.k === 'lin') { if (e.t <= now) { v = e.v; t0 = e.t; continue } return v + (e.v - v) * (now - t0) / Math.max(1e-9, e.t - t0) }
    if (e.k === 'exp') { if (e.t <= now) { v = e.v; t0 = e.t; continue } return v * Math.pow(e.v / v, (now - t0) / Math.max(1e-9, e.t - t0)) }
    if (e.k === 'target') { if (e.t > now) return v; return e.v + (v - e.v) * Math.exp(-(now - e.t) / e.tc) }
  }
  return v
}
const lastTarget = p => { const e = p.events.at(-1); return e ? e.v : p._v }

function harness({ unity = true } = {}) {
  const requests = [], warnings = [], queuedEnds = []
  const node = (kind, extra = {}) => {
    const n = { kind, outs: [], connected: false,
      connect(dest) { this.outs.push(dest); this.connected = true; audio.edges.push([this, dest]); return dest },
      disconnect() { this.outs = []; this.connected = false; audio.edges = audio.edges.filter(([a]) => a !== this) } }
    Object.defineProperties(n, Object.getOwnPropertyDescriptors(extra)) // keeps accessors (the source's loop setter)
    audio.nodes.push(n); return n
  }
  const audio = {
    currentTime: 0, state: 'running', sampleRate: 48000, sources: [], gains: [], nodes: [], edges: [],
    resume() { this.state = 'running'; return Promise.resolve() },
    createGain() { const g = node('gain'); g.gain = param(audio, 1); this.gains.push(g); return g },
    createBiquadFilter() { const f = node('biquad'); f.type = 'lowpass'; f.frequency = param(audio, 350); f.Q = param(audio, 1); f.gain = param(audio, 0); return f },
    createDynamicsCompressor() { const c = node('compressor'); for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) c[k] = param(audio, 0); return c },
    createWaveShaper() { const w = node('shaper'); w.curve = null; w.oversample = 'none'; return w },
    createAnalyser() { const a = node('analyser'); a.fftSize = 2048; a.smoothingTimeConstant = 0.8; a.getFloatTimeDomainData = buf => buf.fill(0.1); return a },
    createBufferSource() {
      const n = node('source', {
        buffer: null, onended: null, started: false, stopped: false, ended: false,
        _loop: false, at: 0, offset: 0, starts: [],
        get loop() { return this._loop },
        set loop(value) {
          if (this.started) { this.offset = this.position(); this.at = audio.currentTime }
          this._loop = value
        },
        position() { const value = this.offset + audio.currentTime - this.at; return this.loop ? value % this.buffer.duration : Math.min(value, this.buffer.duration) },
        start(when, offset) { this.started = true; this.at = audio.currentTime; this.offset = offset; this.starts.push([when, offset]) },
        stop() { this.stopped = true },
      })
      this.sources.push(n); return n
    },
    decodeAudioData(bytes, success) { const buffer = { duration: bytes.duration }; success(buffer); return Promise.resolve(buffer) },
    advance(seconds, flush = true) {
      this.currentTime += seconds
      for (const n of this.sources) {
        if (!n.started || n.stopped || n.ended || n.loop || n.position() < n.buffer.duration) continue
        n.ended = true
        if (n.onended) queuedEnds.push(n.onended)
      }
      if (flush) this.flush()
    },
    flush() { while (queuedEnds.length) queuedEnds.shift()() },
  }
  // The context's own destination is a getter on the prototype, exactly like BaseAudioContext.
  const realDestination = node('destination')
  Object.setPrototypeOf(audio, { get destination() { return realDestination } })
  const sandbox = { LibraryManager: { library: {} }, mergeInto: Object.assign, UTF8ToString: value => value,
    WEBAudio: unity ? { audioContext: audio } : undefined, window: {}, console: { warn: message => warnings.push(message) },
    performance: { now: () => audio.currentTime * 1000 },
    fetch(url) { return new Promise((resolve, reject) => requests.push({ url, resolve, reject })) },
  }
  if (!unity) { sandbox.window.AudioContext = function () { return audio } }
  vm.createContext(sandbox); vm.runInContext(bridge, sandbox, { filename: 'CarrotMusic.jslib' })
  sandbox.CarrotMusic = sandbox.LibraryManager.library.$CarrotMusic
  const api = sandbox.LibraryManager.library
  const settle = () => new Promise(resolve => setImmediate(resolve))
  async function load(name = 'MusicAsuna', duration = 180) {
    api.Carrot_MusicLoad(name, '/StreamingAssets/Carrot/' + name + '.ogg')
    requests.at(-1).resolve({ ok: true, arrayBuffer: async () => ({ duration }) })
    await settle()
    assert.equal(api.Carrot_MusicState(name), 1)
  }
  return { api, state: sandbox.CarrotMusic, audio, realDestination, requests, warnings, load, settle, window: sandbox.window }
}
// Follows every connection forward from a node.
function reaches(from, to, seen = new Set()) { if (from === to) return true; if (seen.has(from)) return false; seen.add(from); return from.outs.some(n => reaches(n, to, seen)) }
function path(from, to) { // first path found, as node kinds
  const walk = (n, trail) => { if (n === to) return trail; for (const o of n.outs) { const r = walk(o, [...trail, o]); if (r) return r } return null }
  return walk(from, [from])
}

// ---------- original music behaviour (unchanged contract) ----------

// The whole decoded track is used. Tail changes looping without cutting or restarting its current source.
{
  const h = harness(); await h.load('MusicAsuna', 247.375)
  assert.equal(h.api.Carrot_MusicSeconds('MusicAsuna'), 247.375)
  assert.equal(h.api.Carrot_MusicPlay(0, 'MusicAsuna', .25), 1)
  const source = h.audio.sources[0]
  assert.equal(source.buffer.duration, 247.375)
  assert.deepEqual(source.starts, [[0, 0]], 'no excerpt start/duration is scheduled')
  assert.equal(source.loop, true)
  h.audio.advance(80)
  h.api.Carrot_MusicTail(0)
  assert.equal(source.loop, false)
  assert.equal(source.stopped, false)
  assert.equal(h.audio.sources.length, 1, 'tail does not restart the song')
  h.audio.advance(167.374)
  assert.equal(h.api.Carrot_MusicFinished(0), 0)
  h.audio.advance(.002)
  assert.equal(h.api.Carrot_MusicFinished(0), 1)
  assert.equal(h.state.slots[0].source, null)
  assert.equal(source.connected, false)
}

// Pause freezes position, repeated pause is idempotent, and resume continues the current loop cycle.
{
  const h = harness(); await h.load('MusicAsuna', 100); h.api.Carrot_MusicPlay(0, 'MusicAsuna', 0)
  h.audio.advance(226.5)
  const original = h.audio.sources[0]
  h.api.Carrot_MusicPause(0, 1)
  assert.equal(original.stopped, true)
  assert.equal(original.connected, false)
  assert.equal(h.state.slots[0].offset, 26.5)
  assert.ok(Math.abs(h.api.Carrot_MusicElapsed(0) - 226.5) < 1e-9, 'elapsed counts every loop')
  h.audio.advance(90); h.api.Carrot_MusicPause(0, 1); h.api.Carrot_MusicPause(0, 0)
  assert.ok(Math.abs(h.api.Carrot_MusicElapsed(0) - 226.5) < 1e-9, 'paused time does not count')
  assert.deepEqual(h.audio.sources[1].starts, [[0, 26.5]])
  h.api.Carrot_MusicPause(0, 0)
  assert.equal(h.audio.sources.length, 2)
  h.audio.advance(10); assert.ok(Math.abs(h.api.Carrot_MusicElapsed(0) - 236.5) < 1e-9, 'elapsed resumes after a pause')
  h.api.Carrot_MusicVolume(0, .4)
  assert.equal(lastTarget(h.state.slots[0].gain.gain), .4)
}

// A tail after several full loops has only the remainder of this cycle left, including across pause.
{
  const h = harness(); await h.load('MusicAsuna', 100); h.api.Carrot_MusicPlay(0, 'MusicAsuna', 1)
  h.audio.advance(225); h.api.Carrot_MusicTail(0); h.audio.advance(5)
  h.api.Carrot_MusicPause(0, 1)
  assert.equal(h.state.slots[0].offset, 30)
  h.audio.advance(400); h.api.Carrot_MusicPause(0, 0)
  assert.equal(h.audio.sources.at(-1).loop, false)
  assert.deepEqual(h.audio.sources.at(-1).starts, [[0, 30]])
  h.audio.advance(70)
  assert.equal(h.api.Carrot_MusicFinished(0), 1)
}

// onended is an event-task: a pause arriving after the audio ended but before its callback must not wrap/replay it.
{
  const h = harness(); await h.load('MusicAsuna', 100); h.api.Carrot_MusicPlay(0, 'MusicAsuna', 1)
  h.audio.advance(225); h.api.Carrot_MusicTail(0)
  h.audio.advance(75.02, false)
  h.api.Carrot_MusicPause(0, 1)
  h.api.Carrot_MusicPause(0, 0)
  assert.equal(h.audio.sources.length, 1, 'a completed tail is never resumed at offset .02')
  assert.equal(h.api.Carrot_MusicFinished(0), 1)
  assert.equal(h.audio.sources[0].connected, false)
  h.audio.flush()
  assert.equal(h.api.Carrot_MusicFinished(0), 1)
}

// A paused source can be marked as a tail, and obsolete onended callbacks cannot finish a replacement source.
{
  const h = harness(); await h.load('MusicAsuna', 100); h.api.Carrot_MusicPlay(0, 'MusicAsuna', 1)
  const original = h.audio.sources[0], obsoleteEnd = original.onended
  h.audio.advance(12); h.api.Carrot_MusicPause(0, 1); h.api.Carrot_MusicTail(0)
  h.audio.advance(10); h.api.Carrot_MusicPause(0, 0)
  obsoleteEnd()
  assert.equal(h.api.Carrot_MusicFinished(0), 0)
  assert.equal(h.state.slots[0].source, h.audio.sources[1])
  assert.equal(h.audio.sources[1].loop, false)
  h.audio.advance(88)
  assert.equal(h.api.Carrot_MusicFinished(0), 1)
  h.api.Carrot_MusicPause(0, 1); h.api.Carrot_MusicPause(0, 0)
  assert.equal(h.audio.sources.length, 2, 'finished slots cannot allocate stray sources')
}

// Both crossfade slots remain independent; stop/retry removes old nodes and unload retains live track ownership.
{
  const h = harness(); await h.load('MusicAsuna', 100); await h.load('MusicExplore', 50)
  h.api.Carrot_MusicPlay(0, 'MusicAsuna', .2); h.api.Carrot_MusicPlay(1, 'MusicExplore', .1)
  const slotGains = [h.state.slots[0].gain, h.state.slots[1].gain]
  const source = h.audio.sources[0], stale = source.onended
  h.api.Carrot_MusicTail(0); h.api.Carrot_MusicUnload('MusicAsuna')
  assert.equal(h.api.Carrot_MusicState('MusicAsuna'), 1, 'live buffers remain available')
  h.api.Carrot_MusicStop(0)
  assert.equal(source.stopped, true); assert.equal(source.connected, false); assert.equal(slotGains[0].connected, false)
  assert.equal(h.api.Carrot_MusicPlay(0, 'MusicAsuna', .3), 1)
  slotGains.push(h.state.slots[0].gain)
  stale()
  assert.equal(h.api.Carrot_MusicFinished(0), 0)
  assert.equal(h.state.slots[0].loop, true, 'a retry is a fresh full track')
  assert.equal(h.state.slots[1].source.stopped, false, 'other slot remains active')
  h.api.Carrot_MusicStop(0); h.api.Carrot_MusicStop(0); h.api.Carrot_MusicUnload('MusicAsuna')
  assert.equal(h.api.Carrot_MusicState('MusicAsuna'), -2)
  assert.equal(h.api.Carrot_MusicPlay(0, 'missing', 1), 0)
  h.api.Carrot_MusicStop(1); h.api.Carrot_MusicUnload('MusicExplore')
  assert.ok(h.audio.sources.every(s => s.stopped && !s.connected))
  assert.ok(slotGains.every(g => !g.connected))
}

// A failed request can retry; an unloaded obsolete decode cannot replace a newer request of the same track.
{
  const h = harness()
  assert.equal(h.api.Carrot_MusicState('MusicAsuna'), -2)
  h.api.Carrot_MusicLoad('MusicAsuna', 'bad.ogg'); h.requests[0].reject(new Error('offline')); await h.settle()
  assert.equal(h.api.Carrot_MusicState('MusicAsuna'), -1)
  h.api.Carrot_MusicLoad('MusicAsuna', 'old.ogg'); h.api.Carrot_MusicLoad('MusicAsuna', 'duplicate.ogg')
  assert.equal(h.requests.length, 2, 'pending request is not duplicated')
  h.api.Carrot_MusicUnload('MusicAsuna')
  const load = h.load('MusicAsuna', 123); await load
  h.requests[1].resolve({ ok: true, arrayBuffer: async () => ({ duration: 999 }) }); await h.settle()
  assert.equal(h.api.Carrot_MusicSeconds('MusicAsuna'), 123)
}

// ---------- master bus ----------

// Topology: Unity channels (which connect to WEBAudio.audioContext.destination) and both music slots pass through
// compressor -> makeup -> limiter -> output -> clipper -> analyser, and only the analyser reaches the real destination.
{
  const h = harness()
  assert.equal(h.api.Carrot_BusInstall(), 1)
  const b = h.state.bus
  assert.equal(h.audio.destination, b.sfxIn, 'Unity sees the bus input as its destination')
  assert.notEqual(Object.getPrototypeOf(h.audio), null)
  // A Unity channel exactly as configurePanningNodes wires it.
  const channelGain = h.audio.createGain(); channelGain.connect(h.audio.destination)
  await h.load('MusicGarden', 69.6); await h.load('MusicExplore', 191.7)
  h.api.Carrot_MusicPlay(0, 'MusicGarden', .4); h.api.Carrot_MusicPlay(1, 'MusicExplore', 0)
  const chain = ['compressor', 'gain', 'compressor', 'gain', 'shaper', 'analyser', 'destination']
  for (const from of [channelGain, h.state.slots[0].gain, h.state.slots[1].gain]) {
    assert.ok(reaches(from, h.realDestination), 'every source reaches the speakers')
    const kinds = path(from, h.realDestination).map(n => n.kind)
    assert.deepEqual(kinds.slice(-chain.length), chain, 'through compressor, makeup, limiter, output, clipper and analyser: ' + kinds.join('>'))
  }
  assert.ok(path(h.state.slots[0].gain, h.realDestination).includes(b.duck), 'music passes the duck gain')
  assert.ok(!path(channelGain, h.realDestination).includes(b.duck), 'effects are never ducked by the music duck')
  const intoReal = h.audio.edges.filter(([, to]) => to === h.realDestination)
  assert.equal(intoReal.length, 1, 'exactly one node connects to the destination')
  assert.equal(intoReal[0][0], b.analyser)
  assert.equal(b.comp.threshold.value, -18); assert.equal(b.comp.knee.value, 6); assert.equal(b.comp.ratio.value, 3)
  assert.equal(b.comp.attack.value, .01); assert.equal(b.comp.release.value, .25)
  assert.equal(b.limiter.threshold.value, -6); assert.equal(b.limiter.knee.value, 0); assert.equal(b.limiter.ratio.value, 20)
  assert.equal(b.limiter.attack.value, .001); assert.equal(b.limiter.release.value, .1)
  assert.equal(b.analyser.fftSize, 1024)
  // Safety clipper: transparent below -3 dBFS, never above -1 dBFS (0.891).
  const curve = b.clip.curve, at = x => curve[Math.round((x + 1) / 2 * (curve.length - 1))]
  assert.ok(Math.abs(at(.5) - .5) < .002 && Math.abs(at(-.6) + .6) < .002, 'linear below the knee')
  assert.ok(Math.max(...curve.map(Math.abs)) <= .8911, 'ceiling at -1 dBFS')
  // Installing twice is a no-op.
  const nodes = h.audio.nodes.length, edges = h.audio.edges.length
  assert.equal(h.api.Carrot_BusInstall(), 1); h.state.install()
  assert.equal(h.audio.nodes.length, nodes); assert.equal(h.audio.edges.length, edges); assert.equal(h.state.bus, b)
  // Published read-only view for the page.
  const pub = h.window.carrotAudioBus
  assert.equal(pub.analyser, b.analyser); assert.equal(pub.context, h.audio)
  assert.equal(typeof pub.beatPhase, 'function'); assert.ok(pub.level() > 0)
}

// Without Unity's context (menus before the player) the bus is built on its own context and the destination is left alone.
{
  const h = harness({ unity: false })
  assert.equal(h.api.Carrot_BusInstall(), 1)
  assert.equal(h.audio.destination, h.realDestination, 'no other context is rerouted')
  assert.equal(h.audio.edges.filter(([, to]) => to === h.realDestination).length, 1)
}

// Ducks: -6 dB within 80 +- 10 ms, held, recovered within 600 +- 60 ms; overlapping ducks keep the deepest depth and latest hold.
{
  const h = harness(); h.api.Carrot_BusInstall(); const g = h.state.bus.duck.gain
  h.audio.currentTime = 10
  h.api.Carrot_BusDuck(-6, .08, 1, .6)
  const db = () => 20 * Math.log10(g.value)
  h.audio.currentTime = 10.07; assert.ok(db() > -6, 'not yet at depth at 70 ms')
  h.audio.currentTime = 10.08; assert.ok(Math.abs(db() + 6) < .05, 'at -6 dB by 80 ms: ' + db())
  h.audio.currentTime = 10.09; assert.ok(Math.abs(db() + 6) < .05)
  h.audio.currentTime = 11.0; assert.ok(Math.abs(db() + 6) < .05, 'held')
  h.audio.currentTime = 11.08 + .54; assert.ok(db() < -0.05, 'still recovering before 540 ms')
  h.audio.currentTime = 11.08 + .6; assert.ok(Math.abs(g.value - 1) < 1e-6, 'recovered by 600 ms')
  // Overlap: a shallower bite inside a deeper telegraph keeps -6 dB and extends nothing it does not need to.
  h.audio.currentTime = 20; h.api.Carrot_BusDuck(-6, .08, 2, .6)
  h.audio.currentTime = 20.5; h.api.Carrot_BusDuck(-4, .04, 0, .4)
  h.audio.currentTime = 20.6; assert.ok(Math.abs(db() + 6) < .05, 'deepest duck wins')
  h.audio.currentTime = 22.05; assert.ok(Math.abs(db() + 6) < .05, 'latest hold end wins')
  h.audio.currentTime = 22.08 + .6; assert.ok(Math.abs(g.value - 1) < 1e-6)
  // A bite alone: -4 dB in 40 ms, back in 400 ms.
  h.audio.currentTime = 30; h.api.Carrot_BusDuck(-4, .04, 0, .4)
  h.audio.currentTime = 30.04; assert.ok(Math.abs(db() + 4) < .05, 'bite depth')
  h.audio.currentTime = 30.44; assert.ok(Math.abs(g.value - 1) < 1e-6, 'bite recovered')
}

// Blind low-pass: 18 kHz -> 900 Hz over 300 ms on, back over 600 ms off.
{
  const h = harness(); h.api.Carrot_BusInstall(); const f = h.state.bus.low.frequency
  assert.equal(f.value, 18000)
  h.audio.currentTime = 5; h.api.Carrot_BusLowpass(1)
  h.audio.currentTime = 5.15; assert.ok(f.value < 18000 && f.value > 900, 'sweeping')
  h.audio.currentTime = 5.3; assert.ok(Math.abs(f.value - 900) < 1, 'closed at 300 ms: ' + f.value)
  h.audio.currentTime = 8; h.api.Carrot_BusLowpass(0)
  h.audio.currentTime = 8.3; assert.ok(f.value > 900 && f.value < 18000)
  h.audio.currentTime = 8.6; assert.ok(Math.abs(f.value - 18000) < 1, 'open at 600 ms')
}

// Intensity: a high shelf and a trim that glide (never jump) and are ignored when unchanged.
{
  const h = harness(); h.api.Carrot_BusInstall(); const b = h.state.bus
  h.api.Carrot_MusicIntensity(0); const shelf = lastTarget(b.tone.gain), trim = lastTarget(b.trim.gain)
  assert.equal(shelf, -6); assert.ok(Math.abs(20 * Math.log10(trim) + 2.5) < 1e-6)
  const events = b.tone.gain.events.length; h.api.Carrot_MusicIntensity(0.001); assert.equal(b.tone.gain.events.length, events, 'tiny changes are ignored')
  h.api.Carrot_MusicIntensity(1); assert.ok(Math.abs(lastTarget(b.tone.gain)) < 1e-9); assert.equal(lastTarget(b.trim.gain), 1)
  assert.equal(b.tone.gain.events.at(-1).k, 'target', 'glides with setTargetAtTime')
}

// Beat clock and key from the analysis rows: delay to the next beat of the dominant slot, -1 without a stable tempo.
{
  const h = harness(); h.api.Carrot_BusInstall()
  h.api.Carrot_MusicMetaLoad('/StreamingAssets/Carrot/music-provenance.json')
  h.requests.at(-1).resolve({ ok: true, json: async () => ([
    { output: 'MusicMarsh.ogg', bpm: 120, beatOffset: .1, tempoStable: true, keyRoot: 0, keyMode: 'minor', keyConfident: true },
    { output: 'MusicFrost.ogg', bpm: 88, beatOffset: 0, tempoStable: false, keyRoot: 10, keyMode: 'minor', keyConfident: false },
  ]) })
  await h.settle()
  await h.load('MusicMarsh', 108); await h.load('MusicFrost', 186)
  assert.equal(h.api.Carrot_MusicBeatDelay(), -1, 'nothing playing')
  h.api.Carrot_MusicPlay(0, 'MusicMarsh', .4)
  h.audio.advance(10.35) // beat grid at .1 + n * .5: next beat at 10.6
  assert.ok(Math.abs(h.api.Carrot_MusicBeatDelay() - .25) < 1e-6, 'quarter second to the next beat')
  assert.equal(h.api.Carrot_MusicKey(), 12, 'C minor')
  assert.equal(h.window.carrotAudioBus.bpm, 120)
  const phase = h.window.carrotAudioBus.beatPhase(); assert.ok(Math.abs(phase - .5) < 1e-6, 'beat phase ' + phase)
  h.api.Carrot_MusicPlay(1, 'MusicFrost', .4); h.api.Carrot_MusicVolume(0, 0)
  assert.equal(h.api.Carrot_MusicBeatDelay(), -1, 'an unstable tempo never quantises')
  assert.equal(h.api.Carrot_MusicKey(), -1, 'an unconfident key plays unpitched')
  assert.equal(h.window.carrotAudioBus.bpm, null, 'the HUD beat glow stays off')
  h.api.Carrot_MusicPause(1, 1); h.api.Carrot_MusicVolume(1, 0); h.api.Carrot_MusicVolume(0, .4); h.api.Carrot_MusicPause(0, 1)
  assert.equal(h.api.Carrot_MusicBeatDelay(), -1, 'paused music has no beat')
}

// Cue log for QA: bounded ring of [ms, name, value].
{
  const h = harness(); h.api.Carrot_BusInstall()
  for (let i = 0; i < 600; i++) { h.audio.currentTime = i / 100; h.api.Carrot_AudioCue('wave', i) }
  const cues = h.window.carrotAudioBus.cues
  assert.equal(cues.length, 512); assert.equal(JSON.stringify(cues.at(-1)), JSON.stringify([5990, 'wave', 599]))
}

// Loudness calibration hook.
{
  const h = harness(); h.api.Carrot_BusInstall(); h.api.Carrot_BusGains(6, -1)
  assert.ok(Math.abs(20 * Math.log10(h.state.bus.makeup.gain.value) - 6) < 1e-9)
  assert.ok(Math.abs(20 * Math.log10(h.state.bus.output.gain.value) + 1) < 1e-9)
}
console.log('Carrot music: full tracks, tail endings, paused loop position, queued-end races, stale callbacks, stop/retry cleanup, request ownership, master-bus topology (one destination edge), idempotent install, duck envelopes, blind sweep, intensity, beat clock, key and cue log pass.')
