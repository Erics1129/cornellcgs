import { useRef } from 'react'

/**
 * The mark: a die. A CSS cube with real pips that never stops tumbling
 * (global.css .dice-*), and every press throws it — a fast roll on the
 * outer wrapper so it never fights the slow tumble on the cube. Colours
 * come from --dice-face / --dice-pip so the same die sits on the dark deck
 * and the white sheets.
 */

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
  const roll = useRef<HTMLSpanElement>(null)

  const throwIt = () => {
    const el = roll.current
    if (!el) return
    el.classList.remove('dice-roll')
    // reflow so a second press replays the roll
    void el.offsetWidth
    el.classList.add('dice-roll')
    el.addEventListener('animationend', () => el.classList.remove('dice-roll'), { once: true })
  }

  return (
    <span
      ref={roll}
      aria-hidden="true"
      onPointerDown={throwIt}
      onPointerEnter={throwIt}
      className={`dice inline-block align-middle ${className}`}
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
