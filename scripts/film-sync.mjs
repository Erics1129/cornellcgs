// Copy the film site from the redesign's tree (picker/) into this repo, so that a build ships it (SITE.md, "The real
// repo"). Run it, then build, then node scripts/film-check.mjs.
//
//   node scripts/film-sync.mjs [--from /abs/picker] [--no-minify] [--quiet]
//
// What it writes (and nothing else):
//   public/film/                 the tree, served at /film/: site/** (no Build notes, no test pages, no .html: the page
//                                itself becomes index.html), kit/** (no .md), the scenes of site/scenes.json (or
//                                site/plan.json) and the pages pg-*, every prototype they import, the films they name;
//                                never take.json, .md, sources or captures. Each .js is minified ON ITS OWN with
//                                esbuild's transform (imports, exports and relative paths unchanged, so the module graph
//                                is the same graph), .json is compacted, .css minified.
//   public/film/vendor/          three.js 0.170.0 (three.module.min.js and the examples/jsm files the tree imports, with
//                                their own imports), so the live site needs no CDN. The package is fetched once with
//                                `npm pack` into .film-cache/ (gitignored) and checked against its npm integrity.
//   public/film/preload.json     the modules the first screen needs, in order (index.html's modulepreload links)
//   src/film-shell/              the page's parts, read by scripts/vite-film-shell.mjs at build time and by
//                                scripts/stubs.mjs: site.html, head.html, words.html, meta.json, scenes.json, and
//                                sync.json (every file synced, with its size: film-check compares)
// Then it reports the files and bytes, raw and gzipped, per folder.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { transform } from 'esbuild'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null }
const flag = (k) => argv.includes(k)
const PICKER = path.resolve(opt('--from') || '/Users/eric/Claude/cgs-redesign/picker')
const OUT = path.join(REPO, 'public/film')
const SHELL = path.join(REPO, 'src/film-shell')
const MINIFY = !flag('--no-minify')
const QUIET = flag('--quiet')
const THREE = { version: '0.170.0', integrity: 'sha512-FQK+LEpYc0fBD+J8g6oSEyyNzjp+Q7Ks1C568WWaoMRLW+TkNNWmenWeGgJjV105Gd+p/2ql1ZcjYvNiPZBhuQ==' }
const CACHE = path.join(REPO, '.film-cache')

const rel = (f) => path.relative(PICKER, f).split(path.sep).join('/')
const die = (msg) => { console.error('film-sync: ' + msg); process.exit(1) }
const warnings = []
const warn = (m) => { warnings.push(m); if (!QUIET) console.warn('  ! ' + m) }

if (!fs.existsSync(path.join(PICKER, 'site.html'))) die(`no site.html in ${PICKER} (give the tree with --from)`)

