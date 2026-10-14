/**
 * Ink Maze: drawing. Reads engine states, never changes them.
 *
 * A wooden toy on a table: the table, the board's rim, maple floor blocks,
 * walnut wall blocks standing proud, blue ink soaking into the wood, and a
 * glass marble. Images come from assets.ts; anything missing is drawn with
 * plain colors. Animation runs only while something moves, then the canvas
 * holds still.
 *
 * It is one of the two board views (see view.ts): it reports the ball
 * entering each block ('cell'), its speed ('roll'), the knock when a roll
 * ends at a wall or the edge ('impact') and the moment it rests ('settled'),
 * all on the same clock it draws with.
 */
import { FLOOR, toXY } from './engine.ts'
import type { Direction, MoveResult, State } from './engine.ts'
import { COLORS } from './assets.ts'
import type { Art } from './assets.ts'
import type { InkMazeView, ViewEvent } from './view.ts'

/** Proportions, in block widths */
const RIM = 0.46
const MARGIN = 0.55
/** ms per block rolled, plus a fixed lead-in; the whole roll is capped */
const MS_PER_BLOCK = 58
const MS_BASE = 90
const MS_MAX = 720
/** how long ink takes to soak a block after the ball reaches it */
const SPREAD_MS = 260
const DROPLET_MS = 640
/** a knock against an adjacent wall: how long, and how far the ball moves (blocks) */
const BUMP_MS = 190
const BUMP_REACH = 0.12
/** 'roll' events go out about 15 times a second */
const ROLL_EVENT_MS = 66
/** ball speed (blocks per second) reported as 'roll' speed 1 */
const ROLL_FULL_SPEED = 24

const BUMP_STEP: Record<Direction, readonly [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }

type Droplet = { x: number; y: number; vx: number; vy: number; r: number; born: number; life: number }

const easeRoll = (t: number) => 1 - Math.pow(1 - t, 2.4)
/** d(easeRoll)/dt */
const easeRollSpeed = (t: number) => 2.4 * Math.pow(1 - t, 1.4)
const easeSoak = (t: number) => 1 - Math.pow(1 - t, 3)

/** A tiny deterministic hash, so each block's ink edge has its own wobble. */
const wobble = (cell: number, k: number) => {
  const x = Math.sin(cell * 12.9898 + k * 78.233) * 43758.5453
  return x - Math.floor(x)
}

/** Board size in block units, including rim and table margin: for the canvas's aspect ratio. */
export function boardAspect(width: number, height: number): number {
  const pad = 2 * (RIM + MARGIN)
  return (width + pad) / (height + pad)
}

type Roll = {
  from: [number, number]
  path: number[]
  start: number
  duration: number
  done: () => void
  /** path blocks the ball's centre has entered so far */
  reached: number
  /** what stops the ball: a wall block, the board's edge, or nothing (the ink ran out) */
  stop: 'wall' | 'rim' | null
  lastSpeedAt: number
}

