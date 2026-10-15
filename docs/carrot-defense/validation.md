# Carrot Defense validation

Gameplay validation was recorded against source commit `dd42d93`. **Final Unity artifact hash: `f39491b6e2c93972`.** This artifact adds the measured imported-color correction, winter surfacing and night-path changes; it was loaded and inspected in the browser, with the loader's version verified from the DOM. These checks establish the specific observations below, not film-grade visual fidelity.

## Automated evidence

- Production build, TypeScript, lint and campaign-progression checks passed at `dd42d93`.
- Unity WebGL and website production builds passed again after the final rendering corrections.
- Unity's `CarrotTD.CarrotSimulationTests.Run` passed **39,845 assertions**, including all ten tower powers, map geometry, purchases/upgrades/refunds, boss abilities, contact/outcome rules and event contracts. Evidence: `output/carrot-unity-test.log`.
- Two policies completed all 12 levels: **24 victories using ordinary starting funds and earned coins**. Four deliberately poor-coverage controls lost. See [balance results](balance-results.md) and [retained simulation output](simulation-results.txt). The assertion total includes repeated checks during simulation; it is not a count of unique test scenarios.

## Browser observations

The root integration review verified:

| Scenario | Observed result |
|---|---|
| Level 1 completion | Victory with 10 HP, 100% progress, medals and saved unlock of level 2. |
| Level 2 upgrade/sell | Seed advanced through tiers I–IV with upgrade payments of 65, 120 and 200 coins; selling returned 325 coins. |
| Defeat and recovery | Loss at 0 HP; retry and the level picker worked. |
| Phone-sized viewport | Layout and purchasing checked at 390 × 844. Selecting Frost, then a new pad, correctly reset the menu and range preview to Seed. |
| Display and sound controls | Full-screen entry/exit and mute/enable toggles worked. |
| Level 4 boss encounter | All eight waves played; Brambleback appeared with 1,800 HP, reached phase 3 and was defeated; the level ended in victory with 9 HP. |
| Final model-color correction | On `f39491b6e2c93972`, brown creatures and dark spider limbs rendered with distinct colors; the earlier bleached palette was corrected. |
| Final frost landscape | On the same artifact, pale snow and blue packed paths replaced the dark repeating terrain; winter scatter no longer used summer ferns. |

No console errors were observed on the stable browser tab during these checks. These observations apply to the inspected build and sessions, not every device or playthrough.

Actual Unity/WebGL captures: [garden combat](screenshots/garden-runtime.png), [frost landscape](screenshots/frost-runtime.png). These are runtime captures, not generated concept artwork.

## Still unverified

- Performance and multitouch on a physical phone.
- Listening review of every boss's music, voice and sound effects; working mute controls do not establish audio quality.
- Film-grade fidelity. No such quality claim is supported by the completed checks.

The full garden boss playthrough preceded the final color-only shader correction and biome material changes. It was not repeated in full after those rendering changes; gameplay simulation source remained unchanged.

## 3D upgrade (branch carrot-3d-upgrade, artifact `628519e8d5c6010d`; the pre-fix-round artifact was `ba4f377033c878bc`)

Gameplay is untouched: `CarrotGame.cs`, `CarrotData.cs`, `CarrotTypes.cs` and `CarrotSimulationTests.cs` are identical to `209112a`; `npm run carrot:test` reports **39,845 assertions** on the final artifact (`output/carrot-unity-test.log`, run after the `628519e8d5c6010d` build). `npx tsc --noEmit` and `npm test` pass. The page contract is unchanged (`carrot-state` events, `SendMessage('CarrotGame','Command'|'UiSound')`, loader file names, `unity-build.json` hash); `SendMessage('CarrotGame','Quality',...)` is an additive debug entry point the page never calls.

### Add-ons and what the player sees from each

| Package | Player-visible use |
|---|---|
| URP 17.3.0 (built in) | HDR + ACES, bloom on glows and lightning, per-biome colour grading, vignette, Gaussian depth of field that follows the camera distance, soft cascaded shadows, canopy light cookie, per-pixel point lights (effect flashes, marsh lanterns), soft particles, `Carrot/HeightFog` fullscreen pass |
| Shader Graph 17.3.0 (built in) | URP dependency only; all Carrot shaders are hand-written HLSL |
| Cinemachine 2.10.7 | Damped play rig, shaped impulse shakes per event, boss hero shot, level reveal, victory orbit, defeat push-in |
| Timeline 1.8.12 | `BossEntrance.playable`: the 2.4 s entrance beat (hero shot, dust, roar with light dip and slow motion, ring) driven on the view clock |
| Animation Rigging 1.4.1 (+ Burst, Collections) | Tower turrets yaw and barrels pitch at their targets through `MultiAimConstraint` rigs |
| Splines 2.8.4 (+ Mathematics, Settings Manager) | Filleted trail strips with continuous UV, pebble placement, root-snare and rewind tubes |
| Wind, Director, Particle System modules | Foliage gust term, Timeline playback, every effect |
| Declined | VFX Graph (no compute on WebGL2), Post Processing 3.5.4 (built-in pipeline only), ProBuilder, Terrain tools, Cloth, Umbra. URP SSAO is compiled but left out of the renderer: every mode blurred the whole colour target on WebGL2 (see `3d-upgrade.md`). |

### Measured on the final artifact

Playwright 1.x, headless Chromium with Metal ANGLE on an Apple M5 Max, dev server only, nothing else running. "Main" is the rAF callback time on the main thread; "cadence" is the gap between rAF callbacks; draws and triangles are counted on the WebGL2 context per frame (p50). The phone rows use the mobile emulation preset at 390x844, DPR 1.25 and a 4x CPU throttle. Level 4 boss wave = Brambleback at wave 8 with eight towers at speed 2.

