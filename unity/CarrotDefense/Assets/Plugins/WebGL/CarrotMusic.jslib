// Streamed music and the master bus, both on Unity's own AudioContext (WEBAudio.audioContext, which Unity unlocks on the
// first gesture and suspends in the background).
//
// Music: Unity's DownloadHandlerAudioClip on the Web player refuses Ogg ("Streaming of ogg on this platform is not
// supported") and hands WebKit an empty clip after the MP3 decodes ("Loading FSB failed"), so CarrotAudio fetches each
// track here: fetch -> decodeAudioData -> an AudioBuffer kept only in browser memory (never copied into the wasm heap),
// played through two slots (A/B crossfade) of AudioBufferSourceNode + GainNode.
//
// Master bus (the Unity Web player has no mixer effects, so this is the only place one can live):
//   Unity SFX ----------------------------------------------> sfxIn ---\
//   music slots -> musicIn -> tone (high shelf, intensity) -> low-pass (blind sweep) -> duck --> sum
//   sum -> compressor (-18 dB, knee 6, 3:1, 10/250 ms) -> makeup -> limiter (-6 dB, knee 0, 20:1, 1/100 ms)
//       -> output trim -> safety clipper (transparent below -3 dBFS, ceiling -1 dBFS) -> analyser -> destination
// Unity's channels connect to `WEBAudio.audioContext.destination` every time a clip starts (configurePanningNodes), so
// the bus shadows that one property on that one context with sfxIn. Nothing else is rerouted, AudioNode.prototype is
// never patched, other AudioContexts on the page are untouched, and exactly one node (the analyser) reaches the real
// destination. DynamicsCompressorNode applies its own automatic makeup gain (Web Audio spec), so the explicit makeup and
// output trims are calibrated against measured loudness, not assumed.
mergeInto(LibraryManager.library, {
  $CarrotMusic: {
    tracks: {},
    slots: [null, null],
    own: null,
    bus: null,
    meta: {},
    cueLog: [],
    // Calibrated on dense L24 combat (scripts/carrot-audio-qa.mjs): -4 dB makeup and -0.5 dB output put the combat RMS
    // median at -20 dBFS with peaks near -3 dBFS (the compressor's own automatic makeup is already +7 dB at these settings).
    gains: { makeup: 0.631, output: 0.944 },
    context: function () {
      try { if (typeof WEBAudio !== 'undefined' && WEBAudio.audioContext) return WEBAudio.audioContext; } catch (e) {}
      if (!CarrotMusic.own) { var C = window.AudioContext || window.webkitAudioContext; CarrotMusic.own = C ? new C() : null; }
      return CarrotMusic.own;
    },
    // Public read-only view for the page (HUD beat glow, menu clicks). audioPrefs.ts installs null-safe defaults first.
    publish: function () {
      var w = typeof window !== 'undefined' ? window : null; if (!w) return;
      var pub = w.carrotAudioBus; if (!pub || typeof pub !== 'object') pub = w.carrotAudioBus = {};
      var b = CarrotMusic.bus;
      pub.analyser = b ? b.analyser : null;
      pub.context = b ? b.ctx : null;
      pub.cues = CarrotMusic.cueLog;
      pub.beatPhase = function () { var s = CarrotMusic.dominant(); var m = s && CarrotMusic.stableMeta(s); if (!m) return 0; var ctx = CarrotMusic.context(); var p = (CarrotMusic.position(s, ctx) - m.beatOffset) * m.bpm / 60; return ((p % 1) + 1) % 1; };
      pub.level = function () { var b2 = CarrotMusic.bus; if (!b2) return 0; var a = b2.scratch; b2.analyser.getFloatTimeDomainData(a); var sum = 0; for (var i = 0; i < a.length; i++) sum += a[i] * a[i]; return Math.sqrt(sum / a.length); };
      var d = CarrotMusic.dominant(), meta = d && CarrotMusic.stableMeta(d);
      pub.bpm = meta ? meta.bpm : null;
      pub.track = d ? d.name : null;
    },
    install: function () {
      if (CarrotMusic.bus) return CarrotMusic.bus;
      var ctx = CarrotMusic.context(); if (!ctx) return null;
      var real = ctx.destination;
      var gain = function (v) { var g = ctx.createGain(); g.gain.value = v; return g; };
      var b = { ctx: ctx, real: real };
      b.sfxIn = gain(1); b.musicIn = gain(1); b.sum = gain(1);
      b.tone = ctx.createBiquadFilter(); b.tone.type = 'highshelf'; b.tone.frequency.value = 2500; b.tone.gain.value = 0;
      b.low = ctx.createBiquadFilter(); b.low.type = 'lowpass'; b.low.frequency.value = 18000; b.low.Q.value = 0.5;
      b.trim = gain(1); b.duck = gain(1);
      b.comp = ctx.createDynamicsCompressor();
      b.comp.threshold.value = -18; b.comp.knee.value = 6; b.comp.ratio.value = 3; b.comp.attack.value = 0.010; b.comp.release.value = 0.25;
      b.makeup = gain(CarrotMusic.gains.makeup);
      b.limiter = ctx.createDynamicsCompressor();
      b.limiter.threshold.value = -6; b.limiter.knee.value = 0; b.limiter.ratio.value = 20; b.limiter.attack.value = 0.001; b.limiter.release.value = 0.1;
      b.output = gain(CarrotMusic.gains.output);
      b.clip = ctx.createWaveShaper();
      var n = 2048, curve = new Float32Array(n), ceil = 0.891, knee = 0.708;
      for (var i = 0; i < n; i++) { var x = i / (n - 1) * 2 - 1, ax = Math.abs(x), y = ax <= knee ? ax : knee + (ceil - knee) * Math.tanh((ax - knee) / (ceil - knee)); curve[i] = x < 0 ? -y : y; }
      b.clip.curve = curve; b.clip.oversample = '2x';
      b.analyser = ctx.createAnalyser(); b.analyser.fftSize = 1024; b.analyser.smoothingTimeConstant = 0.6;
      b.scratch = new Float32Array(b.analyser.fftSize);
      b.musicIn.connect(b.tone); b.tone.connect(b.low); b.low.connect(b.trim); b.trim.connect(b.duck); b.duck.connect(b.sum);
      b.sfxIn.connect(b.sum);
      b.sum.connect(b.comp); b.comp.connect(b.makeup); b.makeup.connect(b.limiter); b.limiter.connect(b.output); b.output.connect(b.clip); b.clip.connect(b.analyser);
      b.analyser.connect(real);
      b.duckState = null;
      // Unity reads `WEBAudio.audioContext.destination` each time a channel (re)connects; shadow it on this context only.
      var unity = null; try { unity = typeof WEBAudio !== 'undefined' ? WEBAudio.audioContext : null; } catch (e) {}
      if (unity === ctx) { try { Object.defineProperty(ctx, 'destination', { configurable: true, enumerable: false, get: function () { return b.sfxIn; } }); b.shadowed = true; } catch (e) { b.shadowed = false; } }
      CarrotMusic.bus = b; CarrotMusic.publish();
      return b;
    },
    slot: function (index) { return CarrotMusic.slots[index] || null; },
    dominant: function () { var a = CarrotMusic.slots[0], b = CarrotMusic.slots[1]; if (!a) return b; if (!b) return a; return (b.volume || 0) > (a.volume || 0) ? b : a; },
    stableMeta: function (s) { var m = s && CarrotMusic.meta[s.file]; return m && m.tempoStable && m.bpm > 0 ? m : null; },
    position: function (s, ctx) {
      var offset = s.paused ? s.offset : Math.max(0, ctx.currentTime - s.startedAt);
      return s.loop ? offset % s.buffer.duration : Math.min(offset, s.buffer.duration);
    },
    played: function (s, ctx) { return s.playedBase + (s.source && !s.paused ? Math.max(0, ctx.currentTime - s.segmentStart) : 0); },
    // Starts (or restarts after a pause) the slot's source at an offset into the loop.
    start: function (s, offset) {
      var ctx = CarrotMusic.context(); if (!ctx || !s.buffer || s.finished) return;
      try { if (ctx.state === 'suspended' && ctx.resume) ctx.resume(); } catch (e) {}
      offset = Math.max(0, offset);
      if (!s.loop && offset >= s.buffer.duration) { s.finished = true; s.paused = false; return; }
      offset = s.buffer.duration > 0 ? offset % s.buffer.duration : 0;
      var source = ctx.createBufferSource(); source.buffer = s.buffer; source.loop = s.loop; source.connect(s.gain);
      source.onended = function () { if (s.source === source && !s.loop) { s.playedBase += Math.max(0, ctx.currentTime - s.segmentStart); s.finished = true; s.paused = false; s.offset = s.buffer.duration; s.source = null; try { source.disconnect(); } catch (e) {} } };
      source.start(0, offset); s.source = source; s.startedAt = ctx.currentTime - offset; s.offset = offset; s.paused = false; s.segmentStart = ctx.currentTime;
    },
    halt: function (s) {
      if (!s.source) return;
      var source = s.source; s.source = null; source.onended = null;
      try { source.stop(); } catch (e) {}
      try { source.disconnect(); } catch (e) {}
    },
    // Ducks combine: the deepest active depth wins and the latest hold end wins; each new request re-plans from the
    // current gain, so overlapping telegraphs, bites and deaths never pump.
    duck: function (db, attack, hold, release) {
      var b = CarrotMusic.install(); if (!b) return;
      var ctx = b.ctx, now = ctx.currentTime, g = b.duck.gain, d = b.duckState;
      var active = d && now < d.holdEnd, depth = active ? Math.min(db, d.db) : db;
      var holdEnd = Math.max(now + attack + hold, active ? d.holdEnd : 0), target = Math.pow(10, depth / 20), current = g.value;
      try { g.cancelScheduledValues(now); } catch (e) {}
      g.setValueAtTime(current, now);
      g.linearRampToValueAtTime(target, now + Math.max(0.001, attack));
      g.setValueAtTime(target, holdEnd);
      g.linearRampToValueAtTime(1, holdEnd + Math.max(0.01, release));
      b.duckState = { db: depth, holdEnd: holdEnd, releaseEnd: holdEnd + release };
    },
    rampParam: function (param, value, seconds, exponential) {
      var ctx = CarrotMusic.context(), now = ctx.currentTime, current = param.value;
      try { param.cancelScheduledValues(now); } catch (e) {}
      param.setValueAtTime(current, now);
      if (exponential) param.exponentialRampToValueAtTime(Math.max(1e-4, value), now + seconds); else param.linearRampToValueAtTime(value, now + seconds);
    }
  },
  // Builds the master bus once (idempotent). Called first thing by CarrotAudio.Awake, before any AudioSource plays.
  Carrot_BusInstall__deps: ['$CarrotMusic'],
  Carrot_BusInstall: function () { return CarrotMusic.install() ? 1 : 0; },
  // dB depth (negative), attack, hold and release in seconds.
  Carrot_BusDuck__deps: ['$CarrotMusic'],
  Carrot_BusDuck: function (db, attack, hold, release) { CarrotMusic.duck(db, attack, hold, release); },
  // Blindness: the music low-pass sweeps 18 kHz -> 900 Hz over 300 ms and returns over 600 ms.
  Carrot_BusLowpass__deps: ['$CarrotMusic'],
  Carrot_BusLowpass: function (on) { var b = CarrotMusic.install(); if (!b) return; CarrotMusic.rampParam(b.low.frequency, on ? 900 : 18000, on ? 0.3 : 0.6, true); b.lowOn = !!on; },
  // Music intensity 0..1: a 2.5 kHz high shelf (-6 dB -> 0) and a level trim (-2.5 dB -> 0), glided over ~1.5 s.
  Carrot_MusicIntensity__deps: ['$CarrotMusic'],
  Carrot_MusicIntensity: function (value) {
    var b = CarrotMusic.install(); if (!b) return; value = Math.max(0, Math.min(1, value));
    if (b.intensity !== undefined && Math.abs(b.intensity - value) < 0.01) return; b.intensity = value;
    var now = b.ctx.currentTime;
    try { b.tone.gain.setTargetAtTime(-6 * (1 - value), now, 0.5); b.trim.gain.setTargetAtTime(Math.pow(10, -2.5 * (1 - value) / 20), now, 0.5); } catch (e) {}
  },
  // Loudness calibration (QA builds and the console): makeup and output gains in dB.
  Carrot_BusGains__deps: ['$CarrotMusic'],
  Carrot_BusGains: function (makeupDb, outputDb) {
    CarrotMusic.gains.makeup = Math.pow(10, makeupDb / 20); CarrotMusic.gains.output = Math.pow(10, outputDb / 20);
    var b = CarrotMusic.bus; if (b) { b.makeup.gain.value = CarrotMusic.gains.makeup; b.output.gain.value = CarrotMusic.gains.output; }
  },
  // Tempo/key rows from StreamingAssets/Carrot/music-provenance.json (written by Tools/analyze_carrot_music.mjs).
  Carrot_MusicMetaLoad__deps: ['$CarrotMusic'],
  Carrot_MusicMetaLoad: function (urlPtr) {
    var url = UTF8ToString(urlPtr);
    fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (rows) {
      for (var i = 0; i < rows.length; i++) { var row = rows[i]; if (row && row.output) CarrotMusic.meta[row.output] = { bpm: +row.bpm || 0, beatOffset: +row.beatOffset || 0, tempoStable: !!row.tempoStable, keyRoot: row.keyRoot | 0, minor: row.keyMode === 'minor', keyConfident: !!row.keyConfident }; }
      CarrotMusic.publish();
    }).catch(function (e) { console.warn('Carrot music analysis unavailable: ' + String(e && e.message || e)); });
  },
  // Seconds until the next beat of the dominant track, or -1 when that track has no stable tempo (cue plays at once).
  Carrot_MusicBeatDelay__deps: ['$CarrotMusic'],
  Carrot_MusicBeatDelay: function () {
    var s = CarrotMusic.dominant(), m = s && CarrotMusic.stableMeta(s), ctx = CarrotMusic.context(); if (!m || !ctx || s.paused || !s.source) return -1;
    var period = 60 / m.bpm, p = (CarrotMusic.position(s, ctx) - m.beatOffset) / period, frac = ((p % 1) + 1) % 1;
    return (1 - frac) * period;
  },
  // Key of the dominant track: root 0-11 (+12 when minor), or -1 when the analysis was not confident (unpitched cues).
  Carrot_MusicKey__deps: ['$CarrotMusic'],
  Carrot_MusicKey: function () { var s = CarrotMusic.dominant(), m = s && CarrotMusic.meta[s.file]; return m && m.keyConfident ? m.keyRoot + (m.minor ? 12 : 0) : -1; },
  // Total seconds the slot has played (all loops, pauses excluded): the playlist counts loops from this.
  Carrot_MusicElapsed__deps: ['$CarrotMusic'],
  Carrot_MusicElapsed: function (index) { var s = CarrotMusic.slot(index), ctx = CarrotMusic.context(); return s && ctx ? CarrotMusic.played(s, ctx) : 0; },
  // Cue log for QA and the page: [performance.now() ms, name, value]; a ring of 512 entries.
  Carrot_AudioCue__deps: ['$CarrotMusic'],
  Carrot_AudioCue: function (namePtr, value) {
    var log = CarrotMusic.cueLog; log.push([Math.round(performance.now()), UTF8ToString(namePtr), value]); if (log.length > 512) log.splice(0, log.length - 512);
  },
  Carrot_MusicLoad__deps: ['$CarrotMusic'],
  Carrot_MusicLoad: function (namePtr, urlPtr) {
    var name = UTF8ToString(namePtr), url = UTF8ToString(urlPtr);
    var t = CarrotMusic.tracks[name];
    if (t && t.state !== -1) return;
    t = CarrotMusic.tracks[name] = { state: 0, buffer: null, seconds: 0, file: url.split('/').pop().split('?')[0] };
    var ctx = CarrotMusic.context();
    if (!ctx) { t.state = -1; console.warn('Carrot music: no AudioContext for ' + name); return; }
    fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
      .then(function (bytes) { return new Promise(function (ok, fail) { var p = ctx.decodeAudioData(bytes, ok, fail); if (p && p.then) p.then(ok, fail); }); })
      .then(function (buffer) { if (CarrotMusic.tracks[name] === t) { t.buffer = buffer; t.seconds = buffer.duration; t.state = 1; } })
      .catch(function (e) { if (CarrotMusic.tracks[name] === t) t.state = -1; console.warn('Carrot music failed: ' + name + ' ' + String(e && e.message || e)); });
  },
  // 1 when the audio context already runs (the page's own click resumed it), so music may start without another gesture.
  Carrot_MusicRunning__deps: ['$CarrotMusic'],
  Carrot_MusicRunning: function () { var ctx = CarrotMusic.context(); return ctx && ctx.state === 'running' ? 1 : 0; },
  // -2 never requested, 0 loading, 1 ready, -1 failed.
  Carrot_MusicState__deps: ['$CarrotMusic'],
  Carrot_MusicState: function (namePtr) { var t = CarrotMusic.tracks[UTF8ToString(namePtr)]; return t ? t.state : -2; },
  Carrot_MusicSeconds__deps: ['$CarrotMusic'],
  Carrot_MusicSeconds: function (namePtr) { var t = CarrotMusic.tracks[UTF8ToString(namePtr)]; return t ? t.seconds : 0; },
  Carrot_MusicUnload__deps: ['$CarrotMusic'],
  Carrot_MusicUnload: function (namePtr) {
    var name = UTF8ToString(namePtr);
    for (var i = 0; i < 2; i++) { var s = CarrotMusic.slots[i]; if (s && s.name === name) return; }
    delete CarrotMusic.tracks[name];
  },
  // Plays a loaded track in slot 0 or 1 from the start at the given gain (0 for a fade-in). 1 when it started, 0 otherwise.
  Carrot_MusicPlay__deps: ['$CarrotMusic'],
  Carrot_MusicPlay: function (index, namePtr, volume) {
    var name = UTF8ToString(namePtr), t = CarrotMusic.tracks[name], ctx = CarrotMusic.context();
    if (!t || t.state !== 1 || !ctx) return 0;
    var bus = CarrotMusic.install();
    var s = CarrotMusic.slot(index); if (s) { CarrotMusic.halt(s); try { s.gain.disconnect(); } catch (e) {} }
    s = CarrotMusic.slots[index] = { name: name, file: t.file, buffer: t.buffer, gain: ctx.createGain(), source: null, startedAt: 0, offset: 0, paused: false, loop: true, finished: false, volume: volume, playedBase: 0, segmentStart: 0 };
    s.gain.gain.value = volume; s.gain.connect(bus ? bus.musicIn : ctx.destination);
    CarrotMusic.start(s, 0);
    CarrotMusic.publish();
    return 1;
  },
  Carrot_MusicVolume__deps: ['$CarrotMusic'],
  Carrot_MusicVolume: function (index, volume) {
    var s = CarrotMusic.slot(index), ctx = CarrotMusic.context(); if (!s || !ctx) return;
    var before = CarrotMusic.dominant(); s.volume = volume;
    try { s.gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.015); } catch (e) { s.gain.gain.value = volume; }
    if (CarrotMusic.dominant() !== before) CarrotMusic.publish();
  },
  Carrot_MusicPause__deps: ['$CarrotMusic'],
  Carrot_MusicPause: function (index, paused) {
    var s = CarrotMusic.slot(index), ctx = CarrotMusic.context(); if (!s || !ctx || s.finished) return;
    if (paused) {
      if (s.source) { s.offset = CarrotMusic.position(s, ctx); s.playedBase += Math.max(0, ctx.currentTime - s.segmentStart); CarrotMusic.halt(s); }
      // Audio may have finished before its queued onended event is dispatched.
      // A nonlooping tail must never wrap to its beginning in that small window.
      if (!s.loop && s.offset >= s.buffer.duration) { s.finished = true; s.paused = false; }
      else s.paused = true;
    }
    else if (s.paused) CarrotMusic.start(s, s.offset);
  },
  // After a result, finish the current song instead of interrupting it. Pause retains the exact position.
  Carrot_MusicTail__deps: ['$CarrotMusic'],
  Carrot_MusicTail: function (index) {
    var s = CarrotMusic.slot(index), ctx = CarrotMusic.context(); if (!s || !ctx || !s.loop) return;
    // Rebase to this loop cycle before changing to a one-shot. Otherwise elapsed
    // time from previous cycles would look like an already-completed tail.
    s.offset = CarrotMusic.position(s, ctx); s.startedAt = ctx.currentTime - s.offset;
    s.loop = false; if (s.source) s.source.loop = false;
  },
  Carrot_MusicFinished__deps: ['$CarrotMusic'],
  Carrot_MusicFinished: function (index) { var s = CarrotMusic.slot(index); return s && s.finished ? 1 : 0; },
  Carrot_MusicStop__deps: ['$CarrotMusic'],
  Carrot_MusicStop: function (index) {
    var s = CarrotMusic.slot(index); if (!s) return;
    CarrotMusic.halt(s); try { s.gain.disconnect(); } catch (e) {}
    CarrotMusic.slots[index] = null;
    CarrotMusic.publish();
  }
});
