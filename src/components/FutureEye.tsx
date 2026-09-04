import { useEffect, useRef } from 'react'
import { EYE_FRAG, EYE_VERT } from '../effects/eyeShader'
import { CFR_UPDATE, POKER_EVALUATOR, POT_EQUITY, SITE_SNIPPETS } from '../effects/codeSnippets'
import { prefersReducedMotion } from '../lib/motion'
import { vision } from '../content'
import { useSectionReveals } from '../lib/reveal'

/**
 * Our future vision — the last chapter. Pure black; one eye, rendered in a
 * fragment shader (effects/eyeShader.ts): a ray-marched face around an
 * analytic eyeball, the cornea reflecting a code editor that never stops
 * typing. This file is the life around it:
 *
 *   gaze    she looks where the cursor is (saccade-quick, with the micro
 *           drift of a real fixation); with no cursor she reads the code —
 *           short fixations across a line, a sweep back, the next line
 *   blink   every 2.5–6 s, fast down, slower up, a double now and then,
 *           more likely right after a big look
 *   pupil   breathes (hippus) and answers the screen's brightness
 *   screen  a 640×400 canvas editor typing the club's real code, uploaded
 *           as the reflection texture; its average colour lights the face
 *
 * Renders only while near the viewport and the tab is visible; the render
 * size is capped so the march stays cheap on 4K. Reduced motion: a still.
 */

const FILES = [
  { name: 'evaluator.ts', lines: POKER_EVALUATOR },
  { name: 'cfr.ts', lines: CFR_UPDATE },
  { name: 'equity.ts', lines: POT_EQUITY },
  { name: 'site.tsx', lines: SITE_SNIPPETS },
]
const KW = /\b(const|let|function|return|if|else|for|while|new|type|number|boolean|string|export|import|from|interface|class|extends|async|await|true|false|null)\b/
const SCREEN_W = 1024
const SCREEN_H = 640
const LINE_H = 66
const VISIBLE = 8
const COLS = 36   // soft-wrap width at the editor's type size

type Uniforms = Record<string, WebGLUniformLocation | null>

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error('eye shader: ' + log)
  }
  return sh
}

/** The editor she is looking at. Draws into its canvas; `tick` advances the typing. */
class Screen {
  canvas = document.createElement('canvas')
  ctx = this.canvas.getContext('2d')!
  file = 0
  line = 0
  col = 0
  hold = 0
  nextChar = 0
  cursorOn = true
  cursorAt = 0
  dirty = true
  tint: [number, number, number] = [0.2, 0.25, 0.4]
  private probe = document.createElement('canvas')
  private probeCtx = this.probe.getContext('2d', { willReadFrequently: true })!

  constructor() {
    this.canvas.width = SCREEN_W
    this.canvas.height = SCREEN_H
    this.probe.width = 4
    this.probe.height = 4
  }

  /** a slip: wrong characters typed, then backspaced */
  typo = ''
  typoLeft = 0
  typoDeleting = false
  /** wiping: the finished file is deleted from the end, fast, before the next begins */
  wiping = false

