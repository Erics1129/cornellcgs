/**
 * Stable fluids (Stam 1999) on a coarse grid, sized so one cell is ~15 px.
 * The code rain samples this velocity field to drift like tracers in water;
 * the pointer and the page's scroll momentum are the only forces.
 *
 * step(dt): forces (already splatted as impulses) → diffuse (Gauss-Seidel)
 * → project → advect (semi-Lagrangian, bilinear) → project → dye advect →
 * dissipation. Walls are free-slip left/right and PERIODIC top/bottom — a
 * closed box would project a uniform vertical flow straight back to zero,
 * and the scroll force needs that flow to survive (the rain wraps anyway).
 *
 * Velocities live in cells/s internally; the API speaks canvas px. Every
 * field is a Float32Array allocated once; step() and the samplers allocate
 * nothing. dt is clamped to 1/30, forces and speeds are capped and every
 * input is finite-checked, so the field can never hold a NaN. The whole
 * solve is skipped while the field is calm and nothing has been added.
 */

export interface Vec2 {
  vx: number
  vy: number
}

const MAX_DT = 1 / 30
/** cells/s — ~600 px/s at 15 px cells; the semi-Lagrangian step stays < 1 cell */
const MAX_SPEED = 40
/** cells/s below which the field counts as at rest (< 1 px/s — sub-pixel) */
const CALM = 0.05
const MIN_DIM = 8
const MAX_DIM = 256

export class Fluid {
  readonly W: number
  readonly H: number
  private readonly stride: number
  private u: Float32Array
  private v: Float32Array
  private u0: Float32Array
  private v0: Float32Array
  private d: Float32Array
  private d0: Float32Array
  private cellW = 1
  private cellH = 1
  private invCellW = 1
  private invCellH = 1
  private dirty = false
  private calm = true
  private readonly out: Vec2 = { vx: 0, vy: 0 }

  /** Stam's unit-domain viscosity; diffusion coefficient a = dt·visc·W·H */
  visc = 3e-4
  /** velocity kept per frame at 60 fps (time-scaled) */
  damping = 0.985
  /** dye kept per frame at 60 fps — brightness fades faster than motion */
  dyeDamping = 0.95
  diffuseIters = 8
  projectIters = 16

  constructor(W: number, H: number, pxW: number, pxH: number) {
    this.W = Math.max(MIN_DIM, Math.min(MAX_DIM, W | 0))
    this.H = Math.max(MIN_DIM, Math.min(MAX_DIM, H | 0))
    this.stride = this.W + 2
    const n = this.stride * (this.H + 2)
    this.u = new Float32Array(n)
    this.v = new Float32Array(n)
    this.u0 = new Float32Array(n)
    this.v0 = new Float32Array(n)
    this.d = new Float32Array(n)
    this.d0 = new Float32Array(n)
    this.setSize(pxW, pxH)
  }

  /** Re-map canvas px onto the grid (a resize that keeps the cell count). */
  setSize(pxW: number, pxH: number) {
    const cw = pxW / this.W
    const ch = pxH / this.H
    this.cellW = cw > 1e-3 && Number.isFinite(cw) ? cw : 1
    this.cellH = ch > 1e-3 && Number.isFinite(ch) ? ch : 1
    this.invCellW = 1 / this.cellW
    this.invCellH = 1 / this.cellH
  }

  clear() {
    this.u.fill(0)
    this.v.fill(0)
    this.u0.fill(0)
    this.v0.fill(0)
    this.d.fill(0)
    this.d0.fill(0)
    this.dirty = false
    this.calm = true
  }

  /** True while anything is still moving or glowing. */
  get active(): boolean {
    return this.dirty || !this.calm
  }

