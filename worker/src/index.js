/**
 * cornellcgs.org/api/* — the content API behind the admin page.
 *
 * A Cloudflare Worker with one KV namespace (binding CGS):
 *   content            the published document (JSON) the site applies at boot
 *   img:<name>         uploaded pictures (bytes + {type,size,at} metadata)
 *   fail:<ip>          login failures per address, expiring — brute-force brake
 *   fail:all           login failures from everyone, expiring — the wider brake
 *
 * Routes
 *   POST   /api/login            { code } → session cookie (12 h, refreshed while in use)
 *   POST   /api/logout
 *   GET    /api/session          200 when the cookie is valid, else 401
 *   GET    /api/content          the published document ({} when none) + ETag — public
 *   PUT    /api/content          replace the document (If-Match guards against overwriting someone else) (session)
 *   DELETE /api/content          back to the compiled defaults   (session)
 *   PUT    /api/image/<name>     store a picture (jpeg/png/webp) (session)
 *   GET    /api/image/<name>     serve it (immutable — names carry a hash)
 *   GET    /api/images           list stored pictures            (session)
 *
 * Secrets: ADMIN_CODE (the passcode), SESSION_SECRET (signs the cookie).
 * Sessions are signed with both, so changing the passcode signs everyone out.
 */

const COOKIE = 'cgs_admin'
const SESSION_SECONDS = 12 * 60 * 60
const MAX_CONTENT_BYTES = 600 * 1024
const MAX_IMAGE_BYTES = 3 * 1024 * 1024
const MAX_LOGIN_BYTES = 1024
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
/** login failures allowed per address, and from everyone, before a 15-minute wait */
const FAIL_LIMIT_IP = 6
const FAIL_LIMIT_ALL = 40
const FAIL_WINDOW_SECONDS = 15 * 60
const NAME = /^[a-z0-9][a-z0-9._-]{0,80}$/

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname.replace(/\/+$/, '')
    const method = request.method

    try {
      if (path === '/api/login' && method === 'POST') return login(request, env)
      if (path === '/api/logout' && method === 'POST') {
        return json({ ok: true }, 200, { 'set-cookie': cookie('', 0) })
      }
      if (path === '/api/session' && method === 'GET') {
        const session = await authed(request, env)
        if (!session) return unauthorized()
        // a session in use slides forward once it is past half its life
        const now = Math.floor(Date.now() / 1000)
        if (session.exp - now < SESSION_SECONDS / 2) {
          return json({ ok: true }, 200, { 'set-cookie': cookie(await token(env), SESSION_SECONDS) })
        }
        return json({ ok: true })
      }
      if (path === '/api/content') {
        if (method === 'GET') return getContent(env)
        if (method === 'PUT') return (await authed(request, env)) ? putContent(request, env) : unauthorized()
        if (method === 'DELETE') {
          if (!(await authed(request, env))) return unauthorized()
          await env.CGS.delete('content')
          return json({ ok: true })
        }
      }
      const image = path.match(/^\/api\/image\/([^/]+)$/)
      if (image) {
        const name = image[1]
        if (!NAME.test(name)) return json({ error: 'bad name' }, 400)
        if (method === 'GET') return getImage(name, env)
        if (method === 'PUT') return (await authed(request, env)) ? putImage(name, request, env) : unauthorized()
      }
      if (path === '/api/images' && method === 'GET') {
        return (await authed(request, env)) ? listImages(env) : unauthorized()
      }
      return json({ error: 'not found' }, 404)
    } catch (err) {
      console.error(method, path, err)
      return json({ error: 'server error' }, 500)
    }
  },
}

/* ------------------------------------------------------------------ auth */

const secret = (env) => `${env.SESSION_SECRET}|${(env.ADMIN_CODE || '').trim()}`

async function login(request, env) {
  if (!env.ADMIN_CODE || !env.SESSION_SECRET) {
    return json({ error: 'The API has no ADMIN_CODE / SESSION_SECRET configured yet.' }, 503)
  }
  if (Number(request.headers.get('content-length') || 0) > MAX_LOGIN_BYTES) return json({ error: 'bad request' }, 413)

  const ip = request.headers.get('cf-connecting-ip') || 'unknown'
  const [failsIp, failsAll] = await Promise.all([counter(env, `fail:${ip}`), counter(env, 'fail:all')])
  if (failsIp >= FAIL_LIMIT_IP || failsAll >= FAIL_LIMIT_ALL) {
    console.warn('login locked', ip, failsIp, failsAll)
    return json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429, {
      'retry-after': String(FAIL_WINDOW_SECONDS),
    })
  }

  let code = ''
  try {
    const body = await request.json()
    code = typeof body?.code === 'string' ? body.code.trim() : ''
  } catch {
    return json({ error: 'bad request' }, 400)
  }

  if (!code || !(await equal(code, env.ADMIN_CODE.trim()))) {
    await Promise.all([
      env.CGS.put(`fail:${ip}`, String(failsIp + 1), { expirationTtl: FAIL_WINDOW_SECONDS }),
      env.CGS.put('fail:all', String(failsAll + 1), { expirationTtl: FAIL_WINDOW_SECONDS }),
    ])
    console.warn('login failed', ip, failsIp + 1)
    const left = FAIL_LIMIT_IP - failsIp - 1
    return json({ error: left > 0 ? `Wrong passcode. ${left} tries left.` : 'Wrong passcode. Wait 15 minutes.' }, 401)
  }

  await env.CGS.delete(`fail:${ip}`)
  return json({ ok: true }, 200, { 'set-cookie': cookie(await token(env), SESSION_SECONDS) })
}

