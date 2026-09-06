/**
 * GitHub as the server: the admin reads and writes files in the content repo
 * through the GitHub Contents API with a fine-grained token that can touch
 * that one repo and nothing else. The token itself is stored in the repo,
 * encrypted under the admin passcode (`admin-key.json`, written once by
 * `npm run admin:connect`), so any device that knows the passcode connects.
 */
import { CONTENT_REPO, rawUrl } from '../lib/contentRepo'

const API = `https://api.github.com/repos/${CONTENT_REPO.owner}/${CONTENT_REPO.repo}`

export class GhError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function gh(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        ...(init.headers ?? {}),
      },
    })
  } catch {
    throw new GhError(0, 'GitHub is unreachable from this network.')
  }
  return res
}

/* ------------------------------------------------------------- base64 */

export function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64.replace(/\s/g, ''))
  const out = new Uint8Array(new ArrayBuffer(s.length))
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

/* -------------------------------------------------------------- files */

export type GhFile = { sha: string; text: string }

/** A file's text and version, or null when it does not exist yet. */
export async function getFile(token: string, path: string): Promise<GhFile | null> {
  const res = await gh(token, `/contents/${path}?ref=${CONTENT_REPO.branch}&t=${Date.now()}`, { cache: 'no-store' })
  if (res.status === 404) return null
  if (!res.ok) throw new GhError(res.status, await reason(res))
  const body = (await res.json()) as { sha: string; content?: string; encoding?: string }
  const text = body.content && body.encoding === 'base64' ? new TextDecoder().decode(fromBase64(body.content)) : ''
  return { sha: body.sha, text }
}

/** Create or replace a file; `sha` is the version being replaced (a mismatch is a conflict). */
export async function putFile(
  token: string,
  path: string,
  content: Uint8Array | string,
  message: string,
  sha?: string,
): Promise<{ sha: string }> {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content
  const res = await gh(token, `/contents/${path}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, content: toBase64(bytes), branch: CONTENT_REPO.branch, ...(sha ? { sha } : {}) }),
  })
  if (res.status === 409 || res.status === 422) {
    throw new GhError(409, 'Someone else published since you loaded this page. Reload to see their version, then make your change again.')
  }
  if (!res.ok) throw new GhError(res.status, await reason(res))
  const body = (await res.json()) as { content: { sha: string } }
  return { sha: body.content.sha }
}

/** Does the token still open the content repo for writing? */
export async function verifyToken(token: string): Promise<void> {
  const res = await gh(token, '')
  if (res.status === 401) throw new GhError(401, 'The saved GitHub connection has expired or was revoked.')
  if (!res.ok) throw new GhError(res.status, await reason(res))
  const body = (await res.json()) as { permissions?: { push?: boolean } }
  if (body.permissions && body.permissions.push === false) {
    throw new GhError(403, 'The saved GitHub connection can read the content repo but not write to it.')
  }
}

async function reason(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string }
    if (body.message) return `GitHub said: ${body.message}`
  } catch {
    /* not JSON */
  }
  return `GitHub answered with HTTP ${res.status}.`
}

/* --------------------------------------------------------- the key */

export type KeyBlob = { v: 1; kdf: 'PBKDF2-SHA256'; iterations: number; salt: string; iv: string; data: string }

export const KEY_FILE = 'admin-key.json'

/** The encrypted connection, or null when nobody has run admin:connect yet. */
export async function fetchKeyBlob(): Promise<KeyBlob | null> {
  let res: Response
  try {
    res = await fetch(`${rawUrl(KEY_FILE)}?t=${Date.now()}`, { cache: 'no-store' })
  } catch {
    throw new GhError(0, 'GitHub is unreachable from this network.')
  }
  if (res.status === 404) return null
  if (!res.ok) throw new GhError(res.status, `Could not read the connection file (HTTP ${res.status}).`)
  const blob = (await res.json()) as KeyBlob
  if (blob.v !== 1 || blob.kdf !== 'PBKDF2-SHA256') throw new GhError(500, 'The connection file has an unknown format.')
  return blob
}

/** Turns the passcode into the token — or throws when the passcode is wrong. */
export async function unlock(blob: KeyBlob, passcode: string): Promise<string> {
  const enc = new TextEncoder()
  const base = await crypto.subtle.importKey('raw', enc.encode(passcode.normalize('NFKC')), 'PBKDF2', false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(blob.salt), iterations: blob.iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(blob.iv) }, key, fromBase64(blob.data))
    return new TextDecoder().decode(plain).trim()
  } catch {
    throw new GhError(401, 'Wrong passcode.')
  }
}
