// strike-feel visual loop: the hearth reach on a timeline, the hammer at press +1 frame, apex and contact, close-ups
// of the hands, and the per-outcome hit-stop frames, rendered by the frozen editor rig (ForgeSnapshots.Capture).
// usage: node scripts/forge-qa/strike-snapshots.mjs --out <dir> [--project unity/ForgeOrFold] [--view desktop|phone|landscape]
//          [--sheet] [--fixtures-only] [--only hearth,hearthside,quenchside,strike,closeup,outcomes,flow,moves,look]
// Steps it adds on top of the rig: Qa('strike-press=<seq>') presses without the rig resolving the hit (pose frames),
// Qa('strike-cam=ex,ey,ez,tx,ty,tz,fov') / Qa('strike-cam=off') overrides the camera (editor only), Qa('strike-bones')
// logs the arm bones (FORGE_BONES in unity.log). Telemetry frames land in index.json messages.
import { spawn, execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act, createRun } from '../../src/minigames/forge/engine.ts'
import { snapshotPayload, unityEffect, forgeView } from '../../src/minigames/forge/bridge.ts'

const arg = (name, d) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : d }
const flag = name => process.argv.includes('--' + name)
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const project = resolve(arg('project', join(repo, 'unity/ForgeOrFold')))
const out = resolve(arg('out', join(repo, 'output/strike-snapshots')))
const view = arg('view', 'desktop'), dt = Number(arg('dt', 1 / 120))
const only = new Set((arg('only', 'hearth,hearthside,quenchside,strike,closeup,outcomes,flow,moves,look')).split(','))
const editor = process.env.UNITY_EDITOR || '/Applications/Unity/Hub/Editor/6000.3.18f1/Unity.app/Contents/MacOS/Unity'

