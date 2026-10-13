// Ink Maze level 26 (JavaScript): the hidden harness. Not shown to the player.
// Bundled into javascript/runtime.js as text and evaluated INSIDE QuickJS (so it
// never touches the worker). It follows problem.ts H1-H6.
//
// stdin is problem.formatStdin(tests): line 1 = T, then per board "H W INK" and
// H grid rows. For each board, in order, it builds a fresh private copy of the
// grid, calls the player's solve(grid, ink), and writes exactly one line
//   @@ANSWER@@ <moves>
// with escapeAnswer(moves) (matching problem.ts): control characters and '@'
// become visible symbols, so a player's own prints can never forge or cut an
// answer line (and the answer is NUL-free, which keeps it intact across the
// QuickJS string boundary). progress(t) reports the board index for errors.
export function inkHarness(solve, stdin, write, progress) {
  const data = stdin.split('\n')
  const tests = Number(data[0])
  let at = 1
  for (let t = 0; t < tests; t++) {
    const [h, w] = data[at].trim().split(/\s+/).map(Number)
    const ink = Number(data[at].trim().split(/\s+/)[2])
    const grid = []
    for (let y = 0; y < h; y++) grid.push(String(data[at + 1 + y]).slice(0, w))
    at += 1 + h
    progress(t)
    let moves = solve(grid, ink)
    if (moves === undefined || moves === null) moves = ''
    if (typeof moves !== 'string') {
      throw new TypeError('solve() must return a string, not ' + (Array.isArray(moves) ? 'an array' : typeof moves))
    }
    write('@@ANSWER@@ ' + escapeAnswer(moves) + '\n')
  }
}

const ANSWER_CHARS = 10000

// problem.ts escapeAnswer, matched exactly (same UTF-16 code-unit semantics).
function escapeAnswer(moves) {
  let out = ''
  for (let i = 0; i < moves.length && out.length < ANSWER_CHARS; i++) {
    const code = moves.charCodeAt(i)
    if (code < 0x20) out += String.fromCharCode(0x2400 + code)
    else if (code === 0x7f) out += '␡'
    else if (code === 0x40) out += '＠'
    else if (code >= 0xd800 && code <= 0xdbff) {
      const low = moves.charCodeAt(i + 1)
      if (low >= 0xdc00 && low <= 0xdfff) { out += moves[i] + moves[i + 1]; i++ } else out += '�'
    } else if (code >= 0xdc00 && code <= 0xdfff) out += '�'
    else out += moves[i]
  }
  return out.slice(0, ANSWER_CHARS)
}
