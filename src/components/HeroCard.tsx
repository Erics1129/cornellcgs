import { useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { BOOTED_EVENT } from '../lib/motion'
import HeroCardArtwork from './HeroCardArtwork'
import '../styles/hero-poker.css'

const COLORS = [
  { name: 'midnight', accent: '#69dcff', second: '#8875ff', foil: '#daefff', face: '#081326' },
  { name: 'ice', accent: '#a9f2ff', second: '#509cff', foil: '#f0fbff', face: '#123249' },
  { name: 'lilac', accent: '#d6bbff', second: '#88b6ff', foil: '#f0e7ff', face: '#211b3d' },
  { name: 'violet', accent: '#ac86ff', second: '#58cefa', foil: '#e6d9ff', face: '#170e2f' },
  { name: 'carbon', accent: '#92b8df', second: '#556cd0', foil: '#d3e4f4', face: '#080d17' },
] as const

/** Two-sided vector card. Entrance, float, pointer tilt and flip have separate
 * transform owners. Color belongs to this card, never the page or city. */
export default function HeroCard() {
  const root = useRef<HTMLDivElement>(null)
  const flipAction = useRef<() => void>(() => {})
  const synchronize = useRef<() => void>(() => {})
  const pausedRef = useRef(false)
  const [paused, setPaused] = useState(false)
  pausedRef.current = paused

  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const entrance = el.querySelector<HTMLElement>('.poker-entrance')!
    const float = el.querySelector<HTMLElement>('.poker-float')!
    const button = el.querySelector<HTMLButtonElement>('.hero-poker')!
    const tilt = el.querySelector<HTMLElement>('.poker-tilt')!
    const turn = el.querySelector<HTMLElement>('.poker-turn')!
    const ace = el.querySelector<HTMLElement>('.poker-surface--ace')!
    const back = el.querySelector<HTMLElement>('.poker-surface--back')!
    const glints = el.querySelectorAll<HTMLElement>('.poker-glint')
    const shadow = el.querySelector<HTMLElement>('.poker-floor-shadow')!
    const section = el.closest('section')!
    const reduce = matchMedia('(prefers-reduced-motion: reduce)')
    const fine = matchMedia('(hover: hover) and (pointer: fine)')
    let visible = false, shown = !!(window as { __cgsShown?: boolean }).__cgsShown
    let alive = true, flipping = false, index = 0, turns = 0, timer = 0
    let flip: gsap.core.Timeline | null = null, enter: gsap.core.Tween | null = null
    let color: gsap.core.Tween | null = null, idle: gsap.core.Timeline | null = null
    let moved = false, pointerResetPending = false, menuOpen = false
    let bounds = section.getBoundingClientRect()
    const ctx = gsap.context(() => {
      gsap.set(turn, { rotationY: 0 }); gsap.set(glints, { xPercent: -140 })
      idle = gsap.timeline({ paused: true, repeat: -1, yoyo: true })
        .to(float, { y: -6, rotation: 1.1, duration: 3.8, ease: 'sine.inOut' }, 0)
        .to(shadow, { scaleX: .87, opacity: .36, duration: 3.8, ease: 'sine.inOut' }, 0)
      if (!reduce.matches) gsap.set(entrance, { opacity: 0, y: 46, rotation: -7, scale: .86 })
    }, el)
    // Explicit face culling also handles WebKit's flattened SVG/backface layers.
    // Read GSAP's cached rotations; no per-frame DOM/layout measurement.
    let displayedFace = ''
    const paintFace = () => {
      const angle = (Number(gsap.getProperty(turn, 'rotationY')) + Number(gsap.getProperty(tilt, 'rotationY'))) * Math.PI / 180
      const face = Math.cos(angle) >= 0 ? 'ace' : 'back'
      if (face === displayedFace) return
      displayedFace = face
      ace.style.visibility = face === 'ace' ? 'visible' : 'hidden'
      back.style.visibility = face === 'back' ? 'visible' : 'hidden'
    }
    paintFace()
    const rx = gsap.quickTo(tilt, 'rotationX', { duration: .65, ease: 'power3.out' })
    const ry = gsap.quickTo(tilt, 'rotationY', { duration: .65, ease: 'power3.out', onUpdate: paintFace })
    const centerPointer = () => {
      if (!moved) return
      if (!canRun()) { pointerResetPending = true; return }
      pointerResetPending = false; rx(0); ry(0); moved = false
    }
    const canRun = () => alive && shown && visible && !document.hidden && !reduce.matches && !pausedRef.current && !menuOpen
    const clearTimer = () => { clearTimeout(timer); timer = 0 }
    const paintColor = (instant = false) => {
      const palette = COLORS[index]
      color?.kill()
      const vars = { '--poker-accent': palette.accent, '--poker-second': palette.second, '--poker-foil': palette.foil, '--poker-face': palette.face }
      if (instant) gsap.set(el, vars)
      else color = gsap.to(el, { ...vars, duration: 1.15, ease: 'sine.inOut' })
      el.dataset.color = palette.name
    }
    const finish = () => {
      flipping = false
      gsap.set(turn, { rotationY: (turns % 2) * 180, rotationZ: 0, z: 0 })
      gsap.set(glints, { xPercent: -140, opacity: 0 })
      paintFace()
      el.dataset.face = turns % 2 ? 'back' : 'ace'; el.dataset.flipping = 'false'
      button.setAttribute('aria-busy', 'false')
    }
    const arm = () => {
      clearTimer()
      if (canRun()) timer = window.setTimeout(() => { timer = 0; performFlip() }, 10000)
    }
    const performFlip = () => {
      if (!alive || flipping || document.hidden) return
      index = (index + 1) % COLORS.length; turns++
      if (reduce.matches || pausedRef.current) { paintColor(true); finish(); return }
      flipping = true; el.dataset.flipping = 'true'; button.setAttribute('aria-busy', 'true')
      flip?.kill(); paintColor()
      const from = ((turns - 1) % 2) * 180
      flip = gsap.timeline({ onUpdate: paintFace, onComplete: finish })
        .fromTo(turn, { rotationY: from }, { rotationY: from + 180, duration: 1.65, ease: 'power2.inOut' }, 0)
        .to(turn, { z: 38, rotationZ: -3, duration: .62, ease: 'sine.out' }, 0)
        .to(turn, { z: 0, rotationZ: 0, duration: 1.03, ease: 'sine.inOut' }, .62)
        .fromTo(glints, { xPercent: -140, opacity: 0 }, { xPercent: 140, opacity: .65, duration: 1.4, ease: 'sine.inOut' }, .08)
        .to(glints, { opacity: 0, duration: .25 }, 1.35)
      arm()
    }
    const sync = () => {
      if (!alive) return
      const playing = canRun()
      el.dataset.playback = document.hidden ? 'hidden' : !visible ? 'offscreen' : reduce.matches ? 'reduced' : pausedRef.current ? 'paused' : menuOpen ? 'menu' : 'playing'
      if (reduce.matches) {
        flip?.kill(); flip = null; finish(); color?.progress(1); enter?.progress(1); idle?.pause()
        gsap.set([entrance, float], { opacity: 1, x: 0, y: 0, rotation: 0, scale: 1 })
        rx.tween.pause(); ry.tween.pause(); gsap.set(tilt, { rotationX: 0, rotationY: 0 })
        moved = false; pointerResetPending = false; clearTimer()
      } else if (playing) {
        enter?.resume(); flip?.resume(); color?.resume(); idle?.resume(); rx.tween.resume(); ry.tween.resume()
        if (pointerResetPending) centerPointer()
        if (!timer) arm()
      } else {
        clearTimer(); enter?.pause(); flip?.pause(); color?.pause(); idle?.pause(); rx.tween.pause(); ry.tween.pause()
      }
    }
    const arrive = () => {
      shown = true
      if (!reduce.matches) enter = gsap.to(entrance, { opacity: 1, y: 0, rotation: 0, scale: 1, duration: 1.25, ease: 'power3.out' })
      sync()
    }
    const pointer = (event: PointerEvent) => {
      if (!canRun() || !fine.matches || event.pointerType === 'touch') return
      moved = true; pointerResetPending = false
      rx(-Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - .5) * 2)) * 6)
      ry(Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - .5) * 2)) * 9)
    }
    const measure = () => { bounds = section.getBoundingClientRect() }
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting && entry.intersectionRatio >= .55; measure(); sync() }, { threshold: [0, .55, 1] })
    io.observe(button)
    const ro = new ResizeObserver(measure); ro.observe(section)
    const nav = document.querySelector('.cgs-nav-panel')
    const menu = new MutationObserver(() => { menuOpen = nav?.getAttribute('data-open') === 'true'; sync() })
    if (nav) { menuOpen = nav.getAttribute('data-open') === 'true'; menu.observe(nav, { attributes: true, attributeFilter: ['data-open'] }) }
    section.addEventListener('pointermove', pointer, { passive: true }); section.addEventListener('pointerleave', centerPointer)
    window.addEventListener('scroll', measure, { passive: true }); document.addEventListener('visibilitychange', sync)
    reduce.addEventListener('change', sync)
    if (shown) arrive(); else window.addEventListener(BOOTED_EVENT, arrive, { once: true })
    flipAction.current = performFlip; synchronize.current = sync
    return () => {
      alive = false; clearTimer(); io.disconnect(); ro.disconnect(); menu.disconnect()
      section.removeEventListener('pointermove', pointer); section.removeEventListener('pointerleave', centerPointer)
      window.removeEventListener('scroll', measure); window.removeEventListener(BOOTED_EVENT, arrive)
      document.removeEventListener('visibilitychange', sync); reduce.removeEventListener('change', sync)
      enter?.kill(); flip?.kill(); color?.kill(); rx.tween.kill(); ry.tween.kill(); ctx.revert()
      flipAction.current = () => {}; synchronize.current = () => {}
    }
  }, [])
  useLayoutEffect(() => { synchronize.current() }, [paused])

  return <div ref={root} className="poker-stage" data-color="midnight" data-face="ace" data-flipping="false">
    <div className="poker-location">
      <div className="poker-floor-shadow" aria-hidden="true" />
      <div className="poker-entrance"><div className="poker-float">
        <div className="poker-tilt" aria-hidden="true">
          <div className="poker-turn">
            <span className="poker-surface poker-surface--ace"><HeroCardArtwork side="ace" /><span className="poker-glint" /></span>
            <span className="poker-edge" />
            <span className="poker-surface poker-surface--back"><HeroCardArtwork side="back" /><span className="poker-glint" /></span>
          </div>
        </div>
      </div></div>
      {/* The hit area stays still while the visual floats and turns. */}
      <button className="hero-poker" type="button" aria-label="Flip the poker card" aria-busy="false" onClick={() => flipAction.current()} />
      <div className="poker-controls"><span aria-hidden="true">Flip the card</span><span className="poker-control-divider" aria-hidden="true" />
        <button type="button" className="poker-pause" aria-label={paused ? 'Resume card animation' : 'Pause card animation'} aria-pressed={paused} onClick={() => setPaused(!paused)}>
          {paused ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 3 7 5-7 5Z" /></svg> : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3v10M11 3v10" /></svg>}
        </button>
      </div>
    </div>
  </div>
}
