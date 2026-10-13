// room-light-post QA (stream module next to lib.mjs). Two parts:
//
//  editor (default): renders deterministic views of the real Unity scene through the frozen snapshot rig
//   (ForgeSnapshots.Capture, no WebGL build) with the camera pinned by Qa('room-cam:x,y,z,yaw,pitch,fov'), then measures
//   - void:    with Qa('void') (magenta clear colour), at yaw 0/90/180/270 x pitch -70/0/+70 from the work stance and
//              six smith-camera looks: at most .5% of pixels may show the clear colour;
//   - brick:   the brick module from straight-on wall frames (row and column autocorrelation): 22.5 +/- 1 x 7.5 +/- .5 cm;
//   - lamp:    the light on the work against the pre-upgrade rig: a white Lambert card at the strike point through the
//              ForgeLighting.cginc model, from the effective tuning Unity echoes ('tuned'), within +/- 15%. The rendered
//              cold anvil-face luma is reported beside it (and the pre-upgrade one with --baseline <dir of heat-0.6.png>):
//              the old face was a near-mirror of a black probe (luma about 4), so it cannot be matched literally;
//   - contact: a 30 px anvil-face patch under a Qa('room-occluder:...') sphere 1 cm above contact against the same
//              sphere at the apex: at least 25% darker;
//   - flicker: anvil-face relative luminance (linear light) over 10 s at 30 fps: 8-20% peak to peak, dominant frequency
//              2-4 Hz; reduced motion at most 2% (the bench and floor beside the anvil are reported too); and the flame's
//              frame-to-frame change at 120 fps has no steps;
//   - looks:   the work view (empty and with a knife), the hearth, close-ups and room views, at tier 0 and tier 2
//              (the FORGE_LITE variant phones start on), for eyeballing.
//  --url <page>: live checks in the real Web player through lib.mjs, per --profiles (default desktop): work-view draw
//   calls (idle, anvil, striking), frame times through 10 strikes, the MSAA sample count WebGL actually allocates,
//   the quality messages, the AO bake time (console) and transfer. --qa tier2,bloom0 adds ?forge-room-qa=... (Unity
//   reads it from the page URL: pin a tier, force the bloom level count). Frame times need an idle machine.
//
// usage: node scripts/forge-qa/room.mjs --out <dir> [--project unity/ForgeOrFold] [--only looks,void,brick,lamp,contact,flicker]
//          [--baseline <dir>] [--tune <json overrides>] [--view desktop|phone] [--analyze] [--keep-frames]
//        node scripts/forge-qa/room.mjs --out <dir> --url http://127.0.0.1:4173/minigames/forgeOrFold/ [--profiles desktop,phone] [--qa bloom0,tier2]
// Writes <out>/room-report.json and prints a summary. Exit code 1 when a measured check fails.
import { spawn, execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { inflateSync } from 'node:zlib'

const arg = (name, d) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : d }
const flag = name => process.argv.includes('--' + name)
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const project = resolve(arg('project', join(repo, 'unity/ForgeOrFold')))
const out = resolve(arg('out', join(repo, 'output/room-qa')))
const only = new Set((arg('only', 'looks,void,brick,lamp,contact,flicker')).split(','))
const baselineDir = arg('baseline', '')
const editor = process.env.UNITY_EDITOR || '/Applications/Unity/Hub/Editor/6000.3.18f1/Unity.app/Contents/MacOS/Unity'

// ---------- layout (ForgeLayoutData.cs) ----------
const L = {
  workEye: [0, 1.58, -0.98], workPitch: 48.8, workYaw: 4.5, fovDesktop: 42,
  strikePoint: [0.05, 0.846, -0.40], anvilTop: 0.84, faceCentre: [0.05, 0.84, -0.40],
  // Pre-upgrade camera (stance z -1.48, eye 1.62, pitch 20, FOV 60) and its polished face top.
  oldEye: [0, 1.62, -1.48], oldPitch: 20, oldFov: 60, oldFace: [-0.01, 1.0245, -0.40],
}

