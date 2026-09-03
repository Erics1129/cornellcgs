import type { ReactElement } from 'react'
import gsap from 'gsap'
import { EASE } from '../../lib/eases'
import { prefersReducedMotion } from '../../lib/motion'
import type { PageTheme } from '../../lib/pageTheme'

/**
 * Organic — people, softness (/ourTeam/, /advisors/, /world/).
 *
 * Three colour fields drift behind the sheet on transform-only keyframe
 * loops (the blur is static). Content blooms in rather than slides; once a
 * section block has arrived it breathes on a slow sine and, on a fine
 * pointer, leans toward the cursor. The breathe and the lean share ONE
 * per-frame writer so the two never fight over the same transform.
 */

const FLOAT_PX = 4 // breathe amplitude
const FLOAT_LEG = 6 // seconds per leg; yoyo → 12 s cycle
const FLOAT_CYCLE = FLOAT_LEG * 2
const PHASE_STEP = 0.382 // golden-ratio fraction of a cycle — spreads phases without a visible pattern
const LEAN_PX = 6 // magnetic clamp

/* Scoped to organic-* names; global.css stays untouched. */
const CSS = `
.organic-bd{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0}
.organic-blob{position:absolute;border-radius:50%;filter:blur(46px);will-change:transform;animation-timing-function:ease-in-out;animation-iteration-count:infinite;animation-direction:alternate}
.organic-blob-a{width:420px;height:420px;top:-140px;left:-120px;background:oklch(0.82 0.09 262 / 0.5);animation-name:organic-drift-a;animation-duration:15s;animation-delay:-4s}
.organic-blob-b{width:380px;height:380px;top:42%;right:-160px;background:oklch(0.84 0.09 300 / 0.42);animation-name:organic-drift-b;animation-duration:13s;animation-delay:-9s}
.organic-blob-c{width:440px;height:440px;bottom:10%;left:50%;margin-left:-220px;background:oklch(0.86 0.08 220 / 0.45);animation-name:organic-drift-c;animation-duration:17s;animation-delay:-6s}
@keyframes organic-drift-a{from{transform:translate3d(0,0,0) scale(1)}to{transform:translate3d(90px,70px,0) scale(1.14)}}
@keyframes organic-drift-b{from{transform:translate3d(0,0,0) scale(1.06)}to{transform:translate3d(-70px,80px,0) scale(0.92)}}
@keyframes organic-drift-c{from{transform:translate3d(0,0,0) scale(0.96)}to{transform:translate3d(60px,-100px,0) scale(1.18)}}
@media (prefers-reduced-motion:reduce){.organic-blob{animation:none}}
`

function Backdrop(): ReactElement {
  return (
    <div aria-hidden="true" className="organic-bd">
      <style>{CSS}</style>
      <div className="organic-blob organic-blob-a" />
      <div className="organic-blob organic-blob-b" />
      <div className="organic-blob organic-blob-c" />
    </div>
  )
}

/**
 * Runs after a section block has bloomed. All tweens are created inside
 * the caller's gsap.context (via ctx.add) so revert() kills them.
 */
function breathe(
  el: HTMLElement,
  phase: number,
  fine: boolean,
  dpr: number,
  disposers: Array<() => void>,
) {
  const s = { lx: 0, ly: 0, fy: 0, amp: 0 }

  // Stay composited: per-frame writes must never re-rasterise the block.
  gsap.set(el, { force3D: true })
  const sx = gsap.quickSetter(el, 'x', 'px') as (v: number) => void
  const sy = gsap.quickSetter(el, 'y', 'px') as (v: number) => void

  // Snap to device pixels so type stays crisp while it moves.
  const snap = (v: number) => Math.round(v * dpr) / dpr
  const apply = () => {
    sx(snap(s.lx))
    sy(snap(s.ly + s.fy * s.amp))
  }

  gsap
    .fromTo(
      s,
      { fy: -FLOAT_PX },
      { fy: FLOAT_PX, duration: FLOAT_LEG, ease: 'sine.inOut', repeat: -1, yoyo: true, onUpdate: apply },
    )
    .totalTime(phase * FLOAT_CYCLE)
  // Amplitude ramps from 0 so the staggered phase never lands as a jump.
  gsap.to(s, { amp: 1, duration: 2, ease: 'sine.inOut' })

  if (!fine) return

  const qx = gsap.quickTo(s, 'lx', { duration: 0.6, ease: EASE.out })
  const qy = gsap.quickTo(s, 'ly', { duration: 0.6, ease: EASE.out })
  const clamp = gsap.utils.clamp(-LEAN_PX, LEAN_PX)

  const onMove = (e: PointerEvent) => {
    const r = el.getBoundingClientRect()
    const nx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2)
    const ny = (e.clientY - (r.top + r.height / 2)) / (r.height / 2)
    qx(clamp(nx * LEAN_PX))
    qy(clamp(ny * LEAN_PX))
  }
  const onLeave = () => {
    qx(0)
    qy(0)
  }

  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerleave', onLeave)
  disposers.push(() => {
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerleave', onLeave)
  })
}

function enter(root: HTMLElement): () => void {
  const items = Array.from(root.querySelectorAll<HTMLElement>('[data-page-item]'))
  const title = root.querySelector<HTMLElement>('[data-page-title]')
  const disposers: Array<() => void> = []

  const ctx = gsap.context((self) => {
    if (prefersReducedMotion()) {
      gsap.fromTo(items, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5, ease: EASE.out })
      return
    }

    // Layout reads first — the fromTo below writes immediately.
    const rootW = root.clientWidth
    const fullBleed = items.map((el) => el.getBoundingClientRect().width >= rootW - 1)
    const fine = window.matchMedia('(pointer: fine)').matches
    const dpr = window.devicePixelRatio || 1
    let blocks = 0

    const tl = gsap.timeline({ delay: 0.1 })
    items.forEach((el, i) => {
      const isTitle = el === title
      const isBlock = el.querySelector('h2') !== null
      const phase = isBlock ? (blocks++ * PHASE_STEP) % 1 : 0
      tl.fromTo(
        el,
        {
          autoAlpha: 0,
          // A full-bleed item (the navy band) must not show white at its edges.
          scale: fullBleed[i] ? 1 : isTitle ? 0.94 : 0.96,
          y: isTitle ? 14 : 10,
          transformOrigin: '50% 60%',
        },
        {
          autoAlpha: 1,
          scale: 1,
          y: 0,
          duration: isTitle ? 0.9 : 0.7,
          ease: EASE.out,
          onComplete: () => {
            if (isBlock) self.add(() => breathe(el, phase, fine, dpr, disposers))
            else gsap.set(el, { clearProps: 'transform' })
          },
        },
        i * 0.08,
      )
    })
  }, root)

  return () => {
    disposers.splice(0).forEach((d) => d())
    ctx.revert()
  }
}

export const theme: PageTheme = {
  name: 'organic',
  Backdrop,
  enter,
}
