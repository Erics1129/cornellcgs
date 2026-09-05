/**
 * Live content — the words and portraits the board edits at /admin/.
 *
 * `src/content.ts` stays the compiled default for every field. At boot the
 * site asks the API (a Cloudflare Worker on this domain, `/api/content`) for
 * the published document and writes it INTO the exported content objects, in
 * place, before React renders — so every component keeps importing from
 * `../content` and never knows the difference. No API, a slow API or a
 * malformed document all leave the defaults untouched.
 *
 * The admin page uses the same module the other way round: `snapshot()` is
 * the editable document (defaults merged with what is published), and the
 * published document is whatever the admin last saved.
 */
import * as content from '../content'

/**
 * The exports the admin may edit — everything that is words or pictures and
 * is actually rendered somewhere. Order = the admin's section list, everyday
 * tasks first. (heroTitle and memberCountries exist in content.ts but no
 * component reads them, so they are not offered.)
 */
export const EDITABLE = [
  'people',
  'team',
  'events',
  'pages',
  'join',
  'vision',
  'advisors',
  'typing',
  'whoWeAre',
  'whatWeDo',
  'mlProcess',
  'world',
  'contact',
  'hero',
  'site',
] as const

/**
 * Fields kept in the document (so it round-trips) but hidden from the admin:
 * either nothing on the site reads them, or the site overrides them in code
 * (the hero buttons scroll to fixed chapters whatever their href says).
 */
const HIDDEN_PATHS = new Set([
  'site.name',
  'site.fullName',
  'site.eyebrow',
  'site.domain',
  'hero.ctaPrimary.href',
  'hero.ctaSecondary.href',
  'whoWeAre.photoPlaceholder',
  'contact.instagram',
  'contact.instagramUrl',
  'contact.wechat',
  'contact.inboxes',
])

export function isHiddenPath(path: Array<string | number>): boolean {
  return HIDDEN_PATHS.has(path.filter((p): p is string => typeof p === 'string').join('.'))
}

/** Sections whose `heading` renders *asterisks* as an italic word. */
export const EMPHASIS_HEADINGS = new Set(['whoWeAre', 'whatWeDo', 'events', 'world', 'people', 'join'])

export type EditableKey = (typeof EDITABLE)[number]
export type ContentDoc = Partial<Record<EditableKey, unknown>>

/** Fields that are code, not copy — never overwritten, never shown. */
const PROTECTED: Partial<Record<EditableKey, string[]>> = {
  site: ['footerLine'],
}

const store = content as unknown as Record<string, unknown>

/** Human titles for the admin's section list. */
export const TITLES: Record<EditableKey, string> = {
  people: 'Board cards',
  team: 'Our Team roster',
  events: 'Events',
  pages: 'Info pages',
  join: 'Join',
  vision: 'What we envision',
  advisors: 'Advisors',
  typing: 'Hero typing line',
  whoWeAre: 'Who we are',
  whatWeDo: 'What we do',
  mlProcess: 'ML process',
  world: 'World',
  contact: 'Contact email',
  hero: 'Hero buttons',
  site: 'Credit line',
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** A JSON-safe deep copy — functions (and anything else JSON drops) vanish. */
function jsonClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

/** The editable document as it stands right now (defaults + whatever was applied). */
export function snapshot(): Record<EditableKey, unknown> {
  const out = {} as Record<EditableKey, unknown>
  for (const key of EDITABLE) {
    const v = jsonClone(store[key])
    const skip = PROTECTED[key]
    if (skip && isPlainObject(v)) for (const k of skip) delete v[k]
    out[key] = v
  }
  return out
}

/**
 * Writes a published document into the content exports, in place.
 * Arrays are replaced wholesale (a roster is a whole list); objects take the
 * document's keys one by one so a field the document lacks keeps its default
 * and protected fields are never touched. Anything not an editable key, or of
 * the wrong shape, is ignored.
 */
export function applyOverrides(doc: unknown): EditableKey[] {
  if (!isPlainObject(doc)) return []
  const applied: EditableKey[] = []
  for (const key of EDITABLE) {
    if (!(key in doc)) continue
    const incoming = doc[key]
    const target = store[key]
    if (Array.isArray(target)) {
      if (!Array.isArray(incoming)) continue
      target.splice(0, target.length, ...jsonClone(incoming))
      applied.push(key)
    } else if (isPlainObject(target) && isPlainObject(incoming)) {
      const skip = new Set(PROTECTED[key] ?? [])
      for (const k of Object.keys(incoming)) {
        if (skip.has(k)) continue
        // every content object has a fixed set of keys (pages: the ids the
        // site routes) — a key the code does not know is dropped
        if (!(k in target)) continue
        // a field cannot change kind (a list stays a list)
        if (Array.isArray(target[k]) !== Array.isArray(incoming[k])) continue
        target[k] = jsonClone(incoming[k])
      }
      applied.push(key)
    }
  }
  return applied
}

/** Where the API lives — same origin in production, the same path in dev (proxied). */
export const API = '/api'

/* ---------------------------------------------------------------- drafts */

/** The frame (or window) the admin's Preview renders the site in. */
export const DRAFT_WINDOW_NAME = 'cgs-draft-preview'

/**
 * The site opened by the admin's "Preview": by window name first — it
 * survives clicking around inside the preview, where `?draft=1` would not.
 */
export function isDraftPreview(): boolean {
  return window.name === DRAFT_WINDOW_NAME || new URLSearchParams(location.search).has('draft')
}

const DRAFT_READY = 'cgs-draft-ready'
const DRAFT_DOC = 'cgs-draft'

/**
 * In a draft preview the page asks the window that opened it (the admin, same
 * origin) for the unpublished document and applies it on top of what is
 * published — so an edit can be seen on the real page before anyone presses
 * Publish. Only same-origin messages are accepted; with no answer the page
 * simply renders what is live.
 */
export function loadDraft(timeoutMs = 4000): Promise<EditableKey[]> {
  return new Promise((resolve) => {
    // opened in a tab by the admin, or embedded by it in a frame
    const opener = (window.opener as Window | null) ?? (window.parent !== window ? window.parent : null)
    if (!opener) return resolve([])
    let done = false
    const finish = (keys: EditableKey[]) => {
      if (done) return
      done = true
      window.removeEventListener('message', onMessage)
      window.clearTimeout(timer)
      resolve(keys)
    }
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin) return
      const data = e.data as { type?: string; doc?: unknown } | null
      if (!data || data.type !== DRAFT_DOC) return
      finish(applyOverrides(data.doc))
    }
    const timer = window.setTimeout(() => finish([]), timeoutMs)
    window.addEventListener('message', onMessage)
    try {
      opener.postMessage({ type: DRAFT_READY }, location.origin)
    } catch {
      finish([])
    }
  })
}

