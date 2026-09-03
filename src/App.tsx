import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import './lib/eases'
import { initSmoothScroll } from './lib/scroll'
import { useNeonEdges } from './lib/neon'
import { BOOTED_EVENT, SHAKE_EVENT, prefersReducedMotion } from './lib/motion'
import { dealCard, shadowStyle } from './lib/cardMotion'
import GradientBG from './effects/GradientBG'
import CodeLayer from './effects/CodeLayer'
import Nav from './components/Nav'
import SideRail from './components/SideRail'
import Hero from './components/Hero'
import WhoWeAre from './components/WhoWeAre'
import WhatWeDo from './components/WhatWeDo'
import MLProcess from './components/MLProcess'
import Events from './components/Events'
import WorldSection from './components/WorldSection'
import People from './components/People'
import Join from './components/Join'
import Footer from './components/Footer'
import { useChapterTransitions } from './lib/reveal'
import { AlphaGoSlide, AnyoneSlide, ProjectSlide } from './components/StatementSlides'
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
        {String(count).padStart(3, '0')}
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
  useChapterTransitions(mainRef)

  useEffect(() => {
    const cleanup = initSmoothScroll()

    // Lift the curtain when fonts + hero video are truly ready — capped at
    // 2.4s, floored at 950ms so the riffle always completes its motion.
    let lifted = false
    const timers: number[] = []
    const lift = () => {
      if (lifted) return
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
    const minShow = new Promise<void>((res) => timers.push(window.setTimeout(() => res(), returning ? 0 : 950)))
    Promise.all([ready, minShow]).then(lift)

    return () => {
      cleanup()
      timers.forEach((t) => window.clearTimeout(t))
    }
  }, [])

  // Screen shake — dispatched by the shatter layer and the black hole burst
  useEffect(() => {
    const el = shakeRef.current
    if (!el) return
    const onShake = (e: Event) => {
      if (prefersReducedMotion()) return
      const intensity = Math.min(1, (e as CustomEvent<{ intensity: number }>).detail?.intensity ?? 0.5)
      const amp = 3 + intensity * 3
      gsap.fromTo(
        el,
        {
          x: gsap.utils.random(-amp, amp),
          y: gsap.utils.random(-amp, amp),
          rotation: gsap.utils.random(-0.2, 0.2) * intensity,
        },
        {
          x: 0,
          y: 0,
          rotation: 0,
          duration: 0.25,
          ease: 'power2.out',
          // A leftover identity transform would turn the wrapper into a
          // containing block and silently un-fix every fixed descendant.
          onComplete: () => gsap.set(el, { clearProps: 'transform' }),
        },
      )
    }
    window.addEventListener(SHAKE_EVENT, onShake)
    return () => window.removeEventListener(SHAKE_EVENT, onShake)
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
      {/* Cinematic grain over the whole world; sits under the loader only */}
      <div aria-hidden="true" className="film-grain z-[80]" />
      <div ref={shakeRef} className="relative z-10">
        <main ref={mainRef}>
          <Hero />
          <WhoWeAre />
          <AlphaGoSlide />
          <WhatWeDo />
          <ProjectSlide />
          <CodeSlide />
          <MLProcess />
          <Events />
          <WorldSection />
          <People />
          <StatsSlide />
          <AnyoneSlide />
          <Join />
        </main>
        <Footer />
      </div>
    </div>
  )
}
