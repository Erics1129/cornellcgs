/**
 * The frame every mini-game page sits in: the same bar, navigator and footer
 * as the info pages, plus the page's own background and title.
 */
import { useEffect, useRef } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { site } from '../content'
import Dice from '../components/Dice'
import PageNavigator from '../components/PageNavigator'
import SignIn from '../lib/account/SignIn.tsx'
import '../styles/subpages.css'

type Props = {
  /** the page id the navigator marks as current */
  pageId: string
  title: string
  /** where Back goes, and what the footer link says */
  back: { href: string; label: string }
  skip: { href: string; label: string }
  className: string
  children: ReactNode
}

export default function MinigameShell({ pageId, title, back, skip, className, children }: Props) {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const html = document.documentElement
    const previous = { background: html.style.background, colorScheme: html.style.colorScheme, title: document.title }
    if (root.current) {
      const style = getComputedStyle(root.current)
      html.style.background = style.backgroundColor
      html.style.colorScheme = style.colorScheme
    }
    document.title = `${title} · ${site.name}`
    return () => { html.style.background = previous.background; html.style.colorScheme = previous.colorScheme; document.title = previous.title }
  }, [title])

  // Coming straight from the Back target, go back in history so its scroll position returns
  const goBack = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    try {
      const referrer = new URL(document.referrer)
      if (referrer.origin === location.origin && referrer.pathname === back.href && history.length > 1) { event.preventDefault(); history.back() }
    } catch { /* a direct visit follows the link */ }
  }

  return <div ref={root} className={`subpage ${className}`}>
    <a className="sp-skip" href={skip.href}>{skip.label}</a>
    <header className="sp-bar"><nav className="sp-bar__inner" aria-label="Page navigation">
      <a className="sp-back" href={back.href} onClick={goBack}><span aria-hidden="true">←</span> Back</a>
      <a className="sp-brand" href="/"><Dice size={24} /><span>{site.name}</span></a>
      <span className="sp-bar__end"><PageNavigator currentId={pageId} /><SignIn /></span>
    </nav></header>

    {children}

    <footer className="sp-footer"><div className="sp-footer__bottom">
      <a href={back.href} onClick={goBack}>{back.label} <span aria-hidden="true">↗</span></a>
      <p>{site.credit}</p>
      <span>{site.domain}</span>
    </div></footer>
  </div>
}