  /** Advance the typist; returns true when a new file started (a beat for the pupil). */
  tick(now: number, dt: number): boolean {
    let started = false
    const lines = FILES[this.file].lines
    if (this.hold > 0) {
      this.hold -= dt
      if (this.hold <= 0) {
        this.wiping = true
        this.nextChar = now
      }
    } else if (this.wiping) {
      // backspace through the file, several characters a beat
      if (now >= this.nextChar) {
        for (let k = 0; k < 10; k++) {
          if (this.col > 0) this.col--
          else if (this.line > 0) {
            this.line--
            this.col = lines[this.line].length
          } else {
            this.wiping = false
            this.file = (this.file + 1) % FILES.length
            started = true
            break
          }
        }
        this.nextChar = now + 16
        this.dirty = true
      }
    } else if (now >= this.nextChar) {
      const cur = lines[this.line] ?? ''
      if (this.typoLeft > 0) {
        // the slip: wrong characters go in, a pause, then they all come back out
        if (!this.typoDeleting) {
          this.typo += 'qwertasdfg'[Math.floor(Math.random() * 10)]
          this.nextChar = now + 24 + Math.random() * 24
          if (this.typo.length >= this.typoLeft) {
            this.typoDeleting = true
            this.nextChar = now + 180
          }
        } else {
          this.typo = this.typo.slice(0, -1)
          this.nextChar = now + 34
          if (this.typo.length === 0) {
            this.typoLeft = 0
            this.typoDeleting = false
          }
        }
      } else if (this.col < cur.length) {
        this.col++
        this.nextChar = now + 12 + Math.random() * 24 + (cur[this.col - 1] === ' ' ? 14 : 0)
        if (Math.random() < 0.03 && this.col > 2) this.typoLeft = 1 + Math.floor(Math.random() * 3)
      } else if (this.line < lines.length - 1) {
        this.line++
        this.col = 0
        this.nextChar = now + 70 + Math.random() * 110
      } else {
        this.hold = 1500
      }
      this.dirty = true
    }
    if (now - this.cursorAt > 520) {
      this.cursorOn = !this.cursorOn
      this.cursorAt = now
      this.dirty = true
    }
    return started
  }

