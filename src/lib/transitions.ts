import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/**
 * Chapter transitions. Every section arrives through its own shape and leaves
 * through another, all scrubbed by scroll so scrolling back plays them in
 * reverse. Nothing here is a timed animation: the shape is a pure function of
 * where the section sits in the viewport.
 *
 * Shapes are drawn in viewport space and moved into the section's own
 * coordinates, so an iris "from the middle" opens at the middle of the screen
 * even while only the top of a tall chapter is showing. Alongside the clip,
 * the chapter's direct children drift with the shape (translate / scale /
 * rotate as individual properties, so they never fight GSAP transforms).
 *
 * When a section is fully in, its clip is removed entirely.
 * Reduced motion gets none of it.
 */

type Geo =
  | { k: 'poly'; p: number[][] }
  | { k: 'circle'; x: number; y: number; r: number }
  | { k: 'ellipse'; x: number; y: number; rx: number; ry: number }
type Shape = (t: number, w: number, h: number) => Geo
type Drift = (t: number, w: number, h: number) => { x?: number; y?: number; s?: number; r?: number }

type Spec = {
  sel: string
  in: Shape
  inDrift?: Drift
  out?: Shape
  outDrift?: Drift
  /** where the section top sits (fraction of vh) when the entrance completes */
  inEnd?: number
}

const PAD = 4
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const hyp = (w: number, h: number) => Math.hypot(w, h)

const rect = (x0: number, y0: number, x1: number, y1: number): Geo => ({
  k: 'poly',
  p: [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ],
})

/** rounded rectangle as a polygon, so it can travel through viewport space */
function rounded(x0: number, y0: number, x1: number, y1: number, r: number): Geo {
  r = Math.max(0, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2))
  const p: number[][] = []
  const corner = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= 5; i++) {
      const a = a0 + (i / 5) * (Math.PI / 2)
      p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
    }
  }
  corner(x1 - r, y0 + r, -Math.PI / 2)
  corner(x1 - r, y1 - r, 0)
  corner(x0 + r, y1 - r, Math.PI / 2)
  corner(x0 + r, y0 + r, Math.PI)
  return { k: 'poly', p }
}

/* ---------------- entrances ---------------- */

// a panel springs in from the left edge, its leading edge leaning forward
const popLeft: Shape = (t, w, h) => {
  const e = easeInOut(t)
  const x = lerp(-0.25 * w, w * 1.25, e)
  const lean = 0.22 * w * (1 - e)
  return { k: 'poly', p: [[-PAD, -PAD], [x + lean, -PAD], [x - lean, h + PAD], [-PAD, h + PAD]] }
}

// an iris that blows open from the middle of the screen
const blowMiddle: Shape = (t, w, h) => ({ k: 'circle', x: w / 2, y: h / 2, r: easeInOut(t) * hyp(w, h) * 0.52 + 2 })

// a diagonal wipe from the bottom left corner
const diagonal: Shape = (t, w, h) => {
  const d = easeInOut(t) * (w + h) * 1.02
  return { k: 'poly', p: [[-PAD, h + PAD], [-PAD, h - d], [d, h + PAD]] }
}

// a card rising into place: a rounded sheet that grows to the full screen
const cardRise: Shape = (t, w, h) => {
  const e = easeInOut(t)
  const ix = lerp(w * 0.16, -PAD, e)
  const top = lerp(h * 0.42, -PAD, e)
  return rounded(ix, top, w - ix, h + PAD + lerp(-h * 0.04, 0, e), lerp(44, 0, e))
}

// two doors pushed apart from a slit down the centre
const doors: Shape = (t, w, h) => {
  const half = easeInOut(t) * (w / 2 + PAD)
  return rect(w / 2 - half, -PAD, w / 2 + half, h + PAD)
}

