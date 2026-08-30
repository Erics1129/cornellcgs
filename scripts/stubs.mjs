// Post-build: emit dist/<id>/index.html for every sub-page so each dropdown
// item is a real crawlable URL (unique title/description/canonical), the way
// Google wants them for sitelinks. Each stub is the same app bundle plus
// window.__cgsPage, which the router opens on boot.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ORIGIN = 'https://cornellcgs.org'

// Titles/descriptions state nothing the site itself doesn't already say.
const PAGES = {
  'who-we-are': {
    title: 'Who We Are — Cornell Computational Game Society',
    desc: 'The people and culture of the Cornell Computational Game Society (Cornell CGS).',
  },
  'what-we-do': {
    title: 'What We Do — Cornell Computational Game Society',
    desc: 'Study nights, research, building, tournaments and talks at the Cornell Computational Game Society.',
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
  people: {
    title: 'Our Team — Cornell Computational Game Society',
    desc: 'The team — board and members of the Cornell Computational Game Society (Cornell CGS).',
  },
  join: {
    title: 'Join — Cornell Computational Game Society',
    desc: 'How to join the Cornell Computational Game Society (Cornell CGS).',
  },
  contact: {
    title: 'Contact Us — Cornell Computational Game Society',
    desc: 'Contact the Cornell Computational Game Society (Cornell CGS).',
  },
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const base = readFileSync(join(root, 'dist/index.html'), 'utf8')

for (const [id, { title, desc }] of Object.entries(PAGES)) {
  const html = base
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${ORIGIN}/${id}/$2`)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${ORIGIN}/${id}/" />`)
    .replace('</head>', `  <script>window.__cgsPage='${id}'</script>\n  </head>`)
  mkdirSync(join(root, 'dist', id), { recursive: true })
  writeFileSync(join(root, 'dist', id, 'index.html'), html)
  console.log(`stub: /${id}/`)
}
