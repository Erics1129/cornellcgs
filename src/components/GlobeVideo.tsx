import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '../lib/motion'

/**
 * The full-page globe (§5.9, simplified per user direction — no drag).
 * Two stacked video elements crossfade 0.6 s before the clip's end so the
 * 8 s AI loop never visibly jumps. Videos mount lazily when the chapter is
 * near the viewport and pause when it leaves. If the file is missing, the
 * reference still drifts slowly instead; reduced motion shows the poster.
 */

const SRC = '/assets/globe.mp4'
const POSTER = '/assets/globe_reference.png'
const FADE_S = 0.6

export default function GlobeVideo() {
  const rootRef = useRef<HTMLDivElement>(null)
  const vA = useRef<HTMLVideoElement>(null)
  const vB = useRef<HTMLVideoElement>(null)
  const [mounted, setMounted] = useState(false)
  const [failed, setFailed] = useState(false)
  const reduced = prefersReducedMotion()

  // Lazy mount when the chapter approaches
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setMounted(true)
          io.disconnect()
        }
      },
      { rootMargin: '60% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Crossfade loop + visibility pausing
  useEffect(() => {
    if (!mounted || failed || reduced) return
    const root = rootRef.current
    const a = vA.current
    const b = vB.current
    if (!root || !a || !b) return

    const pair = [a, b]
    let active = 0
    let fading = false
    let inView = true
    let raf = 0

    b.style.opacity = '0'

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const cur = pair[active]
      const other = pair[1 - active]
      if (!fading && cur.duration > 0 && cur.duration - cur.currentTime <= FADE_S) {
        fading = true
        other.currentTime = 0
        void other.play().catch(() => {})
      }
      if (fading) {
        const remain = Math.max(0, pair[active].duration - pair[active].currentTime)
        const k = 1 - Math.min(1, remain / FADE_S)
        other.style.opacity = String(k)
        if (k >= 1) {
          cur.pause()
          cur.style.opacity = '0'
          other.style.opacity = '1'
          active = 1 - active
          fading = false
        }
      }
    }

    const play = () => {
      if (inView && !document.hidden) {
        void pair[active].play().catch(() => {})
        if (!raf) raf = requestAnimationFrame(tick)
      }
    }
    const pause = () => {
      pair.forEach((v) => v.pause())
      cancelAnimationFrame(raf)
      raf = 0
    }

    const io = new IntersectionObserver(
      (entries) => {
        inView = entries[0]?.isIntersecting ?? false
        if (inView) play()
        else pause()
      },
      { rootMargin: '15% 0px' },
    )
    io.observe(root)

    const onVis = () => (document.hidden ? pause() : play())
    document.addEventListener('visibilitychange', onVis)

    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      pause()
    }
  }, [mounted, failed, reduced])

  const onError = () => {
    if (!failed) {
      console.warn(`[world] globe video missing — expected ${SRC}; using the still fallback`)
      setFailed(true)
    }
  }

  return (
    <div ref={rootRef} aria-hidden="true" className="absolute inset-0 overflow-hidden">
      {failed || reduced || !mounted ? (
        <div
          className={`h-full w-full bg-cover bg-center ${
            failed && !reduced ? 'animate-[globe-drift_60s_ease-in-out_infinite_alternate]' : ''
          }`}
          style={{ backgroundImage: `url(${POSTER})` }}
        />
      ) : (
        <>
          <video
            ref={vA}
            className="absolute inset-0 h-full w-full object-cover"
            src={SRC}
            poster={POSTER}
            muted
            playsInline
            preload="auto"
            onError={onError}
          />
          <video
            ref={vB}
            className="absolute inset-0 h-full w-full object-cover"
            src={SRC}
            muted
            playsInline
            preload="auto"
          />
        </>
      )}
    </div>
  )
}
