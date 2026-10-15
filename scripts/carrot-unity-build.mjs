// Every Unity batch run of Carrot Defense goes through this script (web builds, tests, Prepare/import methods, renders).
//   node scripts/carrot-unity-build.mjs              release Web build into public/unity/carrot (+ unity-build.json)
//   --test                                           CarrotSimulationTests.Run (the authoritative gate)
//   --quick | --tune | --bands                       CarrotSimulationTests.Quick / Tune / Bands
//   --qa | --dev                                     QA (release settings + CARROT_QA) / Development build into output/
//   --method <Namespace.Class.Method>                any static editor method (Prepare, Inventory, import passes), -nographics
//   --render <Namespace.Class.Method>                the same with a graphics device (fast visual iteration, no web build)
//   --owner <stream>                                 label written into the queue ticket (default $CARROT_STREAM)
// Safety rails, in order: (1) refuses when any Unity process already has this project open (pgrep -f "projectPath <dir>");
// (2) runs scripts/carrot-cs-check.mjs and names the owner of a failing file; (3) takes a FIFO ticket in the shared
// queue and then the atomic lock directory (mkdir) at $CARROT_SCRATCH/carrot/unity.lock, recovering stale tickets and
// locks whose pid is dead; (4) kills the run when it exceeds its hold (45 min tests/methods, 90 min IL2CPP builds).
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, mkdirSync, writeFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { resolve, join, basename } from 'node:path'

const argv = process.argv.slice(2)
const flag = name => argv.includes('--' + name)
const value = name => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : undefined }
const editor = process.env.UNITY_EDITOR || '/Applications/Unity/Hub/Editor/6000.3.18f1/Unity.app/Contents/MacOS/Unity'
if (!existsSync(editor)) throw new Error('Set UNITY_EDITOR to Unity 6000.3.18f1 with Web Build Support installed.')
const project = resolve('unity/CarrotDefense')
const scratch = process.env.CARROT_SCRATCH || '/private/tmp/claude-501/-Users-eric-Claude/c0f378b2-d447-4405-9fc6-aa152072f6bd/scratchpad'
const owner = value('owner') || process.env.CARROT_STREAM || basename(resolve('.'))
mkdirSync('output', { recursive: true })

const test = flag('test'), quick = flag('quick'), tune = flag('tune'), bands = flag('bands')
const method = value('method'), render = value('render')
const dev = flag('dev'), qa = flag('qa')
const mode = test ? 'test' : quick ? 'quick' : tune ? 'tune' : bands ? 'bands' : method ? 'method' : render ? 'render' : dev ? 'dev' : qa ? 'qa' : 'build'
const execute = {
  test: 'CarrotTD.CarrotSimulationTests.Run', quick: 'CarrotTD.CarrotSimulationTests.Quick', tune: 'CarrotTD.CarrotSimulationTests.Tune', bands: 'CarrotTD.CarrotSimulationTests.Bands',
  method, render, dev: 'CarrotTD.CarrotBuild.WebDev', qa: 'CarrotTD.CarrotBuild.WebQa', build: 'CarrotTD.CarrotBuild.Web',
}[mode]
if (!execute || !/^[A-Za-z_][\w.]*\.[A-Za-z_]\w*$/.test(execute)) { console.error(`carrot-unity-build: --${mode} needs a Namespace.Class.Method`); process.exit(2) }
const log = resolve(`output/carrot-unity-${mode === 'method' || mode === 'render' ? mode + '-' + execute.split('.').slice(-2).join('.') : mode}.log`)
const holdMinutes = mode === 'build' || mode === 'qa' || mode === 'dev' ? 90 : 45

// (1) One Unity process per project folder.
const busy = spawnSync('pgrep', ['-fl', `projectPath ${project}`], { encoding: 'utf8' })
const holders = (busy.stdout || '').split('\n').filter(l => l.trim() && !/pgrep|carrot-unity-build/.test(l))
if (holders.length) { console.error(`carrot-unity-build: a Unity process already has ${project} open:\n${holders.join('\n')}`); process.exit(3) }

