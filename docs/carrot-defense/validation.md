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

Build files (gzip, decompression fallback on): `carrot.data.unityweb` 25.89 MB, `carrot.wasm.unityweb` 6.87 MB, `carrot.framework.js.unityweb` 87 KB, `carrot.loader.js` 48 KB; total **32.89 MB** (was 49.2 MB; hard cap 60 MB, target 32 MB missed by 0.9 MB because of the added packages in the wasm). Draw calls exceed the spec's 220/140 budgets because the forced depth prepass draws every opaque object twice; 60 fps holds on desktop at DPR1 with margin and on the phone proxy (cadence p95 under 16.7 ms, p99 under 20 ms). Desktop at DPR2 runs at 59 fps (cadence p50 16.9 ms), GPU-bound at 2880x1800 with 4x MSAA.

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
