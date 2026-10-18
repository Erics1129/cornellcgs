import { useEffect } from 'react'
import type { RefObject } from 'react'

/**
 * Depth on the entry page, driven by a fine pointer (styles: ui/entry.css):
 *   [data-depth="n"]  slides n px toward the pointer (negative: away from it, so the art reads as behind the glass)
 *   [data-light]      glass with a specular glint (.ct-rimlight > i) that travels along its rim toward the pointer, as if the pointer were
 *                     a light, and brightens as it comes closer; it eases back to the chapter's own light when the pointer leaves
 *   [data-tilt]       leans up to 4 degrees toward the pointer while it is over it (a CSS transform; press keeps the scale property);
 *                     its [data-tilt-inner] image slides the other way, like a view through a window
 * Everything written here is a compositor property on its own layer (translate, transform, opacity), so a frame is a re-composite and
 * never a repaint. (Turning the rim gradient itself, through a custom property, repainted each glass surface and its soft shadows every
 * frame: 120 fps fell to about 80 in Chromium.) One requestAnimationFrame loop eases every value (time-based, about 8% of the distance
 * per 60 Hz frame) and stops itself once everything has settled, so a still pointer costs nothing. Off for touch and under reduced
 * motion (the page passes enabled=false), and at rest while the pointer is over a dialog. `content` re-reads the marked elements.
 */
