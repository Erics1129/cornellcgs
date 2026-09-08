import { useLayoutEffect, useRef, type ReactNode, type CSSProperties, type RefObject } from 'react'
import { hoverLift, shadowStyle } from '../lib/cardMotion'
import '../styles/cards-motion.css'

type Props = {
  children: ReactNode
  className?: string
  style?: CSSProperties
  tiltMax?: number
  as?: 'div' | 'button' | 'article'
  onClick?: () => void
  ariaLabel?: string
  lift?: number
  shadow?: boolean
  shadowEl?: RefObject<HTMLElement | null>
}

/** The stationary shell catches the pointer; only the surface lifts. Parents
 * may deal the shell without ever sharing its transform with pointer motion. */
export default function CardShell({ children, className = '', style, tiltMax = 4, as = 'div', onClick, ariaLabel, lift = -6, shadow = true, shadowEl }: Props) {
  const root = useRef<HTMLDivElement>(null)
  const surface = useRef<HTMLDivElement>(null)
  const ownShadow = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!surface.current || !root.current) return
    return hoverLift(surface.current, {
      maxTilt: tiltMax, lift, hitArea: root.current, shadow: shadowEl?.current ?? ownShadow.current,
    })
  }, [tiltMax, lift, shadow, shadowEl])
  // onClick always gets native Enter/Space semantics, even for old div callers.
  const Tag = as === 'button' || onClick ? 'button' : as
  return (
    <div ref={root} className="card-shell">
      {shadow && !shadowEl && <div ref={ownShadow} aria-hidden="true" style={shadowStyle()} />}
      <div ref={surface} className="card-lift">
        <Tag type={Tag === 'button' ? 'button' : undefined} className={`card-material ${className}`} style={style} onClick={onClick} aria-label={ariaLabel}>
          {children}
        </Tag>
      </div>
    </div>
  )
}
