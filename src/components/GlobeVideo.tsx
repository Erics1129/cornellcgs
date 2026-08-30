import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { onReducedMotionChange, prefersReducedMotion } from '../lib/motion'

gsap.registerPlugin(ScrollTrigger)

/**
 * GlobeVideo — the full-bleed globe player behind the World chapter (§5.9 +
 * full-page override). Two stacked <video> elements crossfade 0.6 s before the
 * clip's end so the 8 s AI loop never visibly jumps. A horizontal drag scrubs
 * currentTime (the globe follows the hand); release resumes playback from
 * there. Lazy-mounted when the section is near the viewport, paused when it
 * leaves entirely or the tab hides. If the file is missing: one console.warn,
 * then the reference still with a 60 s drift, scroll parallax and a pulsing
 * blue rim glow. Reduced motion: the poster still, drag disabled.
 */

const SRC = '/assets/globe.mp4'
const POSTER = '/assets/globe_reference.png'
/** Seconds before the end where the crossfade to the other element starts. */
const FADE_S = 0.6
/** One screen-width of drag scrubs one full revolution of the clip. */
const DRAG_TURNS = 1
/**
 * Cover framing. At 16:9 the portrait clip is width-bound, so the y picks the
 * visible band — 33% frames the limb arc and the country labels with the dark
 * space corner upper-left for the copy. On a 390×844 phone the crop turns
 * horizontal and 40% biases toward the darker left limb.
 */
const OBJECT_POS = '40% 33%'

interface DragState {
  id: number
  x0: number
  t0: number
  /** Which video element the drag scrubs (the incoming one if mid-fade). */
  idx: number
  /** Target time, applied once per rAF so fast pointermoves don't spam seeks. */
  pending: number
}

