// Integration QA matrix on a served build: the phase-0 baseline metrics (same names, every profile), each stream's live
// checks (strike, web, audio, room), the live contact sheets, and a before/after table against a baseline.json.
// usage: node scripts/forge-qa/run-all.mjs --url http://127.0.0.1:4173/minigames/forgeOrFold/ --out <dir>
//          [--baseline <phase-0 baseline.json>] [--dev-url <vite dev url, for the Flow fixture>]
//          [--only baseline,strike,web,audio,room,sheets] [--profiles desktop,desktop-hidpi,phone,landscape,webkit-phone,reduced,throttled]
// Each step runs as its own process (one browser at a time) and writes into <out>; a failing step does not stop the
// others. Writes <out>/summary.json and <out>/compare.md. Frame times need an idle machine: the load average is logged.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const arg = (name, d) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : d }
const here = path.dirname(fileURLToPath(import.meta.url))
const url = arg('url', 'http://127.0.0.1:4173/minigames/forgeOrFold/'), out = path.resolve(arg('out', 'output/forge-qa/run-all'))
const devUrl = arg('dev-url'), baselineFile = arg('baseline')
const profiles = arg('profiles', 'desktop,desktop-hidpi,phone,landscape,webkit-phone,reduced,throttled')
const steps = arg('only', 'baseline,strike,web,audio,room,sheets').split(',')
fs.mkdirSync(out, { recursive: true })
const summary = { url, devUrl: devUrl || null, at: new Date().toISOString(), load: os.loadavg().map(x => +x.toFixed(1)), steps: {} }
const save = () => fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 1) + '\n')

function run(name, script, args, timeoutMin = 30) {
  const t0 = Date.now(); console.log(`run-all: ${name} ...`)
  const r = spawnSync(process.execPath, [path.join(here, script), ...args], { encoding: 'utf8', timeout: timeoutMin * 60000, maxBuffer: 64 << 20 })
  const text = (r.stdout || '') + (r.stderr || ''); fs.writeFileSync(path.join(out, name + '.log'), text)
  const lines = text.split('\n'), pass = lines.filter(l => /^PASS/.test(l)).length, fail = lines.filter(l => /^FAIL/.test(l))
  summary.steps[name] = { exit: r.status, seconds: Math.round((Date.now() - t0) / 1000), pass, fail: fail.length, failures: fail.slice(0, 40), load: os.loadavg().map(x => +x.toFixed(1)) }
  console.log(`run-all: ${name} exit ${r.status} in ${summary.steps[name].seconds} s (${pass} PASS, ${fail.length} FAIL lines)`); save()
  return r.status
}

const touch = new Set(['phone', 'landscape', 'webkit-phone'])
const live = profiles.split(',').filter(p => p !== 'throttled' && p !== 'desktop-hidpi')
if (steps.includes('baseline')) run('baseline', 'baseline.mjs', ['--url', url, '--out', path.join(out, 'after.json'), '--profiles', profiles, ...(devUrl ? ['--dev-url', devUrl] : [])], 60)
if (steps.includes('strike')) run('strike', 'strike.mjs', ['--url', url, '--out', path.join(out, 'strike.json'), '--profiles', live.filter(p => p !== 'desktop-hidpi').join(',')], 40)
if (steps.includes('web')) run('web', 'web.mjs', ['--url', url, '--out', path.join(out, 'web'), '--profiles', live.join(','), '--fuzz-profiles', 'desktop,webkit-phone'], 40)
if (steps.includes('audio')) run('audio', 'audio.mjs', ['--url', url, '--out', path.join(out, 'audio')], 20)
if (steps.includes('room')) run('room', 'room.mjs', ['--out', path.join(out, 'room-live'), '--url', url, '--profiles', live.filter(p => p === 'desktop' || touch.has(p)).join(',')], 30)
if (steps.includes('sheets')) for (const p of ['desktop', 'phone']) if (live.includes(p)) run('sheets-' + p, 'sheets.mjs', ['--url', url, '--out', path.join(out, 'sheets-' + p), '--profile', p], 20)

// strike.mjs reports per-profile pass maps instead of PASS lines: fold them into the summary.
try {
  const s = JSON.parse(fs.readFileSync(path.join(out, 'strike.json'), 'utf8'))
  summary.steps.strike.checks = Object.fromEntries(s.results.map(r => [r.profile, r.error ? { error: r.error.slice(0, 300) } : r.pass]))
  const all = s.results.flatMap(r => Object.entries(r.pass || {}).map(([k, v]) => [r.profile + ':' + k, v]))
  summary.steps.strike.pass = all.filter(x => x[1]).length; summary.steps.strike.fail = all.filter(x => !x[1]).length; summary.steps.strike.failures = all.filter(x => !x[1]).map(x => x[0])
} catch { /* strike not run */ }

