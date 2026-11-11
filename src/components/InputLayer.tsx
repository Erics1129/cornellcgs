/**
 * InputLayer — touch behaviours that are not tied to one component.
 * CONTRACT FILE, owner: stream "interaction". Renders nothing; keep the
 * default export and its props.
 *
 * 1. Press feedback. A finger resting on a button or a card scales it to
 *    0.97 in 80 ms; letting go eases it back. The press waits 80 ms and is
 *    called off by 8 px of movement or a pointercancel, so starting a scroll
 *    on a card never makes it twitch. A quick tap still gets a short pulse.
 * 2. Swipe to flip. A sideways swipe on a team card presses that card's own
 *    flip control (so the card's state, focus and screen-reader label stay
 *    with the component). Never within 24 px of the screen edge, which
 *    belongs to the browser's back gesture.
 *
 * Everything is passive: nothing here can block a vertical pan.
 */
import { useEffect } from 'react'

const PRESSABLE = [
  '.btn', '.card-shell', '.community-slot', '.people-slot', '.project-card-holder', '.event-surface',
  '.agenda-trigger', '.agenda-more', '.scene-link', '.identity-link', '.f-redeal', '.soda-sound',
  '.cgs-nav-trigger', '.cgs-nav-link', '.cgs-nav-cta', '.cgs-nav-brand', '.join-card-cta',
  '.alpha-pause', '.cgs-sphere-pause', '.vision-pause', '.poker-pause',
  '.sp-action', '.sp-back', '.sp-footer__routes a', '.page-navigator__trigger', '.page-navigator__link', '.minigames-card',
  '[data-press]',
].join(', ')
const SWIPE_CARD = '.people-slot'
const SWIPE_CONTROL = '.people-flip-control'

const PRESS_WAIT = 80
const PRESS_SLOP = 8
const SWIPE_MIN = 36
const EDGE = 24

export default function InputLayer({ page = 'deck' }: { page?: 'deck' | 'sub' }) {
  useEffect(() => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)')
    type Press = { id: number; el: HTMLElement; x: number; y: number; t: number; timer: number; shown: boolean; swipe: HTMLElement | null; done: boolean }
    let press: Press | null = null
    const running = new WeakMap<HTMLElement, Animation>()

    const down = (el: HTMLElement) => {
      el.dataset.pressed = 'true'
      if (reduce.matches || typeof el.animate !== 'function') return
      running.get(el)?.cancel()
      running.set(el, el.animate({ scale: ['1', '0.97'] }, { duration: PRESS_WAIT, easing: 'ease-out', fill: 'forwards' }))
    }
    const up = (el: HTMLElement) => {
      delete el.dataset.pressed
      const held = running.get(el)
      if (!held) return
      // back to rest on the house ease; the animation is removed so no transform is left behind
      const back = el.animate({ scale: [getComputedStyle(el).scale === 'none' ? '1' : getComputedStyle(el).scale, '1'] }, { duration: 260, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' })
      held.cancel()
      running.set(el, back)
      back.onfinish = back.oncancel = () => { if (running.get(el) === back) running.delete(el) }
    }

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || !e.isPrimary) return
      const target = e.target instanceof Element ? e.target : null
      const el = target?.closest<HTMLElement>(PRESSABLE) ?? null
      const card = target?.closest<HTMLElement>(SWIPE_CARD) ?? null
      const inEdge = e.clientX < EDGE || e.clientX > window.innerWidth - EDGE
      if (!el && !card) return
      const p: Press = { id: e.pointerId, el: el ?? card!, x: e.clientX, y: e.clientY, t: e.timeStamp, timer: 0, shown: false, swipe: inEdge ? null : card, done: false }
      press = p
      if (el) p.timer = window.setTimeout(() => { if (press === p) { p.shown = true; down(p.el) } }, PRESS_WAIT)
    }
    const release = (p: Press) => {
      window.clearTimeout(p.timer)
      if (p.shown) up(p.el)
      p.shown = false
    }
    const onMove = (e: PointerEvent) => {
      const p = press
      if (!p || e.pointerId !== p.id) return
      const dx = e.clientX - p.x, dy = e.clientY - p.y
      if (Math.abs(dx) > PRESS_SLOP || Math.abs(dy) > PRESS_SLOP) release(p)
      if (p.swipe && !p.done && Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.5) {
        p.done = true
        p.swipe.querySelector<HTMLElement>(SWIPE_CONTROL)?.click()
      }
    }
    const onUp = (e: PointerEvent) => {
      const p = press
      if (!p || e.pointerId !== p.id) return
      press = null
      const moved = Math.hypot(e.clientX - p.x, e.clientY - p.y) > PRESS_SLOP
      // a quick tap ends before the wait: acknowledge it with a short pulse
      if (!p.shown && !moved && e.type === 'pointerup' && p.el.matches(PRESSABLE)) {
        window.clearTimeout(p.timer)
        down(p.el)
        window.setTimeout(() => up(p.el), 110)
        return
      }
      release(p)
    }

    const opts = { passive: true } as const
    document.addEventListener('pointerdown', onDown, opts)
    document.addEventListener('pointermove', onMove, opts)
    document.addEventListener('pointerup', onUp, opts)
    document.addEventListener('pointercancel', onUp, opts)
    return () => {
      if (press) release(press)
      press = null
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
    }
  }, [page])
  return null
}
