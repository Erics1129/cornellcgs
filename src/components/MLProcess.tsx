import { useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import SectionIndex from './SectionIndex'
import { TypedHeading } from './TypedText'
import { mlProcess } from '../content'
import { EASE } from '../lib/eases'
import { cssVar } from '../lib/theme'
import { shake } from '../lib/motion'
import { attachVideoScrub } from '../lib/videoScrub'
import { createGlyphBurst } from '../effects/glyphBurst'

gsap.registerPlugin(ScrollTrigger)

/**
 * Our Machine Learning process (J♠) — the black hole burst (§5.10).
 * Full-bleed chapter on the blackhole.mp4 backdrop (poster/fallback:
 * blackhole_math.jpg with the slow drift). The section pins for ~1.5 viewport
 * heights; before the burst only the drifting backdrop and a pulsing glow
 * ring are visible. The approach is scroll-scrubbed: while armed, the
 * section's climb from the fold to the pin line drives the clip's first 4 s
 * (lib/videoScrub); the burst hands the playhead back to normal playback and
 * re-arming hands it back to the scroll. At ~60% in view the burst fires once (<1.6 s, power4.out
 * everywhere): ring flare + chromatic shockwave, a zoom-blur fake built from
 * four scaled ghost snapshots of the backdrop, 300–500 equation glyphs out of
 * the hole (effects/glyphBurst), shake(0.6) at 100 ms, then the title and
 * the five step rows rising out of overflow-hidden masks on the left.
 * Scrolling fully away re-arms it. Reduced motion: no pin,
 * no burst — everything just fades in over the calm backdrop.
 */

/** Where the hole sits inside each source frame (fractions of the media box). */
const VIDEO_FRAME = { aspect: 1280 / 720, hx: 0.48, hy: 0.5 }
const IMAGE_FRAME = { aspect: 1296 / 1906, hx: 0.37, hy: 0.465 }
/** Where the hole lands in the viewport: left of center on desktop, center on mobile. */
const HOLE_DESKTOP = { x: 0.38, y: 0.52 }
const HOLE_MOBILE = { x: 0.5, y: 0.44 }

const GHOST_COUNT = 4
const TITLE_SIZE = 'clamp(2.1rem, 2.9vw, 3.3rem)'
const LATEX_FONT = "'STIX Two Text', 'Times New Roman', serif"

export default function MLProcess() {
  const root = useRef<HTMLElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const ghostsRef = useRef<Array<HTMLCanvasElement | null>>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  const glowWrapRef = useRef<HTMLDivElement>(null)
  const glowRef = useRef<HTMLDivElement>(null)
  const flareRef = useRef<HTMLDivElement>(null)
  const shockRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const cardsRef = useRef<HTMLDivElement>(null)
  const [videoFailed, setVideoFailed] = useState(false)

  useLayoutEffect(() => {
    const section = root.current
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    const scrim = scrimRef.current
    const glowWrap = glowWrapRef.current
    const glow = glowRef.current
    const flare = flareRef.current
    const shock = shockRef.current
    const title = titleRef.current
    const cardsGrid = cardsRef.current
    if (!section || !wrap || !canvas || !scrim || !glowWrap || !glow || !flare || !shock || !title || !cardsGrid) {
      return
    }
    const ghosts = ghostsRef.current.filter((el): el is HTMLCanvasElement => el !== null)
    // Each grid child is an overflow-hidden mask; the animated row is inside.
    const cards = Array.from(cardsGrid.children)
      .map((el) => el.firstElementChild)
      .filter((el): el is HTMLElement => el instanceof HTMLElement)

    const frame = videoFailed ? IMAGE_FRAME : VIDEO_FRAME
    const burst = createGlyphBurst(canvas)
    const holePx = { x: 0, y: 0 }

    /**
     * Size the backdrop so the hole pins to its viewport anchor while the
     * media still covers the whole section (with headroom for the 1.05 drift
     * scale), and park the glow / flare / shockwave on the hole.
     */
    const layout = () => {
      const W = section.clientWidth
      const H = section.clientHeight
      // Contain, never crop: the whole animation stays visible (user request),
      // centered slightly high so the bottom-anchored words get clear space.
      const mw = Math.min(W, H * frame.aspect)
      const mh = mw / frame.aspect
      const left = (W - mw) / 2
      const top = Math.max(0, (H - mh) * (W <= 768 ? 0.08 : 0.38))
      wrap.style.left = `${left}px`
      wrap.style.top = `${top}px`
      wrap.style.width = `${mw}px`
      wrap.style.height = `${mh}px`
      holePx.x = left + frame.hx * mw
      holePx.y = top + frame.hy * mh

      ghosts.forEach((g) => {
        g.style.transformOrigin = `${frame.hx * 100}% ${frame.hy * 100}%`
        const gw = 512
        const gh = Math.round(gw / frame.aspect)
        if (g.width !== gw || g.height !== gh) {
          g.width = gw
          g.height = gh
        }
      })

      const d = Math.min(W, window.innerHeight) * 0.52
      glow.style.width = `${d}px`
      glow.style.height = `${d}px`
      flare.style.width = `${d * 1.3}px`
      flare.style.height = `${d * 1.3}px`
      for (const el of [glow, flare, shock]) {
        el.style.left = `${holePx.x}px`
        el.style.top = `${holePx.y}px`
      }

      burst.setSize(W, H)
    }

    layout()
    window.addEventListener('resize', layout)

    const mm = gsap.matchMedia()
    mm.add(
      {
        desktop: '(min-width: 769px)',
        mobile: '(max-width: 768px)',
        reduced: '(prefers-reduced-motion: reduce)',
      },
      (mmCtx) => {
        const conditions = (mmCtx.conditions ?? {}) as Record<string, boolean>
        const desktop = !!conditions.desktop
        const reduced = !!conditions.reduced
        const video = videoRef.current

        // Reduced motion (§5.10 / §7): no burst, no pin — the title and cards
        // simply fade in over the calm, dimmed backdrop.
        if (reduced) {
          gsap.set(wrap, { scale: 1, transformOrigin: '50% 50%' })
          gsap.set([glow, flare, shock], { xPercent: -50, yPercent: -50 })
          gsap.set([flare, shock], { opacity: 0 })
          gsap.set(glow, { opacity: 0.45 })
          gsap.set(scrim, { opacity: 0.22 })
          ;[title, ...cards].forEach((el, i) => {
            gsap.fromTo(
              el,
              { opacity: 0 },
              {
                opacity: 1,
                duration: 0.6,
                delay: i * 0.05,
                scrollTrigger: { trigger: el, start: 'top 88%', once: true },
              },
            )
          })
          video?.pause()
          return
        }

        // ------------------------------------------------------------------
        // Full version. Pre-burst: hidden content, drifting backdrop at 1.05,
        // gently pulsing glow ring over the hole. Nothing else visible.
        // ------------------------------------------------------------------
        let armed = true
        let tl: gsap.core.Timeline | null = null

        // The scroll is the ONLY thing that moves the film. While armed the
        // section's climb from the fold to the pin line maps onto the clip's
        // first 4 s; once the burst has fired, the rest of the pin maps onto
        // the rest of the clip — stop scrolling and the hole holds its frame.
        // Declared before any ScrollTrigger below — those can call fire()
        // synchronously at creation when the page loads mid-chapter.
        let scrubOff: (() => void) | null = null
        let scrubTo = 0
        let phase: 'approach' | 'after' = 'approach'
        const scrubEnd = () =>
          video && Number.isFinite(video.duration) && video.duration > 0 ? Math.min(video.duration, 4) : 4
        const attach = () => {
          if (!video || scrubOff) return
          scrubTo = scrubEnd()
          const full = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : scrubTo + 8
          scrubOff =
            phase === 'approach'
              ? attachVideoScrub(video, { trigger: section, start: 'top bottom', end: 'top top', from: 0, to: scrubTo })
              : attachVideoScrub(video, { trigger: section, start: 'top top', end: '+=150%', from: scrubTo, to: full })
        }
        const rescrub = (next: 'approach' | 'after') => {
          phase = next
          detach()
          attach()
        }
        const detach = () => {
          scrubOff?.()
          scrubOff = null
        }

        gsap.set([title, ...cards], { opacity: 0 })
        gsap.set([glow, flare, shock], { xPercent: -50, yPercent: -50 })
        gsap.set([flare, shock], { opacity: 0 })
        gsap.set(shock, { scale: 0.02 })
        gsap.set(scrim, { opacity: 0 })
        // 巨物对比震惊感 — the hole arrives tiny and distant, then swells to
        // full size as the chapter takes the screen; the burst comes after.
        const holeOrigin = `${frame.hx * 100}% ${frame.hy * 100}%`
        gsap.set(wrap, { scale: 0.2, transformOrigin: holeOrigin })
        const grow = gsap.timeline({ paused: true })
        grow.to(wrap, { scale: 1, duration: 1.6, ease: 'power3.inOut' })
        ScrollTrigger.create({
          trigger: section,
          start: 'top 80%',
          onEnter: () => grow.restart(),
          onEnterBack: () => grow.progress(1),
          onLeaveBack: () => grow.pause(0),
        })

        // The backdrop's sway rides the scroll too — nothing here runs on a clock
        const drift = gsap.timeline({ paused: true, defaults: { ease: 'sine.inOut' } })
        drift.to(wrap, { x: 6, y: -4, duration: 9 }).to(wrap, { x: -5, y: 3, duration: 11 })
        ScrollTrigger.create({
          trigger: section,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true,
          onUpdate: (self) => drift.progress(self.progress),
        })

        gsap.fromTo(
          glow,
          { scale: 0.96, opacity: 0.38 },
          { scale: 1.08, opacity: 0.62, duration: 2.6, repeat: -1, yoyo: true, ease: 'sine.inOut' },
        )

        const applyGhosts = (s: number) => {
          ghosts.forEach((g, i) => {
            const k = i + 1
            g.style.opacity = `${(s * 0.5) / k}`
            g.style.transform = `scale(${1 + s * 0.11 * k})`
          })
        }

        const reset = () => {
          const r = section.getBoundingClientRect()
          mlLog('reset (tl ' + (tl ? 'killed@' + (tl.progress() * 100).toFixed(0) + '%' : 'none') + ') rect=' + Math.round(r.top) + '/' + Math.round(r.bottom) + ' vh=' + window.innerHeight + ' y=' + Math.round(scrollY))
          tl?.kill()
          tl = null
          burst.stop()
          gsap.set([title, ...cards], { clearProps: 'transform' })
          gsap.set([title, ...cards], { opacity: 0 })
          gsap.set(scrim, { opacity: 0 })
          gsap.set(shock, { opacity: 0, scale: 0.02 })
          gsap.set(flare, { opacity: 0 })
          gsap.set(glowWrap, { opacity: 1 })
          gsap.set(wrap, { scale: 1 })
          applyGhosts(0)
          armed = true
          rescrub('approach')
        }

        const mlLog = (ev: string) => {
          if (import.meta.env.DEV) {
            const w = window as unknown as { __mlLog?: string[] }
            ;(w.__mlLog ??= []).push(`${Math.round(performance.now())}ms ${ev}`)
          }
        }
        let lastFireT = 0
        /** Trust geometry, not possibly-stale IntersectionObserver entries. */
        const reallyOffScreen = () => {
          const r = section.getBoundingClientRect()
          const vh2 = window.innerHeight
          return r.bottom < -vh2 * 0.2 || r.top > vh2 * 1.2
        }
        const fire = () => {
          mlLog('fire ' + (armed ? 'ARMED' : 'blocked'))
          if (!armed) return
          armed = false
          // Past the burst the film still only moves with the scroll: the
          // rest of the pin drives the rest of the clip.
          rescrub('after')
          lastFireT = performance.now()
          tl?.kill() // never let two bursts interleave

          const rect = section.getBoundingClientRect()
          const hx = rect.left + holePx.x
          const hy = rect.top + holePx.y

          // Snapshot the backdrop into the four zoom-blur ghosts. A WebGL
          // shader over a playing video isn't worth it — this is the brief's
          // sanctioned ghost-copy fake, scaled from the hole via CSS.
          const img = imgRef.current
          const vid = videoRef.current
          const src: CanvasImageSource | null =
            !videoFailed && vid && vid.readyState >= 2
              ? vid
              : img && img.complete && img.naturalWidth > 0
                ? img
                : null
          if (src) {
            ghosts.forEach((g) => {
              const gctx = g.getContext('2d')
              gctx?.drawImage(src, 0, 0, g.width, g.height)
            })
          }

          // Canvas colors are read at fire time so the burst always matches
          // the current world (the CSS vars themselves don't animate).
          const colors = [cssVar('--ivory'), cssVar('--ivory'), cssVar('--accent-amber'), cssVar('--neon-mid')]
          const count = desktop ? 420 : 120
          const cardStagger = desktop ? 0.12 : 0.09

          tl = gsap.timeline({ defaults: { ease: 'power4.out' } })

          // 0–250 ms: the ring flares white-orange.
          tl.fromTo(flare, { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1.1, duration: 0.12 }, 0)
          tl.to(flare, { opacity: 0, scale: 2, duration: 0.55 }, 0.14)
          tl.to(glowWrap, { opacity: 0.25, duration: 0.4, ease: 'power2.out' }, 0)

          // 0–700 ms: a thin shockwave ring with a chromatic fringe (layered
          // strokes) expands from the hole to the screen edges.
          const far = Math.hypot(
            Math.max(hx, window.innerWidth - hx),
            Math.max(hy, window.innerHeight - hy),
          )
          tl.set(shock, { width: far * 2, height: far * 2, opacity: 1, scale: 0.02 }, 0)
          tl.to(shock, { scale: 1, duration: 0.7 }, 0)
          tl.to(shock, { opacity: 0, duration: 0.55, ease: 'power2.in' }, 0.15)

          // 0–900 ms: zoom blur — strength ramps to max at 300 ms, gone by 900.
          const zoom = { s: 0 }
          tl.to(zoom, { s: 1, duration: 0.3, ease: 'power2.out', onUpdate: () => applyGhosts(zoom.s) }, 0)
          tl.to(zoom, { s: 0, duration: 0.6, onUpdate: () => applyGhosts(zoom.s) }, 0.3)
          tl.fromTo(wrap, { scale: 1 }, { scale: 1.045, duration: 0.25, ease: 'power2.out' }, 0)
          tl.to(wrap, { scale: 1, duration: 0.65 }, 0.25)

          // 50–900 ms: the equation glyphs; one medium shake at 100 ms.
          tl.call(() => burst.fire(holePx.x, holePx.y, count, colors), undefined, 0.05)
          tl.call(() => shake(0.6), undefined, 0.1)

          // 1.1 s+: masked rises. Words wait for the burst to finish, then
          // swing up out of their overflow-hidden boxes (bottom-left hinge,
          // 2° settle) — they never cross the hole or cover the equation wall.
          // Opacity flips in the from(): the mask does the reveal work.
          tl.fromTo(
            title,
            { yPercent: 120, rotation: 2, transformOrigin: '0% 100%', opacity: 1 },
            {
              yPercent: 0,
              rotation: 0,
              duration: 0.6,
              ease: EASE.out,
              overwrite: 'auto',
              onStart: () => mlLog('title tween start'),
              onComplete: () => mlLog('title tween done'),
            },
            1.1,
          )

          // 1.25 s+: the step rows follow the title up out of their masks.
          cards.forEach((card, i) => {
            tl!.fromTo(
              card,
              { yPercent: 120, rotation: 2, transformOrigin: '0% 100%', opacity: 1 },
              { yPercent: 0, rotation: 0, duration: 0.6, ease: EASE.out, overwrite: 'auto' },
              1.25 + i * cardStagger,
            )
          })

          // End-state guarantee: whatever raced or was killed mid-flight,
          // the words ARE on screen once the burst window has passed.
          tl.set([title, ...cards], { opacity: 1, yPercent: 0, rotation: 0 }, 2.4)

          // After: dim the equation wall so the card text reads.
          tl.to(scrim, { opacity: 0.22, duration: 0.5, ease: 'power2.inOut' }, 0.9)
        }

        // Pin for ~1.5 viewport heights (desktop; on mobile the stacked cards
        // own the layout, so the chapter scrolls naturally). onEnterBack
        // replays the burst when the user returns from below after re-arming.
        if (desktop) {
          ScrollTrigger.create({
            trigger: section,
            start: 'top top',
            end: '+=150%',
            pin: true,
            anticipatePin: 1,
            refreshPriority: 1,
            onEnterBack: fire,
          })
        }

        // The burst fires once the section is ~60% in view — from either
        // direction (onEnterBack covers returning from below with no pin).
        ScrollTrigger.create({
          trigger: section,
          start: 'top 40%',
          end: 'bottom 60%',
          onEnter: fire,
          onEnterBack: fire,
        })

        // Scrolling fully away re-arms the burst.
        const io = new IntersectionObserver(
          (entries) => {
            const onScreen = entries[0]?.isIntersecting ?? false
            if (onScreen) {
              // The scrub owns the playhead; nothing to start.
            } else {
              // A stale leave-entry delivered right after a re-fire would kill
              // the fresh burst and hide the words forever. Two shields: a
              // fresh burst is untouchable for 3 s, and geometry must confirm
              // (rects go transiently garbage during ScrollTrigger refreshes,
              // which is exactly when stale entries arrive).
              if (performance.now() - lastFireT < 3000) return
              if (!reallyOffScreen()) return
              video?.pause()
              if (!armed) reset()
            }
          },
          { rootMargin: '25% 0px' },
        )
        io.observe(section)

        // The binding guarantee: whenever this chapter is steadily on screen
        // with hidden words and no burst in flight, converge — re-fire the
        // burst if it was reset out from under us, or force the words on.
        let onScreenStreak = 0
        const guard = window.setInterval(() => {
          if (reallyOffScreen()) {
            onScreenStreak = 0
            return
          }
          onScreenStreak++
          if (onScreenStreak < 2) return
          if (tl && tl.isActive()) return
          if (performance.now() - lastFireT < 2600) return
          if (parseFloat(getComputedStyle(title).opacity) >= 0.9) return
          if (armed) {
            mlLog('guard: re-firing missed burst')
            fire()
          } else {
            mlLog('guard: forcing words visible')
            gsap.set([title, ...cards], { opacity: 1, yPercent: 0, rotation: 0 })
            gsap.set(scrim, { opacity: 0.22 })
          }
        }, 900)

        // Mount: the fire trigger above may already have burst (page loaded
        // mid-chapter), so the scrub is armed only while it is still ours.
        if (armed) attach()
        // iOS ignores preload until playback is requested once; the scrub
        // pauses it again on its first seek
        void video
          ?.play()
          .then(() => video.pause())
          .catch(() => {})
        // preload="metadata": duration can land after attach; re-range the
        // scrub only if the 4 s cap actually moves.
        const onMeta = () => {
          if (scrubOff && scrubEnd() !== scrubTo) rescrub(phase)
        }
        video?.addEventListener('loadedmetadata', onMeta)

        return () => {
          window.clearInterval(guard)
          io.disconnect()
          video?.removeEventListener('loadedmetadata', onMeta)
          detach()
          tl?.kill()
          burst.stop()
        }
      },
    )

    return () => {
      mm.revert()
      window.removeEventListener('resize', layout)
      burst.destroy()
    }
  }, [videoFailed])

  return (
    <section ref={root} id="ml-process" data-interactive className="section relative overflow-clip">
      <SectionIndex rank="J" />

      {/* Backdrop — the hole pinned left of center (desktop) / center (mobile),
          with the four zoom-blur ghost snapshots riding the same drift. */}
      <div aria-hidden="true" className="absolute inset-0 overflow-clip bg-[#060309]">
        <div ref={wrapRef} className="absolute will-change-transform">
          {videoFailed ? (
            <img
              ref={imgRef}
              src="/assets/blackhole_math.jpg"
              alt=""
              className="h-full w-full object-fill"
            />
          ) : (
            <video
              ref={videoRef}
              className="h-full w-full object-fill"
              src="/assets/blackhole.mp4"
              poster="/assets/blackhole_math.jpg"
              muted
              playsInline
              preload="metadata"
              onError={() => setVideoFailed(true)}
            />
          )}
          {Array.from({ length: GHOST_COUNT }, (_, i) => (
            <canvas
              key={i}
              ref={(el) => {
                ghostsRef.current[i] = el
              }}
              className="pointer-events-none absolute inset-0 h-full w-full opacity-0 mix-blend-screen will-change-transform"
            />
          ))}
        </div>
      </div>

      {/* Dim scrim after the burst so the card text reads over the wall */}
      <div
        ref={scrimRef}
        aria-hidden="true"
        className="absolute inset-0 opacity-0"
        style={{ background: 'var(--bg-top)' }}
      />

      {/* Blend the full-bleed chapter into the site background above and below */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[28%] bg-[linear-gradient(to_bottom,var(--bg-top)_0%,color-mix(in_srgb,var(--bg-top)_55%,transparent)_45%,transparent_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[28%] bg-[linear-gradient(to_top,var(--bg-top)_0%,color-mix(in_srgb,var(--bg-top)_55%,transparent)_45%,transparent_100%)]"
      />

      {/* Pulsing glow ring on the hole; the flare and shockwave fire from it */}
      <div ref={glowWrapRef} aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div
          ref={glowRef}
          className="absolute rounded-full"
          style={{
            background:
              'radial-gradient(closest-side, transparent 50%, rgba(255,166,88,0.18) 64%, rgba(255,132,54,0.34) 73%, transparent 86%)',
            filter: 'blur(6px)',
          }}
        />
      </div>
      <div
        ref={flareRef}
        aria-hidden="true"
        className="pointer-events-none absolute rounded-full opacity-0 mix-blend-screen"
        style={{
          background:
            'radial-gradient(closest-side, rgba(255,244,226,0.95) 0%, rgba(255,158,66,0.6) 45%, transparent 72%)',
        }}
      />
      <div
        ref={shockRef}
        aria-hidden="true"
        className="pointer-events-none absolute rounded-full opacity-0"
        style={{
          border: '2px solid rgba(255,244,230,0.95)',
          boxShadow:
            '0 0 0 3px rgba(255,122,61,0.45), 0 0 0 6px rgba(94,170,255,0.22), 0 0 22px 6px rgba(255,190,110,0.5), inset 0 0 18px rgba(255,200,140,0.45)',
        }}
      />

      {/* Glyph particle layer (under the title and cards) */}
      <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0" />

      <div className="container-site relative z-10 mt-auto pb-[4vh] md:mt-0 md:pb-0">
        <div className="md:max-w-[25rem]">
        {/* overflow-hidden: the reveal mask for the title's rise */}
        <div className="mb-6 overflow-hidden md:mb-8">
          <h2
            ref={titleRef}
            className="h-section text-left text-[var(--ivory)] will-change-transform"
            style={{ fontSize: TITLE_SIZE, fontFamily: LATEX_FONT, fontWeight: 600, textShadow: '0 2px 22px rgba(0,0,0,0.9)' }}
          >
            {mlProcess.heading}
          </h2>
        </div>

        {/* The roadmap, just in words — no boxes over the animation */}
        <div ref={cardsRef} className="mt-5 grid w-full grid-cols-1 gap-2 md:mt-7 md:gap-3">
          {mlProcess.steps.map((s, i) => (
            /* overflow-hidden: the reveal mask for each row's rise */
            <div key={s.n} className="overflow-hidden">
              <div className="flex items-baseline gap-3 will-change-transform">
                {/* Idle glow on the number only — the row is the guarded/risen element */}
                <span
                  className="life-glow text-2xl leading-none text-[#9db8ff] md:text-3xl"
                  style={{
                    fontFamily: LATEX_FONT,
                    fontStyle: 'italic',
                    fontWeight: 500,
                    ['--life-delay' as string]: `${-(0.6 + i * 0.9)}s`,
                    ['--life-dur' as string]: `${4 + (i % 3) * 0.6}s`,
                  }}
                >
                  {s.n}
                </span>
                {/* Types like the hero line: the step, then what it means, forever */}
                <TypedHeading
                  as="h3"
                  text={s.title}
                  alt={s.text}
                  hold={2200}
                  caret="bg-[#9db8ff]"
                  className="text-[clamp(1.35rem,1.9vw,1.9rem)] leading-tight text-[#f5f1e6] [font-family:var(--font-serif)] font-[600] [text-shadow:0_2px_18px_rgba(0,0,0,0.9)]"
                />
              </div>
            </div>
          ))}
        </div>
        </div>
      </div>
    </section>
  )
}
