// Post-build: emit dist/<id>/index.html for every sub-page so each dropdown
// item is a real crawlable URL (unique title/description/canonical), the way
// Google wants them for sitelinks. Each stub is the same app bundle plus
// window.__cgsPage, which the router opens on boot.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// Optional out-dir argument (node scripts/stubs.mjs /path/to/dist) lets a scratch build be verified without touching the repo's dist/.
const dist = process.argv[2] ? resolve(process.argv[2]) : join(root, 'dist')
const ORIGIN = 'https://cornellcgs.org'

// camelCase public slugs (must mirror src/content.ts pageSlugs)
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
  minigames: 'minigames',
  'ink-maze': 'minigames/inkMaze',
  'forge-or-fold': 'minigames/forgeOrFold',
  'carrot-defense': 'minigames/carrotDefense',
}

// Titles/descriptions state nothing the site itself doesn't already say.
const PAGES = {
  'who-we-are': {
    title: 'Who We Are — Cornell Computational Game Society',
    desc: 'The people and culture of the Cornell Computational Game Society (Cornell CGS).',
  },
  'what-we-do': {
    title: 'What We Do — Cornell Computational Game Society',
    desc: 'Current projects at Cornell CGS, including a Guandan agent and a poker equity calculator, plus study nights, tournaments and talks.',
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
    title: 'Advisors \u2014 Cornell Computational Game Society',
    desc: 'Advisors and team of the Cornell Computational Game Society (Cornell CGS).',
  },
  privacy: {
    title: 'Privacy \u2014 Cornell Computational Game Society',
    desc: 'What cornellcgs.org stores when you sign in to a mini game, and how to delete it.',
  },
  terms: {
    title: 'Terms \u2014 Cornell Computational Game Society',
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
    desc: 'A seven-day 3D forging game. Heat, strike, sell and learn when to stop. Keep your best knife.',
    // the game page is dark; a white first paint flashes before the app mounts
    background: '#0d0c0b',
  },
  'carrot-defense': {
    title: 'Carrot Defense 3D — Cornell CGS',
    desc: 'Protect the carrot across twelve original 3D landscapes. Grow ten tower families, cover branching paths, and defeat three unique guardians.',
    image: '/assets/minigames/carrot/01-garden-keyart.jpg',
  },
  // the numbers must match src/minigames/inkmaze/levels.ts
  'ink-maze': {
    title: 'Ink Maze · Cornell Computational Game Society',
    desc: 'Roll a ball to color every floor block before the ink runs out. There are 20 levels, on boards from 4 × 4 to 9 × 9.',
    image: '/assets/minigames/ink-maze/cover.png',
  },
  contact: {
    title: 'Contact Us — Cornell Computational Game Society',
    desc: 'Contact Cornell CGS: recruitment, tech, finance, marketing and social inboxes at cornellcgs.org.',
  },
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const base = readFileSync(join(dist, 'index.html'), 'utf8')

for (const [id, { title, desc, image, background = '#fff' }] of Object.entries(PAGES)) {
  const slug = SLUGS[id] ?? id
  const html = base
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${ORIGIN}/${slug}/$2`)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${ORIGIN}/${slug}/" />`)
    .replace('</head>', `${image ? `  <meta property="og:image" content="${ORIGIN}${image}" />\n` : ''}  <style>html{background:${background}}</style>\n  <script>window.__cgsPage='${id}'</script>\n  </head>`)
  mkdirSync(join(dist, slug), { recursive: true })
  writeFileSync(join(dist, slug, 'index.html'), html)
  console.log(`stub: /${slug}/`)

  // The old dash URL is already in Google's index — forward it for good.
  if (slug !== id) {
    const redirect = `<!doctype html><html lang="en"><head><meta charset="UTF-8" />
<title>${esc(title)}</title>
<link rel="canonical" href="${ORIGIN}/${slug}/" />
<meta http-equiv="refresh" content="0; url=/${slug}/" />
<script>location.replace('/${slug}/')</script>
</head><body></body></html>\n`
    mkdirSync(join(dist, id), { recursive: true })
    writeFileSync(join(dist, id, 'index.html'), redirect)
    console.log(`redirect: /${id}/ -> /${slug}/`)
  }
}
