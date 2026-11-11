import { useEffect, useRef } from 'react'
import { STAR_FRAGMENT, STAR_VERTEX, UNIVERSE_COMPOSITE, UNIVERSE_VERTEX, universeFragment, universeRoute } from '../effects/universeShader'
import { registerScene, type SceneHandle } from '../lib/scenes'
import { deckFrame, drive, onSettle, setRestGaps } from '../lib/deck'
import { tier, type Tier } from '../lib/tier'
import { onReducedMotionChange, prefersReducedMotion } from '../lib/motion'
import { bindFilm, type FilmBinder } from '../effects/film/bind'
import { buildProgram, type BuiltProgram } from '../effects/film/program'
import { createBloom, createTarget, freeTarget, hdrSupported, type Bloom, type Target } from '../effects/film/bloom'
import { SCENE_GRADES } from '../effects/film/grades'
import '../styles/universe.css'

/** Guandan: two decks, four players, and far more possible deals (over 10⁴⁵) than stars in the observable universe (about 10²²–10²⁴) */
const PHASES = ['Two decks', 'Four players', 'More deals than stars']
/**
 * One title is always complete at rest. Titles swap inside two short windows
 * of the run; both windows are rest gaps, so a reader who stops inside one
 * settles on the nearer finished title (the picture follows the same number).
 */
const SWAPS: [number, number][] = [[0.30, 0.36], [0.66, 0.72]]
const GALAXIES = ['/assets/scenes/galaxy.webp', '/assets/scenes/galaxy-violet.webp']
const POSTERS = [0, 1, 2].map((leg) => `/assets/film/posters/universe-${leg}.webp`)
/** This backdrop is the costliest shader in the deck, so it takes a share of the tier's pixel budget. */
const PIXEL_SHARE = 0.62

const clamp = (v: number) => Math.max(0, Math.min(1, v))
const smooth = (a: number, b: number, value: number) => {
  const p = clamp((value - a) / (b - a))
  return p * p * (3 - 2 * p)
}
const legOf = (p: number) => (p < 0.33 ? 0 : p < 0.69 ? 1 : 2)

type Uniforms = Record<string, WebGLUniformLocation | null>
const locate = (gl: WebGL2RenderingContext, program: WebGLProgram, names: string[]): Uniforms =>
  Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(program, name)]))

