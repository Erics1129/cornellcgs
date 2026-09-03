/**
 * Device classes and the design scale.
 *
 * Every screen is sorted into one of five classes — phone, tablet, laptop,
 * desktop, tv — from its width, pointer, pixel density and UA. Each class
 * has ONE reference design width; the whole design is scaled by
 * (viewport width / reference) through the root font-size (the design is
 * rem-based) so every device inside a class renders the same page, just
 * resized to its resolution: an iPhone SE and a 15 Pro Max, an iPad mini
 * and a 13" iPad Pro, a 13" and a 16" MacBook, a 1080p and a 4K TV.
 *
 * The class rides on <html data-device>, the factor on --dscale; both are
 * recomputed on resize and orientation change.
 */

export type DeviceClass = 'phone' | 'tablet' | 'laptop' | 'desktop' | 'tv'

/** width each class was designed at (CSS px) */
export const REFERENCE: Record<DeviceClass, number> = {
  phone: 430,
  tablet: 1024,
  laptop: 1440,
  desktop: 1920,
  tv: 1920,
}

/** how far the scale may stray from 1 before we stop trusting the class */
const CLAMP: Record<DeviceClass, [number, number]> = {
  phone: [0.72, 1.15],
  tablet: [0.7, 1.3],
  laptop: [0.78, 1.2],
  desktop: [0.85, 1.4],
  tv: [1, 2.4],
}

export function classify(w = window.innerWidth, h = window.innerHeight): DeviceClass {
  const ua = navigator.userAgent
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const hover = window.matchMedia('(hover: hover)').matches
  const short = Math.min(w, h)
  const long = Math.max(w, h)
  if (/\b(SmartTV|SMART-TV|Tizen|Web0S|WebOS|NetCast|AppleTV|CrKey|BRAVIA|Roku|Viera|PlayStation|Xbox)\b/i.test(ua)) return 'tv'
  // a phone: touch, no hover, a short side under 600 (any orientation)
  if (coarse && !hover && short < 600) return 'phone'
  // a tablet: touch-first with a bigger short side; iPadOS reports a Mac UA, so touch points decide
  if ((coarse && !hover) || (navigator.maxTouchPoints > 1 && /Macintosh|iPad/.test(ua) && short < 1100)) return 'tablet'
  // pointer devices split by width: a 4K living-room screen counts as a tv
  if (long >= 2560 && window.devicePixelRatio <= 1.25) return 'tv'
  if (w >= 1680) return 'desktop'
  return 'laptop'
}

export function designScale(cls: DeviceClass, w = window.innerWidth): number {
  const [lo, hi] = CLAMP[cls]
  return Math.min(hi, Math.max(lo, w / REFERENCE[cls]))
}

let applied: { cls: DeviceClass; scale: number } | null = null
/** dev-only override (?device=tablet or __cgsDevice.force) so any class can be checked on one machine */
let forced: DeviceClass | null = null

/** Writes the class and scale to the document; returns what was applied. */
export function applyDevice(): { cls: DeviceClass; scale: number } {
  const cls = forced ?? classify()
  const scale = designScale(cls)
  const root = document.documentElement
  if (!applied || applied.cls !== cls || Math.abs(applied.scale - scale) > 0.002) {
    root.dataset.device = cls
    root.style.setProperty('--dscale', scale.toFixed(4))
    root.style.fontSize = `${(16 * scale).toFixed(3)}px`
    applied = { cls, scale }
  }
  return applied
}

/** Install once: applies now and again on every resize / rotation. */
export function installDevice(): () => void {
  if (import.meta.env.DEV) {
    const q = new URLSearchParams(location.search).get('device')
    if (q && q in REFERENCE) forced = q as DeviceClass
  }
  applyDevice()
  let t = 0
  const onResize = () => {
    window.clearTimeout(t)
    t = window.setTimeout(applyDevice, 80)
  }
  window.addEventListener('resize', onResize)
  window.addEventListener('orientationchange', onResize)
  if (import.meta.env.DEV) {
    ;(window as unknown as { __cgsDevice?: unknown }).__cgsDevice = {
      classify,
      designScale,
      applyDevice,
      REFERENCE,
      force: (c: DeviceClass | null) => {
        forced = c
        applyDevice()
      },
    }
  }
  return () => {
    window.removeEventListener('resize', onResize)
    window.removeEventListener('orientationchange', onResize)
  }
}
