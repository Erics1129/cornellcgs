/**
 * reveal.ts — latched reveals. CONTRACT FILE, owner: stream "scroll-core".
 *
 * A scrubbed reveal that stops half way leaves half a heading. So every text
 * or card reveal here is latched:
 *
 *  - The CSS default of every target is its final, visible state. The "from"
 *    state lives only inside the timeline, and only reveals that are fully
 *    below the viewport when they are created ever receive it.
 *  - While the page moves, the timeline follows its source (an element's
 *    passage through the viewport, or a slice of a chapter's progress).
 *  - When the page comes to rest (or merely calms down), every reveal in view
 *    is latched and finishes on its own in a quarter second; after a teleport
 *    it is simply complete.
 *  - It unlatches only when its trigger is fully below the viewport again.
 *
 * No ScrollTrigger is involved: positions come from the deck's cached geometry
 * and are re-read on every deck re-measure, in layout coordinates (offsetTop),
 * so a reveal's own transform never moves its trigger.
 */
import { useEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { EASE } from './eases'
import { prefersReducedMotion } from './motion'
import { CHAPTER_IDS, chapter, deckFrame, drive, filmOff, onDeck, onMeasure, onSettle, type ChapterId, type DeckFrame, type SettleReason } from './deck'

gsap.registerPlugin(ScrollTrigger)

export type RevealSource =
  /** an element in normal flow; positions as "top|center|bottom N%" (element edge meets that viewport line) */
  | { trigger: Element; start?: string; end?: string }
  /** a slice of a chapter's progress */
  | { chapter: ChapterId; key: 'enter' | 'run' | 'through'; from: number; to: number }

export interface RevealOptions {
  source: RevealSource
  /** seconds the timeline takes to follow its source; default 0.2, max 0.3 */
  smooth?: number
  id?: string
  /** elements that are intentionally hidden while the reveal has not begun: they carry data-phase="off" and inert until it has */
  phaseOff?: Element[]
  /** seconds a latched reveal takes to finish; default 0.25, max 0.45 */
  settle?: number
  /** false = a plain follower with no latch (a scrubbed scene, not text) */
  latch?: boolean
  /** re-read function-based tween values after every re-measure */
  invalidate?: boolean
  /** runs on every re-measure, before the invalidation above (measure flight origins here) */
  onMeasure?: () => void
  /** when an element trigger sits inside a sticky stage it follows this slice of its chapter's `enter` instead; default [0.2, 0.75] */
  stageRange?: [number, number]
}

interface Rec {
  id: string
  tl: gsap.core.Timeline
  opts: RevealOptions
  el: HTMLElement | null
  /** chapter whose progress is followed (chapter sources, and element triggers inside a sticky stage) */
  follow: { id: ChapterId; key: 'enter' | 'run' | 'through'; from: number; to: number } | null
  /** document px: scroll positions of progress 0 and 1, and the trigger box */
  y0: number
  y1: number
  top: number
  bottom: number
  target: number
  latched: boolean
  shown: number
  tween: gsap.core.Tween | null
  off: boolean | null
}

const STAGE_SELECTOR = '[data-stage], .scene-stage, .universe-viewport, .soda-stage'
const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const records = new Set<Rec>()
let wired = false
let serial = 0
let calmSince = 0
let calmDone = false

function edge(spec: string | undefined, fallback: string): { at: number; line: number } {
  const [name, pct] = (spec ?? fallback).trim().split(/\s+/)
  return { at: name === 'bottom' ? 1 : name === 'center' ? 0.5 : 0, line: (parseFloat(pct) || 0) / 100 }
}

function layoutTop(el: HTMLElement): number {
  let top = 0
  for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) top += n.offsetTop
  return top
}

function measureRec(r: Rec) {
  const src = r.opts.source
  if ('chapter' in src) {
    r.follow = { id: src.chapter, key: src.key, from: src.from, to: src.to }
    return
  }
  const el = r.el!
  const stage = el.closest<HTMLElement>(STAGE_SELECTOR)
  const host = stage && getComputedStyle(stage).position === 'sticky' ? stage.closest<HTMLElement>('section[id], footer[id]') : null
  if (host && (CHAPTER_IDS as readonly string[]).includes(host.id)) {
    // Inside a sticky stage an element has no scroll position of its own: follow the chapter's arrival.
    const [from, to] = r.opts.stageRange ?? [0.2, 0.75]
    r.follow = { id: host.id as ChapterId, key: 'enter', from, to }
    return
  }
  r.follow = null
  const vh = deckFrame().vh
  const top = layoutTop(el)
  const height = el.offsetHeight
  const a = edge(src.start, 'top 96%')
  const b = edge(src.end, 'top 68%')
  r.top = top
  r.bottom = top + height
  r.y0 = top + height * a.at - vh * a.line
  r.y1 = Math.max(r.y0 + 1, top + height * b.at - vh * b.line)
}

