/**
 * Theme system. World 1 (card face down) is dark blue, World 2 (face up) is
 * deep indigo. The flip is a radial wipe: a single flat-colored disc expands
 * from the card, the variables swap the instant the screen is covered, and
 * the disc fades off while the canvas layers lerp their own colors (§5.3).
 *
 * Deliberately NOT the View Transitions API: startViewTransition rasterizes
 * the whole page (videos, canvases and all) into snapshots — a visible hitch
 * every time the card auto-flips. One composited clip-path disc costs nothing.
 */

export type Theme = 'blue' | 'red'

export const THEME_EVENT = 'cgs:theme'

/** The covering disc paints the NEXT world's mid color (values from global.css). */
const WORLD_MID: Record<Theme, string> = {
  blue: '#0b2a6b',
  red: '#1a1670',
}

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'red' ? 'red' : 'blue'
}

function announce(theme: Theme) {
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { theme } }))
}

function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
}

/**
 * Flip the world with a radial wipe centered on (x, y) in viewport pixels —
 * pass the hero card's center so the wipe grows out of the card.
 * Returns the theme we flipped to.
 */
export function flipThemeAt(x: number, y: number): Theme {
  const next: Theme = currentTheme() === 'blue' ? 'red' : 'blue'

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced || typeof HTMLElement.prototype.animate !== 'function') {
    setTheme(next)
    announce(next)
    return next
  }

  const disc = document.createElement('div')
  disc.setAttribute('aria-hidden', 'true')
  disc.style.cssText = `position:fixed;inset:0;z-index:95;pointer-events:none;background:${WORLD_MID[next]};clip-path:circle(0px at ${x}px ${y}px);will-change:clip-path`
  document.body.appendChild(disc)

  // Far enough to cover the most distant screen corner
  const r =
    Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    ) * 1.06

  const grow = disc.animate(
    [
      { clipPath: `circle(0px at ${x}px ${y}px)` },
      { clipPath: `circle(${Math.round(r)}px at ${x}px ${y}px)` },
    ],
    { duration: 500, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' },
  )

  const finish = () => {
    setTheme(next)
    announce(next)
    const fade = disc.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 280,
      easing: 'ease-out',
      fill: 'forwards',
    })
    fade.onfinish = () => disc.remove()
    fade.oncancel = () => disc.remove()
  }
  grow.onfinish = finish
  grow.oncancel = finish

  return next
}

/** Subscribe to theme changes; returns an unsubscribe function. */
export function onTheme(cb: (theme: Theme) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<{ theme: Theme }>).detail.theme)
  window.addEventListener(THEME_EVENT, handler)
  return () => window.removeEventListener(THEME_EVENT, handler)
}

/** Read a CSS custom property off <html> (current theme's value). */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
