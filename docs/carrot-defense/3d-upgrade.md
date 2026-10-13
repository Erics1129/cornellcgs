# Carrot Defense 3D: visual upgrade log

Branch `carrot-3d-upgrade`. Gameplay (`CarrotGame.cs`, `CarrotData.cs`, `CarrotTypes.cs`, `CarrotSimulationTests.cs`) is untouched; every stage ends with `npm run carrot:test` at 39,845 assertions.

## Stage 0: baseline (plan-tech capture of build f39491b6e2c93972)

Measured with Playwright + headless Chromium (Metal ANGLE) on an Apple M5 Max, 1440x900 DPR1:

| Scenario | Draws p50 | Triangles p50 | Main thread p50/p95 | rAF gap p50/p95 |
|---|---|---|---|---|
| L4 idle | 665 | 3.28 M | 1.4 / 1.6 ms | 8.3 / 9.0 ms |
| L4 combat | 703 | 3.38 M | 1.8 / 2.1 ms (max 18) | 8.3 / 9.1 ms |
| L4 boss wave (speed 2) | 721 | 3.53 M | 5.5 / 6.8 ms | 9.2 / 12.6 ms |

Build: data 44.19 MB, wasm 4.85 MB, framework 0.08 MB, loader 0.05 MB (49.2 MB total). Time to HUD 0.9 s warm.

Defects confirmed in the baseline screenshots: black trail pebbles and arch stones (albedo gain on a dark stone map), pad markers reading as black flowers, flat unlit look with no bloom or tone mapping, hard sky bands, towers hovering 0.13 u above the ground, hit effects that are small puffs and line rings.

## Stages 1-2 (commit cf00e37): URP 17.3 migration and the performance diet

Ported the five CG shaders to URP HLSL (ShadowCaster + DepthOnly passes, ACES moved to the post volume), two `UniversalRenderPipelineAsset`s bound to the `High`/`Low` tiers chosen by `CarrotQuality`, per-biome volume profiles, crunched DXT textures, Vorbis 0.5 music, managed stripping with `link.xml`. Build 26.5 MB data + 6.5 MB wasm. Desktop draws fell from 665 to 192 idle / 223 combat (Stage 3 harness), triangles from 3.3 M to 1.5 M.

## Stage 3: effect foundation, Cinemachine rig, hit-stop (build 7b7a8a745c718eb2)

- `Assets/Editor/CarrotVfxSheet.cs` writes `Resources/Carrot/Textures/VfxSheet.png` at every Prepare: 64 procedural cells (glows, stars, rings, hex flake, 16-frame smoke, 8 spark streaks, 8 ember frames, 8 debris silhouettes, 8 ground residues, 8 glyphs), crunched DXT5 q90. `VfxAtlas.png` is deleted.
- `Assets/Scripts/CarrotFx.cs`: `FxSheet` cell indices, `FxSystem` (one pooled, manually simulated `ParticleSystem` per recipe: Flashes, Sparks (stretched), Smoke flipbook, Dust, Debris with a ground collision plane, Embers, Motes) and `FxPool` (16 ring meshes with the band cell baked into UV, 12 bolt lines, 24 shells with analytic 8-point trails, 24/8 ground decal quads, 2/0 point lights, 6 echo renderers). Everything is created in `Awake`; `Handle` never calls `new GameObject` or `AddComponent`.
- `CarrotEffects.cs` rewritten around a struct list of live effects (`Ring, Bolt, Shell, Decal, Light, Delay, Loop, Ghost`) with swap-remove and a priority cap (`CarrotQuality.MaxEffects`). All section 6.2 impact recipes, 6.3 shells and muzzle flashes, the boss, telegraph, ability and UI-world recipes (`spawn`, `wave`, `coins`, `bite`, `heal`, `start`) are implemented here.
- Cinemachine 2.10.7 (local tgz in `Packages/manifest.json`): `CinemachineBrain` in `ManualUpdate` on the game camera, `vcam play` (Transposer, WorldSpace binding, damping 0.22/0.22/0.30, FOV 38) following a `Camera rig` transform that `FitCamera`/pan/zoom now write; `CinemachineImpulseSource` (Dissipating, duration 0.3, dissipation 14 u) with shaped impulses per event and a camera-space listener on the vcam. `CinemachineCore.UniformDeltaTimeOverride`/`CurrentTimeOverride` carry the view clock, so pause freezes damping and shakes (pause pair diff = 0 pixels).
- Hit-stop / slow motion scale only `viewDt` (effects, actors, carrot, Cinemachine); `game.StepSimulation` keeps its own dt. Thunder 60 ms, boss phase 90 ms, shatter 60 ms, mortar double kill 45 ms, boss entrance slow-mo x0.35 for 1.0 s (0.6 s on Low).
- Measured (quick harness, Apple M5 Max, Metal ANGLE): desktop 1440x900 idle 192 draws / 1.50 M tris / 1.5 ms main thread; combat 223 draws / 1.56 M; boss wave 248 draws / 1.67 M / 1.9 ms p50; phone 390x844 DPR 1.25 CPU x4 Low tier: 102-128 draws, 0.33-0.36 M tris, 7.7 ms p50 / 9.1 ms p95 main thread. Time to HUD 0.9 s desktop, 2.3 s phone. Selection by click still works through the Cinemachine-driven camera. 39,845 assertions. Build 25.8 MB data + 6.65 MB wasm = 32.6 MB.
- Found in the screenshots: the texture-sheet `startFrame` is normalised over the whole sheet (the inspector shows frames), so the first build drew the smoke flipbook from cell 0; fixed in `FxSystem.Frame`.