function targetOf(r: Rec, f: DeckFrame): number {
  if (r.follow) {
    const s = chapter(r.follow.id)
    if (!s) return 1
    return clamp((s[r.follow.key] - r.follow.from) / (r.follow.to - r.follow.from))
  }
  return clamp((f.y - r.y0) / (r.y1 - r.y0))
}

/** Is the reveal's trigger on screen (so that at rest it must be complete)? */
function onScreen(r: Rec, f: DeckFrame): boolean {
  if (r.follow) return r.target > 0 && !!chapter(r.follow.id)?.inView
  return r.top < f.y + f.vhLarge - 12 && r.bottom > f.y + 12
}

function syncPhase(r: Rec) {
  const list = r.opts.phaseOff
  if (!list?.length) return
  const off = r.tl.progress() <= 0.0005
  if (off === r.off) return
  r.off = off
  for (const el of list) {
    if (off) {
      el.setAttribute('data-phase', 'off')
      el.setAttribute('inert', '')
    } else {
      el.removeAttribute('data-phase')
      el.removeAttribute('inert')
    }
  }
}

function go(r: Rec, value: number, seconds: number, ease: string) {
  r.shown = value
  r.tween?.kill()
  r.tween = null
  if (seconds <= 0 || Math.abs(r.tl.progress() - value) < 0.002) {
    r.tl.progress(value)
    syncPhase(r)
    return
  }
  r.tween = gsap.to(r.tl, { progress: value, duration: seconds, ease, overwrite: true, onUpdate: () => syncPhase(r), onComplete: () => syncPhase(r) })
}

function latchInView(f: DeckFrame, instant: boolean) {
  for (const r of records) {
    if (r.opts.latch === false || r.latched) continue
    r.target = targetOf(r, f)
    if (!onScreen(r, f)) continue
    r.latched = true
    go(r, 1, instant ? 0 : Math.min(0.45, r.opts.settle ?? 0.25), EASE.out)
  }
}

function onFrame(f: DeckFrame) {
  for (const r of records) {
    r.target = targetOf(r, f)
    if (r.latched) {
      // Unlatch only once the trigger is fully below the viewport again, so nothing pops while it is on screen.
      const gone = r.follow ? r.target <= 0 : r.top > f.y + f.vhLarge
      if (gone) r.latched = false
    }
    const shown = r.latched ? 1 : r.target
    if (shown !== r.shown) go(r, shown, f.teleported ? 0 : Math.min(0.3, r.opts.smooth ?? 0.2), 'power2.out')
  }
  // Latch on calm, not only on a full stop: the Lenis tail creeps for a second and text must not sit half risen through it.
  const calm = Math.abs(f.velocity) < f.vhLarge * 0.25
  if (!calm || f.idle) {
    calmSince = 0
    calmDone = false
  } else if (!calmSince) calmSince = f.time
  else if (!calmDone && f.time - calmSince >= 80) {
    calmDone = true
    latchInView(f, false)
  }
}

function onSettled(f: DeckFrame, reason: SettleReason) {
  latchInView(f, reason === 'teleport')
}

function wire() {
  if (wired) return
  wired = true
  onDeck(onFrame)
  onSettle(onSettled)
  onMeasure(() => {
    for (const r of records) {
      measureRec(r)
      r.opts.onMeasure?.()
      if (r.opts.invalidate) {
        // Function-based values (card flights measured from the layout) are read again from the start state.
        const p = r.tl.progress()
        r.tl.progress(0).invalidate().progress(p)
      }
    }
  })
}

/**
 * build() receives a paused timeline; add fromTo() tweens whose "to" equals
 * the CSS default. Returns cleanup (reverts every inline style it wrote).
 * Under reduced motion nothing is built: the CSS default is the page.
 */
