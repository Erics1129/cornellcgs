import { useEffect, useRef } from 'react'

type EnergyVeilProps = { mode: 'hero' | 'singularity'; paused?: boolean }

// A translucent, procedural atmosphere over the native movie. No textures or
// additional video decoders: the field evolves in its own low-resolution buffer.
const field = `
precision highp float;
uniform vec2 uResolution;
uniform vec2 uCenter;
uniform float uTime;
uniform float uBurst;
uniform float uMode;
uniform float uPresence;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
vec3 noiseGradient(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f), du = 6.0 * f * (1.0 - f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0)), d = hash(i + 1.0);
  return vec3(mix(mix(a,b,u.x),mix(c,d,u.x),u.y),
    du.x * mix(b-a,d-c,u.y), du.y * mix(c-a,d-b,u.x));
}
float fractal(vec2 p) {
  float v = 0.0, gain = 0.57;
  mat2 turn = mat2(0.80, -0.60, 0.60, 0.80);
  for (int i = 0; i < 3; i++) {
    v += noiseGradient(p).x * gain;
    p = turn * p * 2.06 + 5.13;
    gain *= 0.48;
  }
  return v;
}
vec2 curl(vec2 p) {
  vec3 a = noiseGradient(p);
  vec3 b = noiseGradient(p * 2.03 + 8.7);
  return vec2(a.z + b.z * 0.38, -a.y - b.y * 0.38);
}
mat2 rotate(float a) { float c = cos(a), s = sin(a); return mat2(c,-s,s,c); }

vec4 atmosphere() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 p = (uv-uCenter) * vec2(uResolution.x/uResolution.y, 1.0);
  p *= mix(2.15, 2.50, uMode);
  float r = length(p);
  float time = uTime * 0.18;
  // The varying angular displacement bends clouds into irregular tendrils;
  // there is no circular distance contour or clean ring in the field.
  vec2 q = rotate(1.65 * exp(-r*1.3) + time*0.055) * p;
  q += curl(q*2.5 + vec2(time*0.24,-time*0.13)) * 0.16;
  float smoke = 0.0, silk = 0.0, embers = 0.0;
  for (int i = 0; i < 3; i++) {
    float layer = float(i);
    vec2 v = rotate(layer*1.92) * q;
    v.y += sin(v.x*2.5 - time*0.27 + layer*2.7) * 0.16;
    float flow = fractal(v*vec2(3.7,4.8) + vec2(layer*7.2-time*0.23,time*0.35));
    float detail = noiseGradient(v*11.0 + vec2(time*0.4,layer*9.7)).x;
    float plume = exp(-v.y*v.y*mix(10.0,19.0,layer/2.0));
    plume *= exp(-v.x*v.x*1.45) * smoothstep(0.22,0.7,flow);
    smoke += plume * (0.42 + flow*0.65);
    silk += plume * exp(-abs(flow-0.54)*38.0) * (0.30+detail*0.7);
    embers += plume * pow(max(0.0, detail-0.60)*2.5, 3.0) * 0.08;
  }
  float envelope = (1.0-smoothstep(0.74,1.35,r));
  envelope *= mix(0.64,1.0,smoothstep(0.06,0.32,r));
  float edge = smoothstep(0.0,0.13,uv.x)*smoothstep(0.0,0.13,1.0-uv.x);
  edge *= smoothstep(0.0,0.10,uv.y)*smoothstep(0.0,0.10,1.0-uv.y);
  float charge = 1.0 + uBurst*0.65;
  vec3 color = vec3(0.19,0.025,0.42)*smoke*0.63;
  color += vec3(0.49,0.20,0.92)*silk*0.83;
  color += vec3(0.78,0.49,1.0)*embers;
  color *= envelope*edge*charge*mix(2.8,2.2,uMode);
  color = 1.0-exp(-color);
  float alpha = clamp((smoke*0.34+silk*0.46)*envelope*edge,0.0,0.70);
  return vec4(color*alpha,alpha)*uPresence;
}
`

