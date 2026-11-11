import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import './lib/eases'
import { initSmoothScroll } from './lib/scroll'
import { useNeonEdges } from './lib/neon'
import { BOOTED_EVENT, prefersReducedMotion } from './lib/motion'
import { dealCard, shadowStyle } from './lib/cardMotion'
import { initLineReveals } from './lib/lines'
import GradientBG from './effects/GradientBG'
import FilmLens from './effects/FilmLens'
import InputLayer from './components/InputLayer'
import CodeLayer from './effects/CodeLayer'
import FutureEye from './components/FutureEye'
import Nav from './components/Nav'
import SideRail from './components/SideRail'
import Cursor from './components/Cursor'
import Hero from './components/Hero'
import WhoWeAre from './components/WhoWeAre'
import WhatWeDo from './components/WhatWeDo'
import MLProcess from './components/MLProcess'
import Events from './components/Events'
import WorldSection from './components/WorldSection'
import UniverseJourney from './components/UniverseJourney'
import People from './components/People'
import Join from './components/Join'
import Footer from './components/Footer'
import { AlphaGoSlide, ProjectSlide } from './components/StatementSlides'
import SodaSlide from './components/SodaSlide'
import Seam from './components/Seam'
import { CodeSlide, StatsSlide } from './components/ShowcaseSlides'

/**
 * Loader — the riffle plus a dealing count. It holds until the display fonts
 * and the hero video are actually ready (2.4s hard cap), then lifts and hands
 * the entrance to the hero via BOOTED_EVENT. The curtain scales up slightly
 * as it fades so the reveal reads as a push into the room, not a cut.
 */
const SEEN_KEY = 'cgs-seen'
const returning = (() => {
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
})()

