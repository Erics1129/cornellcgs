/** film/bind.ts — uploads a Grade to the uniforms declared by filmChunk(). Locations are cached per program. */
import type { Grade } from './grades'

type GL = WebGLRenderingContext | WebGL2RenderingContext

export type FilmBinder = (grade: Grade, seed?: number) => void

export function bindFilm(gl: GL, program: WebGLProgram): FilmBinder {
  const u = (name: string) => gl.getUniformLocation(program, name)
  const exposure = u('u_fExposure')
  const slope = u('u_fSlope')
  const offset = u('u_fOffset')
  const power = u('u_fPower')
  const sat = u('u_fSat')
  const tone = u('u_fTone')
  const seedLoc = u('u_fSeed')
  let last: Grade | null = null
  let lastSeed = NaN
  /** The program must be current (gl.useProgram) when this is called. */
  return (grade, seed = 0) => {
    if (grade !== last) {
      last = grade
      gl.uniform1f(exposure, grade.exposure)
      gl.uniform3fv(slope, grade.slope)
      gl.uniform3fv(offset, grade.offset)
      gl.uniform3fv(power, grade.power)
      gl.uniform1f(sat, grade.sat)
      gl.uniform1f(tone, grade.tone)
    }
    if (seed !== lastSeed) {
      lastSeed = seed
      gl.uniform1f(seedLoc, seed)
    }
  }
}
