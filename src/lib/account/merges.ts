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

/** The campaign's length, shared by both repos: `unlocked` never exceeds it and medals above it are dropped. */
export const CARROT_LEVEL_COUNT = 24
/** Carrot levels are 1..24; anything else (a stray key, '__proto__', a challenge level) is not a level and is dropped. */
const CARROT_LEVEL = /^([1-9]|1[0-9]|2[0-4])$/
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
  return { version: 1, unlocked: Math.min(CARROT_LEVEL_COUNT, Math.max(Number(a!.unlocked) || 1, Number(b!.unlocked) || 1)), medals, sound: a!.sound !== false }
}

/** Carrot Super record (`cgs-carrot-super-v1`): whether the merge lesson was shown, how many Supers were forged and which kinds. */
export type SuperSave = { version: 1; taught: boolean; merges: number; kinds: Record<string, number> }
export type ChallengeBoss = 'tornado' | 'zombie' | 'eyeball' | 'portal'
export type ChallengeRecord = { cleared: boolean; health: number; seconds: number; towers: number }
/** Challenge format v2 adds Portal; the legacy storage key stays unchanged for migration. */
export type ChallengeSave = { version: 2; best: Partial<Record<ChallengeBoss, ChallengeRecord>> }

// The two blocks below are copied verbatim from src/minigames/carrot/progress.ts and challenges.ts in the game repo
// (the page package owns the originals); keep them identical so both repos merge a record the same way.
const cleanKinds=(raw:unknown)=>{const kinds:Record<string,number>={};if(raw&&typeof raw==='object')for(const [kind,value] of Object.entries(raw as Record<string,unknown>))if(/^[a-z]{2,16}$/.test(kind)&&typeof value==='number'&&Number.isFinite(value)&&value>0)kinds[kind]=Math.floor(value);return kinds}
function cleanSuper(raw:unknown):SuperSave|null {
 if(!raw||typeof raw!=='object'||(raw as SuperSave).version!==1)return null
 const r=raw as Partial<SuperSave>
 return {version:1,taught:r.taught===true,merges:Math.max(0,Math.floor(Number(r.merges)||0)),kinds:cleanKinds(r.kinds)}
}
/** A record from a newer client (version above this code's 1) is passed through untouched rather than merged by rules it may have outgrown. */
export function newerVersion(a:unknown,b:unknown):unknown {
 const v=(r:unknown)=>r&&typeof r==='object'&&Number.isInteger((r as {version?:unknown}).version)?(r as {version:number}).version:0
 const va=v(a),vb=v(b);if(va<=1&&vb<=1)return null
 return va>=vb?a:b
}
/** Pure merge for account sync: taught OR, merges max, kinds per-key max, a higher version wins outright. */
export function mergeCarrotSuper(a:SuperSave|null|undefined,b:SuperSave|null|undefined):SuperSave|null {
 const newer=newerVersion(a,b);if(newer)return newer as SuperSave
 const x=cleanSuper(a),y=cleanSuper(b)
 if(!x)return y;if(!y)return x
 const kinds:Record<string,number>={...x.kinds};for(const [kind,value] of Object.entries(y.kinds))kinds[kind]=Math.max(kinds[kind]||0,value)
 return {version:1,taught:x.taught||y.taught,merges:Math.max(x.merges,y.merges),kinds}
}

// A v1 client strips Portal as an unknown boss. Version 2 triggers its newer-format
// freeze; v1 data still migrates with a full per-boss union in current clients.
const newerChallengeVersion=(a:unknown,b:unknown):unknown=>{const v=(r:unknown)=>r&&typeof r==='object'&&Number.isInteger((r as {version?:unknown}).version)?(r as {version:number}).version:0;const va=v(a),vb=v(b);return va<=2&&vb<=2?null:va>=vb?a:b}
const challengeBosses:ChallengeBoss[]=['tornado','zombie','eyeball','portal']
const isBoss=(v:unknown):v is ChallengeBoss=>typeof v==='string'&&(challengeBosses as string[]).includes(v)
const cleanRecord=(raw:unknown):ChallengeRecord|null=>{
 if(!raw||typeof raw!=='object')return null
 const r=raw as Partial<ChallengeRecord>;const health=Math.floor(Number(r.health)),seconds=Number(r.seconds),towers=Math.floor(Number(r.towers))
 if(r.cleared!==true||!Number.isInteger(health)||health<1||health>10||!Number.isFinite(seconds)||seconds<0)return null
 return {cleared:true,health,seconds:Math.round(seconds*10)/10,towers:Number.isFinite(towers)&&towers>=0?towers:0}
}
function cleanChallenges(raw:unknown):ChallengeSave|null {
 if(!raw||typeof raw!=='object')return null
 const version=(raw as {version?:unknown}).version
 if(version!==1&&version!==2)return null
 const best:ChallengeSave['best']={};const source=(raw as ChallengeSave).best
 if(source&&typeof source==='object')for(const [boss,record] of Object.entries(source)){const r=cleanRecord(record);if(isBoss(boss)&&r)best[boss]=r}
 return {version:2,best}
}
function combine(a:ChallengeRecord,b:ChallengeRecord):ChallengeRecord {
 const faster=a.seconds<=b.seconds?a:b
 return {cleared:a.cleared||b.cleared,health:Math.max(a.health,b.health),seconds:faster.seconds,towers:faster.towers}
}
/** Pure merge for account sync: per boss, cleared OR, best health, the faster time (with its tower count); v1 migrates to v2 and formats above v2 pass through. */
export function mergeCarrotChallenges(a:unknown,b:unknown):ChallengeSave|null {
 const newer=newerChallengeVersion(a,b);if(newer)return newer as ChallengeSave
 const x=cleanChallenges(a),y=cleanChallenges(b)
 if(!x)return y;if(!y)return x
 const best:ChallengeSave['best']={}
 for(const boss of challengeBosses){const p=x.best[boss],q=y.best[boss];if(p&&q)best[boss]=combine(p,q);else if(p||q)best[boss]=(p||q) as ChallengeRecord}
 return {version:2,best}
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
  'carrot:super': { key: 'cgs-carrot-super-v1' },
  'carrot:challenges': { key: 'cgs-carrot-challenges-v1' },
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
  'carrot:super': mergeCarrotSuper as Merge<SuperSave>,
  'carrot:challenges': mergeCarrotChallenges as Merge<ChallengeSave>,
  'inkmaze:best': mergeBests,
  'inkmaze:sound': localWins as Merge<string>,
  'inkmaze:code': laterWins as Merge<unknown>,
  'inkmaze:code-prefs': localWins as Merge<unknown>,
  'forge:run': laterWins as Merge<ForgeRun>,
  'forge:player': mergeForgePlayer,
  'forge:scores': mergeForgeScores,
} as const
