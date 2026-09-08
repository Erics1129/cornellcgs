import './scopedMotion.css'

/** A resting die; its parent link/button supplies hover, keyboard and press feedback. */

/** pip positions per face, on a 3×3 grid (row, col) */
const PIPS: Array<Array<[number, number]>> = [
  [[1, 1]],
  [[0, 0], [2, 2]],
  [[0, 0], [1, 1], [2, 2]],
  [[0, 0], [0, 2], [2, 0], [2, 2]],
  [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
]

const FACE_TRANSFORM = [
  'rotateY(0deg)',
  'rotateY(180deg)',
  'rotateY(90deg)',
  'rotateY(-90deg)',
  'rotateX(90deg)',
  'rotateX(-90deg)',
]

export default function Dice({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`dice cgs-dice inline-block align-middle ${className}`}
      style={{ width: size, height: size, ['--dice-size' as string]: `${size}px` }}
    >
      <span className="dice-cube">
        {PIPS.map((pips, f) => (
          <span key={f} className="dice-face" style={{ transform: `${FACE_TRANSFORM[f]} translateZ(calc(var(--dice-size) / 2))` }}>
            {pips.map(([r, c], i) => (
              <span key={i} className="dice-pip" style={{ gridRow: r + 1, gridColumn: c + 1 }} />
            ))}
          </span>
        ))}
      </span>
    </span>
  )
}
