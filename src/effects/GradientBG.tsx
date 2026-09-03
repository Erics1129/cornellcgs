/**
 * Gradient background (§5.1) — a fixed full-screen raw-WebGL plane.
 * The fragment shader paints the vertical bg-top → bg-mid → bg-bot gradient
 * from the flip reference images (bright at the bottom, dark at the top), a
 * large radial glow low on the screen that breathes ~4% over 6 s and drifts
 * upward with scroll progress so each chapter feels lit differently, a corner
 * vignette, and a faint animated grain that doubles as dither so the gradient
 * never bands. Colors come from the theme CSS vars and lerp in the shader
 * over ~0.8 s when the world flips (§5.3). DPR is capped at 1.75 and the rAF
 * loop pauses while the tab is hidden (§7); with prefers-reduced-motion we
 * render single static frames on resize / theme / scroll instead. If WebGL is
 * unavailable, the CSS-gradient stub markup takes over.
 */
import { useEffect, useRef, useState } from 'react'
import { cssVar, onTheme, THEME_LERP_MS, themeLerpEase } from '../lib/theme'
import { onReducedMotionChange, prefersReducedMotion } from '../lib/motion'

const DPR_CAP = 1.75

const VERT = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

const FRAG = `
precision highp float;

uniform vec2 u_res;
uniform float u_time;
uniform float u_scroll;
uniform float u_mix;
uniform vec3 u_from[4];
uniform vec3 u_to[4];
uniform vec2 u_pointer;
uniform float u_pstr;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;

  // The field notices the pointer: space bends gently toward it and the
  // glow pools there. u_pstr eases 0→1 on enter, →0 on leave.
  vec2 pd = uv - u_pointer;
  pd.x *= u_res.x / u_res.y;
  float pf = exp(-dot(pd, pd) * 14.0) * u_pstr;
  uv -= pd * pf * 0.16;

  vec3 top = mix(u_from[0], u_to[0], u_mix);
  vec3 mid = mix(u_from[1], u_to[1], u_mix);
  vec3 bot = mix(u_from[2], u_to[2], u_mix);
  vec3 glo = mix(u_from[3], u_to[3], u_mix);

  // Vertical gradient — bright at the bottom like the flip references
  vec3 col = mix(bot, mid, smoothstep(0.0, 0.46, uv.y));
  col = mix(col, top, smoothstep(0.34, 0.94, uv.y));

  // Radial glow anchored below bottom center; breathes over 6 s, rides scroll
  float r = 0.5 * (1.0 + 0.04 * sin(u_time * 1.0471976));
  vec2 d = uv - vec2(0.5, u_scroll * 0.34 - 0.12);
  d.x *= u_res.x / u_res.y;
  d.y *= 1.4;
  float g = exp(-dot(d, d) / (r * r));
  col = 1.0 - (1.0 - col) * (1.0 - glo * g * 0.62);

  // Pointer pool of light
  col = 1.0 - (1.0 - col) * (1.0 - glo * pf * 0.35);

  // Corner vignette
  vec2 v = uv - 0.5;
  v.x *= 1.12;
  float vig = smoothstep(0.92, 0.30, length(v));
  col *= mix(0.68, 1.0, vig);

  // Faint grain, nudged by time so it shimmers; static when time is frozen
  vec2 shift = vec2(fract(u_time * 0.61) * 431.0, fract(u_time * 0.83) * 917.0);
  col += (hash(gl_FragCoord.xy + shift) - 0.5) * 0.03;

  gl_FragColor = vec4(col, 1.0);
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

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function buildProgram(gl: WebGLRenderingContext): WebGLProgram | null {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT)
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
  if (!vs || !fs) return null
  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    return null
  }
  return program
}

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
    const program = buildProgram(gl)
    if (!program) {
      setFallback(true)
      return
    }
    gl.useProgram(program)

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(program, 'a_pos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const uRes = gl.getUniformLocation(program, 'u_res')
    const uTime = gl.getUniformLocation(program, 'u_time')
    const uScroll = gl.getUniformLocation(program, 'u_scroll')
    const uMix = gl.getUniformLocation(program, 'u_mix')
    const uFrom = gl.getUniformLocation(program, 'u_from[0]')
    const uTo = gl.getUniformLocation(program, 'u_to[0]')
    const uPointer = gl.getUniformLocation(program, 'u_pointer')
    const uPstr = gl.getUniformLocation(program, 'u_pstr')

    let animated = !prefersReducedMotion()
    let raf = 0
    let last = -1
    let timeS = 0
    let mixStart = -1

    // Pointer field: target (raw) and smoothed position in 0..1 uv space,
    // strength fading in/out so leaving the window never snaps the sky.
    const finePointer = window.matchMedia('(pointer: fine)').matches && animated
    let ptx = 0.5
    let pty = 0.5
    let psx = 0.5
    let psy = 0.5
    let pstrTarget = 0
    let pstr = 0

    let from = readPalette()
    let to = from
    gl.uniform3fv(uFrom, from)
    gl.uniform3fv(uTo, to)
    gl.uniform1f(uMix, 1)

    const ease = themeLerpEase

    const frame = (now: number) => {
      raf = 0
      if (last < 0) last = now
      if (animated) timeS += Math.min((now - last) / 1000, 0.1)
      last = now

      const docH = document.documentElement.scrollHeight - window.innerHeight
      const scroll = docH > 0 ? Math.min(1, Math.max(0, window.scrollY / docH)) : 0

      let mix = 1
      if (mixStart >= 0) {
        const t = Math.min(1, (now - mixStart) / THEME_LERP_MS)
        mix = ease(t)
        if (t >= 1) mixStart = -1
      }

      // Smooth the pointer (~180 ms settle) and its strength (~400 ms)
      psx += (ptx - psx) * 0.1
      psy += (pty - psy) * 0.1
      pstr += (pstrTarget - pstr) * 0.06

      gl.uniform1f(uTime, timeS)
      gl.uniform1f(uScroll, scroll)
      gl.uniform1f(uMix, mix)
      gl.uniform2f(uPointer, psx, psy)
      gl.uniform1f(uPstr, pstr)
      gl.drawArrays(gl.TRIANGLES, 0, 3)

      // Keep looping while animating or mid theme-lerp; otherwise on demand
      if (!document.hidden && (animated || mixStart >= 0 || pstr > 0.005)) raf = requestAnimationFrame(frame)
    }

    const onPointerMove = (e: PointerEvent) => {
      ptx = e.clientX / window.innerWidth
      pty = 1 - e.clientY / window.innerHeight
      pstrTarget = 1
      schedule()
    }
    const onPointerLeave = () => {
      pstrTarget = 0
      schedule()
    }
    if (finePointer) {
      window.addEventListener('pointermove', onPointerMove, { passive: true })
      document.addEventListener('pointerleave', onPointerLeave)
    }

    const schedule = () => {
      if (!raf && !document.hidden) raf = requestAnimationFrame(frame)
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP)
      const w = Math.round(window.innerWidth * dpr)
      const h = Math.round(window.innerHeight * dpr)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      gl.viewport(0, 0, w, h)
      gl.uniform2f(uRes, w, h)
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

    // Static frames still track the scroll-lit glow; loop covers animated mode
    const onScroll = () => {
      if (!animated) schedule()
    }

    const offTheme = onTheme(() => {
      // Rebase so whatever is on screen becomes the start of the new lerp
      const now = performance.now()
      const e = mixStart >= 0 ? ease(Math.min(1, (now - mixStart) / THEME_LERP_MS)) : 1
      const shown = new Float32Array(12)
      for (let i = 0; i < 12; i++) shown[i] = from[i] + (to[i] - from[i]) * e
      from = shown
      to = readPalette()
      gl.uniform3fv(uFrom, from)
      gl.uniform3fv(uTo, to)
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
      setFallback(true)
    }

    window.addEventListener('resize', resize)
    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    canvas.addEventListener('webglcontextlost', onContextLost)
    resize()

    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerleave', onPointerLeave)
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener('webglcontextlost', onContextLost)
      offTheme()
      offReduced()
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      // No loseContext(): StrictMode remounts reuse this canvas's context
    }
  }, [])

  if (fallback) {
    return (
      <div
        aria-hidden="true"
        className="fixed inset-0 z-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(120% 55% at 50% 108%, color-mix(in srgb, var(--glow) 55%, transparent), transparent 70%),
            linear-gradient(to bottom, var(--bg-top) 0%, var(--bg-mid) 62%, var(--bg-bot) 100%)
          `,
        }}
      />
    )
  }

  return (
    <div aria-hidden="true" className="fixed inset-0 z-0 pointer-events-none">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  )
}