## Stage 4: impact recipes, enemy reactions, tower and carrot motion, audio sync (build 467212c4f630e938)

- Towers (`UpdateActors`): recoil `exp(-t*18)*sin(t*26)` on barrel and turret pitch, base squash, idle breathing, spin-up of prism/thunder/gravity/starfruit cores by charge, Ring01 rise, petal splay, page flip, bell swing, charge glow; build drop with easeOutBounce + scale pop, upgrade pop with an Echo shell of the old tier.
- Enemies: 60 ms hit flash with 140 ms decay, jolt spring along the shot direction, squash `exp(-t*9)*sin(t*28)`, Walk/Run choice by speed ratio, additive hit clip on Legacy layer 1 (walking never stops), slow tint through the property block, death = tumble 78 deg + 1.15 pop at 80 ms + `_Dissolve` 0.3-0.8 s with the kind's edge colour; crystals shatter instead.
- Carrot: tilt about the bite direction, root dip, eye squint, leaf splay, FOV punch 38 -> 36.4, wave-cleared hop with arms, low-health shiver, defeat droop.
- Audio: delayed layers (`Later`) for the mortar thump and thunder boom, snow crunch on frost impacts, coin ping on rewarded deaths, +-9 % creature hit pitch, music duck on hit-stops.
- 39,845 assertions; build 25.8 MB data + 6.65 MB wasm.

## Stage 5: ground blending, biome lighting, atmosphere (build 6ce82bbd9cde203d)

- Placement is terrain-aware: pads, towers and blockers sit on `TerrainHeight`, enemies walk on the trail surface, shadow quads follow.
- Grass bends away from walkers: `_CarrotPushers[12]` (carrot, boss, nearest enemies) read by `CarrotPush` in the Storybook vertex stage for materials with `_Bend`.
- Foot dust every stride per creature kind, boss steps add a dust ring.
- Canopy light cookie (tileable 128 px octave noise, size 18 u, drifting 0.04/0.02 u/s) on the key light in garden and marsh; marsh entrance lanterns are point lights (range 2.6, intensity 7, Perlin flicker).
- Weather: snowfall (350/150), fireflies (24/12, HDR x3 blink) and pollen (90/40) as one manually simulated ambient system per biome; the 2.5 s mote burst is gone.
- Height fog: `Carrot/HeightFog` fullscreen pass (URP `FullScreenPassRendererFeature`, before transparents, High only) with per-biome density/base/falloff and a slow noise term in the marsh.
- Pads: lighter tilled soil, smaller border stones, warm build mark; the "black flower" read is gone.
- Decal Renderer Feature was not used: URP decal materials require Shader Graph assets that cannot be authored deterministically in `Prepare`, so residue decals stay pooled `FxDecalQuad` quads on both tiers.
- 39,845 assertions; build 25.8 MB data + 6.66 MB wasm.

