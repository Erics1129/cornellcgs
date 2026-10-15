// Compile-check the Carrot Defense Unity C# without launching the editor (modelled on forge-cs-check.mjs).
// usage: node scripts/carrot-cs-check.mjs [--project unity/CarrotDefense] [--json]
// 1. runtime (player):  Assets/Scripts/**.cs as the WebGL player compiles them (UNITY_WEBGL, WebGLSupport/Managed + package refs)
// 2. runtime (editor):  the same sources with UNITY_EDITOR against the editor UnityEngine/UnityEditor modules + package refs
// 3. editor:            Assets/Editor/**.cs against (2), UnityEditor and the editor package refs
// Defines and references are read from Unity's own response files under Library/Bee/artifacts (the last successful
// editor import), so this check sees exactly what Unity sees; only the source list is taken fresh from disk. When no
// response file exists (a fresh clone), it falls back to the editor's managed DLL folders and Library/ScriptAssemblies.
// Runs on Unity's bundled .NET (NetCoreRuntime/dotnet + DotNetSdkRoslyn/csc.dll). Prints CSC_OK lines or CSC_FAIL and
// exits non-zero; error lines keep their project-relative file path so carrot-unity-build.mjs can name the file owner.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, isAbsolute, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const arg = (name, d) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : d }
const flag = name => process.argv.includes('--' + name)
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const project = resolve(arg('project', join(repo, 'unity/CarrotDefense')))
const editorRoot = process.env.UNITY_EDITOR_ROOT || '/Applications/Unity/Hub/Editor/6000.3.18f1'
const S = join(editorRoot, 'Unity.app/Contents/Resources/Scripting')
const W = join(editorRoot, 'PlaybackEngines/WebGLSupport/Managed')
const dotnet = join(S, 'NetCoreRuntime/dotnet'), csc = join(S, 'DotNetSdkRoslyn/csc.dll')
for (const p of [dotnet, csc, join(project, 'Assets/Scripts')]) if (!existsSync(p)) { console.error('carrot-cs-check: missing ' + p); process.exit(2) }
const started = Date.now()
const out = join(tmpdir(), 'carrot-cs-' + process.pid); mkdirSync(out, { recursive: true })
const quote = p => '"' + p + '"'
const results = []

