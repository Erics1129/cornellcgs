import { useEffect, useRef, useState } from 'react'
import { isTouchDevice, prefersReducedMotion } from '../lib/motion'
import type { SodaHandle } from '../effects/soda/sodaScene'
import '../styles/soda.css'

/**
 * Ice in soda. The section is three screens tall and its stage sticks to the
 * viewport, so scrolling through it scrubs the scene: the cube falls, splashes,
 * plunges and floats back up, and the camera sinks into the drink. Scroll back
 * and it all plays in reverse. Three.js only loads when the section is near.
 */
export default function SodaSlide() {
  const root = useRef<HTMLElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const copy = useRef<HTMLDivElement>(null)
  const [still] = useState(() => typeof window !== 'undefined' && prefersReducedMotion())
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const section = root.current
    const cv = canvas.current
    if (!section || !cv) return
    let scene: SodaHandle | null = null
    let raf = 0
    let inView = false
    let disposed = false
    let loading = false

    const progress = () => {
      if (still) return 1
      const rect = section.getBoundingClientRect()
      const run = section.offsetHeight - window.innerHeight
      return run > 0 ? Math.min(1, Math.max(0, -rect.top / run)) : 0
    }

    const tick = (now: number) => {
      raf = 0
      if (!scene || disposed) return
      const p = progress()
      scene.setProgress(p, still)
      if (copy.current) {
        const show = Math.min(1, Math.max(0, (p - 0.8) / 0.14))
        copy.current.style.opacity = String(show)
        copy.current.style.transform = `translate3d(0, ${(1 - show) * 24}px, 0)`
      }
      scene.frame(now)
      if (inView && !still && !document.hidden) raf = requestAnimationFrame(tick)
    }
    const run = () => {
      if (!raf && scene) raf = requestAnimationFrame(tick)
    }

    const load = async () => {
      if (loading || scene) return
      loading = true
      try {
        const mod = await import('../effects/soda/sodaScene')
        if (disposed) return
        scene = mod.createSodaScene(cv, { mobile: isTouchDevice() || window.innerWidth < 768 })
        section.classList.add('is-live')
        run()
      } catch {
        setFailed(true)
      }
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          inView = e.isIntersecting
          if (inView) {
            load()
            run()
          }
        }
      },
      { rootMargin: '60% 0px 60% 0px' },
    )
    io.observe(section)

    const onResize = () => {
      scene?.resize()
      run()
    }
    const onMove = (e: PointerEvent) => {
      if (!scene || e.pointerType !== 'mouse') return
      scene.setLook((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1)
    }
    const onVis = () => run()
    window.addEventListener('resize', onResize)
    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('visibilitychange', onVis)
    return () => {
      disposed = true
      io.disconnect()
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('visibilitychange', onVis)
      scene?.dispose()
    }
  }, [still])

  return (
    <section
      ref={root}
      id="anyone"
      className={`section support-scene soda-scene${still ? ' is-still' : ''}${failed ? ' is-flat' : ''}`}
      data-chapter-surface="dark"
      aria-labelledby="together-title"
    >
      <div className="soda-stage">
        <canvas ref={canvas} className="soda-canvas" aria-hidden="true" />
        <div ref={copy} className="container-site soda-copy">
          <h2 id="together-title" className="anyone-title">Any major.</h2>
          <p className="anyone-invitation">You don’t need experience. You need to be curious why the bot folded.</p>
        </div>
      </div>
    </section>
  )
}
