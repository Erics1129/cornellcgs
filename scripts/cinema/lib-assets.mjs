// Shared helper for the cinema asset scripts: a headless page served by a tiny local static server
// (public/ as the web root, with Range support so video can seek), so canvases stay readable (same origin).
// No third-party code or art is involved: every output is derived from files in this repo.
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
const PW = process.env.PLAYWRIGHT_MODULE || '/Users/eric/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const TYPES = { '.mp4': 'video/mp4', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg' }

function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    if (url.pathname === '/') return res.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>assets</title><body></body>')
    const file = path.join(ROOT, 'public', decodeURIComponent(url.pathname))
    if (!file.startsWith(path.join(ROOT, 'public')) || !fs.existsSync(file)) return res.writeHead(404).end()
    const size = fs.statSync(file).size
    const type = TYPES[path.extname(file)] || 'application/octet-stream'
    const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '')
    if (range) {
      const start = +range[1], end = range[2] ? +range[2] : size - 1
      res.writeHead(206, { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 })
      return fs.createReadStream(file, { start, end }).pipe(res)
    }
    res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': size })
    fs.createReadStream(file).pipe(res)
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

export async function assetPage() {
  const { chromium } = await import(PW)
  const server = await serve()
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  return { page, browser: { close: async () => { await browser.close(); server.close() } } }
}

export const writeDataUrl = (file, dataUrl) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const bytes = Buffer.from(dataUrl.split(',')[1], 'base64')
  fs.writeFileSync(file, bytes)
  return bytes.length
}
