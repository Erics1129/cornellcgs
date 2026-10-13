/**
 * Player accounts: how two copies of a game's save are combined.
 *
 * Every rule here is pure (no DOM, no storage, no game imports beyond types)
 * so the games can import them and so `scripts/test-account-sync.mjs` can
 * check them in plain Node. The sync module calls `merge(local, remote, meta)`
 * on login and whenever the server reports a newer copy; the result is written
 * to both places. A side that does not exist is `null`, and the rules never
 * throw on it.
 */
import type { CampaignSave } from '../../minigames/carrot/types'

export type Best = { ink: number; moves: number }
export type Bests = Record<string, Best>
export type ForgeRun = { version: number; seed: number; actions: unknown[]; ticket: unknown }
export type ForgePlayer = { playerId: string; proof: string; name: string }
export type ForgeScore = { playerId: string; value: number; [k: string]: unknown }
/** The sync module's own timestamps for the two copies (ms; 0 when a copy was never stamped). */
export type MergeMeta = { localUpdated: number; remoteUpdated: number }
export type Merge<T> = (local: T | null, remote: T | null, meta: MergeMeta) => T | null

/** The one side that exists, or `undefined` when both do (and a real merge is needed). */
const either = <T>(a: T | null, b: T | null): T | null | undefined => (a == null ? b : b == null ? a : undefined)

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * A save format bump: when both copies carry a numeric `version` and they differ, the newer format wins
 * unchanged. An older build cannot merge (or even read) a newer record, and must never overwrite it with
 * something derived from its own fallback; the sync module also refuses to push a record it cannot read back.
 */
export const higherVersion = <T>(a: T | null, b: T | null): T | undefined => {
  if (!isObject(a) || !isObject(b) || typeof a.version !== 'number' || typeof b.version !== 'number' || a.version === b.version) return undefined
  return (a.version > b.version ? a : b) as T
}

/** Carrot levels are 1..12; anything else (a stray key, '__proto__') is not a level and is dropped. */
const CARROT_LEVEL = /^([1-9]|1[0-2])$/
/** Ink Maze levels are slugs ('first-roll'); the same grammar keeps junk keys out of the union. */
const INKMAZE_LEVEL = /^[a-z0-9][a-z0-9-]{0,39}$/i

/** Carrot Defense: the furthest unlock, every medal either side earned, this device's sound choice. */
export function mergeCarrot(a: CampaignSave | null, b: CampaignSave | null): CampaignSave | null {
  const one = either(a, b)
  if (one !== undefined) return one
  const newer = higherVersion(a, b)
  if (newer) return newer
  const medals: Record<string, number> = {}
  const aMedals = isObject(a!.medals) ? a!.medals : {}
  const bMedals = isObject(b!.medals) ? b!.medals : {}
  for (const id of new Set([...Object.keys(aMedals), ...Object.keys(bMedals)])) if (CARROT_LEVEL.test(id)) medals[id] = ((Number(aMedals[id]) || 0) | (Number(bMedals[id]) || 0)) & 7
  return { version: 1, unlocked: Math.min(12, Math.max(Number(a!.unlocked) || 1, Number(b!.unlocked) || 1)), medals, sound: a!.sound !== false }
}

const beats = (run: Best, best?: Best) => !best || run.ink < best.ink || (run.ink === best.ink && run.moves < best.moves)

/** Ink Maze: per level, the win that used less ink, then fewer moves; every level either side cleared. */
export function mergeBests(a: Bests | null, b: Bests | null): Bests | null {
  const one = either(a, b)
  if (one !== undefined) return one
  const newer = higherVersion(a, b)
  if (newer) return newer
  const out: Bests = {}
  for (const [id, run] of Object.entries(isObject(b) ? b : {})) if (INKMAZE_LEVEL.test(id) && isBest(run)) out[id] = run
  for (const [id, run] of Object.entries(isObject(a) ? a : {})) if (INKMAZE_LEVEL.test(id) && isBest(run) && beats(run, out[id])) out[id] = run
  return out
}
const isBest = (v: unknown): v is Best => isObject(v) && Number.isFinite(v.ink) && Number.isFinite(v.moves)

