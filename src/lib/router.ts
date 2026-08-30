/**
 * Tiny hash router for the Citadel-style sub-pages. Every dropdown item gets
 * its own page at #p/<id>; the hash is the single source of truth so the
 * browser's back button works, and the rest of the app can ask isPageOpen()
 * (the pager and the auto-flip stand down while a page is up).
 */

export const PAGE_EVENT = 'cgs:page'

function idFromHash(): string | null {
  const m = window.location.hash.match(/^#p\/([a-z-]+)$/)
  return m ? m[1] : null
}

export function currentPage(): string | null {
  return idFromHash()
}

export function isPageOpen(): boolean {
  return idFromHash() !== null
}

export function openPage(id: string) {
  if (idFromHash() === id) return
  window.location.hash = `p/${id}`
}

export function closePage() {
  if (idFromHash() === null) return
  window.location.hash = ''
  // strip the dangling '#' without adding another history entry
  history.replaceState(null, '', window.location.pathname + window.location.search)
  window.dispatchEvent(new CustomEvent(PAGE_EVENT, { detail: { id: null } }))
}

/**
 * Path-entry boot: the deploy emits real /<id>/index.html stubs for crawlers,
 * each declaring window.__cgsPage. When a person lands on one, normalize the
 * URL back to the root and slide the page open over the deck.
 */
export function bootPathPage(known: ReadonlySet<string>) {
  const declared = (window as { __cgsPage?: string }).__cgsPage
  const m = window.location.pathname.match(/^\/([a-z-]+)\/?$/)
  const id = declared ?? (m ? m[1] : null)
  if (!id || !known.has(id)) return
  history.replaceState(null, '', '/' + window.location.search)
  openPage(id)
}

/** Subscribe to page changes (driven by hashchange); returns unsubscribe. */
export function onPage(cb: (id: string | null) => void): () => void {
  const emit = () => cb(idFromHash())
  const onHash = () => {
    emit()
    window.dispatchEvent(new CustomEvent(PAGE_EVENT, { detail: { id: idFromHash() } }))
  }
  window.addEventListener('hashchange', onHash)
  return () => window.removeEventListener('hashchange', onHash)
}
