/**
 * Ink Maze: input. Turns keys and swipes into directions and commands; it
 * knows nothing about the board.
 *
 *  - Arrow keys and W A S D roll the ball (while the game has keyboard focus
 *    or nothing else on the page is focused).
 *  - Z, U or Backspace undoes; R restarts.
 *  - A swipe on the board rolls the ball the way the finger moved. The board
 *    sets touch-action: none, so the page does not scroll under the swipe.
 */
import type { Direction } from './engine.ts'

export type InputHandlers = {
  move: (direction: Direction) => void
  undo: () => void
  restart: () => void
}

const KEYS: Record<string, Direction> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
  W: 'up', S: 'down', A: 'left', D: 'right',
}

/** px a finger must travel before it counts as a swipe */
const SWIPE_MIN = 22

/** Is the user typing somewhere, or working another control? Then keys are not ours. */
function busyElsewhere(target: EventTarget | null, scope: HTMLElement): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return true
  // a focused control outside the game owns its own keys (menus, links)
  return target !== document.body && !scope.contains(target)
}

/**
 * Listens for keys on the document (scoped to `scope`) and swipes on
 * `board`. Returns a function that removes every listener.
 */
export function attachInput(scope: HTMLElement, board: HTMLElement, handlers: InputHandlers): () => void {
  const onKey = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey || busyElsewhere(event.target, scope)) return
    const direction = KEYS[event.key]
    if (direction) {
      event.preventDefault() // arrows would scroll the page
      handlers.move(direction)
      return
    }
    // Enter and Space are left alone, so buttons inside the game still work
    if (event.key === 'z' || event.key === 'Z' || event.key === 'u' || event.key === 'U' || event.key === 'Backspace') {
      event.preventDefault()
      handlers.undo()
    } else if (event.key === 'r' || event.key === 'R') {
      event.preventDefault()
      handlers.restart()
    }
  }

  let start: { id: number; x: number; y: number } | null = null
  const onDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    start = { id: event.pointerId, x: event.clientX, y: event.clientY }
    board.setPointerCapture?.(event.pointerId)
  }
  const onMove = (event: PointerEvent) => {
    if (!start || event.pointerId !== start.id) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return
    // fire as soon as the swipe is clear, so the roll answers the finger
    start = null
    handlers.move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up')
  }
  const onEnd = (event: PointerEvent) => {
    if (start && event.pointerId === start.id) start = null
  }

  document.addEventListener('keydown', onKey)
  board.addEventListener('pointerdown', onDown)
  board.addEventListener('pointermove', onMove)
  board.addEventListener('pointerup', onEnd)
  board.addEventListener('pointercancel', onEnd)
  return () => {
    document.removeEventListener('keydown', onKey)
    board.removeEventListener('pointerdown', onDown)
    board.removeEventListener('pointermove', onMove)
    board.removeEventListener('pointerup', onEnd)
    board.removeEventListener('pointercancel', onEnd)
  }
}
