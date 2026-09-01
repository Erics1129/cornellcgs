import gsap from 'gsap'
import { prefersReducedMotion } from './motion'

/**
 * Restrained magnetic pull for small controls (close buttons, CTAs).
 * Desktop fine-pointers only; transform-only via quickTo, so it composites.
 * Returns a cleanup function.
 */
export function attachMagnetic(el: HTMLElement, clampPx = 5): () => void {
  if (prefersReducedMotion()) return () => {}
  if (!window.matchMedia('(pointer: fine)').matches) return () => {}

  const qx = gsap.quickTo(el, 'x', { duration: 0.4, ease: 'power3' })
  const qy = gsap.quickTo(el, 'y', { duration: 0.4, ease: 'power3' })

  const onMove = (e: PointerEvent) => {
    const r = el.getBoundingClientRect()
    const dx = e.clientX - (r.left + r.width / 2)
    const dy = e.clientY - (r.top + r.height / 2)
    qx(gsap.utils.clamp(-clampPx, clampPx, dx * 0.25))
    qy(gsap.utils.clamp(-clampPx, clampPx, dy * 0.25))
  }
  const onLeave = () => {
    gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.5)' })
  }

  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerleave', onLeave)
  return () => {
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerleave', onLeave)
    gsap.set(el, { x: 0, y: 0 })
  }
}
