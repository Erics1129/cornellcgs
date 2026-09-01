import { useRef, type ReactNode, type CSSProperties } from 'react'
import gsap from 'gsap'
import { EASE } from '../lib/eases'
import { prefersReducedMotion, isTouchDevice } from '../lib/motion'

type Props = {
  children: ReactNode
  className?: string
  style?: CSSProperties
  /** max tilt toward the cursor, degrees */
  tiltMax?: number
  as?: 'div' | 'button' | 'article'
  onClick?: () => void
  ariaLabel?: string
}

/**
 * A DOM playing card that tilts toward the cursor like a card lifted from a
 * table (§6). Visual style (ivory face / navy back) comes from className.
 * Pointer hover lifts the card off the table; a ground-shadow div beneath it
 * (gradient falloff, never box-shadow) tightens as the card rises —
 * transform/opacity only on both.
 */
export default function CardShell({
  children,
  className = '',
  style,
  tiltMax = 8,
  as = 'div',
  onClick,
  ariaLabel,
}: Props) {
  const ref = useRef<HTMLDivElement | HTMLButtonElement>(null)
  const shadowRef = useRef<HTMLDivElement>(null)
  const quick = useRef<{
    rx: ReturnType<typeof gsap.quickTo>
    ry: ReturnType<typeof gsap.quickTo>
  } | null>(null)

  const ensureQuick = () => {
    if (!quick.current && ref.current) {
      gsap.set(ref.current, { transformPerspective: 900 })
      quick.current = {
        rx: gsap.quickTo(ref.current, 'rotationX', { duration: 0.5, ease: 'power2.out' }),
        ry: gsap.quickTo(ref.current, 'rotationY', { duration: 0.5, ease: 'power2.out' }),
      }
    }
    return quick.current
  }

  const onEnter = () => {
    if (prefersReducedMotion() || isTouchDevice()) return
    const el = ref.current
    if (!el) return
    gsap.to(el, { y: -6, scale: 1.02, duration: 0.4, ease: 'power3.out', overwrite: 'auto' })
    if (shadowRef.current)
      gsap.to(shadowRef.current, {
        opacity: 0.8,
        scale: 0.94,
        duration: 0.4,
        ease: 'power3.out',
        overwrite: 'auto',
      })
  }

  const onMove = (e: React.PointerEvent) => {
    if (prefersReducedMotion() || isTouchDevice()) return
    const el = ref.current
    const q = ensureQuick()
    if (!el || !q) return
    const r = el.getBoundingClientRect()
    const nx = (e.clientX - r.left) / r.width - 0.5
    const ny = (e.clientY - r.top) / r.height - 0.5
    q.ry(nx * tiltMax * 2)
    q.rx(-ny * tiltMax * 2)
  }

  const onLeave = () => {
    const q = quick.current
    if (q) {
      q.rx(0)
      q.ry(0)
    }
    const el = ref.current
    if (!el) return
    gsap.to(el, { y: 0, scale: 1, duration: 0.6, ease: EASE.out, overwrite: 'auto' })
    if (shadowRef.current)
      gsap.to(shadowRef.current, {
        opacity: 0.55,
        scale: 1,
        duration: 0.6,
        ease: EASE.out,
        overwrite: 'auto',
      })
  }

  const Tag = as as 'div'
  return (
    <div className="relative">
      <div
        ref={shadowRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-[7%] bottom-[-12px] h-7 rounded-[100%] bg-[radial-gradient(50%_50%_at_50%_50%,rgba(2,5,16,0.6),rgba(2,5,16,0.28)_52%,transparent_76%)] opacity-55"
      />
      <Tag
        ref={ref as React.RefObject<HTMLDivElement>}
        className={className}
        style={style}
        onPointerEnter={onEnter}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        onClick={onClick}
        aria-label={ariaLabel}
      >
        {children}
      </Tag>
    </div>
  )
}
