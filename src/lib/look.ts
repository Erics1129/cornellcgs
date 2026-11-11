/**
 * look.ts — one input vector for pointer, touch and tilt. CONTRACT FILE, owner: stream "interaction".
 * STUB from SPEC.md §9: mouse only, no smoothing. Keep every export's name and signature.
 */
export interface Look {
  /** -1 (left) .. 1 (right), smoothed */
  x: number
  /** -1 (top) .. 1 (bottom), smoothed */
  y: number
  /** units per second */
  vx: number
  vy: number
  source: 'pointer' | 'touch' | 'tilt' | 'idle'
  /** false when nothing is driving it: consumers ease back to their rest pose */
  active: boolean
}

export type TiltState = 'unsupported' | 'off' | 'granted' | 'denied'

const value: Look = { x: 0, y: 0, vx: 0, vy: 0, source: 'idle', active: false }
const listeners = new Set<(l: Look) => void>()
let started = false

function start() {
  if (started || typeof window === 'undefined') return
  started = true
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return
    value.x = (e.clientX / window.innerWidth) * 2 - 1
    value.y = (e.clientY / window.innerHeight) * 2 - 1
    value.source = 'pointer'
    value.active = true
    for (const fn of listeners) fn(value)
  }, { passive: true })
}

/** The latest smoothed vector. The same object every call; read it, do not keep copies of its fields across frames. */
export function look(): Look {
  start()
  return value
}

/** Called at most once per animation frame, and only while the vector is changing. */
export function onLook(fn: (l: Look) => void): () => void {
  start()
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function tiltState(): TiltState {
  return 'unsupported'
}

/** Ask for device tilt. Must be called from a tap (iOS shows its permission sheet). */
export function requestTilt(): Promise<TiltState> {
  return Promise.resolve(tiltState())
}

/** Boot (listeners, tilt restore, --lx/--ly writers). Called once from main.tsx. */
export function initLook(): () => void {
  start()
  return () => {}
}
