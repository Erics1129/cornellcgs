// Post-build: emit dist/<id>/index.html for every sub-page so each dropdown
// item is a real crawlable URL (unique title/description/canonical), the way
// Google wants them for sitelinks. Each stub is the same app bundle plus
// window.__cgsPage, which the router opens on boot.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
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
}

// Titles/descriptions state nothing the site itself doesn't already say.
const PAGES = {
  'who-we-are': {
    title: 'Who We Are — Cornell Computational Game Society',
    desc: 'The people and culture of the Cornell Computational Game Society (Cornell CGS).',
  },
  'what-we-do': {
    title: 'What We Do — Cornell Computational Game Society',
    desc: 'We build game AI \u2014 the AlphaGo kind. Now playing: GuanDan. Study nights, research, tournaments and talks.',
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
  people: {
    title: 'Our Team — Cornell Computational Game Society',
    desc: 'The team — board and members of the Cornell Computational Game Society (Cornell CGS).',
  },
  join: {
    title: 'Join — Cornell Computational Game Society',
    desc: 'Any person, any study \u2014 how to join the Cornell Computational Game Society. Email recruitment@cornellcgs.org.',
  },
  contact: {
    title: 'Contact Us — Cornell Computational Game Society',
    desc: 'Contact Cornell CGS \u2014 recruitment, tech, finance, marketing and social inboxes at cornellcgs.org.',
  },
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const base = readFileSync(join(root, 'dist/index.html'), 'utf8')

for (const [id, { title, desc }] of Object.entries(PAGES)) {
  const slug = SLUGS[id] ?? id
  const html = base
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${ORIGIN}/${slug}/$2`)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${ORIGIN}/${slug}/" />`)
    .replace('</head>', `  <style>html{background:#fff}</style>\n  <script>window.__cgsPage='${id}'</script>\n  </head>`)
  mkdirSync(join(root, 'dist', slug), { recursive: true })
  writeFileSync(join(root, 'dist', slug, 'index.html'), html)
  console.log(`stub: /${slug}/`)

  // The old dash URL is already in Google's index — forward it for good.
  if (slug !== id) {
    const redirect = `<!doctype html><html lang="en"><head><meta charset="UTF-8" />
<title>${esc(title)}</title>
<link rel="canonical" href="${ORIGIN}/${slug}/" />
<meta http-equiv="refresh" content="0; url=/${slug}/" />
<script>location.replace('/${slug}/')</script>
</head><body></body></html>\n`
    mkdirSync(join(root, 'dist', id), { recursive: true })
    writeFileSync(join(root, 'dist', id, 'index.html'), redirect)
    console.log(`redirect: /${id}/ -> /${slug}/`)
  }
}
