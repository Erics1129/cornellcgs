/**
 * Theme system. World 1 (card face down) is dark blue, World 2 (face up) is
 * deep indigo. The flip is a GRADUAL color migration (藤蔓渐变): every theme
 * token is interpolated over ~1.2 s with an eased ramp, so the whole site's
 * colors flow from one world into the other — no covering disc, no flash.
 * The canvas layers hear the theme event and run their own matching lerps.
 *
 * The palettes here MUST mirror :root / html[data-theme='red'] in global.css.
 */

export type Theme = 'blue' | 'red'

export const THEME_EVENT = 'cgs:theme'

const VARS = [
  '--bg-top',
  '--bg-mid',
  '--bg-bot',
  '--glow',
  '--text',
  '--muted',
  '--neon-core',
  '--neon-mid',
  '--neon-dim',
  '--accent-amber',
] as const

const PALETTES: Record<Theme, Record<(typeof VARS)[number], string>> = {
  blue: {
    '--bg-top': '#04081c',
    '--bg-mid': '#0b2a6b',
    '--bg-bot': '#3b5fb8',
    '--glow': '#2f6bff',
    '--text': '#f2f5ff',
    '--muted': '#a9b4d6',
    '--neon-core': '#e8fbff',
    '--neon-mid': '#4ea8ff',
    '--neon-dim': '#12336b',
    '--accent-amber': '#ffc46b',
  },
  red: {
    '--bg-top': '#060427',
    '--bg-mid': '#1a1670',
    '--bg-bot': '#4a43c4',
    '--glow': '#5a5aff',
    '--text': '#f0f0ff',
    '--muted': '#a9a9dc',
    '--neon-core': '#ededff',
    '--neon-mid': '#7a85ff',
    '--neon-dim': '#1b1b5e',
    '--accent-amber': '#ffd08a',
  },
}

const DURATION_MS = 1200

let raf = 0

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'red' ? 'red' : 'blue'
}

function announce(theme: Theme) {
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { theme } }))
}

type RGB = [number, number, number]

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mix(a: RGB, b: RGB, t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t)
  const g = Math.round(a[1] + (b[1] - a[1]) * t)
  const bl = Math.round(a[2] + (b[2] - a[2]) * t)
  return `rgb(${r},${g},${bl})`
}

/** A soft half-transparent ripple from the card — a cue, not a cover. */
function ripple(x: number, y: number, color: string) {
  if (typeof HTMLElement.prototype.animate !== 'function') return
  const d = document.createElement('div')
  d.setAttribute('aria-hidden', 'true')
  d.style.cssText = `position:fixed;inset:0;z-index:95;pointer-events:none;background:${color};opacity:0.35;clip-path:circle(0px at ${x}px ${y}px)`
  document.body.appendChild(d)
  const r =
    Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) * 1.06
  const anim = d.animate(
    [
      { clipPath: `circle(0px at ${x}px ${y}px)`, opacity: 0.38 },
      { clipPath: `circle(${Math.round(r)}px at ${x}px ${y}px)`, opacity: 0.16, offset: 0.7 },
      { clipPath: `circle(${Math.round(r)}px at ${x}px ${y}px)`, opacity: 0 },
    ],
    { duration: 900, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
  )
  const done = () => d.remove()
  anim.onfinish = done
  anim.oncancel = done
}

/**
 * Flip the world: a site-wide gradual color migration, cued by a soft
 * translucent ripple expanding from (x, y) — the card.
 */
export function flipThemeAt(x: number, y: number): Theme {
  const next: Theme = currentTheme() === 'blue' ? 'red' : 'blue'
  const root = document.documentElement

  cancelAnimationFrame(raf)

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced) {
    VARS.forEach((v) => root.style.removeProperty(v))
    root.dataset.theme = next
    announce(next)
    return next
  }

  // Start from whatever is on screen right now (mid-flip flips included)
  const style = getComputedStyle(root)
  const from: Record<string, RGB> = {}
  const to: Record<string, RGB> = {}
  for (const v of VARS) {
    const cur = style.getPropertyValue(v).trim()
    from[v] = cur.startsWith('#') ? hexToRgb(cur) : parseRgb(cur) ?? hexToRgb(PALETTES[currentTheme()][v])
    to[v] = hexToRgb(PALETTES[next][v])
  }

  // The canvas layers start their own eased lerp on this event
  root.dataset.theme = next
  announce(next)
  if (Number.isFinite(x) && Number.isFinite(y)) ripple(x, y, PALETTES[next]['--bg-mid'])

  const t0 = performance.now()
  const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / DURATION_MS)
    const e = ease(t)
    for (const v of VARS) root.style.setProperty(v, mix(from[v], to[v], e))
    if (t < 1) {
      raf = requestAnimationFrame(step)
    } else {
      // hand control back to the stylesheet's own values
      VARS.forEach((v) => root.style.removeProperty(v))
    }
  }
  raf = requestAnimationFrame(step)

  return next
}

function parseRgb(s: string): RGB | null {
  const m = s.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
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
