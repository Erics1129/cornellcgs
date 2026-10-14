# Giant update: the web UI ("Neon Harvest")

The page around the Unity player: the HUD, the menus, onboarding and the progression saves. It is a rhythm-game-styled interface for a
tower-defense game (the game does not become a rhythm game), built only from what the project already has: the fonts index.html loads
(Hanken Grotesk, JetBrains Mono, Bricolage Grotesque), the existing painted art, and captures of the game's own boards.

Everything works against today's shipped player (bridge v1), and gets more exact when a build reports `v: 2`.

## Files

| Path | What it holds |
|---|---|
| `src/minigames/carrot/CarrotPage.tsx` | Orchestration: game-data, saves, the Unity lifecycle, awards, keyboard, panels. |
| `hooks/useSnapshot.ts` | The 10 Hz snapshot outside React. `useSlice(store, select)` re-renders a subtree only when its slice changes; `store.clock()` extrapolates game time between publishes from `timeScale` (or speed and pause). |
| `hooks/runTracker.ts` | Per-run judgements, the defense chain and hearts lost per wave (v2 `judgement`, or inferred from v1 snapshots). |
| `ui/WaveTrack.tsx` | The top wave track. |
| `ui/Hud.tsx` | Coins, hearts, chain, judgement slot, edge vignette, controls, bottom bar, paused card, beat glow. |
| `ui/BossBar.tsx` | Boss bar, cast row, challenge deadline, Asuna reinforcements, miniboss bars, DOM monster bars. |
| `ui/BuildMenu.tsx` | Build and tower panels and their placement. |
| `ui/Results.tsx` | Results card, grade, stats, loss advice. |
| `ui/LevelSelect.tsx`, `ui/Lobby.tsx`, `ui/Loading.tsx`, `ui/Modals.tsx`, `ui/Onboarding.tsx`, `ui/kit.tsx` | Menus, loading, dialogs, tutorial and first-encounter cards, shared bits. |
| `waves.ts` | Pure wave data: packets per route, creature traits, work-weighted wave bounds and flags. |
| `abilities.ts` | Name, hint, first-encounter card (12 words at most) and two-word verb for every telegraphed ability. |
| `flash.ts` | Page flash governor. |
| `prefs.ts`, `volume.ts` | Device preferences, and the volume sliders' adapter to the audio stream's `audioPrefs.ts`. |
| `carrot.css` | Layers `carrot.tokens`, `carrot.base`, `carrot.hud`, `carrot.menus`, `carrot.themes`. They are namespaced because the site's Tailwind already owns a layer called `base`. |
| `scripts/carrot-ui-qa/` | The QA harness: mock player, fixtures, acceptance suite, screenshots, WebP and jacket tools. |

## Bridge contract v2, as the page reads it

Every v2 field is optional. Without it, the page falls back as listed.