// a sheared slab slides in from the right
const skewRight: Shape = (t, w, h) => {
  const e = easeInOut(t)
  const x = lerp(w * 1.2, -w * 0.25, e)
  const shear = w * 0.18 * (1 - e)
  return { k: 'poly', p: [[x + shear, -PAD], [w + PAD, -PAD], [w + PAD, h + PAD], [x - shear, h + PAD]] }
}

// an arch rising from the bottom centre
const arch: Shape = (t, w, h) => ({ k: 'circle', x: w / 2, y: h * 1.08, r: easeInOut(t) * hyp(w / 2, h * 1.08) * 1.02 + 1 })

// a fan of cards spreading open, hinged at the bottom left like a hand of cards
const fan: Shape = (t, w, h) => {
  const e = easeInOut(t)
  const cx = w * 0.08
  const cy = h * 1.05
  const R = hyp(w, h) * 1.15
  const p: number[][] = [[cx, cy]]
  const a0 = Math.PI * 1.02
  const a1 = lerp(a0, Math.PI * 2.02, e)
  const steps = 9
  for (let i = 0; i <= steps; i++) {
    const a = lerp(a0, a1, i / steps)
    // each blade of the fan reaches a little less far, like stacked cards
    const rr = R * (i % 2 ? 0.985 : 1)
    p.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr])
  }
  return { k: 'poly', p }
}

// venetian blinds: horizontal slats that each open from their middle
const blinds: Shape = (t, w, h) => {
  const n = 7
  const slat = (h + PAD * 2) / n
  const p: number[][] = []
  for (let i = 0; i < n; i++) {
    // later slats open a touch later, so they ripple down the screen
    const ti = easeInOut(clamp(t * 1.5 - (i / n) * 0.5))
    const mid = -PAD + slat * (i + 0.5)
    const half = (slat / 2 + 0.6) * ti
    p.push([-PAD, mid - half], [w + PAD, mid - half], [w + PAD, mid + half], [-PAD, mid + half], [-PAD, mid - half])
  }
  p.push([-PAD, -PAD])
  return { k: 'poly', p }
}

// a star point near the top right that zooms open, like flying into it
const starZoom: Shape = (t, w, h) => ({ k: 'circle', x: w * 0.72, y: h * 0.3, r: Math.pow(t, 2.2) * hyp(w, h) * 0.95 + 2 })

// a circle growing from the bottom left corner
const cornerBloom: Shape = (t, w, h) => ({ k: 'circle', x: 0, y: h, r: easeOut(t) * hyp(w, h) * 1.02 + 1 })

// a liquid level pouring up the screen with a moving wave on top
const pour: Shape = (t, w, h) => {
  const e = easeInOut(t)
  const level = lerp(h + h * 0.08, -h * 0.12, e)
  const amp = h * 0.035 * Math.sin(Math.PI * e) + 2
  const p: number[][] = [[-PAD, h + PAD]]
  const steps = 18
  for (let i = 0; i <= steps; i++) {
    const x = lerp(-PAD, w + PAD, i / steps)
    const y = level + Math.sin(i / steps * Math.PI * 3 + t * 9) * amp + Math.sin(i / steps * Math.PI * 7 - t * 5) * amp * 0.35
    p.push([x, y])
  }
  p.push([w + PAD, h + PAD])
  return { k: 'poly', p }
}

// a diamond (a card pip) opening from the middle
const diamond: Shape = (t, w, h) => {
  const r = easeInOut(t) * (w + h) * 0.56 + 1
  const cx = w / 2
  const cy = h / 2
  return { k: 'poly', p: [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]] }
}

// an eyelid opening: a wide ellipse whose height grows
const eyelid: Shape = (t, w, h) => {
  const e = easeInOut(t)
  return { k: 'ellipse', x: w / 2, y: h * 0.5, rx: lerp(w * 0.62, w * 0.9, e), ry: e * h * 0.95 + 1 }
}

