/**
 * Ink Maze coding level: what the screen says about a finished run.
 *
 * Pure (no DOM, no React), so Node checks it directly. It takes the boards,
 * the sandbox's RunResult and the judge's verdicts (problem.ts) and decides
 * the LeetCode-style title (Accepted, Wrong Answer, Compile Error ...), the
 * plain-words detail, the line on the board, the per-test rows (only the
 * first failing hidden board is revealed) and which board the game screen
 * plays. The engine already decided every move; nothing here judges.
 */
import { STATUS_TITLES } from '../contract.ts'
import type { RunKind, RunResult, RunStatus } from '../contract.ts'
import { judge } from '../problem.ts'
import type { Board, Judgement, Verdict } from '../problem.ts'

/** how a result is colored: green, red, amber (a limit), grey (not the code's fault) */
export type Tone = 'accepted' | 'wrong' | 'error' | 'limit' | 'neutral'

export type RowState = 'passed' | 'failed' | 'error' | 'not-run'

export type TestRow = {
  index: number
  /** 'Your map', 'Hidden test 3 of 12' */
  label: string
  /** the board's short name: 'Random map', 'Corridor' */
  name: string
  hidden: boolean
  state: RowState
  /** the board itself may be shown: always the map, else only the first hidden test that failed */
  revealed: boolean
  /** the judge's verdict when the board was answered */
  verdict: Verdict | null
  /** what a hidden test checks, for a revealed one */
  catches: string | null
}

