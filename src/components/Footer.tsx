import { site, contact, nav } from '../content'
import { scrollToId } from '../lib/scroll'

/**
 * Footer — the big Citadel-style bar: a full-bleed deep-navy band with the
 * wordmark on the left and the chapter links stacked on the right.
 */
export default function Footer() {
  return (
    <footer id="contact" className="relative bg-[#0a1e3f] text-[#e8eefb]">
      <div className="container-site grid gap-14 py-[9vh] md:grid-cols-2 md:gap-8">
        {/* Wordmark + contacts */}
        <div className="flex flex-col justify-between gap-12">
          <p className="font-display flex items-center gap-4 text-[clamp(1.4rem,2.2vw,2.1rem)] font-[650] tracking-[0.28em]">
            <span aria-hidden="true" className="text-[var(--neon-core)]">
              ♠
            </span>
            CORNELL CGS
          </p>
          <ul className="mono flex flex-col gap-2 text-[max(0.85rem,13px)] text-[#93a6cc]">
            {/* TODO real email */}
            <li>Email — {contact.email}</li>
            {/* TODO real instagram */}
            <li>Instagram — {contact.instagram}</li>
            {/* TODO real wechat */}
            <li>WeChat — {contact.wechat}</li>
          </ul>
        </div>

        {/* Stacked chapter links, Citadel-style */}
        <nav aria-label="Footer" className="flex flex-col items-start gap-4 md:items-end" data-interactive>
          {nav.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => scrollToId(id)}
              className="text-[max(1.05rem,17px)] font-[550] text-[#e8eefb] transition-colors hover:text-white hover:underline hover:underline-offset-4"
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      <div className="border-t border-[rgba(147,166,204,0.25)]">
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
