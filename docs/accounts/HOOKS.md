# Hooking a game into player accounts

`src/lib/account/` syncs the games' localStorage keys to a player's Google
account. A game keeps owning its keys and never waits for the network. It does
two things: **register** each key once (at module load), and **touch** the
record after every `setItem`. The module does the rest: it stamps a timestamp
per record, pushes changed records while a session exists (debounced 1.5 s),
and on login or page load pulls the server's copies, merges them with the
game's rule and writes the result to both places. Signed out, `touch` only
stamps a timestamp; nothing else changes.

Carrot Defense is wired (`src/minigames/carrot/progress.ts`, `CarrotPage.tsx`)
and is the reference. This page has the exact lines for Ink Maze and Forge,
and for the two Carrot records (Super, boss challenges) that land with the
`carrot-3d-upgrade` branch.

## Carrot Defense: Super and boss challenges

The 24-level campaign keeps `carrot:campaign` (`cgs-carrot-defense-v1`, version 1,
`unlocked` clamped to `CARROT_LEVEL_COUNT` = 24). Two more records arrive with the
Super merge and the boss-challenge lobby; their pure merge rules already live in
`merges.ts` (`mergeCarrotSuper`, `mergeCarrotChallenges`, exported through `MERGES`,
keys in `KNOWN_KEYS`) and are copied verbatim from the game modules, so the three
lines below are the whole wiring when the branches meet:

```ts
// src/minigames/carrot/progress.ts (the Super record: taught OR, merges max, kinds per-kind max)
progress.register('carrot:super', { key: 'cgs-carrot-super-v1', read: () => cleanSuper(JSON.parse(localStorage.getItem('cgs-carrot-super-v1') || 'null')), merge: mergeCarrotSuper })
// inside saveSuper, after its setItem (recordSuper and teachSuper both go through it):
progress.touch('carrot:super')

// src/minigames/carrot/challenges.ts (the best run per boss: cleared OR, health max, the faster time with its tower count)
progress.register('carrot:challenges', { key: 'cgs-carrot-challenges-v1', read: rawChallenges, merge: mergeCarrotChallenges })
// inside saveChallenges, after its setItem (awardChallenge goes through it):
progress.touch('carrot:challenges')
```

`read` returns `null` for an unreadable record (a `version` other than 1), as
`rawCampaign` does, so an old build never pushes a fallback over a newer format.
Neither record is private: a shared device keeps and merges them like the campaign.

## The API

```ts
import { progress } from '../../lib/account/index.ts'     // the .ts extension matters: see below
import { MERGES, laterWins, localWins } from '../../lib/account/merges.ts'

progress.register(id, { key, read?, write?, merge, private? })   // once per key, at module load; returns an unregister fn
progress.touch(id)                                                // after every setItem of that key
progress.subscribe(id, cb)                                        // cb runs after the module wrote a DIFFERENT value to the key, or removed it
```

