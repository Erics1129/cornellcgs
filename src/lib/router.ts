/**
 * Path router. Every info page is a REAL page at /<id>/ — the deploy emits a
 * static stub per page (scripts/stubs.mjs) and the SPA renders the matching
 * standalone view there (main.tsx picks the root component). No overlays, no
 * hash routing: navigation between the deck and info pages is real navigation.
 */

import { pageSlugs } from '../content'

const slugToId = Object.fromEntries(Object.entries(pageSlugs).map(([id, slug]) => [slug, id]))

/** The page id for the current URL: stub-declared, else the slug segment. */
export function currentPage(): string | null {
  const declared = (window as { __cgsPage?: string }).__cgsPage
  if (declared) return declared
  const m = window.location.pathname.match(/^\/([A-Za-z-]+)\/?$/)
  if (!m) return null
  return slugToId[m[1]] ?? null
}

export function isPageOpen(): boolean {
  return currentPage() !== null
}

/** Real navigation to an info page (camelCase URLs). */
export function openPage(id: string) {
  window.location.href = `/${pageSlugs[id] ?? id}/`
}

/** The public URL path for a page id. */
export function pagePath(id: string): string {
  return `/${pageSlugs[id] ?? id}/`
}

/** Real navigation back to the deck. */
export function closePage() {
  window.location.href = '/'
}