const payload = (state, event, selected = 1, extra = {}) => JSON.stringify({ ...snapshotPayload(state, selected, { reduced: false, ...extra }), effect: unityEffect(event) })
const step = (s, a) => { const r = act(s, a); if (!r.ok) throw new Error(`fixture action failed: ${JSON.stringify(a)}: ${r.event.text}`); return r }
function findHit(outcome, minLevel = 0, evolution = false) {
  for (let seed = 1; seed < 5000; seed++) {
    let s = createRun(seed)
    for (const a of [{ type: 'move', id: 1, to: 'furnace' }, { type: 'heat', id: 1 }, { type: 'move', id: 1, to: 'anvil' }]) s = step(s, a).state
    for (let i = 0; i < 14; i++) {
      s = step(s, { type: 'tick', ms: 1000 }).state
      const k = s.knives.find(n => n.id === 1); if (!k) break
      const r = act(s, { type: 'hit', id: 1 }); if (!r.ok) break
      if (r.event.outcome === outcome && k.level >= minLevel && !r.event.flowStarted && !k.flow && !!r.event.evolution === evolution) return { before: s, after: r.state, event: r.event, seed }
      s = r.state; if (s.knives.find(n => n.id === 1)?.flow) break
    }
  }
  throw new Error('no fixture for outcome ' + outcome)
}
const sizes = { desktop: [1440, 900, 1440, 900, 1, false, 70, 150], phone: [780, 1688, 390, 844, 2, true, 150, 230], landscape: [1688, 780, 844, 390, 2, true, 56, 92] }
const [W, H, cssW, cssH, dpr, touch, top, bottom] = sizes[view]
const insets = { ...forgeView(cssW, cssH, dpr, touch), top, bottom }
const s0 = createRun(1)
const furnace = step(s0, { type: 'move', id: 1, to: 'furnace' })
const heated = step(furnace.state, { type: 'heat', id: 1 })
const seated = step(heated.state, { type: 'move', id: 1, to: 'anvil' })
const good = findHit('good'), perfect = findHit('perfect', 2), chip = findHit('chip', 3), shatter = findHit('shatter', 4), evolved = findHit('good', 0, true), dull = (() => { try { return findHit('dull') } catch { return null } })()
const tuning = readFileSync(join(repo, 'src/minigames/forge/feel-tuning.json'), 'utf8')
const cam = (e, t, fov) => ({ do: 'qa', mode: `strike-cam=${[...e, ...t, fov].join(',')}` })
const W8 = s => ({ do: 'wait', s })
const C = name => ({ do: 'capture', name })
const steps = [
  { do: 'tune', json: tuning }, { do: 'qa', mode: 'steady' }, { do: 'qa', mode: 'telemetry' }, { do: 'insets', json: JSON.stringify(insets) },
  { do: 'sync', json: payload(s0) }, W8(1.0), { do: 'qa', mode: 'strike-bones' },
]
if (only.has('hearth')) {
  // The hearth reach: the engine's move to the furnace starts it; heat + move to the anvil arrive at 2.0 s (the page's timer).
  steps.push({ do: 'sync', json: payload(furnace.state, furnace.event) })
  let t = 0
  for (const at of [.15, .35, .55, .8, 1.2, 1.5, 1.75, 1.95]) { steps.push(W8(+(at - t).toFixed(4)), C('hearth-' + at.toFixed(2))); t = at }
  steps.push(W8(+(2.0 - t).toFixed(4)), { do: 'sync', json: payload(heated.state, heated.event) }, { do: 'sync', json: payload(seated.state, seated.event) })
  steps.push(W8(.08), C('hearth-2.08'), W8(.12), C('hearth-2.20'), W8(.3), C('seated'), { do: 'qa', mode: 'strike-bones' })
} else steps.push({ do: 'sync', json: payload(seated.state, seated.event) }, W8(.6))
if (only.has('hearthside')) {
  // Third-person views of the hearth reach (the body renders arms only): the right hand on the bellows handle through the pull.
  const back = step(seated.state, { type: 'move', id: 1, to: 'rack' }), again = step(back.state, { type: 'move', id: 2, to: 'furnace' })
  const heat2 = step(again.state, { type: 'heat', id: 2 }), seat2 = step(heat2.state, { type: 'move', id: 2, to: 'anvil' })
  steps.push({ do: 'sync', json: payload(back.state, back.event) }, W8(.6), cam([.35, 1.55, -.35], [-.62, 1.05, -.62], 50), W8(2 * dt))
  steps.push({ do: 'sync', json: payload(again.state, again.event) })
  let t = 0
  for (const at of [.3, .5, .7, .85, 1.1, 1.3]) { steps.push(W8(+(at - t).toFixed(4)), C('hearthside-' + at.toFixed(2))); t = at }
  steps.push(W8(+(2.0 - t).toFixed(4)), { do: 'sync', json: payload(heat2.state, heat2.event) }, { do: 'sync', json: payload(seat2.state, seat2.event) }, W8(.4), { do: 'qa', mode: 'strike-cam=off' }, W8(.1))
  steps.push({ do: 'sync', json: payload(seated.state) }, W8(.3))
}
if (only.has('quenchside')) {
  // Third-person view of the quench: the blade carried flat over the slack tub, rolled tip down into the water, lifted out.
  const kept = step(seated.state, { type: 'move', id: 1, to: 'rack' })
  steps.push({ do: 'sync', json: payload(heated.state, heated.event) }, { do: 'sync', json: payload(seated.state, seated.event) }, W8(.8), cam([-.25, 1.25, -.05], [-.80, .86, -.48], 50), W8(2 * dt))
  steps.push({ do: 'sync', json: payload(kept.state, kept.event) })
  let t = 0
  for (const at of [.25, .5, .7, 1.0, 1.4]) { steps.push(W8(+(at - t).toFixed(4)), C('quenchside-' + at.toFixed(2))); t = at }
  steps.push(W8(1.0), { do: 'qa', mode: 'strike-cam=off' }, { do: 'sync', json: payload(seated.state) }, W8(.4))
}
if (only.has('strike')) {
  // Parked after idle, then a strike from park with apex and contact frames, and a press +1/+2 frame capture.
  steps.push(W8(1.8), C('park'), { do: 'sync', json: payload(good.before) }, W8(.4))
  steps.push({ do: 'strike', seq: 1, name: 'park', apex: true, contact: true, impact: payload(good.after, good.event), afterMs: [100, 300], afterNames: ['rebound-100', 'recover-300'] }, W8(.15), C('ready'))
  steps.push({ do: 'sync', json: payload(good.before) }, W8(.2), { do: 'qa', mode: 'strike-press=7' }, W8(dt), C('press-1f'), W8(dt), C('press-2f'), W8(.05), C('press-67ms'), W8(.6))
  steps.push({ do: 'sync', json: payload(good.before) }, W8(.3), { do: 'qa', mode: 'strike-bones' })
}
if (only.has('closeup')) {
  // Third-person QA views (the body renders arms only): from the right, from the left and from across the anvil. The camera
  // override applies on the next frame, so every capture waits two frames after it.
  const views = { right: [[.95, 1.22, -.80], [.06, .98, -.58], 40], left: [[-.95, 1.22, -.90], [-.22, .97, -.62], 40], across: [[.12, 1.42, .10], [.0, 1.0, -.72], 52] }
  for (const [n, [e, t, f]] of Object.entries(views)) steps.push(cam(e, t, f), W8(2 * dt), C('side-' + n))
  steps.push(cam(...views.right), { do: 'sync', json: payload(good.before) }, W8(.3), { do: 'strike', seq: 2, name: 'side-right', apex: true, contact: true, impact: payload(good.after, good.event), afterMs: [100], afterNames: ['side-right-rebound'] }, W8(.2))
  steps.push(cam(...views.across), W8(.3), { do: 'strike', seq: 6, name: 'side-across', apex: true, contact: true, impact: payload(good.after, good.event) }, W8(.2))
  steps.push({ do: 'qa', mode: 'strike-bones' }, { do: 'qa', mode: 'strike-cam=off' }, W8(.1))
}
if (only.has('outcomes')) {
  for (const [name, f, seq] of [['perfect', perfect, 3], ['chip', chip, 4], ['shatter', shatter, 5], ['evolution', evolved, 8], ...(dull ? [['dull', dull, 9]] : [])]) {
    steps.push({ do: 'sync', json: payload(f.before) }, W8(.7), { do: 'strike', seq, name, impact: payload(f.after, f.event), afterMs: [12, 40, 80, 160, 400], afterNames: [name + '-12', name + '-40', name + '-80', name + '-160', name + '-400'] }, W8(.5))
  }
}
if (only.has('flow')) {
  // Flow: the same knife with Flow running (presentation only: Unity reads knife.flow > 0) swings in 125 ms.
  const flowed = structuredClone(good.before); flowed.knives.find(n => n.id === 1).flow = 3
  const flowAfter = structuredClone(good.after); flowAfter.knives.find(n => n.id === 1).flow = 3
  steps.push({ do: 'sync', json: payload(flowed) }, W8(.7), { do: 'strike', seq: 10, name: 'flow', apex: true, contact: true, impact: payload(flowAfter, good.event), afterMs: [30, 180], afterNames: ['flow-30', 'flow-180'] }, W8(.4))
}
if (only.has('moves')) {
  // Keep (anvil -> rack) with a hot blade: the quench at the slack tub, the blade dissolving to the rack on the step back.
  // New (a crate blank -> furnace) then starts the hearth reach again.
  const kept = step(seated.state, { type: 'move', id: 1, to: 'rack' })
  steps.push({ do: 'sync', json: payload(heated.state, heated.event) }, { do: 'sync', json: payload(seated.state, seated.event) }, W8(.8), { do: 'sync', json: payload(kept.state, kept.event) })
  { let t = 0; for (const at of [.06, .3, .55, .8, 1.1, 1.4, 1.6, 1.9]) { steps.push(W8(+(at - t).toFixed(4)), C('keep-' + Math.round(at * 1000))); t = at } }
  const next = step(kept.state, { type: 'move', id: 2, to: 'furnace' }), nextHeat = step(next.state, { type: 'heat', id: 2 }), nextSeat = step(nextHeat.state, { type: 'move', id: 2, to: 'anvil' })
  steps.push({ do: 'sync', json: payload(next.state, next.event) }, W8(.3), C('new-300'), W8(1.7), { do: 'sync', json: payload(nextHeat.state, nextHeat.event) }, { do: 'sync', json: payload(nextSeat.state, nextSeat.event) }, W8(.3), C('new-seated'))
  // Reduced motion: no step or turn; the blank heats off screen and fades onto the anvil in 150 ms.
  const r0 = step(nextSeat.state, { type: 'move', id: 2, to: 'rack' }), r1 = step(r0.state, { type: 'move', id: 3, to: 'furnace' }), r2 = step(r1.state, { type: 'heat', id: 3 }), r3 = step(r2.state, { type: 'move', id: 3, to: 'anvil' })
  const R = (st, ev) => payload(st, ev, 1, { reduced: true })
  steps.push({ do: 'sync', json: R(r0.state, r0.event) }, W8(.3), { do: 'sync', json: R(r1.state, r1.event) }, W8(.3), C('reduced-300'), W8(1.4), { do: 'sync', json: R(r2.state, r2.event) }, { do: 'sync', json: R(r3.state, r3.event) }, W8(.07), C('reduced-fade-70'), W8(.2), C('reduced-seated'))
  steps.push({ do: 'sync', json: payload(r3.state) }, W8(.3))
}
if (only.has('look')) {
  steps.push({ do: 'sync', json: payload(seated.state) }, W8(.6))
  for (const [n, yaw, pitch] of [['front', 0, 0], ['left', -90, 0], ['right', 90, 0], ['down', 0, 75]]) steps.push({ do: 'look', yaw, pitch }, W8(1.0), C('look-' + n))
  steps.push({ do: 'focus' }, W8(.6), C('refocus'))
}
const job = { view, width: W, height: H, dt, timeout: 300, steps }
mkdirSync(out, { recursive: true })
const fixtures = join(out, 'fixtures.json')
writeFileSync(fixtures, JSON.stringify(job, null, 1))
console.log(`fixtures: ${steps.length} steps -> ${fixtures}`)
if (flag('fixtures-only')) process.exit(0)

