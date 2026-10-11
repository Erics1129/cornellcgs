import { RESULT_LABELS } from './config'
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
