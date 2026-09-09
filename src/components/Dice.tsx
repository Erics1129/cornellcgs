import { useEffect, useRef, type CSSProperties } from 'react'
import './dice.css'

/** Opposite faces sum to seven: 1/6, 3/4, 2/5. */
const FACES = [
  { name: 'front', value: 1, pips: [4] },
  { name: 'back', value: 6, pips: [0, 2, 3, 5, 6, 8] },
  { name: 'right', value: 3, pips: [0, 4, 8] },
  { name: 'left', value: 4, pips: [0, 2, 6, 8] },
  { name: 'top', value: 2, pips: [0, 8] },
  { name: 'bottom', value: 5, pips: [0, 2, 4, 6, 8] },
] as const

type Props = { size?: number; className?: string }

/** A self-contained brand mark. The parent keeps every navigation event;
 * the die observes pointer/focus feedback without capturing a click. */
export default function Dice({ size = 18, className = '' }: Props) {
  const root = useRef<HTMLSpanElement>(null)
  const response = useRef<HTMLSpanElement>(null)
  const dimension = Number.isFinite(size) ? Math.max(0, size) : 18

  useEffect(() => {
    const mark = root.current
    const gimbal = response.current
    if (!mark || !gimbal) return
    const hitArea = mark.closest<HTMLElement>('button, a[href]') ?? mark
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    let visible = false
    let frame = 0
    let hovering = false
    let focused = false
    let pressed = false
    let pointer: { x: number; y: number } | null = null
    const canMove = () => visible && !document.hidden && !reduced.matches

    const paint = () => {
      frame = 0
      let x = focused ? -4 : 0
      let y = focused ? 6 : 0
      let roll = 0
      if (hovering && pointer) {
        // One layout read per input frame, followed by a single transform write.
        const rect = hitArea.getBoundingClientRect()
        if (rect.width && rect.height) {
          const nx = Math.max(-1, Math.min(1, (pointer.x - rect.left) / rect.width * 2 - 1))
          const ny = Math.max(-1, Math.min(1, (pointer.y - rect.top) / rect.height * 2 - 1))
          x = -ny * 7 - 3
          y = nx * 9 + 4
          roll = nx * 4
        }
      }
      if (pressed) { x += 6; y += 8; roll += 10 }
      gimbal.style.transform = canMove() ? `rotateX(${x}deg) rotateY(${y}deg) rotateZ(${roll}deg)` : ''
    }
    const requestPaint = () => { if (!frame) frame = requestAnimationFrame(paint) }
    const reset = () => {
      pointer = null
      hovering = false
      pressed = false
      requestPaint()
    }
    const sync = () => {
      mark.dataset.motion = reduced.matches ? 'reduced' : canMove() ? 'running' : 'paused'
      if (!canMove()) {
        cancelAnimationFrame(frame)
        frame = 0
        hovering = false
        pressed = false
        pointer = null
        gimbal.style.transform = ''
      }
    }
    const move = (event: PointerEvent) => {
      if (!canMove() || event.pointerType === 'touch') return
      hovering = true
      pointer = { x: event.clientX, y: event.clientY }
      requestPaint()
    }
    const down = () => { if (canMove()) { pressed = true; requestPaint() } }
    const up = () => { if (pressed) { pressed = false; requestPaint() } }
    const focus = () => { focused = hitArea.matches(':focus-visible'); requestPaint() }
    const blur = () => { focused = false; reset() }
    const keyDown = (event: KeyboardEvent) => { if (!event.repeat && (event.key === 'Enter' || event.key === ' ')) down() }
    const keyUp = (event: KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') up() }
    const observer = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting && entry.intersectionRatio > 0
      sync()
    })
    observer.observe(mark)
    document.addEventListener('visibilitychange', sync)
    reduced.addEventListener('change', sync)
    hitArea.addEventListener('pointerenter', move, { passive: true })
    hitArea.addEventListener('pointermove', move, { passive: true })
    hitArea.addEventListener('pointerleave', reset, { passive: true })
    hitArea.addEventListener('pointerdown', down, { passive: true })
    hitArea.addEventListener('pointercancel', reset, { passive: true })
    window.addEventListener('pointerup', up, { passive: true })
    hitArea.addEventListener('focusin', focus)
    hitArea.addEventListener('focusout', blur)
    hitArea.addEventListener('keydown', keyDown)
    hitArea.addEventListener('keyup', keyUp)
    sync()
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', sync)
      reduced.removeEventListener('change', sync)
      hitArea.removeEventListener('pointerenter', move)
      hitArea.removeEventListener('pointermove', move)
      hitArea.removeEventListener('pointerleave', reset)
      hitArea.removeEventListener('pointerdown', down)
      hitArea.removeEventListener('pointercancel', reset)
      window.removeEventListener('pointerup', up)
      hitArea.removeEventListener('focusin', focus)
      hitArea.removeEventListener('focusout', blur)
      hitArea.removeEventListener('keydown', keyDown)
      hitArea.removeEventListener('keyup', keyUp)
    }
  }, [])

  return (
    <span ref={root} aria-hidden="true" data-motion="paused" className={`cgs-brand-die ${className}`}
      style={{ width: dimension, height: dimension, '--brand-die-edge': `${dimension * 0.54}px`, '--brand-die-perspective': `${dimension * 12}px` } as CSSProperties}>
      <span className="cgs-brand-die-stage">
        <span ref={response} className="cgs-brand-die-response">
          <span className="cgs-brand-die-rotor">
            {FACES.map((face) => (
              <span key={face.name} className={`cgs-brand-die-face cgs-brand-die-face-${face.name}`} data-pips={face.value}>
                {face.pips.map((pip) => <span key={pip} className="cgs-brand-die-pip" style={{ gridRow: Math.floor(pip / 3) + 1, gridColumn: pip % 3 + 1 }} />)}
              </span>
            ))}
          </span>
        </span>
      </span>
    </span>
  )
}
