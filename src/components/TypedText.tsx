import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '../lib/motion'

/**
 * Typed copy for the sub-pages — the same voice as the hero line. A heading
 * keeps talking: it types its line, holds, deletes, types its alternate,
 * and never settles. A body types itself once when it scrolls into view and
 * then sits under a live caret. Both are plain state updates on a timer;
 * nothing here touches layout beyond the text itself.
 */

const CARET = 'ml-[2px] inline-block w-[0.5em] translate-y-[0.14em] [animation:cursor-blink_1.1s_steps(2)_infinite]'

/**
 * The other live voice (the advisors page): no typing. Each letter of a
 * heading rides its own phase of a slow wave, and body copy carries a light
 * that sweeps through the words. CSS only (global.css .wave-letter,
 * .life-shimmer); nothing here runs a timer.
 */
export function WaveHeading({
  text,
  className = '',
  as: Tag = 'h2',
}: {
  text: string
  className?: string
  as?: 'h1' | 'h2' | 'h3'
}) {
  return (
    <Tag className={className} aria-label={text}>
      {Array.from(text).map((ch, i) =>
        ch === ' ' ? (
          <span key={i} aria-hidden="true">
            {' '}
          </span>
        ) : (
          <span
            key={i}
            aria-hidden="true"
            className="wave-letter"
            style={{ ['--life-delay' as string]: `${-(i * 0.11)}s` }}
          >
            {ch}
          </span>
        ),
      )}
    </Tag>
  )
}

/** Body copy with a light sweeping through it — navy, blue, navy. */
export function ShimmerText({
  text,
  className = '',
  delay = 0,
}: {
  text: string
  className?: string
  delay?: number
}) {
  return (
    <p
      className={`life-shimmer text-transparent [background-clip:text] [background-image:linear-gradient(100deg,#46587a_0%,#46587a_38%,#1e5eff_50%,#46587a_62%,#46587a_100%)] [-webkit-background-clip:text] ${className}`}
      style={{ ['--life-dur' as string]: '6.5s', ['--life-delay' as string]: `${-delay}s` }}
    >
      {text}
    </p>
  )
}

function useNear(ref: React.RefObject<Element | null>, margin = '15% 0px') {
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (es) => {
        if (es[0]?.isIntersecting) {
          setNear(true)
          io.disconnect()
        }
      },
      { rootMargin: margin },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [ref])
  return near
}

/** Heading that alternates between `text` and `alt` forever. */
export function TypedHeading({
  text,
  alt,
  className = '',
  as: Tag = 'h2',
  hold = 2600,
  caret = 'bg-[#1e5eff]',
}: {
  text: string
  alt?: string
  className?: string
  as?: 'h1' | 'h2' | 'h3'
  hold?: number
  /** caret colour class — blue on the white sheets, neon on the deck */
  caret?: string
}) {
  const ref = useRef<HTMLHeadingElement>(null)
  const near = useNear(ref)
  const [shown, setShown] = useState(prefersReducedMotion() ? text : '')
  const lines = alt ? [text, alt] : [text]

  useEffect(() => {
    if (!near || prefersReducedMotion()) return
    let alive = true
    let timer = 0
    let li = 0
    const wait = (fn: () => void, ms: number) => {
      timer = window.setTimeout(() => alive && fn(), ms)
    }
    const type = (full: string, at: number) => {
      setShown(full.slice(0, at))
      if (at < full.length) wait(() => type(full, at + 1), 34 + Math.random() * 40)
      else if (lines.length > 1) wait(() => erase(full, full.length), hold)
    }
    const erase = (full: string, at: number) => {
      setShown(full.slice(0, at))
      if (at > 0) wait(() => erase(full, at - 1), 18)
      else {
        li = (li + 1) % lines.length
        wait(() => type(lines[li], 0), 320)
      }
    }
    wait(() => type(lines[0], 0), 120)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near])

  return (
    <Tag ref={ref} className={className} aria-label={text}>
      <span aria-hidden="true">{shown}</span>
      <span aria-hidden="true" className={`${CARET} ${caret} h-[0.9em]`} />
    </Tag>
  )
}

/** Body copy that types once on enter, ~12 ms a character, then keeps its caret. */
export function TypedBody({
  text,
  className = '',
  caret = 'bg-[#1e5eff]',
}: {
  text: string
  className?: string
  caret?: string
}) {
  const ref = useRef<HTMLParagraphElement>(null)
  const near = useNear(ref)
  const [n, setN] = useState(prefersReducedMotion() ? text.length : 0)

  useEffect(() => {
    if (!near || prefersReducedMotion()) return
    let alive = true
    let raf = 0
    const t0 = performance.now() + 380
    const perChar = Math.max(9, Math.min(16, 1400 / Math.max(1, text.length)))
    const tick = (now: number) => {
      if (!alive) return
      const k = Math.max(0, Math.min(text.length, Math.floor((now - t0) / perChar)))
      setN(k)
      if (k < text.length) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      alive = false
      cancelAnimationFrame(raf)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near])

  return (
    <p ref={ref} className={className} aria-label={text}>
      {/* the full text sits invisible underneath so the block keeps its final height while typing */}
      <span aria-hidden="true" className="invisible block h-0 overflow-hidden">
        {text}
      </span>
      <span aria-hidden="true">{text.slice(0, n)}</span>
      <span aria-hidden="true" className={`${CARET} ${caret} h-[1em]`} />
    </p>
  )
}
