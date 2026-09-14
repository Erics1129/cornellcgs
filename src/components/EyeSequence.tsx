import { useEffect, useRef, useState } from 'react'
import { CodeReflection } from '../effects/codeReflection'
import { blinkClosure } from '../effects/eyeMotion'
import { EYE_ART, eyePointerTarget, stepEyeGaze, type EyeGaze } from '../effects/eyeGaze'
import { EYE_POSES, EYE_PUPILS, EYE_SEQUENCE_FRAGMENT, EYE_SEQUENCE_VERTEX } from '../effects/eyeSequenceShader'
import '../styles/scenes.css'
import '../styles/eye-sequence.css'

type Point = { x: number; y: number }
type Frame = { time: number; gaze: Point; blink: number }
type EyeSequenceDev = {
  /** Seconds, normalized gaze (positive y is up), closure 0–1. Takes over playback. */
  renderAt: (time: number, gaze?: Point | [number, number], blink?: number) => void
  resume: () => void
  snapshot: () => Record<string, unknown>
}
declare global { interface Window { __eyeSequence?: EyeSequenceDev } }

const ASSET_ROOT = '/assets/sequences/eye-v5/'
const STOPS = [[0, .04], [-.55, .12], [.35, -.15], [0, .35], [.65, .09], [-.20, -.28]]
const finite = (n: number, fallback = 0) => Number.isFinite(n) ? n : fallback
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, finite(n)))
const automaticBlink = (time: number) => {
  const local = ((time % 13.7) + 13.7) % 13.7
  return Math.max(...[1.5, 5.6, 10.8].map(start => blinkClosure(local - start)))
}
const idleTarget = (time: number): Point => {
  const stop = STOPS[Math.floor(Math.max(0, time) / 2.4) % STOPS.length]
  return { x: stop[0] + Math.sin(time * 1.6) * .005, y: stop[1] + Math.sin(time * 1.1) * .004 }
}

/** Generated gaze and lid poses, with local motion compensation on the GPU.
 * Only this renderer owns its clock; pause, visibility and RM stop every layer. */
