/**
 * One listener for every neon control: a pointer press on anything `.neon`
 * restarts its burst (global.css .neon-burst) — the ring flashes, a shock
 * ring expands, the element presses. Delegated so cards, words and buttons
 * added later all get it; the class is removed when the burst ends so the
 * next press can replay it.
 */
export function installNeonClick(): () => void {
  const onDown = (e: PointerEvent) => {
    const t = (e.target as Element | null)?.closest?.('.neon')
    if (!(t instanceof HTMLElement)) return
    t.classList.remove('neon-burst')
    // reflow so the same class re-triggers its animation
    void t.offsetWidth
    t.classList.add('neon-burst')
    t.addEventListener('animationend', () => t.classList.remove('neon-burst'), { once: true })
  }
  document.addEventListener('pointerdown', onDown, { passive: true })
  return () => document.removeEventListener('pointerdown', onDown)
}
