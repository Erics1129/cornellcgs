import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import SectionIndex from './SectionIndex'
import CardShell from './CardShell'
import { whoWeAre } from '../content'
import { useSectionReveals, useSectionDepth, animateCounter } from '../lib/reveal'
import { attachVideoScrub } from '../lib/videoScrub'
import { prefersReducedMotion } from '../lib/motion'
import { dealCard, shadowStyle } from '../lib/cardMotion'

gsap.registerPlugin(ScrollTrigger)

const ROBOT_SRC = '/assets/robot.mp4'

/** resting "peek" tilt of each hole card, degrees — side by side only */
const PEEK_TILT = 3.5
/** the right card leaves the dealer's hand this long after the left, seconds */
const DEAL_STAGGER = 0.18

function renderEmphasis(text: string) {
  // *word* becomes an italic display word
  const parts = text.split('*')
  return parts.map((p, i) => (i % 2 === 1 ? <em key={i}>{p}</em> : <span key={i}>{p}</span>))
}

/**
 * Who we are (K♠) — two portrait hole cards dealt onto the table as the
 * chapter enters: each flies in from its own side along a shallow arc,
 * spinning off the throw, and lands with a small bounce at its peeking
 * tilt (lib/cardMotion dealCard), a soft table shadow pooling under it.
 * Four count-up counters styled as card corner indices sit beneath. The
 * right card's robot clip is scroll-scrubbed: reading down the chapter deals
 * the hand forward, scrolling back rewinds it. Reduced motion places both
 * cards at rest and holds the clip on its first frame; a missing file
 * leaves the plain navy card back.
 *
 * Transform ownership: the [data-depth] wrapper carries the scrubbed
 * parallax (and the entrance opacity), the inner card element carries the
 * deal, and CardShell's own element carries the hover lift — never two
 * writers on one node.
 */
export default function WhoWeAre() {
  const root = useRef<HTMLElement>(null)
  useSectionReveals(root)
  useSectionDepth(root)

  const videoRef = useRef<HTMLVideoElement>(null)
  const [mounted, setMounted] = useState(false)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const reduced = prefersReducedMotion()

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

  // Scroll is the playhead across the chapter's full transit
  useEffect(() => {
    if (!mounted || failed || reduced) return
    const section = root.current
    const video = videoRef.current
    if (!section || !video) return

    const detach = attachVideoScrub(video, {
      trigger: section,
      start: 'top 90%',
      end: 'bottom 10%',
    })
    return () => detach()
  }, [mounted, failed, reduced])

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

  useEffect(() => {
    const hand = handRef.current
    const l = leftCard.current
    const r = rightCard.current
    const lHome = leftHome.current
    const rHome = rightHome.current
    if (!hand || !l || !r || !lHome || !rHome) return

    const ctx = gsap.context(() => {
      // Side by side (sm+) the cards peek toward each other; stacked, they lie straight
      const tilt = window.matchMedia('(min-width: 640px)').matches ? PEEK_TILT : 0

      if (prefersReducedMotion()) {
        // Already on the table
        gsap.set(l, { rotation: -tilt })
        gsap.set(r, { rotation: tilt })
        return
      }

      // Nothing on the table until the dealer throws — the start positions sit
      // above the fold, so the homes hide until each card's flight begins
      gsap.set([lHome, rHome], { autoAlpha: 0 })

      const vw = window.innerWidth
      const vh = window.innerHeight
      const throwFrom = (side: -1 | 1) => ({ x: side * vw * 0.5, y: -vh * 0.4, rotation: side * 60 })
      const flight = { duration: 1.0, lift: -50, air: 1.08, immediate: false } as const

      const tl = gsap.timeline({
        scrollTrigger: { trigger: hand, start: 'top 85%', once: true, fastScrollEnd: true },
      })
      // Each card appears in the first hand-span of its flight, already moving
      tl.to(lHome, { autoAlpha: 1, duration: 0.15, ease: 'none' }, 0)
      tl.add(
        dealCard(l, { ...flight, from: throwFrom(-1), rotation: -tilt, shadow: leftShadow.current }),
        0,
      )
      tl.to(rHome, { autoAlpha: 1, duration: 0.15, ease: 'none' }, DEAL_STAGGER)
      tl.add(
        dealCard(r, { ...flight, from: throwFrom(1), rotation: tilt, shadow: rightShadow.current }),
        DEAL_STAGGER,
      )
    }, root)

    return () => ctx.revert()
  }, [])

  const countersRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const wrap = countersRef.current
    if (!wrap) return
    const tweens = Array.from(wrap.querySelectorAll<HTMLElement>('[data-counter]')).map((el) =>
      animateCounter(el, Number(el.dataset.counter), el.dataset.noSeparator === 'true'),
    )
    return () => tweens.forEach((t) => t.kill())
  }, [])

  return (
    <section ref={root} id="who-we-are" className="section">
      <SectionIndex rank="K" />
      <div className="container-site">
        <h2 data-reveal="heading" className="h-section mx-auto mb-10 max-w-[18ch] text-center md:mb-12">
          {renderEmphasis(whoWeAre.heading)}
        </h2>

        {/* The hole cards */}
        <div
          ref={handRef}
          className="flex flex-col items-center justify-center gap-8 sm:flex-row sm:items-stretch md:gap-12"
        >
          {/* Left hole card — the words */}
          <div ref={leftHome} data-depth="24" className="relative sm:translate-y-2">
            <div ref={leftShadow} aria-hidden="true" style={shadowStyle()} />
            <div ref={leftCard} className="relative">
             <div className="life-float" style={{ ['--life-dur' as string]: '8.2s', ['--life-delay' as string]: '-2.1s' }}>
              <CardShell
                className="card-face-surface neon relative flex aspect-[5/7] w-[min(76vw,18.75rem)] flex-col justify-center px-7 py-8 md:w-[min(24vw,20rem)] md:px-8"
                tiltMax={4}
                shadowEl={leftShadow}
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
          </div>

          {/* Right hole card — the bot we train, dealing */}
          <div ref={rightHome} data-depth="10" className="relative">
            <div ref={rightShadow} aria-hidden="true" style={shadowStyle()} />
            <div ref={rightCard} className="relative">
             <div className="life-float" style={{ ['--life-dur' as string]: '9.1s', ['--life-delay' as string]: '-5.6s' }}>
              <CardShell
                className="card-back-surface neon relative aspect-[5/7] w-[min(76vw,18.75rem)] overflow-hidden md:w-[min(24vw,20rem)]"
                tiltMax={4}
                shadowEl={rightShadow}
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
                    preload={reduced ? 'metadata' : 'auto'}
                    onLoadedMetadata={
                      reduced
                        ? (e) => {
                            // A nudge off zero makes the first frame paint without a poster
                            e.currentTarget.currentTime = 0.04
                          }
                        : undefined
                    }
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