let busy = ''
try { busy = execSync('pgrep -fl "projectPath"').toString() } catch { /* none */ }
const holders = busy.split('\n').filter(l => l.includes(project))
if (holders.length) { console.error('strike-snapshots: another Unity has this project open:\n' + holders.join('\n')); process.exit(3) }
const log = join(out, 'unity.log'), started = Date.now()
const child = spawn(editor, ['-batchmode', '-projectPath', project, '-executeMethod', 'ForgeSnapshots.Capture', '-forgeOut', out, '-forgeFixtures', fixtures, '-logFile', log], { stdio: 'ignore' })
const kill = setTimeout(() => { console.error('strike-snapshots: Unity timed out, killing it'); child.kill('SIGKILL') }, 15 * 60 * 1000)
const code = await new Promise(r => child.on('exit', c => r(c)))
clearTimeout(kill)
const seconds = ((Date.now() - started) / 1000).toFixed(1)
const indexFile = join(out, 'index.json')
if (code !== 0 || !existsSync(indexFile)) {
  const tail = existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(l => /error|exception|FORGE_SNAPSHOTS/i.test(l)).slice(-30).join('\n') : ''
  console.error(`strike-snapshots: Unity exited ${code} after ${seconds} s\n${tail}`); process.exit(1)
}
const index = JSON.parse(readFileSync(indexFile, 'utf8'))
const bones = existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(l => l.startsWith('FORGE_BONES')) : []
writeFileSync(join(out, 'bones.txt'), bones.join('\n') + '\n')
const tele = index.messages.map(m => { const j = m.indexOf('{'); return j < 0 ? null : JSON.parse(m.slice(j)) }).filter(m => m && m.type === 'telemetry').map(m => JSON.parse(m.spot))
writeFileSync(join(out, 'telemetry.json'), JSON.stringify(tele, null, 1))
console.log(`strike-snapshots: ${index.ok ? 'OK' : 'FAILED ' + index.error} in ${seconds} s, ${index.shots.length} PNGs, ${tele.length} telemetry frames in ${out}`)
if (flag('sheet') && index.shots.length) {
  const { launch, contactSheet } = await import('./lib.mjs')
  const h = await launch('desktop', { out })
  try { await contactSheet(h, index.shots.map(s => join(out, s.file)), join(out, 'sheet.png'), { cols: view === 'phone' ? 8 : 5, width: view === 'phone' ? 180 : 360, labels: index.shots.map(s => s.name) }) } finally { await h.close() }
  console.log('sheet:', join(out, 'sheet.png'))
}
process.exit(index.ok ? 0 : 1)