## Stage 6: boss spectacle, Timeline beats, UI-world events (build 098e4cb9d49ac4dc)

- Timeline 1.8.12 (local tgz). `Assets/Editor/CarrotCinematicsAuthoring.cs` writes `Resources/Carrot/Cinematics/BossEntrance.playable` (2.4 s, CinemachineTrack hero shot on the exposed `vcamBoss`, SignalTrack with `bossDust` 0.10 s, `bossRoar` 0.35 s, `bossRing` 1.30 s) and the three `.signal` assets at every Prepare.
- `PlayableDirector` in Manual mode on the view, time advanced by `viewDt` (pause and 2x exact), `CarrotCinematics` (`INotificationReceiver`) turns signal markers into `cinematic` effect events; a clock fallback fires the beats if the graph does not notify.
- `vcam boss` (Transposer, FOV 30/34 portrait, impulse gain 1.6), `vcam reveal` (level start, +5 deg pitch, x1.14 distance, 1.3 s), `vcam orbit` (victory, 84 deg over 3 s around the carrot); custom blends play->boss 0.55 s, boss->play 0.65 s, play->orbit 0.7 s, reveal->play 1.2 s. Boss spotlight (High) during the entrance; key-light dip and fog pull-in on the roar; defeat push-in, desaturated key light and fog.
- First capture showed the play camera during the entrance: `bossEnter` arrives in the same simulation tick that spawns the boss, before the view has an actor, so the beat now starts on the next frame once the boss actor exists.
- 39,845 assertions; build 25.9 MB data + 6.76 MB wasm.

## Stage 7: Animation Rigging (towers), Splines (trails, pebbles, ribbons) (build eb402ad20e9c85ef)

- Splines 2.8.4 (+ mathematics 1.3.3, settings-manager 2.1.1), Animation Rigging 1.4.1 (+ burst 1.8.29, collections 2.6.6), all local tgz.
- `RouteSpline`: an auto-smoothed `Spline` through the route; the worn trail strip samples it every 0.2 u (continuous V, rounded corners) and `BuildPebbles` places lit pebbles every 1.05 u on both sides with `SplineUtility.GetPointAtLinearDistance`/`EvaluateTangent`. The first capture rounded right-angle corners into 1 u loops that enemies walked beside, so knots now sit 0.45 u before and after each corner: the spline follows the straight legs and only fillets the corner.
- `BuildAimRig`: `Animator` (disabled) + `RigBuilder` with one `Rig` per tower: `MultiAimConstraint` on the Turret (aim -Z, constrained Y, +-180) and on the Barrel pivot (constrained X, -28..+6, mortar -40..+4) toward an `Aim target` the view moves through the aim spring; `rig.Evaluate(viewDt)` each frame so pause and hit-stop apply; recoil pitch is multiplied onto the barrel after evaluation.
- Boss root snares and the book rewind ribbon are `SplineMesh.Extrude` tubes (4 pooled meshes, radius 0.06 bark / 0.04 mint emissive) grown by animating the extrude range over 0.45 s and shrunk over the last 0.3 s.
- No runtime console errors on WebGL2 with the rig jobs; build 25.9 MB data + 6.87 MB wasm (the wasm is 0.37 MB over the 6.5 MB target; total 32.9 MB, hard cap 60 MB).

## Stage 7 follow-ups (builds 63cc42bc828631e9 and the final artifact)

