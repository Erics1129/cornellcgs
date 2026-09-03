import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { prefersReducedMotion } from './motion'

gsap.registerPlugin(ScrollTrigger)

export interface ScrubOptions {
  trigger: Element
  /** ScrollTrigger start/end (defaults: 'top bottom' → 'bottom top') */
  start?: string
  end?: string
  /** Playhead range in seconds (defaults: 0 → duration) */
  from?: number
  to?: number
  /** Called with the mapped progress on every update (0..1) */
  onProgress?: (p: number) => void
  /**
   * Idle drift: once the scroll has been still this long (ms), the film
   * plays forward on its own at `rate` (a fraction of real time) until the
   * next scroll — the frame is never static. Default 900 ms / 0.35.
   */
  idle?: { after?: number; rate?: number } | false
}

/**
 * Scroll-scrubbed video: the reader's scroll IS the playhead. Seeks are
 * throttled — never while a seek is in flight, never for sub-frame deltas,
 * at most ~25/s — so the decoder keeps up (measured 10–19 ms per seek on
 * our clips) and Lenis' inertia does the smoothing. The video stays paused
 * for the life of the scrub; the caller decides what happens on cleanup.
 */
export function attachVideoScrub(video: HTMLVideoElement, opts: ScrubOptions): () => void {
  if (prefersReducedMotion()) return () => {}

  let target = 0
  let last = -1
  let lastSeekAt = 0
  let lastScrollAt = performance.now()
  let drifting = false
  const MIN_DELTA = 1 / 30
  const MIN_GAP_MS = 40
  const idleAfter = opts.idle === false ? Infinity : (opts.idle?.after ?? 900)
  const idleRate = opts.idle === false ? 0 : (opts.idle?.rate ?? 0.35)

  const range = () => {
    const from = opts.from ?? 0
    const to = opts.to ?? (Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 8)
    return { from, to }
  }

  const st = ScrollTrigger.create({
    trigger: opts.trigger,
    start: opts.start ?? 'top bottom',
    end: opts.end ?? 'bottom top',
    scrub: true,
    onUpdate: (self) => {
      const { from, to } = range()
      target = from + (to - from) * self.progress
      lastScrollAt = performance.now()
      opts.onProgress?.(self.progress)
    },
  })

  const tick = () => {
    if (video.readyState < 2 || video.seeking) return
    const now = performance.now()
    // Idle: the reader stopped — let the film breathe at a fraction of real
    // time (only while its trigger is on screen); any scroll takes it back.
    if (now - lastScrollAt > idleAfter && st.isActive) {
      if (!drifting) {
        drifting = true
        video.playbackRate = idleRate
        video.play().catch(() => {})
      }
      return
    }
    if (drifting) {
      drifting = false
      video.pause()
      video.playbackRate = 1
      last = -1 // re-seek to the scroll target immediately
    }
    if (now - lastSeekAt < MIN_GAP_MS) return
    if (Math.abs(target - last) < MIN_DELTA) return
    if (!video.paused) video.pause()
    last = target
    lastSeekAt = now
    // Always an exact seek: fastSeek snaps to the nearest keyframe, and these
    // clips carry almost none — on Safari every long jump would land on 0.
    video.currentTime = target
  }
  gsap.ticker.add(tick)

  return () => {
    gsap.ticker.remove(tick)
    st.kill()
    // hand the element back at real speed (the ML burst plays it normally)
    video.playbackRate = 1
  }
}