// the edge of a deck: a sawtooth line rising from the bottom
const deckEdge: Shape = (t, w, h) => {
  const e = easeOut(t)
  const level = lerp(h + h * 0.06, -h * 0.08, e)
  const tooth = h * 0.05 * (1 - e) + 1
  const n = 14
  const p: number[][] = [[-PAD, h + PAD]]
  for (let i = 0; i <= n; i++) p.push([lerp(-PAD, w + PAD, i / n), level + (i % 2 ? tooth : -tooth)])
  p.push([w + PAD, h + PAD])
  return { k: 'poly', p }
}

/* ---------------- exits ---------------- */

// the chapter shrinks into a rounded card and is pocketed upward
const pocket: Shape = (t, w, h) => {
  const e = easeInOut(t)
  const ix = e * w * 0.12
  return rounded(ix, -PAD - e * h * 0.1, w - ix, h + PAD - e * h * 0.5, e * 40)
}

// an iris closing toward the top centre
const irisUp: Shape = (t, w, h) => {
  const e = easeInOut(t)
  return { k: 'circle', x: w / 2, y: lerp(h / 2, h * 0.1, e), r: lerp(hyp(w, h) * 0.55, 0, e) + 1 }
}

// the diagonal carries on and clears to the top right
const diagonalOut: Shape = (t, w, h) => {
  const d = easeInOut(t) * (w + h) * 1.02
  return { k: 'poly', p: [[w + PAD, -PAD], [w + PAD, h + PAD - d], [-PAD + d - h, h + PAD], [-PAD, h + PAD], [-PAD, -PAD]] }
}

// the old set switching off: a band closing onto a line
const switchOff: Shape = (t, w, h) => {
  const e = easeInOut(t)
  const half = lerp(h / 2 + PAD, 1, e)
  const ix = e > 0.7 ? ((e - 0.7) / 0.3) * w * 0.5 : 0
  return rect(ix, h * 0.35 - half * 0.7 - h * 0.15 * (1 - e), w - ix, h * 0.35 + half)
}

// a slanted cut rising from the bottom right
const slantUp: Shape = (t, w, h) => {
  const e = easeInOut(t)
  const yR = lerp(h + PAD, -h * 0.5, e)
  const yL = lerp(h + PAD, h * 0.1, e)
  return { k: 'poly', p: [[-PAD, -PAD], [w + PAD, -PAD], [w + PAD, Math.min(yR, h + PAD)], [-PAD, Math.min(yL + (h - yR) * 0.15, h + PAD)]] }
}

// sheared slab slides off to the left
const skewLeft: Shape = (t, w, h) => {
  const e = easeInOut(t)
  const x = lerp(w * 1.25, -w * 0.2, e)
  const shear = w * 0.16 * e
  return { k: 'poly', p: [[-PAD, -PAD], [x - shear, -PAD], [x + shear, h + PAD], [-PAD, h + PAD]] }
}

// the arch drops back down
const archDown: Shape = (t, w, h) => ({ k: 'circle', x: w / 2, y: lerp(-h * 0.2, -h * 1.3, easeInOut(t)), r: hyp(w, h) * 1.15 })

// cards fold away to the right, a sheet slanting shut
const foldRight: Shape = (t, w, h) => {
  const e = easeInOut(t)
  const x = lerp(w + PAD, w * 0.35, e)
  return { k: 'poly', p: [[-PAD, -PAD], [x, -PAD], [x + e * w * 0.3, h + PAD], [-PAD, h + PAD]] }
}

// the blinds tilt shut, each slat thinning toward its top
const blindsShut: Shape = (t, w, h) => {
  const n = 7
  const slat = (h + PAD * 2) / n
  const p: number[][] = []
  for (let i = 0; i < n; i++) {
    const ti = easeInOut(clamp(t * 1.5 - ((n - 1 - i) / n) * 0.5))
    const top = -PAD + slat * i
    const bot = top + (slat + 0.6) * (1 - ti)
    p.push([-PAD, top], [w + PAD, top], [w + PAD, bot], [-PAD, bot], [-PAD, top])
  }
  p.push([-PAD, -PAD])
  return { k: 'poly', p }
}

