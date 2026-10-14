// Ink Maze level 26, an UNPRUNED brute force in JavaScript (tests only).
//
// javascript-naive.js without its one pruning rule: give up on a line only when the ink is
// gone, never because the ink left is less than the blocks still uncolored.
// No memo. Not shipped. It clears the visible map and the small hidden
// boards (problem.ts PLAIN_SEARCH_BUDGET), but the larger hidden boards need
// more than UNPRUNED_SEARCH_FLOOR calls in every move order, so a submission
// must end in Time Limit Exceeded (scripts/test-inkmaze-code-flow.mjs checks it).
function solve(grid, ink) {
  const H = grid.length, W = grid[0].length
  const wall = grid.map((row) => Array.from({ length: W }, (_, c) => row[c] === '#'))
  let sr = 0, sc = 0, floors = 0
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (!wall[r][c]) floors++
    if (grid[r][c] === 'o') { sr = r; sc = c }
  }
  const colored = Array.from({ length: H }, () => new Array(W).fill(false))
  colored[sr][sc] = true
  const DIRS = [['U', -1, 0], ['D', 1, 0], ['L', 0, -1], ['R', 0, 1]]
  const moves = []
  function dfs(r, c, count, left) {
    if (count === floors) return true
    if (left <= 0) return false
    for (const [letter, dr, dc] of DIRS) {
      let nr = r + dr, nc = c + dc
      if (nr < 0 || nc < 0 || nr >= H || nc >= W || wall[nr][nc]) continue   // a move that goes nowhere
      const painted = []
      let spent = 0, er = r, ec = c
      while (nr >= 0 && nc >= 0 && nr < H && nc < W && !wall[nr][nc] && spent < left) {
        if (!colored[nr][nc]) { colored[nr][nc] = true; painted.push([nr, nc]) }
        spent++; er = nr; ec = nc; nr += dr; nc += dc
      }
      moves.push(letter)
      if (dfs(er, ec, count + painted.length, left - spent)) return true
      moves.pop()
      for (const [pr, pc] of painted) colored[pr][pc] = false
    }
    return false
  }
  return dfs(sr, sc, 1, ink) ? moves.join('') : ''
}