export default function GlobeVideo() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const vidARef = useRef<HTMLVideoElement>(null)
  const vidBRef = useRef<HTMLVideoElement>(null)
  const stillRef = useRef<HTMLImageElement>(null)
  const glowRef = useRef<HTMLDivElement>(null)

  const [near, setNear] = useState(false)
  const [failed, setFailed] = useState(false)
  const [reduced, setReduced] = useState(() => prefersReducedMotion())

  const active = useRef(0)
  const fading = useRef(false)
  const swapTimer = useRef(0)
  const raf = useRef(0)
  const inView = useRef(false)
  const dragRef = useRef<DragState | null>(null)
  const warned = useRef(false)

  useEffect(() => onReducedMotionChange(setReduced), [])

  // Lazy mount — the videos exist only once the section is near the viewport.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((en) => en.isIntersecting)) {
          setNear(true)
          io.disconnect()
        }
      },
      { rootMargin: '50% 0px 50% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Playback machine: crossfade loop, drag scrub, visibility pausing.
  useEffect(() => {
    if (!near || failed || reduced) return
    const el = wrapRef.current
    const a = vidARef.current
    const b = vidBRef.current
    if (!el || !a || !b) return
    const pair = [a, b] as const

    active.current = 0
    fading.current = false
    a.muted = true
    b.muted = true
    a.style.opacity = '1'
    b.style.opacity = '0'

    const beginFade = () => {
      const out = pair[active.current]
      const inc = pair[1 - active.current]
      fading.current = true
      inc.currentTime = 0
      void inc.play().catch(() => {})
      inc.style.opacity = '1'
      out.style.opacity = '0'
      swapTimer.current = window.setTimeout(() => {
        out.pause()
        active.current = 1 - active.current
        fading.current = false
        // If the fade was interrupted by a pause, don't leave both frozen.
        if (inView.current && !document.hidden && !dragRef.current) {
          void pair[active.current].play().catch(() => {})
        }
      }, FADE_S * 1000 + 60)
    }

    const tick = () => {
      raf.current = requestAnimationFrame(tick)
      const drag = dragRef.current
      if (drag) {
        const v = pair[drag.idx]
        if (Math.abs(v.currentTime - drag.pending) > 0.002) v.currentTime = drag.pending
        return
      }
      const v = pair[active.current]
      if (!fading.current && v.duration > 0 && v.duration - v.currentTime < FADE_S) beginFade()
    }

    const syncPlayback = () => {
      if (!inView.current || document.hidden) {
        if (raf.current) {
          cancelAnimationFrame(raf.current)
          raf.current = 0
        }
        a.pause()
        b.pause()
      } else if (!raf.current) {
        if (!dragRef.current) void pair[active.current].play().catch(() => {})
        raf.current = requestAnimationFrame(tick)
      }
    }

    // Play while any pixel is on screen; pause when the chapter leaves entirely.
    const io = new IntersectionObserver((entries) => {
      inView.current = entries.some((en) => en.isIntersecting)
      syncPlayback()
    })
    io.observe(el)
    const onVisibility = () => syncPlayback()
    document.addEventListener('visibilitychange', onVisibility)

    // Safety net: if a throttled frame skipped past the fade window, restart.
    const onEnded = (e: Event) => {
      if (dragRef.current || fading.current) return
      const idx = e.currentTarget === a ? 0 : 1
      if (idx !== active.current) return
      pair[idx].currentTime = 0
      if (inView.current && !document.hidden) void pair[idx].play().catch(() => {})
    }
    a.addEventListener('ended', onEnded)
    b.addEventListener('ended', onEnded)

    // Drag to spin — pause, map px to seconds (wrapping), resume on release.
    // touch-action: pan-y keeps vertical scroll native; wheel is never touched.
    const onPointerDown = (e: PointerEvent) => {
      if (dragRef.current) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const idx = fading.current ? 1 - active.current : active.current
      const v = pair[idx]
      if (!Number.isFinite(v.duration) || v.duration <= 0) return
      if (e.pointerType === 'mouse') e.preventDefault()
      a.pause()
      b.pause()
      dragRef.current = { id: e.pointerId, x0: e.clientX, t0: v.currentTime, idx, pending: v.currentTime }
      el.setPointerCapture(e.pointerId)
      el.style.cursor = 'grabbing'
    }

    const onPointerMove = (e: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || e.pointerId !== drag.id) return
      const dur = pair[drag.idx].duration
      if (!Number.isFinite(dur) || dur <= 0) return
      const dt = ((e.clientX - drag.x0) / Math.max(window.innerWidth, 1)) * dur * DRAG_TURNS
      drag.pending = Math.min((((drag.t0 + dt) % dur) + dur) % dur, dur - 0.03)
    }

    const endDrag = (e: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || e.pointerId !== drag.id) return
      dragRef.current = null
      el.style.cursor = ''
      if (el.hasPointerCapture(drag.id)) el.releasePointerCapture(drag.id)
      if (inView.current && !document.hidden) void pair[drag.idx].play().catch(() => {})
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', endDrag)
    el.addEventListener('pointercancel', endDrag)

    return () => {
      cancelAnimationFrame(raf.current)
      raf.current = 0
      window.clearTimeout(swapTimer.current)
      fading.current = false
      dragRef.current = null
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      a.removeEventListener('ended', onEnded)
      b.removeEventListener('ended', onEnded)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', endDrag)
      el.removeEventListener('pointercancel', endDrag)
      a.pause()
      b.pause()
      el.style.cursor = ''
    }
  }, [near, failed, reduced])

  // Fallback motion — 60 s horizontal drift, scroll parallax, pulsing blue rim.
  // GSAP's ticker rides rAF (idle when the tab hides); offscreen it's paused
  // by the ScrollTrigger toggle below.
  useEffect(() => {
    if (!failed || reduced) return
    const el = wrapRef.current
    const img = stillRef.current
    const glow = glowRef.current
    if (!el || !img || !glow) return

    const ctx = gsap.context(() => {
      gsap.set(img, { scale: 1.07 })
      const drift = gsap.fromTo(
        img,
        { xPercent: -2 },
        { xPercent: 2, duration: 30, yoyo: true, repeat: -1, ease: 'sine.inOut', paused: true },
      )
      const pulse = gsap.fromTo(
        glow,
        { opacity: 0.3 },
        { opacity: 0.75, duration: 3.2, yoyo: true, repeat: -1, ease: 'sine.inOut', paused: true },
      )
      gsap.fromTo(
        img,
        { yPercent: 2.4 },
        {
          yPercent: -2.4,
          ease: 'none',
          scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true },
        },
      )
      ScrollTrigger.create({
        trigger: el,
        start: 'top bottom',
        end: 'bottom top',
        onToggle: (self) => {
          if (self.isActive) {
            drift.play()
            pulse.play()
          } else {
            drift.pause()
            pulse.pause()
          }
        },
      })
    }, el)
    return () => ctx.revert()
  }, [failed, reduced])

  const handleError = () => {
    if (!warned.current) {
      warned.current = true
      console.warn(
        `[CGS World §5.9] Globe video failed to load — expected it at ${SRC} ` +
          '(drop the file in public/assets/globe.mp4). Showing the still-image fallback.',
      )
    }
    setFailed(true)
  }

  const videoMode = near && !failed && !reduced

  return (
    <div
      ref={wrapRef}
      data-interactive
      role="img"
      aria-label="A slowly rotating globe of dotted continents with member countries marked in orange"
      className={`absolute inset-0 select-none overflow-clip ${videoMode ? 'cursor-grab' : ''}`}
      style={{ touchAction: 'pan-y' }}
    >
      {reduced ? (
        <img
          src={POSTER}
          alt=""
          aria-hidden="true"
          draggable={false}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: OBJECT_POS }}
        />
      ) : failed ? (
        <>
          <img
            ref={stillRef}
            src={POSTER}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover will-change-transform"
            style={{ objectPosition: OBJECT_POS }}
          />
          {/* Blue limb glow, pulsed slowly by the fallback effect above */}
          <div
            ref={glowRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              opacity: 0.3,
              background:
                'radial-gradient(95% 95% at 50% 108%, transparent 55%, rgba(47, 107, 255, 0.32) 72%, rgba(47, 107, 255, 0.1) 82%, transparent 92%)',
            }}
          />
        </>
      ) : near ? (
        [vidARef, vidBRef].map((r, i) => (
          <video
            key={i}
            ref={r}
            src={SRC}
            poster={i === 0 ? POSTER : undefined}
            muted
            playsInline
            preload="auto"
            aria-hidden="true"
            onError={handleError}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: OBJECT_POS, transition: `opacity ${FADE_S}s linear` }}
          />
        ))
      ) : null}

      {/* Soft edges into the neighbouring chapters */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[14vh] bg-[linear-gradient(to_bottom,var(--bg-top),transparent)] opacity-85"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[16vh] bg-[linear-gradient(to_top,var(--bg-top),transparent)] opacity-85"
      />

      {videoMode && (
        <p className="mono pointer-events-none absolute bottom-[max(1.6rem,3.5vh)] left-1/2 z-[6] -translate-x-1/2 whitespace-nowrap text-[var(--muted)]">
          drag to spin the globe
        </p>
      )}
    </div>
  )
}
