/**
 * Moving code background (§5.5). A fixed full-screen Canvas 2D layer of 12–20
 * columns of real code — the poker evaluator, CFR update and equity Monte
 * Carlo from codeSnippets.ts plus lines from this site's own components —
 * drifting upward at 8–30 px/s and wrapping from the bottom. Tokens are
 * syntax-tinted from the theme vars (keywords neon-mid, strings amber,
 * comments dimmer, plain code muted) and lerp over 0.8 s when the world
 * flips. Every few seconds one visible line pulses bright, like a compile
 * flash, and the whole layer rides at 0.3× scroll speed for parallax.
 *
 * Cheap by construction: every line is tokenized and measured once, rendered
 * once into an offscreen atlas, and a frame is one drawImage blit per visible
 * line — no per-frame string parsing. DPR capped at 2, rAF paused while the
 * tab is hidden, and with reduced motion the columns draw once, static.
 * The canvas carries id="code-layer-canvas" so the shatter layer can sample it.
 *
 * The rain is a fluid. A coarse stable-fluids solver (fluid.ts, ~15 px cells)
 * takes the pointer's motion and the page's scroll momentum as its only
 * forces, and every drawn line rides the velocity field as a tracer: a
 * per-slot offset integrates the local flow and relaxes home, so glyphs
 * swirl, bunch and settle instead of parting on a fixed radius. Dye splatted
 * with the pointer brightens the energetic regions. Coarse pointers get the
 * scroll force only; reduced motion runs no fluid at all.
 */
import { useEffect, useRef } from 'react'
import { cssVar, onTheme, THEME_LERP_MS, themeLerpEase } from '../lib/theme'
import { isTouchDevice, onReducedMotionChange, prefersReducedMotion } from '../lib/motion'
import { isPaging, scrollVelocity } from '../lib/scroll'
import { CODE_LINES } from './codeSnippets'
import { Fluid, gridFor } from './fluid'

const FONT = '600 13px "JetBrains Mono", monospace'
const LINE_H = 20
const PARALLAX = 0.3
const FLASH_MS = 700
const MAX_LINE_W = 640

// Fluid coupling — the glyphs are tracers with a weak spring home
/** px/s of fluid velocity per px of pointer travel */
const POINTER_K = 2.5
const POINTER_R = 100
/** longest pointer step that counts (a wake-up jump is not a gesture) */
const POINTER_STEP = 40
/** ms without a move after which the next one starts fresh, no push */
const POINTER_IDLE = 120
/** fluid px/s² per px/frame of Lenis velocity (page down pushes the code up) */
const SCROLL_K = 3
const SCROLL_V_MAX = 80
/** how much of the flow a line takes on (1 = a perfect tracer) */
const FLOW_GAIN = 0.7
/** 1/s pull back to the column */
const FLOW_RELAX = 1.6
const FLOW_MAX = 48
const FLOW_INV2 = 1 / (FLOW_MAX * FLOW_MAX)
/** px/s of local speed that reads as fully energetic */
const GLOW_SPEED = 220

const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'of', 'in',
  'new', 'type', 'interface', 'export', 'import', 'from', 'default', 'while',
  'do', 'break', 'continue', 'switch', 'case', 'class', 'extends', 'this',
  'true', 'false', 'null', 'undefined', 'typeof', 'instanceof', 'async',
  'await', 'void', 'number', 'string', 'boolean',
])

const WS_RE = /^\s+/
const STR_RE = /^("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/
const WORD_RE = /^[A-Za-z_$][\w$]*/
const NUM_RE = /^\d[\d._]*(?:e\d+)?/
const PUNCT_STOP = /[\w$'"`\/\s]/

type Kind = 'kw' | 'str' | 'com' | 'plain'
type RGB = [number, number, number]

interface Tok {
  text: string
  kind: Kind
  /** x offset within the line, measured once */
  x: number
}

interface Line {
  toks: Tok[]
  width: number
  /** row in the atlas, -1 for blank lines (kept for rhythm, never drawn) */
  row: number
}

interface Column {
  x: number
  speed: number
  alpha: number
  /** index into the line pool where this column's window starts */
  start: number
  count: number
  off: number
  /** per-slot fluid displacement, [ox, oy] pairs in canvas px */
  ofs: Float32Array
}

interface Palette {
  kw: RGB
  str: RGB
  plain: RGB
  core: RGB
}

const mod = (v: number, m: number) => ((v % m) + m) % m
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]
const css = (c: RGB) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '').trim()
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h
  const n = parseInt(full, 16)
  if (Number.isNaN(n)) return [169, 180, 214]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function readPalette(): Palette {
  return {
    kw: hexToRgb(cssVar('--neon-mid')),
    str: hexToRgb(cssVar('--accent-amber')),
    plain: hexToRgb(cssVar('--muted')),
    core: hexToRgb(cssVar('--neon-core')),
  }
}

