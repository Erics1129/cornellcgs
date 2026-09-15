import type { PageSceneId } from '../lib/pageScenes'

export interface SceneImage {
  /** Seconds supplied by the caller; pointer coordinates are clamped to [-1, 1]. */
  draw(time: number, x: number, y: number): void
  /** CSS pixels. Redraws the last pose, including when playback is paused. */
  resize(w: number, h: number): void
  dispose(): void
  stats(): object
}

const PERIOD = 20
const TAU = Math.PI * 2
const MAX_PIXELS = 1_600_000
const MAX_DPR = 1.75

type Look = {
  focusY: number
  drift: number
  pointer: number
  zoom: number
  light: number
  caustic: number
  angle: number
  tint: [number, number, number]
  dust: number
}

// Light changes exposure in the original photograph. These are deliberately
// gentler on matte ivory scenes, more visible on glass/metal, never displacement.
const LOOKS: Record<PageSceneId, Look> = {
  'who-we-are': { focusY: .48, drift: .009, pointer: .006, zoom: .010, light: .042, caustic: .016, angle: .6, tint: [1, .94, .82], dust: 0 },
  'what-we-do': { focusY: .54, drift: .008, pointer: .006, zoom: .010, light: .052, caustic: .022, angle: -.7, tint: [1, .83, .73], dust: 0 },
  'ml-process': { focusY: .50, drift: .010, pointer: .007, zoom: .012, light: .080, caustic: .090, angle: 1.1, tint: [.70, .90, 1], dust: .014 },
  events: { focusY: .56, drift: .007, pointer: .005, zoom: .008, light: .050, caustic: .020, angle: .2, tint: [1, .88, .73], dust: 0 },
  world: { focusY: .49, drift: .009, pointer: .006, zoom: .010, light: .062, caustic: .065, angle: -.4, tint: [.76, 1, .96], dust: 0 },
  people: { focusY: .48, drift: .008, pointer: .006, zoom: .010, light: .042, caustic: .014, angle: .9, tint: [1, .94, .83], dust: 0 },
  advisors: { focusY: .48, drift: .009, pointer: .006, zoom: .010, light: .060, caustic: .072, angle: -.9, tint: [.85, .94, 1], dust: 0 },
  join: { focusY: .53, drift: .008, pointer: .006, zoom: .012, light: .066, caustic: .024, angle: .4, tint: [1, .96, .80], dust: 0 },
  contact: { focusY: .50, drift: .009, pointer: .007, zoom: .012, light: .078, caustic: .076, angle: -.3, tint: [1, .81, .55], dust: .012 },
}

const VERTEX = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  // One oversized triangle, no buffers and no internal diagonal seam.
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

const fragment = (dust: boolean) => `#version 300 es
#define OPTICAL_DUST ${dust ? 1 : 0}
precision highp float;
uniform sampler2D uImage;
uniform vec4 uCrop;
uniform vec2 uImageMetric;
uniform vec4 uLight;
uniform vec3 uTint;
uniform vec4 uCycle;
#if OPTICAL_DUST
uniform vec2 uViewMetric;
uniform vec4 uDust[3];
#endif
in vec2 vUv;
out vec4 outColor;
void main() {
  vec2 uv = (vUv - 0.5) * uCrop.xy + uCrop.zw;
  // Exactly one photograph sample: no second pose, warped UVs or channel splits.
  vec3 photo = texture(uImage, uv).rgb;
  float luma = dot(photo, vec3(0.2126, 0.7152, 0.0722));
  vec2 p = (uv - 0.5) * uImageMetric;
  vec2 spot = (uv - uCycle.xy) * uImageMetric;
  float sweep = 1.0 - smoothstep(0.012, 0.32, dot(spot, spot));
  vec2 direction = uLight.xy;
  // Broad overlapping light lobes, not sharp stripes; no noise/fbm or UV motion.
  float a = 0.5 + 0.5 * sin(dot(p, direction) * 23.0 + uCycle.z);
  float b = 0.5 + 0.5 * sin(dot(p, vec2(-direction.y, direction.x)) * 19.0 - uCycle.w);
  float reflection = a * b;
  reflection *= reflection;
  float highlights = smoothstep(0.22, 0.76, luma);
  float headroom = 1.0 - smoothstep(0.88, 1.0, max(photo.r, max(photo.g, photo.b)));
  float subject = mix(0.55, 1.0, smoothstep(0.015, 0.15, dot(p, p)));
  float exposure = ((sweep - 0.45) * uLight.z + (reflection - 0.22) * uLight.w)
    * highlights * headroom * subject;
  vec3 color = photo * (1.0 + exposure * mix(vec3(1.0), uTint, 0.4));
#if OPTICAL_DUST
  // Only three soft optical specks, only over dark background, away from center.
  if (luma < 0.30) {
    float dust = 0.0;
    for (int i = 0; i < 3; i++) {
      vec2 q = (vUv - uDust[i].xy) * uViewMetric;
      float mote = 1.0 - smoothstep(0.0, uDust[i].z * uDust[i].z, dot(q, q));
      dust += mote * mote * uDust[i].w;
    }
    float background = (1.0 - smoothstep(0.06, 0.30, luma))
      * smoothstep(0.025, 0.12, dot(vUv - 0.5, vUv - 0.5));
    color += dust * background * uTint;
  }
#endif
  outColor = vec4(color, 1.0);
}`

