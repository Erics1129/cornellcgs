// Post-build: write a real page (dist/<path>/index.html) for every address of the site, so each is a crawlable URL
// with its own title, description, canonical and share picture (the way Google wants them for sitelinks), and every
// old address keeps working.
//
// Two kinds of page (src/film-routes.json is the list):
// - the mini games (/minigames/ and each game): built from dist/game-shell.html, the mini games' page as index.html
//   was before the film site, with the same title, description, picture, first-paint colour and window.__cgsPage as
//   before; the old dash addresses (/ink-maze/ ...) forward to them as before.
// - the film site (everything else): built from dist/index.html. The old addresses (/whoWeAre/, /whatWeDo/,
//   /mlProcess/, /events/, /world/, /ourTeam/, /advisors/, /join/, /contact/, /privacy/, /terms/), the film site's
//   own short ones (/about/, /work/, /team/, /games/) and one per scene of the film (/film/<slot>/). Title,
//   description, canonical and picture come from src/film-shell/meta.json (made by the words builder from
//   src/content.ts) when it says them, else the words below. window.__cgsRoute tells the film site the route.
// Then the site's root files from src/film-shell/static/ (404.html, robots.txt, sitemap.xml) replace public/'s copies
// in dist/. Running it twice gives the same pages.
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// Optional out-dir argument (node scripts/stubs.mjs /path/to/dist) lets a scratch build be verified without touching the repo's dist/.
const dist = process.argv[2] ? resolve(process.argv[2]) : join(root, 'dist')
const ORIGIN = 'https://cornellcgs.org'
const ROUTES = JSON.parse(readFileSync(join(root, 'src/film-routes.json'), 'utf8'))
const SHELL = join(root, 'src/film-shell')
let META = null
try { META = JSON.parse(readFileSync(join(SHELL, 'meta.json'), 'utf8')) } catch { console.warn('stubs: src/film-shell/meta.json is missing: the film pages keep the words written here') }

// camelCase public slugs (mirror src/content.ts pageSlugs)
const SLUGS = {
  'who-we-are': 'whoWeAre',
  'what-we-do': 'whatWeDo',
  'ml-process': 'mlProcess',
  events: 'events',
  world: 'world',
  people: 'ourTeam',
  advisors: 'advisors',
  join: 'join',
  contact: 'contact',
  privacy: 'privacy',
  terms: 'terms',
  ...ROUTES.games,
}

