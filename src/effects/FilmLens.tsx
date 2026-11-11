/**
 * FilmLens — the one fixed overlay every pixel sits under. CONTRACT FILE, owner: stream "film".
 *
 * Two things only, both in viewport space so no canvas or chapter ever carries
 * its own: a static vignette and one grain (public/assets/film/grain-256.png,
 * made by scripts/cinema/make-noise.mjs). The grain is drawn with normal
 * blending, so it shows on black, on ivory and dithers dark CSS gradients.
 * It steps between 8 offsets at 12 fps where the tier allows and stands still
 * on phones, tablets, low power and reduced motion. Styles: styles/film.css.
 */
import { useEffect, useLayoutEffect, useState } from 'react'
import { onTier, tier } from '../lib/tier'

/**
 * Events stock. 'ivory' is the approved P0 look (a toned ivory sheet).
 * 'tickets' is the built P1 look (dark table, each agenda row an ivory ticket);
 * it is waiting on the lead's side-by-side approval. One word to switch.
 */
const EVENTS_STOCK: 'ivory' | 'tickets' = 'ivory'

const grainLive = () => {
  const t = tier()
  return t.grainAnimated && !t.reducedMotion && !t.lowPower
}

export default function FilmLens({ page = 'deck' }: { page?: 'deck' | 'sub' }) {
  const [live, setLive] = useState(grainLive)
  useEffect(() => onTier(() => setLive(grainLive())), [])
  useLayoutEffect(() => {
    const root = document.documentElement
    // main.tsx sets html[data-page] before render once scroll-core's wiring lands; until then the lens does.
    const ownsPage = !root.dataset.page
    if (ownsPage) root.dataset.page = page
    root.dataset.filmEvents = EVENTS_STOCK
    return () => {
      if (ownsPage) delete root.dataset.page
      delete root.dataset.filmEvents
    }
  }, [page])
  return (
    <div aria-hidden="true" className="film-lens" data-lens={page} data-grain={live ? 'live' : 'still'}>
      <i className="film-lens__grain" />
    </div>
  )
}
