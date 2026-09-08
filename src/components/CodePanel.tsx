import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef } from 'react'
import '../styles/showcase-motion.css'

type Mode = 'ts' | 'md' | 'sh'
type Token = { text: string; kind: string; start: number }
export type CodePanelHandle = {
  setProgress: (progress: number, followCaret?: boolean) => void
  rewindViewport: () => void
}

// Strings precede comments so https:// inside a string is never a comment.
const TOKEN = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/.*$|\b(?:const|let|function|return|if|else|for|new|type|number|boolean|export)\b|\b\d+(?:e\d+)?\b)/g
function tokenize(text: string, mode: Mode, start: number): Token[] {
  if (mode !== 'ts') return [{ text, start, kind: mode === 'md' && /^[#>]/.test(text) ? 'keyword' : 'plain' }]
  const tokens: Token[] = []
  let cursor = 0
  for (const match of text.matchAll(TOKEN)) {
    const at = match.index!
    if (at > cursor) tokens.push({ text: text.slice(cursor, at), start: start + cursor, kind: 'plain' })
    const value = match[0]
    tokens.push({ text: value, start: start + at, kind: value.startsWith('//') ? 'comment' : /^["'`]/.test(value) ? 'string' : /^\d/.test(value) ? 'number' : 'keyword' })
    cursor = at + value.length
  }
  if (cursor < text.length) tokens.push({ text: text.slice(cursor), start: start + cursor, kind: 'plain' })
  return tokens
}

/** Character-exact typing driven by the parent's single scrubbed playhead. */
const CodePanel = forwardRef<CodePanelHandle, {
  lines: string[]
  title: string
  mode?: Mode
  className?: string
}>(function CodePanel({ lines, title, mode = 'ts', className = '' }, ref) {
  const root = useRef<HTMLDivElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const write = useRef<(progress: number, followCaret?: boolean) => void>(() => {})
  const model = useMemo(() => {
    let length = 0
    const rows = lines.map((line) => {
      const start = length
      length += line.length + 1 // Each newline gets a step, including empty rows.
      return { line, start, end: length, tokens: tokenize(line, mode, start) }
    })
    return { rows, length }
  }, [lines, mode])

  useLayoutEffect(() => {
    const el = root.current!
    const body = viewport.current!
    const rows = Array.from(el.querySelectorAll<HTMLElement>('[data-code-row]'))
    const carets = Array.from(el.querySelectorAll<HTMLElement>('[data-code-caret]'))
    const sourceTokens = model.rows.flatMap((row) => row.tokens)
    const tokens = Array.from(el.querySelectorAll<HTMLElement>('[data-code-token]')).map((node, i) => ({
      node, text: sourceTokens[i].text, start: sourceTokens[i].start, shown: -1,
    }))
    let lastBudget = -1
    let lastRow = -1
    let progress = 1
    let follow = true
    let rowBottoms: number[] = []
    let viewportHeight = 0
    const draw = (next: number, followCaret = true) => {
      follow = followCaret
      progress = Number.isFinite(next) ? Math.max(0, Math.min(1, next)) : 0
      const budget = Math.floor(progress * model.length)
      if (budget === lastBudget) return
      lastBudget = budget
      el.dataset.typedChars = String(budget)
      let activeRow = model.rows.findIndex((row) => budget < row.end)
      if (activeRow < 0) activeRow = Math.max(0, rows.length - 1)
      for (const token of tokens) {
        const shown = Math.max(0, Math.min(token.text.length, budget - token.start))
        if (shown !== token.shown) {
          token.node.textContent = token.text.slice(0, shown)
          token.shown = shown
        }
      }
      if (lastRow !== activeRow || budget === 0 || budget === model.length) {
        carets.forEach((caret, i) => { caret.hidden = i !== activeRow || progress === 0 || progress === 1 })
        rows.forEach((row, i) => { row.dataset.active = String(i === activeRow && progress > 0 && progress < 1) })
        lastRow = activeRow
      }
      // Cached geometry only: no layout read follows the character writes.
      body.scrollTop = budget === 0 || !follow ? 0 : Math.max(0, (rowBottoms[activeRow] ?? 0) - viewportHeight + 24)
    }
    const measure = () => {
      viewportHeight = body.clientHeight
      rowBottoms = rows.map((row) => row.offsetTop + row.offsetHeight)
      lastBudget = -1
      draw(progress, follow)
    }
    write.current = draw
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(body)
    let disposed = false
    document.fonts.ready.then(() => { if (!disposed) measure() })
    return () => {
      disposed = true
      observer.disconnect()
      write.current = () => {}
      tokens.forEach((token) => { token.node.textContent = token.text })
    }
  }, [model])

  useImperativeHandle(ref, () => ({
    setProgress: (progress, followCaret) => write.current(progress, followCaret),
    rewindViewport: () => { if (viewport.current) viewport.current.scrollTop = 0 },
  }), [])

  return (
    <div ref={root} className={`showcase-code-panel showcase-code-${mode} ${className}`} role="group" aria-label={title}>
      <div className="showcase-code-toolbar">
        <span className="showcase-code-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="showcase-code-filename">{title}</span>
        <span className="showcase-code-language" aria-hidden="true">{mode.toUpperCase()}</span>
      </div>
      <pre className="showcase-sr-only"><code>{lines.join('\n')}</code></pre>
      <div
        ref={viewport}
        className="showcase-code-viewport"
        tabIndex={0}
        aria-label={`Scroll ${title}`}
        onFocus={(event) => event.currentTarget.setAttribute('data-lenis-prevent', '')}
        onBlur={(event) => event.currentTarget.removeAttribute('data-lenis-prevent')}
      >
        <div className="showcase-code-source" aria-hidden="true">
          {model.rows.map((row, i) => (
            <div key={i} data-code-row className="showcase-code-row">
              <span className="showcase-code-gutter">{mode === 'sh' ? (row.line.startsWith('  ') ? '·' : '$') : i + 1}</span>
              <div className="showcase-code-line">
                <span className="showcase-code-reserve">{row.line || '\u00a0'}</span>
                <span className="showcase-code-typed">
                  {row.tokens.map((token, j) => <span key={j} data-code-token data-start={token.start} className={`code-syntax-${token.kind}`}>{token.text}</span>)}
                  <i data-code-caret className="showcase-code-caret" hidden />
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
})
export default CodePanel