| Scenario | Tier | Main p50 / p95 ms | Cadence p50 / p95 ms | Draws | Triangles | Time to HUD |
|---|---|---|---|---|---|---|
| Desktop 1440x900 DPR1, L4 idle | High | 2.2 / 2.7 | 8.3 / 9.6 | 269 | 2.04 M | 1.0 s |
| Desktop DPR1, L4 combat | High | 2.7 / 3.4 | 8.3 / 9.2 | 314 | 2.14 M | |
| Desktop DPR1, L4 boss wave | High | 5.3 / 6.7 | 10.3 / 12.3 | 355 | 2.28 M | |
| Desktop DPR1, L1 combat | High | 2.7 / 3.4 | 8.3 / 9.0 | 318 | 2.32 M | 1.6 s |
| Desktop DPR1, L8 marsh combat | High | 2.3 / 2.8 | 8.3 / 9.0 | 359 | 2.11 M | 1.0 s |
| Desktop DPR1, L12 frost combat | High | 2.5 / 2.8 | 8.3 / 9.1 | 321 | 1.38 M | 1.6 s |
| Desktop 2880x1800 (DPR2), L4 combat | High | 4.5 / 5.8 | 16.9 / 20.1 | 310 | 2.13 M | 1.7 s |
| Phone 390x844 DPR1.25 CPU x4, L4 combat | Low | 7.6 / 9.8 | 8.6 / 11.3 | 130 | 0.37 M | 2.4 s |
| Phone, L4 boss wave | Low | 10.3 / 12.6 | 11.3 / 14.9 (p99 17.5) | 158 | 0.48 M | |
| Phone, L12 frost combat | Low | 7.6 / 9.4 | 8.4 / 10.9 | 134 | 0.37 M | 2.3 s |
| Desktop L4 forced Low (`Quality low`) | Low | 2.6 | 8.3 / 9.3 | 183 | 1.12 M | |

Wasm heap (`Module.HEAPU8.length`) stayed at 160 MB in every scenario, including after the boss wave. Console errors: 0 in every run; console warnings: 0. Selection by click on the Cinemachine-driven camera selects a pad (`clickSelection.type = "pad"`). The pause pair (two frames one second apart while paused) differs by 0 pixels.

Build files (gzip, decompression fallback on): `carrot.data.unityweb` 25.89 MB, `carrot.wasm.unityweb` 6.87 MB, `carrot.framework.js.unityweb` 87 KB, `carrot.loader.js` 48 KB; total **32.89 MB** (was 49.2 MB; hard cap 60 MB, target 32 MB missed by 0.9 MB because of the added packages in the wasm). Draw calls exceed the spec's 220/140 budgets because the forced depth prepass draws every opaque object twice; 60 fps holds on desktop at DPR1 with margin and on the phone proxy (cadence p95 under 16.7 ms, p99 under 20 ms). Desktop at DPR2 ran at 59 fps (cadence p50 16.9 ms); the canvas there is 2520x1575 (the page caps the device pixel ratio at 1.75) with `antialias:false` and no multisample renderbuffers, so the cost was the High render path at 4 Mpx, not MSAA (corrected by the speed plan below; the sentence used to say "2880x1800 with 4x MSAA").

### Fix round (critic findings)

Every high and medium finding from the look-and-feel and technical reviews was fixed; the per-finding table with the evidence files is in `3d-upgrade.md`. Checks specific to this round, all on `628519e8d5c6010d` unless noted:

- 60 Hz (and 30 Hz) displays: the demotion rule compares the frame interval with the display's own cadence and with measured main-thread work (see `3d-upgrade.md`), so steady vsync pacing at any refresh rate never demotes. With the harness `--hz60` mode (every rAF callback deferred by one frame, cadence p50 16.7 ms for 35 s of level-1 combat) the tier stays High; the final measurement session ran with the laptop on battery, where headless Chromium paced rAF at 33.3 ms (30 Hz) with 3-4 ms of work, and the tier stays High there too (an earlier version of the rule, "mean above 22 ms" alone, demoted in that situation). A CPU x8 throttle (`slowcpu-l4`) still demotes with a logged reason.
- Safari-class renderer string: Playwright WebKit 2336 reports the unmasked renderer as exactly `Apple GPU`; the game logs `CarrotQuality tier=High gpu=Apple GPU screen=1440x900` and renders the garden (WebGL2 with `EXT_color_buffer_float`). "Apple GPU" is no longer in the low-end regex; iPhones and iPads are still Low through `Application.isMobilePlatform`.
- Laptop viewport: 1366x768 logs `tier=High`; the canvas rule now only demotes below 600 device pixels on the short side (a 390x844 phone at DPR 1.25 is 488x1055 and logs `reason=viewport`).
- Pause card: the harness presses the centred card with the mouse; the pressed bounding box stays at the same centre (no 84 px jump) and `paused` is false after the release in every desktop scenario (`pausedCardClick` in the metrics files).
- Hit readability: judged on wide 1440x900 frames at 1x game zoom (`desktop-l4-combat-wide-*`, `desktop-l4-impact-crop-*` are 520x360 clips of those same frames, not zoomed captures) and on `desktop-l12-thunder-*` (a 3.3 s burst around the Thunderhead pad).
- Boss beat: `desktop-l4-boss-enter-*` and `phone-l4-boss-enter-*` show the boss in the left third with the warning card at the bottom edge, the spotlight pool, dust ring and shockwave; `desktop-l4-boss-fight-*` the ground aura; `desktop-l4-ability-*` the Bark whirl and Root tubes. Marsh and frost bosses are still not reached by the harness layouts (see below).
- Console: 0 errors in every run. Every start emits six `WebGL: INVALID_ENUM: getInternalformatParameter: invalid internalformat` warnings from Unity's texture-format probe at context creation; they are not produced by project code and are not suppressible from it. Earlier text in this document that said "console warnings: 0" was wrong on that point.
- Package resolution: `Packages/manifest.json` references eight tarballs by absolute path under `/Applications/Unity/Hub/Editor/6000.3.18f1/Unity.app/Contents/Resources/PackageManager/Editor/`. The project resolves only on a machine with that editor install (the Burst tarball is 490 MB, so the tarballs are not copied into the repository).
- `scripts/stubs.mjs` accepts an out-dir argument, so a scratch production build can be given its `/minigames/carrotDefense/` stub without touching `dist/`.

