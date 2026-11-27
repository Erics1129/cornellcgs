// Vite plugin: makes index.html the film site's page (SITE.md, "The real repo"), at build time and in dev.
//
// index.html is a template with comment markers; this plugin fills them from what scripts/film-sync.mjs copied:
//   src/film-shell/site.html   the redesign's page: its inline loader (style + .boot-loader), #film, the calm check
//   src/film-shell/head.html   the head made by the words builder (title, description, canonical, Open Graph, icons)
//   src/film-shell/words.html  every word of the site as plain HTML (<main id="words">, between words:begin/end)
//   src/film-shell/meta.json   per-route title, description and share picture (scripts/stubs.mjs reads it)
//   public/film/preload.json   the modules the first screen needs, in order (modulepreload links)
// and adds the import map (three -> /film/vendor/). It runs AFTER Vite's own HTML processing ('post'), so Vite never
// rewrites the words, the loader or their styles. A missing head or words file is said plainly and a fallback is
// used; a missing site.html fails the build (there would be no film site). In dev, a mini game's address gets
// game-shell.html instead (on the live site each game has its own page, scripts/stubs.mjs).
//
// Every injected part is wrapped in <!--film:NAME--> ... <!--/film:NAME--> so stubs.mjs and film-check.mjs can find it.
import fs from 'node:fs'
import path from 'node:path'

export const ORIGIN = 'https://cornellcgs.org'
export const FILM = '/film/'
export const IMPORT_MAP = { imports: { three: '/film/vendor/three.module.min.js', 'three/addons/': '/film/vendor/addons/' } }

