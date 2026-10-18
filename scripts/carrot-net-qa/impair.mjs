// Network impairment for the two-browser QA (ported from the netcode probe's rtc/harness.mjs):
//   udpProxy: sits in front of one peer's ICE host candidate; every DataChannel packet passes it with delay, jitter and loss
//             (and a blackhole when loss = 1). The page rewrites its candidate to the proxy (filter=proxy).
//   tcpProxy: sits in front of the rooms Worker; a 'lost' segment holds everything behind it for an RTO, as TCP does to sparse
//             traffic ('slow': max(200 ms, 2 RTT); 'fast': RACK/TLP-style 2 RTT). Bytes never reorder.
// The impairment object is read per packet, so a scenario can change it mid-run.
import net from 'node:net'
import dgram from 'node:dgram'
import { networkInterfaces } from 'node:os'

export const LAN = Object.values(networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal && /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(i.address))?.address
  || Object.values(networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal)?.address || '127.0.0.1'

function makeLink(imp) {
  let last = 0
  return {
    delay(extra = 0) {
      const d = Math.max(0, (imp.rtt || 0) / 2 + (Math.random() * 2 - 1) * (imp.jitter || 0)) + extra
      const at = Math.max(Date.now() + d, last); last = at; return at - Date.now()
    },
    drop() { return Math.random() < (imp.loss || 0) },
    rto() { return imp.tcp === 'fast' ? Math.max(30, 2 * 2 * (imp.rtt || 0)) : Math.max(200, 2 * (imp.rtt || 0)) },
  }
}
/** imp = {rtt, jitter, loss} per leg (the harness halves an end-to-end model across the two legs). */
export function udpProxy(target, imp) {
  return new Promise(resolve => {
    const s = dgram.createSocket('udp4'); let client = null
    const toT = makeLink(imp), toC = makeLink(imp); const counters = { in: 0, out: 0, dropped: 0 }
    s.on('message', (msg, ri) => {
      const fromTarget = ri.address === target.ip && ri.port === target.port
      if (!fromTarget) client = { ip: ri.address, port: ri.port }
      const dest = fromTarget ? client : target; if (!dest) return
      const link = fromTarget ? toC : toT
      if (link.drop()) { counters.dropped++; return }
      setTimeout(() => { try { s.send(msg, dest.port, dest.ip) } catch { /* proxy closed */ } }, link.delay())
      fromTarget ? counters.out++ : counters.in++
    })
    s.on('error', () => {})
    s.bind(0, LAN, () => resolve({ socket: s, port: s.address().port, counters, close: () => { try { s.close() } catch { /* closed */ } } }))
  })
}
export function tcpProxy(listenPort, target, imp) {
  const sockets = new Set()
  const server = net.createServer(c => {
    const up = net.connect(target.port, target.host); const a = makeLink(imp), b = makeLink(imp)
    sockets.add(c); sockets.add(up)
    c.setNoDelay(true); up.setNoDelay(true)
    const pipe = (from, to, link) => {
      const q = []; let timer = null
      const drain = () => { timer = null; const t = Date.now(); while (q.length && q[0].at <= t) to.write(q.shift().d); if (q.length) timer = setTimeout(drain, Math.max(0, q[0].at - Date.now())) }
      from.on('data', d => { if (imp.down) return; const extra = link.drop() ? link.rto() : 0; q.push({ d, at: Date.now() + link.delay(extra) }); if (!timer) timer = setTimeout(drain, Math.max(0, q[0].at - Date.now())) })
    }
    pipe(c, up, a); pipe(up, c, b)
    c.on('error', () => up.destroy()); up.on('error', () => c.destroy()); c.on('close', () => { up.end(); sockets.delete(c) }); up.on('close', () => { c.end(); sockets.delete(up) })
  })
  return new Promise(r => server.listen(listenPort, '127.0.0.1', () => r({ server, close: () => { for (const s of sockets) s.destroy(); return new Promise(rr => server.close(rr)) } })))
}
/** Splits an end-to-end model {rtt, jitter, loss} into one leg (two legs make the path). */
export const leg = m => ({ rtt: m.rtt / 2, jitter: m.jitter / 2, loss: 1 - Math.sqrt(1 - (m.loss || 0)), tcp: m.tcp })
