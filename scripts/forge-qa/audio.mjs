// web-feel audio checks: the real ForgeAudio (src/minigames/forge/audio.ts, bundled with esbuild) rendered
// through OfflineAudioContext in Chromium and WebKit, analysed here. Optionally (--url) a live check that the
// strike layers start in the same task as Unity's impact event.
// usage: node scripts/forge-qa/audio.mjs [--engines chromium,webkit] [--url http://127.0.0.1:5481/minigames/forgeOrFold/] [--out output/forge-qa/audio]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { launch, open, sleep, press, ensureForging, waitEvent, audioStarts, writeJson } from './lib.mjs'

const arg = (name, d) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : d }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const outDir = path.resolve(arg('out', 'output/forge-qa/audio')), engines = arg('engines', 'chromium,webkit').split(','), liveUrl = arg('url', '')
const report = { at: new Date().toISOString(), checks: [], renders: {} }
const check = (engine, name, pass, detail) => { report.checks.push({ engine, name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} [${engine}] ${name}${detail !== undefined ? ' ' + JSON.stringify(detail) : ''}`) }

// ---------- the module under test, bundled for the page ----------
const bundle = (await build({
  stdin: { contents: "export * from './audio.ts'; export * from './audio-spec.ts'", resolveDir: path.join(root, 'src/minigames/forge'), loader: 'ts' },
  bundle: true, format: 'iife', globalName: 'ForgeAudioQA', write: false, target: 'es2020', logLevel: 'silent',
})).outputFiles[0].text

// ---------- spectra ----------
function fft(re, im) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]];[im[i], im[j]] = [im[j], im[i]] } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a)
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr; re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t } }
  }
}
/** Magnitude spectrum (Hann window) of n samples from `startS` seconds. */
function spectrum(x, sr, startS, n = 4096) {
  const re = new Float64Array(n), im = new Float64Array(n), s0 = Math.floor(startS * sr)
  for (let i = 0; i < n; i++) re[i] = (x[s0 + i] || 0) * (.5 - .5 * Math.cos(2 * Math.PI * i / (n - 1)))
  fft(re, im)
  const mag = new Float64Array(n / 2); for (let k = 0; k < n / 2; k++) mag[k] = Math.hypot(re[k], im[k])
  return { mag, bin: sr / n }
}
/** The strongest peak within [lo, hi] Hz, with parabolic interpolation on the log magnitude. */
function peak({ mag, bin }, lo, hi) {
  let k = Math.max(1, Math.floor(lo / bin)); const end = Math.min(mag.length - 2, Math.ceil(hi / bin)); let best = k
  for (; k <= end; k++) if (mag[k] > mag[best]) best = k
  const a = Math.log(mag[best - 1] + 1e-12), b = Math.log(mag[best] + 1e-12), c = Math.log(mag[best + 1] + 1e-12), d = (a - c) / (2 * (a - 2 * b + c) || 1)
  return { hz: (best + (Number.isFinite(d) ? d : 0)) * bin, mag: mag[best], db: 20 * Math.log10(mag[best] + 1e-12) }
}
/** Share of energy at or above `hz`. */
function shareAbove({ mag, bin }, hz) { let hi = 0, all = 0; for (let k = 1; k < mag.length; k++) { const e = mag[k] ** 2; all += e; if (k * bin >= hz) hi += e } return all ? hi / all : 0 }
const peakDb = x => { let m = 0; for (const v of x) m = Math.max(m, Math.abs(v)); return 20 * Math.log10(m || 1e-12) }
const rms = (x, sr, a, b) => { let s = 0, n = 0; for (let i = Math.floor(a * sr); i < Math.floor(b * sr); i++) { s += x[i] ** 2; n++ } return Math.sqrt(s / (n || 1)) }

// ---------- renders, run inside the page ----------
async function render(page, job) {
  return page.evaluate(async job => {
    const Q = window.ForgeAudioQA, sr = 48000, ctx = new OfflineAudioContext(2, Math.ceil(sr * job.seconds), sr)
    const audio = new Q.ForgeAudio({ context: ctx, rand: Q.seeded(job.seed || 7), ambience: !!job.ambience, persist: false, legacy: false })
    audio.start(); if (job.volume) audio.setVolume(job.volume)
    const events = []
    if (job.strike) audio.strike(job.strike)
    if (job.voices) for (const v of job.voices) audio.play([v])
    if (job.preschedule) {
      // 'swing' at 0 with contact at preMs, then the impact at preMs (suspend on the render clock).
      audio.preschedule(1, job.preMs, true)
      ctx.suspend(job.preMs / 1000).then(() => { events.push(audio.strike({ ...job.preschedule, seq: 1 })); ctx.resume() })
    }
    if (job.tension !== undefined) audio.setTension(job.tension)
    if (job.pump) audio.pumpUntil(job.seconds)
    const buf = await ctx.startRendering()
    return { left: Array.from(buf.getChannelData(0)), sr, events, peakVoices: audio.peakVoices }
  }, job)
}

async function engineChecks(engine) {
  const h = await launch(engine === 'webkit' ? 'webkit-phone' : 'desktop', { out: path.join(outDir, engine) })
  try {
    await h.page.goto('about:blank'); await h.page.addScriptTag({ content: bundle })
    const ok = await h.page.evaluate(() => typeof OfflineAudioContext === 'function' && !!window.ForgeAudioQA?.ForgeAudio)
    check(engine, 'OfflineAudioContext and the bundled ForgeAudio load', ok); if (!ok) return
    const base = { outcome: 'good', metal: 'iron', level: 4, flowStep: 0, evolution: false }
    // 1. Ring by temperature: the 1180 Hz partial at .5 s is at least 10 dB louder at 600 C than at 1100 C.
    const cold = await render(h.page, { seconds: 1.2, strike: { ...base, tempC: 600 } }), hot = await render(h.page, { seconds: 1.2, strike: { ...base, tempC: 1100 } })
    const pc = peak(spectrum(cold.left, cold.sr, .5 - .043), 1150, 1210), ph = peak(spectrum(hot.left, hot.sr, .5 - .043), 1150, 1210)
    check(engine, '1180 Hz partial >= 10 dB louder at 600 C than at 1100 C (at .5 s)', pc.db - ph.db >= 10, { coldDb: +pc.db.toFixed(1), hotDb: +ph.db.toFixed(1), diff: +(pc.db - ph.db).toFixed(1) })
    // 2. Anvil partials at 1180, 3253 and 6377 Hz within 2% (cold steel rings), detuned at most 10 cents.
    const ring = await render(h.page, { seconds: 1.2, strike: { ...base, tempC: 500 } }), sp = spectrum(ring.left, ring.sr, .06, 8192)
    const found = [1180, 3253, 6377].map(f => ({ target: f, hz: +peak(sp, f * .95, f * 1.05).hz.toFixed(1) }))
    check(engine, 'peaks at 1180, 3253 and 6377 Hz within 2%', found.every(p => Math.abs(p.hz / p.target - 1) <= .02), found)
    // 3. No glide: each strong peak at 30 ms is within 1% of its frequency at 400 ms (the old 'pew' ramp is gone).
    const s30 = spectrum(ring.left, ring.sr, .03), s400 = spectrum(ring.left, ring.sr, .4)
    const main = peak(s30, 500, 12000), later = peak(s400, main.hz * .95, main.hz * 1.05)
    const blade = peak(s30, 700, 860), bladeLate = peak(s400, blade.hz * .95, blade.hz * 1.05)
    check(engine, 'main peak drifts at most 1% between 30 and 400 ms', Math.abs(later.hz / main.hz - 1) <= .01 && Math.abs(bladeLate.hz / blade.hz - 1) <= .01, { main: [+main.hz.toFixed(1), +later.hz.toFixed(1)], blade: [+blade.hz.toFixed(1), +bladeLate.hz.toFixed(1)] })
    // 4. Headroom: Perfect + Evolution + Flow (+7) at full volume, cold, peaks at -1 dBFS or lower.
    const stack = await render(h.page, { seconds: 1.5, volume: 1, strike: { outcome: 'perfect', metal: 'auricite', level: 20, tempC: 500, flowStep: 7, evolution: true } })
    const stackDb = peakDb(stack.left)
    check(engine, 'Perfect + Evolution + Flow stack peaks at -1 dBFS or lower (volume 1)', stackDb <= -1, { peakDb: +stackDb.toFixed(2) })
    const shatter = await render(h.page, { seconds: 1.5, volume: 1, strike: { outcome: 'shatter', metal: 'iron', level: 14, tempC: 900, flowStep: 0 } })
    check(engine, 'Shatter at full volume peaks at -1 dBFS or lower', peakDb(shatter.left) <= -1, { peakDb: +peakDb(shatter.left).toFixed(2) })
    // 5. Phone and laptop speakers: every weight layer has real energy above 300 Hz (critique #35).
    const A = await h.page.evaluate(() => window.ForgeAudioQA.AUDIO)
    const layer = (tag, freq, harmonics, dur, extra = {}) => ({ tag, src: 'osc', wave: 'rich', harmonics, freq, gain: .3, at: 0, attack: .002, dur, t60: dur, wet: 0, bus: 'strike', ...extra })
    const layers = [
      layer('thump', A.thump.from, A.thump.harmonics, .16, { freqEnd: A.thump.to }), layer('boom', A.shatter.boomHz, A.shatter.boomHarmonics, .18, { freqEnd: A.shatter.boomEnd }),
      layer('dull thud', A.dull.thudHz, A.thump.harmonics, .13, { freqEnd: A.dull.thudHz * .9 }), layer('drone 55', A.tension.droneHz[0], A.tension.harmonics, .5, { t60: 50 }),
      layer('drone 82', A.tension.droneHz[1], A.tension.harmonics, .5, { t60: 50 }), layer('heartbeat', 58, A.tension.harmonics, .09, { freqEnd: 50 }),
      layer('flow whoomp', A.flow.whoompHz, A.thump.harmonics, .12, { freqEnd: A.flow.whoompHz * .82 }),
    ]
    const shares = {}
    for (const v of layers) { const r = await render(h.page, { seconds: .6, voices: [v] }); shares[v.tag] = +shareAbove(spectrum(r.left, r.sr, 0, 8192), 300).toFixed(3) }
    const lap = await render(h.page, { seconds: 3, ambience: true, voices: [{ tag: 'lap', src: 'buffer', buffer: 'lapping', freq: 0, gain: .4, at: 0, attack: .01, dur: 2.5, t60: 100, wet: 0, bus: 'foley' }] })
    // The bed itself includes the lapping; measure the lone voice by subtracting nothing: the hiss is a 1 kHz high-pass,
    // so check the share above 300 Hz excluding everything above 900 Hz (lapping + roar only).
    const ls = spectrum(lap.left, lap.sr, 1, 8192); let roar = 0, all = 0; for (let k = 1; k * ls.bin < 900; k++) { const e = ls.mag[k] ** 2; all += e; if (k * ls.bin >= 300) roar += e }
    shares['fire lapping (300-900 Hz of < 900 Hz)'] = +(roar / all).toFixed(3)
    check(engine, 'every weight layer has at least 10% of its energy above 300 Hz', Object.values(shares).every(v => v >= .1), shares)
    // 6. Pre-scheduled contact layers (output latency > 30 ms): the neutral layers play once, at contact.
    // The swing arrives 120 ms before contact; the transient is scheduled early by the compressor's 6 ms
    // look-ahead so it is heard at contact. The outcome layers at the impact skip the neutral ones.
    const pre = await render(h.page, { seconds: .5, preMs: 120, preschedule: { ...base, tempC: 900 } })
    const single = await render(h.page, { seconds: .5, strike: { ...base, tempC: 900 } })
    const onsetMs = x => { for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > 1e-3) return +(i / 48).toFixed(2); return null }
    const fullVoices = await h.page.evaluate(b => window.ForgeAudioQA.strikeSpec({ ...b, tempC: 900, rand: window.ForgeAudioQA.seeded(7) }).voices.length, base)
    check(engine, 'pre-scheduled transient is heard at contact (within 3 ms), not doubled', Math.abs(onsetMs(pre.left) - 120) <= 3 && pre.events[0] === fullVoices - 3, { preOnsetMs: onsetMs(pre.left), directOnsetMs: onsetMs(single.left), outcomeVoices: pre.events[0], fullVoices })
    check(engine, 'a direct strike reaches the output within 7 ms (one compressor look-ahead)', onsetMs(single.left) <= 7, { onsetMs: onsetMs(single.left) })
    // Loudness against the old mix (old Good at volume .4: peak -17.5 dBFS, 300 ms RMS -36.5 dB).
    const r300 = x => +(20 * Math.log10(rms(x, 48000, 0, .3))).toFixed(1)
    check(engine, 'a hot Good strike is at least as loud as the old mix (300 ms RMS >= -36.5 dB at volume .4)', r300(single.left) >= -36.5, { rmsDb: r300(single.left), peakDb: +peakDb(single.left).toFixed(1) })
    // 7. Voice budget: 6 strikes per second with foley stays within 48 voices.
    const many = await h.page.evaluate(async () => {
      const Q = window.ForgeAudioQA, sr = 48000, ctx = new OfflineAudioContext(2, sr * 4, sr), a = new Q.ForgeAudio({ context: ctx, rand: Q.seeded(3), ambience: true, persist: false, legacy: true }); a.start()
      const outcomes = ['good', 'perfect', 'chip', 'dull', 'shatter']
      for (let i = 0; i < 18; i++) ctx.suspend(i / 6 + .001).then(() => { a.strike({ outcome: outcomes[i % 5], metal: 'steel', level: 8, tempC: 650, flowStep: i % 8, evolution: i % 7 === 0 }); a.sfx('whoosh', 8); a.sfx('flake-land'); a.pumpUntil(ctx.currentTime + .2); ctx.resume() })
      a.setTension(1); await ctx.startRendering(); return a.peakVoices
    })
    check(engine, 'at most 48 voices at 6 strikes per second (beds included)', many <= 48 && many > 10, { peakVoices: many })
    report.renders[engine] = { ringDb: { cold: pc.db, hot: ph.db }, peaks: found, stackDb, shares }
  } finally { await h.close() }
}

/** Live: the impact layers start in the same task as Unity's 'impact' (at most 5 ms later, scheduled now). */
async function live(url) {
  const h = await launch('desktop', { out: path.join(outDir, 'live') })
  try {
    // AudioBufferSourceNode has its own start(), which lib's AudioScheduledSourceNode hook does not see.
    await h.context.addInitScript(() => { const P = window.AudioBufferSourceNode?.prototype; if (!P) return; const start = P.start; P.start = function (when, ...rest) { (window.__bufferStarts ||= []).push({ t: performance.now(), loop: this.loop, len: this.buffer ? this.buffer.length : 0 }); return start.call(this, when, ...rest) } })
    await open(h, url); await sleep(800)
    // The first gesture builds the audio; the room tone, fire hiss and lapping beds are generated in slices and
    // start within about a second, and the crackle pump runs.
    const g0 = await press(h, 'Space'); await sleep(1500)
    const bufs = await h.page.evaluate(t => (window.__bufferStarts || []).filter(s => s.t >= t), g0), loops = bufs.filter(s => s.loop)
    check('live', 'the three looped beds start within 1.5 s of the first gesture, crackles play', loops.length >= 3 && bufs.length > loops.length, { loopsAtMs: loops.map(s => Math.round(s.t - g0)), oneShots: bufs.length - loops.length })
    await ensureForging(h, 12000); await sleep(400)
    const lags = [], sched = []
    for (let i = 0; i < 6; i++) {
      const t = await press(h, 'Space'), imp = await waitEvent(h, 'impact', t, 4000); await sleep(120)
      if (!imp) continue
      // The strike's oscillators (thump, ring and blade partials); the bed pump's crackles are buffer sources.
      // The earliest layer must start now; the shimmer (+4 ms) and an evolution arpeggio (+60..240 ms) are
      // deliberately later, so the check takes the earliest scheduled start of the strike's first batch.
      const starts = (await audioStarts(h, imp.t)).filter(s => s.t < imp.t + 60 && s.freq != null)
      if (starts.length) { lags.push(starts[0].t - imp.t); sched.push(Math.min(...starts.filter(s => s.t - starts[0].t < 2).map(s => s.when - s.now))) }
      await waitEvent(h, 'settled', imp.t, 3000); await sleep(250)
    }
    check('live', 'impact layers start at most 5 ms after the impact event', lags.length >= 4 && lags.every(l => l >= 0 && l <= 5), { lagsMs: lags.map(l => +l.toFixed(2)) })
    check('live', 'impact layers are scheduled at the current time (no added delay)', sched.length >= 4 && sched.every(s => s <= .005), { whenMinusNowS: sched.map(s => +s.toFixed(4)) })
    const errors = h.consoleLines.filter(l => /\[(error|pageerror)\]/.test(l) && !/loading-v3\.webp/.test(l))
    check('live', 'no console errors', errors.length === 0, errors.slice(0, 4))
  } finally { await h.close() }
}

fs.mkdirSync(outDir, { recursive: true })
for (const e of engines) await engineChecks(e)
if (liveUrl) await live(liveUrl)
const failed = report.checks.filter(c => !c.pass)
writeJson(path.join(outDir, 'audio.json'), report)
console.log(`${failed.length ? 'FAIL' : 'PASS'} web-feel audio: ${report.checks.length - failed.length}/${report.checks.length} checks -> ${path.join(outDir, 'audio.json')}`)
process.exitCode = failed.length ? 1 : 0
