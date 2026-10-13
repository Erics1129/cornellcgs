// Compile-check the Forge or Fold Unity C# and run its pure C# tests without launching the editor.
// usage: node scripts/forge-cs-check.mjs [--project unity/ForgeOrFold] [--no-tests] [--tests-only]
// 1. runtime (player): Assets/Scripts/*.cs with -define:UNITY_WEBGL against the WebGL player UnityEngine DLLs
// 2. runtime (editor): the same sources with UNITY_EDITOR;UNITY_WEBGL against the editor UnityEngine DLLs
// 3. editor: Assets/Editor/*.cs against (2) and the UnityEditor DLLs
// 4. tests: each unity/ForgeOrFold/Tests/*.cs with the sources named on its first line ('// sources: a.cs b.cs',
//    paths relative to the project), -define:FORGE_UNIT, run on Unity's bundled .NET 6. A test prints PASS/FAIL
//    lines and returns non-zero from Main on failure.
// Prints CSC_OK lines, then the PASS lines; exits non-zero on the first failure.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const arg = (name, d) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : d }
const flag = name => process.argv.includes('--' + name)
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const project = resolve(arg('project', join(repo, 'unity/ForgeOrFold')))
const editorRoot = process.env.UNITY_EDITOR_ROOT || '/Applications/Unity/Hub/Editor/6000.3.18f1'
const S = join(editorRoot, 'Unity.app/Contents/Resources/Scripting')
const W = join(editorRoot, 'PlaybackEngines/WebGLSupport/Managed')
const dotnet = join(S, 'NetCoreRuntime/dotnet'), csc = join(S, 'DotNetSdkRoslyn/csc.dll')
for (const p of [dotnet, csc, W, join(project, 'Assets/Scripts')]) if (!existsSync(p)) { console.error('forge-cs-check: missing ' + p); process.exit(2) }
const out = join(tmpdir(), 'forge-cs-' + process.pid); mkdirSync(out, { recursive: true })
const dlls = (dir, re) => readdirSync(dir).filter(f => re.test(f) && f.endsWith('.dll')).map(f => join(dir, f))
const cs = dir => existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.cs')).sort().map(f => join(dir, f)) : []
const netstandard = join(S, 'NetStandard/ref/2.1.0/netstandard.dll')
const quote = p => '"' + p + '"'

function compile(name, { defines = [], refs = [], sources, target = 'library', extra = [] }) {
  const rsp = join(out, name + '.rsp'), dll = join(out, name + '.dll')
  const lines = ['-nologo', '-nostdlib', `-target:${target}`, '-langversion:9', '-nowarn:0169,0414,0649,0162,0219', `-out:${quote(dll)}`, ...(defines.length ? ['-define:' + defines.join(';')] : []), ...extra, ...refs.map(r => '-r:' + quote(r)), ...sources.map(quote)]
  writeFileSync(rsp, lines.join('\n'))
  const r = spawnSync(dotnet, [csc, '-noconfig', '@' + rsp], { encoding: 'utf8' })
  const text = (r.stdout + r.stderr).split('\n').filter(l => l.trim() && !/warning CS/.test(l)).join('\n')
  if (r.status !== 0) { console.error(text.replaceAll(project + '/', '')); console.error(`CSC_FAIL ${name}`); process.exit(1) }
  return dll
}

let failed = false
try {
  if (!flag('tests-only')) {
    const scripts = cs(join(project, 'Assets/Scripts'))
    compile('runtime-player', { defines: ['UNITY_WEBGL'], refs: [netstandard, ...dlls(W, /^UnityEngine/)], sources: scripts })
    console.log(`CSC_OK runtime player (${scripts.length} files, UNITY_WEBGL)`)
    const EM = join(S, 'Managed/UnityEngine')
    const editorEngine = [netstandard, ...dlls(EM, /^UnityEngine/)]
    const runtimeEditor = compile('runtime-editor', { defines: ['UNITY_EDITOR', 'UNITY_WEBGL'], refs: editorEngine, sources: scripts })
    console.log('CSC_OK runtime editor (UNITY_EDITOR;UNITY_WEBGL)')
    const editorSources = cs(join(project, 'Assets/Editor'))
    compile('editor', { defines: ['UNITY_EDITOR', 'UNITY_WEBGL'], refs: [...editorEngine, runtimeEditor, ...dlls(join(S, 'Managed'), /^UnityEditor/)], sources: editorSources })
    console.log(`CSC_OK editor (${editorSources.length} files)`)
  }
  if (!flag('no-tests')) {
    const fwRoot = join(S, 'NetCoreRuntime/shared/Microsoft.NETCore.App'), version = readdirSync(fwRoot).sort()[0], fw = join(fwRoot, version)
    const refs = ['System.Runtime', 'System.Console', 'System.Private.CoreLib', 'netstandard', 'System.Collections', 'System.Linq', 'System.Runtime.Extensions'].map(d => join(fw, d + '.dll')).filter(existsSync)
    const tests = cs(join(project, 'Tests'))
    for (const test of tests) {
      const first = readFileSync(test, 'utf8').split('\n')[0]
      const m = /^\/\/\s*sources:\s*(.*)$/.exec(first)
      const sources = m ? m[1].trim().split(/\s+/).filter(Boolean).map(s => join(project, s)) : []
      for (const s of sources) if (!existsSync(s)) { console.error(`forge-cs-check: ${test} names a missing source ${s}`); process.exit(1) }
      const name = 'test-' + test.split('/').at(-1).replace(/\.cs$/, '')
      const dll = compile(name, { target: 'exe', defines: ['FORGE_UNIT'], refs, sources: [...sources, test] })
      writeFileSync(dll.replace(/\.dll$/, '.runtimeconfig.json'), JSON.stringify({ runtimeOptions: { tfm: 'net6.0', framework: { name: 'Microsoft.NETCore.App', version } } }))
      const r = spawnSync(dotnet, [dll], { encoding: 'utf8' })
      process.stdout.write(r.stdout); if (r.stderr) process.stderr.write(r.stderr)
      if (r.status !== 0) { failed = true; console.error(`TEST_FAIL ${name.slice(5)} (exit ${r.status})`) }
    }
    if (!tests.length) console.log('no tests under ' + join(project, 'Tests'))
  }
} finally { rmSync(out, { recursive: true, force: true }) }
process.exit(failed ? 1 : 0)
