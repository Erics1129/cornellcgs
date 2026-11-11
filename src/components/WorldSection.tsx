import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { world } from '../content'
import SceneCanvas from './SceneCanvas'
import ScrollWords from './ScrollWords'
import EarthTravel from './EarthTravel'
import { EARTH_INTRO, EARTH_PLACES as PLACES, EARTH_REST_GAPS } from '../lib/earthJourney'
import { chapter, drive, setRestGaps } from '../lib/deck'
import { RUNWAY_MEDIA, animationOff } from '../lib/motion'
import '../styles/earth-journey.css'

/** A native sticky chapter. Every pose is a function of the chapter's progress
 * (the deck's `vrun`: the run, settled out of any dissolve while the page is at
 * rest); there are no autoplay clocks, no scroll triggers and no per-frame
 * React renders. A strip of words stays for the whole film. Without motion,
 * the same figures become a normal, fully readable photo essay. */
export default function WorldSection() {
  const root = useRef<HTMLElement>(null)
  const scrolling = useRef(false)

  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const media = gsap.matchMedia()
    media.add(RUNWAY_MEDIA, () => {
      if (animationOff()) return
      el.dataset.earthMotion = 'scroll'
      scrolling.current = true
      setRestGaps('world', EARTH_REST_GAPS)
      const globe = el.querySelector('.earth-globe')
      const intro = el.querySelector<HTMLElement>('.earth-intro-copy')
      const orbitCaption = el.querySelector<HTMLElement>('.earth-orbit-caption')
      const figures = Array.from(el.querySelectorAll<HTMLElement>('.earth-place'))
      const credits = figures[figures.length - 1]?.querySelector<HTMLElement>('figcaption') ?? null
      const lastArrival = PLACES[PLACES.length - 1].arrival
      let active = -2
      let introOn: boolean | null = null
      let creditsOn: boolean | null = null
      const phase = (block: HTMLElement | null, on: boolean) => {
        if (!block) return
        if (on) { block.removeAttribute('data-phase'); block.removeAttribute('inert') }
        else { block.setAttribute('data-phase', 'off'); block.setAttribute('inert', '') }
      }
      const updateAccess = (progress: number) => {
        // The opening words are a phase: once they have faded they are marked off and inert,
        // so nothing invisible can take focus or be counted as missing.
        const on = progress < EARTH_INTRO.fadeTo
        if (on !== introOn) {
          introOn = on
          el.dataset.earthIntro = String(on)
          phase(intro, on)
          phase(orbitCaption, on)
        }
        // The destination's name and the photo credits belong to the last frame only.
        const last = progress >= lastArrival - .002
        if (last !== creditsOn) {
          creditsOn = last
          phase(credits, last)
        }
        // Only the foremost photo accepts pointer input. All captions remain
        // in reading/tab order; focusing a credit seeks its corresponding scene.
        let next = -1
        PLACES.forEach((place, i) => { if (progress >= place.start + (place.arrival - place.start) * .55) next = i })
        if (next === active) return
        active = next
        figures.forEach((figure, i) => { figure.dataset.active = String(i === active) })
      }
      const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } })
      tl.to([intro, orbitCaption], { opacity: 0, duration: EARTH_INTRO.fadeTo - EARTH_INTRO.fadeFrom }, EARTH_INTRO.fadeFrom)
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
      // Once photographs cover the globe, removing its box lets its renderer rest. This reverses on scroll.
      tl.set(globe, { display: 'none' }, PLACES[0].arrival + .005)
      const off = drive('world', (v) => {
        tl.progress(v)
        updateAccess(v)
      })
      return () => {
        off()
        tl.revert()
        scrolling.current = false
        setRestGaps('world', [])
        delete el.dataset.earthMotion
        delete el.dataset.earthIntro
        for (const block of [intro, orbitCaption, credits]) phase(block, true)
        figures.forEach(figure => { delete figure.dataset.active })
      }
    }, el)
    return () => media.revert()
  }, [])

  const revealFocusedScene = (progress: number) => {
    const s = chapter('world')
    if (!scrolling.current || !s || Math.abs(s.run - progress) < .002) return
    // A keyboard reader can tab through the credits without encountering an
    // invisible focused link or having to scroll the entire sticky distance.
    // A native jump: the deck sees it as a teleport and finishes the frame at once.
    window.scrollTo({ top: s.top + (s.height - s.stageHeight) * progress, behavior: 'instant' })
  }

  return <section ref={root} id="world" className="scene-chapter scene-chapter--world earth-journey" aria-label="Our world">
    <div className="scene-stage earth-journey-stage">
      {/* The strip: these words stay for the whole film, so no stop is ever without text */}
      <div className="container-site earth-strip">
        <p className="scene-eyebrow"><span />Where we’re from</p>
        <a className="scene-link" href="/world/">More about our members <span aria-hidden="true">↗</span></a>
      </div>
      <div className="earth-intro">
        <div className="earth-globe" data-film-enter="picture"><SceneCanvas kind="earth" /></div>
        <div className="scene-edge scene-edge--top" />
        <div className="scene-edge scene-edge--bottom" />
        <div className="container-site scene-content earth-intro-copy">
          <div className="scene-copy">
            <h2 className="scene-title"><ScrollWords text={world.heading} treatment="illuminate" /></h2>
            <p className="scene-lead">{world.text}</p>
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
