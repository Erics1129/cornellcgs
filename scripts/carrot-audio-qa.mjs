// Carrot Defense audio QA: plays real levels in Playwright (Chromium and WebKit) with a tap on the final mix and reports
// loudness, clipping, repetition and cue timing; optionally records the mix for a listening reel.
//
// usage: node scripts/carrot-audio-qa.mjs --build <dir with Build/ and StreamingAssets/> [--name carrot]
//          [--engine chromium|webkit|both] [--scenario menu,l24,l8,asuna|all] [--minutes 3] [--speed 1] [--record]
//          [--out <dir>] [--gains makeupDb,outputDb] [--coins 9000 (debugCoins seed; 0 = earned coins only)]
//          [--volumes '{"music":0}' (CarrotAudio.SetVolumes, for stem measurements)]
//   The page is a bare harness (no site chrome): it loads <build>/Build/<name>.loader.js from a plain static server with
//   no custom headers (the GitHub Pages model), seeds coins with `debugCoins` where the build has it (QA/dev builds),
//   and drives the documented commands (load, select, buy, upgrade, start, speed, next).
// Gates (audio stream acceptance): combat RMS median -20 +- 2 dBFS, p90 <= -14 dBFS, peak <= -1 dBFS, 0 clipped
// samples; top-7 clips <= 45% of sound starts, no clip above 12%, >= 80 distinct buffers; cue timing from the
// game's own cue log (window.carrotAudioBus.cues) where the build has it.
import { createServer } from 'node:http'
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const PW = process.env.PLAYWRIGHT_MODULE || '/Users/eric/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
const { chromium, webkit } = await import(PW)
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d }
const flag = k => process.argv.includes('--' + k)
const build = resolve(arg('build', join(repo, 'public/unity/carrot')))
const name = arg('name', 'carrot')
const engines = arg('engine', 'chromium') === 'both' ? ['chromium', 'webkit'] : [arg('engine', 'chromium')]
const scenarios = (arg('scenario', 'l24') === 'all' ? 'menu,l24,l8,asuna' : arg('scenario', 'l24')).split(',')
const minutes = Number(arg('minutes', '3')), speed = Number(arg('speed', '1')), record = flag('record')
const out = resolve(arg('out', join(repo, 'output/carrot-audio-qa'))); mkdirSync(out, { recursive: true })
const gains = arg('gains', ''), volumes = arg('volumes', ''), seedCoins = Number(arg('coins', '9000'))
const DATA = JSON.parse(readFileSync(join(repo, 'public/assets/minigames/carrot/game-data.json'), 'utf8'))
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ---------- static server (no Content-Encoding: the loader inflates .unityweb itself) ----------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.unityweb': 'application/octet-stream' }
const HARNESS = `<!doctype html><html><head><meta charset="utf-8"><title>Carrot audio QA</title>
<style>html,body{margin:0;background:#0b120d;height:100%}canvas{width:100%;height:100%;display:block}</style></head>
<body><canvas id="c" tabindex="0"></canvas><script>
window.addEventListener('carrot-state', e => { window.__state = e.detail; window.__states = (window.__states || 0) + 1 });
const s = document.createElement('script'); s.src = 'Build/${name}.loader.js';
s.onload = () => createUnityInstance(document.getElementById('c'), { dataUrl: 'Build/${name}.data.unityweb', frameworkUrl: 'Build/${name}.framework.js.unityweb', codeUrl: 'Build/${name}.wasm.unityweb', streamingAssetsUrl: 'StreamingAssets', companyName: 'QA', productName: 'QA', productVersion: '1' }).then(i => { window.__inst = i }).catch(e => { window.__error = String(e) });
document.head.append(s);
</script></body></html>`
const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0])
  if (url === '/' || url === '/index.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(HARNESS) }
  const file = join(build, url)
  if (!file.startsWith(build) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); return res.end() }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Content-Length': statSync(file).size })
  createReadStream(file).pipe(res)
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}/`

// ---------- in-page instrumentation ----------
const INIT = `(() => {
  const W = window; W.__qa = { starts: [], blocks: [], clipped: 0, peak: 0, rec: [], recording: false, ctxRate: 0, buffers: 0 };
  const ids = new WeakMap(); let next = 1; const id = b => { if (!b) return 0; let i = ids.get(b); if (!i) { i = next++; ids.set(b, i); W.__qa.buffers = i; } return i; };
  const BS = W.AudioBufferSourceNode && W.AudioBufferSourceNode.prototype;
  if (BS) { const st = BS.start; BS.start = function () { try { const b = this.buffer; W.__qa.starts.push([performance.now(), id(b), b ? Math.round(b.duration * 1000) : 0, this.loop ? 1 : 0]); if (W.__qa.starts.length > 200000) W.__qa.starts.splice(0, 50000); } catch (e) {} return st.apply(this, arguments); }; }
  // Tap: everything that reaches a destination also feeds a ScriptProcessor that measures (and optionally records) it.
  const AN = W.AudioNode && W.AudioNode.prototype; const taps = new Map();
  const tapFor = ctx => { let t = taps.get(ctx); if (t) return t;
    const sp = ctx.createScriptProcessor(4096, 2, 2), sum = ctx.createGain(); t = { sp, sum }; taps.set(ctx, t); W.__qa.ctxRate = ctx.sampleRate;
    origConnect.call(sum, sp); origConnect.call(sp, ctx.destination);
    sp.onaudioprocess = ev => { const l = ev.inputBuffer.getChannelData(0), r = ev.inputBuffer.numberOfChannels > 1 ? ev.inputBuffer.getChannelData(1) : l; let s = 0, p = 0, c = 0;
      for (let i = 0; i < l.length; i++) { const a = l[i], b = r[i]; s += a * a + b * b; const m = Math.max(Math.abs(a), Math.abs(b)); if (m > p) p = m; if (m >= 1) c++; }
      const rms = Math.sqrt(s / (2 * l.length)); W.__qa.blocks.push([performance.now(), rms, p]); if (W.__qa.blocks.length > 400000) W.__qa.blocks.splice(0, 100000);
      W.__qa.clipped += c; if (p > W.__qa.peak) W.__qa.peak = p;
      if (W.__qa.recording) { const pcm = new Int16Array(l.length * 2); for (let i = 0; i < l.length; i++) { pcm[2 * i] = Math.max(-32768, Math.min(32767, Math.round(l[i] * 32767))); pcm[2 * i + 1] = Math.max(-32768, Math.min(32767, Math.round(r[i] * 32767))); } W.__qa.rec.push(pcm); }
      const o0 = ev.outputBuffer.getChannelData(0); o0.fill(0); if (ev.outputBuffer.numberOfChannels > 1) ev.outputBuffer.getChannelData(1).fill(0); };
    return t; };
  const origConnect = AN ? AN.connect : null;
  if (AN) AN.connect = function (dest) { try { if (W.AudioDestinationNode && dest instanceof W.AudioDestinationNode && !(this instanceof W.ScriptProcessorNode)) { origConnect.call(this, tapFor(this.context).sum); } } catch (e) {} return origConnect.apply(this, arguments); };
  W.__qaDrain = () => { const q = W.__qa; const out = { starts: q.starts.splice(0), blocks: q.blocks.splice(0), clipped: q.clipped, peak: q.peak, buffers: q.buffers, rate: q.ctxRate }; q.clipped = 0; q.peak = 0; return out; };
  W.__qaRecord = on => { W.__qa.recording = on; };
  // Recorded PCM leaves the page as base64 interleaved 16-bit chunks of at most ~1.5 MB.
  W.__qaTakeChunk = () => { const q = W.__qa.rec; if (!q.length) return null; let bytes = '', n = 0; while (q.length && n < 1500000) { const c = q.shift(); const u = new Uint8Array(c.buffer); for (let i = 0; i < u.length; i += 8192) bytes += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); n += u.length; } return btoa(bytes); };
})();`

// ---------- bot ----------
function padScores(level, radius = 3.2) {
  const pts = []
  for (const r of level.routes) for (let i = 0; i + 1 < r.length; i++) { const [ax, az] = r[i], [bx, bz] = r[i + 1]; const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / .25)); for (let k = 0; k < n; k++) pts.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]) }
  const blocked = new Set((level.blockers || []).map(b => b.pad))
  return level.pads.map(([x, z], i) => ({ pad: i, score: pts.filter(([a, b]) => Math.hypot(a - x, b - z) <= radius).length, blocked: blocked.has(i) })).filter(p => !p.blocked && p.score > 0).sort((a, b) => b.score - a.score)
}
const send = (page, c) => page.evaluate(c => { window.__inst && window.__inst.SendMessage('CarrotGame', 'Command', JSON.stringify(c)) }, c)
const state = page => page.evaluate(() => window.__state || null)
async function waitFor(page, fn, arg, timeout = 120000) { const t0 = Date.now(); for (;;) { const v = await page.evaluate(fn, arg).catch(() => null); if (v) return v; if (Date.now() - t0 > timeout) throw new Error('timeout waiting'); await sleep(200) } }

// A mixed board so every plant family the level unlocks gets heard: build the best pads in a rotating family order, then upgrade.
async function setupBoard(page, levelId, { towers = 12, tier = 3, coins = seedCoins } = {}) {
  const L = DATA.levels.find(l => l.id === levelId)
  if (coins > 0) await send(page, { type: 'debugCoins', value: coins })
  await sleep(300)
  const s0 = await state(page), hasDebug = coins > 0 && s0 && s0.coins >= coins
  const unlocked = DATA.towers.filter(t => t.unlock <= Math.min(levelId, 24) || levelId > 24).map(t => t.id)
  const order = ['seed', 'frost', 'mortar', 'thunder', 'starfruit', 'storm', 'prism', 'bamboo', 'chili', 'magnet', 'dragonfruit', 'moonflower', 'clockflower', 'cactus', 'lotus', 'orchid', 'mushroom', 'book', 'gravity', 'blossom'].filter(k => unlocked.includes(k))
  const pads = padScores(L).slice(0, towers); let built = 0
  for (let i = 0; i < pads.length; i++) {
    await send(page, { type: 'select', selectionType: 'pad', id: pads[i].pad }); await send(page, { type: 'buy', kind: order[i % order.length] }); built++
    for (let t = 1; t < tier; t++) await send(page, { type: 'upgrade' })
  }
  await send(page, { type: 'clear' })
  return { hasDebug, built, families: [...new Set(pads.map((_, i) => order[i % order.length]))] }
}

async function scenario(ctx, kind) {
  const { page } = ctx
  const levelId = kind === 'l24' ? 24 : kind === 'l8' ? 8 : 29
  await send(page, { type: 'load', level: levelId })
  await waitFor(page, id => window.__state && window.__state.level === id && window.__state.phase === 'ready', levelId)
  await sleep(1500)
  const board = await setupBoard(page, levelId, kind === 'l24' ? { towers: 14, tier: 3 } : kind === 'l8' ? { towers: 10, tier: 4 } : { towers: 12, tier: 4 })
  // Music and ambience alone (ready phase, 5 s): the bed the combat sits on.
  await page.evaluate(() => window.__qaDrain()); await sleep(5000)
  const ready = await page.evaluate(() => window.__qaDrain())
  const readyRms = ready.blocks.map(b => b[1]).filter(v => v > 0).map(v => 20 * Math.log10(v)).sort((a, b) => a - b)
  const readyRmsDb = readyRms.length ? +readyRms[readyRms.length >> 1].toFixed(1) : null
  if (record) await page.evaluate(() => window.__qaRecord(true))
  const pageT0 = await page.evaluate(() => performance.now())
  await send(page, { type: 'start' }); await sleep(200); await send(page, { type: 'speed', value: speed })
  const t0 = Date.now(), limit = (kind === 'l24' ? minutes : kind === 'l8' ? 9 : 7) * 60000, hist = []
  let s = await state(page)
  for (;;) {
    await sleep(500); const [now, st] = await page.evaluate(() => [performance.now(), window.__state || null]); s = st; if (!s) continue
    hist.push([now, s.wave, s.health, s.enemyCount, s.phase, s.boss ? Math.round(s.boss.hp) : -1])
    if (s.phase === 'won' || s.phase === 'lost') break
    if (Date.now() - t0 > limit) break
    // L24: keep the combat continuous by calling waves early (the measurement is about dense combat audio).
    // Boss scenarios: hurry to the boss (early calls, 2x), then fight it at the requested speed.
    const bossUp = !!(s.boss && s.boss.hp > 0)
    if ((kind === 'l24' || !bossUp) && s.nextWave > 0) await send(page, { type: 'next' })
    const want = kind !== 'l24' && !bossUp ? 2 : speed
    if (s.speed !== want && s.phase === 'playing') await send(page, { type: 'speed', value: want })
  }
  await sleep(2500) // result stinger and tail
  const drained = await page.evaluate(() => window.__qaDrain())
  const cues = await page.evaluate(t0 => (window.carrotAudioBus && window.carrotAudioBus.cues || []).filter(c => c[0] >= t0 - 50), pageT0)
  let wav = null
  if (record) {
    await page.evaluate(() => window.__qaRecord(false)); const parts = []
    for (;;) { const c = await page.evaluate(() => window.__qaTakeChunk()); if (!c) break; parts.push(Buffer.from(c, 'base64')) }
    wav = writeWav(join(out, `${ctx.engine}-${kind}.wav`), drained.rate || 48000, Buffer.concat(parts))
  }
  return { kind, level: levelId, board, readyRmsDb, result: { phase: s && s.phase, health: s && s.health, wave: s && s.wave, seconds: Math.round((Date.now() - t0) / 1000) }, hist, ...analyse(drained, cues, hist), wav }
}

function analyse(d, cues, hist) {
  const db = x => x > 0 ? 20 * Math.log10(x) : -120
  // Combat windows: state samples with enemies on the board while playing.
  const combat = t => { let last = null; for (const h of hist) { if (h[0] > t) break; last = h } return last && last[4] === 'playing' && last[3] > 0 }
  const blocks = d.blocks.filter(b => combat(b[0]) && b[1] > 0)
  const rms = blocks.map(b => db(b[1])).sort((a, b) => a - b), q = p => rms.length ? rms[Math.min(rms.length - 1, Math.floor(p * rms.length))] : -120
  const counts = new Map(), durations = new Map()
  for (const [, id, dur, loop] of d.starts) { if (loop || dur > 30000) continue; counts.set(id, (counts.get(id) || 0) + 1); durations.set(id, dur) }
  const total = [...counts.values()].reduce((a, b) => a + b, 0), sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const top7 = sorted.slice(0, 7).reduce((a, [, n]) => a + n, 0)
  const cueNames = {}; for (const [, n] of cues) { const k = n.split(':')[0]; cueNames[k] = (cueNames[k] || 0) + 1 }
  // Cue timing: the nearest sound start at or after each cue (cues are logged in the frame the event is handled).
  const startsT = d.starts.map(s => s[0]).sort((a, b) => a - b)
  const lagAfter = t => { let lo = 0, hi = startsT.length; while (lo < hi) { const m = (lo + hi) >> 1; if (startsT[m] < t - 1) lo = m + 1; else hi = m } return lo < startsT.length ? startsT[lo] - t : Infinity }
  const lagOf = prefix => cues.filter(c => c[1] === prefix || c[1].startsWith(prefix + ':')).map(c => Math.round(lagAfter(c[0])))
  const heartbeatHealth = cues.filter(c => c[1] === 'heartbeat').map(c => c[2])
  const deadline = {}; for (const c of cues) if (c[1] === 'deadline') deadline[c[2]] = (deadline[c[2]] || 0) + 1
  return {
    loudness: { combatBlocks: blocks.length, rmsMedianDb: +q(.5).toFixed(1), rmsP90Db: +q(.9).toFixed(1), peak: +d.peak.toFixed(3), peakDb: +db(d.peak).toFixed(2), clipped: d.clipped, rate: d.rate },
    repetition: { starts: total, distinct: counts.size, top7Share: total ? +(top7 / total).toFixed(3) : 0, maxShare: total ? +(sorted[0][1] / total).toFixed(3) : 0, top: sorted.slice(0, 10).map(([id, n]) => ({ id, n, ms: durations.get(id), share: +(n / total).toFixed(3) })) },
    cues: { counts: cueNames, waveLagMs: lagOf('wave'), telegraphLagMs: lagOf('telegraph'), heartbeatHealth, heartbeatMax: heartbeatHealth.length ? Math.max(...heartbeatHealth) : null, deadline },
  }
}

function writeWav(file, rate, pcm) {
  const n = pcm.length / 4, b = Buffer.alloc(44)
  b.write('RIFF', 0); b.writeUInt32LE(36 + pcm.length, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22)
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(pcm.length, 40)
  writeFileSync(file, Buffer.concat([b, pcm]))
  const m4a = file.replace(/\.wav$/, '.m4a')
  const conv = spawnSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '160000', file, m4a])
  return conv.status === 0 ? { wav: file, m4a, seconds: +(n / rate).toFixed(1) } : { wav: file, seconds: +(n / rate).toFixed(1) }
}

function gates(r) {
  const L = r.loudness, R = r.repetition, list = []
  const gate = (name, ok, value) => list.push({ name, ok, value })
  gate('combat RMS median -20 +- 2 dBFS', L.rmsMedianDb >= -22 && L.rmsMedianDb <= -18, L.rmsMedianDb)
  gate('combat RMS p90 <= -14 dBFS', L.rmsP90Db <= -14, L.rmsP90Db)
  gate('peak <= -1 dBFS', L.peak <= .8913, L.peakDb)
  gate('0 clipped samples', L.clipped === 0, L.clipped)
  gate('top-7 clips <= 45% of starts', R.top7Share <= .45, R.top7Share)
  gate('no clip above 12%', R.maxShare <= .12, R.maxShare)
  gate('>= 80 distinct buffers', R.distinct >= 80, R.distinct)
  if (r.cues.waveLagMs.length) gate('wave stinger within 50 ms', r.cues.waveLagMs.every(x => x <= 50), Math.max(...r.cues.waveLagMs))
  if (r.cues.telegraphLagMs.length) gate('telegraph windup cue within 30 ms', r.cues.telegraphLagMs.every(x => x <= 30), Math.max(...r.cues.telegraphLagMs))
  if (r.cues.heartbeatHealth.length) gate('heartbeat only at <= 3 hearts', r.cues.heartbeatMax <= 3, r.cues.heartbeatMax)
  if (Object.keys(r.cues.deadline).length) gate('each deadline crossing once', Object.values(r.cues.deadline).every(n => n === 1), JSON.stringify(r.cues.deadline))
  return list
}

// Menu sounds before Unity: the real page under the Vite dev server; a lobby click must start Web Audio voices and no
// .ogg may be requested (the UI sounds are synthesised).
async function menuScenario(engine) {
  const port = 5300 + Math.floor(Math.random() * 400)
  const { spawn } = await import('node:child_process')
  const vite = spawn(join(repo, 'node_modules/.bin/vite'), ['--port', String(port), '--strictPort'], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] })
  try {
    await new Promise((ok, fail) => { const t = setTimeout(() => fail(new Error('vite did not start')), 60000); vite.stdout.on('data', d => { if (/Local:|ready in/.test(String(d))) { clearTimeout(t); ok() } }); vite.on('exit', c => fail(new Error('vite exited ' + c))) })
    const type = engine === 'webkit' ? webkit : chromium
    const browser = await type.launch(engine === 'chromium' ? { channel: 'chromium' } : {})
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    await context.addInitScript(`(() => { const W = window; W.__menu = { osc: 0, contexts: 0, states: [] };
      const O = W.OscillatorNode && W.OscillatorNode.prototype; if (O) { const st = O.start; O.start = function () { W.__menu.osc++; try { W.__menu.states.push(this.context.state) } catch (e) {} return st.apply(this, arguments) } }
      W.__menu.list = []; for (const k of ['AudioContext', 'webkitAudioContext']) { const C = W[k]; if (!C) continue; W[k] = class extends C { constructor(...a) { super(...a); W.__menu.contexts++; W.__menu.list.push(this) } } } })();`)
    const page = await context.newPage(), requests = []
    page.on('request', r => requests.push(r.url()))
    await page.goto(`http://localhost:${port}/minigames/carrotDefense/`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    const help = page.getByRole('button', { name: 'How to play' }); await help.waitFor({ timeout: 60000 })
    const unityBefore = requests.some(u => /carrot\.loader\.js/.test(u))
    await help.click(); await sleep(600)
    const after = await page.evaluate(() => ({ osc: window.__menu.osc, contexts: window.__menu.contexts, states: window.__menu.states, unity: typeof window.createUnityInstance === 'function', now: window.__menu.list.map(c => [c.state, +c.currentTime.toFixed(3)]) }))
    await page.keyboard.press('Escape'); await sleep(200)
    const choose = page.getByRole('button', { name: /Choose a level/ }); if (await choose.count()) { await choose.first().click(); await sleep(400) }
    const after2 = await page.evaluate(() => ({ osc: window.__menu.osc, now: window.__menu.list.map(c => [c.state, +c.currentTime.toFixed(3)]) }))
    await browser.close()
    const oggs = requests.filter(u => /\.ogg(\?|$)/.test(u))
    const r = { engine, kind: 'menu', unityLoadedBeforeClick: unityBefore || after.unity, oscillators: after.osc, oscillatorsAfterSecond: after2.osc, contexts: after.contexts, contextStates: after.states.slice(0, 4), contextClock: [after.now, after2.now], oggRequests: oggs }
    r.gates = [
      { name: 'menu click plays before Unity loads', ok: !r.unityLoadedBeforeClick && r.oscillators >= 1, value: r.oscillators },
      { name: 'a second menu click plays too', ok: r.oscillatorsAfterSecond > r.oscillators, value: r.oscillatorsAfterSecond },
      { name: 'one menu AudioContext at most', ok: r.contexts <= 1, value: r.contexts },
      { name: 'the menu context runs (its clock advances)', ok: after2.now.length > 0 && after2.now[0][0] === 'running' && after2.now[0][1] > 0, value: JSON.stringify(after2.now) },
      { name: 'zero .ogg requests for UI sounds', ok: oggs.length === 0, value: oggs.length },
    ]
    return r
  } finally { vite.kill('SIGTERM') }
}

