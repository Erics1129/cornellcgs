import { useState } from 'react'
import { site, contact } from '../content'
import { soundEnabled, setSoundEnabled } from '../lib/motion'

/** Contact + footer. The glass-shatter sound toggle lives here (§5.6). */
export default function Footer() {
  const [sound, setSound] = useState(soundEnabled())

  const toggleSound = () => {
    const next = !sound
    setSound(next)
    setSoundEnabled(next)
  }

  return (
    <footer id="contact" className="relative border-t border-[color-mix(in_srgb,var(--neon-dim)_60%,transparent)] py-14">
      <div className="container-site flex flex-col gap-10 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-display mb-4 text-2xl text-[var(--ivory)]">
            {site.name} <span className="text-[var(--neon-mid)]">♠</span>
          </p>
          <ul className="mono flex flex-col gap-2 text-[var(--muted)]">
            <li>
              {/* TODO real email */}
              <a
                href={`mailto:${contact.email}`}
                className="hover:text-[var(--text)]"
                data-interactive
              >
                {contact.email}
              </a>
            </li>
            <li>
              {/* TODO real instagram */}
              <a
                href={contact.instagramUrl}
                target="_blank"
                rel="noreferrer"
                className="hover:text-[var(--text)]"
                data-interactive
              >
                Instagram {contact.instagram}
              </a>
            </li>
            {/* TODO real wechat */}
            <li>WeChat {contact.wechat}</li>
          </ul>
        </div>

        <div className="flex flex-col items-start gap-4 md:items-end">
          <button
            onClick={toggleSound}
            data-interactive
            aria-pressed={sound}
            className="btn neon rounded-full text-[max(0.85rem,14px)]"
          >
            <span aria-hidden="true">{sound ? '♪' : '∅'}</span>
            Glass sound {sound ? 'on' : 'off'}
          </button>
          <p className="mono max-w-[46ch] text-[max(0.8rem,13px)] text-[var(--muted)] md:text-right">
            {site.footerLine(new Date().getFullYear())}
          </p>
        </div>
      </div>
    </footer>
  )
}