### Checks and results

- Final screenshots (read before this note was written) are in the session scratchpad `carrot-shots/build/`: lobby, level 1 combat, level 4 build/upgrade bursts, close-up bursts with seed, mortar and frost impacts, boss entrance frames (hero shot, light dip), boss fight, bark/root abilities, victory orbit, level 8 marsh at night (lanterns, fireflies, moonlit pond), level 12 frost (snow caps, snowfall, thunder tower, defeat push-in), phone level 4 and 12, DPR2 level 4, and quality A/B pairs.
- Level 8 and 12 never reached their boss in the harness: the scripted layouts lose at wave 1-2 at speed 2 (level 8's first wave is a 23-creature moth swarm), so the Lantern Regent and Crown of Winter entrances were not captured; the garden entrance was captured in landscape and portrait.
- Still unverified: a physical phone, a listening pass on the re-encoded audio at the shipped volume, and the SSAO contact darkening (feature left out).

## Speed plan (branch carrot-3d-upgrade, artifact `a6c40b6ee644e40b`)

Rendering only: `CarrotGame.cs`, `CarrotData.cs`, `CarrotTypes.cs` and `CarrotSimulationTests.cs` are untouched by this round, `game-data.json` is byte-identical, and `npm run carrot:test` reports **97,831 assertions** (48 campaign victories, 7 poor-coverage losses) on the final source. The page contract is unchanged (`carrot-state` events, `SendMessage('CarrotGame','Command'|'UiSound')`, loader file names, `unity-build.json` hash); `SendMessage('CarrotGame','Quality',...)` stays an additive debug entry (now `high`/`medium`/`low`, `noopaque`, `nocookie`, `scale:0.8`, `interval:2` besides the earlier toggles).

### What changed

| Item | Change | Where |
|---|---|---|
| Depth copy instead of the forced prepass | High and Medium copy depth after opaques (one fullscreen blit); the DepthOnly prepass that drew every opaque object twice is gone. Both tiers assert MSAA 1 (an MSAA depth copy fails on WebGL2 and the depth of field blurs the whole frame). The opaque texture is requested at runtime for marsh levels only (`Carrot/Water` is its only reader). | `CarrotPipeline.Pipeline`, `CarrotView.ApplyBiomeLighting` |
| One shadow cascade | One cascade over 36 u (the play area is 15x11 u seen from 26 u; the old first split, 0-12 u, never held anything): 1536 map on High, 1024 Medium, 768 Low, soft shadows Medium/Low/Low. Terrain receives only. Small dressing (pad stones, markers, flowers, litter) never casts. | `CarrotPipeline`, `CarrotView.BuildTerrain`, `CombineDecoration` |
| Decimated scan props | Blender collapse LODs (`Tools/decimate_carrot_scans.py`): `<Name>Small` prefabs (1.5-4k tris) with a shadows-only caster child (480-780 tris) for the ~100 small placements; the eight hero anchors keep the full scans. The decoration combiner batches per material and shadow mode (visible, casters, no-shadow). | `CarrotNaturalAssets`, `CarrotView.Scan/CombineDecoration`, `asset-manifest.md` |
| Medium tier | Third URP asset bound to quality level 1: same scene content as High (`CarrotQuality.Rich`), one 1024 cascade, per-vertex point lights, no light cookie, no depth of field, bloom without HQ filtering, height fog and FXAA on, particle caps 0.75x, MaxEffects 120. Chosen for canvases above 2.6 M device pixels (DPR2 or DPR1.5 desktops), WebKit (`navigator.vendor` Apple or the `Apple GPU` renderer string) and tablets, and it is the first demotion step from High. | `CarrotQuality.Choose`, `CarrotPipeline` |
| Shader warm-up | A rig of pin-sized quads parented to the game camera for the first three rendered frames (0.3 u in front of it, 2 mm wide) carries one material per effect shader plus a tiny point light, so the real first frame links the particle, bolt, decal, contact, water and Storybook variants (cutout, wind, dissolve, world texture, additional lights) that used to link at the first shot or decal. A separate hidden 64x64 frame rendered from `Awake` was tried first and cost 0.8-1.0 s of start-up on top of the links, so it was dropped. GPU instancing is off on the model and scan materials: a renderer with a property block left the SRP batcher and two of them sharing a mesh were drawn with the `INSTANCING_ON` variants, which linked mid-level (the "mid-level 2 links" of the plan). The plan's "5 links at the boss entrance" were the harness's own A/B toggles (`nobloom`, `noaa`, `low`), not gameplay. | `CarrotView.WarmShaders`, `CarrotModels.Surface`, `CarrotNaturalAssets.MakeMaterial` |
| Render-scale governor, frame pacer, stepwise demotion | 120-frame windows (voided by any frame over 40 ms, 5 s grace after a level build). GPU-bound (cadence 1.25x above the paced period, work under 60% of it): on a 120 Hz panel `OnDemandRendering.renderFrameInterval` goes to 2 first (a steady 60), then the render scale drops 0.1 at a time (floor 0.7 desktop, 0.6 phone), then the tier steps High > Medium > Low after two confirming windows and a 10 s cool-down. CPU-bound (work over 14 ms): tier step the same way; work over 7 ms on a 120 Hz panel only paces to 60. Clean windows raise scale (+0.05 / 6 s) or the interval back to 1 (locked 60 s if it bounces); one promotion attempt after 20 s of low work, never above the device rule. The page samples the display period during the loader download (`window.__carrotDisplayPeriod`) so a GPU-bound start is not read as a slow panel, and three steady windows on a slower standard period (ProMotion on battery) move the estimate. Tier and scale persist in PlayerPrefs `carrot.quality` (local only). | `CarrotView.WatchFrameTime`, `CarrotQuality`, `unity.ts` |
| Physics in script mode | `Physics.simulationMode = Script`, fixed step 1/30, max delta 0.1; `SelectAt` calls `Physics.SyncTransforms()` before the raycast. | `CarrotView.Awake/SelectAt` |
| Music out of the data file | The four CC0 recordings moved to `Audio/Music~` (ignored by Unity) and are encoded by Blender's bundled ffmpeg (`Tools/encode_carrot_music.py`) into `StreamingAssets/Carrot` as Ogg Vorbis plus MP3 (7.6 + 7.8 MB, shipped at `public/unity/carrot/StreamingAssets`); `CarrotAudio` downloads a track on first use after the HUD and the browser decodes it (Vorbis everywhere, MP3 on WebKit whose `decodeAudioData` has no Vorbis; the transition waits for the decode). | `CarrotAudio.EnsureMusic/LoadMusic` |
| 512 px textures | PBR, scan and atlas albedo/normal at 512 px, occlusion/roughness at 256 px (never sampled above mip 2 at 46-97 px per world unit); `globalTextureMipmapLimit = 1` on Low. | `CarrotBuild`, `CarrotNaturalAssets`, `CarrotModels`, `CarrotQuality` |
| Page | `unity.ts` passes `webglContextAttributes {alpha:false, antialias:false, powerPreference:'high-performance', preserveDrawingBuffer:false}`, answers Unity's per-frame fences as already signaled on WebKit (`?carrotfences=all` everywhere, `?carrotfences` keeps the real ones) and samples the display period; `carrot.css` drops `backdrop-filter` on the in-game panels (the lobby, loading screen and dialogs keep their blur). | `src/minigames/carrot` |
| Effect budgets | Per-tier caps (`CarrotQuality.Cap`: 1x / 0.75x / 0.5x), frost snowfall 350/220/140 with a 5 s life, debris plane collision only on High and Medium, `N()` rounds down on Low. | `CarrotEffects` |
| Pad markers | The 16 `Build mark` discs join the batched decoration (no shadows) instead of a renderer per pad. | `CarrotView.BuildPad` |

Corrections to the measurement report this plan was written from: the HDR colour targets were already R11G11B10 (`texStorage2D` format 0x8C3A on the game context), not RGBA16F, so the Medium tier's precision setting changes nothing; the DPR2 canvas is 2520x1575 with `antialias:false` (the earlier "2880x1800 with 4x MSAA" sentence was wrong); GPU time cannot be measured under ANGLE Metal (`EXT_disjoint_timer_query_webgl2` returns zeros and adds 2 ms to the main thread, `gl.finish()` is masked by Unity's own two fences per frame), so GPU-side gains are inferred from draw, triangle and pixel counts and from tier A/Bs on the same frame.

