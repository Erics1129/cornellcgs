import type { ReactElement } from 'react'
import type { PageTheme } from '../../lib/pageTheme'
import { enterPage } from './Technical'

/** A dealt-card accent settles once; reading surfaces never tilt or bounce. */
function Backdrop(): ReactElement {
  return (
    <div aria-hidden="true" className="cgs-backdrop cgs-kinetic-backdrop">
      <div className="cgs-kinetic-cards">
        <span /><span /><span>♠</span>
      </div>
      <svg className="cgs-kinetic-rule" viewBox="0 0 360 40" fill="none">
        <path className="cgs-draw-line" pathLength="1" d="M0 20H338M329 11L338 20L329 29" />
      </svg>
    </div>
  )
}

export const theme: PageTheme = { name: 'kinetic', Backdrop, enter: (root) => enterPage(root, 'kinetic') }
