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

/**
 * A chapter heading that types itself in once. The full text is the default
 * (and the accessible name); it types in within 450 ms when its chapter comes
 * to cover half the screen, is simply complete whenever the page rests there
 * (at once after a teleport), and never restarts while the chapter is in view.
 * `alt` and `hold` are accepted for older call sites; nothing alternates any
 * more, so a reader who stops never finds a half-typed word.
 */
export function TypedHeading({
  text,
  className = '',
  as: Tag = 'h2',
  caret = 'bg-[#cc9f51]',
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
  const score = useMemo(() => createTextChoreography([text], 0, false), [text])
  const frame = useEditorPlayback(ref, score, { once: true, within: 450 })

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
  caret = 'bg-[#cc9f51]',
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