function Loader({ done }: { done: boolean }) {
  const [count, setCount] = useState(0)
  const deckRef = useRef<HTMLDivElement>(null)
  const riffleRef = useRef<gsap.core.Timeline | null>(null)
  useEffect(() => {
    if (prefersReducedMotion()) {
      setCount(100)
      return
    }
    const state = { v: 0 }
    const tween = gsap.to(state, {
      v: 100,
      duration: 1.4,
      ease: 'power2.inOut',
      onUpdate: () => setCount(Math.round(state.v)),
    })
    return () => {
      tween.kill()
    }
  }, [])

  // The riffle: three card backs dealt up from below the deck along a shallow
  // arc — spinning with the throw, peaking closer to the eye, landing with a
  // bounce on a separated shadow — then the top card idles, tilting ±2° on a
  // slow sine. Reduced motion → dealCard places the rest state, no idle.
  useEffect(() => {
    const deck = deckRef.current
    if (!deck) return
    const ctx = gsap.context(() => {
      const cards = Array.from(deck.querySelectorAll<HTMLElement>('[data-riffle-card]'))
      const shadows = Array.from(deck.querySelectorAll<HTMLElement>('[data-riffle-shadow]'))
      if (!cards.length) return
      const restRotation = (i: number) => (i - 1) * 6
      const tl = gsap.timeline()
      cards.forEach((card, i) => {
        tl.add(
          dealCard(card, {
            from: { x: (i - 1) * -60, y: 90, rotation: -28 + i * 10 },
            rotation: restRotation(i),
            duration: 0.7,
            lift: -30,
            air: 1.08,
            shadow: shadows[i] ?? null,
          }),
          i * 0.11,
        )
      })
      if (!prefersReducedMotion()) {
        // Idle: ease into the sway, then ±2° around the rest angle, 2.4 s a leg
        const top = cards[cards.length - 1]
        const rest = restRotation(cards.length - 1)
        tl.to(top, { rotation: rest + 2, duration: 1.2, ease: 'sine.out' }, '>')
        tl.to(top, { rotation: rest - 2, duration: 2.4, ease: 'sine.inOut', yoyo: true, repeat: -1 }, '>')
      }
      riffleRef.current = tl
    }, deck)
    return () => {
      riffleRef.current = null
      ctx.revert()
    }
  }, [])

  // The curtain's 700 ms wipe hides the deck for good — stop the idle so no
  // per-frame transform keeps running behind it.
  useEffect(() => {
    if (!done) return
    const t = window.setTimeout(() => riffleRef.current?.pause(), 750)
    return () => window.clearTimeout(t)
  }, [done])

  // Coming back from a sub-page: no curtain, the deck is simply there
  if (returning) return null

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-[var(--bg-top)] transition-[clip-path,opacity] duration-700 [transition-timing-function:var(--ease-in-out)] ${
        done
          ? 'pointer-events-none opacity-90 [clip-path:inset(0_0_100%_0)]'
          : 'opacity-100 [clip-path:inset(0_0_0%_0)]'
      }`}
    >
      <div ref={deckRef} className="relative h-28 w-20">
        {[0, 1, 2].map((i) => (
          // Each card rides on its own separated shadow (a sibling under it, so
          // the shadow stays on the table while the card is in the air). Both
          // start invisible; dealCard owns opacity from its first frame.
          <div key={i} className="absolute inset-0">
            <div data-riffle-shadow style={{ ...shadowStyle(), opacity: 0 }} />
            <div
              data-riffle-card
              className="card-back-surface absolute inset-0 flex items-center justify-center"
              style={{ opacity: 0, boxShadow: 'none' }}
            >
              <span className="text-2xl text-[var(--silver)] opacity-70">♠</span>
            </div>
          </div>
        ))}
      </div>
      <span
        data-counter
        className="mono absolute bottom-8 left-8 text-[max(0.8rem,0.8125rem)] text-[var(--muted)]"
      >
        {/* an odometer: each digit rolls on its own drum */}
        <span className="sr-only">{count}</span>
        <span className="odo" aria-hidden="true">
          {String(count)
            .padStart(3, '0')
            .split('')
            .map((d, i) => (
              <span key={i} className="odo__drum">
                <span className="odo__strip" style={{ transform: `translateY(${-Number(d) * 10}%)` }}>
                  0<br />1<br />2<br />3<br />4<br />5<br />6<br />7<br />8<br />9
                </span>
              </span>
            ))}
        </span>
      </span>
    </div>
  )
}

export default function App() {
  const shakeRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const [loaded, setLoaded] = useState(false)

  useNeonEdges(appRef)

  // The deck boots before the first paint: geometry is read, a return-to-spot
  // restore lands, and every reveal already in view is complete in frame one.
  useLayoutEffect(() => initSmoothScroll(), [])

  useEffect(() => {
    // Lift the curtain when fonts + hero video are truly ready — capped at
    // 2.4s, floored at 350ms so the riffle always completes its motion.
    let lifted = false
    let alive = true
    const timers: number[] = []
    const lift = () => {
      if (lifted || !alive) return
      lifted = true
      ;(window as unknown as { __cgsShown?: boolean }).__cgsShown = true
      try {
        sessionStorage.setItem(SEEN_KEY, '1')
      } catch {
        /* private mode — every visit gets the curtain */
      }
      setLoaded(true)
      window.dispatchEvent(new Event(BOOTED_EVENT))
    }
    const ready = Promise.race([
      Promise.all([
        document.fonts?.ready ?? Promise.resolve(),
        new Promise<void>((res) => {
          const probe = () => {
            const v = document.querySelector<HTMLVideoElement>('video[data-hero-video]')
            if (!v) return res() // hero not mounted with a video — don't block
            if (v.readyState >= 3) return res()
            v.addEventListener('canplay', () => res(), { once: true })
            timers.push(window.setTimeout(() => res(), 1800))
          }
          timers.push(window.setTimeout(probe, 100))
        }),
      ]),
      new Promise<void>((res) => timers.push(window.setTimeout(() => res(), returning ? 400 : 2400))),
    ])
    const minShow = new Promise<void>((res) => timers.push(window.setTimeout(() => res(), returning ? 0 : 350)))
    Promise.all([ready, minShow]).then(lift)
    // The cap is absolute: whatever the promises above do, the curtain is gone at 2.4 s.
    timers.push(window.setTimeout(lift, 2400))

    return () => {
      alive = false
      timers.forEach((t) => window.clearTimeout(t))
    }
  }, [])

  // Line by line copy reveals. They are built at once (anything already in view is
  // simply complete) and again once the fonts have set the real line breaks.
  useEffect(() => {
    if (!mainRef.current) return
    let cleanup = initLineReveals(mainRef.current)
    let alive = true
    ;(document.fonts?.ready ?? Promise.resolve()).then(() => {
      if (!alive || !mainRef.current) return
      cleanup()
      cleanup = initLineReveals(mainRef.current)
    })
    return () => {
      alive = false
      cleanup()
    }
  }, [])

  return (
    <div ref={appRef}>
      <Loader done={loaded} />
      <GradientBG />
      <CodeLayer />
      {/* Fixed chrome lives OUTSIDE the shake wrapper: a transformed ancestor
          becomes the containing block for position:fixed and breaks it. */}
      <Nav />
      <SideRail />
      <Cursor />
      <InputLayer page="deck" />
      {/* The lens every pixel sits under (grain, vignette); under the loader only */}
      <FilmLens page="deck" />
      <div ref={shakeRef} className="relative z-10">
        <main ref={mainRef}>
          <Hero />
          <Seam from="top" to="who-we-are" kind="dip" />
          <WhoWeAre />
          <Seam from="who-we-are" to="alphago" kind="dip" />
          <AlphaGoSlide />
          <Seam from="alphago" to="what-we-do" kind="dip" />
          <WhatWeDo />
          <Seam from="what-we-do" to="project" kind="soft" />
          <ProjectSlide />
          <Seam from="project" to="stats" kind="soft" />
          <StatsSlide />
          <Seam from="stats" to="code" kind="soft" />
          <CodeSlide />
          <Seam from="code" to="ml-process" kind="dip" />
          <MLProcess />
          <Seam from="ml-process" to="events" kind="dip" />
          <Events />
          <Seam from="events" to="world" kind="dip" />
          <WorldSection />
          <Seam from="world" to="universe" kind="cut" />
          <UniverseJourney />
          <Seam from="universe" to="people" kind="dip" />
          <People />
          <Seam from="people" to="anyone" kind="level" />
          <SodaSlide />
          <Seam from="anyone" to="join" kind="soft" />
          <Join />
          <Seam from="join" to="vision" kind="lid" />
          <FutureEye />
          <Seam from="vision" to="contact" kind="dip" />
        </main>
        <Footer />
      </div>
    </div>
  )
}
