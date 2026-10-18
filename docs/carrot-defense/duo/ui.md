# Carrot Defense multiplayer: lobby and duo UI

Owner: stream `lobby-and-duo-ui` (branch `duo-s-lobby-and-duo-ui`). This covers the React side of two-player play: the entry pill,
the room lobby, the side reveal, the duo and endless HUD additions, the results card, the endless record and the page hooks. The net
layer (`src/minigames/carrot/net/**`, the `cgs-rooms` Worker) and the Unity side are other streams; this UI codes against the frozen
`DuoSession` contract in `net/protocol.ts`.

## Files

| File | What it is |
| --- | --- |
| `duo/index.ts` | What the page imports: `useDuo`, `DuoLayer`, `DuoEntry`. |
| `duo/useDuo.ts` | `DuoController` (session lifecycle, the page-command filter, the engine link, toasts, announcements, the endless record) and the `useDuo` hook. |
| `duo/DuoLayer.tsx` | The root layer: entry pill, page-root marks, the aria-live regions, and the lazy `DuoScreens` chunk. |
| `duo/DuoScreens.tsx` | Everything past the pill, loaded the first time multiplayer opens: lobby, reveal, HUD, countdown, results, toasts. |
| `duo/DuoEntry.tsx` | "Play with a friend" pill (and a `compact` variant for a slot in the redesigned lobby). |
| `duo/DuoLobby.tsx`, `duo/CodeInput.tsx` | Home (create or join), connecting, the room, errors. |
| `duo/SideReveal.tsx` | The crypto side draw as a mirrored mini-map, the sentence, the shared 3-2-1. |
| `duo/DuoHud.tsx`, `duo/EndlessHud.tsx`, `duo/bits.tsx` | The rail (partner chip or endless card, camera switch, connection chip), banners, toasts, the go/resume countdown. |
| `duo/DuoResults.tsx` | Every result: duo win, duo loss, unfinished, endless. |
| `duo/endlessRecord.ts` | `cgs-carrot-endless2p-v1`: read, clean, merge, save. |
| `duo/profile.ts` | The fights, the unlock offer, the display name, the room profile. |
| `duo/copy.ts`, `duo/code.ts`, `duo/contract.ts` | Pure copy (results, errors, banners), room-code normalization, the contract re-exports. |
| `duo/mockSession.ts` | A scripted `DuoSession` (development and tests only; never in the production bundle). |
| `duo/duo-base.css`, `duo/duo.css` | Tokens, glass recipe and the pill (with the page) / every other screen (with `DuoScreens`). |
| `scripts/test-carrot-duo-ui.mjs` | Node checks of the pure modules (148 checks). |
| `scripts/carrot-duo-ui-qa/ui.mjs` | Playwright acceptance suite on the mock session (790 checks per engine). |

## Page hooks (CarrotPage.tsx: 3 new lines and one gate)

```tsx
import { DuoLayer, useDuo } from './duo'                                                // after the waves import
const duo=useDuo({store,engine,ready,entered,enter:()=>setEntered(true),loading})   // after veteranAvailable
{result&&!duo.active&&st&&(st.phase==='won'||st.phase==='lost')&&<Results ...       // the one changed expression
<DuoLayer duo={duo} entered={entered} definitions={definitions} reduced={reduced}/>  // last child of the root
```

Nothing else in the page changes. Every page command (keyboard, HUD, Results, Settings restart, LevelSelect's `load`) reaches the
duo layer through the send filter on `CarrotUnity` (`setSendFilter`, added to `unity.ts` by the net layer), so the old plan's hooks
(3) to (5) are gone. A 3-way merge dry run of this file against carrot-next's working `CarrotPage.tsx` (base `1b1b65e`) merged with
0 conflicts, and the merged page type-checks with the redesign's files; the duo QA suite passed on it (792/792, Chromium and WebKit, desktop and portrait).

`duo.active` is true while a room exists or the overlay is open; the page's own Results are then hidden (the duo results replace
them). The award effect is untouched: a duo win reaches it through the own-half snapshot (phase `won`, mode `duo`, the level's own
id), so `awardCampaign` / `awardChallenge` and `awardRecord` record it on each player's device exactly like a solo win. Level 90
(endless) falls outside every award guard, and the endless record is written by the duo layer.

