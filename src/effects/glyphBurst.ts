/**
 * Equation-glyph particle burst for the black hole chapter (§5.10).
 * fire() launches pooled Canvas 2D particles — real equation fragments set in
 * JetBrains Mono (softmax, cross-entropy, the Bellman update, the CFR regret
 * update, the Nash condition, a gradient step) — out of the hole: fast start,
 * power4-out deceleration, slight spin, fading near the screen edges.
 * The rAF loop runs only while glyphs are alive, stops itself afterwards and
 * pauses on document.hidden, so the layer costs nothing outside the burst.
 * DPR capped at 2 for 2D canvas per the contract (§7).
 */

const MAX_GLYPHS = 500
const DPR_CAP = 2

/** Full equations — written as unicode math strings. */
const EQUATIONS = [
  'softmax(z)ᵢ = exp(zᵢ) / Σⱼ exp(zⱼ)',
  'H(p,q) = −Σₓ p(x) log q(x)',
  'L = −Σᵢ yᵢ log ŷᵢ',
  'Q(s,a) ← r + γ·max Q(s′,a′)',
  'V(s) ← maxₐ Σ p(s′|s,a)[r + γV(s′)]',
  'Rᵀ(a) = Σₜ vᵗ(a) − vᵗ(σᵗ)',
  'σᵀ⁺¹(a) = R₊ᵀ(a) / Σ R₊ᵀ(b)',
  'uᵢ(σ*) ≥ uᵢ(σᵢ, σ*₋ᵢ) ∀i',
  'θ ← θ − η ∇L(θ)',
]

/** Shorter fragments so the cloud has texture at every size. */
const FRAGMENTS = [
  'γ ∈ [0,1)',
  'argmaxₐ Q(s,a)',
  'π*(s)',
  'E[Gₜ | sₜ = s]',
  'KL(p ∥ q)',
  '∂L/∂θ',
  'δ = r + γV(s′) − V(s)',
  'π(a|s)',
  'Rᵀ/T → 0',
  'exp(zᵢ)',
  'O(1/√T)',
  'ε-Nash',
  'v(σ)',
  'log π(a|s)',
  'Σ γᵗ rₜ',
  '∇θ L',
  'p(s′|s,a)',
  'regret₊',
  'η = 3e-4',
]

interface Glyph {
  active: boolean
  text: string
  font: string
  color: string
  baseAlpha: number
  x0: number
  y0: number
  angle: number
  dist: number
  rot0: number
  spin: number
  delay: number
  life: number
  age: number
}

export interface GlyphBurst {
  /** Resize the layer (CSS pixels). No-op if nothing changed. */
  setSize(width: number, height: number): void
  /** Launch `count` glyphs out of (x, y) in CSS pixels, tinted from `colors`. */
  fire(x: number, y: number, count: number, colors: string[]): void
  /** Kill every particle and clear the canvas (used when the burst re-arms). */
  stop(): void
  destroy(): void
}

const easeOutQuart = (t: number) => 1 - (1 - t) ** 4
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3
const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)]

