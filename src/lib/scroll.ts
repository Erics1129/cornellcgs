import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import {
  CHAPTER_IDS, attachLenis, deckFrame, filmOff, initDeck, jumpTo, onMeasure, refreshCount, remeasure,
  requestRefresh, restoreTo, settleNow, whereAmI, type ChapterId,
} from './deck'
import { BOOTED_EVENT } from './motion'
import { revealReports } from './reveal'
import { sceneReports } from './scenes'
import { tier } from './tier'
import { look } from './look'

gsap.registerPlugin(ScrollTrigger)

// Dev-only: lets automated probes step the clock when the tab is throttled
if (import.meta.env.DEV) {
  ;(window as unknown as { __gsap?: unknown }).__gsap = { gsap, ScrollTrigger }
}

/**
 * Free scrolling on Lenis inertia (wheel and trackpad) or the browser's own
 * scrolling (touch, reduced motion). This file only boots things; the scroll
 * state itself lives in deck.ts, which also runs Lenis so that there is one
 * frame loop with a fixed order. Nothing here pins, and nothing re-measures
 * except through requestRefresh().
 */

/** True while the page is moving fast (auto-flip and the code lens wait). */
export function isPaging(): boolean {
  return Math.abs(deckFrame().velocity) > 40
}

/** Signed scroll momentum for layers that express it (code rain, skew), in px per 60 Hz frame. */
export function scrollVelocity(): number {
  return deckFrame().velocity / 60
}

/**
 * Where the reader left the deck. Stashed on every exit (pagehide) as
 * `chapter:fraction`, consumed on the next deck load so coming back from a
 * sub-page lands on the exact spot — no hero, no glide. A bfcache restore
 * (pageshow persisted) never reloads, so the stash is cleared there instead.
 */
const RETURN_KEY = 'cgs-return'
type Restore = { id: ChapterId; fraction: number } | { y: number }
let pendingRestore: Restore | null = null
let firstBoot = true

export function hasPendingRestore(): boolean {
  return pendingRestore !== null
}

function readRestore(): Restore | null {
  try {
    const saved = sessionStorage.getItem(RETURN_KEY)
    if (saved === null) return null
    sessionStorage.removeItem(RETURN_KEY)
    const [id, fraction] = saved.split(':')
    if (fraction !== undefined && (CHAPTER_IDS as readonly string[]).includes(id) && Number.isFinite(Number(fraction))) {
      return { id: id as ChapterId, fraction: Number(fraction) }
    }
    const y = Number(saved)
    return Number.isFinite(y) && y > 0 ? { y } : null
  } catch {
    return null // private mode: open on the hero
  }
}

function applyRestore() {
  if (!pendingRestore) return
  if ('id' in pendingRestore) restoreTo(pendingRestore.id, pendingRestore.fraction)
  else jumpTo(pendingRestore.y, { cut: false })
}

