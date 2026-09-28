import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createEditorChoreography, type EditorFrame } from '../lib/editorChoreography'
import '../styles/showcase-motion.css'
import '../styles/code-editor-interactions.css'

type Mode = 'ts' | 'md' | 'sh'
type Token = { text: string; kind: string; start: number }
export type CodePanelHandle = {
  setProgress: (progress: number, followCaret?: boolean) => void
  rewindViewport: () => void
  /** a quiet inline value after one row (an IDE inlay hint); null clears it */
  setInlay: (text: string | null) => void
}
/** What the editor is doing on this frame, for a status bar outside the panel */
export type CodePanelFrame = { line: number; column: number; editing: boolean; action: EditorFrame['action'] }

// One pass, ordered alternatives: strings precede comments so https:// inside
// a string is never a comment; constants precede types precede calls.
const TS_TOKEN = new RegExp([
  String.raw`(?<string>"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|` + '`(?:\\\\.|[^`\\\\])*`)',
  String.raw`(?<comment>\/\/.*$)`,
  String.raw`(?<keyword>\b(?:const|let|var|function|return|if|else|for|while|of|in|new|type|export|import|from|as|typeof)\b)`,
  String.raw`(?<builtin>\b(?:number|string|boolean|void|true|false|null|undefined)\b)`,
  String.raw`(?<number>\b\d+(?:\.\d+)?(?:e\d+)?\b)`,
  String.raw`(?<constant>\b[A-Z][A-Z0-9_]{2,}\b)`,
  String.raw`(?<type>\b[A-Z]\w*\b)`,
  String.raw`(?<function>\b[a-z_$][\w$]*(?=\s*(?:<[^>()]*>)?\())`,
  String.raw`(?<operator>=>|===|!==|\+\+|--|[-+*/%]=?|[<>]=?|&&|\|\||!|=)`,
].join('|'), 'gm')
const SH_TOKEN = /(?<function>^\s*\S+)|(?<operator>\s--?\S*)|(?<constant>\b[2-9TJQKA][shdc]\b)/g

