import { RESULT_LABELS } from './config'
import type { Outcome } from './config'
import type { odds } from './engine'

/** Segment lengths use the same modified probabilities that resolve the next hit. */
export default function ChanceBar({ chances }: { chances: ReturnType<typeof odds> }) {
  const entries = Object.entries(chances) as [keyof typeof RESULT_LABELS, number][]
  const percent = (p: number) => `${Math.round(p * 1000) / 10}%`
  return <div className="ff-chances">
    <div className="ff-chance-track" role="img" aria-label={`Next strike: ${entries.map(([key,p])=>`${RESULT_LABELS[key]} ${percent(p)}`).join(', ')}`}>
      {entries.map(([key,p])=><span key={key} className={`ff-prob-${key}`} style={{width:`${p*100}%`}} data-probability={p} aria-hidden="true"/>)}
    </div>
    <div className="ff-chance-legend" aria-hidden="true">{entries.map(([key,p])=><span key={key} className={`ff-prob-${key} ${p===0?'is-zero':''}`}><i/><small>{RESULT_LABELS[key]}</small><b>{percent(p)}</b></span>)}</div>
  </div>
}

/**
 * 'Survive 3 more: 46%' (display only: the Markov chain over the engine's odds, feel.ts survival) and
 * the last outcomes as a strip, so streaks are visible as what they are.
 */
export function SurviveLine({ strikes, chance, history }: { strikes: number; chance: number; history: Outcome[] }) {
  const pct = chance >= .995 ? '100%' : `${Math.round(chance * 100)}%`
  return <div className="ff-survive">
    <span title="Chance this blade survives the next strikes at the exact odds">Survive {strikes} more: <b>{pct}</b></span>
    {history.length > 0 && <ol className="ff-history" aria-label={`Last ${history.length} strikes: ${history.map(o => RESULT_LABELS[o]).join(', ')}`}>{history.map((o, i) => <li key={i} className={`ff-prob-${o}`} title={RESULT_LABELS[o]}/>)}</ol>}
  </div>
}
