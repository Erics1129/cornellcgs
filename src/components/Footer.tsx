import { site, contact } from '../content'

/** Contact + footer. */
export default function Footer() {
  return (
    <footer id="contact" className="relative border-t border-[color-mix(in_srgb,var(--neon-dim)_60%,transparent)] py-14">
      <div className="container-site flex flex-col gap-10 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-display mb-4 text-2xl text-[var(--ivory)]">
            {site.name} <span className="text-[var(--neon-mid)]">♠</span>
          </p>
          <ul className="mono flex flex-col gap-2 text-[var(--muted)]">
            {/* TODO real email */}
            <li>Email — {contact.email}</li>
            {/* TODO real instagram */}
            <li>Instagram — {contact.instagram}</li>
            {/* TODO real wechat */}
            <li>WeChat — {contact.wechat}</li>
          </ul>
        </div>

        <p className="mono max-w-[46ch] text-[max(0.8rem,13px)] text-[var(--muted)] md:text-right">
          {site.footerLine(new Date().getFullYear())}
        </p>
      </div>
    </footer>
  )
}
