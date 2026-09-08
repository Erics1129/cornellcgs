import { useEffect, useState } from 'react'

/** Follow every chapter, including interludes, so the rail never labels the wrong scene. */
export function useActiveSection(): string {
  const [active, setActive] = useState('')
  useEffect(() => {
    let frame = 0, alive = true
    const chapters = Array.from(document.querySelectorAll<HTMLElement>('main section[id]'))
    const update = () => {
      frame = 0
      if (!alive) return
      const middle = innerHeight * .5
      let current = ''
      for (const section of chapters) {
        const rect = section.getBoundingClientRect()
        if (rect.top <= middle && rect.bottom > middle) current = section.id
      }
      setActive(current === 'top' ? '' : current)
    }
    const schedule = () => { if (!frame && alive) frame = requestAnimationFrame(update) }
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    document.fonts?.ready.then(schedule).catch(() => {})
    schedule()
    return () => {
      alive = false; cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule)
    }
  }, [])
  return active
}
