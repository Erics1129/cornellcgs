// Cache busting for the film site (2026-11-27). The host's edge and browsers keep /film/*.js for hours, so after a
// deploy visitors got old modules, or old and new mixed. Every module is now asked for as file.js?v=<build>: an
// import map entry per module (import maps rewrite the resolved address of every import), the modulepreload links,
// and window.__filmV for the entry module (src/film-site.ts). Run after the build: node scripts/film-bust.mjs
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createHash } from 'node:crypto'
const dist = new URL('../dist/', import.meta.url).pathname
const film = join(dist, 'film')
if (!existsSync(film)) { console.log('film-bust: no dist/film'); process.exit(0) }
const walk = (d, out = []) => { for (const e of readdirSync(d, { withFileTypes: true })) { const f = join(d, e.name); if (e.isDirectory()) walk(f, out); else if (/\.(js|mjs)$/.test(e.name)) out.push(f) } return out }
const files = walk(film).sort()
const h = createHash('sha1'); for (const f of files) h.update(f).update(readFileSync(f))
const V = h.digest('hex').slice(0, 10)
const extra = {}
for (const f of files) { const u = '/' + relative(dist, f).split('\\').join('/'); extra[u] = u + '?v=' + V }
const pages = []
const htmls = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const f = join(d, e.name); if (e.isDirectory()) { if (e.name !== 'film' && e.name !== 'assets' && e.name !== 'unity') htmls(f) } else if (e.name.endsWith('.html')) pages.push(f) } }
htmls(dist)
let n = 0
for (const p of pages) {
  let s = readFileSync(p, 'utf8')
  const m = s.match(/<script type="importmap">([\s\S]*?)<\/script>/)
  if (!m || !s.includes('/film/vendor/')) continue
  const map = JSON.parse(m[1]); map.imports = map.imports || {}
  for (const k of Object.keys(map.imports)) { const v = map.imports[k]; if (typeof v === 'string' && /\.js$/.test(v)) map.imports[k] = v + '?v=' + V }
  Object.assign(map.imports, extra)
  s = s.replace(m[0], '<script>window.__filmV=' + JSON.stringify(V) + '</script><script type="importmap">' + JSON.stringify(map) + '</script>')
  s = s.replace(/(<link rel="modulepreload"[^>]*href="\/film\/[^"?]+\.js)"/g, '$1?v=' + V + '"')
  writeFileSync(p, s); n++
}
console.log('film-bust: version ' + V + ', ' + files.length + ' modules, ' + n + ' pages')
