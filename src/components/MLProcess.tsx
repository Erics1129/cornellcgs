import { useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import SectionIndex from './SectionIndex'
import { mlProcess } from '../content'
import { cssVar } from '../lib/theme'
import { shake } from '../lib/motion'
import { createGlyphBurst } from '../effects/glyphBurst'

gsap.registerPlugin(ScrollTrigger)

/**
 * Our Machine Learning process (J♠) — the black hole burst (§5.10).
 * Full-bleed chapter on the blackhole.mp4 backdrop (poster/fallback:
 * blackhole_math.jpg with the slow drift). The section pins for ~1.5 viewport
 * heights; before the burst only the drifting backdrop and a pulsing glow
 * ring are visible. At ~60% in view the burst fires once (<1.6 s, power4.out
 * everywhere): ring flare + chromatic shockwave, a zoom-blur fake built from
 * four scaled ghost snapshots of the backdrop, 300–500 equation glyphs out of
 * the hole (effects/glyphBurst), shake(0.6) at 100 ms, the title scaling out
 * of the hole with three trailing ghosts, then the five step cards on curved
 * two-tween paths. Scrolling fully away re-arms it. Reduced motion: no pin,
 * no burst — everything just fades in over the calm backdrop.
 */

/** Where the hole sits inside each source frame (fractions of the media box). */
const VIDEO_FRAME = { aspect: 1280 / 720, hx: 0.48, hy: 0.5 }
const IMAGE_FRAME = { aspect: 1296 / 1906, hx: 0.37, hy: 0.465 }
/** Where the hole lands in the viewport: left of center on desktop, center on mobile. */
const HOLE_DESKTOP = { x: 0.38, y: 0.52 }
const HOLE_MOBILE = { x: 0.5, y: 0.44 }

const GHOST_COUNT = 4
const TITLE_GHOST_ALPHA = [0.28, 0.16, 0.08]
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
  const titleGhostsRef = useRef<Array<HTMLDivElement | null>>([])
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
    const titleGhosts = titleGhostsRef.current.filter((el): el is HTMLDivElement => el !== null)
    const ghosts = ghostsRef.current.filter((el): el is HTMLCanvasElement => el !== null)
    const cards = Array.from(cardsGrid.children).filter((el): el is HTMLElement => el instanceof HTMLElement)

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
          gsap.set(titleGhosts, { opacity: 0 })
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
          const io = new IntersectionObserver(
            (entries) => {
              const onScreen = entries[0]?.isIntersecting ?? false
              if (!video) return
              if (onScreen) video.play().catch(() => {})
              else video.pause()
            },
            { rootMargin: '25% 0px' },
          )
          io.observe(section)
          return () => io.disconnect()
        }

        // ------------------------------------------------------------------
        // Full version. Pre-burst: hidden content, drifting backdrop at 1.05,
        // gently pulsing glow ring over the hole. Nothing else visible.
        // ------------------------------------------------------------------
        let armed = true
        let tl: gsap.core.Timeline | null = null

        gsap.set([title, ...titleGhosts, ...cards], { opacity: 0 })
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

        const drift = gsap.timeline({ repeat: -1, yoyo: true, defaults: { ease: 'sine.inOut' } })
        drift.to(wrap, { x: 6, y: -4, duration: 9 }).to(wrap, { x: -5, y: 3, duration: 11 })

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
          mlLog('reset (tl ' + (tl ? 'killed@' + (tl.progress() * 100).toFixed(0) + '%' : 'none') + ')')
          tl?.kill()
          tl = null
          burst.stop()
          gsap.set([title, ...titleGhosts, ...cards], { clearProps: 'transform' })
          gsap.set([title, ...titleGhosts, ...cards], { opacity: 0 })
          gsap.set(scrim, { opacity: 0 })
          gsap.set(shock, { opacity: 0, scale: 0.02 })
          gsap.set(flare, { opacity: 0 })
          gsap.set(glowWrap, { opacity: 1 })
          gsap.set(wrap, { scale: 1 })
          applyGhosts(0)
          armed = true
        }

        const mlLog = (ev: string) => {
          if (import.meta.env.DEV) {
            const w = window as unknown as { __mlLog?: string[] }
            ;(w.__mlLog ??= []).push(`${Math.round(performance.now())}ms ${ev}`)
          }
        }
        const fire = () => {
          mlLog('fire ' + (armed ? 'ARMED' : 'blocked'))
          if (!armed) return
          armed = false
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

          // 500–900 ms: the title scales 0.2 → 1 out of the hole, three ghost
          // copies trailing to fake motion blur.
          // Words wait for the burst to finish, then slide in on the left —
          // they never cross the hole or cover the equation wall.
          tl.fromTo(
            title,
            { x: -36, opacity: 0 },
            {
              x: 0,
              opacity: 1,
              duration: 0.5,
              ease: 'power3.out',
              overwrite: 'auto',
              onStart: () => mlLog('title tween start'),
              onComplete: () => mlLog('title tween done'),
            },
            1.1,
          )

          // 600–1400 ms: the five cards shoot out on curved paths — x rides
          // power4.out while y overshoots on back.out, so each flight bends,
          // overshoots and settles (the two-tween bezier fake).
          cards.forEach((card, i) => {
            tl!.fromTo(
              card,
              { x: -26, opacity: 0 },
              { x: 0, opacity: 1, duration: 0.45, ease: 'power3.out', overwrite: 'auto' },
              1.25 + i * cardStagger,
            )
          })

          // End-state guarantee: whatever raced or was killed mid-flight,
          // the words ARE on screen once the burst window has passed.
          tl.set([title, ...cards], { opacity: 1, x: 0 }, 2.3)

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

        // Backdrop video plays only near the viewport; scrolling fully away
        // pauses the drift and re-arms the burst.
        const io = new IntersectionObserver(
          (entries) => {
            const onScreen = entries[0]?.isIntersecting ?? false
            if (onScreen) {
              video?.play().catch(() => {})
              drift.play()
            } else {
              video?.pause()
              drift.pause()
              if (!armed) reset()
            }
          },
          { rootMargin: '25% 0px' },
        )
        io.observe(section)

        return () => {
          io.disconnect()
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
              autoPlay
              muted
              loop
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
        <div className="md:max-w-[400px]">
        <div className="relative mb-6 md:mb-8">
          <h2
            ref={titleRef}
            className="h-section text-left text-[var(--ivory)] will-change-transform"
            style={{ fontSize: TITLE_SIZE, fontFamily: LATEX_FONT, fontWeight: 600, textShadow: '0 2px 22px rgba(0,0,0,0.9)' }}
          >
            {mlProcess.heading}
          </h2>
          {TITLE_GHOST_ALPHA.map((_, i) => (
            <div
              key={i}
              ref={(el) => {
                titleGhostsRef.current[i] = el
              }}
              aria-hidden="true"
              className="h-section pointer-events-none absolute inset-0 text-left text-[var(--ivory)] opacity-0 will-change-transform"
              style={{ fontSize: TITLE_SIZE, fontFamily: LATEX_FONT, fontWeight: 600 }}
            >
              {mlProcess.heading}
            </div>
          ))}
        </div>

        {/* The roadmap, just in words — no boxes over the animation */}
        <div ref={cardsRef} className="mt-5 grid w-full grid-cols-1 gap-2 md:mt-7 md:gap-3">
          {mlProcess.steps.map((s) => (
            <div
              key={s.n}
              className="flex items-baseline gap-3 will-change-transform"
            >
              <span
                className="text-2xl leading-none text-[#9db8ff] md:text-3xl"
                style={{ fontFamily: LATEX_FONT, fontStyle: 'italic', fontWeight: 500 }}
              >
                {s.n}
              </span>
              <h3
                className="text-[clamp(1.35rem,1.9vw,1.9rem)] leading-tight text-[#f5f1e6]"
                style={{ fontFamily: LATEX_FONT, fontWeight: 600, textShadow: '0 2px 18px rgba(0,0,0,0.9)' }}
              >
                {s.title}
              </h3>
            </div>
          ))}
        </div>
        </div>
      </div>
    </section>
  )
}
