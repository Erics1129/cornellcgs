/**
 * tier.ts — device tier and the adaptive quality governor. CONTRACT FILE, owner: stream "interaction".
 *
 * Two things live here.
 *
 * 1. The tier: one of five rows of TABLE, picked from the device class
 *    (lib/device.ts) plus the save-data and memory signals. It answers "how
 *    much may a scene spend on this machine": pixel caps, how many heavy
 *    scenes draw at once, bloom, stars, decoded frames.
 *
 * 2. The governor: scenes report every frame they draw (reportFrame). When
 *    frames run long for 30 frames in a row the governor steps one level
 *    down (render scale first, then effects); after a clean stretch it tries
 *    one level up. A step is only ever applied while the page is at rest,
 *    because it reallocates buffers, and it reaches scenes through onTier.
 *
 * Never dropped by any level: text, posters, seams, settle draws.
 *
 * Every export of the step-0 stub keeps its name and signature. Additions:
 * Tier.continuous, Tier.slowNetwork, excuseFrames(), governorState().
 */
import { deviceClass, onDeviceChange, type DeviceClass } from './device'
import { deckFrame } from './deck'

export type TierName = 'low' | 'phone' | 'tablet' | 'laptop' | 'desktop'

export interface Tier {
  name: TierName
  coarse: boolean
  hover: boolean
  reducedMotion: boolean
  /** display refresh rate, measured after the curtain lifts (60 until then) */
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
  /**
   * (added) false when scenes with their own clock must not run a loop: reduced
   * motion, Low Power Mode, or the governor floor. They still draw on input,
   * on scroll and on every settle.
   */
  continuous: boolean
  /** (added) save-data, or a 2g/3g connection: skip heavy warm-up downloads */
  slowNetwork: boolean
}

type Row = Omit<Tier, 'name' | 'coarse' | 'hover' | 'reducedMotion' | 'hz' | 'lowPower' | 'p3' | 'saveData' | 'level' | 'scale' | 'continuous' | 'slowNetwork'>

/**
 * Start values. One change from the spec table, from its critique: at least
 * four WebGL contexts stay alive on every tier. The World chapter alone holds
 * two (globe, travel photos) beside the page background, so a budget of two
 * would destroy and rebuild contexts on every pass; what protects a phone is
 * "one heavy scene drawing per frame" and the texture sizes, not this count.
 */
const TABLE: Record<TierName, Row> = {
  low: { dprCap: 1.25, pixelCap: 1_000_000, heavyDrawing: 1, contextsAlive: 4, bloom: 'off', halation: false, chromaticAberration: false, grainAnimated: false, fluid: false, bgFps: 0, stars: 400, seqWindow: 6, seqHalfRes: true, textureMax: 2048 },
  phone: { dprCap: 2, pixelCap: 2_000_000, heavyDrawing: 1, contextsAlive: 4, bloom: 'mip', halation: false, chromaticAberration: false, grainAnimated: false, fluid: false, bgFps: 30, stars: 640, seqWindow: 8, seqHalfRes: true, textureMax: 2048 },
  tablet: { dprCap: 2, pixelCap: 3_000_000, heavyDrawing: 1, contextsAlive: 4, bloom: 'mip', halation: true, chromaticAberration: false, grainAnimated: false, fluid: false, bgFps: 30, stars: 800, seqWindow: 12, seqHalfRes: false, textureMax: 2048 },
  laptop: { dprCap: 2, pixelCap: 5_200_000, heavyDrawing: 2, contextsAlive: 6, bloom: 'chain4', halation: true, chromaticAberration: true, grainAnimated: true, fluid: true, bgFps: 60, stars: 1400, seqWindow: 16, seqHalfRes: false, textureMax: 4096 },
  desktop: { dprCap: 2, pixelCap: 8_300_000, heavyDrawing: 2, contextsAlive: 8, bloom: 'chain5', halation: true, chromaticAberration: true, grainAnimated: true, fluid: true, bgFps: 60, stars: 2000, seqWindow: 16, seqHalfRes: false, textureMax: 4096 },
}

type Level = Tier['level']
/** what each governor level costs: render scale first, effects after */
const LEVEL_SCALE: Record<Level, number> = { 0: 1, 1: 0.85, 2: 0.72, 3: 0.6, 4: 0.5 }
const BLOOM_DOWN: Record<Tier['bloom'], Tier['bloom']> = { chain5: 'chain4', chain4: 'chain3', chain3: 'mip', mip: 'off', off: 'off' }
const FRAME_TIMES = [1000 / 120, 1000 / 90, 1000 / 60, 1000 / 30] as const
const HZ = [120, 90, 60, 30] as const

