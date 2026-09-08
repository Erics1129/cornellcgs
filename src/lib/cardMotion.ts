import type { CSSProperties } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { prefersReducedMotion } from './motion'

gsap.registerPlugin(ScrollTrigger)

type Distance = number | (() => number)
const value = (distance: Distance) => typeof distance === 'function' ? distance() : distance

export interface DealOptions {
  from: { x: Distance; y: Distance; rotation?: number }
  rotation?: number
  duration?: number
  lift?: number
  air?: number
  /** Scale the traveling wrapper itself, including its layout/overflow box. */
  fromScale?: Distance
  delay?: number
  shadow?: HTMLElement | null
  immediate?: boolean
}

/** A shallow flight with a weighted landing. All endpoints are explicit so
 * refresh, seeking and reversing use the same path, including the shadow. */
export function dealCard(card: Element, opts: DealOptions): gsap.core.Timeline {
  const { from, rotation = 0, duration = 0.8, lift = -22, delay = 0, shadow, immediate = true } = opts
  const tl = gsap.timeline({ delay })
  if (prefersReducedMotion()) {
    tl.set(card, { x: 0, y: 0, rotation, scale: 1, opacity: 1 })
    if (shadow) tl.set(shadow, { opacity: 0.48, scale: 1 })
    return tl
  }
  const air = gsap.utils.clamp(1, 1.035, opts.air ?? 1.018)
  const spin = rotation + gsap.utils.clamp(-18, 18, (from.rotation ?? rotation - 10) - rotation)
  const apex = () => value(from.y) * 0.42 + gsap.utils.clamp(-36, 0, lift)
  tl.fromTo(card, { x: from.x, rotation: spin, opacity: 1 }, {
    x: 0, rotation, duration, ease: 'power2.out', immediateRender: immediate,
  }, 0)
  tl.fromTo(card, { y: from.y, scale: opts.fromScale ?? 0.985 }, {
    y: apex, scale: air, duration: duration * 0.42, ease: 'sine.out', immediateRender: immediate,
  }, 0)
  tl.fromTo(card, { y: apex, scale: air }, {
    y: 0, scale: 1, duration: duration * 0.58, ease: 'power1.inOut', immediateRender: false,
  }, duration * 0.42)
  if (shadow) {
    tl.fromTo(shadow, { opacity: 0.18, scale: 0.88 }, {
      opacity: 0.13, scale: 0.94, duration: duration * 0.42, ease: 'sine.out', immediateRender: immediate,
    }, 0)
    tl.fromTo(shadow, { opacity: 0.13, scale: 0.94 }, {
      opacity: 0.48, scale: 1, duration: duration * 0.58, ease: 'power1.inOut', immediateRender: false,
    }, duration * 0.42)
  }
  return tl
}

export interface FlipOptions {
  duration?: number
  edge?: HTMLElement | null
  sheen?: HTMLElement | null
  shadow?: HTMLElement | null
  faceUp?: number
  /** Supply an explicit start when this flip belongs to a scrubbed scene. */
  fromRotation?: number
}

/** A restrained, interruptible turn. No elastic overshoot or full-card scale
 * pulse: the leading edge lifts a few pixels, then returns to the table. */
export function flipCard(card: Element, toFaceUp: boolean, opts: FlipOptions = {}): gsap.core.Timeline {
  const { edge, sheen, shadow, faceUp = 180 } = opts
  const target = toFaceUp ? faceUp : 0
  const start = opts.fromRotation ?? (Number(gsap.getProperty(card, 'rotationY')) || 0)
  const startY = opts.fromRotation === undefined ? Number(gsap.getProperty(card, 'y')) || 0 : 0
  const startZ = opts.fromRotation === undefined ? Number(gsap.getProperty(card, 'z')) || 0 : 0
  const duration = (opts.duration ?? 0.64) * Math.max(0.22, Math.min(1, Math.abs(target - start) / 180))
  const tl = gsap.timeline()
  if (prefersReducedMotion()) {
    tl.set(card, { rotationY: target, y: 0, z: 0, scale: 1 })
    if (edge) tl.set(edge, { opacity: 0 })
    if (sheen) tl.set(sheen, { opacity: 0 })
    return tl
  }
  tl.fromTo(card, { rotationY: start }, { rotationY: target, duration, ease: 'power2.inOut', immediateRender: false }, 0)
  tl.fromTo(card, { y: startY, z: startZ }, { y: -5, z: 12, duration: duration * 0.45, ease: 'sine.out', immediateRender: false }, 0)
  tl.fromTo(card, { y: -5, z: 12 }, { y: 0, z: 0, duration: duration * 0.55, ease: 'sine.inOut', immediateRender: false }, duration * 0.45)
  if (edge) {
    tl.to(edge, { opacity: 0.24, duration: duration * 0.45, ease: 'sine.in' }, 0)
    tl.to(edge, { opacity: 0, duration: duration * 0.55, ease: 'sine.out' }, duration * 0.45)
  }
  if (sheen) {
    tl.fromTo(sheen, { xPercent: -85, opacity: 0 }, { xPercent: 0, opacity: 0.3, duration: duration * 0.45, immediateRender: false }, 0)
    tl.to(sheen, { xPercent: 85, opacity: 0, duration: duration * 0.55 }, duration * 0.45)
  }
  if (shadow) {
    tl.fromTo(shadow, { scaleX: 1, opacity: 0.48 }, { scaleX: 0.82, opacity: 0.25, duration: duration * 0.45, immediateRender: false }, 0)
    tl.fromTo(shadow, { scaleX: 0.82, opacity: 0.25 }, { scaleX: 1, opacity: 0.48, duration: duration * 0.55, immediateRender: false }, duration * 0.45)
  }
  return tl
}