### Measured (speed plan)

Same harness as before (Playwright headless Chromium, ANGLE Metal, Apple M5 Max) extended with per-pass attribution, tagged program links and a click check (`carrot24/speed/perf.mjs`). All rows were taken while another session kept 7 cores at 100% (load average 13-25), so absolute cadence is noisier than the earlier table; before and after rows come from the same hour. `before` = artifact `9d3ffcee`'s predecessor (the 24-level build `a6c40b6e`'s parent, saved in `carrot24/speed/build-before`), `after3` = build 1 of this plan (Awake warm-up, since replaced), `final` = the shipped artifact. Columns: main p50/p95 ms, cadence p50/p95/p99 ms, draws, triangles, per-pass draws/triangles (shadow atlas; then each screen-sized pass: depth prepass, forward, post), time to HUD (create-to-instance + instance-to-HUD).

| Scenario | Tier | Main | Cadence | Draws | Tris | Passes | HUD |
|---|---|---|---|---|---|---|---|
| before/desktop-l4 idle | High | 3.5 / 4.3 | 9.6 / 10.7 / 11.3 | 280 | 2.34 M | shadow 81/1.11 M; 1440x900 82/0.62 M; 1440x900 90/0.62 M | 1.61 s (956+328) |
| before/desktop-l4 combat | High | 5.5 / 7.0 | 10.4 / 12.6 / 13.6 | 360 | 2.48 M | shadow 108/1.17 M; 1440x900 96/0.65 M; 1440x900 128/0.65 M |  |
| before/desktop-l4 boss entrance | High | 6.9 / 7.9 | 11.5 / 13.9 / 14.9 | 355 | 2.58 M | shadow 96/1.22 M; 1440x900 86/0.67 M; 1440x900 107/0.67 M |  |
| before/desktop-l4 boss wave | High | 7.9 / 9.0 | 12.4 / 15.0 / 16.2 | 402 | 2.70 M | shadow 129/1.28 M; 1440x900 111/0.71 M; 1440x900 138/0.71 M |  |
| after3/desktop-l4 idle | High | 2.4 / 2.8 | 8.3 / 9.2 / 9.3 | 160 | 0.70 M | shadow 56/0.28 M; 1440x900 77/0.42 M | 2.16 s (1316+506) |
| after3/desktop-l4 combat | High | 3.5 / 4.3 | 8.3 / 9.0 / 9.3 | 212 | 0.77 M | shadow 69/0.31 M; 1440x900 115/0.46 M |  |
| after3/desktop-l4 boss wave | High | - / - | - / - / - | undefined | - | - |  |
| before/phone-l4 idle | Low | 7.8 / 9.5 | 8.5 / 11.0 / 12.1 | 106 | 0.37 M | shadow 0/0.00 M; 488x1055 85/0.33 M | 3.48 s (2115+1004) |
| before/phone-l4 combat | Low | 11.9 / 14.0 | 13.2 / 16.7 / 18.8 | 160 | 0.44 M | shadow 14/0.06 M; 488x1055 122/0.36 M |  |
| before/phone-l4 boss entrance | Low | 10.8 / 14.2 | 11.8 / 17.4 / 18.9 | 147 | 0.48 M | shadow 18/0.11 M; 488x1055 105/0.38 M |  |
| before/phone-l4 boss wave | Low | 12.4 / 14.9 | 13.4 / 18.1 / 20.1 | 174 | 0.54 M | shadow 20/0.11 M; 488x1055 132/0.42 M |  |