## The controller and the command filter

`useDuo` keeps the session out of CarrotPage's React state. The page re-renders only when `available`, `isOpen`, `active` or `phase`
changes; every finer value (seats, ping, partner view at 4 Hz, toasts) is read by the duo components through their own
`useSyncExternalStore` slices. The net layer's `createUnityLink` (loaded with the session) gets a proxy of the player that always
targets the current `CarrotUnity`, so the filter survives the page re-creating the player; on a build without `setSendFilter` the
proxy wraps that instance's `send` instead.

| Page command | In a room |
| --- | --- |
| `pause` (button, Space, menus, the page's visibility handler) | Explicit `session.pause(!paused,'manual')`; a hidden tab is ignored (the session's away logic owns it); a pause within 5 s of your own resume waits (`PAUSE_COOLDOWN_MS`, toast "You can pause again in 3 s"). |
| `setPaused` (first-encounter cards) | Swallowed: cards never pause a match. |
| `load` (stage select, restart, results) | Swallowed, toast "Leave the room to play another stage". |
| `sell` (endless, a tower with `builder` = the partner) | The first tap shows "Built by Ana, tap again to sell"; a second tap within 4 s sells. |
| Anything during lobby / reveal / results | Only `select`, `clear`, `preview`, `mute` go through. |
| Everything else | `session.send(cmd)` (start, speed, ops), and on to Unity when the session does not consume it. |

## Screens

* **Entry.** A floating glass pill on the title screen, shown only when multiplayer is configured (`VITE_ROOMS_URL`, or in
  development `?carrot-rooms=<url>` / `?carrot-duo-mock`). On phones the title screen keeps 68 px under its last row so nothing sits
  beneath the pill. Hovering, focusing or touching it prefetches the screens chunk.
* **Home.** Name (stored in `cgs-carrot-duo-name`, 24 characters), Create room, Join with a code. The code field uppercases, drops
  spaces, dashes and dots, and refuses 0, O, 1, I and L with "Codes never use 0, O, 1, I or L"; paste works; Enter joins.
