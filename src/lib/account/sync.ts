/**
 * Player accounts: keeps the games' localStorage keys and the account server in step.
 *
 * The games keep owning their keys and never wait for the network. A game
 * registers each key once (`register`) and says when it changed (`touch`).
 * This module stamps a timestamp per record, pushes changed records while a
 * session exists (debounced 1.5 s, at most 5 s after the first change, at most
 * one PUT per record per 2.5 s), and on login or page load pulls the server's
 * copies and merges them with the game's rules, writing the result to both
 * places. Every server failure is silent and retried with backoff; localStorage
 * stays the source of truth.
 *
 * Three guards keep a merge from going wrong:
 * - a record registered after the last pull (the game pages load lazily) is
 *   merged against a fresh pull before anything of it is pushed;
 * - the device remembers which account its saves were last merged with; when a
 *   different account signs in the pull is held until the player chooses to
 *   merge the device's saves or replace them (and account-private records are
 *   never carried across);
 * - a pulled record this build cannot read back (a newer save format) is
 *   reverted locally and frozen: it is neither used nor pushed.
 *
 * `createSync(deps)` takes storage, fetch and timers as arguments so
 * `scripts/test-account-sync.mjs` can drive it with fakes.
 */
import { createApi, createSessionStore, isApiError } from './session.ts'
import type { Api, SessionStore, StorageLike } from './session.ts'
import { KNOWN_KEYS, PRIVATE_RECORDS } from './merges.ts'
import type { Merge, MergeMeta } from './merges.ts'

export const META_KEY = 'cgs-account-meta-v1'
export const DEBOUNCE_MS = 1_500
/** continuous play keeps re-arming the debounce; a change still goes out this long after it was made */
export const MAX_WAIT_MS = 5_000
export const PUT_FLOOR_MS = 2_500
export const STALE_PULL_MS = 5 * 60_000
/** a pull this recent is current enough for a record registered now */
export const FRESH_PULL_MS = 2_000
export const BACKOFF_MS = { first: 2_000, max: 300_000 }
/** record ids look like 'carrot:campaign' */
export const RECORD_ID = /^[a-z0-9]+:[a-z0-9-]{1,30}$/

export type AccountState = {
  status: 'out' | 'in' | 'loading'
  name: string
  picture: string
  error?: string
  /** signed in, but this device holds saves from another account: the player must choose (see `resolveLocalSaves`) */
  pending?: 'local-saves'
}
export type Registration<T> = {
  /** the localStorage key the game owns */
  key: string
  /** default: JSON.parse(localStorage.getItem(key)) or null */
  read?: () => T | null
  /** default: localStorage.setItem(key, JSON.stringify(value)); must also update any in-memory copy */
  write?: (value: T) => void
  merge: Merge<T>
  /** belongs to one account (a leaderboard identity): never merged across accounts. Default: `PRIVATE_RECORDS.has(id)` */
  private?: boolean
}
export type RemoteRecord = { data: unknown; updated: number; version?: number }
export type RemoteProgress = Record<string, RemoteRecord>
type Player = { id?: string; name?: string; picture?: string }
type LoginResponse = { session: string; expires: number; player: Player; progress: RemoteProgress }
type MeResponse = { player: Player; progress: RemoteProgress }
type PutResponse = { stored: true; updated: number; version: number } | { stored: false; current: RemoteRecord }

export type SyncDeps = {
  /** empty: the feature is off; nothing is pushed or pulled and no meta is written */
  apiUrl: string
  storage: StorageLike | null
  fetch: typeof fetch
  now?: () => number
  setTimeout?: (fn: () => void, ms: number) => unknown
  clearTimeout?: (handle: unknown) => void
  warn?: (message: string) => void
}

