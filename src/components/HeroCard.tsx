import { useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { BOOTED_EVENT } from '../lib/motion'
import { chapter, onDeck } from '../lib/deck'
import { look, onLook } from '../lib/look'
import HeroCardArtwork from './HeroCardArtwork'
import '../styles/hero-poker.css'

const COLORS = [
  // A real deck: the face is always ivory card stock with an ink ace. Each flip
  // changes the back's ink, the way club decks come in a few back colors.
  { name: 'midnight', accent: '#a3242b', second: '#15120d', foil: '#15120d', face: '#efe7d4' },
  { name: 'ice', accent: '#1f2f4f', second: '#15120d', foil: '#15120d', face: '#efe7d4' },
  { name: 'lilac', accent: '#6e1a1f', second: '#15120d', foil: '#15120d', face: '#f1e9da' },
  { name: 'violet', accent: '#8a6a35', second: '#15120d', foil: '#15120d', face: '#efe7d4' },
  { name: 'carbon', accent: '#2b2a27', second: '#15120d', foil: '#15120d', face: '#ece4d0' },
] as const

/** Two-sided vector card. Entrance, float, tilt and flip have separate
 * transform owners. Color belongs to this card, never the page or city.
 *
 * The tilt follows the shared look vector: the pointer on a laptop (6 and 9
 * degrees), and at half that a finger resting on the card, device tilt or the
 * idle drift on a phone. On touch the card can also be dragged sideways (up to
 * 14 degrees); letting go past 40 px, or a flick, flips it. A tap still flips. */
export default function HeroCard({ onPausedChange }: { onPausedChange?: (paused: boolean) => void }) {
  const root = useRef<HTMLDivElement>(null)
  const flipAction = useRef<() => void>(() => {})
  const synchronize = useRef<() => void>(() => {})
  const swallowClick = useRef(false)
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
    const reduce = matchMedia('(prefers-reduced-motion: reduce)')
    let visible = false, shown = !!(window as { __cgsShown?: boolean }).__cgsShown
    let alive = true, flipping = false, index = 0, turns = 0, timer = 0
    let flip: gsap.core.Timeline | null = null, enter: gsap.core.Tween | null = null
    let color: gsap.core.Tween | null = null, idle: gsap.core.Timeline | null = null
    let menuOpen = false
    /** extra turn from a sideways drag, degrees */
    let dragAngle = 0
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
      el.dispatchEvent(new CustomEvent('cgs:card-flip', { bubbles: true }))
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
        dragAngle = 0; clearTimer()
      } else if (playing) {
        enter?.resume(); flip?.resume(); color?.resume(); idle?.resume(); rx.tween.resume(); ry.tween.resume()
        aim()
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
    // Tilt toward the look vector. A pointer gets the full lean; a finger,
    // device tilt and the idle drift get half, so the card never swings on a phone.
    function aim() {
      if (!canRun()) return
      const l = look()
      const amount = l.source === 'pointer' ? 1 : .5
      rx(-l.y * 6 * amount)
      ry(l.x * 9 * amount + dragAngle)
    }
    const offLook = onLook(aim)
    // On screen = the hero still covers most of the viewport. Read from the
    // deck's cached geometry: no observer, no scroll listener, no layout read.
    const offDeck = onDeck((frame) => {
      const top = chapter('top')
      const now = !top || frame.y < top.height * .45
      if (now === visible) return
      visible = now; sync()
    })
    visible = (() => { const top = chapter('top'); return !top || window.scrollY < top.height * .45 })()

    // Sideways drag on touch: the card turns with the finger and flips on release.
    // Vertical pans stay with the page (touch-action: pan-y), and a drag never
    // starts in the 24 px at either screen edge, which belong to the back gesture.
    let drag: { id: number; x: number; y: number; t: number; on: boolean } | null = null
    const dragStart = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' || reduce.matches) return
      if (event.clientX < 24 || event.clientX > window.innerWidth - 24) return
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, t: event.timeStamp, on: false }
    }
    const dragMove = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y
      if (!drag.on) {
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { drag = null; return }
        if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return
        drag.on = true
      }
      dragAngle = Math.max(-14, Math.min(14, dx / Math.max(1, button.offsetWidth) * 30))
      aim()
    }
    const dragEnd = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return
      const dx = event.clientX - drag.x
      const speed = Math.abs(dx) / Math.max(1, event.timeStamp - drag.t)
      const flipIt = drag.on && event.type === 'pointerup' && (Math.abs(dx) > 40 || (Math.abs(dx) > 16 && speed > .5))
      const dragged = drag.on
      drag = null; dragAngle = 0; aim()
      if (!dragged) return
      // the browser may still send a click for this touch: it must not flip twice (or at all, for a short drag)
      swallowClick.current = true
      window.setTimeout(() => { swallowClick.current = false }, 350)
      if (flipIt) performFlip()
    }
    button.addEventListener('pointerdown', dragStart, { passive: true })
    button.addEventListener('pointermove', dragMove, { passive: true })
    button.addEventListener('pointerup', dragEnd, { passive: true })
    button.addEventListener('pointercancel', dragEnd, { passive: true })
    const nav = document.querySelector('.cgs-nav-panel')
    const menu = new MutationObserver(() => { menuOpen = nav?.getAttribute('data-open') === 'true'; sync() })
    if (nav) { menuOpen = nav.getAttribute('data-open') === 'true'; menu.observe(nav, { attributes: true, attributeFilter: ['data-open'] }) }
    document.addEventListener('visibilitychange', sync)
    reduce.addEventListener('change', sync)
    if (shown) arrive(); else window.addEventListener(BOOTED_EVENT, arrive, { once: true })
    flipAction.current = performFlip; synchronize.current = sync
    return () => {
      alive = false; clearTimer(); offLook(); offDeck(); menu.disconnect()
      button.removeEventListener('pointerdown', dragStart); button.removeEventListener('pointermove', dragMove)
      button.removeEventListener('pointerup', dragEnd); button.removeEventListener('pointercancel', dragEnd)
      window.removeEventListener(BOOTED_EVENT, arrive)
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
      <button className="hero-poker" type="button" aria-label="Flip the poker card" aria-busy="false" onClick={() => { if (!swallowClick.current) flipAction.current() }} />
      <div className="poker-controls"><span aria-hidden="true">Flip the card</span><span className="poker-control-divider" aria-hidden="true" />
        <button type="button" className="poker-pause" aria-label={paused ? 'Resume card animation' : 'Pause card animation'} aria-pressed={paused} onClick={() => { setPaused(!paused); onPausedChange?.(!paused) }}>
          {paused ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 3 7 5-7 5Z" /></svg> : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3v10M11 3v10" /></svg>}
        </button>
      </div>
    </div>
  </div>
}
