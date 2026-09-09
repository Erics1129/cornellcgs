import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { world } from '../content'
import SceneCanvas from './SceneCanvas'
import ScrollWords from './ScrollWords'

gsap.registerPlugin(ScrollTrigger)

export default function WorldSection() {
  const root = useRef<HTMLElement>(null)
  const words = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = root.current
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = gsap.context(() => {
      gsap.fromTo(words.current, { y: 30, opacity: .5 }, { y: 0, opacity: 1, ease: 'none', scrollTrigger: { trigger: el, start: 'top 60%', end: 'top top', scrub: true } })
    }, el)
    return () => ctx.revert()
  }, [])
  return <section ref={root} id="world" className="scene-chapter scene-chapter--world" aria-label="Our world">
    <div className="scene-stage">
      <SceneCanvas kind="earth" />
      <div className="scene-edge scene-edge--top" />
      <div className="scene-edge scene-edge--bottom" />
      <div className="container-site scene-content">
        <div ref={words} className="scene-copy">
          <p className="scene-eyebrow"><span />A shared world</p>
          <h2 className="scene-title"><ScrollWords text={world.heading} treatment="illuminate" /></h2>
          <p className="scene-lead">{world.text}</p>
          <a className="scene-link" href="/world/">Meet our community <span aria-hidden="true">↗</span></a>
        </div>
      </div>
      <div className="scene-caption"><span>Many perspectives. One table.</span><span>Scroll to orbit</span><span aria-hidden="true">↓</span></div>
    </div>
  </section>
}