// ---------------------------------------------------------------------------------------------------------- rules
// Served file types (as dev/publist3.mjs): anything else (.blend, .py, .md, FINAL, raw captures) never leaves picker/.
const OK = new Set(['.html', '.css', '.js', '.mjs', '.json', '.txt', '.csv', '.xml', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.svg', '.ico', '.mp4', '.webm', '.mp3', '.ogg', '.wav', '.m4a', '.woff', '.woff2', '.ttf', '.otf', '.wasm', '.pdf', '.bin', '.ktx2', '.glb', '.gltf', '.hdr', '.exr', '.webmanifest'])
const SKIP_DIRS = new Set(['raw', 'bak', 'node_modules', 'src', 'shots', 'captures', 'capture', 'frames'])
// kit/worlds/*/shots/ are camera files the worlds import (dev/publist3.mjs): never skip that folder by its name there
const keepDir = (abs) => /\/kit\/worlds\/[^/]+\/shots$/.test(abs.split(path.sep).join('/'))
// Files that exist only for the demo or the dev tools. Imports of them are expected to be dynamic and guarded
// (site/main.js loads notes.js only when hostInfo().notes, which is false on the live host).
// (site/words.html and site/meta.json are served: the phone sheet fetches the words, the router reads the titles.)
const DEMO_ONLY = [/^site\/notes\.(js|json)$/, /^site\/chrome\/stub\.js$/, /^site\/chrome\/test\.html$/, /^site\/chrome\/KIT-CHANGES/, /^site\/plan\.json$/, /^site\/scenes\.json$/, /(^|\/)take\.json$/, /\.md$/i, /(^|\/)\./]
const demoOnly = (r) => DEMO_ONLY.some((re) => re.test(r))
// The page's parts, copied to src/film-shell/ for the build (vite-film-shell.mjs) and the stubs. Those marked false
// are not served from public/film/ (the head is in index.html; site/static/ goes to the site's root: 404.html,
// robots.txt, sitemap.xml, written into dist/ by scripts/stubs.mjs).
const SHELL_FILES = { 'site.html': ['site.html', false], 'site/head.html': ['head.html', false], 'site/words.html': ['words.html', true], 'site/meta.json': ['meta.json', true], 'site/scenes.json': ['scenes.json', false] }
for (const f of fs.existsSync(path.join(PICKER, 'site/static')) ? fs.readdirSync(path.join(PICKER, 'site/static')) : []) if (/^(404\.html|robots\.txt|sitemap\.xml)$/.test(f)) SHELL_FILES['site/static/' + f] = ['static/' + f, false]
const shellOnly = (r) => r.startsWith('site/static/') || (SHELL_FILES[r] && !SHELL_FILES[r][1])

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue
    const f = path.join(dir, e.name)
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) || keepDir(f)) walk(f, out) }
    else if (OK.has(path.extname(e.name).toLowerCase())) out.push(f)
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------- what
let sceneRows = null
try { sceneRows = JSON.parse(fs.readFileSync(path.join(PICKER, 'site/scenes.json'), 'utf8')).scenes } catch {}
let sceneIds
if (Array.isArray(sceneRows) && sceneRows.length) sceneIds = sceneRows.map((s) => s.dir || s.id)
else {
  warn('site/scenes.json is missing (dev/sitelist.mjs writes it): the scenes come from site/plan.json')
  const plan = JSON.parse(fs.readFileSync(path.join(PICKER, 'site/plan.json'), 'utf8'))
  const hold = new Set(plan.hold || [])
  sceneIds = plan.slots.map((s) => (s.use || []).find((id) => !hold.has(id) && fs.existsSync(path.join(PICKER, 'protos', id, 'index.js')))).filter(Boolean)
  sceneRows = null
}
const pageIds = fs.readdirSync(path.join(PICKER, 'protos')).filter((d) => /^pg-[a-z0-9-]+$/.test(d) && fs.existsSync(path.join(PICKER, 'protos', d, 'index.js')))
for (const id of sceneIds) if (!fs.existsSync(path.join(PICKER, 'protos', id, 'index.js'))) die(`scene ${id} has no protos/${id}/index.js`)

const files = new Set()             // absolute source paths to serve
const protos = new Set()            // prototype folders included
const films = new Set()             // film folders included
const addFolder = (kind, id) => {
  const set = kind === 'protos' ? protos : films
  if (set.has(id)) return false
  set.add(id)
  for (const f of walk(path.join(PICKER, kind, id))) files.add(f)
  return true
}
for (const f of walk(path.join(PICKER, 'site'))) files.add(f)
for (const f of walk(path.join(PICKER, 'kit'))) files.add(f)
for (const id of [...sceneIds, ...pageIds]) addFolder('protos', id)

// ---------------------------------------------------------------------------------------------------------- minify
// Each file on its own: the output has the same imports and exports as the input. Comments go (so does the text of
// the film wrapper's examples), identifiers are shortened inside each module only.
const built = new Map() // abs -> Buffer (what is written)
async function prepare(abs) {
  if (built.has(abs)) return built.get(abs)
  const ext = path.extname(abs).toLowerCase()
  let buf = fs.readFileSync(abs)
  if (MINIFY && (ext === '.js' || ext === '.mjs')) {
    try { buf = Buffer.from((await transform(buf.toString('utf8'), { loader: 'js', format: 'esm', minify: true, legalComments: 'none', charset: 'utf8', sourcefile: rel(abs) })).code) }
    catch (e) { warn(`${rel(abs)} could not be minified, copied as it is: ${String(e.message).split('\n')[0]}`) }
  } else if (MINIFY && ext === '.css') {
    try { buf = Buffer.from((await transform(buf.toString('utf8'), { loader: 'css', minify: true, legalComments: 'none', charset: 'utf8', sourcefile: rel(abs) })).code) }
    catch (e) { warn(`${rel(abs)} could not be minified, copied as it is: ${String(e.message).split('\n')[0]}`) }
  } else if (MINIFY && (ext === '.json' || ext === '.webmanifest')) {
    try { buf = Buffer.from(JSON.stringify(JSON.parse(buf.toString('utf8')))) } catch { /* not plain JSON: as it is */ }
  }
  built.set(abs, buf)
  return buf
}

