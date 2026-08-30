import { useEffect } from 'react'
import { isTouchDevice } from './motion'

/**
 * Give every .neon element its own comet: a random starting angle and lap
 * duration so no two boxes glow in sync, and on touch devices flash the ring
 * for 600 ms on tap (there is no hover to reveal it otherwise).
 */
export function useNeonEdges(rootRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current ?? document.body
    const els = root.querySelectorAll<HTMLElement>('.neon')
    els.forEach((el) => {
      el.style.setProperty('--neon-from', `${Math.floor(Math.random() * 360)}deg`)
      el.style.setProperty('--neon-dur', `${(4.5 + Math.random() * 1.5).toFixed(2)}s`)
    })

    if (!isTouchDevice()) return

    const timers = new WeakMap<HTMLElement, number>()
    const onTap = (e: Event) => {
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('.neon')
      if (!target) return
      target.classList.add('neon-on')
      const prev = timers.get(target)
      if (prev) window.clearTimeout(prev)
      timers.set(
        target,
        window.setTimeout(() => target.classList.remove('neon-on'), 600),
      )
    }
    root.addEventListener('pointerdown', onTap, { passive: true })
    return () => root.removeEventListener('pointerdown', onTap)
  }, [rootRef])
}
