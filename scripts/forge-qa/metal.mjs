// hot-metal-vfx QA: heat colour, cooling, scale flakes, sparks, chips, notch, shatter pieces, cracks, quench,
// rack/day-2 glow, coins and the swatch calibration, measured on snapshot-loop PNGs of the real Unity scene.
// usage:
//   node scripts/forge-qa/metal.mjs --out <dir> [--project unity/ForgeOrFold] [--view desktop|phone] [--dt 0.008333]
//        [--only swatch|main] [--analyse-only] [--sheet]
// Runs ForgeSnapshots.Capture with this module's fixtures (generated from the real engine via bridge.ts), then
// analyses the PNGs with scripts/forge-qa/lib.mjs helpers and the Unity 'metal' probe messages
// (Qa('metal-probe'): temperatures, blade viewport box, edge/spine points, particle and shard statistics).
// Writes <out>/metal-report.json and prints PASS/FAIL lines. Only one Unity may open a project at a time.
import { spawn, execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act, createRun } from '../../src/minigames/forge/engine.ts'
import { snapshotPayload, unityEffect, forgeView } from '../../src/minigames/forge/bridge.ts'
import { profile } from '../../src/minigames/forge/knives.ts'

const arg = (name, d) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : d }
const flag = name => process.argv.includes('--' + name)
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const project = resolve(arg('project', join(repo, 'unity/ForgeOrFold')))
const out = resolve(arg('out', join(repo, 'output/forge-metal', new Date().toISOString().replace(/[:.]/g, '-'))))
const view = arg('view', 'desktop'), dt = Number(arg('dt', 1 / 120)), only = arg('only', 'all')
const editor = process.env.UNITY_EDITOR || '/Applications/Unity/Hub/Editor/6000.3.18f1/Unity.app/Contents/MacOS/Unity'

