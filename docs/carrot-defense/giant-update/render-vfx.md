# Giant update: world, camera, effects and the web build (world stream)

Branch `carrot-s-world`. This document records what the world stream changed, why, and what was measured. Measurements come from
local QA builds (`CarrotBuild.WebQa`, release player settings plus `CARROT_QA`) served by `scripts/carrot-qa/serve.mjs`, a plain
static server in the GitHub Pages model (no Content-Encoding, `.unityweb` as octet-stream). The harness is Playwright with headless
Chromium (ANGLE Metal on an Apple M5 Max) and headless WebKit 2336. The machine ran on battery for part of the session (macOS then
throttles requestAnimationFrame to 30 Hz); the final numbers below were taken on AC power, on QA build 17 (commit `7f5f796`).

Licensed and private inputs: everything here uses assets already on the machine. The four Asset Store effect packs and the Asuna
character are the owner's acquired packages from the local Unity cache, restored into the git-ignored private folders (see
"Private restore"). New textures are procedural and generated at load by code in this repository (see "Provenance"). No new
downloads.

## Private restore (go/no-go gate)

`CarrotBuild.Prepare` refuses every web build until `CarrotAsunaAssets.RequirePrepared` and `CarrotLicensedFxImporter.RequirePrepared`
pass. On this checkout the private folders were empty, so no browser build of the giant update was possible.

1. Each `.unitypackage` from `~/Library/Unity/Asset Store-5.x` was extracted into its own empty folder under the session scratchpad.
   The Asuna archive's SHA-256 is `7422b48589313e6c3ef9ade767c6556312ef5642bb4abc78efbe48e7d41d6ae9`, the value recorded in
   `asuna-integration.md`.
2. A dependency walker (scratchpad `world/tools/restore_private.py`, run with `python3 -I`) copied only the audited graph with the
   original `.meta` files (GUIDs preserved): the Asuna master prefab, its meshes, materials, textures, the six clip FBXs, the female
   avatar mask and the publisher readme, 112 files and 574,350,109 bytes, the exact byte count `asuna-integration.md` records for the
   earlier audited graph. For the effect packs: the eight reviewed prefabs and their materials, textures and meshes (Buff Loop FX's
   Unity 5 binary prefabs reference GUIDs as nibble-swapped bytes; the walker reads both forms), Cartoon FX's `.cfxrshader` files with
   their include files, its scripted shader importer (editor-only assembly) and the `CFXR_Effect` runtime script the prefabs
   reference. No welcome screen, upgrade check, demo or Kino Bloom code was copied.
3. `CarrotIntegration.json` (Asuna) and `config.json` (effects) were rebuilt from `asuna-integration.example.json`, the clip table in
   `asuna-integration.md` and the eight-prefab table in `design/prism-presentation.md`. Clip names were verified in the FBX metas
   (`Idle1`, `Walk`, `AttackRightHand`, `Run`, `HitFront`, `Death1`); all 40 texture dependencies have an explicit kind and size.
4. `CarrotBuild.PreparePrivate` (via `scripts/carrot-qa/unity.mjs`) logged `ASUNA_PREPARED ... height=2.100 forward=+Z` (14
   renderers: six skinned meshes and eight armor parts, eight materials, as the integration doc records) and
   `CARROT_LICENSED_FX_REQUIRED_OK effects=8 packs=MagicEffectsFree-247933,QuickEffectsVol1-304424,BuffLoopFX-34104,CartoonFXRemasterFree-109565`.

`git ls-files` lists no path under `Assets/Licensed`, `Assets/Private`, `Resources/Carrot/AsunaRuntime`, `Resources/Carrot/LicensedFx`
or the Asuna prefab; `git status --ignored` shows them ignored.

## Load size

| | Shipped build | World QA build | Integrated release build (all five streams merged, `CarrotBuild.Web`) |
|---|---|---|---|
| `carrot.data.unityweb` (gzip) | 64.66 MB | 42.61 MB | 41.69 MB |
| `carrot.wasm.unityweb` | 7.0 MB | 7.10 MB | 7.14 MB |
| Cold load at 10 Mbps, 40 ms (`load.mjs`): bytes / Continue to playable | | 52.1 MB / 41.5 s | 51.4 MB / 40.6 s |
| Cold load at 50 Mbps | | 8.9 s | |

