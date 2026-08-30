import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { flipThemeAt } from '../lib/theme'
import { isPaging } from '../lib/scroll'
import { isPageOpen } from '../lib/router'
import { prefersReducedMotion, isTouchDevice } from '../lib/motion'

/**
 * The hero centerpiece — the provided card animation (card.mp4), masked so its
 * baked gradient melts into the site background. The video *is* the theme
 * flip: it opens paused on the ornate back (blue world); clicking plays the
 * rotate-and-zoom, and the site wipes to the Red world the instant the card
 * passes edge-on. Clicking again seeks back to the start and wipes to Blue.
 *
 * Timeline of card.mp4 (10 s, 24 fps):
 *   0.0–1.2   card back, blue gradient           → blue idle frame ~0.55
 *   1.2–3.4   zoom in, background warms
 *   ~3.6      edge-on — the flip moment          → theme wipe fires here
 *   4.0–8.0   ace revealed, zooms back out
 *   8.0–10.0  ace settled on red gradient        → red idle frame ~9.7
 */
const T_BLUE = 0.55
const T_WIPE = 3.6
const T_RED = 9.7

type Phase = 'blue' | 'flipping' | 'red'

export default function HeroCard() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const phase = useRef<Phase>('blue')
  const wiped = useRef(false)
  const raf = useRef(0)
  const flipRef = useRef<() => void>(() => {})
  const autoTimer = useRef(0)
  const [videoOk, setVideoOk] = useState(true)

  /** Restart the 10 s auto-flip clock (manual clicks reset it). */
  const armAuto = () => {
    window.clearInterval(autoTimer.current)
    if (prefersReducedMotion()) return
    autoTimer.current = window.setInterval(() => {
      if (import.meta.env.DEV) {
        const w = window as unknown as { __autoTicks?: number[] }
        ;(w.__autoTicks ??= []).push(Math.round(performance.now() / 1000))
      }
      // Skip a tick rather than freeze-frame an in-flight page glide or a
      // hidden tab; the next tick catches up.
      if (document.hidden || isPaging() || isPageOpen()) return
      // A flip wedged mid-flight (frozen tab) force-completes before toggling
      const v = videoRef.current
      if (phase.current === 'flipping' && v) {
        v.pause()
        v.currentTime = T_RED
        phase.current = 'red'
        if (!wiped.current) {
          wiped.current = true
          const { x, y } = centerOfCard()
          flipThemeAt(x, y)
          tintForPhase('red')
        }
        return
      }
      flipRef.current()
    }, 10000)
  }

  // The card flips itself every 10 s; the whole site's world shifts with it.
  useEffect(() => {
    armAuto()
    return () => window.clearInterval(autoTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Park the video on the blue back frame once data is in
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const park = () => {
      if (phase.current === 'blue') v.currentTime = T_BLUE
    }
    if (v.readyState >= 2) park()
    v.addEventListener('loadeddata', park)
    return () => v.removeEventListener('loadeddata', park)
  }, [])

  // The card arrives small and grows to size — same colossal-contrast beat
  // as the globe and the black hole.
  useEffect(() => {
    if (prefersReducedMotion()) return
    const wrap = wrapRef.current
    if (!wrap) return
    const tween = gsap.fromTo(
      wrap,
      { scale: 0.55, opacity: 0 },
      { scale: 1, opacity: 1, duration: 1.5, ease: 'power3.out', delay: 0.15 },
    )
    return () => {
      tween.kill()
    }
  }, [])

  // Cursor tilt on the whole hero (subtle parallax on the flat video)
  useEffect(() => {
    if (prefersReducedMotion() || isTouchDevice()) return
    const wrap = wrapRef.current
    if (!wrap) return
    gsap.set(wrap, { transformPerspective: 1100 })
    const rx = gsap.quickTo(wrap, 'rotationX', { duration: 0.9, ease: 'power2.out' })
    const ry = gsap.quickTo(wrap, 'rotationY', { duration: 0.9, ease: 'power2.out' })
    const onMove = (e: PointerEvent) => {
      const nx = e.clientX / window.innerWidth - 0.5
      const ny = e.clientY / window.innerHeight - 0.5
      ry(nx * 10)
      rx(-ny * 8)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      rx(0)
      ry(0)
    }
  }, [])

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const centerOfCard = () => {
    const el = btnRef.current
    if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }

  /**
   * The clip's baked backdrop turns red as the ace comes up, but the site's
   * face-up world is light blue — so the video hue-shifts in sync with the
   * theme wipe (reds → blues; the ivory/ink card itself barely moves).
   */
  const tintForPhase = (next: 'blue' | 'red') => {
    const v = videoRef.current
    if (!v) return
    v.style.transition = 'filter 0.9s ease'
    v.style.filter =
      next === 'red' ? 'hue-rotate(225deg) saturate(0.72) brightness(0.94)' : ''
  }

  const flip = () => {
    const v = videoRef.current
    if (!v || !videoOk) {
      // Fallback card: no video — just wipe the world
      const { x, y } = centerOfCard()
      flipThemeAt(x, y)
      phase.current = phase.current === 'blue' ? 'red' : 'blue'
      return
    }

    if (phase.current === 'flipping') return

    if (phase.current === 'blue') {
      // Play the rotate-and-zoom; wipe the theme at the edge-on moment
      phase.current = 'flipping'
      wiped.current = false

      if (prefersReducedMotion()) {
        v.currentTime = T_RED
        const { x, y } = centerOfCard()
        flipThemeAt(x, y)
        tintForPhase('red')
        phase.current = 'red'
        return
      }

      v.play().catch(() => {
        /* muted playback can't be refused; ignore */
      })
      // Drive the wipe from BOTH rAF (frame-precise in the foreground) and
      // the video's own media events (which keep firing when rAF is frozen
      // in occluded/background tabs) — otherwise a flip started right before
      // the user tabs away would wedge at 'flipping' forever.
      const step = () => {
        if (phase.current !== 'flipping') return
        if (!wiped.current && v.currentTime >= T_WIPE) {
          wiped.current = true
          const { x, y } = centerOfCard()
          flipThemeAt(x, y)
          tintForPhase('red')
        }
        if (v.currentTime >= T_RED || v.ended) {
          v.pause()
          v.removeEventListener('timeupdate', step)
          v.removeEventListener('ended', step)
          phase.current = 'red'
          if (!wiped.current) {
            // stalled past the wipe frame (throttled tab) — catch up now
            wiped.current = true
            const { x, y } = centerOfCard()
            flipThemeAt(x, y)
            tintForPhase('red')
          }
        }
      }
      v.addEventListener('timeupdate', step)
      v.addEventListener('ended', step)
      const watch = () => {
        step()
        if (phase.current === 'flipping') raf.current = requestAnimationFrame(watch)
      }
      raf.current = requestAnimationFrame(watch)
    } else {
      // Back to the top of the deal: seek to the back, wipe to blue
      v.pause()
      v.currentTime = T_BLUE
      phase.current = 'blue'
      const { x, y } = centerOfCard()
      flipThemeAt(x, y)
      tintForPhase('blue')
    }
  }

  flipRef.current = flip

  return (
    <div
      ref={wrapRef}
      aria-hidden={videoOk ? undefined : 'true'}
      className="hero-card-stage pointer-events-none absolute inset-0 z-0 flex items-center justify-center"
    >
      {videoOk ? (
        <video
          ref={videoRef}
          className="hero-card-video animate-[hero-float_7s_ease-in-out_infinite]"
          src="/assets/card.mp4"
          muted
          playsInline
          preload="auto"
          onError={() => setVideoOk(false)}
          tabIndex={-1}
          aria-hidden="true"
        />
      ) : (
        <div className="card-back-surface flex aspect-[5/7] h-[min(52vh,460px)] items-center justify-center">
          <span aria-hidden="true" className="text-6xl text-[var(--silver)] opacity-80">
            ♠
          </span>
        </div>
      )}
      {/* Hit area over the card itself */}
      <button
        ref={btnRef}
        data-interactive
        onClick={() => {
          flip()
          armAuto()
        }}
        aria-label="Flip the card — switches the site between the blue and red world"
        className="pointer-events-auto absolute left-1/2 top-1/2 aspect-[5/7] h-[min(48vh,430px)] -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-3xl"
      />
    </div>
  )
}
