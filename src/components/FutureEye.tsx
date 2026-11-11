import { useRef, useState } from 'react'
import { vision } from '../content'
import EyeSequence from './EyeSequence'
import ScrollWords from './ScrollWords'

/** An animated glass eye; its gaze, blink and code reflection begin on arrival.
 * Whether the fixed background layers may draw behind this chapter is the scene
 * manager's call (html[data-bg], from --chapter-opaque), not a class toggled here. */
export default function FutureEye() {
  const root = useRef<HTMLElement>(null)
  const [paused, setPaused] = useState(false)
  return <section ref={root} id="vision" className="vision-chapter" aria-label={vision.title}>
    <div className="container-site vision-heading">
      <p className="scene-eyebrow"><span />Looking ahead</p>
      <h2 className="scene-title"><ScrollWords text={`${vision.title}.`} treatment="illuminate" /></h2>
    </div>
    <div className="vision-eye-stage" data-film-enter="picture">
      <EyeSequence paused={paused} />
      <button type="button" className="vision-pause" aria-label={paused ? 'Resume eye animation' : 'Pause eye animation'} aria-pressed={paused} onClick={() => setPaused(!paused)}><span aria-hidden="true">{paused ? '▷' : 'Ⅱ'}</span>{paused ? 'Resume motion' : 'Pause motion'}</button>
    </div>
    <div className="container-site vision-bottom">
      <p className="vision-note"><em>What we have our eye on</em></p>
      <ul>{vision.next.map((line,i) => <li key={line}><span>{String(i+1).padStart(2,'0')}</span>{line}</li>)}</ul>
    </div>
  </section>
}