The saving is the texture compression of the private layer: Asuna's body, head and hair maps are capped at 1024 px and her armor,
eyes, teeth and the removed demo equipment at 512 px, all crunched (quality 75, normals 80; they were uncompressed 2048/1024); every
acquired effect texture is capped at 512 px and crunched at quality 70 (`CarrotLicensedFxImporter.CompressSourceTextures`).

`CarrotBuild.WriteReport` now writes the packed-asset breakdown of every QA and release build to
`output/carrot-build-report-{qa|release}.txt` and logs `CARROT_DATA` lines. Packed (pre-gzip) sizes of the current QA build:

| Source | MiB |
|---|---|
| `Resources/Carrot/Models/Source` (144 FBX: towers, creatures, bosses) | 42.9 |
| `Licensed/Asuna` (mesh with 76 blend shapes 7.3, textures) | 11.1 |
| URP package textures | 2.8 |
| `Resources/Carrot/AsunaRuntime` (clips) | 1.8 |
| `Private/CarrotLicensedVFX` | 1.7 |
| `Resources/Carrot/Audio` | 1.6 |
| everything else | < 1.4 each |

By type: meshes 45.2 MiB, textures 12.0, animation clips 6.0. Meshes now dominate; the next saving is mesh compression on the model
importers (characters stream: `CarrotModels.cs`), not textures.

## Lighting and exposure

* **Grade fix.** `Volume.profile` instantiates a private copy of the shared profile on first access and then ignores every later
  `sharedProfile` assignment. The view read `grade.profile` on every level build, so from the second level of a session on, every map
  used the first map's grade (exposure, contrast, saturation, colour filter). `CarrotView.AssignGrade` destroys the copy before the
  biome's profile is assigned.
* **Exposure band.** Per-level exposure on the live grade (`CarrotWorldLighting.LevelExposure`), a 1.45x moon and 1.35x sky for
  the night biomes (marsh, the zombie, eyeball and portal arenas), frost terrain albedo capped at 0.72 (the snow read as a glare),
  fill at most a third of the key (key-to-fill at least 3:1), a dedicated `prism` grade (level 29 used the garden grade), bloom
  clamp 4 on every grade and a marsh bloom threshold of 1.1.
* **Atmosphere.** A few very large, very faint lit fog cards drift low over the marsh, frost, zombie and eyeball maps on High (10)
  and Medium (7), alpha 0.04-0.045. A first pass at twice that alpha (and over the portal void) veiled the paths to 1.84-1.92:1, so
  it was halved and the portal dropped. Off on Low.
* **Ground bounce and shadows.** `_CarrotGroundColor` (soil albedo lit by the key) and `_CarrotBounce` per biome for the characters
  stream's Storybook surface; shadow distance tied to the fitted camera distance (`fitDistance + 14`, prism `+26`).

Ready-frame mean relative luminance (HUD hidden, `scripts/carrot-qa/capture.mjs`, Chromium, 1440x900, tier forced):

| | Shipped build (High) | World build High | Medium | Low |
|---|---|---|---|---|
| Darkest level | 0.0086 (L26 zombie) | 0.090 | 0.091 | 0.088 |
| Brightest level | 0.595 (L9 frost) | 0.158 | 0.159 | 0.169 |
| Brightest / darkest | 69x | 1.76x | 1.75x | 1.93x |
| Levels inside 0.08-0.25 | 6 of 16 sampled | 29 of 29 | 29 of 29 | 29 of 29 |

(The shipped column was captured after loading level 1 first, so it includes the grade bug above.)

## Readability

* **Ponds** (marsh). The grey-white blocky water was the daytime environment cubemap reflected into night water plus hash-cell value
  noise in the foam. `Carrot/Water` now reflects the biome's own sky colours, takes its ripple normal and foam cells from a self-made
  256 px tile, and limits foam to a shore band from the pond mesh's vertex colour (normalized distance to the bank; the band is
  0.36 of the 1.6 u radius, under 0.6 u). Without a depth copy the shore mask sets the depth (never below 0.3).
