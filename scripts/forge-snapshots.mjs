// Fast visual loop: render fixture states of the real Unity scene to PNGs in about a minute, without a
// WebGL/IL2CPP build. Generates the fixtures from the real engine (src/minigames/forge/bridge.ts payloads),
// then runs ForgeSnapshots.Capture in batchmode WITH graphics (Metal) on the given project.
// usage: node scripts/forge-snapshots.mjs --out <dir> [--project unity/ForgeOrFold] [--view desktop|phone] [--sheet]
//          [--dt 0.008333] [--fixtures-only]
// Output: <out>/<name>.png for rest, apex, contact-m1/0/p1, good, heat-0.6/1.1/1.6, hearth, seated,
// perfect(-400), chip(-400), shatter(-500), look-front/right/back/left/up/down; index.json; unity.log;
// sheet.png with --sheet (Playwright Chromium). Only one Unity may open a project: this refuses to run
// when another process has it open.
import { spawn, execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act, createRun } from '../src/minigames/forge/engine.ts'
import { snapshotPayload, unityEffect, forgeView } from '../src/minigames/forge/bridge.ts'

const arg = (name, d) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : d }
const flag = name => process.argv.includes('--' + name)
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const project = resolve(arg('project', join(repo, 'unity/ForgeOrFold')))
const out = resolve(arg('out', join(repo, 'output/forge-snapshots', new Date().toISOString().replace(/[:.]/g, '-'))))
const view = arg('view', 'desktop'), dt = Number(arg('dt', 1 / 120))
const editor = process.env.UNITY_EDITOR || '/Applications/Unity/Hub/Editor/6000.3.18f1/Unity.app/Contents/MacOS/Unity'

// ---------- fixtures from the real engine ----------
const payload = (state, event, selected = 1) => JSON.stringify({ ...snapshotPayload(state, selected, { reduced: false }), effect: unityEffect(event) })
const step = (s, a) => { const r = act(s, a); if (!r.ok) throw new Error(`fixture action failed: ${JSON.stringify(a)}: ${r.event.text}`); return r }
/** First state (heated knife 1 on the anvil) whose next hit gives `outcome`, searching seeds and hit runs. */
function findHit(outcome, minLevel = 0) {
  for (let seed = 1; seed < 5000; seed++) {
    let s = createRun(seed)
    for (const a of [{ type: 'move', id: 1, to: 'furnace' }, { type: 'heat', id: 1 }, { type: 'move', id: 1, to: 'anvil' }]) s = step(s, a).state
    for (let i = 0; i < 14; i++) {
      s = step(s, { type: 'tick', ms: 1000 }).state
      const k = s.knives.find(n => n.id === 1); if (!k) break
      const r = act(s, { type: 'hit', id: 1 })
      if (!r.ok) break
      if (r.event.outcome === outcome && k.level >= minLevel && !r.event.flowStarted && !k.flow) return { before: s, after: r.state, event: r.event, seed }
      s = r.state
      if (s.knives.find(n => n.id === 1)?.flow) break
    }
  }
  throw new Error('no fixture for outcome ' + outcome)
}
const W = view === 'phone' ? 780 : 1440, H = view === 'phone' ? 1688 : 900
const insets = view === 'phone' ? forgeView(390, 844, 2, true) : forgeView(1440, 900, 1, false)
const s0 = createRun(1)
const furnace = step(s0, { type: 'move', id: 1, to: 'furnace' })
const heated = step(furnace.state, { type: 'heat', id: 1 })
const seated = step(heated.state, { type: 'move', id: 1, to: 'anvil' })
const good = findHit('good'), perfect = findHit('perfect', 2), chip = findHit('chip', 3), shatter = findHit('shatter', 4)
const tuning = readFileSync(join(repo, 'src/minigames/forge/feel-tuning.json'), 'utf8')
const steps = [
  // The page's handshake after 'ready': Tune, Qa modes, Insets.
  { do: 'tune', json: tuning }, { do: 'qa', mode: 'steady' }, { do: 'qa', mode: 'telemetry' },
  { do: 'insets', json: JSON.stringify(insets) },
  { do: 'sync', json: payload(s0) }, { do: 'wait', s: 1.0 },
  // Heating: the engine's move to the furnace, then heat and move at 2.0 s, as the page sends them.
  { do: 'sync', json: payload(furnace.state, furnace.event) },
  { do: 'wait', s: .6 }, { do: 'capture', name: 'heat-0.6' },
  { do: 'wait', s: .5 }, { do: 'capture', name: 'heat-1.1' },
  { do: 'wait', s: .5 }, { do: 'capture', name: 'heat-1.6' },
  { do: 'wait', s: .4 }, { do: 'sync', json: payload(heated.state, heated.event) },
  { do: 'lookAt', spot: 'furnace' }, { do: 'wait', s: 1.0 }, { do: 'capture', name: 'hearth' },
  { do: 'focus' }, { do: 'sync', json: payload(seated.state, seated.event) },
  { do: 'wait', s: .5 }, { do: 'capture', name: 'seated' }, { do: 'wait', s: 1.2 }, { do: 'capture', name: 'rest' },
  // One strike with apex and contact -1/0/+1 frames, then one per outcome.
  { do: 'sync', json: payload(good.before) }, { do: 'wait', s: .8 },
  { do: 'strike', seq: 1, name: '', apex: true, contact: true, impact: payload(good.after, good.event), afterMs: [80], afterNames: ['good'] }, { do: 'wait', s: .4 },
  { do: 'sync', json: payload(perfect.before) }, { do: 'wait', s: .8 },
  { do: 'strike', seq: 2, name: 'perfect', impact: payload(perfect.after, perfect.event), afterMs: [80, 400], afterNames: ['perfect', 'perfect-400'] }, { do: 'wait', s: .4 },
  { do: 'sync', json: payload(chip.before) }, { do: 'wait', s: .8 },
  { do: 'strike', seq: 3, name: 'chip', impact: payload(chip.after, chip.event), afterMs: [80, 400], afterNames: ['chip', 'chip-400'] }, { do: 'wait', s: .4 },
  { do: 'sync', json: payload(shatter.before) }, { do: 'wait', s: .8 },
  { do: 'strike', seq: 4, name: 'shatter', impact: payload(shatter.after, shatter.event), afterMs: [80, 500], afterNames: ['shatter', 'shatter-500'] }, { do: 'wait', s: .6 },
  // Six-direction look-around with a knife on the anvil.
  { do: 'sync', json: payload(seated.state) }, { do: 'wait', s: .6 },
  ...[['front', 0, 0], ['right', 90, 0], ['back', 180, 0], ['left', -90, 0], ['up', 0, -60], ['down', 0, 75]].flatMap(([n, yaw, pitch]) => [{ do: 'look', yaw, pitch }, { do: 'wait', s: 1.0 }, { do: 'capture', name: 'look-' + n }]),
  { do: 'focus' }, { do: 'wait', s: .2 },
]
const job = { view, width: W, height: H, dt, timeout: 300, steps }
mkdirSync(out, { recursive: true })
const fixtures = join(out, 'fixtures.json')
writeFileSync(fixtures, JSON.stringify(job, null, 1))
writeFileSync(join(out, 'fixture-seeds.json'), JSON.stringify({ good: good.seed, perfect: perfect.seed, chip: chip.seed, shatter: shatter.seed }, null, 1))
console.log(`fixtures: ${steps.length} steps -> ${fixtures}`)
if (flag('fixtures-only')) process.exit(0)