// space folds into a point at the left
const singularity: Shape = (t, w, h) => ({ k: 'circle', x: lerp(w / 2, w * 0.18, t), y: h * 0.45, r: lerp(hyp(w, h) * 0.6, 0, easeInOut(t)) + 1 })

// a drain: the level falls to the bottom right
const drain: Shape = (t, w, h) => {
  const e = easeInOut(t)
  const yL = lerp(h + PAD, -h * 0.4, e)
  return { k: 'poly', p: [[-PAD, -PAD], [w + PAD, -PAD], [w + PAD, h + PAD], [-PAD, Math.max(-PAD, yL)]] }
}

// the eye blinks shut
const blink: Shape = (t, w, h) => {
  const e = easeInOut(t)
  return { k: 'ellipse', x: w / 2, y: h * 0.42, rx: w * 0.9, ry: lerp(h * 0.95, 0, e) + 1 }
}

const SPECS: Spec[] = [
  {
    sel: '#who-we-are',
    in: popLeft,
    inDrift: (t, w) => ({ x: -(1 - easeOut(t)) * w * 0.12, r: -(1 - easeOut(t)) * 2 }),
    out: pocket,
    outDrift: (t) => ({ s: 1 - easeInOut(t) * 0.08 }),
  },
  {
    sel: '#alphago',
    in: blowMiddle,
    inDrift: (t) => ({ s: 1 + (1 - easeOut(t)) * 0.22 }),
    out: irisUp,
  },
  {
    sel: '#what-we-do',
    in: diagonal,
    inDrift: (t, w, h) => ({ x: -(1 - easeOut(t)) * w * 0.05, y: (1 - easeOut(t)) * h * 0.08 }),
    out: diagonalOut,
  },
  {
    sel: '#project',
    in: cardRise,
    inDrift: (t, _w, h) => ({ y: (1 - easeOut(t)) * h * 0.12, s: 0.9 + easeOut(t) * 0.1 }),
    out: switchOff,
  },
  {
    sel: '#stats',
    in: doors,
    inDrift: (t) => ({ s: 1.12 - easeOut(t) * 0.12 }),
    out: slantUp,
  },
  {
    sel: '#code',
    in: skewRight,
    inDrift: (t, w) => ({ x: (1 - easeOut(t)) * w * 0.14 }),
    out: skewLeft,
    outDrift: (t, w) => ({ x: -easeInOut(t) * w * 0.06 }),
  },
  {
    sel: '#ml-process',
    in: arch,
    inDrift: (t, _w, h) => ({ y: (1 - easeOut(t)) * h * 0.1 }),
    out: archDown,
  },
  {
    sel: '#events',
    in: fan,
    inDrift: (t) => ({ r: (1 - easeOut(t)) * -3 }),
    out: foldRight,
  },
  { sel: '#world', in: blinds, out: blindsShut },
  {
    sel: '#universe',
    in: starZoom,
    inDrift: (t) => ({ s: 1 + (1 - easeOut(t)) * 0.35 }),
    out: singularity,
  },
  {
    sel: '#people',
    in: cornerBloom,
    inDrift: (t, w, h) => ({ x: -(1 - easeOut(t)) * w * 0.04, y: (1 - easeOut(t)) * h * 0.06 }),
    out: drain,
  },
  { sel: '#anyone', in: pour, inDrift: (t, _w, h) => ({ y: (1 - easeOut(t)) * h * 0.05 }) },
  {
    sel: '#join',
    in: diamond,
    inDrift: (t) => ({ s: 0.92 + easeOut(t) * 0.08, r: (1 - easeOut(t)) * 1.5 }),
  },
  { sel: '#vision', in: eyelid, out: blink },
  { sel: '#contact', in: deckEdge, inEnd: 0.4 },
]