// Titles/descriptions state nothing the site itself doesn't already say. (The film pages use these only when
// meta.json does not name the route.)
const PAGES = {
  'who-we-are': {
    title: 'Who We Are — Cornell Computational Game Society',
    desc: 'The people and culture of the Cornell Computational Game Society (Cornell CGS).',
  },
  'what-we-do': {
    title: 'What We Do — Cornell Computational Game Society',
    desc: 'Current projects at Cornell CGS, a Guandan AI, a poker equity calculator and our own mini games.',
  },
  'ml-process': {
    title: 'Our Machine Learning Process — Cornell CGS',
    desc: 'How the Cornell Computational Game Society frames games, builds environments, trains and evaluates agents.',
  },
  events: {
    title: 'Events — Cornell Computational Game Society',
    desc: 'Events at the Cornell Computational Game Society (Cornell CGS).',
  },
  world: {
    title: 'World — Cornell Computational Game Society',
    desc: 'The worldwide community of the Cornell Computational Game Society.',
  },
  advisors: {
    title: 'Advisors — Cornell Computational Game Society',
    desc: 'Advisors and team of the Cornell Computational Game Society (Cornell CGS).',
  },
  privacy: {
    title: 'Privacy — Cornell Computational Game Society',
    desc: 'What cornellcgs.org stores when you sign in to a mini game, and how to delete it.',
  },
  terms: {
    title: 'Terms — Cornell Computational Game Society',
    desc: 'Terms of use for cornellcgs.org and its mini games.',
  },
  people: {
    title: 'Our Team — Cornell Computational Game Society',
    desc: 'The board and members of the Cornell Computational Game Society (Cornell CGS).',
  },
  join: {
    title: 'Join — Cornell Computational Game Society',
    desc: 'How to join the Cornell Computational Game Society. Any major can apply: email recruitment@cornellcgs.org.',
  },
  minigames: {
    title: 'Mini games · Cornell Computational Game Society',
    desc: 'Play Carrot Defense 3D, Forge or Fold, and Ink Maze from the Cornell Computational Game Society, on your computer or phone.',
    image: '/assets/minigames/ink-maze/cover.png',
  },
  'forge-or-fold': {
    title: 'Forge or Fold — Cornell CGS',
    desc: 'A ten-day 3D forging game. Heat, strike, sell and learn when to stop. Keep your best knife.',
    // the game page is dark; a white first paint flashes before the app mounts
    background: '#0d0c0b',
  },
  'carrot-defense': {
    title: 'Carrot Defense 3D — Cornell CGS',
    desc: 'Protect the carrot across 24 landscapes with 20 plant families and five guardian challenges, including Asuna. A wave track shows every wave before it arrives.',
    image: '/assets/minigames/carrot/01-garden-keyart.jpg',
  },
  // the numbers must match src/minigames/inkmaze/levels.ts
  'ink-maze': {
    title: 'Ink Maze · Cornell Computational Game Society',
    desc: 'Roll a ball to color every floor block before the ink runs out. There are 25 levels on boards from 4 × 4 to 9 × 9, plus a 26th where you write code in Java, Python, JavaScript, C or C++ to solve random boards.',
    image: '/assets/minigames/ink-maze/cover.png',
  },
  contact: {
    title: 'Contact Us — Cornell Computational Game Society',
    desc: 'Contact Cornell CGS: recruitment, tech, finance, marketing and social inboxes at cornellcgs.org.',
  },
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const write = (slug, html) => {
  mkdirSync(join(dist, slug), { recursive: true })
  writeFileSync(join(dist, slug, 'index.html'), html)
}
// The old dash URL is already in Google's index — forward it for good.
const redirect = (id, slug, title) => {
  const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8" />
<title>${esc(title)}</title>
<link rel="canonical" href="${ORIGIN}/${slug}/" />
<meta http-equiv="refresh" content="0; url=/${slug}/" />
<script>location.replace('/${slug}/')</script>
</head><body></body></html>\n`
  mkdirSync(join(dist, id), { recursive: true })
  writeFileSync(join(dist, id, 'index.html'), html)
  console.log(`redirect: /${id}/ -> /${slug}/`)
}

// ---------------------------------------------------------------------------------------------- the mini games
// Exactly the stub of before, from the mini games' own page.
const gameBase = readFileSync(join(dist, 'game-shell.html'), 'utf8')
for (const id of Object.keys(ROUTES.games)) {
  const { title, desc, image, background = '#fff' } = PAGES[id]
  const slug = SLUGS[id]
  const html = gameBase
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${ORIGIN}/${slug}/$2`)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${ORIGIN}/${slug}/" />`)
    .replace('</head>', `${image ? `  <meta property="og:image" content="${ORIGIN}${image}" />\n` : ''}  <style>html{background:${background}}</style>\n  <script>window.__cgsPage='${id}'</script>\n  </head>`)
  write(slug, html)
  console.log(`stub: /${slug}/ (mini games)`)
  if (slug !== id) redirect(id, slug, title)
}

