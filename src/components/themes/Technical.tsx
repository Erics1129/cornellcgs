import type { ReactElement } from 'react'
import gsap from 'gsap'
import type { PageTheme, ThemeName } from '../../lib/pageTheme'
import '../scopedMotion.css'

/** Shared entrance lifecycle: one reveal per block, no ongoing copy motion. */
export function enterPage(root: HTMLElement, variant: ThemeName): () => void {
  const previous = root.getAttribute('data-motion-theme')
  root.setAttribute('data-motion-theme', variant)
  const items = Array.from(root.querySelectorAll<HTMLElement>('[data-page-item]'))
  const seen = new Set<Element>()
  const mm = gsap.matchMedia()

  mm.add({ motion: '(prefers-reduced-motion: no-preference)', reduced: '(prefers-reduced-motion: reduce)' }, (context) => {
    if (context.conditions?.reduced) {
      items.forEach((el) => { seen.add(el); el.setAttribute('data-page-revealed', '') })
      return
    }
    const tweens = new Set<gsap.core.Tween>()
    const reveal = (batch: HTMLElement[]) => {
      batch.forEach((el, i) => {
        seen.add(el)
        el.setAttribute('data-page-revealed', '')
        const title = el.hasAttribute('data-page-title')
        // Only the initial arrival moves type. Geometry accents carry the personality.
        const tween = gsap.fromTo(el, {
          opacity: 0,
          x: variant === 'technical' && title ? -10 : 0,
          y: variant === 'technical' ? 0 : title ? (variant === 'cinematic' ? 24 : 16) : 10,
        }, {
          opacity: 1, x: 0, y: 0,
          duration: title ? (variant === 'cinematic' ? 0.85 : 0.65) : 0.48,
          delay: Math.min(i * 0.045, 0.18),
          ease: variant === 'kinetic' ? 'power4.out' : 'power3.out',
          clearProps: 'opacity,transform',
          onComplete: () => { tweens.delete(tween) },
        })
        tweens.add(tween)
        if (document.hidden) tween.pause()
      })
    }
    const io = new IntersectionObserver((entries) => {
      const batch = entries.filter((e) => e.isIntersecting && !seen.has(e.target)).map((e) => e.target as HTMLElement)
      // Capture geometry before GSAP starts writing styles.
      batch.forEach((el) => io.unobserve(el))
      context.add(() => reveal(batch))
    }, { threshold: 0, rootMargin: '0px 0px -24px 0px' })
    items.filter((el) => !seen.has(el)).forEach((el) => io.observe(el))
    const onVisibility = () => tweens.forEach((tween) => { document.hidden ? tween.pause() : tween.resume() })
    const onFocus = (event: FocusEvent) => {
      const block = (event.target as HTMLElement).closest<HTMLElement>('[data-page-item]')
      if (block) tweens.forEach((tween) => { if (tween.targets().includes(block)) tween.progress(1) })
    }
    document.addEventListener('visibilitychange', onVisibility)
    root.addEventListener('focusin', onFocus)
    return () => {
      io.disconnect()
      tweens.forEach((tween) => tween.kill())
      document.removeEventListener('visibilitychange', onVisibility)
      root.removeEventListener('focusin', onFocus)
    }
  }, root)

  return () => {
    mm.revert()
    items.forEach((el) => el.removeAttribute('data-page-revealed'))
    if (previous === null) root.removeAttribute('data-motion-theme')
    else root.setAttribute('data-motion-theme', previous)
  }
}

function Backdrop(): ReactElement {
  return (
    <div aria-hidden="true" className="cgs-backdrop cgs-technical-backdrop">
      <svg className="cgs-technical-trace" viewBox="0 0 320 180" fill="none">
        <path className="cgs-draw-line" pathLength="1" d="M0 140H80V90H180V30H320" />
        <circle cx="80" cy="140" r="4" /><circle cx="180" cy="90" r="4" />
      </svg>
    </div>
  )
}

export const theme: PageTheme = { name: 'technical', Backdrop, enter: (root) => enterPage(root, 'technical') }