// ---------- PNG decode and measurements ----------
export function decodePng(file) {
  const b = readFileSync(file); let o = 8, w = 0, h = 0, ct = 0, bd = 0; const idat = []
  while (o < b.length) {
    const len = b.readUInt32BE(o); const type = b.toString('ascii', o + 4, o + 8); const d = b.subarray(o + 8, o + 8 + len)
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; if (d[12]) throw new Error('interlaced PNG') } else if (type === 'IDAT') idat.push(d); else if (type === 'IEND') break
    o += 12 + len
  }
  if (bd !== 8) throw new Error('PNG bit depth ' + bd)
  const ch = ct === 2 ? 3 : ct === 6 ? 4 : ct === 0 ? 1 : ct === 4 ? 2 : 0; if (!ch) throw new Error('PNG colour type ' + ct)
  const raw = inflateSync(Buffer.concat(idat)); const stride = w * ch; const rgb = Buffer.alloc(w * h * 3); const prev = Buffer.alloc(stride), cur = Buffer.alloc(stride)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]; raw.copy(cur, 0, y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0, up = prev[i], c = i >= ch ? prev[i - ch] : 0
      if (f === 1) cur[i] = (cur[i] + a) & 255; else if (f === 2) cur[i] = (cur[i] + up) & 255; else if (f === 3) cur[i] = (cur[i] + ((a + up) >> 1)) & 255
      else if (f === 4) { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); cur[i] = (cur[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c)) & 255 }
    }
    for (let x = 0; x < w; x++) { const s = x * ch, d = (y * w + x) * 3; if (ch >= 3) { rgb[d] = cur[s]; rgb[d + 1] = cur[s + 1]; rgb[d + 2] = cur[s + 2] } else rgb[d] = rgb[d + 1] = rgb[d + 2] = cur[s] }
    cur.copy(prev)
  }
  return { w, h, rgb }
}
const luma601 = (d, i) => .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2]
const SRGB = Array.from({ length: 256 }, (_, v) => { const c = v / 255; return c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4) })
/** Relative luminance (linear light, Rec.709) of a pixel. */
const relLum = (d, i) => .2126 * SRGB[d[i]] + .7152 * SRGB[d[i + 1]] + .0722 * SRGB[d[i + 2]]
/** Mean relative luminance of a square patch (linear light: the quantity the flicker targets are stated in). */
export function patchLuminance(img, cx, cy, size = 30) {
  const x0 = Math.max(0, Math.round(cx - size / 2)), y0 = Math.max(0, Math.round(cy - size / 2)), x1 = Math.min(img.w, x0 + size), y1 = Math.min(img.h, y0 + size)
  let s = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += relLum(img.rgb, (y * img.w + x) * 3); n++ } return n ? s / n : NaN
}
/** Mean luma of a square patch of `size` px centred on (cx, cy). */
export function patchLuma(img, cx, cy, size = 30) {
  const x0 = Math.max(0, Math.round(cx - size / 2)), y0 = Math.max(0, Math.round(cy - size / 2)), x1 = Math.min(img.w, x0 + size), y1 = Math.min(img.h, y0 + size)
  let s = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += luma601(img.rgb, (y * img.w + x) * 3); n++ } return n ? s / n : NaN
}
/** Fraction of pixels that show the magenta QA clear colour after exposure, ACES and vignette (about 200-235, 0, 200-235). */
export function magentaFraction(img) {
  let n = 0; const d = img.rgb
  for (let i = 0; i < d.length; i += 3) if (d[i] > 140 && d[i + 2] > 140 && d[i + 1] < 50 && Math.abs(d[i] - d[i + 2]) < 40) n++
  return n / (img.w * img.h)
}
/** Unity camera projection: world point -> PNG pixel (y down). Rotation Euler(pitch, yaw, 0). */
export function toPixel(p, eye, yawDeg, pitchDeg, fovDeg, w, h) {
  const r = Math.PI / 180, cy = Math.cos(yawDeg * r), sy = Math.sin(yawDeg * r), cp = Math.cos(pitchDeg * r), sp = Math.sin(pitchDeg * r)
  const rot = v => [v[0] * cy + v[2] * sy, v[1], -v[0] * sy + v[2] * cy]
  const fwd = rot([0, -sp, cp]), up = rot([0, cp, sp]), right = rot([1, 0, 0])
  const d = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const z = dot(d, fwd), t = Math.tan(fovDeg * r / 2), aspect = w / h
  return { x: w / 2 + dot(d, right) / z / (t * aspect) * w / 2, y: h / 2 - dot(d, up) / z / t * h / 2, z }
}
/** Dominant period (px) of a 1-D signal from its autocorrelation: the highest peak with lag in [lo, hi], parabola-refined. */
function acPeriod(signals, lo, hi) {
  const ac = new Float64Array(hi + 2)
  for (const s of signals) {
    const n = s.length; let m = 0; for (const v of s) m += v; m /= n; let den = 0; for (const v of s) den += (v - m) * (v - m); if (den <= 0) continue
    for (let lag = 0; lag <= hi + 1 && lag < n; lag++) { let num = 0; for (let i = 0; i + lag < n; i++) num += (s[i] - m) * (s[i + lag] - m); ac[lag] += num / den * n / (n - lag) }
  }
  let best = -1, bestLag = 0; for (let lag = lo; lag <= hi; lag++) if (ac[lag] > ac[lag - 1] && ac[lag] >= ac[lag + 1] && ac[lag] > best) { best = ac[lag]; bestLag = lag }
  if (!bestLag) return { period: NaN, strength: 0 }
  const a = ac[bestLag - 1], b = ac[bestLag], c = ac[bestLag + 1], den = a - 2 * b + c
  return { period: bestLag + (den !== 0 ? .5 * (a - c) / den : 0), strength: b / Math.max(1e-9, ac[0]) }
}
/** Brick module from a straight-on frame: metres per pixel at the wall plane `mpp`. Analyses the centre region. */
export function brickModule(img, mpp, region = [.2, .15, .8, .85]) {
  const [fx0, fy0, fx1, fy1] = region, x0 = Math.round(fx0 * img.w), x1 = Math.round(fx1 * img.w), y0 = Math.round(fy0 * img.h), y1 = Math.round(fy1 * img.h)
  const L = (x, y) => luma601(img.rgb, (y * img.w + x) * 3)
  const cols = [], rows = []
  for (let x = x0; x < x1; x += 4) { const s = []; for (let y = y0; y < y1; y++) s.push(L(x, y)); cols.push(s) }
  for (let y = y0; y < y1; y += 3) { const s = []; for (let x = x0; x < x1; x++) s.push(L(x, y)); rows.push(s) }
  const v = acPeriod(cols, Math.round(.04 / mpp), Math.round(.12 / mpp)), u = acPeriod(rows, Math.round(.14 / mpp), Math.min(x1 - x0 - 2, Math.round(.35 / mpp)))
  return { courseM: v.period * mpp, lengthM: u.period * mpp, courseStrength: +v.strength.toFixed(3), lengthStrength: +u.strength.toFixed(3) }
}
/** Peak frequency (Hz) of a sampled series (DFT scan) between lo and hi. */
function spectralPeak(x, rate, lo = .3, hi = 12, step = .02) {
  const n = x.length; let m = 0; for (const v of x) m += v; m /= n; let best = 0, bestHz = 0
  for (let f = lo; f <= hi; f += step) { let re = 0, im = 0; for (let i = 0; i < n; i++) { const a = 2 * Math.PI * f * i / rate; re += (x[i] - m) * Math.cos(a); im += (x[i] - m) * Math.sin(a) } const mag = Math.hypot(re, im) / n; if (mag > best) { best = mag; bestHz = f } }
  return { hz: +bestHz.toFixed(2), mag: best }
}
const r3 = v => Math.round(v * 1000) / 1000

