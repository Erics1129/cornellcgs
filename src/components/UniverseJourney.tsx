import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { STAR_FRAGMENT, STAR_VERTEX, UNIVERSE_FRAGMENT, UNIVERSE_VERTEX, universeRoute } from '../effects/universeShader'
import '../styles/universe.css'

gsap.registerPlugin(ScrollTrigger)
const occupiedStages = new Set<Element>()
const PHASES = ['Across galaxies', 'Beyond spacetime', 'Another horizon']
const clamp = (v: number) => Math.max(0, Math.min(1, v))
const smooth = (a: number, b: number, value: number) => {
  const p = clamp((value-a)/(b-a))
  return p*p*(3-2*p)
}

/** Native sticky travel. Two draws per frame; no simulation or idle clock. */
export default function UniverseJourney() {
  const root = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const destination = useRef<HTMLImageElement>(null)
  const nextDestination = useRef<HTMLImageElement>(null)
  const heading = useRef<HTMLDivElement>(null)
  const cue = useRef<HTMLParagraphElement>(null)
  const track = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const section = root.current!, viewport = stage.current!, surface = canvas.current!
    const image = destination.current!, secondImage = nextDestination.current!
    const phaseWords = Array.from(section.querySelectorAll<HTMLElement>('[data-universe-phase]')).map(phase => ({
      phase, words: Array.from(phase.querySelectorAll<HTMLElement>('[data-phase-word]')),
    }))
    let alive = true, visible = false
    let request = () => {}, stop = () => {}
    const occlusion = new IntersectionObserver(([entry]) => {
      if (!alive) return
      visible = entry.isIntersecting
      if (entry.intersectionRatio > .7) occupiedStages.add(viewport)
      else occupiedStages.delete(viewport)
      document.documentElement.classList.toggle('universe-on', occupiedStages.size > 0)
      if (visible) request(); else stop()
    }, { threshold: [0,.01,.7,1] })
    occlusion.observe(viewport)
    const media = gsap.matchMedia()
    media.add({ reduced: '(prefers-reduced-motion: reduce)', motion: '(prefers-reduced-motion: no-preference)' }, (context) => {
      let gl: WebGL2RenderingContext | null = null
      let disposed = false, raf = 0, last = 0, lastInput = -Infinity
      let progress = 0, speed = 0, wantedSpeed = 0, direction = 1
      let frames = 0, renderRatio = 1, hasImage = false, hasSecondImage = false, screenHeight = 1
      let fullWidth = 1, fullHeight = 1, fullRatio = 1, travelResolution = false
      let background: WebGLProgram | null = null, stars: WebGLProgram | null = null
      let quad: WebGLBuffer | null = null, seeds: WebGLBuffer | null = null
      let backdropVAO: WebGLVertexArrayObject | null = null, starsVAO: WebGLVertexArrayObject | null = null
      let texture: WebGLTexture | null = null, secondTexture: WebGLTexture | null = null
      let scroll: ScrollTrigger | null = null
      let observer: ResizeObserver | null = null
      const compact = matchMedia('(max-width:767px), (pointer:coarse)').matches
      const count = compact ? 640 : 1040
      const uniforms = new Map<WebGLProgram, Record<string, WebGLUniformLocation | null>>()

      const paintCopy = (p: number, still = false) => {
        phaseWords.forEach(({phase,words},i) => {
          const starts = [0,.385,.77]
          const exit = i===0 ? 1-smooth(.19,.28,p) : i===1 ? 1-smooth(.625,.705,p) : 1
          const shown = still ? Number(i===2) : exit*(i===0 ? 1 : smooth(starts[i],starts[i]+.065,p))
          phase.style.opacity = String(shown)
          words.forEach((word,j) => {
            const reveal = still || i===0 ? 1 : smooth(starts[i]+j*.012,starts[i]+.06+j*.012,p)
            word.style.transform = `translateY(${(1-reveal)*105}%)`
          })
        })
        cue.current!.style.opacity = String(still ? 0 : 1-smooth(.025,.1,p))
        track.current!.style.transform = `scaleX(${still ? 1 : p})`
        const leg = p<.36 ? 0 : p<.735 ? 1 : 2
        section.dataset.leg = String(leg)
        if (import.meta.env.DEV) { section.dataset.progress = p.toFixed(5); section.dataset.phase = PHASES[leg] }
      }
      const still = (mode: 'reduced' | 'fallback') => {
        section.dataset.renderer = mode
        section.dataset.motion = 'idle'
        paintCopy(1,true)
      }
      if (context.conditions?.reduced) {
        still('reduced')
        request = () => {}; stop = () => {}
        return
      }
      try { gl = surface.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' }) } catch { /* Still view below. */ }
      if (!gl) { still('fallback'); return }
      const gpu = gl
      section.dataset.renderer = 'loading'

      stop = () => { cancelAnimationFrame(raf); raf = 0; last = 0; speed = 0; wantedSpeed = 0; section.dataset.motion = 'paused' }
      request = () => {
        if (alive && !disposed && visible && !document.hidden && background && stars && !gpu.isContextLost() && !raf) raf = requestAnimationFrame(draw)
      }
      const release = () => {
        gpu.deleteVertexArray(backdropVAO); gpu.deleteVertexArray(starsVAO)
        gpu.deleteBuffer(quad); gpu.deleteBuffer(seeds); gpu.deleteTexture(texture); gpu.deleteTexture(secondTexture)
        gpu.deleteProgram(background); gpu.deleteProgram(stars)
        backdropVAO = starsVAO = null; quad = seeds = null; texture = secondTexture = null; background = stars = null
        uniforms.clear()
      }
      const compile = (type: number, source: string) => {
        const shader = gpu.createShader(type)
        if (!shader) throw new Error('Shader allocation failed')
        gpu.shaderSource(shader, source); gpu.compileShader(shader)
        if (!gpu.getShaderParameter(shader, gpu.COMPILE_STATUS)) {
          const message = gpu.getShaderInfoLog(shader)
          gpu.deleteShader(shader); throw new Error(message || 'Shader compilation failed')
        }
        return shader
      }
      const program = (vertex: string, fragment: string) => {
        const vs = compile(gpu.VERTEX_SHADER,vertex)
        let fs: WebGLShader | null = null
        const result = gpu.createProgram()
        if (!result) { gpu.deleteShader(vs); throw new Error('Program allocation failed') }
        try {
          fs = compile(gpu.FRAGMENT_SHADER,fragment)
          gpu.attachShader(result,vs); gpu.attachShader(result,fs); gpu.linkProgram(result)
          if (!gpu.getProgramParameter(result,gpu.LINK_STATUS)) throw new Error(gpu.getProgramInfoLog(result) || 'Shader link failed')
        } catch (error) { gpu.deleteProgram(result); throw error }
        finally { gpu.deleteShader(vs); gpu.deleteShader(fs) }
        const locations: Record<string, WebGLUniformLocation | null> = {}
        for (const name of ['u_size','u_progress','u_travel','u_speed','u_direction','u_pixelRatio','u_hasImage','u_hasSecondImage','u_imageAspect','u_secondImageAspect','u_image','u_secondImage']) locations[name] = gpu.getUniformLocation(result,name)
        uniforms.set(result,locations)
        return result
      }
      const uploadImage = (source: HTMLImageElement, target: WebGLTexture | null, second: boolean) => {
        if (!target || !source.complete || !source.naturalWidth || gpu.isContextLost()) return
        try {
          gpu.activeTexture(second ? gpu.TEXTURE1 : gpu.TEXTURE0); gpu.bindTexture(gpu.TEXTURE_2D,target)
          gpu.pixelStorei(gpu.UNPACK_FLIP_Y_WEBGL,true)
          gpu.texImage2D(gpu.TEXTURE_2D,0,gpu.RGBA,gpu.RGBA,gpu.UNSIGNED_BYTE,source)
          if(second) { hasSecondImage = true; section.dataset.secondTexture = 'ready' }
          else { hasImage = true; section.dataset.texture = 'ready' }
          request()
        } catch {
          if(second) { hasSecondImage = false; section.dataset.secondTexture = 'procedural' }
          else { hasImage = false; section.dataset.texture = 'procedural' }
        }
      }
      const upload = () => uploadImage(image,texture,false)
      const uploadSecond = () => uploadImage(secondImage,secondTexture,true)
      const resize = () => {
        // All dimensions are read together, never inside the render loop.
        const width = viewport.clientWidth, height = viewport.clientHeight
        screenHeight = height
        const sideCap = compact ? 1280 : 1920
        const pixelCap = compact ? 1_050_000 : 2_100_000
        fullRatio = Math.min(devicePixelRatio || 1,1.5,sideCap/Math.max(1,width,height),Math.sqrt(pixelCap/Math.max(1,width*height)))
        fullWidth = Math.max(1,Math.floor(width*fullRatio))
        fullHeight = Math.max(1,Math.floor(height*fullRatio))
        travelResolution = false
        renderRatio = fullRatio
        surface.width = fullWidth
        surface.height = fullHeight
        request()
      }
      const setup = () => {
        try {
          release()
          background = program(UNIVERSE_VERTEX,UNIVERSE_FRAGMENT)
          stars = program(STAR_VERTEX,STAR_FRAGMENT)
          quad = gpu.createBuffer(); gpu.bindBuffer(gpu.ARRAY_BUFFER,quad)
          gpu.bufferData(gpu.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gpu.STATIC_DRAW)
          const corners = (p: WebGLProgram) => {
            gpu.bindBuffer(gpu.ARRAY_BUFFER,quad)
            const at = gpu.getAttribLocation(p,'a_corner')
            gpu.enableVertexAttribArray(at); gpu.vertexAttribPointer(at,2,gpu.FLOAT,false,0,0)
          }
          backdropVAO = gpu.createVertexArray(); gpu.bindVertexArray(backdropVAO); corners(background)
          starsVAO = gpu.createVertexArray(); gpu.bindVertexArray(starsVAO); corners(stars)
          const data = new Float32Array(count*4)
          let seed = 73129
          for (let i=0;i<data.length;i++) { seed = (Math.imul(seed,1664525)+1013904223)>>>0; data[i] = seed/4294967296 }
          seeds = gpu.createBuffer(); gpu.bindBuffer(gpu.ARRAY_BUFFER,seeds); gpu.bufferData(gpu.ARRAY_BUFFER,data,gpu.STATIC_DRAW)
          const at = gpu.getAttribLocation(stars,'a_seed')
          gpu.enableVertexAttribArray(at); gpu.vertexAttribPointer(at,4,gpu.FLOAT,false,0,0); gpu.vertexAttribDivisor(at,1)
          const makeTexture = (unit: number) => {
            const result = gpu.createTexture(); gpu.activeTexture(unit); gpu.bindTexture(gpu.TEXTURE_2D,result)
            gpu.texParameteri(gpu.TEXTURE_2D,gpu.TEXTURE_MIN_FILTER,gpu.LINEAR)
            gpu.texParameteri(gpu.TEXTURE_2D,gpu.TEXTURE_MAG_FILTER,gpu.LINEAR)
            gpu.texParameteri(gpu.TEXTURE_2D,gpu.TEXTURE_WRAP_S,gpu.CLAMP_TO_EDGE)
            gpu.texParameteri(gpu.TEXTURE_2D,gpu.TEXTURE_WRAP_T,gpu.CLAMP_TO_EDGE)
            gpu.texImage2D(gpu.TEXTURE_2D,0,gpu.RGBA,1,1,0,gpu.RGBA,gpu.UNSIGNED_BYTE,new Uint8Array([0,0,0,255]))
            return result
          }
          texture = makeTexture(gpu.TEXTURE0); secondTexture = makeTexture(gpu.TEXTURE1)
          gpu.disable(gpu.DEPTH_TEST)
          hasImage = hasSecondImage = false; section.dataset.texture = section.dataset.secondTexture = 'procedural'
          section.dataset.renderer = 'webgl2'
          upload(); uploadSecond(); resize(); request()
        } catch (error) {
          stop(); release(); still('fallback')
          if (import.meta.env.DEV) console.warn('Universe uses its still fallback:',error)
        }
      }
      function draw(now: number) {
        raf = 0
        if (!alive || disposed || !visible || document.hidden || !background || !stars || gpu.isContextLost()) return
        const began = performance.now()
        const interval = last ? now-last : 0
        const dt = Math.min(.05,Math.max(.001,(interval || 16)/1000)); last = now
        const target = now-lastInput<95 ? wantedSpeed : 0
        speed += (target-speed)*(1-Math.exp(-dt/.085))
        if (speed<.001 && target===0) speed = 0
        // Long streaks tolerate a smaller buffer. Arrival and still views
        // retain full detail; resize only at flight/idle boundaries.
        const flying = fullWidth * fullHeight > 850_000 && progress > .08 && progress < .90 && speed > .015
        if (flying !== travelResolution) {
          travelResolution = flying
          const scale = flying ? .76 : 1
          surface.width = Math.max(1,Math.round(fullWidth * scale))
          surface.height = Math.max(1,Math.round(fullHeight * scale))
          renderRatio = fullRatio * scale
        }
        const route = universeRoute(progress)
        const streak = route.envelope * Math.sqrt(speed)
        gpu.viewport(0,0,surface.width,surface.height)
        gpu.disable(gpu.BLEND); gpu.useProgram(background); gpu.bindVertexArray(backdropVAO)
        const bg = uniforms.get(background)!
        gpu.uniform2f(bg.u_size,surface.width,surface.height)
        gpu.uniform1f(bg.u_progress,progress)
        gpu.uniform1f(bg.u_travel,route.travel)
        gpu.uniform1f(bg.u_hasImage,hasImage ? 1 : 0)
        gpu.uniform1f(bg.u_hasSecondImage,hasSecondImage ? 1 : 0)
        gpu.uniform1f(bg.u_imageAspect,image.naturalWidth ? image.naturalWidth/image.naturalHeight : 1.5)
        gpu.uniform1f(bg.u_secondImageAspect,secondImage.naturalWidth ? secondImage.naturalWidth/secondImage.naturalHeight : 1.5)
        gpu.uniform1i(bg.u_image,0)
        gpu.uniform1i(bg.u_secondImage,1)
        gpu.activeTexture(gpu.TEXTURE0); gpu.bindTexture(gpu.TEXTURE_2D,texture)
        gpu.activeTexture(gpu.TEXTURE1); gpu.bindTexture(gpu.TEXTURE_2D,secondTexture)
        gpu.drawArrays(gpu.TRIANGLES,0,6)
        gpu.enable(gpu.BLEND); gpu.blendFunc(gpu.ONE,gpu.ONE)
        gpu.useProgram(stars); gpu.bindVertexArray(starsVAO)
        const star = uniforms.get(stars)!
        gpu.uniform2f(star.u_size,surface.width,surface.height)
        gpu.uniform1f(star.u_travel,route.travel)
        gpu.uniform1f(star.u_speed,streak)
        gpu.uniform1f(star.u_direction,direction)
        gpu.uniform1f(star.u_progress,progress)
        gpu.uniform1f(star.u_pixelRatio,renderRatio)
        gpu.drawArraysInstanced(gpu.TRIANGLES,0,6,count)
        section.dataset.motion = speed ? 'flying' : 'idle'
        if (import.meta.env.DEV) {
          surface.dataset.frames = String(++frames)
          surface.dataset.travel = route.travel.toFixed(5)
          surface.dataset.speed = streak.toFixed(4)
          surface.dataset.submitMs = (performance.now()-began).toFixed(2)
          surface.dataset.frameIntervalMs = interval.toFixed(2)
          surface.dataset.drawCalls = '2'
          surface.dataset.stars = String(count)
          surface.dataset.pixels = String(surface.width*surface.height)
          surface.dataset.resolutionScale = travelResolution ? '.76' : '1'
        }
        if (speed || target) request()
      }
      const update = (self: ScrollTrigger) => {
        direction = self.direction || 1
        progress = clamp(self.progress)
        wantedSpeed = clamp(Math.abs(self.getVelocity())/Math.max(1,screenHeight*1.6))
        lastInput = performance.now()
        paintCopy(progress); request()
      }
      const onVisible = () => { if (document.hidden) stop(); else request() }
      const onLoss = (event: Event) => {
        event.preventDefault(); stop()
        section.dataset.renderer = 'lost'
      }
      const onRestore = () => { if (!disposed) setup() }
      const onError = () => { hasImage = false; section.dataset.texture = 'missing'; request() }
      const onSecondError = () => { hasSecondImage = false; section.dataset.secondTexture = 'missing'; request() }
      image.addEventListener('load',upload); image.addEventListener('error',onError)
      secondImage.addEventListener('load',uploadSecond); secondImage.addEventListener('error',onSecondError)
      surface.addEventListener('webglcontextlost',onLoss); surface.addEventListener('webglcontextrestored',onRestore)
      document.addEventListener('visibilitychange',onVisible)
      setup()
      if (background && stars) {
        scroll = ScrollTrigger.create({ id: 'universe-journey', trigger: section, start: 'top top', end: 'bottom bottom',
          onUpdate: update,
          onRefresh: (self) => { progress = clamp(self.progress); paintCopy(progress); request() },
        })
        progress = scroll.progress; paintCopy(progress)
        observer = new ResizeObserver(resize); observer.observe(viewport)
      }
      return () => {
        disposed = true; stop(); scroll?.kill(); observer?.disconnect()
        image.removeEventListener('load',upload); image.removeEventListener('error',onError)
        secondImage.removeEventListener('load',uploadSecond); secondImage.removeEventListener('error',onSecondError)
        surface.removeEventListener('webglcontextlost',onLoss); surface.removeEventListener('webglcontextrestored',onRestore)
        document.removeEventListener('visibilitychange',onVisible)
        release(); request = () => {}; stop = () => {}
      }
    })
    return () => {
      alive = false; media.revert(); occlusion.disconnect()
      occupiedStages.delete(viewport)
      document.documentElement.classList.toggle('universe-on',occupiedStages.size>0)
    }
  }, [])

  return (
    <section ref={root} id="universe" className="universe-journey" data-renderer="pending" aria-label="Beyond the known. A journey through space.">
      <div ref={stage} className="universe-viewport">
        <div className="universe-fallback" aria-hidden="true">
          <div className="universe-fallback-halo" />
          <img ref={destination} className="universe-source-first" src="/assets/scenes/galaxy.webp" alt="" width="1536" height="1024" loading="lazy" decoding="async" />
          <img ref={nextDestination} src="/assets/scenes/galaxy-violet.webp" alt="" width="1536" height="1024" loading="lazy" decoding="async" onError={(event) => { event.currentTarget.style.visibility = 'hidden' }} onLoad={(event) => { event.currentTarget.style.visibility = '' }} />
        </div>
        <canvas ref={canvas} className="universe-canvas" data-scene="universe" aria-hidden="true" />
        <div className="universe-edges" aria-hidden="true" />
        <div ref={heading} className="universe-heading container-site">
          <h2 aria-label="Across galaxies. Beyond spacetime. Another horizon.">
            {PHASES.map((label,i) => <span key={label} data-universe-phase className={`universe-phase universe-phase-${i}`} aria-hidden="true">
              {label.split(' ').map((word,j) => <span key={word} className="universe-phase-mask"><span data-phase-word>{word}{j===0 ? '\u00a0' : ''}</span></span>)}
            </span>)}
          </h2>
        </div>
        <div className="universe-footer container-site">
          <p ref={cue} className="universe-cue">Scroll to explore <span aria-hidden="true">↓</span></p>
          <div className="universe-itinerary" aria-hidden="true">
            <span className="universe-stop universe-stop-0">01</span>
            <div className="universe-track"><div ref={track} /></div>
            <span className="universe-stop universe-stop-1">02</span>
            <span className="universe-stop universe-stop-2">03</span>
          </div>
        </div>
      </div>
    </section>
  )
}