export function reveal(build: (tl: gsap.core.Timeline) => void, opts: RevealOptions): () => void {
  if (typeof window === 'undefined' || filmOff() || prefersReducedMotion()) return () => {}
  wire()
  const tl = gsap.timeline({ paused: true })
  build(tl)
  const src = opts.source
  const r: Rec = {
    id: opts.id ?? `reveal-${++serial}`, tl, opts, el: 'trigger' in src ? (src.trigger as HTMLElement) : null,
    follow: null, y0: 0, y1: 1, top: 0, bottom: 0, target: 0, latched: false, shown: -1, tween: null, off: null,
  }
  measureRec(r)
  const f = deckFrame()
  r.target = targetOf(r, f)
  // Creation rule: anything in or above the viewport is simply complete. Only what is fully below gets its "from" state.
  const begun = r.follow ? r.target > 0 : r.top <= f.y + f.vhLarge
  if (opts.latch !== false && begun) {
    r.latched = true
    go(r, 1, 0, 'none')
  } else go(r, r.target, 0, 'none')
  records.add(r)
  const el = r.el ?? ('chapter' in src ? chapter(src.chapter)?.el ?? null : null)
  const focus = () => {
    if (opts.latch === false || r.latched) return
    r.latched = true
    go(r, 1, 0, 'none')
  }
  el?.addEventListener('focusin', focus)
  return () => {
    el?.removeEventListener('focusin', focus)
    records.delete(r)
    r.tween?.kill()
    tl.revert()
    tl.kill()
    for (const node of opts.phaseOff ?? []) {
      node.removeAttribute('data-phase')
      node.removeAttribute('inert')
    }
  }
}

/** For window.__film.state() and the probe: at rest every entry is 0 or 1, and every entry in view is 1. */
export function revealReports(): { id: string; progress: number; target: number; latched: boolean; inView: boolean }[] {
  const f = deckFrame()
  return Array.from(records, (r) => ({
    id: r.id, progress: +r.tl.progress().toFixed(4), target: +r.target.toFixed(4), latched: r.latched,
    inView: r.opts.latch === false ? false : onScreen(r, f),
  }))
}

/** Short, reversible entrances. Default HTML is visible even before JS runs. */
export function useSectionReveals(rootRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const media = gsap.matchMedia()
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const offs = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'), (el) => {
        // Counter timelines own their text; this only brings their container in.
        const type = el.dataset.reveal
        const distance = type === 'card' ? 36 : type === 'heading' ? 28 : 18
        return reveal((tl) => {
          tl.fromTo(el, { y: distance, opacity: 0.12 }, { y: 0, opacity: 1, duration: 1, ease: 'none' })
        }, { source: { trigger: el, start: 'top 96%', end: 'top 68%' } })
      })
      return () => offs.forEach((off) => off())
    })
    return () => media.revert()
  }, [rootRef])
}

/** Only decorative inner layers travel in depth; content remains easy to read. */
export function useSectionDepth(rootRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current
    if (!root || prefersReducedMotion() || filmOff()) return
    const id = root.id as ChapterId
    const offs: (() => void)[] = []
    const ctx = gsap.context(() => {
      root.querySelectorAll<HTMLElement>('[data-depth]').forEach((el) => {
        const depth = Math.max(-25, Math.min(25, Number(el.dataset.depth)))
        if (!depth || getComputedStyle(el).position === 'fixed' || el.hasAttribute('data-reveal')) return
        if ((CHAPTER_IDS as readonly string[]).includes(id)) {
          // Decorative drift as a pure function of the chapter's passage: no trigger to measure.
          const set = gsap.quickSetter(el, 'y', 'px')
          offs.push(drive(id, (v) => set(depth - 2 * depth * v), { key: 'through', smooth: 0 }))
        } else {
          gsap.fromTo(el, { y: depth }, { y: -depth, ease: 'none', scrollTrigger: { trigger: root, start: 'top bottom', end: 'bottom top', scrub: true } })
        }
      })
    }, root)
    return () => {
      offs.forEach((off) => off())
      ctx.revert()
    }
  }, [rootRef])
}

/** A number that counts up as its element arrives, and is simply complete at rest. */
export function animateCounter(el: HTMLElement, value: number, noSeparator = false) {
  const format = (v: number) => (noSeparator ? String(Math.round(v)) : Math.round(v).toLocaleString('en-US'))
  const state = { v: 0 }
  return reveal((tl) => {
    tl.fromTo(state, { v: 0 }, { v: value, duration: 0.8, ease: EASE.out, onUpdate: () => { el.textContent = format(state.v) } })
  }, { source: { trigger: el, start: 'top 88%', end: 'top 60%' } })
}
