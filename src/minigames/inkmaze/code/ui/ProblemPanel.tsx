/**
 * Ink Maze coding level: the problem, LeetCode style. Everything comes from
 * problem.ts (statement, examples explained by the engine, constraints,
 * signatures, hints); the first example is the map on the game screen.
 */
import { Fragment, useId, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { LANGUAGE_INFO } from '../contract.ts'
import type { RunLanguage } from '../contract.ts'
import { PROBLEM, SIGNATURES, describeMoves, letterOf } from '../problem.ts'
import type { Board, Example } from '../problem.ts'
import { minInk } from '../../solver.ts'
import MiniBoard from './MiniBoard.tsx'

/** Text with `backticks` as code. */
export function Inline({ text }: { text: string }) {
  const parts = text.split('`')
  return <>{parts.map((part, i) => (i % 2 ? <code key={i}>{part}</code> : <Fragment key={i}>{part}</Fragment>))}</>
}

/** How each language's harness calls the player's code (problem.ts H2, H3). */
const HOW: Record<RunLanguage, string> = {
  java: 'Write the method in `class Solution`. A new `Solution` is made for each board. `System.out.println` prints to the console; only the string you return counts.',
  python: 'Write the method in `class Solution`. A new `Solution()` is made for each board. `print()` goes to the console; only the string you return counts.',
  javascript: 'Write a top-level `function solve` (or `const solve = ...`). `console.log` goes to the console; only the string you return counts.',
  c: '`grid` is your own copy of `rows` strings of `cols` characters each. Return a NUL-terminated string: a static buffer or `malloc` memory (it is never freed). `printf` goes to the console.',
  cpp: 'Write the method in `class Solution`. A new `Solution` is made for each board, and `grid` is your own copy. `cout` goes to the console; only the string you return counts.',
  echo: 'The echo test runtime: one command per line (`solve`, `answer RDLU`, `print text`, `spin`, `throw`).',
}

const gridText = (grid: readonly string[]) => `[${grid.map((row) => `"${row}"`).join(', ')}]`

function ExampleBlock({ n, example, title, note, children }: { n: number; example: Pick<Example, 'grid' | 'ink'>; title?: string; note?: ReactNode; children?: ReactNode }) {
  return <section className="imc-example" aria-label={`Example ${n}`}>
    <h4>Example {n}{title ? <span>: {title}</span> : null}</h4>
    <div className="imc-example__body">
      <MiniBoard grid={example.grid} />
      <div className="imc-example__text">
        <p><strong>Input:</strong> <code>grid = {gridText(example.grid)}</code>, <code>ink = {example.ink}</code></p>
        {note}
        {children}
      </div>
    </div>
  </section>
}

type Props = {
  language: RunLanguage
  /** the map on the game screen */
  board: Board
  /** collapsed (phones only: the CSS ignores it on wider screens) */
  collapsed: boolean
  onToggle: () => void
}

export default function ProblemPanel({ language, board, collapsed, onToggle }: Props) {
  const bodyId = useId()
  const [answerFor, setAnswerFor] = useState<string | null>(null)
  const showAnswer = answerFor === board.id
  const answer = useMemo(() => {
    if (!showAnswer) return null
    const best = minInk(board)
    const moves = best ? best.moves.map(letterOf).join('') : ''
    return { moves, lines: describeMoves(board, moves) }
  }, [board, showAnswer])
  const info = LANGUAGE_INFO[language]

  return <article className="imc-problem" data-collapsed={collapsed ? 'true' : 'false'} aria-labelledby={`${bodyId}-title`}>
    <header className="imc-problem__head">
      <h2 id={`${bodyId}-title`}>{PROBLEM.title}</h2>
      <ul className="imc-tags" aria-label="Topics">
        <li>Depth-first search</li><li>Backtracking</li><li>Simulation</li>
      </ul>
      <p className="imc-problem__summary">{PROBLEM.summary}</p>
      <button type="button" className="imc-problem__toggle" aria-expanded={!collapsed} aria-controls={bodyId} onClick={onToggle}>
        {collapsed ? 'Read the problem' : 'Hide the problem'} <span aria-hidden="true">{collapsed ? '▾' : '▴'}</span>
      </button>
    </header>

    <div id={bodyId} className="imc-problem__body">
      {PROBLEM.statement.map((paragraph) => <p key={paragraph}><Inline text={paragraph} /></p>)}

      <h3>Input</h3>
      <ul>{PROBLEM.input.map((line) => <li key={line}><Inline text={line} /></li>)}</ul>
      <h3>Output</h3>
      <ul>{PROBLEM.output.map((line) => <li key={line}><Inline text={line} /></li>)}</ul>

      <h3>Examples</h3>
      <ExampleBlock n={1} example={board} title="the map on the game screen"
        note={<p><strong>Output:</strong> any line of moves that colors every block. It needs at least {board.par} ink; you have {board.ink}{board.slack ? ` (${board.slack} to spare)` : ', none to spare'}.</p>}>
        {answer
          ? <div className="imc-example__answer">
              <p><strong>One answer:</strong> <code>"{answer.moves}"</code></p>
              <ol className="imc-explain">{answer.lines.map((line, i) => <li key={i}>{line}</li>)}</ol>
              <button type="button" className="imc-link" onClick={() => setAnswerFor(null)}>Hide the answer</button>
            </div>
          : <button type="button" className="imc-link" onClick={() => setAnswerFor(board.id)}>Show one answer for this map</button>}
      </ExampleBlock>
      {PROBLEM.examples.map((example, i) => (
        <ExampleBlock key={i} n={i + 2} example={example}
          note={<p><strong>Output:</strong> <code>"{example.output}"</code></p>}>
          <p className="imc-explain__label"><strong>Explanation:</strong></p>
          <ol className="imc-explain">{example.explanation.map((line) => <li key={line}>{line}</li>)}</ol>
        </ExampleBlock>
      ))}

      <h3>Constraints</h3>
      <ul className="imc-constraints">{PROBLEM.constraints.map((line) => <li key={line}><Inline text={line} /></li>)}</ul>

      <h3>Your function <span className="imc-problem__lang">({info.label})</span></h3>
      <pre className="imc-signature"><code>{SIGNATURES[language as keyof typeof SIGNATURES] ?? 'solve'}</code></pre>
      <p className="imc-problem__how"><Inline text={HOW[language]} /></p>
      <p className="imc-problem__version">{info.version}</p>

      <h3>Hints</h3>
      <div className="imc-hints">
        {PROBLEM.hints.map((hint, i) => <details key={hint}><summary>Hint {i + 1}</summary><p>{hint}</p></details>)}
      </div>
    </div>
  </article>
}
