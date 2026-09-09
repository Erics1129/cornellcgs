import { useEffect, useId, useRef, useState } from 'react'
import './scopedMotion.css'

/** Graph algorithms autoplay on a stable graph, hold the result, then gently
 * replay. Only an explicit pause stops playback intent; visibility and motion
 * preferences suspend the scene clock without changing that intent. */

export type Algo = 'kruskal' | 'prim' | 'dijkstra' | 'astar' | 'bfs' | 'dfs'

const NAVY = '10,30,63'
const BLUE = '30,94,255'
const AMBER = '255,158,66'
const MUTED = '70,88,122'
const N = 26
const STEP_MS = 420
const HOLD_MS = 1800
const FADE_MS = 900

interface Node {
  x: number
  y: number
}
interface Edge {
  a: number
  b: number
  w: number
}
/** One frame of the replay: what to paint and how */
interface Step {
  tree?: number[] // edge indices in the result (MST / SPT / traversal tree)
  path?: number[] // node sequence to emphasise (shortest path / DFS walk)
  consider?: number // edge under consideration
  reject?: number // edge just thrown away
  settled?: number[] // nodes finished
  frontier?: number[] // nodes in the open set / queue
  dist?: Record<number, number> // labels
  depth?: Record<number, number>
  current?: number
  source?: number
  target?: number
  note: string
}

const dist = (a: Node, b: Node) => Math.hypot(a.x - b.x, a.y - b.y)

