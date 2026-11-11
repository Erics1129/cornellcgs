import { useEffect, useRef, useState } from 'react'
import { deckFrame, onDeck, onMeasure } from '../lib/deck'
import { onLook, look as lookVector } from '../lib/look'
import { RUNWAY_MEDIA } from '../lib/motion'
import { reveal } from '../lib/reveal'
import { registerScene } from '../lib/scenes'
import { createSequence, type Sequence } from '../lib/seqCache'
import { createSodaSound, setSodaMuted, sodaMuted, sodaReady, SODA_READY_EVENT, SODA_SOUND_EVENT } from '../lib/sodaSound'
import { tier, type Tier } from '../lib/tier'
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
 * The words do not depend on the frames: "Drop in." is there from the start of
 * the chapter and the invitation is a latched reveal on the scroll alone.
 *
 * The picture is a scene (lib/scenes.ts): it draws only while the chapter is
 * on screen, owns no frame loop, and keeps only a small window of decoded
 * frames around the playhead (lib/seqCache.ts). A thumbnail atlas of all 96
 * frames gives a picture for any position at once, after a teleport too.
 */
const COUNT = 96
const BASE = `${import.meta.env.BASE_URL}soda/`
const SETS = {
  d: { w: 1280, h: 720, cols: 16, rows: 6 },
  m: { w: 720, h: 1280, cols: 16, rows: 6 },
} as const

