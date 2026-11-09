import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '../lib/motion'
import { createSodaSound, setSodaMuted, sodaMuted, SODA_SOUND_EVENT } from '../lib/sodaSound'
import '../styles/soda.css'

/**
 * Ice in soda, as a film you scroll. The drop was ray traced offline, frame by
 * frame, with real refraction (cola 1.34, ice 1.31), absorption, a cloudy ice
 * core, motion blur and depth of field. The section is three screens tall and
 * its stage sticks to the viewport, so the scroll position picks the frame:
 * the cube falls, throws a crown, plunges trailing air and floats back up.
 * Scroll back and it all plays in reverse. Neighbouring frames are blended so
 * the motion stays fluid between them.
 *
 * Frames load only when the section is near, coarse ones first so scrubbing
 * works at once, then the in betweens fill in.
 */
const COUNT = 96
const BASE = `${import.meta.env.BASE_URL}soda/`

export default function SodaSlide() {
  const root = useRef<HTMLElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const copy = useRef<HTMLDivElement>(null)
  const [still] = useState(() => typeof window !== 'undefined' && prefersReducedMotion())
  const [muted, setMuted] = useState(() => typeof window !== 'undefined' && sodaMuted())

  // fizz, the plop and the trailing air, driven by the same scroll as the film
  useEffect(() => {
    const section = root.current
    if (!section) return
    const sound = createSodaSound()
    let raf = 0
    const feel = () => {
      raf = 0
      const rect = section.getBoundingClientRect()
      const vh = window.innerHeight
      const run = section.offsetHeight - vh
      const p = run > 0 ? Math.min(1, Math.max(0, -rect.top / run)) : 0
      const vis = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0)) / vh
      sound.update(p, vis)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(feel)
    }
    const onMute = (e: Event) => setMuted(!!(e as CustomEvent<{ muted: boolean }>).detail?.muted)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener(SODA_SOUND_EVENT, onMute)
    feel()
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener(SODA_SOUND_EVENT, onMute)
      sound.dispose()
    }
  }, [])

  useEffect(() => {
    const section = root.current
    const cv = canvas.current
    if (!section || !cv) return
    const ctx = cv.getContext('2d', { alpha: false })
    if (!ctx) return

    let set: 'd' | 'm' = 'd'
    const frames: (HTMLImageElement | null)[] = new Array(COUNT).fill(null)
    let started = false
    let disposed = false
    let raf = 0
    let inView = false
    let shown = -1
    let look = { x: 0, y: 0 }
    const lookNow = { x: 0, y: 0 }

    const pickSet = () => (window.innerHeight > window.innerWidth * 1.05 ? 'm' : 'd')

    const progress = () => {
      if (still) return 1
      const rect = section.getBoundingClientRect()
      const run = section.offsetHeight - window.innerHeight
      return run > 0 ? Math.min(1, Math.max(0, -rect.top / run)) : 0
    }

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.round(cv.clientWidth * dpr)
      const h = Math.round(cv.clientHeight * dpr)
      if (cv.width !== w || cv.height !== h) {
        cv.width = w
        cv.height = h
        shown = -1
      }
    }

    // nearest loaded frame at or below / above an index
    const near = (i: number, dir: 1 | -1) => {
      for (let k = i; k >= 0 && k < COUNT; k += dir) if (frames[k]) return k
      return -1
    }

    const draw = (img: HTMLImageElement, alpha: number) => {
      const cw = cv.width
      const ch = cv.height
      // cover, with a little head room for the pointer drift
      const zoom = 1.035
      const s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight) * zoom
      const w = img.naturalWidth * s
      const h = img.naturalHeight * s
      const x = (cw - w) / 2 - lookNow.x * (w - cw) * 0.45
      const y = (ch - h) / 2 - lookNow.y * (h - ch) * 0.45
      ctx.globalAlpha = alpha
      ctx.drawImage(img, x, y, w, h)
    }

    const render = () => {
      const p = progress()
      const f = p * (COUNT - 1)
      const i0 = Math.floor(f)
      const a = near(i0, -1)
      const b = near(Math.min(COUNT - 1, i0 + 1), 1)
      const key = Math.round(f * 100) + lookNow.x * 1e5 + lookNow.y * 1e7
      if (a < 0 && b < 0) return
      if (key === shown) return
      shown = key
      ctx.globalAlpha = 1
      if (a >= 0 && b >= 0 && a !== b) {
        const span = b - a
        const mixT = (f - a) / span
        draw(frames[a]!, 1)
        if (mixT > 0.002) draw(frames[b]!, mixT)
      } else {
        draw(frames[a >= 0 ? a : b]!, 1)
      }
      ctx.globalAlpha = 1
      if (copy.current) {
        const show = Math.min(1, Math.max(0, (p - 0.82) / 0.12))
        copy.current.style.opacity = String(show)
        copy.current.style.transform = `translate3d(0, ${(1 - show) * 28}px, 0)`
      }
    }

    const tick = () => {
      raf = 0
      if (disposed) return
      lookNow.x += (look.x - lookNow.x) * 0.06
      lookNow.y += (look.y - lookNow.y) * 0.06
      render()
      const settling = Math.abs(look.x - lookNow.x) + Math.abs(look.y - lookNow.y) > 0.001
      if (inView && !document.hidden && (settling || !still)) raf = requestAnimationFrame(tick)
    }
    const kick = () => {
      if (!raf && !disposed) raf = requestAnimationFrame(tick)
    }

    const loadOne = (i: number) =>
      new Promise<void>((res) => {
        if (frames[i] || disposed) return res()
        const img = new Image()
        img.decoding = 'async'
        img.src = `${BASE}${set}/${String(i).padStart(3, '0')}.webp`
        img
          .decode()
          .then(() => {
            if (disposed) return
            frames[i] = img
            shown = -1
            section.classList.add('is-live')
            kick()
          })
          .catch(() => {})
          .finally(res)
      })

    const load = async () => {
      if (started) return
      started = true
      set = pickSet()
      section.classList.add('is-loading')
      if (still) {
        await loadOne(COUNT - 1)
      } else {
        // the frame under the scroll position first, then a coarse pass, then the rest
        const at = Math.round(progress() * (COUNT - 1))
        await loadOne(at)
        const order: number[] = []
        for (const step of [16, 8, 4, 2, 1]) for (let i = 0; i < COUNT; i += step) if (!order.includes(i)) order.push(i)
        order.push(COUNT - 1)
        let next = 0
        const worker = async () => {
          while (next < order.length && !disposed) await loadOne(order[next++])
        }
        await Promise.all([worker(), worker(), worker(), worker()])
      }
      if (!disposed) section.classList.remove('is-loading')
    }

    size()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          inView = e.isIntersecting
          if (inView) {
            load()
            kick()
          }
        }
      },
      { rootMargin: '120% 0px 120% 0px' },
    )
    io.observe(section)

    const onResize = () => {
      size()
      kick()
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      look = { x: (e.clientX / window.innerWidth) * 2 - 1, y: (e.clientY / window.innerHeight) * 2 - 1 }
      if (inView) kick()
    }
    const onVis = () => kick()
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
    }
  }, [still])

  return (
    <section
      ref={root}
      id="anyone"
      className={`section support-scene soda-scene${still ? ' is-still' : ''}`}
      data-chapter-surface="dark"
      aria-labelledby="together-title"
    >
      <div className="soda-stage">
        <canvas ref={canvas} className="soda-canvas" aria-hidden="true" />
        <div className="soda-shade" aria-hidden="true" />
        <button
          type="button"
          className={`soda-sound${muted ? ' is-muted' : ''}`}
          aria-pressed={!muted}
          aria-label={muted ? 'Turn the soda sound on' : 'Mute the soda sound'}
          onClick={() => setSodaMuted(!muted)}
        >
          <span className="soda-sound__bars" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="soda-sound__label">{muted ? 'Sound off' : 'Sound on'}</span>
        </button>
        <div ref={copy} className="container-site soda-copy">
          <h2 id="together-title" className="anyone-title">Any major.</h2>
          <p className="anyone-invitation">You don’t need experience. You need to be curious why the bot folded.</p>
        </div>
      </div>
    </section>
  )
}