  private paintLine(text: string, x: number, y: number) {
    const c = this.ctx
    const ci = text.indexOf('//')
    const code = ci >= 0 ? text.slice(0, ci) : text
    const comment = ci >= 0 ? text.slice(ci) : ''
    // strings amber, keywords blue, numbers violet, the rest ivory
    const parts = code.split(/('(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/)
    for (const part of parts) {
      if (!part) continue
      if (/^['`]/.test(part)) {
        c.fillStyle = '#9a4a00'
        c.fillText(part, x, y)
        x += c.measureText(part).width
        continue
      }
      for (const tok of part.split(/(\s+|[(){}[\];,.<>=+\-*/!&|?:]+)/)) {
        if (!tok) continue
        c.fillStyle = KW.test(tok) ? '#1b3fb8' : /^\d/.test(tok) ? '#5b21b6' : '#0f172a'
        c.fillText(tok, x, y)
        x += c.measureText(tok).width
      }
    }
    if (comment) {
      c.fillStyle = '#6b7791'
      c.fillText(comment, x, y)
    }
  }

  paint() {
    const c = this.ctx
    const f = FILES[this.file]
    // painted mirrored: the cornea mirrors it back, so the reader reads it the right way round
    c.setTransform(-1, 0, 0, 1, SCREEN_W, 0)
    c.fillStyle = '#cfd9ee'
    c.fillRect(0, 0, SCREEN_W, SCREEN_H)
    // title bar
    c.fillStyle = '#eef2fb'
    c.fillRect(0, 0, SCREEN_W, 40)
    for (const [x, colr] of [[22, '#ff5f57'], [44, '#febc2e'], [66, '#28c840']] as Array<[number, string]>) {
      c.fillStyle = colr
      c.beginPath()
      c.arc(x, 20, 7, 0, Math.PI * 2)
      c.fill()
    }
    c.font = '600 20px "JetBrains Mono", ui-monospace, monospace'
    c.fillStyle = '#5b6a88'
    c.fillText(`${f.name} — cornellcgs`, 92, 27)
    // gutter + code, scrolled so the cursor line stays in view
    c.font = '600 44px "JetBrains Mono", ui-monospace, monospace'
    // rows: every line soft-wrapped at COLS; the cursor sits at the end of the current line's text (+ any slip)
    const rows: Array<{ text: string; cursor: boolean }> = []
    for (let li = 0; li <= this.line; li++) {
      const full = li < this.line ? f.lines[li] : f.lines[li].slice(0, this.col) + this.typo
      const chunks: string[] = []
      for (let k = 0; k < Math.max(1, full.length); k += COLS) chunks.push(full.slice(k, k + COLS))
      chunks.forEach((t, k) => rows.push({ text: t, cursor: li === this.line && k === chunks.length - 1 }))
    }
    const firstRow = Math.max(0, rows.length - VISIBLE)
    c.save()
    c.beginPath()
    c.rect(0, 40, SCREEN_W, SCREEN_H - 70)
    c.clip()
    for (let i = 0; i < VISIBLE; i++) {
      const row = rows[firstRow + i]
      if (!row) break
      const y = 40 + 52 + i * LINE_H
      if (row.cursor) {
        c.fillStyle = '#dde6f7'
        c.fillRect(0, y - 48, SCREEN_W, LINE_H)
      }
      this.paintLine(row.text, 28, y)
      if (row.cursor && this.cursorOn) {
        const w = c.measureText(row.text).width
        c.fillStyle = '#1b3fb8'
        c.fillRect(28 + w + 4, y - 40, 20, 52)
      }
    }
    c.restore()
    // status bar
    c.fillStyle = '#b9c6e2'
    c.fillRect(0, SCREEN_H - 30, SCREEN_W, 30)
    c.font = '500 11px "JetBrains Mono", ui-monospace, monospace'
    c.fillStyle = '#5b6a88'
    c.font = '500 18px "JetBrains Mono", ui-monospace, monospace'
    c.fillText(`TypeScript   UTF-8   Ln ${this.line + 1}, Col ${this.col + 1}`, 14, SCREEN_H - 9)
    c.fillStyle = '#1e5eff'
    c.fillText('● main', SCREEN_W - 96, SCREEN_H - 9)
    c.setTransform(1, 0, 0, 1, 0, 0)
    this.dirty = false
  }

  /** Run the typist ahead on a fake clock so the first sight is a screen already full of code. */
  warm(ms: number) {
    // a clock of its own: right after page load performance.now() is small, and
    // "ms ago" would be negative time the typist has to sit out
    const t = 1e6
    this.nextChar = t
    this.cursorAt = t
    for (let k = 0; k < ms; k += 20) this.tick(t + k, 20)
    this.nextChar = performance.now()
    this.dirty = true
  }

  /** Average colour of the screen — the light it throws on the face. */
  measureTint() {
    this.probeCtx.drawImage(this.canvas, 0, 0, 4, 4)
    const d = this.probeCtx.getImageData(0, 0, 4, 4).data
    let r = 0
    let g = 0
    let b = 0
    for (let i = 0; i < d.length; i += 4) {
      r += d[i]
      g += d[i + 1]
      b += d[i + 2]
    }
    const n = (d.length / 4) * 255   // pixels × 255 → 0..1
    this.tint = [r / n, g / n, b / n]
  }
}

export default function FutureEye() {
  const root = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useSectionReveals(root)

  useEffect(() => {
    const section = root.current
    const canvas = canvasRef.current
    if (!section || !canvas) return
    const reduced = prefersReducedMotion()
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: false, powerPreference: 'high-performance' })
    if (!gl) return
    if (gl.isContextLost()) gl.getExtension('WEBGL_lose_context')?.restoreContext()

    // ---------------------------------------------------------------- GL
    let program: WebGLProgram | null = null
    let U: Uniforms = {}
    let tex: WebGLTexture | null = null
    const setup = () => {
      const vs = compile(gl, gl.VERTEX_SHADER, EYE_VERT)
      const fs = compile(gl, gl.FRAGMENT_SHADER, EYE_FRAG)
      program = gl.createProgram()!
      gl.attachShader(program, vs)
      gl.attachShader(program, fs)
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('eye link: ' + gl.getProgramInfoLog(program))
      gl.useProgram(program)
      const buf = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
      const loc = gl.getAttribLocation(program, 'a_pos')
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
      for (const name of ['u_res', 'u_time', 'u_blink', 'u_gaze', 'u_head', 'u_lash', 'u_pupil', 'u_seed', 'u_screen', 'u_screenTint', 'u_vignette', 'u_debug']) {
        U[name] = gl.getUniformLocation(program, name)
      }
      tex = gl.createTexture()!
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)   // canvas row 0 is the top; the shader's uv.y = 1 is the top
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.uniform1i(U.u_screen, 0)
      gl.uniform1f(U.u_seed, 3.7)
      gl.uniform1f(U.u_vignette, 1)
    }
    try {
      setup()
    } catch (e) {
      console.warn(String(e))
      return
    }

    // ---------------------------------------------------------------- state
    const screen = new Screen()
    screen.warm(9000)
    screen.paint()
    screen.measureTint()
    let w = 0
    let h = 0
    let raf = 0
    let slow = 0
    let quality = 1
    let near = false
    let last = performance.now()
    const t0 = last
    let lastTint = 0
    let lastUpload = 0

    // gaze
    const pointer = { x: 0, y: 0, at: -1e9, inside: false }
    // physics: gaze and head are mass–spring–damper systems (position + velocity)
    const gaze = { x: 0.12, y: 0.08, vx: 0, vy: 0 }
    const target = { x: 0.12, y: 0.08 }
    // where the monitor is, from her side: the resting gaze (and the reading pattern's centre)
    const SCREEN_GAZE = { x: 0.14, y: 0.1 }
    const reading = { line: 0, col: 0, until: 0 }
    let lastBigLook = 0

    // the head: drifts sideways now and then, the way a programmer sits
    const head = { x: 0, y: 0, vx: 0, vy: 0 }
    const headTarget = { x: 0, y: 0, until: 0, k: 6 }

    // blink
    let blink = 0
    let lidV = 0
    // the lashes: a light spring driven by the lid's speed — whip on the way down, wobble back
    let lash = 0
    let lashV = 0
    let blinkStart = -1
    let nextBlink = t0 + 1400 + Math.random() * 2000
    let lastBlinkEnd = t0
    let doubleAfter = false

    // pupil
    let pupil = 0.63
    let pupilKick = 0

    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX
      pointer.y = e.clientY
      pointer.at = performance.now()
      pointer.inside = true
    }
    const onLeave = () => {
      pointer.inside = false
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerleave', onLeave)
    document.addEventListener('mouseleave', onLeave)

    const resize = () => {
      const r = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      // the march is per pixel: phones render smaller and upscale
      const coarse = window.matchMedia('(pointer: coarse)').matches
      const cap = (coarse ? 900 : 1400) / Math.max(1, r.width)
      const s = Math.min(dpr, cap) * quality
      w = Math.max(2, Math.round(r.width * s))
      h = Math.max(2, Math.round(r.height * s))
      canvas.width = w
      canvas.height = h
      gl.viewport(0, 0, w, h)
      draw(performance.now())
    }

    const ease = {
      inQuad: (x: number) => x * x,
      outCubic: (x: number) => 1 - Math.pow(1 - x, 3),
    }

    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now

      // -- the screen types
      const started = screen.tick(now, dt * 1000)
      if (started) pupilKick = 1
      if (screen.dirty && now - lastUpload > 33) {
        screen.paint()
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, screen.canvas)
        gl.generateMipmap(gl.TEXTURE_2D)
        lastUpload = now
      }
      if (now - lastTint > 220) {
        screen.measureTint()
        lastTint = now
      }

      // -- where she looks
      const cursorLive = pointer.inside && now - pointer.at < 3200
      if (cursorLive) {
        const nx = Math.max(-1.6, Math.min(1.6, (pointer.x - window.innerWidth / 2) / (window.innerWidth / 2)))
        const ny = Math.max(-1.6, Math.min(1.6, (window.innerHeight / 2 - pointer.y) / (window.innerHeight / 2)))
        target.x = -nx * 0.3
        target.y = ny * 0.2
      } else if (now > reading.until) {
        // reading the editor: across a line in fixations, a sweep back, the next line
        reading.col++
        if (reading.col > 5) {
          reading.col = 0
          reading.line = (reading.line + 1) % 7
        }
        target.x = SCREEN_GAZE.x + 0.09 - 0.18 * (reading.col / 5) + (Math.random() - 0.5) * 0.02
        target.y = SCREEN_GAZE.y + 0.03 - 0.07 * (reading.line / 6) + (Math.random() - 0.5) * 0.01
        reading.until = now + (reading.col === 0 ? 420 : 200) + Math.random() * 220
      }
      // a saccade: a stiff, slightly under-damped spring — fast, a hair of overshoot, then still
      const dx = target.x - gaze.x
      const dy = target.y - gaze.y
      const big = Math.hypot(dx, dy) > 0.22
      {
        const k = 520, c = 2 * Math.sqrt(k) * 0.72
        const h = Math.min(dt, 1 / 120)
        for (let tt = 0; tt < dt; tt += h) {
          gaze.vx += (k * (target.x - gaze.x) - c * gaze.vx) * h
          gaze.vy += (k * (target.y - gaze.y) - c * gaze.vy) * h
          gaze.x += gaze.vx * h
          gaze.y += gaze.vy * h
        }
        // the tremor of a fixation
        gaze.x += Math.sin(now * 0.0031) * 0.0006 * dt * 60
        gaze.y += Math.cos(now * 0.0023) * 0.0005 * dt * 60
      }
      if (big && now - lastBigLook > 900) {
        lastBigLook = now
        if (Math.random() < 0.35 && blinkStart < 0) blinkStart = now + 60
      }

      // -- the head drifts: a new resting place every few seconds, eased over ~1 s, plus a slow breath
      if (now > headTarget.until) {
        headTarget.x = (Math.random() - 0.5) * 0.7
        headTarget.y = (Math.random() - 0.5) * 0.22
        headTarget.k = 3 + Math.random() * 6
        headTarget.until = now + 1800 + Math.random() * 4200
      }
      {
        // the head: a heavier, well-damped spring (a body settling, not a cursor)
        const k = headTarget.k, c = 2 * Math.sqrt(k) * 0.85
        head.vx += (k * (headTarget.x - head.x) - c * head.vx) * dt
        head.vy += (k * (headTarget.y - head.y) - c * head.vy) * dt
        head.x += head.vx * dt
        head.y += head.vy * dt
      }

      // -- blink (never longer than ~8 s between two)
      if (blinkStart < 0 && (now >= nextBlink || now - lastBlinkEnd > 8000)) blinkStart = now
      if (blinkStart >= 0) {
        const e = now - blinkStart
        // the lid is a spring: driven hard toward closed, released toward open
        const goal = e < 0 ? 0 : e < 130 ? 1 : 0
        const k = goal > 0.5 ? 2600 : 900
        const c = 2 * Math.sqrt(k) * (goal > 0.5 ? 0.9 : 0.78)
        const h = Math.min(dt, 1 / 240)
        for (let tt = 0; tt < dt; tt += h) {
          lidV += (k * (goal - blink) - c * lidV) * h
          blink += lidV * h
        }
        blink = Math.max(0, Math.min(1, blink))
        if (e > 130 && blink < 0.02 && Math.abs(lidV) < 0.5) {
          blink = 0
          lidV = 0
          blinkStart = -1
          lastBlinkEnd = now
          if (!doubleAfter && Math.random() < 0.16) {
            doubleAfter = true
            nextBlink = now + 180
          } else {
            doubleAfter = false
            nextBlink = now + 2500 + Math.random() * 4500
          }
        }
      }

      // -- lashes ride the lid's velocity and settle on their own spring
      {
        const k = 260, c = 2 * Math.sqrt(k) * 0.42
        const drive = -lidV * 0.016
        const h = Math.min(dt, 1 / 240)
        for (let tt = 0; tt < dt; tt += h) {
          lashV += (k * (drive - lash) - c * lashV) * h
          lash += lashV * h
        }
        lash = Math.max(-0.25, Math.min(0.25, lash))
      }

      // -- pupil
      const tint = screen.tint
      const lum = 0.2126 * tint[0] + 0.7152 * tint[1] + 0.0722 * tint[2]
      pupilKick = Math.max(0, pupilKick - dt * 2.2)
      const hippus = 0.012 * Math.sin(now * 0.0007) + 0.008 * Math.sin(now * 0.0019 + 1.3)
      const want = Math.max(0.56, Math.min(0.7, 0.7 - 0.08 * lum + hippus - 0.03 * pupilKick))
      pupil += (want - pupil) * (1 - Math.exp(-dt * 4))
    }

