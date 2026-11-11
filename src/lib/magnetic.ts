import gsap from 'gsap'
import { prefersReducedMotion } from './motion'

/**
 * Restrained magnetic pull for small controls (close buttons, CTAs).
 * Fine pointers only; transform-only via quickTo, so it composites. The
 * control's box is read once when the pointer comes in, not on every move.
 * Returns a cleanup function.
 */
export function attachMagnetic(el: HTMLElement, clampPx = 5, pull = 0.25): () => void {
  if (prefersReducedMotion()) return () => {}
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return () => {}

  const qx = gsap.quickTo(el, 'x', { duration: 0.4, ease: 'power3' })
  const qy = gsap.quickTo(el, 'y', { duration: 0.4, ease: 'power3' })
  let centre: { x: number; y: number } | null = null

  const onEnter = () => {
    // measured at rest: the pull itself moves the element by a few pixels
    const r = el.getBoundingClientRect()
    const x = Number(gsap.getProperty(el, 'x')) || 0
    const y = Number(gsap.getProperty(el, 'y')) || 0
    centre = { x: r.left + r.width / 2 - x, y: r.top + r.height / 2 - y }
  }
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return
    if (!centre) onEnter()
    qx(gsap.utils.clamp(-clampPx, clampPx, (e.clientX - centre!.x) * pull))
    qy(gsap.utils.clamp(-clampPx, clampPx, (e.clientY - centre!.y) * pull))
  }
  const onLeave = () => {
    centre = null
    // one motion vocabulary: settle on the house ease, no bounce
    qx(0)
    qy(0)
  }

  el.addEventListener('pointerenter', onEnter)
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerleave', onLeave)
  return () => {
    el.removeEventListener('pointerenter', onEnter)
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerleave', onLeave)
    qx.tween.kill()
    qy.tween.kill()
    gsap.set(el, { x: 0, y: 0 })
  }
}
