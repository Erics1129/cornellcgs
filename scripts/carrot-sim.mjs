// Standalone, deterministic Carrot simulation: the authoritative C# rules and tests compiled with Unity's bundled
// Roslyn against a small UnityEngine shim (scripts/carrot-sim/UnityEngineShim.cs) and run on Unity's bundled .NET 6.
//   node scripts/carrot-sim.mjs --quick              CarrotSimulationTests.Quick (assertion count must equal Unity's)
//   node scripts/carrot-sim.mjs --run                CarrotSimulationTests.Run (full gate incl. the bot campaigns)
//   node scripts/carrot-sim.mjs --method <Name> [a]  any static CarrotSimulationTests method (string[] args passed on)
//   node scripts/carrot-sim.mjs --digest             level-20 policy-0 determinism digest (compare with Unity's log)
//   node scripts/carrot-sim.mjs --bands [--r1 200 --r2 100 --levels 1-29 --jobs N --out file]
//   node scripts/carrot-sim.mjs --tune-dials [--levels 1-28 --iters 7 --out file]   Pressure-dial fit (prints, never edits)
//   node scripts/carrot-sim.mjs --mute [--r1 200]       invariant (d): each boss cast muted in turn, R1 losses that flip
//                                                    reference-bot bands, one process per seed slice, merged
// The build is cached under output/carrot-sim/ by a hash of every source; the shim is compiled with
// UNITY_EDITOR;CARROT_STANDALONE_TEST so the editor-only test hooks exist and the audio regression is skipped.
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { cpus } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const flag = n => argv.includes('--' + n)
const value = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d }
const editorRoot = process.env.UNITY_EDITOR_ROOT || '/Applications/Unity/Hub/Editor/6000.3.18f1'
const S = join(editorRoot, 'Unity.app/Contents/Resources/Scripting')
const dotnet = join(S, 'NetCoreRuntime/dotnet'), csc = join(S, 'DotNetSdkRoslyn/csc.dll')
const fwRoot = join(S, 'NetCoreRuntime/shared/Microsoft.NETCore.App'), fwVersion = readdirSync(fwRoot).sort()[0], fw = join(fwRoot, fwVersion)
const scripts = join(repo, 'unity/CarrotDefense/Assets/Scripts')

// The simulation: data, types, and every partial file of CarrotGame and CarrotSimulationTests.
function simulationSources() {
  const files = readdirSync(scripts).filter(f => f.endsWith('.cs')).sort()
  const picked = files.filter(f => f === 'CarrotData.cs' || f === 'CarrotTypes.cs' || /partial class (CarrotGame|CarrotSimulationTests)\b/.test(readFileSync(join(scripts, f), 'utf8')))
  const extra = (process.env.CARROT_SIM_EXTRA || '').split(':').filter(Boolean).map(f => resolve(f))
  return [...picked.map(f => join(scripts, f)), join(repo, 'scripts/carrot-sim/UnityEngineShim.cs'), join(repo, 'scripts/carrot-sim/Runner.cs'), ...extra]
}
export function build() {
  const sources = simulationSources()
  const hash = createHash('sha256'); for (const s of sources) hash.update(s).update(readFileSync(s))
  const key = hash.digest('hex').slice(0, 16), dir = join(repo, 'output/carrot-sim', key), exe = join(dir, 'carrot-sim.dll')
  if (existsSync(exe)) return exe
  mkdirSync(dir, { recursive: true })
  const refs = ['System.Runtime', 'System.Private.CoreLib', 'System.Collections', 'System.Console', 'System.Linq', 'System.Text.Json', 'System.Memory', 'netstandard', 'System.Runtime.Extensions', 'System.Collections.Concurrent', 'System.Threading', 'System.Text.Encoding.Extensions', 'System.Runtime.InteropServices', 'System.Diagnostics.Process', 'System.Threading.Thread'].map(d => join(fw, d + '.dll')).filter(existsSync)
  const rsp = join(dir, 'build.rsp')
  writeFileSync(rsp, ['-nologo', '-noconfig', '-nostdlib', '-target:exe', '-langversion:9', '-optimize+', '-deterministic', '-nowarn:0169,0414,0649,0162,0219,0282,1701,1702,0618', `-out:"${exe}"`, '-define:UNITY_EDITOR;CARROT_STANDALONE_TEST', ...refs.map(r => `-r:"${r}"`), ...sources.map(s => `"${s}"`)].join('\n'))
  const r = spawnSync(dotnet, [csc, '@' + rsp], { encoding: 'utf8', maxBuffer: 64 << 20 })
  if (r.status !== 0) { console.error((r.stdout + r.stderr).split('\n').filter(l => !/warning CS/.test(l)).join('\n')); console.error('CARROT_SIM_BUILD_FAIL'); process.exit(1) }
  writeFileSync(join(dir, 'carrot-sim.runtimeconfig.json'), JSON.stringify({ runtimeOptions: { tfm: 'net6.0', framework: { name: 'Microsoft.NETCore.App', version: fwVersion }, configProperties: { 'System.GC.Server': false, 'System.Globalization.Invariant': true } } }))
  return exe
}
export function run(exe, args, { quiet = false } = {}) {
  return new Promise(resolvePromise => {
    const child = spawn(dotnet, [exe, ...args], { cwd: repo, env: { ...process.env, DOTNET_TieredPGO: '0' } })
    let out = ''
    child.stdout.on('data', d => { out += d; if (!quiet) process.stdout.write(d) })
    child.stderr.on('data', d => { out += d; if (!quiet) process.stderr.write(d) })
    child.on('exit', code => resolvePromise({ code, out }))
  })
}
const range = (spec, max) => { const out = []; for (const part of String(spec).split(',')) { const [a, b] = part.split('-').map(Number); for (let i = a; i <= (b || a); i++) if (i >= 1 && i <= max) out.push(i) } return out }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const exe = build()
  if (flag('build')) { console.log('CARROT_SIM_BUILT ' + exe); process.exit(0) }
  if (flag('mute')) {
    const { runMute } = await import('./carrot-sim/bands.mjs')
    const out = await runMute({ exe, run, value, repo, jobs: Number(value('jobs', Math.max(2, cpus().length - 2))) })
    writeFileSync(value('out', join(repo, 'docs/carrot-defense/giant-update/difficulty-single-cast.json')), JSON.stringify(out, null, 1) + '\n')
    process.exit(0)
  }
  if (flag('tune-dials')) {
    const { tuneDials } = await import('./carrot-sim/tune.mjs')
    const best = await tuneDials({ exe, run, value, range, repo, jobs: Number(value('jobs', Math.max(2, cpus().length - 2))) })
    const out = value('out'); if (out) writeFileSync(out, JSON.stringify(best, null, 1) + '\n')
    process.exit(0)
  }
  if (flag('bands')) {
    const { runBands } = await import('./carrot-sim/bands.mjs')
    process.exit(await runBands({ exe, run, argv, value, flag, range, repo, jobs: Number(value('jobs', Math.max(2, cpus().length - 2))) }))
  }
  const mode = flag('run') ? ['run'] : flag('tune') ? ['tune'] : flag('digest') ? ['Digest'] : value('method') ? [value('method'), ...argv.slice(argv.indexOf('--method') + 2)] : ['quick']
  const r = await run(exe, mode)
  process.exit(r.code)
}
