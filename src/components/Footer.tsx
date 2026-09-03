import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { site, contact, nav } from '../content'
import { scrollToId } from '../lib/scroll'
import { pagePath } from '../lib/router'
import { EASE } from '../lib/eases'
import { prefersReducedMotion } from '../lib/motion'

gsap.registerPlugin(ScrollTrigger)

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

    const ctx = gsap.context(() => {
      const reduced = prefersReducedMotion()
      const wordmark = gsap.utils.toArray<HTMLElement>('[data-f-wordmark]', footer)
      const rows = gsap.utils.toArray<HTMLElement>('[data-f-row]', footer)
      const links = gsap.utils.toArray<HTMLElement>('[data-f-link]', footer)
      const trigger = { trigger: footer, start: 'top 85%', once: true }

      if (reduced) {
        gsap.fromTo(
          [...wordmark, ...rows, ...links],
          { opacity: 0 },
          { opacity: 1, duration: 0.6, scrollTrigger: trigger },
        )
        return
      }

      gsap
        .timeline({ scrollTrigger: trigger })
        .from(wordmark, { y: 28, autoAlpha: 0, duration: 0.7, ease: EASE.out })
        .from(rows, { y: 24, autoAlpha: 0, duration: 0.65, ease: EASE.out, stagger: 0.06 }, '-=0.45')
        .from(links, { y: 24, autoAlpha: 0, duration: 0.65, ease: EASE.out, stagger: 0.06 }, '<0.1')

      // Watermark drift — scrubbed, transform-only.
      gsap.fromTo(
        footer.querySelector('[data-f-mark]'),
        { y: 40 },
        {
          y: -40,
          ease: 'none',
          scrollTrigger: { trigger: footer, start: 'top bottom', end: 'bottom bottom', scrub: true },
        },
      )
    }, footer)

    return () => ctx.revert()
  }, [])

  return (
    <footer ref={root} id="contact" className="relative bg-[#0a1e3f] text-[#e8eefb]">
      {/* The page melts into the bar — no hard seam */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-40 h-40 bg-[linear-gradient(to_bottom,transparent,#0a1e3f)]"
      />
      {/* Watermark clips in its own layer so the seam gradient above stays unclipped */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 flex select-none items-center justify-center overflow-hidden"
      >
        <span
          data-f-mark
          className="font-display leading-none text-[clamp(9rem,24vw,22rem)] text-[color-mix(in_srgb,var(--neon-dim)_30%,transparent)]"
        >
          ♠
        </span>
      </div>
      <div className="container-site relative z-10 grid gap-14 py-[9vh] md:grid-cols-2 md:gap-8">
        {/* Wordmark + contacts */}
        <div className="flex flex-col justify-between gap-12">
          <p
            data-f-wordmark
            className="font-display flex items-center gap-4 text-[clamp(1.4rem,2.2vw,2.1rem)] font-[650] tracking-[0.28em]"
          >
            <span aria-hidden="true" className="text-[var(--neon-core)]">
              ♠
            </span>
            CORNELL CGS
          </p>
          <ul className="mono flex flex-col gap-2 text-[max(0.85rem,13px)] text-[#93a6cc]">
            <li data-f-row>Email — {contact.email}</li>
          </ul>
        </div>

        {/* Stacked chapter links, Citadel-style. Real hrefs so crawlers can
            walk to every sub-page; a human click stays on the deck. */}
        <nav aria-label="Footer" className="flex flex-col items-start gap-4 md:items-end" data-interactive>
          {nav.map(({ id, label }) => (
            <a
              key={id}
              href={pagePath(id)}
              data-f-link
              onClick={(e) => {
                e.preventDefault()
                scrollToId(id)
              }}
              className="link-wipe text-[max(1.05rem,17px)] font-[550] text-[#e8eefb] transition-colors [transition-timing-function:var(--ease-out)] hover:text-white"
            >
              {label}
            </a>
          ))}
          <a
            href={pagePath('contact')}
            data-f-link
            onClick={(e) => {
              e.preventDefault()
              scrollToId('contact')
            }}
            className="link-wipe text-[max(1.05rem,17px)] font-[550] text-[#e8eefb] transition-colors [transition-timing-function:var(--ease-out)] hover:text-white"
          >
            Contact Us
          </a>
        </nav>
      </div>

      <div className="relative z-10 border-t border-[rgba(147,166,204,0.25)]">
        <div className="container-site flex flex-col gap-2 py-6 md:flex-row md:items-center md:justify-between">
          <p className="mono text-[max(0.8rem,12px)] text-[#93a6cc]">
            {site.footerLine(new Date().getFullYear())}
          </p>
          <p className="mono text-[max(0.8rem,12px)] text-[#93a6cc]">{site.domain}</p>
        </div>
      </div>
    </footer>
  )
}