Final-artifact rows recorded so far (`carrot24/speed/final-desktop-l4.log`, the rest of the matrix was still running when this note was written; JSON lands in `carrot24/final/` and the missing baselines in `carrot24/base/`):

    [desktop-l4] hud after 1439 ms {"enterToCreate":341,"createToInstance":747,"instanceToHud":354,"linksBeforeHud":24,"linkMsBeforeHud":0,"compiles":48,"texCount":86,"texMB":0}
    [desktop-l4] idle main 2.9/3.7/4 cad 8.3/9.3/9.5 cpu+gpu 2.3 (gpuEst -0.6, finCad 8.3) draws 160 tris 703238 links 0 >18ms 0
    [desktop-l4] firstWave main 2.7/3.2/3.7 cad 8.3/9/9.3 cpu+gpu 2.9 (gpuEst 0.2, finCad 8.3) draws 174 tris 732136 links 0 >18ms 0
    [desktop-l4] combat main 3/3.5/3.8 cad 8.3/9.7/10.2 cpu+gpu 3.2 (gpuEst 0.2, finCad 8.3) draws 212 tris 774868 links 0 >18ms 0

### Gate status at the time of writing

- Desktop DPR1 High, level 4: idle 280 -> 160 draws and 2.34 M -> 0.70 M triangles, combat 360 -> 212 draws and 2.48 M -> 0.77 M, boss-wave paused frame 372 -> 132 draws; cadence held 8.3 ms p50 with p95 9.0-9.7 ms on a machine under external load (before: 9.6-12.4 p50 in the same hour). The depth prepass pass is gone from the pass map; the shadow atlas is one 1536 viewport.
- Links after the HUD: 0 during 93 s of level-4 combat at 2x on build 1 (the three single links in that run were the A/B toggles); the final build's first-frame rig is measured by the running matrix.
- Time to HUD (final build, loaded machine): 1.44 s desktop (747 + 354 ms) against 1.61 s before in the same conditions; data file 25.9 MB -> 14.05 MB gzip (textures 11.0 -> 9.0 MB, sounds 9.1 MB -> 0.6 MB uncompressed, music streamed from StreamingAssets: 7.6 MB Ogg + 7.8 MB MP3).
- Click selection on a moving enemy after the physics change: `{type: enemy}` on every run.
- Not yet verified on the final artifact when this note was written: DPR2 Medium cadence, phone Low, WebKit, hz60, slow-CPU demotion, 4K governor steps (scenarios `desktop2x-l4`, `phone-l4`, `webkit-l4`, `hz60-l4`, `desktop2x-high-l4`, `phone-l12`, `desktop-l12`, `desktop4k-l4`, `slowcpu-l4`, `desktop-l24` plus `--nofence`/`--noglass` pairs in `chain-matrix.sh`). Known harness caveat: any file change in the worktree (a Unity build, a docs edit) makes Tailwind rescan and the dev server hot-update `CarrotPage.tsx`, which remounts the game mid-run; measure with the worktree frozen.
- Headless Chromium has no MP3 decoder (`EncodingError: Unable to decode audio data` on build 1), which is why the final build serves Ogg Vorbis to everything but WebKit.

## Difficulty pass: ship check (branch carrot-boss, artifact `864695ea6f99c380`; the previous artifact was `c9f0097a026799d2`)

Independent ship check of the Super tier, blindness, uproot, the retune and the three boss challenges, run on 2026-10-13 on the uncommitted worktree. One Unity process at a time under `output/unity.lock`, in this order: `npm run carrot:test` (20:35:13-20:35:36), `node scripts/carrot-unity-build.mjs --dev` (20:35:36-20:36:06, the earlier dev wasm was reused by the incremental build; the data file was rebuilt), `npm run carrot:unity` (20:36:06-20:37:07, `CARROT_BUILD_OK`, 0 `error CS`, `Carrot/BlindOverlay` compiled), then `npm run build`. Logs: `output/carrot-unity-test.log`, `output/carrot-unity-dev.log`, `output/carrot-unity-build.log`. Harness and every screenshot named here: `scratchpad/carrot-boss/ship-check/` (`ship.mjs`, `locks.mjs`, `run-*.txt`, `console-*.txt`).

### Automated evidence

