import { useEffect, useRef, useState } from 'react'
import { vision } from '../content'
import SceneCanvas from './SceneCanvas'

/** Photographic iris + corneal code reflection, with pointer gaze and natural blinks. */
export default function FutureEye() {
  const root = useRef<HTMLElement>(null)
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    const el = root.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => {
      document.documentElement.classList.toggle('eye-on', entry.isIntersecting)
    }, { threshold: .05 })
    io.observe(el)
    return () => { io.disconnect(); document.documentElement.classList.remove('eye-on') }
  }, [])
  return <section ref={root} id="vision" className="vision-chapter" aria-label={vision.title}>
    <div className="container-site vision-heading">
      <p className="scene-eyebrow"><span />The next move</p>
      <h2 className="scene-title">{vision.title}<span className="vision-period">.</span></h2>
    </div>
    <div className="vision-eye-stage">
      <SceneCanvas kind="eye" focused={focused} />
      <button type="button" className="vision-focus" aria-pressed={focused} onClick={() => setFocused(!focused)}>{focused ? 'Full view' : 'Look closer'} <span aria-hidden="true">{focused ? '−' : '+'}</span></button>
    </div>
    <div className="container-site vision-bottom">
      <p className="vision-note">Human curiosity.<br /><em>Machine possibility.</em></p>
      <ul>{vision.next.map((line,i) => <li key={line}><span>{String(i+1).padStart(2,'0')}</span>{line}</li>)}</ul>
    </div>
  </section>
}