export class InkMazeRenderer implements InkMazeView {
  onEvent: ((event: ViewEvent) => void) | null = null
  private ctx: CanvasRenderingContext2D
  private art: Art = {}
  private state: State | null = null
  /** what has visibly been inked: cell → the time its soak began (0 = long ago) */
  private soakedAt = new Map<number, number>()
  private droplets: Droplet[] = []
  private ball = { x: 0, y: 0 } // in block units, centre of the ball
  private squashAt = -1
  private bumpAt = -1
  private bumpStep: readonly [number, number] = [0, 0]
  private roll: Roll | null = null
  private raf = 0
  private cssW = 0
  private cssH = 0
  private unit = 0
  private ox = 0
  private oy = 0
  private patterns: Partial<Record<'table' | 'rim', CanvasPattern>> = {}
  private reduced: boolean
  /** how fast rolls play (1 = normal); the coding level's playback sets it */
  private speed = 1
  /** false while another view has the board: no drawing, no animation frames */
  private active = true
  private resizeObserver: ResizeObserver

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas)
  }

  setArt(art: Art) {
    this.art = art
    this.patterns = {}
    if (this.active) this.draw(performance.now())
  }

  setReducedMotion(reduced: boolean) {
    this.reduced = reduced
  }

  /**
   * Playback speed for later rolls: 2 plays them twice as fast. Only the
   * timing changes; the coding level uses it for replays (the game never does).
   */
  setSpeed(speed: number) {
    this.speed = Number.isFinite(speed) && speed > 0 ? Math.min(16, Math.max(0.25, speed)) : 1
  }

  /**
   * Pauses or resumes drawing, for when another view covers this one. While
   * paused it still keeps the state it is given, so it can take over again.
   */
  setActive(active: boolean) {
    if (active === this.active) return
    this.active = active
    if (!active) {
      cancelAnimationFrame(this.raf)
      this.raf = 0
    } else {
      this.resize()
      if (this.roll || this.droplets.length) this.loop()
    }
  }

  /** The ball knocks the wall next to it and comes back; nothing else changes. */
  bump(direction: Direction) {
    if (this.reduced || this.roll || !this.state) return
    this.bumpAt = performance.now()
    this.bumpStep = BUMP_STEP[direction]
    this.loop()
  }

  /** Show a state at rest (a new level, undo, restart): no animation. */
  show(state: State) {
    this.cancelRoll()
    this.state = state
    this.soakedAt.clear()
    for (let i = 0; i < state.colored.length; i++) if (state.colored[i] === '1') this.soakedAt.set(i, 0)
    this.droplets = []
    this.bumpAt = -1
    const [x, y] = toXY(state, state.ball)
    this.ball = { x, y }
    this.resize()
  }

  /**
   * Animate a move from the state on screen to `result.state`. `done` runs
   * when the ball has stopped (straight away with reduced motion).
   */
  animate(result: MoveResult, done: () => void) {
    this.cancelRoll()
    const from = this.state
    if (!from || !result.path.length) { done(); return }
    this.state = result.state
    this.bumpAt = -1
    const stop = stopSurface(from, result)
    if (this.reduced || !this.active) {
      // no animation (or nobody watching): land at once
      for (const cell of result.path) this.soakedAt.set(cell, 0)
      const [x, y] = toXY(result.state, result.state.ball)
      this.ball = { x, y }
      this.draw(performance.now())
      if (stop) this.emit({ type: 'impact', strength: impactStrength(result.path.length), surface: stop })
      this.emit({ type: 'settled' })
      done()
      return
    }
    const start = performance.now()
    const duration = Math.min(MS_MAX, MS_BASE + MS_PER_BLOCK * result.path.length) / this.speed
    this.roll = { from: toXY(from, from.ball), path: result.path, start, duration, done, reached: 0, stop, lastSpeedAt: -Infinity }
    this.loop()
  }

  /** Finish any roll in progress immediately (its `done` still runs). */
  finish() {
    if (!this.roll || !this.state) return
    const { path, done } = this.roll
    this.roll = null
    for (const cell of path) if (!this.soakedAt.has(cell) || this.soakedAt.get(cell)! > performance.now()) this.soakedAt.set(cell, 0)
    const [x, y] = toXY(this.state, this.state.ball)
    this.ball = { x, y }
    this.draw(performance.now())
    // cut short: the ball is simply there, with no knock
    this.emit({ type: 'settled' })
    done()
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    this.resizeObserver.disconnect()
    this.roll = null
    this.onEvent = null
  }

  /** A listener that throws must not stop the ball: report it, carry on. */
  private emit(event: ViewEvent) {
    const listener = this.onEvent
    if (!listener) return
    try {
      listener(event)
    } catch (error) {
      setTimeout(() => { throw error })
    }
  }

  private cancelRoll() {
    if (this.roll) this.finish()
  }

  private resize() {
    if (!this.active) return
    const rect = this.canvas.getBoundingClientRect()
    if (!rect.width || !rect.height || !this.state) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.cssW = rect.width
    this.cssH = rect.height
    const w = Math.round(rect.width * dpr)
    const h = Math.round(rect.height * dpr)
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
      this.patterns = {}
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const pad = 2 * (RIM + MARGIN)
    this.unit = Math.min(rect.width / (this.state.width + pad), rect.height / (this.state.height + pad))
    this.ox = (rect.width - this.state.width * this.unit) / 2
    this.oy = (rect.height - this.state.height * this.unit) / 2
    this.draw(performance.now())
  }

  private loop = () => {
    cancelAnimationFrame(this.raf)
    if (!this.active) { this.raf = 0; return }
    const tick = (now: number) => {
      const busy = this.step(now)
      this.draw(now)
      this.raf = busy ? requestAnimationFrame(tick) : 0
    }
    this.raf = requestAnimationFrame(tick)
  }

  /** Advance the animation clock; returns whether anything is still moving. */
  private step(now: number): boolean {
    let busy = false
    if (this.roll && this.state) {
      const roll = this.roll
      const { from, path, start, duration } = roll
      const t = Math.min(1, (now - start) / duration)
      const s = easeRoll(t) * path.length // blocks travelled
      const [tx, ty] = toXY(this.state, path[path.length - 1])
      const dx = Math.sign(tx - from[0])
      const dy = Math.sign(ty - from[1])
      this.ball = { x: from[0] + dx * s, y: from[1] + dy * s }
      // a block starts to soak as the ball's centre arrives on it
      path.forEach((cell, i) => {
        if (s >= i + 0.5 && !this.soakedAt.has(cell)) this.soakedAt.set(cell, now)
      })
      while (roll.reached < path.length && s >= roll.reached + 0.5) {
        roll.reached++
        this.emit({ type: 'cell', index: path[roll.reached - 1], step: roll.reached, of: path.length })
      }
      if (t < 1 && now - roll.lastSpeedAt >= ROLL_EVENT_MS) {
        roll.lastSpeedAt = now
        const blocksPerSecond = (path.length * easeRollSpeed(t)) / (duration / 1000)
        this.emit({ type: 'roll', speed: Math.min(1, blocksPerSecond / ROLL_FULL_SPEED) })
      }
      if (t >= 1 && this.roll === roll) {
        const done = roll.done
        this.roll = null
        this.squashAt = now
        this.splash(now, dx, dy)
        if (roll.stop) this.emit({ type: 'impact', strength: impactStrength(path.length), surface: roll.stop })
        this.emit({ type: 'settled' })
        done()
      }
      busy = true
    }
    if (this.bumpAt >= 0) {
      if (now - this.bumpAt < BUMP_MS) busy = true
      else this.bumpAt = -1
    }
    for (const at of this.soakedAt.values()) if (at && now - at < SPREAD_MS) busy = true
    if (this.squashAt >= 0 && now - this.squashAt < 180) busy = true
    this.droplets = this.droplets.filter((d) => now - d.born < d.life)
    if (this.droplets.length) busy = true
    return busy
  }

  /** A few drops flick off where the ball stops, mostly onward. */
  private splash(now: number, dx: number, dy: number) {
    const count = 5 + Math.floor(Math.random() * 3)
    const heading = Math.atan2(dy, dx)
    for (let i = 0; i < count; i++) {
      const angle = heading + (Math.random() - 0.5) * 2.4
      const speed = 1.1 + Math.random() * 1.6 // blocks per second
      this.droplets.push({
        x: this.ball.x + 0.5 + Math.cos(angle) * 0.22,
        y: this.ball.y + 0.5 + Math.sin(angle) * 0.22,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 0.035 + Math.random() * 0.045,
        born: now,
        life: DROPLET_MS * (0.7 + Math.random() * 0.5),
      })
    }
  }

  // ---------------------------------------------------------------- drawing

  private px(bx: number) { return this.ox + bx * this.unit }
  private py(by: number) { return this.oy + by * this.unit }

  private pattern(name: 'table' | 'rim', scale: number): CanvasPattern | null {
    const image = this.art[name]
    if (!image) return null
    let pattern = this.patterns[name]
    if (!pattern) {
      pattern = this.ctx.createPattern(image, 'repeat') ?? undefined
      if (!pattern) return null
      this.patterns[name] = pattern
    }
    pattern.setTransform(new DOMMatrix().scale(scale / image.naturalWidth))
    return pattern
  }

  private draw(now: number) {
    const ctx = this.ctx
    const state = this.state
    if (!state || !this.unit) return
    const u = this.unit
    const W = state.width * u
    const H = state.height * u
    const rim = RIM * u

    // the table
    ctx.clearRect(0, 0, this.cssW, this.cssH)
    const table = this.pattern('table', u * 3.2)
    ctx.fillStyle = table ?? COLORS.table
    ctx.fillRect(0, 0, this.cssW, this.cssH)
    if (!table) {
      ctx.fillStyle = COLORS.tableGrain
      for (let y = 0; y < this.cssH; y += u * 0.36) ctx.fillRect(0, y, this.cssW, Math.max(1, u * 0.04))
    }

    // the board's shadow on the table, then the rim
    const bx = this.ox - rim
    const by = this.oy - rim
    const bw = W + rim * 2
    const bh = H + rim * 2
    const radius = rim * 0.55
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.55)'
    ctx.shadowBlur = u * 0.6
    ctx.shadowOffsetY = u * 0.18
    roundRect(ctx, bx, by, bw, bh, radius)
    ctx.fillStyle = this.pattern('rim', u * 1.4) ?? COLORS.rim
    ctx.fill()
    ctx.restore()
    // bevel: light on the top-left edge, shade on the bottom-right
    ctx.save()
    roundRect(ctx, bx, by, bw, bh, radius)
    ctx.clip()
    const bevel = ctx.createLinearGradient(bx, by, bx + bw, by + bh)
    bevel.addColorStop(0, 'rgba(255,240,210,0.28)')
    bevel.addColorStop(0.5, 'rgba(255,255,255,0)')
    bevel.addColorStop(1, 'rgba(40,20,5,0.3)')
    ctx.fillStyle = bevel
    ctx.fillRect(bx, by, bw, bh)
    ctx.restore()
    // the well the blocks sit in
    ctx.fillStyle = 'rgba(40,22,8,0.55)'
    ctx.fillRect(this.ox - u * 0.04, this.oy - u * 0.04, W + u * 0.08, H + u * 0.08)

    // floor blocks, with ink soaking into them
    const gap = Math.max(1, u * 0.035)
    for (let i = 0; i < state.cells.length; i++) {
      if (state.cells[i] !== FLOOR) continue
      const [cx, cy] = toXY(state, i)
      const x = this.px(cx) + gap / 2
      const y = this.py(cy) + gap / 2
      const s = u - gap
      this.drawFloor(x, y, s)
      const soaked = this.soakedAt.get(i)
      if (soaked !== undefined) {
        const t = soaked === 0 ? 1 : Math.min(1, Math.max(0, (now - soaked) / SPREAD_MS))
        if (t > 0) this.drawInk(i, x, y, s, easeSoak(t))
      }
    }

    // droplets settle on the wood and fade; the rim hides any that fly off
    ctx.save()
    ctx.beginPath()
    ctx.rect(this.ox, this.oy, W, H)
    ctx.clip()
    for (const d of this.droplets) {
      const age = (now - d.born) / 1000
      const k = 4.2 // friction: drops slow to a stop
      const travel = (1 - Math.exp(-k * age)) / k
      const x = d.x + d.vx * travel
      const y = d.y + d.vy * travel
      const life = (now - d.born) / d.life
      const alpha = life < 0.6 ? 1 : Math.max(0, 1 - (life - 0.6) / 0.4)
      ctx.globalAlpha = alpha * 0.9
      ctx.fillStyle = COLORS.inkDeep
      ctx.beginPath()
      ctx.arc(this.px(x), this.py(y), d.r * u * (1 - life * 0.25), 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }
    ctx.restore()

    // walls stand proud: shadow first, then the block
    for (let i = 0; i < state.cells.length; i++) {
      if (state.cells[i] === FLOOR) continue
      const [cx, cy] = toXY(state, i)
      const x = this.px(cx) + gap / 2
      const y = this.py(cy) + gap / 2
      const s = u - gap
      ctx.fillStyle = 'rgba(30,14,4,0.38)'
      ctx.fillRect(x + u * 0.07, y + u * 0.09, s, s)
      this.drawWall(x, y, s)
    }

    this.drawBall(now)
  }

  private drawFloor(x: number, y: number, s: number) {
    const ctx = this.ctx
    const image = this.art.floor
    if (image) ctx.drawImage(image, x, y, s, s)
    else {
      ctx.fillStyle = COLORS.floor
      ctx.fillRect(x, y, s, s)
      ctx.fillStyle = COLORS.floorLine
      ctx.fillRect(x, y + s * 0.62, s, Math.max(1, s * 0.02))
    }
    // a soft inner edge so each block reads as its own piece of wood
    ctx.strokeStyle = 'rgba(90,55,20,0.22)'
    ctx.lineWidth = Math.max(1, s * 0.02)
    ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1)
  }

  private drawInk(cell: number, x: number, y: number, s: number, t: number) {
    const ctx = this.ctx
    ctx.save()
    ctx.beginPath()
    ctx.rect(x, y, s, s)
    ctx.clip()
    if (t < 1) {
      // a wobbly blot growing from the block's centre
      const r = s * 0.78 * t
      const cx = x + s / 2
      const cy = y + s / 2
      ctx.beginPath()
      const points = 14
      for (let k = 0; k <= points; k++) {
        const a = (k / points) * Math.PI * 2
        const rr = r * (0.88 + 0.24 * wobble(cell, k % points))
        const px = cx + Math.cos(a) * rr
        const py = cy + Math.sin(a) * rr
        if (k === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.clip()
    }
    const image = this.art.ink
    if (image) ctx.drawImage(image, x, y, s, s)
    else {
      ctx.fillStyle = COLORS.ink
      ctx.fillRect(x, y, s, s)
    }
    // the grain still shows a little through the stain
    ctx.fillStyle = 'rgba(10,30,110,0.12)'
    ctx.fillRect(x, y + s * 0.82, s, s * 0.18)
    ctx.restore()
    ctx.strokeStyle = 'rgba(8,20,80,0.35)'
    ctx.lineWidth = Math.max(1, s * 0.02)
    ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1)
  }

  private drawWall(x: number, y: number, s: number) {
    const ctx = this.ctx
    const image = this.art.wall
    if (image) {
      ctx.drawImage(image, x, y, s, s)
      return
    }
    ctx.fillStyle = COLORS.wall
    ctx.fillRect(x, y, s, s)
    const bevel = s * 0.12
    ctx.fillStyle = COLORS.wallTop
    ctx.fillRect(x, y, s, bevel)
    ctx.fillRect(x, y, bevel, s)
    ctx.fillStyle = COLORS.wallShade
    ctx.fillRect(x, y + s - bevel, s, bevel)
    ctx.fillRect(x + s - bevel, y, bevel, s)
  }

  private drawBall(now: number) {
    const ctx = this.ctx
    const u = this.unit
    // a knock: quickly out toward the wall, then back
    let nudge = 0
    if (this.bumpAt >= 0) {
      const t = Math.min(1, Math.max(0, (now - this.bumpAt) / BUMP_MS))
      nudge = Math.sin(Math.PI * Math.pow(t, 0.6)) * BUMP_REACH
    }
    const cx = this.px(this.ball.x + 0.5 + this.bumpStep[0] * nudge)
    const cy = this.py(this.ball.y + 0.5 + this.bumpStep[1] * nudge)
    const r = u * 0.36
    // a little squash as it stops
    let sx = 1
    let sy = 1
    if (this.squashAt >= 0) {
      const t = (now - this.squashAt) / 180
      if (t < 1) {
        const k = Math.sin(t * Math.PI) * 0.08
        sx = 1 + k
        sy = 1 - k
      }
    }
    ctx.save()
    // shadow on the wood
    ctx.fillStyle = 'rgba(10,8,30,0.35)'
    ctx.beginPath()
    ctx.ellipse(cx + r * 0.18, cy + r * 0.32, r * 0.95, r * 0.7, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.translate(cx, cy)
    ctx.scale(sx, sy)
    const image = this.art.ball
    if (image) ctx.drawImage(image, -r, -r, r * 2, r * 2)
    else {
      const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r)
      g.addColorStop(0, COLORS.ballShine)
      g.addColorStop(0.35, COLORS.ball)
      g.addColorStop(1, COLORS.ballShade)
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
}

/**
 * What a roll ends against: a wall block, the board's edge ('rim'), or
 * nothing when the ink ran out with open floor still ahead.
 */
function stopSurface(from: State, result: MoveResult): 'wall' | 'rim' | null {
  const { path, state } = result
  const [fx, fy] = toXY(from, from.ball)
  const [ax, ay] = toXY(state, path[0])
  const [lx, ly] = toXY(state, path[path.length - 1])
  const nx = lx + Math.sign(ax - fx)
  const ny = ly + Math.sign(ay - fy)
  if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) return 'rim'
  return state.cells[ny * state.width + nx] === FLOOR ? null : 'wall'
}

/** Longer rolls arrive harder: 1 block is a tap, 8 or more a full knock. */
const impactStrength = (blocks: number) => Math.min(1, 0.25 + (0.75 * Math.min(blocks, 8)) / 8)

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
