import { useEffect, useRef, useState } from 'react'
import { typing } from '../content'
import { prefersReducedMotion } from '../lib/motion'

/**
 * The hero typing line (§5.4). Types each research topic letter by letter with
 * slightly random speed, holds, deletes, moves on. Blinking block cursor.
 */
export default function TypeLine() {
  const [text, setText] = useState('')
  const idx = useRef(0)
  const timer = useRef<number>(0)

  useEffect(() => {
    if (prefersReducedMotion()) {
      setText(typing.words[0])
      const cycle = window.setInterval(() => {
        idx.current = (idx.current + 1) % typing.words.length
        setText(typing.words[idx.current])
      }, 3200)
      return () => window.clearInterval(cycle)
    }

    let alive = true
    const schedule = (fn: () => void, ms: number) => {
      timer.current = window.setTimeout(() => {
        if (alive) fn()
      }, ms)
    }

    const typeWord = (word: string, at: number) => {
      if (at <= word.length) {
        setText(word.slice(0, at))
        schedule(() => typeWord(word, at + 1), 55 + Math.random() * 35)
      } else {
        schedule(() => deleteWord(word, word.length), 1600)
      }
    }

    const deleteWord = (word: string, at: number) => {
      if (at >= 0) {
        setText(word.slice(0, at))
        schedule(() => deleteWord(word, at - 1), 35)
      } else {
        idx.current = (idx.current + 1) % typing.words.length
        schedule(() => typeWord(typing.words[idx.current], 0), 260)
      }
    }

    typeWord(typing.words[0], 0)
    return () => {
      alive = false
      window.clearTimeout(timer.current)
    }
  }, [])

  return (
    <p className="mono text-[max(1.05rem,17px)] md:text-[max(1.35rem,22px)]" aria-live="off">
      <span className="body-muted">{typing.prefix}</span>
      <span className="text-[var(--text)]">{text}</span>
      <span
        className="ml-[2px] inline-block h-[1.15em] w-[0.55em] translate-y-[0.22em] animate-[cursor-blink_1.1s_steps(2)_infinite] bg-[var(--neon-mid)]"
        aria-hidden="true"
      />
    </p>
  )
}
