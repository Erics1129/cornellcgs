import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { world } from '../content'
import SceneCanvas from './SceneCanvas'
import ScrollWords from './ScrollWords'
import '../styles/earth-journey.css'

gsap.registerPlugin(ScrollTrigger)

const PLACES = [
  {
    id: 'new-york', name: 'New York', caption: 'Statue of Liberty · New York Harbor',
    image: 'liberty-island.webp', width: 1920, height: 1253,
    alt: 'The Statue of Liberty and its stone pedestal rise above Liberty Island, seen across the blue water of New York Harbor.',
    photographer: 'National Park Service', license: 'Public domain',
    source: 'https://npgallery.nps.gov/AssetDetail/3454fd91-1dd8-b71b-0b21-a93398840c35',
    licenseUrl: '', start: .50, end: .75, stop: .62,
    from: { scale: 1.025, xPercent: .4, yPercent: .5 },
    to: { scale: 1.11, xPercent: -.5, yPercent: -.8 },
  },
  {
    id: 'bali', name: 'Bali', caption: 'Jatiluwih rice terraces · Indonesia',
    image: 'bali-jatiluwih.webp', width: 1920, height: 1152,
    alt: 'Green rice terraces curve across a hillside in Jatiluwih, Bali, with small tiled shelters and coconut palms.',
    photographer: 'Jorge Franganillo', license: 'CC BY 2.0',
    source: 'https://commons.wikimedia.org/wiki/File:Bali-_Jatiluwih_rice_terraces_-_50281829296.jpg',
    licenseUrl: 'https://creativecommons.org/licenses/by/2.0/', start: .67, end: .92, stop: .79,
    from: { scale: 1.12, xPercent: -.8, yPercent: .7 },
    to: { scale: 1.035, xPercent: .5, yPercent: -.4 },
  },
  {
    id: 'hawaii', name: 'Hawaiʻi', caption: 'Nā Pali Coast · Kauaʻi',
    image: 'hawaii-na-pali.webp', width: 1920, height: 1282,
    alt: 'Deeply folded green cliffs of the Nā Pali Coast fall into the Pacific Ocean on Kauaʻi, Hawaiʻi.',
    photographer: 'Andrew Baerst', license: 'CC BY 2.0',
    source: 'https://commons.wikimedia.org/wiki/File:Na_Pali_Coast_(28915675361).jpg',
    licenseUrl: 'https://creativecommons.org/licenses/by/2.0/', start: .84, end: 1, stop: .96,
    from: { scale: 1.03, xPercent: .4, yPercent: .5 },
    to: { scale: 1.11, xPercent: -.8, yPercent: -.5 },
  },
] as const

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
      const continent = el.querySelector('.earth-continent')
      const figures = Array.from(el.querySelectorAll<HTMLElement>('.earth-place'))
      let active = -2
      const updateAccess = (progress: number) => {
        const introVisible = String(progress < .30)
        if (el.dataset.earthIntro !== introVisible) el.dataset.earthIntro = introVisible
        // Only the foremost photo accepts pointer input. All captions remain
        // in reading/tab order; focusing a credit seeks its corresponding scene.
        const next = progress >= .88 ? 2 : progress >= .71 ? 1 : progress >= .54 ? 0 : -1
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
        .fromTo(continent, { opacity: 0 }, { opacity: 1, duration: .045 }, .345)
        .to(continent, { opacity: 0, duration: .035 }, .475)
      PLACES.forEach((place, i) => {
        const figure = figures[i]
        const photo = figure.querySelector('img')
        const caption = figure.querySelector('figcaption')
        // Leave the preceding photograph opaque underneath the incoming one:
        // this is a true dissolve, without a dip to black in the middle.
        tl.fromTo(figure, { opacity: 0 }, { opacity: 1, duration: .08, ease: 'sine.inOut' }, place.start)
          .fromTo(photo, place.from, { ...place.to, duration: place.end - place.start, force3D: true }, place.start)
          .fromTo(caption, { opacity: 0 }, { opacity: 1, duration: .025 }, place.start + .06)
        if (i < PLACES.length - 1) {
          tl.to(caption, { opacity: 0, duration: .02 }, PLACES[i + 1].start - .02)
        }
      })
      // Once photographs cover the globe, removing its box also lets the
      // renderer's IntersectionObserver suspend WebGL. This reverses on scroll.
      tl.set(globe, { display: 'none' }, .59)
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
    if (!st || Math.abs(st.progress - progress) < .065) return
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
            <p className="scene-eyebrow"><span />A shared world</p>
            <h2 className="scene-title"><ScrollWords text={world.heading} treatment="illuminate" /></h2>
            <p className="scene-lead">{world.text}</p>
            <a className="scene-link" href="/world/">Meet our community <span aria-hidden="true">↗</span></a>
          </div>
        </div>
        <div className="scene-caption earth-orbit-caption" onFocusCapture={() => revealFocusedScene(.12)}>
          <span>Many perspectives. One table.<a className="earth-map-credit" href="https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/" target="_blank" rel="noopener noreferrer">Earth imagery: NASA Earth Observatory</a></span>
          <span>Scroll to orbit</span><span aria-hidden="true">↓</span>
        </div>
        <div className="earth-continent">
          <p>North America</p><span>Between the Atlantic and the Pacific.</span>
        </div>
      </div>
      {PLACES.map(place => <figure key={place.id} className={`earth-place earth-place--${place.id}`} data-earth-place={place.id}
        onFocusCapture={() => revealFocusedScene(place.stop)}>
        <img className="earth-photo" src={`/assets/earth-journey/${place.image}`} alt={place.alt}
          width={place.width} height={place.height} loading="lazy" decoding="async" draggable={false} />
        <figcaption>
          <div className="earth-place-copy"><h3>{place.name}</h3><p>{place.caption}</p></div>
          <p className="earth-photo-credit">
            <a href={place.source} target="_blank" rel="noopener noreferrer"
              title="Original photograph and credit. Resized, WebP encoded and cropped for display.">Photo: {place.photographer}{!place.licenseUrl && ` · ${place.license}`}</a>
            {place.licenseUrl && <><span aria-hidden="true"> · </span><a href={place.licenseUrl} target="_blank" rel="noopener noreferrer">{place.license}</a></>}
          </p>
        </figcaption>
      </figure>)}
    </div>
  </section>
}
