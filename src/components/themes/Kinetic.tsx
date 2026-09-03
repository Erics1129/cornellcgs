import type { CSSProperties, ReactElement } from 'react'
import gsap from 'gsap'
import { EASE } from '../../lib/eases'
import { prefersReducedMotion } from '../../lib/motion'
import type { PageTheme } from '../../lib/pageTheme'

/**
 * Kinetic — game-feel for /events/ and /join/. Content DROPS in like dealt
 * cards (back.out overshoot is this theme's one sanctioned accent), section
 * blocks tilt under a fine pointer, links have a springy press. Behind it, a
 * sparse field of suit marks drifts upward and a thin dial turns top-right.
 * Every moving thing is transform/opacity only.
 */

type Mark = { suit: 'spade' | 'club'; size: number; left: string; top: string; dur: number; delay: number; sway: number }

/** Sparse, desynced (negative delays land each mark mid-cycle on first paint). */
const MARKS: Mark[] = [
  { suit: 'spade', size: 18, left: '7%', top: '22%', dur: 24, delay: -3, sway: 8 },
  { suit: 'club', size: 14, left: '19%', top: '68%', dur: 28, delay: -11, sway: -10 },
  { suit: 'spade', size: 22, left: '31%', top: '41%', dur: 20, delay: -17, sway: 6 },
  { suit: 'club', size: 16, left: '46%', top: '84%', dur: 26, delay: -6, sway: -7 },
  { suit: 'spade', size: 15, left: '58%', top: '15%', dur: 30, delay: -21, sway: 10 },
  { suit: 'club', size: 20, left: '71%', top: '57%', dur: 22, delay: -9, sway: -5 },
  { suit: 'spade', size: 14, left: '84%', top: '76%', dur: 18, delay: -14, sway: 9 },
  { suit: 'club', size: 17, left: '92%', top: '33%', dur: 25, delay: -1, sway: -8 },
]

/* Scoped by the kinetic- prefix; global.css is off-limits to themes. Opacity
   rides on the wrapper so the club's overlapping lobes don't stack darker. */
const CSS = `
@keyframes kinetic-drift {
  0%   { transform: translate3d(0, 0, 0) rotate(-6deg); opacity: 0; }
  12%  { opacity: 0.06; }
  88%  { opacity: 0.06; }
  100% { transform: translate3d(var(--kinetic-sway, 0px), -34vh, 0) rotate(8deg); opacity: 0; }
}
@keyframes kinetic-spin { to { transform: rotate(360deg); } }
.kinetic-mark {
  position: absolute;
  display: block;
  color: #0a1e3f;
  opacity: 0.06;
  will-change: transform;
  animation: kinetic-drift 24s linear infinite;
}
.kinetic-mark svg { display: block; width: 100%; height: 100%; }
.kinetic-ring {
  position: absolute;
  top: 96px;
  right: clamp(16px, 6vw, 96px);
  width: 120px;
  height: 120px;
  will-change: transform;
  animation: kinetic-spin 24s linear infinite;
}
@media (prefers-reduced-motion: reduce) {
  .kinetic-mark, .kinetic-ring { animation: none; }
  .kinetic-mark { opacity: 0.06; }
}
`

function Suit({ suit }: { suit: Mark['suit'] }) {
  if (suit === 'spade') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2.5C10 6.5 4.5 9.5 4.5 14c0 2.5 1.9 4.2 4.1 4.2 1.2 0 2.2-.5 2.8-1.3-.2 1.9-1 3.5-2.4 4.6h6c-1.4-1.1-2.2-2.7-2.4-4.6.6.8 1.6 1.3 2.8 1.3 2.2 0 4.1-1.7 4.1-4.2 0-4.5-5.5-7.5-7.5-11.5z" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="7.2" r="4.2" />
      <circle cx="7.2" cy="13.6" r="4.2" />
      <circle cx="16.8" cy="13.6" r="4.2" />
      <path d="M11.2 14.5c-.2 2.8-1 4.9-2.6 6.5h6.8c-1.6-1.6-2.4-3.7-2.6-6.5z" />
    </svg>
  )
}