/** Random geometric graph: spaced nodes, k-nearest edges, made connected. */
function makeGraph(w: number, h: number, rnd: () => number): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const pad = Math.min(28, w / 5, h / 5)
  const minGap = Math.min(w, h) / 6.5
  let tries = 0
  while (nodes.length < N && tries++ < 4000) {
    const p = { x: pad + rnd() * (w - pad * 2), y: pad + rnd() * (h - pad * 2) }
    if (nodes.every((q) => dist(p, q) > minGap)) nodes.push(p)
  }
  const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`)
  const seen = new Set<string>()
  const edges: Edge[] = []
  const add = (a: number, b: number) => {
    const k = key(a, b)
    if (a === b || seen.has(k)) return
    seen.add(k)
    edges.push({ a, b, w: dist(nodes[a], nodes[b]) })
  }
  nodes.forEach((p, i) => {
    const near = nodes
      .map((q, j) => [dist(p, q), j] as const)
      .filter(([, j]) => j !== i)
      .sort((x, y) => x[0] - y[0])
      .slice(0, 3)
    near.forEach(([, j]) => add(i, j))
  })
  // connect components through their nearest pair
  const parent = nodes.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  edges.forEach((e) => (parent[find(e.a)] = find(e.b)))
  for (;;) {
    const roots = new Set(nodes.map((_, i) => find(i)))
    if (roots.size <= 1) break
    const [r0] = roots
    let best: [number, number, number] | null = null
    nodes.forEach((p, i) => {
      if (find(i) !== r0) return
      nodes.forEach((q, j) => {
        if (find(j) === r0) return
        const d = dist(p, q)
        if (!best || d < best[0]) best = [d, i, j]
      })
    })
    if (!best) break
    const [, i, j] = best as [number, number, number]
    add(i, j)
    parent[find(i)] = find(j)
  }
  return { nodes, edges }
}

/* ------------------------------------------------------------------------ */

function adjacency(n: number, edges: Edge[]) {
  const adj: Array<Array<[number, number]>> = Array.from({ length: n }, () => [])
  edges.forEach((e, k) => {
    adj[e.a].push([e.b, k])
    adj[e.b].push([e.a, k])
  })
  return adj
}

function runKruskal(nodes: Node[], edges: Edge[]): Step[] {
  const order = edges.map((e, k) => k).sort((x, y) => edges[x].w - edges[y].w)
  const parent = nodes.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const tree: number[] = []
  const steps: Step[] = [{ note: 'sort edges by weight' }]
  for (const k of order) {
    const e = edges[k]
    steps.push({ tree: [...tree], consider: k, note: `try ${e.w.toFixed(0)}` })
    if (find(e.a) !== find(e.b)) {
      parent[find(e.a)] = find(e.b)
      tree.push(k)
      steps.push({ tree: [...tree], note: 'take' })
    } else steps.push({ tree: [...tree], reject: k, note: 'cycle — skip' })
    if (tree.length === nodes.length - 1) break
  }
  steps.push({ tree: [...tree], note: 'minimum spanning tree' })
  return steps
}

function runPrim(nodes: Node[], edges: Edge[], seed: number): Step[] {
  const adj = adjacency(nodes.length, edges)
  const inTree = new Set([seed])
  const tree: number[] = []
  const steps: Step[] = [{ settled: [seed], source: seed, note: 'seed' }]
  while (inTree.size < nodes.length) {
    let best: [number, number, number] | null = null
    for (const u of inTree)
      for (const [v, k] of adj[u]) if (!inTree.has(v) && (!best || edges[k].w < best[0])) best = [edges[k].w, k, v]
    if (!best) break
    const [, k, v] = best
    steps.push({ tree: [...tree], settled: [...inTree], frontier: [v], consider: k, source: seed, note: 'cheapest frontier edge' })
    tree.push(k)
    inTree.add(v)
    steps.push({ tree: [...tree], settled: [...inTree], source: seed, note: 'grow' })
  }
  steps.push({ tree: [...tree], settled: [...inTree], source: seed, note: 'minimum spanning tree' })
  return steps
}

function runDijkstra(nodes: Node[], edges: Edge[], src: number): Step[] {
  const adj = adjacency(nodes.length, edges)
  const d = nodes.map(() => Infinity)
  const via: Record<number, number> = {}
  d[src] = 0
  const done = new Set<number>()
  const steps: Step[] = [{ source: src, dist: { [src]: 0 }, frontier: [src], note: 'source' }]
  const tree: number[] = []
  const label = () => Object.fromEntries(nodes.map((_, i) => [i, d[i]]).filter(([, v]) => Number.isFinite(v)))
  while (done.size < nodes.length) {
    let u = -1
    nodes.forEach((_, i) => {
      if (!done.has(i) && Number.isFinite(d[i]) && (u < 0 || d[i] < d[u])) u = i
    })
    if (u < 0) break
    done.add(u)
    if (via[u] !== undefined) tree.push(via[u])
    const frontier = nodes.map((_, i) => i).filter((i) => !done.has(i) && Number.isFinite(d[i]))
    steps.push({ source: src, tree: [...tree], settled: [...done], frontier, current: u, dist: label(), note: 'settle nearest' })
    for (const [v, k] of adj[u]) {
      if (done.has(v)) continue
      const nd = d[u] + edges[k].w
      if (nd < d[v]) {
        d[v] = nd
        via[v] = k
        steps.push({ source: src, tree: [...tree], settled: [...done], frontier: [...frontier, v], current: u, consider: k, dist: label(), note: 'relax' })
      }
    }
  }
  // the farthest node's path, for the finale
  let far = src
  nodes.forEach((_, i) => {
    if (Number.isFinite(d[i]) && d[i] > d[far]) far = i
  })
  const path = [far]
  while (path[0] !== src) {
    const k = via[path[0]]
    const e = edges[k]
    path.unshift(e.a === path[0] ? e.b : e.a)
  }
  steps.push({ source: src, target: far, tree: [...tree], settled: [...done], dist: label(), path, note: 'shortest paths' })
  return steps
}

function runAstar(nodes: Node[], edges: Edge[], src: number, dst: number): Step[] {
  const adj = adjacency(nodes.length, edges)
  const h = (i: number) => dist(nodes[i], nodes[dst])
  const g = nodes.map(() => Infinity)
  const via: Record<number, number> = {}
  g[src] = 0
  const open = new Set([src])
  const closed = new Set<number>()
  const steps: Step[] = [{ source: src, target: dst, frontier: [src], note: 'open the source' }]
  const label = () => Object.fromEntries([...open, ...closed].map((i) => [i, g[i] + h(i)]))
  while (open.size) {
    let u = -1
    for (const i of open) if (u < 0 || g[i] + h(i) < g[u] + h(u)) u = i
    open.delete(u)
    closed.add(u)
    const tree = [...closed].map((i) => via[i]).filter((k) => k !== undefined)
    steps.push({ source: src, target: dst, tree, settled: [...closed], frontier: [...open], current: u, dist: label(), note: 'lowest f = g + h' })
    if (u === dst) break
    for (const [v, k] of adj[u]) {
      if (closed.has(v)) continue
      const ng = g[u] + edges[k].w
      if (ng < g[v]) {
        g[v] = ng
        via[v] = k
        open.add(v)
        steps.push({ source: src, target: dst, tree, settled: [...closed], frontier: [...open], current: u, consider: k, dist: label(), note: 'open' })
      }
    }
  }
  const path = [dst]
  while (path[0] !== src && via[path[0]] !== undefined) {
    const e = edges[via[path[0]]]
    path.unshift(e.a === path[0] ? e.b : e.a)
  }
  const tree = [...closed].map((i) => via[i]).filter((k) => k !== undefined)
  steps.push({ source: src, target: dst, tree, settled: [...closed], path, note: 'path found' })
  return steps
}

function runBfs(nodes: Node[], edges: Edge[], src: number): Step[] {
  const adj = adjacency(nodes.length, edges)
  const depth: Record<number, number> = { [src]: 0 }
  const queue = [src]
  const tree: number[] = []
  const seen = new Set([src])
  const steps: Step[] = [{ source: src, frontier: [src], depth: { ...depth }, note: 'source' }]
  while (queue.length) {
    const u = queue.shift()!
    for (const [v, k] of adj[u]) {
      if (seen.has(v)) continue
      seen.add(v)
      depth[v] = depth[u] + 1
      queue.push(v)
      tree.push(k)
    }
    steps.push({ source: src, tree: [...tree], settled: [...seen].filter((i) => !queue.includes(i)), frontier: [...queue], current: u, depth: { ...depth }, note: `layer ${depth[u]}` })
  }
  steps.push({ source: src, tree: [...tree], settled: [...seen], depth: { ...depth }, note: 'every node reached' })
  return steps
}

function runDfs(nodes: Node[], edges: Edge[], src: number): Step[] {
  const adj = adjacency(nodes.length, edges)
  const seen = new Set<number>()
  const tree: number[] = []
  const steps: Step[] = []
  const stack: number[] = []
  const visit = (u: number) => {
    seen.add(u)
    stack.push(u)
    steps.push({ source: src, tree: [...tree], settled: [...seen], path: [...stack], current: u, note: 'go deeper' })
    for (const [v, k] of adj[u].sort((p, q) => edges[p[1]].w - edges[q[1]].w)) {
      if (seen.has(v)) continue
      tree.push(k)
      visit(v)
      steps.push({ source: src, tree: [...tree], settled: [...seen], path: [...stack], current: u, note: 'backtrack' })
    }
    stack.pop()
  }
  visit(src)
  steps.push({ source: src, tree: [...tree], settled: [...seen], note: 'walk complete' })
  return steps
}

/* ------------------------------------------------------------------------ */

export const ALGO_LABEL: Record<Algo, string> = {
  kruskal: "Kruskal's minimum spanning tree",
  prim: "Prim's minimum spanning tree",
  dijkstra: "Dijkstra's shortest paths",
  astar: 'A* search',
  bfs: 'Breadth-first search',
  dfs: 'Depth-first search',
}

/** One cancellable scheduler shared by the three canvas scenes. The scene clock
 * advances only while actually visible. Media changes preserve explicit pause. */
export function createSceneLoop(canvas: HTMLCanvasElement, callbacks: {
  tick: (elapsed: number, delta: number) => void
  still: () => void
  motion?: (reduced: boolean) => void
}) {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)')
  let near = false
  let wanted = true
  let raf = 0
  let elapsed = 0
  let last = 0
  let disposed = false
  const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; last = 0 }
  const frame = (now: number) => {
    raf = 0
    if (disposed || !near || document.hidden || media.matches || !wanted) return
    const delta = last ? Math.min(now - last, 48) : 0
    last = now
    elapsed += delta
    callbacks.tick(elapsed, delta)
    if (wanted) raf = requestAnimationFrame(frame)
    else last = 0
  }
  const sync = () => {
    if (disposed || !near || document.hidden || media.matches || !wanted) stop()
    else if (!raf) raf = requestAnimationFrame(frame)
  }
  const motion = () => {
    if (media.matches) { stop(); callbacks.still() }
    callbacks.motion?.(media.matches)
    sync()
  }
  const io = new IntersectionObserver((entries) => {
    const entry = entries[0]
    near = !!entry?.isIntersecting && entry.intersectionRatio > 0
    sync()
  }, { threshold: [0, 0.01] })
  io.observe(canvas)
  media.addEventListener('change', motion)
  document.addEventListener('visibilitychange', sync)
  motion()
  return {
    play: () => { wanted = true; sync() },
    pause: () => { wanted = false; stop() },
    reduced: () => media.matches,
    dispose: () => { disposed = true; stop(); io.disconnect(); media.removeEventListener('change', motion); document.removeEventListener('visibilitychange', sync) },
  }
}

export default function GraphAlgo({ algo, className = '' }: { algo: Algo; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const statusRef = useRef<HTMLSpanElement>(null)
  const controls = useRef<{ toggle: () => void } | null>(null)
  const [playing, setPlaying] = useState(true)
  const [reduced, setReduced] = useState(false)
  const id = useId()

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    let w = 0
    let h = 0
    let nodes: Node[] = []
    let edges: Edge[] = []
    let steps: Step[] = []
    let at = 0
    let progress = 0
    let running = true
    setPlaying(true)
    let seed = (Date.now() % 10007) || 1
    const rnd = () => {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5
      return ((seed >>> 0) % 100000) / 100000
    }
    const deal = () => {
      const g = makeGraph(w, h, rnd)
      nodes = g.nodes; edges = g.edges
      const src = Math.floor(rnd() * nodes.length)
      let dst = src
      nodes.forEach((p, i) => { if (dist(p, nodes[src]) > dist(nodes[dst], nodes[src])) dst = i })
      steps = algo === 'kruskal' ? runKruskal(nodes, edges)
        : algo === 'prim' ? runPrim(nodes, edges, src)
        : algo === 'dijkstra' ? runDijkstra(nodes, edges, src)
        : algo === 'astar' ? runAstar(nodes, edges, src, dst)
        : algo === 'bfs' ? runBfs(nodes, edges, src) : runDfs(nodes, edges, src)
      at = 0; progress = 0
    }
    const status = () => {
      if (statusRef.current) statusRef.current.textContent = `${at + 1} / ${steps.length} · ${steps[at]?.note ?? ''}`
    }
    const draw = (s: Step, blend: number, emphasis = 1) => {
      ctx.clearRect(0, 0, w, h)
      const tree = new Set(s.tree ?? [])
      const previousTree = new Set(steps[Math.max(0, at - 1)]?.tree ?? [])
      const settled = new Set(s.settled ?? [])
      const frontier = new Set(s.frontier ?? [])
      const pathEdges = new Set<string>()
      if (s.path) for (let i = 1; i < s.path.length; i++) pathEdges.add(`${Math.min(s.path[i - 1], s.path[i])}-${Math.max(s.path[i - 1], s.path[i])}`)
      ctx.lineCap = 'round'
      edges.forEach((e, k) => {
        const A = nodes[e.a], B = nodes[e.b]
        const onPath = pathEdges.has(`${Math.min(e.a, e.b)}-${Math.max(e.a, e.b)}`)
        ctx.globalAlpha = 1
        ctx.strokeStyle = `rgba(${NAVY},0.10)`; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke()
        if (!tree.has(k) && s.consider !== k && s.reject !== k && !onPath) return
        ctx.globalAlpha = emphasis
        ctx.strokeStyle = onPath ? `rgba(${AMBER},.95)` : s.consider === k ? `rgba(${AMBER},.9)` : s.reject === k ? `rgba(180,60,90,${.6 * (1 - blend)})` : `rgba(${BLUE},.85)`
        ctx.lineWidth = onPath ? 2.8 : 1.8
        const t = tree.has(k) && !previousTree.has(k) ? 1 - (1 - blend) ** 3 : 1
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t); ctx.stroke()
      })
      ctx.globalAlpha = emphasis
      if (algo === 'astar' && s.current !== undefined && s.target !== undefined) {
        ctx.setLineDash([3, 5]); ctx.strokeStyle = `rgba(${AMBER},.5)`; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(nodes[s.current].x, nodes[s.current].y); ctx.lineTo(nodes[s.target].x, nodes[s.target].y); ctx.stroke(); ctx.setLineDash([])
      }
      nodes.forEach((p, i) => {
        const isSrc = s.source === i, isDst = s.target === i
        const r = isSrc || isDst ? 5.5 : 4
        ctx.globalAlpha = 1
        ctx.fillStyle = `rgba(${NAVY},.9)`
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill()
        ctx.globalAlpha = emphasis
        if (frontier.has(i)) {
          ctx.strokeStyle = `rgba(${AMBER},.9)`; ctx.lineWidth = 1.5
          ctx.beginPath(); ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2); ctx.stroke()
        }
        if (s.current === i) {
          ctx.fillStyle = `rgba(${AMBER},.2)`
          ctx.beginPath(); ctx.arc(p.x, p.y, r + 8, 0, Math.PI * 2); ctx.fill()
        }
        ctx.fillStyle = isSrc ? `rgba(${AMBER},1)` : isDst ? 'rgba(180,60,90,1)' : settled.has(i) || tree.size >= nodes.length - 1 ? `rgba(${BLUE},1)` : `rgba(${NAVY},.9)`
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill()
        const label = s.dist?.[i] ?? s.depth?.[i]
        if (label !== undefined) {
          ctx.font = '600 10px ui-monospace, monospace'; ctx.fillStyle = `rgba(${MUTED},.95)`
          ctx.fillText(String(Math.round(label)), Math.min(w - 25, p.x + 7), p.y - 7)
        }
      })
      ctx.globalAlpha = 1
    }
    const render = () => { if (steps.length) { draw(steps[at], 1); status() } }
    const resize = () => {
      const r = canvas.getBoundingClientRect()
      const nextW = Math.max(80, Math.round(r.width)), nextH = Math.max(60, Math.round(r.height))
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      if (w === nextW && h === nextH && canvas.width === Math.round(nextW * dpr)) return
      // Preserve the graph and replay position when the viewport changes.
      if (w && h) nodes.forEach((p) => { p.x *= nextW / w; p.y *= nextH / h })
      w = nextW; h = nextH
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (!steps.length) deal()
      render()
    }
    resize()
    const loop = createSceneLoop(canvas, {
      tick: (_elapsed, delta) => {
        progress += delta
        if (at < steps.length - 1 && progress >= STEP_MS) { at++; progress = 0; status() }
        const last = at === steps.length - 1
        const fade = last ? Math.max(0, 1 - (progress - STEP_MS - HOLD_MS) / FADE_MS) : 1
        draw(steps[at], Math.min(1, progress / STEP_MS), Math.min(1, fade))
        if (last && progress >= STEP_MS + HOLD_MS + FADE_MS) { at = 0; progress = 0; status() }
      },
      still: () => { at = steps.length - 1; progress = STEP_MS; render() },
      motion: setReduced,
    })
    controls.current = {
      toggle: () => {
        if (loop.reduced()) return
        running = !running
        setPlaying(running)
        if (running) loop.play()
        else loop.pause()
      },
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    return () => { controls.current = null; loop.dispose(); ro.disconnect() }
  }, [algo])

  return (
    <figure className={`cgs-scene ${className}`} aria-labelledby={id}>
      <canvas ref={ref} role="img" aria-label={`${ALGO_LABEL[algo]}. Blue edges show the tree; amber shows the current search or selected path.`} />
      <figcaption id={id} className="cgs-scene-caption">
        <span>{ALGO_LABEL[algo]}<span ref={statusRef} className="cgs-scene-status" /></span>
        {!reduced && <button type="button" className="cgs-scene-pause" onClick={() => controls.current?.toggle()} aria-label={playing ? 'Pause algorithm' : 'Resume algorithm'}>{playing ? 'Pause' : 'Resume'}</button>}
      </figcaption>
    </figure>
  )
}
