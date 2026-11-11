import { useEffect, useRef } from 'react'
import { registerScene, type SceneHandle } from '../lib/scenes'
import { deckFrame, drive, setRestGaps } from '../lib/deck'
import { onReducedMotionChange, prefersReducedMotion } from '../lib/motion'
import type { UniversePicture } from '../effects/universeScene'
import '../styles/universe.css'

/** Guandan: two decks, four players, and far more possible deals (over 10⁴⁵) than stars in the observable universe (about 10²²–10²⁴) */
const PHASES = ['Two decks', 'Four players', 'More deals than stars']
/**
 * One title is always complete at rest. Titles swap inside two short windows
 * of the run; both windows are rest gaps, so a reader who stops inside one
 * settles on the nearer finished title (the picture follows the same number).
 */
const SWAPS: [number, number][] = [[0.30, 0.36], [0.66, 0.72]]
const POSTERS = [0, 1, 2].map((leg) => `/assets/film/posters/universe-${leg}.webp`)

const clamp = (v: number) => Math.max(0, Math.min(1, v))
const smooth = (a: number, b: number, value: number) => {
  const p = clamp((value - a) / (b - a))
  return p * p * (3 - 2 * p)
}
const legOf = (p: number) => (p < 0.33 ? 0 : p < 0.69 ? 1 : 2)

/** Sticky travel through deep space. A scene of the manager: it owns no frame loop, observer or scroll trigger. */
export default function UniverseJourney() {
  const root = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const cue = useRef<HTMLParagraphElement>(null)
  const track = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const section = root.current!, viewport = stage.current!, surface = canvas.current!
    const phases = Array.from(section.querySelectorAll<HTMLElement>('[data-universe-phase]')).map((phase) => ({
      phase, words: Array.from(phase.querySelectorAll<HTMLElement>('[data-phase-word]')),
    }))

    /* ---- Copy: a pure function of progress, independent of WebGL ---- */
    const paintCopy = (p: number, still = false) => {
      phases.forEach(({ phase, words }, i) => {
        const start = i === 0 ? -1 : SWAPS[i - 1][0] + 0.03
        const out = i === 2 ? 1 : 1 - smooth(SWAPS[i][0], SWAPS[i][0] + 0.03, p)
        const shown = still ? Number(i === 2) : out * (i === 0 ? 1 : smooth(start, start + 0.03, p))
        phase.style.opacity = shown.toFixed(3)
        if (shown < 0.01) phase.dataset.phase = 'off'
        else delete phase.dataset.phase
        const step = 0.003, span = 0.03 - step * (words.length - 1)
        words.forEach((word, j) => {
          const reveal = still || i === 0 ? 1 : smooth(start + j * step, start + j * step + span, p)
          word.style.transform = reveal >= 1 ? '' : `translateY(${((1 - reveal) * 105).toFixed(2)}%)`
        })
      })
      cue.current!.style.opacity = String(still ? 0 : 1 - smooth(0.025, 0.1, p))
      track.current!.style.transform = `scaleX(${still ? 1 : p})`
      const leg = still ? 2 : legOf(p)
      section.dataset.leg = String(leg)
      if (import.meta.env.DEV) { section.dataset.progress = p.toFixed(5); section.dataset.phase = PHASES[leg] }
    }

    let unmount = () => {}
    const mount = (reduced: boolean) => {
      if (reduced) {
        section.dataset.renderer = 'reduced'
        paintCopy(1, true)
        return () => {}
      }
      section.dataset.renderer = 'pending'
      setRestGaps('universe', SWAPS)
      const offCopy = drive('universe', (p) => paintCopy(p))

      /* ---- Picture: registered with the scene manager now, its WebGL code loaded when the manager prepares it ---- */
      let disposed = false
      let picture: UniversePicture | null = null
      let loading: Promise<void> | null = null
      let handle: SceneHandle | null = null
      const unavailable = () => {
        // WebGL2 is not available: the reduced-motion still (poster, final title, no runway)
        section.dataset.renderer = 'fallback'
        offCopy()
        paintCopy(1, true)
      }
      handle = registerScene({
        id: 'universe',
        chapter: 'universe',
        host: viewport,
        weight: 'heavy',
        clock: 'time',
        prepare() {
          if (disposed) return
          if (picture) return picture.prepare()
          return (loading ??= import('../effects/universeScene').then((m) => {
            if (disposed) return
            picture = m.createUniverse({ section, viewport, surface, handle: () => handle, unavailable })
            return picture.prepare()
          }).catch(() => { loading = null }))
        },
        draw: (now, tick) => (picture ? picture.draw(now, tick) : false),
        release: () => picture?.release(),
        resize: (t) => picture?.resize(t),
      })
      paintCopy(deckFrame().chapters.find((c) => c.id === 'universe')?.vrun ?? 0)

      if (import.meta.env.DEV) {
        // scripts/cinema/universe-posters.mjs uses this to export one poster per leg from the real shader.
        const w = window as unknown as { __filmShots?: Record<string, unknown> }
        w.__filmShots = { ...w.__filmShots, universe: (p: number, type?: string, quality?: number) => picture?.capture(p, type, quality) ?? null, universeReady: () => !!picture?.ready() }
      }

      return () => {
        disposed = true
        offCopy()
        handle?.dispose(); handle = null
        picture?.dispose(); picture = null
        setRestGaps('universe', [])
      }
    }

    unmount = mount(prefersReducedMotion())
    const offReduced = onReducedMotionChange((reduced) => { unmount(); unmount = mount(reduced) })
    return () => { offReduced(); unmount() }
  }, [])

  return (
    <section ref={root} id="universe" className="universe-journey" data-renderer="pending" data-leg="0" aria-label="Guandan: two decks, four players, more deals than stars.">
      <div ref={stage} className="universe-viewport" data-scene-host>
        {/* The poster: one still per leg, exported from the shader itself, over a CSS sky. Never a bare black stage. */}
        <div className="universe-fallback" data-poster aria-hidden="true">
          <div className="universe-fallback-halo" />
          {POSTERS.map((src, leg) => <img key={src} className={`universe-poster universe-poster-${leg}`} src={src} alt="" width="1280" height="800" loading="lazy" decoding="async" onError={(event) => { event.currentTarget.style.visibility = 'hidden' }} />)}
        </div>
        <div className="universe-plate" data-film-enter>
          <canvas ref={canvas} className="universe-canvas" data-scene="universe" aria-hidden="true" />
        </div>
        <div className="universe-edges" aria-hidden="true" />
        <div className="universe-heading container-site">
          <h2 aria-label="Two decks. Four players. More deals than stars.">
            {PHASES.map((label, i) => <span key={i} data-universe-phase className={`universe-phase universe-phase-${i}`} aria-hidden="true">
              {label.split(' ').map((word, j, all) => <span key={word} className="universe-phase-mask"><span data-phase-word>{word}{j < all.length - 1 ? ' ' : ''}</span></span>)}
            </span>)}
          </h2>
        </div>
        <div className="universe-footer container-site">
          <p ref={cue} className="universe-cue">Keep scrolling <span aria-hidden="true">↓</span></p>
          <div className="universe-itinerary" aria-hidden="true">
            <span className="universe-stop universe-stop-0">01</span>
            <div className="universe-track"><div ref={track} /></div>
            <span className="universe-stop universe-stop-1">02</span>
            <span className="universe-stop universe-stop-2">03</span>
          </div>
        </div>
      </div>
    </section>
  )
}
