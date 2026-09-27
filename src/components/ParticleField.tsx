import { useEffect, useRef } from 'react'
import '../styles/particle-field.css'

type Mode = 'hero' | 'singularity' | 'neural'
type Connection = EventTarget & { saveData?: boolean }
type Device = Navigator & { deviceMemory?: number; connection?: Connection }
type Particle = {
  phase: number; radius: number; speed: number; size: number; color: number; shard: boolean
  x: number; y: number; depth: number; alpha: number; angle: number
  ox: number; oy: number; vx: number; vy: number; spin: number; life: number
}
const TAU = Math.PI * 2
const COLORS = ['132,64,255', '197,148,255', '87,37,167']
const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value))
const fraction = (value: number) => value - Math.floor(value)

/** Glow and glass are rasterized once; each particle is a small sprite blit. */
function makeSprite(color: string, shard: boolean) {
  const sprite = document.createElement('canvas')
  sprite.width = sprite.height = 64
  const ctx = sprite.getContext('2d')!
  const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 31)
  glow.addColorStop(0, `rgba(${color},.8)`)
  glow.addColorStop(.2, `rgba(${color},.35)`)
  glow.addColorStop(.55, 'rgba(36,7,73,.16)')
  glow.addColorStop(1, `rgba(${color},0)`)
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, 64, 64)
  if (shard) {
    ctx.beginPath()
    ctx.moveTo(13, 25); ctx.lineTo(39, 12); ctx.lineTo(49, 38); ctx.lineTo(26, 48); ctx.closePath()
    const glass = ctx.createLinearGradient(17, 14, 44, 49)
    glass.addColorStop(0, 'rgba(228,197,255,.96)')
    glass.addColorStop(.45, `rgba(${color},.42)`)
    glass.addColorStop(1, `rgba(${color},.12)`)
    ctx.fillStyle = glass; ctx.fill()
    ctx.strokeStyle = `rgba(${color},.86)`; ctx.lineWidth = 1.2; ctx.stroke()
    ctx.beginPath(); ctx.moveTo(13, 25); ctx.lineTo(35, 30); ctx.lineTo(39, 12)
    ctx.strokeStyle = 'rgba(224,190,255,.7)'; ctx.lineWidth = .8; ctx.stroke()
  } else {
    ctx.fillStyle = 'rgba(224,188,255,.95)'
    ctx.beginPath(); ctx.arc(32, 32, 2.5, 0, TAU); ctx.fill()
  }
  return sprite
}

