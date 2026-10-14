// Streamed music, decoded and played by the browser itself. Unity's DownloadHandlerAudioClip on the Web player refuses Ogg
// ("Streaming of ogg on this platform is not supported") and hands WebKit an empty clip after the MP3 decodes ("Loading FSB
// failed"), so CarrotAudio fetches each track here: fetch -> AudioContext.decodeAudioData -> an AudioBuffer kept only in
// browser memory (never copied into the wasm heap), played through two slots (A/B crossfade) of AudioBufferSourceNode + GainNode
// on Unity's own AudioContext (WEBAudio.audioContext, which Unity unlocks on the first gesture and suspends in the background).
mergeInto(LibraryManager.library, {
  $CarrotMusic: {
    tracks: {},
    slots: [null, null],
    own: null,
    context: function () {
      try { if (typeof WEBAudio !== 'undefined' && WEBAudio.audioContext) return WEBAudio.audioContext; } catch (e) {}
      if (!CarrotMusic.own) { var C = window.AudioContext || window.webkitAudioContext; CarrotMusic.own = C ? new C() : null; }
      return CarrotMusic.own;
    },
    slot: function (index) { return CarrotMusic.slots[index] || null; },
    // Starts (or restarts after a pause) the slot's source at an offset into the loop.
    start: function (s, offset) {
      var ctx = CarrotMusic.context(); if (!ctx || !s.buffer) return;
      try { if (ctx.state === 'suspended' && ctx.resume) ctx.resume(); } catch (e) {}
      var source = ctx.createBufferSource(); source.buffer = s.buffer; source.loop = true; source.connect(s.gain);
      offset = s.buffer.duration > 0 ? offset % s.buffer.duration : 0;
      source.start(0, offset); s.source = source; s.startedAt = ctx.currentTime - offset; s.paused = false;
    },
    halt: function (s) {
      if (!s.source) return;
      try { s.source.stop(); } catch (e) {}
      try { s.source.disconnect(); } catch (e) {}
      s.source = null;
    }
  },
  Carrot_MusicLoad__deps: ['$CarrotMusic'],
  Carrot_MusicLoad: function (namePtr, urlPtr) {
    var name = UTF8ToString(namePtr), url = UTF8ToString(urlPtr);
    var t = CarrotMusic.tracks[name];
    if (t && t.state !== -1) return;
    t = CarrotMusic.tracks[name] = { state: 0, buffer: null, seconds: 0 };
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
    var s = CarrotMusic.slot(index); if (s) { CarrotMusic.halt(s); try { s.gain.disconnect(); } catch (e) {} }
    s = CarrotMusic.slots[index] = { name: name, buffer: t.buffer, gain: ctx.createGain(), source: null, startedAt: 0, offset: 0, paused: false };
    s.gain.gain.value = volume; s.gain.connect(ctx.destination);
    CarrotMusic.start(s, 0);
    return 1;
  },
  Carrot_MusicVolume__deps: ['$CarrotMusic'],
  Carrot_MusicVolume: function (index, volume) {
    var s = CarrotMusic.slot(index), ctx = CarrotMusic.context(); if (!s || !ctx) return;
    try { s.gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.015); } catch (e) { s.gain.gain.value = volume; }
  },
  Carrot_MusicPause__deps: ['$CarrotMusic'],
  Carrot_MusicPause: function (index, paused) {
    var s = CarrotMusic.slot(index), ctx = CarrotMusic.context(); if (!s || !ctx) return;
    if (paused) { if (s.source) { s.offset = ctx.currentTime - s.startedAt; CarrotMusic.halt(s); } s.paused = true; }
    else if (s.paused) CarrotMusic.start(s, s.offset);
  },
  Carrot_MusicStop__deps: ['$CarrotMusic'],
  Carrot_MusicStop: function (index) {
    var s = CarrotMusic.slot(index); if (!s) return;
    CarrotMusic.halt(s); try { s.gain.disconnect(); } catch (e) {}
    CarrotMusic.slots[index] = null;
  }
});