/** A device preference: keep what this device chose; a new device adopts the account's choice. Also right for 'on'|'off' strings. */
export const localWins = <T>(a: T | null, b: T | null): T | null => (a == null ? b : a)

/** Something in progress (a run, an editor buffer): the copy touched most recently is the one the player is actually using. Ties keep local. A newer save format always wins. */
export const laterWins = <T>(a: T | null, b: T | null, m: MergeMeta): T | null =>
  a == null ? b : b == null ? a : (higherVersion(a, b) ?? (m.remoteUpdated > m.localUpdated ? b : a))

/** Forge or Fold local board: the union, keeping each player's best value, sorted, top 50. */
export function mergeForgeScores(a: ForgeScore[] | null, b: ForgeScore[] | null): ForgeScore[] | null {
  const one = either(a, b)
  if (one !== undefined) return one
  const best = new Map<string, ForgeScore>()
  for (const s of [...(Array.isArray(b) ? b : []), ...(Array.isArray(a) ? a : [])]) {
    if (!isObject(s) || typeof s.playerId !== 'string' || typeof s.value !== 'number') continue
    const old = best.get(s.playerId)
    if (!old || s.value > old.value) best.set(s.playerId, s)
  }
  return [...best.values()].sort((x, y) => y.value - x.value).slice(0, 50)
}

/** One leaderboard identity per account: the copy the account already holds wins; a name is never replaced by an empty one. */
export function mergeForgePlayer(a: ForgePlayer | null, b: ForgePlayer | null): ForgePlayer | null {
  const one = either(a, b)
  if (one !== undefined) return one
  return { ...b!, name: b!.name || a!.name }
}

/**
 * Records that belong to one account and must never cross to another: when a shared device's saves came from a
 * different account, the local copy is dropped instead of merged (the Forge identity carries the proof that
 * authenticates world-board submissions). `progress.register` reads this list for its `private` default.
 */
export const PRIVATE_RECORDS: ReadonlySet<string> = new Set(['forge:player'])

/**
 * The localStorage key behind each record id (see docs/accounts/HOOKS.md). "Sign out and clear this device" and a
 * sign-in that replaces the device's saves use this table as well as the keys registered on the device, so a game
 * page that was never opened here is covered too. A new key needs one line here; a key the page registers is
 * remembered in the meta file anyway.
 */
export const KNOWN_KEYS: Readonly<Record<string, { key: string; private?: boolean }>> = {
  'carrot:campaign': { key: 'cgs-carrot-defense-v1' },
  'inkmaze:best': { key: 'cgs-inkmaze-best-v1' },
  'inkmaze:sound': { key: 'cgs-inkmaze-sound-v1' },
  'inkmaze:code': { key: 'cgs-inkmaze-code-v1' },
  'inkmaze:code-prefs': { key: 'cgs-inkmaze-code-prefs-v1' },
  'forge:run': { key: 'cgs-forge-run-v1' },
  'forge:player': { key: 'cgs-forge-player', private: true },
  'forge:scores': { key: 'cgs-forge-scores' },
}

/** The rule for every known record id. New Ink Maze keys default to `laterWins` (state) or `localWins` (preferences). */
export const MERGES = {
  'carrot:campaign': mergeCarrot,
  'inkmaze:best': mergeBests,
  'inkmaze:sound': localWins as Merge<string>,
  'inkmaze:code': laterWins as Merge<unknown>,
  'inkmaze:code-prefs': localWins as Merge<unknown>,
  'forge:run': laterWins as Merge<ForgeRun>,
  'forge:player': mergeForgePlayer,
  'forge:scores': mergeForgeScores,
} as const