/** A local field of flowing light and glass fragments; the DOM remains interactive. */
export default function ParticleField({ mode, paused = false }: { mode: Mode; paused?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const synchronize = useRef<() => void>(() => {})

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) { canvas.dataset.playback = 'unavailable'; return }
    const section = canvas.closest('section') ?? canvas.parentElement!
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    const fine = matchMedia('(hover: hover) and (pointer: fine)')
    const small = matchMedia('(max-width: 767px)')
    const nav = navigator as Device
    const sprites = COLORS.map(color => ({ point: makeSprite(color, false), shard: makeSprite(color, true) }))
    const trail = new Float32Array(30)
    let trailHead = 0, trailCount = 0
    let particles: Particle[] = []
    let width = 0, height = 0, dpr = 1, centerX = 0, centerY = 0, radius = 0
    let mobile = false, constrained = false, fragments = 0
    let alive = true, visible = false, raf = 0, previous = 0, frames = 0
    let time = 0, clock = 0, momentum = 0, lastBurst = -10, burstCount = 0
    let arrived = false, eventActive = false, eventStarted = 0
    let scrollY = window.scrollY, scrollAt = performance.now()
    let pointerX = 0, pointerY = 0, pointerVX = 0, pointerVY = 0, pointerAt = 0, pointerActive = false
    let selecting = false, bounds = canvas.getBoundingClientRect()

    const availability = () => !alive ? 'disposed' : motion.matches ? 'reduced' : pausedRef.current ? 'paused'
      : document.hidden ? 'hidden' : !visible || !width || !height ? 'offscreen' : 'playing'
    const state = () => availability() === 'playing' && mode === 'hero' && !eventActive ? 'idle' : availability()
    const locate = (p: Particle, i: number) => {
      if (mode === 'singularity') {
        const progress = fraction(p.phase / TAU + time * .045 * p.speed)
        const orbit = .13 + Math.pow(1 - progress, .8) * p.radius
        const angle = p.phase + progress * TAU * 1.45 + time * .15
        p.x = centerX + Math.cos(angle) * radius * orbit
        p.y = centerY + Math.sin(angle) * radius * orbit * .32 - (p.x - centerX) * .15
        p.x += Math.sin(angle * 3 + time * .8) * radius * orbit * .055
        p.y += Math.sin(angle * 5 - time * .6) * radius * orbit * .035
        p.depth = .45 + .55 * (Math.sin(angle) + 1) / 2
        p.alpha = Math.min(1, progress * 12, (1 - progress) * 10) * (.3 + .6 * p.depth)
        p.angle = angle + Math.PI / 2
      } else if (mode === 'neural') {
        const progress = fraction(p.phase / TAU + time * .038 * p.speed)
        const lane = i % 6
        p.x = (progress * 1.2 - .1) * width
        p.y = centerY + Math.sin(progress * TAU + lane * .92) * height * .18
          + Math.sin(progress * TAU * 2 + p.phase) * height * .05 + (lane - 2.5) * height * .038
        p.depth = .5 + .5 * Math.sin(progress * Math.PI)
        p.alpha = Math.min(1, progress * 8, (1 - progress) * 8) * (.25 + .65 * p.depth)
        p.angle = Math.cos(progress * TAU + lane * .92) * .6
      } else {
        const angle = p.phase + time * .23 * p.speed
        const orbit = p.radius * (1 + .06 * Math.sin(time * .8 + p.phase))
        p.x = centerX + Math.cos(angle) * radius * orbit
        p.y = centerY + Math.sin(angle) * radius * orbit * .44 + (p.x - centerX) * .12
        p.x += Math.sin((p.y - centerY) / Math.max(1, radius) * 6 + time * .55) * radius * .1
        p.y += Math.sin((p.x - centerX) / Math.max(1, radius) * 4 - time * .5) * radius * .1
        p.depth = .35 + .65 * (Math.sin(angle) + 1) / 2
        p.alpha = .28 + p.depth * .58
        p.angle = angle + Math.PI / 2
      }
    }
    const rebuild = () => {
      const budget = mobile ? constrained ? 72 : 140 : constrained ? 200 : 480
      const count = Math.round(budget * Math.min(1, Math.max(.65, width * height / 720000)))
      fragments = Math.min(mobile ? 18 : 48, Math.round(count * .12))
      if (particles.length !== count) {
        particles = Array.from({ length: count }, (_, i) => ({
          phase: (i % 9) / 9 * TAU + (Math.random() - .5) * .38,
          radius: .38 + (i % 5) * .13 + Math.random() * .22,
          speed: .6 + Math.random() * .9, size: .65 + Math.random() * 1.2,
          color: i % 17 === 0 ? 2 : i % 3 === 0 ? 1 : 0, shard: i < fragments,
          x: 0, y: 0, depth: 1, alpha: 1, angle: 0,
          ox: 0, oy: 0, vx: 0, vy: 0, spin: 0, life: 0,
        }))
      }
      canvas.dataset.count = String(motion.matches ? 0 : count)
    }
    const fracture = (strength: number, originX = centerX, originY = centerY) => {
      if (availability() !== 'playing' || clock - lastBurst < .42) return
      lastBurst = clock
      eventActive = true; eventStarted = clock
      canvas.dataset.bursts = String(++burstCount)
      // A few facets sit inside a much denser plume of fine disintegrating dust.
      for (let i = 0; i < Math.min(particles.length, fragments * 6); i++) {
        const p = particles[i]
        locate(p, i)
        const angle = Math.random() * TAU
        const speed = (170 + Math.random() * 310) * strength * (mobile ? .7 : 1)
        p.ox = originX + (Math.random() - .5) * Math.min(150, width * .2) - p.x
        p.oy = originY + (Math.random() - .5) * Math.min(190, height * .3) - p.y
        p.vx = Math.cos(angle) * speed
        p.vy = Math.sin(angle) * speed * .8
        p.spin = (Math.random() - .5) * 12
        p.life = strength
      }
      canvas.dataset.playback = 'playing'; canvas.dataset.count = String(particles.length)
      if (!raf) raf = requestAnimationFrame(frame)
    }
    const draw = (dt: number) => {
      ctx.clearRect(0, 0, width, height)
      ctx.globalCompositeOperation = 'lighter'
      const spring = Math.exp(-2.5 * dt)
      const age = clock - eventStarted
      const envelope = mode === 'hero' ? Math.min(1, age / .24) * Math.min(1, Math.max(0, (5.6 - age) / 1.6)) : 1
      const gather = mode === 'hero' ? Math.max(0, Math.min(1, (age - 3.4) / 1.65)) : 0
      const coalesce = gather * gather * (3 - 2 * gather)
      const pointerWarm = pointerActive && !selecting && fine.matches
      const pointerSpeed = Math.exp(-Math.max(0, clock - pointerAt) * 8)
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        locate(p, i)
        if (pointerWarm) {
          const dx = pointerX - p.x - p.ox, dy = pointerY - p.y - p.oy
          const reach = Math.max(0, 1 - Math.hypot(dx, dy) / 165)
          const force = reach * reach
          p.vx += (dx * 3 + pointerVX * pointerSpeed * .9) * force * dt
          p.vy += (dy * 3 + pointerVY * pointerSpeed * .9) * force * dt
        }
        p.vx = (p.vx - p.ox * 5.5 * dt) * spring
        p.vy = (p.vy - p.oy * 5.5 * dt) * spring
        p.ox += p.vx * dt; p.oy += p.vy * dt
        p.spin *= Math.exp(-1.5 * dt); p.life *= Math.exp(-1.1 * dt)
        p.x += p.ox; p.y += p.oy - momentum * .015 * p.depth
        p.x = centerX + (p.x - centerX) * (1 - coalesce * .92)
        p.y = centerY + (p.y - centerY) * (1 - coalesce * .92)
        if (p.x < -45 || p.x > width + 45 || p.y < -45 || p.y > height + 45) continue
        const size = p.size * (p.shard ? 5 + p.life * 13 : 6 + p.depth * 5 + p.life * 5)
        ctx.globalAlpha = envelope * (1 - coalesce * .9) * Math.min(.95, p.alpha * (p.shard ? .5 + p.life * .65 : .8 + p.life * .15))
        const sprite = sprites[p.color]
        if (p.shard) {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle + clock * .32 + p.spin)
          ctx.drawImage(sprite.shard, -size / 2, -size / 2, size, size); ctx.restore()
        } else ctx.drawImage(sprite.point, p.x - size / 2, p.y - size / 2, size, size)
        // A bounded number of fine signal links; no all-pairs particle search.
        if (mode === 'neural' && i >= 6 && i % 3 === 0) {
          const other = particles[i - 6]
          if (Math.hypot(p.x - other.x, p.y - other.y) < 135) {
            ctx.globalAlpha = envelope * .12 * Math.min(p.alpha, other.alpha)
            ctx.strokeStyle = '#c594ff'; ctx.lineWidth = .6
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(other.x, other.y); ctx.stroke()
          }
        }
      }
      if (!selecting) {
        for (let j = 1; j < trailCount; j++) {
          const a = ((trailHead - j + 10) % 10) * 3, b = ((trailHead - j - 1 + 10) % 10) * 3
          const age = clock - trail[a + 2]
          if (age > .45) continue
          ctx.globalAlpha = envelope * (1 - age / .45) * .18
          ctx.strokeStyle = '#c594ff'; ctx.lineWidth = 1
          ctx.beginPath(); ctx.moveTo(trail[b], trail[b + 1]); ctx.lineTo(trail[a], trail[a + 1]); ctx.stroke()
        }
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'
      canvas.dataset.frame = String(++frames)
    }
    const frame = (now: number) => {
      raf = 0
      if (state() !== 'playing') { previous = 0; return }
      const dt = previous ? Math.min(.04, (now - previous) / 1000) : 1 / 60
      previous = now; clock += dt
      if (mode === 'hero' && clock - eventStarted >= 5.6) {
        eventActive = false; previous = 0; trailCount = 0
        ctx.clearRect(0, 0, width, height)
        canvas.dataset.playback = 'idle'; canvas.dataset.count = '0'
        return
      }
      momentum *= Math.exp(-3.5 * dt)
      time += dt * (1 + Math.min(1.5, Math.abs(momentum) / 1100))
      draw(dt)
      raf = requestAnimationFrame(frame)
    }
    const sync = () => {
      cancelAnimationFrame(raf); raf = 0; previous = 0
      if (mode === 'hero' && availability() === 'playing' && !arrived) { arrived = true; fracture(.9) }
      const playback = state()
      canvas.dataset.playback = playback
      if (playback === 'reduced') {
        ctx.clearRect(0, 0, width, height)
        canvas.dataset.count = '0'
      } else canvas.dataset.count = String(playback === 'idle' ? 0 : particles.length)
      if (playback === 'playing') { if (!raf) raf = requestAnimationFrame(frame) }
      else { pointerActive = false; momentum = 0; trailCount = 0 }
      scrollY = window.scrollY; scrollAt = performance.now()
    }
    const resize = () => {
      const nextWidth = canvas.clientWidth, nextHeight = canvas.clientHeight
      if (!nextWidth || !nextHeight) { width = nextWidth; height = nextHeight; sync(); return }
      width = nextWidth; height = nextHeight
      mobile = small.matches || !fine.matches
      constrained = nav.connection?.saveData === true || (nav.deviceMemory !== undefined && nav.deviceMemory <= 4)
      dpr = Math.min(devicePixelRatio || 1, constrained ? 1.5 : 2, Math.sqrt((constrained ? 1200000 : 3200000) / (width * height)))
      canvas.width = Math.max(1, Math.round(width * dpr)); canvas.height = Math.max(1, Math.round(height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      centerX = width * (mode === 'singularity' && !mobile ? .68 : .5)
      centerY = height * (mode === 'hero' ? mobile ? .28 : .46 : mode === 'singularity' ? mobile ? .67 : .5 : .5)
      radius = Math.min(width * (mode === 'singularity' ? .5 : .4), height * (mobile ? .48 : .63))
      bounds = canvas.getBoundingClientRect()
      rebuild(); sync()
    }
    const pointer = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (availability() !== 'playing' || !fine.matches || event.pointerType === 'touch' || event.buttons || selecting
        || target?.closest('button,a,input,textarea,select,[contenteditable],[data-interactive]')) {
        pointerActive = false; return
      }
      const x = event.clientX - bounds.left, y = event.clientY - bounds.top
      if (x < 0 || x > width || y < 0 || y > height) { pointerActive = false; return }
      if (mode === 'hero' && !eventActive) fracture(.45, x, y)
      const dt = Math.max(.016, clock - pointerAt)
      pointerVX = pointerActive ? clamp((x - pointerX) / dt, 900) : 0
      pointerVY = pointerActive ? clamp((y - pointerY) / dt, 900) : 0
      pointerX = x; pointerY = y; pointerAt = clock; pointerActive = true
      const at = trailHead * 3
      trail[at] = x; trail[at + 1] = y; trail[at + 2] = clock
      trailHead = (trailHead + 1) % 10; trailCount = Math.min(10, trailCount + 1)
    }
    const pointerEnter = (event: PointerEvent) => { bounds = canvas.getBoundingClientRect(); pointer(event) }
    const pointerLeave = () => { pointerActive = false }
    const selection = () => { selecting = !!window.getSelection()?.toString(); if (selecting) { pointerActive = false; trailCount = 0 } }
    const scroll = () => {
      const now = performance.now(), next = window.scrollY
      const velocity = clamp((next - scrollY) / Math.max(.016, (now - scrollAt) / 1000), 1800)
      scrollY = next; scrollAt = now; bounds = canvas.getBoundingClientRect()
      if (state() !== 'playing') return
      const acceleration = Math.abs(velocity - momentum)
      momentum = momentum * .35 + velocity * .65
      if (mode === 'singularity' && acceleration > 650) fracture(Math.min(.8, acceleration / 2200), centerX + radius * .32, centerY - radius * .08)
    }
    const cardFlip = () => { if (mode === 'hero') fracture(1) }
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync() }, { threshold: .01 })
    const ro = new ResizeObserver(resize)
    observer.observe(canvas); ro.observe(canvas)
    motion.addEventListener('change', sync); fine.addEventListener('change', resize); small.addEventListener('change', resize)
    nav.connection?.addEventListener('change', resize)
    document.addEventListener('visibilitychange', sync); document.addEventListener('selectionchange', selection)
    window.addEventListener('scroll', scroll, { passive: true }); window.addEventListener('resize', resize)
    section.addEventListener('pointerenter', pointerEnter as EventListener)
    section.addEventListener('pointermove', pointer as EventListener, { passive: true })
    section.addEventListener('pointerleave', pointerLeave); section.addEventListener('pointercancel', pointerLeave)
    section.addEventListener('cgs:card-flip', cardFlip)
    window.addEventListener('cgs:shown', cardFlip)
    synchronize.current = sync
    selection(); resize()
    return () => {
      alive = false; cancelAnimationFrame(raf); observer.disconnect(); ro.disconnect()
      synchronize.current = () => {}
      motion.removeEventListener('change', sync); fine.removeEventListener('change', resize); small.removeEventListener('change', resize)
      nav.connection?.removeEventListener('change', resize)
      document.removeEventListener('visibilitychange', sync); document.removeEventListener('selectionchange', selection)
      window.removeEventListener('scroll', scroll); window.removeEventListener('resize', resize)
      section.removeEventListener('pointerenter', pointerEnter as EventListener); section.removeEventListener('pointermove', pointer as EventListener)
      section.removeEventListener('pointerleave', pointerLeave); section.removeEventListener('pointercancel', pointerLeave)
      section.removeEventListener('cgs:card-flip', cardFlip)
      window.removeEventListener('cgs:shown', cardFlip)
      ctx.clearRect(0, 0, width, height); canvas.dataset.playback = 'disposed'
    }
  }, [mode])

  useEffect(() => synchronize.current(), [paused])
  return <canvas ref={canvasRef} className={`particle-field particle-field--${mode}`} data-mode={mode}
    data-playback="offscreen" data-count="0" data-frame="0" aria-hidden="true" />
}
