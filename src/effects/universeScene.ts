/**
 * universeScene.ts — the WebGL half of the Universe chapter (shaders, HDR target, bloom).
 * Loaded on demand from the scene's prepare(), so none of it is in the entry bundle:
 * the chapter's copy, poster and runway work without it.
 */
import { STAR_FRAGMENT, STAR_VERTEX, UNIVERSE_COMPOSITE, UNIVERSE_VERTEX, universeFragment, universeRoute } from './universeShader'
import type { SceneHandle, SceneTick } from '../lib/scenes'
import { onSettle } from '../lib/deck'
import { tier, type Tier } from '../lib/tier'
import { bindFilm, type FilmBinder } from './film/bind'
import { buildProgram, type BuiltProgram } from './film/program'
import { createBloom, createTarget, freeTarget, hdrSupported, type Bloom, type Target } from './film/bloom'
import { SCENE_GRADES } from './film/grades'

const GALAXIES = ['/assets/scenes/galaxy.webp', '/assets/scenes/galaxy-violet.webp']
/** This backdrop is the costliest shader in the deck, so it takes a share of the tier's pixel budget. */
const PIXEL_SHARE = 0.62
const clamp = (v: number) => Math.max(0, Math.min(1, v))

type Uniforms = Record<string, WebGLUniformLocation | null>
const locate = (gl: WebGL2RenderingContext, program: WebGLProgram, names: string[]): Uniforms =>
  Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(program, name)]))

export interface UniverseEnv {
  section: HTMLElement
  viewport: HTMLElement
  surface: HTMLCanvasElement
  /** the scene manager's handle for this scene (null until registered) */
  handle(): SceneHandle | null
  /** WebGL2 or the shaders are not available: the chapter falls back to its still */
  unavailable(): void
}

export interface UniversePicture {
  prepare(): Promise<void> | void
  draw(now: number, tick: SceneTick): boolean
  release(): void
  resize(t: Tier): void
  /** dev only: draw progress p and return the canvas as a data URL (poster export) */
  capture(p: number, type?: string, quality?: number): string | null
  ready(): boolean
  dispose(): void
}

export function createUniverse(env: UniverseEnv): UniversePicture {
  const { section, viewport, surface } = env
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
      if (!gl) return env.unavailable()
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
      return env.unavailable()
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
    env.handle()?.invalidate()

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
        env.handle()?.invalidate()
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

  const prepare = () => {
      if (prepared || disposed) return
      return (preparing ??= setup().finally(() => { preparing = null }))
    }
  const draw = (_now: number, tick: SceneTick): boolean => {
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
      if (!shown) { shown = true; requestAnimationFrame(() => { if (!disposed && prepared) env.handle()?.ready() }) }
      if (import.meta.env.DEV) {
        surface.dataset.frames = String(frames)
        surface.dataset.pixels = String(surface.width * surface.height)
        surface.dataset.glow = glow + (levels || '')
        surface.dataset.stars = String(count)
      }
      return speed > 0 || target > 0
    }
  const release = () => {
      // Far away: give back the textures and targets, keep the context and the compiled programs.
      if (!gl || !prepared) return
      freeAll()
      surface.width = surface.height = 0
      shown = false
      env.handle()?.lost()
      section.dataset.renderer = 'pending'
    }
  const resize = (t: Tier) => {
      count = t.stars
      sizeDirty = true
      env.handle()?.invalidate()
    }
  const observer = new ResizeObserver(() => { sizeDirty = true; env.handle()?.invalidate() })
  observer.observe(viewport)
  const offSettle = onSettle(() => { if (sizeDirty) env.handle()?.invalidate() })
  const onLoss = (event: Event) => {
    event.preventDefault()
    prepared = false; shown = false
    background = stars = composite = null; bloom = null; scene = null; film = null
    textures.fill(null); loaded.fill(false)
    section.dataset.renderer = 'lost'
    env.handle()?.lost()
  }
  const onRestore = () => {
    if (disposed) return
    preparing = setup().finally(() => { preparing = null })
  }
  surface.addEventListener('webglcontextlost', onLoss)
  surface.addEventListener('webglcontextrestored', onRestore)

  return {
    prepare, draw, release, resize,
    capture(p, type = 'image/webp', quality = 0.8) {
      if (!prepared) return null
      render(p, 0, 0)
      return surface.toDataURL(type, quality)
    },
    ready: () => prepared && loaded[0] && loaded[1],
    dispose() {
      disposed = true
      offSettle(); observer.disconnect()
      surface.removeEventListener('webglcontextlost', onLoss)
      surface.removeEventListener('webglcontextrestored', onRestore)
      freeAll()
    },
  }
}
