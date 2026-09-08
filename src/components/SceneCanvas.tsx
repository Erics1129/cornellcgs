import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SCENE_FRAGMENT, SCENE_VERTEX } from '../effects/sceneShaders'
import { CodeReflection } from '../effects/codeReflection'
import '../styles/scenes.css'

gsap.registerPlugin(ScrollTrigger)
export type SceneKind = 'blackhole' | 'earth' | 'eye'
const ASSETS = { blackhole: 'black-hole', earth: 'earth-map', eye: 'vision-eye' }
const opaqueScenes = new Set<Element>()

/** An on-demand renderer: scroll/input is the clock, except the living eye. */
export default function SceneCanvas({ kind, focused = false }: { kind: SceneKind; focused?: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  const focus = useRef(focused)
  focus.current = focused

  useEffect(() => {
    const el = canvas.current
    const box = host.current
    const section = box?.closest('section')
    if (!el || !box || !section) return
    const gl = el.getContext('webgl2', { alpha: false, antialias: false, powerPreference: 'low-power' })
    if (!gl) return
    let alive = true, near = false, loaded = false, raf = 0, last = 0
    let target = .35, progress = .35, px = 0, py = 0, tx = 0, ty = 0
    let lastEyePaint = 0, nextBlink = 0, blinkAt = -1000, focusAmount = 0
    let program: WebGLProgram | null = null
    const reduce = matchMedia('(prefers-reduced-motion: reduce)')
    const reflection = kind === 'eye' ? new CodeReflection() : null
    const image = new Image()
    let texture: WebGLTexture | null = null, screenTexture: WebGLTexture | null = null
    let buffer: WebGLBuffer | null = null
    const uniforms: Record<string, WebGLUniformLocation | null> = {}

    function stop() { cancelAnimationFrame(raf); raf = 0 }
    function request() {
      if (alive && loaded && near && !document.hidden && !raf) raf = requestAnimationFrame(draw)
    }
    function resize() {
      const r = box!.getBoundingClientRect()
      const cap = matchMedia('(pointer: coarse)').matches ? 1152 : 1680
      const dpr = Math.min(devicePixelRatio || 1, 1.6, cap / Math.max(1, r.width))
      el!.width = Math.max(1, Math.round(r.width * dpr))
      el!.height = Math.max(1, Math.round(r.height * dpr))
      request()
    }
    function draw(now: number) {
      raf = 0
      if (!alive || !loaded || !near || document.hidden || gl!.isContextLost()) return
      const dt = Math.min(.04, Math.max(.001, (now - (last || now - 16)) / 1000))
      last = now
      const ease = 1 - Math.exp(-dt / .085)
      progress += (target - progress) * ease
      px += (tx - px) * ease
      py += (ty - py) * ease
      focusAmount += ((focus.current ? 1 : 0) - focusAmount) * (reduce.matches ? 1 : ease)
      let blink = 0
      if (kind === 'eye' && !reduce.matches) {
        if (now > nextBlink) { blinkAt = now; nextBlink = now + 3100 + Math.random() * 3300 }
        const t = now - blinkAt
        blink = t < 90 ? t / 90 : t < 280 ? 1 - (t - 90) / 190 : 0
      }
      if (reflection && (now - lastEyePaint > 40 || !lastEyePaint)) {
        reflection.paint(reduce.matches ? 3600 : now)
        gl!.activeTexture(gl!.TEXTURE1)
        gl!.bindTexture(gl!.TEXTURE_2D, screenTexture)
        gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, reflection.canvas)
        lastEyePaint = now
      }
      gl!.useProgram(program)
      gl!.viewport(0, 0, el!.width, el!.height)
      gl!.uniform2f(uniforms.u_size, el!.width, el!.height)
      gl!.uniform1i(uniforms.u_compact, matchMedia('(max-width:1023px), (orientation: portrait)').matches ? 1 : 0)
      gl!.uniform2f(uniforms.u_pointer, reduce.matches ? 0 : px, reduce.matches ? 0 : py)
      gl!.uniform1f(uniforms.u_progress, reduce.matches ? .55 : progress)
      gl!.uniform1f(uniforms.u_time, now / 1000)
      gl!.uniform1f(uniforms.u_blink, Math.max(0, blink))
      gl!.uniform1f(uniforms.u_focus, focusAmount)
      gl!.drawArrays(gl!.TRIANGLES, 0, 6)
      if (import.meta.env.DEV) {
        el!.dataset.progress = progress.toFixed(4)
        el!.dataset.pointer = `${px.toFixed(3)},${py.toFixed(3)}`
        el!.dataset.frames = String(Number(el!.dataset.frames || 0) + 1)
      }
      if (!reduce.matches && (kind === 'eye' || Math.abs(target-progress) + Math.abs(tx-px) + Math.abs(ty-py) > .0002)) request()
    }
    function setup() {
      if (!alive) return
      try {
        const compile = (type: number, source: string) => {
          const shader = gl!.createShader(type)!
          gl!.shaderSource(shader, source); gl!.compileShader(shader)
          if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
            const info = gl!.getShaderInfoLog(shader); gl!.deleteShader(shader); throw new Error(info || 'Shader failed')
          }
          return shader
        }
        const vertex = compile(gl!.VERTEX_SHADER, SCENE_VERTEX)
        const fragment = compile(gl!.FRAGMENT_SHADER, SCENE_FRAGMENT)
        program = gl!.createProgram()!
        gl!.attachShader(program, vertex); gl!.attachShader(program, fragment); gl!.linkProgram(program)
        gl!.deleteShader(vertex); gl!.deleteShader(fragment)
        if (!gl!.getProgramParameter(program, gl!.LINK_STATUS)) throw new Error('Scene link failed')
        gl!.useProgram(program)
        buffer = gl!.createBuffer()
        gl!.bindBuffer(gl!.ARRAY_BUFFER, buffer)
        gl!.bufferData(gl!.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl!.STATIC_DRAW)
        const attr = gl!.getAttribLocation(program, 'a_position')
        gl!.enableVertexAttribArray(attr); gl!.vertexAttribPointer(attr, 2, gl!.FLOAT, false, 0, 0)
        for (const name of ['u_size','u_pointer','u_progress','u_time','u_blink','u_focus','u_mode','u_compact','u_image','u_screen']) uniforms[name] = gl!.getUniformLocation(program, name)
        const makeTexture = (slot: number) => {
          const tex = gl!.createTexture()
          gl!.activeTexture(slot); gl!.bindTexture(gl!.TEXTURE_2D, tex)
          gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR)
          gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR)
          gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE)
          gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE)
          return tex
        }
        gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, true)
        texture = makeTexture(gl!.TEXTURE0)
        gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, image)
        if (kind === 'earth') gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.REPEAT)
        screenTexture = makeTexture(gl!.TEXTURE1)
        gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, 1, 1, 0, gl!.RGBA, gl!.UNSIGNED_BYTE, new Uint8Array([0,0,0,255]))
        gl!.uniform1i(uniforms.u_image, 0); gl!.uniform1i(uniforms.u_screen, 1)
        gl!.uniform1i(uniforms.u_mode, kind === 'earth' ? 1 : kind === 'eye' ? 2 : 0)
        loaded = true; setReady(true); resize(); request()
      } catch (error) { console.warn('Scene uses its still fallback:', error); setReady(false) }
    }
    image.onload = setup
    const io = new IntersectionObserver(([entry]) => {
      near = entry.isIntersecting
      if (near && !image.src) image.src = `/assets/scenes/${ASSETS[kind]}.webp`
      if (near) { last = 0; request() } else stop()
    }, { rootMargin: '20% 0px' })
    io.observe(box)
    const occlusion = new IntersectionObserver(([entry]) => {
      if (entry.intersectionRatio > .88) opaqueScenes.add(box)
      else opaqueScenes.delete(box)
      document.documentElement.classList.toggle('cinema-on', opaqueScenes.size > 0)
    }, { threshold: [0,.88,1] })
    occlusion.observe(box)
    const st = ScrollTrigger.create({ trigger: section, start: 'top top', end: 'bottom bottom',
      onUpdate: self => { target = self.progress; request() },
      onRefresh: self => { target = self.progress; request() },
    })
    target = st.progress
    const onMove = (event: PointerEvent) => {
      if (reduce.matches || event.pointerType === 'touch') return
      const r = box.getBoundingClientRect()
      tx = Math.max(-1, Math.min(1, (event.clientX-r.left)/r.width*2-1))
      ty = Math.max(-1, Math.min(1, 1-(event.clientY-r.top)/r.height*2)); request()
    }
    const onLeave = () => { tx = 0; ty = 0; request() }
    const onVis = () => { if (document.hidden) stop(); else { last = 0; request() } }
    const onLoss = (event: Event) => { event.preventDefault(); loaded = false; stop(); setReady(false) }
    const onRestore = () => { setup() }
    section.addEventListener('pointermove', onMove, { passive: true })
    section.addEventListener('pointerleave', onLeave)
    section.addEventListener('click', request)
    document.addEventListener('visibilitychange', onVis)
    reduce.addEventListener('change', request)
    el.addEventListener('webglcontextlost', onLoss)
    el.addEventListener('webglcontextrestored', onRestore)
    const ro = new ResizeObserver(resize); ro.observe(box)
    return () => {
      alive = false; stop(); st.kill(); io.disconnect(); ro.disconnect(); occlusion.disconnect()
      opaqueScenes.delete(box)
      document.documentElement.classList.toggle('cinema-on', opaqueScenes.size > 0)
      image.onload = null
      section.removeEventListener('pointermove', onMove); section.removeEventListener('pointerleave', onLeave)
      section.removeEventListener('click', request)
      document.removeEventListener('visibilitychange', onVis); reduce.removeEventListener('change', request)
      el.removeEventListener('webglcontextlost', onLoss); el.removeEventListener('webglcontextrestored', onRestore)
      gl.deleteTexture(texture); gl.deleteTexture(screenTexture); gl.deleteBuffer(buffer); gl.deleteProgram(program)
    }
  }, [kind])

  return <div ref={host} className={`scene-canvas scene-canvas--${kind}`} aria-hidden="true">
    <div className="scene-still" style={{ backgroundImage: `url(/assets/scenes/${kind === 'earth' ? 'earth-map' : ASSETS[kind]}.webp)`, opacity: ready ? 0 : 1 }} />
    <canvas ref={canvas} data-scene={kind} style={{ opacity: ready ? 1 : 0 }} />
  </div>
}