export default function SodaSlide() {
  const root = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const invitation = useRef<HTMLParagraphElement>(null)
  // Without motion, or on a screen too short for a sticky stage, the chapter is one still: the last frame and all its words.
  const [still, setStill] = useState(() => typeof window !== 'undefined' && !window.matchMedia(RUNWAY_MEDIA).matches)
  const [muted, setMuted] = useState(() => typeof window !== 'undefined' && sodaMuted())
  // phones only allow sound after a tap (scrolling doesn't count), so until then the button asks for one
  const [ready, setReady] = useState(() => typeof window !== 'undefined' && sodaReady())

  useEffect(() => {
    const media = window.matchMedia(RUNWAY_MEDIA)
    const sync = () => setStill(!media.matches)
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  // fizz, the plop and the trailing air, driven by the same scroll as the film
  useEffect(() => {
    const sound = createSodaSound()
    const feel = () => {
      const s = deckFrame().chapters.find((c) => c.id === 'anyone')
      if (s) sound.update(s.run, s.cover)
    }
    const offDeck = onDeck(feel)
    const onMute = (e: Event) => setMuted(!!(e as CustomEvent<{ muted: boolean }>).detail?.muted)
    const onReady = () => setReady(true)
    window.addEventListener(SODA_SOUND_EVENT, onMute)
    window.addEventListener(SODA_READY_EVENT, onReady)
    feel()
    return () => {
      offDeck()
      window.removeEventListener(SODA_SOUND_EVENT, onMute)
      window.removeEventListener(SODA_READY_EVENT, onReady)
      sound.dispose()
    }
  }, [])

  // The invitation arrives late in the run, as a latched reveal: it finishes by itself when the page stops.
  useEffect(() => {
    const line = invitation.current
    if (!line || still) return
    return reveal((tl) => {
      tl.fromTo(line, { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 1, ease: 'power2.out' })
    }, { id: 'soda-invitation', source: { chapter: 'anyone', key: 'run', from: 0.62, to: 0.74 }, phaseOff: [line] })
  }, [still])

  useEffect(() => {
    const host = stage.current
    const cv = canvas.current
    if (!host || !cv) return
    const ctx = cv.getContext('2d', { alpha: false })
    if (!ctx) return

    let seq: Sequence | null = null
    let set: 'd' | 'm' = 'd'
    let live = false
    let lastKey = ''
    let lastP = 0
    const lookNow = { x: 0, y: 0 }

    const pickSet = (): 'd' | 'm' => {
      const f = deckFrame()
      return f.vhLarge > f.vw * 1.05 ? 'm' : 'd'
    }
    const open = (t: Tier) => {
      const next = pickSet()
      if (seq && next === set) return
      seq?.dispose()
      set = next
      const meta = SETS[set]
      seq = createSequence({
        count: COUNT,
        url: (i) => `${BASE}${set}/${String(i).padStart(3, '0')}.webp`,
        proxy: { url: `${BASE}${set}/proxy.webp`, cols: meta.cols, rows: meta.rows },
        window: t.seqWindow,
        halfRes: t.seqHalfRes,
        frameSize: { w: meta.w, h: meta.h },
        onFrame: () => { lastKey = ''; handle.invalidate() },
      })
    }
    const size = (t: Tier) => {
      const dpr = Math.min(window.devicePixelRatio || 1, t.dprCap)
      let w = Math.round(cv.clientWidth * dpr)
      let h = Math.round(cv.clientHeight * dpr)
      // never more pixels than the frames hold: 720p stretched over 5K is only slower
      const cap = Math.min(1, Math.sqrt((t.pixelCap * t.scale * t.scale) / Math.max(1, w * h)), 1600 / Math.max(w, h))
      w = Math.max(1, Math.round(w * cap))
      h = Math.max(1, Math.round(h * cap))
      if (cv.width !== w || cv.height !== h) {
        cv.width = w
        cv.height = h
        lastKey = ''
      }
    }

    const paint = (image: CanvasImageSource, iw: number, ih: number, alpha: number, sx = 0, sy = 0, sw = iw, sh = ih) => {
      const cw = cv.width
      const ch = cv.height
      // cover, with a little head room for the drift
      const zoom = 1.035
      const s = Math.max(cw / sw, ch / sh) * zoom
      const w = sw * s
      const h = sh * s
      const x = (cw - w) / 2 - lookNow.x * (w - cw) * 0.45
      const y = (ch - h) / 2 - lookNow.y * (h - ch) * 0.45
      ctx.globalAlpha = alpha
      ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h)
    }

    const handle = registerScene({
      id: 'soda',
      chapter: 'anyone',
      host,
      weight: 'heavy',
      clock: 'scroll',
      prepare() {
        const t = tier()
        open(t)
        size(t)
        if (!t.saveData) seq?.load(lastP * (COUNT - 1))
      },
      draw(_now, tick) {
        if (!seq || !cv.width) return false
        const p = still ? 1 : tick.chapter?.vrun ?? 0
        const direction = p >= lastP ? 1 : -1
        lastP = p
        const f = p * (COUNT - 1)
        seq.seek(f, direction, tick.frame.flying && !tick.settle)
        // the picture leans a little toward the pointer (or the finger, or the tilt): time-based easing
        const target = lookVector()
        const k = tick.settle || tick.dt === 0 ? 1 : 1 - Math.exp(-tick.dt / 0.25)
        lookNow.x += (target.x - lookNow.x) * k
        lookNow.y += (target.y - lookNow.y) * k
        const settling = Math.abs(target.x - lookNow.x) + Math.abs(target.y - lookNow.y) > 0.002

        const i0 = Math.min(COUNT - 1, Math.floor(f))
        const i1 = Math.min(COUNT - 1, i0 + 1)
        const a = seq.get(i0)
        const b = seq.get(i1)
        const key = `${Math.round(f * 100)}:${a ? 1 : 0}${b ? 1 : 0}:${lookNow.x.toFixed(3)}:${lookNow.y.toFixed(3)}`
        if (key === lastKey) return settling
        ctx.globalAlpha = 1
        let drawn = true
        if (a && b && i0 !== i1) {
          // both neighbours are sharp: blend them so motion stays fluid between frames
          paint(a, a.width, a.height, 1)
          if (f - i0 > 0.002) paint(b, b.width, b.height, f - i0)
        } else if (a || b) {
          const one = (f - i0 < 0.5 ? a ?? b : b ?? a)!
          paint(one, one.width, one.height, 1)
        } else {
          // nothing sharp yet (a teleport, a fling): the thumbnail of this very frame, now
          const cell = seq.cell(Math.round(f))
          const near = cell ? -1 : seq.nearest(i0, -1) >= 0 ? seq.nearest(i0, -1) : seq.nearest(i1, 1)
          if (cell) paint(cell.image, cell.sw, cell.sh, 1, cell.sx, cell.sy, cell.sw, cell.sh)
          else if (near >= 0) paint(seq.get(near)!, seq.get(near)!.width, seq.get(near)!.height, 1)
          else drawn = false
        }
        ctx.globalAlpha = 1
        if (drawn) {
          lastKey = key
          if (!live) {
            live = true
            handle.ready()
          }
        }
        return settling
      },
      release() {
        seq?.release()
        cv.width = 0
        cv.height = 0
        live = false
        lastKey = ''
      },
      resize(t) {
        open(t)
        size(t)
      },
    })

    const offLook = onLook(() => handle.invalidate())
    const offMeasure = onMeasure(() => {
      if (!cv.width) return
      const t = tier()
      open(t)
      size(t)
      handle.invalidate()
    })
    return () => {
      offLook()
      offMeasure()
      handle.dispose()
      seq?.dispose()
      seq = null
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
      <div ref={stage} className="soda-stage" data-scene-host>
        {/* what shows before the first frame decodes: the stage's own split of dark room and cola */}
        <div className="soda-poster" data-poster aria-hidden="true" />
        <canvas ref={canvas} className="soda-canvas" aria-hidden="true" data-film-enter="picture" />
        <div className="soda-shade" aria-hidden="true" />
        <button
          type="button"
          className={`soda-sound${muted ? ' is-muted' : ''}${!muted && !ready ? ' is-waiting' : ''}`}
          aria-pressed={!muted && ready}
          aria-label={muted ? 'Turn the soda sound on' : ready ? 'Mute the soda sound' : 'Tap to hear the soda sound'}
          onClick={() => {
            // the first tap is the one that wakes the sound, it should never mute it
            if (!ready && !muted) return
            setSodaMuted(!muted)
          }}
        >
          <span className="soda-sound__bars" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="soda-sound__label">{muted ? 'Sound off' : ready ? 'Sound on' : 'Tap for sound'}</span>
        </button>
        <div className="container-site soda-copy">
          <h2 id="together-title" className="anyone-title">Drop in.</h2>
          <p ref={invitation} className="anyone-invitation">We’re gonna have fun at meetings! No experience needed, just drop in like the ice.</p>
        </div>
      </div>
    </section>
  )
}
