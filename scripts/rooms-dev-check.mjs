// cgs-rooms against a real workerd: protocol, refusals readable from a browser's point of view, hibernation and wake, relay RTT,
// rejoin within the grace, cleanup. Either starts `wrangler dev --local` itself or checks a running URL.
//   WRANGLER=/path/to/wrangler node scripts/rooms-dev-check.mjs          (starts wrangler dev --env dev on port 8890)
//   node scripts/rooms-dev-check.mjs --url http://127.0.0.1:8787        (an already running dev server or a deployment)
// wrangler is not a dependency of the site: use any wrangler 4 install (the netcode probe's works).
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join as pathJoin } from 'node:path'

const root = pathJoin(dirname(fileURLToPath(import.meta.url)), '..')
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null }
let base = arg('--url')
let child = null
const skipIdle = process.argv.includes('--quick')
if (!base) {
  const wrangler = process.env.WRANGLER || arg('--wrangler')
  if (!wrangler) { console.error('Set WRANGLER=/path/to/wrangler (wrangler 4) or pass --url.'); process.exit(2) }
  const port = Number(arg('--port') || 8890)
  base = `http://127.0.0.1:${port}`
  child = spawn(wrangler, ['dev', '--config', pathJoin(root, 'backend/rooms/wrangler.jsonc'), '--env', 'dev', '--local', '--port', String(port), '--ip', '127.0.0.1', '--persist-to', pathJoin(root, 'output/rooms-dev-state')], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_COLOR: '1' } })
  let log = ''
  child.stdout.on('data', d => { log += d })
  child.stderr.on('data', d => { log += d })
  const t0 = Date.now()
  for (;;) {
    try { const r = await fetch(base + '/health'); if (r.ok) break } catch { /* not up yet */ }
    if (Date.now() - t0 > 60_000) { console.error(log); throw new Error('wrangler dev did not start') }
    await new Promise(r => setTimeout(r, 300))
  }
}
const wsBase = base.replace(/^http/, 'ws')
const VER = 'devcheck+n1'
const ORIGIN = 'http://localhost:5190'
let passed = 0
const ok = (cond, msg) => { assert.ok(cond, msg); passed++; console.log('  ok', msg) }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const results = {}

function join(code, pid, ver = VER) {
  return new Promise(resolve => {
    const ws = new WebSocket(`${wsBase}/rooms/${code}/ws?${new URLSearchParams({ pid, name: pid.slice(0, 8), ver })}`)
    ws.binaryType = 'arraybuffer'
    ws.inbox = []; ws.closed = null; ws.waiters = []
    ws.onmessage = ev => {
      const v = typeof ev.data === 'string' ? (ev.data === 'pong' ? 'pong' : JSON.parse(ev.data)) : new Uint8Array(ev.data)
      for (const w of [...ws.waiters]) if (w.pred(v)) { ws.waiters.splice(ws.waiters.indexOf(w), 1); w.res(v); return }
      ws.inbox.push(v)
      if (v.t === 'welcome') resolve(ws)
    }
    ws.onclose = ev => { ws.closed = { code: ev.code, reason: ev.reason }; resolve(ws) }
    ws.json = o => ws.send(JSON.stringify(o))
  })
}
const wait = (ws, pred, ms = 5000) => new Promise((res, rej) => {
  const i = ws.inbox.findIndex(pred)
  if (i >= 0) return res(ws.inbox.splice(i, 1)[0])
  const tm = setTimeout(() => rej(new Error('timeout')), ms)
  ws.waiters.push({ pred, res: v => { clearTimeout(tm); res(v) } })
})
const post = async () => (await (await fetch(base + '/rooms', { method: 'POST', headers: { 'content-type': 'application/json', Origin: ORIGIN }, body: JSON.stringify({ ver: VER }) })).json()).code
const peek = async (code, q = '') => { const r = await fetch(`${base}/rooms/${code}${q}`, { headers: { Origin: ORIGIN } }); return { status: r.status, body: await r.json() } }