const CLASS_TIER: Record<DeviceClass, TierName> = { phone: 'phone', tablet: 'tablet', laptop: 'laptop', desktop: 'desktop', tv: 'desktop' }
const TIER_NAMES: readonly TierName[] = ['low', 'phone', 'tablet', 'laptop', 'desktop']

const listeners = new Set<(t: Tier) => void>()
let current: Tier | null = null

// ---- signals that do not come from the device class -------------------------------------------
let hz: Tier['hz'] = 60
let frameMs = 1000 / 60
let lowPower = false
let level: Level = 0
/** dev overrides (?tier=, ?fx=); a forced level switches the governor off */
let forcedName: TierName | null = null
let forcedLevel: Level | null = null

const mq = (q: string) => typeof matchMedia === 'function' && matchMedia(q).matches

type Connection = { saveData?: boolean; effectiveType?: string }
function connection(): Connection | undefined {
  return typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { connection?: Connection }).connection
}

function build(): Tier {
  const coarse = mq('(pointer: coarse)')
  const reducedMotion = mq('(prefers-reduced-motion: reduce)')
  const conn = connection()
  const saveData = !!conn?.saveData
  const memory = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  const cls: DeviceClass = typeof window === 'undefined' ? 'laptop' : deviceClass()
  const weak = saveData || (typeof memory === 'number' && memory <= 2)
  const base: TierName = forcedName ?? (weak ? 'low' : CLASS_TIER[cls])
  const row = { ...TABLE[base] }
  if (level >= 2) row.bloom = BLOOM_DOWN[row.bloom]
  if (level >= 3) {
    row.halation = false
    row.chromaticAberration = false
    row.stars = Math.round(row.stars * 0.6)
    row.grainAnimated = false
    row.bgFps = 0
    row.fluid = false
  }
  if (reducedMotion) {
    row.grainAnimated = false
    row.fluid = false
    row.bgFps = 0
  }
  return {
    // the governor floor reads as the low tier everywhere a name is checked
    name: level >= 4 ? 'low' : base,
    coarse, hover: mq('(hover: hover)'), reducedMotion, hz, lowPower, p3: mq('(color-gamut: p3)'), saveData,
    scale: LEVEL_SCALE[level], level,
    continuous: !(reducedMotion || lowPower || level >= 4),
    slowNetwork: saveData || /(^|-)(2g|3g)$/.test(conn?.effectiveType ?? ''),
    ...row,
  }
}

function mirror(t: Tier) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.tier = t.name
  root.dataset.fxLevel = String(t.level)
}

/** Rebuild the cached tier and tell everyone, but only if something a scene can see changed. */
function publish() {
  const next = build()
  const prev = current
  current = next
  mirror(next)
  if (prev && (Object.keys(next) as (keyof Tier)[]).every((k) => prev[k] === next[k])) return
  for (const fn of listeners) fn(next)
}

/** The current tier. Cheap; cached. Values change only through onTier. */
export function tier(): Tier {
  return (current ??= build())
}

