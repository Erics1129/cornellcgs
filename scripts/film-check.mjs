// The gate the lead runs before deploying the film site, after `node scripts/film-sync.mjs` and the build:
//   node scripts/film-check.mjs [--no-fetch] [--no-dist] [--allow kit/props/stars.json]
// Exit 1 when anything below fails (warnings do not). It never changes the repo, the remote or gh-pages.
//  1. public/film/ is exactly what the last sync wrote (src/film-shell/sync.json), and holds every file it needs:
//     every import of every module resolves (only 'three' and 'three/addons/' are bare, and are vendored), the
//     preload list, the scenes' posters and stills, the films the code names.
//  2. No demo-only file (Build notes, test pages, plan, take.json, .md, the demo host meta), and no reference to
//     localhost or to this Mac's paths (/Users/, cgs-redesign, picker/) in what is served.
//  3. The build (dist/, unless --no-dist): index.html is the film page (assets/main-*.js, the live host meta, the import
//     map before any module, every modulepreload present); every page of src/film-routes.json has its index.html,
//     the game pages are the game shell's, the root files are there.
//  4. git: none of the other builders' files is staged or committed on this branch; public/film/ and
//     src/film-shell/ are committed (fast-deploy pushes HEAD to main: main must carry the film it publishes);
//     origin/main is an ancestor of HEAD (fast-deploy refuses otherwise: if not, how far behind and what a merge
//     would touch; it does not merge).
//  5. Sizes against the budget below, and what gh-pages will weigh after the deploy (it never deletes; GitHub Pages
//     sites must stay under 1 GB).
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FILM = path.join(REPO, 'public/film')
const SHELL = path.join(REPO, 'src/film-shell')
const DIST = path.join(REPO, 'dist')
const GH = '/Users/eric/Claude/.cgs-gh-pages' // fast-deploy.sh's persistent gh-pages clone (read only here)
const argv = process.argv.slice(2)
const flag = (k) => argv.includes(k)

// The budget (bytes). Measured 2026-11-26 on the half-built tree: main-*.js 2.5 kB; first screen 33 modules, 276 kB
// gzipped; the tree 398 files, 51.7 MB; three 173 kB gzipped; game-main 441 kB (was main-*.js 442 kB before the film).
export const BUDGET = {
  mainJs: 8e3,                 // assets/main-*.js: the router and src/film-site.ts only (the old deck must not creep back)
  indexHtmlGz: 40e3,           // dist/index.html gzipped: head, loader and every word of the site
  firstScreenGz: 350e3,        // preload.json's modules, gzipped (the bar: home's first view under 1.5 MB desktop, 2 MB phone, media included)
  firstScreenModules: 60,      // requests for modules before the opening scene
  treeBytes: 80e6,             // public/film/ raw
  treeFiles: 600,              // public/film/ files
  fileBytes: 6e6,              // any one file of public/film/ (CONTRACT.md: a film at most 5 MB)
  sceneFolderBytes: 2.2e6,     // a scene's or a page's own folder (CONTRACT.md: 2 MB, plus a little for the minified code's slack)
  gameMainJs: 470e3,           // assets/game-main-*.js (the mini games' entry; 442 kB before the film site)
  globalJs: 170e3,             // assets/global-*.js (React, shared by the games and the admin; 160 kB before)
  ghPages: 1e9,                // GitHub Pages' published-site limit
}

const results = []
const ok = (m) => results.push(['ok', m])
const warn = (m) => results.push(['warn', m])
const fail = (m) => results.push(['FAIL', m])
const kb = (b) => (b >= 1e6 ? (b / 1e6).toFixed(2) + ' MB' : (b / 1e3).toFixed(1) + ' kB')
const git = (...a) => execFileSync('git', a, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const walk = (dir, out = []) => { if (!fs.existsSync(dir)) return out; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory()) walk(f, out); else out.push(f) } return out }
const relF = (f) => path.relative(FILM, f).split(path.sep).join('/')
const TEXT = /\.(m?js|json|css|html|svg|txt|xml|webmanifest)$/i