const results = []
try {
  if (scenarios.includes('menu')) for (const engine of engines) {
    const r = await menuScenario(engine); results.push(r); writeFileSync(join(out, `${engine}-menu.json`), JSON.stringify(r, null, 1))
    console.log(`\n[${engine} menu] oscillators ${r.oscillators} -> ${r.oscillatorsAfterSecond}, contexts ${r.contexts} ${JSON.stringify(r.contextStates)}, ogg requests ${r.oggRequests.length}`)
    for (const g of r.gates) console.log(`  ${g.ok ? 'PASS' : 'FAIL'} ${g.name}: ${g.value}`)
  }
  for (const engine of scenarios.some(k => k !== 'menu') ? engines : []) {
    const type = engine === 'webkit' ? webkit : chromium
    const browser = await type.launch(engine === 'chromium' ? { channel: 'chromium', args: ['--autoplay-policy=no-user-gesture-required', '--enable-gpu', '--ignore-gpu-blocklist'] } : {})
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    await context.addInitScript(INIT)
    const page = await context.newPage()
    const log = []; page.on('console', m => { const t = m.text(); if (/CARROT|Carrot|error|Error/.test(t) && log.length < 4000) log.push([Date.now(), m.type(), t.slice(0, 300)]) })
    page.on('pageerror', e => log.push([Date.now(), 'pageerror', String(e)]))
    await page.goto(origin, { waitUntil: 'domcontentloaded' })
    await waitFor(page, () => window.__inst && window.__states > 0, null, 240000)
    await page.mouse.click(640, 400) // a user gesture: WebKit resumes the AudioContext only from one
    if (gains) await page.evaluate(g => window.__inst.SendMessage('CarrotGame', 'SetBusGains', g), gains)
    if (volumes) await page.evaluate(v => window.__inst.SendMessage('CarrotGame', 'SetVolumes', v), volumes)
    await sleep(1500)
    for (const kind of scenarios.filter(k => k !== 'menu')) {
      const t = Date.now(); const r = await scenario({ page, engine }, kind); r.engine = engine; r.gates = gates(r)
      results.push(r); writeFileSync(join(out, `${engine}-${kind}.json`), JSON.stringify(r, null, 1))
      console.log(`\n[${engine} ${kind}] ${r.result.phase} hp ${r.result.health} wave ${r.result.wave} in ${r.result.seconds}s (${Math.round((Date.now() - t) / 1000)}s wall); board ${r.board.built} towers (debugCoins ${r.board.hasDebug})`)
      console.log(`  ready (music + ambience): ${r.readyRmsDb} dBFS`)
      console.log(`  loudness: median ${r.loudness.rmsMedianDb} dBFS, p90 ${r.loudness.rmsP90Db}, peak ${r.loudness.peakDb} dBFS, clipped ${r.loudness.clipped} (${r.loudness.combatBlocks} blocks)`)
      console.log(`  repetition: ${r.repetition.starts} starts, ${r.repetition.distinct} distinct, top-7 ${r.repetition.top7Share}, max ${r.repetition.maxShare}`)
      console.log(`  cues: ${JSON.stringify(r.cues.counts)}`)
      for (const g of r.gates) console.log(`  ${g.ok ? 'PASS' : 'FAIL'} ${g.name}: ${g.value}`)
      if (r.wav) console.log(`  recording: ${r.wav.m4a || r.wav.wav} (${r.wav.seconds}s)`)
    }
    writeFileSync(join(out, `${engine}-console.json`), JSON.stringify(log, null, 1))
    await browser.close()
  }
} finally { server.close() }
writeFileSync(join(out, 'summary.json'), JSON.stringify(results.map(r => r.kind === 'menu' ? r : ({ engine: r.engine, kind: r.kind, result: r.result, readyRmsDb: r.readyRmsDb, loudness: r.loudness, repetition: { ...r.repetition, top: undefined }, cues: r.cues.counts, gates: r.gates })), null, 1))
const failed = results.flatMap(r => r.gates.filter(g => !g.ok).map(g => `${r.engine}/${r.kind}: ${g.name} (${g.value})`))
console.log(failed.length ? '\nAUDIO_QA_FAIL\n' + failed.join('\n') : '\nAUDIO_QA_OK')
process.exitCode = failed.length ? 1 : 0
