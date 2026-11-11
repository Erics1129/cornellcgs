/**
 * film/bloom.ts — HDR scene target plus a half-resolution bloom chain (WebGL2).
 *
 * The scene draws in linear light into an R11F_G11F_B10F target; the chain is
 * a 13-tap downsample (Karis average on the first level so one hot pixel
 * cannot flicker), then 3x3 tent upsamples added back level by level. The
 * scene's final pass mixes a little of the result in and ends in film().
 *
 * Needs EXT_color_buffer_float. createHdr() returns null without it and the
 * scene falls back to drawing straight to the canvas (no bloom).
 */
import { buildProgram } from './program'

type GL = WebGL2RenderingContext

export interface Target {
  tex: WebGLTexture
  fbo: WebGLFramebuffer
  w: number
  h: number
}

export const FULLSCREEN_VERTEX = `#version 300 es
in vec2 a_corner;
out vec2 v_uv;
void main() {
  v_uv = a_corner * .5 + .5;
  gl_Position = vec4(a_corner, 0., 1.);
}`

const DOWN = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_src;
uniform vec2 u_texel;
uniform int u_first;
float karis(vec3 c) { return 1. / (1. + dot(c, vec3(.2126, .7152, .0722))); }
void main() {
  vec2 x = vec2(u_texel.x, 0.), y = vec2(0., u_texel.y), uv = v_uv;
  vec3 a = texture(u_src, uv - 2. * x + 2. * y).rgb, b = texture(u_src, uv + 2. * y).rgb, c = texture(u_src, uv + 2. * x + 2. * y).rgb;
  vec3 d = texture(u_src, uv - 2. * x).rgb, e = texture(u_src, uv).rgb, f = texture(u_src, uv + 2. * x).rgb;
  vec3 g = texture(u_src, uv - 2. * x - 2. * y).rgb, h = texture(u_src, uv - 2. * y).rgb, i = texture(u_src, uv + 2. * x - 2. * y).rgb;
  vec3 j = texture(u_src, uv - x + y).rgb, k = texture(u_src, uv + x + y).rgb, l = texture(u_src, uv - x - y).rgb, m = texture(u_src, uv + x - y).rgb;
  vec3 r;
  if (u_first == 1) {
    vec3 g0 = (a + b + d + e) * .25, g1 = (b + c + e + f) * .25, g2 = (d + e + g + h) * .25, g3 = (e + f + h + i) * .25, g4 = (j + k + l + m) * .25;
    float w0 = karis(g0), w1 = karis(g1), w2 = karis(g2), w3 = karis(g3), w4 = karis(g4);
    r = (g0 * w0 * .125 + g1 * w1 * .125 + g2 * w2 * .125 + g3 * w3 * .125 + g4 * w4 * .5) / (w0 * .125 + w1 * .125 + w2 * .125 + w3 * .125 + w4 * .5);
  } else {
    r = e * .125 + (a + c + g + i) * .03125 + (b + d + f + h) * .0625 + (j + k + l + m) * .125;
  }
  o = vec4(max(r, vec3(0.)), 1.);
}`

const UP = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_src;
uniform vec2 u_radius;
void main() {
  vec2 x = vec2(u_radius.x, 0.), y = vec2(0., u_radius.y), uv = v_uv;
  vec3 r = texture(u_src, uv).rgb * 4.
    + (texture(u_src, uv - x).rgb + texture(u_src, uv + x).rgb + texture(u_src, uv - y).rgb + texture(u_src, uv + y).rgb) * 2.
    + texture(u_src, uv - x - y).rgb + texture(u_src, uv + x - y).rgb + texture(u_src, uv - x + y).rgb + texture(u_src, uv + x + y).rgb;
  o = vec4(r / 16., 1.);
}`

/** True when linear-light float targets can be rendered to. */
export function hdrSupported(gl: GL): boolean {
  return !!gl.getExtension('EXT_color_buffer_float')
}

export function createTarget(gl: GL, w: number, h: number, mipmapped = false): Target | null {
  const tex = gl.createTexture()
  const fbo = gl.createFramebuffer()
  if (!tex || !fbo) return null
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R11F_G11F_B10F, w, h, 0, gl.RGB, gl.HALF_FLOAT, null)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmapped ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  if (!ok) {
    gl.deleteTexture(tex)
    gl.deleteFramebuffer(fbo)
    return null
  }
  return { tex, fbo, w, h }
}

export function freeTarget(gl: GL, t: Target | null) {
  if (!t) return
  gl.deleteTexture(t.tex)
  gl.deleteFramebuffer(t.fbo)
}

