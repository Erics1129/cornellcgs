/**
 * Theme system. Five worlds cycle with the hero card's flips — ink, ivory,
 * blush, oxblood, black (the keys keep their old names so saved state and
 * the canvas layers keep working) — and every change is a
 * GRADUAL color migration (藤蔓渐变), never a cut: every theme
 * token is interpolated over ~1.2 s with an eased ramp, so the whole site's
 * colors flow from one world into the other — no covering disc, no flash.
 * The canvas layers hear the theme event and run their own matching lerps.
 *
 * The palettes here MUST mirror :root / html[data-theme='…'] in global.css.
 */

/** The five worlds, in cycle order: dark blue → light blue → light purple →
    dark purple → black → dark blue. Every flip advances one step. */
export const WORLDS = ['blue', 'sky', 'lilac', 'violet', 'black'] as const
export type Theme = (typeof WORLDS)[number]

/** Worlds whose backgrounds are light — chrome and text go dark on them. */
export const LIGHT_WORLDS: ReadonlySet<Theme> = new Set<Theme>(['sky', 'lilac'])

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
    '--bg-top': '#0d0c0a',
    '--bg-mid': '#17140f',
    '--bg-bot': '#2b241a',
    '--glow': '#7a5f3a',
    '--text': '#f2ecdf',
    '--muted': '#bdb29c',
    '--neon-core': '#fff7e8',
    '--neon-mid': '#d4b47c',
    '--neon-dim': '#2a2319',
    '--accent-amber': '#e06a52',
  },
  sky: {
    '--bg-top': '#f4efe3',
    '--bg-mid': '#ebe2cf',
    '--bg-bot': '#dccdb0',
    '--glow': '#c8ad7f',
    '--text': '#17130d',
    '--muted': '#3f372a',
    '--neon-core': '#17130d',
    '--neon-mid': '#a3242b',
    '--neon-dim': '#e4d9c2',
    '--accent-amber': '#8a4a12',
  },
  lilac: {
    '--bg-top': '#f6ece7',
    '--bg-mid': '#efd9d0',
    '--bg-bot': '#ddb3a6',
    '--glow': '#c46a5c',
    '--text': '#2a0d0c',
    '--muted': '#4f2b27',
    '--neon-core': '#2a0d0c',
    '--neon-mid': '#ad1a2b',
    '--neon-dim': '#f0dcd3',
    '--accent-amber': '#7c4510',
  },
  violet: {
    '--bg-top': '#150607',
    '--bg-mid': '#2e0c10',
    '--bg-bot': '#5a1b1e',
    '--glow': '#a8322c',
    '--text': '#f7ede6',
    '--muted': '#d6b8ae',
    '--neon-core': '#fff2ea',
    '--neon-mid': '#ec8a6c',
    '--neon-dim': '#3b1214',
    '--accent-amber': '#f0c07e',
  },
  black: {
    '--bg-top': '#000000',
    '--bg-mid': '#0a0a09',
    '--bg-bot': '#1b1a17',
    '--glow': '#3d3a33',
    '--text': '#f3f1ec',
    '--muted': '#a8a49a',
    '--neon-core': '#ffffff',
    '--neon-mid': '#c9cdd6',
    '--neon-dim': '#22211d',
    '--accent-amber': '#e0a96a',
  },
}

const DURATION_MS = 1200

/** Every layer of the flip (DOM tokens, code rain, WebGL sky, video tint,
    ripple) rides this one clock with the same smoothstep curvature. */
export const THEME_LERP_MS = DURATION_MS
export const themeLerpEase = (t: number) => t * t * (3 - 2 * t)

let raf = 0

export function currentTheme(): Theme {
  const v = document.documentElement.dataset.theme as Theme | undefined
  return v && (WORLDS as readonly string[]).includes(v) ? v : 'blue'
}

/** The world after `t` in the cycle. */
export function nextTheme(t: Theme = currentTheme()): Theme {
  return WORLDS[(WORLDS.indexOf(t) + 1) % WORLDS.length]
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
    { duration: DURATION_MS, easing: 'cubic-bezier(0.83, 0, 0.17, 1)' },
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
  const next = nextTheme()
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
  const ease = themeLerpEase
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

// Dev-only: lets automated probes step the world cycle without the 10 s clock
if (import.meta.env.DEV) {
  ;(window as unknown as { __cgsTheme?: unknown }).__cgsTheme = { flipThemeAt, currentTheme, nextTheme, WORLDS }
}
