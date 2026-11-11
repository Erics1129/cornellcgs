/**
 * The lit table — a fixed full-screen raw-WebGL plane behind the deck.
 * It is the one surface the table chapters share (Who we are, What we do,
 * Project, Stats, People, Join, the footer): a vertical felt gradient from the
 * theme tokens, a warm key-light pool from the upper left (the same direction
 * as --film-key-x / --film-key-y in film.css), a low glow that breathes and
 * rides scroll, and a pool of light under the pointer. Everything is summed
 * in linear light and ends in the shared film() (dither included; grain and
 * the full vignette belong to the lens).
 *
 * It is fixed in the viewport, so cards scroll THROUGH one light.
 * It stops drawing while opaque chapters cover the viewport
 * (deckFrame().bgVisible), is capped by tier().bgFps, and idles at 30 fps
 * when nothing but the slow breath is moving.
 */
import { useEffect, useRef, useState } from 'react'
import { cssVar, onTheme, THEME_LERP_MS, themeLerpEase } from '../lib/theme'
import { onReducedMotionChange, prefersReducedMotion } from '../lib/motion'
import { deckFrame, onDeck, onSettle } from '../lib/deck'
import { look, onLook } from '../lib/look'
import { onTier, tier } from '../lib/tier'
import { filmChunk } from './film/glsl'
import { bindFilm, type FilmBinder } from './film/bind'
import { buildProgram } from './film/program'
import { SCENE_GRADES } from './film/grades'

/** The key light's direction, mirrored from film.css (--film-key-x, --film-key-y). */
const KEY = { x: -0.42, y: -0.78 }

const VERT = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

const FRAG = `
precision highp float;
${filmChunk(100)}
uniform vec2 u_res;
uniform float u_time;
uniform float u_scroll;
uniform float u_mix;
uniform vec3 u_from[4];
uniform vec3 u_to[4];
uniform vec2 u_pointer;
uniform float u_pstr;
uniform vec2 u_key;
uniform vec3 u_warm;
uniform vec3 u_cool;

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;

  // The field notices the pointer: space bends gently toward it and light pools there.
  vec2 pd = uv - u_pointer;
  pd.x *= aspect;
  float pf = exp(-dot(pd, pd) * 14.0) * u_pstr;
  uv -= pd * pf * 0.16;

  vec3 top = srgbToLinear(mix(u_from[0], u_to[0], u_mix));
  vec3 mid = srgbToLinear(mix(u_from[1], u_to[1], u_mix));
  vec3 bot = srgbToLinear(mix(u_from[2], u_to[2], u_mix));
  vec3 glo = srgbToLinear(mix(u_from[3], u_to[3], u_mix));

  // Felt: darkest at the top, warmest low on the screen
  vec3 col = mix(bot, mid, smoothstep(0.0, 0.5, uv.y));
  col = mix(col, top, smoothstep(0.36, 0.96, uv.y));

  // Low glow anchored below the bottom centre; breathes over 6 s, rides scroll
  float r = 0.5 * (1.0 + 0.04 * sin(u_time * 1.0471976));
  vec2 d = uv - vec2(0.5, u_scroll * 0.34 - 0.12);
  d.x *= aspect;
  d.y *= 1.4;
  col += glo * exp(-dot(d, d) / (r * r)) * 0.22;

  // Key light: a warm lamp from the upper left, fixed in the room
  vec2 k = uv - u_key;
  k.x *= aspect;
  float key = exp(-dot(k, k) / 0.34);
  col += u_warm * (0.052 * key + 0.03 * key * key);
  // Cool fill from the opposite side keeps the far corner from going muddy
  vec2 f = uv - vec2(1.0 - u_key.x, 1.0 - u_key.y);
  f.x *= aspect;
  col += u_cool * 0.012 * exp(-dot(f, f) / 0.5);

  // Pointer pool of light
  col += glo * pf * 0.2 + u_warm * pf * 0.03;

  // Room falloff. The lens adds the real vignette on top of every chapter.
  vec2 v = uv - 0.5;
  v.x *= 1.12;
  col *= mix(0.8, 1.0, smoothstep(0.92, 0.30, length(v)));

  gl_FragColor = vec4(film(col), 1.0);
}
`