// Before/after table from the phase-0 baseline.
const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o)
if (baselineFile && fs.existsSync(path.join(out, 'after.json'))) {
  const before = JSON.parse(fs.readFileSync(baselineFile, 'utf8')), after = JSON.parse(fs.readFileSync(path.join(out, 'after.json'), 'utf8'))
  const metrics = [
    ['timeToReady.readyMs', 'Unity ready (ms)'], ['transfer.total', 'transfer (bytes)'], ['transfer.data', 'data (bytes)'], ['transfer.wasm', 'wasm (bytes)'], ['transfer.art', 'art (bytes)'],
    ['latency.impactMs.median', 'press to impact median (ms)'], ['latency.impactMs.max', 'press to impact max (ms)'], ['latency.settledMs.median', 'press to settled median (ms)'],
    ['hitStop.ms', 'hit-stop on screen (ms)'], ['cycle.mash120.intervals.median', 'mash 120 ms: impact gap median (ms)'], ['cycle.mash120.refusedShare', 'mash 120 ms: presses without impact'],
    ['cycle.rhythm400.intervals.median', 'press every 400 ms: impact gap median (ms)'], ['cycle.rhythm400.refusedShare', 'press every 400 ms: presses without impact'],
    ['drawCalls.idle.calls_med', 'draw calls idle (median)'], ['drawCalls.anvil.calls_med', 'draw calls knife on anvil'], ['drawCalls.striking.calls_med', 'draw calls striking (median)'], ['drawCalls.striking.calls_p95', 'draw calls striking (p95)'],
    ['drawCalls.striking.tris_max', 'triangles striking (max)'], ['frameTimes.idle.p95', 'frame p95 idle (ms)'], ['frameTimes.heating.p95', 'frame p95 heating (ms)'], ['frameTimes.striking.p95', 'frame p95 striking (ms)'],
    ['frameTimes.striking.p99', 'frame p99 striking (ms)'], ['frameTimes.striking.max', 'frame max striking (ms)'], ['heat.startToArmedMs', 'Start to Forge armed (ms)'],
  ]
  const rows = [], table = {}
  for (const prof of Object.keys(after.profiles)) {
    const b = before.profiles?.[prof], a = after.profiles[prof]; if (!a) continue
    for (const [m, label] of metrics) { const vb = get(b, m), va = get(a, m); if (vb == null && va == null) continue; (table[prof] ||= {})[m] = [vb ?? null, va ?? null]; rows.push(`| ${prof} | ${label} | ${vb ?? '-'} | ${va ?? '-'} |`) }
    if (a.error) rows.push(`| ${prof} | error | | ${String(a.error).split('\n')[0].slice(0, 120)} |`)
    if (a.console?.length) rows.push(`| ${prof} | console errors | ${b?.console?.length ?? '-'} | ${a.console.length} |`)
  }
  if (before.flow || after.flow) { const fb = before.flow?.cycle, fa = after.flow?.cycle; rows.push(`| flow (dev) | Flow impact gap median (ms) | ${fb?.flowMs?.median ?? '-'} | ${fa?.flowMs?.median ?? '-'} |`, `| flow (dev) | impacts in the first 4 s | ${fb?.impactsInFirst4s ?? '-'} | ${fa?.impactsInFirst4s ?? '-'} |`) }
  const md = `# Forge or Fold: before / after\n\nBefore: ${before.meta?.commit} (${before.meta?.unityBuild || ''}), ${before.meta?.date}. After: ${after.meta?.commit}, ${after.meta?.date}. Load average at the start: ${summary.load.join(' ')}.\n\n| profile | metric | before | after |\n|---|---|---|---|\n${rows.join('\n')}\n`
  fs.writeFileSync(path.join(out, 'compare.md'), md); fs.writeFileSync(path.join(out, 'compare.json'), JSON.stringify(table, null, 1) + '\n'); summary.compare = path.join(out, 'compare.md')
}
save()
console.log(JSON.stringify(Object.fromEntries(Object.entries(summary.steps).map(([k, v]) => [k, { exit: v.exit, pass: v.pass, fail: v.fail }]))))
console.log('run-all ->', path.join(out, 'summary.json'))
