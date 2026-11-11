import { useEffect, useRef } from 'react'
import { RUNWAY_MEDIA } from '../lib/motion'
import { registerScene } from '../lib/scenes'
import { tier } from '../lib/tier'

type FrameVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number
  fastSeek?: (time: number) => void
}

/**
 * A film whose only clock is the scroll.
 *
 * It is a scene (lib/scenes.ts): it draws only while its chapter is on screen
 * and has no frame loop, observer or scroll trigger of its own.
 *
 * Under the video sits a ladder of stills taken from the film itself; the two
 * nearest the playhead are crossfaded. The stills ARE the picture whenever the
 * video is not exactly there: before it loads, right after a teleport, while
 * a seek is in flight, and for the whole visit where a phone refuses to start
 * a video (Low Power Mode, data saver). The video is shown only while its
 * frame is within a quarter second of where the scroll says it should be.
 */
export default function ScrollFilm({ src, srcSmall, poster, stills = [] }: {
  src: string
  /** a lighter encode for phones */
  srcSmall?: string
  /** the designed still for reduced motion and the first paint */
  poster: string
  /** evenly spaced frames of the film, first to last */
  stills?: string[]
}) {
  const root = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const host = root.current!
    const film = video.current as FrameVideo
    const layers = Array.from(host.querySelectorAll<HTMLImageElement>('[data-still]'))
    const base = host.querySelector<HTMLImageElement>('[data-still-base]')!
    const motion = matchMedia(RUNWAY_MEDIA)
    let alive = true
    let attached = false
    let loaded = false
    let refused = false
    let live = false
    let target = 0
    let lastSeekAt = 0
    let shownStill = ''

    const duration = () => (Number.isFinite(film.duration) && film.duration > 0 ? film.duration : 8)
    const setLive = (on: boolean) => {
      if (on === live) return
      live = on
      if (on) handle.ready()
      else handle.lost()
    }
    // What is on screen is close enough to the target: show the video. Otherwise the stills.
    const judge = (time: number) => setLive(loaded && !refused && Math.abs(time - target) <= 0.25)

    const ladder = (p: number) => {
      if (!layers.length) return
      const at = p * (layers.length - 1)
      const lo = Math.floor(at)
      const hi = Math.min(layers.length - 1, lo + 1)
      const mix = at - lo
      const key = `${lo}:${mix.toFixed(2)}`
      if (key === shownStill) return
      shownStill = key
      layers.forEach((img, i) => {
        // the lower still stays opaque under the upper one, so the pair never dips darker in between
        const o = i === lo ? '1' : i === hi ? mix.toFixed(3) : '0'
        if (img.style.opacity !== o) img.style.opacity = o
      })
    }

    const seek = (exact: boolean, flying: boolean) => {
      if (!loaded || refused || film.seeking) return
      if (Math.abs(film.currentTime - target) <= 1 / 60) return
      const now = performance.now()
      // never queue seeks: one at a time, the newest target wins
      if (!exact && now - lastSeekAt < 30) return
      lastSeekAt = now
      if (flying && !exact && film.fastSeek) film.fastSeek(target)
      else film.currentTime = target
    }

    const attach = () => {
      if (attached || refused || !motion.matches) return
      const t = tier()
      if (t.saveData) return
      attached = true
      film.preload = 'auto'
      film.src = srcSmall && (t.name === 'phone' || t.name === 'low') ? srcSmall : src
      film.load()
      // iOS does not decode a frame until playback has started once: prime it, muted, and pause at once.
      const primed = film.play()
      if (primed) {
        primed.then(() => film.pause()).catch((error: unknown) => {
          // Playback is not allowed here (Low Power Mode, data saver): the stills are the film for this visit.
          if ((error as { name?: string })?.name === 'NotAllowedError') {
            refused = true
            setLive(false)
          }
        })
      }
    }
    const detach = () => {
      if (!attached) return
      attached = false
      loaded = false
      film.removeAttribute('src')
      film.load()
    }

    const handle = registerScene({
      id: 'ml-film',
      chapter: 'ml-process',
      host,
      weight: 'light',
      clock: 'scroll',
      prepare() {
        // The stills are cheap and are the poster: ask for them first. The designed still is only
        // fetched where it is shown (no motion, or no ladder): it is not part of the first view's bytes.
        if (motion.matches && layers.length) {
          for (const img of layers) if (!img.src && img.dataset.src) img.src = img.dataset.src
        } else if (!base.src && base.dataset.src) base.src = base.dataset.src
        attach()
      },
      draw(_now, tick) {
        if (!motion.matches) {
          // no motion: the designed still alone
          if (shownStill !== 'still') {
            shownStill = 'still'
            for (const img of layers) img.style.opacity = '0'
          }
          return false
        }
        const p = tick.chapter?.vrun ?? 0
        ladder(p)
        target = Math.max(0, duration() - 0.05) * p
        judge(film.currentTime)
        seek(tick.settle, tick.frame.flying)
        return false
      },
      release() {
        detach()
        live = false
      },
    })

    const onLoaded = () => {
      loaded = true
      handle.invalidate()
    }
    const onSeeked = () => {
      // The decoded frame is presented a moment after `seeked`: ask the compositor when it is really there.
      if (film.requestVideoFrameCallback) film.requestVideoFrameCallback((_n, meta) => { if (alive) { judge(meta.mediaTime); handle.invalidate() } })
      else {
        judge(film.currentTime)
        handle.invalidate()
      }
    }
    const onError = () => {
      loaded = false
      setLive(false)
    }
    const stopPlay = () => { if (loaded) film.pause() }
    const onMotion = () => {
      if (!motion.matches) {
        detach()
        setLive(false)
        if (!base.src && base.dataset.src) base.src = base.dataset.src
      } else {
        for (const img of layers) if (!img.src && img.dataset.src) img.src = img.dataset.src
        attach()
      }
      handle.invalidate()
    }
    film.addEventListener('loadeddata', onLoaded)
    film.addEventListener('seeked', onSeeked)
    film.addEventListener('error', onError)
    film.addEventListener('playing', stopPlay)
    motion.addEventListener('change', onMotion)
    return () => {
      alive = false
      handle.dispose()
      film.removeEventListener('loadeddata', onLoaded)
      film.removeEventListener('seeked', onSeeked)
      film.removeEventListener('error', onError)
      film.removeEventListener('playing', stopPlay)
      motion.removeEventListener('change', onMotion)
      detach()
    }
  }, [src, srcSmall])

  return (
    <div ref={root} className="scroll-film" aria-hidden="true" data-scene-host data-film-enter="picture">
      <div className="scroll-film-stills" data-poster>
        <img data-still-base data-src={poster} alt="" decoding="async" />
        {stills.map((still) => <img key={still} data-still data-src={still} alt="" decoding="async" style={{ opacity: 0 }} />)}
      </div>
      <video ref={video} muted playsInline preload="none" disablePictureInPicture tabIndex={-1} />
    </div>
  )
}
