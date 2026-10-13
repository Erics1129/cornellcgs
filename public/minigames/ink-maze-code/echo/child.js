/*
 * Ink Maze level 26: the echo runtime's child worker (host.spawn('echo/child.js')).
 *
 * The pattern for a runtime that runs the program in its own thread (D8):
 * the host starts this file as a classic worker from a blob: URL (it may
 * import() blob: modules it makes itself) and sends one message,
 * { type: 'ink-sandbox-child', protocol } with the port to the parent in
 * event.ports[0]. Everything else goes over that port. The child takes its
 * clock before any player code, deletes the network globals itself, and stops
 * its program at the parent's deadlineEpochMs on its own (terminate() does not
 * stop WebAssembly in WebKit). The host terminates it together with its parent.
 */
const now = performance.now.bind(performance)
const origin = performance.timeOrigin
const NET = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'Worker', 'SharedWorker', 'BroadcastChannel', 'indexedDB', 'caches']

/** What host.lockdown() does in a runtime worker: the globals may sit on the global's prototypes (Chromium), so walk them all. */
function lockdown() {
  const targets = [self]
  for (let p = Object.getPrototypeOf(self); p && p !== Object.prototype; p = Object.getPrototypeOf(p)) targets.push(p)
  for (const name of NET) {
    for (const target of targets) { try { delete target[name] } catch { /* not deletable */ } }
    try { if (name in self) Object.defineProperty(self, name, { value: undefined, writable: false, configurable: false }) } catch { /* ignore */ }
  }
}

self.addEventListener('message', (event) => {
  if (!event.isTrusted || !event.data || event.data.type !== 'ink-sandbox-child') return
  const port = event.ports[0]
  lockdown()
  port.onmessage = (e) => {
    const m = e.data
    if (m.cmd === 'echo') port.postMessage({ reply: `child got ${m.text}`, protocol: event.data.protocol, hasFetch: typeof self.fetch })
    if (m.cmd === 'spin') {
      // JavaScript that checks the parent's deadline on this thread's own clock (D8)
      port.postMessage({ spinning: true })
      let turns = 0
      for (;;) { if ((++turns & 0xffff) === 0 && origin + now() > m.deadlineEpochMs) { port.postMessage({ stopped: true }); return } }
    }
    if (m.cmd === 'spin-hot') {
      // no check: only terminate() stops it (WebKit at once, Chromium after its ~2 s forcible-termination delay)
      port.postMessage({ spinning: true })
      for (;;) { /* nothing */ }
    }
    if (m.cmd === 'spin-wasm') {
      // the parent's deadline, on this thread's own clock (D8)
      const check = () => { if (origin + now() > m.deadlineEpochMs) throw new Error('past the deadline') }
      const instance = new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array(m.wasm)), { env: { check } })
      port.postMessage({ spinning: true })
      try { instance.exports.spin() } catch { port.postMessage({ stopped: true }) }
    }
  }
})
