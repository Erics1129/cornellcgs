/**
 * Player accounts: the public API for the games and the sign-in control.
 *
 *   import { progress } from '../../lib/account'
 *   progress.register('mygame:save', { key: 'cgs-mygame-v1', merge })   // once, at module load
 *   progress.touch('mygame:save')                                        // after every setItem
 *
 * Signed out, the games play exactly as before (localStorage only). Signed in,
 * every touched record is pushed to the account Worker, and the server's copies
 * are pulled and merged on login and on page load. The whole feature is off
 * (the control renders nothing, no network) until both VITE_ACCOUNT_API_URL and
 * VITE_GOOGLE_CLIENT_ID are set in `.env.local`.
 *
 * This file touches no DOM at import time, so the games (and their node tests)
 * can import it anywhere; everything starts lazily on the first `register` or
 * the first mounted sign-in control, and only in a browser.
 */
import { createGoogle } from './google.ts'
import type { Google } from './google.ts'
import { createSync } from './sync.ts'
import type { AccountState, Registration } from './sync.ts'

export type { AccountState, Registration } from './sync.ts'
export type { Merge, MergeMeta } from './merges.ts'

const browser = typeof window !== 'undefined' && typeof document !== 'undefined'

/** `import.meta.env` is Vite's; it does not exist under plain node. */
function readEnv(name: 'VITE_ACCOUNT_API_URL' | 'VITE_GOOGLE_CLIENT_ID'): string {
  try {
    const env = import.meta.env as Record<string, unknown> | undefined
    const value = env?.[name]
    return typeof value === 'string' ? value.trim() : ''
  } catch { return '' }
}
const API_URL = readEnv('VITE_ACCOUNT_API_URL').replace(/\/$/, '')
const CLIENT_ID = readEnv('VITE_GOOGLE_CLIENT_ID')
const enabled = browser && !!API_URL && !!CLIENT_ID

const sync = createSync({
  apiUrl: API_URL,
  storage: browser ? { getItem: (k) => localStorage.getItem(k), setItem: (k, v) => localStorage.setItem(k, v), removeItem: (k) => localStorage.removeItem(k) } : null,
  fetch: browser ? (input, init) => fetch(input, init) : () => Promise.reject(new Error('No network outside a browser.')),
})

let google: Google | null = null
let started = false
/** Adopt a held session, pull once, and keep pushing dirty records on page exits. Runs once, in a browser, only when enabled. */
function ensureStarted() {
  if (started || !enabled) return
  started = true
  sync.account.start()
  const flush = () => { void sync.progress.flush() }
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); else sync.account.pullIfStale() })
}
function ensureGoogle(): Google {
  if (!google) google = createGoogle(CLIENT_ID, (idToken) => { sync.account.login(idToken).catch(() => { /* the state carries the message */ }) })
  return google
}

const noop = () => {}

export const account = {
  /** both env vars are set and this is a browser */
  enabled,
  get state(): AccountState { return sync.account.state },
  onChange(cb: (s: AccountState) => void): () => void { return sync.account.onChange(cb) },
  /** the on-demand Google prompt; the rendered button is the primary path */
  async signIn(): Promise<void> { if (!enabled) return; ensureStarted(); await ensureGoogle().prompt() },
  /** `clearDevice`: also remove every game save on this device (a shared computer) */
  async signOut(options: { clearDevice?: boolean } = {}): Promise<void> { if (!enabled) return; google?.disableAutoSelect(); await sync.account.logout(options) },
  /** state.pending === 'local-saves': this device's saves came from another account; merge them in, or replace them */
  resolveLocalSaves(merge: boolean): void { if (enabled) sync.account.resolveLocalSaves(merge) },
  /** deletes the server copy; this device's saves are kept */
  async deleteAccount(): Promise<void> { if (!enabled) return; google?.disableAutoSelect(); await sync.account.deleteAccount() },
  /** used by SignIn.tsx: the official button goes into `el` */
  async renderButton(el: HTMLElement, compact = false): Promise<void> { if (!enabled) return; ensureStarted(); await ensureGoogle().renderButton(el, compact) },
  /** used by SignIn.tsx on mount */
  start: ensureStarted,
}

/** With the feature off (no env, or not a browser) every call here is a no-op: no meta is written and nothing is fetched. */
export const progress = {
  /** `id` is 'game:name' (lowercase). Returns an unregister function. */
  register<T>(id: string, reg: Registration<T>): () => void {
    if (!enabled) return noop
    ensureStarted()   // first, so the page-load pull is /me (which also refreshes the name) and the registration joins it
    return sync.progress.register(id, reg)
  },
  /** the game changed its key: stamp it, and push it soon when signed in */
  touch(id: string): void { if (enabled) sync.progress.touch(id) },
  /** fired after a pull wrote a different value to this record's key (or removed it): re-read it */
  subscribe(id: string, cb: () => void): () => void { return enabled ? sync.progress.subscribe(id, cb) : noop },
  /** push everything pending now (pagehide; tests) */
  flush(): Promise<void> { return enabled ? sync.progress.flush() : Promise.resolve() },
}