- `npm run carrot:test`: **CARROT_TESTS_OK 177,371 assertions**; 54 `CARROT_CAMPAIGN strategy=0|1 ... result=won` lines (levels 1-27), every one with `hearts>=1`, `seconds<=1200` (max 928 s) and `lowest=`, `supers=`, `wave=` fields; `supers>0` in 10 policy-0 and 8 policy-1 runs; `merges=off` won on 4, 8, 12 (and 16, 20, 24); `CARROT_POOR_COVERAGE` lost on 1, 4, 8, 12, 16, 20, 24, 25, 27; `CARROT_DETERMINISM ticks=22757 scripted=4500`; `CARROT_SUPER_BUDGET` ratios 0.810-0.974. The `CARROT_` lines of this run are byte-identical to `simulation-results.txt`.
- `node scripts/carrot-waves.mjs` prints `CarrotData.cs holds the generated block (27 levels)`; `--baseline` prints BaselinePressure {42,50,70,81,94,113,132,145,202,223,240,279,236,254,280,276,316,334,352,366,377,396,413,428} and BaselineStream {72,106,121,154,161,203,175,226,212,258,250,302,231,243,280,283,303,335,350,370,396,449,459,477}; `node scripts/carrot-game-data.mjs` prints `matches CarrotData.cs (27 levels)`; `grep -c 'new string\[\]' CarrotData.cs` = 27; `HPScaleTable` in `CarrotData.cs` equals the planned 27 entries, `BossBaseHp` 2600/5000/8200/10500/4200/9000/14000, `Pressure` entries all in [0.80, 1.0] with the seven non-1 entries (9=0.80, 11/19/23=0.95, 24/26/27=0.85) listed in `balance-results.md`.
- `npx tsc --noEmit`, `npm run lint`, `npm test` (incl. `test-carrot-progress.mjs` and `test-carrot-challenges.mjs`) and `npm run build` all exit 0 on the final tree; `CarrotPage.tsx` has no `Math.min(4` and `roman` is the five-entry `['I','II','III','IV','S']`.
- Accounts repo (`/Users/eric/Claude/cornellcgs-accounts`): `node scripts/test-account-sync.mjs` passes with the `mergeCarrotSuper` and `mergeCarrotChallenges` cases; `merges.ts` has `CARROT_LEVEL_COUNT = 24`, `CARROT_LEVEL` 1-24 and no `Math.min(12`.
- Models: `original-model-manifest.json` 51 entries, `character-model-manifest.json` 13; `output/carrot-unity-prepare.log` has no `Missing required Carrot model` / `Skeletal clips missing` and reports `50 physical tower tiers, 15 animated creatures and props`; both review plates exist (`screenshots/model-review-super.png`, `model-review-challenge-bosses.png`). Blender triangle counts are taken from the models report, not re-run here.
- Docs: `gameplay-implementation.md` contains Pressure, Blindness, Uproot, Whiteout, Dusk, Tithe, Super, merge, Challenges, Gust, Lift-off, Raise Dead, Gaze and a "Fairness contract" section; `balance-results.md` holds the 27-row table, the merges-off rows and the three recorded baselines; `asset-manifest.md` and `credits.txt` describe plates 26-33 and the 35-37 sheets as 2D paintings/sprites, never 3D assets.
- Release build: `public/unity/carrot/Build` = 30.11 MB (data 22.96 MB, wasm 7.02 MB, framework 0.09 MB, loader 0.05 MB; was 32.9 MB); with the speed pass's streamed music in `StreamingAssets` (29.4 MB, untracked, from the earlier speed pass) the folder is **60.12 MB decimal / 57.3 MiB** (`du -sh` prints 58M). The release data file contains no `debugCoins` string (the dev data file does) and the release player left coins unchanged on a `debugCoins` command (browser row below). `dist/` was packaged by `npm run build` after the Unity build.
- Not re-run here: the five mutation checks (they require editing `CarrotData.cs`/`CarrotGame.cs`; the simulation report records each failing with the level or kind in the message), the Blender exports, and the per-stage git sequencing (nothing is committed; the stages were proven in single runs as the simulation report says).

### Browser observations (DEV build `output/carrot-dev`, Playwright headless Chromium, ANGLE Metal, Apple M5 Max; page served by Vite on 127.0.0.1:5205)

| Feature | Observed |
|---|---|
| Challenges lobby | `Boss challenges` button and the `3 challenges` meta line in the lobby (`desktop-lobby.png`); modal with three cards (Easy/Hard/Insane badges, portraits, "Not yet cleared") at 1440x900 (`desktop-challenges-modal.png`) and stacked at 390x844 with no horizontal scroll (`phone-challenges-modal.png`). Locks without the preview flag (`locks.mjs`, both sizes): fresh save and unlocked 5 → [open, locked, locked] with captions "Clear Last Harvest (12) or the Giant Tornado to unlock" / "Clear The Last Light (24) or the Zombie to unlock"; unlocked 13 → [open, open, locked]; medals {24:1} → all open. |
| Super merge | `superPairs` 2 with two seed and two frost tier-4s; `merge` command → `selection.tier 5` "Glacier Bloom", towerCount 3, burst frame 0.2 s after the command (`desktop-merge-burst.png`: rings, flash, "Glacier Bloom forged · Undo 4s", Super aside with the S emblem cell, Power 40, Reach 3.4, sell 735); Super frame with halo ring, gold plinth and ground emblem decal (`desktop-super-crop.png`). Desktop press-drag seed→seed → `selection.tier 5` "Harvest Cannon", towerCount 2. Phone: 150 ms swipe from a tower does not merge and pans the camera (selection screen point .686,.476 → .814,.523); 0.35 s hold-drag → `selection.tier 5`, towerCount 2 (`phone-merge-hold-armed.png`, `phone-two-supers.png`). Cosmetic: after a second merge inside the ready phase the forge notice still reads the first Super's name ("Glacier Bloom forged" while the selection is Harvest Cannon, `desktop-two-supers.png`). |
| Moonwell blindness (L8) | Telegraph `blind` castRemaining 1.47 s; windup canvas luminance 0.075; `blind` 1.6 → canvas luminance mean **0.009** (centre 0.006) at `blindAlpha` .985 with the carrot lantern glow, the boss bar and "The lanterns gutter" readable (`desktop-l8-blind-dark.png`); enemyCount 17→18 and boss HP 4389→4330 while dark; back to 0.086 afterwards. Phone: 0.129 → 0.025 → 0.138. At speed 2 the 3 s dark lasts ~1.5 s of real time; the harness read the HUD opacity after the window had closed, so the `.is-blind` 35 % dim is confirmed only visually in the dark frame (HUD chips dimmed) and by the page package's injected-state test, not by a computed-style read during the window. |
| Boss entrances | Giant Tornado at wave 4 of 6 (hp 4200, `desktop-l25-tornado-entrance.png`: funnel, debris, "GUARDIAN APPROACHING", boss bar `--tornado`); Zombie at wave 6 of 9 (hp 8886 on arrival, green night arena, `desktop-l26-zombie-entrance.png`, boss bar `--zombie`). Unknown Eyeball entrance, dark-window iris and Whiteout vignette: runs were still in progress when this note was written (batches A/B in `scratchpad/carrot-boss/ship-check`). |
| Release build | On `public/unity/carrot` (artifact `864695ea6f99c380`) `{"type":"debugCoins","value":5000}` left coins at 240 → 240; 0 console errors. |
| Console | 0 console errors in every completed run; the known `INVALID_ENUM`/`getInternalformatParameter` warnings and the dev player's `Streaming of 'ogg'` line set aside. |

### Measured (first pass; rows marked "6 browsers" were taken with six harness browsers open and are contaminated)

main = rAF callback work p50/p95; cadence = rAF gap p50/p95/p99 ms; draws p50/p95; tris p50; wasm heap.