function mixPalette(a: Palette, b: Palette, t: number): Palette {
  return {
    kw: mix(a.kw, b.kw, t),
    str: mix(a.str, b.str, t),
    plain: mix(a.plain, b.plain, t),
    core: mix(a.core, b.core, t),
  }
}

function colorFor(kind: Kind, p: Palette): RGB {
  if (kind === 'kw') return p.kw
  if (kind === 'str') return p.str
  return p.plain // comments reuse plain, dimmed by alpha at draw time
}

/** One pass at build time; the frame loop never touches strings again. */
function tokenize(src: string): Tok[] {
  const toks: Tok[] = []
  let i = 0
  while (i < src.length) {
    const rest = src.slice(i)
    if (rest.startsWith('//')) {
      toks.push({ text: rest, kind: 'com', x: 0 })
      break
    }
    let m = rest.match(WS_RE) ?? rest.match(NUM_RE)
    let kind: Kind = 'plain'
    if (!m && (m = rest.match(STR_RE))) kind = 'str'
    if (!m && (m = rest.match(WORD_RE))) kind = KEYWORDS.has(m[0]) ? 'kw' : 'plain'
    let text: string
    if (m) {
      text = m[0]
    } else {
      const stop = rest.slice(1).search(PUNCT_STOP)
      text = rest.slice(0, stop < 0 ? rest.length : stop + 1)
    }
    // Merge runs of plain (and whitespace) so a line stays a handful of tokens
    const last = toks[toks.length - 1]
    if (last && last.kind === 'plain' && kind === 'plain') last.text += text
    else toks.push({ text, kind, x: 0 })
    i += text.length
  }
  return toks
}