- `id` is `'game:name'` (lowercase, `[a-z0-9]+:[a-z0-9-]{1,30}`). It names the server record; nothing on the server needs adding for a new id.
- `key` is the localStorage key the game owns.
- `read()` defaults to `JSON.parse(localStorage.getItem(key))` or `null`; `write(v)` defaults to `localStorage.setItem(key, JSON.stringify(v))`. Give both only for a non-JSON key (the Ink Maze sound string) or when the game keeps an in-memory copy that `write` must also update. **`read()` must return `null` for a save the game cannot use** (a `version` it does not know, like Carrot's `rawCampaign`): the module reads back what it wrote, and a record this build cannot read is reverted and frozen (never used, never pushed), so an old tab or a cached build cannot overwrite a newer save format on the server.
- `merge(local, remote, { localUpdated, remoteUpdated })` returns the better value. Either side may be `null`. Use one from `merges.ts`. All of them let a copy with a higher numeric `version` win unchanged, so bump `version` when a save format changes.
- `private: true` marks a record that belongs to one account and must never cross to another (the Forge leaderboard identity: its `proof` authenticates world-board submissions). `forge:player` gets this by default (`PRIVATE_RECORDS` in `merges.ts`). When a different account signs in on a device, private keys are removed instead of merged; the game then mints a fresh identity on its next read.
- `touch` inside `write` is harmless: a write made by a pull does not count as a touch.
- Keys can be **removed** by the module: "Sign out and clear this device" and a sign-in that chooses the account's copy over the device's remove the known keys (`localStorage.removeItem`) and fire `subscribe`. A game that reads the key on demand needs nothing; one that keeps the value in state must re-read in its `subscribe` callback (it already does for pulls).
- Size: a record may be up to 64 KB, `forge:run` up to 400 KB (a full 12 000-action run). Bodies over 4 KB are gzipped on the wire automatically; nothing to do in the game.
- With the feature off (no `VITE_ACCOUNT_API_URL` / `VITE_GOOGLE_CLIENT_ID`, or outside a browser) every call is a no-op: no storage writes, no network.
- **Import with the `.ts` extension** (`'../../lib/account/index.ts'`). `scripts/test-*.mjs` import the game modules under plain node, which cannot resolve a directory import; the repo's tsconfig allows `.ts` imports and Vite handles them.
- `index.ts` is DOM-free at import time, so a game module that registers at load still works in node tests (`register`/`touch` do nothing there).

## Ink Maze

`src/minigames/inkmaze/progress.ts`, at the bottom of the file:

```ts
import { progress } from '../../lib/account/index.ts'
import { MERGES } from '../../lib/account/merges.ts'
progress.register('inkmaze:best', { key: KEY, merge: MERGES['inkmaze:best'] })   // KEY = 'cgs-inkmaze-best-v1'
```

and in `recordWin`, right after `localStorage.setItem(KEY, JSON.stringify(bests))`:

```ts
progress.touch('inkmaze:best')
```

`src/minigames/inkmaze/sound.ts` (the value is the raw string `'on' | 'off'`, not JSON, so give `read` and `write`):

```ts
import { progress } from '../../lib/account/index.ts'
import { MERGES } from '../../lib/account/merges.ts'
progress.register('inkmaze:sound', { key: STORAGE_KEY, read: () => localStorage.getItem(STORAGE_KEY), write: (v) => localStorage.setItem(STORAGE_KEY, v), merge: MERGES['inkmaze:sound'] })
```

and in `writeMuted`, after the `setItem`: `progress.touch('inkmaze:sound')`.
(`localWins`: this device keeps its own choice; a new device adopts the account's.)

The level-26 code editor keys, one line each; any further key is the same shape:

```ts
progress.register('inkmaze:code', { key: 'cgs-inkmaze-code-v1', merge: MERGES['inkmaze:code'] })              // laterWins: the copy edited most recently
progress.register('inkmaze:code-prefs', { key: 'cgs-inkmaze-code-prefs-v1', merge: MERGES['inkmaze:code-prefs'] })  // localWins: a preference
```

plus `progress.touch('inkmaze:code')` / `progress.touch('inkmaze:code-prefs')` after their `setItem`s. A brand-new key: pick an id `inkmaze:<name>`, register with `laterWins` (state) or `localWins` (preference), touch after writes. Optionally add the id and key to `KNOWN_KEYS` in `merges.ts` (one line) so **Sign out and clear this device** removes it even on a device where that page was never opened; keys the page has registered are remembered anyway.

If the Ink Maze page keeps the bests or the editor buffer in React state, adopt a pulled value:

```ts
useEffect(() => progress.subscribe('inkmaze:best', () => setBests(loadBests())), [])
useEffect(() => progress.subscribe('inkmaze:code', () => { if (!editing) setCode(loadCode()) }), [])   // do not replace text under the cursor
```

Without this, the next local save overwrites the pulled copy and pushes it with a newer stamp.

## Forge or Fold

`src/minigames/forge/storage.ts`, at the bottom of the file:

```ts
import { progress } from '../../lib/account/index.ts'
import { MERGES } from '../../lib/account/merges.ts'
progress.register('forge:run', { key: KEY, merge: MERGES['forge:run'] })                 // 'cgs-forge-run-v1': the run touched most recently wins
progress.register('forge:player', { key: 'cgs-forge-player', merge: MERGES['forge:player'] })   // one leaderboard identity per account
progress.register('forge:scores', { key: 'cgs-forge-scores', merge: MERGES['forge:scores'] })   // union, best per player, top 50
```

Touch points, each right after the matching `localStorage.setItem` (inside the `try`, so a failed write is not reported as a change; the `forge-qa` dev path returns before saving and must not touch):

| function | line to add |
|---|---|
| `saveSession` | `progress.touch('forge:run')` |
| `identity()` (after creating and storing a new id) and `saveName` | `progress.touch('forge:player')` |
| `recordLocal` | `progress.touch('forge:scores')` |

**Required in `ForgePage.tsx`:** the page plays from `sessionRef.current`, and the 100 ms day clock calls `saveSession(sessionRef.current)` on every exit. If a pull writes another device's run to `cgs-forge-run-v1` and the page does not adopt it, the next `saveSession` overwrites it and pushes it with a newer stamp, so the pulled run is lost. Adopt it, in the same way `newRun` does, and skip while a hit is being resolved (`busyLock`) so the scene is not swapped mid-animation:

```ts
useEffect(() => progress.subscribe('forge:run', () => {
  if (busyLock.current || prepareId.current) return          // mid-hit: the next save re-pushes this device's run, which is the one being played
  const next = loadSession()
  sessionRef.current = next; clockMark.current = performance.now(); queuedHit.current = false
  setSession(next); choose(next.state.knives[0]?.id); setEvent(null)
  scene.current?.sync(next.state, next.state.knives[0]?.id)
}), [])
```

`forge:player` needs no page hook (`player` is read once with `identity()`; a merged identity applies on the next page load, and `mergeForgePlayer` keeps the account's id so the world board shows one entry per account). It is account-private: when another account signs in on the same device the key is removed and `identity()` mints a fresh id on the next load, so one player can never submit world scores as another. `forge:scores` is read with `localScores()` when the board opens, so a pull is picked up on the next open; add `progress.subscribe('forge:scores', …)` only if the board is kept in state.

The run record may be large (up to 400 KB; it is gzipped on the wire). Nothing is pushed until the page's registration has been merged with a current server copy, so a Forge tab opened hours after signing in cannot push an old run over one played since on another device; while that first merge is pending, play continues from the local run as usual.

Device-local on purpose (do not register): `cgs-forge-audio` and the site-wide `cgs-sound`.

## Checking it

- `node scripts/test-account-sync.mjs` covers the merge rules and the sync engine with fakes; add a case there for a new merge rule.
- The games' own node tests keep passing because `index.ts` has no DOM at import and `register`/`touch` are no-ops outside a browser.
- In the browser with `.env.local` set (see `SETUP.md`): sign in on `/minigames/`, play, open the same page in another browser profile, sign in, and see the progress arrive. The Network tab shows one `PUT /progress/<id>` per changed record, at most one per 2.5 s.