| Row | Desktop High 1440x900 | Phone Low 390x844 DPR 1.25 CPU x4 |
|---|---|---|
| L4 boss wave | 3.0/3.6 · 8.3/9.2/9.3 · 259/269 · 0.87 M · 160 MB (alone) | 7.9/22.3 · 16.2/25.1/25.8 · 164/176 · 0.38 M · 160 MB (6 browsers) |
| L8 blind window | 4.5/11.4 · 8.3/9.3/16.7 · 362/375 · 0.97 M · 160 MB (6 browsers) | 16.9/43.6 · 24/51/66.6 · 247/264 · 0.47 M (6 browsers) |
| L12 wave 10 | in progress | not yet measured alone |
| L24 wave 15 | 4.1/12.4 · 8.3/16.0/16.8 · 519/572 · 0.98 M · 160 MB (6 browsers; governor stepped to Medium, interval 2) | 24/47.1 · 25.5/50.3/75.8 · 319/374 · 0.46 M (6 browsers) |
| L27 waves 10-11 | in progress | not yet measured alone |
| L12 with two / six Supers | in progress | six Supers wave 1: 21.2/55.7 · 25.2/58.4/75.1 · 182/225 (6 browsers) |

The wasm heap read 160 MB in every row (captured through `WebAssembly.Memory`). Isolated re-measurement chains (`rerun.sh`: one phone and one desktop browser, scenarios `l4 blind l12 l24 l27perf supers6 supers2`) were queued and their logs land in `batch-P-phone-alone.log` / `batch-Q-desktop-alone.log`; the phone p95 < 16.7 ms gate is **not established** by this note.

### Still unverified

- Phone cadence p95 under 16.7 ms on L4/L8/L12/L24/L27 and with Supers (contaminated first pass; isolated rerun pending); desktop L12/L27/Supers rows; the Eyeball iris-through-dark frame, the Whiteout vignette, the six-Super draw delta, the uproot toast Sell on the real engine and the teach-toast reload check (runs in flight).
- Physical phone drag and multitouch; listening pass on the new stingers, voices and boss themes.
- Mutation checks and Blender exports (taken from the simulation and models reports).

## Giant update: world, camera, effects (branch carrot-s-world)

Run on 2026-10-14 on QA build 17 (`CarrotBuild.WebQa`, release player settings plus `CARROT_QA` telemetry, commit `7f5f796`), served by `scripts/carrot-qa/serve.mjs` in the GitHub Pages model (no Content-Encoding; the page inflates the gzip build). Playwright headless Chromium (ANGLE Metal, Apple M5 Max) and headless WebKit, 1440x900 unless noted, machine on AC power. Evidence: session scratchpad `carrot/world/qa/` (`final2-{high,medium,low}`, `final/perf-*`, `final/camera-chromium`, `final/reduced-chromium`, `flash-chromium`, `show-qa17`). What changed and why: [giant-update/render-vfx.md](giant-update/render-vfx.md).

### Automated evidence

- `CarrotBuild.PreparePrivate` after the private restore: `ASUNA_PREPARED ... height=2.100 forward=+Z` and `CARROT_LICENSED_FX_REQUIRED_OK effects=8`; `git ls-files` lists no licensed or private path.
- `node scripts/carrot-qa/cs-check.mjs`: `CSC_OK` for the player (`UNITY_WEBGL`), the editor-define runtime and the 14 editor files. `CarrotBuild.WebQa` and, on an integration worktree with all five giant-update branches merged, `CarrotBuild.Web` (`CARROT_BUILD_OK`, 0 `error CS`).
- FX probe (`QaFxProbe`, level 13): at least 4 layers on every one of the 20 plant impacts and 27 creature deaths; peak 7 decals and 2 lights; smallest OKLab distance between any boss or miniboss ability colour and a tower colour **0.095** (it was 0.039 for Ember Charge before the gamut-aware separation).

### Measured

| Check | Target | Result |
|---|---|---|
| Ready-frame mean luminance, 29 levels | inside 0.08-0.25 | High 0.090-0.158, Medium 0.091-0.159, Low 0.088-0.169 (shipped: 0.0086-0.595, 69x) |
| Path-to-ground contrast at projected route samples, 29 levels | at least 2:1 | High 2.04, Medium 2.03, Low 2.12 (lowest level on each tier) |
| Visible idle effect renderers on a ready frame | 0 | 0 on 29 levels x 3 tiers |
| Decor clearance from route centrelines | at least 1.0 u | 1.0 u (was -1.17 on the arenas) |
| Near-white share of the marsh pond masks | low | at most 0.70% |
| WCAG 2.3.1 flashes in any rolling second (8x5 cells, 11% of the frame) | at most 3 | 0 in all four: L24 four Thunderheads (5,026 frames; 76 flash slots granted, 103 coalesced; the shipped build read 4), L8 boss casts and death, L29 Asuna's six abilities, L12 Super forge |
| Reduced motion, scripted L8 boss fight | none | 0 impulses, hit-stops, slow motion, FOV punches, cinematic or reveal moves |
| Zoom toward the cursor | under 1 px drift | 0.2-0.5 px on three pads |
| Pan while paused | works | 250 px, `paused: true` |
| Route starts reachable at maximum zoom | all | 10 levels, every start |
| Focus boss (Asuna, L29) | readable | 135 px tall, following, zoom 1.9 |
| Chromium desktop High, L24 combat, 3 min | 120 Hz panel | 120 fps, p95 10.0 ms, draws 403 (max 507), 0.81 M triangles, no tier change |
| WebKit desktop, L24 combat, 3 min | 60 Hz | 59.9 fps, p95 18 ms, Medium tier held (render scale 0.95-1.0), draws 391 |
| Phone Low 390x844 DPR 2 (Chromium), L24, 2 min | | 120 fps, p95 10.3 ms, draws 227, 0.32 M triangles |
| Phone Low with 6x CPU throttle, L24 | p95 under 20 ms | **p95 about 26 ms: not met** (earlier build; view update sections total about 2.8 ms, the rest is simulation, render submission and the page) |
| Data file (gzip) | smaller | 42.61 MB QA, 41.69 MB integrated release (shipped 64.66 MB); wasm 7.1 MB |
| Cold load, 10 Mbps / 40 ms | | integrated release: 51.4 MB, Continue to playable 40.6 s; world QA 52.1 MB / 41.5 s; 50 Mbps 8.9 s |
| Release build on the integrated tree, Pages-model server | loads | Chromium levels 1, 8, 14, 24, 29 and WebKit 1, 14, 29: ready frames, 0 console errors |