const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null)
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/** A URL inside the tree as written in picker/ ('site/site.css', './kit/x.png') -> where it is served ('/film/site/site.css'). */
export function treeUrl(v) {
  const s = String(v).trim()
  if (!s || /^([a-z][a-z0-9+.-]*:|\/|#|\?)/i.test(s)) return s // absolute, root-relative, fragment, query, data:, mailto: ...
  return FILM + s.replace(/^(\.\/)+/, '')
}
/** The same, for a picture a crawler fetches (og:image): absolute. */
export function absoluteUrl(v) {
  const s = treeUrl(v)
  return s.startsWith('/') && !s.startsWith('//') ? ORIGIN + s : s
}
/** Rewrite the relative URLs of a piece of the tree's HTML (href, src, poster, srcset, url() in styles). */
export function rewriteUrls(html) {
  return html
    .replace(/\b(href|src|poster)\s*=\s*"([^"]*)"/gi, (m, a, v) => `${a}="${treeUrl(v)}"`)
    .replace(/\b(href|src|poster)\s*=\s*'([^']*)'/gi, (m, a, v) => `${a}='${treeUrl(v)}'`)
    .replace(/\bsrcset\s*=\s*"([^"]*)"/gi, (m, v) => `srcset="${v.split(',').map((p) => { const [u, ...d] = p.trim().split(/\s+/); return [treeUrl(u), ...d].join(' ') }).join(', ')}"`)
    .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, q, v) => `url(${q}${treeUrl(v)}${q})`)
    // pictures for crawlers and link previews must be absolute
    .replace(/(<meta\b[^>]*\b(?:property|name)\s*=\s*"(?:og:image(?::secure_url)?|twitter:image)"[^>]*\bcontent\s*=\s*")([^"]*)(")/gi, (m, a, v, b) => a + absoluteUrl(v) + b)
    .replace(/(<meta\b[^>]*\bcontent\s*=\s*")([^"]*)("[^>]*\b(?:property|name)\s*=\s*"(?:og:image(?::secure_url)?|twitter:image)")/gi, (m, a, v, b) => a + absoluteUrl(v) + b)
}

/** The inner HTML of <tag>...</tag> (the first one), or null. */
function inner(html, tag) {
  const open = new RegExp(`<${tag}\\b[^>]*>`, 'i').exec(html)
  if (!open) return null
  const close = html.toLowerCase().lastIndexOf(`</${tag}>`)
  return close > open.index ? html.slice(open.index + open[0].length, close) : null
}
/** What lies between two comment markers (<!-- name:begin ... --> and <!-- name:end -->), or null. */
function between(html, name) {
  const a = new RegExp(`<!--\\s*${name}:begin[\\s\\S]*?-->`).exec(html)
  const b = new RegExp(`<!--\\s*${name}:end\\s*-->`).exec(html)
  return a && b && b.index > a.index ? html.slice(a.index + a[0].length, b.index) : null
}
/** Head elements by kind, so two sources never both write one (a second title or description). */
const KINDS = [
  ['charset', /<meta\b[^>]*\bcharset\s*=[^>]*>/gi],
  ['viewport', /<meta\b[^>]*\bname\s*=\s*["']viewport["'][^>]*>/gi],
  ['host', /<meta\b[^>]*\bname\s*=\s*["']cgs-host["'][^>]*>/gi],
  ['importmap', /<script\b[^>]*\btype\s*=\s*["']importmap["'][^>]*>[\s\S]*?<\/script>/gi],
  // site.html's own start (<script type="module" src="site/main.js">): src/main.tsx starts the site on the live host
  ['entry', /<script\b(?=[^>]*\btype\s*=\s*["']module["'])(?=[^>]*\bsrc\s*=\s*["'][^"']*site\/main\.js["'])[^>]*>\s*<\/script>/gi],
  ['base', /<base\b[^>]*>/gi],
  ['title', /<title\b[^>]*>[\s\S]*?<\/title>/gi],
  ['description', /<meta\b[^>]*\bname\s*=\s*["']description["'][^>]*>/gi],
  ['theme', /<meta\b[^>]*\bname\s*=\s*["']theme-color["'][^>]*>/gi],
  ['icon', /<link\b[^>]*\brel\s*=\s*["'](?:shortcut )?icon["'][^>]*>/gi],
  ['canonical', /<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*>/gi],
  ['robots', /<meta\b[^>]*\bname\s*=\s*["']robots["'][^>]*>/gi],
]
const has = (html, kind) => { const re = KINDS.find((k) => k[0] === kind)[1]; re.lastIndex = 0; return re.test(html) }
function drop(html, kinds) {
  for (const [k, re] of KINDS) if (kinds.includes(k)) html = html.replace(re, '')
  return html
}
const tidy = (s) => s.replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, '\n\n').trim()

/** The first-screen modules, as modulepreload links (public/film/preload.json, written by film-sync). */
function preloadLinks(preload) {
  const list = (preload && Array.isArray(preload.modules) ? preload.modules : []).filter((u) => typeof u === 'string' && u.startsWith(FILM))
  return list.map((u) => `<link rel="modulepreload" href="${esc(u)}" />`).join('\n    ')
}

/**
 * Read the shell. { site, head, words, meta, preload, notes: [plain sentences about what is missing] }.
 * repo: the repo root.
 */
export function readShell(repo) {
  const dir = path.join(repo, 'src/film-shell')
  const notes = []
  const site = read(path.join(dir, 'site.html'))
  const headFile = read(path.join(dir, 'head.html'))
  const wordsFile = read(path.join(dir, 'words.html'))
  let meta = null
  try { meta = JSON.parse(read(path.join(dir, 'meta.json')) || 'null') } catch (e) { notes.push('src/film-shell/meta.json is not valid JSON: ' + e.message) }
  let preload = null
  try { preload = JSON.parse(read(path.join(repo, 'public/film/preload.json')) || 'null') } catch (e) { notes.push('public/film/preload.json is not valid JSON: ' + e.message) }
  if (!headFile) notes.push('site/head.html is missing (the words builder has not written it yet): the page uses a fallback head (title, description, canonical and Open Graph text from site.html and meta.json; no share picture unless meta.json names one).')
  const words = wordsFile ? (between(wordsFile, 'words') ?? (/<main\b[^>]*\bid\s*=\s*["']words["']/i.test(wordsFile) ? wordsFile : null)) : null
  if (!wordsFile) notes.push("site/words.html is missing: the page carries site.html's own <main id=\"words\"> instead.")
  else if (!words) notes.push('site/words.html has no <!-- words:begin --> ... <!-- words:end --> block: the page carries site.html\'s own words instead.')
  if (!meta) notes.push('site/meta.json is missing: every page keeps the titles and descriptions written in scripts/stubs.mjs.')
  if (!preload) notes.push('public/film/preload.json is missing: no modulepreload links (run node scripts/film-sync.mjs).')
  let head = null
  if (headFile) head = between(headFile, 'head') ?? inner(headFile, 'head') ?? headFile
  return { site, head, words, meta, preload, notes }
}

/** The fallback head when site/head.html does not exist yet: true words only (site.html's own title and description). */
function fallbackHead(siteHead, meta, repo) {
  const home = (meta && (meta.routes ? meta.routes['/'] : Array.isArray(meta) ? meta.find((m) => m.route === '/') : meta['/'])) || {}
  const title = home.title || (/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(siteHead) || [])[1] || 'Cornell Computational Game Society'
  const desc = home.description || (/<meta\b[^>]*\bname\s*=\s*["']description["'][^>]*\bcontent\s*=\s*"([^"]*)"/i.exec(siteHead) || [])[1] || ''
  const icon = fs.existsSync(path.join(repo, 'public/film/site/icons/favicon.svg'))
    ? '<link rel="icon" type="image/svg+xml" href="/film/site/icons/favicon.svg" />'
    : '<link rel="icon" type="image/webp" href="/assets/brand/voxel-cube-small.webp" />'
  const image = home.image ? `\n<meta property="og:image" content="${esc(absoluteUrl(home.image))}" />` : ''
  return `<title>${title}</title>
<meta name="description" content="${desc}" />
<link rel="canonical" href="${ORIGIN}/" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${desc}" />
<meta property="og:url" content="${ORIGIN}/" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Cornell Computational Game Society" />${image}
${icon}`
}

const ORG_LD = `<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[{"@type":"Organization","@id":"https://cornellcgs.org/#org","name":"Cornell Computational Game Society","alternateName":["Cornell CGS","CGS","CGS Cornell","cornellcgs","cgscornell","cornellcgs.org"],"url":"https://cornellcgs.org/","description":"A Cornell student club that builds game AI and mini games."},{"@type":"WebSite","@id":"https://cornellcgs.org/#site","name":"Cornell Computational Game Society","alternateName":["Cornell CGS","cornellcgs"],"url":"https://cornellcgs.org/","publisher":{"@id":"https://cornellcgs.org/#org"}}]}
</script>`

/**
 * index.html (after Vite) + the shell -> the film site's page. Throws when site.html is missing.
 * Returns { html, notes }.
 */
export function assembleFilmPage(template, repo) {
  const shell = readShell(repo)
  if (!shell.site) throw new Error('src/film-shell/site.html is missing: run `node scripts/film-sync.mjs` first (it copies the film site into public/film/ and its page into src/film-shell/).')
  const siteHead = inner(shell.site, 'head') || ''
  const siteBody = inner(shell.site, 'body') || ''
  const htmlAttrs = (/<html\b([^>]*)>/i.exec(shell.site) || [])[1] || ' lang="en"'

  // the head: the words builder's head (or the fallback), then what site.html adds that the head does not already say
  const head = rewriteUrls(drop(shell.head || fallbackHead(siteHead, shell.meta, repo), ['charset', 'viewport', 'host', 'importmap', 'entry', 'base']))
  const already = KINDS.map((k) => k[0]).filter((k) => has(head, k))
  const loader = rewriteUrls(drop(siteHead, ['charset', 'viewport', 'host', 'importmap', 'entry', 'base', 'title', 'description', 'canonical', 'robots', ...already]))
  const ld = /application\/ld\+json/i.test(head) ? '' : '\n' + ORG_LD
  const fonts = /fonts\.gstatic\.com/.test(head + loader) ? '' : '\n<link rel="preconnect" href="https://fonts.googleapis.com" />\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />'

  // the body: site.html's, its words replaced by words.html, its module entry removed (src/main.tsx starts the site)
  let body = drop(siteBody, ['entry'])
  const words = shell.words && shell.words.trim()
  const m = /<main\b[^>]*\bid\s*=\s*["']words["'][^>]*>/i.exec(body)
  if (m && words) {
    const end = body.indexOf('</main>', m.index)
    if (end < 0) throw new Error("site.html's <main id=\"words\"> has no </main>")
    body = body.slice(0, m.index) + '<!--film:words-->\n' + words + '\n<!--/film:words-->' + body.slice(end + 7)
  } else if (!m && words) body = '<!--film:words-->\n' + words + '\n<!--/film:words-->\n' + body
  body = rewriteUrls(body)

  const part = (name, s) => `<!--film:${name}-->\n${tidy(s)}\n<!--/film:${name}-->`
  const fill = (html, name, s) => {
    const marker = `<!--film:${name}-->`
    if (!html.includes(marker)) throw new Error(`index.html has no ${marker} marker`)
    return html.replace(marker, () => part(name, s))
  }
  let html = template.replace(/<html\b[^>]*>/i, `<html${htmlAttrs}>`)
  html = fill(html, 'head', head + ld + fonts)
  html = fill(html, 'importmap', `<script type="importmap">${JSON.stringify(IMPORT_MAP)}</script>`)
  html = fill(html, 'loader', loader)
  html = fill(html, 'preload', preloadLinks(shell.preload))
  html = fill(html, 'body', body)
  return { html, notes: shell.notes }
}

/** The mini games' addresses (src/film-routes.json), for dev. */
function gamePaths(repo) {
  try { return new Set(Object.values(JSON.parse(fs.readFileSync(path.join(repo, 'src/film-routes.json'), 'utf8')).games).map((s) => '/' + s)) } catch { return new Set() }
}

export function filmShell({ repo }) {
  const isIndex = (ctx) => path.resolve(ctx.filename || '') === path.join(repo, 'index.html')
  let told = false
  return [
    {
      // dev only: a mini game's address is served the game shell, as its own page is on the live site
      name: 'cgs-film-shell:games',
      apply: 'serve',
      transformIndexHtml: {
        order: 'pre',
        handler(html, ctx) {
          if (!isIndex(ctx)) return html
          const p = String(ctx.originalUrl || ctx.path || '/').split(/[?#]/)[0].replace(/\/+$/, '') || '/'
          if (gamePaths(repo).has(p)) return fs.readFileSync(path.join(repo, 'game-shell.html'), 'utf8')
          return html
        },
      },
    },
    {
      name: 'cgs-film-shell',
      transformIndexHtml: {
        order: 'post',
        handler(html, ctx) {
          if (!isIndex(ctx) || !html.includes('<!--film:body-->')) return html // the game shell (dev), the admin
          const { html: out, notes } = assembleFilmPage(html, repo)
          if (!told || ctx.server == null) for (const n of notes) console.warn('\x1b[33m[film] ' + n + '\x1b[0m')
          told = true
          return out
        },
      },
    },
  ]
}
