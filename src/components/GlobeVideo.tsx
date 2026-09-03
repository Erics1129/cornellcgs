import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { prefersReducedMotion } from '../lib/motion'
import { attachVideoScrub } from '../lib/videoScrub'

/**
 * The full-page globe (§5.9) as a scroll-scrubbed film: the reader's scroll
 * through the World chapter is the playhead. ONE paused video; seeks are
 * throttled by attachVideoScrub and its ScrollTrigger only updates while the
 * chapter is in range, so off-screen it costs nothing. Mounts lazily when the
 * chapter is near; the poster paints until the first frame decodes. Missing
 * file → the reference drifts slowly (transform only); reduced motion → poster.
 */

const SRC = '/assets/globe.mp4'
const POSTER = '/assets/globe_reference.png'
// The clip is an 8 s loop — stop short so the last frame never wraps to frame 0
const TAIL_S = 0.2
const FALLBACK_DURATION_S = 8

export default function GlobeVideo() {
  const rootRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const stillRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  const [failed, setFailed] = useState(false)
  const reduced = prefersReducedMotion()
  const drifting = failed && !reduced

  // Lazy mount a full viewport early — a seek into an unbuffered range stalls
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
      { rootMargin: '100% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Scroll is the playhead: section top-at-bottom → 0 s, bottom-at-top → end
  useEffect(() => {
    if (!mounted || failed || reduced) return
    const root = rootRef.current
    const video = videoRef.current
    if (!root || !video) return
    const trigger = root.closest('section') ?? root

    let detach: (() => void) | undefined
    const attach = () => {
      if (detach) return
      const duration =
        Number.isFinite(video.duration) && video.duration > 0 ? video.duration : FALLBACK_DURATION_S
      detach = attachVideoScrub(video, {
        trigger,
        start: 'top bottom',
        end: 'bottom top',
        from: 0,
        to: Math.max(0, duration - TAIL_S),
      })
    }
    if (video.readyState >= 1) attach()
    else video.addEventListener('loadedmetadata', attach, { once: true })

    // iOS ignores preload="auto" until playback is requested once; the scrub
    // pauses it again on its first seek
    void video
      .play()
      .then(() => video.pause())
      .catch(() => {})

    return () => {
      video.removeEventListener('loadedmetadata', attach)
      detach?.()
      video.pause()
    }
  }, [mounted, failed, reduced])

  // Missing file: the reference drifts slowly — transform only, so it composites
  useEffect(() => {
    if (!drifting) return
    const el = stillRef.current
    if (!el) return
    const tween = gsap.fromTo(
      el,
      { xPercent: -5 },
      { xPercent: 5, duration: 60, ease: 'sine.inOut', yoyo: true, repeat: -1 },
    )
    return () => {
      tween.kill()
    }
  }, [drifting])

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
          ref={stillRef}
          className={`absolute inset-y-0 bg-cover bg-center ${drifting ? '-inset-x-[6%]' : 'inset-x-0'}`}
          style={{ backgroundImage: `url(${POSTER})` }}
        />
      ) : (
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          src={SRC}
          poster={POSTER}
          muted
          playsInline
          preload="auto"
          onError={onError}
        />
      )}
    </div>
  )
}
