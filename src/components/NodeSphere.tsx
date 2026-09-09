import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createSceneLoop } from './GraphAlgo'

/** A slowly turning Fibonacci lattice with deliberate, spaced connections.
 * Playback is automatic while visible; the pause control lives outside the
 * caller's aria-hidden decorative wrapper so keyboard users can reach it. */

const N = 144
const K = 3
const ARC_DRAW_MS = 1800
const ARC_HOLD_MS = 1400
const ARC_FADE_MS = 1000

type Vec = [number, number, number]

function lattice(n: number): Vec[] {
  const pts: Vec[] = []
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2
    const r = Math.sqrt(1 - y * y)
    const t = golden * i
    pts.push([Math.cos(t) * r, y, Math.sin(t) * r])
  }
  return pts
}

function neighbours(pts: Vec[], k: number): Array<[number, number]> {
  const edges = new Set<string>()
  const out: Array<[number, number]> = []
  pts.forEach((p, i) => {
    const near = pts
      .map((q, j) => ({ j, d: j === i ? Infinity : (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, k)
    for (const { j } of near) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`
      if (!edges.has(key)) {
        edges.add(key)
        out.push(i < j ? [i, j] : [j, i])
      }
    }
  })
  return out
}

/** Spherical interpolation along the great circle between two unit vectors. */
function slerp(a: Vec, b: Vec, t: number): Vec {
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))
  const om = Math.acos(dot)
  if (om < 1e-4) return a
  const sa = Math.sin((1 - t) * om) / Math.sin(om)
  const sb = Math.sin(t * om) / Math.sin(om)
  return [a[0] * sa + b[0] * sb, a[1] * sa + b[1] * sb, a[2] * sa + b[2] * sb]
}

export default function NodeSphere({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const control = useRef<(() => void) | null>(null)
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [playing, setPlaying] = useState(true)
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    setHost(canvas.closest('section'))
    setPlaying(true)
    let running = true
    const pts = lattice(N)
    const edges = neighbours(pts, K)
    const fine = window.matchMedia('(pointer: fine)').matches

    let w = 0
    let h = 0
    let dpr = 1
    let sceneTime = 0
    let rotY = 0.4
    let rotX = -0.35
    let leanX = 0
    let leanY = 0
    let targetLeanX = 0
    let targetLeanY = 0
    let arc: { a: Vec; b: Vec; t0: number } | null = null
    let nextArc = 700

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      const r = canvas.getBoundingClientRect()
      w = Math.max(1, Math.round(r.width))
      h = Math.max(1, Math.round(r.height))
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      draw(sceneTime)
    }

    const project = (p: Vec, cy: number, sy: number, cx: number, sx: number) => {
      // rotate around Y then X, then a mild perspective
      const x1 = p[0] * cy - p[2] * sy
      const z1 = p[0] * sy + p[2] * cy
      const y1 = p[1] * cx - z1 * sx
      const z2 = p[1] * sx + z1 * cx
      const R = Math.min(w, h) * 0.42
      const depth = 1 / (1.9 - z2 * 0.55)
      return { x: w / 2 + x1 * R * depth, y: h / 2 + y1 * R * depth, z: z2 }
    }

    const draw = (now: number) => {
      const cy = Math.cos(rotY + leanY)
      const sy = Math.sin(rotY + leanY)
      const cx = Math.cos(rotX + leanX)
      const sx = Math.sin(rotX + leanX)
      const proj = pts.map((p) => project(p, cy, sy, cx, sx))

      ctx.clearRect(0, 0, w, h)

      // Edges — thinner and dimmer at the back
      ctx.lineWidth = 0.8
      for (const [i, j] of edges) {
        const a = proj[i]
        const b = proj[j]
        const z = (a.z + b.z) / 2
        ctx.strokeStyle = `rgba(169,180,214,${0.06 + (z + 1) * 0.11})`
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
      // Nodes
      for (const p of proj) {
        const a = 0.25 + (p.z + 1) * 0.33
        ctx.fillStyle = `rgba(232,251,255,${a})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, 1 + (p.z + 1) * 0.8, 0, Math.PI * 2)
        ctx.fill()
      }

      // The arc
      if (arc) {
        const age = now - arc.t0
        const drawn = Math.min(1, age / ARC_DRAW_MS)
        const fade = age > ARC_DRAW_MS + ARC_HOLD_MS ? Math.max(0, 1 - (age - ARC_DRAW_MS - ARC_HOLD_MS) / ARC_FADE_MS) : 1
        if (fade <= 0) arc = null
        else {
          const steps = 48
          const pa = project(arc.a, cy, sy, cx, sx)
          const pb = project(arc.b, cy, sy, cx, sx)
          const grad = ctx.createLinearGradient(pa.x, pa.y, pb.x, pb.y)
          grad.addColorStop(0, `rgba(255,79,163,${fade})`)
          grad.addColorStop(1, `rgba(78,168,255,${fade})`)
          ctx.strokeStyle = grad
          ctx.lineWidth = 2.2
          ctx.lineCap = 'round'
          ctx.beginPath()
          const e = 1 - Math.pow(1 - drawn, 3)
          const upto = Math.max(1, Math.round(steps * e))
          for (let s = 0; s <= upto; s++) {
            // lift the arc slightly off the surface so it reads as a path
            const q = slerp(arc.a, arc.b, s / steps)
            const lift = 1 + 0.06 * Math.sin((s / steps) * Math.PI)
            const pp = project([q[0] * lift, q[1] * lift, q[2] * lift], cy, sy, cx, sx)
            if (s === 0) ctx.moveTo(pp.x, pp.y)
            else ctx.lineTo(pp.x, pp.y)
          }
          ctx.stroke()
          // Endpoints
          ctx.fillStyle = `rgba(255,79,163,${fade})`
          ctx.beginPath()
          ctx.arc(pa.x, pa.y, 3.2, 0, Math.PI * 2)
          ctx.fill()
          if (drawn >= 1) {
            ctx.fillStyle = `rgba(78,168,255,${fade})`
            ctx.beginPath()
            ctx.arc(pb.x, pb.y, 3.2, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }
    }

    let pointerActive = false
    let connection = 0
    let bounds = canvas.getBoundingClientRect()
    const loop = createSceneLoop(canvas, {
      tick: (_elapsed, delta) => {
        sceneTime += delta
        rotY += delta * 0.000035
        const smoothing = 1 - Math.exp(-delta / 130)
        leanX += (targetLeanX - leanX) * smoothing
        leanY += (targetLeanY - leanY) * smoothing
        if (!arc && sceneTime >= nextArc) {
          const a = (12 + connection * 37) % N
          const b = (100 + connection * 23) % N
          arc = { a: pts[a], b: pts[a === b ? (b + 47) % N : b], t0: sceneTime }
          connection++
          nextArc = sceneTime + ARC_DRAW_MS + ARC_HOLD_MS + ARC_FADE_MS + 1800
        }
        draw(sceneTime)
      },
      still: () => {
        leanX = 0; leanY = 0; targetLeanX = 0; targetLeanY = 0
        arc = { a: pts[12], b: pts[100], t0: sceneTime - ARC_DRAW_MS }
        nextArc = sceneTime + ARC_HOLD_MS + ARC_FADE_MS + 1800
        draw(sceneTime)
      },
      motion: setReduced,
    })
    control.current = () => {
      if (loop.reduced()) return
      running = !running; setPlaying(running)
      if (running) loop.play()
      else loop.pause()
    }
    const onEnter = () => { bounds = canvas.getBoundingClientRect(); pointerActive = true }
    const onPointer = (event: PointerEvent) => {
      if (!fine || !running || loop.reduced() || !pointerActive || event.pointerType === 'touch') return
      targetLeanX = ((event.clientY - bounds.top) / bounds.height - .5) * .12
      targetLeanY = ((event.clientX - bounds.left) / bounds.width - .5) * .18
    }
    const onLeave = () => {
      pointerActive = false; targetLeanX = 0; targetLeanY = 0
    }
    canvas.addEventListener('pointerenter', onEnter)
    canvas.addEventListener('pointermove', onPointer, { passive: true })
    canvas.addEventListener('pointerleave', onLeave)
    canvas.addEventListener('pointercancel', onLeave)
    const ro = new ResizeObserver(() => { resize(); bounds = canvas.getBoundingClientRect() })
    ro.observe(canvas)
    resize()
    return () => {
      control.current = null
      loop.dispose(); ro.disconnect()
      canvas.removeEventListener('pointerenter', onEnter)
      canvas.removeEventListener('pointermove', onPointer)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('pointercancel', onLeave)
    }
  }, [])

  return <>
    <canvas ref={ref} data-node-sphere aria-hidden="true" className={className} />
    {host && !reduced && createPortal(
      <button type="button" className="cgs-sphere-pause" data-interactive onClick={() => control.current?.()}
        aria-label={playing ? 'Pause node sphere' : 'Resume node sphere'}>{playing ? 'Pause animation' : 'Resume animation'}</button>,
      host,
    )}
  </>
}