async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image()
  image.decoding = 'async'
  // Local assets: do not set crossOrigin or issue a second fetch.
  await new Promise<void>((resolve, reject) => {
    image.onload = () => { image.onload = image.onerror = null; resolve() }
    image.onerror = () => {
      image.onload = image.onerror = null
      reject(new Error(`Unable to load scene photograph: ${url}`))
    }
    image.src = url
  })
  try {
    await image.decode()
  } catch {
    throw new Error(`Unable to decode scene photograph: ${url}`)
  }
  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error(`Empty scene photograph: ${url}`)
  }
  return image
}

/** Caller owns scheduling, pointer smoothing, reduced motion (draw(0, 0, 0)),
 * and context-loss/restoration. No timers, observers or event listeners are owned.
 * Every animated term is a harmonic of 20 seconds, including optical dust.
 */
export async function createPageSceneImage(
  canvas: HTMLCanvasElement, id: PageSceneId, url: string,
): Promise<SceneImage> {
  const look = LOOKS[id]
  if (!look) throw new Error(`Unknown page scene: ${id}`)
  // Finish asynchronous work before owning any GL resources.
  const image = await loadImage(url)
  const imageWidth = image.naturalWidth, imageHeight = image.naturalHeight
  const context = canvas.getContext('webgl2', {
    alpha: false, antialias: false, depth: false, stencil: false,
    premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power',
  })
  if (!context) throw new Error('WebGL2 is unavailable for the scene photograph')
  const gl = context

  const shaders: WebGLShader[] = []
  let program: WebGLProgram | null = null
  let texture: WebGLTexture | null = null
  let vao: WebGLVertexArrayObject | null = null
  let disposed = false, frames = 0, calls = 0
  let aspect = 1, pixelRatio = 1, lastTime = 0, lastX = 0, lastY = 0

  function dispose() {
    if (disposed) return
    disposed = true
    // Unbind the program so deletion is immediate, including after setup errors.
    gl.useProgram(null)
    gl.bindVertexArray(null)
    gl.bindTexture(gl.TEXTURE_2D, null)
    if (texture) gl.deleteTexture(texture)
    if (vao) gl.deleteVertexArray(vao)
    if (program) gl.deleteProgram(program)
    for (const shader of shaders) gl.deleteShader(shader)
    shaders.length = 0
    texture = program = vao = null
    calls = 0
  }

  try {
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)
      if (!shader) throw new Error('Unable to allocate scene image shader')
      shaders.push(shader)
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(`Scene image shader: ${gl.getShaderInfoLog(shader) || 'compile failed'}`)
      }
      return shader
    }
    program = gl.createProgram()
    if (!program) throw new Error('Unable to allocate scene image program')
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX))
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment(look.dust > 0)))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Scene image program: ${gl.getProgramInfoLog(program) || 'link failed'}`)
    }
    for (const shader of shaders) { gl.detachShader(program, shader); gl.deleteShader(shader) }
    shaders.length = 0
    const uniform = (name: string) => {
      const location = gl.getUniformLocation(program!, name)
      if (location === null) throw new Error(`Missing scene image uniform: ${name}`)
      return location
    }
    const uImage = uniform('uImage'), uCrop = uniform('uCrop')
    const uImageMetric = uniform('uImageMetric'), uLight = uniform('uLight')
    const uTint = uniform('uTint'), uCycle = uniform('uCycle')
    const uViewMetric = look.dust ? uniform('uViewMetric') : null
    const uDust = look.dust ? uniform('uDust[0]') : null
    const dust = new Float32Array(12)
    const dustHomes = [.18, .72, .82, .27, .74, .84]

    const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
    if (imageWidth > maxTexture || imageHeight > maxTexture) {
      throw new Error(`Scene photograph exceeds the ${maxTexture}px texture limit: ${url}`)
    }
    const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array
    const maxBuffer = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number
    const maxWidth = Math.min(viewport[0], maxBuffer)
    const maxHeight = Math.min(viewport[1], maxBuffer)
    texture = gl.createTexture()
    vao = gl.createVertexArray()
    if (!texture || !vao) throw new Error('Unable to allocate scene image texture/vertex array')
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    // Keep the photograph's display colors; no tone mapping or global blur.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image)
    gl.generateMipmap(gl.TEXTURE_2D)
    const error = gl.getError()
    if (error !== gl.NO_ERROR || gl.isContextLost()) {
      throw new Error(`Scene image texture setup failed (WebGL ${error}): ${url}`)
    }
    gl.useProgram(program)
    gl.uniform1i(uImage, 0)
    gl.uniform2f(uImageMetric, imageWidth / Math.max(imageWidth, imageHeight), imageHeight / Math.max(imageWidth, imageHeight))
    gl.uniform4f(uLight, Math.cos(look.angle), Math.sin(look.angle), look.light, look.caustic)
    gl.uniform3f(uTint, ...look.tint)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.STENCIL_TEST)
    gl.disable(gl.BLEND)
    gl.disable(gl.CULL_FACE)
    gl.disable(gl.SCISSOR_TEST)
    gl.disable(gl.DITHER)

    const pointer = (n: number) => Number.isNaN(n) ? 0 : Math.max(-1, Math.min(1, n))
    function draw(time: number, x: number, y: number) {
      if (disposed || gl.isContextLost()) return
      lastTime = Number.isFinite(time) ? time : 0
      lastX = pointer(x); lastY = pointer(y)
      const phase = ((lastTime % PERIOD + PERIOD) % PERIOD) / PERIOD * TAU
      const s = Math.sin(phase), c = Math.cos(phase), s2 = Math.sin(phase * 2)
      // Translation is measured against the shorter viewport axis, so panorama
      // motion stays shallow. Both drift waveforms have absolute bound <= drift.
      const shortX = Math.min(1, 1 / aspect), shortY = Math.min(1, aspect)
      const dx = (look.drift * (.8 * s + .2 * s2) + look.pointer * lastX) * shortX
      const dy = (look.drift * (.8 * c + .2 * Math.cos(phase * 2)) - look.pointer * lastY) * shortY
      // Proof of coverage: z >= 1 + 2*(drift+pointer), hence
      // span*(.5 + |offset|) <= cover/2 at every phase/pointer corner.
      // Extra source texels of guard keep filtering away from source edges.
      const zoom = 1 + 2 * (look.drift + look.pointer) + 4 / Math.min(imageWidth, imageHeight)
        + look.zoom * (.5 - .5 * c)
      const imageAspect = imageWidth / imageHeight
      const coverX = Math.min(1, aspect / imageAspect)
      const coverY = Math.min(1, imageAspect / aspect)
      const spanX = coverX / zoom, spanY = coverY / zoom
      const centerY = coverY * .5 + (1 - coverY) * (1 - look.focusY)
      gl.useProgram(program)
      gl.bindVertexArray(vao)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniform4f(uCrop, spanX, spanY, .5 + spanX * dx, centerY + spanY * dy)
      gl.uniform4f(uCycle, .5 + .28 * c, .5 + .24 * s, phase * 2 + look.angle, phase - look.angle)
      if (uDust !== null) {
        for (let i = 0; i < 3; i++) {
          const angle = phase + i * TAU / 3, n = i * 4
          dust[n] = dustHomes[i * 2] + .035 * Math.cos(angle) * shortX
          dust[n + 1] = dustHomes[i * 2 + 1] + .045 * Math.sin(angle) * shortY
          dust[n + 2] = .006 + i * .002
          dust[n + 3] = look.dust * (.65 + .35 * Math.sin(angle + .5))
        }
        gl.uniform2f(uViewMetric, 1 / shortX, 1 / shortY)
        gl.uniform4fv(uDust, dust)
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      calls = 1; frames++
    }

    function resize(w: number, h: number) {
      if (disposed || gl.isContextLost() || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return
      aspect = w / h
      const deviceRatio = canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1
      const dpr = Number.isFinite(deviceRatio) && deviceRatio > 0 ? Math.min(deviceRatio, MAX_DPR) : 1
      pixelRatio = Math.min(dpr, Math.sqrt(MAX_PIXELS / w / h), maxWidth / w, maxHeight / h)
      const width = Math.max(1, Math.floor(w * pixelRatio))
      const height = Math.max(1, Math.floor(h * pixelRatio))
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height
      // Cover uses the CSS aspect, not rounded backing pixels: no stretching.
      draw(lastTime, lastX, lastY)
    }

    resize(canvas.clientWidth || canvas.width || 1, canvas.clientHeight || canvas.height || 1)
    return {
      draw, resize, dispose,
      // Cheap metadata for the caller's DEV inspection hook; no GPU readbacks.
      stats: () => ({
        imageUrl: url, imageWidth, imageHeight, period: PERIOD,
        calls, drawCalls: calls, frames, width: canvas.width, height: canvas.height,
        pixels: canvas.width * canvas.height, pixelRatio, textures: disposed ? 0 : 1, disposed,
      }),
    }
  } catch (error) {
    dispose()
    throw error
  }
}