* **Room.** The code large and spaced (read as "K, 7, M, 2, Q"), Copy code, Copy link (`#room=CODE`, which opens straight into the
  room). Two seats: name (your own is editable), You / Host, Ready, Connected / Away, loading progress, Direct or Relay with ping.
  The host picks Boss fight (the 11 fights with locks) or Endless (both players' bests). Ready toggles; Start is enabled for the host
  only when both are ready, loaded and connected; the footer says what is missing. A friend joining is announced, leaving is a toast.
* **Unlocks.** By default only fights BOTH players have unlocked are offered (the Giant Tornado is always open, so a fresh pair can
  play). The host's toggle "Include fights only one of us has unlocked (a win unlocks it for both of you)" switches to the union;
  each card then says "New for Ana", and a locked one "Locked for Ana" / "Locked for both". This follows the critique: under the union
  rule a fresh account that wins L24 in duo jumps its campaign unlock, which the owner should opt into. The offer is computed from each
  player's own saves, read-only (`readCampaign`, `readChallenges`, `challengeUnlocked`).
* **Errors.** A headline, the protocol's own copy (`net/protocol.ts errorCopy`) and Retry (network, busy, in progress) or Back. The
  busy copy names the next 00:00 UTC in the player's time zone (8 pm Eastern now, 7 pm after Nov 1).
* **Side reveal.** The mirrored mini-map (west/east, north/south for Asuna; Twin Gates drawn from its real routes for endless), "You
  defend the WEST garden" / "You start at the WEST gate", what the partner defends, and the 3-2-1 against the room's `startAt`.
* **Duo HUD** (on top of the stock HUD, never replacing it): the left rail with the partner chip (name, side, hearts, wave, coins,
  their boss bar, safe / away / catching up), the camera switch (My side / Both / Watch Ana, sent as Net `camera`), the connection
  chip (Direct or Relay with ping, Hiccup, Reconnecting). On phones the rail is 60 px wide and the camera is one button that opens the
  three views beside it.
* **Endless HUD.** Wave and score (waves survived) in place of the stock "Wave 03/999" (hidden via `data-duo='endless'`, and the
  stock track leaves the accessibility tree), the next miniboss or boss ("Miniboss in 3 waves", named from `incoming` when it is the
  next wave), the shared purse with who spent what, the colour legend, the camera switch and the input delay in debug builds.
* **Banners** (one at a time, by priority): restoring the partner's garden 43%; Continue solo / End run after the grace; "Ana stepped
  away 0:42"; "Ana paused" / "You paused" / connection lost / resyncing; "Your garden is safe, waiting for Ana"; "Waiting for Ana";
  "Waiting for Ana to start" / "Ana is ready for wave 1"; "Slowed for Ana". The page's own paused card keeps its Resume button.
* **Toasts.** "That's Ana's side" (at most one a second), "Resynced", rejections ("Pad taken by Ana", "More coins needed"), the sell
  confirm, the pause cooldown, session notices.
* **Results.** Duo win: both sides' hearts, team time, kills, "Win recorded for both players". Duo loss: whose carrot fell (or both)
  and on which wave. Unfinished: why, and "Nothing was recorded". Endless: waves survived, previous or device best, time, team kills,
  and who built and spent what. Rematch (back to the room with you ready), Change fight (host) / Back to room, Leave, and View the
  garden (collapses the card; after the partner's carrot fell it also turns the camera to their side).
* **Announcements.** Two live regions (polite and assertive) mounted with the page: room open with its code, friend joined, the match
  starting, wave 1, partner paused / resumed / away / back / left, the partner's garden safe, partner carrot hits (at most every 6 s),
  every toast, every result.

## Fields the UI reads beyond the frozen contract

All optional; the UI works without them.

| Field | Used for | Without it |
| --- | --- | --- |
| `selection.builder` in the Unity snapshot (TowerState.builder) | the endless sell confirm | no confirm |
| `net.seats[seat] = {built, spent, damage}` in the snapshot | the endless purse split and the results' who-built-what | your own builds and spending are counted from your executed pending ops; the partner's side is not shown |
| `net.score` in the snapshot | the endless score | highest wave fully cleared, from `wave` and the breather |
| `EngineLink.idle(on)` (protocol, optional) | asking Unity for a low frame rate while the lobby covers the canvas | full frame rate |

## Records

`cgs-carrot-endless2p-v1` = `{version: 1, best: {waves, seconds, kills, partner (24 chars or fewer), solo, at (ISO)} | null, runs}`.
More waves wins; a tie keeps the earlier record; every finished run counts in `runs`. Reads survive blocked storage and corrupt JSON
(a fresh record), writes are unioned with what is stored first (a stale copy never lowers a best). Seconds and kills come from the own
snapshot at the end of the run. No account sync (src/lib/account is off limits; a future account record can adopt the format). The
duo layer writes only this key and `cgs-carrot-duo-name`; no existing key changes format.

## Look and budget

Rounded glass in the redesign's language: radii 20 to 28 px, pills for every control, translucent fills over `--gl-tint`, hairline
light borders, soft shadows, no hard edges. Tokens are the redesign's (`--gl-tint`, `--gl-light`, `--gl-a-*`, `--gl-radius`, `--ink*`,
`--accent`, `--tone`, `--e-spring`, `--e-out`, `--gutter`, `--f-*`), each with a fallback, so the screens look the same on today's page
and after carrot-next lands; nothing depends on `carrot.css` classes. Backdrop blur only under `[data-glass='real']` and on one surface
at a time (the lobby sheet or the reveal card); nothing in-game blurs. Animations move transform and opacity only; reduced motion (the
OS setting or the page's Reduced effects) switches every duo animation to an opacity fade. Focus rings follow each control's radius
(an important rule in the first cascade layer outranks the site's square ring). Every control is at least 44 x 44 px; layouts hold at
320 px with a 16 px gutter, in portrait and landscape.

Bundle (vite build): the pill, the controller, the live regions and the page-root marks add about 28 KB raw / 9.8 KB gzip of JS and
6 KB raw / 1.4 KB gzip of CSS to the Carrot page chunk; the screens are a separate 36 KB / 11.7 KB gzip chunk (plus 35 KB / 6.9 KB
of CSS) fetched on first use; the net layer is its own lazy chunk. The mock session is not in the production bundle.

## Development and QA

* `?carrot-duo-mock` (development builds only) runs the scripted session; `&carrot-duo-fast` quarters its timers; `&carrot-duo-manual`
  stops the fake partner from readying or pressing Start by itself. `window.__duoMock` drives it (`partnerJoin`, `partnerReady`,
  `partnerStart`, `partnerPause`, `partnerAway`, `set(patch)`, `emit(event)`, `result(result)`, `error(code)`, `log`, `camera`).
  Join codes pick an outcome: ZZZZZ not found, FFFFF full, PPPPP in progress, VVVVV version mismatch, NNNNN network, BBBBB busy.
* `?carrot-duo-debug` shows the lockstep input delay in the connection chip (always on in development).
* `node scripts/test-carrot-duo-ui.mjs`: 148 checks (codes, the unlock offer for fresh, mid and complete saves, the endless record with
  corrupt and blocked storage, result and error copy, the busy time in New York summer and winter).
* `BASE=http://localhost:5190 node scripts/carrot-duo-ui-qa/ui.mjs [chromium|webkit|all] [p320,portrait,landscape,desktop]`:
  790/790 checks in Chromium and 790/790 in WebKit (title, home, wrong code, connecting, six join errors, partner left, guest and host
  rooms, ready and start gating, union toggle, both reveals, prep, go countdown, playing, every banner, toasts, the camera popover,
  pause through Space with the cooldown, a blocked stage load, every result, the endless HUD over the stock track, the sell confirm,
  the solo choice, the endless record; per screen: no horizontal scroll, 44 px controls, live regions; focus rings and document tab
  order; reduced motion uses no transform animation; no backdrop-filter while playing and at most one in the lobby; the page's
  Results hidden; a duo win recorded through the page's award path; no entry without a rooms URL). WebKit tabs with Option+Tab.
* `scripts/carrot-duo-ui-qa/rooms-e2e.mjs` runs the UI over the real net layer and a real `cgs-rooms` Worker (`wrangler dev --local`)
  in two browsers on the mock Unity player. With the netcode branch (c79e8f3) merged into this one in a scratch worktree: 15/15 in
  Chromium + WebKit and 15/15 in Chromium + Chromium. An unknown code reads "Room not found", a third player "Room full"; the guest
  joins with a typed lowercase spaced code; the host sees both seats with a ping; a fresh guest leaves only the Tornado on offer;
  Start gates on both ready and loaded; the reveals draw opposite gardens; prep says "Waiting for Ana to start" / "Mia is ready for
  wave 1"; both reach wave 1 after the shared countdown; Space on one device pauses both ("You paused" / "Mia paused"); either
  resumes with a shared 3-2-1; the cooldown binds only the player who resumed; a partner whose tab vanishes pauses the match with
  the grace clock ("Mia stepped away 0:56"). In the same setup the host leaving the lobby promoted the guest to host.

## Integration changes (lead, 2026-10-17)

* Net messages to Unity wait in `DuoController.netQueue` until the player is loaded and then go out in order (a reload that
  rejoins a running match sends `session` before Unity exists).
* Endless reveal: the camera frames the seat's home wing (seat 0 west, seat 1 east), so the reveal and its mini-map name the
  seat's gate; the room's side draw splits only the duo maps.
* The endless purse split and the results' spend rows read Unity's `net.spent` ([seat 0, seat 1]) when `net.seats` is absent;
  the partner's row then shows coins without a tower count.

## Integration notes (lead)

* `net/protocol.ts` was cherry-picked from the netcode branch's first commit; the netcode branch has edited it since, so merging the two
  branches gives an add/add conflict on that file: take the netcode version (the duo UI handles its additions, e.g. `fell: -1`).
* Add `node scripts/test-carrot-duo-ui.mjs` to `test` and `carrot:test` in package.json.
* The Playwright suite needs a dev server; the mock session lives only in development builds.
* Requests to the sim stream (optional): `builder` on the snapshot's tower selection, `net.seats` per-seat counters, and an `idle`
  bridge message for the lobby.
* The entry pill shows only on the title screen; after closing multiplayer in-game the way back is the title screen or a room link.
  The redesign can slot `<DuoEntry compact/>` into its own lobby or menus.
