import { useEffect, useState } from 'react'
import { nav } from '../content'

/** Which chapter currently owns the viewport (id from content.nav, '' at the hero). */
export function useActiveSection(): string {
  const [active, setActive] = useState('')

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id)
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )
    const top = document.getElementById('top')
    if (top) io.observe(top)
    // the last chapter is not a nav item, but it owns the viewport at the end
    ;[...nav.map(({ id }) => id), 'vision'].forEach((id) => {
      const el = document.getElementById(id)
      if (el) io.observe(el)
    })
    return () => io.disconnect()
  }, [])

  return active === 'top' ? '' : active
}
