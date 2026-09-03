import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from '../lib/motion'

/**
 * Network flow — a layered network (4 inputs fanning out through wider
 * hidden layers to a few outputs) that BUILDS itself on enter, then keeps
 * re-routing: every connection blinks on and off many times a second and
 * pulses race along whichever edges are live, so the graph never settles.
 * Canvas 2D on the white sheet, navy/blue, DPR capped; the loop runs only
 * while the canvas is near the viewport. Reduced motion draws one still
 * frame with a few lit paths.
 */

const LAYERS = [4, 7, 9, 6, 2]
const NAVY = '10,30,63'
const BLUE = '30,94,255'
/** ms an edge stays in a state before it may flip again — many flips a second */
const FLIP_MIN = 45
const FLIP_MAX = 160
const PULSE_MS = 420

interface Node {
  x: number
  y: number
  heat: number
}
interface Edge {
  a: number
  b: number
  on: boolean
  next: number
  born: number
}
interface Pulse {
  e: number
  t0: number
}

export default function NetworkFlow({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const reduced = prefersReducedMotion()

    let w = 0
    let h = 0
    let dpr = 1
    let raf = 0
    let near = false
    let last = performance.now()
    let t0 = performance.now()
    const nodes: Node[] = []
    const edges: Edge[] = []
    const pulses: Pulse[] = []
    const layerOf: number[] = []

    // Lattice in unit space; resize maps it onto the canvas
    const unit: Array<{ u: number; v: number }> = []
    LAYERS.forEach((n, li) => {
      for (let i = 0; i < n; i++) {
        unit.push({ u: (li + 0.5) / LAYERS.length, v: (i + 0.5) / n })
        layerOf.push(li)
      }
    })
    let offset = 0
    LAYERS.forEach((n, li) => {
      if (li === LAYERS.length - 1) return
      const nextN = LAYERS[li + 1]
      for (let i = 0; i < n; i++)
        for (let j = 0; j < nextN; j++)
          edges.push({ a: offset + i, b: offset + n + j, on: Math.random() < 0.35, next: 0, born: 0 })
      offset += n
    })
    unit.forEach(() => nodes.push({ x: 0, y: 0, heat: 0 }))

    const layout = () => {
      unit.forEach((p, i) => {
        // hidden layers spread taller than the ends: a lens shape
        const spread = 0.62 + 0.38 * Math.sin(Math.PI * p.u)
        nodes[i].x = 24 + p.u * (w - 48)
        nodes[i].y = h / 2 + (p.v - 0.5) * h * spread
      })
    }

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      const r = canvas.getBoundingClientRect()
      w = Math.max(1, Math.round(r.width))
      h = Math.max(1, Math.round(r.height))
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      layout()
      if (reduced) draw(performance.now(), 1)
    }

    /** Build-in: layers appear left→right over ~1.6 s; edges draw as their layer arrives. */
    const buildProgress = (now: number) => Math.min(1, (now - t0) / 1600)

    const draw = (now: number, build: number) => {
      ctx.clearRect(0, 0, w, h)
      const layersShown = build * (LAYERS.length + 0.5)

      // Edges
      ctx.lineCap = 'round'
      for (let k = 0; k < edges.length; k++) {
        const e = edges[k]
        const la = layerOf[e.a]
        const reveal = Math.max(0, Math.min(1, layersShown - la - 0.6))
        if (reveal <= 0) continue
        const A = nodes[e.a]
        const B = nodes[e.b]
        const x2 = A.x + (B.x - A.x) * reveal
        const y2 = A.y + (B.y - A.y) * reveal
        ctx.strokeStyle = e.on ? `rgba(${BLUE},0.75)` : `rgba(${NAVY},0.10)`
        ctx.lineWidth = e.on ? 1.4 : 0.8
        ctx.beginPath()
        ctx.moveTo(A.x, A.y)
        ctx.lineTo(x2, y2)
        ctx.stroke()
      }

      // Pulses along live edges
      for (const p of pulses) {
        const e = edges[p.e]
        const f = (now - p.t0) / PULSE_MS
        if (f < 0 || f > 1) continue
        const A = nodes[e.a]
        const B = nodes[e.b]
        const x = A.x + (B.x - A.x) * f
        const y = A.y + (B.y - A.y) * f
        ctx.fillStyle = `rgba(${BLUE},${0.95 * (1 - f * 0.4)})`
        ctx.beginPath()
        ctx.arc(x, y, 2.6, 0, Math.PI * 2)
        ctx.fill()
      }

      // Nodes: navy discs, a blue heat ring when signals arrive
      nodes.forEach((n, i) => {
        const reveal = Math.max(0, Math.min(1, layersShown - layerOf[i]))
        if (reveal <= 0) return
        const r = (3.2 + (layerOf[i] === 0 || layerOf[i] === LAYERS.length - 1 ? 1.4 : 0)) * reveal
        if (n.heat > 0.02) {
          ctx.fillStyle = `rgba(${BLUE},${n.heat * 0.35})`
          ctx.beginPath()
          ctx.arc(n.x, n.y, r + 6 * n.heat, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.fillStyle = `rgba(${NAVY},${0.55 + 0.45 * reveal})`
        ctx.beginPath()
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
        ctx.fill()
        if (n.heat > 0.02) {
          ctx.fillStyle = `rgba(${BLUE},${n.heat})`
          ctx.beginPath()
          ctx.arc(n.x, n.y, r * 0.55, 0, Math.PI * 2)
          ctx.fill()
        }
      })
    }

    const frame = (now: number) => {
      raf = 0
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const build = buildProgress(now)

      // Re-route: each edge flips after its own short random hold
      for (let k = 0; k < edges.length; k++) {
        const e = edges[k]
        if (now >= e.next) {
          const wasOn = e.on
          e.on = Math.random() < 0.38
          e.next = now + FLIP_MIN + Math.random() * (FLIP_MAX - FLIP_MIN)
          if (e.on && !wasOn && build > 0.6 && pulses.length < 90) pulses.push({ e: k, t0: now })
        }
      }
      // Pulses that arrive heat their target node; heat cools
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i]
        const f = (now - p.t0) / PULSE_MS
        if (f >= 1) {
          nodes[edges[p.e].b].heat = Math.min(1, nodes[edges[p.e].b].heat + 0.6)
          pulses.splice(i, 1)
        }
      }
      for (const n of nodes) n.heat = Math.max(0, n.heat - dt * 2.2)

      draw(now, build)
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
        const was = near
        near = entries[0]?.isIntersecting ?? false
        if (near && !was) t0 = performance.now() // build again when it comes back
        if (near) start()
      },
      { rootMargin: '20% 0px' },
    )
    io.observe(canvas)
    const onVis = () => start()
    document.addEventListener('visibilitychange', onVis)
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()
    if (reduced) {
      edges.forEach((e, k) => (e.on = k % 7 === 0))
      draw(performance.now(), 1)
    }

    return () => {
      if (raf) cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  return <canvas ref={ref} aria-hidden="true" className={className} />
}
