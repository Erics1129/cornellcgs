// Ink Maze level 26 (JavaScript) NAIVE solution. Not shipped. A plain
// depth-first search with only the ink pruning problem.ts PLAIN_SEARCH_BUDGET
// assumes: try U, D, L, R in order, roll exactly as the engine does (the ink
// can run dry mid-roll), give up on a line when the ink left is less than the
// blocks still uncolored, no memo. The slowest solution the level must still
// accept.
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
    if (left <= 0 || left < floors - count) return false
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