export default function EnergyVeil({ mode, paused = false }: EnergyVeilProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pausedRef = useRef(paused)
  const synchronizeRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    pausedRef.current = paused
    synchronizeRef.current?.()
  }, [paused])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const section = canvas.closest('section') || canvas.parentElement
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    const mobile = matchMedia('(max-width: 760px), (pointer: coarse)')
    let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null
    let program: WebGLProgram | null = null
    let buffer: WebGLBuffer | null = null
    let shaders: WebGLShader[] = []
    let resolution: WebGLUniformLocation | null = null
    let center: WebGLUniformLocation | null = null
    let timeUniform: WebGLUniformLocation | null = null
    let burstUniform: WebGLUniformLocation | null = null
    let presenceUniform: WebGLUniformLocation | null = null
    let visible = false, failed = false, contextLost = false, disposed = false
    let raf = 0, previous = 0, lastPaint = 0, elapsed = 0, burstStarted = -100
    let frame = 0, quality = 1, sampleCount = 0, sampleTime = 0
    let appeared = false, appearanceStarted = -100

    const stop = () => { cancelAnimationFrame(raf); raf = 0; previous = 0; lastPaint = 0 }
    const size = () => {
      if (!gl || !program) return
      const { width, height } = canvas.getBoundingClientRect()
      if (!width || !height) return
      const budget = mobile.matches ? 150_000 : 500_000
      const scale = Math.min(0.5, Math.sqrt(budget/(width*height))) * quality
      canvas.width = Math.max(2, Math.floor(width*scale))
      canvas.height = Math.max(2, Math.floor(height*scale))
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniform2f(resolution, canvas.width, canvas.height)
      const x = mode === 'hero' || mobile.matches ? 0.5 : 0.68
      const y = mode === 'hero' ? (mobile.matches ? 0.28 : 0.46) : (mobile.matches ? 0.67 : 0.50)
      gl.uniform2f(center, x, 1-y)
      canvas.dataset.quality = quality.toFixed(2)
    }
    const release = () => {
      if (gl) {
        if (buffer) gl.deleteBuffer(buffer)
        if (program) gl.deleteProgram(program)
        shaders.forEach(shader => gl?.deleteShader(shader))
      }
      buffer = null; program = null; shaders = []
    }
    const initialize = () => {
      if (program) return true
      if (failed || contextLost) return false
      try {
        const options = { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, powerPreference: 'low-power' as const }
        const gl2 = canvas.getContext('webgl2', options) as WebGL2RenderingContext | null
        gl = gl2 || canvas.getContext('webgl', options) as WebGLRenderingContext | null
        if (!gl) throw new Error('WebGL unavailable')
        const compile = (type: number, source: string) => {
          const shader = gl!.createShader(type)
          if (!shader) throw new Error('Shader unavailable')
          shaders.push(shader)
          gl!.shaderSource(shader, source); gl!.compileShader(shader)
          if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) throw new Error(gl!.getShaderInfoLog(shader) || 'Shader compile failed')
          return shader
        }
        const vertex = compile(gl.VERTEX_SHADER, `${gl2 ? '#version 300 es\n' : ''}${gl2 ? 'in' : 'attribute'} vec2 position; void main(){ gl_Position=vec4(position,0.,1.); }`)
        const fragment = compile(gl.FRAGMENT_SHADER, `${gl2 ? '#version 300 es\n' : ''}${field}\n${gl2 ? 'out vec4 fragmentColor;' : ''}\nvoid main(){ ${gl2 ? 'fragmentColor' : 'gl_FragColor'}=atmosphere(); }`)
        program = gl.createProgram()
        if (!program) throw new Error('Program unavailable')
        gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program)
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Shader link failed')
        gl.useProgram(program)
        buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW)
        const position = gl.getAttribLocation(program, 'position')
        gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
        resolution = gl.getUniformLocation(program, 'uResolution')
        center = gl.getUniformLocation(program, 'uCenter')
        timeUniform = gl.getUniformLocation(program, 'uTime')
        burstUniform = gl.getUniformLocation(program, 'uBurst')
        presenceUniform = gl.getUniformLocation(program, 'uPresence')
        gl.uniform1f(gl.getUniformLocation(program, 'uMode'), mode === 'singularity' ? 1 : 0)
        gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND)
        canvas.dataset.renderer = gl2 ? 'webgl2' : 'webgl'
        size()
        return true
      } catch {
        failed = true; release(); canvas.style.visibility = 'hidden'
        canvas.dataset.playback = 'fallback'; canvas.dataset.renderer = 'none'
        return false
      }
    }
    const paint = (now: number) => {
      raf = 0
      if (disposed || !gl || !program) return
      const interval = 1000/(mobile.matches ? 24 : 30)
      if (!previous) previous = now
      elapsed += Math.min((now-previous)/1000, 0.08); previous = now
      const appearanceAge = elapsed-appearanceStarted
      if (appearanceAge >= 5.6) {
        stop(); canvas.dataset.playback = 'idle'; canvas.style.visibility = 'hidden'
        return
      }
      if (!lastPaint || now-lastPaint >= interval-1) {
        const gap = lastPaint ? now-lastPaint : interval
        sampleTime += gap; sampleCount++
        const age = elapsed-burstStarted
        const burst = age >= 0 ? (1-Math.exp(-age*5))*Math.exp(-age*1.6) : 0
        const ease = (value: number) => { const x = Math.max(0,Math.min(1,value)); return x*x*(3-2*x) }
        const presence = ease(appearanceAge/0.8)*(1-ease((appearanceAge-3.9)/1.7))
        gl.uniform1f(timeUniform, elapsed); gl.uniform1f(burstUniform, burst)
        gl.uniform1f(presenceUniform, presence)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
        canvas.dataset.frame = String(++frame); lastPaint = now
        if (sampleCount >= 45) {
          if (sampleTime/sampleCount > interval*1.65 && quality > 0.48) { quality = Math.max(0.48,quality*0.8); size() }
          sampleCount = 0; sampleTime = 0
        }
      }
      raf = requestAnimationFrame(paint)
    }
    const synchronize = () => {
      stop()
      if (disposed) return
      if (!appeared && visible && !reduced.matches && !pausedRef.current && !document.hidden) {
        appeared = true; appearanceStarted = elapsed; burstStarted = elapsed
      }
      const state = reduced.matches ? 'reduced' : pausedRef.current ? 'paused' : document.hidden ? 'hidden' : !visible ? 'offscreen' : contextLost ? 'lost' : failed ? 'fallback' : appeared && elapsed-appearanceStarted >= 5.6 ? 'idle' : 'playing'
      canvas.dataset.playback = state
      canvas.style.visibility = state === 'reduced' || state === 'fallback' || state === 'lost' || state === 'idle' ? 'hidden' : 'visible'
      if (state === 'playing' && initialize()) raf = requestAnimationFrame(paint)
    }
    const charge = () => {
      if (mode === 'hero' && !pausedRef.current && !reduced.matches && visible && !document.hidden) {
        appearanceStarted = elapsed; burstStarted = elapsed; synchronize()
      }
    }
    const lose = (event: Event) => { event.preventDefault(); contextLost = true; synchronize() }
    const restore = () => { contextLost = false; failed = false; release(); synchronize() }
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; synchronize() }, { threshold: 0.01 })
    observer.observe(canvas)
    const resize = new ResizeObserver(size); resize.observe(canvas)
    reduced.addEventListener('change', synchronize)
    mobile.addEventListener('change', size)
    document.addEventListener('visibilitychange', synchronize)
    section?.addEventListener('cgs:card-flip', charge)
    canvas.addEventListener('webglcontextlost', lose)
    canvas.addEventListener('webglcontextrestored', restore)
    synchronizeRef.current = synchronize
    synchronize()
    return () => {
      disposed = true; stop(); release(); observer.disconnect(); resize.disconnect()
      reduced.removeEventListener('change', synchronize); mobile.removeEventListener('change', size)
      document.removeEventListener('visibilitychange', synchronize)
      section?.removeEventListener('cgs:card-flip', charge)
      canvas.removeEventListener('webglcontextlost', lose); canvas.removeEventListener('webglcontextrestored', restore)
      synchronizeRef.current = null
    }
  }, [mode])

  return <canvas ref={canvasRef} className={`energy-veil energy-veil--${mode}`} aria-hidden="true" data-mode={mode} data-playback="offscreen" data-frame="0"
    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none', mixBlendMode: 'screen' }} />
}
