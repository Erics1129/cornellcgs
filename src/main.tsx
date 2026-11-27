// The site's entry (the deploy looks for assets/main-*.js in dist/index.html). It decides which kind of page this is:
// - a mini game (/minigames/ and every game): src/game-main.tsx, exactly as before the film site. On the live site
//   those pages are built from game-shell.html and load the game entry directly; this branch serves them in dev
//   and whenever the film's page is opened at a game's address.
// - every other address: the film site (src/film-site.ts), the tree that scripts/film-sync.mjs puts in public/film/.
// The admin page is its own entry (admin/index.html, src/admin/main.tsx) and never comes here.
import { games } from './film-routes.json'
import { startFilmSite } from './film-site'

// Tell the index.html boot guard we made it, and tidy its recovery param.
const w = window as unknown as { __cgsBooted?: boolean; __cgsBootTimer?: number; __cgsPage?: string }
w.__cgsBooted = true
if (w.__cgsBootTimer) window.clearTimeout(w.__cgsBootTimer)
if (location.search.includes('rl=')) {
  const u = new URL(location.href)
  u.searchParams.delete('rl')
  history.replaceState(null, '', u.toString())
}

const gamePaths = new Set(Object.values(games).map((slug) => '/' + slug))
const declared = w.__cgsPage
const here = location.pathname.replace(/\/+$/, '') || '/'
const isGame = (declared !== undefined && declared in games) || gamePaths.has(here)

if (isGame) void import('./game-main')
else void startFilmSite()