- Found while reading the Stage 7 captures: the URP assets were written with `enumValueIndex`, which indexes enum names sorted by value, so High had received per-vertex additional lights (the lantern and effect lights never lit anything), the soft-shadow quality was swapped and the SSAO source was `DepthNormals` (a prepass the Carrot shaders do not have, which also left `_CameraDepthTexture` empty). `CarrotPipeline` now writes `intValue`, the Low asset is bound to quality level 0 so its variants survive prefiltering, and Storybook adds `VertexLighting` for the Low tier.
- With the depth texture finally valid, the Gaussian depth of field (start 24, end 44) blurred the whole diorama because the play camera sits 26-30 u from it. The DoF start/end now follow the live camera distance (+6 / +24 u) every frame, so only the far field softens and the boss hero shot gets a real background fall-off.
- Dynamic tier demotion needs three consecutive slow windows, ignores frames above 40 ms (screenshot stalls, tab switches) and drops the render scale to 0.9 instead of 0.85.
- Vite reloads the page when files under the worktree change, which turned two harness runs into lobby captures; the final measurement runs with no edits in flight.
- Bisected with the debug `Quality` toggles (`nofogpass`, `nodof`, `nossao`, `nobloom`, `noaa`, `nomsaa`): only `nodof` removed the full-frame blur, so the depth texture itself was wrong. With the SSAO source switched to Depth, URP copied depth after opaques, and WebGL2 cannot resolve the 4x MSAA depth copy, so `_CameraDepthTexture` read as the far plane everywhere and the Gaussian DoF blurred the whole frame. Both renderers now use `CopyDepthMode.ForcePrepass`: the Storybook `DepthOnly` pass feeds DoF, SSAO, soft particles and water depth.
- Enemy hit flash reduced from 0.9 to 0.55 emission; at 0.9 several creatures read as solid white in a mortar blast.
- Second bisect on the prepass build: `nossao` alone restored sharpness, so the blur came from the SSAO after-opaque composite (half-resolution AO blended back onto the colour target on WebGL2), not from the depth of field. SSAO now runs before opaques and is applied inside `Carrot/Storybook` through `_SCREEN_SPACE_OCCLUSION`, which the forced depth prepass makes possible.
- Third bisect with full-resolution SSAO before opaques: still blurred, `nossao` sharp. SSAO is therefore left out of the High renderer (`CarrotPipeline.UseSsao=false`); the forced depth prepass stays for DoF, soft particles and water. Contact darkening comes from the baked AO maps and the contact quads. Recorded under skipped.

## Stage 8: final measurement (artifact ba4f377033c878bc)

The measured table, add-on table and remaining gaps are in `validation.md`; the generated-asset inventory is in `asset-manifest.md`. Final build: 25.89 MB data + 6.87 MB wasm + 0.13 MB framework/loader = 32.89 MB. 39,845 assertions, `tsc` and `npm test` pass. Desktop level-4 boss wave 5.3 ms p50 main thread / 12.3 ms cadence p95 at 1440x900; phone proxy 10.3 ms / 14.9 ms on the Low tier. The hero shot was reframed (three-quarter yaw, boss chest centred, 10.5 u) after the first capture put the boss behind the HTML banner. Open items: SSAO off, no baked per-biome cubemaps, no LOD1 scans, marsh and frost boss entrances not captured by the harness. The working tree is left uncommitted and the dev server is stopped.

## Fix round (critic findings; final artifact `628519e8d5c6010d`)

Three builds: `78eb04adde45ec84` (all fixes), `14fc14eecf548bac` (tree colour, ice path, frost boulders), `628519e8d5c6010d` (ice-path contrast, border trees kept out of the bottom corners). Gameplay files untouched; `npm run carrot:test` reports 39,845 assertions on the final artifact (`output/carrot-unity-test.log`).