/** Keep pointer transforms on a dedicated child of the scroll/deal layer.
 * Cache a stable hit-area rect per frame; quickTo reuses one tween/property. */
export function hoverLift(card: HTMLElement, opts: {
  maxTilt?: number; lift?: number; shadow?: HTMLElement | null; hitArea?: HTMLElement
} = {}): () => void {
  const { maxTilt = 4, lift = -6, shadow, hitArea = card.parentElement ?? card } = opts
  const mm = gsap.matchMedia()
  mm.add('(any-hover: hover) and (any-pointer: fine) and (prefers-reduced-motion: no-preference)', () => {
    const ctx = gsap.context(() => {})
    let writers: ReturnType<typeof gsap.quickTo>[] = []
    let frame = 0
    let pointer: { x: number; y: number } | null = null
    const ensure = () => {
      if (writers.length) return
      ctx.add(() => {
        gsap.set(card, { transformPerspective: 1100, transformOrigin: '50% 55%' })
        writers = ['rotationX', 'rotationY', 'y'].map((property) => gsap.quickTo(card, property, { duration: 0.28, ease: 'power3.out' }))
        if (shadow) writers.push(gsap.quickTo(shadow, 'scale', { duration: 0.28 }), gsap.quickTo(shadow, 'opacity', { duration: 0.28 }))
      })
    }
    const flush = () => {
      frame = 0
      if (!pointer) return
      const rect = hitArea.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const x = gsap.utils.clamp(-1, 1, (pointer.x - rect.left) / rect.width * 2 - 1)
      const y = gsap.utils.clamp(-1, 1, (pointer.y - rect.top) / rect.height * 2 - 1)
      ensure()
      card.style.willChange = 'transform'
      writers[0](-y * maxTilt)
      writers[1](x * maxTilt)
      writers[2](lift)
      writers[3]?.(1.06)
      writers[4]?.(0.36)
    }
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      pointer = { x: event.clientX, y: event.clientY }
      if (!frame) frame = requestAnimationFrame(flush)
    }
    const rest = () => {
      pointer = null
      cancelAnimationFrame(frame)
      frame = 0
      writers[0]?.(0); writers[1]?.(0); writers[2]?.(0)
      writers[3]?.(1); writers[4]?.(0.48)
      card.style.removeProperty('will-change')
    }
    hitArea.addEventListener('pointermove', move, { passive: true })
    hitArea.addEventListener('pointerleave', rest)
    hitArea.addEventListener('pointercancel', rest)
    window.addEventListener('scroll', rest, { passive: true })
    window.addEventListener('blur', rest)
    return () => {
      rest()
      hitArea.removeEventListener('pointermove', move)
      hitArea.removeEventListener('pointerleave', rest)
      hitArea.removeEventListener('pointercancel', rest)
      window.removeEventListener('scroll', rest)
      window.removeEventListener('blur', rest)
      writers.forEach((writer) => writer.tween.kill())
      ctx.revert()
    }
  })
  return () => mm.revert()
}

/** Refresh only when layout dimensions change, never in the animation loop.
 * Observe stationary slots, not transformed surfaces or pin spacers. */
export function observeCardLayout(elements: Element[]): () => void {
  let alive = true
  let timer: ReturnType<typeof setTimeout> | undefined
  const sizes = new WeakMap<Element, { width: number; height: number }>()
  const refresh = () => {
    if (!alive) return
    clearTimeout(timer)
    timer = setTimeout(() => { if (alive) ScrollTrigger.refresh() }, 120)
  }
  const observer = new ResizeObserver((entries) => {
    let changed = false
    entries.forEach(({ target, contentRect: { width, height } }) => {
      const previous = sizes.get(target)
      if (previous && (Math.abs(width - previous.width) > 1 || Math.abs(height - previous.height) > 1)) changed = true
      sizes.set(target, { width, height })
    })
    if (changed) refresh()
  })
  elements.forEach((element) => observer.observe(element))
  document.fonts?.ready.then(refresh).catch(() => {})
  return () => { alive = false; clearTimeout(timer); observer.disconnect() }
}

export function fanLayout(count: number, opts: { step?: number; drop?: number } = {}) {
  const { step = 6, drop = 8 } = opts
  const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
  const mid = (safeCount - 1) / 2
  const boundedStep = Math.min(step, 18 / Math.max(1, mid))
  return Array.from({ length: safeCount }, (_, i) => {
    const off = i - mid
    return { rotation: off * boundedStep, y: Math.abs(off) * drop, x: off * 4 }
  })
}

export function shadowStyle(): CSSProperties {
  return {
    position: 'absolute', left: '5%', right: '5%', bottom: '-5%', height: '18%',
    borderRadius: '50%',
    background: 'radial-gradient(ellipse at center, rgba(2,5,12,.58), rgba(2,5,12,.16) 48%, transparent 72%)',
    opacity: 0.48, pointerEvents: 'none',
  }
}
