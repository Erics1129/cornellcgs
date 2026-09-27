import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { pages } from '../content'
import { PAGE_ORDER } from '../lib/pageScenes'
import { pagePath } from '../lib/router'
import '../styles/page-navigator.css'

/** A disclosure of ordinary links: familiar keyboard behavior, no focus trap. */
export default function PageNavigator({ currentId }: { currentId: string }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault(); setOpen(false); trigger.current?.focus()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault(); setOpen(false); trigger.current?.focus(); return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const links = [...root.current!.querySelectorAll<HTMLAnchorElement>('.page-navigator__link')]
    const index = links.indexOf(document.activeElement as HTMLAnchorElement)
    if (document.activeElement !== trigger.current && index < 0) return
    event.preventDefault(); setOpen(true)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? links.length - 1
      : event.key === 'ArrowUp' ? (index <= 0 ? links.length - 1 : index - 1) : (index + 1) % links.length
    requestAnimationFrame(() => { if (root.current?.dataset.open === 'true') links[next]?.focus() })
  }
  return <div ref={root} className="page-navigator" data-open={open} onKeyDown={onKeyDown}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false) }}>
    <button ref={trigger} className="page-navigator__trigger" type="button" aria-label="Explore other pages"
      aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}>
      <span>Explore</span><svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    <div id={panelId} className="page-navigator__panel" aria-hidden={!open}>
      <p className="page-navigator__eyebrow">Discover CGS</p>
      <div className="page-navigator__links">
        {PAGE_ORDER.map(pageId => <a key={pageId} className="page-navigator__link" href={pagePath(pageId)}
          aria-current={pageId === currentId ? 'page' : undefined} tabIndex={open ? 0 : -1}
          onClick={() => setOpen(false)}>
          <span>{pages[pageId].title}</span><span className="page-navigator__mark" aria-hidden="true">{pageId === currentId ? '•' : '↗'}</span>
        </a>)}
      </div>
    </div>
  </div>
}
