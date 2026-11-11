import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { vision } from '../content'
import ScrollWords from './ScrollWords'

/** The eye's WebGL code (about 17 kB) is fetched when the chapter is within
 * three viewports, not with the first view. Until it arrives the stage holds
 * an empty box of the same class (its CSS ground is the poster colour). */
const EyeSequence = lazy(() => import('./EyeSequence'))

/** An animated glass eye; its gaze, blink and code reflection begin on arrival.
 * Whether the fixed background layers may draw behind this chapter is the scene
 * manager's call (html[data-bg], from --chapter-opaque), not a class toggled here. */
export default function FutureEye() {
  const root = useRef<HTMLElement>(null)
  const [paused, setPaused] = useState(false)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = root.current
    if (!el || typeof IntersectionObserver === 'undefined') { setNear(true); return }
    const io = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setNear(true); io.disconnect() } }, { rootMargin: '300% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const shell = <div className="scene-canvas scene-canvas--eye eye-sequence" aria-hidden="true" />
  return <section ref={root} id="vision" className="vision-chapter" aria-label={vision.title}>
    <div className="container-site vision-heading">
      <p className="scene-eyebrow"><span />Looking ahead</p>
      <h2 className="scene-title"><ScrollWords text={`${vision.title}.`} treatment="illuminate" /></h2>
    </div>
    <div className="vision-eye-stage" data-film-enter="picture">
      {near ? <Suspense fallback={shell}><EyeSequence paused={paused} /></Suspense> : shell}
      <button type="button" className="vision-pause" aria-label={paused ? 'Resume eye animation' : 'Pause eye animation'} aria-pressed={paused} onClick={() => setPaused(!paused)}><span aria-hidden="true">{paused ? '▷' : 'Ⅱ'}</span>{paused ? 'Resume motion' : 'Pause motion'}</button>
    </div>
    <div className="container-site vision-bottom">
      <p className="vision-note"><em>What we have our eye on</em></p>
      <ul>{vision.next.map((line,i) => <li key={line}><span>{String(i+1).padStart(2,'0')}</span>{line}</li>)}</ul>
    </div>
  </section>
}