function toCss(g: Geo, dx: number, dy: number) {
  const f = (v: number) => v.toFixed(1)
  if (g.k === 'circle') return `circle(${f(g.r)}px at ${f(g.x + dx)}px ${f(g.y + dy)}px)`
  if (g.k === 'ellipse') return `ellipse(${f(g.rx)}px ${f(g.ry)}px at ${f(g.x + dx)}px ${f(g.y + dy)}px)`
  return `polygon(${g.p.map(([x, y]) => `${f(x + dx)}px ${f(y + dy)}px`).join(',')})`
}

/** the same shape as an SVG path, for the lit edge drawn over the cut */
function toPath(g: Geo) {
  const f = (v: number) => v.toFixed(1)
  if (g.k === 'circle') {
    const { x, y, r } = g
    return `M${f(x - r)} ${f(y)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`
  }
  if (g.k === 'ellipse') {
    const { x, y, rx, ry } = g
    return `M${f(x - rx)} ${f(y)}a${f(rx)} ${f(ry)} 0 1 0 ${f(2 * rx)} 0a${f(rx)} ${f(ry)} 0 1 0 ${f(-2 * rx)} 0Z`
  }
  return `M${g.p.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`
}

const SVGNS = 'http://www.w3.org/2000/svg'

type Live = {
  spec: Spec
  el: HTMLElement
  kids: HTMLElement[]
  tall: boolean[]
  last: string
  drift: string
  edge: SVGGElement
  band: SVGRectElement
  glow: SVGPathElement
  line: SVGPathElement
}

