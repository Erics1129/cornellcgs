import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

/**
 * Line by line reveals for body copy, the way product pages read: each
 * rendered line of a paragraph rises out of its own mask and brightens in
 * turn as the paragraph scrolls up, scrubbed, so scrolling back folds it
 * away again. Lines are measured from the real layout, so they match the
 * wrap at every width and are rebuilt on resize. The words stay real text.
 *
 * Opt in with data-lines on a paragraph that holds plain text.
 */
type Entry = { el: HTMLElement; text: string; tl: gsap.core.Timeline | null }

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
  entry.tl = gsap.timeline({
    scrollTrigger: {
      trigger: entry.el,
      start: 'top 92%',
      end: () => `top ${Math.max(42, 66 - inners.length * 3)}%`,
      scrub: 0.6,
      invalidateOnRefresh: true,
    },
  })
  inners.forEach((inner, i) => {
    entry.tl!.fromTo(
      inner,
      { yPercent: 108, rotation: 0.6, opacity: 0.15 },
      { yPercent: 0, rotation: 0, opacity: 1, duration: 0.5, ease: 'power3.out' },
      i * 0.14,
    )
  })
}

function teardown(entry: Entry) {
  entry.tl?.scrollTrigger?.kill()
  entry.tl?.kill()
  entry.tl = null
  entry.el.textContent = entry.text
}

export function initLineReveals(scope: ParentNode = document): () => void {
  const media = gsap.matchMedia()
  let entries: Entry[] = []
  media.add('(prefers-reduced-motion: no-preference)', () => {
    entries = Array.from(scope.querySelectorAll<HTMLElement>('[data-lines]'))
      .filter((el) => el.children.length === 0 && (el.textContent ?? '').trim().length > 0)
      .map((el) => ({ el, text: el.textContent ?? '', tl: null }))
    entries.forEach(animate)
    let width = window.innerWidth
    let timer = 0
    const onResize = () => {
      if (Math.abs(window.innerWidth - width) < 2) return
      width = window.innerWidth
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        entries.forEach((e) => {
          teardown(e)
          animate(e)
        })
        ScrollTrigger.refresh()
      }, 180)
    }
    window.addEventListener('resize', onResize)
    ScrollTrigger.refresh()
    return () => {
      window.removeEventListener('resize', onResize)
      window.clearTimeout(timer)
      entries.forEach(teardown)
      entries = []
    }
  })
  return () => media.revert()
}
