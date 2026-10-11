import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { METALS, type Metal } from './config'
import type { Run } from './engine'
import ForgeIcon from './ForgeIcon'

type Receipt = { id: number; amount: number }
const format = (value: number) => Math.round(value).toLocaleString('en-US')

export function GoldCounter({ value, receipt }: { value: number; receipt: Receipt | null }) {
  const [shown, setShown] = useState(value)
  const current = useRef(value)
  useEffect(() => {
    const from = current.current, start = performance.now()
    let frame = 0
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700
    const tick = (now: number) => {
      const progress = duration ? Math.min(1, (now - start) / duration) : 1
      current.current = from + (value - from) * (1 - (1 - progress) ** 3)
      setShown(current.current)
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value])
  return <span className="ff-wallet" aria-label={`${format(value)} gold`}>
    <ForgeIcon name="coin"/><b aria-hidden="true">{format(shown)}</b>
    {receipt && <span key={receipt.id} className={`ff-wallet-effect ${receipt.amount > 0 ? 'is-sale' : 'is-purchase'}`} aria-hidden="true">
      <em>{receipt.amount > 0 ? '+' : '−'}{format(Math.abs(receipt.amount))}</em>
      {receipt.amount > 0 && Array.from({ length: 9 }, (_, i) => <i key={i} style={{ '--coin-x': `${-90 + i * 23}px`, '--coin-y': `${95 + (i % 3) * 36}px`, '--coin-delay': `${i * 36}ms` } as CSSProperties}/>)}
    </span>}
  </span>
}

export function MarketBoard({ run }: { run: Run }) {
  return <details className="ff-market"><summary><span>Today's market</span><small>Day {run.day}</small><span aria-hidden="true">⌄</span></summary>
    <div>{(Object.keys(METALS) as Metal[]).map(metal => {
      const rate = run.market[metal], change = rate - (run.previousMarket[metal] ?? 1)
      return <span key={metal}><i style={{ background: METALS[metal].color }}/><span>{METALS[metal].name}</span><b>{Math.round(rate * 100)}%</b><em className={change > 0 ? 'is-up' : change < 0 ? 'is-down' : ''} aria-label={change > 0 ? 'Up since yesterday' : change < 0 ? 'Down since yesterday' : 'Unchanged'}>{change > 0 ? '↗' : change < 0 ? '↘' : '–'}</em></span>
    })}</div><p>Sale price = blade value × market rate, plus your charms.</p>
  </details>
}