/** Sticky travel through deep space. A scene of the manager: it owns no frame loop, observer or scroll trigger. */
export default function UniverseJourney() {
  const root = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const cue = useRef<HTMLParagraphElement>(null)
  const track = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const section = root.current!, viewport = stage.current!, surface = canvas.current!
    const phases = Array.from(section.querySelectorAll<HTMLElement>('[data-universe-phase]')).map((phase) => ({
      phase, words: Array.from(phase.querySelectorAll<HTMLElement>('[data-phase-word]')),
    }))

    /* ---- Copy: a pure function of progress, independent of WebGL ---- */
    const paintCopy = (p: number, still = false) => {
      phases.forEach(({ phase, words }, i) => {
        const start = i === 0 ? -1 : SWAPS[i - 1][0] + 0.03
        const out = i === 2 ? 1 : 1 - smooth(SWAPS[i][0], SWAPS[i][0] + 0.03, p)
        const shown = still ? Number(i === 2) : out * (i === 0 ? 1 : smooth(start, start + 0.03, p))
        phase.style.opacity = shown.toFixed(3)
        if (shown < 0.01) phase.dataset.phase = 'off'
        else delete phase.dataset.phase
        const step = 0.003, span = 0.03 - step * (words.length - 1)
        words.forEach((word, j) => {
          const reveal = still || i === 0 ? 1 : smooth(start + j * step, start + j * step + span, p)
          word.style.transform = reveal >= 1 ? '' : `translateY(${((1 - reveal) * 105).toFixed(2)}%)`
        })
      })
      cue.current!.style.opacity = String(still ? 0 : 1 - smooth(0.025, 0.1, p))
      track.current!.style.transform = `scaleX(${still ? 1 : p})`
      const leg = still ? 2 : legOf(p)
      section.dataset.leg = String(leg)
      if (import.meta.env.DEV) { section.dataset.progress = p.toFixed(5); section.dataset.phase = PHASES[leg] }
    }

    let unmount = () => {}
    const mount = (reduced: boolean) => {
      if (reduced) {
        section.dataset.renderer = 'reduced'
        paintCopy(1, true)
        return () => {}
      }
      section.dataset.renderer = 'pending'
      setRestGaps('universe', SWAPS)
      const offCopy = drive('universe', (p) => paintCopy(p))

      /* ---- Picture ---- */
      let gl: WebGL2RenderingContext | null = null
      let disposed = false, prepared = false, preparing: Promise<void> | null = null, shown = false
      let progress = 0, speed = 0, direction = 1, frames = 0
      let background: BuiltProgram | null = null, stars: BuiltProgram | null = null, composite: BuiltProgram | null = null
      let uBg: Uniforms = {}, uStar: Uniforms = {}, uComp: Uniforms = {}
      let film: FilmBinder | null = null
      let quad: WebGLBuffer | null = null, seeds: WebGLBuffer | null = null
      let quadVAO: WebGLVertexArrayObject | null = null, starsVAO: WebGLVertexArrayObject | null = null
      const textures: (WebGLTexture | null)[] = [null, null]
      const loaded = [false, false]
      const aspects = [1.5, 1.5]
      let scene: Target | null = null, bloom: Bloom | null = null
      let direct = true, glow: 'chain' | 'mip' | 'none' = 'none', levels = 0
      let count = tier().stars, renderRatio = 1, sizeDirty = true
      let handle: SceneHandle | null = null

      const still = () => {
        // WebGL2 is not available: the reduced-motion still (poster, final title, no runway)
        section.dataset.renderer = 'fallback'
        offCopy()
        paintCopy(1, true)
      }

      const freeBuffers = () => {
        if (!gl) return
        freeTarget(gl, scene); scene = null
        bloom?.release()
      }
      const freeAll = () => {
        if (!gl) return
        freeBuffers()
        bloom?.dispose(); bloom = null
        gl.deleteVertexArray(quadVAO); gl.deleteVertexArray(starsVAO)
        gl.deleteBuffer(quad); gl.deleteBuffer(seeds)
        textures.forEach((t, i) => { gl!.deleteTexture(t); textures[i] = null; loaded[i] = false })
        for (const p of [background, stars, composite]) if (p) gl.deleteProgram(p.program)
        background = stars = composite = null
        quadVAO = starsVAO = null; quad = seeds = null; film = null
        prepared = false
      }

      /** Canvas and targets for the current tier. Only ever called while the page is at rest (or before the first frame). */
      const allocate = () => {
        if (!gl) return
        sizeDirty = false
        const t = tier()
        const width = viewport.clientWidth, height = viewport.clientHeight
        if (!width || !height) return
        renderRatio = Math.min(window.devicePixelRatio || 1, t.dprCap, Math.sqrt((t.pixelCap * PIXEL_SHARE) / (width * height))) * t.scale
        const w = Math.max(1, Math.round(width * renderRatio)), h = Math.max(1, Math.round(height * renderRatio))
        if (surface.width !== w || surface.height !== h) { surface.width = w; surface.height = h }
        freeBuffers()
        glow = 'none'; levels = 0
        if (!direct) {
          const want = t.bloom
          scene = createTarget(gl, w, h, want === 'mip')
          if (scene && want.startsWith('chain') && bloom) {
            levels = Number(want.slice(5))
            glow = bloom.resize(w, h, levels) ? 'chain' : 'none'
          } else if (scene && want === 'mip') glow = 'mip'
        }
      }

      const setup = async () => {
        if (!gl) {
          try { gl = surface.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' }) } catch { /* still view below */ }
          if (!gl) return still()
        }
        const gpu = gl
        direct = !hdrSupported(gpu) || tier().bloom === 'off'
        // Compile off the main thread where the driver allows it; nothing below blocks a frame.
        background = buildProgram(gpu, UNIVERSE_VERTEX, universeFragment(direct), { a_corner: 0 })
        stars = buildProgram(gpu, STAR_VERTEX, STAR_FRAGMENT, { a_corner: 0, a_seed: 1 })
        composite = direct ? null : buildProgram(gpu, UNIVERSE_VERTEX, UNIVERSE_COMPOSITE, { a_corner: 0 })
        bloom = direct ? null : createBloom(gpu)
        const ok = await Promise.all([background?.ready, stars?.ready, composite ? composite.ready : true])
        if (disposed || gpu.isContextLost()) return
        if (!background || !stars || ok.includes(false) || ok.includes(undefined)) {
          if (import.meta.env.DEV) console.warn('Universe uses its still fallback: shaders failed')
          return still()
        }
        uBg = locate(gpu, background.program, ['u_size', 'u_progress', 'u_travel', 'u_hasImage', 'u_hasSecondImage', 'u_imageAspect', 'u_secondImageAspect', 'u_image', 'u_secondImage'])
        uStar = locate(gpu, stars.program, ['u_size', 'u_travel', 'u_speed', 'u_direction', 'u_progress', 'u_pixelRatio', 'u_gain'])
        if (composite) uComp = locate(gpu, composite.program, ['u_scene', 'u_bloom', 'u_glowMode', 'u_glowLevels', 'u_glow'])
        film = bindFilm(gpu, (composite ?? background).program)

        quad = gpu.createBuffer(); gpu.bindBuffer(gpu.ARRAY_BUFFER, quad)
        gpu.bufferData(gpu.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gpu.STATIC_DRAW)
        const corners = () => { gpu.bindBuffer(gpu.ARRAY_BUFFER, quad); gpu.enableVertexAttribArray(0); gpu.vertexAttribPointer(0, 2, gpu.FLOAT, false, 0, 0) }
        quadVAO = gpu.createVertexArray(); gpu.bindVertexArray(quadVAO); corners()
        starsVAO = gpu.createVertexArray(); gpu.bindVertexArray(starsVAO); corners()
        count = tier().stars
        const data = new Float32Array(2000 * 4) // the desktop tier's count; lower tiers draw a prefix
        let seed = 73129
        for (let i = 0; i < data.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; data[i] = seed / 4294967296 }
        seeds = gpu.createBuffer(); gpu.bindBuffer(gpu.ARRAY_BUFFER, seeds); gpu.bufferData(gpu.ARRAY_BUFFER, data, gpu.STATIC_DRAW)
        gpu.enableVertexAttribArray(1); gpu.vertexAttribPointer(1, 4, gpu.FLOAT, false, 0, 0); gpu.vertexAttribDivisor(1, 1)
        gpu.bindVertexArray(null)
        gpu.disable(gpu.DEPTH_TEST)
        allocate()
        prepared = true
        section.dataset.renderer = 'webgl2'
        handle?.invalidate()

        // The two galaxy plates: decoded off the main thread, uploaded one per task, mipmapped (the first one starts tiny).
        GALAXIES.forEach(async (url, i) => {
          try {
            const blob = await (await fetch(url)).blob()
            const bitmap = await createImageBitmap(blob)
            if (disposed || gpu.isContextLost() || !prepared) return bitmap.close()
            const texture = gpu.createTexture()
            gpu.activeTexture(gpu.TEXTURE0 + i); gpu.bindTexture(gpu.TEXTURE_2D, texture)
            gpu.pixelStorei(gpu.UNPACK_FLIP_Y_WEBGL, false)
            gpu.texImage2D(gpu.TEXTURE_2D, 0, gpu.RGBA, gpu.RGBA, gpu.UNSIGNED_BYTE, bitmap)
            gpu.generateMipmap(gpu.TEXTURE_2D)
            gpu.texParameteri(gpu.TEXTURE_2D, gpu.TEXTURE_MIN_FILTER, gpu.LINEAR_MIPMAP_LINEAR)
            gpu.texParameteri(gpu.TEXTURE_2D, gpu.TEXTURE_MAG_FILTER, gpu.LINEAR)
            gpu.texParameteri(gpu.TEXTURE_2D, gpu.TEXTURE_WRAP_S, gpu.CLAMP_TO_EDGE)
            gpu.texParameteri(gpu.TEXTURE_2D, gpu.TEXTURE_WRAP_T, gpu.CLAMP_TO_EDGE)
            aspects[i] = bitmap.width / bitmap.height
            bitmap.close()
            textures[i] = texture; loaded[i] = true
            section.dataset[i ? 'secondTexture' : 'texture'] = 'ready'
            handle?.invalidate()
          } catch {
            section.dataset[i ? 'secondTexture' : 'texture'] = 'procedural' // the shader draws its own spiral
          }
        })
      }

      const render = (p: number, streak: number, seed: number) => {
        const gpu = gl!
        const route = universeRoute(p)
        const w = surface.width, h = surface.height
        gpu.bindFramebuffer(gpu.FRAMEBUFFER, scene ? scene.fbo : null)
        gpu.viewport(0, 0, w, h)
        gpu.disable(gpu.BLEND); gpu.useProgram(background!.program); gpu.bindVertexArray(quadVAO)
        gpu.uniform2f(uBg.u_size, w, h)
        gpu.uniform1f(uBg.u_progress, p)
        gpu.uniform1f(uBg.u_travel, route.travel)
        gpu.uniform1f(uBg.u_hasImage, loaded[0] ? 1 : 0)
        gpu.uniform1f(uBg.u_hasSecondImage, loaded[1] ? 1 : 0)
        gpu.uniform1f(uBg.u_imageAspect, aspects[0])
        gpu.uniform1f(uBg.u_secondImageAspect, aspects[1])
        gpu.uniform1i(uBg.u_image, 0)
        gpu.uniform1i(uBg.u_secondImage, 1)
        gpu.activeTexture(gpu.TEXTURE0); gpu.bindTexture(gpu.TEXTURE_2D, textures[0])
        gpu.activeTexture(gpu.TEXTURE1); gpu.bindTexture(gpu.TEXTURE_2D, textures[1])
        if (!scene) film!(SCENE_GRADES.universe, seed)
        gpu.drawArrays(gpu.TRIANGLES, 0, 6)

        gpu.enable(gpu.BLEND); gpu.blendFunc(gpu.ONE, gpu.ONE)
        gpu.useProgram(stars!.program); gpu.bindVertexArray(starsVAO)
        gpu.uniform2f(uStar.u_size, w, h)
        gpu.uniform1f(uStar.u_travel, route.travel)
        gpu.uniform1f(uStar.u_speed, route.envelope * Math.sqrt(streak))
        gpu.uniform1f(uStar.u_direction, direction)
        gpu.uniform1f(uStar.u_progress, p)
        gpu.uniform1f(uStar.u_pixelRatio, renderRatio)
        // In linear light a star may run hotter than white (it blooms); in the direct path it is display colour.
        gpu.uniform1f(uStar.u_gain, scene ? 1.5 : 0.7)
        gpu.drawArraysInstanced(gpu.TRIANGLES, 0, 6, Math.min(count, 2000))
        gpu.disable(gpu.BLEND)

        if (scene && composite) {
          gpu.bindVertexArray(quadVAO)
          let bloomTex: WebGLTexture | null = null
          if (glow === 'chain' && bloom) bloomTex = bloom.render(scene)
          gpu.activeTexture(gpu.TEXTURE2); gpu.bindTexture(gpu.TEXTURE_2D, scene.tex)
          if (glow === 'mip') gpu.generateMipmap(gpu.TEXTURE_2D)
          gpu.activeTexture(gpu.TEXTURE3); gpu.bindTexture(gpu.TEXTURE_2D, bloomTex ?? scene.tex)
          gpu.bindFramebuffer(gpu.FRAMEBUFFER, null)
          gpu.viewport(0, 0, w, h)
          gpu.useProgram(composite.program)
          gpu.uniform1i(uComp.u_scene, 2)
          gpu.uniform1i(uComp.u_bloom, 3)
          gpu.uniform1f(uComp.u_glowMode, glow === 'chain' ? 1 : glow === 'mip' ? 2 : 0)
          gpu.uniform1f(uComp.u_glowLevels, Math.max(1, levels))
          gpu.uniform1f(uComp.u_glow, glow === 'chain' ? 0.3 : 0.1)
          film!(SCENE_GRADES.universe, seed)
          gpu.drawArrays(gpu.TRIANGLES, 0, 6)
          gpu.activeTexture(gpu.TEXTURE0)
        }
        gpu.bindVertexArray(null)
      }

      handle = registerScene({
        id: 'universe',
        chapter: 'universe',
        host: viewport,
        weight: 'heavy',
        clock: 'time',
        prepare() {
          if (prepared || disposed) return
          return (preparing ??= setup().finally(() => { preparing = null }))
        },
        draw(_now, tick) {
          if (!prepared || !gl || gl.isContextLost() || !tick.chapter) return false
          const f = tick.frame
          progress = clamp(tick.chapter.vrun)
          direction = f.direction
          // Star streaks follow how fast the reader travels. A settle draw is the exact still.
          const target = tick.settle || f.idle ? 0 : clamp(Math.abs(f.velocity) / Math.max(1, f.vh * 1.6))
          speed = tick.settle ? 0 : speed + (target - speed) * (1 - Math.exp(-Math.max(tick.dt, 0.001) / 0.085))
          if (speed < 0.001 && target === 0) speed = 0
          // Resolution only ever changes at rest (buffers are re-allocated).
          if (sizeDirty && (f.idle || !shown)) allocate()
          if (!surface.width) return false
          render(progress, speed, speed ? ++frames % 64 : 0)
          section.dataset.motion = speed ? 'flying' : 'idle'
          if (!shown) { shown = true; requestAnimationFrame(() => { if (!disposed && prepared) handle?.ready() }) }
          if (import.meta.env.DEV) {
            surface.dataset.frames = String(frames)
            surface.dataset.pixels = String(surface.width * surface.height)
            surface.dataset.glow = glow + (levels || '')
            surface.dataset.stars = String(count)
          }
          return speed > 0 || target > 0
        },
        release() {
          // Far away: give back the textures and targets, keep the context and the compiled programs.
          if (!gl || !prepared) return
          freeAll()
          surface.width = surface.height = 0
          shown = false
          handle?.lost()
          section.dataset.renderer = 'pending'
        },
        resize(t: Tier) {
          count = t.stars
          sizeDirty = true
          handle?.invalidate()
        },
      })

      const observer = new ResizeObserver(() => { sizeDirty = true; handle?.invalidate() })
      observer.observe(viewport)
      const offSettle = onSettle(() => { if (sizeDirty) handle?.invalidate() })
      const onLoss = (event: Event) => {
        event.preventDefault()
        prepared = false; shown = false
        background = stars = composite = null; bloom = null; scene = null; film = null
        textures.fill(null); loaded.fill(false)
        section.dataset.renderer = 'lost'
        handle?.lost()
      }
      const onRestore = () => {
        if (disposed) return
        preparing = setup().finally(() => { preparing = null })
      }
      surface.addEventListener('webglcontextlost', onLoss)
      surface.addEventListener('webglcontextrestored', onRestore)
      paintCopy(deckFrame().chapters.find((c) => c.id === 'universe')?.vrun ?? 0)

      if (import.meta.env.DEV) {
        // scripts/cinema/universe-posters.mjs uses this to export one poster per leg from the real shader.
        const w = window as unknown as { __filmShots?: Record<string, unknown> }
        w.__filmShots = { ...w.__filmShots, universe: (p: number, type = 'image/webp', quality = 0.8) => {
          if (!prepared) return null
          render(p, 0, 0)
          return surface.toDataURL(type, quality)
        }, universeReady: () => prepared && loaded[0] && loaded[1] }
      }

      return () => {
        disposed = true
        offCopy(); offSettle(); observer.disconnect()
        surface.removeEventListener('webglcontextlost', onLoss)
        surface.removeEventListener('webglcontextrestored', onRestore)
        handle?.dispose(); handle = null
        freeAll()
        setRestGaps('universe', [])
      }
    }

    unmount = mount(prefersReducedMotion())
    const offReduced = onReducedMotionChange((reduced) => { unmount(); unmount = mount(reduced) })
    return () => { offReduced(); unmount() }
  }, [])

  return (
    <section ref={root} id="universe" className="universe-journey" data-renderer="pending" data-leg="0" aria-label="Guandan: two decks, four players, more deals than stars.">
      <div ref={stage} className="universe-viewport" data-scene-host>
        {/* The poster: one still per leg, exported from the shader itself, over a CSS sky. Never a bare black stage. */}
        <div className="universe-fallback" data-poster aria-hidden="true">
          <div className="universe-fallback-halo" />
          {POSTERS.map((src, leg) => <img key={src} className={`universe-poster universe-poster-${leg}`} src={src} alt="" width="1280" height="800" loading="lazy" decoding="async" onError={(event) => { event.currentTarget.style.visibility = 'hidden' }} />)}
        </div>
        <div className="universe-plate" data-film-enter>
          <canvas ref={canvas} className="universe-canvas" data-scene="universe" aria-hidden="true" />
        </div>
        <div className="universe-edges" aria-hidden="true" />
        <div className="universe-heading container-site">
          <h2 aria-label="Two decks. Four players. More deals than stars.">
            {PHASES.map((label, i) => <span key={i} data-universe-phase className={`universe-phase universe-phase-${i}`} aria-hidden="true">
              {label.split(' ').map((word, j, all) => <span key={word} className="universe-phase-mask"><span data-phase-word>{word}{j < all.length - 1 ? ' ' : ''}</span></span>)}
            </span>)}
          </h2>
        </div>
        <div className="universe-footer container-site">
          <p ref={cue} className="universe-cue">Keep scrolling <span aria-hidden="true">↓</span></p>
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
