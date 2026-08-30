import { useEffect, useRef, useState } from 'react'
import { typing } from '../content'
import { prefersReducedMotion } from '../lib/motion'

/**
 * The hero typing line (§5.4). Whole phrases rotate — the lead verb changes
 * too ("We do research in…", "We study…", "We build…"). Letters type at
 * 55–90 ms with slight randomness, hold 1.6 s, delete fast, move on.
 * The lead renders muted, the tail bright, with a blinking block cursor.
 */
export default function TypeLine() {
  const [text, setText] = useState('')
  const [leadLen, setLeadLen] = useState(typing.pairs[0].lead.length)
  const idx = useRef(0)
  const timer = useRef<number>(0)

  useEffect(() => {
    const phrase = (i: number) => `${typing.pairs[i].lead} ${typing.pairs[i].tail}`

    if (prefersReducedMotion()) {
      setText(phrase(0))
      const cycle = window.setInterval(() => {
        idx.current = (idx.current + 1) % typing.pairs.length
        setLeadLen(typing.pairs[idx.current].lead.length)
        setText(phrase(idx.current))
      }, 3200)
      return () => window.clearInterval(cycle)
    }

    let alive = true
    const schedule = (fn: () => void, ms: number) => {
      timer.current = window.setTimeout(() => {
        if (alive) fn()
      }, ms)
    }

    const typePhrase = (full: string, at: number) => {
      if (at <= full.length) {
        setText(full.slice(0, at))
        schedule(() => typePhrase(full, at + 1), 55 + Math.random() * 35)
      } else {
        schedule(() => deletePhrase(full, full.length), 1600)
      }
    }

    const deletePhrase = (full: string, at: number) => {
      if (at >= 0) {
        setText(full.slice(0, at))
        schedule(() => deletePhrase(full, at - 1), 26)
      } else {
        idx.current = (idx.current + 1) % typing.pairs.length
        setLeadLen(typing.pairs[idx.current].lead.length)
        schedule(() => typePhrase(phrase(idx.current), 0), 260)
      }
    }

    typePhrase(phrase(0), 0)
    return () => {
      alive = false
      window.clearTimeout(timer.current)
    }
  }, [])

  return (
    <p className="mono text-[max(1.05rem,17px)] md:text-[max(1.35rem,22px)]" aria-live="off">
      <span className="body-muted">{text.slice(0, leadLen)}</span>
      <span className="text-[var(--text)]">{text.slice(leadLen)}</span>
      <span
        className="ml-[2px] inline-block h-[1.15em] w-[0.55em] translate-y-[0.22em] animate-[cursor-blink_1.1s_steps(2)_infinite] bg-[var(--neon-mid)]"
        aria-hidden="true"
      />
    </p>
  )
}
