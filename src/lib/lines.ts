import { deckFrame, filmOff, onMeasure } from './deck'
import { prefersReducedMotion } from './motion'
import { reveal } from './reveal'

/**
 * Line by line reveals for body copy, the way product pages read: each
 * rendered line of a paragraph rises out of its own mask and brightens in
 * turn as the paragraph scrolls up. It is a latched reveal (lib/reveal.ts):
 * it follows the scroll while the page moves and finishes on its own when the
 * page stops, so a reader never rests on half-risen lines. Lines are measured
 * from the real layout, so they match the wrap at every width and are rebuilt
 * when the width changes. The words stay real text.
 *
 * Opt in with data-lines on a paragraph that holds plain text and sits in
 * normal flow (not inside a sticky stage).
 */
type Entry = { el: HTMLElement; text: string; off: (() => void) | null }

function split(entry: Entry) {
  const { el, text } = entry
  el.textContent = ''
  const words = text.split(/(\s+)/).filter((w) => w.length)
  const spans: HTMLSpanElement[] = []
  for (const w of words) {
    if (/^\s+$/.test(w)) {
      el.appendChild(document.createTextNode(' '))
      continue
    }
    const s = document.createElement('span')
    s.textContent = w
    s.style.display = 'inline-block'
    el.appendChild(s)
    spans.push(s)
  }
  // group by the line each word landed on
  const lines: string[][] = []
  let top = 0
  for (const s of spans) {
    if (!lines.length || Math.abs(s.offsetTop - top) > 2) {
      lines.push([])
      top = s.offsetTop
    }
    lines[lines.length - 1].push(s.textContent ?? '')
  }
  el.textContent = ''
  const inners: HTMLElement[] = []
  lines.forEach((ws) => {
    const line = document.createElement('span')
    line.className = 'line-mask'
    const inner = document.createElement('span')
    inner.className = 'line-mask__inner'
    inner.textContent = ws.join(' ')
    line.appendChild(inner)
    el.appendChild(line)
    el.appendChild(document.createTextNode(' '))
    inners.push(inner)
  })
  return inners
}

function animate(entry: Entry) {
  const inners = split(entry)
  entry.off = reveal((tl) => {
    inners.forEach((inner, i) => {
      tl.fromTo(
        inner,
        { yPercent: 108, rotation: 0.6, opacity: 0.15 },
        { yPercent: 0, rotation: 0, opacity: 1, duration: 0.5, ease: 'power3.out' },
        i * 0.14,
      )
    })
  }, { source: { trigger: entry.el, start: 'top 92%', end: `top ${Math.max(42, 66 - inners.length * 3)}%` } })
}

function teardown(entry: Entry) {
  entry.off?.()
  entry.off = null
  entry.el.textContent = entry.text
}

export function initLineReveals(scope: ParentNode = document): () => void {
  if (prefersReducedMotion() || filmOff()) return () => {}
  let entries: Entry[] = Array.from(scope.querySelectorAll<HTMLElement>('[data-lines]'))
    .filter((el) => el.children.length === 0 && (el.textContent ?? '').trim().length > 0)
    .map((el) => ({ el, text: el.textContent ?? '', off: null }))
  entries.forEach(animate)
  let width = deckFrame().vw
  // The deck re-measures on every real layout change; lines only need rebuilding when the width did.
  const offMeasure = onMeasure(() => {
    const next = deckFrame().vw
    if (Math.abs(next - width) < 2) return
    width = next
    entries.forEach((e) => {
      teardown(e)
      animate(e)
    })
  })
  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  const stop = () => {
    offMeasure()
    entries.forEach(teardown)
    entries = []
  }
  const onMotion = () => { if (motion.matches) stop() }
  motion.addEventListener('change', onMotion)
  return () => {
    motion.removeEventListener('change', onMotion)
    stop()
  }
}
