/**
 * The admin page's storage: GitHub is the server. Everything goes through
 * the Contents API of the content repo (lib/contentRepo) with a token that
 * unlocks from `admin-key.json` with the passcode, on any device.
 */
import { KEY_FILE, GhError, fetchKeyBlob, getFile, putFile, unlock, verifyToken } from './github'
import { CONTENT_REPO, PURGE_URL, rawUrl } from '../lib/contentRepo'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const NOT_CONNECTED =
  'The editor is not connected to GitHub yet. Someone with the repo needs to run `npm run admin:connect` once (see docs/admin.md); after that any device with the passcode can publish.'

const SESSION_KEY = 'cgs-admin-session'
const SESSION_MS = 12 * 60 * 60 * 1000
const CONTENT_FILE = 'content.json'

type Session = { token: string; exp: number }

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Session
    if (!s.token || !s.exp || s.exp < Date.now()) {
      localStorage.removeItem(SESSION_KEY)
      return null
    }
    return s
  } catch {
    return null
  }
}

function writeSession(token: string) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ token, exp: Date.now() + SESSION_MS }))
  } catch {
    /* storage unavailable — the token lives for this page only */
    memory = token
  }
}

let memory: string | null = null

function token(): string {
  const s = readSession()
  if (s) return s.token
  if (memory) return memory
  throw new ApiError(401, 'unauthorized')
}

function wrap(e: unknown): ApiError {
  if (e instanceof ApiError) return e
  if (e instanceof GhError) return new ApiError(e.status, e.message)
  return new ApiError(0, (e as Error)?.message || 'Something went wrong.')
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    const err = wrap(e)
    // a token GitHub no longer accepts ends the session
    if (err.status === 401 && (readSession() || memory)) {
      localStorage.removeItem(SESSION_KEY)
      memory = null
    }
    throw err
  }
}

export const api = {
  /** resolves when a connection is held on this device */
  session: async () => {
    token()
    return { ok: true as const }
  },

  /** passcode → the token from admin-key.json → stored on this device for 12 hours */
  login: (code: string) =>
    guard(async () => {
      const blob = await fetchKeyBlob()
      if (!blob) throw new ApiError(404, NOT_CONNECTED)
      const tok = await unlock(blob, code)
      await verifyToken(tok)
      writeSession(tok)
      return { ok: true as const }
    }),

  logout: async () => {
    localStorage.removeItem(SESSION_KEY)
    memory = null
    return { ok: true as const }
  },

  /** the published document and its version (the file's sha) */
  content: () =>
    guard(async () => {
      const file = await getFile(token(), CONTENT_FILE)
      let doc: Record<string, unknown> = {}
      if (file?.text.trim()) {
        try {
          const parsed: unknown = JSON.parse(file.text)
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) doc = parsed as Record<string, unknown>
        } catch {
          /* a hand-edited, broken file counts as empty */
        }
      }
      return { doc, etag: file?.sha ?? '' }
    }),

  publish: (doc: unknown, etag: string) =>
    guard(async () => {
      const text = JSON.stringify(doc, null, 2) + '\n'
      const { sha } = await putFile(token(), CONTENT_FILE, text, 'Publish from cornellcgs.org/admin', etag || undefined)
      // the mirror caches for hours; ask it to forget (best effort)
      fetch(PURGE_URL, { mode: 'no-cors' }).catch(() => undefined)
      return { ok: true as const, bytes: text.length, etag: sha }
    }),

  reset: () =>
    guard(async () => {
      const file = await getFile(token(), CONTENT_FILE)
      await putFile(token(), CONTENT_FILE, '{}\n', 'Back to the built-in words (cornellcgs.org/admin)', file?.sha)
      return { ok: true as const }
    }),

  /** a cropped portrait → a file in images/, addressed by its content hash */
  upload: (name: string, blob: Blob) =>
    guard(async () => {
      const path = `images/${name}`
      const url = rawUrl(path)
      const existing = await getFile(token(), path)
      if (!existing) {
        const bytes = new Uint8Array(await blob.arrayBuffer())
        await putFile(token(), path, bytes, `Photo ${name} (cornellcgs.org/admin)`)
      }
      return { ok: true as const, url }
    }),

  /** where the content lives, for messages */
  repoUrl: `https://github.com/${CONTENT_REPO.owner}/${CONTENT_REPO.repo}`,
  keyFile: KEY_FILE,
}
