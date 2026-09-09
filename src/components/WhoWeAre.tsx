import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import SectionIndex from './SectionIndex'
import CardShell from './CardShell'
import ScrollWords from './ScrollWords'
import { whoWeAre } from '../content'
import { useSectionReveals, animateCounter } from '../lib/reveal'
import { dealCard, observeCardLayout, shadowStyle } from '../lib/cardMotion'

gsap.registerPlugin(ScrollTrigger)

const ROBOT_SRC = '/assets/robot.mp4'

export default function WhoWeAre() {
  const root = useRef<HTMLElement>(null)
  useSectionReveals(root)

  const videoRef = useRef<HTMLVideoElement>(null)
  const [mounted, setMounted] = useState(false)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  // The clip (1.6 MB) only downloads once the chapter is a viewport away
  useEffect(() => {
    const section = root.current
    if (!section) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setMounted(true)
          io.disconnect()
        }
      },
      { rootMargin: '100% 0px' },
    )
    io.observe(section)
    return () => io.disconnect()
  }, [])

  // No playback clock: a seek is requested only by scroll, refresh or media
  // readiness. While a decoder is busy, keep only the latest scroll target.
  useEffect(() => {
    if (!mounted || failed) return
    const section = root.current
    const video = videoRef.current
    if (!section || !video) return
    const mm = gsap.matchMedia()
    mm.add({ all: 'all', reduce: '(prefers-reduced-motion: reduce)' }, (context) => {
      let frame = 0
      let alive = true
      let progress = 0
      const reduced = context.conditions?.reduce
      const seek = () => {
        frame = 0
        if (!alive || video.readyState < 1 || video.seeking || !Number.isFinite(video.duration)) return
        const target = reduced ? 0 : Math.max(0, video.duration - 1 / 30) * progress
        if (Math.abs(video.currentTime - target) < 1 / 30) return
        try { video.currentTime = target } catch { /* Retry on the next media-ready event. */ }
      }
      const requestSeek = () => { if (!frame && alive) frame = requestAnimationFrame(seek) }
      const pause = () => video.pause()
      pause()
      const trigger = reduced ? null : ScrollTrigger.create({
        trigger: section, start: 'top 90%', end: 'bottom 10%',
        onUpdate: (self) => { progress = self.progress; requestSeek() },
        onRefresh: (self) => { progress = self.progress; requestSeek() },
      })
      progress = trigger?.progress ?? 0
      video.addEventListener('play', pause)
      video.addEventListener('loadedmetadata', requestSeek)
      video.addEventListener('loadeddata', requestSeek)
      video.addEventListener('seeked', requestSeek)
      requestSeek()
      return () => {
        alive = false
        cancelAnimationFrame(frame)
        trigger?.kill()
        video.removeEventListener('play', pause)
        video.removeEventListener('loadedmetadata', requestSeek)
        video.removeEventListener('loadeddata', requestSeek)
        video.removeEventListener('seeked', requestSeek)
        pause()
      }
    })
    return () => mm.revert()
  }, [mounted, failed])

  const onError = () => {
    if (!failed) {
      console.warn(`[who-we-are] robot clip missing — expected ${ROBOT_SRC}; showing the card back`)
      setFailed(true)
    }
  }

  // The deal — hand (trigger), per-card parallax homes, deal targets, shadows
  const handRef = useRef<HTMLDivElement>(null)
  const leftHome = useRef<HTMLDivElement>(null)
  const rightHome = useRef<HTMLDivElement>(null)
  const leftCard = useRef<HTMLDivElement>(null)
  const rightCard = useRef<HTMLDivElement>(null)
  const leftShadow = useRef<HTMLDivElement>(null)
  const rightShadow = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const hand = handRef.current
    const cards = [leftCard.current, rightCard.current]
    const homes = [leftHome.current, rightHome.current]
    if (!hand || cards.some((card) => !card) || homes.some((home) => !home)) return
    const mm = gsap.matchMedia()
    mm.add({ all: 'all', wide: '(min-width: 640px)', reduce: '(prefers-reduced-motion: reduce)' }, (context) => {
      if (context.conditions?.reduce) return
      const wide = context.conditions?.wide
      const add = (tl: gsap.core.Timeline, i: number, at: number) => {
        const side = i === 0 ? -1 : 1
        tl.add(dealCard(cards[i]!, {
          from: { x: wide ? side * 70 : side * 22, y: 64, rotation: side * 11 },
          rotation: wide ? side * 2.6 : 0, duration: 0.85, lift: -22,
          shadow: i === 0 ? leftShadow.current : rightShadow.current,
        }), at)
      }
      if (wide) {
        const tl = gsap.timeline({ scrollTrigger: {
          trigger: hand, start: 'top 94%', end: 'top 38%', scrub: 0.22, invalidateOnRefresh: true,
        } })
        cards.forEach((_, i) => add(tl, i, i * 0.16))
      } else {
        homes.forEach((home, i) => {
          const tl = gsap.timeline({ scrollTrigger: {
            trigger: home!, start: 'top 94%', end: 'top 48%', scrub: 0.2, invalidateOnRefresh: true,
          } })
          add(tl, i, 0)
        })
      }
    })
    const unobserve = observeCardLayout([hand])
    return () => { unobserve(); mm.revert() }
  }, [])

  const countersRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const wrap = countersRef.current
    if (!wrap) return
    const tweens = Array.from(wrap.querySelectorAll<HTMLElement>('[data-counter]')).map((el) =>
      animateCounter(el, Number(el.dataset.counter), el.dataset.noSeparator === 'true'),
    )
    return () => tweens.forEach((t) => { t.scrollTrigger?.kill(); t.kill() })
  }, [])

  return (
    <section ref={root} id="who-we-are" className="section">
      <SectionIndex rank="K" />
      <div className="container-site">
        <h2 className="h-section mx-auto mb-[min(2.5rem,4svh)] max-w-[18ch] text-center md:mb-[min(3rem,4svh)]">
          <ScrollWords text={whoWeAre.heading} treatment="mask" />
        </h2>

        {/* The hole cards */}
        <div
          ref={handRef}
          className="flex flex-col items-center justify-center gap-8 sm:flex-row sm:items-stretch md:gap-12"
        >
          {/* Left hole card — the words */}
          <div ref={leftHome} className="relative">
            <div ref={leftShadow} aria-hidden="true" style={shadowStyle()} />
            <div ref={leftCard} className="relative">
              <CardShell
                className="who-card-copy card-face-surface relative flex aspect-[5/7] w-[min(76vw,18.75rem)] flex-col justify-center px-7 py-8 md:w-[min(24vw,20rem,34svh)] md:px-8"
                tiltMax={4}
                shadow={false}
              >
                <span
                  aria-hidden="true"
                  className="absolute left-4 top-4 flex flex-col items-center leading-none md:left-5 md:top-5"
                >
                  <span className="font-display text-xl text-[var(--ink)] md:text-2xl">K</span>
                  <span className="text-base text-[var(--ink)] md:text-lg">♠</span>
                </span>
                {whoWeAre.paragraphs.map((p) => (
                  <p
                    key={p.slice(0, 18)}
                    className="font-display text-[clamp(1.15rem,1.6vw,1.55rem)] leading-[1.45] text-[color-mix(in_srgb,var(--ink)_88%,#5a4a30)]"
                  >
                    {p}
                  </p>
                ))}
                <span
                  aria-hidden="true"
                  className="absolute bottom-4 right-4 flex rotate-180 flex-col items-center leading-none md:bottom-5 md:right-5"
                >
                  <span className="font-display text-xl text-[var(--ink)] md:text-2xl">K</span>
                  <span className="text-base text-[var(--ink)] md:text-lg">♠</span>
                </span>
              </CardShell>
            </div>
          </div>

          {/* Right hole card — the bot we train, dealing */}
          <div ref={rightHome} className="relative">
            <div ref={rightShadow} aria-hidden="true" style={shadowStyle()} />
            <div ref={rightCard} className="relative">
              <CardShell
                className="card-back-surface relative aspect-[5/7] w-[min(76vw,18.75rem)] overflow-hidden md:w-[min(24vw,20rem,34svh)]"
                tiltMax={4}
                shadow={false}
              >
                {mounted && !failed && (
                  <video
                    ref={videoRef}
                    className={`absolute inset-0 h-full w-full rounded-[inherit] object-cover [object-position:62%_50%] transition-opacity duration-[var(--dur)] [transition-timing-function:var(--ease-out)] ${
                      ready ? 'opacity-100' : 'opacity-0'
                    }`}
                    src={ROBOT_SRC}
                    muted
                    playsInline
                    preload="auto"
                    onLoadedData={() => setReady(true)}
                    onSeeked={() => setReady(true)}
                    onError={onError}
                    aria-label="A robot hand dealing playing cards at a table"
                  />
                )}
              </CardShell>
            </div>
          </div>
        </div>

        {/* Counters — card corner indices that count up */}
        <div
          ref={countersRef}
          className="mx-auto mt-10 grid max-w-4xl grid-cols-2 gap-4 md:mt-14 md:grid-cols-4 md:gap-6"
        >
          {whoWeAre.counters.map((c) => (
            <div
              key={c.label}
              data-reveal="para"
              className="panel neon flex flex-col items-start gap-1 rounded-2xl px-6 py-5"
            >
              {c.value === null ? (
                <span className="font-display text-[clamp(2rem,3.4vw,3rem)] leading-none text-[var(--muted)]">
                  TBA
                </span>
              ) : (
                <span
                  data-counter={c.value}
                  data-no-separator={'noSeparator' in c && c.noSeparator ? 'true' : 'false'}
                  className="font-display text-[clamp(2rem,3.4vw,3rem)] leading-none text-[var(--text)]"
                >
                  0
                </span>
              )}
              <span className="mt-1 flex items-center gap-1.5">
                <span aria-hidden="true" className="text-[max(0.9rem,0.875rem)] text-[var(--neon-mid)]">
                  ♠
                </span>
                <span className="mono text-[var(--muted)]">{c.label}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
