// Runs one Unity batch method on THIS checkout's Carrot project, serialized by an atomic lock and a process check.
// usage: node scripts/carrot-qa/unity.mjs --method CarrotTD.CarrotBuild.WebQa [--render] [--log name] [--timeout-min 90]
//   --render   keep the graphics device (no -nographics) for editor-side captures
// Refuses to start while another Unity has this projectPath open, runs the C# compile check first, and holds
// <scratch>/unity.lock (owner pid + start time; a lock whose pid is dead is recovered) for the whole run.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const arg = (name, d) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : d }
const flag = name => process.argv.includes('--' + name)
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const project = resolve(repo, 'unity/CarrotDefense')
const editor = process.env.UNITY_EDITOR || '/Applications/Unity/Hub/Editor/6000.3.18f1/Unity.app/Contents/MacOS/Unity'
const method = arg('method')
if (!method) { console.error('usage: --method Namespace.Class.Method'); process.exit(2) }
const scratch = process.env.CARROT_SCRATCH || resolve(repo, '../../world')
const lock = join(scratch, 'unity.lock')
mkdirSync(join(repo, 'output'), { recursive: true }); mkdirSync(scratch, { recursive: true })
const log = resolve(repo, 'output', `unity-${arg('log', method.split('.').at(-1))}.log`)

const running = spawnSync('pgrep', ['-fl', `projectPath ${project}`], { encoding: 'utf8' }).stdout.trim()
if (running) { console.error('Another Unity already has this project open:\n' + running); process.exit(3) }
function take() {
  try { mkdirSync(lock); writeFileSync(join(lock, 'owner.json'), JSON.stringify({ owner: 'world', pid: process.pid, method, started: new Date().toISOString() })); return true }
  catch {
    try { const o = JSON.parse(readFileSync(join(lock, 'owner.json'), 'utf8')); process.kill(o.pid, 0); console.error('unity.lock held by ' + JSON.stringify(o)); return false }
    catch { rmSync(lock, { recursive: true, force: true }); return take() }
  }
}
if (!take()) process.exit(4)
const release = () => rmSync(lock, { recursive: true, force: true })
process.on('exit', release); process.on('SIGINT', () => { release(); process.exit(130) })

const check = spawnSync(process.execPath, [join(repo, 'scripts/carrot-qa/cs-check.mjs')], { encoding: 'utf8' })
process.stdout.write(check.stdout); if (check.status !== 0) { process.stderr.write(check.stderr); console.error('C# check failed; Unity not started.'); process.exit(5) }

const args = ['-batchmode', ...(flag('render') ? [] : ['-nographics']), '-projectPath', project, '-buildTarget', 'WebGL', '-executeMethod', method, '-quit', '-logFile', log]
const t0 = Date.now()
const child = spawn(editor, args, { stdio: 'inherit' })
const limit = Number(arg('timeout-min', 90)) * 60000
const timer = setTimeout(() => { console.error('Unity exceeded ' + limit / 60000 + ' min; stopping'); child.kill('SIGTERM') }, limit)
child.on('exit', code => {
  clearTimeout(timer)
  const secs = ((Date.now() - t0) / 1000).toFixed(0)
  if (code) { if (existsSync(log)) console.error(readFileSync(log, 'utf8').slice(-12000)); console.error(`UNITY_FAIL ${method} exit ${code} after ${secs} s (log ${log})`); process.exitCode = code || 1 }
  else console.log(`UNITY_OK ${method} in ${secs} s (log ${log})`)
})