// ---------- fixtures from the real engine ----------
// --reduced: the OS prefers-reduced-motion flag (and Motion 'reduced') in every Sync.
const REDUCED = process.argv.includes('--reduced')
const payload = (state, event, selected = 1) => JSON.stringify({ ...snapshotPayload(state, selected, { reduced: REDUCED, motion: REDUCED ? 'reduced' : 'full' }), effect: unityEffect(event) })
const step = (s, a) => { const r = act(s, a); if (!r.ok) throw new Error(`fixture action failed: ${JSON.stringify(a)}: ${r.event.text}`); return r }
function findHit(outcome, minLevel = 0) {
  for (let seed = 1; seed < 8000; seed++) {
    let s = createRun(seed)
    for (const a of [{ type: 'move', id: 1, to: 'furnace' }, { type: 'heat', id: 1 }, { type: 'move', id: 1, to: 'anvil' }]) s = step(s, a).state
    for (let i = 0; i < 18; i++) {
      s = step(s, { type: 'tick', ms: 1000 }).state
      const k = s.knives.find(n => n.id === 1); if (!k) break
      const r = act(s, { type: 'hit', id: 1 })
      if (!r.ok) break
      if (r.event.outcome === outcome && k.level >= minLevel && !r.event.flowStarted && !k.flow && !r.event.evolution) return { before: s, after: r.state, event: r.event, seed }
      s = r.state
      if (s.knives.find(n => n.id === 1)?.flow) break
    }
  }
  throw new Error('no fixture for outcome ' + outcome)
}
/** A copy of `state` whose knife 1 has `level` (profile recomputed by bridge.ts) — a visual fixture only. */
function atLevel(state, level) { const s = structuredClone(state); const k = s.knives.find(n => n.id === 1); k.level = level; return s }
const W = view === 'phone' ? 780 : 1440, H = view === 'phone' ? 1688 : 900
const insets = view === 'phone' ? forgeView(390, 844, 2, true) : forgeView(1440, 900, 1, false)
const s0 = createRun(1)
const furnace = step(s0, { type: 'move', id: 1, to: 'furnace' })
const heated = step(furnace.state, { type: 'heat', id: 1 })
const seated = step(heated.state, { type: 'move', id: 1, to: 'anvil' })
const racked = step(seated.state, { type: 'move', id: 1, to: 'rack' })
const day2 = step(racked.state, { type: 'end' })
const sold = step(seated.state, { type: 'sell', id: 1 })
const good = findHit('good'), perfect = findHit('perfect', 2), chip = findHit('chip', 3), shatter = findHit('shatter', 5), risky = findHit('good', 10), dull = findHit('dull', 2)
// --tune '{"emissionScale":3.2}' merges metal overrides into feel-tuning.json for this run (calibration sweeps).
const tuneJson = JSON.parse(readFileSync(join(repo, 'src/minigames/forge/feel-tuning.json'), 'utf8')); if (arg('tune')) tuneJson.metal = { ...tuneJson.metal, ...JSON.parse(arg('tune')) }
const tuning = JSON.stringify(tuneJson)
const handshake = [{ do: 'tune', json: tuning }, { do: 'qa', mode: 'steady' }, { do: 'qa', mode: 'telemetry' }, { do: 'qa', mode: 'metal-probe' }, { do: 'qa', mode: 'metal-strikepoint' }, { do: 'insets', json: JSON.stringify(insets) }]
const strikeShots = (seq, name, impact, after) => ({ do: 'strike', seq, name, contact: true, impact, afterMs: after, afterNames: after.map(ms => `${name}-${ms}`) })
// The main run, as named sections (--sections a,b runs only those, for quick iteration).
const SECTIONS = {
  heat: [
    { do: 'sync', json: payload(s0) }, { do: 'wait', s: 1.0 },
    // Heating in the coals (QA 'metal-firebed': the coals at ForgeLayout.Firebed, the knife snapped in on placement so the
    // times below are seconds in the coals; the plan's .6 / 1.1 / 1.5 s after Start include about .6 s of step and carry).
    { do: 'qa', mode: 'metal-firebed' }, { do: 'lookAt', spot: 'furnace' }, { do: 'wait', s: .3 },
    { do: 'sync', json: payload(furnace.state, furnace.event) },
    { do: 'wait', s: .1 }, { do: 'capture', name: 'heat-0.1' }, { do: 'wait', s: .4 }, { do: 'capture', name: 'heat-0.5' }, { do: 'wait', s: .4 }, { do: 'capture', name: 'heat-0.9' },
    { do: 'wait', s: .5 }, { do: 'sync', json: payload(heated.state, heated.event) },
    { do: 'focus' }, { do: 'sync', json: payload(seated.state, seated.event) },
    { do: 'wait', s: .45 }, { do: 'capture', name: 'seated' }, { do: 'wait', s: 2.6 }, { do: 'capture', name: 'anvil-3s' }, { do: 'wait', s: 5 }, { do: 'capture', name: 'anvil-8s' },
  ],
  // A drawn-out blade (level 8) cooling on the anvil: thin edge first.
  cool: [{ do: 'sync', json: payload(atLevel(seated.state, 8)) }, { do: 'qa', mode: 'metal-hot' }, { do: 'wait', s: 1 }, { do: 'capture', name: 'blade-1s' }, { do: 'wait', s: 7 }, { do: 'capture', name: 'blade-8s' }],
  // Outcomes on a freshly hot blade.
  good: [{ do: 'sync', json: payload(good.before) }, { do: 'qa', mode: 'metal-hot' }, { do: 'wait', s: .5 }, strikeShots(1, 'good', payload(good.after, good.event), [33, 100, 400, 1000, 2300]), { do: 'wait', s: .3 }],
  perfect: [{ do: 'sync', json: payload(perfect.before) }, { do: 'qa', mode: 'metal-hot' }, { do: 'wait', s: .5 }, strikeShots(2, 'perfect', payload(perfect.after, perfect.event), [33, 100, 250, 400, 1000]), { do: 'wait', s: .3 }],
  chip: [{ do: 'sync', json: payload(chip.before) }, { do: 'qa', mode: 'metal-hot' }, { do: 'wait', s: .5 }, strikeShots(3, 'chip', payload(chip.after, chip.event), [33, 100, 400, 1500]), { do: 'wait', s: .3 }],
  shatter: [{ do: 'sync', json: payload(shatter.before) }, { do: 'qa', mode: 'metal-hot' }, { do: 'wait', s: .5 }, strikeShots(4, 'shatter', payload(shatter.after, shatter.event), [33, 100, 250, 500, 1000, 2000, 3000, 3900]), { do: 'wait', s: .3 }],
  dull: [{ do: 'sync', json: payload(dull.before) }, { do: 'qa', mode: 'metal-hot' }, { do: 'wait', s: .5 }, strikeShots(6, 'dull', payload(dull.after, dull.event), [100, 400]), { do: 'wait', s: .3 }],
  // Shader debug views of the shatter pieces and a hot blade: albedo, reflected light, emission (Qa('metal-debug-N')).
  debug: [{ do: 'sync', json: payload(shatter.before) }, { do: 'qa', mode: 'metal-hot' }, { do: 'wait', s: .5 }, strikeShots(7, 'dbg', payload(shatter.after, shatter.event), [450]),
    ...[['albedo', 1], ['lit', 2], ['emit', 3], ['mask', 4], ['normal', 0]].flatMap(([n, m]) => [{ do: 'qa', mode: 'metal-debug-' + m }, { do: 'capture', name: 'dbg-' + n }]),
    { do: 'sync', json: payload(good.before) }, { do: 'qa', mode: 'metal-hot' }, { do: 'wait', s: 2 },
    ...[['albedo', 1], ['lit', 2], ['emit', 3], ['mask', 4], ['normal', 0]].flatMap(([n, m]) => [{ do: 'qa', mode: 'metal-debug-' + m }, { do: 'capture', name: 'dbgk-' + n }])],
  // Risk cracks on a high-level hot blade, then cold.
  cracks: [{ do: 'sync', json: payload(risky.before) }, { do: 'qa', mode: 'metal-hot' }, { do: 'wait', s: 1.2 }, { do: 'capture', name: 'cracks-hot' }, { do: 'qa', mode: 'metal-cold' }, { do: 'wait', s: .2 }, { do: 'capture', name: 'cracks-cold' }],
  // Shape: levels 0-6 drawing out from the bar (cold, so the outline reads).
  levels: [0, 1, 2, 3, 4, 5, 6].flatMap(level => [{ do: 'sync', json: payload(atLevel(seated.state, level)) }, { do: 'qa', mode: 'metal-cold' }, { do: 'wait', s: .4 }, { do: 'capture', name: 'level-' + level }]),
  // Blade light on the anvil face beside the blade: 1150 C against 500 C.
  light: [{ do: 'sync', json: payload(seated.state) }, { do: 'wait', s: .8 }, { do: 'qa', mode: 'metal-hot' }, { do: 'qa', mode: 'metal-c1150' }, { do: 'wait', s: .1 }, { do: 'capture', name: 'light-1150' }, { do: 'qa', mode: 'metal-c500' }, { do: 'wait', s: .1 }, { do: 'capture', name: 'light-500' }],
  // Quench (keep): a hot blade plunged, then racked.
  quench: [{ do: 'sync', json: payload(seated.state) }, { do: 'qa', mode: 'metal-hot' }, { do: 'wait', s: .3 }, { do: 'qa', mode: 'metal-quench' },
    { do: 'wait', s: .25 }, { do: 'capture', name: 'quench-0.25' }, { do: 'wait', s: .5 }, { do: 'capture', name: 'quench-0.75' }, { do: 'wait', s: .6 }, { do: 'capture', name: 'quench-1.35' }],
  // Racked and day 2: no glow.
  rack: [{ do: 'sync', json: payload(seated.state) }, { do: 'qa', mode: 'metal-hot' }, { do: 'wait', s: .2 },
    { do: 'sync', json: payload(racked.state, racked.event) }, { do: 'lookAt', spot: 'rack' }, { do: 'wait', s: .3 }, { do: 'capture', name: 'rack-0.3' }, { do: 'wait', s: 1.5 }, { do: 'capture', name: 'rack-1.8' },
    { do: 'sync', json: payload(day2.state, day2.event) }, { do: 'wait', s: 1 }, { do: 'capture', name: 'day2' }],
  // Sell: coins into the dish.
  sell: [{ do: 'focus' }, { do: 'sync', json: payload(seated.state) }, { do: 'wait', s: .6 },
    { do: 'sync', json: payload(sold.state, sold.event) }, { do: 'lookAt', spot: 'sell' }, { do: 'wait', s: .7 }, { do: 'capture', name: 'sell-0.7' }, { do: 'wait', s: .5 }, { do: 'capture', name: 'sell-1.2' }, { do: 'wait', s: .8 }, { do: 'capture', name: 'sell-2.0' },
    { do: 'focus' }, { do: 'wait', s: .2 }],
}
const sectionNames = arg('sections') ? arg('sections').split(',') : Object.keys(SECTIONS)
for (const n of sectionNames) if (!SECTIONS[n]) throw new Error('unknown section ' + n + ' (have ' + Object.keys(SECTIONS).join(', ') + ')')
const main = [...handshake, ...(sectionNames[0] === 'heat' ? [] : [{ do: 'sync', json: payload(s0) }, { do: 'wait', s: .5 }]), ...sectionNames.flatMap(n => SECTIONS[n])]
const swatch = [...handshake, { do: 'sync', json: payload(s0) }, { do: 'wait', s: 1 }, { do: 'qa', mode: 'swatch' }, { do: 'wait', s: .3 }, { do: 'capture', name: 'swatch' }, { do: 'focus' }, { do: 'wait', s: .1 }]