function tokenize(text: string, mode: Mode): Token[] {
  if (mode === 'md') return [{ text, start: 0, kind: /^[#>]/.test(text) ? 'keyword' : 'plain' }]
  const tokens: Token[] = []
  let cursor = 0
  for (const match of text.matchAll(mode === 'sh' ? SH_TOKEN : TS_TOKEN)) {
    const at = match.index!
    const value = match[0]
    if (!value) continue
    if (at > cursor) tokens.push({ text: text.slice(cursor, at), start: cursor, kind: 'plain' })
    const kind = Object.entries(match.groups ?? {}).find(([, v]) => v !== undefined)?.[0] ?? 'plain'
    tokens.push({ text: value, start: at, kind })
    cursor = at + value.length
  }
  if (cursor < text.length) tokens.push({ text: text.slice(cursor), start: cursor, kind: 'plain' })
  return tokens
}

/** A minimap row: one colored bar per token, whitespace kept as gaps */
function paintMinimap(node: HTMLElement, text: string, mode: Mode) {
  const fragment = document.createDocumentFragment()
  for (const token of tokenize(text, mode)) {
    const bar = document.createElement('i')
    bar.style.width = `${token.text.length * 1.35}px`
    if (token.text.trim()) bar.className = `code-syntax-${token.kind}`
    fragment.append(bar)
  }
  node.replaceChildren(fragment)
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
  /** a colored overview of the file down the right edge, with the visible window marked */
  minimap?: boolean
  /** the row (0-based) an inlay value is drawn after */
  inlayRow?: number
  /** called when the caret or editing state changes (never per character when nothing moved) */
  onFrame?: (frame: CodePanelFrame) => void
  /** other open files, shown as inactive tabs after this one */
  extraTabs?: string[]
  /** the path shown under the tabs, last item emphasised */
  breadcrumb?: string[]
}>(function CodePanel({ lines, title, mode = 'ts', className = '', minimap = false, inlayRow = -1, onFrame, extraTabs = [], breadcrumb }, ref) {
  const root = useRef<HTMLDivElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const map = useRef<HTMLDivElement>(null)
  const inlay = useRef<HTMLSpanElement>(null)
  const frameListener = useRef(onFrame)
  frameListener.current = onFrame
  const write = useRef<(progress: number, followCaret?: boolean) => void>(() => {})
  /** the inlay the parent asked for; drawn with everything else, so it freezes too */
  const inlayText = useRef<string | null>(null)
  const redraw = useRef<() => void>(() => {})
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
    const mapRows = Array.from(map.current?.querySelectorAll<HTMLElement>('[data-map-row]') ?? [])
    const mapView = map.current?.querySelector<HTMLElement>('[data-map-view]') ?? null
    const rows = Array.from(body.querySelectorAll<HTMLElement>('[data-code-row]')).map((node, i) => ({
      node,
      text: node.querySelector<HTMLElement>('[data-code-text]')!,
      caret: node.querySelector<HTMLElement>('[data-code-caret]')!,
      pointer: node.querySelector<SVGElement>('[data-code-pointer]')!,
      mini: mapRows[i] ?? null,
      key: '',
    }))
    let lastReport = ''
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
    let inlayDirty = true

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
      if (frame === lastFrame && follow === lastFollow && !pendingRewind && !geometryDirty && !inlayDirty) return
      inlayDirty = false
      const visible = frame.text.split('\n')
      const beforeCaret = frame.text.slice(0, frame.caret).split('\n')
      const activeRow = Math.min(rows.length - 1, beforeCaret.length - 1)
      const caretColumn = beforeCaret.at(-1)!.length
      const pointerRow = frame.pointer ? frame.text.slice(0, Math.floor(frame.pointer.offset)).split('\n').length - 1 : -1
      const pointerStart = frame.pointer ? frame.text.slice(0, Math.floor(frame.pointer.offset)).lastIndexOf('\n') + 1 : 0
      const showCaret = !motion.matches && progress > 0 && progress < 1 && !frame.selection
      let start = 0
      rows.forEach((row, i) => {
        const authored = visible[i] ?? ''
        // The score illustrates edits in an already readable document. Keeping
        // untouched rows populated also lets readers scroll or select at any point.
        const line = authored.trim() ? authored : lines[i] ?? ''
        const from = frame.selection ? Math.max(0, Math.min(authored.length, frame.selection.from - start)) : 0
        const to = frame.selection ? Math.max(0, Math.min(authored.length, frame.selection.to - start)) : 0
        const key = JSON.stringify([line, from, to])
        if (key !== row.key) {
          paintLine(row.text, line, mode, from, to)
          if (row.mini && row.mini.dataset.line !== line) {
            paintMinimap(row.mini, line, mode)
            row.mini.dataset.line = line
          }
          row.key = key
        }
        const isActive = i === activeRow && progress > 0 && progress < 1 && !motion.matches
        row.node.dataset.active = String(isActive)
        if (row.mini) row.mini.dataset.active = String(isActive)
        row.caret.hidden = !showCaret || i !== activeRow
        if (i === activeRow) row.caret.style.transform = `translateX(${caretColumn}ch)`
        row.pointer.style.display = i === pointerRow ? '' : 'none'
        if (i === pointerRow && frame.pointer) {
          row.pointer.style.transform = `translateX(${frame.pointer.offset - pointerStart}ch)`
          row.pointer.dataset.pressed = String(frame.pointer.pressed)
        }
        // Selection offsets belong to the animated score, not the preview rows.
        start += authored.length + 1
      })
      el.dataset.typedChars = String(frame.text.length)
      el.dataset.editorAction = frame.action
      status.textContent = ({ copy: 'Ctrl+C', paste: 'Ctrl+V', backspace: 'Backspace', replace: 'Replace' } as Partial<Record<EditorFrame['action'], string>>)[frame.action] ?? ''
      // All geometry comes from resize/font measurements, never after character writes.
      if (pendingRewind || !follow || progress === 0 || motion.matches) body.scrollTop = 0
      else body.scrollTop = Math.max(0, (rowBottoms[activeRow] ?? 0) - viewportHeight + 24)
      body.scrollLeft = pendingRewind || !follow || progress === 0 || motion.matches ? 0 : Math.max(0, lineLeft + (caretColumn + 3) * characterWidth - viewportWidth + 12)
      if (mapView && body.scrollHeight > 0) {
        // top/height as shares of the minimap's rows, which mirror the file's rows
        const top = `${(body.scrollTop / body.scrollHeight) * 100}%`
        const height = `${Math.min(100, (body.clientHeight / body.scrollHeight) * 100)}%`
        if (mapView.style.top !== top) mapView.style.top = top
        if (mapView.style.height !== height) mapView.style.height = height
      }
      const hint = inlay.current
      if (hint) {
        const text = inlayText.current ?? ''
        if (hint.textContent !== text) hint.textContent = text
        if (hint.hidden !== !text) hint.hidden = !text
      }
      const editing = progress > 0 && progress < 1 && !motion.matches
      el.dataset.dirty = String(editing)
      const report = editing ? `${activeRow + 1}:${caretColumn + 1}:${frame.action}` : `done:${rows.length}`
      if (report !== lastReport) {
        lastReport = report
        const last = lines.length ? lines[lines.length - 1].length + 1 : 1
        frameListener.current?.(editing
          ? { line: activeRow + 1, column: caretColumn + 1, editing, action: frame.action }
          : { line: lines.length, column: last, editing, action: 'idle' })
      }
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
    redraw.current = () => { inlayDirty = true; draw() }
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
      redraw.current = () => {}
    }
  }, [model, mode])

  useImperativeHandle(ref, () => ({
    setProgress: (progress, followCaret) => write.current(progress, followCaret),
    rewindViewport: () => rewind.current(),
    setInlay: (text) => {
      if (inlayText.current === text) return
      inlayText.current = text
      redraw.current()
    },
  }), [])

  return (
    <div ref={root} className={`showcase-code-panel showcase-code-${mode} ${className}`} role="group" aria-label={title}>
      <div className="showcase-code-toolbar">
        <span className="showcase-code-filename">{mode === 'sh' ? 'Terminal' : title}<i className="showcase-code-dirty" aria-hidden="true" /></span>
        {extraTabs.map((tab) => <span key={tab} className="showcase-code-tab" aria-hidden="true">{tab}</span>)}
        <span data-editor-status className="showcase-editor-status" aria-hidden="true" />
        <span className="showcase-code-language" aria-hidden="true">{mode === 'sh' ? 'zsh' : mode.toUpperCase()}</span>
        <button type="button" className="showcase-copy-code" onClick={copyCode} aria-label={`Copy code from ${title}`} aria-disabled={copyState === 'copying'}>
          {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Retry copy' : copyState === 'copying' ? 'Copying…' : 'Copy code'}
        </button>
        <span className="showcase-sr-only" role="status">{copyState === 'copied' ? 'Code copied.' : copyState === 'failed' ? 'Could not copy. Select the code and copy it manually, or try again.' : ''}</span>
      </div>
      {breadcrumb && (
        <div className="showcase-code-breadcrumb" aria-hidden="true">
          {breadcrumb.map((part, i) => <span key={i}>{part}</span>)}
        </div>
      )}
      <pre className="showcase-sr-only"><code>{lines.join('\n')}</code></pre>
      <div className="showcase-code-body">
      <div ref={viewport} className="showcase-code-viewport" tabIndex={0} aria-label={`Scroll ${title}`}
        onFocus={(event) => event.currentTarget.setAttribute('data-lenis-prevent', '')}
        onBlur={(event) => event.currentTarget.removeAttribute('data-lenis-prevent')}>
        <div className="showcase-code-source" aria-hidden="true">
          <span data-code-measure className="showcase-code-measure">0000000000</span>
          {lines.map((line, i) => (
            <div key={i} data-code-row className="showcase-code-row">
              <span className="showcase-code-gutter">{mode === 'sh' ? (line.startsWith('  ') ? '·' : '$') : i + 1}</span>
              <div className="showcase-code-line" style={{ minWidth: `${model.maxColumns}ch`, ['--indent' as string]: Math.floor((line.length - line.trimStart().length) / 2) }}>
                <span data-code-text className="showcase-code-typed" />
                {i === inlayRow && <span ref={inlay} className="showcase-code-inlay" hidden />}
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
      {minimap && (
        <div ref={map} className="showcase-code-minimap" aria-hidden="true">
          <div className="showcase-code-minimap-inner">
            {lines.map((_, i) => <div key={i} data-map-row className="showcase-code-minimap-row" />)}
            <div data-map-view className="showcase-code-minimap-view" />
          </div>
        </div>
      )}
      </div>
    </div>
  )
})
export default CodePanel