/** The imports of a module's (minified) text: { stat: [spec], dyn: [spec], urls: [spec] } */
function importsOf(code) {
  const stat = [], dyn = [], urls = []
  for (const m of code.matchAll(/(?:^|[;\s}])(?:import|export)\s*(?:[\w*${}\s,]*?\bfrom\s*)?(["'])([^"'\n]+)\1/g)) stat.push(m[2])
  for (const m of code.matchAll(/\bimport\s*\(\s*(["'`])([^"'`\n$]+)\1\s*\)/g)) dyn.push(m[2])
  for (const m of code.matchAll(/new\s+URL\(\s*(["'`])([^"'`\n$]+)\1\s*,\s*import\.meta\.url\s*\)/g)) urls.push(m[2])
  return { stat: [...new Set(stat)], dyn: [...new Set(dyn)], urls: [...new Set(urls)] }
}

const graph = new Map()      // rel -> { stat: [rel or 'three' or 'three/addons/...'], dyn: [...] }
const externals = new Set()  // 'three', 'three/addons/...'
const broken = []            // { from, spec, why }
const expected = []          // imports of demo-only files (dynamic, guarded)
const remote = []            // http(s) imports
const queue = [...files].filter((f) => /\.(m?js)$/.test(f))
const seen = new Set()
const enqueueFolder = (kind, id) => { if (addFolder(kind, id)) for (const f of walk(path.join(PICKER, kind, id))) if (/\.(m?js)$/.test(f)) queue.push(f) }
async function traverse() {
  while (queue.length) {
    const abs = queue.shift()
    if (seen.has(abs)) continue
    seen.add(abs)
    const code = (await prepare(abs)).toString('utf8')
    const { stat, dyn, urls } = importsOf(code)
    const node = { stat: [], dyn: [] }
    graph.set(rel(abs), node)
    const take = (spec, kind) => {
      if (/^https?:\/\//.test(spec)) { remote.push({ from: rel(abs), spec }); return }
      if (spec === 'three' || spec.startsWith('three/addons/')) { externals.add(spec); node[kind].push(spec); return }
      if (!/^\.{1,2}\//.test(spec)) { broken.push({ from: rel(abs), spec, why: 'a bare import the import map does not know' }); return }
      const target = path.resolve(path.dirname(abs), spec)
      const r = rel(target)
      if (r.startsWith('..')) { broken.push({ from: rel(abs), spec, why: 'outside the tree' }); return }
      const parts = r.split('/')
      if ((parts[0] === 'protos' || parts[0] === 'films') && parts[1] && fs.existsSync(path.join(PICKER, parts[0], parts[1]))) enqueueFolder(parts[0], parts[1])
      if (demoOnly(r)) {
        if (kind === 'stat') broken.push({ from: rel(abs), spec, why: 'a static import of a demo-only file' })
        else expected.push({ from: rel(abs), spec: r })
        return
      }
      if (!fs.existsSync(target)) { broken.push({ from: rel(abs), spec, why: 'no such file' }); return }
      if (fs.statSync(target).isDirectory()) { if (kind !== 'url') broken.push({ from: rel(abs), spec, why: 'a folder' }); return } // new URL('../', import.meta.url): a base
      files.add(target)
      if (/\.(m?js)$/.test(target)) queue.push(target)
      if (kind !== 'url') node[kind].push(r)
    }
    for (const sp of stat) take(sp, 'stat')
    for (const sp of dyn) take(sp, 'dyn')
    for (const sp of urls) take(sp, 'url')
    // a prototype may reach another prototype's files by a path in a string (env.asset('../x-a/poster.jpg'))
    if (rel(abs).startsWith('protos/')) for (const m of code.matchAll(/["'`]\.\.\/([a-z0-9_-]+)\//gi)) if (fs.existsSync(path.join(PICKER, 'protos', m[1], 'index.js'))) enqueueFolder('protos', m[1])
  }
}
// the films named by the code and data (env.asset('../../films/up/film.mp4'), { film: 'up' }); comments are gone
async function filmScan() {
  for (const abs of [...files]) {
    if (!/\.(m?js|json)$/.test(abs) || demoOnly(rel(abs))) continue
    const s = (await prepare(abs)).toString('utf8')
    for (const m of s.matchAll(/films\/([a-z0-9_-]+)\//gi)) if (fs.existsSync(path.join(PICKER, 'films', m[1]))) enqueueFolder('films', m[1])
    for (const m of s.matchAll(/\bfilm:\s*["']([a-z0-9_-]+)["']/gi)) if (fs.existsSync(path.join(PICKER, 'films', m[1]))) enqueueFolder('films', m[1])
  }
}
for (let pass = 0; pass < 6; pass++) {
  await traverse()
  const n = files.size
  await filmScan()
  if (!queue.length && files.size === n) break
}

if (broken.length) {
  for (const b of broken) console.error(`  x ${b.from}: import "${b.spec}" (${b.why})`)
  if (!flag('--allow-broken')) die(`${broken.length} import(s) of the tree do not resolve: they would fail on the live site (fix them in picker/, or --allow-broken to sync anyway)`)
}
for (const r of remote) warn(`${r.from} imports ${r.spec} from the network`)

// ---------------------------------------------------------------------------------------------------------- three
function threePackage() {
  const nm = path.join(REPO, 'node_modules/three')
  try { if (JSON.parse(fs.readFileSync(path.join(nm, 'package.json'), 'utf8')).version === THREE.version) return nm } catch {}
  const dir = path.join(CACHE, `three@${THREE.version}`, 'package')
  if (fs.existsSync(path.join(dir, 'build/three.module.min.js'))) return dir
  fs.mkdirSync(path.join(CACHE, `three@${THREE.version}`), { recursive: true })
  const tgz = path.join(CACHE, `three-${THREE.version}.tgz`)
  if (!fs.existsSync(tgz)) {
    console.log(`fetching three@${THREE.version} from the npm registry (npm pack) into ${path.relative(REPO, CACHE)}/`)
    execFileSync('npm', ['pack', `three@${THREE.version}`, '--silent', '--pack-destination', CACHE], { cwd: CACHE, stdio: ['ignore', 'pipe', 'inherit'] })
  }
  const sum = 'sha512-' + crypto.createHash('sha512').update(fs.readFileSync(tgz)).digest('base64')
  if (sum !== THREE.integrity) die(`${tgz} does not match three@${THREE.version}'s npm integrity (delete it and run again)`)
  execFileSync('tar', ['-xzf', tgz, '-C', path.join(CACHE, `three@${THREE.version}`)])
  return dir
}
const threeDir = threePackage()
const threeVersion = JSON.parse(fs.readFileSync(path.join(threeDir, 'package.json'), 'utf8')).version
if (threeVersion !== THREE.version) die(`three is ${threeVersion}, the tree is written for ${THREE.version}`)
const vendor = new Map() // served rel path (vendor/...) -> Buffer
vendor.set('vendor/three.module.min.js', fs.readFileSync(path.join(threeDir, 'build/three.module.min.js')))
vendor.set('vendor/LICENSE', fs.readFileSync(path.join(threeDir, 'LICENSE')))
const addonGraph = new Map() // 'vendor/addons/x.js' -> [deps as vendor paths or 'three']
async function addAddon(sub) {
  const key = 'vendor/addons/' + sub
  if (vendor.has(key)) return
  const src = path.join(threeDir, 'examples/jsm', sub)
  if (!fs.existsSync(src)) die(`three/addons/${sub} is not in three@${THREE.version}`)
  let code = fs.readFileSync(src, 'utf8')
  const deps = []
  for (const s of importsOf(code).stat) {
    if (s === 'three') { deps.push('three'); continue }
    if (/^\.{1,2}\//.test(s)) { const d = path.posix.normalize(path.posix.join(path.posix.dirname(sub), s)); deps.push('vendor/addons/' + d); await addAddon(d) }
    else die(`three/addons/${sub} imports "${s}"`)
  }
  if (MINIFY) code = (await transform(code, { loader: 'js', format: 'esm', minify: true, legalComments: 'none', charset: 'utf8' })).code
  vendor.set(key, Buffer.from(code))
  addonGraph.set(key, deps)
}
for (const spec of [...externals].sort()) if (spec.startsWith('three/addons/')) await addAddon(spec.slice('three/addons/'.length))

// ---------------------------------------------------------------------------------------------------------- write
// Safety: only ever replace public/film/ and src/film-shell/ of this repo.
for (const d of [OUT, SHELL]) if (!d.startsWith(REPO + path.sep) || !/(public\/film|src\/film-shell)$/.test(d)) die('refusing to write ' + d)
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })
const rows = [] // { as, bytes, gz, folder }
const TEXT = new Set(['.js', '.mjs', '.json', '.css', '.html', '.svg', '.txt', '.xml', '.csv', '.webmanifest'])
const folderOf = (as) => { const p = as.split('/'); return p[0] === 'protos' || p[0] === 'films' ? p.slice(0, 2).join('/') : p[0] === 'kit' && p[1] === 'worlds' && p[2] && p.length > 3 ? p.slice(0, 3).join('/') : p.length > 2 ? p.slice(0, 2).join('/') : p[0] }
const write = (as, buf) => {
  const dst = path.join(OUT, as)
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  fs.writeFileSync(dst, buf)
  const gz = TEXT.has(path.extname(as).toLowerCase()) ? zlib.gzipSync(buf, { level: 9 }).length : buf.length
  rows.push({ as, bytes: buf.length, gz, folder: folderOf(as), sha1: crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12) })
}
for (const abs of [...files].sort()) {
  const r = rel(abs)
  if (shellOnly(r) || demoOnly(r)) continue
  write(r, await prepare(abs))
}
for (const [as, buf] of vendor) write(as, buf)

// ---------------------------------------------------------------------------------------------------------- preload
// The first screen: site/main.js and everything it imports statically, then the opening scenes (the loader, and the
// first scene that plays after it, which the player mounts ahead), each with its static imports; three resolved to
// the vendored files. Breadth first from main.js, three right after main.js (the biggest file: it should start early).
const sceneList = sceneRows || sceneIds.map((id, k) => ({ k, id, dir: id }))
const firstScenes = []
for (const s of sceneList) { firstScenes.push(s.dir || s.id); if (!(s.clock || s.kind === 'clock')) break }
const depsOf = (node) => {
  if (node === 'three') return []
  if (node.startsWith('three/addons/')) return (addonGraph.get('vendor/addons/' + node.slice(13)) || []).map((d) => (d === 'three' ? d : 'three/addons/' + d.slice(14)))
  return (graph.get(node) || {}).stat || []
}
const servedAs = (node) => (node === 'three' ? 'vendor/three.module.min.js' : node.startsWith('three/addons/') ? 'vendor/addons/' + node.slice(13) : node)
const nodes = []
for (const start of [graph.has('site/main.js') ? 'site/main.js' : null, ...firstScenes.map((id) => `protos/${id}/index.js`)]) {
  if (!start) { warn('site/main.js does not exist yet: preload.json lists only the opening scenes'); continue }
  const q = [start]
  while (q.length) { const n = q.shift(); if (nodes.includes(n)) continue; nodes.push(n); q.push(...depsOf(n)) }
}
// three is the biggest file of the first screen: ask for it right after the entry
if (nodes.includes('three')) { nodes.splice(nodes.indexOf('three'), 1); nodes.splice(1, 0, 'three') }
const order = nodes.map(servedAs)
const bytesOf = (as) => rows.find((x) => x.as === as) || { bytes: 0, gz: 0 }
const preload = {
  note: 'The modules the first screen needs, in fetch order: site/main.js with its static imports, then the opening scenes (' + firstScenes.join(', ') + ') with theirs; written by scripts/film-sync.mjs, read by scripts/vite-film-shell.mjs (modulepreload links in index.html).',
  scenes: firstScenes,
  modules: order.map((as) => '/film/' + as),
  bytes: order.reduce((n, as) => n + bytesOf(as).bytes, 0),
  gzip: order.reduce((n, as) => n + bytesOf(as).gz, 0),
}
write('preload.json', Buffer.from(JSON.stringify(preload, null, 1)))

// ---------------------------------------------------------------------------------------------------------- shell
fs.rmSync(SHELL, { recursive: true, force: true })
fs.mkdirSync(SHELL, { recursive: true })
const shellHave = []
for (const [from, [to]] of Object.entries(SHELL_FILES)) {
  const src = path.join(PICKER, from)
  if (fs.existsSync(src)) { fs.mkdirSync(path.dirname(path.join(SHELL, to)), { recursive: true }); fs.copyFileSync(src, path.join(SHELL, to)); shellHave.push(to) }
}
for (const need of ['head.html', 'words.html', 'meta.json']) if (!shellHave.includes(need)) warn(`site/${need} does not exist yet (the words builder writes it): the build says so and uses a fallback`)
fs.writeFileSync(path.join(SHELL, 'README.md'), `# src/film-shell (generated)

Written by \`node scripts/film-sync.mjs\` from ${PICKER}: do not edit here, edit the redesign and sync again.
\`scripts/vite-film-shell.mjs\` makes index.html from these at build time; \`scripts/stubs.mjs\` reads meta.json and
scenes.json for the pages it writes; \`scripts/film-check.mjs\` compares public/film/ with sync.json.
`)
const sync = {
  at: new Date().toISOString(),
  from: PICKER,
  minified: MINIFY,
  three: THREE.version,
  scenes: sceneIds,
  pages: pageIds,
  protos: [...protos].sort(),
  films: [...films].sort(),
  externals: [...externals].sort(),
  expectedMissing: expected,
  shell: shellHave,
  warnings,
  files: Object.fromEntries(rows.map((r) => [r.as, [r.bytes, r.sha1]])),
}
fs.writeFileSync(path.join(SHELL, 'sync.json'), JSON.stringify(sync, null, 1))

// ---------------------------------------------------------------------------------------------------------- report
const kb = (b) => (b >= 1e6 ? (b / 1e6).toFixed(2) + ' MB' : (b / 1e3).toFixed(1) + ' kB')
const by = new Map()
for (const r of rows) { const e = by.get(r.folder) || { n: 0, bytes: 0, gz: 0 }; e.n++; e.bytes += r.bytes; e.gz += r.gz; by.set(r.folder, e) }
const total = rows.reduce((a, r) => ({ n: a.n + 1, bytes: a.bytes + r.bytes, gz: a.gz + r.gz }), { n: 0, bytes: 0, gz: 0 })
const srcBytes = [...files].filter((f) => !shellOnly(rel(f)) && !demoOnly(rel(f))).reduce((n, f) => n + fs.statSync(f).size, 0)
console.log(`film-sync: ${total.n} files in public/film/, ${kb(total.bytes)} raw (${kb(srcBytes)} before minifying the tree, plus vendor), ${kb(total.gz)} over the wire (text gzipped, media as is)`)
console.log(`  scenes ${sceneIds.length}, pages ${pageIds.length}, prototypes ${protos.size} (${[...protos].filter((p) => !sceneIds.includes(p) && !pageIds.includes(p)).join(' ') || 'no others'}), films ${films.size} (${[...films].sort().join(' ')}), three ${THREE.version} + ${[...externals].filter((e) => e !== 'three').length} addons`)
console.log(`  first screen (preload.json): ${order.length} modules, ${kb(preload.bytes)} raw, ${kb(preload.gzip)} gzipped (${firstScenes.join(', ')})`)
if (!QUIET) {
  const pad = (s, n) => String(s).padEnd(n)
  const lpad = (s, n) => String(s).padStart(n)
  console.log('  ' + pad('folder', 30) + lpad('files', 6) + lpad('raw', 11) + lpad('wire', 11))
  for (const [f, e] of [...by].sort((a, b) => b[1].bytes - a[1].bytes)) console.log('  ' + pad(f, 30) + lpad(e.n, 6) + lpad(kb(e.bytes), 11) + lpad(kb(e.gz), 11))
}
if (expected.length) console.log(`  demo-only imports left out (dynamic, not used on the live host): ${[...new Set(expected.map((e) => e.spec))].join(', ')}`)
console.log(`  page parts in src/film-shell/: ${shellHave.join(', ')}${warnings.length ? `; ${warnings.length} warning(s)` : ''}`)