    const draw = (now: number, over?: { blink?: number; gaze?: [number, number]; pupil?: number; head?: [number, number]; vignette?: number; debug?: number; lash?: number }) => {
      if (!program) return
      gl.useProgram(program)
      gl.uniform2f(U.u_res, w, h)
      gl.uniform1f(U.u_time, (now - t0) / 1000)
      gl.uniform1f(U.u_blink, over?.blink ?? blink)
      gl.uniform2f(U.u_gaze, over?.gaze?.[0] ?? gaze.x, over?.gaze?.[1] ?? gaze.y)
      gl.uniform2f(U.u_head, over?.head?.[0] ?? head.x, over?.head?.[1] ?? head.y + Math.sin(now * 0.0011) * 0.012)
      gl.uniform1f(U.u_pupil, over?.pupil ?? pupil)
      gl.uniform1f(U.u_lash, over?.lash ?? lash)
      gl.uniform1f(U.u_vignette, over?.vignette ?? 1)
      gl.uniform1f(U.u_debug, over?.debug ?? 0)
      const t = screen.tint
      // sRGB average → a light colour: squared into linear, toned down
      gl.uniform3f(U.u_screenTint, t[0] * t[0] * 0.5, t[1] * t[1] * 0.5, t[2] * t[2] * 0.5)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    const frame = (now: number) => {
      raf = 0
      const dtMs = now - last
      step(now)
      draw(now)
      // a GPU that can't keep up gets a smaller buffer (Lenis and GSAP share this rAF)
      if (dtMs > 20 && dtMs < 200) slow++
      else slow = Math.max(0, slow - 1)
      if (slow > 50 && quality > 0.5) {
        quality *= 0.75
        slow = 0
        resize()
      }
      if (near && !document.hidden && !reduced) raf = requestAnimationFrame(frame)
    }
    const start = () => {
      if (!raf && near && !document.hidden && !reduced) {
        last = performance.now()
        raf = requestAnimationFrame(frame)
      }
    }

    const io = new IntersectionObserver(
      (es) => {
        near = es[es.length - 1]?.isIntersecting ?? false
        if (near) start()
      },
      { rootMargin: '15% 0px' },
    )
    io.observe(section)
    const onVis = () => start()
    document.addEventListener('visibilitychange', onVis)
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()
    if (reduced) {
      // a still: eyes on the reader, pupil mid, the first file typed out
      screen.line = FILES[0].lines.length - 1
      screen.col = FILES[0].lines[screen.line].length
      screen.paint()
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, screen.canvas)
      gl.generateMipmap(gl.TEXTURE_2D)
      draw(performance.now())
    }

