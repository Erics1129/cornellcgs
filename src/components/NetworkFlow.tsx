import { useEffect, useId, useRef, useState } from 'react'
import { createSceneLoop } from './GraphAlgo'
import './scopedMotion.css'

const LAYERS = [4, 7, 9, 6, 2]
const BUILD_MS = 800
const SIGNAL_MS = 650
const DURATION = BUILD_MS + SIGNAL_MS * (LAYERS.length - 1)
const HOLD_MS = 1600
const FADE_MS = 900
type Point = { x: number; y: number; layer: number }

/** Inputs take turns sending one slow signal through a stationary network.
 * The completed path holds, fades, and advances automatically while visible. */
export default function NetworkFlow({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const actions = useRef<{ toggle: () => void } | null>(null)
  const [playing, setPlaying] = useState(true)
  const [reduced, setReduced] = useState(false)
  const id = useId()

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    let w = 1, h = 1, progress = 0, selected = 0, running = true
    setPlaying(true)
    const nodes: Point[] = []
    const layers: number[][] = []
    const edges: Array<[number, number]> = []
    LAYERS.forEach((count, layer) => {
      const indices: number[] = []
      for (let i = 0; i < count; i++) { indices.push(nodes.length); nodes.push({ x: 0, y: 0, layer }) }
      layers.push(indices)
      if (layer) layers[layer - 1].forEach((a) => indices.forEach((b) => edges.push([a, b])))
    })
    const route = () => layers.map((indices, layer) => indices[(selected * (layer + 1) + layer * 2) % indices.length])
    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      ctx.lineCap = 'round'
      const build = Math.min(1, progress / BUILD_MS)
      const path = route()
      const emphasis = Math.max(0, Math.min(1, 1 - (progress - DURATION - HOLD_MS) / FADE_MS))
      for (const [a, b] of edges) {
        const A = nodes[a], B = nodes[b]
        const t = Math.max(0, Math.min(1, build * LAYERS.length - A.layer))
        ctx.strokeStyle = 'rgba(10,30,63,.09)'; ctx.lineWidth = .8
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t); ctx.stroke()
      }
      ctx.globalAlpha = emphasis
      for (let layer = 0; layer < path.length - 1; layer++) {
        const A = nodes[path[layer]], B = nodes[path[layer + 1]]
        const t = Math.max(0, Math.min(1, (progress - BUILD_MS - layer * SIGNAL_MS) / SIGNAL_MS))
        if (!t) continue
        ctx.strokeStyle = 'rgba(30,94,255,.85)'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t); ctx.stroke()
        if (t < 1) {
          ctx.fillStyle = '#1e5eff'; ctx.beginPath(); ctx.arc(A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t, 3, 0, Math.PI * 2); ctx.fill()
        }
      }
      nodes.forEach((point, i) => {
        const reached = path.includes(i) && progress >= BUILD_MS + point.layer * SIGNAL_MS
        ctx.globalAlpha = 1
        ctx.fillStyle = 'rgba(10,30,63,.65)'
        ctx.beginPath(); ctx.arc(point.x, point.y, point.layer === 0 || point.layer === 4 ? 4.5 : 3, 0, Math.PI * 2); ctx.fill()
        if (reached) {
          ctx.globalAlpha = emphasis; ctx.fillStyle = '#1e5eff'
          ctx.beginPath(); ctx.arc(point.x, point.y, point.layer === 0 || point.layer === 4 ? 4.5 : 3, 0, Math.PI * 2); ctx.fill()
        }
        ctx.globalAlpha = 1
        if (point.layer === 0) {
          const n = layers[0].indexOf(i)
          ctx.font = '11px ui-monospace, monospace'; ctx.fillStyle = '#46587a'
          ctx.fillText(String(n + 1), point.x - 20, point.y + 4)
          if (n === selected) {
            ctx.globalAlpha = emphasis
            ctx.strokeStyle = '#1e5eff'; ctx.lineWidth = 1
            ctx.beginPath(); ctx.arc(point.x, point.y, 9, 0, Math.PI * 2); ctx.stroke()
          }
        }
      })
      ctx.globalAlpha = 1
    }
    const resize = () => {
      const box = canvas.getBoundingClientRect()
      w = Math.max(80, Math.round(box.width)); h = Math.max(50, Math.round(box.height))
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      layers.forEach((indices, layer) => indices.forEach((index, row) => {
        nodes[index].x = 30 + layer / (LAYERS.length - 1) * (w - 54)
        nodes[index].y = 14 + (row + .5) / indices.length * (h - 28)
      }))
      draw()
    }
    resize()
    const loop = createSceneLoop(canvas, {
      tick: (_elapsed, delta) => {
        progress += delta
        if (progress >= DURATION + HOLD_MS + FADE_MS) {
          selected = (selected + 1) % LAYERS[0]
          progress = BUILD_MS
        }
        draw()
      },
      still: () => { progress = DURATION; draw() },
      motion: setReduced,
    })
    actions.current = {
      toggle: () => {
        if (loop.reduced()) return
        running = !running; setPlaying(running)
        if (running) loop.play()
        else loop.pause()
      },
    }
    const ro = new ResizeObserver(resize); ro.observe(canvas)
    return () => { actions.current = null; loop.dispose(); ro.disconnect() }
  }, [])

  return (
    <figure className={`cgs-scene ${className}`} aria-labelledby={id}>
      <canvas ref={ref} role="img" aria-label="Layered network. A blue signal traces a path from an input through hidden layers to an output." />
      <figcaption id={id} className="cgs-scene-caption">
        <span>Network flow<span className="cgs-scene-status">Input → hidden layers → output</span></span>
        {!reduced && <button type="button" className="cgs-scene-pause" onClick={() => actions.current?.toggle()} aria-label={playing ? 'Pause network flow' : 'Resume network flow'}>{playing ? 'Pause' : 'Resume'}</button>}
      </figcaption>
    </figure>
  )
}
