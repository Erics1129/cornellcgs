/**
 * Glass shatter on click-drag (§5.6). A transparent fixed Canvas 2D layer
 * above the code layer (z-2) that treats the page as a pane of glass:
 * pointerdown on empty background stamps an impact — rings plus 5–9 jagged,
 * twice-branched radial cracks — dragging scratches a crack-node trail (a
 * node every 10–14 px, bright link lines, 1–3 side branches, longer when
 * fast), and every 60–90 px of travel or on a speed spike a break event
 * throws 8–16 Voronoi-ish shards that refract the code layer canvas (shifted
 * 3–8 px, scaled ~1.03; tinted glass if the canvas is missing), plus 20–40
 * dust motes, shared-angle specular streaks, a speed-scaled screen shake and
 * an optional synthesized glass tick. Fracture lines are a thin white core
 * over a soft neon-mid glow, composited 'lighter'. Nodes fade 800 ms after
 * birth so the stroke reads as a trail; everything clears ~1 s after
 * pointerup. Pointer listeners live on window — the canvas itself is
 * pointer-events-none, no capture, text selection untouched. Touch gets one
 * small break per background tap and no drag trail. Object pools with hard
 * caps (400 shards, 800 dust), DPR capped at 2, and the rAF loop only runs
 * while something is alive (never while document.hidden). The whole layer is
 * inert under prefers-reduced-motion.
 */
import { useEffect, useRef } from 'react'
import { cssVar, onTheme } from '../lib/theme'
import { onReducedMotionChange, prefersReducedMotion, shake } from '../lib/motion'
import { playGlassTick } from './shatterAudio'

/** §5.6 rules: only start on background, never on these or their ancestors. */
const IGNORE =
  'a, button, input, textarea, select, nav, [data-interactive], p, h1, h2, h3, h4, h5, h6, li, span, em, video'

const DPR_CAP = 2
const MAX_SHARDS = 400
const MAX_DUST = 800
const MAX_CRACKS = 640
const MAX_RINGS = 24
const TRAIL_HOLD = 800 // ms a crack stays solid before its trail fade begins
const TRAIL_FADE = 450
const CLEAR_MS = 1000 // global fade once the pointer lifts
const THEME_LERP = 800 // canvas colors follow a theme flip over ~0.8 s
const SHARD_DIRS = 12 // ray samples per Voronoi-ish cell

interface RGB {
  r: number
  g: number
  b: number
}
interface Palette {
  mid: RGB
  core: RGB
}
interface Crack {
  pts: Float32Array
  n: number
  birth: number
  w: number
  alive: boolean
}
interface Ring {
  x: number
  y: number
  r1: number
  birth: number
  life: number
  alive: boolean
}
interface Dust {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  hot: boolean
  birth: number
  life: number
  alive: boolean
}
interface Shard {
  verts: Float32Array
  n: number
  x: number
  y: number
  ox: number
  oy: number
  vx: number
  vy: number
  rot: number
  vr: number
  rad: number
  shx: number
  shy: number
  spec: number
  specOff: number
  hasSpec: boolean
  birth: number
  life: number
  alive: boolean
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)

function parseColor(v: string, fallback: RGB): RGB {
  const s = v.trim()
  if (s.startsWith('#')) {
    const h = s.slice(1)
    if (h.length === 3) {
      return {
        r: parseInt(h[0] + h[0], 16),
        g: parseInt(h[1] + h[1], 16),
        b: parseInt(h[2] + h[2], 16),
      }
    }
    if (h.length >= 6) {
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
      }
    }
  }
  const m = s.match(/rgba?\(([^)]+)\)/)
  if (m) {
    const p = m[1].split(/[\s,/]+/).map(Number)
    if (p.length >= 3 && p.every((x) => Number.isFinite(x))) {
      return { r: p[0], g: p[1], b: p[2] }
    }
  }
  return fallback
}