export type Report = {
  kind: RunKind
  status: RunStatus
  /** 'Accepted', 'Wrong Answer', or contract.STATUS_TITLES[status] */
  title: string
  tone: Tone
  /** one line in plain words */
  message: string
  /** the line shown on the board once the ball has stopped */
  banner: string
  accepted: boolean
  /** boards accepted, when the judge saw the answers (null otherwise) */
  passed: number | null
  total: number
  rows: TestRow[]
  /** the board the game screen shows afterwards (index into the tests) */
  focus: number
  /** play the focus board's moves */
  animate: boolean
  /** an accepted submission: play every board, fast */
  montage: boolean
  /**
   * A run that stopped part way (a limit or a runtime error after some
   * boards were answered): these boards' answers play first, fast, then the
   * focus board shows where it stopped. Indices into the tests; [] otherwise.
   */
  partial: number[]
  /** extra lines for the Result tab */
  details: string[]
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** What the screen calls board `index` of a run. */
export function testLabel(tests: readonly Board[], index: number): string {
  if (index === 0) return 'Your map'
  return `Hidden test ${index} of ${tests.length - 1}`
}

/** The same in a sentence: 'your map', 'hidden test 13' */
function shortLabel(index: number): string {
  return index === 0 ? 'your map' : `hidden test ${index}`
}

const ERROR_STATUSES: readonly RunStatus[] = ['compile_error', 'runtime_error', 'crashed']
const LIMIT_STATUSES: readonly RunStatus[] = ['time_limit', 'memory_limit', 'output_limit']
/** a run that ends like this may still have answered boards before it stopped, and those play */
const PARTIAL_STATUSES: readonly RunStatus[] = [...LIMIT_STATUSES, 'runtime_error']

function toneOf(status: RunStatus): Tone {
  if (ERROR_STATUSES.includes(status)) return 'error'
  if (LIMIT_STATUSES.includes(status)) return 'limit'
  return 'neutral'
}

/** The answer as the Result tab quotes it: at most `max` characters. */
export function quoteAnswer(moves: string, max = 64): string {
  if (moves === '') return '"" (empty)'
  const chars = [...moves]
  return chars.length > max ? `"${chars.slice(0, max).join('')}…" (${chars.length} characters)` : `"${moves}"`
}

/** Where the program was when it stopped: the board after the last one it answered. */
function stoppedAt(result: RunResult, total: number): number | null {
  if (result.status === 'ok' || result.status === 'compile_error' || result.status === 'unavailable' || result.status === 'cancelled') return null
  const test = result.error?.test
  if (Number.isInteger(test) && test! >= 0 && test! < total) return test!
  if (result.phase !== 'run') return null
  return Math.min(result.answered, total - 1)
}

/** A runtime error in one line: 'IndexError: list index out of range (line 7)'. */
function errorLine(result: RunResult): string {
  const error = result.error
  if (!error) return result.message
  return `${error.type}${error.message ? `: ${error.message}` : ''}${error.line ? ` (line ${error.line})` : ''}`
}

/**
 * The report for a finished run. `judgement` is problem.judgeRun(tests, result):
 * null unless the program ran to the end ('ok').
 */
export function buildReport(kind: RunKind, tests: readonly Board[], result: RunResult, judgement: Judgement | null): Report {
  const total = tests.length
  const stop = stoppedAt(result, total)
  // per board: the judge's verdict when it was answered (a run that stopped early still answered the boards before)
  const verdicts: Array<Verdict | null> = tests.map((test, i) => {
    if (judgement) return judgement.verdicts[i]
    return i < result.answered ? judge(test.grid, test.ink, result.answers[i] ?? '') : null
  })
  let revealedHidden = false
  const rows: TestRow[] = tests.map((test, i) => {
    const verdict = verdicts[i]
    const state: RowState = verdict ? (verdict.kind === 'accepted' ? 'passed' : 'failed') : i === stop ? 'error' : 'not-run'
    const hidden = i > 0
    let revealed = !hidden
    if (hidden && !revealedHidden && (state === 'failed' || state === 'error')) { revealed = true; revealedHidden = true }
    const catches = hidden && revealed ? ((test as Board & { catches?: string }).catches ?? null) : null
    return { index: i, label: testLabel(tests, i), name: hidden && !revealed && state !== 'passed' ? 'Hidden board' : test.name, hidden, state, revealed, verdict, catches }
  })

  const base = { kind, status: result.status, total, rows, details: [] as string[], partial: [] as number[] }

  if (judgement) {
    const passed = judgement.passed
    if (judgement.accepted) {
      const verdict = judgement.verdicts[0]
      const message = kind === 'run'
        ? verdict.message
        : `All ${total} boards cleared: your map and ${plural(total - 1, 'hidden test')}.`
      return {
        ...base, title: 'Accepted', tone: 'accepted', message, accepted: true, passed,
        banner: kind === 'run' ? verdict.message : `Accepted: all ${total} boards cleared.`,
        focus: 0, animate: kind === 'run', montage: kind === 'submit',
        details: describe(tests, 0, verdict, result.answers[0] ?? ''),
      }
    }
    const focus = judgement.firstFailure
    const verdict = judgement.verdicts[focus]
    const where = kind === 'submit' ? `${testLabel(tests, focus)}${focus > 0 ? ` (${tests[focus].name})` : ''}: ` : ''
    return {
      ...base, title: 'Wrong Answer', tone: 'wrong', accepted: false, passed,
      message: `${where}${verdict.message}`,
      // the ball never moved at all: that is a bug, and the line says so
      banner: verdict.steps.length ? verdict.message : `Bug: ${verdict.message}`,
      focus, animate: true, montage: false,
      details: [
        ...(kind === 'submit' ? [`${passed} of ${plural(total, 'board')} passed.`] : []),
        ...describe(tests, focus, verdict, result.answers[focus] ?? ''),
        ...(rows[focus].catches ? [`This test checks ${rows[focus].catches}.`] : []),
      ],
    }
  }

  const title = STATUS_TITLES[result.status]
  const message = result.status === 'runtime_error' ? errorLine(result) : result.message
  const details: string[] = []
  if (stop !== null && result.status !== 'crashed') details.push(`It stopped on ${testLabel(tests, stop).toLowerCase()}${stop > 0 ? ` (${tests[stop].name})` : ''}.`)
  if (stop !== null && result.status === 'crashed' && result.answered < total) details.push(`It answered ${plural(result.answered, 'board')} of ${total}.`)
  if (stop !== null && rows[stop].catches) details.push(`That test checks ${rows[stop].catches}.`)
  const lead = title.startsWith('Bug') ? title : `Bug: ${title}`
  const answeredCount = verdicts.filter(Boolean).length
  // the boards it answered before it stopped play first (a hidden one only when it passed or is the one revealed)
  const partial = PARTIAL_STATUSES.includes(result.status)
    ? rows.filter((row) => row.verdict && (row.state === 'passed' || row.revealed)).map((row) => row.index)
    : []
  let banner: string
  if (result.status === 'cancelled') banner = 'Stopped before your code finished.'
  else if (result.status === 'unavailable') banner = result.message
  else if (partial.length && stop !== null) {
    // 'Bug: Time Limit Exceeded on hidden test 13 (Big room).' (after the board, when it had answered that one already)
    const name = stop > 0 && rows[stop].revealed ? ` (${tests[stop].name})` : ''
    banner = `${lead} ${rows[stop].verdict ? 'after' : 'on'} ${shortLabel(stop)}${name}.`
  } else if (partial.length) banner = `${lead}.`
  else banner = `${lead}. The ball did not move.`
  return {
    ...base, title, tone: toneOf(result.status), message, accepted: false,
    passed: answeredCount ? verdicts.filter((v) => v?.kind === 'accepted').length : null,
    banner, focus: stop !== null && rows[stop].revealed ? stop : (partial.at(-1) ?? 0), animate: false, montage: false, partial, details,
  }
}

/** The lines under a judged board: the answer, the ink, the moves, the blocks left. */
function describe(tests: readonly Board[], index: number, verdict: Verdict, answer: string): string[] {
  const board = tests[index]
  return [
    `Your answer: ${quoteAnswer(answer)}`,
    `Moves played: ${verdict.steps.length} · Ink used: ${verdict.inkUsed} of ${board.ink} (the least it needs is ${board.par}) · Blocks left: ${verdict.blocksLeft}`,
  ]
}
