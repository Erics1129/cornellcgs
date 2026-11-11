/**
 * film/program.ts — the one shader build helper. Compiles and links without
 * blocking where KHR_parallel_shader_compile exists: `ready` resolves when the
 * program has linked (true) or failed (false), so a scene's prepare() can
 * await it on idle time and a first draw never stalls on a compile.
 */
type GL = WebGLRenderingContext | WebGL2RenderingContext

export interface BuiltProgram {
  program: WebGLProgram
  /** resolves true when linked, false when compile or link failed (the program is deleted) */
  ready: Promise<boolean>
  /** synchronous check: blocks until the link finishes. Use only when a frame must be drawn now. */
  finish(): boolean
}

const COMPLETION_STATUS_KHR = 0x91b1

export function buildProgram(gl: GL, vertex: string, fragment: string, attribs: Record<string, number> = {}): BuiltProgram | null {
  const program = gl.createProgram()
  const vs = gl.createShader(gl.VERTEX_SHADER)
  const fs = gl.createShader(gl.FRAGMENT_SHADER)
  if (!program || !vs || !fs) return null
  const parallel = gl.getExtension('KHR_parallel_shader_compile')
  gl.shaderSource(vs, vertex)
  gl.shaderSource(fs, fragment)
  gl.compileShader(vs)
  gl.compileShader(fs)
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  for (const [name, index] of Object.entries(attribs)) gl.bindAttribLocation(program, index, name)
  gl.linkProgram(program)

  let result: boolean | null = null
  const finish = () => {
    if (result !== null) return result
    // The owner may have deleted the program already (unmount while it was still linking).
    if (!gl.isProgram(program)) return (result = false)
    result = !!gl.getProgramParameter(program, gl.LINK_STATUS)
    if (!result && import.meta.env.DEV && !gl.isContextLost()) {
      console.warn('[film] shader failed', gl.getProgramInfoLog(program), gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs))
    }
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    if (!result) gl.deleteProgram(program)
    return result
  }
  const ready = new Promise<boolean>((resolve) => {
    if (!parallel) return resolve(finish())
    const poll = () => {
      if (result !== null) return resolve(result)
      if (gl.isContextLost() || !gl.isProgram(program) || gl.getProgramParameter(program, COMPLETION_STATUS_KHR)) return resolve(finish())
      setTimeout(poll, 8)
    }
    poll()
  })
  return { program, ready, finish }
}
