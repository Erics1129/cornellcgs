# Duo and endless presentation (maps-and-view)

This is how the Unity view draws duo boss fights (two mirrored halves) and two-player endless (Twin Gates). The simulation never
sees any of it. The view is configured through the frozen seam in `CarrotNetContract.cs`, and the bridge (`CarrotNetBridge.cs`, from
sim-and-modes) calls it.

| File | Role |
| --- | --- |
| `Scripts/CarrotDuoView.cs` | Configuration and hooks; solo-grid frames; the spectator (the partner's half); camera modes and framing; partner taps; the divider and its shimmer; the duo arena ring and team banners; the L29 sky gardens; presence ring, pending-op ghosts and builder rings; the roster warm-up |
| `Scripts/CarrotTwinGatesView.cs` | Twin Gates art: the two gates, the boulevard and plaza, lantern posts on the lit pads, the back meadow |
| `Scripts/CarrotDuoViewQa.cs` | QA builds only: the loopback scaffold behind `SendMessage('CarrotGame','DuoQa',json)` |
| `Editor/CarrotDuoBuild.cs` | `CarrotTD.CarrotDuoBuild.WebQaDuo`, the QA player |
| `scripts/carrot-duo-qa/` | `harness.html`, `lib.mjs`, `shots.mjs`, `checks.mjs`, `perf.mjs` |

The other edits are guarded hook lines in existing view files: `CarrotView`, `CarrotCameraRig`, `CarrotPrismView`, `CarrotWorldDressing`, `CarrotViewActors`, `CarrotExpansionView`, `CarrotEffects`, `CarrotAudio` and `CarrotQaTelemetry`. Every one is a no-op in single player.

The Twin Gates file is **not** named `CarrotEndlessView.cs`, as the stream list had it. `carrot-sim.mjs` treats every `CarrotEndless*.cs` as a simulation source. The shim's non-partial `CarrotView` then fails to compile, which breaks `--digest` for every stream.

## The seam (CarrotNetContract)

- **`AttachPartnerView(go, cfg)`** adds a spectator `CarrotView` to the inactive `CarrotPartner` replica. It refuses an object named `CarrotGame`. If the object is active, it is deactivated, configured and reactivated, so Awake always knows it is a spectator.
- **`ConfigureHostView(cfg)`** reconfigures the player's own view. An empty `layout` returns to single player.
  - The bridge configures the host only at session start. So once a duo build has happened, a solo `LevelDef` loaded with `NetMode == None` also drops the duo configuration by itself (`duo.autoClear`).
- **`Camera("own"|"partner"|"both")`** and **`Presence(seat, pad, tower)`** go to the host view.
- **`RaiseViewEvent("partnerTap")`** is the only event the view raises.
- **`DuoViewConfig`**, following the bridge's convention:
  - `team` is the colour of the half this view draws: gold on the host, teal on the spectator. `partnerTeam` is the other half's colour.
  - `side` is the half this view draws (−1 in endless).
  - `own` and `partner` are the half rectangles (in endless, the seats' home rectangles); `arena` is the whole map.
- **Simulation fields the view reads:** `NetMode` (for the auto-clear), `PendingOps` (ghosts) and `TowerState.builder` (builder rings).

## Frames: the solo levels, mapped

A duo half is the solo level mapped by `x-8` / `8-x` (on L29, `z+5` / `-(z+5)`). Twin Gates is two solo-sized wings mirrored about x = 0. Every decoration builder keeps its solo code and its random streams and maps each placement through the active frame:

- `FW` maps positions, `FYaw` and `FRot` map rotations, and `FCut` drops anything on the seam side.
- In single player the frame is the identity and the builders run unmapped, so **solo levels are built bit for bit as before**. Frozen-clock frames match the pre-change QA player; see QA.
- `EnsureClearance` pushes a scanned prop away from its nearest path. Next to a seam gate that push points at the wall, so in duo a prop whose footprint would reach the 1-unit wall strip is dropped instead (`DuoSeamHit`).
- Arena stones the host places on the partner's side keep 1.7 u from both halves' paths and pads, since `EnsureClearance` only sees the host's own paths.
- The terrain height is one function across both halves. Paths of the other half within 1.6 u of the wall are included, and hills rise only at the arena's outer edges (`|x| - 15.8`). The two half meshes therefore meet exactly at x = 0, and the seam column's normals come from the same function.
- Per half (duo, at 60% of the solo decoration budget):
  - terrain, paths, pads, blockers, the carrot nest with a team banner, props, grass and the lantern posts on lit pads;
  - the portal terrain (L28) and the sky garden (L29).
- Host only:
  - the sky, lights, volume and weather (stretched over the arena);
  - the divider: a dry-stone wall with gate posts at every seam gate, pylons over L28's void, and a crystal brook along z = 0 on L29;
  - the hidden shimmer curtain;
  - the arena's standing stones on one ellipse around both halves (L25 to L27).

## Camera

| Layout | Landscape | Portrait |
| --- | --- | --- |
| Duo, axis X | The own half framed exactly like solo (the fit ratio is 1.000), with the yaw mirrored for the east half. The partner's half shows past the divider at the screen edge. | Yaw +88 (west) or −88 (east): the own half is nearest, the partner's beyond |
| Duo, L29 | North looks from the north (yaw 173, solo + 180); south looks from the mirror of that (yaw 7) | Looks down the lane (yaw 90); the own lane is centred |
| Endless | Wide desktops (aspect ≥ 1.6 and ≥ 1200 CSS px) fit the whole map; otherwise the seat's home rectangle | Yaw ±88 with the home wing nearest |

- **Modes:** "My side" (zoom 1, pan 0), "Watch name" (zoom 1, the partner's target) and "Both" (zoom out to fit the arena's four corners; minimum zoom 0.3 to 1). Each is a glide, or a one-frame cut with reduced motion.
- **Resize or rotation:** the camera refits and keeps the mode.
- **Drag:** in duo and endless, drag pans at zoom 1 across the arena. The pan clamp spans the own, partner and arena targets, plus solo's zoomed-in reach.
- **Fairness rules stay as in solo.** The camera never moves under a finger; the only automatic move is the boss follow-cam after Focus boss.
- **Twin Gates pad floor:**
  - Every default framing keeps the farthest pad at ≥ 18.5 CSS px of radius. On an 844x390 phone this brings the camera closer than the home-rectangle fit, and the centre may then roam the whole map at zoom 1.
  - At 1440x900, "fit the whole map" is approximated: the floor zooms in to 0.84 of the whole-map fit.
- **Zoomed out, the host scales:**
  - fog start and end, with the camera distance over the solo fit;
  - the shadow distance (up to 80 u, or 96 u on L29);
  - the audio pan centre (`CarrotAudio.ListenerX`).
- **Height-fog limit:** `Carrot/HeightFog` evaluates `exp(falloff * height)` in closed form. That overflows a float once the camera is about 59 u above the fog base, which turned the zoomed-out L29 portrait "Both" view solid white. The host lowers the falloff to stay under the limit (`ClampHeightFog`), so the fog is unchanged wherever it was valid.

## The wall

- **A tap on the partner's half changes nothing in the simulation.** The own selection clears, the divider shimmers and the view raises `partnerTap`; the page shows "That's name's side". A tap inside the 1-unit strip only shimmers.
- **Shimmer timing:** fade in over 0.25 s, hold 0.35 s, fade out over 0.6 s. It never pulses.
- **Range rings stop at the wall.** Points past the strip are pulled onto the own side, a flattened "D", and the curtain glows faintly while the ring crosses.

## The spectator (the partner's half)

It never creates any of the following. `checks.mjs` counts each one on `CarrotPartner` against the replica's real actor count, so a spectator that never spawned fails the check.

- a camera, Cinemachine, lights, a Volume or a sky;
- the quality watcher, music, ambience or AudioSources;
- the blind overlay or the boss-entrance timeline;
- input, colliders or CarrotClickables;
- time-scale requests;
- Shader-global or RenderSettings writes, including `_CarrotGust` and CreateLighting's directional-light switch-off. The host's key light stays on.

It borrows the host's materials (`BorrowMaterial`) and camera, animates on the match's clock (the host's speed and pause), and mirrors the host's reduced motion.

Lag diet:

- **Events are filtered to:**
  - builds, upgrades, sells, merges and scenery clears;
  - a cheap death puff;
  - the boss entrance and telegraphs;
  - carrot bites, victory and defeat.
- **Shots** become motes from a 40-slot pool, and hit flinches stay. Everything else is dropped (`spectator.eventsDropped`).
- **No** crowd separation, aim rigs, secondary-motion springs, licensed effect layer or effect lights.
- **Partner actors:**
  - animate only while one of their renderers is visible;
  - use two bone influences and one mesh LOD coarser than the tier picks;
  - **cast no shadows on any tier**, bosses excepted. The plan asked for Medium and Low only; High is included because the partner's shadow pass was the largest single cost measured (−254 draws).
- **Partner decoration casts no shadow** either.
- **Dormant:** when the partner's rectangle covers under 10% of the screen, actors sync at 4 Hz and effects, the carrot and the contact-shadow rebuild stop. It wakes the next frame.
- **Roster warm-up:** the level's whole creature roster (the whole roster except Asuna in endless) is instantiated off-screen, two per frame, during the lobby and the side reveal. No creature's first appearance links a shader or uploads a mesh mid-wave.

## Endless overlays

- **Presence ring:** the partner's selected pad or tower, in their colour.
- **Ghost sprouts:** a hologram for each of the local seat's pending `buy` ops. A confirmed build hands over to the real tower; a rejected one dissolves over 0.4 s.
- **Builder ring:** a thin ring under each tower in its builder's colour (the page adds "Built by name").

## QA (loopback, no network)

```sh
CARROT_DUO_QA_OUT=carrot-qa-base node scripts/carrot-unity-build.mjs --method CarrotTD.CarrotDuoBuild.WebQaDuo   # pre-change player
node scripts/carrot-unity-build.mjs --method CarrotTD.CarrotDuoBuild.WebQaDuo                                   # output/carrot-qa
N=~/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node
$N scripts/carrot-duo-qa/shots.mjs --solo --tag base --build output/carrot-qa-base --name carrot-qa-base && $N scripts/carrot-duo-qa/shots.mjs --solo --tag after && $N scripts/carrot-duo-qa/shots.mjs --compare base,after   # frozen-clock frames
$N scripts/carrot-duo-qa/shots.mjs --duo        # 11 fights x 2 sides x {own, both, partner} x {1440x900, 844x390, 390x844}
$N scripts/carrot-duo-qa/shots.mjs --endless
$N scripts/carrot-duo-qa/checks.mjs             # camera, taps, spectator, endless, dressing (add --engine webkit)
$N scripts/carrot-duo-qa/perf.mjs               # cpu, phone, first, heap, wasm
```

How the scaffold works:

- **Halves:** the own half loads `CarrotDuoMaps.Half` by swapping `CarrotData.Levels[id-1]` for the load.
- **Replica:** `CarrotPartner` is driven three ticks behind by the reference bot's mirrored commands, so it is the exact mirror match. Its `CarrotGame` component is disabled and the driver steps it, which matches the shipped `SnapshotEnabled=false`.
- **Twin Gates** loads under level 19's tables (orchard, 13 waves, two routes) until the endless mode is merged.
- **At integration** the lead points these loads at CarrotNet: `LoadLevel(id, "duo", side)` and the bridge's replica.

Unity re-serializes `ProjectSettings.asset` (`WebGL:` gains a trailing space) on every batch run, whether or not the defines change. `git checkout` it after each run. `WebQaDuo` itself writes nothing there (it uses `extraScriptingDefines`).

### Results

These are the results on the loopback scaffold, with the QA player built from this branch. Evidence (frames, contact sheets, JSON) is in
`scratchpad/carrot-duo/maps-and-view/`.

The machine was shared with other agents' Unity builds and browsers (load average 14 to 22), so frame-time numbers are medians of fresh-page runs.

| Acceptance | Result |
| --- | --- |
| Solo unchanged | Frozen-clock captures, pre-change player against this one, for L1, L12, L24, L25, L28 and L29 at 1440x900 and 390x844: all at the noise floor (at most 0.16% of pixels, at most 0.19% of 8x8 blocks), with one exception. See note 1 below. |
| Screenshot set (`shots/duo/final`, `shots/endless/final`, `shots/closeups`) | 198 duo frames (11 fights x 2 sides x own/Both/Watch x 1440x900, 844x390, 390x844), 12 Twin Gates frames, 24 reduced-motion frames and 14 close-ups, all reviewed. No prop on a path or pad, and props stay ≥ 0.98 u from the wall line. The divider is continuous with openings at every seam gate (the twin arches face each other through it). Both carrots are visible in Both. Lantern posts stand on the 4 lit Twin Gates pads. Team banners are gold and teal. |
| Camera (`checks.mjs`, Chromium, 59/59) | Own-half fit ratio to solo is 1.000 on L4, L25 and L29 at all three sizes. A real drag at zoom 1 reaches \|pan.x\| = 16 (portrait 17.7). Both frames all four arena corners. Portrait puts the own half nearest. L29 north yaw is 173 (solo + 180) and south is 7. Reduced motion completes a mode change in one frame. |
| Partner taps | 200 real pointer taps on the partner's half: 200 `partnerTap` events; state digest, coins and towers unchanged; no selection left. Run in Chromium and WebKit, at 1440x900 and 844x390. |
| Spectator invariants | On `CarrotPartner`: 0 AudioSources, 0 Cinemachine cameras, 0 lights, 0 cameras, 0 colliders, 0 CarrotClickables, 0 Volumes and 0 time-scale requests. Actors equal the replica's enemies + towers in every frame (`actorMismatchMax` 0). The host's key light stays on. Checked in all three camera modes, in Chromium and WebKit. |
| Twin Gates, 844x390 | Smallest on-screen pad radius 18.5 px. 35/35 pads selected by a real tap. Ghost sprouts (2), the presence ring and builder rings render, and ghosts dissolve on reject. |
| View CPU (Chromium, High, L24 wave-14 peak, 900 frames, median of 3 fresh pages) | CPU_RESULT |
| Frame time at 4x CPU throttle (mobile emulation, 844x390, median of 3) | PHONE_RESULT |
| First appearance (4x throttle, L24 and L27 from wave 1) | FIRST_RESULT |
| JS heap, 10-minute loopback (4 matches) | +7.1 MB (69.1 MB to 76.3 MB) |
| WebKit wasm heap (L24 and L28 duo peaks, Both) | 160 MB peak (the initial size), 0 growth events |
| QA player | `WebQaDuo` loads in Chromium and WebKit. Compression is gzip with the decompression fallback (asserted by the build); ProjectSettings is unchanged. |

Notes:

1. **L28's pad discs** in the full-sequence 1440x900 frame. L28's planting discs and their floating terraces are exactly coplanar in solo (both at y = 0.02), a pre-existing z-fight. Which surface wins depends on renderer order, and that order moved with the session's history, so even two runs of the same player differed. With the same level sequence, the pre-change player and this one are identical (0.006%).
2. **Endless at wave 60** needs the endless generator (sim-and-modes), so its wasm heap peak is left for the integration run. Twin Gates in the scaffold runs level 19's waves.

## Integration notes (for the lead)

- **Base and merges:**
  - The branch sits on `baf9297`, the sim stream's first commit, so merging `duo-s-sim-and-modes` is clean; a dry run on its current WIP compiles, and `carrot-sim --digest` is `063b791ee5860368`.
  - None of this stream's files are edited by the other streams.
- **QA scaffold:** `CarrotDuoViewQa` stays QA-only. To drive the real bridge in QA, replace `QaLoadDef(...Half...)` and the hand-made replica with `CarrotNet` (`LoadLevel(id, "duo", side)` and the bridge's `CreateReplica`/`ReplicaReady`). The view needs no change for that.
- **Colours:** the view follows `CarrotNetBridge.Config` as written (team = the drawn half's colour).
- **Ending a match:** `ConfigureHostView` is only called at session start. Call it with an empty layout on `{t:'end'}` too, or rely on the view's auto-clear.
- **Not done here:**
  - `CarrotDuoWall.shader` was not added: the shimmer uses Carrot/FxAdditive, so there is no new variant to warm.
  - `CarrotWorldLighting.cs` and `CarrotWorldBars.cs` needed no edits.
- **Renamed file:** `CarrotEndlessView.cs` is `CarrotTwinGatesView.cs` (carrot-sim pickup; see the top of this file).
- **Release player:** re-run `checks.mjs` and `perf.mjs` on the release player from the licensed checkout. Asuna and the licensed effect layer are absent from this QA player, and the spectator skips the licensed layer anyway.

