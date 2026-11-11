import { Fragment, useEffect, useRef, useState, type RefObject } from 'react'
import type { EditorFrame, TextChoreography } from './editorChoreography'
import { CHAPTER_IDS, chapter, onDeck, onSettle, type ChapterId } from './deck'

/**
 * One active-time clock, suspended by visibility, motion preferences or inspection.
 *
 * `once` (headings inside a chapter): the full text is the default. It types in
 * a single time, quickly, when its chapter comes to cover half the screen, and
 * is simply complete whenever the page comes to rest with the chapter in view
 * (at once after a teleport). It never restarts while the chapter is in view;
 * it re-arms only after the chapter has left the screen.
 */
export function useEditorPlayback(ref: RefObject<HTMLElement>, score: TextChoreography, opts: { once?: boolean; within?: number } = {}) {
  const once = !!opts.once
  const within = opts.within ?? 450
  const [frame, setFrame] = useState<EditorFrame>(() =>
    once || (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) ? score.reduced : score.at(0))
  const rendered = useRef(frame)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const commit = (next: EditorFrame) => {
      if (rendered.current === next) return
      rendered.current = next
      setFrame(next)
    }
    if (once) {
      const id = el.closest('section[id], footer[id]')?.id as ChapterId | undefined
      if (!id || !(CHAPTER_IDS as readonly string[]).includes(id) || motion.matches) {
        commit(score.reduced)
        return
      }
      // The typing of the first phrase, compressed into `within` milliseconds.
      const typed = score.duration
      let state: 'armed' | 'typing' | 'done' = 'done'
      let raf = 0
      let started = 0
      const finish = () => {
        cancelAnimationFrame(raf)
        raf = 0
        state = 'done'
        commit(score.reduced)
      }
      const step = (now: number) => {
        raf = 0
        const t = Math.min(1, (now - started) / within)
        if (t >= 1) return finish()
        commit(score.at(t * typed))
        raf = requestAnimationFrame(step)
      }
      const sync = () => {
        const s = chapter(id)
        if (!s) return
        if (!s.inView) {
          // Off screen below the reader: arm the entrance (an empty line nobody can see). Above: leave it complete.
          if (s.enter <= 0 && state === 'done') {
            state = 'armed'
            commit(score.at(0))
          }
          return
        }
        if (state === 'armed' && s.cover >= 0.5) {
          state = 'typing'
          started = performance.now()
          raf = requestAnimationFrame(step)
        }
      }
      const offDeck = onDeck(sync)
      const offSettle = onSettle((_f, reason) => {
        const s = chapter(id)
        if (!s?.inView || state === 'done') return
        if (reason === 'teleport' || document.hidden) return finish()
        if (state === 'armed') {
          state = 'typing'
          started = performance.now()
          raf = requestAnimationFrame(step)
        }
      })
      const onMotion = () => { if (motion.matches) finish() }
      motion.addEventListener('change', onMotion)
      sync()
      return () => {
        offDeck()
        offSettle()
        motion.removeEventListener('change', onMotion)
        cancelAnimationFrame(raf)
      }
    }
    let elapsed = 0
    let previous: number | null = null
    let raf = 0
    let visible = false
    let pressed = false
    let keyboardFocused = false
    let disposed = false
    const inspecting = () => {
      if (pressed || (keyboardFocused && el.contains(document.activeElement))) return true
      const selection = window.getSelection()
      if (selection && !selection.isCollapsed) {
        for (let i = 0; i < selection.rangeCount; i++) {
          if (selection.getRangeAt(i).intersectsNode(el)) return true
        }
      }
      return false
    }
    const tick = (now: number) => {
      raf = 0
      if (disposed) return
      if (previous !== null) elapsed += now - previous
      previous = now
      if (elapsed >= score.duration && score.loopFrom !== null) {
        elapsed = score.loopFrom + (elapsed - score.loopFrom) % (score.duration - score.loopFrom)
      }
      commit(score.at(elapsed))
      if (elapsed < score.duration) raf = requestAnimationFrame(tick)
    }
    const sync = () => {
      cancelAnimationFrame(raf)
      raf = 0
      previous = null
      const paused = inspecting() || !visible || document.hidden
      el.dataset.typingPaused = String(paused || motion.matches)
      if (paused) return
      if (motion.matches) commit(score.reduced)
      else if (elapsed < score.duration || score.loopFrom !== null) raf = requestAnimationFrame(tick)
    }
    const down = () => { pressed = true; keyboardFocused = false; sync() }
    const up = () => { pressed = false; sync() }
    const blur = () => { pressed = false; sync() }
    const focusIn = () => { keyboardFocused = !pressed && !!document.activeElement?.matches(':focus-visible'); sync() }
    const keyDown = () => { keyboardFocused = true; sync() }
    const focusOut = () => queueMicrotask(() => { if (!disposed) sync() })
    const preference = () => { elapsed = 0; sync() }
    const observer = new IntersectionObserver(entries => { visible = !!entries[0]?.isIntersecting; sync() })
    observer.observe(el)
    el.addEventListener('pointerdown', down)
    el.addEventListener('focusin', focusIn)
    el.addEventListener('focusout', focusOut)
    el.addEventListener('keydown', keyDown)
    document.addEventListener('pointerup', up)
    document.addEventListener('pointercancel', up)
    document.addEventListener('selectionchange', sync)
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('blur', blur)
    motion.addEventListener('change', preference)
    sync()
    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      observer.disconnect()
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('focusin', focusIn)
      el.removeEventListener('focusout', focusOut)
      el.removeEventListener('keydown', keyDown)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointercancel', up)
      document.removeEventListener('selectionchange', sync)
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('blur', blur)
      motion.removeEventListener('change', preference)
    }
  }, [ref, score, once, within])
  return frame
}

