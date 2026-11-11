/** Central place to ask about motion preferences and device class. */

const mq = () => window.matchMedia('(prefers-reduced-motion: reduce)')

export function prefersReducedMotion(): boolean {
  return mq().matches
}

export function onReducedMotionChange(cb: (reduced: boolean) => void): () => void {
  const m = mq()
  const handler = () => cb(m.matches)
  m.addEventListener('change', handler)
  return () => m.removeEventListener('change', handler)
}

/** Sticky runways need motion and room: a phone on its side (under 480 px tall) gets the plain, complete layout. Mirrors deck.css. */
export const RUNWAY_MEDIA = '(prefers-reduced-motion: no-preference) and (min-height: 480px)'

export function runwayAllowed(): boolean {
  return window.matchMedia(RUNWAY_MEDIA).matches
}

export function isTouchDevice(): boolean {
  return window.matchMedia('(pointer: coarse)').matches
}

/** Fire a decaying screen shake on the page wrapper. intensity 0..1. */
export function shake(intensity: number) {
  window.dispatchEvent(new CustomEvent('cgs:shake', { detail: { intensity } }))
}

export const SHAKE_EVENT = 'cgs:shake'
export const SOUND_EVENT = 'cgs:sound'
export const SOUND_KEY = 'cgs-sound'

/** Fired once when the loader curtain lifts; entrances start on it.
    window.__cgsShown is set at the same moment for late subscribers. */
export const BOOTED_EVENT = 'cgs:shown'

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) === 'on'
  } catch {
    return false
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off')
  } catch {
    /* private mode — session-only */
  }
  window.dispatchEvent(new CustomEvent(SOUND_EVENT, { detail: { on } }))
}
