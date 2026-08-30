import { useRef, type ReactNode, type CSSProperties } from 'react'
import gsap from 'gsap'
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
    if (!q) return
    q.rx(0)
    q.ry(0)
  }

  const Tag = as as 'div'
  return (
    <Tag
      ref={ref as React.RefObject<HTMLDivElement>}
      className={className}
      style={style}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      {children}
    </Tag>
  )
}
