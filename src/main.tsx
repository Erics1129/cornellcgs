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
import './styles/global.css'

// Legacy hash routes (#p/<id>) now live at real paths — forward old links.
const legacy = location.hash.match(/^#p\/([a-z-]+)$/)
if (legacy && pages[legacy[1]]) {
  location.replace(pagePath(legacy[1]))
}

// Info pages are REAL pages: render the standalone view, not the deck.
const page = currentPage()
const standalone = page !== null && !!pages[page]

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{standalone ? <SubPage id={page} /> : <App />}</React.StrictMode>,
)

// Deck loads addressed to a chapter (/#events, the info pages' "Take me
// there") glide there once the curtain lifts and the pins have measured.
if (!standalone) {
  const chapter = location.hash.match(/^#([a-z-]+)$/)?.[1]
  if (chapter) {
    const go = () => window.setTimeout(() => scrollToId(chapter), 650)
    if ((window as { __cgsShown?: boolean }).__cgsShown) go()
    else window.addEventListener(BOOTED_EVENT, go, { once: true })
  }
}