export function createGlyphBurst(canvas: HTMLCanvasElement): GlyphBurst {
  const ctx = canvas.getContext('2d')
  const pool: Glyph[] = Array.from({ length: MAX_GLYPHS }, () => ({
    active: false,
    text: '',
    font: '',
    color: '#fff',
    baseAlpha: 1,
    x0: 0,
    y0: 0,
    angle: 0,
    dist: 0,
    rot0: 0,
    spin: 0,
    delay: 0,
    life: 1,
    age: 0,
  }))

  let w = 0
  let h = 0
  let dpr = 1
  let alive = 0
  let rafId = 0
  let running = false
  let lastT = 0

  // Warm the mono face so the first burst doesn't rasterize in a fallback font.
  if ('fonts' in document) void document.fonts.load('600 20px "JetBrains Mono"')

  const clear = () => {
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  const frame = (now: number) => {
    if (!ctx) return
    const dt = Math.min(0.05, (now - lastT) / 1000)
    lastT = now
    clear()
    const edgeBand = Math.min(w, h) * 0.16

    for (const g of pool) {
      if (!g.active) continue
      g.age += dt
      const t = (g.age - g.delay) / g.life
      if (t >= 1) {
        g.active = false
        alive--
        continue
      }
      if (t <= 0) continue

      const d = g.dist * easeOutQuart(t)
      const x = g.x0 + Math.cos(g.angle) * d
      const y = g.y0 + Math.sin(g.angle) * d
      const edge = Math.min(x, y, w - x, h - y)
      if (edge < -60) {
        g.active = false
        alive--
        continue
      }
      const edgeFade = Math.max(0, Math.min(1, edge / edgeBand))
      const a = g.baseAlpha * Math.min(1, t / 0.07) * (1 - t * t) * edgeFade
      if (a <= 0.012) continue

      const rot = g.rot0 + g.spin * easeOutCubic(t)
      const c = Math.cos(rot)
      const s = Math.sin(rot)
      ctx.setTransform(dpr * c, dpr * s, -dpr * s, dpr * c, x * dpr, y * dpr)
      ctx.globalAlpha = a
      ctx.font = g.font
      ctx.fillStyle = g.color
      ctx.fillText(g.text, 0, 0)
    }

    ctx.globalAlpha = 1
    if (alive > 0) {
      rafId = requestAnimationFrame(frame)
    } else {
      running = false
      clear()
    }
  }

  const start = () => {
    if (running || !ctx) return
    running = true
    lastT = performance.now()
    rafId = requestAnimationFrame(frame)
  }

  const onVisibility = () => {
    if (document.hidden) {
      if (running) {
        cancelAnimationFrame(rafId)
        running = false
      }
    } else if (alive > 0) {
      start()
    }
  }
  document.addEventListener('visibilitychange', onVisibility)

  return {
    setSize(width, height) {
      const nextDpr = Math.min(window.devicePixelRatio || 1, DPR_CAP)
      if (width === w && height === h && nextDpr === dpr) return
      w = width
      h = height
      dpr = nextDpr
      canvas.width = Math.max(1, Math.round(w * dpr))
      canvas.height = Math.max(1, Math.round(h * dpr))
      if (ctx) {
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
      }
    },

    fire(x, y, count, colors) {
      if (!ctx || colors.length === 0) return
      const reach = Math.hypot(w, h)
      let launched = 0
      for (const g of pool) {
        if (launched >= count) break
        if (g.active) continue
        const full = Math.random() < 0.4
        g.text = full ? pick(EQUATIONS) : pick(FRAGMENTS)
        const px = Math.round(g.text.length > 16 ? rand(12, 18) : rand(15, 28))
        g.font = `${Math.random() < 0.5 ? 500 : 600} ${px}px "JetBrains Mono", ui-monospace, monospace`
        g.color = pick(colors)
        g.baseAlpha = rand(0.55, 0.95)
        g.angle = rand(0, Math.PI * 2)
        const r0 = rand(0, 26)
        g.x0 = x + Math.cos(g.angle) * r0
        g.y0 = y + Math.sin(g.angle) * r0
        g.dist = reach * rand(0.2, 0.62)
        g.rot0 = rand(-0.35, 0.35)
        g.spin = rand(-1, 1)
        g.delay = rand(0, 0.35)
        g.life = rand(0.7, 1.3)
        g.age = 0
        g.active = true
        alive++
        launched++
      }
      if (!document.hidden) start()
    },

    stop() {
      for (const g of pool) g.active = false
      alive = 0
      if (running) {
        cancelAnimationFrame(rafId)
        running = false
      }
      clear()
    },

    destroy() {
      this.stop()
      document.removeEventListener('visibilitychange', onVisibility)
    },
  }
}
