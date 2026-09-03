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
   * Gate: several scrubs may share one film (one range per chapter phase).
   * Each keeps tracking its target; only the active one seeks — so the
   * ranges are all measured at mount, never mid-pin.
   */
  active?: () => boolean
}

/**
 * Scroll-scrubbed video: the reader's scroll IS the playhead — and the only
 * thing that moves it. The film never plays on its own; stop scrolling and
 * it holds its frame. Seeks are throttled — never while a seek is in flight,
 * never for sub-frame deltas, at most ~25/s — so the decoder keeps up
 * (measured 10–19 ms per seek on our clips) and Lenis' inertia does the
 * smoothing. The caller decides what happens on cleanup.
 */
export function attachVideoScrub(video: HTMLVideoElement, opts: ScrubOptions): () => void {
  if (prefersReducedMotion()) return () => {}

  let target = 0
  let last = -1
  let lastSeekAt = 0
  const MIN_DELTA = 1 / 30
  const MIN_GAP_MS = 40

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
      opts.onProgress?.(self.progress)
    },
  })

  const tick = () => {
    if (opts.active && !opts.active()) {
      last = -1 // re-seek to our target the moment we take over
      return
    }
    if (video.readyState < 2 || video.seeking) return
    const now = performance.now()
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
  }
}
