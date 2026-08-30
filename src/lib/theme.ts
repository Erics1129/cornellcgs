/**
 * Theme system. Blue world = hero card face down, Red world = face up.
 * The flip is a radial wipe: we set the wipe origin custom props, then swap
 * data-theme inside a View Transition so the new world is revealed by an
 * expanding circle (see global.css). Browsers without the View Transitions
 * API get an 800 ms cross-transition of every themed color instead.
 */

export type Theme = 'blue' | 'red'

export const THEME_EVENT = 'cgs:theme'

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
  const root = document.documentElement
  root.style.setProperty('--wipe-x', `${((x / window.innerWidth) * 100).toFixed(2)}%`)
  root.style.setProperty('--wipe-y', `${((y / window.innerHeight) * 100).toFixed(2)}%`)

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> }
  }

  if (!reduced && typeof doc.startViewTransition === 'function') {
    doc.startViewTransition(() => {
      setTheme(next)
      announce(next)
    })
  } else {
    // Fallback: transition every themed color over 800 ms.
    root.classList.add('theme-anim')
    setTheme(next)
    announce(next)
    window.setTimeout(() => root.classList.remove('theme-anim'), 850)
  }
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
