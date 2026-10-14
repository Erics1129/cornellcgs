// Compile-check the Carrot Defense Unity C# without launching the editor (world stream helper; the balance stream's
// scripts/carrot-cs-check.mjs is the suite-wide gate once merged). Uses Unity's bundled Roslyn and .NET runtime.
// usage: node scripts/carrot-qa/cs-check.mjs [--project unity/CarrotDefense]
// 1. runtime (player): Assets/Scripts/*.cs with -define:UNITY_WEBGL against the WebGL player UnityEngine DLLs plus the
//    package assemblies Unity compiled into Library/ScriptAssemblies (Cinemachine, URP, Splines, Animation Rigging, ...)
// 2. runtime (editor): the same sources with UNITY_EDITOR;UNITY_WEBGL against the editor UnityEngine DLLs
// 3. editor: Assets/Editor/*.cs against (2), the UnityEditor DLLs and the package editor assemblies
// Prints CSC_OK per stage, or CSC_FAIL with the compiler output; exits non-zero on failure.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const arg = (name, d) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : d }
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const project = resolve(arg('project', join(repo, 'unity/CarrotDefense')))
const editorRoot = process.env.UNITY_EDITOR_ROOT || '/Applications/Unity/Hub/Editor/6000.3.18f1'
const S = join(editorRoot, 'Unity.app/Contents/Resources/Scripting')
const W = join(editorRoot, 'PlaybackEngines/WebGLSupport/Managed')
const dotnet = join(S, 'NetCoreRuntime/dotnet'), csc = join(S, 'DotNetSdkRoslyn/csc.dll')
const SA = join(project, 'Library/ScriptAssemblies')
for (const p of [dotnet, csc, W, SA, join(project, 'Assets/Scripts')]) if (!existsSync(p)) { console.error('carrot cs-check: missing ' + p); process.exit(2) }
const out = join(tmpdir(), 'carrot-cs-' + process.pid); mkdirSync(out, { recursive: true })
const dlls = (dir, re) => existsSync(dir) ? readdirSync(dir).filter(f => re.test(f) && f.endsWith('.dll')).map(f => join(dir, f)) : []
const cs = dir => existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.cs')).sort().map(f => join(dir, f)) : []
const netstandard = join(S, 'NetStandard/ref/2.1.0/netstandard.dll')
const quote = p => '"' + p + '"'
// Package runtime assemblies (never the project's own Assembly-CSharp*, never editor-only ones for the player stage).
const own = /^Assembly-CSharp/
const editorOnly = /Editor|TestRunner|CodeGen|PerformanceTesting|Analytics|DocCodeExamples|PPv2URPConverters|ShaderGraph|WelcomeScreen/
const packages = readdirSync(SA).filter(f => f.endsWith('.dll') && !own.test(f)).map(f => join(SA, f))
const packageRuntime = packages.filter(p => !editorOnly.test(p.split('/').at(-1)))

function compile(name, { defines = [], refs = [], sources }) {
  const rsp = join(out, name + '.rsp'), dll = join(out, name + '.dll')
  const lines = ['-nologo', '-nostdlib', '-target:library', '-langversion:9', '-unsafe', '-nowarn:0169,0414,0649,0162,0219,0618,0612', `-out:${quote(dll)}`, ...(defines.length ? ['-define:' + defines.join(';')] : []), ...refs.map(r => '-r:' + quote(r)), ...sources.map(quote)]
  writeFileSync(rsp, lines.join('\n'))
  const r = spawnSync(dotnet, [csc, '-noconfig', '@' + rsp], { encoding: 'utf8' })
  const text = (r.stdout + r.stderr).split('\n').filter(l => l.trim() && !/warning CS/.test(l)).join('\n')
  if (r.status !== 0) { console.error(text.replaceAll(project + '/', '')); console.error(`CSC_FAIL ${name}`); process.exit(1) }
  return dll
}

try {
  const t0 = Date.now()
  const scripts = cs(join(project, 'Assets/Scripts'))
  compile('runtime-player', { defines: ['UNITY_WEBGL', 'UNITY_2023_1_OR_NEWER', 'UNITY_6000_0_OR_NEWER'], refs: [netstandard, ...dlls(W, /^UnityEngine\..+Module\.dll$|^UnityEngine\.(UI|TestRunner)/), ...packageRuntime], sources: scripts })
  console.log(`CSC_OK runtime player (${scripts.length} files, UNITY_WEBGL)`)
  const EM = join(S, 'Managed/UnityEngine')
  const editorEngine = [netstandard, ...dlls(EM, /^UnityEngine/)]
  const unityEditor = [...dlls(join(S, 'Managed'), /^UnityEditor/), ...dlls(join(S, 'Managed/UnityEditor'), /^UnityEditor/)]
  // In the editor Assembly-CSharp also sees UnityEditor (UNITY_EDITOR blocks in runtime scripts use MenuItem and friends).
  const runtimeEditor = compile('runtime-editor', { defines: ['UNITY_EDITOR', 'UNITY_WEBGL', 'UNITY_2023_1_OR_NEWER', 'UNITY_6000_0_OR_NEWER'], refs: [...editorEngine, ...unityEditor, ...packageRuntime], sources: scripts })
  console.log('CSC_OK runtime editor (UNITY_EDITOR;UNITY_WEBGL)')
  const editorSources = cs(join(project, 'Assets/Editor'))
  compile('editor', { defines: ['UNITY_EDITOR', 'UNITY_WEBGL', 'UNITY_2023_1_OR_NEWER', 'UNITY_6000_0_OR_NEWER'], refs: [...editorEngine, runtimeEditor, ...unityEditor, ...packages], sources: editorSources })
  console.log(`CSC_OK editor (${editorSources.length} files) in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
} finally { rmSync(out, { recursive: true, force: true }) }
