import { useEffect, useRef } from 'react'
import { onReducedMotionChange, prefersReducedMotion } from '../lib/motion'
import '../styles/code-city.css'

export interface CodeCityProps {
  /** Mount inside the opening hero. False hides and suspends the city. */
  active?: boolean
  /** Freeze the current camera view without losing its place. */
  paused?: boolean
  plateSrc?: string
  /** Playback multiplier, clamped to 0..2. Zero freezes travel. */
  speed?: number
  className?: string
}

const POSTER = '/assets/sequences/city-journey-v2.webp'
const FALLBACK = '/assets/scenes/code-city-v1.webp'
const VIDEO = '/assets/sequences/city-journey-v2.mp4'
const MOBILE_VIDEO = '/assets/sequences/city-journey-v2-mobile.mp4'

type MediaNavigator = Navigator & {
  deviceMemory?: number
  connection?: { saveData?: boolean }
}

/** A single native decoder plays numbered, offline-rendered 3D camera frames.
 * No frame textures, per-frame React updates, or browser-side city renderer.
 */
export default function CodeCity({
  active = true, paused = false, plateSrc = POSTER, speed = 1, className = '',
}: CodeCityProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const props = useRef({ active, paused, speed })
  props.current = { active, paused, speed }
  const synchronize = useRef<(() => void) | null>(null)

  useEffect(() => {
    const host = rootRef.current, video = videoRef.current
    if (!host || !video) return
    const nav = navigator as MediaNavigator
    // Choose once: resizing must not fetch a second movie or restart travel.
    const compact = matchMedia('(max-width: 767px)').matches
      || (nav.deviceMemory !== undefined && nav.deviceMemory <= 4)
      || nav.connection?.saveData === true
    const source = compact ? MOBILE_VIDEO : VIDEO
    let alive = true, inView = false, reduced = prefersReducedMotion()
    let failed = false, attached = false, pendingPlay = false, ready = false
    let releaseTimer = 0, probeTimer = 0, playRequest = 0, resumeAt = 0
    video.muted = true
    video.defaultMuted = true

    const visible = () => alive && props.current.active && inView && !document.hidden
    const moving = () => !props.current.paused && Number.isFinite(props.current.speed) && props.current.speed > 0
    const shouldPlay = () => visible() && !reduced && !failed && moving()
    const setStatus = (value: string) => { host.dataset.playback = value }
    const stop = () => {
      ++playRequest
      pendingPlay = false
      video.pause()
    }
    const release = () => {
      releaseTimer = 0
      if (!attached) return
      resumeAt = Number.isFinite(video.currentTime) ? video.currentTime : 0
      stop()
      attached = false
      ready = false
      video.removeAttribute('src')
      video.load()
      host.dataset.renderer = reduced ? 'static' : 'pending'
    }
    const cancelRelease = () => {
      window.clearTimeout(releaseTimer)
      releaseTimer = 0
    }
    const sync = () => {
      if (!alive) return
      if (!props.current.active) setStatus('inactive')
      else if (document.hidden) setStatus('hidden')
      else if (!inView) setStatus('offscreen')
      else if (reduced) setStatus('reduced')
      else if (failed) setStatus('fallback')
      else if (!moving()) setStatus('paused')
      else setStatus(ready ? 'playing' : 'loading')

      if (!shouldPlay()) {
        stop()
        if (reduced) {
          cancelRelease()
          release()
          host.dataset.renderer = 'static'
        } else if (compact && !visible() && attached && !releaseTimer) {
          // Long absences release the mobile decoder and its frame surfaces.
          releaseTimer = window.setTimeout(release, 12000)
        }
        return
      }
      cancelRelease()
      video.playbackRate = Math.max(.0625, Math.min(2, props.current.speed))
      if (!attached) {
        attached = true
        video.src = source
        video.load()
      }
      if (pendingPlay || !video.paused) return
      pendingPlay = true
      const request = ++playRequest
      const attempt = video.play()
      if (attempt) attempt.then(() => {
        if (!alive || request !== playRequest) {
          if (!shouldPlay()) video.pause()
          return
        }
        pendingPlay = false
        if (!shouldPlay()) stop()
      }).catch(error => {
        if (!alive || request !== playRequest) return
        pendingPlay = false
        // Abort is expected when a visibility change interrupts loading.
        if (error?.name !== 'AbortError') {
          host.dataset.renderer = 'fallback'
          setStatus('fallback')
        }
      })
    }
    synchronize.current = sync
    const measure = () => {
      window.clearTimeout(probeTimer)
      probeTimer = 0
      if (!alive) return
      const rect = host.getBoundingClientRect()
      inView = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight
        && rect.right > 0 && rect.left < innerWidth
      sync()
    }
    const queueMeasure = () => {
      if (!probeTimer) probeTimer = window.setTimeout(measure, 80)
    }
    const onVisibility = () => {
      if (document.hidden) sync()
      else measure()
    }
    const onMetadata = () => {
      if (resumeAt > 0 && Number.isFinite(video.duration)) {
        video.currentTime = Math.min(resumeAt, Math.max(0, video.duration - .1))
        resumeAt = 0
      }
      sync()
    }
    const onPlaying = () => {
      if (!shouldPlay()) { stop(); return }
      ready = true
      host.dataset.renderer = 'ready'
      setStatus('playing')
    }
    const onError = () => {
      if (!attached || !alive) return
      failed = true
      stop()
      host.dataset.renderer = 'fallback'
      sync()
    }
    const offMotion = onReducedMotionChange(value => {
      reduced = value
      sync()
    })
    const observer = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting && entry.intersectionRect.width > 0 && entry.intersectionRect.height > 0
      sync()
    }) : null
    observer?.observe(host)
    video.addEventListener('loadedmetadata', onMetadata)
    video.addEventListener('canplay', sync)
    video.addEventListener('playing', onPlaying)
    video.addEventListener('error', onError)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pageshow', measure)
    window.addEventListener('resize', queueMeasure, { passive: true })
    if (!observer) window.addEventListener('scroll', queueMeasure, { passive: true })
    host.dataset.renderer = reduced ? 'static' : 'pending'
    host.dataset.stream = compact ? 'mobile' : 'desktop'
    measure()

    return () => {
      alive = false
      synchronize.current = null
      cancelRelease()
      window.clearTimeout(probeTimer)
      observer?.disconnect()
      offMotion()
      video.removeEventListener('loadedmetadata', onMetadata)
      video.removeEventListener('canplay', sync)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('error', onError)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pageshow', measure)
      window.removeEventListener('resize', queueMeasure)
      window.removeEventListener('scroll', queueMeasure)
      release()
    }
  }, [])

  useEffect(() => { synchronize.current?.() }, [active, paused, speed])

  return <div ref={rootRef} className={`code-city ${className}`} data-active={active} aria-hidden="true">
    <img key={plateSrc} className="code-city__plate" src={plateSrc} alt="" width="1280" height="720"
      decoding="async" loading="eager" draggable={false}
      onError={event => {
        const image = event.currentTarget
        if (image.dataset.fallback !== 'true') {
          image.dataset.fallback = 'true'
          image.src = FALLBACK
        } else image.dataset.missing = 'true'
      }} />
    <video ref={videoRef} className="code-city__video" muted autoPlay loop playsInline
      preload="none" disablePictureInPicture disableRemotePlayback tabIndex={-1} />
    <div className="code-city__shade" />
  </div>
}