// ---------- light on the work (analytic, the ForgeLighting.cginc lamp model) ----------
// Luminance of a white Lambert card lying face up on the work, from every room light, before exposure: what the
// key light's calibration is about (the plan's "cold anvil-face luminance" cannot be compared directly, because the
// pre-upgrade face was a near-mirror reflecting a black probe). Lamps: radiance x N.L / (1 + .4 d^2) / pi; the
// ambient fill and the hearth bounce are added as they are in ForgeLitAO. The candles are left out (a few %).
const lin = c => c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4)
const hexLin = h => [0, 2, 4].map(i => lin(parseInt(h.slice(i, i + 2), 16) / 255))
const lumY = c => .2126 * c[0] + .7152 * c[1] + .0722 * c[2]
const v3 = { sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], mul: (a, k) => a.map(x => x * k), add: (a, b) => a.map((x, i) => x + b[i]) }
function lampOnCard(pos, rad, p, cone = () => 1) { const d = v3.sub(pos, p), d2 = Math.max(.01, v3.dot(d, d)), l = v3.mul(d, 1 / Math.sqrt(d2)); return v3.mul(rad, Math.max(0, l[1]) * cone(l) / (1 + .4 * d2) / Math.PI) }
export function cardNow(r, p = L.faceCentre) {
  const cosO = Math.cos(r.lampConeOuter * Math.PI / 180), cosI = Math.cos(r.lampConeInner * Math.PI / 180)
  const cone = l => { const ca = l[1]; let c = Math.min(1, Math.max(0, (ca - cosO) / Math.max(.001, cosI - cosO))); c = c * c * (3 - 2 * c); return Math.max(c, r.lampUpSpill * Math.min(1, Math.max(0, -ca * 2.5 - .25))) }
  let c = lampOnCard([.35, 2.05, -.75], v3.mul(hexLin(r.lampColor), r.lampIntensity), p, cone)
  c = v3.add(c, lampOnCard([2.35, 2.36, 1.76], v3.mul(hexLin(r.rimColor), r.rimIntensity), p))
  c = v3.add(c, lampOnCard([-1.15, .88 + r.fireLift, -.42], v3.mul(hexLin(r.fireColor), r.fireIntensity * r.fireScale), p))
  const bp = [-1.10, .70, -.80], d = v3.sub(bp, p), d2 = v3.dot(d, d), wrap = Math.min(1, Math.max(0, d[1] / Math.sqrt(d2) * .5 + .5))
  c = v3.add(c, v3.mul(hexLin(r.bounceColor), r.fireIntensity * r.fireScale * r.fireBounce * wrap * wrap / (1 + d2 * (r.bounceFalloff ?? .22))))
  return lumY(v3.add(c, v3.mul([.13, .11, .09], r.ambientScale)))
}
/** The same card on the pre-upgrade face (phase-0 lights: key, rim and furnace omni lamps, fill .13/.11/.09). */
export function cardBefore(p = L.oldFace) {
  let c = lampOnCard([-.65, 2.8, -1.15], v3.mul(hexLin('ffe0af'), 3.0 * .7 * 3.3), p)
  c = v3.add(c, lampOnCard([2.3, 2.35, 1.65], v3.mul(hexLin('a4b8d2'), 2.2 * .7 * 3.3), p))
  c = v3.add(c, lampOnCard([-2.45, 1.28, .25], v3.mul(hexLin('ff9a48'), 2.6 * .55 * 2.8), p))
  return lumY(v3.add(c, [.13, .11, .09]))
}