/** Fires when the device class or the governor level changes, and only while the deck is at rest. */
export function onTier(fn: (t: Tier) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// ---- the governor -----------------------------------------------------------------------------
let running = false
/** a change waiting for the page to come to rest; 'class' = the device class or a signal changed */
let pendingLevel: Level | null = null
let pendingRebuild = false
/** consecutive frames over budget */
let over = 0
/** ms of reported frames since the last dropped one */
let cleanMs = 0
/** how long a clean stretch must be before one level up is tried; doubles when a try fails */
let upWait = 10_000
/** a step up is on trial until this time: drops inside it send the level back */
let trialUntil = 0
let trialDrops = 0
/** frames reported before this time are not judged (reallocation, warm-up, tab return) */
let excuseUntil = 0
/** the lowest level the governor may climb back to (3 in Low Power Mode) */
let floor: Level = 0
// High refresh displays: a scene holding 60 fps is fine. Level 1 may be tried once to reach the full rate.
let hzMiss = 0
let hzTrial = 0
let hzTrialGood = 0
let hzTrialOn = false
let hzSettled = false

function atRest(): boolean {
  // The deck is only asked once the page exists (the stub measures chapters on first use).
  if (typeof document === 'undefined' || !document.getElementById('root')?.firstChild) return true
  const f = deckFrame()
  return f.idle && f.rest >= 1
}

function flush() {
  if (pendingLevel === null && !pendingRebuild) return
  if (!atRest()) return
  if (pendingLevel !== null) level = pendingLevel
  pendingLevel = null
  pendingRebuild = false
  over = 0
  // the frames that reallocate buffers say nothing about steady cost
  excuseUntil = performance.now() + 500
  publish()
}

function requestLevel(next: number) {
  const clamped = Math.max(floor, Math.min(4, Math.round(next))) as Level
  if (clamped === (pendingLevel ?? level)) return
  pendingLevel = clamped
  flush()
}

function requestRebuild() {
  pendingRebuild = true
  flush()
}

/**
 * Scenes report every drawn frame. `dtMs` is the time since that scene's
 * previous frame; `continuous` says the scene wanted another frame, so the
 * gap to the next report is a real frame time and not a pause between
 * on-demand draws.
 */
export function reportFrame(dtMs: number, continuous: boolean): void {
  if (!running || forcedLevel !== null) return
  const now = performance.now()
  if (now < excuseUntil || !(dtMs > 0) || dtMs > 1000) return
  // a long gap between on-demand draws is a pause, not a slow frame
  if (!continuous && dtMs > frameMs * 3) return

  // Step-down budget: 60 fps is enough on a 90 or 120 Hz display.
  const budget = Math.max(frameMs, 1000 / 60)
  const dropped = dtMs > budget * 1.35
  if (dropped) {
    over += 1
    cleanMs = 0
    if (trialUntil && now < trialUntil) {
      trialDrops += 1
      if (trialDrops >= 3) {
        // the step up did not hold: go back and wait twice as long before the next try
        trialUntil = 0
        upWait = Math.min(upWait * 2, 160_000)
        requestLevel(level + 1)
        return
      }
    }
    if (over >= 30) {
      over = 0
      requestLevel((pendingLevel ?? level) + 1)
    }
    return
  }
  over = 0
  cleanMs += dtMs
  if (trialUntil && now >= trialUntil) {
    // held for two seconds: the next try waits the normal ten again
    trialUntil = 0
    upWait = 10_000
  }

  // 90 and 120 Hz: holding 60 is not a fault, but level 1 gets one chance to reach the full rate
  if (frameMs < 16 && !hzSettled) {
    const full = dtMs <= frameMs * 1.35
    if (hzTrialOn) {
      // judged only once level 1 is really in force
      if (level !== 1 || pendingLevel !== null) return
      hzTrial += 1
      if (full) hzTrialGood += 1
      if (hzTrial >= 90) {
        hzTrialOn = false
        hzSettled = true
        if (hzTrialGood / hzTrial >= 0.8) floor = Math.max(floor, 1) as Level
        else requestLevel(0)
      }
    } else if (level === 0 && pendingLevel === null) {
      hzMiss = full ? 0 : hzMiss + 1
      if (hzMiss >= 30) {
        hzMiss = 0
        hzTrial = hzTrialGood = 0
        hzTrialOn = true
        requestLevel(1)
      }
    }
  }

  // A clean stretch: try one level up, on trial for two seconds.
  if (level > floor && pendingLevel === null && !hzTrialOn && cleanMs >= upWait && atRest()) {
    cleanMs = 0
    trialDrops = 0
    requestLevel(level - 1)
    trialUntil = performance.now() + 2500
  }
}

/**
 * (added) The scene manager calls this in a frame where prepare(), a texture
 * upload or a decode ran: frames inside the window are not judged.
 */
export function excuseFrames(ms = 250): void {
  excuseUntil = Math.max(excuseUntil, performance.now() + ms)
}

/** (added) For window.__film.state() and the probe. */
export function governorState() {
  return { level, pendingLevel, floor, over, cleanMs, upWait, hz, frameMs, lowPower, forcedLevel, forcedName, trial: trialUntil > 0, hzTrialOn, hzSettled }
}

// ---- refresh-rate probe -----------------------------------------------------------------------
type ProbeResult = { ms: number; spread: number }

/** 60 frame intervals with no long task; the lower quartile is the display's frame time. */
function probeFrames(): Promise<ProbeResult | null> {
  return new Promise((resolve) => {
    const gaps: number[] = []
    let last = 0
    let seen = 0
    const step = (now: number) => {
      if (document.hidden) return resolve(null)
      if (last) {
        const gap = now - last
        // an interval that holds a long task is not a frame
        if (gap > 0 && gap <= 50) gaps.push(gap)
      }
      last = now
      seen += 1
      if (gaps.length >= 60 || seen >= 240) {
        if (gaps.length < 30) return resolve(null)
        gaps.sort((a, b) => a - b)
        const q = (p: number) => gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * p))]
        return resolve({ ms: q(0.25), spread: q(0.75) - q(0.25) })
      }
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  })
}

