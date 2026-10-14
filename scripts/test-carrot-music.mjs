import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const bridge = await readFile(new URL('../unity/CarrotDefense/Assets/Plugins/WebGL/CarrotMusic.jslib', import.meta.url), 'utf8')

function harness() {
  const requests = [], warnings = [], queuedEnds = []
  const audio = {
    currentTime: 0, state: 'running', destination: {}, sources: [], gains: [],
    resume() { this.state = 'running'; return Promise.resolve() },
    createGain() {
      const node = { connected: false, gain: { value: 0, setTargetAtTime(value) { this.value = value } },
        connect() { this.connected = true }, disconnect() { this.connected = false } }
      this.gains.push(node); return node
    },
    createBufferSource() {
      const node = {
        buffer: null, onended: null, started: false, stopped: false, ended: false, connected: false,
        _loop: false, at: 0, offset: 0, starts: [],
        get loop() { return this._loop },
        set loop(value) {
          if (this.started) { this.offset = this.position(); this.at = audio.currentTime }
          this._loop = value
        },
        position() { const value = this.offset + audio.currentTime - this.at; return this.loop ? value % this.buffer.duration : Math.min(value, this.buffer.duration) },
        connect() { this.connected = true }, disconnect() { this.connected = false },
        start(when, offset) { this.started = true; this.at = audio.currentTime; this.offset = offset; this.starts.push([when, offset]) },
        stop() { this.stopped = true },
      }
      this.sources.push(node); return node
    },
    decodeAudioData(bytes, success) { const buffer = { duration: bytes.duration }; success(buffer); return Promise.resolve(buffer) },
    advance(seconds, flush = true) {
      this.currentTime += seconds
      for (const node of this.sources) {
        if (!node.started || node.stopped || node.ended || node.loop || node.position() < node.buffer.duration) continue
        node.ended = true
        if (node.onended) queuedEnds.push(node.onended)
      }
      if (flush) this.flush()
    },
    flush() { while (queuedEnds.length) queuedEnds.shift()() },
  }
  const sandbox = { LibraryManager: { library: {} }, mergeInto: Object.assign, UTF8ToString: value => value,
    WEBAudio: { audioContext: audio }, window: {}, console: { warn: message => warnings.push(message) },
    fetch(url) { return new Promise((resolve, reject) => requests.push({ url, resolve, reject })) },
  }
  vm.createContext(sandbox); vm.runInContext(bridge, sandbox, { filename: 'CarrotMusic.jslib' })
  sandbox.CarrotMusic = sandbox.LibraryManager.library.$CarrotMusic
  const api = sandbox.LibraryManager.library
  const settle = () => new Promise(resolve => setImmediate(resolve))
  async function load(name = 'MusicAsuna', duration = 180) {
    api.Carrot_MusicLoad(name, name + '.ogg')
    requests.at(-1).resolve({ ok: true, arrayBuffer: async () => ({ duration }) })
    await settle()
    assert.equal(api.Carrot_MusicState(name), 1)
  }
  return { api, state: sandbox.CarrotMusic, audio, requests, warnings, load, settle }
}

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
  h.audio.advance(90); h.api.Carrot_MusicPause(0, 1); h.api.Carrot_MusicPause(0, 0)
  assert.deepEqual(h.audio.sources[1].starts, [[0, 26.5]])
  h.api.Carrot_MusicPause(0, 0)
  assert.equal(h.audio.sources.length, 2)
  h.api.Carrot_MusicVolume(0, .4)
  assert.equal(h.audio.gains[0].gain.value, .4)
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
  const source = h.audio.sources[0], stale = source.onended
  h.api.Carrot_MusicTail(0); h.api.Carrot_MusicUnload('MusicAsuna')
  assert.equal(h.api.Carrot_MusicState('MusicAsuna'), 1, 'live buffers remain available')
  h.api.Carrot_MusicStop(0)
  assert.equal(source.stopped, true); assert.equal(source.connected, false); assert.equal(h.audio.gains[0].connected, false)
  assert.equal(h.api.Carrot_MusicPlay(0, 'MusicAsuna', .3), 1)
  stale()
  assert.equal(h.api.Carrot_MusicFinished(0), 0)
  assert.equal(h.state.slots[0].loop, true, 'a retry is a fresh full track')
  assert.equal(h.state.slots[1].source.stopped, false, 'other slot remains active')
  h.api.Carrot_MusicStop(0); h.api.Carrot_MusicStop(0); h.api.Carrot_MusicUnload('MusicAsuna')
  assert.equal(h.api.Carrot_MusicState('MusicAsuna'), -2)
  assert.equal(h.api.Carrot_MusicPlay(0, 'missing', 1), 0)
  h.api.Carrot_MusicStop(1); h.api.Carrot_MusicUnload('MusicExplore')
  assert.ok(h.audio.sources.every(s => s.stopped && !s.connected))
  assert.ok(h.audio.gains.every(g => !g.connected))
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
console.log('Carrot music: full tracks, tail endings, paused loop position, queued-end races, stale callbacks, stop/retry cleanup and request ownership pass.')
