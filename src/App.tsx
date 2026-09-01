import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import './lib/eases'
import { initSmoothScroll } from './lib/scroll'
import { useNeonEdges } from './lib/neon'
import { SHAKE_EVENT, prefersReducedMotion } from './lib/motion'
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
import SubPage from './components/SubPage'

/** Quick riffle of three cards, under 900 ms, then the hero (§6). */
function Loader({ done }: { done: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-[var(--bg-top)] transition-opacity duration-300 ${
        done ? 'pointer-events-none opacity-0' : 'opacity-100'
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
    </div>
  )
}

export default function App() {
  const shakeRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<HTMLDivElement>(null)
  const [loaded, setLoaded] = useState(false)

  useNeonEdges(appRef)

  useEffect(() => {
    const cleanup = initSmoothScroll()
    const t = window.setTimeout(() => setLoaded(true), 850)
    return () => {
      cleanup()
      window.clearTimeout(t)
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
      <SubPage />
      {/* Cinematic grain over the whole world; sits under the loader only */}
      <div aria-hidden="true" className="film-grain z-[80]" />
      <div ref={shakeRef} className="relative z-10">
        <main>
          <Hero />
          <WhoWeAre />
          <WhatWeDo />
          <MLProcess />
          <Events />
          <WorldSection />
          <People />
          <Join />
        </main>
        <Footer />
      </div>
    </div>
  )
}
