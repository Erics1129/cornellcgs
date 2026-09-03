import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from '../lib/motion'

/**
 * Graph algorithms, run live — the sibling of NetworkFlow. A random
 * geometric graph is drawn, an algorithm walks it step by step (edges lit
 * as they are considered, taken, or thrown away; nodes settle with their
 * distances), the result holds for a beat, and a fresh graph is dealt.
 * Canvas 2D, navy/blue/amber on the white sheet, only while near the
 * viewport. Reduced motion draws the finished result once.
 *
 *   kruskal   MST by weight order with cycle rejection (union–find)
 *   prim      MST grown from one seed along the cheapest frontier edge
 *   dijkstra  single-source shortest paths; nodes settle with distances
 *   astar     A* to a target: open set, closed set, heuristic pull
 *   bfs       breadth-first layers spreading from a source
 *   dfs       depth-first walk with backtracking
 */

export type Algo = 'kruskal' | 'prim' | 'dijkstra' | 'astar' | 'bfs' | 'dfs'

const NAVY = '10,30,63'
const BLUE = '30,94,255'
const AMBER = '255,158,66'
const MUTED = '70,88,122'
const N = 26
const STEP_MS = 150
const HOLD_MS = 1800

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
  const pad = 22
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

export default function GraphAlgo({ algo, className = '' }: { algo: Algo; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const reduced = prefersReducedMotion()
    let w = 0
    let h = 0
    let raf = 0
    let near = false
    let nodes: Node[] = []
    let edges: Edge[] = []
    let steps: Step[] = []
    let at = 0
    let stepAt = 0
    let holdUntil = 0
    let seed = Date.now() % 10007
    const rnd = () => {
      // xorshift — replayable per deal
      seed ^= seed << 13
      seed ^= seed >>> 17
      seed ^= seed << 5
      return ((seed >>> 0) % 100000) / 100000
    }

    const deal = () => {
      const g = makeGraph(w, h, rnd)
      nodes = g.nodes
      edges = g.edges
      const src = Math.floor(rnd() * nodes.length)
      let dst = src
      nodes.forEach((p, i) => {
        if (dist(p, nodes[src]) > dist(nodes[dst], nodes[src])) dst = i
      })
      steps =
        algo === 'kruskal'
          ? runKruskal(nodes, edges)
          : algo === 'prim'
            ? runPrim(nodes, edges, src)
            : algo === 'dijkstra'
              ? runDijkstra(nodes, edges, src)
              : algo === 'astar'
                ? runAstar(nodes, edges, src, dst)
                : algo === 'bfs'
                  ? runBfs(nodes, edges, src)
                  : runDfs(nodes, edges, src)
      at = 0
      stepAt = performance.now()
      holdUntil = 0
    }

    const draw = (s: Step, blend: number) => {
      ctx.clearRect(0, 0, w, h)
      const tree = new Set(s.tree ?? [])
      const settled = new Set(s.settled ?? [])
      const frontier = new Set(s.frontier ?? [])
      const pathEdges = new Set<string>()
      if (s.path) for (let i = 1; i < s.path.length; i++) pathEdges.add(`${Math.min(s.path[i - 1], s.path[i])}-${Math.max(s.path[i - 1], s.path[i])}`)
      ctx.lineCap = 'round'
      // faint graph
      edges.forEach((e, k) => {
        const A = nodes[e.a]
        const B = nodes[e.b]
        const onPath = pathEdges.has(`${Math.min(e.a, e.b)}-${Math.max(e.a, e.b)}`)
        let color = `rgba(${NAVY},0.10)`
        let width = 1
        if (tree.has(k)) {
          color = `rgba(${BLUE},0.85)`
          width = 2
        }
        if (s.consider === k) {
          color = `rgba(${AMBER},${0.6 + 0.4 * blend})`
          width = 2.4
        }
        if (s.reject === k) {
          color = `rgba(220,60,90,${0.7 * (1 - blend)})`
          width = 2
        }
        if (onPath) {
          color = `rgba(${AMBER},0.95)`
          width = 3.2
        }
        ctx.strokeStyle = color
        ctx.lineWidth = width
        ctx.beginPath()
        ctx.moveTo(A.x, A.y)
        ctx.lineTo(B.x, B.y)
        ctx.stroke()
      })
      // A*'s pull: a dotted line from the current node to the target
      if (algo === 'astar' && s.current !== undefined && s.target !== undefined) {
        ctx.setLineDash([3, 5])
        ctx.strokeStyle = `rgba(${AMBER},0.5)`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(nodes[s.current].x, nodes[s.current].y)
        ctx.lineTo(nodes[s.target].x, nodes[s.target].y)
        ctx.stroke()
        ctx.setLineDash([])
      }
      nodes.forEach((p, i) => {
        const isSrc = s.source === i
        const isDst = s.target === i
        const r = isSrc || isDst ? 5.5 : 4
        if (frontier.has(i)) {
          ctx.strokeStyle = `rgba(${AMBER},0.9)`
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(p.x, p.y, r + 4 + 1.5 * Math.sin(performance.now() / 180 + i), 0, Math.PI * 2)
          ctx.stroke()
        }
        if (s.current === i) {
          ctx.fillStyle = `rgba(${AMBER},0.25)`
          ctx.beginPath()
          ctx.arc(p.x, p.y, r + 8, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.fillStyle = settled.has(i) || tree.size >= nodes.length - 1 ? `rgba(${BLUE},1)` : `rgba(${NAVY},0.9)`
        if (isSrc) ctx.fillStyle = `rgba(${AMBER},1)`
        if (isDst) ctx.fillStyle = 'rgba(220,60,90,1)'
        ctx.beginPath()
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
        ctx.fill()
        const label = s.dist?.[i] ?? s.depth?.[i]
        if (label !== undefined) {
          ctx.font = '600 10px "JetBrains Mono", ui-monospace, monospace'
          ctx.fillStyle = `rgba(${MUTED},0.95)`
          ctx.fillText(String(Math.round(label)), p.x + 7, p.y - 6)
        }
      })
    }

    const frame = (now: number) => {
      raf = 0
      if (!steps.length) deal()
      if (holdUntil && now > holdUntil) deal()
      const s = steps[at]
      const blend = Math.min(1, (now - stepAt) / STEP_MS)
      draw(s, blend)
      if (now - stepAt > STEP_MS && at < steps.length - 1) {
        at++
        stepAt = now
        if (at === steps.length - 1) holdUntil = now + HOLD_MS
      }
      if (near && !document.hidden) raf = requestAnimationFrame(frame)
    }
    const start = () => {
      if (!raf && near && !reduced && !document.hidden) raf = requestAnimationFrame(frame)
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const r = canvas.getBoundingClientRect()
      w = Math.max(1, Math.round(r.width))
      h = Math.max(1, Math.round(r.height))
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      deal()
      if (reduced) draw(steps[steps.length - 1], 1)
    }
    const io = new IntersectionObserver(
      (es) => {
        near = es[0]?.isIntersecting ?? false
        if (near) start()
      },
      { rootMargin: '20% 0px' },
    )
    io.observe(canvas)
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()
    const onVis = () => start()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [algo])

  return <canvas ref={ref} aria-hidden="true" className={className} />
}
