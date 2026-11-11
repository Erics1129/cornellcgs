import { useEffect, useState } from 'react'
import { deckFrame, onDeck, type ChapterId } from './deck'

/**
 * The chapter under the middle of the viewport, straight from the deck: no
 * scroll listener, no layout reads. Interludes count too, so the rail never
 * labels the wrong scene. The hero reads as "no chapter".
 */
export function useActiveSection(): string {
  const [active, setActive] = useState('')
  useEffect(() => {
    let last: ChapterId | '' = ''
    const update = () => {
      const now = deckFrame().active
      if (now === last) return
      last = now
      setActive(now === 'top' ? '' : now)
    }
    update()
    return onDeck(update)
  }, [])
  return active
}
