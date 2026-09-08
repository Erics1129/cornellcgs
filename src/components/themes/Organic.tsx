import type { ReactElement } from 'react'
import type { PageTheme } from '../../lib/pageTheme'
import { enterPage } from './Technical'

/** Soft, stationary color fields; a single contour draws on arrival. */
function Backdrop(): ReactElement {
  return (
    <div aria-hidden="true" className="cgs-backdrop cgs-organic-backdrop">
      <svg className="cgs-organic-contour" viewBox="0 0 360 440" fill="none">
        <path className="cgs-draw-line" pathLength="1" d="M355 32C174-38 12 69 61 213S331 440 355 315C375 210 171 101 129 208S213 410 360 409" />
      </svg>
    </div>
  )
}

export const theme: PageTheme = { name: 'organic', Backdrop, enter: (root) => enterPage(root, 'organic') }
