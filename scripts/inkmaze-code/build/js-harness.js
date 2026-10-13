// Ink Maze level 26 (JavaScript): the hidden harness. Not shown to the player.
// Bundled into javascript/runtime.js as text and evaluated INSIDE QuickJS (so it
// never touches the worker). It follows problem.ts H1-H6.
//
// stdin is problem.formatStdin(tests): line 1 = T, then per board "H W INK" and
// H grid rows. inkHarness(stdin) runs BEFORE the player's code is evaluated
// (H1): it parses every board and returns run(solve, write, progress). run()
// builds a fresh private copy of each grid, calls the player's solve(grid, ink)
// once per board, in order, and writes exactly one line per board
//   @@ANSWER@@ <moves>
// with escapeAnswer(moves) (matching problem.ts): control characters and '@'
// become visible symbols, so a player's own prints can never forge or cut an
// answer line (and the answer is NUL-free, which keeps it intact across the
// QuickJS string boundary). progress(t) reports the board index for errors.
//
// The built-ins the harness needs are captured here, before any player code
// exists, as bound functions: a player who replaces String.prototype.split,
// charCodeAt, Array.prototype.push, Number, ... at top level changes nothing
// the harness reads or writes.
const uncurry = Function.prototype.bind.bind(Function.prototype.call)
const split = uncurry(String.prototype.split)
const slice = uncurry(String.prototype.slice)
const charCodeAt = uncurry(String.prototype.charCodeAt)
const fromCharCode = String.fromCharCode
const isArray = Array.isArray
const toNumber = Number
const TypeErr = TypeError

const ANSWER_CHARS = 10000

export function inkHarness(stdin) {
  const data = split(stdin, '\n')
  const tests = toNumber(data[0])
  const boards = []
  let at = 1
  for (let t = 0; t < tests; t++) {
    const head = split(data[at], ' ')
    const h = toNumber(head[0]), w = toNumber(head[1]), ink = toNumber(head[2])
    const rows = []
    for (let y = 0; y < h; y++) rows[y] = slice(data[at + 1 + y], 0, w)
    boards[t] = { rows, h, ink }
    at += 1 + h
  }

  return function run(solve, write, progress) {
    for (let t = 0; t < tests; t++) {
      const { rows, h, ink } = boards[t]
      const grid = []
      for (let y = 0; y < h; y++) grid[y] = rows[y]   // a fresh private copy per board (H2)
      progress(t)
      let moves = solve(grid, ink)
      if (moves === undefined || moves === null) moves = ''
      if (typeof moves !== 'string') {
        throw new TypeErr('solve() must return a string, not ' + (isArray(moves) ? 'an array' : typeof moves))
      }
      write('@@ANSWER@@ ' + escapeAnswer(moves) + '\n')
    }
  }
}

// problem.ts escapeAnswer, matched exactly (same UTF-16 code-unit semantics).
function escapeAnswer(moves) {
  let out = ''
  const n = moves.length
  for (let i = 0; i < n && out.length < ANSWER_CHARS; i++) {
    const code = charCodeAt(moves, i)
    if (code < 0x20) out += fromCharCode(0x2400 + code)
    else if (code === 0x7f) out += '␡'
    else if (code === 0x40) out += '＠'
    else if (code >= 0xd800 && code <= 0xdbff) {
      const low = charCodeAt(moves, i + 1)
      if (low >= 0xdc00 && low <= 0xdfff) { out += fromCharCode(code, low); i++ } else out += '�'
    } else if (code >= 0xdc00 && code <= 0xdfff) out += '�'
    else out += fromCharCode(code)
  }
  return out.length > ANSWER_CHARS ? slice(out, 0, ANSWER_CHARS) : out
}
