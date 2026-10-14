/*
 * Ink Maze level 26: the sandbox host, inside <iframe sandbox="allow-scripts">.
 *
 * It starts one (classic) worker per language runtime on demand, relays messages
 * over a MessagePort to the page (src/minigames/inkmaze/code/sandbox.ts), arms
 * a compile budget and then a run budget for every run and terminates the
 * worker (and every child it spawned) when one runs out, caps the output it
 * forwards, checks every field a worker sends, and sends a heartbeat.
 *
 * The protocol, the limits and the cooperative-deadline rules (D1-D9) are in
 * src/minigames/inkmaze/code/contract.ts. The worker's first script, PRELUDE
 * below, gives each runtime its RuntimeHost and RunIO; the deadline is checked
 * from inside the program (io.check()), and terminate() here is only the D5
 * backstop. Nothing here judges or formats: the page does that.
 */
;(function () {
  'use strict'

  var PROTOCOL = 1
  var HEARTBEAT_MS = 250
  var HOST_GRACE_MS = 1000
  var OUTPUT_SLACK = 65536
  var RUNTIMES = ['java', 'python', 'javascript', 'clang', 'echo']
  var STATUSES = ['ok', 'compile_error', 'runtime_error', 'time_limit', 'memory_limit', 'output_limit', 'crashed']
  var LIMIT_STATUSES = ['time_limit', 'memory_limit', 'output_limit']
  var SEVERITIES = ['error', 'warning', 'note']
  var CHILD_HELLO = 'ink-sandbox-child'
  var DEBUG = /inkdebug/.test(location.hash)

  // ------------------------------------------------------------ the prelude
  // The worker's own code. Stringified, so it must not refer to anything
  // outside itself. It runs as a CLASSIC worker from a blob: URL: Chromium
  // refuses module workers from blob: URLs in an opaque origin (the error event
  // has no message), while import() of a blob: module works in classic workers
  // in both engines, so runtime modules are imported that way.
  function PRELUDE() {
    'use strict'
    var G = self
    // private references, taken before any runtime or player code runs
    var post = G.postMessage.bind(G)
    var realClose = G.close.bind(G)
    var perf = G.performance
    var now = perf.now.bind(perf)
    var timeOrigin = perf.timeOrigin
    var listen = G.addEventListener.bind(G)
    var BlobC = G.Blob
    var createURL = G.URL.createObjectURL.bind(G.URL)
    var revokeURL = G.URL.revokeObjectURL.bind(G.URL)
    var JSONs = G.JSON.stringify.bind(G.JSON)
    var JSONp = G.JSON.parse.bind(G.JSON)
    var decoder = new G.TextDecoder()
    var getProto = Object.getPrototypeOf
    var defineProp = Object.defineProperty
    var NET = ['fetch', 'XMLHttpRequest', 'WebSocket', 'WebSocketStream', 'WebTransport', 'EventSource', 'importScripts',
      'Worker', 'SharedWorker', 'BroadcastChannel', 'indexedDB', 'caches', 'postMessage']
    var LIMITS = ['time_limit', 'memory_limit', 'output_limit']
    var TICK_MS = 250
    var FLUSH_MS = 50
    var FLUSH_CHARS = 16384

    var cfg = null
    var runtime = null
    var ready = false
    var busy = false
    var locked = false
    var closedSent = false
    var warming = Promise.resolve()
    var seq = 1
    var waiters = new Map()
    var children = new Map()

    var LIMIT_TEXT = {
      time_limit: 'Your code ran past its time limit.',
      memory_limit: 'Your code used more memory than it may.',
      output_limit: 'Your code printed more than it may.',
    }
    class LimitError extends Error {
      constructor(limit, message) {
        super(message || LIMIT_TEXT[limit] || 'A limit was hit.')
        this.name = 'LimitError'
        this.limit = limit
      }
    }

    function text(e, max) {
      var s
      try { s = String(e && e.message !== undefined ? e.message : e) } catch (x) { s = 'unknown error' }
      return s.slice(0, max || 2000)
    }
    function safePost(message, transfer) {
      try { post(message, transfer || []) } catch (e) {
        // something in it could not be cloned (a runtime put a function in its outcome)
        try { post(JSONp(JSONs(message))) } catch (e2) { post({ type: message.type, runId: message.runId, outcome: { status: 'crashed', message: 'The runtime sent a result that could not be read.', healthy: false } }) }
      }
    }
    function seconds(ms) { return (Math.round(ms / 100) / 10) + ' s' }

    // ---- assets and children, through the host
    function asset(path) {
      if (typeof path !== 'string') return Promise.reject(new TypeError('an asset path must be a string'))
      var id = seq++
      return new Promise(function (resolve, reject) {
        waiters.set(id, { resolve: resolve, reject: reject })
        post({ type: 'asset', id: id, path: path })
      })
    }
    function spawn(path) {
      if (typeof path !== 'string') return Promise.reject(new TypeError('a child script path must be a string'))
      var id = seq++
      return new Promise(function (resolve, reject) {
        waiters.set(id, {
          resolve: function (port) {
            var child = {
              port: port,
              onerror: null,
              terminate: function () {
                if (children.delete(id)) post({ type: 'kill', id: id })
                try { port.close() } catch (e) {}
              },
            }
            children.set(id, child)
            resolve(child)
          },
          reject: reject,
        })
        post({ type: 'spawn', id: id, path: path })
      })
    }
    function settle(id, ok, value, error) {
      var w = waiters.get(id)
      if (!w) return
      waiters.delete(id)
      if (ok) w.resolve(value)
      else w.reject(new Error(typeof error === 'string' ? error : 'the sandbox could not provide it'))
    }

    function lockdown() {
      if (locked) return
      locked = true
      var targets = [G]
      for (var p = getProto(G); p && p !== Object.prototype; p = getProto(p)) targets.push(p)
      for (var i = 0; i < NET.length; i++) {
        for (var t = 0; t < targets.length; t++) {
          try { delete targets[t][NET[i]] } catch (e) {}
        }
        try { if (NET[i] in G) defineProp(G, NET[i], { value: undefined, writable: false, configurable: false }) } catch (e) {}
      }
      var close = function close() {
        if (!closedSent) { closedSent = true; post({ type: 'closed' }) }
        realClose()
      }
      for (var c = 0; c < targets.length; c++) { try { delete targets[c].close } catch (e) {} }
      try { defineProp(G, 'close', { value: close, writable: false, configurable: false }) } catch (e) {}
    }

    function makeHost() {
      return Object.freeze({
        runtime: cfg.runtime,
        protocol: cfg.protocol,
        base: cfg.base,
        LimitError: LimitError,
        progress: function (label, done, total) {
          post({ type: 'progress', label: String(label == null ? '' : label).slice(0, 200), done: Number(done) || 0, total: Number(total) || 0 })
        },
        asset: asset,
        assetText: function (path) { return asset(path).then(function (buf) { return decoder.decode(buf) }) },
        assetUrl: function (path, type) {
          return asset(path).then(function (buf) { return createURL(new BlobC([buf], { type: type || 'application/octet-stream' })) })
        },
        importModule: function (path) {
          return asset(path).then(function (buf) {
            var url = createURL(new BlobC([buf], { type: 'text/javascript' }))
            return import(url).then(function (mod) { revokeURL(url); return mod }, function (e) { revokeURL(url); throw e })
          })
        },
        spawn: spawn,
        lockdown: lockdown,
        now: now,
        log: function () {
          if (!cfg.debug) return
          try { console.log.apply(console, ['[ink ' + cfg.runtime + ']'].concat(Array.prototype.slice.call(arguments))) } catch (e) {}
        },
      })
    }

    // ---- one run's RunIO (D1-D6). `ctl` is the prelude's private side of it.
    function makeIO(job) {
      var compileDeadline = now() + job.compileLimitMs
      var runDeadline = Infinity
      var started = false
      var limit = null
      var limitMessage = null
      var outChars = 0
      var pendOut = ''
      var pendErr = ''
      var lastFlush = now()
      var lastTick = now()
      function deadline() { return started ? runDeadline : compileDeadline }
      function flush() {
        if (pendOut) { post({ type: 'output', runId: job.runId, stream: 'stdout', text: pendOut }); pendOut = '' }
        if (pendErr) { post({ type: 'output', runId: job.runId, stream: 'stderr', text: pendErr }); pendErr = '' }
        lastFlush = now()
      }
      function hit(l, message) {
        if (LIMITS.indexOf(l) < 0) throw new TypeError('io.hit: unknown limit ' + l)
        if (!limit) { limit = l; limitMessage = typeof message === 'string' ? message.slice(0, 500) : null }
      }
      function write(stream, value) {
        if (limit) throw new LimitError(limit, limitMessage)
        var s = typeof value === 'string' ? value : String(value)
        if (!s) return
        var room = job.outputLimit - outChars
        if (s.length > room) {
          if (room > 0) { if (stream === 'stdout') pendOut += s.slice(0, room); else pendErr += s.slice(0, room) }
          outChars = job.outputLimit
          hit('output_limit', 'Your code printed more than ' + job.outputLimit + ' characters.')
          flush()
          throw new LimitError('output_limit', limitMessage)
        }
        outChars += s.length
        if (stream === 'stdout') pendOut += s
        else pendErr += s
        if (pendOut.length + pendErr.length >= FLUSH_CHARS || now() - lastFlush >= FLUSH_MS) flush()
      }
      function check() {
        var t = now()
        if (limit) { if (pendOut || pendErr) flush(); throw new LimitError(limit, limitMessage) }
        if (t > deadline()) {
          hit('time_limit', started ? 'Your code ran longer than ' + seconds(job.timeLimitMs) + '.' : 'Compiling your code took longer than ' + seconds(job.compileLimitMs) + '.')
          flush()
          throw new LimitError('time_limit', limitMessage)
        }
        if (t - lastTick >= TICK_MS) { lastTick = t; post({ type: 'tick', runId: job.runId }) }
        if ((pendOut || pendErr) && t - lastFlush >= FLUSH_MS) flush()
      }
      var io = {
        job: job,
        LimitError: LimitError,
        stdout: function (s) { write('stdout', s) },
        stderr: function (s) { write('stderr', s) },
        started: function () {
          if (started) return
          started = true
          runDeadline = now() + job.timeLimitMs
          post({ type: 'phase', runId: job.runId, phase: 'running' })
        },
        check: check,
        now: now,
        timeLeft: function () { return deadline() - now() },
        hit: hit,
      }
      defineProp(io, 'deadline', { get: deadline, enumerable: true })
      defineProp(io, 'deadlineEpochMs', { get: function () { return timeOrigin + deadline() }, enumerable: true })
      defineProp(io, 'limit', { get: function () { return limit }, enumerable: true })
      var ctl = { flush: flush, limit: function () { return limit }, message: function () { return limitMessage } }
      return [Object.freeze(io), ctl]
    }

    function init(m) {
      if (cfg) return
      cfg = { runtime: String(m.runtime), protocol: m.protocol, base: String(m.base || ''), debug: !!m.debug }
      var host = makeHost()
      var t0 = now()
      asset(m.script).then(function (buf) {
        var url = createURL(new BlobC([buf], { type: 'text/javascript' }))
        return import(url)
      }).then(function (mod) {
        runtime = mod && (mod.default || mod.runtime)
        if (!runtime || typeof runtime.load !== 'function' || typeof runtime.run !== 'function') throw new Error('the runtime module has no load() and run()')
        if (runtime.id !== cfg.runtime) throw new Error('the runtime module says it is ' + runtime.id + ', not ' + cfg.runtime)
        return runtime.load(host)
      }).then(function (info) {
        ready = true
        var plain = {}
        try { plain = info && typeof info === 'object' ? JSONp(JSONs(info)) : {} } catch (e) {}
        post({ type: 'ready', info: plain, ms: Math.round(now() - t0) })
        if (typeof runtime.warm === 'function') {
          try { warming = Promise.resolve(runtime.warm()).catch(function () {}) } catch (e) {}
        }
      }).catch(function (e) {
        post({ type: 'fatal', message: text(e) })
      })
    }

    function finish(job, outcome, ctl) {
      ctl.flush()
      var limit = ctl.limit()
      // a limit, once hit, is the outcome whatever the runtime says afterwards (D3, D6)
      if (limit && outcome.status !== limit) {
        outcome = { status: limit, message: ctl.message() || undefined, error: outcome.error || null, diagnostics: outcome.diagnostics, healthy: false }
      }
      busy = false
      var footprint
      try {
        var f = typeof runtime.footprint === 'function' ? runtime.footprint() : null
        if (f && typeof f.memoryBytes === 'number' && f.memoryBytes >= 0) footprint = { memoryBytes: Math.round(f.memoryBytes) }
      } catch (e) {}
      safePost({ type: 'done', runId: job.runId, outcome: outcome, footprint: footprint })
    }

    function startRun(job) {
      if (!job || typeof job.runId !== 'string') return
      if (!ready || busy) {
        post({ type: 'done', runId: job.runId, outcome: { status: 'crashed', message: ready ? 'The language runtime was busy.' : 'The language runtime was not ready.', healthy: false } })
        return
      }
      busy = true
      var pair = makeIO(job)
      var io = pair[0]
      var ctl = pair[1]
      warming.then(function () { return runtime.run(job, io) }).then(function (outcome) {
        finish(job, outcome && typeof outcome === 'object' ? outcome : { status: 'crashed', message: 'The language runtime returned no result.', healthy: false }, ctl)
      }, function (e) {
        if (e && (e instanceof LimitError || e.name === 'LimitError') && LIMITS.indexOf(e.limit) >= 0) {
          finish(job, { status: e.limit, message: ctl.message() || text(e, 500), healthy: false }, ctl)
        } else {
          finish(job, { status: 'crashed', message: 'The language runtime failed: ' + text(e, 500), healthy: false }, ctl)
        }
      })
    }

    function dispose() {
      children.forEach(function (child) { child.terminate() })
      var done = function () { realClose() }
      try {
        var r = runtime && typeof runtime.dispose === 'function' ? runtime.dispose() : null
        if (r && typeof r.then === 'function') r.then(done, done)
        else done()
      } catch (e) { done() }
    }

    // Only trusted events: player code could dispatchEvent() a forged 'run' or 'dispose'.
    listen('message', function (ev) {
      if (!ev.isTrusted) return
      var m = ev.data
      if (!m || typeof m !== 'object') return
      switch (m.type) {
        case 'init': init(m); break
        case 'asset': settle(m.id, m.ok, m.data, m.error); break
        case 'spawned': settle(m.id, m.ok && ev.ports && ev.ports[0], ev.ports && ev.ports[0], m.error); break
        case 'child-error': {
          var child = children.get(m.id)
          if (child && typeof child.onerror === 'function') { try { child.onerror(String(m.message)) } catch (e) {} }
          break
        }
        case 'run': startRun(m.job); break
        case 'dispose': dispose(); break
      }
    })
  }

  // ------------------------------------------------------------ host side

  var port = null
  var BASE = ''
  var slots = Object.create(null)
  var nextId = 1
  var assetWaiters = Object.create(null)
  var preludeUrl = null
  var clock = performance.now.bind(performance)

  function send(message, transfer) {
    if (!port) return
    try { port.postMessage(message, transfer || []) } catch (e) {}
  }
  function str(value, max) {
    if (typeof value !== 'string') return ''
    return value.length > max ? value.slice(0, max) : value
  }
  function int(value, min, max) {
    return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : null
  }
  function errorText(ev) {
    return str((ev && (ev.message || (ev.error && ev.error.message))) || 'the worker failed', 500)
  }

  // ---- what a worker or the page sends is checked field by field
  function cleanDiagnostic(d) {
    if (!d || typeof d !== 'object') return null
    return {
      line: int(d.line, 1, 1e7),
      column: int(d.column, 1, 1e7),
      endLine: int(d.endLine, 1, 1e7),
      endColumn: int(d.endColumn, 1, 1e7),
      severity: SEVERITIES.indexOf(d.severity) >= 0 ? d.severity : 'error',
      message: str(d.message, 2000) || 'error',
    }
  }
  function cleanError(e) {
    if (!e || typeof e !== 'object') return null
    var out = { type: str(e.type, 200) || 'Error', message: str(e.message, 2000), line: int(e.line, 1, 1e7), column: int(e.column, 1, 1e7), test: int(e.test, 0, 1000) }
    if (typeof e.trace === 'string') out.trace = str(e.trace, 8000)
    return out
  }
  function cleanOutcome(o) {
    if (!o || typeof o !== 'object') return { status: 'crashed', message: 'The language runtime sent no result.', healthy: false }
    var status = STATUSES.indexOf(o.status) >= 0 ? o.status : null
    var out = {
      status: status || 'crashed',
      diagnostics: Array.isArray(o.diagnostics) ? o.diagnostics.slice(0, 100).map(cleanDiagnostic).filter(Boolean) : [],
      error: cleanError(o.error),
    }
    if (!status) out.message = 'The language runtime reported something unknown.'
    else if (typeof o.message === 'string' && o.message) out.message = str(o.message, 2000)
    if (typeof o.healthy === 'boolean') out.healthy = o.healthy
    if (!status) out.healthy = false
    return out
  }
  function cleanInfo(info) {
    try {
      var json = JSON.stringify(info && typeof info === 'object' ? info : {})
      return json.length <= 4096 ? JSON.parse(json) : {}
    } catch (e) { return {} }
  }
  function cleanJob(j) {
    if (!j || typeof j !== 'object') return null
    var job = {
      runId: str(j.runId, 100),
      language: str(j.language, 20),
      kind: j.kind === 'submit' ? 'submit' : 'run',
      source: typeof j.source === 'string' ? j.source : null,
      stdin: typeof j.stdin === 'string' ? j.stdin : null,
      tests: int(j.tests, 1, 1000),
      timeLimitMs: int(j.timeLimitMs, 1, 600000),
      compileLimitMs: int(j.compileLimitMs, 1, 600000),
      memoryLimitBytes: int(j.memoryLimitBytes, 1, 4294967296),
      outputLimit: int(j.outputLimit, 1, 1e9),
      answerChars: int(j.answerChars, 1, 1e9),
      recursionDepth: int(j.recursionDepth, 1, 1e9),
    }
    for (var key in job) if (job[key] === null) return null
    if (!job.runId || !job.language || !job.stdin || job.source.length > 1e6 || job.stdin.length > 1e6) return null
    return job
  }

  // ---- slots: one per runtime, one worker at a time
  function Slot(runtime, script, loadLimitMs) {
    this.runtime = runtime
    this.script = script
    this.loadLimitMs = loadLimitMs
    this.worker = null
    this.gen = 0
    this.status = 'loading'
    this.info = {}
    this.run = null
    this.queued = null
    this.children = Object.create(null)
    this.loadTimer = 0
  }

  function getPreludeUrl() {
    if (!preludeUrl) preludeUrl = URL.createObjectURL(new Blob(['(' + PRELUDE.toString() + ')()\n'], { type: 'text/javascript' }))
    return preludeUrl
  }

  function killChildren(slot) {
    for (var id in slot.children) {
      var child = slot.children[id]
      try { child.worker.terminate() } catch (e) {}
      try { URL.revokeObjectURL(child.url) } catch (e) {}
    }
    slot.children = Object.create(null)
  }

  function stopWorker(slot) {
    slot.gen++
    clearTimeout(slot.loadTimer)
    killChildren(slot)
    if (slot.worker) {
      try { slot.worker.postMessage({ type: 'dispose' }) } catch (e) {}
      try { slot.worker.terminate() } catch (e) {}
      slot.worker = null
    }
  }

  function startWorker(slot) {
    stopWorker(slot)
    var gen = slot.gen
    slot.status = 'loading'
    send({ type: 'runtime', runtime: slot.runtime, status: 'loading' })
    var worker
    try {
      worker = new Worker(getPreludeUrl(), { name: 'ink-' + slot.runtime })
    } catch (e) {
      loadFailed(slot, 'This browser cannot start the language runtime (' + str(String(e && e.message || e), 200) + ').')
      return
    }
    slot.worker = worker
    worker.onmessage = function (ev) { if (slot.gen === gen) onWorkerMessage(slot, gen, ev) }
    worker.onerror = function (ev) {
      if (ev && ev.preventDefault) ev.preventDefault()
      if (slot.gen === gen) onWorkerError(slot, errorText(ev))
    }
    worker.onmessageerror = function () {}
    worker.postMessage({ type: 'init', runtime: slot.runtime, script: slot.script, protocol: PROTOCOL, base: BASE, debug: DEBUG })
    slot.loadTimer = setTimeout(function () {
      if (slot.gen === gen && slot.status === 'loading') loadFailed(slot, 'The language runtime did not start within ' + Math.round(slot.loadLimitMs / 1000) + ' s.')
    }, slot.loadLimitMs)
  }

  function loadFailed(slot, message) {
    stopWorker(slot)
    slot.status = 'failed'
    send({ type: 'runtime', runtime: slot.runtime, status: 'failed', message: str(message, 500) })
    if (slot.queued) { send({ type: 'rejected', runId: slot.queued.runId, reason: 'not_ready' }); slot.queued = null }
    if (slot.run) finishRun(slot, { status: 'crashed', message: 'The language runtime stopped working: ' + str(message, 300), healthy: false }, null, true)
  }

  function onWorkerError(slot, message) {
    if (slot.status === 'loading') { loadFailed(slot, message); return }
    if (slot.run) finishRun(slot, { status: 'crashed', message: 'The language runtime failed: ' + message, healthy: false }, null)
    else startWorker(slot)
  }

  function onWorkerMessage(slot, gen, ev) {
    var m = ev.data
    if (!m || typeof m !== 'object') return
    var run = slot.run
    var mine = run && m.runId === run.runId
    switch (m.type) {
      case 'ready':
        if (slot.status !== 'loading') return
        clearTimeout(slot.loadTimer)
        slot.status = 'ready'
        slot.info = cleanInfo(m.info)
        send({ type: 'runtime', runtime: slot.runtime, status: 'ready', info: slot.info, ms: int(m.ms, 0, 1e9) || 0 })
        if (slot.queued) { var job = slot.queued; slot.queued = null; startRun(slot, job) }
        break
      case 'fatal':
        if (slot.status === 'loading') loadFailed(slot, str(m.message, 500) || 'the language runtime failed to load')
        else onWorkerError(slot, str(m.message, 500))
        break
      case 'progress':
        if (slot.status === 'loading') send({ type: 'progress', runtime: slot.runtime, label: str(m.label, 200), done: Math.max(0, Number(m.done) || 0), total: Math.max(0, Number(m.total) || 0) })
        break
      case 'asset':
        if (int(m.id, 1, 1e9) === null) return
        requestAsset(m.path, function (ok, data, error) {
          if (slot.gen !== gen || !slot.worker) return
          if (ok) slot.worker.postMessage({ type: 'asset', id: m.id, ok: true, data: data }, [data])
          else slot.worker.postMessage({ type: 'asset', id: m.id, ok: false, error: error })
        })
        break
      case 'spawn':
        if (int(m.id, 1, 1e9) === null) return
        requestAsset(m.path, function (ok, data, error) {
          if (slot.gen !== gen || !slot.worker) return
          if (!ok) { slot.worker.postMessage({ type: 'spawned', id: m.id, ok: false, error: error }); return }
          spawnChild(slot, gen, m.id, data)
        })
        break
      case 'kill': {
        var child = slot.children[m.id]
        if (child) {
          delete slot.children[m.id]
          try { child.worker.terminate() } catch (e) {}
          try { URL.revokeObjectURL(child.url) } catch (e) {}
        }
        break
      }
      case 'phase':
        if (mine && m.phase === 'running' && run.phase === 'compiling') {
          run.phase = 'running'
          run.tRun = clock()
          clearTimeout(run.timer)
          run.timer = setTimeout(function () { onBudget(slot, run.runId) }, run.job.timeLimitMs + HOST_GRACE_MS)
          send({ type: 'phase', runId: run.runId, phase: 'running' })
        }
        break
      case 'output': {
        if (!mine || (m.stream !== 'stdout' && m.stream !== 'stderr') || typeof m.text !== 'string') return
        var room = run.job.outputLimit - run.outChars
        if (room > 0) send({ type: 'output', runId: run.runId, stream: m.stream, text: m.text.length > room ? m.text.slice(0, room) : m.text })
        run.outChars += m.text.length
        // the prelude stops the program at the limit; a worker that keeps sending is not ours any more
        if (run.outChars > run.job.outputLimit + OUTPUT_SLACK) hostStop(slot, 'output_limit', 'Your code printed more than ' + run.job.outputLimit + ' characters.')
        break
      }
      case 'tick':
        if (mine) run.ticks++
        break
      case 'done':
        if (mine) {
          var outcome = cleanOutcome(m.outcome)
          var memory = m.footprint && typeof m.footprint === 'object' ? int(m.footprint.memoryBytes, 0, 1e12) : null
          finishRun(slot, outcome, LIMIT_STATUSES.indexOf(outcome.status) >= 0 ? 'runtime' : null, false, memory)
        }
        break
      case 'closed':
        if (run) finishRun(slot, { status: 'crashed', message: 'Your code closed the worker it was running in.', healthy: false }, null)
        else startWorker(slot)
        break
    }
  }

  function spawnChild(slot, gen, id, data) {
    var url = URL.createObjectURL(new Blob([data], { type: 'text/javascript' }))
    var child
    try {
      // classic, like the runtime workers (see PRELUDE)
      child = new Worker(url, { name: 'ink-' + slot.runtime + '-child' })
    } catch (e) {
      URL.revokeObjectURL(url)
      slot.worker.postMessage({ type: 'spawned', id: id, ok: false, error: str(String(e && e.message || e), 300) })
      return
    }
    slot.children[id] = { worker: child, url: url }
    child.onerror = function (ev) {
      if (ev && ev.preventDefault) ev.preventDefault()
      if (slot.gen === gen && slot.worker) slot.worker.postMessage({ type: 'child-error', id: id, message: errorText(ev) })
    }
    var channel = new MessageChannel()
    child.postMessage({ type: CHILD_HELLO, protocol: PROTOCOL }, [channel.port2])
    slot.worker.postMessage({ type: 'spawned', id: id, ok: true }, [channel.port1])
  }

  // ---- runs
  function startRun(slot, job) {
    var run = { runId: job.runId, job: job, phase: 'compiling', timer: 0, ticks: 0, outChars: 0, t0: clock(), tRun: 0 }
    slot.run = run
    run.timer = setTimeout(function () { onBudget(slot, run.runId) }, job.compileLimitMs + HOST_GRACE_MS)
    send({ type: 'phase', runId: job.runId, phase: 'compiling' })
    slot.worker.postMessage({ type: 'run', job: job })
  }

  // D5: the budget ran out and the runtime did not report. Terminate it.
  function onBudget(slot, runId) {
    var run = slot.run
    if (!run || run.runId !== runId) return
    hostStop(slot, 'time_limit', run.phase === 'running'
      ? 'Your code ran past its time limit and did not stop by itself, so the sandbox stopped it.'
      : 'Compiling took too long, so the sandbox stopped it.')
  }

  function hostStop(slot, status, message) {
    finishRun(slot, { status: status, message: message, healthy: false }, 'host')
  }

  function finishRun(slot, outcome, stoppedBy, noRestart, memoryBytes) {
    var run = slot.run
    if (!run) return
    clearTimeout(run.timer)
    slot.run = null
    var t = clock()
    var done = {
      type: 'done', runId: run.runId, outcome: outcome, stoppedBy: stoppedBy,
      compileMs: Math.round((run.tRun || t) - run.t0), runMs: run.tRun ? Math.round(t - run.tRun) : 0,
      ticks: run.ticks, outputChars: run.outChars,
    }
    if (typeof memoryBytes === 'number') done.memoryBytes = memoryBytes
    send(done)
    var healthy = typeof outcome.healthy === 'boolean' ? outcome.healthy : (outcome.status === 'ok' || outcome.status === 'compile_error' || outcome.status === 'runtime_error')
    if (!healthy && !noRestart) startWorker(slot)
  }

  // ---- assets: the page fetches self-hosted files and sends the bytes
  function requestAsset(path, deliver) {
    var id = nextId++
    assetWaiters[id] = deliver
    send({ type: 'asset', id: id, path: str(path, 300) })
  }

  function onPage(m) {
    if (!m || typeof m !== 'object') return
    var slot
    switch (m.type) {
      case 'load': {
        if (RUNTIMES.indexOf(m.runtime) < 0) { send({ type: 'runtime', runtime: m.runtime, status: 'failed', message: 'unknown runtime' }); return }
        slot = slots[m.runtime]
        var limit = int(m.loadLimitMs, 1000, 3600000) || 180000
        if (!slot) {
          slot = slots[m.runtime] = new Slot(m.runtime, str(m.script, 200), limit)
          startWorker(slot)
        } else if (slot.status === 'failed') {
          slot.loadLimitMs = limit
          startWorker(slot)
        } else if (slot.status === 'ready') {
          send({ type: 'runtime', runtime: slot.runtime, status: 'ready', info: slot.info })
        }
        break
      }
      case 'unload':
        slot = slots[m.runtime]
        if (!slot) return
        if (slot.run) finishRun(slot, { status: 'cancelled', message: 'Stopped.', healthy: false }, 'host', true)
        stopWorker(slot)
        delete slots[m.runtime]
        send({ type: 'runtime', runtime: m.runtime, status: 'gone' })
        break
      case 'run': {
        var job = cleanJob(m.job)
        var runId = m.job && typeof m.job.runId === 'string' ? str(m.job.runId, 100) : ''
        if (!job) { send({ type: 'rejected', runId: runId, reason: 'bad_job' }); return }
        slot = slots[m.runtime]
        if (!slot) { send({ type: 'rejected', runId: runId, reason: 'unknown_runtime' }); return }
        if (slot.run || slot.queued) { send({ type: 'rejected', runId: runId, reason: 'busy' }); return }
        if (slot.status === 'failed') { send({ type: 'rejected', runId: runId, reason: 'not_ready' }); return }
        if (slot.status === 'ready' && slot.worker) startRun(slot, job)
        else slot.queued = job // starts on 'ready'
        break
      }
      case 'cancel':
        for (var id in slots) {
          slot = slots[id]
          if (slot.run && slot.run.runId === m.runId) finishRun(slot, { status: 'cancelled', message: 'Stopped.', healthy: false }, 'host')
          else if (slot.queued && slot.queued.runId === m.runId) {
            slot.queued = null
            send({ type: 'done', runId: m.runId, outcome: { status: 'cancelled', message: 'Stopped.' }, stoppedBy: null, compileMs: 0, runMs: 0, ticks: 0, outputChars: 0 })
          }
        }
        break
      case 'asset': {
        var deliver = assetWaiters[m.id]
        if (!deliver) return
        delete assetWaiters[m.id]
        if (m.ok && m.data instanceof ArrayBuffer) deliver(true, m.data)
        else deliver(false, null, str(m.error, 300) || 'not found')
        break
      }
      case 'shutdown':
        for (var key in slots) stopWorker(slots[key])
        slots = Object.create(null)
        break
    }
  }

  function busyList() {
    var out = []
    for (var id in slots) if (slots[id].run) out.push(id)
    return out
  }
  function beat() { send({ type: 'beat', at: Date.now(), busy: busyList() }) }

  function onConnect(ev) {
    if (ev.source !== parent || port) return
    var m = ev.data
    if (!m || m.type !== 'ink-sandbox-connect' || m.protocol !== PROTOCOL) return
    var p = ev.ports && ev.ports[0]
    if (!p) return
    port = p
    BASE = str(m.base, 2000)
    port.onmessage = function (e) { onPage(e.data) }
    removeEventListener('message', onConnect)
    beat()
    setInterval(beat, HEARTBEAT_MS)
  }

  addEventListener('message', onConnect)
  parent.postMessage({ type: 'ink-sandbox-hello', protocol: PROTOCOL }, '*')
})()