| Field | Use | Without it (v1) |
|---|---|---|
| `incoming[]` | Wave-track notes. `at` and `span` are game seconds on the clock of the packet's own wave. For the current wave, time until spawn = `at - waveElapsed`. For the next wave (`wave` greater than the current one), it is `nextWave + at` during the breather; outside a breather the notes queue at the right edge. | Notes from game-data `wavePlan`, or rebuilt from `waveCompositions` with BeginWave's route formula and the GapScale/PacketOverlap tables (a copy of `CarrotData` at 48d1336). |
| `waveElapsed`, `timeScale` | Note positions and countdowns between publishes. | `elapsed` minus the elapsed time when the wave number last increased, and `speed`. |
| `judgement{seq}` | The judgement words. The first `seq` seen in a run is only a baseline. | Inferred: a lost heart is LEAK (once per wave); a breather that starts with no heart lost in that wave is FLAWLESS, otherwise CLEAR; a boss phase step is PHASE BREAK; the merge-undo window opening is SUPER FORGED. |
| `stats` | Results: leak kinds, top-5 damage by tower. | Those rows are hidden. Hearts lost per wave are always tracked on the page. |
| `lossCauses[]` | Defeat advice ("Moths on route B: no air towers in range. Try Starfruit."). | Advice from the waves where hearts fell, read against their compositions (air, armor, shield, fast, guardian). |
| `boss.abilityTarget` | The SELL NOW chip. | No chip (v1 never reports a target). |
| `boss.windup` | The countdown ring's full turn. | The largest `castRemaining` seen for that cast. |
| `boss.routeFraction`, `eta`, `contactFatal` | Challenge deadline bar, ETA, warnings at 75% and 90%. | The "Guardian contact = defeat" line only. |
| `speedHold`, `speedHoldReason` | The speed button reads "1× HOLD". | Normal speed button. |
| `carrotX`, `carrotY`, `spawnPoints` | The build panel keeps clear of the carrot and the spawn gates. | The panel only avoids the pad and the HUD. |
| `caps` (`worldBars`, `veteran`) | `worldBars` hides the DOM monster bars; `veteran` shows the Veteran toggle in stage select. | DOM monster bars stay; no toggle (unless game-data `levels[].modes` lists `veteran`). |
| `runId` | Resets per-run state on restart. | A new level, a return to the ready phase, or a lower wave number counts as a new run. |
| `mode` | Veteran results fill `vgrade`. | Normal. |
| `par` (game-data) | Grade S needs time at or under par; the results show time against par. | S needs every medal only. |

**Commands the page sends:** `setPaused {value: 1|0}` for the first-encounter cards, on v2 only (v1 gets the `pause` toggle, sent only while the
game runs and toggled back only if the page paused it); `select {selectionType: 'tower', id}` followed by `sell` once the snapshot shows that
tower selected (the SELL NOW chip; it never sells a tier-5 Super, which uproot only demotes); `select {selectionType: 'enemy', id}` from
miniboss bars (the old page sent no selectionType); `load {level, mode: 'veteran'}` when Veteran is on; `load {level}` for Restart after a confirm.
The view messages `SetVolumes`, `SetSafeArea` and `FocusBoss` go only to a build whose snapshot reports `v >= 2`, because an older player has
no receiver for them. `SetSafeArea` is sent once per change (when a panel opens or closes, and on resize), never every frame. `SetReducedMotion`
carries `'1'` when either the OS setting or the page's Reduced effects toggle is on.

## Visual language

- **Colour:** semantic channels ally `#66CCFF` and `#99EEFF`, coin `#FFCC22`, grow `#B3D944`, threat `#FF66AA`, leak `#FF5D5D`, core `#ED1121`, super `#AA88FF` (hex values from osu! OsuColour, MIT). Biome accents: garden `#B3D944`, marsh `#66E0C8`, frost `#99EEFF`, orchard `#FFB347`, arena `#FF66AA`, prism `#AA88FF`. Challenge guardians override the accent. Only threat and leak pulse, at 2 Hz or slower. Every colour cue has an icon twin.
- **Panels:** opaque chamfered panels (8 px chamfer), a 1 px hairline, a 2 px accent light bar on key panels, and no backdrop-filter anywhere. The only blur is a static CSS filter on the stage-select backdrop (a menu, not the battlefield).
- **Type:** JetBrains Mono 700 with tabular figures for numbers (coins 22 px, 18 px on phones), Hanken Grotesk 700 uppercase labels at 11 px with 0.16 em tracking, Bricolage Grotesque 800 for display. Nothing is smaller than 11 px.
- **Style budget:** scanlines only on the wave track; at most two glowing elements (coins and the judgement word); skewed type only for judgement words and grades.
- **Motion (osu! lazer timings):** judgement 1.6 to 1 in 100 ms, then a slow grow and fade over 1.8 s; counter roll 250 ms OutQuint; HUD fade 300 ms; boss bar damage 500 ms, with a trail that waits 500 ms and drains in 300 ms; chromatic split 2 px for 140 ms; panel in 180 ms. Screen entrances are 400-600 ms and staggered.
- **Reduced motion** (the OS setting or Reduced effects): opacity changes only, each 250 ms or shorter. There are no transitions, no beat glow, and no spotlight pulse.