try {
  console.log('protocol and refusals (' + base + ')')
  const code = await post()
  ok(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/.test(code), 'room created: ' + code)
  const A = await join(code, 'host-aaaaaaaa'), B = await join(code, 'guest-bbbbbbbb')
  ok(A.inbox.find(m => m.t === 'welcome').seat === 0 && B.inbox.find(m => m.t === 'welcome').seat === 1, 'two seats')
  const third = await peek(code, `?${new URLSearchParams({ ver: VER, pid: 'third-cccccccc' })}`)
  ok(third.status === 409 && third.body.error === 'room-full', 'a third player gets HTTP 409 room-full on the fetch pre-check')
  const C = await join(code, 'third-cccccccc')
  ok(C.inbox.find(m => m.t === 'error')?.code === 'room-full' && C.closed?.code === 4409, 'and on the socket: {t:error, room-full} then close 4409 (readable in a browser)')
  const vm = await peek(code, `?${new URLSearchParams({ ver: 'old+n0', pid: 'old-xxxxxxxx' })}`)
  ok(vm.status === 409 && vm.body.error === 'version-mismatch', 'a version mismatch is refused with HTTP 409 version-mismatch')
  const V = await join(code, 'old-xxxxxxxx', 'old+n0')
  ok(V.inbox.find(m => m.t === 'error')?.code === 'version-mismatch' && V.closed?.code === 4426, 'and on the socket: version-mismatch, close 4426')
  const pre = await fetch(base + '/rooms', { method: 'OPTIONS', headers: { Origin: 'https://cornellcgs.org', 'Access-Control-Request-Method': 'POST' } })
  ok(pre.status === 204 && pre.headers.get('access-control-allow-origin') === 'https://cornellcgs.org', 'CORS preflight for POST /rooms')
  const evil = await fetch(base + '/rooms', { method: 'POST', headers: { Origin: 'https://evil.example' }, body: '{}' })
  ok(evil.status === 403, 'foreign origin refused (403)')

  console.log('relay round trip')
  B.onmessage = ev => { if (typeof ev.data !== 'string') B.send(ev.data) } // echo binary back
  const rtts = []
  for (let i = 0; i < 400; i++) {
    const t = performance.now()
    const got = new Promise(res => { A.waiters.push({ pred: v => v instanceof Uint8Array && v[1] === (i & 0xff), res }) })
    A.send(new Uint8Array([4, i & 0xff, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8]))
    await got
    rtts.push(performance.now() - t)
    if (i % 60 === 59) await sleep(1100) // stay inside the 64 frames/s cap
  }
  rtts.sort((a, b) => a - b)
  const p50 = rtts[rtts.length >> 1], p95 = rtts[Math.floor(rtts.length * 0.95)]
  results.relayRtt = { p50: +p50.toFixed(2), p95: +p95.toFixed(2), n: rtts.length }
  ok(p50 <= 2, `local relay round trip A -> room -> B -> room -> A: p50 ${p50.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms`)

  console.log('rejoin within the grace')
  A.json({ t: 'status', loaded: 1 }); B.onmessage = null
  const B1 = await join(code, 'guest-bbbbbbbb') // replaces B's socket (same pid)
  B1.json({ t: 'status', loaded: 1 })
  A.json({ t: 'ready', on: true }); B1.json({ t: 'ready', on: true })
  await sleep(300)
  A.json({ t: 'start' })
  const st = await wait(B1, m => m.t === 'start')
  B1.close()
  await wait(A, m => m.t === 'peer' && m.state === 'away')
  await sleep(1000)
  const B2 = await join(code, 'guest-bbbbbbbb')
  const w = B2.inbox.find(m => m.t === 'welcome')
  ok(w && w.seat === 1 && w.match && w.match.seed === st.seed && w.match.sides.join() === st.sides.join(), 'a rejoin inside the grace keeps seat, seed and sides')

  if (!skipIdle) {
    console.log('hibernation (30 s idle with only auto-answered pings)')
    const before = (await peek(code, '?stats')).body.stats.instance
    for (let i = 0; i < 6; i++) { A.send('ping'); B2.send('ping'); await sleep(5000) }
    const t = performance.now()
    A.json({ t: 'time', c: Date.now() })
    await wait(A, m => m.t === 'time')
    const wake = performance.now() - t
    const after = (await peek(code, '?stats')).body.stats.instance
    results.hibernation = { before, after, wakeMs: +wake.toFixed(1) }
    ok(before !== after, `the room hibernated while idle (object rebuilt: ${before} -> ${after})`)
    ok(wake <= 20, `first message after the idle period answered in ${wake.toFixed(1)} ms (wake)`)
    A.json({ t: 'signal', data: 'after-wake' })
    ok((await wait(B2, m => m.t === 'signal')).data === 'after-wake', 'the woken room still relays between the two seats (attachments survived)')
  }

  console.log('cleanup')
  B2.json({ t: 'leave' }); await sleep(200)
  A.json({ t: 'leave' }); await sleep(400)
  const gone = await peek(code)
  ok(gone.body.exists === false, 'storage is empty after the last player leaves (the room no longer exists)')
  const stats = await peek(code, '?stats')
  ok(stats.body.exists === false && !stats.body.stats, 'no state left to report')
  console.log(`PASS ${passed} checks`)
  console.log(JSON.stringify(results))
} finally {
  if (child) child.kill('SIGINT')
}
process.exit(0)
