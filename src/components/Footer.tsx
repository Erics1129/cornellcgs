import { useEffect, useRef } from 'react'
import Dice from './Dice'
import gsap from 'gsap'
import { site, contact, nav } from '../content'
import { scrollToId } from '../lib/scroll'
import { pagePath } from '../lib/router'
import { EASE } from '../lib/eases'
import { prefersReducedMotion } from '../lib/motion'
import { drive } from '../lib/deck'
import { reveal } from '../lib/reveal'

/**
 * Footer — the big Citadel-style bar: a full-bleed deep-navy band with the
 * wordmark on the left and the chapter links stacked on the right.
 * Sits outside any reveal.ts watched root, so it runs the chapters' reveal
 * language locally.
 */
export default function Footer() {
  const root = useRef<HTMLElement>(null)

  useEffect(() => {
    const footer = root.current
    if (!footer) return

    // Under reduced motion the footer is simply there (the CSS default).
    if (prefersReducedMotion()) return
    const wordmark = gsap.utils.toArray<HTMLElement>('[data-f-wordmark]', footer)
    const rows = gsap.utils.toArray<HTMLElement>('[data-f-row]', footer)
    const links = gsap.utils.toArray<HTMLElement>('[data-f-link]', footer)
    // A latched reveal: it rises with the scroll, finishes a quarter second after the page
    // stops, and after End (a teleport) every link is there in the first frame.
    const offReveal = reveal((tl) => {
      tl.fromTo(wordmark, { y: 28, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: EASE.out })
        .fromTo(rows, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.65, ease: EASE.out, stagger: 0.06 }, '-=0.45')
        .fromTo(links, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.65, ease: EASE.out, stagger: 0.06 }, '<0.1')
    }, { id: 'footer', source: { trigger: footer, start: 'top 96%', end: 'top 55%' } })
    // Watermark drift: transform only, a pure function of how far the footer has come in.
    const mark = footer.querySelector<HTMLElement>('[data-f-mark]')
    const setMark = mark ? gsap.quickSetter(mark, 'y', 'px') : null
    const offMark = setMark ? drive('contact', (v) => setMark(40 - 80 * v), { key: 'enter', smooth: 0 }) : () => {}
    return () => {
      offReveal()
      offMark()
      if (mark) gsap.set(mark, { clearProps: 'transform' })
    }
  }, [])

  return (
    <footer ref={root} id="contact" className="relative bg-[#332816] text-[#f7f3ec]">
      {/* The join with the chapter above is the seam in App.tsx; nothing of the footer reaches up into it */}
      {/* Watermark clips in its own layer so nothing else is clipped */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 flex select-none items-center justify-center overflow-hidden"
      >
        {/* The mark is scroll-scrubbed (y), so the sway rides a wrapper; inline-block keeps the scrub's transform valid */}
        <div className="life-sway" style={{ ['--life-dur' as string]: '14s', ['--life-delay' as string]: '-5s' }}>
          <span
            data-f-mark
            className="inline-block leading-none opacity-40"
          >
            <Dice size={220} className="[--dice-face:color-mix(in_srgb,var(--neon-dim)_55%,transparent)] [--dice-pip:color-mix(in_srgb,var(--neon-mid)_45%,transparent)] [--dice-edge:transparent]" />
          </span>
        </div>
      </div>
      <div className="container-site relative z-10 grid gap-14 py-[9vh] md:grid-cols-2 md:gap-8">
        {/* Wordmark + contacts */}
        <div className="flex flex-col justify-between gap-12">
          {/* The wordmark is GSAP-risen, so the breath rides a wrapper */}
          <div className="life-breathe origin-left" style={{ ['--life-delay' as string]: '-2.4s' }}>
            <p
              data-f-wordmark
              className="font-display flex items-center gap-4 text-[clamp(1.4rem,2.2vw,2.1rem)] font-[650] tracking-[0.28em]"
            >
              <Dice size={28} />
              CORNELL CGS
            </p>
          </div>
          <ul className="mono flex flex-col gap-2 text-[max(0.85rem,0.8125rem)] text-[#bfb4a0]">
            <li data-f-row>Email — {contact.email}</li>
          </ul>
        </div>

        {/* Stacked chapter links, Citadel-style. Real hrefs so crawlers can
            walk to every sub-page; a human click stays on the deck. */}
        <nav aria-label="Footer" className="flex flex-col items-start gap-4 md:items-end" data-interactive>
          {nav.map(({ id, label }, i) => (
            <a
              key={id}
              data-suit={'♠♥♦♣'[i % 4]}
              href={pagePath(id)}
              data-f-link
              onClick={(e) => {
                e.preventDefault()
                scrollToId(id)
              }}
              className="f-link link-wipe text-[max(1.05rem,1.0625rem)] font-[550] text-[#f7f3ec] transition-colors [transition-timing-function:var(--ease-out)] hover:text-white"
            >
              {label}
            </a>
          ))}
          <a
            href={pagePath('contact')}
            data-suit="★"
            data-f-link
            onClick={(e) => {
              e.preventDefault()
              scrollToId('contact')
            }}
            className="f-link link-wipe text-[max(1.05rem,1.0625rem)] font-[550] text-[#f7f3ec] transition-colors [transition-timing-function:var(--ease-out)] hover:text-white"
          >
            Contact
          </a>
        </nav>
      </div>

      <div className="relative z-10 border-t border-[rgba(191,180,160,0.25)]">
        <div className="container-site flex flex-col gap-2 py-6 md:flex-row md:items-center md:justify-between">
          <p className="mono text-[max(0.8rem,0.75rem)] text-[#bfb4a0]">
            {site.footerLine(new Date().getFullYear())}
          </p>
          <div className="flex items-center gap-6">
            <p className="mono text-[max(0.8rem,0.75rem)] text-[#bfb4a0]">{site.domain}</p>
            {/* Back to the top, the deck gathered and dealt again */}
            <button
              type="button"
              className="f-redeal mono text-[max(0.8rem,0.75rem)]"
              onClick={() => scrollToId('top')}
            >
              <span className="f-redeal__deck" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              Deal again
            </button>
          </div>
        </div>
        <div className="container-site border-t border-[rgba(191,180,160,0.18)] py-4">
          <p className="mono text-[max(0.75rem,0.75rem)] text-[#bfb4a0]">
            <span
              className="life-glow inline-block"
              style={{ ['--life-delay' as string]: '-2.2s', ['--life-dur' as string]: '5s' }}
            >
              {site.credit}
            </span>
          </p>
        </div>
      </div>
    </footer>
  )
}
