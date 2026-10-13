// Ink Maze level 26 (JavaScript) REFERENCE solution. Not shipped in the sandbox
// bundle; used by scripts/inkmaze-code/test-runtime-javascript.mjs and as the
// worked answer. Memoized depth-first search over (ball position, colored-block
// bitmask, ink left), trying U, D, L, R in order. BigInt masks, so boards with
// more than 31 floor blocks work.
function solve(grid, ink) {
  const H = grid.length, W = grid[0].length
  const index = new Map()               // r * W + c -> bit number of that floor block
  let start = 0
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (grid[r][c] === '#') continue
    if (grid[r][c] === 'o') start = index.size
    index.set(r * W + c, index.size)
  }
  const n = index.size
  const full = (1n << BigInt(n)) - 1n
  const DIRS = [['U', -1, 0], ['D', 1, 0], ['L', 0, -1], ['R', 0, 1]]
  // rolls[b]: the moves that move the ball off block b, with the mask after k blocks
  const rolls = []
  for (const [cell, b] of index) {
    const r0 = Math.floor(cell / W), c0 = cell % W
    const options = []
    for (const [letter, dr, dc] of DIRS) {
      const prefix = []
      let m = 0n, end = b, r = r0 + dr, c = c0 + dc
      while (r >= 0 && r < H && c >= 0 && c < W && grid[r][c] !== '#') {
        end = index.get(r * W + c)
        m |= 1n << BigInt(end)
        prefix.push(m)
        r += dr; c += dc
      }
      if (prefix.length) options.push({ letter, end, cost: prefix.length, prefix })   // skip moves that go nowhere
    }
    rolls[b] = options
  }
  const popcount = (m) => { let k = 0; while (m) { m &= m - 1n; k++ } return k }
  const best = new Map()                // (mask, position) -> most ink left seen
  const moves = []
  function dfs(pos, mask, left) {
    if (mask === full) return true
    if (left < n - popcount(mask)) return false       // every uncolored block needs 1 more ink
    const key = (mask << 6n) | BigInt(pos)
    if ((best.get(key) ?? -1) >= left) return false
    best.set(key, left)
    for (const { letter, end, cost, prefix } of rolls[pos]) {
      if (cost <= left) {
        moves.push(letter)
        if (dfs(end, mask | prefix[cost - 1], left - cost)) return true
        moves.pop()
      } else if ((mask | prefix[left - 1]) === full) {   // ink runs out mid-roll, on the last block
        moves.push(letter)
        return true
      }
    }
    return false
  }
  return dfs(start, 1n << BigInt(start), ink) ? moves.join('') : ''
}