function snap(ms: number): number {
  let best = 2
  for (let i = 0; i < FRAME_TIMES.length; i++) {
    if (Math.abs(Math.log(ms / FRAME_TIMES[i])) < Math.abs(Math.log(ms / FRAME_TIMES[best]))) best = i
  }
  return best
}

const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms))
const lowPowerLike = (r: ProbeResult | null) => !!r && r.ms >= 30 && r.ms <= 34.5 && r.spread < 2

let probing = false
async function measureDisplay() {
  if (probing || typeof window === 'undefined') return
  probing = true
  try {
    const first = await probeFrames()
    if (!first) return
    const index = snap(first.ms)
    let low = false
    // Low Power Mode needs two probes a second apart that both sit on 30 Hz, on a touch device.
    if (lowPowerLike(first) && mq('(pointer: coarse)')) {
      await wait(1000)
      low = lowPowerLike(await probeFrames())
    }
    const changed = HZ[index] !== hz || low !== lowPower
    hz = HZ[index]
    frameMs = FRAME_TIMES[index]
    lowPower = low
    if (low) {
      floor = 3
      if (forcedLevel === null && level < 3) pendingLevel = 3
      // the verdict is checked again: the mode can be switched off, and a busy boot can fool one reading
      window.setTimeout(measureDisplay, 30_000)
    } else if (floor === 3) {
      floor = 0
    }
    if (changed || pendingLevel !== null) requestRebuild()
  } finally {
    probing = false
  }
}

function readOverrides() {
  if (!import.meta.env.DEV || typeof location === 'undefined') return
  const params = new URLSearchParams(location.search)
  const name = params.get('tier')
  if (name && (TIER_NAMES as readonly string[]).includes(name)) forcedName = name as TierName
  const fx = params.get('fx')
  if (fx !== null && /^[0-4]$/.test(fx)) {
    forcedLevel = Number(fx) as Level
    level = forcedLevel
  }
}

/** Mini-game routes share main.tsx but are not part of this build: nothing runs there. */
function pageKind(): string {
  if (typeof document === 'undefined') return 'deck'
  return document.documentElement.dataset.page ?? 'deck'
}

/** Boot (class detection, refresh-rate probe, html[data-tier], html[data-fx-level]). Called once from main.tsx. */
export function initTier(): () => void {
  if (typeof window === 'undefined' || pageKind() === 'game') return () => {}
  readOverrides()
  current = build()
  mirror(current)
  running = true

  const onSettle = () => flush()
  const offDevice = onDeviceChange(requestRebuild)
  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  const onMotion = () => requestRebuild()

  // The boot frames (React mount, fonts, hero video) are never used: measure once the curtain has lifted.
  let bootTimer = 0
  const measureSoon = () => {
    window.clearTimeout(bootTimer)
    bootTimer = window.setTimeout(measureDisplay, 700)
  }
  const shown = (window as { __cgsShown?: boolean }).__cgsShown
  if (shown || pageKind() === 'sub') measureSoon()
  else window.addEventListener('cgs:shown', measureSoon, { once: true })

  const onVisibility = () => {
    if (document.hidden) return
    // a tab coming back runs slow for a moment and may be on another display
    excuseFrames(500)
    over = 0
    measureSoon()
  }

  window.addEventListener('cgs:settle', onSettle)
  motion.addEventListener('change', onMotion)
  document.addEventListener('visibilitychange', onVisibility)

  if (import.meta.env.DEV) {
    ;(window as unknown as { __tier?: unknown }).__tier = {
      tier, state: governorState, report: reportFrame, excuse: excuseFrames, measure: measureDisplay,
      setLevel: (n: number) => { level = Math.max(0, Math.min(4, n)) as Level; publish() },
    }
  }

  return () => {
    running = false
    window.clearTimeout(bootTimer)
    offDevice()
    window.removeEventListener('cgs:settle', onSettle)
    window.removeEventListener('cgs:shown', measureSoon)
    motion.removeEventListener('change', onMotion)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}