  /**
   * Gaussian impulse at canvas (x, y): fx, fy in px/s, radius in px, dye 0..1.
   * Added straight into the field, so summing pointer deltas is frame-rate
   * independent (impulse per px of travel).
   */
  addForce(x: number, y: number, fx: number, fy: number, radius: number, dye = 0) {
    if (
      !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(fx) ||
      !Number.isFinite(fy) || !Number.isFinite(radius) || !Number.isFinite(dye)
    ) return
    const { W, H, stride, u, v, d } = this
    const maxPx = MAX_SPEED * Math.min(this.cellW, this.cellH)
    fx = Math.max(-maxPx, Math.min(maxPx, fx))
    fy = Math.max(-maxPx, Math.min(maxPx, fy))
    const cfx = fx * this.invCellW
    const cfy = fy * this.invCellH
    const cd = Math.max(0, Math.min(1, dye))
    // cell-space centre and radius (cells are near-square; use the mean)
    const gx = x * this.invCellW + 0.5
    const gy = y * this.invCellH + 0.5
    const r = Math.max(1, radius * 0.5 * (this.invCellW + this.invCellH))
    const inv = 3 / (r * r) // weight e^-3 at the rim
    const i0 = Math.max(1, Math.floor(gx - r))
    const i1 = Math.min(W, Math.ceil(gx + r))
    // rows clip at the edges (the flow may cross the seam, a splat may not —
    // a pointer at the top must not visibly stir the bottom)
    const j0 = Math.max(1, Math.floor(gy - r))
    const j1 = Math.min(H, Math.ceil(gy + r))
    if (i1 < i0 || j1 < j0) return
    for (let j = j0; j <= j1; j++) {
      const dy = j - gy
      const rowBase = stride * j
      for (let i = i0; i <= i1; i++) {
        const dx = i - gx
        const q = (dx * dx + dy * dy) * inv
        if (q > 3) continue
        const wgt = Math.exp(-q)
        const idx = rowBase + i
        u[idx] += cfx * wgt
        v[idx] += cfy * wgt
        d[idx] += cd * wgt
      }
    }
    this.bnd(1, u)
    this.bnd(2, v)
    this.bnd(0, d)
    this.dirty = true
  }

  /** Uniform impulse over the whole field (px/s) — the page's momentum. */
  addUniform(fx: number, fy: number) {
    if (!Number.isFinite(fx) || !Number.isFinite(fy)) return
    if (fx === 0 && fy === 0) return
    const maxPx = MAX_SPEED * Math.min(this.cellW, this.cellH)
    const cfx = Math.max(-maxPx, Math.min(maxPx, fx)) * this.invCellW
    const cfy = Math.max(-maxPx, Math.min(maxPx, fy)) * this.invCellH
    const { u, v } = this
    const n = u.length
    for (let i = 0; i < n; i++) {
      u[i] += cfx
      v[i] += cfy
    }
    this.bnd(1, u)
    this.bnd(2, v)
    this.dirty = true
  }

  step(dt: number) {
    if (!(dt > 0)) return
    if (dt > MAX_DT) dt = MAX_DT
    if (!this.dirty && this.calm) return
    this.dirty = false

    // --- velocity -------------------------------------------------------
    this.swapUV()
    this.diffuseUV(dt)
    this.project()
    this.swapUV()
    this.advect(1, this.u, this.u0, this.u0, this.v0, dt)
    this.advect(2, this.v, this.v0, this.u0, this.v0, dt)
    this.project()

    // --- dye --------------------------------------------------------------
    const t = this.d
    this.d = this.d0
    this.d0 = t
    this.advect(0, this.d, this.d0, this.u, this.v, dt)

    // --- dissipation, speed cap, rest detection, NaN guard ----------------
    const { u, v, d } = this
    const k = Math.exp(Math.log(this.damping) * dt * 60)
    const kd = Math.exp(Math.log(this.dyeDamping) * dt * 60)
    const maxSq = MAX_SPEED * MAX_SPEED
    const calmSq = CALM * CALM
    let peak = 0
    let maxDye = 0
    let acc = 0
    const n = u.length
    for (let i = 0; i < n; i++) {
      let ux = u[i] * k
      let vy = v[i] * k
      const sq = ux * ux + vy * vy
      if (sq > maxSq) {
        const s = MAX_SPEED / Math.sqrt(sq)
        ux *= s
        vy *= s
      }
      u[i] = ux
      v[i] = vy
      let dd = d[i] * kd
      if (dd > 1) dd = 1
      else if (dd < 0) dd = 0
      d[i] = dd
      if (sq > peak) peak = sq
      if (dd > maxDye) maxDye = dd
      acc += sq + dd
    }
    if (!Number.isFinite(acc)) {
      this.clear() // never let a bad value live on
      return
    }
    this.calm = peak < calmSq && maxDye < 1e-3
    if (this.calm) {
      // Snap the last whisper to exact zero so sampling returns clean rest
      u.fill(0)
      v.fill(0)
      d.fill(0)
    }
  }