* **Lanes.** Dashed emissive edge lines in the biome accent on every map (the Portal level's inlay style), lane albedo up and ground
  albedo and ground-cover brightness down. Path-to-ground contrast at projected route samples (`QaDump` route and ground points,
  1.15 u to the side, WCAG contrast of mean relative luminance): see validation.md for the per-level table.
* **Spawn gates.** The moss arch now spans the lane, faces along its first leg and frames an aperture disc in the biome accent
  (`Carrot/PortalAperture`); marsh and arena gates light the lane.
* **Route pulses.** A threat-pink line travels each announced lane in 1.6 s and fades in 0.4 s: dashed for air, solid for ground (a
  shape twin, so colour is never the only cue). It listens for the balance contract's `waveIncoming` (target = route); until that
  event exists it pulses every lane at each wave start. Reduced motion shows the whole lane at once and fades it.
* **Decor clearance.** Props keep 1.0 u plus half their footprint from every route centreline (`PropFree`); every placement is
  logged (`decorLog`) and `QaDump` reports the smallest clearance.
* **Blindness.** The overlay never exceeds 0.85 alpha inside a 1.0 vignette ring; eye glints on every visible creature and soft pools
  on lantern-lit pads draw after the overlay; world HP bars stay at 60% opacity over it.
* **Lane spread.** Ordinary creatures walk up to 0.15 u to either side of the lane (hashed from the id, eased through corners);
  shots and impacts aim at the drawn body.
* **World HP bars** (`CarrotWorldBars`, `Carrot/WorldBar`): one screen-space mesh per frame, 5 px tall at 1440x900 and scaled with
  the canvas, shown only on hurt or selected ordinary creatures, damage trail (500 ms hold, 300 ms drain), -45 degree shield hatch,
  overlap culling that keeps the most-hurt bar, hidden in won and lost. Bosses and minibosses keep the page's bars.
  `CarrotWorldBars.Active` is the flag the balance stream's snapshot `caps` should report as `worldBars`, so the page can drop its
  DOM monster bars.
* **Contact shadows** of every actor are one dynamic mesh and one draw (they were one renderer each).

## Effect hierarchy

| Event | Presentation (importance per the research spec) |
|---|---|
| Routine shot / impact | Unchanged size; at least four layers per plant family (QA probe); 40% dimmer while a boss windup is live; no shake, no hit-stop; decals only for mortar, dragonfruit, meteor and thunder. |
| Kill | 1.6x core flash, spark crown, one lit smoke puff, coin burst. |
| Elite kill | Larger pop, shockwave ring, ground pool, light kick (High), 0.10 trauma. |
| Carrot bite | 0.20 trauma (no FOV punch: an FOV change moves pads under a finger). |
| Super forged | 0.32 s converge while the ghost flies in, 50 ms white core, shockwave, petals, 2 degree FOV punch, 80 ms pause, 1 s aura toward #AA88FF, 0.25 trauma. |
| Boss telegraph | Threat frame: outer #FF66AA rim pulsing at 2 Hz between 0.4 and 0.9, inward chevrons, 30% fill in the ability hue; the same rim on every targeted tower. |
| Boss phase break | Shard shockwave, 100 ms pause, 0.35 trauma. |
| Boss death | Radial burst, shockwave, coin shower, 0.6 s at 0.3 speed, 0.5 trauma (campaign guardians had only the generic death). |

Super forged also raises a 7.5 u light pillar over the new tower and keeps a slow aura ring while the beat plays.

Colour separation: boss, miniboss and creature effect colours take the nearest in-gamut colour that is at least 0.095 (OKLab) from
all 20 tower colours (`CarrotEffects.Separated`: a 12^3 sRGB grid then a 9^3 refinement, lightness changes weighted 1.5x and lost
chroma 2x, cached per kind). The first version pushed the colour in OKLab and clamped back to sRGB, which for vivid reds and cyans put
it straight back on the tower colour: the in-build probe read 0.039 (Ember Charge, the Chili tower's red). Now the probe's minimum
over the 48 boss and miniboss abilities is 0.095 (Mist); frost casts read teal, ember casts hot pink-red, chrono casts lemon. The
offline port of both algorithms (scratchpad `world/tools/tone-sep.mjs`) reproduces the in-build 0.039 and checks 83 kinds.

## Governors

* **Flash** (`CarrotFlashGovernor`): at most three large-luminance events per rolling real second (scene-lighting point lights of
  intensity 6+, glows of 2.5 u+, sky flashes, the Super core, boss deaths). Over budget a light extends the brightest live light
  instead of starting a new one, and a glow draws at a quarter alpha. Lights never pulse. A Thunderhead strike asks for one slot for
  its sky flash and its single 0.12 s light; without a slot it keeps only the bolt pair, the crack and the small ground pool.
* **Shake**: trauma model (shake = trauma squared, trauma decays 1.0 per second, roll at most 1.5 degrees, translation at most 0.6%
  of the screen height), applied after the Cinemachine brain. None for 150 ms after a pointer goes down, while a pointer is held,
  while a pad is selected or a merge is armed or dragged. Routine events add none.
* **Hit-stop and slow motion** (`CarrotView.BeatTime`): only the Super forge, a phase break, a boss death and the boss entrance; two
  stops at least 2 s apart. Each request also goes to `CarrotGame.RequestTimeScale(scale, realSeconds, reason)` (the balance stream's
  contract), resolved by reflection so the view compiles before and after that merge; `QaDump` reports `timeScaleApi=1` once it exists.
  On this branch alone the slow-down is presentation-only, as it was before.
* **Reduced motion** (the OS setting or the page's `SetReducedMotion '1'`): no trauma, hit-stop, slow motion, FOV punch, boss hero
  shot, level reveal, victory orbit or defeat push; the boss entrance keeps its dust, roar and ring on the clock.

## Camera (`CarrotCameraRig`)

Wheel and pinch zoom toward the cursor or pinch centre; panning works while paused (the brain runs on real time when the game is
paused); the pan clamp is the route and pad bounds plus 3 u (full reach from zoom 1.45); `FocusBoss()` frames the boss and the next
8 u of its lane until the player pans, zooms or recentres; `Recenter()`; `SetSafeArea(json)` nudges the camera once (damped) so the
selected pad stays outside the page's HUD and panel rectangles, and recentres when they close at the fitted zoom. No automatic camera
move happens while a pointer is down or a pad, tower or merge is active: the boss hero shot then plays as a quiet beat. The canvas
refuses browser pinch, gesture and double-tap zoom (`Carrot_SetupCanvasGestures`).

## Frame-time governor

The display period is the page's rAF sample refined by the median of 2 s windows, snapped to 144/120/90/60/30 Hz. A faster period is
adopted only after three agreeing windows, and a slower steady one only when it is a standard period and work is under half of it
(the shipped p10 latch read one fast early sample as a 120 Hz panel and paced a 60 Hz WebKit display to 30 fps). The 2-frame pacer
runs only on a confirmed 8.33 ms panel. At most one tier change per 120 s, no promotion within 60 s of a demotion; desktop WebKit
stops at Medium. Bloom on Medium and Low uses Dual filtering at quarter resolution (WebKit Medium idle: 28-33 fps before, 60 after).

## Prism stage (level 29)

The seven sub-pixel inlay strips on each runway and chassis edge (the moire) are one mip-mapped, anisotropic (8) spectrum strip each
(procedural 4x64 texture, trilinear); self-made crystal clusters (hexagonal prisms with pyramid tips) dress the beds, the far edge and
the distant gardens; the landscape camera looks along a 24 degree diagonal at 44 degrees, so the 40 u runway fills the frame.

## Provenance (self-made, generated at load)

| Texture | Generator | Parameters |
|---|---|---|
| Water ripple/foam tile, 256 px RGBA | `CarrotWorldDressing.WaterTile` | periodic gradient noise, periods 8 and 16 cells (weights .65/.35, seeds 1729 and 1931); Worley foam cells, 64 jittered points (seed 1729), foam = clamp((second - nearest) x 9) |
| Prism spectrum bands, 4x64 | `CarrotPrismView.SpectrumMaterial` | seven bands of `CarrotEffects.Spectrum(i/7)`, 18% soft band edges |
| Route pulse dashes, 16x4 | `CarrotWorldDressing.BuildRoutePulses` | 9 px on, 7 px off |

No image model, no external texture.

## QA harness (`scripts/carrot-qa`)

| Script | What it checks |
|---|---|
| `serve.mjs` | static server in the Pages model; maps `/unity/carrot/` to a chosen build |
| `capture.mjs` | ready frames, mean luminance, path contrast, visible idle effect renderers |
| `flash.mjs` | WCAG 2.3.1 sampler on the composited canvas (8x5 cells, general transitions over 11% of the frame) |
| `perf.mjs` | rAF cadence, rendered fps, draws and triangles over scripted combat; the governor log |
| `camera.mjs` | zoom-to-cursor drift, paused pan, route-start reach, Asuna follow-cam size, reduced-motion counters |
| `showcase.mjs` | deterministic frame bursts of the signature moments |
| `load.mjs` | cold-cache load over an emulated link: bytes and Continue-to-playable time |
| `unity.mjs`, `cs-check.mjs` | serialized Unity runs on this checkout and a 1-2 s Roslyn compile check |
