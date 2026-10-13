import type { CSSProperties } from 'react'
import { RESULT_LABELS } from './config'
import type { Outcome } from './config'
import type { odds } from './engine'

/** The last strike's roll (feel.ts nextRoll): where u fell on the distribution it was rolled against. */
export type Roll = { id: number; u: number; chances: ReturnType<typeof odds>; sweepMs: number; holdMs: number }
/**
 * Segment lengths use the same modified probabilities that resolve the next hit. Right after a strike the
 * track shows the distribution that strike was rolled on, with a needle sweeping to the roll, then it
 * morphs to the next odds; the numbers below always show the next strike.
 */
export default function ChanceBar({ chances, roll }: { chances: ReturnType<typeof odds>; roll?: Roll | null }) {
  const entries = Object.entries(chances) as [keyof typeof RESULT_LABELS, number][]
  const track = Object.entries(roll ? roll.chances : chances) as [keyof typeof RESULT_LABELS, number][]
  const percent = (p: number) => `${Math.round(p * 1000) / 10}%`
  return <div className="ff-chances">
    <div className="ff-chance-track" role="img" aria-label={`Next strike: ${entries.map(([key,p])=>`${RESULT_LABELS[key]} ${percent(p)}`).join(', ')}`}>
      {/* Segments move by transform only (translate to their start, scale to their share): a strike morphs the bar
          without a layout or repaint of the panel on every frame of the transition. */}
      {track.map(([key,p],i)=><span key={key} className={`ff-prob-${key}`} style={{'--from':`${track.slice(0,i).reduce((a,[,q])=>a+q,0)*100}%`,'--p':p} as CSSProperties} data-probability={p} aria-hidden="true"/>)}
    </div>
    {roll&&<i key={roll.id} className="ff-roll" aria-hidden="true" data-roll={roll.u} style={{'--u':`${roll.u*100}%`,'--sweep':`${roll.sweepMs}ms`} as CSSProperties}/>}
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
    <span title="Chance this blade survives the next strikes at the exact odds"><span className="ff-survive-word">Survive </span>{strikes} more: <b>{pct}</b></span>
    {history.length > 0 && <ol className="ff-history" aria-label={`Last ${history.length} strikes: ${history.map(o => RESULT_LABELS[o]).join(', ')}`}>{history.map((o, i) => <li key={i} className={`ff-prob-${o}`} title={RESULT_LABELS[o]}/>)}</ol>}
  </div>
}
