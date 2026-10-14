// Measures tempo, beat phase and key of every streamed music file and writes them into
// Assets/StreamingAssets/Carrot/music-provenance.json, next to the encoder's own rows.
//
// usage: node unity/CarrotDefense/Tools/analyze_carrot_music.mjs [--report] [--track MusicGarden]
//
// Decoding uses macOS afconvert (Core Audio decodes both the MP3 and the Ogg Vorbis outputs), so each row is
// measured on the exact file a browser plays: MP3 encoder delay shifts the beat phase by ~25 ms, which is why
// .mp3 and .ogg get separate beatOffset values. No network, no third-party code.
//
// Method (all original code):
//  - onset strength: 1024-point STFT (hop 256 at 22.05 kHz), log-magnitude spectral flux summed over 80 Hz-8 kHz;
//  - tempo: autocorrelation of the onset envelope over 70-180 BPM with a log-normal prior centred on 110 BPM;
//    the same estimate is repeated in 16 s windows (50% overlap) and tempoCv is the coefficient of variation of
//    the window tempi. tempoStable = tempoCv < 0.05 and every window agrees with the global tempo (or its
//    double/half) within 4%;
//  - beatOffset: the phase (seconds of the first beat) that maximises onset energy on the global beat grid;
//  - key: a 12-bin chroma (8192-point STFT, each bin spread over its two nearest semitones, 110 Hz-2.1 kHz) correlated with Krumhansl-Kessler
//    major/minor profiles. keyConfident = global correlation >= 0.6, a margin >= 0.08 over the next key, and at
//    least 70% of 16 s windows choosing the same key.
// The game quantises celebration cues to the beat only when tempoStable, and transposes stingers only when
// keyConfident; otherwise cues play immediately and unpitched, and the HUD beat glow stays off (bpm null).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIR = join(ROOT, 'Assets/StreamingAssets/Carrot')
const MANIFEST = join(DIR, 'music-provenance.json')
const report = process.argv.includes('--report')
const only = (() => { const i = process.argv.indexOf('--track'); return i > 0 ? process.argv[i + 1] : null })()
const RATE = 22050, N = 1024, HOP = 256

function decode(file, tmp) {
  const out = join(tmp, file.split('/').pop() + '.wav')
  const r = spawnSync('afconvert', ['-f', 'WAVE', '-d', `LEI16@${RATE}`, '-c', '1', file, out], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error('afconvert failed for ' + file + ': ' + r.stderr)
  const b = readFileSync(out)
  let p = 12, data = null
  while (p + 8 <= b.length) { const id = b.toString('ascii', p, p + 4), size = b.readUInt32LE(p + 4); if (id === 'data') { data = b.subarray(p + 8, p + 8 + size); break } p += 8 + size + (size & 1) }
  if (!data) throw new Error('no data chunk in ' + out)
  const x = new Float32Array(data.length >> 1)
  for (let i = 0; i < x.length; i++) x[i] = data.readInt16LE(i * 2) / 32768
  return x
}

function fft(re, im) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]] } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a)
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr; re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t } }
  }
}