type RecordMeta = { updated: number; dirty: boolean }
/** cgs-account-meta-v1: stamps per record, the account the saves were last merged with, and every key ever registered here */
type Meta = { owner: string; keys: Record<string, { key: string; private: boolean }>; records: Record<string, RecordMeta> }
type Record_ = {
  reg: Registration<unknown>
  timer: unknown
  inFlight: boolean
  /** touched while a PUT was in flight: push again when it lands */
  again: boolean
  lastPutStart: number
  backoff: number
  warned: boolean
  /** registered after the last pull: nothing is pushed until it has been merged with a current server copy */
  awaitingPull: boolean
  /** the server copy is in a format this build cannot read: not used, not pushed, until a later pull reads */
  frozen: boolean
  /** when the current dirty stretch began (0 = clean), for the MAX_WAIT cap */
  firstDirtyAt: number
  /** the serialized size the server last refused with 413; no request until the record shrinks */
  refusedBytes: number
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function createSync(deps: SyncDeps) {
  const enabled = !!deps.apiUrl
  const now = deps.now ?? Date.now
  const schedule_ = deps.setTimeout ?? ((fn, ms) => setTimeout(fn, ms))
  const cancel_ = deps.clearTimeout ?? ((h) => clearTimeout(h as number))
  const warn = deps.warn ?? ((m: string) => console.warn(m))
  const storage = deps.storage
  const session: SessionStore = createSessionStore(storage, now)
  const api: Api = createApi({ apiUrl: deps.apiUrl, fetch: deps.fetch, session })

  // ---- account state -------------------------------------------------------
  let state: AccountState = { status: 'out', name: '', picture: '' }
  const listeners = new Set<(s: AccountState) => void>()
  const setState = (next: AccountState) => {
    state = next
    for (const cb of [...listeners]) { try { cb(state) } catch (e) { warn(String(e)) } }
  }
  const signedIn = (name: string, picture: string) => setState({ status: 'in', name, picture, ...(held ? { pending: 'local-saves' as const } : {}) })
  const signedOut = () => setState({ status: 'out', name: '', picture: '' })

  // ---- records and their meta ---------------------------------------------
  const records = new Map<string, Record_>()
  const subscribers = new Map<string, Set<() => void>>()
  const meta: Meta = { owner: '', keys: {}, records: {} }
  try {
    const raw = JSON.parse(storage?.getItem(META_KEY) || 'null') as Record<string, unknown> | null
    if (raw && typeof raw === 'object') {
      // the first format was a flat {id: {updated, dirty}} map
      const recs = (raw.records && typeof raw.records === 'object' ? raw.records : raw) as Record<string, { updated?: unknown; dirty?: unknown }>
      for (const [id, m] of Object.entries(recs)) if (RECORD_ID.test(id) && m && typeof m === 'object') meta.records[id] = { updated: Number(m.updated) || 0, dirty: m.dirty === true }
      if (typeof raw.owner === 'string') meta.owner = raw.owner
      if (raw.keys && typeof raw.keys === 'object') for (const [id, k] of Object.entries(raw.keys as Record<string, { key?: unknown; private?: unknown }>)) {
        if (RECORD_ID.test(id) && k && typeof k.key === 'string') meta.keys[id] = { key: k.key, private: k.private === true }
      }
    }
  } catch { /* unreadable meta: start clean */ }
  const saveMeta = () => { if (enabled) try { storage?.setItem(META_KEY, JSON.stringify(meta)) } catch { /* the stamps last as long as the page */ } }
  const metaOf = (id: string) => meta.records[id] ?? (meta.records[id] = { updated: 0, dirty: false })

  let lastPull: RemoteProgress | null = null
  let lastPullAt = 0
  let pulling: Promise<void> | null = null
  let pullTimer: unknown
  let pullBackoff = 0
  /** a pull that belongs to a different account than this device's saves, waiting for the player's choice */
  let held: { progress: RemoteProgress; id: string } | null = null
  /** set while a pull writes a merged value, so the game's own `touch` from inside `write` is ignored */
  let applying = false

  const readOf = (rec: Record_): unknown => {
    try {
      if (rec.reg.read) return rec.reg.read()
      return JSON.parse(storage?.getItem(rec.reg.key) || 'null')
    } catch { return null }
  }
  const writeOf = (rec: Record_, value: unknown) => {
    applying = true
    try {
      if (rec.reg.write) rec.reg.write(value)
      else storage?.setItem(rec.reg.key, JSON.stringify(value))
    } catch { /* storage restricted: play goes on */ } finally { applying = false }
  }
  const removeKey = (key: string) => { try { storage?.removeItem(key) } catch { /* nothing to remove */ } }
  const notify = (id: string) => { for (const cb of [...(subscribers.get(id) ?? [])]) { try { cb() } catch (e) { warn(String(e)) } } }

  // ---- pushing -------------------------------------------------------------
  const schedulePush = (id: string, delay = DEBOUNCE_MS) => {
    const rec = records.get(id)
    if (!rec) return
    cancel_(rec.timer)
    rec.timer = schedule_(() => { rec.timer = undefined; void flushOne(id) }, delay)
  }

  async function flushOne(id: string, keepalive = false): Promise<void> {
    const rec = records.get(id)
    const m = meta.records[id]
    if (!enabled || !rec || !m?.dirty || !session.read() || held || rec.frozen) return
    // merged with a current server copy first; the merge itself schedules the push
    if (rec.awaitingPull) { void requestPull(); return }
    if (rec.inFlight) { rec.again = true; return }
    const wait = rec.lastPutStart + PUT_FLOOR_MS - now()
    if (!keepalive && wait > 0) { schedulePush(id, wait); return }
    const data = readOf(rec)
    if (data == null) { m.dirty = false; rec.firstDirtyAt = 0; saveMeta(); return }
    const size = JSON.stringify(data).length
    if (rec.refusedBytes && size >= rec.refusedBytes) { m.dirty = false; rec.firstDirtyAt = 0; saveMeta(); return }
    if (!m.updated) { m.updated = now(); saveMeta() }
    const stamp = m.updated
    rec.inFlight = true
    rec.lastPutStart = now()
    rec.firstDirtyAt = 0
    try {
      const r = await api<PutResponse>(`/progress/${id}`, { method: 'PUT', body: { data, updated: stamp }, keepalive })
      rec.backoff = 0
      rec.refusedBytes = 0
      if (r.stored) {
        // a touch during the flight moved the stamp: that change still needs its own push
        if (m.updated === stamp) { m.dirty = false; m.updated = typeof r.updated === 'number' ? r.updated : stamp; saveMeta() }
      } else if (r.current) {
        // the server holds a newer copy: merge it in, and the merge schedules a re-PUT when ours still adds something
        mergeOne(id, r.current)
      }
    } catch (e) {
      if (!isApiError(e)) warn(String(e))
      else if (e.status === 401) { if (!session.read()) signedOut() }
      else if (e.status === 429) schedulePush(id, Math.max(1, e.retryAfter || 2) * 1000)
      else if (e.status === 400 || e.status === 413) {
        m.dirty = false; saveMeta()
        if (e.status === 413) rec.refusedBytes = size
        if (!rec.warned) { rec.warned = true; warn(`Account sync: the server refused the record "${id}" (${e.status}: ${e.message}). It stays on this device.`) }
      } else {
        rec.backoff = Math.min(BACKOFF_MS.max, rec.backoff ? rec.backoff * 2 : BACKOFF_MS.first)
        schedulePush(id, rec.backoff)
      }
    } finally {
      rec.inFlight = false
      if (rec.again) { rec.again = false; schedulePush(id) }
    }
  }

  // ---- pulling and merging -------------------------------------------------
  function mergeOne(id: string, remote: RemoteRecord | null) {
    const rec = records.get(id)
    if (!rec) return
    rec.awaitingPull = false
    const m = metaOf(id)
    const local = readOf(rec)
    const remoteData = remote && remote.data !== undefined ? remote.data : null
    const remoteUpdated = remote && typeof remote.updated === 'number' ? remote.updated : 0
    const mergeMeta: MergeMeta = { localUpdated: m.updated, remoteUpdated }
    let merged: unknown
    try { merged = rec.reg.merge(local, remoteData, mergeMeta) } catch (e) { warn(`Account sync: merge for "${id}" failed: ${String(e)}`); return }
    if (merged == null) return
    if (!same(merged, local)) {
      writeOf(rec, merged)
      if (readOf(rec) == null) {
        // this build cannot read what the merge produced (a newer save format): put the old value back and leave the record alone
        if (local == null) removeKey(rec.reg.key); else writeOf(rec, local)
        rec.frozen = true
        m.dirty = false; rec.firstDirtyAt = 0; saveMeta()
        if (!rec.warned) { rec.warned = true; warn(`Account sync: the account's copy of "${id}" is in a newer format than this page can read. Reload to get the latest version; the copy on this device is untouched.`) }
        return
      }
      notify(id)
    }
    rec.frozen = false
    if (!same(merged, remoteData)) {
      m.updated = Math.max(m.updated, remoteUpdated) || now()
      m.dirty = true
      if (!rec.firstDirtyAt) rec.firstDirtyAt = now()
      saveMeta()
      schedulePush(id)
    } else {
      m.updated = remoteUpdated || m.updated || now()
      m.dirty = false
      rec.firstDirtyAt = 0
      saveMeta()
    }
  }

  /** every key this module knows: the games' table, the keys registered on earlier visits, and the records registered now */
  const knownKeys = (): Record<string, { key: string; private: boolean }> => {
    const out: Record<string, { key: string; private: boolean }> = {}
    for (const [id, k] of Object.entries(KNOWN_KEYS)) out[id] = { key: k.key, private: k.private === true || PRIVATE_RECORDS.has(id) }
    for (const [id, k] of Object.entries(meta.keys)) out[id] = k
    for (const [id, rec] of records) out[id] = { key: rec.reg.key, private: rec.reg.private === true }
    return out
  }
  /** any save on this device (a registered record, or a known key) */
  const hasLocalSaves = () => {
    for (const rec of records.values()) if (readOf(rec) != null) return true
    for (const [id, k] of Object.entries(knownKeys())) { if (records.has(id)) continue; try { if (storage?.getItem(k.key) != null) return true } catch { /* unreadable */ } }
    return false
  }
  /** drop every save this device holds (every known key) and its stamps */
  const clearLocalSaves = () => {
    for (const k of Object.values(knownKeys())) removeKey(k.key)
    meta.records = {}
    saveMeta()
    for (const id of records.keys()) notify(id)
  }
  /** account-private records never cross accounts: drop the local copies */
  const dropPrivate = () => {
    for (const [id, k] of Object.entries(knownKeys())) if (k.private) { removeKey(k.key); delete meta.records[id]; if (records.has(id)) notify(id) }
  }

  function applyPull(remote: RemoteProgress | undefined, playerId?: string) {
    const progress = remote && typeof remote === 'object' ? remote : {}
    const ownerChanged = !!playerId && !!meta.owner && meta.owner !== playerId
    if (ownerChanged && hasLocalSaves()) {
      held = { progress, id: playerId! }
      if (state.status === 'in') setState({ ...state, pending: 'local-saves' })
      return
    }
    adopt(progress, playerId, ownerChanged)
  }
  function adopt(progress: RemoteProgress, playerId: string | undefined, ownerChanged: boolean) {
    if (ownerChanged) dropPrivate()
    if (playerId) meta.owner = playerId
    held = null
    lastPull = progress
    lastPullAt = now()
    for (const id of records.keys()) mergeOne(id, progress[id] ?? null)
    saveMeta()
    if (state.pending) setState({ ...state, pending: undefined })
  }

  async function pull(path: '/me' | '/progress'): Promise<void> {
    if (pulling) return pulling
    cancel_(pullTimer); pullTimer = undefined
    if (!enabled || !session.read()) return
    pulling = (async () => {
      try {
        const r = await api<Partial<MeResponse>>(path)
        if (r.player) { session.update({ name: r.player.name ?? '', picture: r.player.picture ?? '' }) }
        pullBackoff = 0
        applyPull(r.progress, typeof r.player?.id === 'string' ? r.player.id : undefined)
        if (r.player) signedIn(r.player.name ?? '', r.player.picture ?? '')
      } catch (e) {
        if (!isApiError(e)) return warn(String(e))
        if (e.status === 401) { signedOut(); return }
        pullBackoff = Math.min(BACKOFF_MS.max, pullBackoff ? pullBackoff * 2 : BACKOFF_MS.first)
        pullTimer = schedule_(() => void pull(path), pullBackoff)
      }
    })().finally(() => { pulling = null })
    return pulling
  }
  /** a current server copy, coalesced: the pull in flight, a very recent one, or a new GET /progress */
  function requestPull(): Promise<void> {
    if (pulling) return pulling
    if (held || now() - lastPullAt < FRESH_PULL_MS) return Promise.resolve()
    return pull('/progress')
  }

  // ---- public surface -------------------------------------------------------
  const progress = {
    register<T>(id: string, reg: Registration<T>): () => void {
      if (!RECORD_ID.test(id)) throw new Error(`Account sync: bad record id "${id}" (expected game:name, lowercase).`)
      const priv = reg.private ?? PRIVATE_RECORDS.has(id)
      const rec: Record_ = { reg: { ...(reg as Registration<unknown>), private: priv }, timer: undefined, inFlight: false, again: false, lastPutStart: -PUT_FLOOR_MS, backoff: 0, warned: false, awaitingPull: false, frozen: false, firstDirtyAt: 0, refusedBytes: 0 }
      records.set(id, rec)
      const known = meta.keys[id]
      if (!known || known.key !== reg.key || known.private !== priv) { meta.keys[id] = { key: reg.key, private: priv }; saveMeta() }
      if (enabled && session.read()) {
        // the game pages load lazily: a record registered long after the last pull is merged against a fresh one
        if (lastPull && !held && now() - lastPullAt <= FRESH_PULL_MS) mergeOne(id, lastPull[id] ?? null)
        else { rec.awaitingPull = true; void requestPull() }
      }
      return () => { if (records.get(id) === rec) { cancel_(rec.timer); records.delete(id) } }
    },
    touch(id: string) {
      if (!enabled || applying || !RECORD_ID.test(id)) return
      const m = metaOf(id)
      m.updated = now()
      m.dirty = true
      saveMeta()
      const rec = records.get(id)
      if (!rec || !session.read()) return
      if (!rec.firstDirtyAt) rec.firstDirtyAt = now()
      schedulePush(id, Math.min(DEBOUNCE_MS, Math.max(0, rec.firstDirtyAt + MAX_WAIT_MS - now())))
    },
    subscribe(id: string, cb: () => void): () => void {
      let set = subscribers.get(id)
      if (!set) subscribers.set(id, (set = new Set()))
      set.add(cb)
      return () => { set!.delete(cb) }
    },
    async flush(): Promise<void> {
      if (!enabled || !session.read()) return
      const pending: Promise<void>[] = []
      for (const [id, rec] of records) if (meta.records[id]?.dirty) { cancel_(rec.timer); rec.timer = undefined; pending.push(flushOne(id, true)) }
      await Promise.all(pending)
    },
  }

  const account = {
    get state() { return state },
    onChange(cb: (s: AccountState) => void): () => void { listeners.add(cb); return () => { listeners.delete(cb) } },
    /** page load: adopt a held session and pull */
    start() {
      const s = session.read()
      if (!s) { if (state.status !== 'out') signedOut(); return }
      signedIn(s.name, s.picture)
      void pull('/me')
    },
    async login(idToken: string): Promise<void> {
      setState({ status: 'loading', name: '', picture: '' })
      try {
        const r = await api<LoginResponse>('/login', { method: 'POST', body: { idToken }, auth: false })
        if (typeof r.session !== 'string' || !r.session) throw new Error('The account service sent no session.')
        const expires = typeof r.expires === 'number' ? r.expires : now() + 30 * 86_400_000
        session.write({ token: r.session, expires, name: r.player?.name ?? '', picture: r.player?.picture ?? '' })
        applyPull(r.progress, typeof r.player?.id === 'string' ? r.player.id : undefined)
        signedIn(r.player?.name ?? '', r.player?.picture ?? '')
      } catch (e) {
        session.clear()
        setState({ status: 'out', name: '', picture: '', error: isApiError(e) && e.status === 0 ? 'The account service could not be reached. Your progress is safe on this device.' : (e as Error)?.message || 'Sign-in failed.' })
        throw e
      }
    },
    /**
     * The device's saves came from another account (state.pending === 'local-saves'). `merge: true` unions them
     * into this account (account-private records are still dropped); `false` replaces them with the account's copy.
     */
    resolveLocalSaves(merge: boolean) {
      if (!held) return
      const { progress, id } = held
      if (!merge) clearLocalSaves()
      adopt(progress, id, true)
    },
    /** `clearDevice`: also remove every save this device holds (a shared computer) */
    async logout(options: { clearDevice?: boolean } = {}): Promise<void> {
      if (session.read()) { try { await api('/logout', { method: 'POST' }) } catch { /* best effort: the token expires anyway */ } }
      forget()
      if (options.clearDevice) { clearLocalSaves(); meta.owner = ''; saveMeta() }
    },
    async deleteAccount(): Promise<void> {
      await api('/account', { method: 'DELETE' })
      forget()
    },
    /** signed in and the last pull is old: refresh from the server (cheap; makes device switches feel live) */
    pullIfStale() {
      if (enabled && session.read() && !held && now() - lastPullAt > STALE_PULL_MS) void pull('/progress')
    },
    /** a session is held (used to gate pushes) */
    get signedIn() { return !!session.read() },
  }

  function forget() {
    session.clear()
    lastPull = null
    held = null
    cancel_(pullTimer); pullTimer = undefined
    for (const rec of records.values()) { cancel_(rec.timer); rec.timer = undefined; rec.again = false; rec.awaitingPull = false }
    signedOut()
  }

  return { account, progress, session, api }
}

export type Sync = ReturnType<typeof createSync>