/** Inline anchors follow proportional/wrapped text without taking over native selection. */
export function EditorTypingText({ frame, caretClass = '', splitAt = 0 }: {
  frame: EditorFrame
  caretClass?: string
  splitAt?: number
}) {
  const marker = frame.pointer ? Math.round(frame.pointer.offset) : frame.caret
  const boundaries = [...new Set([0, frame.text.length, marker, splitAt,
    frame.selection?.from ?? 0, frame.selection?.to ?? 0])].filter(at => at >= 0 && at <= frame.text.length).sort((a, b) => a - b)
  const shortcut = frame.action === 'copy' ? 'Ctrl+C' : frame.action === 'paste' ? 'Ctrl+V' : frame.action === 'backspace' ? 'Backspace' : ''
  return (
    <span aria-hidden="true" className="inline-editor-text" data-typing-action={frame.action}>
      {boundaries.map((at, i) => (
        <Fragment key={at}>
          {at === marker && (
            <span className="inline-editor-anchor">
              {frame.pointer ? (
                <svg className="inline-editor-pointer" data-pressed={frame.pointer.pressed} viewBox="0 0 16 22" fill="none"
                  style={{ transform: `translateX(${(frame.pointer.offset - marker) * .6}em)` }}>
                  <path d="M2 1v17l4-4 3 6 3-1-3-6h6L2 1Z" fill="#f1f6ff" stroke="#152942" strokeWidth="1.5" strokeLinejoin="round" />
                  <circle cx="3" cy="3" r="2" fill="#8fc1ff" />
                </svg>
              ) : !frame.selection ? <i className={`inline-editor-caret ${caretClass}`} /> : null}
              {shortcut && <span className="inline-editor-shortcut" data-shortcut={shortcut} />}
            </span>
          )}
          {i < boundaries.length - 1 && (
            <span className={`${at < splitAt ? 'body-muted ' : ''}${frame.selection && at >= frame.selection.from && boundaries[i + 1] <= frame.selection.to ? 'inline-editor-selected' : ''}`}>
              {frame.text.slice(at, boundaries[i + 1])}
            </span>
          )}
        </Fragment>
      ))}
    </span>
  )
}
