import { useEffect, useRef, type ReactNode, type CSSProperties } from 'react'
import gsap from 'gsap'
import { EASE } from '../lib/eases'
import { prefersReducedMotion, isTouchDevice } from '../lib/motion'

type Props = {
  children: ReactNode
  className?: string
  style?: CSSProperties
  /** max tilt toward the cursor, degrees (full tilt at the card's edge) */
  tiltMax?: number
  as?: 'div' | 'button' | 'article'
  onClick?: () => void
  ariaLabel?: string
  /** how far the card rises under the pointer, px (negative = up) */
  lift?: number
  /** render the built-in ground shadow (default true) */
  shadow?: boolean
  /**
   * An external shadow element to drive instead of the built-in one — for
   * callers that keep the table shadow outside the element they deal or flip
   * (see lib/cardMotion shadowStyle()). When given, the built-in shadow is
   * not rendered.
   */
  shadowEl?: React.RefObject<HTMLElement | null>
}

/** hoverLift semantics (lib/cardMotion): rise, tilt toward the pointer, shadow spreads */
const HOVER = { scale: 1.03, shadowScale: 1.08, shadowOpacity: 0.7 }
const REST = { scale: 1, shadowScale: 1, shadowOpacity: 0.55 }
const FOLLOW = { duration: 0.45, ease: EASE.out }

type Writers = {
  rx: ReturnType<typeof gsap.quickTo>
  ry: ReturnType<typeof gsap.quickTo>
  y: ReturnType<typeof gsap.quickTo>
  s: ReturnType<typeof gsap.quickTo>
  ss: ReturnType<typeof gsap.quickTo> | null
  so: ReturnType<typeof gsap.quickTo> | null
}

/**
 * A DOM playing card lifted from the table under the pointer (§6): it rises,
 * tilts toward the cursor with real perspective, and its ground shadow
 * spreads and softens as it comes up — the hoverLift semantics of
 * lib/cardMotion, written through quickTo so a quick re-entry never fights a
 * leave tween. Visual style (ivory face / navy back) comes from className.
 * Transform/opacity only on both card and shadow; the shadow is a gradient
 * div, never box-shadow. Fine pointers only; reduced motion → inert.
 */
export default function CardShell({
  children,
  className = '',
  style,
  tiltMax = 8,
  as = 'div',
  onClick,
  ariaLabel,
  lift = -10,
  shadow = true,
  shadowEl,
}: Props) {
  const ref = useRef<HTMLDivElement | HTMLButtonElement>(null)
  const ownShadowRef = useRef<HTMLDivElement>(null)
  const writers = useRef<Writers | null>(null)

  const shadowNode = () => shadowEl?.current ?? ownShadowRef.current

  // One writer per property, created on the first pointer event so resting
  // cards carry no transform until they are actually touched.
  const ensure = () => {
    const el = ref.current
    if (!writers.current && el) {
      gsap.set(el, { transformPerspective: 900, transformOrigin: '50% 50%' })
      const sh = shadowNode()
      if (sh) gsap.set(sh, { transformOrigin: '50% 50%' })
      writers.current = {
        rx: gsap.quickTo(el, 'rotationX', FOLLOW),
        ry: gsap.quickTo(el, 'rotationY', FOLLOW),
        y: gsap.quickTo(el, 'y', FOLLOW),
        s: gsap.quickTo(el, 'scale', FOLLOW),
        ss: sh ? gsap.quickTo(sh, 'scale', FOLLOW) : null,
        so: sh ? gsap.quickTo(sh, 'opacity', FOLLOW) : null,
      }
    }
    return writers.current
  }

  // Writers hold tweens on the DOM node — drop them with the node
  useEffect(() => () => {
    writers.current = null
  }, [])

  const active = () => !prefersReducedMotion() && !isTouchDevice()

  const onEnter = () => {
    if (!active()) return
    const w = ensure()
    if (!w) return
    w.y(lift)
    w.s(HOVER.scale)
    w.ss?.(HOVER.shadowScale)
    w.so?.(HOVER.shadowOpacity)
  }

  const onMove = (e: React.PointerEvent) => {
    if (!active()) return
    const el = ref.current
    const w = ensure()
    if (!el || !w) return
    const r = el.getBoundingClientRect()
    const nx = (e.clientX - r.left) / r.width - 0.5
    const ny = (e.clientY - r.top) / r.height - 0.5
    w.ry(nx * tiltMax * 2)
    w.rx(-ny * tiltMax * 2)
  }

  const onLeave = () => {
    const w = writers.current
    if (!w) return
    w.rx(0)
    w.ry(0)
    w.y(0)
    w.s(REST.scale)
    w.ss?.(REST.shadowScale)
    w.so?.(REST.shadowOpacity)
  }

  const Tag = as as 'div'
  return (
    <div className="relative">
      {shadow && !shadowEl && (
        <div
          ref={ownShadowRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-[7%] bottom-[-0.75rem] h-7 rounded-[100%] bg-[radial-gradient(50%_50%_at_50%_50%,rgba(2,5,16,0.6),rgba(2,5,16,0.28)_52%,transparent_76%)] opacity-55"
        />
      )}
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