// ---------- one Unity per project ----------
let busy = ''
try { busy = execSync('pgrep -fl "projectPath"').toString() } catch { /* none */ }
const holders = busy.split('\n').filter(l => l.includes(project))
if (holders.length) { console.error('forge-snapshots: another Unity has this project open:\n' + holders.join('\n')); process.exit(3) }
if (!existsSync(editor)) { console.error('forge-snapshots: set UNITY_EDITOR to the Unity 6000.3.18f1 executable'); process.exit(2) }

const log = join(out, 'unity.log'), started = Date.now()
const child = spawn(editor, ['-batchmode', '-projectPath', project, '-executeMethod', 'ForgeSnapshots.Capture', '-forgeOut', out, '-forgeFixtures', fixtures, '-logFile', log], { stdio: 'ignore' })
const kill = setTimeout(() => { console.error('forge-snapshots: Unity timed out, killing it'); child.kill('SIGKILL') }, 15 * 60 * 1000)
const code = await new Promise(r => child.on('exit', c => r(c)))
clearTimeout(kill)
const seconds = ((Date.now() - started) / 1000).toFixed(1)
const indexFile = join(out, 'index.json')
if (code !== 0 || !existsSync(indexFile)) {
  const tail = existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(l => /error|exception|FORGE_SNAPSHOTS/i.test(l)).slice(-30).join('\n') : ''
  console.error(`forge-snapshots: Unity exited ${code} after ${seconds} s\n${tail}`); process.exit(1)
}
const index = JSON.parse(readFileSync(indexFile, 'utf8'))
console.log(`forge-snapshots: ${index.ok ? 'OK' : 'FAILED ' + index.error} in ${seconds} s, ${index.shots.length} PNGs in ${out}`)
if (flag('sheet') && index.shots.length) {
  const { launch, contactSheet } = await import('./forge-qa/lib.mjs')
  const h = await launch('desktop', { out })
  try { await contactSheet(h, index.shots.map(s => join(out, s.file)), join(out, 'sheet.png'), { cols: 5, width: view === 'phone' ? 180 : 360, labels: index.shots.map(s => s.name) }) } finally { await h.close() }
  console.log('sheet:', join(out, 'sheet.png'))
}
process.exit(index.ok ? 0 : 1)
