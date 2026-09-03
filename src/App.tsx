import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import './lib/eases'
import { initSmoothScroll } from './lib/scroll'
import { useNeonEdges } from './lib/neon'
import { BOOTED_EVENT, SHAKE_EVENT, prefersReducedMotion } from './lib/motion'
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
import ZoomWord from './components/ZoomWord'
import { useChapterTransitions } from './lib/reveal'

/**
 * Loader — the riffle plus a dealing count. It holds until the display fonts
 * and the hero video are actually ready (2.4s hard cap), then lifts and hands
 * the entrance to the hero via BOOTED_EVENT. The curtain scales up slightly
 * as it fades so the reveal reads as a push into the room, not a cut.
 */
function Loader({ done }: { done: boolean }) {
  const [count, setCount] = useState(0)
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

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-[var(--bg-top)] transition-[clip-path,opacity] duration-700 [transition-timing-function:var(--ease-in-out)] ${
        done
          ? 'pointer-events-none opacity-90 [clip-path:inset(0_0_100%_0)]'
          : 'opacity-100 [clip-path:inset(0_0_0%_0)]'
      }`}
    >
      <div className="relative h-28 w-20">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="card-back-surface absolute inset-0 flex items-center justify-center"
            style={{
              animation: prefersReducedMotion()
                ? undefined
                : `riffle 0.72s ${i * 0.12}s cubic-bezier(0.34, 1.3, 0.5, 1) both`,
            }}
          >
            <span className="text-2xl text-[var(--silver)] opacity-70">♠</span>
          </div>
        ))}
      </div>
      <span
        data-counter
        className="mono absolute bottom-8 left-8 text-[max(0.8rem,13px)] text-[var(--muted)]"
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
      new Promise<void>((res) => timers.push(window.setTimeout(() => res(), 2400))),
    ])
    const minShow = new Promise<void>((res) => timers.push(window.setTimeout(() => res(), 950)))
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
          <ZoomWord
            id="alphago"
            word="AlphaGo"
            rest=". The kind of AI we build."
            lead="Solvers, agents, and the math behind every hand."
          />
          <WhatWeDo />
          <ZoomWord
            id="guandan"
            word="GuanDan"
            rest=". Our current project."
            lead="4 players, 2 teams, 108 cards."
          />
          <MLProcess />
          <Events />
          <WorldSection />
          <People />
          <ZoomWord
            id="anyone"
            word="Anyone"
            rest=". Any person, any study."
            lead="Every school, every major, every background."
          />
          <Join />
        </main>
        <Footer />
      </div>
    </div>
  )
}
