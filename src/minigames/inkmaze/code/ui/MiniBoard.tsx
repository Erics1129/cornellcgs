/**
 * Ink Maze coding level: a small static picture of a board, for the examples
 * and the revealed test. Walls, floor and the ball; colored blocks when a
 * state is given. Decorative: the grid as text always sits next to it.
 */
import type { CSSProperties } from 'react'
import { FLOOR, START } from '../../engine.ts'

type Props = {
  grid: readonly string[]
  /** engine State.colored ('1' colored), row by row; the start block only when absent */
  colored?: string
  /** the ball's block index, when it is not on the 'o' */
  ball?: number
  className?: string
}

export default function MiniBoard({ grid, colored, ball, className }: Props) {
  const width = grid[0]?.length ?? 0
  const cells = grid.join('')
  const start = cells.indexOf(START)
  const at = ball ?? start
  return <span className={`imc-mini${className ? ` ${className}` : ''}`} style={{ '--cols': width } as CSSProperties} aria-hidden="true">
    {[...cells].map((char, i) => {
      const wall = char !== FLOOR && char !== START
      const inked = !wall && (colored ? colored[i] === '1' : i === start)
      return <span key={i} className="imc-mini__cell" data-kind={wall ? 'wall' : inked ? 'ink' : 'floor'}>
        {i === at && <span className="imc-mini__ball" />}
      </span>
    })}
  </span>
}
