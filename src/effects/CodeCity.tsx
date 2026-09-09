import { useEffect, useRef } from 'react'
import { onReducedMotionChange, prefersReducedMotion } from '../lib/motion'
import { CITY_DEPTH, CITY_PLATE, CITY_STRIDE, CODE_CITY_FRAGMENT, CODE_CITY_VERTEX, cityProjection, createCityGeometry } from './codeCityShader'
import '../styles/code-city.css'

export interface CodeCityProps {
  /** Mount inside the home hero. Set false to suspend and hide the scene. */
  active?: boolean
  /** Connect any parent motion setting here; freezes travel without losing the plate. */
  paused?: boolean
  plateSrc?: string
  /** Base travel multiplier, clamped to 0..2. Zero freezes automatic travel. */
  speed?: number
  className?: string
}

const PLATE_POSITION = `${CITY_PLATE.objectPosition[0] * 100}% ${CITY_PLATE.objectPosition[1] * 100}%`
const CITY_TINT = new Float32Array([0.08, 0.48, 1])
const SNIPPETS = [
  ['const regret = utility - expected;', 'strategy[a] = Math.max(0, regret);', 'normalize(strategy);'],
  ['for (const hand of samples) {', '  equity += evaluate(hand, board);', '} return equity / samples.length;'],
  ['const policy = model.predict(state);', 'const action = sample(policy);', 'return environment.step(action);'],
  ['while (!state.terminal) {', '  state = search.bestChild(state);', '} backpropagate(state.reward);'],
]

function createCodeAtlas(): HTMLCanvasElement {
  const atlas = document.createElement('canvas')
  atlas.width = 1024
  atlas.height = 512
  const ctx = atlas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#fff'
    ctx.font = '22px monospace'
    ctx.textBaseline = 'top'
    SNIPPETS.forEach((lines, row) => lines.forEach((line, i) => ctx.fillText(line, 12, row * 128 + 12 + i * 32)))
  }
  return atlas
}

type Renderer = {
  gl: WebGLRenderingContext
  resize: (width: number, height: number, compact: boolean, projection: ReturnType<typeof cityProjection>) => void
  draw: (travel: number, x: number, y: number) => void
  dispose: () => void
}

function createRenderer(canvas: HTMLCanvasElement, compact: boolean): Renderer | null {
  const gl = canvas.getContext('webgl', {
    alpha: true, antialias: false, depth: true, stencil: false,
    premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'low-power',
  })
  if (!gl || gl.isContextLost()) return null
  const shaders: WebGLShader[] = []
  let program: WebGLProgram | null = null
  let buffer: WebGLBuffer | null = null
  let texture: WebGLTexture | null = null
  const dispose = () => {
    shaders.forEach(shader => gl.deleteShader(shader))
    shaders.length = 0
    gl.deleteTexture(texture)
    gl.deleteBuffer(buffer)
    gl.deleteProgram(program)
  }
  try {
    for (const [type, source] of [[gl.VERTEX_SHADER, CODE_CITY_VERTEX], [gl.FRAGMENT_SHADER, CODE_CITY_FRAGMENT]] as const) {
      const shader = gl.createShader(type)
      if (!shader) throw new Error('No city shader')
      shaders.push(shader)
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'City shader failed')
    }
    program = gl.createProgram()
    if (!program) throw new Error('No city program')
    shaders.forEach(shader => gl.attachShader(program!, shader))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'City link failed')
    gl.useProgram(program)
    shaders.forEach(shader => gl.deleteShader(shader))
    shaders.length = 0
    buffer = gl.createBuffer()
    texture = gl.createTexture()
    if (!buffer || !texture) throw new Error('No city buffers')
    const mesh = createCityGeometry(compact)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW)
    let offset = 0
    for (const [name, size] of [['a_position', 3], ['a_origin', 3], ['a_uv', 2], ['a_size', 2], ['a_detail', 3]] as const) {
      const location = gl.getAttribLocation(program, name)
      if (location >= 0) {
        gl.enableVertexAttribArray(location)
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, CITY_STRIDE * 4, offset * 4)
      }
      offset += size
    }
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, createCodeAtlas())
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    const travelUniform = gl.getUniformLocation(program, 'u_travel')
    const aspectUniform = gl.getUniformLocation(program, 'u_aspect')
    const projectionUniform = gl.getUniformLocation(program, 'u_projection')
    const pointerUniform = gl.getUniformLocation(program, 'u_pointer')
    gl.uniform3fv(gl.getUniformLocation(program, 'u_tint'), CITY_TINT)
    gl.uniform1i(gl.getUniformLocation(program, 'u_code'), 0)
    gl.enable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.clearColor(0, 0, 0, 0)
    return {
      gl,
      resize(width, height, small, projection) {
        // Pixel budget, longest-side cap AND DPR cap keep 4K/Retina bounded.
        const budget = small ? 480_000 : 1_050_000
        const scale = Math.min(window.devicePixelRatio || 1, small ? 1 : 1.25,
          Math.sqrt(budget / Math.max(1, width * height)), 1600 / Math.max(width, height))
        const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale))
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
        gl.viewport(0, 0, w, h)
        gl.uniform1f(aspectUniform, width / Math.max(1, height))
        gl.uniform3f(projectionUniform, projection.x * 2 - 1, 1 - projection.y * 2, projection.focal)
      },
      draw(travel, x, y) {
        gl.uniform1f(travelUniform, travel)
        gl.uniform2f(pointerUniform, x, y)
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
        gl.depthMask(false)
        gl.drawArrays(gl.TRIANGLES, 0, mesh.groundCount)
        gl.depthMask(true)
        gl.drawArrays(gl.TRIANGLES, mesh.groundCount, mesh.vertices.length / CITY_STRIDE - mesh.groundCount)
      },
      dispose,
    }
  } catch (error) {
    dispose()
    if (import.meta.env.DEV) console.warn('CodeCity: static plate fallback.', error)
    return null
  }
}

