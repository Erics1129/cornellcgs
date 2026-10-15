// A plain static server in the GitHub Pages model: no custom headers, no Content-Encoding, octet-stream for .unityweb
// (the page inflates the gzip build itself). Serves the built site from dist/ and maps /unity/carrot/ to a chosen Unity
// web build, renaming the QA player's files (carrot-qa.*) to the names the production page requests (carrot.*).
// usage: node scripts/carrot-qa/serve.mjs [--port 5311] [--build output/carrot-qa | public/unity/carrot]
import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync, readdirSync } from 'node:fs'
import { join, resolve, dirname, extname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const arg = (name, d) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : d }
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const port = Number(arg('port', 5311))
const site = resolve(repo, arg('site', 'dist'))
const build = resolve(repo, arg('build', 'output/carrot-qa'))
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.webm': 'video/webm' }
const buildName = existsSync(join(build, 'Build')) ? (readdirSync(join(build, 'Build')).find(f => f.endsWith('.loader.js')) || 'carrot.loader.js').replace('.loader.js', '') : 'carrot'

function resolvePath(url) {
  const path = decodeURIComponent(url.split('?')[0])
  if (path.startsWith('/unity/carrot/')) {
    let rest = path.slice('/unity/carrot/'.length)
    if (rest.startsWith('Build/carrot.')) rest = 'Build/' + buildName + rest.slice('Build/carrot'.length)
    return join(build, normalize(rest).replace(/^(\.\.[/\\])+/, ''))
  }
  let file = join(site, normalize(path).replace(/^(\.\.[/\\])+/, ''))
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
  if (!existsSync(file)) { const pub = join(repo, 'public', normalize(path)); if (existsSync(pub) && statSync(pub).isFile()) return pub }
  return file
}
createServer((req, res) => {
  const file = resolvePath(req.url)
  if (!file.startsWith(site) && !file.startsWith(build) && !file.startsWith(join(repo, 'public'))) { res.writeHead(403); res.end(); return }
  if (!existsSync(file) || !statSync(file).isFile()) { const fallback = join(site, '404.html'); res.writeHead(404, { 'Content-Type': 'text/html' }); if (existsSync(fallback)) createReadStream(fallback).pipe(res); else res.end('not found'); return }
  const size = statSync(file).size
  res.writeHead(200, { 'Content-Type': types[extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': size, 'Cache-Control': 'max-age=600' })
  createReadStream(file).pipe(res)
}).listen(port, '127.0.0.1', () => console.log(`carrot-qa serve http://127.0.0.1:${port}/minigames/carrotDefense/  site=${site} build=${build} (${buildName})`))