function analyse(x) {
  const frames = Math.max(1, Math.floor((x.length - N) / HOP)), bins = N / 2
  const win = new Float32Array(N).map((_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / N))
  const onset = new Float32Array(frames), chromaFrames = []
  let prev = new Float32Array(bins)
  const lo = Math.round(80 * N / RATE), hi = Math.round(8000 * N / RATE)
  const re = new Float64Array(N), im = new Float64Array(N)
  let rms = 0
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < N; i++) { const v = x[f * HOP + i]; re[i] = v * win[i]; im[i] = 0 }
    fft(re, im)
    const mag = new Float32Array(bins); let flux = 0
    for (let k = 1; k < bins; k++) {
      const m = Math.hypot(re[k], im[k]); mag[k] = Math.log1p(100 * m)
      if (k >= lo && k <= hi) { const d = mag[k] - prev[k]; if (d > 0) flux += d }
    }
    onset[f] = flux; prev = mag
  }
  // Chroma needs semitone resolution in the bass: a separate 8192-point pass (2.7 Hz bins), one frame per 0.37 s.
  const CN = 8192, CH = 8192, cwin = new Float32Array(CN).map((_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / CN))
  const cre = new Float64Array(CN), cim = new Float64Array(CN), map = []
  for (let k = 1; k < CN / 2; k++) { const f = k * RATE / CN; if (f < 110 || f > 2100) continue; const m = 12 * Math.log2(f / 440) + 9, low = Math.floor(m), w = m - low; map.push([k, ((low % 12) + 12) % 12, 1 - w, ((low + 1) % 12 + 12) % 12, w]) }
  for (let s = 0; s + CN <= x.length; s += CH) {
    for (let i = 0; i < CN; i++) { cre[i] = x[s + i] * cwin[i]; cim[i] = 0 }
    fft(cre, cim)
    const chroma = new Float32Array(12)
    for (const [k, a, wa, b, wb] of map) { const e = Math.hypot(cre[k], cim[k]); chroma[a] += e * wa; chroma[b] += e * wb }
    chromaFrames.push(chroma)
  }
  for (const v of x) rms += v * v
  rms = Math.sqrt(rms / x.length)
  // Remove the slow trend and half-wave rectify (local mean over ~0.5 s).
  const fr = RATE / HOP, w = Math.round(fr * .5), env = new Float32Array(frames)
  let acc = 0
  for (let i = 0; i < frames; i++) { acc += onset[i]; if (i >= w) acc -= onset[i - w]; const mean = acc / Math.min(i + 1, w); env[i] = Math.max(0, onset[i] - mean) }
  return { env, fr, chromaFrames, rms, seconds: x.length / RATE }
}

function tempoOf(env, fr, from = 0, to = env.length) {
  const minLag = Math.floor(fr * 60 / 180), maxLag = Math.ceil(fr * 60 / 70)
  let best = 0, bestLag = 0, energy = 0
  for (let i = from; i < to; i++) energy += env[i] * env[i]
  if (energy <= 0) return { bpm: 0, strength: 0 }
  const score = []
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0; for (let i = from + lag; i < to; i++) s += env[i] * env[i - lag]
    const bpm = 60 * fr / lag, prior = Math.exp(-.5 * (Math.log2(bpm / 110) / .9) ** 2)
    score.push([lag, s / energy * prior, s / energy])
  }
  for (const [lag, s] of score) if (s > best) { best = s; bestLag = lag }
  // Parabolic refinement on the raw autocorrelation.
  const i = score.findIndex(s => s[0] === bestLag), a = score[i - 1]?.[2] ?? score[i][2], b = score[i][2], c = score[i + 1]?.[2] ?? score[i][2]
  const d = (a - 2 * b + c) !== 0 ? .5 * (a - c) / (a - 2 * b + c) : 0
  return { bpm: 60 * fr / (bestLag + Math.max(-.5, Math.min(.5, d))), strength: b }
}

function phaseOf(env, fr, bpm) {
  const period = fr * 60 / bpm, steps = 64
  let best = -1, bestPhase = 0
  for (let s = 0; s < steps; s++) {
    const ph = s / steps * period; let e = 0
    for (let t = ph; t < env.length; t += period) { const i = Math.round(t); e += env[i] || 0 }
    if (e > best) { best = e; bestPhase = ph }
  }
  return bestPhase / fr
}