// (2) Every C# file must compile before Unity is launched; the failing file's owner is named.
const OWNERS = [
  [/Scripts\/(CarrotGame|CarrotData|CarrotExpansion|CarrotPrism|CarrotTypes|CarrotSimulationTests|CarrotExpansionTests|CarrotPrismTests)\.cs/, 'balance'],
  [/Scripts\/(CarrotAudio|CarrotAudioExpansion|CarrotPrismAudio|CarrotMusicTests|CarrotSfxBank|CarrotAmbience)\.cs|Editor\/CarrotAudioImport\.cs/, 'audio'],
  [/Scripts\/(CarrotViewActors|CarrotModelMetrics|CarrotSecondaryMotion|CarrotTierLod)\.cs|Editor\/(CarrotModels|CarrotNaturalAssets|CarrotPortalModelChecks)\.cs/, 'characters'],
  [/\.cs$/, 'world'],
]
const check = spawnSync(process.execPath, [resolve('scripts/carrot-cs-check.mjs')], { encoding: 'utf8' })
if (check.status !== 0) {
  const text = (check.stdout || '') + (check.stderr || '')
  console.error(text.split('\n').slice(-40).join('\n'))
  const files = [...new Set([...text.matchAll(/^([^\s(]+\.cs)\(\d+,\d+\): error/gm)].map(m => m[1]))]
  for (const f of files) console.error(`carrot-unity-build: ${f} fails to compile (owner: ${(OWNERS.find(([re]) => re.test(f)) || [, 'unknown'])[1]})`)
  console.error('carrot-unity-build: refusing to launch Unity while carrot-cs-check fails.')
  process.exit(4)
}

// (3) FIFO ticket queue + atomic lock directory with stale recovery.
const queue = join(scratch, 'carrot/unity-queue'), lock = join(scratch, 'carrot/unity.lock')
mkdirSync(queue, { recursive: true })
const alive = pid => { try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' } }
const ticket = join(queue, `${Date.now().toString().padStart(15, '0')}-${process.pid}.json`)
writeFileSync(ticket, JSON.stringify({ owner, pid: process.pid, mode, method: execute, project, queuedAt: new Date().toISOString() }))
const cleanup = () => { try { rmSync(ticket, { force: true }) } catch {} ; try { const held = JSON.parse(readFileSync(join(lock, 'owner.json'), 'utf8')); if (held.pid === process.pid) rmSync(lock, { recursive: true, force: true }) } catch {} }
process.on('exit', cleanup)
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => { cleanup(); process.exit(130) })
const sleep = ms => new Promise(r => setTimeout(r, ms))
function headOfQueue() {
  const tickets = readdirSync(queue).filter(f => f.endsWith('.json')).sort()
  for (const t of tickets) {
    let info; try { info = JSON.parse(readFileSync(join(queue, t), 'utf8')) } catch { continue }
    if (!alive(info.pid)) { rmSync(join(queue, t), { force: true }); continue }
    return t === basename(ticket)
  }
  return true
}
function tryLock() {
  try { mkdirSync(lock) } catch (e) {
    if (e.code !== 'EEXIST') throw e
    let held = null; try { held = JSON.parse(readFileSync(join(lock, 'owner.json'), 'utf8')) } catch {}
    const age = held ? Date.now() - Date.parse(held.start) : 0
    // A lock directory without owner.json is either being written right now or left by a crash between mkdir and write.
    if (!held) { try { if (Date.now() - statSync(lock).mtimeMs > 30000) { rmSync(lock, { recursive: true, force: true }); return tryLock() } } catch {} return null }
    if (held && (!alive(held.pid) || age > (held.holdMinutes || 90) * 60000 + 300000)) { console.log(`carrot-unity-build: recovering stale lock of ${held.owner} (pid ${held.pid})`); rmSync(lock, { recursive: true, force: true }); return tryLock() }
    return held
  }
  writeFileSync(join(lock, 'owner.json'), JSON.stringify({ owner, pid: process.pid, mode, method: execute, project, start: new Date().toISOString(), holdMinutes }))
  return true
}
let announced = 0
for (;;) {
  const held = headOfQueue() ? tryLock() : 'queued'
  if (held === true) break
  if (Date.now() - announced > 60000) { announced = Date.now(); console.log(`carrot-unity-build: waiting for the Unity lock (${held === 'queued' ? 'behind earlier tickets' : `held by ${held && held.owner} pid ${held && held.pid} since ${held && held.start}`})`) }
  await sleep(2000)
}
rmSync(ticket, { force: true })

// (4) Launch, bounded by the hold.
const args = ['-batchmode', ...(mode === 'render' ? [] : ['-nographics']), '-projectPath', project, '-buildTarget', 'WebGL', '-executeMethod', execute, '-quit', '-logFile', log]
console.log(`carrot-unity-build: ${owner} holds the Unity lock for ${mode} (${execute}); log ${log}`)
const child = spawn(editor, args, { stdio: 'inherit', env: { ...process.env } })
const timer = setTimeout(() => { console.error(`carrot-unity-build: ${mode} exceeded its ${holdMinutes} min hold; stopping Unity`); child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 20000) }, holdMinutes * 60000)
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
child.on('exit', code => {
  clearTimeout(timer)
  const text = existsSync(log) ? readFileSync(log, 'utf8') : ''
  const marker = [...text.matchAll(/^(CARROT_(?:TESTS_OK|QUICK_OK|TUNE_DONE|BANDS_DONE)[^\n]*)$/gm)].map(m => m[1])
  if (code) { console.error(text.slice(-10000)); process.exitCode = code || 1; return }
  if (marker.length) console.log(marker.join('\n'))
  console.log({
    test: 'Carrot simulation checks passed.', quick: 'Carrot quick checks passed.', tune: 'Carrot tune run finished.', bands: 'Carrot band run finished.',
    method: `Unity method ${execute} finished.`, render: `Unity render method ${execute} finished.`,
    dev: 'Unity Web development build ready in output/carrot-dev (QA only; not shipped).', qa: 'Unity Web QA build (release settings + debugCoins) ready in output/carrot-qa (not shipped).',
    build: 'Unity Web build ready in public/unity/carrot. Run npm run build to package the website.',
  }[mode])
})
