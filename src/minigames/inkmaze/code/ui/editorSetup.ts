/**
 * Ink Maze coding level: the CodeMirror 6 setup.
 *
 * Loaded only with the coding level (CodeLevel.tsx is a lazy chunk), and each
 * language's grammar only when that language is first picked. The look is a
 * dark ink-blue theme that sits next to the page's paper and the wooden board.
 *
 * Keys: the usual editing keys, Ctrl/Cmd+Enter runs, Ctrl/Cmd+Shift+Enter
 * submits, Tab indents; Esc then Tab (or Ctrl+M / Shift+Alt+M on a Mac) lets
 * Tab move the focus out of the editor instead.
 */
import { EditorState, Prec } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import {
  EditorView, crosshairCursor, drawSelection, dropCursor, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars,
  keymap, lineNumbers, rectangularSelection,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { HighlightStyle, bracketMatching, foldGutter, foldKeymap, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language'
import { autocompletion, closeBrackets, closeBracketsKeymap, completeAnyWord, completeFromList, completionKeymap } from '@codemirror/autocomplete'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { lintGutter, lintKeymap } from '@codemirror/lint'
import { tags as t } from '@lezer/highlight'
import { LANGUAGE_INFO } from '../contract.ts'
import type { RunLanguage } from '../contract.ts'

export type EditorKeys = {
  run: () => void
  submit: () => void
}

/** Indentation per language, matching problem.ts STARTER_CODE. */
const INDENT: Record<RunLanguage, string> = { java: '    ', python: '    ', javascript: '  ', c: '    ', cpp: '    ', echo: '  ' }

/** The grammar for a language, fetched the first time it is needed. */
export function languageSupport(language: RunLanguage): Promise<Extension> {
  switch (LANGUAGE_INFO[language].editor) {
    case 'java': return import('@codemirror/lang-java').then((m) => m.java())
    case 'python': return import('@codemirror/lang-python').then((m) => m.python())
    case 'javascript': return import('@codemirror/lang-javascript').then((m) => m.javascript())
    case 'c':
    case 'cpp': return import('@codemirror/lang-cpp').then((m) => m.cpp())
    default: return Promise.resolve([])
  }
}

/** Words worth completing per language (the document's own words come on top). */
const WORDS: Record<RunLanguage, string[]> = {
  java: ['boolean', 'break', 'char', 'class', 'continue', 'else', 'false', 'final', 'for', 'if', 'int', 'long', 'new', 'null', 'private', 'public', 'return', 'static', 'true', 'void', 'while',
    'String', 'StringBuilder', 'ArrayList', 'HashMap', 'HashSet', 'List', 'Map', 'Set', 'Arrays', 'Math', 'System.out.println', 'charAt', 'length', 'toCharArray', 'append', 'toString', 'setLength'],
  python: ['and', 'break', 'class', 'continue', 'def', 'elif', 'else', 'False', 'for', 'if', 'in', 'is', 'lambda', 'None', 'not', 'or', 'pass', 'return', 'self', 'True', 'while', 'yield',
    'append', 'enumerate', 'len', 'list', 'max', 'min', 'pop', 'print', 'range', 'set', 'dict', 'tuple', 'join', 'nonlocal'],
  javascript: ['break', 'const', 'continue', 'else', 'false', 'for', 'function', 'if', 'let', 'new', 'null', 'of', 'return', 'true', 'undefined', 'while',
    'Array', 'Map', 'Set', 'Math', 'console.log', 'length', 'push', 'pop', 'join', 'slice', 'fill'],
  c: ['bool', 'break', 'char', 'const', 'continue', 'else', 'false', 'for', 'if', 'int', 'long', 'return', 'sizeof', 'static', 'struct', 'true', 'void', 'while',
    'malloc', 'memcpy', 'memset', 'printf', 'strlen', 'strcpy', 'NULL'],
  cpp: ['auto', 'bool', 'break', 'char', 'class', 'const', 'continue', 'else', 'false', 'for', 'if', 'int', 'long', 'public', 'return', 'static', 'string', 'true', 'vector', 'void', 'while',
    'push_back', 'pop_back', 'size', 'empty', 'back', 'cout', 'endl', 'unordered_set', 'unordered_map', 'pair'],
  echo: ['solve', 'answer', 'answer-each', 'print', 'warn', 'sleep', 'spin', 'throw', 'crash', 'compile-error', 'fake-answer', 'exit-early', 'flood', 'grow'],
}

/** The colors (keep in step with the editor panel in ink-maze-code.css). */
const C = {
  bg: '#0f1a2a',
  gutter: '#0c1522',
  text: '#dbe4f1',
  dim: '#7a89a3',
  faint: '#56657d',
  line: 'rgb(122 167 255 / 0.07)',
  selection: 'rgb(122 167 255 / 0.28)',
  cursor: '#9cc0ff',
  match: 'rgb(227 181 102 / 0.22)',
  panel: '#13213a',
  rule: 'rgb(150 180 230 / 0.14)',
}

const theme = EditorView.theme({
  '&': { color: C.text, backgroundColor: C.bg, height: '100%', fontSize: '13.5px' },
  '&.cm-focused': { outline: 'none' },
  // no ligatures: '===' and '!=' read as typed
  '.cm-scroller': { fontFamily: "'JetBrains Mono', 'SF Mono', ui-monospace, Menlo, monospace", lineHeight: '1.6', fontVariantLigatures: 'none' },
  '.cm-content': { caretColor: C.cursor, padding: '10px 0 40vh' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: C.cursor, borderLeftWidth: '2px' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: C.selection },
  '.cm-activeLine': { backgroundColor: C.line },
  '.cm-gutters': { backgroundColor: C.gutter, color: C.faint, border: 'none', borderRight: `1px solid ${C.rule}` },
  '.cm-activeLineGutter': { backgroundColor: C.line, color: C.dim },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 10px', minWidth: '2.2em' },
  '.cm-foldGutter .cm-gutterElement': { color: C.faint, padding: '0 4px' },
  '.cm-foldPlaceholder': { backgroundColor: C.panel, border: `1px solid ${C.rule}`, color: C.dim },
  '.cm-selectionMatch': { backgroundColor: C.match },
  '&.cm-focused .cm-matchingBracket': { backgroundColor: 'rgb(122 167 255 / 0.22)', outline: '1px solid rgb(122 167 255 / 0.45)' },
  '&.cm-focused .cm-nonmatchingBracket': { backgroundColor: 'rgb(240 119 108 / 0.3)' },
  '.cm-searchMatch': { backgroundColor: 'rgb(227 181 102 / 0.25)', outline: '1px solid rgb(227 181 102 / 0.5)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgb(227 181 102 / 0.45)' },
  '.cm-panels': { backgroundColor: C.panel, color: C.text, borderColor: C.rule },
  '.cm-panels.cm-panels-bottom': { borderTop: `1px solid ${C.rule}` },
  '.cm-panel input, .cm-panel button': { font: 'inherit', fontSize: '12px' },
  '.cm-textfield': { backgroundColor: C.bg, color: C.text, border: `1px solid ${C.rule}`, borderRadius: '4px' },
  '.cm-button': { backgroundImage: 'none', backgroundColor: C.bg, color: C.text, border: `1px solid ${C.rule}`, borderRadius: '4px' },
  '.cm-tooltip': { backgroundColor: C.panel, color: C.text, border: `1px solid ${C.rule}`, borderRadius: '6px', boxShadow: '0 12px 30px -12px rgb(0 0 0 / 0.7)' },
  '.cm-tooltip-autocomplete > ul': { fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: '12.5px' },
  '.cm-tooltip-autocomplete > ul > li': { padding: '2px 8px !important' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'rgb(122 167 255 / 0.25)', color: C.text },
  '.cm-completionIcon': { opacity: '0.6' },
  '.cm-diagnostic': { padding: '4px 10px', borderLeftWidth: '4px' },
  '.cm-diagnostic-error': { borderLeftColor: '#f0776c' },
  '.cm-diagnostic-warning': { borderLeftColor: '#e8b04b' },
  '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: 'underline wavy #f0776c', textUnderlineOffset: '3px', textDecorationSkipInk: 'none' },
  '.cm-lintRange-warning': { backgroundImage: 'none', textDecoration: 'underline wavy #e8b04b', textUnderlineOffset: '3px' },
  '.cm-gutter-lint': { width: '1em' },
  '.cm-lint-marker': { width: '0.8em', height: '0.8em' },
}, { dark: true })

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword, t.definitionKeyword, t.modifier], color: '#8fb3ff' },
  { tag: [t.self, t.null, t.bool, t.atom], color: '#d6a3ff' },
  { tag: [t.string, t.special(t.string), t.character], color: '#e3c27a' },
  { tag: [t.number, t.integer, t.float], color: '#f2a272' },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: '#6c7c95', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.function(t.definition(t.variableName))], color: '#7fd4c4' },
  { tag: [t.definition(t.variableName), t.definition(t.propertyName)], color: '#dbe4f1' },
  { tag: [t.typeName, t.className, t.namespace, t.standard(t.typeName)], color: '#f0d58c' },
  { tag: [t.propertyName], color: '#b9cdf0' },
  { tag: [t.operator, t.punctuation, t.separator, t.bracket], color: '#98a6bd' },
  { tag: [t.processingInstruction, t.meta, t.macroName], color: '#c99bf0' },
  { tag: t.invalid, color: '#f0776c' },
])

/** Everything but the grammar: one editor setup for every language. */
export function baseExtensions(language: RunLanguage, keys: EditorKeys): Extension[] {
  return [
    lineNumbers(),
    foldGutter(),
    lintGutter(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    EditorState.tabSize.of(4),
    indentUnit.of(INDENT[language]),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    autocompletion({ activateOnTyping: true, icons: false }),
    EditorState.languageData.of(() => [{ autocomplete: completeAnyWord }, { autocomplete: completeFromList(WORDS[language].map((label) => ({ label, type: 'keyword' }))) }]),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    syntaxHighlighting(highlight),
    theme,
    EditorView.contentAttributes.of({ 'aria-label': `Code editor, ${LANGUAGE_INFO[language].label}. Escape then Tab leaves the editor.`, spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off' }),
    // run and submit come before everything (Ctrl/Cmd+Enter would otherwise insert a line)
    Prec.highest(keymap.of([
      { key: 'Mod-Enter', run: () => { keys.run(); return true }, preventDefault: true },
      { key: 'Mod-Shift-Enter', run: () => { keys.submit(); return true }, preventDefault: true },
    ])),
    keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, ...completionKeymap, ...lintKeymap, indentWithTab]),
  ]
}
