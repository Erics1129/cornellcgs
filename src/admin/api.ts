/** The admin page's view of the content API (worker/src/index.js). */

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, { credentials: 'same-origin', cache: 'no-store', ...init })
  } catch {
    throw new ApiError(0, 'The admin API is unreachable.')
  }
  const type = res.headers.get('content-type') ?? ''
  const body: unknown = type.includes('json') ? await res.json().catch(() => ({})) : {}
  if (!res.ok) {
    const msg = (body as { error?: string }).error
    if (res.status === 404 && !msg) {
      throw new ApiError(404, 'The admin API is not deployed on this domain yet.')
    }
    throw new ApiError(res.status, msg ?? `HTTP ${res.status}`)
  }
  return body as T
}

const json = (body: unknown): RequestInit => ({
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

export const api = {
  session: () => call<{ ok: true }>('/session'),
  login: (code: string) => call<{ ok: true }>('/login', { method: 'POST', ...json({ code }) }),
  logout: () => call<{ ok: true }>('/logout', { method: 'POST' }),
  content: () => call<Record<string, unknown>>('/content'),
  publish: (doc: unknown) => call<{ ok: true; bytes: number }>('/content', { method: 'PUT', ...json(doc) }),
  reset: () => call<{ ok: true }>('/content', { method: 'DELETE' }),
  upload: (name: string, blob: Blob) =>
    call<{ ok: true; url: string }>(`/image/${name}`, {
      method: 'PUT',
      headers: { 'content-type': blob.type },
      body: blob,
    }),
}