async function counter(env, key) {
  return Number((await env.CGS.get(key)) || 0)
}

async function token(env) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_SECONDS
  return `${exp}.${await sign(String(exp), secret(env))}`
}

/** the session on a valid cookie ({exp}), else null */
async function authed(request, env) {
  if (!env.SESSION_SECRET) return null
  const raw = request.headers.get('cookie') || ''
  const m = raw.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))
  if (!m) return null
  const [expStr, mac] = m[1].split('.')
  const exp = Number(expStr)
  if (!exp || !mac || exp < Date.now() / 1000) return null
  return (await equal(mac, await sign(expStr, secret(env)))) ? { exp } : null
}

function cookie(value, maxAge) {
  return `${COOKIE}=${value}; Path=/api; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`
}

async function sign(message, key) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(message))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** constant-time string compare */
async function equal(a, b) {
  const enc = new TextEncoder()
  const [ha, hb] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))])
  return crypto.subtle.timingSafeEqual(ha, hb)
}

/* --------------------------------------------------------------- content */

async function getContent(env) {
  const { value, metadata } = await env.CGS.getWithMetadata('content')
  return new Response(value || '{}', {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // the site reads this on every load — always fresh, one KV read
      'cache-control': 'no-store',
      etag: (metadata && metadata.at) || 'none',
      'x-robots-tag': 'noindex',
    },
  })
}

async function putContent(request, env) {
  if (Number(request.headers.get('content-length') || 0) > MAX_CONTENT_BYTES) return json({ error: 'document too large' }, 413)
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > MAX_CONTENT_BYTES) return json({ error: 'document too large' }, 413)
  let doc
  try {
    doc = JSON.parse(text)
  } catch {
    return json({ error: 'not JSON' }, 400)
  }
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    return json({ error: 'the document must be an object' }, 400)
  }
  // Two people editing at once: the second Publish must not silently erase
  // the first — the admin sends the version it loaded, and a mismatch stops it.
  const expected = request.headers.get('if-match')
  if (expected) {
    const { metadata } = await env.CGS.getWithMetadata('content')
    const current = (metadata && metadata.at) || 'none'
    if (expected !== current) {
      return json({ error: 'Someone else published since you loaded this page. Reload to see their version, then make your change again.' }, 409)
    }
  }
  const at = new Date().toISOString()
  await env.CGS.put('content', JSON.stringify(doc), { metadata: { at, bytes: text.length } })
  return json({ ok: true, bytes: text.length, etag: at })
}

/* ---------------------------------------------------------------- images */

async function putImage(name, request, env) {
  const type = (request.headers.get('content-type') || '').split(';')[0].trim()
  if (!IMAGE_TYPES.has(type)) return json({ error: 'jpeg, png or webp only' }, 415)
  if (Number(request.headers.get('content-length') || 0) > MAX_IMAGE_BYTES) return json({ error: 'image over 3 MB' }, 413)
  const bytes = await request.arrayBuffer()
  if (bytes.byteLength === 0) return json({ error: 'empty upload' }, 400)
  if (bytes.byteLength > MAX_IMAGE_BYTES) return json({ error: 'image over 3 MB' }, 413)
  await env.CGS.put(`img:${name}`, bytes, {
    metadata: { type, size: bytes.byteLength, at: new Date().toISOString() },
  })
  return json({ ok: true, url: `/api/image/${name}`, size: bytes.byteLength })
}

async function getImage(name, env) {
  const { value, metadata } = await env.CGS.getWithMetadata(`img:${name}`, 'arrayBuffer')
  if (!value) return new Response('not found', { status: 404 })
  return new Response(value, {
    headers: {
      'content-type': (metadata && metadata.type) || 'application/octet-stream',
      // names carry a content hash, so a picture never changes under its url
      'cache-control': 'public, max-age=31536000, immutable',
      'x-robots-tag': 'noindex',
    },
  })
}

async function listImages(env) {
  const out = []
  let cursor
  do {
    const page = await env.CGS.list({ prefix: 'img:', cursor })
    for (const k of page.keys) {
      out.push({ name: k.name.slice(4), url: `/api/image/${k.name.slice(4)}`, ...(k.metadata || {}) })
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  return json({ images: out })
}

/* ---------------------------------------------------------------- helpers */

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
      ...headers,
    },
  })
}

function unauthorized() {
  return json({ error: 'unauthorized' }, 401)
}