export default function EyeSequence({ paused = false }: { paused?: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const pause = useRef(paused)
  const [nearby, setNearby] = useState(false)
  const [ready, setReady] = useState(false)
  pause.current = paused

  useEffect(() => {
    const box = host.current!, el = canvas.current!
    let alive = true, near = false, visible = false, loading = false, loaded = false, lost = false
    let raf = 0, last = 0, clock = 0, frames = 0, manual = false
    let gl: WebGL2RenderingContext | null = null
    let program: WebGLProgram | null = null, buffer: WebGLBuffer | null = null
    let poses: WebGLTexture | null = null, code: WebGLTexture | null = null
    let reflection: CodeReflection | null = null, lastCode = -Infinity, codeCompact = false
    let rect: DOMRect | null = null, pointerInside = false, pointerX = 0, pointerY = 0
    let gaze: EyeGaze = { x: 0, y: 0, vx: 0, vy: 0 }
    let frame: Frame = { time: 0, gaze: { x: 0, y: 0 }, blink: 0 }
    let assetStatus: string[] = []
    let loadController: AbortController | null = null
    const layers = new Int32Array(EYE_POSES.length)
    const pupils = new Float32Array(EYE_PUPILS.flat())
    const uniforms: Record<string, WebGLUniformLocation | null> = {}
    const reduce = matchMedia('(prefers-reduced-motion: reduce)')
    const compact = matchMedia('(max-width:1023px), (orientation:portrait)')
    const coarse = matchMedia('(pointer:coarse)')

    function state() {
      box.dataset.renderer = loaded ? 'webgl2' : lost ? 'lost' : loading ? 'loading' : 'still'
      box.dataset.playback = document.hidden ? 'hidden' : !visible ? 'offscreen' : reduce.matches ? 'reduced'
        : pause.current ? 'paused' : manual ? 'manual' : loaded ? 'playing' : 'loading'
    }
    function stop() { cancelAnimationFrame(raf); raf = 0; last = 0 }
    function canAnimate() { return alive && loaded && visible && !document.hidden && !reduce.matches && !pause.current && !manual && !lost }
    function request() {
      // Media-query events can trail a layout/visibility callback. Resolve the
      // static frame here as well so an old pointer fixation cannot be retained.
      if (reduce.matches && !manual && loaded && visible && !document.hidden &&
        (frame.time !== 1.8 || frame.gaze.x !== 0 || frame.gaze.y !== 0 || frame.blink !== 0)) {
        paint({time:1.8,gaze:{x:0,y:0},blink:0},true)
      }
      state(); if (canAnimate() && !raf) raf = requestAnimationFrame(tick)
    }

    function resize() {
      if (!near) return
      rect = box.getBoundingClientRect()
      const width = compact.matches ? rect.width * EYE_ART.compactWidth
        : Math.min(rect.width * EYE_ART.desktopWidth, rect.height * EYE_ART.desktopHeight)
      box.style.setProperty('--eye-art-width', `${width}px`)
      const cap = coarse.matches ? 1152 : 1680
      const dpr = Math.min(devicePixelRatio || 1, 1.6, cap / Math.max(1, rect.width))
      const w = Math.max(1, Math.round(rect.width*dpr)), h = Math.max(1, Math.round(rect.height*dpr))
      if (el.width !== w || el.height !== h) {
        el.width = w; el.height = h
        if (loaded && visible && !document.hidden) paint(frame)
      }
    }

    function paint(next: Frame, forceCode = false) {
      if (!alive || !loaded || !gl || gl.isContextLost() || !reflection) return
      if (reduce.matches && !manual) next = {time:1.8,gaze:{x:0,y:0},blink:0}
      frame = { time: next.time, gaze: { x:next.gaze.x, y:next.gaze.y }, blink: next.blink }
      if (forceCode || Math.abs(next.time-lastCode) >= .04 || compact.matches !== codeCompact) {
        reflection.paint(next.time*1000, compact.matches)
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, code)
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, reflection.canvas)
        lastCode = next.time; codeCompact = compact.matches
      }
      gl.useProgram(program)
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, poses)
      gl.viewport(0, 0, el.width, el.height)
      gl.uniform2f(uniforms.u_size, el.width, el.height)
      gl.uniform2f(uniforms.u_gaze, next.gaze.x, next.gaze.y)
      gl.uniform1f(uniforms.u_blink, next.blink)
      gl.uniform1i(uniforms.u_compact, compact.matches ? 1 : 0)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      frames++
      if (import.meta.env.DEV) {
        el.dataset.frames = String(frames)
        el.dataset.clock = next.time.toFixed(4)
        el.dataset.pointer = `${next.gaze.x.toFixed(3)},${next.gaze.y.toFixed(3)}`
        el.dataset.blink = next.blink.toFixed(4)
        el.dataset.fixation = manual ? 'manual' : pointerInside ? 'pointer' : 'autonomous'
      }
    }

    function pointerTarget() {
      if (!rect || pointerX < rect.left || pointerX > rect.right || pointerY < rect.top || pointerY > rect.bottom) {
        pointerInside = false
        return idleTarget(clock)
      }
      return eyePointerTarget(pointerX, pointerY, rect, compact.matches)
    }
    function tick(now: number) {
      raf = 0
      if (!canAnimate()) { last = 0; request(); return }
      const dt = last ? Math.min(.05, Math.max(0, (now-last)/1000)) : 0
      last = now; clock += dt
      const target = pointerInside ? pointerTarget() : idleTarget(clock)
      stepEyeGaze(gaze, target, dt, pointerInside)
      paint({ time: clock, gaze, blink: automaticBlink(clock) })
      request()
    }

    function destroyGPU() {
      if (!gl) return
      gl.deleteTexture(poses); gl.deleteTexture(code); gl.deleteBuffer(buffer); gl.deleteProgram(program)
      poses = code = null; program = null; buffer = null
      loaded = false
    }
    function setup(images: (ImageBitmap | null)[]) {
      if (!alive || !gl || lost || !images[0]) return
      const context = gl
      destroyGPU()
      const shaders: WebGLShader[] = []
      try {
        const compile = (type: number, source: string) => {
          const shader = context.createShader(type)!
          shaders.push(shader)
          context.shaderSource(shader, source); context.compileShader(shader)
          if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) throw new Error(context.getShaderInfoLog(shader) || 'Eye shader failed')
          return shader
        }
        const vertex = compile(context.VERTEX_SHADER, EYE_SEQUENCE_VERTEX)
        const fragment = compile(context.FRAGMENT_SHADER, EYE_SEQUENCE_FRAGMENT)
        program = context.createProgram()!
        context.attachShader(program, vertex); context.attachShader(program, fragment); context.linkProgram(program)
        if (!context.getProgramParameter(program, context.LINK_STATUS)) throw new Error(context.getProgramInfoLog(program) || 'Eye program failed')
        context.useProgram(program)
        buffer = context.createBuffer(); context.bindBuffer(context.ARRAY_BUFFER, buffer)
        context.bufferData(context.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), context.STATIC_DRAW)
        const position = context.getAttribLocation(program, 'a_position')
        context.enableVertexAttribArray(position); context.vertexAttribPointer(position,2,context.FLOAT,false,0,0)
        for (const name of ['u_poses','u_code','u_size','u_gaze','u_pupils[0]','u_layers[0]','u_compact','u_blink']) {
          uniforms[name] = context.getUniformLocation(program,name)
        }
        const textureParameters = (target: number) => {
          context.texParameteri(target,context.TEXTURE_MIN_FILTER,context.LINEAR)
          context.texParameteri(target,context.TEXTURE_MAG_FILTER,context.LINEAR)
          context.texParameteri(target,context.TEXTURE_WRAP_S,context.CLAMP_TO_EDGE)
          context.texParameteri(target,context.TEXTURE_WRAP_T,context.CLAMP_TO_EDGE)
        }
        context.pixelStorei(context.UNPACK_FLIP_Y_WEBGL,false)
        poses = context.createTexture()
        context.activeTexture(context.TEXTURE0); context.bindTexture(context.TEXTURE_2D_ARRAY,poses)
        textureParameters(context.TEXTURE_2D_ARRAY)
        const center = images[0]
        context.texStorage3D(context.TEXTURE_2D_ARRAY,1,context.RGBA8,center.width,center.height,EYE_POSES.length)
        images.forEach((image,index) => {
          const valid = image && image.width === center.width && image.height === center.height
          layers[index] = valid ? index : 0
          if (valid) context.texSubImage3D(context.TEXTURE_2D_ARRAY,0,0,0,index,center.width,center.height,1,context.RGBA,context.UNSIGNED_BYTE,image)
          if (index < EYE_PUPILS.length) {
            pupils[index*2] = EYE_PUPILS[valid ? index : 0][0]
            pupils[index*2+1] = EYE_PUPILS[valid ? index : 0][1]
          }
        })
        reflection ??= new CodeReflection()
        code = context.createTexture()
        context.activeTexture(context.TEXTURE1); context.bindTexture(context.TEXTURE_2D,code)
        textureParameters(context.TEXTURE_2D)
        context.texStorage2D(context.TEXTURE_2D,1,context.RGBA8,reflection.canvas.width,reflection.canvas.height)
        context.uniform1i(uniforms.u_poses,0); context.uniform1i(uniforms.u_code,1)
        context.uniform1iv(uniforms['u_layers[0]'],layers); context.uniform2fv(uniforms['u_pupils[0]'],pupils)
        if (context.getError() !== context.NO_ERROR) throw new Error('Eye texture upload failed')
        loaded = true; lastCode = -Infinity
        resize()
        if (visible && !document.hidden) paint(reduce.matches ? { time: 1.8, gaze: { x: 0, y: 0 }, blink: 0 } : frame, true)
        setReady(true); state(); request()
      } catch (error) {
        destroyGPU(); setReady(false)
        console.warn('Eye sequence uses its center still:', error)
      } finally { shaders.forEach(shader => context.deleteShader(shader)) }
    }

    async function load() {
      if (!alive || loading || loaded || lost || !near || document.hidden) return
      gl ??= el.getContext('webgl2',{alpha:false,antialias:false,powerPreference:'low-power'})
      if (!gl) { state(); return }
      loading = true; state()
      const controller = new AbortController()
      loadController = controller
      const images: (ImageBitmap | null)[] = Array(EYE_POSES.length).fill(null)
      assetStatus = EYE_POSES.map(() => 'loading')
      try {
        // Bound simultaneous decoding; close every decoded bitmap after upload.
        let cursor = 0
        await Promise.all(Array.from({length:3}, async () => {
          while (cursor < EYE_POSES.length && !controller.signal.aborted) {
            const index = cursor++
            try {
              const response = await fetch(`${ASSET_ROOT}${EYE_POSES[index]}.webp`,{signal:controller.signal})
              if (!response.ok) throw new Error('Pose unavailable')
              const bitmap = await createImageBitmap(await response.blob())
              if (controller.signal.aborted || !alive) { bitmap.close(); break }
              images[index] = bitmap; assetStatus[index] = 'ready'
            } catch { assetStatus[index] = 'center-fallback' }
          }
        }))
        if (!controller.signal.aborted) setup(images)
      } finally {
        images.forEach(image => image?.close())
        if (loadController === controller) { loading = false; loadController = null; state() }
      }
    }

    const prefetch = new IntersectionObserver(([entry]) => {
      near = entry.isIntersecting
      if (near) { setNearby(true); resize(); void load() }
    },{rootMargin:'300px 0px'})
    const visibility = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && entry.intersectionRect.height > 0
      stop()
      if (visible) {
        rect = box.getBoundingClientRect()
        if (loaded && !document.hidden) paint(frame)
        request()
      } else { pointerInside = false; state() }
    },{threshold:0})
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || reduce.matches || pause.current || manual) return
      pointerInside = true; pointerX = event.clientX; pointerY = event.clientY
      rect = box.getBoundingClientRect()
      request()
    }
    const onLeave = (event: PointerEvent) => { if (event.pointerType !== 'touch') pointerInside = false }
    const onScroll = () => { if (visible && pointerInside) rect = box.getBoundingClientRect() }
    const onPlayback = () => { stop(); request() }
    const onVisibility = () => {
      stop()
      if (!document.hidden) { void load(); request() }
      else state()
    }
    const onMotion = () => {
      stop()
      if (reduce.matches) {
        pointerInside = false; manual = false
        gaze = { x:0, y:0, vx:0, vy:0 }
        frame = { time:1.8, gaze:{x:0,y:0}, blink:0 }
        if (visible && !document.hidden) paint(frame,true)
      }
      request()
    }
    const onLayout = () => { resize(); if (loaded && visible && !document.hidden) paint(frame,true) }
    const onLoss = (event: Event) => {
      event.preventDefault(); lost = true; loaded = false
      loadController?.abort(); stop(); setReady(false); state()
    }
    const onRestore = () => {
      lost = false; loading = false; loadController = null
      program = null; buffer = null; poses = code = null
      void load()
    }
    const observer = new ResizeObserver(resize)
    prefetch.observe(box); visibility.observe(box); observer.observe(box)
    box.addEventListener('pointerenter',onMove,{passive:true})
    box.addEventListener('pointermove',onMove,{passive:true})
    box.addEventListener('pointerleave',onLeave); box.addEventListener('pointercancel',onLeave)
    box.addEventListener('scene-playback',onPlayback)
    window.addEventListener('scroll',onScroll,{passive:true})
    document.addEventListener('visibilitychange',onVisibility)
    reduce.addEventListener('change',onMotion); compact.addEventListener('change',onLayout)
    el.addEventListener('webglcontextlost',onLoss); el.addEventListener('webglcontextrestored',onRestore)

    const dev: EyeSequenceDev = {
      renderAt(time,point = idleTarget(time),blink = automaticBlink(time)) {
        if (!loaded) throw new Error('Eye sequence is not ready; scroll it near the viewport first.')
        stop(); manual = true
        const p = Array.isArray(point) ? {x:point[0],y:point[1]} : point
        const x = finite(p.x), y = finite(p.y), radius = Math.max(1,Math.hypot(x,y))
        paint({time:Math.max(0,finite(time)),gaze:{x:x/radius,y:y/radius},blink:clamp(blink,0,1)},true)
        state()
      },
      resume() { manual = false; stop(); request() },
      snapshot: () => ({ready:loaded,frames,clock,frame,visible,near,paused:pause.current,reduced:reduce.matches,
        hidden:document.hidden,playback:box.dataset.playback,assets:Object.fromEntries(EYE_POSES.map((name,i)=>[name,assetStatus[i]])),
        size:[el.width,el.height],textureBytes:1152*768*4*EYE_POSES.length+800*500*4}),
    }
    if (import.meta.env.DEV) window.__eyeSequence = dev
    state()
    return () => {
      alive = false; stop(); loadController?.abort()
      prefetch.disconnect(); visibility.disconnect(); observer.disconnect()
      box.removeEventListener('pointerenter',onMove); box.removeEventListener('pointermove',onMove)
      box.removeEventListener('pointerleave',onLeave); box.removeEventListener('pointercancel',onLeave)
      box.removeEventListener('scene-playback',onPlayback)
      window.removeEventListener('scroll',onScroll); document.removeEventListener('visibilitychange',onVisibility)
      reduce.removeEventListener('change',onMotion); compact.removeEventListener('change',onLayout)
      el.removeEventListener('webglcontextlost',onLoss); el.removeEventListener('webglcontextrestored',onRestore)
      destroyGPU(); reflection = null
      if (window.__eyeSequence === dev) delete window.__eyeSequence
    }
  },[])

  useEffect(() => { host.current?.dispatchEvent(new Event('scene-playback')) },[paused])
  return <div ref={host} className="scene-canvas scene-canvas--eye eye-sequence" aria-hidden="true">
    {nearby && <img className="eye-sequence__still" src={`${ASSET_ROOT}center.webp`} alt="" decoding="async" style={{opacity:ready?0:1}} />}
    <canvas ref={canvas} data-scene="eye" style={{opacity:ready?1:0}} />
  </div>
}
