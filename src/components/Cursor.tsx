import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from '../lib/motion'
import '../styles/cursor.css'

/**
 * The pointer, dealt as a card. A small pip sits exactly under the mouse and
 * a ring follows it on a soft spring, stretching along the way it moves.
 * Over anything you can press, the ring opens up and fills. Over a playing
 * card it becomes a little card of its own, leaning with the motion and
 * showing the suit of what is under it. Pressing squeezes it.
 *
 * Mice and trackpads only. Touch screens and text fields keep the system
 * pointer, and reduced motion drops the spring and the stretch.
 */
const PRESSABLE = 'a, button, [role="button"], label, summary, select, [data-cursor="press"]'
const CARD = '.project-card, .people-slot, .community-slot, .card-tile, [data-cursor="card"]'
const TYPING = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]), textarea, [contenteditable="true"]'
const SUITS = ['♠', '♥', '♦', '♣']

export default function Cursor() {
  const ring = useRef<HTMLDivElement>(null)
  const pip = useRef<HTMLDivElement>(null)
  const suit = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const r = ring.current
    const d = pip.current
    const s = suit.current
    if (!r || !d || !s) return
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)')
    if (!fine.matches) return
    const still = prefersReducedMotion()
    const html = document.documentElement
    html.classList.add('cgs-cursor')

    let x = -100
    let y = -100
    let rx = -100
    let ry = -100
    let vx = 0
    let vy = 0
    let shown = false
    let raf = 0
    let mode = ''
    let suitIndex = 0
    let lastCard: Element | null = null

    const setMode = (m: string) => {
      if (m === mode) return
      mode = m
      r.dataset.mode = m
      d.dataset.mode = m
    }

    const tick = () => {
      raf = 0
      const k = still ? 1 : 0.2
      const nx = rx + (x - rx) * k
      const ny = ry + (y - ry) * k
      vx = nx - rx
      vy = ny - ry
      rx = nx
      ry = ny
      const speed = Math.min(1, Math.hypot(vx, vy) / 40)
      const angle = (Math.atan2(vy, vx) * 180) / Math.PI
      const stretch = still || mode === 'card' ? 1 : 1 + speed * 0.45
      const lean = mode === 'card' && !still ? Math.max(-14, Math.min(14, vx * 0.9)) : 0
      r.style.transform =
        mode === 'card'
          ? `translate3d(${rx}px, ${ry}px, 0) rotate(${lean}deg)`
          : `translate3d(${rx}px, ${ry}px, 0) rotate(${angle}deg) scale(${stretch}, ${1 / stretch})`
      d.style.transform = `translate3d(${x}px, ${y}px, 0)`
      if (Math.abs(x - rx) + Math.abs(y - ry) > 0.2) raf = requestAnimationFrame(tick)
    }
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(tick)
    }

    const read = (t: Element | null) => {
      if (!t) return
      if (t.closest(TYPING)) setMode('typing')
      else {
        const card = t.closest(CARD)
        if (card) {
          if (card !== lastCard) {
            lastCard = card
            // show the suit printed on the card when it has one, otherwise deal the next
            const printed = (card.textContent ?? '').match(/[♠♥♦♣]/)
            suitIndex = printed ? SUITS.indexOf(printed[0]) : (suitIndex + 1) % 4
            s.textContent = SUITS[suitIndex]
            r.dataset.red = suitIndex === 1 || suitIndex === 2 ? '1' : '0'
          }
          setMode('card')
        } else {
          lastCard = null
          setMode(t.closest(PRESSABLE) ? 'press' : '')
        }
      }
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      x = e.clientX
      y = e.clientY
      if (!shown) {
        shown = true
        rx = x
        ry = y
        html.classList.add('cgs-cursor--on')
      }
      read(e.target instanceof Element ? e.target : null)
      kick()
    }
    // the page can slide a card under a still pointer, so look again on scroll
    let scrollRaf = 0
    const onScroll = () => {
      if (!shown || scrollRaf) return
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0
        read(document.elementFromPoint(x, y))
      })
    }
    // buttons fill from the exact point the pointer came in, and drain toward where it leaves
    const edge = (e: PointerEvent) => {
      const t = e.target instanceof Element ? e.target.closest<HTMLElement>('.btn') : null
      if (!t) return
      const rel = e.relatedTarget instanceof Node ? e.relatedTarget : null
      if (rel && t.contains(rel)) return
      const b = t.getBoundingClientRect()
      t.style.setProperty('--mx', `${(((e.clientX - b.left) / b.width) * 100).toFixed(1)}%`)
      t.style.setProperty('--my', `${(((e.clientY - b.top) / b.height) * 100).toFixed(1)}%`)
    }
    const onDown = () => r.classList.add('is-down')
    const onUp = () => r.classList.remove('is-down')
    const onLeave = () => {
      shown = false
      html.classList.remove('cgs-cursor--on')
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('pointerover', edge, { passive: true })
    document.addEventListener('pointerout', edge, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    document.addEventListener('pointerleave', onLeave)
    window.addEventListener('blur', onLeave)
    return () => {
      cancelAnimationFrame(raf)
      cancelAnimationFrame(scrollRaf)
      window.removeEventListener('scroll', onScroll)
      html.classList.remove('cgs-cursor', 'cgs-cursor--on')
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerover', edge)
      document.removeEventListener('pointerout', edge)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('blur', onLeave)
    }
  }, [])

  return (
    <>
      <div ref={ring} className="cgs-ring" aria-hidden="true">
        <span ref={suit} className="cgs-ring__suit">♠</span>
      </div>
      <div ref={pip} className="cgs-pip" aria-hidden="true" />
    </>
  )
}