async function runUnity(name, steps) {
  const dir = join(out, name); mkdirSync(dir, { recursive: true })
  const fixtures = join(dir, 'fixtures.json'); writeFileSync(fixtures, JSON.stringify({ view, width: W, height: H, dt, timeout: 300, steps }, null, 1))
  let busy = ''; try { busy = execSync('pgrep -fl "projectPath"').toString() } catch { /* none */ }
  const holders = busy.split('\n').filter(l => l.includes(project)); if (holders.length) throw new Error('another Unity has this project open:\n' + holders.join('\n'))
  const log = join(dir, 'unity.log'), t0 = Date.now()
  const child = spawn(editor, ['-batchmode', '-projectPath', project, '-executeMethod', 'ForgeSnapshots.Capture', '-forgeOut', dir, '-forgeFixtures', fixtures, '-logFile', log], { stdio: 'ignore' })
  const kill = setTimeout(() => child.kill('SIGKILL'), 15 * 60 * 1000)
  const code = await new Promise(r => child.on('exit', c => r(c))); clearTimeout(kill)
  const idx = join(dir, 'index.json')
  if (code !== 0 || !existsSync(idx)) { const tail = existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(l => /error|exception|FORGE_SNAPSHOTS|Shader/i.test(l)).slice(-40).join('\n') : ''; throw new Error(`Unity exited ${code}\n${tail}`) }
  console.log(`metal: ${name} snapshots in ${((Date.now() - t0) / 1000).toFixed(1)} s -> ${dir}`)
  return dir
}