/** Contained hero backdrop above the home's original GradientBG + CodeLayer.
 * The image is always mounted underneath the transparent GPU layer. Pauses are
 * event driven: no dormant requestAnimationFrame loop, no accumulated idle dt.
 */
export default function CodeCity({
  active = true, paused = false, plateSrc = '/assets/scenes/code-city-v1.webp',
  speed = 1, className = '',
}: CodeCityProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const plateRef = useRef<HTMLImageElement>(null)
  const props = useRef({ active, paused, speed })
  props.current = { active, paused, speed }
  const synchronize = useRef<(() => void) | null>(null)
  const resizeScene = useRef<(() => void) | null>(null)

  useEffect(() => {
    const host = rootRef.current, canvas = canvasRef.current
    if (!host || !canvas) return
    let alive = true, renderer: Renderer | null = null, failed = false, contextLost = false
    let reduced = prefersReducedMotion(), inView = false
    let width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight)
    let compact = width < 768 || ['phone', 'tablet'].includes(document.documentElement.dataset.device || '')
    let projection = cityProjection(width, height, plateRef.current?.naturalWidth || CITY_PLATE.width, plateRef.current?.naturalHeight || CITY_PLATE.height)
    let raf = 0, probeTimer = 0, lastFrame = 0, travel = 0, boost = 0
    let scrollY = window.scrollY, scrollTime = performance.now()
    let pointerX = 0, pointerY = 0, smoothX = 0, smoothY = 0
    const pointerQuery = matchMedia('(hover: hover) and (pointer: fine)')

    const setStatus = (status: string) => {
      if (host.dataset.playback !== status) host.dataset.playback = status
    }
    const stop = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      lastFrame = 0
      boost = 0
      scrollY = window.scrollY
      scrollTime = performance.now()
    }
    const canDraw = () => alive && props.current.active && inView && !document.hidden && !contextLost && !reduced
    const moving = () => !props.current.paused && Number.isFinite(props.current.speed) && props.current.speed > 0
    const frame = (now: number) => {
      raf = 0
      if (!canDraw() || !renderer) { stop(); return }
      // Render on every native rAF, including 90/120Hz displays. The raster pixel
      // budget bounds GPU work; skipping frames causes visible 60→30Hz judder.
      // This loop never measures layout or samples computed styles.
      const dt = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 0
      lastFrame = now
      if (moving()) {
        boost *= Math.exp(-dt * 2.8)
        const gain = 1 - Math.exp(-dt * 3.8)
        smoothX += (pointerX - smoothX) * gain
        smoothY += (pointerY - smoothY) * gain
        travel = (travel + dt * (2.2 + boost * 5.0) * Math.min(2, props.current.speed)) % CITY_DEPTH
      }
      renderer.draw(travel, smoothX, smoothY)
      if (host.dataset.renderer !== 'ready') host.dataset.renderer = 'ready'
      if (moving()) raf = requestAnimationFrame(frame)
      else lastFrame = 0
    }
    const sync = () => {
      if (!alive) return
      if (!props.current.active) setStatus('inactive')
      else if (document.hidden) setStatus('hidden')
      else if (!inView) setStatus('offscreen')
      else if (reduced) setStatus('reduced')
      else if (contextLost || failed) setStatus('fallback')
      else if (!moving()) setStatus('paused')
      else setStatus('playing')
      if (!canDraw()) { stop(); return }
      if (!renderer && !failed) {
        renderer = createRenderer(canvas, compact)
        failed = !renderer
        if (renderer) renderer.resize(width, height, compact, projection)
        else { host.dataset.renderer = 'fallback'; setStatus('fallback') }
      }
      if (renderer && !raf) raf = requestAnimationFrame(frame)
    }
    synchronize.current = () => { stop(); sync() }

    // Check actual hero bounds on entry/restoration as well as intersection
    // changes, so deep links never start a hidden city's animation loop.
    const measureVisibility = () => {
      if (probeTimer) window.clearTimeout(probeTimer)
      probeTimer = 0
      if (!alive || document.hidden) return
      const rect = host.getBoundingClientRect()
      inView = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight
        && rect.right > 0 && rect.left < window.innerWidth
      sync()
    }
    const queueProbe = () => {
      if (!alive || document.hidden || probeTimer) return
      probeTimer = window.setTimeout(measureVisibility, 80)
    }
    const resize = () => {
      width = Math.max(1, host.clientWidth)
      height = Math.max(1, host.clientHeight)
      const wasCompact = compact
      compact = width < 768 || ['phone', 'tablet'].includes(document.documentElement.dataset.device || '')
      if (compact !== wasCompact) { renderer?.dispose(); renderer = null }
      projection = cityProjection(width, height, plateRef.current?.naturalWidth || CITY_PLATE.width, plateRef.current?.naturalHeight || CITY_PLATE.height)
      host.style.setProperty('--code-city-horizon', `${(projection.y * 100).toFixed(3)}%`)
      renderer?.resize(width, height, compact, projection)
      measureVisibility()
    }
    resizeScene.current = resize
    const onScroll = () => {
      const now = performance.now(), y = window.scrollY
      if (canDraw() && moving()) {
        const elapsed = now - scrollTime
        if (elapsed > 0 && elapsed < 180) {
          // A navigation jump cannot produce an unbounded rush through the city.
          const distance = Math.min(Math.abs(y - scrollY), 140)
          boost = Math.max(boost, Math.min(1, distance / Math.max(16, elapsed) * 0.28))
        }
      }
      scrollY = y
      scrollTime = now
      queueProbe()
    }
    const onPointer = (event: PointerEvent) => {
      if (!pointerQuery.matches || event.pointerType === 'touch' || !canDraw() || !moving()) return
      const rect = host.getBoundingClientRect()
      pointerX = Math.max(-1, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width) * 2 - 1))
      pointerY = Math.max(-1, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height) * 2 - 1))
    }
    const resetPointer = () => { pointerX = 0; pointerY = 0 }
    const onVisibility = () => {
      stop()
      if (!document.hidden) measureVisibility()
      else { window.clearTimeout(probeTimer); probeTimer = 0; sync() }
    }
    const onLost = (event: Event) => {
      event.preventDefault()
      contextLost = true
      stop()
      renderer?.dispose()
      renderer = null
      host.dataset.renderer = 'fallback'
      sync()
    }
    const onRestored = () => {
      contextLost = false
      failed = false
      host.dataset.renderer = 'pending'
      sync()
    }
    const offMotion = onReducedMotionChange(value => {
      reduced = value
      stop()
      resetPointer()
      smoothX = 0; smoothY = 0
      // Reduced motion gets only the generated still, and releases GPU resources.
      if (reduced) { renderer?.dispose(); renderer = null; host.dataset.renderer = 'static' }
      sync()
    })
    const hostObserver = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting && entry.intersectionRect.width > 0 && entry.intersectionRect.height > 0
      sync()
    }) : null
    hostObserver?.observe(host)
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    resizeObserver?.observe(host)
    const rootObserver = new MutationObserver(resize)
    rootObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-device'] })
    window.addEventListener('resize', resize, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    const pointerHost = host.parentElement || host
    pointerHost.addEventListener('pointermove', onPointer, { passive: true })
    pointerHost.addEventListener('pointerleave', resetPointer)
    window.addEventListener('blur', resetPointer)
    window.addEventListener('pageshow', onVisibility)
    document.addEventListener('pointerleave', resetPointer)
    document.addEventListener('visibilitychange', onVisibility)
    canvas.addEventListener('webglcontextlost', onLost)
    canvas.addEventListener('webglcontextrestored', onRestored)
    host.dataset.renderer = reduced ? 'static' : 'pending'
    resize()

    return () => {
      alive = false
      synchronize.current = null
      resizeScene.current = null
      stop()
      window.clearTimeout(probeTimer)
      offMotion()
      hostObserver?.disconnect(); resizeObserver?.disconnect()
      rootObserver.disconnect()
      window.removeEventListener('resize', resize)
      window.removeEventListener('scroll', onScroll)
      pointerHost.removeEventListener('pointermove', onPointer)
      pointerHost.removeEventListener('pointerleave', resetPointer)
      window.removeEventListener('blur', resetPointer)
      window.removeEventListener('pageshow', onVisibility)
      document.removeEventListener('pointerleave', resetPointer)
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
      renderer?.dispose()
      // Do not forcibly lose the context: StrictMode reuses this same canvas.
    }
  }, [])

  useEffect(() => { synchronize.current?.() }, [active, paused, speed])

  return <div ref={rootRef} className={`code-city ${className}`} data-active={active} aria-hidden="true">
    <img key={plateSrc} ref={plateRef} className="code-city__plate" src={plateSrc} alt="" width="1536" height="1024"
      style={{ objectPosition: PLATE_POSITION }}
      decoding="async" loading="eager" draggable={false}
      onLoad={event => { delete event.currentTarget.dataset.missing; resizeScene.current?.() }}
      onError={event => { event.currentTarget.dataset.missing = 'true' }} />
    <canvas ref={canvasRef} className="code-city__canvas" />
    <div className="code-city__shade" />
  </div>
}
