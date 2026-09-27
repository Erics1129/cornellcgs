import { useMemo, useRef } from 'react'
import { typing } from '../content'
import { createTextChoreography } from '../lib/editorChoreography'
import { EditorTypingText, useEditorPlayback } from '../lib/useEditorPlayback'
import '../styles/code-editor-interactions.css'

/** Illustrated phrase edits pause while offscreen, hidden, or being selected. */
export default function TypeLine() {
  const pairs = useMemo(() => typing.pairs.filter(pair => `${pair.lead}${pair.tail}`.trim()), [])
  const root = useRef<HTMLParagraphElement>(null)
  const score = useMemo(() => createTextChoreography(pairs.map(pair => `${pair.lead} ${pair.tail}`.trimEnd()), 1600), [pairs])
  const frame = useEditorPlayback(root, score)
  if (!pairs.length) return null
  return (
    <p ref={root}
      className="showcase-type-line life-float mono text-[max(1.2rem,1.1875rem)] md:text-[clamp(1.6rem,2vw,2.2rem)]"
      style={{ ['--life-dur' as string]: '10.5s', ['--life-delay' as string]: '-3.4s' }}
      aria-live="off" aria-label={score.reduced.text}
    >
      <EditorTypingText frame={frame} splitAt={pairs[frame.phrase ?? 0]?.lead.length ?? 0} caretClass="bg-[var(--neon-mid)]" />
    </p>
  )
}