// ---------- analysis ----------
const results = []; const report = { view, checks: results, shots: {} }
const check = (ok, what, value) => { results.push({ ok: !!ok, what, value }); console.log(`${ok ? 'PASS' : 'FAIL'} metal: ${what}${value !== undefined ? ' (' + (typeof value === 'number' ? +value.toFixed(3) : JSON.stringify(value)) + ')' : ''}`) }
function loadIndex(dir) {
  const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'))
  const probes = []
  const msgs = index.messages.map(l => { const sp = l.indexOf(' '); try { return { t: +l.slice(0, sp), m: JSON.parse(l.slice(sp + 1)) } } catch { return null } }).filter(Boolean)
  for (const { t, m } of msgs) if (m.type === 'metal') { try { probes.push({ ...JSON.parse(m.spot), rt: undefined, t }) } catch { /* partial */ } }
  const sfx = msgs.filter(e => e.m.type === 'sfx')
  return { index, probes, sfx }
}
// A probe is sent in Update and stamped with the previous LateUpdate's time, so the probe that describes a frame captured
// at t carries a time strictly before t (the one stamped t already includes the next fixture step).
const probeAt = (probes, t) => { let best = null; for (const p of probes) if (p.t <= t - 1e-4) best = p; return best }
const region = (p, pad = .01) => p && p.vp ? [Math.max(0, p.vp[0] - pad), Math.max(0, 1 - p.vp[3] - pad), Math.min(1, p.vp[2] + pad), Math.min(1, 1 - p.vp[1] + pad)] : null
const around = (pt, r = .006) => [pt[0] - r, 1 - pt[1] - r, pt[0] + r, 1 - pt[1] + r]
// Swatch targets (the plan's displayed colours after the unchanged tonemap).
const TARGETS = [[600, '#460000'], [700, '#920400'], [800, '#cc1c00'], [900, '#e84c00'], [1000, '#f58c00'], [1100, '#fbc000'], [1200, '#fedf00']]
function lab(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
  const X = (.4124 * c[0] + .3576 * c[1] + .1805 * c[2]) / .95047, Y = .2126 * c[0] + .7152 * c[1] + .0722 * c[2], Z = (.0193 * c[0] + .1192 * c[1] + .9505 * c[2]) / 1.08883
  const f = t => t > .008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]
}
function de2000([L1, a1, b1], [L2, a2, b2]) {
  const r = Math.PI / 180, C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2, G = .5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)))
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2, C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2)
  let h1 = Math.atan2(b1, a1p) / r; if (h1 < 0) h1 += 360; let h2 = Math.atan2(b2, a2p) / r; if (h2 < 0) h2 += 360
  let dh = 0; if (C1p * C2p) { dh = h2 - h1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360 }
  const dL = L2 - L1, dC = C2p - C1p, dH = 2 * Math.sqrt(C1p * C2p) * Math.sin(dh * r / 2), Lb = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2
  let hb = h1 + h2; if (C1p * C2p) { if (Math.abs(h1 - h2) > 180) hb += hb < 360 ? 360 : -360; hb /= 2 }
  const T = 1 - .17 * Math.cos((hb - 30) * r) + .24 * Math.cos(2 * hb * r) + .32 * Math.cos((3 * hb + 6) * r) - .2 * Math.cos((4 * hb - 63) * r)
  const dT = 30 * Math.exp(-(((hb - 275) / 25) ** 2)), Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7)), Sl = 1 + .015 * (Lb - 50) ** 2 / Math.sqrt(20 + (Lb - 50) ** 2), Sc = 1 + .045 * Cbp, Sh = 1 + .015 * Cbp * T, Rt = -Math.sin(2 * dT * r) * Rc
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh))
}
const hex = rgb => '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')