  /** Bilinear velocity at canvas (x, y) in px/s. Writes into `out` (reused). */
  sampleVelocity(x: number, y: number, out: Vec2 = this.out): Vec2 {
    const { W, stride, u, v } = this
    let gx = x * this.invCellW + 0.5
    if (!(gx >= 0.5)) gx = 0.5
    else if (gx > W + 0.5) gx = W + 0.5
    const gy = this.wrapY(y * this.invCellH + 0.5)
    const i0 = gx | 0
    const j0 = gy | 0
    const s1 = gx - i0
    const t1 = gy - j0
    const s0 = 1 - s1
    const t0 = 1 - t1
    const a = i0 + stride * j0
    const b = a + stride
    out.vx = ((u[a] * s0 + u[a + 1] * s1) * t0 + (u[b] * s0 + u[b + 1] * s1) * t1) * this.cellW
    out.vy = ((v[a] * s0 + v[a + 1] * s1) * t0 + (v[b] * s0 + v[b + 1] * s1) * t1) * this.cellH
    return out
  }

  /** Bilinear dye 0..1 at canvas (x, y). */
  sampleDye(x: number, y: number): number {
    const { W, stride, d } = this
    let gx = x * this.invCellW + 0.5
    if (!(gx >= 0.5)) gx = 0.5
    else if (gx > W + 0.5) gx = W + 0.5
    const gy = this.wrapY(y * this.invCellH + 0.5)
    const i0 = gx | 0
    const j0 = gy | 0
    const s1 = gx - i0
    const t1 = gy - j0
    const a = i0 + stride * j0
    const b = a + stride
    return (d[a] * (1 - s1) + d[a + 1] * s1) * (1 - t1) + (d[b] * (1 - s1) + d[b + 1] * s1) * t1
  }

  // ---------------------------------------------------------------------
  // Solver internals (Stam's lin_solve / advect / project with h = 1 cell)

  /** Map a grid y onto [0.5, H + 0.5) — the ghost rows carry the wrap. */
  private wrapY(gy: number): number {
    const H = this.H
    if (!Number.isFinite(gy)) return 0.5
    let y = gy - 0.5
    y -= H * Math.floor(y / H)
    if (y >= H) y = 0 // floor rounding at the seam
    return y + 0.5
  }

  private swapUV() {
    const tu = this.u
    this.u = this.u0
    this.u0 = tu
    const tv = this.v
    this.v = this.v0
    this.v0 = tv
  }

  /**
   * b=1: horizontal component (reflects at the side walls), b=2: vertical
   * (slips along them), b=0: scalar (copies). Top/bottom always wrap.
   */
  private bnd(b: number, x: Float32Array) {
    const { W, H, stride } = this
    const sx = b === 1 ? -1 : 1
    for (let j = 1; j <= H; j++) {
      const row = stride * j
      x[row] = sx * x[row + 1]
      x[row + W + 1] = sx * x[row + W]
    }
    const top = stride * (H + 1)
    const lastRow = stride * H
    for (let i = 0; i < stride; i++) {
      x[i] = x[lastRow + i]
      x[top + i] = x[stride + i]
    }
  }