| Finding | Fix | Verified by |
|---|---|---|
| Hit effects invisible at the play camera (high) | Every impact was re-scaled for the fitted camera (about 46 px per world unit at 1440x900): flashes 0.5-1.7 u, rings to 1-2.4 u, a new flat HDR "ground disc" under every impact, the Flashes/Sparks/Embers systems on an HDR (x2.4) additive material so bloom catches them (particle vertex colours are Color32), bolts and rings get HDR tints through property blocks. Shells carry a camera-facing glow sprite (seed pellet 0.42 u, mortar 0.7 u) plus wider trails; the mortar is a fireball (two flashes, 8 ember licks, 1-1.6 u smoke, 20 sparks, shockwave band to 1.7x the blast radius, 9-intensity point light, impulse 0.2) with a 2.3x-radius scorch for 4 s. Thunder: 0.22 u core bolt for 0.28 s + 0.7 u glow for 0.42 s + second bolt + 1.6 u ground flash, ring to 2.4 u, disc, crack decal, light 14. Frost: 0.85 u star flash, flake motes, HDR ring to 1 u, ice disc, 2.3x ice patch with emissive 0.35, stronger slowed tint on the creature. The bug behind "no residue": ground effects were anchored to `TerrainHeight`, which is 0.09 u *below* the trail strip (0.061 u) that creatures actually walk on, so scorch marks, ice patches, foot dust and death rings were buried under the path mesh. `CarrotEffects.Ground` now returns `SurfaceHeight` (the trail height within 0.5 u of a route). | `carrot-shots/build/desktop-l4-combat-wide-*`, `-impact-crop-*`, `desktop-l12-thunder-*` (wide 1x frames, not zoomed) |
| Stray warning-triangle sprite (medium) | It was the telegraph's `Warning` glyph (sheet cell 60, an outline) emitted 2.4 u above the boss every 0.25 s; as a billboard it read as an icon lying on the grass, and the loop outlived the boss into the victory orbit. The loop is removed (ring, chevrons and motes remain; the HUD already names the ability). Cell 60 is redrawn as a filled badge and `CarrotVfxSheet.Prepare` now throws if any glyph cell is an outline (under 8 % coverage inside r < 0.8). | `desktop-l4-won-*`, `desktop-l4-boss-fight-*` |
| Boss entrance framing and read (medium) | The hero vcam slides 2.2 u camera-right (0.5 u portrait) so the boss stands in the left third; the page's "Guardian approaching" card moved from 30 % down to the bottom edge above the wave pill (`carrot.css`). The spotlight is 45 (frost 36) at 4.5 u instead of 2.6 at 6 u (a URP spot needs tens of units to show against a 2.6 sun), the roar dips the key light by 60 % and pulls the fog 30 %, the dust ring is 60 particles at 1.1 u with a 3 u glow disc and a 4 u HDR shockwave. During the fight a dedicated (unpooled) ground aura follows the boss: cracked earth (garden) / rotating rune ring (marsh) / frost web (frost) plus a pulsing HDR ring; Bark now shows an orbiting bark-chip whirl with three pulsing rings for the whole armour window and the boss is tinted bark-orange from `EnemyState.ability/abilityRemaining`. | `desktop-l4-boss-enter-*`, `desktop-l4-boss-fight-*`, `desktop-l4-ability-*`, `phone-l4-boss-enter-*` |
| Sparse environment (medium) | `BuildTreeline`: 26 (High) / 16 (Low) low-poly border trees on the hills (cylinder trunk + 4 canopy blobs; three-tier snow pines in frost whose caps come from the snow term), 6 inner trees where free, a garden fence line (posts + two rails, back and right edges), fallen logs, extra snow boulders on the back slope. All under `decoration`, so `CombineDecoration` batches them into one draw per material. The frost trail is a three-vertex strip: snow-white rim, packed-ice centre (dark linear albedo, smoothness 0.48, reflection 0.4, translucency 0.25). Snowfall is 500/220 flakes at 0.06-0.12 u (was 350 at 0.025-0.045, one pixel); fireflies 0.13 u, pollen 0.05-0.08 u. Height fog starts lower and is tinted toward the sky horizon; vignette 0.15. | `desktop-l1-built`, `desktop-l12-built`, `desktop-l8-combat-wide-*` |
| Phone framing (medium) | Portrait pitch 62 -> 50 degrees, fit safe fractions 0.96/0.86, free pan of +-1.7 u at zoom 1 (drag works at zoom 1 in portrait), towers, creatures and the carrot drawn 1.2x in portrait (`ActorScale`, presentation only). | `phone-l4-*`, `phone-l12-*` |
| Tier demotion on 60 Hz displays (high) | `WatchFrameTime` no longer treats the frame interval as work. A 120-frame window is slow only when its mean is above 22 ms AND (the mean is above 1.35x the smallest 10th-percentile interval seen so far, i.e. frames are being dropped rather than vsync-paced, OR the measured main-thread work, `Time.realtimeSinceStartup` from the top of `Update` to `WaitForEndOfFrame`, averages above 14 ms); three consecutive slow windows demote once. Verified three ways: the harness `--hz60` mode (every rAF deferred one frame, 16.7 ms cadence for 35 s) stays High; the same headless Chromium on battery power paced rAF at 33.3 ms with 3-4 ms of work and stays High (the first version of the rule, mean > 22 ms alone, demoted in that situation, which is exactly the critic's objection); a CPU x8 throttle at 1440x900 (`slowcpu-l4`) does demote with a `reason=frame mean ... work ...` line. | `carrot-shots/fix1-hz60/desktop-l1-metrics.json`, `carrot-shots/build/*-metrics.json` (`tierLogs`) |
| Safari "Apple GPU" demoted (medium) | "Apple GPU" removed from the low-end GPU regex (phones and tablets are already caught by `isMobilePlatform`/`Handheld`). Playwright WebKit (renderer string exactly `Apple GPU`) logs `tier=High`. | `carrot-shots/fix1/webkit-l4.png` |
| Viewport rule demoting laptops (medium) | Low from canvas size only below 600 device pixels on the short side (a phone at DPR 1.25 is 488 px; 1366x768 and 1280x720 stay High). | `carrot-tech/fix1-laptop.log`: `tier=High ... screen=1366x768` |
| Pause card does nothing (medium) | `.ct-paused` keeps its centring in the `translate` property; `.ct-page .ct-paused:active:not(:disabled)` only scales. The harness presses the card with the mouse: the pressed rect stays centred and the game resumes. | `pausedCardClick` in every `*-metrics.json`, `desktop-l4-pause-pressed.png` |
| Build preview ghost (low) | A hologram of the tier-1 prefab (materials swapped for `Carrot/FxAdditive`) on the selected pad, green when affordable, red when not, pulsing; range ring brighter and wider. Built once per kind on first preview. | `desktop-l4-ghost-preview.png`, `-ghost-crop.png` |
| Vignette/fog/cast (low) | Vignette 0.22 -> 0.15, garden saturation 6 -> 3 with a (1, .975, 1) colour filter and neutral highlights; height fog density/base lowered per biome and tinted to the horizon. | wide frames |
| Console warnings (low) | Documented in validation.md: six `getInternalformatParameter: invalid internalformat` warnings per start from Unity's format probe; not fixable in project code. | metrics `consoleWarnings` |
| Manifest absolute tgz paths (low) | Documented rather than copied: the Burst tarball alone is 490 MB, so the eight `file:/Applications/Unity/Hub/Editor/6000.3.18f1/...` references stay and the required editor install path is recorded in this document and validation.md. | |
| Production stubs (low) | `scripts/stubs.mjs` takes an optional out-dir argument so a scratch `vite build` can be given its route stubs without touching the repo's `dist/`. | |
| Victory modal delay (could) | `CarrotPage.tsx` shows the "won" card after 2200 ms (was 1100) so the orbit is seen. | `desktop-l4-won-*` |

Not changed: SSAO stays out (WebGL2 blur, see Stage 7 follow-ups); no new third-party assets (the border trees, fence and logs are runtime primitives); Low tier still gets no effect lights and only scorch/ice/telegraph decals, but the enlarged flashes, discs and rings apply on both tiers (Low halves particle counts).

## Speed plan follow-up

The rendering speed plan (three URP tiers, after-opaques depth copy, one shadow cascade, decimated scan props with shadow casters, first-frame shader warm-up, streamed music, 512 px textures, render-scale governor and 120 Hz frame pacer, physics in script mode) is recorded with its before/after measurements in `validation.md` ("Speed plan"). The Stage 7 note above that the forced depth prepass "stays for DoF, soft particles and water" is superseded: with High and Medium at MSAA 1 the depth is copied after opaques and the prepass is gone.