let trailPage = null
/** Contact sheet from sips-downscaled copies loaded by file URL (lib.contactSheet inlines every full PNG and runs out of memory at 60 shots). */
async function sheet(h, dir, shots, file, width = 300, cols = 6) {
  const small = join(dir, '_small'); mkdirSync(small, { recursive: true })
  for (const s of shots) { const o = join(small, s.file); if (!existsSync(o)) execSync(`sips --resampleWidth ${width} "${join(dir, s.file)}" --out "${o}"`, { stdio: 'ignore' }) }
  const html = join(small, 'sheet.html'); writeFileSync(html, `<html><body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${cols},${width}px);gap:2px;font:11px monospace;color:#ff0">${shots.map(s => `<div style="position:relative"><img src="${s.file}" style="width:${width}px;display:block"><span style="position:absolute;left:3px;top:2px;background:#000a;padding:1px 3px">${s.name}</span></div>`).join('')}</body></html>`)
  const page = await h.context.newPage(); await page.setViewportSize({ width: (width + 2) * cols, height: 600 }); await page.goto('file://' + html); await page.waitForTimeout(300); await page.screenshot({ path: file, fullPage: true }); await page.close()
  console.log('metal: sheet ->', file)
}
/** lib.laserTrailCount's detector, returning each trail component's pixel box (so the blade can be excluded). Only thin
 * components (at most 4 px wide) count: the old TrailRenderer streaks were 1-3 px; a cluster of glowing shatter pieces is not a trail. */
async function trailBoxes(file, { threshold = 200, aspect = 12, minLen = .06 } = {}) {
  return trailPage.evaluate(async ([src, o]) => {
    const i = new Image(); i.src = src; await i.decode(); const c = new OffscreenCanvas(i.naturalWidth, i.naturalHeight), g = c.getContext('2d'); g.drawImage(i, 0, 0); const A = g.getImageData(0, 0, c.width, c.height)
    const W = A.width, H = A.height, L = k => .2126 * A.data[k] + .7152 * A.data[k + 1] + .0722 * A.data[k + 2]
    const on = new Uint8Array(W * H); for (let k = 0; k < W * H; k++) on[k] = L(k * 4) > o.threshold ? 1 : 0
    const seen = new Uint8Array(W * H), out = [], st = []
    for (let s = 0; s < W * H; s++) { if (!on[s] || seen[s]) continue; let a = 1e9, b = 1e9, x1 = -1, y1 = -1, n = 0; st.push(s); seen[s] = 1
      while (st.length) { const q = st.pop(), x = q % W, y = (q / W) | 0; n++; a = Math.min(a, x); x1 = Math.max(x1, x); b = Math.min(b, y); y1 = Math.max(y1, y)
        for (const z of [q - 1, q + 1, q - W, q + W, q - W - 1, q - W + 1, q + W - 1, q + W + 1]) if (z >= 0 && z < W * H && on[z] && !seen[z] && Math.abs((z % W) - x) <= 1) { seen[z] = 1; st.push(z) } }
      const bw = x1 - a + 1, bh = y1 - b + 1, len = Math.hypot(bw, bh), wid = Math.max(1, n / len)
      if (len / wid > o.aspect && len > o.minLen * W && wid <= 4) out.push({ box: [a / W, b / H, x1 / W, y1 / H], n, len: Math.round(len), wid: +wid.toFixed(1) }) }
    return out
  }, ['data:image/png;base64,' + readFileSync(file).toString('base64'), { threshold, aspect, minLen }])
}

