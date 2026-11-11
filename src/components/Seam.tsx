import type { ChapterId } from '../lib/deck'

export type SeamKind = 'dip' | 'soft' | 'level' | 'lid' | 'cut' | 'table'

/**
 * The join between two chapters. A zero-height box in normal flow, so it is in
 * the right place at every scroll speed and at every resting position with no
 * script at all. deck.css gives it its box; film.css paints the veil and the
 * light. Unpainted it is invisible and the page is still complete.
 *
 *   dip    a short dip to black, used where the picture changes (act breaks)
 *   soft   a lighter veil between two table chapters
 *   table  no veil at all: both chapters lie on the same table
 *   cut    two black full-bleed films butt against each other
 *   level  the liquid rising into the soda chapter
 *   lid    the eyelid closing into the vision chapter
 */
export default function Seam({ from, to, kind = 'dip' }: { from: ChapterId; to: ChapterId; kind?: SeamKind }) {
  return (
    <div className="seam" data-seam={kind} data-from={from} data-to={to} aria-hidden="true">
      <i className="seam__veil" />
      <i className="seam__light" />
    </div>
  )
}
