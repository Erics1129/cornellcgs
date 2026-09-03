import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import SectionIndex from './SectionIndex'
import GlobeVideo from './GlobeVideo'
import { world } from '../content'
import { prefersReducedMotion } from '../lib/motion'
import { useSectionDepth } from '../lib/reveal'

gsap.registerPlugin(ScrollTrigger)

function renderEmphasis(text: string) {
  const parts = text.split('*')
  return parts.map((p, i) => (i % 2 === 1 ? <em key={i}>{p}</em> : <span key={i}>{p}</span>))
}

/**
 * World (9♠) — the earth IS the page. Arriving at the chapter, the globe is
 * born as a dot in the void and swells until it fills the screen — colossal,
 * a little too big, then settling (巨物对比震惊感). The words wait for the
 * planet to finish arriving, then rise on the left. Replays on every return.
 */
export default function WorldSection() {
  const root = useRef<HTMLElement>(null)
  const fieldRef = useRef<HTMLDivElement>(null)
  const globeWrap = useRef<HTMLDivElement>(null)
  const wordsRef = useRef<HTMLDivElement>(null)
  // Depth rides the inner block; the birth timeline owns wordsRef's y/opacity
  useSectionDepth(root)

  // Pointer parallax lives on the outer field layer — the birth timeline owns
  // globeWrap's clipPath/scale, so the two never share an element. Desktop
  // fine pointers only; transform only. The colossus drifts against the
  // cursor: the viewer moves, not the planet.
  useEffect(() => {
    if (prefersReducedMotion()) return
    if (!window.matchMedia('(pointer: fine)').matches) return
    const section = root.current
    const field = fieldRef.current
    if (!section || !field) return

    const qx = gsap.quickTo(field, 'x', { duration: 1.2, ease: 'power2.out' })
    const qy = gsap.quickTo(field, 'y', { duration: 1.2, ease: 'power2.out' })
    const onMove = (e: PointerEvent) => {
      qx((0.5 - e.clientX / window.innerWidth) * 20)
      qy((0.5 - e.clientY / window.innerHeight) * 20)
    }
    const onLeave = () => {
      qx(0)
      qy(0)
    }
    section.addEventListener('pointermove', onMove)
    section.addEventListener('pointerleave', onLeave)
    return () => {
      section.removeEventListener('pointermove', onMove)
      section.removeEventListener('pointerleave', onLeave)
      gsap.killTweensOf(field)
      gsap.set(field, { clearProps: 'transform' })
    }
  }, [])

  useEffect(() => {
    const section = root.current
    const globe = globeWrap.current
    const words = wordsRef.current
    if (!section || !globe || !words) return

    if (prefersReducedMotion()) return

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ paused: true })
      // A dot in the void…
      tl.set(globe, { clipPath: 'circle(0.8% at 50% 50%)', scale: 1.6, transformOrigin: '50% 50%' })
      tl.set(words, { opacity: 0, y: 28 })
      // …swells into a colossus…
      tl.to(globe, {
        clipPath: 'circle(8% at 50% 50%)',
        scale: 1.5,
        duration: 0.4,
        ease: 'power2.in',
      })
      tl.to(globe, {
        clipPath: 'circle(75% at 50% 50%)',
        scale: 1.08,
        duration: 0.9,
        ease: 'power3.inOut',
      })
      // …and settles, massive and calm. Then the words.
      tl.to(globe, { scale: 1, duration: 0.7, ease: 'power2.out' }, '>-0.1')
      tl.to(words, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, '<')

      ScrollTrigger.create({
        trigger: section,
        start: 'top 55%',
        end: 'bottom 45%',
        onEnter: () => tl.restart(),
        onEnterBack: () => tl.restart(),
        onLeave: () => tl.pause(0),
        onLeaveBack: () => tl.pause(0),
      })
    }, section)

    return () => ctx.revert()
  }, [])

  return (
    <section ref={root} id="world" className="section overflow-clip">
      <SectionIndex rank="9" />

      {/* Space behind the planet while it is still a dot */}
      <div aria-hidden="true" className="absolute inset-0 bg-[#02040d]" />

      {/* Field bleeds 12px past the section so the ±10px parallax never shows the void */}
      <div ref={fieldRef} className="absolute -inset-3 will-change-transform">
        <div ref={globeWrap} className="absolute inset-0 will-change-transform">
          <GlobeVideo />
        </div>
      </div>

      {/* Blend the chapter's edges into the page — no hard seams (交界处) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-[24%] bg-[linear-gradient(to_bottom,var(--bg-top)_0%,color-mix(in_srgb,var(--bg-top)_55%,transparent)_45%,transparent_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-[24%] bg-[linear-gradient(to_top,var(--bg-top)_0%,color-mix(in_srgb,var(--bg-top)_55%,transparent)_45%,transparent_100%)]"
      />

      {/* The words arrive after the planet does */}
      <div ref={wordsRef} className="container-site pointer-events-none relative z-10">
        <div
          data-depth="30"
          className="pointer-events-auto max-w-[34rem] lg:max-w-[40rem]"
          style={{ textShadow: '0 1px 24px rgba(2, 6, 20, 0.85), 0 1px 6px rgba(2, 6, 20, 0.6)' }}
        >
          {/* Depth owns this block's transform; the float rides inside it */}
          <div className="life-float" style={{ ['--life-dur' as string]: '9.5s', ['--life-delay' as string]: '-3.7s' }}>
            <h2 className="h-section mb-6 text-white">{renderEmphasis(world.heading)}</h2>
            <p
              className="life-glow max-w-[40ch] text-[rgba(233,240,255,0.85)]"
              style={{ ['--life-dur' as string]: '5s', ['--life-delay' as string]: '-1.6s' }}
            >
              {world.text}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