// ------------------------------------------------------------------------------------------------ 1. the tree
let sync = null
if (!fs.existsSync(FILM)) fail('public/film/ does not exist: run node scripts/film-sync.mjs')
else {
  try { sync = JSON.parse(fs.readFileSync(path.join(SHELL, 'sync.json'), 'utf8')) } catch { fail('src/film-shell/sync.json is missing: run node scripts/film-sync.mjs') }
  const onDisk = new Map(walk(FILM).map((f) => [relF(f), f]))
  if (sync) {
    const listed = Object.keys(sync.files)
    const missing = listed.filter((r) => !onDisk.has(r))
    const extra = [...onDisk.keys()].filter((r) => !(r in sync.files))
    const changed = listed.filter((r) => onDisk.has(r) && fs.statSync(onDisk.get(r)).size !== sync.files[r][0])
    if (missing.length) fail(`public/film/ lacks ${missing.length} file(s) the sync wrote: ${missing.slice(0, 8).join(', ')}`)
    if (extra.length) fail(`public/film/ has ${extra.length} file(s) the sync did not write: ${extra.slice(0, 8).join(', ')}`)
    if (changed.length) fail(`${changed.length} file(s) of public/film/ changed since the sync: ${changed.slice(0, 8).join(', ')}`)
    if (!missing.length && !extra.length && !changed.length) ok(`public/film/ is exactly the sync of ${sync.at} (${listed.length} files, from ${sync.from})`)
    if (sync.warnings && sync.warnings.length) for (const w of sync.warnings) warn('sync said: ' + w)
  }
  // every import resolves, inside the tree
  const importsOf = (code) => {
    const out = []
    for (const m of code.matchAll(/(?:^|[;\s}])(?:import|export)\s*(?:[\w*${}\s,]*?\bfrom\s*)?(["'])([^"'\n]+)\1/g)) out.push(['static', m[2]])
    for (const m of code.matchAll(/\bimport\s*\(\s*(["'`])([^"'`\n$]+)\1\s*\)/g)) out.push(['dynamic', m[2]])
    return out
  }
  const expected = new Set(((sync && sync.expectedMissing) || []).map((e) => e.spec))
  let mods = 0, edges = 0
  const bad = []
  for (const [r, f] of onDisk) {
    if (!/\.m?js$/.test(r)) continue
    mods++
    for (const [kind, spec] of importsOf(fs.readFileSync(f, 'utf8'))) {
      edges++
      if (spec === 'three') { if (!onDisk.has('vendor/three.module.min.js')) bad.push(`${r}: three (no vendor/three.module.min.js)`); continue }
      if (spec.startsWith('three/addons/')) { if (!onDisk.has('vendor/addons/' + spec.slice(13))) bad.push(`${r}: ${spec} (not vendored)`); continue }
      if (/^https?:\/\//.test(spec)) { bad.push(`${r}: imports ${spec} from the network`); continue }
      if (!/^\.{1,2}\//.test(spec)) { bad.push(`${r}: bare import "${spec}"`); continue }
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(r), spec))
      if (target.startsWith('..')) { bad.push(`${r}: ${spec} leaves the tree`); continue }
      if (onDisk.has(target)) continue
      if (kind === 'dynamic' && expected.has(target)) continue // demo-only, guarded (site/notes.js)
      bad.push(`${r}: ${kind} import ${spec} -> ${target} is missing`)
    }
  }
  if (bad.length) fail(`${bad.length} import(s) do not resolve: ${bad.slice(0, 6).join('; ')}`)
  else ok(`${mods} modules, ${edges} imports: every one resolves inside public/film/ (three from vendor/)`)
  // the preload list, the scenes' posters and stills, the films named
  let preload = null
  try { preload = JSON.parse(fs.readFileSync(path.join(FILM, 'preload.json'), 'utf8')) } catch { fail('public/film/preload.json is missing') }
  if (preload) {
    const gone = [...preload.modules, ...(preload.fetch || [])].filter((u) => !onDisk.has(u.replace(/^\/film\//, '')))
    if (gone.length) fail(`preload.json names ${gone.length} missing file(s): ${gone.join(', ')}`)
    else ok(`preload.json: ${preload.modules.length} modules, ${(preload.fetch || []).length} files and ${(preload.styles || []).length} font sheets, all present`)
    const odd = (preload.styles || []).filter((u) => !/^https:\/\/fonts\.googleapis\.com\/css2\?/.test(u))
    if (odd.length) fail(`preload.json preloads styles from elsewhere than Google Fonts: ${odd.join(', ')}`)
  }
  let scenes = []
  try { scenes = JSON.parse(fs.readFileSync(path.join(SHELL, 'scenes.json'), 'utf8')).scenes } catch { warn('src/film-shell/scenes.json is missing: the scenes\' posters and stills are not checked') }
  const want = []
  for (const s of scenes) {
    want.push(`protos/${s.dir || s.id}/index.js`)
    if (s.poster) want.push(s.poster)
    if (s.stills) want.push(`site/stills/${s.id}/in.jpg`, `site/stills/${s.id}/out.jpg`)
  }
  for (const f of (sync && sync.films) || []) want.push(`films/${f}/`)
  const lacking = want.filter((w) => (w.endsWith('/') ? ![...onDisk.keys()].some((k) => k.startsWith(w)) : !onDisk.has(w)))
  if (lacking.length) fail(`the film needs ${lacking.length} file(s) that are not in public/film/: ${lacking.slice(0, 8).join(', ')}`)
  else if (scenes.length) ok(`${scenes.length} scenes: each has its module, poster${scenes.some((s) => s.stills) ? ' and stills' : ''}; ${((sync && sync.films) || []).length} films present`)
  const noStills = scenes.filter((s) => !s.stills && !s.clock)
  if (noStills.length) warn(`${noStills.length} scene(s) have no stills yet (site/stills/<id>/in.jpg, out.jpg; a fast scroll shows the poster there): ${noStills.map((s) => s.id).join(' ')}`)

  // ---------------------------------------------------------------------------------------------- 2. nothing of the demo or this Mac
  const DEMO = [/^site\/notes\.(js|json)$/, /^site\/chrome\/stub\.js$/, /^site\/chrome\/test\.html$/, /KIT-CHANGES/, /^site\/plan\.json$/, /^site\/scenes\.json$/, /(^|\/)take\.json$/, /\.md$/i, /(^|\/)\./, /\.(blend1?|py|psd|kra|exr)$/i, /^kit\/(shell\.(js|css)|player\.js)$/]
  const demo = [...onDisk.keys()].filter((r) => DEMO.some((re) => re.test(r)))
  if (demo.length) fail(`demo-only or source files in public/film/: ${demo.join(', ')}`)
  else ok('no Build notes, test pages, plan, take.json, .md or sources in public/film/')
  const LOCAL = /localhost|127\.0\.0\.1|\[::1\]|\/Users\/|cgs-redesign|\bpicker\/|cgs-host["']?\s*content=["']?demo/
  const hits = []
  const scanText = (label, text) => { const m = LOCAL.exec(text); if (m) hits.push(`${label}: …${text.slice(Math.max(0, m.index - 50), m.index + 60).replace(/\s+/g, ' ')}…`) }
  for (const [r, f] of onDisk) if (TEXT.test(r)) scanText(r, fs.readFileSync(f, 'utf8'))
  for (const f of ['head.html', 'words.html', 'meta.json', 'static/404.html', 'static/robots.txt', 'static/sitemap.xml']) if (fs.existsSync(path.join(SHELL, f))) scanText('src/film-shell/' + f, fs.readFileSync(path.join(SHELL, f), 'utf8'))
  // --allow a,b: the lead's waiver for named files (a kit fix that cannot land tonight); they are still reported
  const allowArg = argv.indexOf('--allow') >= 0 ? argv[argv.indexOf('--allow') + 1] || '' : ''
  const allowed = new Set(allowArg.split(',').filter(Boolean))
  const waived = hits.filter((h) => allowed.has(h.split(':')[0]))
  const real = hits.filter((h) => !allowed.has(h.split(':')[0]))
  if (real.length) fail(`${real.length} served file(s) name localhost or this Mac's paths: ${real.slice(0, 5).join(' | ')}`)
  else ok('nothing served names localhost, /Users/, cgs-redesign or picker/' + (waived.length ? ` (waived: ${waived.map((h) => h.split(':')[0]).join(', ')})` : ''))
  for (const h of waived) warn('waived with --allow, still published: ' + h)
  const cdn = [...onDisk].filter(([r, f]) => /\.m?js$/.test(r) && /cdn\.jsdelivr\.net/.test(fs.readFileSync(f, 'utf8'))).map(([r]) => r)
  if (cdn.length) warn(`the jsDelivr address appears as text in ${cdn.join(', ')} (not imported: the import map sends three to /film/vendor/)`)
}

// ------------------------------------------------------------------------------------------------ 3. the build
const ROUTES = JSON.parse(fs.readFileSync(path.join(REPO, 'src/film-routes.json'), 'utf8'))
if (flag('--no-dist')) warn('dist/ not checked (--no-dist)')
else if (!fs.existsSync(path.join(DIST, 'index.html'))) fail('dist/index.html does not exist: build first (npm run build && node scripts/stubs.mjs)')
else {
  const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8')
  // exactly as fast-deploy.sh finds it: grep -o 'assets/main-[^"]*\.js' (one match, or its live check never agrees)
  const mains = html.match(/assets\/main-[^"]*\.js/g) || []
  const main = mains.length === 1 && /^assets\/main-[\w-]+\.js$/.test(mains[0]) ? [mains[0]] : null
  if (!main) fail(`dist/index.html must name assets/main-*.js exactly once, as a file (fast-deploy greps for it): found ${JSON.stringify(mains)}`)
  else {
    const size = fs.statSync(path.join(DIST, main[0])).size
    ;(size <= BUDGET.mainJs ? ok : fail)(`${main[0]}: ${kb(size)} (budget ${kb(BUDGET.mainJs)})`)
  }
  for (const part of ['head', 'loader', 'preload', 'body', 'words']) if (!html.includes(`<!--film:${part}-->`)) fail(`dist/index.html has no film ${part} part`)
  if (!/<meta name="cgs-host" content="live"/.test(html)) fail('dist/index.html lacks <meta name="cgs-host" content="live">')
  const im = html.search(/<script type="importmap">/)
  const firstModule = html.search(/<script[^>]*type="module"|<link[^>]*rel="modulepreload"/)
  if (im < 0) fail('dist/index.html has no import map')
  else if (firstModule >= 0 && im > firstModule) fail('the import map comes after a module: three would not resolve')
  else {
    const map = JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(html)[1])
    const target = map.imports && map.imports.three
    if (target !== '/film/vendor/three.module.min.js') fail(`the import map sends three to ${target}`)
    else ok('dist/index.html is the film page: live host, import map first (three -> /film/vendor/), the main entry')
  }
  const pre = [...html.matchAll(/<link rel="(?:modulepreload|preload)"(?: as="fetch" crossorigin)? href="(\/film\/[^"]+)"/g)].map((m) => m[1])
  const gone = pre.filter((u) => !fs.existsSync(path.join(DIST, u)))
  if (gone.length) fail(`dist/index.html preloads ${gone.length} file(s) dist/ does not have: ${gone.slice(0, 5).join(', ')}`)
  else ok(`dist/index.html preloads ${pre.length} files of the film, all in dist/film/`)
  const gz = zlib.gzipSync(html, { level: 9 }).length
  ;(gz <= BUDGET.indexHtmlGz ? ok : fail)(`dist/index.html: ${kb(html.length)} raw, ${kb(gz)} gzipped (budget ${kb(BUDGET.indexHtmlGz)})`)
  // every page
  const need = [...Object.values(ROUTES.games).map((s) => [s, 'game']), ...ROUTES.film.map((p) => [p.path, 'film'])]
  const missing = [], wrong = []
  for (const [slug, kind] of need) {
    const f = path.join(DIST, slug, 'index.html')
    if (!fs.existsSync(f)) { missing.push('/' + slug + '/'); continue }
    const s = fs.readFileSync(f, 'utf8')
    const isFilm = s.includes('<!--film:body-->')
    if ((kind === 'film') !== isFilm || (kind === 'game' && !/assets\/game-main-[^"]*\.js/.test(s))) wrong.push(`/${slug}/ is not the ${kind} page`)
  }
  if (missing.length) fail(`pages missing from dist/ (run node scripts/stubs.mjs): ${missing.join(' ')}`)
  if (wrong.length) fail(wrong.join('; '))
  if (!missing.length && !wrong.length) ok(`${need.length} pages: the mini games from the game shell, ${ROUTES.film.length} film addresses from the film page`)
  for (const f of ['404.html', 'robots.txt', 'sitemap.xml', 'CNAME', 'admin/index.html']) if (!fs.existsSync(path.join(DIST, f))) fail(`dist/${f} is missing`)
  for (const [f, re] of [['dist/assets game-main', /^game-main-.*\.js$/], ['dist/assets global', /^global-.*\.js$/]]) {
    const hit = fs.readdirSync(path.join(DIST, 'assets')).find((x) => re.test(x))
    if (!hit) { fail(`${f}-*.js is missing`); continue }
    const size = fs.statSync(path.join(DIST, 'assets', hit)).size
    const cap = f.endsWith('game-main') ? BUDGET.gameMainJs : BUDGET.globalJs
    ;(size <= cap ? ok : fail)(`assets/${hit}: ${kb(size)} (budget ${kb(cap)})`)
  }
}

// ------------------------------------------------------------------------------------------------ 4. git
const STRICT = ['src/minigames/progress/', 'docs/PLAYER-ACCOUNTS.md', 'backend/forge/upgrade-accounts.sql', 'scripts/progress-dev', 'scripts/test-progress']
const WIP = ['.claude/launch.json', 'package.json', 'package-lock.json', 'src/minigames/MinigameShell.tsx', 'src/minigames/forge/storage.ts', 'backend/forge/', 'docs/forge/']
const under = (f, list) => list.some((p) => (p.endsWith('/') ? f.startsWith(p) : f === p || f.startsWith(p)))
try {
  const staged = git('diff', '--cached', '--name-only').split('\n').filter(Boolean)
  const badStaged = staged.filter((f) => under(f, [...STRICT, ...WIP]))
  if (badStaged.length) fail(`other builders' files are staged: ${badStaged.join(', ')} (unstage them: git restore --staged <file>)`)
  else ok(`nothing of the other builders' work is staged${staged.length ? ` (${staged.length} file(s) staged)` : ''}`)
  const dirty = git('status', '--porcelain', '--', 'public/film', 'src/film-shell').split('\n').filter(Boolean)
  const tracked = git('ls-files', '--', 'public/film').split('\n').filter(Boolean).length
  if (dirty.length || !tracked) fail(`public/film/ and src/film-shell/ must be committed before deploying (fast-deploy pushes HEAD to main): ${tracked ? dirty.length + ' path(s) not committed' : 'not in git at all'}; git add public/film src/film-shell && git commit`)
  else ok(`public/film/ is committed (${tracked} files) and clean`)
  if (!flag('--no-fetch')) {
    // as fast-deploy.sh does: this Mac's default git has no https helper, the Command Line Tools' one does
    const CLT = '/Library/Developer/CommandLineTools/usr/libexec/git-core'
    const env = fs.existsSync(CLT) ? { ...process.env, GIT_EXEC_PATH: CLT } : process.env
    try { execFileSync('git', ['fetch', '-q', 'origin', 'main'], { cwd: REPO, stdio: 'ignore', timeout: 60000, env }) }
    catch { warn('git fetch origin main failed (offline?): compared with the last fetched origin/main') }
  }
  const mainSha = git('rev-parse', '--short', 'origin/main')
  let ancestor = true
  try { execFileSync('git', ['merge-base', '--is-ancestor', 'origin/main', 'HEAD'], { cwd: REPO, stdio: 'ignore' }) } catch { ancestor = false }
  const ahead = +git('rev-list', '--count', 'origin/main..HEAD')
  if (ancestor) ok(`origin/main (${mainSha}) is an ancestor of HEAD; HEAD is ${ahead} commit(s) ahead`)
  else {
    const behind = +git('rev-list', '--count', 'HEAD..origin/main')
    const theirs = git('diff', '--name-only', 'HEAD...origin/main').split('\n').filter(Boolean)
    const ours = new Set(git('diff', '--name-only', 'origin/main...HEAD').split('\n').filter(Boolean))
    const both = theirs.filter((f) => ours.has(f))
    fail(`origin/main (${mainSha}) is not an ancestor of HEAD: ${behind} commit(s) behind, ${ahead} ahead. A merge would bring in ${theirs.length} file(s) (${theirs.slice(0, 10).join(', ')}${theirs.length > 10 ? ', ...' : ''}); changed on both sides: ${both.length ? both.join(', ') : 'none'}. Merge origin/main into this branch (it is not done here), then build and check again.`)
  }
  const branchFiles = git('diff', '--name-only', 'origin/main...HEAD').split('\n').filter(Boolean)
  const strictHit = branchFiles.filter((f) => under(f, STRICT))
  const wipHit = branchFiles.filter((f) => under(f, WIP))
  if (strictHit.length) fail(`this branch's commits touch files that are not ours: ${strictHit.join(', ')}`)
  if (wipHit.length) warn(`this branch's commits change ${wipHit.join(', ')}: make sure that is meant (other builders have work in progress there)`)
} catch (e) { fail('git: ' + String(e.message).split('\n')[0]) }

// ------------------------------------------------------------------------------------------------ 5. sizes
if (fs.existsSync(FILM)) {
  const files = walk(FILM)
  const total = files.reduce((n, f) => n + fs.statSync(f).size, 0)
  ;(files.length <= BUDGET.treeFiles && total <= BUDGET.treeBytes ? ok : fail)(`public/film/: ${files.length} files, ${kb(total)} (budget ${BUDGET.treeFiles} files, ${kb(BUDGET.treeBytes)})`)
  const big = files.filter((f) => fs.statSync(f).size > BUDGET.fileBytes).map((f) => `${relF(f)} ${kb(fs.statSync(f).size)}`)
  if (big.length) fail(`file(s) over ${kb(BUDGET.fileBytes)}: ${big.join(', ')}`)
  const folders = new Map()
  for (const f of files) { const m = relF(f).match(/^protos\/[^/]+/); if (m) folders.set(m[0], (folders.get(m[0]) || 0) + fs.statSync(f).size) }
  const fat = [...folders].filter(([, b]) => b > BUDGET.sceneFolderBytes).map(([d, b]) => `${d} ${kb(b)}`)
  if (fat.length) fail(`scene folder(s) over ${kb(BUDGET.sceneFolderBytes)}: ${fat.join(', ')}`)
  else ok(`every scene and page folder is under ${kb(BUDGET.sceneFolderBytes)} (largest: ${[...folders].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([d, b]) => `${d} ${kb(b)}`).join(', ')})`)
  try {
    const p = JSON.parse(fs.readFileSync(path.join(FILM, 'preload.json'), 'utf8'))
    ;(p.gzip <= BUDGET.firstScreenGz && p.modules.length <= BUDGET.firstScreenModules ? ok : fail)(`first screen: ${p.modules.length} modules, ${kb(p.gzip)} gzipped (budget ${BUDGET.firstScreenModules}, ${kb(BUDGET.firstScreenGz)})`)
  } catch { /* said above */ }
}
// what gh-pages will weigh: it keeps everything ever published, dist/ is laid over it
if (fs.existsSync(path.join(GH, '.git')) && fs.existsSync(DIST)) {
  const ghFiles = new Map()
  for (const f of walk(GH)) { const r = path.relative(GH, f); if (!r.startsWith('.git' + path.sep) && r !== '.git') ghFiles.set(r, fs.statSync(f).size) }
  const now = [...ghFiles.values()].reduce((a, b) => a + b, 0)
  let after = now, added = 0
  for (const f of walk(DIST)) { const r = path.relative(DIST, f); const s = fs.statSync(f).size; const was = ghFiles.get(r); if (was == null) { after += s; added += s } else after += s - was }
  ;(after <= BUDGET.ghPages ? (after > 0.9 * BUDGET.ghPages ? warn : ok) : fail)(`gh-pages: ${kb(now)} published now (the local clone), about ${kb(after)} after this deploy (${kb(added)} new); GitHub Pages' limit is ${kb(BUDGET.ghPages)}${after > 0.85 * BUDGET.ghPages ? ': prune old hashed bundles from gh-pages soon (deploys never delete)' : ''}`)
} else warn(`gh-pages not measured (${GH} or dist/ missing)`)

// ------------------------------------------------------------------------------------------------ report
const n = { ok: 0, warn: 0, FAIL: 0 }
for (const [k, m] of results) { n[k]++; console.log(`${k === 'ok' ? '  ok  ' : k === 'warn' ? '  warn' : '  FAIL'}  ${m}`) }
console.log(n.FAIL ? `film-check: ${n.FAIL} failure(s), ${n.warn} warning(s): do not deploy yet` : `film-check: ready to deploy (${n.ok} checks, ${n.warn} warning(s))`)
process.exit(n.FAIL ? 1 : 0)
