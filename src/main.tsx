import React from 'react'

// Tell the index.html boot guard we made it, and tidy its recovery param.
const w = window as unknown as { __cgsBooted?: boolean; __cgsBootTimer?: number }
w.__cgsBooted = true
if (w.__cgsBootTimer) window.clearTimeout(w.__cgsBootTimer)
if (location.search.includes('rl=')) {
  const u = new URL(location.href)
  u.searchParams.delete('rl')
  history.replaceState(null, '', u.toString())
}
import ReactDOM from 'react-dom/client'
import App from './App'
import SubPage from './components/SubPage'
import { pages } from './content'
import { currentPage, pagePath } from './lib/router'
import { BOOTED_EVENT } from './lib/motion'
import { scrollToId } from './lib/scroll'
import { installNeonClick } from './lib/neonClick'
import { installDevice } from './lib/device'
import { isDraftPreview, loadDraft, loadLiveContent, markDraftPreview } from './lib/liveContent'
import './styles/global.css'

// Device class + design scale first: everything below measures in rem.
installDevice()
installNeonClick()

// Legacy hash routes (#p/<id>) now live at real paths — forward old links.
const legacy = location.hash.match(/^#p\/([a-z-]+)$/)
if (legacy && pages[legacy[1]]) {
  location.replace(pagePath(legacy[1]))
}

// Info pages are REAL pages: render the standalone view, not the deck.
const page = currentPage()
const standalone = page !== null && !!pages[page]

// The words and portraits the board publishes from /admin/ are written into
// the content module before the first render; with no API (or a slow one)
// the compiled copy renders as is. The loader curtain covers the wait. A
// draft preview (opened from the admin) layers the unpublished edits on top.
const draft = isDraftPreview()
loadLiveContent()
  .then(() => (draft ? loadDraft() : []))
  .finally(() => {
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>{standalone ? <SubPage id={page} /> : <App />}</React.StrictMode>,
    )
    if (draft) markDraftPreview()
  })

// Deck loads addressed to a chapter (/#events, a sub-page's Back link) glide
// there once the curtain lifts and the pins have measured — unless the reader
// is coming back from a sub-page, in which case scroll.ts restores the exact
// spot they left and the glide must stay out of the way.
let returningToSpot = false
try {
  returningToSpot = sessionStorage.getItem('cgs-return') !== null
} catch {
  /* private mode */
}
if (!standalone && !returningToSpot) {
  const chapter = location.hash.match(/^#([a-z-]+)$/)?.[1]
  if (chapter) {
    const go = () => window.setTimeout(() => scrollToId(chapter), 650)
    if ((window as { __cgsShown?: boolean }).__cgsShown) go()
    else window.addEventListener(BOOTED_EVENT, go, { once: true })
  }
}
