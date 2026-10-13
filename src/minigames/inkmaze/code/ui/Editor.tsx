/**
 * Ink Maze coding level: the code editor (CodeMirror 6).
 *
 * One EditorView for the level; each language keeps its own EditorState (its
 * text, cursor and undo history), so switching languages and back loses
 * nothing. The parent reads and replaces the text through the handle, and
 * marks compile and runtime errors in the player's file with setDiagnostics.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { Compartment, EditorSelection, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { setDiagnostics } from '@codemirror/lint'
import type { Diagnostic as CmDiagnostic } from '@codemirror/lint'
import type { Diagnostic, RunLanguage } from '../contract.ts'
import { baseExtensions, languageSupport } from './editorSetup.ts'

export type EditorHandle = {
  getSource(): string
  /** replaces the text as one undoable change */
  setSource(text: string): void
  focus(): void
  /** marks problems in the file (1-based lines and columns; entries without a line are skipped) */
  showDiagnostics(diagnostics: readonly Diagnostic[]): void
  clearDiagnostics(): void
  /** puts the cursor on a line (and column) and scrolls it into view */
  goTo(line: number, column?: number | null): void
}

type Props = {
  language: RunLanguage
  /** the text a language starts with the first time it is shown (saved code or the starter) */
  initialSource: (language: RunLanguage) => string
  onChange: (language: RunLanguage, source: string) => void
  onCursor?: (line: number, column: number) => void
  onRun: () => void
  onSubmit: () => void
}

const Editor = forwardRef<EditorHandle, Props>(function Editor({ language, initialSource, onChange, onCursor, onRun, onSubmit }, ref) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const states = useRef(new Map<RunLanguage, EditorState>())
  const shown = useRef<RunLanguage | null>(null)
  const grammar = useRef(new Compartment())
  // the latest callbacks, so the editor's extensions never need rebuilding
  const latest = useRef({ initialSource, onChange, onCursor, onRun, onSubmit })
  latest.current = { initialSource, onChange, onCursor, onRun, onSubmit }

  const makeState = (lang: RunLanguage) => EditorState.create({
    doc: latest.current.initialSource(lang),
    extensions: [
      baseExtensions(lang, { run: () => latest.current.onRun(), submit: () => latest.current.onSubmit() }),
      grammar.current.of([]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) latest.current.onChange(lang, update.state.doc.toString())
        if (update.docChanged || update.selectionSet) {
          const head = update.state.selection.main.head
          const line = update.state.doc.lineAt(head)
          latest.current.onCursor?.(line.number, head - line.from + 1)
        }
      }),
    ],
  })

  /** Shows a language's state, made on first use; its grammar arrives when it has loaded. */
  const showLanguage = (lang: RunLanguage) => {
    const v = view.current
    if (!v || shown.current === lang) return
    if (shown.current) states.current.set(shown.current, v.state)
    let state = states.current.get(lang)
    const fresh = !state
    if (!state) { state = makeState(lang); states.current.set(lang, state) }
    v.setState(state)
    shown.current = lang
    const head = state.selection.main.head
    const line = state.doc.lineAt(head)
    latest.current.onCursor?.(line.number, head - line.from + 1)
    if (fresh) {
      languageSupport(lang).then((support) => {
        const effects = grammar.current.reconfigure(support)
        if (shown.current === lang && view.current) view.current.dispatch({ effects })
        else {
          const stored = states.current.get(lang)
          if (stored) states.current.set(lang, stored.update({ effects }).state)
        }
      }, (error) => console.warn(`Ink Maze: the ${lang} grammar did not load`, error))
    }
  }

  useEffect(() => {
    if (!host.current) return
    const v = new EditorView({ parent: host.current })
    view.current = v
    showLanguage(language)
    return () => {
      v.destroy()
      view.current = null
      shown.current = null
      states.current.clear()
    }
    // the view lives as long as the editor; languages switch below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { showLanguage(language) })

  useImperativeHandle(ref, () => ({
    getSource: () => view.current?.state.doc.toString() ?? '',
    setSource(text) {
      const v = view.current
      if (!v) return
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text }, selection: EditorSelection.cursor(0), scrollIntoView: true })
    },
    focus() { view.current?.focus() },
    showDiagnostics(list) {
      const v = view.current
      if (!v) return
      const doc = v.state.doc
      const marks: CmDiagnostic[] = []
      for (const d of list) {
        if (!d.line || d.line < 1) continue
        const line = doc.line(Math.min(d.line, doc.lines))
        // a column past the last character (javac's "';' expected") marks the last character: a mark over the line break alone shows nothing
        const from = line.from + Math.min(Math.max(0, (d.column ?? 1) - 1), Math.max(0, line.length - 1))
        let to = line.to
        if (d.endLine && d.endLine >= d.line) {
          const end = doc.line(Math.min(d.endLine, doc.lines))
          to = d.endColumn ? end.from + Math.min(Math.max(0, d.endColumn - 1), end.length) : end.to
        } else if (d.column) {
          // from the column to the end of the word there (at least one character)
          const rest = line.text.slice(from - line.from)
          const word = /^[\w$]+/.exec(rest)?.[0].length ?? 1
          to = Math.min(line.to, from + word)
        }
        if (to <= from) to = Math.min(doc.length, from + 1)
        marks.push({ from, to: Math.max(to, from), severity: d.severity === 'note' ? 'info' : d.severity, message: d.message, source: 'Ink Maze' })
      }
      v.dispatch(setDiagnostics(v.state, marks))
    },
    clearDiagnostics() {
      const v = view.current
      if (v) v.dispatch(setDiagnostics(v.state, []))
    },
    goTo(lineNumber, column) {
      const v = view.current
      if (!v) return
      const doc = v.state.doc
      const line = doc.line(Math.min(Math.max(1, lineNumber), doc.lines))
      const at = line.from + Math.min(Math.max(0, (column ?? 1) - 1), line.length)
      v.dispatch({ selection: EditorSelection.cursor(at), effects: EditorView.scrollIntoView(at, { y: 'center' }) })
      v.focus()
    },
  }), [])

  return <div ref={host} className="imc-editor__host" data-language={language} />
})

export default Editor