export default function CodeLayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const atlas = document.createElement('canvas')
    const actx = atlas.getContext('2d')
    if (!canvas || !ctx || !actx) return

    // --- Line pool: tokenize once, assign atlas rows ---------------------
    let rows = 0
    const lines: Line[] = CODE_LINES.map((src) => {
      const toks = tokenize(src)
      const drawable = toks.some((t) => t.text.trim() !== '')
      return { toks, width: 0, row: drawable ? rows++ : -1 }
    })

    let w = 0
    let h = 0
    let dpr = 1
    let atlasW = 1
    let cols: Column[] = []
    const g0 = gridFor(window.innerWidth, window.innerHeight)
    let fluid = new Fluid(g0.W, g0.H, window.innerWidth, window.innerHeight)
    const coarse = isTouchDevice()
    let palette = readPalette()
    let lerpFrom = palette
    let lerpTo = palette
    let lerpStart = -1
    let flash: { col: number; slot: number; t0: number } | null = null
    let nextFlash = performance.now() + 2000
    let reduced = prefersReducedMotion()
    let raf = 0
    let last = performance.now()
    let alive = true

    const measure = () => {
      actx.font = FONT
      let max = 0
      for (const line of lines) {
        let x = 0
        for (const tok of line.toks) {
          tok.x = x
          x += actx.measureText(tok.text).width
        }
        line.width = x
        if (x > max) max = x
      }
      atlasW = Math.min(Math.ceil(max) + 4, MAX_LINE_W)
    }

    const renderAtlas = (p: Palette) => {
      // Reallocate only when dims change; the theme lerp re-renders per frame
      const aw = atlasW * dpr
      const ah = Math.max(1, rows * LINE_H * dpr)
      if (atlas.width !== aw || atlas.height !== ah) {
        atlas.width = aw
        atlas.height = ah
      }
      actx.setTransform(dpr, 0, 0, dpr, 0, 0)
      actx.clearRect(0, 0, atlasW, rows * LINE_H)
      actx.font = FONT
      actx.textBaseline = 'middle'
      for (const line of lines) {
        if (line.row < 0) continue
        const y = line.row * LINE_H + LINE_H / 2
        for (const tok of line.toks) {
          if (tok.text.trim() === '') continue
          actx.globalAlpha = tok.kind === 'com' ? 0.55 : 1
          actx.fillStyle = css(colorFor(tok.kind, p))
          actx.fillText(tok.text, tok.x, y)
        }
      }
      actx.globalAlpha = 1
    }

    const buildColumns = () => {
      const n = Math.max(12, Math.min(20, Math.round(w / 96)))
      const slot = w / n
      const count = Math.ceil((h + LINE_H * 2) / LINE_H) + 1
      cols = Array.from({ length: n }, (_, i) => {
        const depth = Math.random() // slow columns sit deeper and dimmer
        return {
          x: i * slot + slot * (0.1 + Math.random() * 0.55),
          speed: 8 + depth * 22,
          // Visible but calm — on the light worlds the ink-blue code competes
          // with headings much harder than it did on navy
          alpha: 0.09 + depth * 0.12 + Math.random() * 0.03,
          start: Math.floor(Math.random() * lines.length),
          count,
          off: Math.random() * count * LINE_H,
          ofs: new Float32Array(count * 2),
        }
      })
    }

    // Every line is a tracer in the fluid: its slot keeps an offset that
    // integrates the local velocity (sampled where the line actually is) and
    // relaxes back to the column, easing to a stop before FLOW_MAX so nothing
    // hits a wall. One velocity sample and one dye sample per line, ~1000
    // lines a frame — a fraction of the drawImage cost. Energetic lines
    // brighten. `live` is false on the reduced-motion static frame.
    let fdt = 0 // this frame's fluid dt (≤ 1/30)
    let relax = 1 // exp(−FLOW_RELAX·fdt)
    const drawColumn = (col: Column, scroll: number, live: boolean) => {
      const total = col.count * LINE_H
      const eff = col.off + scroll * PARALLAX
      const ofs = col.ofs
      ctx.globalAlpha = col.alpha
      for (let j = 0; j < col.count; j++) {
        const line = lines[(col.start + j) % lines.length]
        if (line.row < 0) continue
        const cw = Math.min(line.width, atlasW)
        if (cw <= 0) continue
        let x = col.x
        let y = mod(j * LINE_H - eff, total) - LINE_H
        if (live) {
          let ox = ofs[j * 2]
          let oy = ofs[j * 2 + 1]
          const px = x + cw * 0.5 + ox
          const py = y + LINE_H * 0.5 + oy
          const s = fluid.sampleVelocity(px, py)
          const dx = s.vx * fdt * FLOW_GAIN
          const dy = s.vy * fdt * FLOW_GAIN
          // outward motion fades as the offset nears the cap; homeward is free
          ox += dx * (dx * ox > 0 ? Math.max(0, 1 - ox * ox * FLOW_INV2) : 1)
          oy += dy * (dy * oy > 0 ? Math.max(0, 1 - oy * oy * FLOW_INV2) : 1)
          ox *= relax
          oy *= relax
          if (ox > FLOW_MAX) ox = FLOW_MAX
          else if (ox < -FLOW_MAX) ox = -FLOW_MAX
          if (oy > FLOW_MAX) oy = FLOW_MAX
          else if (oy < -FLOW_MAX) oy = -FLOW_MAX
          ofs[j * 2] = ox
          ofs[j * 2 + 1] = oy
          x += ox
          y += oy
          const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy)
          const e = Math.min(1, fluid.sampleDye(px, py) + speed / GLOW_SPEED)
          ctx.globalAlpha = Math.min(1, col.alpha * (1 + 0.6 * e))
        }
        if (y > h || y < -LINE_H || x + cw < 0 || x > w) continue
        ctx.drawImage(
          atlas,
          0, line.row * LINE_H * dpr, cw * dpr, LINE_H * dpr,
          x, y, cw, LINE_H,
        )
      }
      ctx.globalAlpha = 1
    }

    const lineYIn = (col: Column, slot: number, scroll: number) => {
      const total = col.count * LINE_H
      return mod(slot * LINE_H - (col.off + scroll * PARALLAX), total) - LINE_H
    }

    const pickFlash = (now: number, scroll: number) => {
      for (let tries = 0; tries < 12; tries++) {
        const ci = Math.floor(Math.random() * cols.length)
        const col = cols[ci]
        const slot = Math.floor(Math.random() * col.count)
        if (lines[(col.start + slot) % lines.length].row < 0) continue
        const y = lineYIn(col, slot, scroll)
        if (y < 40 || y > h - 60) continue
        flash = { col: ci, slot, t0: now }
        return
      }
    }

    const drawFlash = (now: number, scroll: number) => {
      if (!flash) return
      const age = now - flash.t0
      if (age > FLASH_MS) {
        flash = null
        return
      }
      const t = age / FLASH_MS
      const v = Math.pow(t < 0.16 ? t / 0.16 : 1 - (t - 0.16) / 0.84, 0.8)
      const col = cols[flash.col]
      const line = lines[(col.start + flash.slot) % lines.length]
      // Ride the same fluid offset as the line underneath, or it ghosts
      const x = col.x + col.ofs[flash.slot * 2]
      const y = lineYIn(col, flash.slot, scroll) + LINE_H / 2 + col.ofs[flash.slot * 2 + 1]
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = 0.85 * v
      ctx.shadowColor = css(palette.core)
      ctx.shadowBlur = 9 * v
      for (const tok of line.toks) {
        if (tok.text.trim() === '') continue
        ctx.fillStyle = css(mix(colorFor(tok.kind, palette), palette.core, 0.7))
        ctx.fillText(tok.text, x + tok.x, y)
      }
      ctx.restore()
    }

    const drawStatic = () => {
      ctx.clearRect(0, 0, w, h)
      for (const col of cols) drawColumn(col, 0, false)
    }

    // --- Cursor lens: a clean, READABLE window of code under the mouse.
    // A soft wash of the page background fades the ambient clutter inside the
    // circle, then ONE column — the one under the cursor — is redrawn bright,
    // so what you see in the lens is actual legible code, not stacked noise.
    const SPOT_R = 160
    let mx = -9999
    let my = -9999
    let sx = -9999
    let sy = -9999
    let bg = hexToRgb(cssVar('--bg-top'))

    const drawSpotlight = () => {
      if (mx < -999 || isPaging()) {
        sx = -9999
        return
      }
      if (sx < -999) {
        sx = mx
        sy = my
      } else {
        sx += (mx - sx) * 0.22
        sy += (my - sy) * 0.22
      }

      // The lens wash
      const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, SPOT_R)
      const bgs = `${bg[0] | 0},${bg[1] | 0},${bg[2] | 0}`
      grad.addColorStop(0, `rgba(${bgs},0.85)`)
      grad.addColorStop(0.72, `rgba(${bgs},0.55)`)
      grad.addColorStop(1, `rgba(${bgs},0)`)
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(sx, sy, SPOT_R, 0, Math.PI * 2)
      ctx.fill()

      // The one column under the cursor (brightest wins ties)
      let best: Column | null = null
      let bestScore = -Infinity
      for (const col of cols) {
        const wch = Math.min(atlasW, MAX_LINE_W)
        if (sx < col.x - 24 || sx > col.x + wch + 24) continue
        const score = col.alpha - Math.abs(col.x + 140 - sx) / 2400
        if (score > bestScore) {
          bestScore = score
          best = col
        }
      }
      if (!best) return

      // The lens shows the lines where the fluid has carried them — the
      // same offsets as the ambient pass, so nothing doubles at the rim
      const total = best.count * LINE_H
      const eff = best.off + window.scrollY * PARALLAX
      const ofs = best.ofs
      for (let j = 0; j < best.count; j++) {
        const line = lines[(best.start + j) % lines.length]
        if (line.row < 0) continue
        const lx = best.x + ofs[j * 2]
        const y = mod(j * LINE_H - eff, total) - LINE_H + ofs[j * 2 + 1]
        const dy = y + LINE_H / 2 - sy
        if (dy < -SPOT_R || dy > SPOT_R) continue
        const half = Math.sqrt(SPOT_R * SPOT_R - dy * dy)
        const x0 = Math.max(sx - half, lx)
        const x1 = Math.min(sx + half, lx + Math.min(line.width, atlasW))
        if (x1 <= x0) continue
        ctx.globalAlpha = 0.95 * (1 - (Math.abs(dy) / SPOT_R) * 0.3)
        ctx.drawImage(
          atlas,
          (x0 - lx) * dpr, line.row * LINE_H * dpr, (x1 - x0) * dpr, LINE_H * dpr,
          x0, y, x1 - x0, LINE_H,
        )
      }
      ctx.globalAlpha = 1
    }

    // The pointer stirs the fluid along its motion: an impulse per px of
    // travel (frame-rate independent, however often the events arrive) and a
    // little dye where it moved fast. A first move after idle, or the jump
    // in from the window edge, pushes nothing — that is not a gesture.
    let pmx = -9999
    let pmy = -9999
    let pmt = 0
    const onPointer = (e: PointerEvent) => {
      mx = e.clientX
      my = e.clientY
      if (coarse || reduced) return
      const t = e.timeStamp
      if (pmx > -999 && t - pmt < POINTER_IDLE) {
        let dx = mx - pmx
        let dy = my - pmy
        const m = Math.hypot(dx, dy)
        if (m > POINTER_STEP) {
          dx *= POINTER_STEP / m
          dy *= POINTER_STEP / m
        }
        if (m > 0) {
          fluid.addForce(
            mx, my, dx * POINTER_K, dy * POINTER_K, POINTER_R,
            Math.min(1, m / 24) * 0.6,
          )
        }
      }
      pmx = mx
      pmy = my
      pmt = t
    }
    const onPointerGone = () => {
      mx = -9999
      pmx = -9999
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      // behind the black eye chapter nothing of this shows: skip the work
      if (document.documentElement.classList.contains('eye-on')) return
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now

      if (lerpStart >= 0) {
        const t = Math.min(1, (now - lerpStart) / THEME_LERP_MS)
        palette = mixPalette(lerpFrom, lerpTo, themeLerpEase(t))
        renderAtlas(palette)
        if (t >= 1) lerpStart = -1
      }

      const scroll = window.scrollY
      // The rain feels the page's momentum: columns run faster while the
      // reader is in motion, easing back as the scroll settles — and the
      // fluid takes the same momentum as a uniform push (page down → code
      // up, the parallax direction), so the field streams and settles with
      // inertia instead of stopping dead with the scrollbar. The solver
      // sleeps on its own once the field is calm (the rAF is already off
      // while the tab is hidden).
      const sv = Math.max(-SCROLL_V_MAX, Math.min(SCROLL_V_MAX, scrollVelocity()))
      const vBoost = 1 + Math.min(Math.abs(sv), 8) * 0.3
      fdt = Math.min(dt, 1 / 30)
      relax = Math.exp(-FLOW_RELAX * fdt)
      if (Math.abs(sv) > 0.05) fluid.addUniform(0, -sv * SCROLL_K * fdt)
      fluid.step(fdt)
      ctx.clearRect(0, 0, w, h)
      for (const col of cols) {
        col.off = mod(col.off + col.speed * vBoost * dt, col.count * LINE_H)
        drawColumn(col, scroll, true)
      }
      if (!flash && now >= nextFlash) {
        pickFlash(now, scroll)
        nextFlash = now + 2400 + Math.random() * 2800
      }
      drawFlash(now, scroll)
      drawSpotlight()
    }

    const resize = () => {
      const nextDpr = Math.min(window.devicePixelRatio || 1, 2)
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = w * nextDpr
      canvas.height = h * nextDpr
      ctx.setTransform(nextDpr, 0, 0, nextDpr, 0, 0)
      ctx.font = FONT
      ctx.textBaseline = 'middle'
      if (nextDpr !== dpr) {
        dpr = nextDpr
        renderAtlas(palette)
      }
      buildColumns()
      // New grid only when the cell count changes (a URL-bar resize keeps
      // the field); otherwise just re-map px onto the same cells
      const g = gridFor(w, h)
      if (g.W !== fluid.W || g.H !== fluid.H) fluid = new Fluid(g.W, g.H, w, h)
      else fluid.setSize(w, h)
      if (reduced) drawStatic()
    }

    // --- Boot ------------------------------------------------------------
    measure()
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    renderAtlas(palette)
    resize()
    if (!reduced) raf = requestAnimationFrame(frame)
    else drawStatic()

    // Remeasure once JetBrains Mono actually arrives (widths shift a little)
    void document.fonts
      .load(FONT)
      .then(() => {
        if (!alive) return
        measure()
        renderAtlas(palette)
        if (reduced) drawStatic()
      })
      .catch(() => {}) // fallback mono metrics are already on screen

    const offTheme = onTheme(() => {
      bg = hexToRgb(cssVar('--bg-top'))
      lerpFrom = palette
      lerpTo = readPalette()
      if (reduced) {
        palette = lerpTo
        renderAtlas(palette)
        drawStatic()
      } else {
        lerpStart = performance.now()
      }
    })

    const offRM = onReducedMotionChange((r) => {
      reduced = r
      if (r) {
        cancelAnimationFrame(raf)
        raf = 0
        flash = null
        fluid.clear()
        for (const col of cols) col.ofs.fill(0) // the static frame sits at rest
        drawStatic()
      } else if (!document.hidden && !raf) {
        last = performance.now()
        raf = requestAnimationFrame(frame)
      }
    })

    const onVis = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf)
        raf = 0
      } else if (!reduced && !raf) {
        last = performance.now()
        nextFlash = last + 2000
        raf = requestAnimationFrame(frame)
      }
    }

    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pointermove', onPointer, { passive: true })
    document.documentElement.addEventListener('pointerleave', onPointerGone)

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pointermove', onPointer)
      document.documentElement.removeEventListener('pointerleave', onPointerGone)
      offTheme()
      offRM()
    }
  }, [])

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[1]">
      <canvas ref={canvasRef} id="code-layer-canvas" className="h-full w-full" />
    </div>
  )
}
