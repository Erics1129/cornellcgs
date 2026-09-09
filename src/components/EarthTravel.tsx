import { useEffect, useRef } from 'react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { EARTH_PLACES, earthFrame, earthPhotoPose, smooth } from '../lib/earthJourney'
import { TRAVEL_FRAGMENT, TRAVEL_VERTEX } from '../effects/earthTravelShader'

/** A two-photo compositor. The semantic photographs remain underneath for
 * reduced motion, image/network errors and browsers without WebGL. */
export default function EarthTravel() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current, section = canvas?.closest<HTMLElement>('section')
    if (!canvas || !section) return
    const reduce = matchMedia('(prefers-reduced-motion: reduce)')
    let destroy: (() => void) | undefined
    const setup = () => {
      destroy?.(); destroy = undefined
      if (reduce.matches) return
      const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, powerPreference: 'low-power' })
      if (!gl) return
      let alive = true, near = false, frame = 0, last = 0, progress = 0, velocity = 0, loaded = 0
      let program: WebGLProgram | null = null, buffer: WebGLBuffer | null = null
      const textures: (WebGLTexture | null)[] = [], images: HTMLImageElement[] = []
      const uniforms: Record<string, WebGLUniformLocation | null> = {}
      function compile(type: number, source: string) {
        const shader = gl!.createShader(type)!
        gl!.shaderSource(shader, source); gl!.compileShader(shader)
        if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) { gl!.deleteShader(shader); return null }
        return shader
      }
      function init() {
        const vert = compile(gl!.VERTEX_SHADER, TRAVEL_VERTEX), frag = compile(gl!.FRAGMENT_SHADER, TRAVEL_FRAGMENT)
        if (!vert || !frag) { if (vert) gl!.deleteShader(vert); if (frag) gl!.deleteShader(frag); return false }
        program = gl!.createProgram()!
        gl!.attachShader(program, vert); gl!.attachShader(program, frag); gl!.linkProgram(program)
        gl!.deleteShader(vert); gl!.deleteShader(frag)
        if (!gl!.getProgramParameter(program, gl!.LINK_STATUS)) return false
        buffer = gl!.createBuffer(); gl!.bindBuffer(gl!.ARRAY_BUFFER, buffer)
        gl!.bufferData(gl!.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl!.STATIC_DRAW)
        gl!.useProgram(program)
        const a = gl!.getAttribLocation(program, 'a_position')
        gl!.enableVertexAttribArray(a); gl!.vertexAttribPointer(a, 2, gl!.FLOAT, false, 0, 0)
        for (const key of ['size','fromSize','toSize','fromAnchor','toAnchor','fromTint','toTint','scale','pan','sat','mix','blur','from','to']) {
          uniforms[key] = gl!.getUniformLocation(program, `u_${key}`)
        }
        return true
      }
      const valid = init()
      function stop() { cancelAnimationFrame(frame); frame = 0; last = 0 }
      function request() {
        if (alive && valid && near && loaded === EARTH_PLACES.length && !document.hidden && !gl!.isContextLost() && !frame) frame = requestAnimationFrame(draw)
      }
      function resize() {
        const box = canvas!.getBoundingClientRect(), cap = matchMedia('(pointer: coarse)').matches ? 1000 : 1600
        const dpr = Math.min(devicePixelRatio, 1.4, cap / Math.max(1, box.width))
        canvas!.width = Math.max(1, Math.round(box.width * dpr)); canvas!.height = Math.max(1, Math.round(box.height * dpr))
        request()
      }
      function draw(now: number) {
        frame = 0
        if (!alive || !near || document.hidden || gl!.isContextLost()) return
        const dt = Math.min(.04, Math.max(.001, (now - (last || now - 16)) / 1000)); last = now
        velocity *= Math.exp(-dt * 13)
        if (velocity < .002) velocity = 0
        const scene = earthFrame(progress), a = EARTH_PLACES[scene.from], b = EARTH_PLACES[scene.to]
        const from = earthPhotoPose(scene.from, progress), to = earthPhotoPose(scene.to, progress)
        gl!.viewport(0, 0, canvas!.width, canvas!.height); gl!.useProgram(program)
        gl!.activeTexture(gl!.TEXTURE0); gl!.bindTexture(gl!.TEXTURE_2D, textures[scene.from]); gl!.uniform1i(uniforms.from, 0)
        gl!.activeTexture(gl!.TEXTURE1); gl!.bindTexture(gl!.TEXTURE_2D, textures[scene.to]); gl!.uniform1i(uniforms.to, 1)
        gl!.uniform2f(uniforms.size, canvas!.width, canvas!.height)
        gl!.uniform2f(uniforms.fromSize, a.width, a.height); gl!.uniform2f(uniforms.toSize, b.width, b.height)
        gl!.uniform2fv(uniforms.fromAnchor, a.anchor); gl!.uniform2fv(uniforms.toAnchor, b.anchor)
        gl!.uniform3fv(uniforms.fromTint, a.tint); gl!.uniform3fv(uniforms.toTint, b.tint)
        gl!.uniform2f(uniforms.scale, from.scale, to.scale); gl!.uniform2f(uniforms.pan, from.pan, to.pan)
        gl!.uniform2f(uniforms.sat, a.saturation, b.saturation); gl!.uniform1f(uniforms.mix, scene.mix)
        const blur = Math.min(.35, velocity * .055) * (.14 + scene.envelope * .86)
        gl!.uniform1f(uniforms.blur, blur); gl!.drawArrays(gl!.TRIANGLES, 0, 6)
        canvas!.style.opacity = String(smooth((progress - .30) / .07))
        section!.dataset.earthRenderer = 'webgl2'
        if (import.meta.env.DEV) { canvas!.dataset.progress = progress.toFixed(5); canvas!.dataset.blur = blur.toFixed(5) }
        if (velocity > .002) request()
      }
      function load() {
        if (images.length || !valid) return
        for (const place of EARTH_PLACES) {
          const index = images.length, image = new Image(); images.push(image)
          image.onload = () => {
            if (!alive || gl!.isContextLost()) return
            const staging = document.createElement('canvas')
            const width = Math.min(image.naturalWidth, matchMedia('(pointer: coarse)').matches ? 1280 : 1920)
            staging.width = width; staging.height = Math.round(image.naturalHeight * width / image.naturalWidth)
            const ctx = staging.getContext('2d'); if (!ctx) return
            ctx.drawImage(image, 0, 0, staging.width, staging.height)
            const texture = gl!.createTexture(); textures[index] = texture
            gl!.bindTexture(gl!.TEXTURE_2D, texture); gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, true)
            gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGB, gl!.RGB, gl!.UNSIGNED_BYTE, staging)
            gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR)
            gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR)
            gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE)
            gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE)
            loaded++; request()
          }
          image.src = `/assets/earth-journey/${place.image}`
        }
      }
      const st = ScrollTrigger.create({ trigger: section, start: 'top top', end: 'bottom bottom',
        onUpdate(self) {
          // getVelocity is px/sec: scale by viewport rather than device DPR.
          velocity = Math.min(7, Math.abs(self.getVelocity()) / Math.max(1, innerHeight))
          progress = self.progress; request()
        },
        onRefresh(self) { progress = self.progress; velocity = 0; request() },
      })
      progress = st.progress
      const io = new IntersectionObserver(entries => {
        near = entries[0].isIntersecting
        if (near) { load(); resize(); request() } else { stop(); velocity = 0 }
      }, { rootMargin: '100% 0px' })
      io.observe(canvas)
      const ro = new ResizeObserver(resize); ro.observe(canvas)
      const onVisibility = () => { if (document.hidden) stop(); else request() }
      const onLost = (event: Event) => { event.preventDefault(); stop(); delete section.dataset.earthRenderer; canvas.style.opacity = '0' }
      const onRestored = () => setup()
      canvas.addEventListener('webglcontextlost', onLost); canvas.addEventListener('webglcontextrestored', onRestored)
      document.addEventListener('visibilitychange', onVisibility)
      destroy = () => {
        alive = false; stop(); st.kill(); io.disconnect(); ro.disconnect()
        document.removeEventListener('visibilitychange', onVisibility)
        canvas.removeEventListener('webglcontextlost', onLost); canvas.removeEventListener('webglcontextrestored', onRestored)
        images.forEach(image => { image.onload = null }); textures.forEach(texture => gl.deleteTexture(texture))
        gl.deleteBuffer(buffer); gl.deleteProgram(program)
        delete section.dataset.earthRenderer; canvas.style.opacity = '0'
      }
    }
    setup(); reduce.addEventListener('change', setup)
    return () => { reduce.removeEventListener('change', setup); destroy?.() }
  }, [])
  return <canvas ref={ref} className="earth-travel" aria-hidden="true" />
}