// ---------------------------------------------------------------------------------------------- the film site
const filmBase = readFileSync(join(dist, 'index.html'), 'utf8')
if (!filmBase.includes('<!--film:head-->')) throw new Error('dist/index.html is not the film page (no <!--film:head--> part): build with the film shell plugin first')
const reRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** set (or add, inside the film head) a <meta name|property="key" content="..."> */
function setMeta(html, attr, key, value) {
  const tag = `<meta ${attr}="${key}" content="${esc(value)}" />`
  const re = new RegExp(`<meta\\b(?=[^>]*\\b${attr}\\s*=\\s*["']${reRe(key)}["'])[^>]*>`, 'gi')
  if (re.test(html)) return html.replace(re, () => tag)
  return html.replace('<!--/film:head-->', `${tag}\n<!--/film:head-->`)
}
function setLink(html, rel, href) {
  const tag = `<link rel="${rel}" href="${esc(href)}" />`
  const re = new RegExp(`<link\\b(?=[^>]*\\brel\\s*=\\s*["']${reRe(rel)}["'])[^>]*>`, 'i')
  return re.test(html) ? html.replace(re, () => tag) : html.replace('<!--/film:head-->', `${tag}\n<!--/film:head-->`)
}
const absolute = (u) => (!u ? null : /^https?:\/\//.test(u) ? u : u.startsWith('/') ? ORIGIN + u : `${ORIGIN}/film/${u.replace(/^\.\//, '')}`)
const metaFor = (route) => {
  if (!META) return null
  if (META.routes && META.routes[route]) return META.routes[route]
  if (route.startsWith('/film/') && META.film) return META.film[route.slice(6)] || null
  return null
}
function filmPage({ id, path, route }) {
  const m = metaFor(route)
  const old = PAGES[id]
  const title = (m && m.title) || (old && old.title) || null
  const desc = (m && m.description) || (old && old.desc) || null
  // a scene's page (/film/<slot>/) is a view of the home page: its canonical is /
  const canonical = (m && m.canonical) || (route.startsWith('/film/') ? `${ORIGIN}/` : `${ORIGIN}/${ROUTES.canonical[route] || path}/`)
  const image = absolute(m && (m.image || m.file))
  let html = filmBase
  if (title) {
    html = html.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`)
    html = setMeta(html, 'property', 'og:title', title)
    html = setMeta(html, 'name', 'twitter:title', title)
  }
  if (desc) {
    html = setMeta(html, 'name', 'description', desc)
    html = setMeta(html, 'property', 'og:description', desc)
    html = setMeta(html, 'name', 'twitter:description', desc)
  }
  html = setLink(html, 'canonical', canonical)
  html = setMeta(html, 'property', 'og:url', canonical)
  if (image) {
    html = setMeta(html, 'property', 'og:image', image)
    html = setMeta(html, 'name', 'twitter:image', image)
    if (m && m.imageAlt) { html = setMeta(html, 'property', 'og:image:alt', m.imageAlt); html = setMeta(html, 'name', 'twitter:image:alt', m.imageAlt) }
  }
  html = html.replace('</head>', `<script>window.__cgsRoute=${JSON.stringify(route)};window.__cgsPage=${JSON.stringify(id)}</script>\n</head>`)
  write(path, html)
  console.log(`stub: /${path}/ (film ${route}${m ? '' : ', words from this script'})`)
}
const pages = [...ROUTES.film]
// every address meta.json names for a route keeps working too (but /minigames/ stays the mini games' page)
if (META && META.routes) for (const [route, m] of Object.entries(META.routes)) for (const p of [m.path, ...(m.also || [])]) {
  const path = String(p || '').replace(/^\/+|\/+$/g, '')
  if (!path || Object.values(ROUTES.games).includes(path) || pages.some((x) => x.path === path)) continue
  pages.push({ id: path, path, route })
  console.warn(`stubs: meta.json names /${path}/ for ${route}; src/film-routes.json does not (added)`)
}
// one page per scene of the film (a shared link opens the film at that scene); never over a folder of the tree
const treeDir = existsSync(join(dist, 'film')) ? join(dist, 'film') : join(root, 'public/film')
const TREE = new Set(existsSync(treeDir) ? readdirSync(treeDir) : [])
const slots = new Set(META && META.film ? Object.keys(META.film) : [])
try { for (const s of JSON.parse(readFileSync(join(SHELL, 'scenes.json'), 'utf8')).scenes) if (!s.clock) slots.add(s.slot) } catch { /* no scene list yet */ }
for (const slot of slots) {
  if (!/^[a-z0-9-]{1,40}$/.test(slot)) continue
  if (TREE.has(slot)) { console.warn(`stubs: no /film/${slot}/ page: public/film/${slot} is a folder of the tree`); continue }
  pages.push({ id: 'film-' + slot, path: `film/${slot}`, route: `/film/${slot}` })
}
for (const p of pages) {
  filmPage(p)
  const slug = p.path
  if (PAGES[p.id] && slug !== p.id && SLUGS[p.id]) redirect(p.id, slug, PAGES[p.id].title)
}

// ---------------------------------------------------------------------------------------------- root files
for (const f of ['404.html', 'robots.txt', 'sitemap.xml']) {
  const src = join(SHELL, 'static', f)
  if (existsSync(src)) { copyFileSync(src, join(dist, f)); console.log(`root: /${f} (from the film site)`) }
}

// the film's modules carry the build's version (see scripts/film-bust.mjs)
await import('./film-bust.mjs')
