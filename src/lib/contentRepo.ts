/**
 * Where the published words and photos live: a small public GitHub repo,
 * read by the site straight from GitHub and written by /admin/ through the
 * GitHub API. No server of our own anywhere.
 */
export const CONTENT_REPO = {
  owner: 'Erics1129',
  repo: 'cornellcgs-content',
  branch: 'main',
} as const

const { owner, repo, branch } = CONTENT_REPO

/** GitHub's raw file host — CORS open, cached about five minutes per URL. */
export const RAW_BASE = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`

/** jsDelivr's mirror of the same files — a second road when the first is slow. */
export const CDN_BASE = `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}`

/** A file in the content repo, as the site fetches it. */
export const rawUrl = (path: string) => `${RAW_BASE}/${path}`

/**
 * The published document, on a URL that changes every minute: the raw host
 * caches by URL, so a fresh URL means a fresh document within a minute of a
 * publish, without hammering GitHub for every visitor.
 */
export const contentUrl = (now = Date.now()) => `${RAW_BASE}/content.json?t=${Math.floor(now / 60_000)}`

/** The same document on the mirror (cached longer; the admin purges it on publish). */
export const contentMirrorUrl = () => `${CDN_BASE}/content.json`

export const PURGE_URL = `https://purge.jsdelivr.net/gh/${owner}/${repo}@${branch}/content.json`
