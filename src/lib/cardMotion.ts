import gsap from 'gsap'
import { EASE } from './eases'
import { prefersReducedMotion } from './motion'

/**
 * Realistic playing-card motion, shared by every DOM card on the site.
 *
 * A dealt card follows a shallow parabolic flight — it lifts off, peaks, and
 * drops onto the table — spinning with the throw and settling with a small
 * bounce; its shadow separates from it while it's in the air. A flipped card
 * turns on its own vertical axis with real depth: the face lifts toward the
 * viewer at the edge-on moment, the lit side sweeps across, and it lands with
 * a hair of overshoot. Hovered cards lift and tilt toward the pointer.
 *
 * Everything is transform/opacity only. Shadows are separate elements the
 * caller passes in (a soft radial-gradient div under the card), never
 * animated box-shadow/filter.
 */

export interface DealOptions {
  /** where the card comes from, relative to its resting spot (px, deg) */
  from: { x: number; y: number; rotation?: number }
  /** resting rotation (deg) */
  rotation?: number
  /** flight time in seconds */
  duration?: number
  /** how high the arc peaks above the straight line (px, negative = up) */
  lift?: number
  /** scale at the top of the flight (perspective: closer to the viewer) */
  air?: number
  /** delay in seconds */
  delay?: number
  /** optional shadow element under the card */
  shadow?: HTMLElement | null
  /** immediateRender start state (default true) */
  immediate?: boolean
}

/**
 * Deal `card` to its resting transform (x:0, y:0, rotation) from `from`.
 * Returns the timeline (paused: false). Add to a scrubbed timeline with
 * `tl.add(dealCard(...), position)` — it is a plain GSAP timeline.
 */
export function dealCard(card: Element, opts: DealOptions): gsap.core.Timeline {
  const { from, rotation = 0, duration = 0.9, lift = -60, air = 1.06, delay = 0, shadow = null } = opts
  const tl = gsap.timeline({ delay })
  if (prefersReducedMotion()) {
    tl.set(card, { x: 0, y: 0, rotation, scale: 1, opacity: 1 })
    if (shadow) tl.set(shadow, { opacity: 0.55, scale: 1 })
    return tl
  }
  const fromRot = from.rotation ?? rotation - 24
  const immediate = opts.immediate ?? true
  gsap.set(card, { transformOrigin: '50% 50%', willChange: 'transform' })

  // Horizontal travel eases out like a slide; the vertical is a two-part arc
  // (up with the throw, down under gravity) so the card visibly flies.
  tl.fromTo(card, { x: from.x, opacity: 1 }, { x: 0, duration, ease: 'power2.out', immediateRender: immediate }, 0)
  tl.fromTo(card, { y: from.y }, { y: from.y * 0.45 + lift, duration: duration * 0.45, ease: 'power2.out', immediateRender: immediate }, 0)
  tl.to(card, { y: 0, duration: duration * 0.55, ease: 'power2.in' }, duration * 0.45)
  // The spin bleeds off with the flight; scale peaks mid-air (closer to the eye)
  tl.fromTo(card, { rotation: fromRot }, { rotation: rotation + (rotation - fromRot) * 0.06, duration, ease: 'power2.out', immediateRender: immediate }, 0)
  tl.fromTo(card, { scale: 0.96 }, { scale: air, duration: duration * 0.45, ease: 'sine.out', immediateRender: immediate }, 0)
  tl.to(card, { scale: 1, duration: duration * 0.55, ease: 'power2.in' }, duration * 0.45)
  // Landing: a short bounce and the last of the spin settling
  tl.to(card, { y: -4, duration: 0.09, ease: 'power1.out' }, duration)
  tl.to(card, { y: 0, rotation, duration: 0.22, ease: 'power2.out' }, duration + 0.09)

  if (shadow) {
    gsap.set(shadow, { transformOrigin: '50% 50%' })
    tl.fromTo(shadow, { opacity: 0.2, scale: 0.9 }, { opacity: 0.12, scale: 0.75, duration: duration * 0.45, ease: 'sine.out', immediateRender: immediate }, 0)
    tl.to(shadow, { opacity: 0.55, scale: 1, duration: duration * 0.55 + 0.3, ease: 'power2.out' }, duration * 0.45)
  }
  return tl
}

export interface FlipOptions {
  duration?: number
  /** the element that should darken at the edge-on moment (an overlay), optional */
  edge?: HTMLElement | null
  /** the sheen overlay (a diagonal gradient) that sweeps across, optional */
  sheen?: HTMLElement | null
  /** optional shadow element under the card */
  shadow?: HTMLElement | null
  /** final rotationY in degrees for face up (default 180) */
  faceUp?: number
}

/**
 * Turn `card` (a 3D element with two backface-hidden faces) from face-down
 * to face-up (or back). Returns a timeline. The card's parent must carry
 * perspective; the card itself is transform-style: preserve-3d.
 */