// Unity places every folder named Editor (at any depth) in the editor assembly; everything else under Assets is runtime.
function walk(dir, list = []) {
  if (!existsSync(dir)) return list
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name), st = statSync(path)
    if (st.isDirectory()) walk(path, list)
    else if (name.endsWith('.cs')) list.push(path)
  }
  return list
}
const inEditorFolder = p => relative(join(project, 'Assets'), p).split('/').includes('Editor')
const allSources = walk(join(project, 'Assets')).filter(p => !/\/(Licensed|Private)\//.test(relative(project, p)))
const runtimeSources = allSources.filter(p => !inEditorFolder(p))
const editorSources = allSources.filter(inEditorFolder)

// Newest Bee dag holding a response file; the player dag lacks UNITY_EDITOR.
function responseFiles() {
  const root = join(project, 'Library/Bee/artifacts')
  if (!existsSync(root)) return {}
  const found = []
  for (const dag of readdirSync(root)) {
    const rsp = join(root, dag, 'Assembly-CSharp.rsp')
    if (!existsSync(rsp)) continue
    const text = readFileSync(rsp, 'utf8')
    found.push({ dag: join(root, dag), rsp, text, editor: /-define:UNITY_EDITOR\b/.test(text), time: statSync(rsp).mtimeMs })
  }
  found.sort((a, b) => b.time - a.time)
  const editor = found.find(f => f.editor), player = found.find(f => !f.editor)
  const editorAsm = editor && existsSync(join(editor.dag, 'Assembly-CSharp-Editor.rsp')) ? readFileSync(join(editor.dag, 'Assembly-CSharp-Editor.rsp'), 'utf8') : null
  return { editor, player, editorAsm }
}
// Keeps defines, references and language flags; the analyzers, outputs and additional files belong to Unity's run.
function parseRsp(text) {
  const defines = [], refs = [], flags = []
  for (const raw of text.split('\n')) {
    const line = raw.trim(); if (!line) continue
    let m
    if ((m = /^-define:(.+)$/.exec(line))) defines.push(m[1])
    else if ((m = /^-r:"?([^"]+)"?$/.exec(line))) refs.push(isAbsolute(m[1]) ? m[1] : join(project, m[1]))
    else if (/^-langversion:/.test(line) || /^[-/]nowarn:/.test(line) || /^[-/]unsafe/.test(line)) flags.push(line)
  }
  return { defines, refs, flags }
}
const dlls = (dir, re) => existsSync(dir) ? readdirSync(dir).filter(f => re.test(f) && f.endsWith('.dll')).map(f => join(dir, f)) : []
function fallback(kind) {
  const netstandard = join(S, 'NetStandard/ref/2.1.0/netstandard.dll')
  const packages = dlls(join(project, 'Library/ScriptAssemblies'), /^(?!Assembly-CSharp)/)
  const runtimePackages = packages.filter(p => !/Editor|CodeGen|Tests|PerformanceTesting/.test(p))
  if (kind === 'player') return { defines: ['UNITY_WEBGL', 'PLATFORM_WEBGL', 'ENABLE_AUDIO'], refs: [netstandard, ...dlls(W, /^UnityEngine/), ...runtimePackages], flags: ['-langversion:9.0'] }
  const engine = [netstandard, join(S, 'Managed/UnityEngine.dll'), ...dlls(join(S, 'Managed/UnityEngine'), /^Unity(Engine|Editor)\./), join(S, 'Managed/UnityEditor.dll')]
  return { defines: ['UNITY_EDITOR', 'UNITY_WEBGL', 'ENABLE_AUDIO'], refs: [...engine, ...packages], flags: ['-langversion:9.0'] }
}

function compile(name, { defines, refs, flags, sources }) {
  const rsp = join(out, name + '.rsp'), dll = join(out, name + '.dll')
  const present = refs.filter(r => existsSync(r)), missing = refs.filter(r => !existsSync(r))
  const lines = ['-nologo', '-nostdlib', '-noconfig', '-target:library', '-deterministic', '-nowarn:0169,0414,0649,0162,0219,0282,1701,1702', `-out:${quote(dll)}`, ...flags, ...(defines.length ? ['-define:' + [...new Set(defines)].join(';')] : []), ...present.map(r => '-r:' + quote(r)), ...sources.map(quote)]
  writeFileSync(rsp, lines.join('\n'))
  const r = spawnSync(dotnet, [csc, '@' + rsp], { encoding: 'utf8', maxBuffer: 64 << 20 })
  const text = (r.stdout + r.stderr).split('\n').filter(l => l.trim() && !/warning CS/.test(l)).map(l => l.replaceAll(project + '/', '')).join('\n')
  const ok = r.status === 0
  results.push({ name, ok, files: sources.length, missingRefs: missing.map(m => relative(project, m)), errors: ok ? [] : text.split('\n').filter(l => /error CS/.test(l)) })
  if (!ok) { console.error(text); console.error(`CSC_FAIL ${name}`); finish(1) }
  return dll
}
function finish(code) {
  rmSync(out, { recursive: true, force: true })
  if (flag('json')) console.log(JSON.stringify({ ok: code === 0, seconds: (Date.now() - started) / 1000, results }))
  process.exit(code)
}

const rsp = responseFiles()
const player = rsp.player ? parseRsp(rsp.player.text) : fallback('player')
const editor = rsp.editor ? parseRsp(rsp.editor.text) : fallback('editor')
const source = rsp.player && rsp.editor ? 'Unity response files' : 'fallback DLL folders'
compile('runtime-player', { ...player, sources: runtimeSources })
console.log(`CSC_OK runtime player (${runtimeSources.length} files, UNITY_WEBGL; ${source})`)
const runtimeEditor = compile('runtime-editor', { ...editor, sources: runtimeSources })
console.log('CSC_OK runtime editor (UNITY_EDITOR)')
if (editorSources.length) {
  const base = rsp.editorAsm ? parseRsp(rsp.editorAsm) : fallback('editor')
  // The editor assembly references the freshly compiled runtime, never Unity's cached Assembly-CSharp.
  const refs = base.refs.filter(r => !/Assembly-CSharp(\.ref)?\.dll$/.test(r)).concat(runtimeEditor)
  compile('editor', { ...base, refs, sources: editorSources })
  console.log(`CSC_OK editor (${editorSources.length} files)`)
}
console.log(`CSC_OK all in ${((Date.now() - started) / 1000).toFixed(1)} s`)
finish(0)