/** Page root must be position:relative with content stacked above z-0. */
function Backdrop(): ReactElement {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <style>{CSS}</style>
      {MARKS.map((m, i) => (
        <span
          key={i}
          className="kinetic-mark"
          style={
            {
              left: m.left,
              top: m.top,
              width: m.size,
              height: m.size,
              animationDuration: `${m.dur}s`,
              animationDelay: `${m.delay}s`,
              '--kinetic-sway': `${m.sway}px`,
            } as CSSProperties
          }
        >
          <Suit suit={m.suit} />
        </span>
      ))}
      {/* Dial: one gap + a dot so a turning circle actually reads. Circumference ≈ 367.6. */}
      <div className="kinetic-ring">
        <svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true">
          <circle
            cx="60"
            cy="60"
            r="58.5"
            fill="none"
            stroke="#e3e9f4"
            strokeWidth="1"
            strokeLinecap="round"
            strokeDasharray="331.6 36"
            transform="rotate(-90 60 60)"
          />
          <circle cx="42.3" cy="4.2" r="2" fill="#e3e9f4" />
        </svg>
      </div>
    </div>
  )
}

const hasH2 = (el: Element) => Array.from(el.children).some((c) => c.tagName === 'H2')

function enter(root: HTMLElement): () => void {
  const items = Array.from(root.querySelectorAll<HTMLElement>('[data-page-item]'))
  const title = root.querySelector<HTMLElement>('[data-page-title]')
  const disposers: Array<() => void> = []
  const finePointer = () => window.matchMedia('(pointer: fine)').matches

  const ctx = gsap.context(() => {
    if (!items.length) return

    if (prefersReducedMotion()) {
      gsap.fromTo(items, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5, ease: EASE.out })
      return
    }

    // Deal: pivot sits below each block so the -3° swing settles like a laid card.
    gsap.fromTo(
      items,
      {
        autoAlpha: 0,
        y: (_i: number, el: Element) => (el === title ? -56 : -40),
        rotation: -3,
        transformOrigin: '50% 120%',
      },
      {
        autoAlpha: 1,
        y: 0,
        rotation: 0,
        duration: 0.75,
        ease: 'back.out(1.6)',
        stagger: 0.07,
        delay: 0.1,
        // Tilt arms only once the deal has landed; ctx.add keeps its tweens revertable.
        onComplete: () => ctx.add(armTilt),
      },
    )

    armPress()
  }, root)

  /** Section blocks (the items that own an h2) tilt ±5° under a fine pointer. */
  function armTilt() {
    if (!finePointer()) return
    for (const el of items.filter(hasH2)) {
      gsap.set(el, { transformOrigin: '50% 50%', transformPerspective: 800 })
      const rx = gsap.quickTo(el, 'rotationX', { duration: 0.6, ease: EASE.out })
      const ry = gsap.quickTo(el, 'rotationY', { duration: 0.6, ease: EASE.out })
      const onMove = (e: PointerEvent) => {
        const r = el.getBoundingClientRect()
        const nx = (e.clientX - r.left) / r.width - 0.5
        const ny = (e.clientY - r.top) / r.height - 0.5
        ry(nx * 10)
        rx(-ny * 10)
      }
      const onLeave = () => {
        rx(0)
        ry(0)
      }
      el.addEventListener('pointermove', onMove)
      el.addEventListener('pointerleave', onLeave)
      disposers.push(() => {
        el.removeEventListener('pointermove', onMove)
        el.removeEventListener('pointerleave', onLeave)
      })
    }
  }

  /**
   * Springy press on every link/button. Skips inline boxes (transforms don't
   * apply) and anything whose CSS already transitions transform — a per-frame
   * GSAP scale would be smeared through that transition.
   */
  function armPress() {
    const targets = Array.from(root.querySelectorAll<HTMLElement>('a[href], button')).filter((el) => {
      const cs = getComputedStyle(el)
      return cs.display !== 'inline' && !/\b(all|transform|scale)\b/.test(cs.transitionProperty)
    })
    for (const el of targets) {
      let pressed = false
      const down = (e: PointerEvent) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        pressed = true
        ctx.add(() => gsap.to(el, { scale: 0.96, duration: 0.12, ease: EASE.out, overwrite: 'auto' }))
      }
      const up = () => {
        if (!pressed) return
        pressed = false
        ctx.add(() => gsap.to(el, { scale: 1, duration: 0.35, ease: 'back.out(2)', overwrite: 'auto' }))
      }
      el.addEventListener('pointerdown', down)
      el.addEventListener('pointerup', up)
      el.addEventListener('pointerleave', up)
      el.addEventListener('pointercancel', up)
      disposers.push(() => {
        el.removeEventListener('pointerdown', down)
        el.removeEventListener('pointerup', up)
        el.removeEventListener('pointerleave', up)
        el.removeEventListener('pointercancel', up)
      })
    }
  }

  return () => {
    for (const d of disposers) d()
    disposers.length = 0
    ctx.revert()
  }
}

export const theme: PageTheme = { name: 'kinetic', Backdrop, enter }