export interface Bloom {
  /** Allocate (or re-allocate) the chain for a scene of this size. False when allocation failed. */
  resize(w: number, h: number, levels: number): boolean
  /** Run the chain on `scene`. Returns the texture to mix in (sum of the levels; divide by `levels`). Leaves blending off. */
  render(scene: Target): WebGLTexture
  readonly levels: number
  /** device pixels held by the chain, for memory notes */
  pixels(): number
  /** Free the targets; programs stay. */
  release(): void
  dispose(): void
}

/** The caller binds a VAO with a full-screen quad at attribute 0 (two triangles, 6 vertices) before render(). */
export function createBloom(gl: GL): Bloom | null {
  const down = buildProgram(gl, FULLSCREEN_VERTEX, DOWN, { a_corner: 0 })
  const up = buildProgram(gl, FULLSCREEN_VERTEX, UP, { a_corner: 0 })
  if (!down || !up) return null
  let located = false
  let uDown: Record<string, WebGLUniformLocation | null> = {}
  let uUp: Record<string, WebGLUniformLocation | null> = {}
  let mips: Target[] = []
  let ups: Target[] = []
  const locate = () => {
    if (located) return true
    if (!down.finish() || !up.finish()) return false
    uDown = { src: gl.getUniformLocation(down.program, 'u_src'), texel: gl.getUniformLocation(down.program, 'u_texel'), first: gl.getUniformLocation(down.program, 'u_first') }
    uUp = { src: gl.getUniformLocation(up.program, 'u_src'), radius: gl.getUniformLocation(up.program, 'u_radius') }
    located = true
    return true
  }
  const release = () => {
    for (const t of mips) freeTarget(gl, t)
    for (const t of ups) freeTarget(gl, t)
    mips = []
    ups = []
  }
  return {
    get levels() {
      return mips.length
    },
    resize(w, h, levels) {
      release()
      let mw = w
      let mh = h
      for (let i = 0; i < levels; i++) {
        mw = Math.max(1, mw >> 1)
        mh = Math.max(1, mh >> 1)
        const t = createTarget(gl, mw, mh)
        if (!t) {
          release()
          return false
        }
        mips.push(t)
      }
      for (let i = 0; i < levels - 1; i++) {
        const t = createTarget(gl, mips[i].w, mips[i].h)
        if (!t) {
          release()
          return false
        }
        ups.push(t)
      }
      return locate()
    },
    render(scene) {
      if (!mips.length || !locate()) return scene.tex
      gl.disable(gl.BLEND)
      gl.activeTexture(gl.TEXTURE0)
      gl.useProgram(down.program)
      gl.uniform1i(uDown.src, 0)
      let src: Target = scene
      for (let i = 0; i < mips.length; i++) {
        const m = mips[i]
        gl.bindFramebuffer(gl.FRAMEBUFFER, m.fbo)
        gl.viewport(0, 0, m.w, m.h)
        gl.bindTexture(gl.TEXTURE_2D, src.tex)
        gl.uniform2f(uDown.texel, 1 / src.w, 1 / src.h)
        gl.uniform1i(uDown.first, i === 0 ? 1 : 0)
        gl.drawArrays(gl.TRIANGLES, 0, 6)
        src = m
      }
      gl.useProgram(up.program)
      gl.uniform1i(uUp.src, 0)
      let acc = mips[mips.length - 1]
      for (let i = ups.length - 1; i >= 0; i--) {
        // ups[i] = mips[i] + tent(acc)
        const t = ups[i]
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo)
        gl.viewport(0, 0, t.w, t.h)
        gl.disable(gl.BLEND)
        gl.bindTexture(gl.TEXTURE_2D, mips[i].tex)
        gl.uniform2f(uUp.radius, 0, 0)
        gl.drawArrays(gl.TRIANGLES, 0, 6)
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.ONE, gl.ONE)
        gl.bindTexture(gl.TEXTURE_2D, acc.tex)
        gl.uniform2f(uUp.radius, 1 / acc.w, 1 / acc.h)
        gl.drawArrays(gl.TRIANGLES, 0, 6)
        acc = t
      }
      gl.disable(gl.BLEND)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      return acc.tex
    },
    pixels() {
      let n = 0
      for (const t of mips) n += t.w * t.h
      for (const t of ups) n += t.w * t.h
      return n
    },
    release,
    dispose() {
      release()
      gl.deleteProgram(down.program)
      gl.deleteProgram(up.program)
    },
  }
}
