import { useState } from 'react'

type Props = {
  href: string
  cover: string
  eyebrow: string
  title: string
  body: string
  cta: string
  /** a short line under the body, like levels cleared */
  meta?: string
}

/** A link card with a cover picture. If the picture fails to load, a small drawn board takes its place. */
export default function GameCard({ href, cover, eyebrow, title, body, cta, meta }: Props) {
  const [noCover, setNoCover] = useState(false)
  return (
    <a className="sp-play-card" href={href}>
      {noCover
        ? <span className="sp-play-card__art sp-play-card__art--plain" aria-hidden="true">{Array.from({ length: 16 }, (_, i) => <i key={i} data-inked={[0, 1, 2, 3, 7, 11, 10].includes(i) ? 'true' : undefined} data-wall={[5, 13].includes(i) ? 'true' : undefined} />)}</span>
        : <img className="sp-play-card__art" src={cover} alt="" width="1200" height="630" loading="lazy" decoding="async" onError={() => setNoCover(true)} />}
      <span className="sp-play-card__copy">
        <span className="sp-eyebrow">{eyebrow}</span>
        <span className="sp-play-card__title">{title}</span>
        <span className="sp-play-card__body">{body}</span>
        {meta && <span className="sp-play-card__meta">{meta}</span>}
        <span className="sp-play-card__cta">{cta}<span aria-hidden="true">→</span></span>
      </span>
    </a>
  )
}
