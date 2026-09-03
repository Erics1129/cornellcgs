import type { ReactElement } from 'react'
import gsap from 'gsap'
import { EASE } from '../../lib/eases'
import { prefersReducedMotion } from '../../lib/motion'
import type { PageTheme } from '../../lib/pageTheme'

/**
 * Cinematic — the main deck's personality on a white sheet (who-we-are,
 * contact). A faint serif watermark drifts behind the page on scroll; the
 * title rises word by word out of masks, the lead arrives word by word, the
 * rest settles in behind. Transforms and opacity only.
 */

/** Watermark: bottom-right of the FIRST viewport — the whole-page corner
    would sit under the opaque navy band. */
function Backdrop(): ReactElement {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-svh">
        <span
          data-cine-mark
          className="absolute bottom-[-0.12em] right-0 select-none whitespace-nowrap leading-none will-change-transform"
          style={{
            fontFamily: 'var(--font-serif)',
            fontStyle: 'italic',
            fontWeight: 480,
            fontSize: 'clamp(12rem, 30vw, 26rem)',
            color: 'rgba(10, 30, 63, 0.045)',
          }}
        >
          CGS
        </span>
      </div>
    </div>
  )
}

// vertical-align:top — an overflow-hidden inline-block otherwise sits on its
// bottom margin edge and lifts the line. The inline padding/negative margin
// pair gives italic overhang (an <em>) room without changing the box width.
const MASK_STYLE =
  'display:inline-block;overflow:hidden;vertical-align:top;' +
  'padding:0 0.06em 0.12em;margin:0 -0.06em -0.12em'

type Split = { units: HTMLElement[]; restore: () => void }

/** Wrap a block's words (each child ELEMENT as one unit, styling kept) in
    inline-block spans, optionally inside overflow masks. Whitespace stays
    bare text so lines still break between words. The original nodes are
    kept and put back on restore, so React's references stay valid. */
function splitWords(el: HTMLElement, masked: boolean): Split {
  const original = Array.from(el.childNodes)
  const units: HTMLElement[] = []
  const frag = document.createDocumentFragment()

  const wrap = (content: Node): HTMLElement => {
    const inner = document.createElement('span')
    inner.style.display = 'inline-block'
    inner.appendChild(content)
    units.push(inner)
    if (!masked) return inner
    const mask = document.createElement('span')
    mask.style.cssText = MASK_STYLE
    mask.appendChild(inner)
    return mask
  }

  original.forEach((node) => {
    if (node.nodeType !== Node.TEXT_NODE) {
      frag.appendChild(wrap(node))
      return
    }
    ;(node.textContent ?? '').split(/(\s+)/).forEach((part) => {
      if (!part) return
      frag.appendChild(
        /^\s+$/.test(part) ? document.createTextNode(part) : wrap(document.createTextNode(part)),
      )
    })
  })

  el.replaceChildren(frag)
  return { units, restore: () => el.replaceChildren(...original) }
}

function enter(root: HTMLElement): () => void {
  const items = Array.from(root.querySelectorAll<HTMLElement>('[data-page-item]'))
  const title = root.querySelector<HTMLElement>('[data-page-title]')
  const mark = root.querySelector<HTMLElement>('[data-cine-mark]')

  if (prefersReducedMotion()) {
    const ctx = gsap.context(() => {
      gsap.fromTo(items, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: EASE.out })
    }, root)
    return () => ctx.revert()
  }

  const next = title?.nextElementSibling
  const lead =
    next instanceof HTMLParagraphElement && next.hasAttribute('data-page-item') ? next : null
  const rest = items.filter((el) => el !== title && el !== lead)
  const splits: Split[] = []

  const ctx = gsap.context(() => {
    // Start states must paint at build time, not on the first tick
    const tl = gsap.timeline({ defaults: { ease: EASE.out, immediateRender: true } })

    if (title) {
      const split = splitWords(title, true)
      splits.push(split)
      gsap.set(title, { autoAlpha: 1 })
      tl.fromTo(
        split.units,
        { yPercent: 112, rotation: 2.5, transformOrigin: '0% 100%' },
        { yPercent: 0, rotation: 0, transformOrigin: '0% 100%', duration: 1.1, stagger: 0.1 },
        0,
      )
    }

    if (lead) {
      const split = splitWords(lead, false)
      splits.push(split)
      gsap.set(lead, { autoAlpha: 1 })
      tl.fromTo(
        split.units,
        { autoAlpha: 0, y: 8 },
        { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.035 },
        0.5,
      )
    }

    if (rest.length) {
      tl.fromTo(
        rest,
        { autoAlpha: 0, y: 18 },
        { autoAlpha: 1, y: 0, duration: 0.65, stagger: 0.07 },
        0.8,
      )
    }

    // The watermark develops slowly behind the rising title
    if (mark) tl.fromTo(mark, { autoAlpha: 0 }, { autoAlpha: 1, duration: 1.6 }, 0)
  }, root)

  // Scroll parallax — transform only, off the native scroll event
  let onScroll: (() => void) | null = null
  if (mark) {
    const setY = gsap.quickSetter(mark, 'y', 'px')
    onScroll = () => setY(window.scrollY * -0.12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
  }

  return () => {
    if (onScroll) window.removeEventListener('scroll', onScroll)
    ctx.revert()
    if (mark) gsap.set(mark, { clearProps: 'transform' })
    splits.forEach((split) => split.restore())
  }
}

export const theme: PageTheme = { name: 'cinematic', Backdrop, enter }
