/**
 * Ink Maze coding level: when the panes stack (board, problem, editor,
 * console in one column) instead of sitting side by side.
 *
 * A narrow window, and also a touch screen held sideways: a landscape phone
 * (844 x 390, 896 x 414 ...) is wide enough for two panes in CSS pixels, but
 * the site sets a large root font on phones (src/lib/device.ts), so the two
 * panes' minimum widths would add up to more than the screen. Keep in step
 * with the @media rules in src/styles/ink-maze-code.css.
 */
export const STACKED_QUERY = '(max-width: 760px), (pointer: coarse) and (max-height: 500px)'

/** True when the panes stack (safe to call where matchMedia is missing). */
export function stackedNow(): boolean {
  try {
    return window.matchMedia(STACKED_QUERY).matches
  } catch {
    return false
  }
}
