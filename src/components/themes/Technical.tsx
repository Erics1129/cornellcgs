import type { ReactElement } from 'react'
import gsap from 'gsap'
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin'
import type { PageTheme } from '../../lib/pageTheme'
import { EASE } from '../../lib/eases'
import { prefersReducedMotion } from '../../lib/motion'

gsap.registerPlugin(ScrambleTextPlugin)

/**
 * Technical — "lab, not firm" (/whatWeDo/, /mlProcess/). A blueprint grid
 * and one slow scan band sit behind the sheet; the title decodes in once,
 * the rest arrives on a short stagger, and each section block wears a
 * hairline that turns blue under a fine pointer.
 */

const CHARS = '{}[]()<>=+*/;:#01'
const HAIRLINE = 'rgba(10,30,63,0.06)'
const RULE = '#e3e9f4'
const BLUE = '#1e5eff'

/* Scoped to technical-* names; the band is transform-only, the caret is static. */
const CSS = `
@keyframes technical-scan {
  from { transform: translate3d(0, -100%, 0); }
  to { transform: translate3d(0, 100vh, 0); }
}
.technical-scan {
  animation: technical-scan 7s linear infinite;
}
.technical-h2::after {
  content: '';
  display: inline-block;
  width: 0.42em;
  height: 0.78em;
  margin-left: 0.28em;
  vertical-align: -0.06em;
  background: ${BLUE};
}
@media (prefers-reduced-motion: reduce) {
  .technical-scan { animation: none; display: none; }
}
`

/* The vignette is a mask on the grid itself, not a white overlay: the layer
   must never paint anything opaque, since in-flow page content that isn't
   lifted above z-index 0 would otherwise be washed out. Static masks only. */
const SIDE_FADE = 'linear-gradient(90deg, transparent, #000 20%, #000 80%, transparent)'
const END_FADE = 'linear-gradient(180deg, transparent, #000 240px, #000 calc(100% - 240px), transparent)'

function Backdrop(): ReactElement {
  const reduced = prefersReducedMotion()
  return (
    <div
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}
    >
      <style>{CSS}</style>
      <div style={{ position: 'absolute', inset: 0, WebkitMaskImage: SIDE_FADE, maskImage: SIDE_FADE }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `linear-gradient(${HAIRLINE} 1px, transparent 1px), linear-gradient(90deg, ${HAIRLINE} 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
            WebkitMaskImage: END_FADE,
            maskImage: END_FADE,
          }}
        />
      </div>
      {/* Viewport-fixed so every scroll position gets the sweep; the root has no transform, so fixed stays fixed. */}
      {!reduced && (
        <div
          className="technical-scan"
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            top: 0,
            height: 120,
            background:
              'linear-gradient(180deg, rgba(30,94,255,0) 0%, rgba(30,94,255,0.10) 50%, rgba(30,94,255,0) 100%)',
            WebkitMaskImage: SIDE_FADE,
            maskImage: SIDE_FADE,
          }}
        />
      )}
    </div>
  )
}

function enter(root: HTMLElement): () => void {
  const items = Array.from(root.querySelectorAll<HTMLElement>('[data-page-item]'))
  const title = root.querySelector<HTMLElement>('[data-page-title]')
  const rest = items.filter((el) => el !== title)
  const blocks = items.filter((el) => el.querySelector('h2'))
  const original = title?.textContent ?? ''
  const undo: Array<() => void> = []

  /* Static lab dressing — present under reduced motion too. Outline (not
     border) so the hairline costs no layout; offset outward because the
     blocks carry no padding. */
  for (const block of blocks) {
    const h2 = block.querySelector('h2')
    h2?.classList.add('technical-h2')
    block.style.outline = `1px solid ${RULE}`
    block.style.outlineOffset = '12px'
    undo.push(() => {
      h2?.classList.remove('technical-h2')
      block.style.outline = ''
      block.style.outlineOffset = ''
    })
  }

  const ctx = gsap.context(() => {
    if (prefersReducedMotion()) {
      gsap.fromTo(items, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5, ease: EASE.out })
      return
    }

    gsap.fromTo(
      rest,
      { autoAlpha: 0, y: 14 },
      { autoAlpha: 1, y: 0, duration: 0.5, ease: EASE.out, stagger: 0.06, delay: 0.35 },
    )

    if (title) {
      /* The scrambled run has no break opportunities; let it wrap inside
         the title's max-width like the real words do. */
      title.style.overflowWrap = 'anywhere'
      const restore = () => {
        title.textContent = original
        title.style.overflowWrap = ''
      }
      undo.push(restore)
      gsap.set(title, { autoAlpha: 1 })
      gsap
        .to(title, {
          duration: 1.1,
          ease: 'none',
          scrambleText: {
            text: original,
            chars: CHARS,
            revealDelay: 0.15,
            tweenLength: false,
            speed: 0.4,
          },
          onComplete: restore,
        })
        /* Write the first scrambled frame now so the real title never paints ahead of its decode. */
        .progress(0.0001)
    }

    if (window.matchMedia('(pointer: fine)').matches) {
      for (const block of blocks) {
        block.style.transition = 'outline-color 0.25s var(--ease-out)'
        const on = () => {
          block.style.outlineColor = BLUE
        }
        const off = () => {
          block.style.outlineColor = RULE
        }
        block.addEventListener('pointerenter', on)
        block.addEventListener('pointerleave', off)
        undo.push(() => {
          block.removeEventListener('pointerenter', on)
          block.removeEventListener('pointerleave', off)
          block.style.transition = ''
          block.style.outlineColor = ''
        })
      }
    }
  }, root)

  return () => {
    ctx.revert()
    for (const fn of undo.splice(0)) fn()
  }
}

export const theme: PageTheme = { name: 'technical', Backdrop, enter }