    const onLost = (e: Event) => {
      e.preventDefault()
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    }
    const uploadScreen = () => {
      screen.paint()
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, screen.canvas)
      gl.generateMipmap(gl.TEXTURE_2D)
      lastUpload = performance.now()
    }
    const onRestored = () => {
      try {
        setup()
        uploadScreen()
        resize()
        start()
      } catch (err) {
        console.warn(String(err))
      }
    }
    canvas.addEventListener('webglcontextlost', onLost)
    canvas.addEventListener('webglcontextrestored', onRestored)

    if (import.meta.env.DEV) {
      // one frame with overrides — for screenshots when the tab can't animate
      ;(window as unknown as { __cgsEye?: unknown }).__cgsEye = {
        frame: (over?: { blink?: number; gaze?: [number, number]; pupil?: number; head?: [number, number]; vignette?: number; debug?: number; lash?: number; advance?: number }) => {
          const now = performance.now()
          if (over?.advance) {
            for (let i = 0; i < over.advance; i++) screen.tick(now + i * 30, 30)
          }
          screen.paint()
          gl.bindTexture(gl.TEXTURE_2D, tex)
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, screen.canvas)
          gl.generateMipmap(gl.TEXTURE_2D)
          screen.measureTint()
          const a = performance.now()
          draw(now, over)
          gl.finish()
          const px = new Uint8Array(4)
          gl.readPixels(Math.floor(w / 2), Math.floor(h / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
          const corner = new Uint8Array(4)
          gl.readPixels(2, 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, corner)
          return { ms: performance.now() - a, w, h, blink, gaze: [gaze.x, gaze.y], pupil, tint: screen.tint, centre: Array.from(px), corner: Array.from(corner), lost: gl.isContextLost(), err: gl.getError() }
        },
        resize,
        screen,
        // run the life on a fake clock (ms) and sample it — the tab may not animate
        sim: (ms: number, dtMs = 16, every = 100) => {
          const out: Array<{ t: number; blink: number; gaze: [number, number]; head: [number, number]; pupil: number; file: number; line: number; bs: number; nb: number; lbe: number; lash: number }> = []
          const t0 = last
          for (let t = 0; t <= ms; t += dtMs) {
            step(t0 + t)
            if (t % every === 0) out.push({ t, blink: +blink.toFixed(3), gaze: [+gaze.x.toFixed(3), +gaze.y.toFixed(3)], head: [+head.x.toFixed(3), +head.y.toFixed(3)], pupil: +pupil.toFixed(3), file: screen.file, line: screen.line, bs: Math.round(blinkStart - t0), nb: Math.round(nextBlink - t0), lbe: Math.round(lastBlinkEnd - t0), lash: +lash.toFixed(3) })
          }
          return out
        },
        // the framebuffer as a JPEG data URL (for looking at frames when the tab cannot composite)
        snapshot: (scale = 0.5, quality = 0.82) => {
          const px = new Uint8Array(w * h * 4)
          gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px)
          const src = document.createElement('canvas')
          src.width = w
          src.height = h
          const sctx = src.getContext('2d')!
          const img = sctx.createImageData(w, h)
          // GL rows run bottom-up
          for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4)
          sctx.putImageData(img, 0, 0)
          const out = document.createElement('canvas')
          out.width = Math.round(w * scale)
          out.height = Math.round(h * scale)
          out.getContext('2d')!.drawImage(src, 0, 0, out.width, out.height)
          return out.toDataURL('image/jpeg', quality)
        },
      }
    }

    return () => {
      if (raf) cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('mouseleave', onLeave)
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
      // free what we made — but no loseContext(): StrictMode remounts onto
      // the same canvas and getContext() would hand back the dead context
      if (tex) gl.deleteTexture(tex)
      if (program) gl.deleteProgram(program)
      tex = null
      program = null
    }
  }, [])

  return (
    <section ref={root} id="vision" className="section relative overflow-hidden bg-black !py-0" aria-label={vision.title}>
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full" />
      {/* a few words, out of her way: the title above, what's next below */}
      <div className="container-site pointer-events-none relative z-10 flex min-h-[100svh] flex-col justify-between py-[9vh]">
        <div className="life-breathe origin-left" style={{ ['--life-dur' as string]: '9s' }}>
          <h2 data-reveal="heading" className="font-display text-[clamp(1.9rem,4vw,3.4rem)] font-[640] leading-none tracking-[-0.02em] text-white">
            {vision.title}
          </h2>
        </div>
        <ul className="flex max-w-[30ch] flex-col gap-2 text-[max(1rem,1.0625rem)] leading-snug text-white/75">
          {vision.next.map((line, i) => (
            <li
              key={line}
              data-reveal="para"
              className="life-float"
              style={{ ['--life-dur' as string]: `${8 + i * 1.3}s`, ['--life-delay' as string]: `${-(i * 2.1)}s` }}
            >
              <span className="mr-3 text-white/40">{String(i + 1).padStart(2, '0')}</span>
              {line}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
