/** An illustrative legal Go sequence, not a replay of an AlphaGo match. */
export type GoColor = 1 | 2
export type GoMove = readonly [number, number]
export const GO_SIZE = 19
const MOVES: GoMove[] = [
  [-6,-6],[-6,-4],[-5,-4],[-4,-3],[-3,-4],[-2,-3],[-3,-2],[-2,-1],
  [-1,-2],[0,-1],[0,0],[1,1],[2,0],[3,0],[4,-1],[5,0],[5,-3],[6,4],
  [6,5],[6,3],[5,4],[-5,5],[-6,5],[-4,6],[-5,6],[5,-5],[6,-6],
  [2,3],[1,3],[7,6],[2,4],[7,5],[3,3],[8,5],[2,2],[4,5],[4,4],[7,4],[4,3],
]
const index = ([x,y]: GoMove) => (y + 9) * GO_SIZE + x + 9
export const goPoint = (i: number): GoMove => [i % GO_SIZE - 9, Math.floor(i / GO_SIZE) - 9]

function neighbours(i: number) {
  const x = i % GO_SIZE, y = Math.floor(i / GO_SIZE)
  return [x > 0 ? i-1 : -1, x < 18 ? i+1 : -1, y > 0 ? i-19 : -1, y < 18 ? i+19 : -1].filter(n => n >= 0)
}
function group(board: Uint8Array, at: number) {
  const stones = new Set([at]), queue = [at]
  let liberties = false
  while (queue.length) {
    for (const n of neighbours(queue.pop()!)) {
      if (!board[n]) liberties = true
      else if (board[n] === board[at] && !stones.has(n)) { stones.add(n); queue.push(n) }
    }
  }
  return { stones, liberties }
}

export function playGo(previous: Uint8Array, move: GoMove, color: GoColor) {
  if (move.some(n => !Number.isInteger(n) || Math.abs(n) > 9)) throw new Error('Go move outside board')
  const at = index(move), board = previous.slice(), captured: number[] = []
  if (board[at]) throw new Error('Go intersection already occupied')
  board[at] = color
  for (const n of neighbours(at)) {
    if (board[n] && board[n] !== color) {
      const connected = group(board, n)
      if (!connected.liberties) for (const stone of connected.stones) { captured.push(stone); board[stone] = 0 }
    }
  }
  if (!group(board, at).liberties) throw new Error('Go move has no liberties')
  return { board, captured, at, move, color }
}

let board = new Uint8Array(GO_SIZE * GO_SIZE)
export const GO_STEPS = MOVES.map((move, i) => {
  const step = playGo(board, move, i % 2 ? 2 : 1)
  board = step.board
  return step
})
export const GO_SEED = 12
export const GO_DROP = .42
const start = .75
export const GO_TIMES = GO_STEPS.slice(GO_SEED).map((_, i) => start + i * 1.72)
export const GO_END = GO_TIMES[GO_TIMES.length-1] + GO_DROP + 2.6
export const GO_PERIOD = GO_END + 1.5

/** One clock controls the stone contact, capture, ripple and impact. */
export function goFrame(time: number, reduced = false) {
  const t = reduced ? GO_END - 1 : time % GO_PERIOD
  let pending = GO_SEED
  while (pending < GO_STEPS.length && t >= GO_TIMES[pending-GO_SEED] + GO_DROP) pending++
  const last = pending - 1
  const falling = pending < GO_STEPS.length && t >= GO_TIMES[pending-GO_SEED]
  const drop = falling ? Math.min(1, (t-GO_TIMES[pending-GO_SEED]) / GO_DROP) : 0
  const contact = last >= GO_SEED ? t - GO_TIMES[last-GO_SEED] - GO_DROP : Infinity
  const fade = Math.max(0,Math.min(1,t < .5 ? t/.5 : t > GO_END ? 1-(t-GO_END)/.9 : 1))
  const alpha = fade*fade*(3-2*fade)
  return { last, pending, falling, drop, contact, alpha: reduced ? 1 : alpha, cycle: Math.floor(time/GO_PERIOD) }
}