/** Parse a CSS color token (#rgb / #rrggbb / rgb[a]) into 0..1 floats. */
function parseColor(raw: string): [number, number, number] {
  const s = raw.trim()
  if (s.startsWith('#')) {
    const hex = s.slice(1)
    const full =
      hex.length === 3
        ? hex
            .split('')
            .map((c) => c + c)
            .join('')
        : hex
    const n = parseInt(full, 16)
    if (full.length === 6 && !Number.isNaN(n)) {
      return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
    }
  }
  const m = s.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/)
  if (m) return [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255]
  return [0.012, 0.027, 0.102] // --bg-top navy; only if a token goes missing
}

/** Read the current theme's four shader colors: top, mid, bot, glow. */
function readPalette(): Float32Array {
  const out = new Float32Array(12)
  const names = ['--bg-top', '--bg-mid', '--bg-bot', '--glow']
  for (let i = 0; i < names.length; i++) {
    const [r, g, b] = parseColor(cssVar(names[i]))
    out[i * 3] = r
    out[i * 3 + 1] = g
    out[i * 3 + 2] = b
  }
  return out
}

const linear = (c: [number, number, number]): Float32Array =>
  new Float32Array(c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)))

export default function GradientBG() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [fallback, setFallback] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
    })
    if (!gl || gl.isContextLost()) {
      setFallback(true)
      return
    }

    let program: WebGLProgram | null = null
    let buffer: WebGLBuffer | null = null
    let film: FilmBinder | null = null
    let U: Record<string, WebGLUniformLocation | null> = {}

    let animated = !prefersReducedMotion()
    let raf = 0
    let last = -1
    let lastDraw = 0
    let timeS = 0
    let mixStart = -1
    let dirty = true
    let width = 0
    let height = 0

    // Pointer pool: position in 0..1 uv space and a strength that fades in and out.
    let psx = 0.5
    let psy = 0.5
    let pstr = 0
    let pointerAt = -1e9

    let from = readPalette()
    let to = from
    let warm = linear(parseColor(cssVar('--film-warm') || '#e6a86a'))
    let cool = linear(parseColor(cssVar('--film-cool') || '#6f93b8'))

    const build = () => {
      const built = buildProgram(gl, VERT, FRAG, { a_pos: 0 })
      if (!built || !built.finish()) return false
      program = built.program
      gl.useProgram(program)
      buffer = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
      gl.enableVertexAttribArray(0)
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
      U = {}
      for (const name of ['u_res', 'u_time', 'u_scroll', 'u_mix', 'u_from[0]', 'u_to[0]', 'u_pointer', 'u_pstr', 'u_key', 'u_warm', 'u_cool']) {
        U[name] = gl.getUniformLocation(program, name)
      }
      film = bindFilm(gl, program)
      gl.uniform3fv(U['u_from[0]'], from)
      gl.uniform3fv(U['u_to[0]'], to)
      gl.uniform2f(U.u_key, 0.5 + KEY.x * 0.52, 0.5 - KEY.y * 0.41)
      gl.uniform3fv(U.u_warm, warm)
      gl.uniform3fv(U.u_cool, cool)
      width = height = 0
      return true
    }
    if (!build()) {
      setFallback(true)
      return
    }

    const ease = themeLerpEase

    /** One frame. Returns true while something is still moving. */
    const draw = (now: number): boolean => {
      if (!program || !film) return false
      if (last < 0) last = now
      const dt = Math.min((now - last) / 1000, 0.1)
      if (animated) timeS += dt
      last = now

      let mix = 1
      if (mixStart >= 0) {
        const t = Math.min(1, (now - mixStart) / THEME_LERP_MS)
        mix = ease(t)
        if (t >= 1) mixStart = -1
      }

      // Pointer pool follows the shared look vector; time-based smoothing (tau 180 ms and 400 ms)
      const l = look()
      const active = animated && l.active && l.source === 'pointer' && now - pointerAt < 4000
      const kp = 1 - Math.exp(-dt / 0.18)
      const ks = 1 - Math.exp(-dt / 0.4)
      psx += ((l.x + 1) / 2 - psx) * kp
      psy += ((1 - l.y) / 2 - psy) * kp
      pstr += ((active ? 1 : 0) - pstr) * ks

      gl.uniform1f(U.u_time, timeS)
      gl.uniform1f(U.u_scroll, deckFrame().progress)
      gl.uniform1f(U.u_mix, mix)
      gl.uniform2f(U.u_pointer, psx, psy)
      gl.uniform1f(U.u_pstr, pstr)
      film(SCENE_GRADES.table, 0)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      lastDraw = now
      dirty = false
      return animated || mixStart >= 0 || pstr > 0.005
    }

    const frame = (now: number) => {
      raf = 0
      if (document.hidden) return
      const deck = deckFrame()
      // Covered by opaque chapters: draw nothing, and stop asking for frames.
      if (!deck.bgVisible) {
        last = now
        return
      }
      const t = tier()
      const lively = !deck.idle || mixStart >= 0 || pstr > 0.005 || now - pointerAt < 600
      const fps = t.bgFps === 0 ? 0 : lively ? t.bgFps : Math.min(t.bgFps, 30)
      let again = true
      if (dirty || (fps > 0 && now - lastDraw >= 1000 / fps - 2)) again = draw(now)
      if (again && fps > 0) raf = requestAnimationFrame(frame)
    }

    const schedule = () => {
      dirty = true
      if (!raf && !document.hidden) raf = requestAnimationFrame(frame)
    }

    const resize = () => {
      const t = tier()
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75, t.dprCap) * Math.min(1, t.scale + 0.15)
      const w = Math.round(canvas.clientWidth * dpr) || Math.round(window.innerWidth * dpr)
      const h = Math.round(canvas.clientHeight * dpr) || Math.round(window.innerHeight * dpr)
      if (w === width && h === height) return
      width = w
      height = h
      canvas.width = w
      canvas.height = h
      gl.viewport(0, 0, w, h)
      gl.uniform2f(U.u_res, w, h)
      schedule()
    }

    const onVisibility = () => {
      if (document.hidden) {
        if (raf) cancelAnimationFrame(raf)
        raf = 0
      } else {
        last = -1
        schedule()
      }
    }

    const offLook = onLook((l) => {
      if (l.source !== 'pointer') return
      pointerAt = performance.now()
      if (!raf && animated) schedule()
    })
    // The glow rides scroll; a covered background wakes up when it is uncovered again.
    const offDeck = onDeck(() => {
      if (!raf) schedule()
    })
    const offSettle = onSettle(schedule)
    const offTier = onTier(() => resize())

    const offTheme = onTheme(() => {
      // Rebase so whatever is on screen becomes the start of the new lerp
      const now = performance.now()
      const e = mixStart >= 0 ? ease(Math.min(1, (now - mixStart) / THEME_LERP_MS)) : 1
      const shown = new Float32Array(12)
      for (let i = 0; i < 12; i++) shown[i] = from[i] + (to[i] - from[i]) * e
      from = shown
      to = readPalette()
      warm = linear(parseColor(cssVar('--film-warm') || '#e6a86a'))
      cool = linear(parseColor(cssVar('--film-cool') || '#6f93b8'))
      gl.uniform3fv(U['u_from[0]'], from)
      gl.uniform3fv(U['u_to[0]'], to)
      gl.uniform3fv(U.u_warm, warm)
      gl.uniform3fv(U.u_cool, cool)
      mixStart = now
      schedule()
    })

    const offReduced = onReducedMotionChange((reduced) => {
      animated = !reduced
      schedule()
    })

    const onContextLost = (e: Event) => {
      e.preventDefault()
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      program = null
      film = null
      canvas.style.visibility = 'hidden' // the CSS table underneath shows
    }
    const onContextRestored = () => {
      if (!build()) return setFallback(true)
      canvas.style.visibility = ''
      resize()
      schedule()
    }

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    document.addEventListener('visibilitychange', onVisibility)
    canvas.addEventListener('webglcontextlost', onContextLost)
    canvas.addEventListener('webglcontextrestored', onContextRestored)
    resize()
    schedule()

    return () => {
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener('webglcontextlost', onContextLost)
      canvas.removeEventListener('webglcontextrestored', onContextRestored)
      offLook()
      offDeck()
      offSettle()
      offTier()
      offTheme()
      offReduced()
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      // No loseContext(): StrictMode remounts reuse this canvas's context
    }
  }, [])

  // The CSS table sits under the canvas: it is the poster, the WebGL-less fallback and the lost-context picture.
  return (
    <div aria-hidden="true" className="film-bg">
      {!fallback && <canvas ref={canvasRef} />}
    </div>
  )
}
