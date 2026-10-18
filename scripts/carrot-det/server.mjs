// Static server for the determinism harness: the Unity Web build (gzip .unityweb served with Content-Encoding) and harness.html.
//   node server.mjs <buildDir> <port>
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, extname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
const here = fileURLToPath(new URL('.', import.meta.url))
const build = process.argv[2], port = Number(process.argv[3] || 8765)
const types = { '.html': 'text/html', '.js': 'application/javascript', '.wasm': 'application/wasm', '.data': 'application/octet-stream', '.json': 'application/json' }
createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (path === '/' || path === '/harness.html') path = '/harness.html'
  const file = path === '/harness.html' ? join(here, 'harness.html') : join(build, normalize(path).replace(/^(\.\.[/\\])+/, ''))
  if (!existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end('missing ' + path); return }
  const headers = { 'Cache-Control': 'no-store' }
  let name = file
  if (name.endsWith('.unityweb')) { headers['Content-Encoding'] = 'gzip'; name = name.slice(0, -'.unityweb'.length) }
  headers['Content-Type'] = types[extname(name)] || 'application/octet-stream'
  res.writeHead(200, headers); res.end(readFileSync(file))
}).listen(port, '127.0.0.1', () => console.log(`HARNESS_SERVER http://127.0.0.1:${port}/ build=${build}`))
