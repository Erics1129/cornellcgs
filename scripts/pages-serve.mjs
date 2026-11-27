// A local preview of dist/ that answers the way GitHub Pages does (unlike `vite preview`, which sends index.html for
// any address and so hides every missing page):
//   /x/ -> x/index.html; /x (a folder) -> 301 to /x/; /x -> x.html if it exists; anything else -> 404 with 404.html;
//   text is gzipped, media answers HTTP Range (video seeking), max-age=600.
//   node scripts/pages-serve.mjs [dir=dist] [--port 5191] [--also public]
// --also: a second folder for files the first does not have (test builds made without copying public/, 670 MB).
// Exported: startPages({ dir, also, port }) -> { url, close(), log } (log: every request with its status).
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.avif': 'image/avif', '.gif': 'image/gif', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.ttf': 'font/ttf', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml', '.bin': 'application/octet-stream', '.data': 'application/octet-stream', '.pdf': 'application/pdf',
}
const GZIP = /^(text\/|application\/(json|javascript|xml|manifest\+json|wasm)|image\/svg)/

export function startPages({ dir, also = null, port = 0, host = '127.0.0.1' }) {
  const roots = [path.resolve(dir), ...(also ? [path.resolve(also)] : [])]
  const log = []
  const gzCache = new Map()
  const find = (rel) => { for (const r of roots) { const f = path.join(r, rel); if (f.startsWith(r) && fs.existsSync(f)) return f } return null }
  const send = (req, res, file, status = 200) => {
    const ext = path.extname(file).toLowerCase()
    const type = TYPES[ext] || 'application/octet-stream'
    const stat = fs.statSync(file)
    const headers = { 'Content-Type': type, 'Cache-Control': 'max-age=600', 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' }
    const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range)
    if (range && status === 200) {
      const start = range[1] ? +range[1] : stat.size - +range[2]
      const end = range[1] && range[2] ? Math.min(+range[2], stat.size - 1) : stat.size - 1
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 })
      fs.createReadStream(file, { start, end }).pipe(res)
      return 206
    }
    if (GZIP.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      let gz = gzCache.get(file)
      if (!gz || gz.mtime !== stat.mtimeMs) { gz = { mtime: stat.mtimeMs, buf: zlib.gzipSync(fs.readFileSync(file), { level: 6 }) }; gzCache.set(file, gz) }
      res.writeHead(status, { ...headers, 'Content-Encoding': 'gzip', 'Content-Length': gz.buf.length, Vary: 'Accept-Encoding' })
      res.end(req.method === 'HEAD' ? undefined : gz.buf)
      return status
    }
    res.writeHead(status, { ...headers, 'Content-Length': stat.size })
    if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res)
    return status
  }
  const server = http.createServer((req, res) => {
    let status = 500
    try {
      const u = new URL(req.url, 'http://x')
      let p = decodeURIComponent(u.pathname)
      if (p.includes('\0') || p.split('/').includes('..')) { res.writeHead(400); res.end(); status = 400; return }
      const rel = p.replace(/^\/+/, '')
      let file = null
      if (p.endsWith('/')) file = find(path.join(rel, 'index.html'))
      else {
        const f = find(rel)
        if (f && fs.statSync(f).isDirectory()) {
          if (find(path.join(rel, 'index.html'))) { res.writeHead(301, { Location: p + '/' + u.search }); res.end(); status = 301; return }
        } else if (f) file = f
        else file = find(rel + '.html')
      }
      if (file) status = send(req, res, file)
      else {
        const nf = find('404.html')
        if (nf) status = send(req, res, nf, 404)
        else { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); status = 404 }
      }
    } catch (e) {
      res.writeHead(500); res.end(String(e)); status = 500
    } finally {
      log.push({ url: req.url, status })
    }
  })
  return new Promise((resolve) => server.listen(port, host, () => {
    const { port: p } = server.address()
    resolve({ url: `http://${host}:${p}/`, log, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()) }) })
  }))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2)
  const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d }
  const dir = argv.find((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--'))) || path.join(path.dirname(fileURLToPath(import.meta.url)), '../dist')
  const s = await startPages({ dir, also: opt('--also', null), port: +opt('--port', 5191) })
  console.log(`GitHub Pages preview of ${dir}${opt('--also', null) ? ' (+ ' + opt('--also') + ')' : ''}: ${s.url}  (Ctrl-C stops it)`)
}
