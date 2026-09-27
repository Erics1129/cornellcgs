import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createEditorChoreography, type EditorFrame } from '../lib/editorChoreography'
import '../styles/showcase-motion.css'
import '../styles/code-editor-interactions.css'

type Mode = 'ts' | 'md' | 'sh'
type Token = { text: string; kind: string; start: number }
export type CodePanelHandle = {
  setProgress: (progress: number, followCaret?: boolean) => void
  rewindViewport: () => void
}

// Strings precede comments so https:// inside a string is never a comment.
const TOKEN = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/.*$|\b(?:const|let|function|return|if|else|for|new|type|number|boolean|export)\b|\b\d+(?:e\d+)?\b)/g
function tokenize(text: string, mode: Mode): Token[] {
  if (mode !== 'ts') return [{ text, start: 0, kind: mode === 'md' && /^[#>]/.test(text) ? 'keyword' : 'plain' }]
  const tokens: Token[] = []
  let cursor = 0
  for (const match of text.matchAll(TOKEN)) {
    const at = match.index!
    if (at > cursor) tokens.push({ text: text.slice(cursor, at), start: cursor, kind: 'plain' })
    const value = match[0]
    tokens.push({ text: value, start: at, kind: value.startsWith('//') ? 'comment' : /^["'`]/.test(value) ? 'string' : /^\d/.test(value) ? 'number' : 'keyword' })
    cursor = at + value.length
  }
  if (cursor < text.length) tokens.push({ text: text.slice(cursor), start: cursor, kind: 'plain' })
  return tokens
}

function paintLine(node: HTMLElement, text: string, mode: Mode, from: number, to: number) {
  const fragment = document.createDocumentFragment()
  for (const token of tokenize(text, mode)) {
    const end = token.start + token.text.length
    const cuts = [...new Set([token.start, end, Math.max(token.start, Math.min(end, from)), Math.max(token.start, Math.min(end, to))])].sort((a, b) => a - b)
    for (let i = 1; i < cuts.length; i++) {
      const span = document.createElement('span')
      span.className = `code-syntax-${token.kind}${cuts[i - 1] >= from && cuts[i] <= to ? ' code-simulated-selection' : ''}`
      span.dataset.codeToken = ''
      span.textContent = text.slice(cuts[i - 1], cuts[i])
      fragment.append(span)
    }
  }
  node.replaceChildren(fragment)
}

/** The parent owns the clock; all edits and mouse gestures are seekable snapshots. */
const CodePanel = forwardRef<CodePanelHandle, {
  lines: string[]
  title: string
  mode?: Mode
  className?: string
}>(function CodePanel({ lines, title, mode = 'ts', className = '' }, ref) {
  const root = useRef<HTMLDivElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const write = useRef<(progress: number, followCaret?: boolean) => void>(() => {})
  const rewind = useRef<() => void>(() => {})
  const requested = useRef({ progress: 1, follow: true })
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied' | 'failed'>('idle')
  const copyTimer = useRef<ReturnType<typeof setTimeout>>()
  const copyRequest = useRef(0)
  const copying = useRef(false)
  const model = useMemo(() => createEditorChoreography(lines, mode), [lines, mode])

  useEffect(() => () => {
    copyRequest.current++
    copying.current = false
    clearTimeout(copyTimer.current)
  }, [])

  const copyCode = async () => {
    if (copying.current) return
    copying.current = true
    const request = ++copyRequest.current
    clearTimeout(copyTimer.current)
    setCopyState('copying')
    try {
      // Only this real button handler may write. Copy the complete supplied code.
      await navigator.clipboard.writeText(lines.join('\n'))
      if (request === copyRequest.current) setCopyState('copied')
    } catch {
      if (request === copyRequest.current) setCopyState('failed')
    } finally {
      if (request === copyRequest.current) {
        copying.current = false
        copyTimer.current = setTimeout(() => setCopyState('idle'), 2400)
      }
    }
  }

  useLayoutEffect(() => {
    const el = root.current!
    const body = viewport.current!
    const status = el.querySelector<HTMLElement>('[data-editor-status]')!
    const rows = Array.from(body.querySelectorAll<HTMLElement>('[data-code-row]')).map(node => ({
      node,
      text: node.querySelector<HTMLElement>('[data-code-text]')!,
      caret: node.querySelector<HTMLElement>('[data-code-caret]')!,
      pointer: node.querySelector<SVGElement>('[data-code-pointer]')!,
      key: '',
    }))
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let rowBottoms: number[] = []
    let viewportHeight = 0
    let viewportWidth = 0
    let characterWidth = 0
    let lineLeft = 0
    let pressed = false
    let keyboardFocused = false
    let paused = false
    let disposed = false
    let pendingRewind = false
    let lastFrame: EditorFrame | undefined
    let lastFollow: boolean | undefined
    let geometryDirty = true

    const selected = () => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed) return false
      for (let i = 0; i < selection.rangeCount; i++) {
        if (selection.getRangeAt(i).intersectsNode(body)) return true
      }
      return false
    }
    const inspecting = () => pressed || (keyboardFocused && el.contains(document.activeElement)) || selected()
    const draw = () => {
      // Do not replace a single text node or move the viewport under a real selection.
      if (disposed || inspecting()) return
      const { progress, follow } = requested.current
      const frame = model.at(motion.matches ? 1 : progress)
      if (frame === lastFrame && follow === lastFollow && !pendingRewind && !geometryDirty) return
      const visible = frame.text.split('\n')
      const beforeCaret = frame.text.slice(0, frame.caret).split('\n')
      const activeRow = Math.min(rows.length - 1, beforeCaret.length - 1)
      const caretColumn = beforeCaret.at(-1)!.length
      const pointerRow = frame.pointer ? frame.text.slice(0, Math.floor(frame.pointer.offset)).split('\n').length - 1 : -1
      const pointerStart = frame.pointer ? frame.text.slice(0, Math.floor(frame.pointer.offset)).lastIndexOf('\n') + 1 : 0
      const showCaret = !motion.matches && progress > 0 && progress < 1 && !frame.selection
      let start = 0
      rows.forEach((row, i) => {
        const line = visible[i] ?? ''
        const from = frame.selection ? Math.max(0, Math.min(line.length, frame.selection.from - start)) : 0
        const to = frame.selection ? Math.max(0, Math.min(line.length, frame.selection.to - start)) : 0
        const key = JSON.stringify([line, from, to])
        if (key !== row.key) {
          paintLine(row.text, line, mode, from, to)
          row.key = key
        }
        row.node.dataset.active = String(i === activeRow && progress > 0 && progress < 1 && !motion.matches)
        row.caret.hidden = !showCaret || i !== activeRow
        if (i === activeRow) row.caret.style.transform = `translateX(${caretColumn}ch)`
        row.pointer.style.display = i === pointerRow ? '' : 'none'
        if (i === pointerRow && frame.pointer) {
          row.pointer.style.transform = `translateX(${frame.pointer.offset - pointerStart}ch)`
          row.pointer.dataset.pressed = String(frame.pointer.pressed)
        }
        start += line.length + 1
      })
      el.dataset.typedChars = String(frame.text.length)
      el.dataset.editorAction = frame.action
      status.textContent = ({ copy: 'Ctrl+C', paste: 'Ctrl+V', backspace: 'Backspace', replace: 'Replace' } as Partial<Record<EditorFrame['action'], string>>)[frame.action] ?? ''
      // All geometry comes from resize/font measurements, never after character writes.
      if (pendingRewind || !follow || progress === 0 || motion.matches) body.scrollTop = 0
      else body.scrollTop = Math.max(0, (rowBottoms[activeRow] ?? 0) - viewportHeight + 24)
      body.scrollLeft = pendingRewind || !follow || progress === 0 || motion.matches ? 0 : Math.max(0, lineLeft + (caretColumn + 3) * characterWidth - viewportWidth + 12)
      pendingRewind = false
      geometryDirty = false
      lastFollow = follow
      lastFrame = frame
    }
    const syncInspection = () => {
      const next = inspecting()
      if (paused !== next) {
        paused = next
        el.dataset.editorPaused = String(next)
      }
      if (!paused) draw()
    }
    const down = () => { pressed = true; keyboardFocused = false; syncInspection() }
    const up = () => { pressed = false; syncInspection() }
    const blur = () => { pressed = false; syncInspection() }
    const focusIn = () => { keyboardFocused = !pressed && !!document.activeElement?.matches(':focus-visible'); syncInspection() }
    const keyDown = () => { keyboardFocused = true; syncInspection() }
    const focusOut = () => queueMicrotask(() => { if (!disposed) syncInspection() })
    const inspectScroll = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return
      const canScroll = event.deltaY !== 0 && body.scrollHeight > body.clientHeight || event.deltaX !== 0 && body.scrollWidth > body.clientWidth
      if (canScroll) {
        // A wheel gesture hands the viewport to the reader, just like keyboard
        // inspection. Keep their chosen position until focus leaves the panel.
        body.focus({ preventScroll: true })
        keyboardFocused = true
        syncInspection()
      }
    }
    const measure = () => {
      viewportHeight = body.clientHeight
      viewportWidth = body.clientWidth
      characterWidth = parseFloat(getComputedStyle(body.querySelector<HTMLElement>('[data-code-measure]')!).width) / 10
      lineLeft = rows[0]?.text.parentElement?.offsetLeft ?? 0
      rowBottoms = rows.map(row => row.node.offsetTop + row.node.offsetHeight)
      geometryDirty = true
      draw()
    }
    write.current = (progress, follow = true) => {
      requested.current = { progress: Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0, follow }
      draw()
    }
    rewind.current = () => { pendingRewind = true; draw() }
    el.addEventListener('pointerdown', down)
    el.addEventListener('focusin', focusIn)
    el.addEventListener('focusout', focusOut)
    el.addEventListener('keydown', keyDown)
    body.addEventListener('wheel', inspectScroll, { passive: true })
    document.addEventListener('pointerup', up)
    document.addEventListener('pointercancel', up)
    document.addEventListener('selectionchange', syncInspection)
    window.addEventListener('blur', blur)
    motion.addEventListener('change', measure)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(body)
    document.fonts.ready.then(() => { if (!disposed) measure() })
    return () => {
      disposed = true
      observer.disconnect()
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('focusin', focusIn)
      el.removeEventListener('focusout', focusOut)
      el.removeEventListener('keydown', keyDown)
      body.removeEventListener('wheel', inspectScroll)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointercancel', up)
      document.removeEventListener('selectionchange', syncInspection)
      window.removeEventListener('blur', blur)
      motion.removeEventListener('change', measure)
      write.current = () => {}
      rewind.current = () => {}
    }
  }, [model, mode])

  useImperativeHandle(ref, () => ({
    setProgress: (progress, followCaret) => write.current(progress, followCaret),
    rewindViewport: () => rewind.current(),
  }), [])

  return (
    <div ref={root} className={`showcase-code-panel showcase-code-${mode} ${className}`} role="group" aria-label={title}>
      <div className="showcase-code-toolbar">
        <span className="showcase-code-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="showcase-code-filename">{title}</span>
        <span data-editor-status className="showcase-editor-status" aria-hidden="true" />
        <span className="showcase-code-language" aria-hidden="true">{mode.toUpperCase()}</span>
        <button type="button" className="showcase-copy-code" onClick={copyCode} aria-label={`Copy code from ${title}`} aria-disabled={copyState === 'copying'}>
          {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Retry copy' : copyState === 'copying' ? 'Copying…' : 'Copy code'}
        </button>
        <span className="showcase-sr-only" role="status">{copyState === 'copied' ? 'Code copied.' : copyState === 'failed' ? 'Could not copy. Select the code and copy it manually, or try again.' : ''}</span>
      </div>
      <pre className="showcase-sr-only"><code>{lines.join('\n')}</code></pre>
      <div ref={viewport} className="showcase-code-viewport" tabIndex={0} aria-label={`Scroll ${title}`}
        onFocus={(event) => event.currentTarget.setAttribute('data-lenis-prevent', '')}
        onBlur={(event) => event.currentTarget.removeAttribute('data-lenis-prevent')}>
        <div className="showcase-code-source" aria-hidden="true">
          <span data-code-measure className="showcase-code-measure">0000000000</span>
          {lines.map((line, i) => (
            <div key={i} data-code-row className="showcase-code-row">
              <span className="showcase-code-gutter">{mode === 'sh' ? (line.startsWith('  ') ? '·' : '$') : i + 1}</span>
              <div className="showcase-code-line" style={{ minWidth: `${model.maxColumns}ch` }}>
                <span data-code-text className="showcase-code-typed" />
                <i data-code-caret className="showcase-code-caret" hidden />
                <svg data-code-pointer className="showcase-editor-pointer" viewBox="0 0 16 22" fill="none" style={{ display: 'none' }}>
                  <path d="M2 1v17l4-4 3 6 3-1-3-6h6L2 1Z" fill="#f1f6ff" stroke="#0c111b" strokeWidth="1.5" strokeLinejoin="round" />
                  <circle cx="3" cy="3" r="2" fill="#8fc1ff" />
                </svg>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
})
export default CodePanel
