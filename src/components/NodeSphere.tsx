import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from '../lib/motion'
import { isPaging } from '../lib/scroll'

/**
 * A wireframe sphere of nodes — a Fibonacci lattice joined to its nearest
 * neighbours — turning slowly and leaning toward the pointer. Every few
 * seconds a gradient arc (magenta → the world's blue) draws itself along a
 * great circle between two nodes, holds, and fades: connections being made.
 *
 * Canvas 2D, DPR capped at 2, ~220 nodes / ~330 edges per frame; the loop
 * only runs while the sphere is near the viewport and idles while the page
 * is flung. Reduced motion draws one still frame.
 */

const N = 220
const K = 3
const ARC_EVERY_MS = 2600
const ARC_DRAW_MS = 1300
const ARC_HOLD_MS = 900
const ARC_FADE_MS = 700

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

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const pts = lattice(N)
    const edges = neighbours(pts, K)
    const reduced = prefersReducedMotion()
    const fine = window.matchMedia('(pointer: fine)').matches

    let w = 0
    let h = 0
    let dpr = 1
    let raf = 0
    let near = false
    let last = performance.now()
    let rotY = 0.4
    let rotX = -0.35
    let leanX = 0
    let leanY = 0
    let targetLeanX = 0
    let targetLeanY = 0
    let arc: { a: Vec; b: Vec; t0: number } | null = null
    let nextArc = performance.now() + 1200

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      const r = canvas.getBoundingClientRect()
      w = Math.max(1, Math.round(r.width))
      h = Math.max(1, Math.round(r.height))
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (reduced) draw(performance.now())
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
      const cy = Math.cos(rotY)
      const sy = Math.sin(rotY)
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

    const frame = (now: number) => {
      raf = 0
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      if (!isPaging()) {
        rotY += dt * 0.12
        leanX += (targetLeanX - leanX) * 0.04
        leanY += (targetLeanY - leanY) * 0.04
        rotY += (leanY - 0) * 0.002
        if (!arc && now >= nextArc) {
          const i = Math.floor(Math.random() * N)
          let j = Math.floor(Math.random() * N)
          if (j === i) j = (j + 37) % N
          arc = { a: pts[i], b: pts[j], t0: now }
          nextArc = now + ARC_DRAW_MS + ARC_HOLD_MS + ARC_FADE_MS + ARC_EVERY_MS * (0.6 + Math.random() * 0.8)
        }
      }
      draw(now)
      if (near && !document.hidden) raf = requestAnimationFrame(frame)
    }
    const start = () => {
      if (!raf && near && !reduced && !document.hidden) {
        last = performance.now()
        raf = requestAnimationFrame(frame)
      }
    }

    const io = new IntersectionObserver(
      (entries) => {
        near = entries[0]?.isIntersecting ?? false
        if (near) start()
      },
      { rootMargin: '30% 0px' },
    )
    io.observe(canvas)

    const onPointer = (e: PointerEvent) => {
      targetLeanX = (e.clientY / window.innerHeight - 0.5) * 0.5
      targetLeanY = (e.clientX / window.innerWidth - 0.5) * 0.8
    }
    if (fine && !reduced) window.addEventListener('pointermove', onPointer, { passive: true })
    const onVis = () => start()
    document.addEventListener('visibilitychange', onVis)
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()
    if (reduced) {
      // One still frame with a finished arc so the idea still reads
      arc = { a: pts[12], b: pts[140], t0: performance.now() - ARC_DRAW_MS }
      draw(performance.now())
    }

    return () => {
      if (raf) cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      window.removeEventListener('pointermove', onPointer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  return <canvas ref={ref} aria-hidden="true" className={className} />
}