### Still unverified

- Physical phones and tablets (touch pinch, safe areas, frame time, thermal); the 6x-throttled phone p95 target is not met.
- Real displays other than 60 and 120 Hz; headed Safari (only headless WebKit was run).
- Simulation-side time scale and caps: hit-stop and slow motion reach `CarrotGame.RequestTimeScale` and the `worldBars` cap reaches `CarrotGame.SetCap` only after the balance stream merges (reflection; checked on the integration worktree, not on this branch alone).
- Owner review of the showcase bursts and a listening pass; the release artifact for the site is built from the integrated branch, not from this branch alone.

## Giant update: integrated release (branch carrot-next, artifact `dba7ca4e745b2cb2`)

All five stream branches (`carrot-s-balance`, `-world`, `-characters`, `-audio`, `-ui`) merged into `carrot-next` without textual
conflicts, in that order. One Unity release build (`npm run carrot:unity`, `CARROT_BUILD_OK`) and one QA build (`--qa`, for the
debug-command suites below) were made on the merged tree; no C# changed after them. Browser runs used `scripts/carrot-qa/serve.mjs`
(GitHub Pages model, no Content-Encoding) over `npm run build` + `node scripts/stubs.mjs`, Playwright headless Chromium (ANGLE Metal,
Apple M5 Max) and headless WebKit, on 2026-10-14.

### Integration fixes

- **Guardian notes on the wave track.** The published `wavePlan` and the v2 `incoming` list name a guardian by its boss id with
  `boss: true` (`CarrotData.PlanWave`, `CarrotContract.WriteGroup`); the page keyed guardians only as `kind: 'boss'`, so the
  Lantern Regent read as a plain creature called "marsh". `waves.ts` now maps both to the guardian note. `unit.mjs` checks the
  published plan against the rebuild per route on all 29 levels and is part of `npm run carrot:test`.
- **Results card.** The par time sits under the run time; "13:03 / par 18:20" ran into the chain cell.
- **Paused card.** A low pill instead of a card at the centre of the board, which swallowed the wheel and drag there, so panning
  while paused did not start at the screen centre (0 px; 250 px Chromium and 282 px WebKit after the move).
- **Harnesses.** `scripts/carrot-qa/lib.mjs` seeds a player who has met every ability (the scripted suites otherwise stall behind
  first-encounter cards); `carrot-audio-qa.mjs` finds the new "Stage select" button.
- Site description no longer calls the HUD a rhythm game. Stage-select jackets re-captured from this build (provenance.json).

### Automated evidence

- `npm run carrot:test`: `CSC_OK`, progress/records, wave and game-data drift, UI units, challenges, music, then Unity
  `CARROT_TESTS_OK 4435962 assertions; 57 campaign victories`, `CARROT_CONTRACT_OK`, `CARROT_AUDIO_OK 6916`,
  `CARROT_MUSIC_TRANSITION_OK`. Standalone: 4,436,019 assertions, digest `1566501f7e139bfe` (both equal to the balance stream's).
- `node scripts/carrot-sim.mjs --bands` on the merged tree reproduces `difficulty-bands.json` (de9f2df) exactly, ignoring run order.
- `npm test`, `tsc --noEmit`, `npm run lint`, `npm run build`: pass. UI acceptance suite (mock player, production build):
  331/331 in Chromium and WebKit.

### Measured

| Check | Result |
|---|---|
| Download | data 41.69 MB, wasm 7.14 MB, framework 0.09 MB (was 64.66 / 7.05 / 0.09 MB) |
| Chromium desktop 1440x900 | L1 won 10 hp, L8 won 4 hp (Lantern Regent, casts and cards), L14 3 min, L24 lost wave 14/16, L25 Tornado lost wave 5/6, L29 Asuna lost (naive bot RN, as the bands predict); 120 fps, p95 9.3-10.2 ms, worst single frame 185 ms (L8 run) |
| WebKit desktop | L1 won 10 hp, L8 won 4 hp, L24 3 min, L29; 52.1 fps p95 21 ms in the L8 boss fight, 59.5-59.8 fps p95 18 ms elsewhere |
| Phones 390x844 and 844x390 | Chromium 120 fps p95 10.3 ms, WebKit 60 fps p95 18 ms (L1, L8, L29; landscape L1) |
| Console errors, failed requests | 0 in every run above |
| Old save (campaign v1 at stage 13, Super v1, challenges v1, no records) | Continue opens stage 13, stage select and challenges show the stored medals and the Tornado best; stored records unchanged; both engines |
| WCAG 2.3.1 (QA build, `flash.mjs`) | 0 flashes in any second: L24 four Thunderheads, L8 casts and death, L29 six abilities, L12 Super forge |
| Camera (`camera.mjs`) | zoom drift 1.4-4.4 px (the single safe-area nudge when the build panel opens); route starts reachable; Asuna 135 px; reduced motion 0 impulses, hit-stops, slow motion, FOV punches or camera moves |
| Time scale | the boss-death slow motion reaches the simulation (`timeScale` 0.3) through `RequestTimeScale`; caps report `veteran` and `worldBars` |
| Audio, release build, earned coins | combat median -19.9 to -20.5 dBFS, p90 -16.9 to -17.9, peak at most -2.72 dBFS, 0 clipped (L24, L8, Asuna; both engines); distinct buffers 76 on the six-tower L24 board (gate 80), 80 and 115-116 elsewhere |
| Audio, QA build, dense L24 | 91-93 distinct buffers, top-7 23%; menu chirps play before Unity loads (2 then 4 oscillators, one context). One Chromium run logged a 645 ms wave-stinger lag; the rerun 0 ms |

### Still unverified

Physical phones and headed Safari; a listening pass and owner review of the effects; the 6x-throttled phone frame target.