function lerpInto(out: RGB, a: RGB, b: RGB, t: number) {
  out.r = a.r + (b.r - a.r) * t
  out.g = a.g + (b.g - a.g) * t
  out.b = a.b + (b.b - a.b) * t
}

const rgbStr = (c: RGB) => `rgb(${c.r | 0},${c.g | 0},${c.b | 0})`

/** Grab a dead slot, or steal the oldest-ish one so hard caps hold. */
function alloc<T extends { alive: boolean }>(pool: T[], st: { i: number }): T {
  const n = pool.length
  for (let k = 0; k < n; k++) {
    const it = pool[(st.i + k) % n]
    if (!it.alive) {
      st.i = (st.i + k + 1) % n
      return it
    }
  }
  const it = pool[st.i]
  st.i = (st.i + 1) % n
  return it
}

function start(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return () => {}

  let vw = 0
  let vh = 0
  let raf = 0
  let lastTs = 0
  let code: HTMLCanvasElement | null = null

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP)
    vw = window.innerWidth
    vh = window.innerHeight
    canvas.width = Math.round(vw * dpr)
    canvas.height = Math.round(vh * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
  }
  resize()

  // ---- theme colors, lerped over ~0.8 s when the world flips ----
  const readPalette = (): Palette => ({
    mid: parseColor(cssVar('--neon-mid'), { r: 78, g: 168, b: 255 }),
    core: parseColor(cssVar('--neon-core'), { r: 232, g: 251, b: 255 }),
  })
  let colFrom = readPalette()
  let colTo = readPalette()
  const colCur: Palette = readPalette()
  let colT0 = 0
  const offTheme = onTheme(() => {
    colFrom = { mid: { ...colCur.mid }, core: { ...colCur.core } }
    colTo = readPalette()
    colT0 = performance.now()
  })

  // ---- pools ----
  const cracks: Crack[] = Array.from({ length: MAX_CRACKS }, () => ({
    pts: new Float32Array(48),
    n: 0,
    birth: 0,
    w: 1,
    alive: false,
  }))
  const rings: Ring[] = Array.from({ length: MAX_RINGS }, () => ({
    x: 0,
    y: 0,
    r1: 0,
    birth: 0,
    life: 0,
    alive: false,
  }))
  const dust: Dust[] = Array.from({ length: MAX_DUST }, () => ({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    size: 1,
    hot: false,
    birth: 0,
    life: 0,
    alive: false,
  }))
  const shards: Shard[] = Array.from({ length: MAX_SHARDS }, () => ({
    verts: new Float32Array(SHARD_DIRS * 2),
    n: 0,
    x: 0,
    y: 0,
    ox: 0,
    oy: 0,
    vx: 0,
    vy: 0,
    rot: 0,
    vr: 0,
    rad: 0,
    shx: 0,
    shy: 0,
    spec: 0,
    specOff: 0,
    hasSpec: false,
    birth: 0,
    life: 0,
    alive: false,
  }))
  const crackCur = { i: 0 }
  const ringCur = { i: 0 }
  const dustCur = { i: 0 }
  const shardCur = { i: 0 }
  const seedX = new Float64Array(16)
  const seedY = new Float64Array(16)
  const cell = new Float64Array(SHARD_DIRS * 2)

  // ---- stroke state ----
  let activeId: number | null = null
  let dragging = false
  let nodeX = 0
  let nodeY = 0
  let curX = 0
  let curY = 0
  let nextNode = 12 // px of travel until the next crack node (10–14)
  let breakAcc = 0
  let nextBreak = rand(60, 90) // px of travel until the next break (60–90)
  let speed = 0 // smoothed stroke speed, px/ms
  let lastMoveT = 0
  let lastBreakT = 0
  let endT = 0 // pointer-up timestamp → 1 s global fade
  let tapId = -1
  let tapX = 0
  let tapY = 0
  let tapT = 0
  let tapLive = false

  const ensureLoop = () => {
    if (!raf && !document.hidden) {
      lastTs = performance.now()
      raf = requestAnimationFrame(frame)
    }
  }

  // ---- spawners ----
  const spawnRing = (x: number, y: number, r1: number) => {
    const g = alloc(rings, ringCur)
    g.x = x
    g.y = y
    g.r1 = r1
    g.birth = performance.now()
    g.life = rand(280, 380)
    g.alive = true
  }

  /** One jagged crack polyline; recurses for up to two levels of branching. */
  const spawnCrackLine = (
    x0: number,
    y0: number,
    ang: number,
    len: number,
    w: number,
    depth: number,
  ) => {
    const c = alloc(cracks, crackCur)
    c.alive = true
    c.birth = performance.now()
    c.w = w
    const maxPts = c.pts.length / 2
    const segs = Math.min(maxPts - 1, Math.max(2, Math.round(len / 11)))
    const step = len / segs
    let x = x0
    let y = y0
    let a = ang
    c.pts[0] = x
    c.pts[1] = y
    c.n = 1
    for (let i = 1; i <= segs; i++) {
      a += rand(-0.3, 0.3) // wander — nothing is straight
      x += Math.cos(a) * step
      y += Math.sin(a) * step
      const j = rand(-2.5, 2.5) // perpendicular displacement
      c.pts[c.n * 2] = x - Math.sin(a) * j
      c.pts[c.n * 2 + 1] = y + Math.cos(a) * j
      c.n++
    }
    if (depth < 2) {
      const nb = depth === 0 ? (Math.random() < 0.75 ? 2 : 1) : Math.random() < 0.45 ? 1 : 0
      for (let b = 0; b < nb; b++) {
        const at = 1 + Math.floor(rand(0.25, 0.75) * (c.n - 1))
        spawnCrackLine(
          c.pts[at * 2],
          c.pts[at * 2 + 1],
          ang + (Math.random() < 0.5 ? -1 : 1) * rand(0.35, 1.05),
          len * rand(0.3, 0.55),
          w * 0.65,
          depth + 1,
        )
      }
    }
  }

  /** Pointerdown impact: rings + 5–9 branched radial cracks, 40–140 px. */
  const impact = (x: number, y: number) => {
    spawnRing(x, y, rand(14, 20))
    spawnRing(x, y, rand(30, 46))
    const nc = 5 + Math.floor(Math.random() * 5)
    const a0 = Math.random() * Math.PI * 2
    for (let i = 0; i < nc; i++) {
      const ang = a0 + (i / nc) * Math.PI * 2 + rand(-0.3, 0.3)
      spawnCrackLine(x, y, ang, rand(40, 140), 1.2, 0)
    }
  }

  /** Drag trail node: bright link line back + 1–3 side branches. */
  const addNode = (x: number, y: number, ux: number, uy: number) => {
    const link = alloc(cracks, crackCur)
    link.alive = true
    link.birth = performance.now()
    link.w = 1.7
    link.pts[0] = nodeX
    link.pts[1] = nodeY
    link.pts[2] = (nodeX + x) / 2 + rand(-3, 3)
    link.pts[3] = (nodeY + y) / 2 + rand(-3, 3)
    link.pts[4] = x
    link.pts[5] = y
    link.n = 3
    const strokeAng = Math.atan2(uy, ux)
    const nb = 1 + Math.floor(Math.random() * 3)
    const lenBoost = 1 + Math.min(2.2, speed * 0.8) // fast strokes → longer branches
    for (let b = 0; b < nb; b++) {
      const side = Math.random() < 0.5 ? -1 : 1
      spawnCrackLine(x, y, strokeAng + side * rand(0.45, 1.35), rand(9, 26) * lenBoost, 0.9, 1)
    }
    nodeX = x
    nodeY = y
  }

  /** Break event: Voronoi-ish shards + dust + ring + shake + optional tick. */
  const breakAt = (x: number, y: number, strength: number, small: boolean) => {
    const now = performance.now()
    const R = small ? rand(60, 85) : rand(60, 140)
    const count = small ? 8 : 8 + Math.floor(Math.random() * 9)
    const specAngle = rand(0, Math.PI)

    // Seeds: one at the impact, the rest spread over the disc.
    for (let i = 0; i < count; i++) {
      const rr = i === 0 ? rand(2, 10) : R * Math.sqrt(Math.random())
      const aa = Math.random() * Math.PI * 2
      seedX[i] = x + Math.cos(aa) * rr
      seedY[i] = y + Math.sin(aa) * rr
    }

    for (let i = 0; i < count; i++) {
      // Sample the true Voronoi cell of seed i along SHARD_DIRS rays: the
      // nearest half-plane bisector against every other seed, clipped to the
      // disc, with a little jitter so the tiling reads shattered.
      let cx = 0
      let cy = 0
      for (let k = 0; k < SHARD_DIRS; k++) {
        const th = ((k + rand(-0.2, 0.2)) / SHARD_DIRS) * Math.PI * 2
        const dx = Math.cos(th)
        const dy = Math.sin(th)
        const ex = seedX[i] - x
        const ey = seedY[i] - y
        const b = dx * ex + dy * ey
        let r = -b + Math.sqrt(Math.max(0, b * b - (ex * ex + ey * ey - R * R)))
        for (let j = 0; j < count; j++) {
          if (j === i) continue
          const mx = seedX[j] - seedX[i]
          const my = seedY[j] - seedY[i]
          const proj = dx * mx + dy * my
          if (proj > 1e-4) {
            const rr = (mx * mx + my * my) / (2 * proj)
            if (rr < r) r = rr
          }
        }
        r *= rand(0.9, 1)
        cell[k * 2] = seedX[i] + dx * r
        cell[k * 2 + 1] = seedY[i] + dy * r
        cx += cell[k * 2]
        cy += cell[k * 2 + 1]
      }
      cx /= SHARD_DIRS
      cy /= SHARD_DIRS

      const s = alloc(shards, shardCur)
      let rad = 4
      for (let k = 0; k < SHARD_DIRS; k++) {
        const lx = cell[k * 2] - cx
        const ly = cell[k * 2 + 1] - cy
        s.verts[k * 2] = lx
        s.verts[k * 2 + 1] = ly
        const d = Math.hypot(lx, ly)
        if (d > rad) rad = d
      }
      s.n = SHARD_DIRS
      s.rad = rad
      let ddx = cx - x
      let ddy = cy - y
      const dd = Math.hypot(ddx, ddy) || 1
      ddx /= dd
      ddy /= dd
      s.ox = cx
      s.oy = cy
      s.x = cx + ddx * rand(1.5, 4) // shards separate a few pixels at once
      s.y = cy + ddy * rand(1.5, 4)
      const sp = rand(10, 45) * (0.5 + strength)
      s.vx = ddx * sp + rand(-8, 8)
      s.vy = ddy * sp + rand(-8, 8)
      s.rot = 0
      s.vr = rand(-0.55, 0.55)
      const sha = Math.random() * Math.PI * 2 // refraction shift, 3–8 px
      const shm = rand(3, 8)
      s.shx = Math.cos(sha) * shm
      s.shy = Math.sin(sha) * shm
      s.hasSpec = Math.random() < 0.65
      s.spec = specAngle + rand(-0.06, 0.06) // shared light angle per break
      s.specOff = rand(-0.5, 0.5) * rad
      s.birth = now
      s.life = rand(900, 1500)
      s.alive = true
    }

    const nd = small ? 20 : 20 + Math.floor(Math.random() * 21)
    for (let i = 0; i < nd; i++) {
      const d = alloc(dust, dustCur)
      const aa = Math.random() * Math.PI * 2
      const sp = rand(40, 300) * (0.6 + strength * 0.6)
      d.x = x
      d.y = y
      d.vx = Math.cos(aa) * sp
      d.vy = Math.sin(aa) * sp - 30
      d.size = rand(1, 2.4)
      d.hot = Math.random() < 0.5
      d.birth = now
      d.life = rand(280, 680)
      d.alive = true
    }

    spawnRing(x, y, small ? rand(20, 32) : rand(30, 60))
    shake(small ? 0.3 : strength)
    playGlassTick(strength)
  }

  const killAll = () => {
    for (const c of cracks) c.alive = false
    for (const g of rings) g.alive = false
    for (const d of dust) d.alive = false
    for (const s of shards) s.alive = false
    endT = 0
  }

  // ---- pointer handlers (window-level, capture-free, never preventDefault) ----
  const onDown = (e: PointerEvent) => {
    const t = e.target
    if (!(t instanceof Element) || t.closest(IGNORE)) return
    if (e.pointerType === 'touch') {
      // Touch rule: a clean tap makes one small break; drags scroll as usual.
      tapLive = true
      tapId = e.pointerId
      tapX = e.clientX
      tapY = e.clientY
      tapT = performance.now()
      return
    }
    if (e.button !== 0 || activeId !== null) return
    activeId = e.pointerId
    dragging = true
    endT = 0
    curX = nodeX = e.clientX
    curY = nodeY = e.clientY
    nextNode = rand(10, 14)
    breakAcc = 0
    nextBreak = rand(60, 90)
    speed = 0
    lastMoveT = performance.now()
    impact(e.clientX, e.clientY)
    ensureLoop()
  }

  const onMove = (e: PointerEvent) => {
    if (!dragging || e.pointerId !== activeId) return
    if (e.buttons === 0) {
      // Released outside the window — no pointerup will arrive.
      endStroke()
      return
    }
    const now = performance.now()
    const x = e.clientX
    const y = e.clientY
    const dx = x - curX
    const dy = y - curY
    const d = Math.hypot(dx, dy)
    if (d < 0.5) return
    const dt = Math.max(4, now - lastMoveT)
    lastMoveT = now
    const inst = d / dt
    speed = speed * 0.75 + inst * 0.25

    // March along the segment dropping a crack node every 10–14 px, so even
    // one fast pointermove leaves a dense trail.
    const ux = dx / d
    const uy = dy / d
    let travelled = 0
    while (travelled + nextNode <= d) {
      travelled += nextNode
      breakAcc += nextNode
      const nx = curX + ux * travelled
      const ny = curY + uy * travelled
      addNode(nx, ny, ux, uy)
      nextNode = rand(10, 14)
      if (breakAcc >= nextBreak && now - lastBreakT > 130) {
        breakAt(nx, ny, Math.min(0.85, 0.3 + speed * 0.18), false)
        breakAcc = 0
        nextBreak = rand(60, 90)
        lastBreakT = now
      }
    }
    nextNode -= d - travelled
    curX = x
    curY = y

    // Speed spike → an early break even between the 60–90 px marks.
    if (inst > 2.2 && inst > speed * 1.6 && d > 6 && now - lastBreakT > 200) {
      breakAt(x, y, Math.min(0.85, 0.35 + inst * 0.14), false)
      breakAcc = 0
      nextBreak = rand(60, 90)
      lastBreakT = now
    }
  }

  const endStroke = () => {
    if (!dragging) return
    dragging = false
    activeId = null
    endT = performance.now()
  }

  const onUp = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      if (tapLive && e.pointerId === tapId) {
        tapLive = false
        const dt = performance.now() - tapT
        const d = Math.hypot(e.clientX - tapX, e.clientY - tapY)
        if (dt < 350 && d < 12) {
          breakAt(e.clientX, e.clientY, 0.35, true)
          endT = performance.now() + 500 // let the tap payoff play, then clear
          ensureLoop()
        }
      }
      return
    }
    if (e.pointerId === activeId) endStroke()
  }

  const onCancel = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      if (e.pointerId === tapId) tapLive = false
      return
    }
    if (e.pointerId === activeId) endStroke()
  }

  const onBlur = () => endStroke()

  const onVis = () => {
    if (document.hidden) {
      endStroke()
      if (raf) {
        cancelAnimationFrame(raf)
        raf = 0
      }
    } else {
      ensureLoop()
    }
  }

  // ---- frame loop: runs only while something is alive ----
  const frame = (ts: number) => {
    raf = 0
    const now = ts
    const dt = Math.min(0.05, Math.max(0.001, (ts - lastTs) / 1000))
    lastTs = ts

    const ck = colT0 === 0 ? 1 : Math.min(1, (now - colT0) / THEME_LERP)
    lerpInto(colCur.mid, colFrom.mid, colTo.mid, ck)
    lerpInto(colCur.core, colFrom.core, colTo.core, ck)
    const midStr = rgbStr(colCur.mid)
    const coreStr = rgbStr(colCur.core)

    if (!code) code = document.getElementById('code-layer-canvas') as HTMLCanvasElement | null

    let mul = 1
    if (!dragging && endT > 0) {
      mul = Math.max(0, Math.min(1, 1 - (now - endT) / CLEAR_MS))
      if (mul <= 0) killAll()
    }

    ctx.clearRect(0, 0, vw, vh)
    let any = dragging

    // Shards — glass panes refracting the code layer beneath them.
    const codeOk = !!code && code.width > 0
    const srcScale = codeOk && code ? code.width / vw : 1
    for (const s of shards) {
      if (!s.alive) continue
      const age = now - s.birth
      if (age > s.life) {
        s.alive = false
        continue
      }
      s.vy += 170 * dt // light gravity
      s.vx *= 1 - 0.35 * dt
      s.x += s.vx * dt
      s.y += s.vy * dt
      s.rot += s.vr * dt
      if (s.y - s.rad > vh + 60) {
        s.alive = false
        continue
      }
      const t = age / s.life
      const a = (t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45) * mul
      if (a <= 0.004) continue
      any = true
      ctx.save()
      ctx.translate(s.x, s.y)
      ctx.rotate(s.rot)
      ctx.beginPath()
      ctx.moveTo(s.verts[0], s.verts[1])
      for (let i = 1; i < s.n; i++) ctx.lineTo(s.verts[i * 2], s.verts[i * 2 + 1])
      ctx.closePath()
      ctx.clip()
      const r = s.rad
      if (codeOk && code) {
        // The pane, sampled ~1.03× and shifted 3–8 px — refraction.
        const sw = (2 * r) / 1.03
        ctx.globalAlpha = a * 0.95
        ctx.drawImage(
          code,
          (s.ox + s.shx - sw / 2) * srcScale,
          (s.oy + s.shy - sw / 2) * srcScale,
          sw * srcScale,
          sw * srcScale,
          -r,
          -r,
          2 * r,
          2 * r,
        )
        ctx.globalAlpha = a * 0.07
        ctx.fillStyle = midStr
        ctx.fillRect(-r, -r, 2 * r, 2 * r)
      } else {
        // No code layer canvas — degrade to plain tinted glass.
        ctx.globalAlpha = a * 0.1
        ctx.fillStyle = midStr
        ctx.fillRect(-r, -r, 2 * r, 2 * r)
        ctx.globalAlpha = a * 0.05
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(-r, -r, 2 * r, 2 * r)
      }
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = a * 0.35
      ctx.strokeStyle = coreStr
      ctx.lineWidth = 1
      ctx.stroke() // the clip path is still current — glassy edge glint
      if (s.hasSpec) {
        // Specular streak at the break's shared screen-space light angle.
        const la = s.spec - s.rot
        const lx = Math.cos(la)
        const ly = Math.sin(la)
        const px = -ly * s.specOff
        const py = lx * s.specOff
        ctx.beginPath()
        ctx.moveTo(px - lx * r * 1.6, py - ly * r * 1.6)
        ctx.lineTo(px + lx * r * 1.6, py + ly * r * 1.6)
        ctx.globalAlpha = a * 0.1
        ctx.lineWidth = 3.5
        ctx.stroke()
        ctx.globalAlpha = a * 0.3
        ctx.lineWidth = 1.1
        ctx.stroke()
      }
      ctx.restore()
    }

    ctx.globalCompositeOperation = 'lighter'

    // Fracture lines — thin white core over a soft neon-mid glow.
    for (const c of cracks) {
      if (!c.alive) continue
      const age = now - c.birth
      let a = 1
      if (age > TRAIL_HOLD) {
        a = 1 - (age - TRAIL_HOLD) / TRAIL_FADE
        if (a <= 0) {
          c.alive = false
          continue
        }
      }
      a *= mul
      if (a <= 0.004) continue
      any = true
      ctx.beginPath()
      ctx.moveTo(c.pts[0], c.pts[1])
      for (let i = 1; i < c.n; i++) ctx.lineTo(c.pts[i * 2], c.pts[i * 2 + 1])
      ctx.strokeStyle = midStr
      ctx.globalAlpha = a * 0.14
      ctx.lineWidth = c.w * 6
      ctx.stroke()
      ctx.globalAlpha = a * 0.3
      ctx.lineWidth = c.w * 2.2
      ctx.stroke()
      ctx.strokeStyle = coreStr
      ctx.globalAlpha = a * 0.9
      ctx.lineWidth = Math.max(0.75, c.w * 0.8)
      ctx.stroke()
    }

    // Impact / break rings.
    for (const g of rings) {
      if (!g.alive) continue
      const t = (now - g.birth) / g.life
      if (t >= 1) {
        g.alive = false
        continue
      }
      any = true
      const e = 1 - (1 - t) ** 3
      const rr = 6 + (g.r1 - 6) * e
      const a = (1 - t) * 0.6 * mul
      ctx.beginPath()
      ctx.arc(g.x, g.y, rr, 0, Math.PI * 2)
      ctx.strokeStyle = midStr
      ctx.globalAlpha = a * 0.35
      ctx.lineWidth = 5
      ctx.stroke()
      ctx.strokeStyle = coreStr
      ctx.globalAlpha = a
      ctx.lineWidth = 1.4
      ctx.stroke()
    }

    // Glass dust.
    for (const d of dust) {
      if (!d.alive) continue
      const t = (now - d.birth) / d.life
      if (t >= 1) {
        d.alive = false
        continue
      }
      any = true
      d.vy += 420 * dt
      d.x += d.vx * dt
      d.y += d.vy * dt
      const a = (1 - t) * (1 - t) * mul
      ctx.globalAlpha = a * 0.8
      ctx.fillStyle = d.hot ? coreStr : midStr
      ctx.fillRect(d.x - d.size / 2, d.y - d.size / 2, d.size, d.size)
    }

    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1

    if (any || (endT > 0 && mul > 0)) raf = requestAnimationFrame(frame)
    else ctx.clearRect(0, 0, vw, vh)
  }

  window.addEventListener('pointerdown', onDown, { passive: true })
  window.addEventListener('pointermove', onMove, { passive: true })
  window.addEventListener('pointerup', onUp, { passive: true })
  window.addEventListener('pointercancel', onCancel, { passive: true })
  window.addEventListener('blur', onBlur)
  window.addEventListener('resize', resize)
  document.addEventListener('visibilitychange', onVis)

  return () => {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    window.removeEventListener('pointerdown', onDown)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    window.removeEventListener('blur', onBlur)
    window.removeEventListener('resize', resize)
    document.removeEventListener('visibilitychange', onVis)
    offTheme()
    ctx.clearRect(0, 0, vw, vh)
  }
}

export default function ShatterLayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let stop: (() => void) | null = null
    const apply = (reduced: boolean) => {
      if (reduced) {
        stop?.()
        stop = null
      } else if (!stop) {
        stop = start(canvas)
      }
    }
    apply(prefersReducedMotion())
    const off = onReducedMotionChange(apply)
    return () => {
      off()
      stop?.()
      stop = null
    }
  }, [])

  return (
    <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[2]" />
  )
}