## HUD

- **Wave track (top centre):** one lane per route (A, B, C, each with its own colour). A note is a creature head with a ×count, trait badges (wing for air, plate for armor, hex for shield, cross for heal, crown for miniboss, skull for guardian) and a tail that runs to the packet's last spawn. Notes reach the judgement line at the moment they spawn. Bar lines every 5 game seconds scroll with the clock. Creature kinds the player has not met carry a NEW tag. The progress bar shows guardian (pink) and miniboss (gold) flags at the work-weighted start of their waves, and grows from 4 px to 14 px on hover or focus. In phone landscape the lanes merge into one, with notes coloured by route. The 20 s window is in game time, so notes move twice as fast at 2×.
- **Status (desktop top left; phone portrait bottom):** a rolling coin counter with dim leading zeros, a +N/−N chip (changes within 600 ms add up into one chip), ten hearts (a bitten heart flashes `#FF9393` then `#FF5D5D` and empties after 500 ms) with an edge-only red vignette, and the defense chain.
- **Defense chain:** consecutive leak-free waves and boss phases. It pulses only when it grows, and runs a 2 s break when a leak ends it. Kills are not counted here, because they need no player input.
- **Judgement slot:** one word at a time, and a new word replaces the old one. Screen readers hear at most one judgement every 2 s.
- **Controls:** speed (shows "1× HOLD" during a held telegraph), pause, sound, full screen, stage select and settings. Phones keep speed, pause and settings, and move the rest into settings. In landscape they form a right-hand rail.
- **Boss bar:** real phase ticks, a damage trail, a −45° hatch for shield, and a cast row. The cast row has a countdown ring, the ability name, the hint (or the two-word verb once seen), seconds, and an action chip: SELL NOW (+15%, or +10% on level 4), "Super drops to IV", SPEND or FOCUS. Challenges add a deadline row (contact rule, route bar with ticks at 75% and 90%, ETA) with warning states. All bars hide on won and lost.
- **Miniboss bars:** positioned with translate3d in container-query units, with a 100 ms linear transition. Only the bar takes taps. **Monster bars:** an imperative element pool (no React render per publish), shown until the build reports `worldBars`.
- **Toasts:** a WARNING band when a guardian enters, "Flying enemies next wave" (6 s; naming the unlocked air towers before the level's first air wave), Super forged with Undo, and the merge lesson. Snapshot notices that the HUD already shows are dropped: the load prompt "Choose a place", "Wave N", and "Defend the carrot". Toasts sit under the build panel and stay hidden during results.

## Build menu

Placement is decided once, when the panel opens. The panel is never re-placed while it is open; only the camera moves, through `SetSafeArea`.

- **Desktop:** an anchored panel of at most 280×190 px. It tries eight positions around the pad (sides first, then diagonals, then above and below) and scores each: overlapping the pad is rejected, overlapping the carrot costs heavily, nearness to a spawn gate costs, the side facing the carrot costs a little, and so does clamping. The HUD edges bound it.
- **Phone portrait:** a sheet of at most 200 px with 56 px tiles that scroll sideways. It docks above the bottom bar, or under the HUD when the pad or the carrot sits under the dock. If both docks collide, it becomes a compact anchored panel.
- **Phone landscape:** a side sheet with a sticky Build button. It docks at the right, or at the left when the pad or the carrot is under the right one. If both sides collide, it becomes an anchored panel the width of the sheet.
- **Tiles:** the unlocked towers plus the next one to unlock. Each tile shows its cost and an air badge. The detail row shows Air/Ground and Area/Single badges, a DPS bar (tier-1 damage over interval, normalised across families) and reach. The panel closes 0.8 s after Build or Upgrade, unless the selection has moved on or the panel is pressed again. The last tower built is remembered in `cgs-carrot-prefs-v1`.

## Results and grades

The card docks at the bottom 1.5 s after the outcome, so the victory beat plays first (0.3 s with reduced motion). On phones it is at most 40% of the height. Grades sit on one scale with the medals (formula in `gradeRun`, `progress.ts`):

| Grade | Rule |
|---|---|
| S | Won with every medal: 10 hearts, all scenery cleared (challenges have no scenery), and at or under par when a par is known. |
| A | Won with at least 8 hearts. |
| B | Won with at least 5 hearts. |
| C | Won. |
| D | Lost after reaching half the level's progress. |
| none | Lost earlier. |

The card shows hearts, time (against par), best chain, coins left, a hearts-lost-per-wave sparkline, and, when the build reports them, leak kinds and the top five towers by damage. A defeat lists the top two loss causes with a counter. After two losses on the same level in one visit, the card adds one tip.

## Saves

- **Untouched:** `cgs-carrot-defense-v1` (campaign v1), `cgs-carrot-super-v1` and `cgs-carrot-challenges-v1` (format 3). The golden file `scripts/fixtures/carrot-saves-golden.json`, generated from 48d1336, is replayed byte for byte by `test-carrot-progress`.
- **New synced record `carrot:records`** (`cgs-carrot-records-v1`): `{version: 1, levels: {'1'..'29': {grade 0-5, bestStreak, bestSeconds, vgrade}}, seen: {abilities[], creatures[]}, tutorial}`. The plan's `bestScore` was dropped: it was never defined, and the grade already carries the run's quality. Merge rules: per-field max, the fastest positive time, a sorted union of `seen` capped at 128 entries each, and OR for `tutorial`. Versions above 1 pass through untouched. The block is copied verbatim into `src/lib/account/merges.ts` (a test compares the two copies), with `KNOWN_KEYS` and `MERGES` entries. A full 29-level record is under 8 KB.
- **Device only:** `cgs-carrot-prefs-v1` (`lastTower`, `hudScale` 90/100/115, `reducedEffects`) and `cgs-carrot-audio-v1` (`music`, `sfx`, `ui`, owned by the audio stream). Every access is wrapped in try/catch. `campaign.sound` stays the master mute, and the sliders never write it.

## Onboarding

- **Guided first level:** shown to a new player on level 1 (no medals, nothing unlocked) until finished or skipped. Five steps: tap a clearing, choose Seed and Build (the tile and the button are spotlit), build two more, Start (spotlit), then watch. Stored in `records.tutorial`.
- **First-encounter cards:** the first time any boss or miniboss telegraph appears, the game pauses for one card: the glyph, the name and at most 12 words of counterplay. After that the cast row shows the glyph and a two-word verb. Stored in `records.seen.abilities`. Creatures met are added to `records.seen.creatures` 20 s into a level.

## Stage select and lobby

- **Lobby:** the key art (WebP), PLAY or CONTINUE, stage select, boss challenges, the field guide, settings and help, plus an "Up next" card with the next stage's jacket, band and grade.
- **Stage select:** a full-screen song-select dialog. It has chapter tabs (with cleared counts), a jacket card for the focused stage (band, difficulty pips, waves and routes, best grade, medals or stars, fastest time, chain, Play, and the Veteran toggle when it is advertised), and a track list with jacket thumbnails, bands, medals and grades. The focused jacket, blurred, is the backdrop. Arrow keys move through stages and chapters, and Enter plays.
- **Difficulty bands:** NORMAL (levels 1-3 and the chapter openers 5, 9, 13, 17, 21), HARD (the mid-chapter and pre-boss stages, and level 4), EXPERT (the boss stages 8, 12, 16, 20, 24). Challenges keep their own words: EASY, HARD, INSANE, ????.

## Accessibility

- The page flash governor (`flash.ts`) handles every DOM flash: a source that is still lit extends instead of retriggering, and at most three large flashes start in any rolling second.
- Targets are at least 44×44 px, text contrast is at least 4.5:1, and icons and medals are at least 3:1 (checked by the scan suite).
- `dialog` elements trap focus, the judgement and notices are live regions, and safe-area insets are respected.
- The site's unlayered `:focus-visible` rule is overridden with `!important`. Chamfered controls ring focus inside, because clip-path would cut an outline.
- Blindness dims the HUD to 0.78 (0.7 in full dark); the boss bar and controls stay at full opacity.

## Feature parity with the pre-update page

| Feature | Where it lives now |
|---|---|
| Lobby actions, all-games link, how to play, the error with Retry | `Lobby` |
| Continue, choose a level, boss challenges, field guide | `Lobby`, `LevelSelect`, `Modals` |
| Campaign chapters, challenge cards, lock captions, best runs | `LevelSelect` (chapter 05 is the challenges) |
| Field guide (Super names once forged, creature tabs) | `FieldGuide` |
| Help steps, gestures, shortcuts, credits link | `HelpModal` |
| Coins, hearts, level progress, mute, full screen, pause | `StatusPanel`, `WaveTrack`, `Controls` |
| Boss bar, phase marks, shield, ability and stage | `BossBar` |
| Telegraph toast with counterplay, uproot Sell | The `BossBar` cast row (and the Sell now fixed) |
| Asuna reinforcements panel | `Reinforcements` |
| Miniboss bars (focus) and monster bars | `MiniBars` (focus fixed), `MonsterBars` |
| Guardian warning, notices, Super forged and Undo, merge lesson, paused card | `Onboarding` toasts, `PausedCard` |
| Pad build grid, tower detail, tier strip, Super cell, power and reach, sell refund, merge and undo, focus detail | `BuildMenu` |
| Start wave / Begin encounter, send early, speed | `BottomBar`, `Controls` |
| Outcome card (medals and stars, next, again, choose) | `Results` |
| Keyboard (Space, U, M, Esc), with F added for speed | `CarrotPage` |
| Visibility pause, fullscreen fallback, account subscriptions, awards, Super records | `CarrotPage` |
| Dev preview harness (`window.__carrot`) and the local review panel | `CarrotPage`, `CarrotReview` |

The parity suite (`qa.mjs parity`) exercises these against the mock player.

## QA harness (`scripts/carrot-ui-qa`)

Serve the site (`npm run dev`, or a build with `vite preview`), then run `BASE=<url> node scripts/carrot-ui-qa/qa.mjs [chromium|webkit|all] [suites]`.
Playwright is the Codex runtime's (`PLAYWRIGHT` overrides the path). The mock player (`mock-unity.js`) is injected with `addInitScript`. The
loader and `.unityweb` requests are routed to stubs, so nothing mock ships in `src`. Suites:

| Suite | What it checks |
|---|---|
| `layout` | No horizontal overflow. The top HUD stack is at most 21% / 22% / 29% of the height at 1440×900, 390×844 and 844×390 (vertical rails excluded). |
| `panel` | Nine pad positions per viewport: the panel never meets the pad or the carrot; the portrait sheet is at most 200 px; in landscape the Build button is on screen; on desktop the panel is at most 280×190. |
| `scan` | Text at least 11 px, targets at least 44×44 px, no backdrop-filter, contrast at least 4.5:1 for text and 3:1 for icons. |
| `motion` | With reduced motion, only opacity animations of 250 ms or less, and no beat glow. |
| `commands` | v1 and v2: the card pauses, resumes and shows once, and is persisted. SELL NOW sends select then sell; the miniboss bar sends selectionType enemy; Restart sends load. |
| `track` | Notes cross the line within ±100 ms of their spawn times; badges and counts render; one judgement word at a time. |
| `lobby` | The first lobby view loads at most 4 MB of images and requests no `ui-*.ogg`. |
| `parity` | Features of the pre-update page. |
| `perf` | Snapshot cost per publish (dispatch through the React commit) and rAF callback cost, over 60 s with 50 moving monsters and a boss. |

Other tools: `shots.mjs` (fixtures in every viewport), `menus.mjs` (menus), `webp.mjs` (WebP re-encoding), `jackets.mjs` (jacket captures from the real player).

## Measured results

`BASE=http://localhost:5292 node scripts/carrot-ui-qa/qa.mjs all` against `vite preview` of a production build, on an M5 Max:

- **Acceptance suites:** 329 of 329 checks pass in Chromium and WebKit (report: `output/carrot-ui-qa/qa-report.json`).
- **Snapshot cost per publish** (dispatch through the React commit, 60 s with 50 moving monsters, a boss and a ticking cast):
  - Chromium: p95 0.8 ms (limit 2 ms); with a 4× CPU throttle, p95 3.2 ms (limit 6 ms).
  - WebKit: p95 1 ms (WebKit's timer resolution is 1 ms).
- **rAF callbacks** (wave track, cast ring, counters): p95 0.2 ms in Chromium, and 1.0 ms with the 4× throttle.
- **Lobby images:** 0.32 MB (the garden key art WebP at 287 KB and the next stage's jacket at 35 KB), with no `ui-*.ogg` request. The old page loaded the 813 KB JPG, and about 18 MB of art once the campaign modal opened.
- **Bundle:** the CarrotPage chunk is 129 KB of JS (44 KB gzip) and 59 KB of CSS (12.6 KB gzip).

## Asset provenance

- **Key art WebP** (`public/assets/minigames/carrot/*-keyart.webp`): re-encoded from the project's own JPGs by `scripts/carrot-ui-qa/webp.mjs` (Chromium's WebP encoder, q0.8, at most 1600 px wide). The JPGs stay for the site card, the social image and the docs.
- **Jackets** (`public/assets/minigames/carrot/jackets/NN.webp`): ready-phase captures of each level's own board from the game's web player (build `a9ccb2b1be8febe7`) with the HUD hidden, 640×360, WebP q0.8. They are self-made from the game itself; `jackets/provenance.json` records the build, viewport and sha256 per file. Regenerate them after the release build with `node scripts/carrot-ui-qa/jackets.mjs`.
- **Glyphs** (`Icon.tsx` and the creature silhouettes in `art.tsx`): drawn for this page.
- **Portraits:** `portraits/portraits.json` (from the characters stream) wins when present, and the existing sheets remain the fallback. No tier sheet was deleted (the owner approves portraits first).

## Notes for the other streams

- **balance:**
  - The page sends `{type:'setPaused', value}` on v2 builds; please accept it in ready and playing.
  - `incoming[].at` is read as seconds on the packet's own wave clock (above).
  - The page already filters the load notice "Choose a place", so removing it from `LoadLevel` is optional.
  - The early-call chip shows `min(6, floor(nextWave))`; the cap is a prop (`earlyBonusCap`).
- **audio:**
  - `volume.ts` uses `audioPrefs.ts` when it exists. It accepts exports named `getAudioPrefs`/`setAudioPrefs`/`subscribeAudioPrefs` or `get`/`set`/`subscribe`, and otherwise reads and writes `cgs-carrot-audio-v1` itself.
  - The beat glow reads `window.carrotAudioBus.bpm` (null or missing = off) and `beatPhase()`.
  - `uiAudio.ts` is still called as `menuSound(kind)` and `stopMenuSound()`, with kind `click`, `open` or `close`.
- **world:**
  - `SetSafeArea` arrives as `{top, bottom, left, right}` screen fractions, once per change.
  - `FocusBoss` comes from Settings.
  - `caps: ['worldBars']` hides the DOM monster bars.
- **characters:** `portraits.json` cells are `[sheet, x, y, w, h]` in sheet pixels, with sheets under `portraits/`.
