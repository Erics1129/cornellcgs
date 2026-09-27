import { useMemo, useRef } from 'react'
import { createTextChoreography } from '../lib/editorChoreography'
import { EditorTypingText, useEditorPlayback } from '../lib/useEditorPlayback'
import '../styles/code-editor-interactions.css'

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
  const score = useMemo(() => createTextChoreography(alt && alt !== text ? [text, alt] : [text], hold), [text, alt, hold])
  const frame = useEditorPlayback(ref, score)

  return (
    <Tag ref={ref} className={className} aria-label={text}>
      <EditorTypingText frame={frame} caretClass={caret} />
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
  const score = useMemo(() => createTextChoreography([text], 0, false), [text])
  const frame = useEditorPlayback(ref, score)

  return (
    <p ref={ref} className={className} aria-label={text}>
      {/* the full text sits invisible underneath so the block keeps its final height while typing */}
      <span aria-hidden="true" className="invisible block h-0 overflow-hidden">
        {text}
      </span>
      <EditorTypingText frame={frame} caretClass={caret} />
    </p>
  )
}
