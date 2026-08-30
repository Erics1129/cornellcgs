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
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