/** Boot smooth scrolling. The old name is kept so App.tsx stays untouched. */
export function initSmoothScroll(): () => void {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
  // Only the first boot of a page load decides where the page opens. (React's dev double-mount runs
  // this function twice; a second run must neither lose the stash nor send the reader to the top.)
  if (firstBoot) {
    firstBoot = false
    pendingRestore = readRestore()
    window.scrollTo(0, pendingRestore && 'y' in pendingRestore ? pendingRestore.y : 0)
  }

  const onPageHide = () => {
    try {
      const at = whereAmI()
      if (at) sessionStorage.setItem(RETURN_KEY, `${at.id}:${at.fraction.toFixed(5)}`)
      else sessionStorage.setItem(RETURN_KEY, String(Math.round(window.scrollY)))
    } catch {
      /* ignore */
    }
  }
  const onPageShow = (e: PageTransitionEvent) => {
    if (!e.persisted) return
    try {
      sessionStorage.removeItem(RETURN_KEY)
    } catch {
      /* ignore */
    }
  }
  window.addEventListener('pagehide', onPageHide)
  window.addEventListener('pageshow', onPageShow)

  // No pins exist, so a refresh has no order to get wrong; sorting keeps it that way for the few
  // decorative triggers left. A phone's URL bar must not re-measure anything: our own resize rule
  // (deck.ts) asks for a refresh only on a real size change.
  ScrollTrigger.config({ ignoreMobileResize: true, autoRefreshEvents: 'visibilitychange,DOMContentLoaded,load' })
  const sort = () => ScrollTrigger.sort()
  ScrollTrigger.addEventListener('refreshInit', sort)

  const stopDeck = initDeck()
  const off = filmOff()

  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  const finePointer = matchMedia('(any-pointer: fine)')
  let lenis: Lenis | null = null
  const setScrollMotion = () => {
    lenis?.destroy()
    lenis = null
    // Touch screens keep the browser's own scrolling (and its compositor); so does reduced motion.
    if (!off && !motion.matches && finePointer.matches) {
      lenis = new Lenis({
        lerp: 0.085, wheelMultiplier: 0.92, syncTouch: false, stopInertiaOnNavigate: true,
        // the editor scrolls itself ([data-lenis-prevent] is honoured by Lenis already)
        prevent: (node) => node.classList?.contains('cm-scroller') ?? false,
      })
      lenis.on('scroll', ScrollTrigger.update)
    }
    attachLenis(lenis)
  }
  const onMotionChange = () => {
    setScrollMotion()
    // Runways collapse or return: the deck re-measures and keeps the reader in the same chapter.
    remeasure()
    requestRefresh('motion')
  }
  motion.addEventListener('change', onMotionChange)
  finePointer.addEventListener('change', onMotionChange)
  setScrollMotion()
  gsap.ticker.lagSmoothing(0)

  // Cards on the table flex with the speed of the scroll, as if caught by the
  // air: a fast flick tips them back a few degrees and they settle when the
  // page does. Written per card (not on :root) so only they restyle; the
  // cards are collected at refresh, never per frame, and the easing is
  // time-based so 60 and 120 Hz screens agree.
  const TILT_CHAPTERS: ChapterId[] = ['what-we-do', 'project', 'people']
  let tiltCards: { id: ChapterId; els: HTMLElement[] }[] = []
  let tilt = 0
  let tiltShown = 0
  let tiltTime = 0
  const collectCards = () => {
    tiltCards = TILT_CHAPTERS.map((id) => ({
      id,
      els: Array.from(document.getElementById(id)?.querySelectorAll<HTMLElement>('.project-card-holder, .community-slot, .people-slot') ?? []),
    }))
  }
  const tiltTick = () => {
    const f = deckFrame()
    const now = performance.now()
    const dt = Math.min(100, now - tiltTime)
    tiltTime = now
    if (motion.matches || off) return
    const amplitude = tier().coarse ? 0.5 : 1
    const target = f.idle || f.teleported ? 0 : Math.max(-7, Math.min(7, f.velocity * 0.0047)) * amplitude
    if (target === 0 && tilt === 0) return
    tilt += (target - tilt) * (1 - Math.exp(-dt / 130))
    if (Math.abs(tilt) < 0.03 && target === 0) tilt = 0
    if (Math.abs(tilt - tiltShown) < 0.02 && tilt !== 0) return
    tiltShown = tilt
    const value = tiltShown.toFixed(2)
    for (const group of tiltCards) {
      if (!f.chapters.find((c) => c.id === group.id)?.near) continue
      for (const el of group.els) {
        if (tiltShown === 0) el.style.removeProperty('--scroll-tilt')
        else el.style.setProperty('--scroll-tilt', value)
      }
    }
  }
  const offMeasure = onMeasure(collectCards)
  collectCards()
  gsap.ticker.add(tiltTick)

  // One refresh once the first layout exists; fonts and late images are caught by the deck's
  // ResizeObserver, which re-measures at once and asks for a refresh only when a chapter moved.
  applyRestore()
  requestRefresh('boot')
  let alive = true
  document.fonts?.ready
    .then(() => {
      if (alive) remeasure()
    })
    .catch(() => {})
  // Once the reader moves the page themselves, the stash has done its job: their place is the deck's anchor from then on.
  const dropRestore = () => {
    pendingRestore = null
  }
  const INPUTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const
  for (const type of INPUTS) window.addEventListener(type, dropRestore, { passive: true, once: true })
  // The first settle the reader can see fires when the curtain lifts.
  const onShown = () => settleNow('boot')
  window.addEventListener(BOOTED_EVENT, onShown)

  if (import.meta.env.DEV) {
    const w = window as unknown as { __film?: Record<string, unknown> }
    w.__film = {
      ...(w.__film ?? {}),
      state: () => {
        const f = deckFrame()
        return {
          frame: { ...f, chapters: undefined },
          chapters: f.chapters.map((c) => ({ ...c, el: undefined })),
          reveals: revealReports(),
          scenes: sceneReports(),
          tier: tier(),
          look: { ...look() },
          refreshCount: refreshCount(),
        }
      },
    }
  }

  return () => {
    alive = false
    window.removeEventListener('pagehide', onPageHide)
    window.removeEventListener('pageshow', onPageShow)
    window.removeEventListener(BOOTED_EVENT, onShown)
    for (const type of INPUTS) window.removeEventListener(type, dropRestore)
    motion.removeEventListener('change', onMotionChange)
    finePointer.removeEventListener('change', onMotionChange)
    ScrollTrigger.removeEventListener('refreshInit', sort)
    offMeasure()
    gsap.ticker.remove(tiltTick)
    for (const group of tiltCards) for (const el of group.els) el.style.removeProperty('--scroll-tilt')
    attachLenis(null)
    lenis?.destroy()
    lenis = null
    stopDeck()
  }
}

/** Go to a chapter (nav, side rail, CTAs, hash links): a glide when it is close, a cut when it is far. */
export function scrollToId(id: string) {
  if ((CHAPTER_IDS as readonly string[]).includes(id)) return jumpTo(id as ChapterId)
  const el = document.getElementById(id)
  if (el) jumpTo(el.getBoundingClientRect().top + window.scrollY)
}
