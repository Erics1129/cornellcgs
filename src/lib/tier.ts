/**
 * tier.ts — device tier and the adaptive quality governor. CONTRACT FILE, owner: stream "interaction".
 * STUB from SPEC.md §9: static values, no governor. Keep every export's name and signature.
 */
export type TierName = 'low' | 'phone' | 'tablet' | 'laptop' | 'desktop'

export interface Tier {
  name: TierName
  coarse: boolean
  hover: boolean
  reducedMotion: boolean
  /** display refresh rate, measured from the first 20 animation frames */
  hz: 30 | 60 | 90 | 120
  /** a steady 30 Hz on a 60 Hz class device (iOS Low Power Mode): no continuous animation */
  lowPower: boolean
  p3: boolean
  saveData: boolean
  /** device pixel ratio cap for full-viewport shader scenes */
  dprCap: number
  /** device pixels per scene */
  pixelCap: number
  /** governor render scale, 0.5..1; multiply the capped canvas size by it */
  scale: number
  /** heavy scenes allowed to draw in one frame */
  heavyDrawing: number
  /** WebGL contexts allowed to stay alive */
  contextsAlive: number
  bloom: 'chain5' | 'chain4' | 'chain3' | 'mip' | 'off'
  halation: boolean
  chromaticAberration: boolean
  grainAnimated: boolean
  fluid: boolean
  /** frames per second for the fixed background layers; 0 = draw on demand only */
  bgFps: 0 | 30 | 60
  stars: number
  /** decoded frames kept around a sequence playhead */
  seqWindow: number
  seqHalfRes: boolean
  /** longest texture side */
  textureMax: number
  /** governor step, 0 = full quality for this tier, 4 = floor */
  level: 0 | 1 | 2 | 3 | 4
}

const TABLE: Record<TierName, Omit<Tier, 'name' | 'coarse' | 'hover' | 'reducedMotion' | 'hz' | 'lowPower' | 'p3' | 'saveData' | 'level' | 'scale'>> = {
  low: { dprCap: 1.25, pixelCap: 1_000_000, heavyDrawing: 1, contextsAlive: 2, bloom: 'off', halation: false, chromaticAberration: false, grainAnimated: false, fluid: false, bgFps: 0, stars: 400, seqWindow: 6, seqHalfRes: true, textureMax: 2048 },
  phone: { dprCap: 2, pixelCap: 2_000_000, heavyDrawing: 1, contextsAlive: 2, bloom: 'mip', halation: false, chromaticAberration: false, grainAnimated: false, fluid: false, bgFps: 30, stars: 640, seqWindow: 8, seqHalfRes: true, textureMax: 2048 },
  tablet: { dprCap: 2, pixelCap: 3_000_000, heavyDrawing: 1, contextsAlive: 3, bloom: 'mip', halation: true, chromaticAberration: false, grainAnimated: false, fluid: false, bgFps: 30, stars: 800, seqWindow: 12, seqHalfRes: false, textureMax: 2048 },
  laptop: { dprCap: 2, pixelCap: 5_200_000, heavyDrawing: 2, contextsAlive: 6, bloom: 'chain4', halation: true, chromaticAberration: true, grainAnimated: true, fluid: true, bgFps: 60, stars: 1400, seqWindow: 16, seqHalfRes: false, textureMax: 4096 },
  desktop: { dprCap: 2, pixelCap: 8_300_000, heavyDrawing: 2, contextsAlive: 8, bloom: 'chain5', halation: true, chromaticAberration: true, grainAnimated: true, fluid: true, bgFps: 60, stars: 2000, seqWindow: 16, seqHalfRes: false, textureMax: 4096 },
}

const listeners = new Set<(t: Tier) => void>()
let current: Tier | null = null

function detect(): Tier {
  const mq = (q: string) => typeof matchMedia === 'function' && matchMedia(q).matches
  const coarse = mq('(pointer: coarse)')
  const w = typeof window === 'undefined' ? 1440 : window.innerWidth
  const short = typeof window === 'undefined' ? 900 : Math.min(window.innerWidth, window.innerHeight)
  const name: TierName = coarse ? (short < 600 ? 'phone' : 'tablet') : w >= 1920 ? 'desktop' : 'laptop'
  return {
    name, coarse, hover: mq('(hover: hover)'), reducedMotion: mq('(prefers-reduced-motion: reduce)'),
    hz: 60, lowPower: false, p3: mq('(color-gamut: p3)'), saveData: false, scale: 1, level: 0, ...TABLE[name],
  }
}

/** The current tier. Cheap; cached. Values change only through onTier. */
export function tier(): Tier {
  return (current ??= detect())
}

/** Fires when the device class or the governor level changes. The real module only fires while the deck is at rest. */
export function onTier(fn: (t: Tier) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Scenes report every drawn frame; the governor averages these. `continuous` = the scene wanted another frame. */
export function reportFrame(_dtMs: number, _continuous: boolean): void {}

/** Boot (class detection, refresh-rate probe, html[data-tier], html[data-fx-level]). Called once from main.tsx. */
export function initTier(): () => void {
  current = detect()
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.tier = current.name
    document.documentElement.dataset.fxLevel = '0'
  }
  return () => {}
}