/** The url a preview frame or tab loads. */
export const DRAFT_URL = '/?draft=1'

/**
 * The admin's side: answers every same-origin preview (a frame it embeds or a
 * tab it opened) that asks for the draft, with the draft as it stands at that
 * moment. Returns a function that removes the listener.
 */
export function answerDraftRequests(getDoc: () => unknown): () => void {
  const onMessage = (e: MessageEvent) => {
    if (e.origin !== location.origin) return
    const data = e.data as { type?: string } | null
    if (!data || data.type !== DRAFT_READY) return
    ;(e.source as Window | null)?.postMessage({ type: DRAFT_DOC, doc: getDoc() }, location.origin)
  }
  window.addEventListener('message', onMessage)
  return () => window.removeEventListener('message', onMessage)
}

/** A small fixed pill so a draft preview is never mistaken for the live site. */
export function markDraftPreview(): void {
  const pill = document.createElement('div')
  pill.textContent = 'Draft preview · not published'
  pill.setAttribute('role', 'status')
  pill.style.cssText =
    'position:fixed;left:50%;bottom:1rem;transform:translateX(-50%);z-index:2147483647;' +
    'padding:.5rem .9rem;border-radius:999px;background:#b86e00;color:#fff;' +
    'font:600 .8rem/1 system-ui,sans-serif;letter-spacing:.02em;box-shadow:0 8px 24px -8px rgba(0,0,0,.6);pointer-events:none'
  document.body.appendChild(pill)
}

/**
 * Fetches the published document and applies it. Resolves once the content
 * exports are final, whatever happened; never throws, never waits longer
 * than `timeoutMs` (the loader curtain covers the wait).
 */
export async function loadLiveContent(timeoutMs = 1800): Promise<EditableKey[]> {
  if (typeof fetch !== 'function') return []
  const ctl = new AbortController()
  const timer = window.setTimeout(() => ctl.abort(), timeoutMs)
  try {
    // index.html starts this request before the bundle downloads, so the
    // round trip overlaps the download instead of following it
    const early = (window as { __cgsContent?: Promise<Response | null> }).__cgsContent
    const res = await Promise.race([
      early ? early.then((r) => r ?? Promise.reject(new Error('early fetch failed'))) : fetch(`${API}/content`, { cache: 'no-store', signal: ctl.signal }),
      new Promise<never>((_, reject) => ctl.signal.addEventListener('abort', () => reject(new Error('timeout')))),
    ])
    if (!res.ok) return []
    const type = res.headers.get('content-type') ?? ''
    if (!type.includes('json')) return []
    const doc: unknown = await res.json()
    return applyOverrides(doc)
  } catch {
    return []
  } finally {
    window.clearTimeout(timer)
  }
}
