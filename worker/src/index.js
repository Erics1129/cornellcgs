/**
 * cornellcgs.org/api/* — the content API behind the admin page.
 *
 * A Cloudflare Worker with one KV namespace (binding CGS):
 *   content            the published document (JSON) the site applies at boot
 *   img:<name>         uploaded pictures (bytes + {type,size,at} metadata)
 *   fail:<ip>          login failures, expiring — brute-force brake
 *
 * Routes
 *   POST   /api/login            { code } → session cookie (12 h)
 *   POST   /api/logout
 *   GET    /api/session          200 when the cookie is valid, else 401
 *   GET    /api/content          the published document ({} when none) — public
 *   PUT    /api/content          replace the document            (session)
 *   DELETE /api/content          back to the compiled defaults   (session)
 *   PUT    /api/image/<name>     store a picture (jpeg/png/webp) (session)
 *   GET    /api/image/<name>     serve it (immutable — names carry a hash)
 *   GET    /api/images           list stored pictures            (session)
 *
 * Secrets: ADMIN_CODE (the passcode), SESSION_SECRET (signs the cookie).
 */

const COOKIE = 'cgs_admin'
const SESSION_SECONDS = 12 * 60 * 60
const MAX_CONTENT_BYTES = 600 * 1024
const MAX_IMAGE_BYTES = 3 * 1024 * 1024
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
/** login failures allowed per address before a 15-minute wait */
const FAIL_LIMIT = 6
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
        return (await authed(request, env)) ? json({ ok: true }) : unauthorized()
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
      return json({ error: 'server error', detail: String((err && err.message) || err) }, 500)
    }
  },
}

/* ------------------------------------------------------------------ auth */

async function login(request, env) {
  if (!env.ADMIN_CODE || !env.SESSION_SECRET) {
    return json({ error: 'The API has no ADMIN_CODE / SESSION_SECRET configured.' }, 503)
  }
  const ip = request.headers.get('cf-connecting-ip') || 'unknown'
  const failKey = `fail:${ip}`
  const fails = Number((await env.CGS.get(failKey)) || 0)
  if (fails >= FAIL_LIMIT) {
    return json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429, {
      'retry-after': String(FAIL_WINDOW_SECONDS),
    })
  }

  let code = ''
  try {
    const body = await request.json()
    code = typeof body?.code === 'string' ? body.code : ''
  } catch {
    return json({ error: 'bad request' }, 400)
  }

  if (!code || !(await equal(code, env.ADMIN_CODE))) {
    await env.CGS.put(failKey, String(fails + 1), { expirationTtl: FAIL_WINDOW_SECONDS })
    const left = FAIL_LIMIT - fails - 1
    return json({ error: left > 0 ? `Wrong passcode. ${left} tries left.` : 'Wrong passcode. Wait 15 minutes.' }, 401)
  }

  await env.CGS.delete(failKey)
  const exp = Math.floor(Date.now() / 1000) + SESSION_SECONDS
  const token = `${exp}.${await sign(String(exp), env.SESSION_SECRET)}`
  return json({ ok: true, expires: exp }, 200, { 'set-cookie': cookie(token, SESSION_SECONDS) })
}

async function authed(request, env) {
  if (!env.SESSION_SECRET) return false
  const raw = request.headers.get('cookie') || ''
  const m = raw.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))
  if (!m) return false
  const [expStr, mac] = m[1].split('.')
  const exp = Number(expStr)
  if (!exp || !mac || exp < Date.now() / 1000) return false
  return equal(mac, await sign(expStr, env.SESSION_SECRET))
}

function cookie(value, maxAge) {
  return `${COOKIE}=${value}; Path=/api; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`
}

async function sign(message, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** constant-time string compare */
async function equal(a, b) {
  const enc = new TextEncoder()
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ])
  return crypto.subtle.timingSafeEqual(ha, hb)
}

/* --------------------------------------------------------------- content */

async function getContent(env) {
  const doc = await env.CGS.get('content')
  return new Response(doc || '{}', {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // the site reads this on every load — always fresh, one KV read
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
    },
  })
}

async function putContent(request, env) {
  const text = await request.text()
  if (text.length > MAX_CONTENT_BYTES) return json({ error: 'document too large' }, 413)
  let doc
  try {
    doc = JSON.parse(text)
  } catch {
    return json({ error: 'not JSON' }, 400)
  }
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    return json({ error: 'the document must be an object' }, 400)
  }
  await env.CGS.put('content', JSON.stringify(doc), {
    metadata: { at: new Date().toISOString(), bytes: text.length },
  })
  return json({ ok: true, bytes: text.length })
}

/* ---------------------------------------------------------------- images */

async function putImage(name, request, env) {
  const type = (request.headers.get('content-type') || '').split(';')[0].trim()
  if (!IMAGE_TYPES.has(type)) return json({ error: 'jpeg, png or webp only' }, 415)
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