async function analyse(dirs) {
  const L = await import('./lib.mjs')
  const h = await L.launch('desktop', { out })
  trailPage = await h.context.newPage()
  try {
    if (dirs.swatch) {
      const file = join(dirs.swatch, 'swatch.png'); const row = []; let worst = 0
      const cold = await L.hueSatOfBrightest(h, file, [.29 - .006, .5 - .009, .29 + .006, .5 + .009], .5); report.swatchCold = hex(cold.rgb)
      for (let i = 0; i < 7; i++) {
        const x = .29 + (i + 1) * .06; const m = await L.hueSatOfBrightest(h, file, [x - .006, .5 - .009, x + .006, .5 + .009], .5)
        const d = de2000(lab(hex(m.rgb)), lab(TARGETS[i][1])); worst = Math.max(worst, d); row.push({ c: TARGETS[i][0], got: hex(m.rgb), want: TARGETS[i][1], dE: +d.toFixed(2), hue: m.hue })
      }
      console.log('metal: swatch 20 C (lit oxide only)', report.swatchCold)
      report.swatch = row; console.log('metal: swatch', row.map(r => `${r.c} ${r.got}/${r.want} dE ${r.dE}`).join(' | '))
      const hot = Math.max(...row.filter(r => r.c >= 700).map(r => r.dE))
      check(hot <= 5, 'in-engine swatch (lit, bloom, vignette) within dE2000 5 of the 700-1200 C targets', hot)
      check(row[0].dE <= 11, '600 C within dE2000 11 (its floor is the lit oxide surface)', row[0].dE)
    }
    if (!dirs.main) return
    const { index, probes, sfx } = loadIndex(dirs.main); const shot = n => { const s = index.shots.find(x => x.name === n); return s ? { ...s, path: join(dirs.main, s.file), probe: probeAt(probes, s.t) } : null }
    // Heating: hue of the brightest blade pixels in the coals.
    for (const [n, lo, hi] of [['heat-0.1', 0, 12], ['heat-0.5', 20, 40], ['heat-0.9', 40, 55]]) {
      const s = shot(n); if (!s) continue; const r = region(s.probe, .004); const m = r ? await L.hueSatOfBrightest(h, s.path, r, .03) : null
      report.shots[n] = { probe: s.probe && { body: s.probe.body, edge: s.probe.edge, spine: s.probe.spine, inCoals: s.probe.inCoals }, ...m }
      check(m && (n === 'heat-0.1' ? (m.hue <= hi || m.luma < 60) : m.hue >= lo && m.hue <= hi), `${n} s in the coals: brightest blade hue ${lo}-${hi} deg (iron; plan's ${n === 'heat-0.1' ? '.6' : n === 'heat-0.5' ? '1.1' : '1.5'} s after Start)`, m && [m.hue, m.luma])
    }
    { const s = shot('seated'); if (s) { const r = region(s.probe, .002); const m = await L.hueSatOfBrightest(h, s.path, r, .03); report.shots.seated = { probe: s.probe, ...m }; check(m.hue >= 35 && m.hue <= 52 && m.sat >= .75, 'seated: hue 35-52 deg and saturation >= .75', [m.hue, m.sat]) } }
    { const s = shot('blade-8s'); if (s && s.probe && s.probe.edge5) { let le = 0, ls = 0; for (const k of ['3', '5', '7']) { le += await L.lumaPatch(h, s.path, around(s.probe['edge' + k])); ls += await L.lumaPatch(h, s.path, around(s.probe['spine' + k])) }
      report.shots['blade-8s'] = { edgeLuma: le / 3, spineLuma: ls / 3, probe: s.probe }; check(le / Math.max(1, ls) <= .6, 'after 8 s on the anvil (level-8 blade): edge-to-spine luminance ratio <= .6', le / Math.max(1, ls)) } }
    // Laser trails on every captured frame; visible flakes right after contact.
    // A glowing blade is itself a long thin bright shape: components inside the blade's viewport box (+2%) are not trails.
    // A static bright edge (a lamp-lit rim of the stump or the anvil, at the same place in several frames) is scenery, not
    // a particle trail: trails move from frame to frame.
    let trails = 0, bladeTrails = 0, staticEdges = 0; const cands = []
    for (const s of index.shots) { const p = probeAt(probes, s.t); const box = p && p.vp ? [p.vp[0] - .02, 1 - p.vp[3] - .02, p.vp[2] + .02, 1 - p.vp[1] + .02] : null
      const r = await trailBoxes(join(dirs.main, s.file)); for (const c of r) { const inBlade = box && c.box[0] >= box[0] && c.box[2] <= box[2] && c.box[1] >= box[1] && c.box[3] <= box[3]; if (inBlade) bladeTrails++; else cands.push({ shot: s.name, c }) } }
    const same = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < .004)
    for (const x of cands) { if (cands.some(y => y !== x && y.shot !== x.shot && same(x.c.box, y.c.box))) { staticEdges++; continue } trails++; console.log('  trail in', x.shot, JSON.stringify(x.c)) }
    check(trails === 0, 'no laser trails in any frame (outside the glowing blade; static lit edges excluded)', { trails, bladeShapes: bladeTrails, staticEdges })
    for (const n of ['good-33', 'good-100', 'perfect-33', 'perfect-100', 'chip-33']) { const s = shot(n); if (!s) continue; const p = s.probe; const c = p && p.contact; const reg = c ? [c[0] - .2, 1 - c[1] - .2, c[0] + .2, 1 - c[1] + .14] : null
      const r = await L.laserTrailCount(h, s.path, { threshold: 120, aspect: 30, minLen: .5, region: reg, minBlobPx: 2 }); report.shots[n] = { blobs: r.blobs, probe: p && { flakes: p.flakes, sheets: p.sheets, sparks: p.sparks, forks: p.forks, chips: p.chips } }
      if (n.endsWith('-100') || n === 'chip-33') check(r.blobs >= 8, `${n}: at least 8 bright blobs >= 2 px near the contact`, r.blobs) }
    // Counts per outcome (probe right after contact). Phones throw .6x; reduced motion 5 flakes and no sparks.
    const counts = n => { const s = shot(n); return s && s.probe }
    const k = view === 'phone' ? .6 : 1, R = n => Math.round(n * k)
    // What each impact threw: the first probe after that strike's contact frame with a new burst id.
    const burst = name => { const s = shot(name + '-contact-0'); if (!s) return null; return probes.find(p => p.t >= s.t - .05 && p.burst === name) || null }
    const ran = name => !!shot(name + '-contact-0')
    if (REDUCED) {
      for (const o of ['good', 'perfect', 'chip', 'shatter']) if (ran(o)) { const p = burst(o); check(p && p.bFlakes === 5 && p.bSparks === 0 && p.bSheets === 0 && p.bChips <= 2, `reduced motion ${o}: 5 flakes, no sparks or sheets`, p && [p.bFlakes, p.bSparks, p.bSheets, p.bChips]) }
    } else {
      if (ran('good')) { const p = burst('good'); check(p && Math.abs(p.bFlakes - R(14)) <= R(3) + 1 && p.bSparks <= 1, `good: ${R(14)} +/- ${R(3) + 1} flakes, at most 1 spark (per impact)`, p && [p.bFlakes, p.bSparks]) }
      if (ran('perfect')) { const p = burst('perfect'); const n = p && p.bFlakes + p.bSheets; check(p && n >= R(30) && n <= R(40) + 1 && p.bSheets >= R(3) && p.bSparks >= R(2) && p.bSparks <= 4, `perfect: ${R(30)}-${R(40)} flakes incl. 5-10 mm sheets, ${R(2)}-4 sparks`, p && [p.bFlakes, p.bSheets, p.bSparks]) }
      if (ran('chip')) { const p = burst('chip'); check(p && p.bChips === 4 && Math.abs(p.bFlakes - R(10)) <= 2, `chip: ${R(10)} flakes and 4 chips`, p && [p.bFlakes, p.bChips]) }
      if (ran('shatter')) { const p = burst('shatter'); check(p && p.shards >= 10 && p.shards <= 16 && p.bSparks >= R(12), `shatter: 10-16 pieces and ${R(15)} burning sparks`, p && [p.shards, p.bSparks, p.bFlakes]) }
      if (ran('dull')) { const p = burst('dull'); check(p && p.bFlakes === 0 && p.bSparks === 0, 'dull: no flakes or sparks (the dust puff only)', p && [p.bFlakes, p.bSparks]) }
    }
    { const p = counts('chip-1500') || counts('chip-400'); if (p) check(p.notchMm >= 3, 'chip: notch at least 3 mm deep', p.notchMm) }
    { const p = counts('good-2300'); if (p) { check(p.glowing === 0, 'all flakes dark by 2.3 s', p.glowing); check(p.landN > 0 && p.nearN / p.landN >= .8, 'at least 80% of the flakes that landed did so within 1 m of the contact', p.landN ? [p.nearN, p.landN] : 0) } }
    { const p = counts('perfect-1000'); if (p && !REDUCED) check(p.landN > 0 && p.nearN / p.landN >= .8, 'perfect: at least 80% of landings within 1 m', p.landN ? [p.nearN, p.landN] : 0) }
    { const rise = Math.max(...probes.map(p => p.rise ?? -9)); check(rise <= .6, 'no flake rises more than .6 m above the contact', rise) }
    { const p = counts('shatter-2000'); if (p) check(p.shards >= 10 && p.shardC < 450, 'shatter pieces still there at 2 s and dark (body below 450 C)', [p.shards, p.shardC]) }
    { const s = shot('shatter-33'); const tail = probes.length && s && probes[probes.length - 1].t > s.t + 4.1; if (s && tail) { const t0 = s.t - .033; const late = probes.filter(p => p.t >= t0 + 4.15 && p.t < t0 + 4.6); const at39 = counts('shatter-3900'); check(late.length && late.every(p => p.shards === 0) && (!at39 || at39.shards === 0 || at39.shardAge >= 3.4), 'shatter pieces dissolve from 3.4 s and are gone by 4 s (plus the hit-stop)', late.map(p => p.shards)) } }
    { const resting = probes.filter(p => p.shardsResting > 0); const w = Math.max(0, ...resting.map(p => p.shardsMaxW)); if (resting.length) check(w <= .5, 'resting shatter pieces rotate < .5 rad/s', w) }
    { const s = shot('shatter-2000'); if (s) { const m = await L.hueSatOfBrightest(h, s.path, [.3, .35, .7, .8], .002); report.shots['shatter-2000'] = m } }
    { const pk = Math.max(0, ...probes.map(p => p.bits ?? 0)); check(pk <= (view === 'phone' ? 220 : 220), 'particles alive at most 220', pk) }
    // Shape: the mesh lengthens at every level 0-6 and level 0 is a bar.
    { const lens = [0, 1, 2, 3, 4, 5, 6].map(l => counts('level-' + l)?.lenCm); if (lens.some(x => x > 0)) { report.lengths = lens; let ok = lens.every(x => x > 0); for (let i = 1; i < lens.length; i++) if (!(lens[i] / lens[i - 1] - 1 >= .01)) ok = false; check(ok, 'blade length grows >= 1% at every level 0-6 (cm)', lens) } }
    // No glow on the rack and on day 2, measured on the knife itself (its probed viewport box).
    for (const n of ['rack-0.3', 'rack-1.8', 'day2']) { const s = shot(n); if (!s) continue; const r = region(s.probe, .004); if (!r || r[2] - r[0] <= 0 || r[3] - r[1] <= 0) { check(false, `${n}: knife in view`, s.probe && s.probe.vp); continue }
      const m = await L.hueSatOfBrightest(h, s.path, r, .03); report.shots[n] = { probe: s.probe && { body: s.probe.body, edge: s.probe.edge, place: s.probe.place }, ...m }
      if (n !== 'rack-0.3') check(!(m.sat > .75 && m.hue < 40 && m.luma > 70) && s.probe.body < 120, `${n}: no hot-steel glow on the knife (body below 120 C)`, [m.hue, m.sat, m.luma, s.probe.body]) }
    // Blade light: the anvil-face patch in front of the blade (toward the eye, where the polished face mirrors the glow
    // lamp; this checkout's face is a near-mirror, metal .96) is brighter at 1150 C than at 500 C. Beyond the bloom halo.
    { const a = shot('light-1150'), b = shot('light-500'); if (a && b && a.probe && a.probe.vp) { const vp = a.probe.vp, cx = (vp[0] + vp[2]) / 2, yb = 1 - vp[1]; const reg = [cx - .025, yb + .012, cx + .025, yb + .03]
      const la = await L.lumaPatch(h, a.path, reg), lb = await L.lumaPatch(h, b.path, reg); report.shots.light = { at1150: la, at500: lb, region: reg }; check(la >= lb * 1.25, 'blade light: anvil patch beside the blade at least 25% brighter at 1150 C than at 500 C', [+la.toFixed(1), +lb.toFixed(1)]) } }
    // Cracks show at high risk.
    { const p = counts('cracks-hot'); if (p) check(p.crack >= .3, 'cracks grow with risk (level >= 10)', p.crack) }
    // Sfx.
    const names = sfx.map(e => e.m.spot); report.sfx = Object.fromEntries([...new Set(names)].map(n => [n, names.filter(x => x === n).length]))
    { const want = [['flake-land', ran('good')], ['chip-land', ran('chip')], ['shard-land', ran('shatter')], ['coin-land', !!shot('sell-1.2')]].filter(w => w[1]).map(w => w[0]); if (want.length) check(want.every(n => names.includes(n)), want.join(', ') + ' sfx are sent', report.sfx) }
    { const fl = sfx.filter(e => e.m.spot === 'flake-land').map(e => e.t); let worst = 0; for (let i = 0; i < fl.length; i++) { const n = fl.filter(t => t >= fl[i] && t < fl[i] + 1).length; worst = Math.max(worst, n) } check(worst <= 10, 'flake-land at most 10 per second', worst) }
    if (flag('sheet')) await sheet(h, dirs.main, index.shots, join(out, 'metal-sheet.png'), view === 'phone' ? 160 : 300)
  } finally { await h.close() }
}

mkdirSync(out, { recursive: true })
const dirs = {}
if (!flag('analyse-only')) {
  if (only === 'all' || only === 'swatch') dirs.swatch = await runUnity('swatch', swatch)
  if (only === 'all' || only === 'main') dirs.main = await runUnity('main', main)
} else { for (const n of ['swatch', 'main']) if (existsSync(join(out, n, 'index.json')) && (only === 'all' || only === n)) dirs[n] = join(out, n) }
await analyse(dirs)
writeFileSync(join(out, 'metal-report.json'), JSON.stringify(report, null, 1))
const failed = results.filter(r => !r.ok).length
console.log(`metal: ${results.length - failed}/${results.length} checks pass -> ${join(out, 'metal-report.json')}`)
process.exit(failed ? 1 : 0)
