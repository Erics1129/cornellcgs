/**
 * Player accounts: the session this browser holds, and the one way to call the
 * account Worker.
 *
 * The session is the Worker's own signed token (never the Google token), kept in
 * localStorage because GitHub Pages → workers.dev is cross-site and cookies
 * cannot work there. It is sent as `Authorization: Bearer`. A 401 means the
 * token is dead (signed out elsewhere, expired, account deleted), so it is
 * forgotten on the spot. Everything takes its dependencies as arguments so the
 * node test can run it with a fake storage and a fake fetch.
 */
export const SESSION_KEY = 'cgs-account-session-v1'
export const API_TIMEOUT_MS = 8_000
/** a JSON body at least this long goes out gzipped (a Forge run is an action log that shrinks ~10x) */
export const GZIP_FROM_BYTES = 4_096

export type Session = { token: string; expires: number; name: string; picture: string }
export type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }

export class ApiError extends Error {
  status: number
  /** seconds, from a 429 */
  retryAfter: number
  data: Record<string, unknown>
  constructor(status: number, message: string, data: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
    this.retryAfter = typeof data.retryAfter === 'number' ? data.retryAfter : 0
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError

export type SessionStore = {
  /** the held session, or null when none exists or it has expired (which also forgets it) */
  read(): Session | null
  write(session: Session): void
  /** refresh the cached display name and picture */
  update(patch: Partial<Pick<Session, 'name' | 'picture'>>): void
  clear(): void
}

export function createSessionStore(storage: StorageLike | null, now: () => number = Date.now): SessionStore {
  let memory: Session | null = null
  const read = (): Session | null => {
    if (memory) return memory.expires > now() ? memory : (clear(), null)
    try {
      const raw = JSON.parse(storage?.getItem(SESSION_KEY) || 'null')
      if (!raw || typeof raw.token !== 'string' || !raw.token || typeof raw.expires !== 'number') return null
      const session: Session = { token: raw.token, expires: raw.expires, name: typeof raw.name === 'string' ? raw.name : '', picture: typeof raw.picture === 'string' ? raw.picture : '' }
      if (session.expires <= now()) return clear(), null
      memory = session
      return session
    } catch {
      return null
    }
  }
  const write = (session: Session) => {
    memory = session
    try { storage?.setItem(SESSION_KEY, JSON.stringify(session)) } catch { /* the session lasts as long as the page */ }
  }
  const update: SessionStore['update'] = (patch) => { const s = read(); if (s) write({ ...s, ...patch }) }
  const clear = () => {
    memory = null
    try { storage?.removeItem(SESSION_KEY) } catch { /* nothing to forget */ }
  }
  return { read, write, update, clear }
}

export type ApiOptions = { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown; keepalive?: boolean; auth?: boolean }
export type Api = <T = Record<string, unknown>>(path: string, options?: ApiOptions) => Promise<T>

/** gzip a request body when the browser can; the Worker inflates `Content-Type: application/gzip` itself */
async function encodeBody(text: string): Promise<{ body: BodyInit; type: string }> {
  if (text.length >= GZIP_FROM_BYTES && typeof CompressionStream === 'function' && typeof Blob === 'function') {
    try {
      const bytes = await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()
      return { body: new Uint8Array(bytes), type: 'application/gzip' }
    } catch { /* fall back to plain JSON */ }
  }
  return { body: text, type: 'application/json' }
}

/** `api('/progress/carrot:campaign', { method: 'PUT', body })` → parsed JSON, or an ApiError (status 0 = network/timeout). */
export function createApi(deps: { apiUrl: string; fetch: typeof fetch; session: SessionStore; timeoutMs?: number }): Api {
  const base = deps.apiUrl.replace(/\/$/, '')
  return async <T,>(path: string, { method = 'GET', body, keepalive = false, auth = true }: ApiOptions = {}): Promise<T> => {
    if (!base) throw new ApiError(0, 'The account service is not configured.')
    const headers: Record<string, string> = {}
    const encoded = body === undefined ? null : await encodeBody(JSON.stringify(body))
    if (encoded) headers['Content-Type'] = encoded.type
    const session = auth ? deps.session.read() : null
    if (auth && !session) throw new ApiError(401, 'Please sign in again.')
    if (session) headers.Authorization = `Bearer ${session.token}`
    let response: Response
    try {
      response = await deps.fetch(base + path, {
        method, headers, keepalive,
        body: encoded?.body,
        signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(deps.timeoutMs ?? API_TIMEOUT_MS) : undefined,
      })
    } catch (e) {
      throw new ApiError(0, (e as Error)?.message || 'The account service could not be reached.')
    }
    let data: Record<string, unknown> = {}
    try { data = await response.json() } catch { /* an empty or non-JSON body */ }
    if (!response.ok) {
      if (response.status === 401 && auth) deps.session.clear()
      throw new ApiError(response.status, typeof data.error === 'string' ? data.error : `The account service answered ${response.status}.`, data)
    }
    return data as T
  }
}