export function useLobbyDepth(root: RefObject<HTMLElement | null>, enabled: boolean, content: unknown = null) {
 useEffect(() => {
  const host = root.current
  if (!host) return
  const tracking = enabled && matchMedia('(hover: hover) and (pointer: fine)').matches
  const layers = [...host.querySelectorAll<HTMLElement>('[data-depth]')].map(el => ({ el, d: Number(el.dataset.depth) || 0 }))
  // the resting light: the chapter's sun or moon (--sun-x/--sun-y on the lobby), far above the screen
  const sunX = parseFloat(getComputedStyle(host).getPropertyValue('--sun-x'))
  const lights = [...host.querySelectorAll<HTMLElement>('[data-light]')].map(el => ({ el, glint: el.querySelector<HTMLElement>(':scope > .ct-rimlight > i'), cx: 0, cy: 0, hw: 0, hh: 0, x: 0, y: 0, o: 0, tx: 0, ty: 0, to: 0 })).filter(l => l.glint)
  const tilt = host.querySelector<HTMLElement>('[data-tilt]'), inner = tilt?.querySelector<HTMLElement>('[data-tilt-inner]') || null
  // WebKit draws seams through a translucent, blurred layer under a 3D rotation (seen in WebKit 26 captures), so Safari keeps the card
  // flat and gets only the view-through-a-window slide of its image
  const flat = /AppleWebKit/.test(navigator.userAgent) && !/Chrome\/|Chromium\/|Edg\//.test(navigator.userAgent)
  let w = innerWidth, h = innerHeight, tiltBox = { left: 0, top: 0, width: 0, height: 0 }
  let inside = false
  let nx = 0, ny = 0, cx = 0, cy = 0, rx = 0, ry = 0, trx = 0, try_ = 0
  let raf = 0, last = 0
  const measure = () => {
   w = innerWidth; h = innerHeight
   for (const l of lights) { const r = l.el.getBoundingClientRect(); l.cx = r.left + r.width / 2; l.cy = r.top + r.height / 2; l.hw = r.width / 2; l.hh = r.height / 2 }
   if (tilt) { const r = tilt.getBoundingClientRect(); tiltBox = { left: r.left, top: r.top, width: r.width, height: r.height } }
  }
  const frame = (now: number) => {
   const dt = last ? Math.min(64, now - last) : 16.7; last = now
   const k = 1 - Math.pow(1 - .08, dt / 16.7), kl = 1 - Math.pow(1 - .14, dt / 16.7)
   cx += (nx - cx) * k; cy += (ny - cy) * k
   rx += (trx - rx) * kl; ry += (try_ - ry) * kl
   for (const { el, d } of layers) el.style.translate = `${(cx * d).toFixed(2)}px ${(cy * d * .7).toFixed(2)}px`
   let turning = false
   for (const l of lights) {
    if (Math.abs(l.tx - l.x) + Math.abs(l.ty - l.y) > .2 || Math.abs(l.to - l.o) > .004) turning = true
    l.x += (l.tx - l.x) * kl; l.y += (l.ty - l.y) * kl; l.o += (l.to - l.o) * kl
    l.glint!.style.transform = `translate(${l.x.toFixed(1)}px, ${l.y.toFixed(1)}px)`; l.glint!.style.opacity = l.o.toFixed(3)
   }
   if (tilt && !flat) tilt.style.transform = Math.abs(rx) + Math.abs(ry) < .01 && !inside ? '' : `perspective(1100px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`
   if (inner) inner.style.translate = `${(-ry * 1.2).toFixed(2)}px ${(rx * 1.2).toFixed(2)}px`
   const busy = Math.abs(nx - cx) + Math.abs(ny - cy) > .0005 || turning || Math.abs(trx - rx) + Math.abs(try_ - ry) > .005
   raf = busy ? requestAnimationFrame(frame) : 0
   if (!raf) last = 0
  }
  const wake = () => { if (!raf) raf = requestAnimationFrame(frame) }
  // the glint sits on the rim where a line from the centre toward the light leaves the shape; closer light, brighter glint
  const aim = (l: typeof lights[number], px: number, py: number, near: boolean) => {
   const dx = px - l.cx, dy = py - l.cy, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d
   const k = Math.min(l.hw / Math.max(.001, Math.abs(ux)), l.hh / Math.max(.001, Math.abs(uy)))
   l.tx = ux * k; l.ty = uy * k; l.to = near ? .45 + .55 * Math.max(0, 1 - Math.max(0, d - Math.hypot(l.hw, l.hh)) / 700) : .45
  }
  const rest = () => { for (const l of lights) aim(l, (Number.isFinite(sunX) ? sunX / 100 : .1) * w, -1.5 * h, false) }
  const leave = () => { nx = 0; ny = 0; rest(); inside = false; trx = 0; try_ = 0; wake() }
  const move = (e: PointerEvent) => {
   if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return
   if (e.target instanceof Element && e.target.closest('dialog')) { leave(); return }
   nx = e.clientX / w * 2 - 1; ny = e.clientY / h * 2 - 1
   for (const l of lights) aim(l, e.clientX, e.clientY, true)
   if (tilt) {
    const u = (e.clientX - tiltBox.left) / tiltBox.width, v = (e.clientY - tiltBox.top) / tiltBox.height
    inside = u >= 0 && u <= 1 && v >= 0 && v <= 1
    trx = inside ? (.5 - v) * 7 : 0; try_ = inside ? (u - .5) * 8 : 0
   }
   wake()
  }
  const resize = () => { measure(); wake() }
  // the entrance moves the glass for its first second; measure once it has landed, and again on resize
  // place every glint at the chapter's light at once (and again when the entrance has landed, and on resize); touch, reduced motion
  // and coarse pointers stop here, with the glints still lit from the chapter's light
  const place = () => { measure(); rest(); for (const l of lights) { l.x = l.tx; l.y = l.ty; l.o = l.to; l.glint!.style.transform = `translate(${l.x.toFixed(1)}px, ${l.y.toFixed(1)}px)`; l.glint!.style.opacity = l.o.toFixed(3) } }
  place()
  const settle = window.setTimeout(place, 1300)
  if (!tracking) {
   window.addEventListener('resize', place)
   return () => { clearTimeout(settle); window.removeEventListener('resize', place); for (const { glint } of lights) { glint!.style.removeProperty('transform'); glint!.style.removeProperty('opacity') } }
  }
  window.addEventListener('pointermove', move, { passive: true })
  document.documentElement.addEventListener('pointerleave', leave)
  window.addEventListener('blur', leave)
  window.addEventListener('resize', resize)
  host.addEventListener('scroll', measure, { passive: true })
  return () => {
   clearTimeout(settle); cancelAnimationFrame(raf)
   window.removeEventListener('pointermove', move); document.documentElement.removeEventListener('pointerleave', leave)
   window.removeEventListener('blur', leave); window.removeEventListener('resize', resize); host.removeEventListener('scroll', measure)
   for (const { el } of layers) el.style.removeProperty('translate')
   for (const { glint } of lights) { glint!.style.removeProperty('transform'); glint!.style.removeProperty('opacity') }
   if (tilt) tilt.style.removeProperty('transform')
   if (inner) inner.style.removeProperty('translate')
  }
 }, [root, enabled, content])
}