  /** Gauss-Seidel on u and v together (same stencil, one loop). */
  private diffuseUV(dt: number) {
    const { W, H, stride, u, v, u0, v0 } = this
    const a = dt * this.visc * W * H
    if (a <= 0) {
      u.set(u0)
      v.set(v0)
      return
    }
    const invC = 1 / (1 + 4 * a)
    // seed with the source so the first sweep starts near the answer
    u.set(u0)
    v.set(v0)
    for (let k = 0; k < this.diffuseIters; k++) {
      for (let j = 1; j <= H; j++) {
        let idx = stride * j + 1
        for (let i = 1; i <= W; i++, idx++) {
          u[idx] = (u0[idx] + a * (u[idx - 1] + u[idx + 1] + u[idx - stride] + u[idx + stride])) * invC
          v[idx] = (v0[idx] + a * (v[idx - 1] + v[idx + 1] + v[idx - stride] + v[idx + stride])) * invC
        }
      }
      this.bnd(1, u)
      this.bnd(2, v)
    }
  }

  /** Semi-Lagrangian: pull each cell's value from where it came from. */
  private advect(
    b: number, dst: Float32Array, src: Float32Array,
    u: Float32Array, v: Float32Array, dt: number,
  ) {
    const { W, H, stride } = this
    const xMax = W + 0.5
    for (let j = 1; j <= H; j++) {
      let idx = stride * j + 1
      for (let i = 1; i <= W; i++, idx++) {
        let x = i - dt * u[idx]
        let y = j - dt * v[idx]
        if (x < 0.5) x = 0.5
        else if (x > xMax) x = xMax
        // wrap: same maths as wrapY, inlined for the hot loop
        y -= 0.5
        y -= H * Math.floor(y / H)
        if (y >= H) y = 0
        y += 0.5
        const i0 = x | 0
        const j0 = y | 0
        const s1 = x - i0
        const t1 = y - j0
        const s0 = 1 - s1
        const t0 = 1 - t1
        const p = i0 + stride * j0
        const q = p + stride
        dst[idx] = (src[p] * s0 + src[p + 1] * s1) * t0 + (src[q] * s0 + src[q + 1] * s1) * t1
      }
    }
    this.bnd(b, dst)
  }

  /** Make u, v divergence-free; u0/v0 are the pressure and divergence scratch. */
  private project() {
    const { W, H, stride, u, v } = this
    const p = this.u0
    const div = this.v0
    for (let j = 1; j <= H; j++) {
      let idx = stride * j + 1
      for (let i = 1; i <= W; i++, idx++) {
        div[idx] = -0.5 * (u[idx + 1] - u[idx - 1] + v[idx + stride] - v[idx - stride])
        p[idx] = 0
      }
    }
    this.bnd(0, div)
    this.bnd(0, p)
    for (let k = 0; k < this.projectIters; k++) {
      for (let j = 1; j <= H; j++) {
        let idx = stride * j + 1
        for (let i = 1; i <= W; i++, idx++) {
          p[idx] = (div[idx] + p[idx - 1] + p[idx + 1] + p[idx - stride] + p[idx + stride]) * 0.25
        }
      }
      this.bnd(0, p)
    }
    for (let j = 1; j <= H; j++) {
      let idx = stride * j + 1
      for (let i = 1; i <= W; i++, idx++) {
        u[idx] -= 0.5 * (p[idx + 1] - p[idx - 1])
        v[idx] -= 0.5 * (p[idx + stride] - p[idx - stride])
      }
    }
    this.bnd(1, u)
    this.bnd(2, v)
  }
}

/**
 * Grid for a canvas: ~15 px cells (96×54 at 1440×810), W clamped to [48, 128],
 * near-square cells, and never more than ~6000 cells — the solve is ~0.9 ms
 * there and scales linearly, so a 4K window grows its cells, not its cost.
 */
export function gridFor(pxW: number, pxH: number): { W: number; H: number } {
  const area = Math.max(1, pxW * pxH)
  const cell = Math.max(15, Math.sqrt(area / 6000))
  const W = Math.max(48, Math.min(128, Math.round(pxW / cell)))
  const cw = pxW > 0 ? pxW / W : cell
  const H = Math.max(MIN_DIM, Math.min(MAX_DIM, Math.round(pxH / cw)))
  return { W, H }
}