const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
function corr(a, b) { const ma = a.reduce((s, v) => s + v, 0) / 12, mb = b.reduce((s, v) => s + v, 0) / 12; let n = 0, da = 0, db = 0; for (let i = 0; i < 12; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2 } return da && db ? n / Math.sqrt(da * db) : 0 }
function keyOf(chroma) {
  const c = chroma, all = []
  for (let r = 0; r < 12; r++) for (const [mode, prof] of [['major', MAJOR], ['minor', MINOR]]) all.push({ root: r, mode, r: corr(c, prof.map((_, i) => prof[(i - r + 12) % 12])) })
  all.sort((a, b) => b.r - a.r)
  return { ...all[0], margin: all[0].r - all[1].r }
}
function sumChroma(list) { const s = new Array(12).fill(0); for (const c of list) for (let i = 0; i < 12; i++) s[i] += c[i]; return s }

const rows = JSON.parse(readFileSync(MANIFEST, 'utf8'))
const tmp = mkdtempSync(join(tmpdir(), 'carrot-music-'))
const table = []
try {
  for (const row of rows) {
    const file = join(DIR, row.output)
    if (!existsSync(file) || (only && !row.output.startsWith(only + '.'))) continue
    const x = decode(file, tmp), a = analyse(x)
    const g = tempoOf(a.env, a.fr)
    const win = Math.round(16 * a.fr), hop = win >> 1, local = []
    for (let s = 0; s + win <= a.env.length; s += hop) { const t = tempoOf(a.env, a.fr, s, s + win); if (t.bpm > 0) local.push(t.bpm) }
    // Fold each window tempo onto the global octave before comparing.
    const folded = local.map(b => { let v = b; while (v > g.bpm * 1.41) v /= 2; while (v < g.bpm / 1.41) v *= 2; return v })
    const mean = folded.reduce((s, v) => s + v, 0) / Math.max(1, folded.length)
    const cv = folded.length ? Math.sqrt(folded.reduce((s, v) => s + (v - mean) ** 2, 0) / folded.length) / mean : 1
    const agree = folded.filter(v => Math.abs(v / g.bpm - 1) < .04).length / Math.max(1, folded.length)
    const tempoStable = cv < .05 && agree >= .999 && g.strength > .08
    const key = keyOf(sumChroma(a.chromaFrames))
    const perWindow = []; const cw = Math.round(16 * RATE / 8192)
    for (let s = 0; s + cw <= a.chromaFrames.length; s += cw >> 1) perWindow.push(keyOf(sumChroma(a.chromaFrames.slice(s, s + cw))))
    const same = perWindow.filter(k => k.root === key.root && k.mode === key.mode).length / Math.max(1, perWindow.length)
    const keyConfident = key.r >= .6 && key.margin >= .08 && same >= .7
    row.bpm = Math.round(g.bpm * 100) / 100
    row.beatOffset = Math.round(phaseOf(a.env, a.fr, g.bpm) * 1000) / 1000
    row.tempoCv = Math.round(cv * 1000) / 1000
    row.tempoAgreement = Math.round(agree * 100) / 100
    row.tempoStable = tempoStable
    row.keyRoot = key.root; row.keyMode = key.mode; row.key = NAMES[key.root] + (key.mode === 'minor' ? 'm' : '')
    row.keyCorrelation = Math.round(key.r * 100) / 100; row.keyMargin = Math.round(key.margin * 100) / 100; row.keyWindowAgreement = Math.round(same * 100) / 100
    row.keyConfident = keyConfident
    row.rmsDbfs = Math.round(200 * Math.log10(a.rms)) / 10
    row.analysis = 'Tools/analyze_carrot_music.mjs'
    table.push([row.output, row.seconds, row.bpm, row.tempoCv, row.tempoAgreement, tempoStable, row.key, row.keyCorrelation, row.keyMargin, row.keyWindowAgreement, keyConfident, row.rmsDbfs])
  }
} finally { rmSync(tmp, { recursive: true, force: true }) }
writeFileSync(MANIFEST, JSON.stringify(rows, null, 2) + '\n')
if (report || true) {
  console.log('output | seconds | bpm | tempoCv | windowsAgree | stable | key | r | margin | windowsSameKey | confident | rms dBFS')
  for (const r of table) console.log(r.join(' | '))
}
console.log('CARROT_MUSIC_ANALYSED ' + table.length)
