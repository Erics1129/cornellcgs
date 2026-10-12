import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { world } from '../content'
import SceneCanvas from './SceneCanvas'
import ScrollWords from './ScrollWords'
import EarthTravel from './EarthTravel'
import { EARTH_PLACES as PLACES } from '../lib/earthJourney'
import '../styles/earth-journey.css'

gsap.registerPlugin(ScrollTrigger)

/** A native sticky chapter. Every pose is a function of the same 0…1 scroll
 * range as SceneCanvas; there are no autoplay clocks or per-frame React renders.
 * Without motion, the same figures become a normal, fully readable photo essay. */
export default function WorldSection() {
  const root = useRef<HTMLElement>(null)
  const trigger = useRef<ScrollTrigger | null>(null)

  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const media = gsap.matchMedia()
    media.add('(prefers-reduced-motion: no-preference)', () => {
      el.dataset.earthMotion = 'scroll'
      const globe = el.querySelector('.earth-globe')
      const intro = el.querySelector('.earth-intro-copy')
      const orbitCaption = el.querySelector('.earth-orbit-caption')
      const figures = Array.from(el.querySelectorAll<HTMLElement>('.earth-place'))
      let active = -2
      const updateAccess = (progress: number) => {
        const introVisible = String(progress < .30)
        if (el.dataset.earthIntro !== introVisible) el.dataset.earthIntro = introVisible
        // Only the foremost photo accepts pointer input. All captions remain
        // in reading/tab order; focusing a credit seeks its corresponding scene.
        let next = -1
        PLACES.forEach((place, i) => { if (progress >= place.start + (place.arrival - place.start) * .55) next = i })
        if (next === active) return
        active = next
        figures.forEach((figure, i) => { figure.dataset.active = String(i === active) })
      }
      const tl = gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: {
        id: 'earth-journey', trigger: el, start: 'top top', end: 'bottom bottom', scrub: true,
        onUpdate: self => updateAccess(self.progress),
        onRefresh: self => updateAccess(self.progress),
      } })
      trigger.current = tl.scrollTrigger ?? null
      tl.to([intro, orbitCaption], { opacity: 0, duration: .10 }, .20)
      PLACES.forEach((place, i) => {
        const figure = figures[i]
        const photo = figure.querySelector('img')
        const caption = figure.querySelector('figcaption')
        const next = PLACES[i + 1]
        const end = next?.arrival ?? 1
        // The GPU compositor supplies motion blur; these layers are also a
        // complete image fallback when graphics or a texture cannot load.
        tl.fromTo(figure, { opacity: 0 }, { opacity: 1, duration: place.arrival - place.start, ease: 'sine.inOut' }, place.start)
          .fromTo(photo, { scale: 1.04 }, { scale: 1.11, duration: end - place.start, force3D: true }, place.start)
        if (!caption) return
        tl.fromTo(caption, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: Math.min(.024, (place.stop - place.arrival) * .7) }, place.arrival)
        if (next) tl.to(caption, { opacity: 0, duration: Math.min(.014, next.arrival - next.start) }, next.start - .008)
      })
      // Normalize the common scroll clock even if the last caption ends early.
      tl.to({}, { duration: .001 }, .999)
      // Once photographs cover the globe, removing its box also lets the
      // renderer's IntersectionObserver suspend WebGL. This reverses on scroll.
      tl.set(globe, { display: 'none' }, .375)
      updateAccess(tl.scrollTrigger?.progress ?? 0)
      return () => {
        trigger.current = null
        delete el.dataset.earthMotion
        delete el.dataset.earthIntro
        figures.forEach(figure => { delete figure.dataset.active })
      }
    }, el)
    return () => media.revert()
  }, [])

  const revealFocusedScene = (progress: number) => {
    const st = trigger.current
    if (!st || Math.abs(st.progress - progress) < .002) return
    // A keyboard reader can tab through the credits without encountering an
    // invisible focused link or having to scroll the entire sticky distance.
    window.scrollTo({ top: st.start + (st.end - st.start) * progress, behavior: 'instant' })
    ScrollTrigger.update()
  }

  return <section ref={root} id="world" className="scene-chapter scene-chapter--world earth-journey" aria-label="Our world">
    <div className="scene-stage earth-journey-stage">
      <div className="earth-intro">
        <div className="earth-globe"><SceneCanvas kind="earth" /></div>
        <div className="scene-edge scene-edge--top" />
        <div className="scene-edge scene-edge--bottom" />
        <div className="container-site scene-content earth-intro-copy" onFocusCapture={() => revealFocusedScene(.12)}>
          <div className="scene-copy">
            <p className="scene-eyebrow"><span />Where we’re from</p>
            <h2 className="scene-title"><ScrollWords text={world.heading} treatment="illuminate" /></h2>
            <p className="scene-lead">{world.text}</p>
            <a className="scene-link" href="/world/">More about our members <span aria-hidden="true">↗</span></a>
          </div>
        </div>
        <div className="scene-caption earth-orbit-caption" onFocusCapture={() => revealFocusedScene(.12)}>
          <span><a className="earth-map-credit" href="https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/" target="_blank" rel="noopener noreferrer">Earth imagery: NASA Earth Observatory</a></span>
          <span>Scroll to orbit</span><span aria-hidden="true">↓</span>
        </div>
      </div>
      <EarthTravel />
      <div className="earth-travel-shade" aria-hidden="true" />
      {/* The stops on the way are photos alone. The last stop names the
          destination and carries every photo credit the licenses ask for. */}
      {PLACES.map((place, i) => <figure key={place.id} className={`earth-place earth-place--${place.id}`} data-earth-place={place.id}
        onFocusCapture={() => revealFocusedScene(place.stop)}>
        <img className="earth-photo" src={`/assets/earth-journey/${place.image}`} alt={place.alt}
          width={place.width} height={place.height} loading="lazy" decoding="async" draggable={false} />
        {i === PLACES.length - 1 && <figcaption>
          {place.name && <div className="earth-place-copy"><h3>{place.name}</h3><p>{place.caption}</p></div>}
          <p className="earth-photo-credit earth-photo-credit--all">
            <span>Photos: </span>
            {PLACES.map((credit, j) => <span key={credit.id} className="earth-credit">
              {j > 0 && <span aria-hidden="true"> · </span>}
              <a href={credit.source} target="_blank" rel="noopener noreferrer"
                title="Original photograph. Resized, WebP encoded, cropped and color graded for display; scroll animation adds motion blur.">{credit.photographer}</a>
              {credit.licenseUrl
                ? <>{' ('}<a href={credit.licenseUrl} target="_blank" rel="noopener noreferrer">{credit.license}</a>{')'}</>
                : ` (${credit.license.toLowerCase()})`}
            </span>)}
          </p>
        </figcaption>}
      </figure>)}
    </div>
  </section>
}
