/**
 * Ink Maze coding level: the console under the editor, with three tabs.
 *   Output  what the program printed (stdout, then stderr in red)
 *   Result  the verdict, LeetCode style, with the plain-words detail
 *   Tests   each board of the last run, passed or failed; of the hidden
 *           boards only the first that failed is shown
 */
import { useId, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import type { Diagnostic, RunResult } from '../contract.ts'
import { HIDDEN_TESTS } from '../problem.ts'
import type { Board } from '../problem.ts'
import type { Report, RowState } from './report.ts'
import MiniBoard from './MiniBoard.tsx'

export type ConsoleTab = 'output' | 'result' | 'tests'
const TABS: Array<{ id: ConsoleTab; label: string }> = [
  { id: 'output', label: 'Output' },
  { id: 'result', label: 'Result' },
  { id: 'tests', label: 'Tests' },
]

export type LastRun = {
  report: Report
  result: RunResult
  tests: Board[]
  /** the map the run used is no longer the one on screen */
  stale: boolean
}

type Props = {
  tab: ConsoleTab
  onTab: (tab: ConsoleTab) => void
  last: LastRun | null
  /** what is happening now, while a run is in flight ('' when idle) */
  progress: string
  onGoTo: (line: number, column: number | null) => void
}

const ms = (n: number) => (n < 1000 ? `${Math.round(n)} ms` : `${(n / 1000).toFixed(n < 10_000 ? 2 : 1)} s`)

const STATE_TEXT: Record<RowState, string> = { passed: 'Passed', failed: 'Failed', error: 'Stopped here', 'not-run': 'Not run' }

function Timing({ result }: { result: RunResult }) {
  const { compileMs, runMs, loadMs } = result.timings
  const parts = [
    loadMs > 50 ? `loaded in ${ms(loadMs)}` : '',
    compileMs > 0 ? (result.status === 'compile_error' ? `the compiler took ${ms(compileMs)}` : `compiled in ${ms(compileMs)}`) : '',
    result.phase === 'run' || result.status === 'ok' ? `ran in ${ms(runMs)}` : '',
  ].filter(Boolean)
  if (!parts.length) return null
  return <p className="imc-console__meta">{parts.join(' · ')} <span aria-hidden="true">·</span> limit {ms(result.limits.timeLimitMs)}</p>
}

function Diagnostics({ list, onGoTo }: { list: Diagnostic[]; onGoTo: Props['onGoTo'] }) {
  if (!list.length) return null
  return <ul className="imc-diagnostics">
    {list.map((d, i) => <li key={i} data-severity={d.severity}>
      {d.line
        ? <button type="button" className="imc-diagnostics__where" onClick={() => onGoTo(d.line!, d.column)}>Line {d.line}{d.column ? `:${d.column}` : ''}</button>
        : <span className="imc-diagnostics__where">{d.severity}</span>}
      <span className="imc-diagnostics__message">{d.message}</span>
    </li>)}
  </ul>
}

function ResultTab({ last, progress, onGoTo }: Pick<Props, 'last' | 'progress' | 'onGoTo'>) {
  if (progress) return <p className="imc-console__waiting"><span className="imc-spinner" aria-hidden="true" />{progress}</p>
  if (!last) return <p className="imc-console__empty">Run your code to see the result here. <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Enter</kbd> runs, add <kbd>Shift</kbd> to submit.</p>
  const { report, result } = last
  const error = result.error
  return <div className="imc-result" data-tone={report.tone}>
    <p className="imc-result__title">
      <strong>{report.title}</strong>
      {report.passed !== null && report.kind === 'submit' && <span className="imc-result__count">{report.passed} / {report.total} boards passed</span>}
      <span className="imc-result__kind">{report.kind === 'run' ? 'Run: your map' : 'Submit: your map and the hidden tests'}</span>
    </p>
    {last.stale && <p className="imc-result__stale">This was on an earlier map. Run again to try the one on screen.</p>}
    <p className="imc-result__message">{report.message}</p>
    {report.details.length > 0 && <ul className="imc-result__details">{report.details.map((line) => <li key={line}>{line}</li>)}</ul>}
    {result.status === 'compile_error' && <Diagnostics list={result.diagnostics} onGoTo={onGoTo} />}
    {error && <div className="imc-error">
      <p>
        <strong>{error.type}</strong>{error.message ? `: ${error.message}` : ''}
        {error.line ? <> <button type="button" className="imc-diagnostics__where" onClick={() => onGoTo(error.line!, error.column)}>Line {error.line}</button></> : null}
      </p>
      {error.trace && <pre className="imc-console__pre">{error.trace}</pre>}
    </div>}
    {result.status !== 'compile_error' && result.status !== 'ok' && result.stderr && <pre className="imc-console__pre imc-console__pre--err" aria-label="Error output">{result.stderr}</pre>}
    <Timing result={result} />
  </div>
}

function OutputTab({ last, progress }: Pick<Props, 'last' | 'progress'>) {
  if (!last) return <p className="imc-console__empty">{progress || 'What your code prints shows up here.'}</p>
  const { result } = last
  const nothing = !result.stdout && !result.stderr
  return <div className="imc-output">
    {progress && <p className="imc-console__waiting"><span className="imc-spinner" aria-hidden="true" />{progress}</p>}
    {nothing
      ? <p className="imc-console__empty">Your code printed nothing.</p>
      : <>
          {result.stdout && <pre className="imc-console__pre" aria-label="Printed output">{result.stdout}</pre>}
          {result.stderr && <pre className="imc-console__pre imc-console__pre--err" aria-label="Error output">{result.stderr}</pre>}
        </>}
    {result.consoleTruncated && <p className="imc-console__meta">The output was cut short: only the first part is kept.</p>}
  </div>
}

function TestsTab({ last, progress }: Pick<Props, 'last' | 'progress'>) {
  if (progress && !last) return <p className="imc-console__waiting"><span className="imc-spinner" aria-hidden="true" />{progress}</p>
  if (!last) return <p className="imc-console__empty">Run tries your map; Submit also runs {HIDDEN_TESTS.length} hidden boards. Each one shows up here.</p>
  const { report, tests } = last
  return <div className="imc-tests">
    {report.kind === 'run' && <p className="imc-console__meta">Run uses only your map. Submit adds the hidden tests.</p>}
    <ol className="imc-tests__list">
      {report.rows.map((row) => {
        const board = tests[row.index]
        let detail: ReactNode = null
        if (row.revealed && (row.state === 'failed' || row.state === 'error' || !row.hidden)) {
          detail = <div className="imc-tests__detail">
            <MiniBoard grid={board.grid} />
            <div>
              <p><code>grid = [{board.grid.map((r) => `"${r}"`).join(', ')}]</code>, <code>ink = {board.ink}</code></p>
              {row.catches && <p>Checks {row.catches}.</p>}
              {row.verdict && row.state === 'failed' && <p className="imc-tests__why">{row.verdict.message}</p>}
            </div>
          </div>
        }
        return <li key={row.index} data-state={row.state}>
          <span className="imc-tests__mark" aria-hidden="true">{row.state === 'passed' ? '✓' : row.state === 'failed' ? '✕' : row.state === 'error' ? '!' : '·'}</span>
          <span className="imc-tests__label">{row.label}</span>
          <span className="imc-tests__name">{row.name}</span>
          <span className="imc-tests__state">{STATE_TEXT[row.state]}</span>
          {detail}
        </li>
      })}
    </ol>
  </div>
}

export default function ConsolePanel({ tab, onTab, last, progress, onGoTo }: Props) {
  const id = useId()
  const tabs = useRef<Array<HTMLButtonElement | null>>([])
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const at = TABS.findIndex((t) => t.id === tab)
    let next = -1
    if (event.key === 'ArrowRight') next = (at + 1) % TABS.length
    else if (event.key === 'ArrowLeft') next = (at + TABS.length - 1) % TABS.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = TABS.length - 1
    if (next < 0) return
    event.preventDefault()
    onTab(TABS[next].id)
    tabs.current[next]?.focus()
  }
  const failing = last?.report.rows.filter((r) => r.state === 'failed' || r.state === 'error').length ?? 0
  return <section className="imc-console" aria-label="Console">
    <div className="imc-console__tabs" role="tablist" aria-label="Console" onKeyDown={onKey}>
      {TABS.map((t, i) => (
        <button key={t.id} ref={(el) => { tabs.current[i] = el }} type="button" role="tab" id={`${id}-${t.id}`}
          aria-selected={tab === t.id} aria-controls={`${id}-${t.id}-panel`} tabIndex={tab === t.id ? 0 : -1}
          className="imc-console__tab" onClick={() => onTab(t.id)}>
          {t.label}
          {t.id === 'result' && last && <span className="imc-console__dot" data-tone={last.report.tone} aria-hidden="true" />}
          {t.id === 'tests' && last && last.report.kind === 'submit' && <span className="imc-console__badge">{failing ? `${last.report.passed ?? 0}/${last.report.total}` : `${last.report.total}/${last.report.total}`}</span>}
        </button>
      ))}
    </div>
    {TABS.map((t) => (
      <div key={t.id} role="tabpanel" id={`${id}-${t.id}-panel`} aria-labelledby={`${id}-${t.id}`} hidden={tab !== t.id} className="imc-console__panel" tabIndex={0}>
        {tab === t.id && (t.id === 'output' ? <OutputTab last={last} progress={progress} />
          : t.id === 'result' ? <ResultTab last={last} progress={progress} onGoTo={onGoTo} />
            : <TestsTab last={last} progress={progress} />)}
      </div>
    ))}
  </section>
}