export function flipCard(card: Element, toFaceUp: boolean, opts: FlipOptions = {}): gsap.core.Timeline {
  const { duration = 0.85, edge = null, sheen = null, shadow = null, faceUp = 180 } = opts
  const target = toFaceUp ? faceUp : 0
  const tl = gsap.timeline()
  if (prefersReducedMotion()) {
    tl.set(card, { rotationY: target })
    return tl
  }
  gsap.set(card, { transformOrigin: '50% 50%', transformStyle: 'preserve-3d', willChange: 'transform' })
  // The turn: fast through the edge, easing into the landing with a hair of overshoot
  tl.to(card, { rotationY: target, duration, ease: 'back.out(1.25)' }, 0)
  // Lift toward the viewer at the edge-on moment, settle back
  tl.to(card, { scale: 1.05, y: -10, duration: duration * 0.42, ease: 'sine.out' }, 0)
  tl.to(card, { scale: 1, y: 0, duration: duration * 0.58, ease: 'power2.inOut' }, duration * 0.42)
  if (edge) {
    // Dark at the edge, clear on both faces
    tl.fromTo(edge, { opacity: 0 }, { opacity: 0.55, duration: duration * 0.4, ease: 'sine.in' }, 0)
    tl.to(edge, { opacity: 0, duration: duration * 0.5, ease: 'sine.out' }, duration * 0.42)
  }
  if (sheen) {
    // The lit side sweeps across the face as it comes round
    tl.fromTo(sheen, { xPercent: -120, opacity: 0.9 }, { xPercent: 120, opacity: 0, duration: duration * 0.7, ease: 'power1.inOut' }, duration * 0.3)
  }
  if (shadow) {
    tl.to(shadow, { scale: 0.86, opacity: 0.25, duration: duration * 0.42, ease: 'sine.out' }, 0)
    tl.to(shadow, { scale: 1, opacity: 0.55, duration: duration * 0.58, ease: 'power2.inOut' }, duration * 0.42)
  }
  return tl
}

/**
 * Hover lift: the card rises, tilts toward the pointer and its shadow spreads.
 * Fine pointers only. Returns cleanup.
 */
export function hoverLift(card: HTMLElement, opts: { maxTilt?: number; lift?: number; shadow?: HTMLElement | null } = {}): () => void {
  if (prefersReducedMotion() || !window.matchMedia('(pointer: fine)').matches) return () => {}
  const { maxTilt = 8, lift = -10, shadow = null } = opts
  gsap.set(card, { transformPerspective: 900, transformOrigin: '50% 50%' })
  const rx = gsap.quickTo(card, 'rotationX', { duration: 0.45, ease: 'power3' })
  const ry = gsap.quickTo(card, 'rotationY', { duration: 0.45, ease: 'power3' })
  const ty = gsap.quickTo(card, 'y', { duration: 0.45, ease: 'power3' })
  const ts = gsap.quickTo(card, 'scale', { duration: 0.45, ease: 'power3' })
  const sh = shadow ? gsap.quickTo(shadow, 'scale', { duration: 0.45, ease: 'power3' }) : null
  const so = shadow ? gsap.quickTo(shadow, 'opacity', { duration: 0.45, ease: 'power3' }) : null
  const onMove = (e: PointerEvent) => {
    const r = card.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    ry(px * maxTilt * 2)
    rx(-py * maxTilt * 2)
    ty(lift)
    ts(1.03)
    sh?.(1.08)
    so?.(0.7)
  }
  const onLeave = () => {
    gsap.to(card, { rotationX: 0, rotationY: 0, y: 0, scale: 1, duration: 0.7, ease: EASE.out })
    if (shadow) gsap.to(shadow, { scale: 1, opacity: 0.55, duration: 0.7, ease: EASE.out })
  }
  card.addEventListener('pointermove', onMove)
  card.addEventListener('pointerleave', onLeave)
  return () => {
    card.removeEventListener('pointermove', onMove)
    card.removeEventListener('pointerleave', onLeave)
  }
}

/**
 * Fan layout around a pivot below the hand: per-card rotation and drop so
 * the hand reads as held. Returns the transforms to apply (deg, px).
 */
export function fanLayout(count: number, opts: { step?: number; drop?: number } = {}) {
  const { step = 9, drop = 16 } = opts
  const mid = (count - 1) / 2
  return Array.from({ length: count }, (_, i) => {
    const off = i - mid
    return { rotation: off * step, y: Math.abs(off) * drop, x: off * 4 }
  })
}

/** A soft radial shadow element for a card; place it as a sibling under the card. */
export function shadowStyle(): React.CSSProperties {
  return {
    position: 'absolute',
    left: '6%',
    right: '6%',
    bottom: '-8%',
    height: '24%',
    borderRadius: '50%',
    background: 'radial-gradient(50% 50% at 50% 50%, rgba(0,0,0,0.6), rgba(0,0,0,0) 70%)',
    opacity: 0.55,
    pointerEvents: 'none',
  }
}
