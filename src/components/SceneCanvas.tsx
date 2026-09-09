import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SCENE_FRAGMENT, SCENE_VERTEX } from '../effects/sceneShaders'
import { CodeReflection } from '../effects/codeReflection'
import { blinkClosure } from '../effects/eyeMotion'
import '../styles/scenes.css'

gsap.registerPlugin(ScrollTrigger)
export type SceneKind = 'blackhole' | 'earth' | 'eye'
const ASSETS = { blackhole: '/assets/scenes/black-hole.webp', earth: '/assets/earth-journey/earth-nasa-july-4096.webp', eye: '/assets/scenes/eye-cinema-v4.webp' }
const opaqueScenes = new Set<Element>()

/** An on-demand renderer: scroll/input is the clock, except the living eye. */
export default function SceneCanvas({ kind, paused = false }: { kind: SceneKind; paused?: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  const pause = useRef(paused)
  pause.current = paused

  useEffect(() => {
    const el = canvas.current
    const box = host.current
    const section = box?.closest('section')
    if (!el || !box || !section) return
    const gl = el.getContext('webgl2', { alpha: false, antialias: false, powerPreference: 'low-power' })
    if (!gl) return
    let alive = true, near = false, loaded = false, raf = 0, last = 0
    let target = .35, progress = .35, px = 0, py = 0, tx = 0, ty = 0
    let lastEyePaint = -1, nextBlink = 1.5, blinkAt = -1000, eyeClock = 0, pointerUntil = 0
    let nextLook = 1.2, look = 0, idleX = 0, idleY = 0
    const gazeStops = [[-.38,.13],[.20,-.12],[0,0],[.43,.18],[-.13,-.15],[0,.04]]
    let program: WebGLProgram | null = null
    const reduce = matchMedia('(prefers-reduced-motion: reduce)')
    const compact = matchMedia('(max-width:1023px), (orientation: portrait)')
    const reflection = kind === 'eye' ? new CodeReflection() : null
    const image = new Image()
    const lidImage = kind === 'eye' ? new Image() : null
    let texture: WebGLTexture | null = null, screenTexture: WebGLTexture | null = null, lidTexture: WebGLTexture | null = null
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
      lastEyePaint = -1
      request()
    }
    function draw(now: number) {
      raf = 0
      if (!alive || !loaded || !near || document.hidden || gl!.isContextLost()) return
      const dt = Math.min(.04, Math.max(.001, (now - (last || now - 16)) / 1000))
      last = now
      const ease = 1 - Math.exp(-dt / .085)
      if (kind === 'eye' && !reduce.matches && !pause.current) {
        eyeClock += dt
        if (now > pointerUntil) {
          if (eyeClock > nextLook) {
            ;[idleX,idleY] = gazeStops[look++ % gazeStops.length]
            nextLook = eyeClock + 1.5 + Math.random() * 1.3
          }
          tx = idleX + Math.sin(eyeClock * 1.6) * .006
          ty = idleY + Math.sin(eyeClock * 1.1) * .004
        }
      }
      progress += (target - progress) * ease
      if (!pause.current) {
        px += (tx - px) * ease
        py += (ty - py) * ease
      }
      let blink = 0
      if (kind === 'eye' && !reduce.matches) {
        if (eyeClock > nextBlink) { blinkAt = eyeClock; nextBlink = eyeClock + 3.1 + Math.random() * 2.4 }
        blink = blinkClosure(eyeClock - blinkAt)
      }
      if (reflection && (eyeClock - lastEyePaint > .04 || lastEyePaint < 0)) {
        reflection.paint(reduce.matches ? 1800 : eyeClock * 1000, compact.matches)
        gl!.activeTexture(gl!.TEXTURE1)
        gl!.bindTexture(gl!.TEXTURE_2D, screenTexture)
        gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, reflection.canvas)
        lastEyePaint = eyeClock
      }
      gl!.useProgram(program)
      gl!.viewport(0, 0, el!.width, el!.height)
      gl!.uniform2f(uniforms.u_size, el!.width, el!.height)
      gl!.uniform1i(uniforms.u_compact, compact.matches ? 1 : 0)
      gl!.uniform2f(uniforms.u_pointer, reduce.matches ? 0 : px, reduce.matches ? 0 : py)
      gl!.uniform1f(uniforms.u_progress, reduce.matches ? (kind === 'earth' ? .12 : .55) : progress)
      gl!.uniform1f(uniforms.u_time, reduce.matches ? 0 : kind === 'eye' ? eyeClock : now / 1000)
      gl!.uniform1f(uniforms.u_blink, Math.max(0, blink))
      gl!.drawArrays(gl!.TRIANGLES, 0, 6)
      if (import.meta.env.DEV) {
        el!.dataset.progress = progress.toFixed(4)
        el!.dataset.pointer = `${px.toFixed(3)},${py.toFixed(3)}`
        el!.dataset.frames = String(Number(el!.dataset.frames || 0) + 1)
        if (kind === 'eye') { el!.dataset.blink = blink.toFixed(4); el!.dataset.clock = eyeClock.toFixed(3) }
      }
      if (!reduce.matches && !pause.current && (kind === 'eye' || Math.abs(target-progress) + Math.abs(tx-px) + Math.abs(ty-py) > .0002)) request()
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
        for (const name of ['u_size','u_pointer','u_progress','u_time','u_blink','u_mode','u_compact','u_image','u_screen','u_lid']) uniforms[name] = gl!.getUniformLocation(program, name)
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
        lidTexture = makeTexture(gl!.TEXTURE2)
        if (lidImage) gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, lidImage)
        else gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, 1, 1, 0, gl!.RGBA, gl!.UNSIGNED_BYTE, new Uint8Array([0,0,0,255]))
        gl!.uniform1i(uniforms.u_image, 0); gl!.uniform1i(uniforms.u_screen, 1); gl!.uniform1i(uniforms.u_lid, 2)
        gl!.uniform1i(uniforms.u_mode, kind === 'earth' ? 1 : kind === 'eye' ? 2 : 0)
        lastEyePaint = -1
        loaded = true; setReady(true); resize(); request()
      } catch (error) { console.warn('Scene uses its still fallback:', error); setReady(false) }
    }
    const whenImagesReady = () => {
      if (!loaded && image.complete && image.naturalWidth && (!lidImage || (lidImage.complete && lidImage.naturalWidth))) setup()
    }
    image.onload = whenImagesReady
    if (lidImage) lidImage.onload = whenImagesReady
    const io = new IntersectionObserver(([entry]) => {
      near = entry.isIntersecting
      if (near && !image.src) {
        image.src = ASSETS[kind]
        if (lidImage) lidImage.src = '/assets/scenes/eye-cinema-closed-v4.webp'
      }
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
      if (reduce.matches || pause.current || event.pointerType === 'touch') return
      const r = box.getBoundingClientRect()
      tx = Math.max(-1, Math.min(1, (event.clientX-r.left)/r.width*2-1))
      ty = Math.max(-1, Math.min(1, 1-(event.clientY-r.top)/r.height*2)); request()
      pointerUntil = performance.now() + 2200
    }
    const onLeave = () => { pointerUntil = 0; if (kind !== 'eye') { tx = 0; ty = 0 } request() }
    const onVis = () => { if (document.hidden) stop(); else { last = 0; request() } }
    const onMotionChange = () => { lastEyePaint = -1; last = 0; request() }
    const onLoss = (event: Event) => { event.preventDefault(); loaded = false; stop(); setReady(false) }
    const onRestore = () => { setup() }
    section.addEventListener('pointermove', onMove, { passive: true })
    section.addEventListener('pointerleave', onLeave)
    const onPlayback = () => { last = 0; request() }
    box.addEventListener('scene-playback', onPlayback)
    document.addEventListener('visibilitychange', onVis)
    reduce.addEventListener('change', onMotionChange)
    el.addEventListener('webglcontextlost', onLoss)
    el.addEventListener('webglcontextrestored', onRestore)
    const ro = new ResizeObserver(resize); ro.observe(box)
    return () => {
      alive = false; stop(); st.kill(); io.disconnect(); ro.disconnect(); occlusion.disconnect()
      opaqueScenes.delete(box)
      document.documentElement.classList.toggle('cinema-on', opaqueScenes.size > 0)
      image.onload = null
      if (lidImage) lidImage.onload = null
      section.removeEventListener('pointermove', onMove); section.removeEventListener('pointerleave', onLeave)
      box.removeEventListener('scene-playback', onPlayback)
      document.removeEventListener('visibilitychange', onVis); reduce.removeEventListener('change', onMotionChange)
      el.removeEventListener('webglcontextlost', onLoss); el.removeEventListener('webglcontextrestored', onRestore)
      gl.deleteTexture(texture); gl.deleteTexture(screenTexture); gl.deleteTexture(lidTexture); gl.deleteBuffer(buffer); gl.deleteProgram(program)
    }
  }, [kind])

  useEffect(() => { host.current?.dispatchEvent(new Event('scene-playback')) }, [paused])

  return <div ref={host} className={`scene-canvas scene-canvas--${kind}`} aria-hidden="true">
    <div className="scene-still" style={{ backgroundImage: kind === 'eye' ? undefined : `url(${ASSETS[kind]})`, opacity: ready ? 0 : 1 }} />
    <canvas ref={canvas} data-scene={kind} style={{ opacity: ready ? 1 : 0 }} />
  </div>
}
