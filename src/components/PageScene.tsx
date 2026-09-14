import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { PAGE_SCENES, sceneFrames } from '../lib/pageScenes'
import type { PageSceneId } from '../lib/pageScenes'

type Playback = 'playing' | 'paused' | 'offscreen' | 'hidden' | 'reduced'

/** No ticking React state, scroll listeners, or work in hidden tabs. */
export function useScenePlayback(ref: RefObject<Element>, paused: boolean): Playback {
  const [visible, setVisible] = useState(false)
  const [hidden, setHidden] = useState(() => document.hidden)
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    const motion = () => setReduced(media.matches)
    const visibility = () => setHidden(document.hidden)
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0 })
    if (ref.current) observer.observe(ref.current)
    media.addEventListener('change', motion)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      observer.disconnect()
      media.removeEventListener('change', motion)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [ref])
  return reduced ? 'reduced' : paused ? 'paused' : hidden ? 'hidden' : visible ? 'playing' : 'offscreen'
}

function SceneMarks({ motif }: { motif: string }) {
  return (
    <svg className={`page-scene__marks page-scene__marks--${motif}`} viewBox="0 0 400 600" fill="none" aria-hidden="true">
      {motif === 'orbit' || motif === 'rings' ? (
        <g className="page-scene__orbit">
          <ellipse cx="200" cy="300" rx="150" ry={motif === 'orbit' ? 66 : 150} />
          <ellipse cx="200" cy="300" rx="180" ry={motif === 'orbit' ? 94 : 180} />
          <circle className="page-scene__bead" cx="350" cy="300" r="3" fill="currentColor" />
        </g>
      ) : motif === 'signal' || motif === 'nodes' ? (
        <>
          <path d="M50 180 160 260 250 190 350 280M50 420 160 340 250 410 350 320M160 260V340M250 190V410" />
          {[0, 1, 2].map(i => <circle key={i} className="page-scene__bead" style={{ '--mark-delay': `${-i * 2}s` } as CSSProperties} cx={100 + i * 100} cy={260 + i * 35} r="3" fill="currentColor" />)}
        </>
      ) : motif === 'grid' ? (
        <g className="page-scene__drift"><path d="M40 440H360M40 480H360M40 520H360M80 410V550M160 410V550M240 410V550M320 410V550" /><circle cx="240" cy="480" r="7" fill="currentColor" /></g>
      ) : motif === 'door' ? (
        <g className="page-scene__drift"><path d="M100 520V110H300V520M120 520V130H280V520" /></g>
      ) : (
        <g className="page-scene__drift"><path d={motif === 'wave' ? 'M-20 410Q80 220 180 410T420 410M-20 440Q80 250 180 440T420 440' : motif === 'weave' ? 'M20 540C360 450 40 150 380 60M20 60C360 150 40 450 380 540' : 'M40 480 200 280 360 480M40 120 200 320 360 120'} /></g>
      )}
    </svg>
  )
}

export default function PageScene({ id, paused, onToggle, className = '' }: {
  id: PageSceneId; paused: boolean; onToggle: () => void; className?: string
}) {
  const ref = useRef<HTMLElement>(null)
  const images = useRef<Array<HTMLImageElement | null>>([])
  const animations = useRef<Animation[]>([])
  const [loaded, setLoaded] = useState<number[]>([])
  const [failed, setFailed] = useState<number[]>([])
  const playback = useScenePlayback(ref, paused)
  const labelId = useId()
  const scene = PAGE_SCENES[id]
  const ready = loaded.length === 3 && failed.length === 0
  const state = failed.length ? 'fallback' : ready ? playback : 'loading'

  useLayoutEffect(() => {
    if (!ready) return
    // Zero stays underneath; one holds while two fades over it, giving
    // an uninterrupted 0 → 1 → 2 → 1 → 0 blend without a blank frame.
    const quarter = scene.duration / 4
    const offsets = [0, quarter - 650, quarter, quarter * 2 - 650, quarter * 2, quarter * 3 - 650, quarter * 3, scene.duration - 650, scene.duration].map(time => time / scene.duration)
    const opacity = [[1, 1, 1, 1, 1, 1, 1, 1, 1], [0, 0, 1, 1, 1, 1, 1, 1, 0], [0, 0, 0, 0, 1, 1, 0, 0, 0]]
    const scale = [1.025, 1.047, 1.065, 1.047, 1.025]
    animations.current = images.current.flatMap((img, index) => {
      if (!img) return []
      const animation = img.animate(scale.map((s, step) => ({
        transform: `translate3d(${[0, -0.5, 0, 0.5, 0][step]}%, ${[0.4, 0, -0.4, 0, 0.4][step]}%, 0) scale(${s})`,
        offset: step / 4, easing: 'ease-in-out',
      })), { duration: scene.duration, iterations: Infinity, fill: 'both' })
      animation.pause()
      if (index === 0) return [animation]
      const blend = img.animate(offsets.map((offset, step) => ({ opacity: opacity[index][step], offset, easing: 'ease-in-out' })), { duration: scene.duration, iterations: Infinity, fill: 'both' })
      blend.pause()
      return [animation, blend]
    })
    return () => { animations.current.forEach(a => a.cancel()); animations.current = [] }
  }, [id, ready, scene.duration])

  useLayoutEffect(() => {
    animations.current.forEach(animation => {
      if (state === 'playing') animation.play()
      else {
        const time = animation.currentTime
        animation.pause()
        if (state === 'reduced') animation.currentTime = 0
        else if (time !== null) animation.currentTime = time
      }
    })
  }, [state, ready])

  const still = playback === 'reduced'
  return (
    <figure ref={ref} className={`page-scene ${className}`} data-scene={id} data-playback={state} aria-labelledby={labelId} style={{ '--scene-position': scene.position } as CSSProperties}>
      <div className="page-scene__window" role="img" aria-label={scene.description}>
        <div className="page-scene__fallback" aria-hidden="true" />
        {sceneFrames(id).map((src, index) => (
          <img key={src} ref={el => { images.current[index] = el }} src={src} alt="" width={id === 'events' ? 1536 : 512} height={id === 'events' ? 342 : 1024} decoding="async" fetchPriority={index === 0 ? 'high' : 'low'}
            className="page-scene__frame" data-frame={index} hidden={failed.includes(index) || (failed.length > 0 && index > 0)}
            onLoad={() => setLoaded(previous => previous.includes(index) ? previous : [...previous, index])}
            onError={() => setFailed(previous => previous.includes(index) ? previous : [...previous, index])} />
        ))}
        <SceneMarks motif={scene.motif} />
      </div>
      <figcaption className="page-scene__caption">
        <span id={labelId}>{scene.label}</span>
        <button type="button" onClick={onToggle} disabled={still} aria-pressed={paused || still} aria-label={still ? 'Scene animation is static' : paused ? 'Resume scene animation' : 'Pause scene animation'}>
          <span aria-hidden="true">{still ? '—' : paused ? '▷' : 'Ⅱ'}</span> {still ? 'Still' : paused ? 'Resume' : 'Pause'}
        </button>
      </figcaption>
    </figure>
  )
}