export function initTransitions(scope: ParentNode = document): () => void {
  const media = gsap.matchMedia()
  media.add('(prefers-reduced-motion: no-preference)', () => {
    const live: Live[] = []
    // one overlay draws a lit edge along every cut while it moves, so the
    // shape reads even where two chapters share the same dark
    const svg = document.createElementNS(SVGNS, 'svg')
    svg.setAttribute('class', 'tx-edges')
    svg.setAttribute('aria-hidden', 'true')
    const defs = document.createElementNS(SVGNS, 'defs')
    svg.appendChild(defs)
    document.body.appendChild(svg)
    SPECS.forEach((spec, n) => {
      const el = scope.querySelector<HTMLElement>(spec.sel)
      if (!el) return
      const kids = Array.from(el.children).filter((c): c is HTMLElement => c instanceof HTMLElement)
      const clip = document.createElementNS(SVGNS, 'clipPath')
      clip.setAttribute('id', `tx-band-${n}`)
      const band = document.createElementNS(SVGNS, 'rect')
      clip.appendChild(band)
      defs.appendChild(clip)
      const edge = document.createElementNS(SVGNS, 'g')
      edge.setAttribute('clip-path', `url(#tx-band-${n})`)
      const glow = document.createElementNS(SVGNS, 'path')
      glow.setAttribute('class', 'tx-edges__glow')
      const line = document.createElementNS(SVGNS, 'path')
      line.setAttribute('class', 'tx-edges__line')
      edge.append(glow, line)
      edge.style.opacity = '0'
      svg.appendChild(edge)
      live.push({ spec, el, kids, tall: [], last: '', drift: '', edge, band, glow, line })
    })
    const hideEdge = (l: Live) => {
      if (l.edge.style.opacity !== '0') l.edge.style.opacity = '0'
    }
    const showEdge = (l: Live, g: Geo, t: number, y0: number, y1: number, w: number) => {
      const d = toPath(g)
      l.glow.setAttribute('d', d)
      l.line.setAttribute('d', d)
      l.band.setAttribute('x', '0')
      l.band.setAttribute('y', y0.toFixed(1))
      l.band.setAttribute('width', String(w))
      l.band.setAttribute('height', Math.max(0, y1 - y0).toFixed(1))
      // brightest mid way through, gone at either end
      l.edge.style.opacity = Math.sin(Math.PI * Math.min(1, Math.max(0, t))).toFixed(3)
    }

    const measure = () => {
      const vh = window.innerHeight
      for (const l of live) l.tall = l.kids.map((k) => k.offsetHeight > vh * 1.6)
    }
    measure()

    const setDrift = (l: Live, d: ReturnType<Drift> | null, w: number) => {
      const key = d ? `${(d.x ?? 0).toFixed(1)}|${(d.y ?? 0).toFixed(1)}|${(d.s ?? 1).toFixed(4)}|${(d.r ?? 0).toFixed(2)}` : ''
      if (key === l.drift) return
      l.drift = key
      l.kids.forEach((k, i) => {
        if (!d) {
          k.style.translate = ''
          k.style.scale = ''
          k.style.rotate = ''
          return
        }
        k.style.translate = d.x || d.y ? `${(d.x ?? 0).toFixed(1)}px ${(d.y ?? 0).toFixed(1)}px` : ''
        // never scale something many screens tall, it would swing far off its centre
        k.style.scale = d.s && d.s !== 1 && !l.tall[i] ? d.s.toFixed(4) : ''
        k.style.rotate = d.r ? `${d.r.toFixed(2)}deg` : ''
      })
      void w
    }

    let raf = 0
    const update = () => {
      raf = 0
      const w = document.documentElement.clientWidth
      const h = window.innerHeight
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
      for (const l of live) {
        const own = l.el.getBoundingClientRect()
        const box = l.el.parentElement?.classList.contains('pin-spacer') ? l.el.parentElement.getBoundingClientRect() : own
        // far away from the viewport: make sure it is clean and skip the work
        if (box.top > h * 1.05 || box.bottom < -h * 0.05) {
          if (box.top > h * 1.05) {
            // waiting below: keep it shut so the entrance starts from nothing
            const css = toCss(l.spec.in(0, w, h), -own.left, -own.top)
            if (css !== l.last) {
              l.el.style.clipPath = css
              l.last = css
            }
          } else if (l.last !== 'none') {
            l.el.style.clipPath = ''
            l.last = 'none'
            setDrift(l, null, w)
          }
          hideEdge(l)
          continue
        }
        const end = l.spec.inEnd ?? 0.12
        const p = clamp((h - box.top) / (h * (1 - end)))
        const exitFrom = 0.6
        const q = l.spec.out ? clamp((h * exitFrom - box.bottom) / (h * exitFrom)) : 0
        let css = 'none'
        if (p < 1) {
          const g = l.spec.in(p, w, h)
          css = toCss(g, -own.left, -own.top)
          setDrift(l, l.spec.inDrift ? l.spec.inDrift(p, w, h) : null, w)
          showEdge(l, g, p, Math.max(0, box.top), h, w)
        } else if (q > 0 && l.spec.out) {
          const g = l.spec.out(q, w, h)
          css = toCss(g, -own.left, -own.top)
          setDrift(l, l.spec.outDrift ? l.spec.outDrift(q, w, h) : null, w)
          showEdge(l, g, q, 0, Math.min(h, box.bottom), w)
        } else {
          setDrift(l, null, w)
          hideEdge(l)
        }
        if (css !== l.last) {
          l.el.style.clipPath = css === 'none' ? '' : css
          l.last = css
        }
      }
    }
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    const onResize = () => {
      measure()
      kick()
    }

    window.addEventListener('scroll', kick, { passive: true })
    window.addEventListener('resize', onResize)
    ScrollTrigger.addEventListener('refresh', onResize)
    update()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', kick)
      window.removeEventListener('resize', onResize)
      ScrollTrigger.removeEventListener('refresh', onResize)
      for (const l of live) {
        l.el.style.clipPath = ''
        setDrift(l, null, 0)
      }
      svg.remove()
    }
  })
  return () => media.revert()
}
