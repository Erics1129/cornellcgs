// Start the film site on cornellcgs.org (SITE.md, "The real repo"). The film site is the tree in public/film/,
// copied from the redesign's picker/ by scripts/film-sync.mjs: plain ES modules, so it is imported at run time and
// never bundled. The page already carries what it needs before this runs (index.html, scripts/vite-film-shell.mjs):
// <meta name="cgs-host" content="live"> (site/host.js: mode 'live', router 'path'), the import map (three ->
// /film/vendor/), the inline loader, every word of the site, and modulepreload links for the first screen.
import { film as FILM_PAGES } from './film-routes.json'

/** What the film site is told before its first module runs (window.__cgsFilm). */
export type FilmStart = {
  mode: 'live'
  router: 'path'
  /** the film site's route: '/', '/film/poker', '/team', '/join', '/work', '/games', '/about', '/events', '/privacy', '/terms' */
  route: string
  /** the part of that page an old address was about ('contact' for /contact/), else null */
  section: string | null
  /** the address as it was opened */
  from: string
  /** where the tree is served */
  root: string
}

const ROOT = '/film/'
const ENTRY = ROOT + 'site/main.js'

/** The film site's route for an address: '/ourTeam/' -> '/team', '/contact/' -> '/join' (section 'contact'). */
export function filmRoute(pathname: string): { route: string; section: string | null } {
  const p = pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/'
  if (p === '/' || p === '/index.html') return { route: '/', section: null }
  const scene = p.match(/^\/film\/([a-z0-9-]{1,40})$/)
  if (scene) return { route: '/film/' + scene[1], section: null }
  const page = FILM_PAGES.find((x) => '/' + x.path === p)
  if (page) return { route: page.route, section: page.section ?? null }
  return { route: p, section: null }
}

export async function startFilmSite(): Promise<void> {
  // Links from the old deck (/#p/join) went to a page by hash: forward them to its address, as before.
  const legacy = location.hash.match(/^#p\/([a-z-]+)$/)
  const old = legacy && FILM_PAGES.find((x) => x.id === legacy[1])
  if (old) {
    location.replace('/' + old.path + '/')
    return
  }
  const w = window as unknown as { __cgsRoute?: string; __cgsFilm?: Readonly<FilmStart> }
  const at = filmRoute(location.pathname)
  w.__cgsFilm = Object.freeze({
    mode: 'live',
    router: 'path',
    route: w.__cgsRoute || at.route,
    section: at.section,
    from: location.pathname,
    root: ROOT,
  } satisfies FilmStart)
  try {
    // site/main.js starts the film (or the calm page) as soon as it runs, exactly as it does in site.html
    await import(/* @vite-ignore */ ENTRY)
  } catch (e) {
    // It did not load (a page cached across a deploy, a very old browser): every word is on the page already.
    console.error('[cgs] the film site did not start', e)
    const html = document.documentElement
    html.classList.add('calm')
    html.classList.remove('boot')
  }
}