// ---------- main (only when run directly; importing this module for its helpers runs nothing) ----------
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()

async function main() {
mkdirSync(out, { recursive: true })
// ---------- live mode ----------
if (arg('url')) {
  const lib = await import('./lib.mjs')
  const report = { url: arg('url'), profiles: {} }
  for (const kind of arg('profiles', 'desktop').split(',')) {
    const h = await lib.launch(kind, { out: join(out, kind) })
    try {
      // Record the MSAA samples of every multisampled renderbuffer (Unity's MSAA camera target).
      await h.context.addInitScript(() => {
        window.__roomMsaa = []; const P = window.WebGL2RenderingContext && WebGL2RenderingContext.prototype
        if (P) { const f = P.renderbufferStorageMultisample; P.renderbufferStorageMultisample = function (target, samples, format, w, hh) { window.__roomMsaa.push({ t: performance.now(), samples, format, w, h: hh }); return f.call(this, target, samples, format, w, hh) } }
      })
      const u = new URL(arg('url')); if (arg('qa')) u.searchParams.set('forge-room-qa', arg('qa'))   // this stream's modes (tierN, bloomN), read by Unity itself
      const o = await lib.open(h, u.toString(), { telemetry: true })
      await lib.sleep(4000)   // past the governor's ignore window and budget learning
      const idle = await lib.sampleDrawCalls(h, 1500)
      await lib.ensureForging(h)
      await lib.sleep(1200)
      const anvil = await lib.sampleDrawCalls(h, 1500)
      const a = await lib.now(h)
      for (let i = 0; i < 10; i++) await lib.strike(h)
      const b = await lib.now(h)
      const striking = await lib.drawCalls(h, a, b), frames = await lib.frameTimes(h, a, b)
      const quality = (await lib.unityEvents(h, 0, 'quality')).map(e => ({ t: Math.round(e.t), tier: e.spot }))
      const perf = (await lib.unityEvents(h, 0, 'perf')).slice(-5).map(e => ({ t: Math.round(e.t), tier: e.id, p90: r3(e.x), median: r3(e.y) }))
      const msaa = await h.page.evaluate(() => window.__roomMsaa)
      const canvas = (await lib.hud(h)).canvas
      await h.shot('work-view')
      report.profiles[kind] = { open: o, canvas, drawCalls: { idle, anvil, striking }, frames, quality, perf, msaa: msaa.map(m => ({ samples: m.samples, w: m.w, h: m.h })), console: h.consoleLines.filter(l => /error|exception/i.test(l)).slice(0, 10), room: h.consoleLines.filter(l => /FORGE_ROOM/.test(l)).slice(0, 10), transfer: lib.transferBytes(h) }
      const p = report.profiles[kind]
      console.log(`${kind}: ready ${o.readyMs} ms, canvas ${canvas?.w}x${canvas?.h}; draw calls idle ${idle.calls_med}, anvil ${anvil.calls_med}, striking ${striking.calls_med} (p95 ${striking.calls_p95}); frames p95 ${frames.p95} ms, max ${frames.max}; tiers ${quality.map(q => q.tier).join('>') || '-'}; MSAA ${[...new Set(p.msaa.map(m => m.samples))].join(',') || 'none'}`)
    } finally { await h.close() }
  }
  writeFileSync(join(out, 'room-report.json'), JSON.stringify(report, null, 1))
  console.log('report:', join(out, 'room-report.json'))
  process.exit(0)
}

// ---------- editor fixtures ----------
const { act, createRun } = await import('../../src/minigames/forge/engine.ts')
const { snapshotPayload, unityEffect, forgeView } = await import('../../src/minigames/forge/bridge.ts')
const payload = (state, event, extra = {}) => JSON.stringify({ ...snapshotPayload(state, 1, { reduced: false, ...extra }), effect: unityEffect(event) })
const step = (s, a) => { const r = act(s, a); if (!r.ok) throw new Error(`fixture action failed: ${JSON.stringify(a)}`); return r }
const s0 = createRun(1)
const furnace = step(s0, { type: 'move', id: 1, to: 'furnace' })
const heated = step(furnace.state, { type: 'heat', id: 1 })
const seated = step(heated.state, { type: 'move', id: 1, to: 'anvil' })
// --tune '{"room":{"lampIntensity":4}}' merges overrides into feel-tuning.json for this run (quick A/B without edits).
const tuning = (() => { const t = JSON.parse(readFileSync(join(repo, 'src/minigames/forge/feel-tuning.json'), 'utf8')); const o = JSON.parse(arg('tune', '{}')); for (const k of Object.keys(o)) t[k] = { ...(t[k] || {}), ...o[k] }; return JSON.stringify(t) })()
// --view phone renders the steady job at a 390 x 844 CSS phone (DPR 2, work FOV 62) for the looks; the measured checks
// are calibrated for the desktop work view.
const phone = arg('view', 'desktop') === 'phone', VW = phone ? 780 : 1440, VH = phone ? 1688 : 900, workFov = phone ? 62 : L.fovDesktop
const insets = phone ? forgeView(390, 844, 2, true) : forgeView(1440, 900, 1, false)
const W8 = s => ({ do: 'wait', s }), C = name => ({ do: 'capture', name }), Q = mode => ({ do: 'qa', mode })
const pin = (x, y, z, yaw, pitch, fov) => Q(`room-cam:${[x, y, z, yaw, pitch, fov].map(v => +(+v).toFixed(4)).join(',')}`)
const work = () => pin(...L.workEye, L.workYaw, L.workPitch, workFov)
const head = [{ do: 'tune', json: tuning }, { do: 'insets', json: JSON.stringify(insets) }, { do: 'sync', json: payload(s0) }, W8(1.0), { do: 'focus' }, W8(.6)]

// Straight-on wall views for the brick module (camera on the wall normal, distance d, vertical FOV 30).
const walls = [
  { name: 'brick-front', cam: [-1.0, 1.6, -3.79 + 1.39, 180, 0, 30], d: 1.39 },
  { name: 'brick-back', cam: [-2.15, 1.75, 2.01 - 1.39, 0, 0, 30], d: 1.39 },
  { name: 'brick-right', cam: [3.425 - 1.30, 1.25, -3.0, 90, 0, 30], d: 1.30 },
]
const voidViews = []
for (const yaw of [0, 90, 180, 270]) for (const pitch of [-70, 0, 70]) voidViews.push({ name: `void-y${yaw}-p${pitch}`, cam: [...L.workEye, yaw, pitch, 62] })
const looks = [
  ['look-work', [...L.workEye, L.workYaw, L.workPitch, workFov]], ['look-face', [.05, 1.12, -.78, 0, 52, 45]], ['look-anvil-right', [.95, 1.25, -.95, -52, 24, 50]],
  ['look-anvil-left', [-.62, 1.05, -1.0, 38, 14, 50]], ['look-hearth', [.5, 1.55, -2.2, -32, 16, 60]], ['look-hearth-close', [-.42, 1.45, -1.35, -38, 32, 50]],
  ['look-door', [2.7, 2.1, -3.4, -38, 14, 72]], ['look-backleft', [-2.9, 2.0, 1.5, 148, 14, 72]], ['look-ceiling', [0, 1.6, -2.0, 0, -40, 72]],
  ['look-low', [-.2, .35, -1.6, 10, -8, 60]], ['look-lamp', [.9, 1.75, -1.6, -35, -14, 40]], ['look-front', [0, 1.7, 1.3, 180, 8, 72]],
]
function steadyJob() {
  const s = [...head, Q('steady')]
  if (only.has('lamp') || only.has('flicker')) s.push(work(), W8(.1), C('work-empty'))
  if (only.has('contact')) {
    const r = .045, sp = L.strikePoint
    s.push(work(), Q(`room-occluder:${sp[0]},${sp[1] + .01 + r},${sp[2]},${r}`), W8(.05), C('contact-1cm'), Q(`room-occluder:.30,1.24,-.72,${r}`), W8(.05), C('contact-apex'), Q('room-occluder:off'), W8(.05))
  }
  if (only.has('looks')) {
    for (const [n, c] of looks) s.push(pin(...c), W8(.1), C(n))
    s.push({ do: 'sync', json: payload(seated.state, seated.event) }, W8(1.2), work(), W8(.1), C('look-work-knife'), pin(.05, 1.12, -.78, 0, 52, 45), W8(.1), C('look-face-knife'))
    s.push(Q('tier2'), W8(.1), work(), W8(.05), C('lite-work-knife'), pin(...looks[4][1]), W8(.05), C('lite-hearth'), pin(...looks[7][1]), W8(.05), C('lite-backleft'), Q('tier0'), W8(.1))
    s.push(Q('room-cam:off'), W8(.2), C('smith-work'), { do: 'lookAt', spot: 'furnace' }, W8(1.0), C('smith-hearth'), { do: 'focus' }, W8(.6))
  }
  if (only.has('brick')) for (const v of walls) s.push(pin(...v.cam), W8(.1), C(v.name))
  if (only.has('void')) {
    s.push(Q('void'), W8(.05))
    for (const v of voidViews) s.push(pin(...v.cam), W8(.05), C(v.name))
    s.push(Q('room-cam:off'), W8(.2))
    for (const [n, yaw, pitch] of [['front', 0, 0], ['right', 90, 0], ['back', 180, 0], ['left', -90, 0], ['up', 0, -65], ['down', 0, 78]]) s.push({ do: 'look', yaw, pitch }, W8(1.0), C('void-look-' + n))
  }
  return { view: phone ? 'phone' : 'desktop', width: VW, height: VH, dt: 1 / 120, timeout: 300, steps: s }
}
const FLICKER_N = 300, FLICKER_RATE = 30, FLAME_N = 120
function flickerJob() {
  const s = [...head, work(), W8(.5)]
  for (let i = 0; i < FLICKER_N; i++) s.push(C(`fl-${String(i).padStart(3, '0')}`), W8(1 / FLICKER_RATE))
  s.push({ do: 'sync', json: payload(s0, undefined, { reduced: true }) }, W8(1.0))
  for (let i = 0; i < FLICKER_N; i++) s.push(C(`rm-${String(i).padStart(3, '0')}`), W8(1 / FLICKER_RATE))
  s.push({ do: 'sync', json: payload(s0) }, pin(-.62, 1.32, -.98, -43, 30, 34), W8(.5))
  for (let i = 0; i < FLAME_N; i++) s.push(C(`fm-${String(i).padStart(3, '0')}`), W8(1 / 120))
  return { view: 'desktop', width: 480, height: 300, dt: 1 / 120, timeout: 300, steps: s }
}

function runUnity(job, dir) {
  mkdirSync(dir, { recursive: true })
  const fixtures = join(dir, 'fixtures.json'); writeFileSync(fixtures, JSON.stringify(job, null, 1))
  let busy = ''; try { busy = execSync('pgrep -fl "projectPath"').toString() } catch { /* none */ }
  if (busy.split('\n').some(l => l.includes(project))) { console.error('room.mjs: another Unity has this project open'); process.exit(3) }
  const log = join(dir, 'unity.log'), started = Date.now()
  const child = spawn(editor, ['-batchmode', '-projectPath', project, '-executeMethod', 'ForgeSnapshots.Capture', '-forgeOut', dir, '-forgeFixtures', fixtures, '-logFile', log], { stdio: 'ignore' })
  const kill = setTimeout(() => child.kill('SIGKILL'), 15 * 60 * 1000)
  return new Promise(res => child.on('exit', code => {
    clearTimeout(kill); const ok = code === 0 && existsSync(join(dir, 'index.json'))
    console.log(`room.mjs: Unity ${ok ? 'OK' : 'FAILED (' + code + ')'} in ${((Date.now() - started) / 1000).toFixed(1)} s -> ${dir}`)
    if (!ok && existsSync(log)) console.error(readFileSync(log, 'utf8').split('\n').filter(l => /error CS|Shader error|Exception|FORGE_SNAPSHOTS/.test(l)).slice(-20).join('\n'))
    res(ok)
  }))
}

const steadyDir = join(out, 'steady'), flickerDir = join(out, 'flicker')
if (!flag('analyze')) {
  const wantSteady = ['looks', 'void', 'brick', 'lamp', 'contact'].some(k => only.has(k)), wantFlicker = only.has('flicker')
  if (wantSteady && !await runUnity(steadyJob(), steadyDir)) process.exit(1)
  if (wantFlicker && !await runUnity(flickerJob(), flickerDir)) process.exit(1)
}

// ---------- analysis ----------
const report = { checks: {}, notes: [] }
const check = (name, pass, value, target) => { report.checks[name] = { pass, value, target }; console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${typeof value === 'object' ? JSON.stringify(value) : value} (target ${target})`) }
const shot = (dir, name) => { const f = join(dir, name + '.png'); return existsSync(f) ? decodePng(f) : null }
const bakeLine = d => { const f = join(d, 'unity.log'); if (!existsSync(f)) return null; const m = readFileSync(f, 'utf8').match(/FORGE_ROOM merged.*/); return m ? m[0] : null }
report.bake = bakeLine(steadyDir) || bakeLine(flickerDir)

if (only.has('void') && existsSync(steadyDir)) {
  const rows = []
  for (const n of [...voidViews.map(v => v.name), ...['front', 'right', 'back', 'left', 'up', 'down'].map(n => 'void-look-' + n)]) { const img = shot(steadyDir, n); if (img) rows.push({ view: n, clear: r3(magentaFraction(img) * 100) }) }
  const worst = rows.reduce((a, b) => b.clear > a.clear ? b : a, { clear: -1 })
  check('void: clear-colour pixels (worst view, %)', rows.length > 0 && worst.clear <= .5, rows.length ? `${worst.clear}% at ${worst.view}` : 'no frames', '<= 0.5%')
  report.void = rows
}
if (only.has('brick') && existsSync(steadyDir)) {
  const rows = []
  for (const v of walls) { const img = shot(steadyDir, v.name); if (!img) continue; const mpp = 2 * v.d * Math.tan(v.cam[5] * Math.PI / 360) / img.h; const m = brickModule(img, mpp); rows.push({ view: v.name, course_cm: r3(m.courseM * 100), length_cm: r3(m.lengthM * 100), strength: [m.courseStrength, m.lengthStrength] }) }
  report.brick = rows
  for (const r of rows) check(`brick module ${r.view} (cm)`, Math.abs(r.length_cm - 22.5) <= 1 && Math.abs(r.course_cm - 7.5) <= .5, `${r.length_cm} x ${r.course_cm}`, '22.5 +/- 1 x 7.5 +/- .5')
}
if (only.has('lamp') && existsSync(steadyDir)) {
  // The calibration check: the light on the work against the pre-upgrade rig (analytic white card, +/- 15%).
  const idx = existsSync(join(steadyDir, 'index.json')) ? JSON.parse(readFileSync(join(steadyDir, 'index.json'), 'utf8')) : { messages: [] }
  const tunedLine = [...idx.messages].reverse().find(m => m.includes('"type":"tuned"'))
  const room = tunedLine ? JSON.parse(JSON.parse(tunedLine.slice(tunedLine.indexOf('{'))).spot).room : null
  report.lamp = {}
  if (room) { const now = cardNow(room), then = cardBefore(); report.lamp.card = { now: r3(now), before: r3(then), ratio: r3(now / then) }; check('lamp: light on the work (white card at the strike point) vs pre-upgrade', Math.abs(now / then - 1) <= .15, `${r3(now)} vs ${r3(then)} (x${r3(now / then)})`, 'within +/- 15%') }
  // For the record: the rendered cold face (the pre-upgrade face was a near-mirror of a black probe, luma about 4).
  const img = shot(steadyDir, 'work-empty')
  if (img) {
    const p = toPixel(L.faceCentre, L.workEye, L.workYaw, L.workPitch, L.fovDesktop, img.w, img.h); report.lamp.faceLuma = r3(patchLuma(img, p.x, p.y, 30)); report.lamp.faceAt = [Math.round(p.x), Math.round(p.y)]
    const base = baselineDir && existsSync(join(baselineDir, 'heat-0.6.png')) ? decodePng(join(baselineDir, 'heat-0.6.png')) : null
    if (base) { const q = toPixel(L.oldFace, L.oldEye, 0, L.oldPitch, L.oldFov, base.w, base.h); report.lamp.baselineFaceLuma = r3(patchLuma(base, q.x, q.y, 30)) }
    report.notes.push(`lamp: rendered cold anvil face luma ${report.lamp.faceLuma}` + (report.lamp.baselineFaceLuma != null ? ` (pre-upgrade ${report.lamp.baselineFaceLuma})` : ''))
  }
}
if (only.has('contact') && existsSync(steadyDir)) {
  const a = shot(steadyDir, 'contact-1cm'), b = shot(steadyDir, 'contact-apex')
  if (a && b) {
    const p = toPixel(L.strikePoint, L.workEye, L.workYaw, L.workPitch, L.fovDesktop, a.w, a.h)
    const under = patchLuma(a, p.x, p.y, 30), open = patchLuma(b, p.x, p.y, 30)
    const q = toPixel([L.strikePoint[0], L.anvilTop, L.strikePoint[2] + .06], L.workEye, L.workYaw, L.workPitch, L.fovDesktop, a.w, a.h)
    const beyond = patchLuma(a, q.x, q.y, 30) / patchLuma(b, q.x, q.y, 30)
    report.contact = { under: r3(under), apex: r3(open), ratio: r3(under / open), beyondRatio: r3(beyond) }
    check('contact shadow: patch under the head 1 cm above contact vs apex', under / open <= .75, `x${r3(under / open)} (6 cm beyond the head: x${r3(beyond)})`, '<= 0.75')
  }
}
if (only.has('flicker') && existsSync(flickerDir)) {
  // Patches in the work view: the anvil face (the acceptance patch), the bench top behind it and the floor beside the stump.
  const patches = { face: [L.faceCentre, 12], bench: [[.30, .85, .25], 16], floor: [[.45, 0, -.30], 16] }
  const series = (prefix, n) => { const v = {}; for (const k in patches) v[k] = { lum: [], luma: [] }; let at = null
    for (let i = 0; i < n; i++) { const img = shot(flickerDir, `${prefix}-${String(i).padStart(3, '0')}`); if (!img) break
      if (!at) { at = {}; for (const k in patches) at[k] = toPixel(patches[k][0], L.workEye, L.workYaw, L.workPitch, L.fovDesktop, img.w, img.h) }
      for (const k in patches) { v[k].lum.push(patchLuminance(img, at[k].x, at[k].y, patches[k][1])); v[k].luma.push(patchLuma(img, at[k].x, at[k].y, patches[k][1])) } }
    return v }
  const ptp = v => { const m = v.reduce((a, b) => a + b, 0) / v.length; return (Math.max(...v) - Math.min(...v)) / m }
  const full = series('fl', FLICKER_N), calm = series('rm', FLICKER_N)
  if (full.face.lum.length > 30) {
    const pk = spectralPeak(full.face.lum, FLICKER_RATE, .3, 12)
    report.flicker = { frames: full.face.lum.length, metric: 'relative luminance (linear light), peak to peak / mean', peakHz: pk.hz }
    for (const k in patches) report.flicker[k] = { peakToPeak: r3(ptp(full[k].lum) * 100), lumaPeakToPeak: r3(ptp(full[k].luma) * 100), reducedPeakToPeak: calm[k].lum.length ? r3(ptp(calm[k].lum) * 100) : null, peakHz: spectralPeak(full[k].lum, FLICKER_RATE, .3, 12).hz }
    report.flicker.faceSeries = full.face.lum.map(v => +v.toFixed(5))
    const f = ptp(full.face.lum)
    check('flicker: anvil-face luminance peak to peak (%)', f >= .08 && f <= .20, `${r3(f * 100)} (bench ${report.flicker.bench.peakToPeak}, floor ${report.flicker.floor.peakToPeak})`, '8-20%')
    check('flicker: dominant frequency (Hz)', pk.hz >= 2 && pk.hz <= 4, pk.hz, '2-4 Hz')
    if (calm.face.lum.length) check('flicker: reduced motion, anvil-face peak to peak (%)', ptp(calm.face.lum) <= .02, `${r3(ptp(calm.face.lum) * 100)} (bench ${report.flicker.bench.reducedPeakToPeak}, floor ${report.flicker.floor.reducedPeakToPeak})`, '<= 2%')
  }
  // Flame steps: mean absolute frame-to-frame change over the flame region; a 14 fps atlas step shows as spikes.
  const frames = []; for (let i = 0; i < FLAME_N; i++) { const img = shot(flickerDir, `fm-${String(i).padStart(3, '0')}`); if (!img) break; frames.push(img) }
  if (frames.length > 10) {
    const { w, h } = frames[0]; let best = { x: 0, y: 0, l: -1 }
    for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) { const l = luma601(frames[0].rgb, (y * w + x) * 3); if (l > best.l) best = { x, y, l } }
    const x0 = Math.max(0, best.x - 50), x1 = Math.min(w, best.x + 50), y0 = Math.max(0, best.y - 70), y1 = Math.min(h, best.y + 30), diffs = []
    for (let k = 1; k < frames.length; k++) { let s = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * w + x) * 3; s += Math.abs(luma601(frames[k].rgb, i) - luma601(frames[k - 1].rgb, i)); n++ } diffs.push(s / n) }
    const sorted = [...diffs].sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)], max = sorted.at(-1)
    const at14 = spectralPeak(diffs, 120, 13, 15, .05).mag, around = (spectralPeak(diffs, 120, 9, 12, .05).mag + spectralPeak(diffs, 120, 16, 19, .05).mag) / 2
    report.flame = { medianDiff: r3(med), maxDiff: r3(max), spikeRatio: r3(max / med), mag14: r3(at14), magAround: r3(around) }
    check('flame: no frame steps (max / median frame-to-frame change)', max / med <= 3, r3(max / med), '<= 3')
  }
  if (!flag('keep-frames')) for (const f of readdirSync(flickerDir)) if (/^(fl|rm|fm)-\d+\.png$/.test(f) && !/-(000|001)\.png$/.test(f)) rmSync(join(flickerDir, f))
}
report.pass = Object.values(report.checks).every(c => c.pass)
writeFileSync(join(out, 'room-report.json'), JSON.stringify(report, null, 1))
if (report.bake) console.log(report.bake)
for (const n of report.notes) console.log('note:', n)
console.log(`room.mjs: ${Object.values(report.checks).filter(c => c.pass).length}/${Object.keys(report.checks).length} checks pass -> ${join(out, 'room-report.json')}`)
process.exit(report.pass ? 0 : 1)
}
