import type { ReactElement } from 'react'
import type { PageTheme } from '../../lib/pageTheme'
import { enterPage } from './Technical'

/** A measured title lift and a stationary serif watermark, with no DOM splitting. */
function Backdrop(): ReactElement {
  return (
    <div aria-hidden="true" className="cgs-backdrop cgs-cinematic-backdrop">
      <span className="cgs-cinematic-mark">CGS</span>
      <span className="cgs-cinematic-rule" />
    </div>
  )
}

export const theme: PageTheme = { name: 'cinematic', Backdrop, enter: (root) => enterPage(root, 'cinematic') }
