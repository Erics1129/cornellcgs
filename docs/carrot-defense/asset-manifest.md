# Carrot Defense — production asset manifest

Inventory inspected 12 October 2026. This records files present in the current Unity project; it is not a declaration of finished cinematic fidelity or browser performance. The latest WebGL integration is being visually tested.

## Exported model inventory

**52 model alternatives: 40 tower tiers, eight ordinary creatures, three bosses and one carrot.** These are real exported meshes. The 478,390-triangle total is the sum of every alternative in the library, not one rendered frame. Towers/carrot use articulated transforms and procedural motion; `animated:false` in their export manifest means no baked skeletal clips, not that the game never moves them.

Runtime resource prefix: `Carrot/Models/`. Source FBXs: `unity/CarrotDefense/Assets/Resources/Carrot/Models/Source/`. Finished prefabs: `Towers/`, `Enemies/`, `Bosses/`, and `Carrot.prefab`.

### All 40 tower forms

Every row contains four separately exported meshes and four prefabs. Tier changes include physical geometry, rather than color alone. Triangle and mesh-object counts below are from the authoring export, before Unity submesh/shadow-pass accounting.

| Family | Tier 1 tris / meshes | Tier 2 | Tier 3 | Tier 4 | Physical differences |
|---|---:|---:|---:|---:|---|
| `seed` | 8,424 / 8 | 8,880 / 8 | 10,688 / 8 | 12,976 / 9 | Wood-and-iron carriage, hollow bore, recoil hardware; one → two → three barrels, gear covers and crown. |
| `frost` | 4,980 / 7 | 5,420 / 7 | 6,440 / 8 | 8,036 / 9 | Fractured stone and ice bed; more curved ice petals, satellites, two physical halo forms. |
| `mortar` | 2,998 / 4 | 3,662 / 4 | 4,186 / 5 | 4,570 / 6 | Masonry cradle and clay berm; handles, loaded shell/fuse, lobed metal vessel and fins. |
| `prism` | 4,408 / 5 | 4,590 / 6 | 5,316 / 7 | 6,158 / 8 | Rock-and-crystal footing; additional prongs, minor crystals, halo and faceted crown. |
| `storm` | 2,896 / 6 | 4,516 / 10 | 4,552 / 11 | 4,700 / 12 | Stone and porcelain anchors; one → three bells, copper coil, sky crystal and branching conductors. |
| `blossom` | 8,436 / 8 | 10,154 / 8 | 11,008 / 8 | 14,478 / 9 | Living soil-and-leaf nest; one → three petal layers, veined leaves, pollen and side flowers. |
| `starfruit` | 6,812 / 8 | 7,500 / 9 | 7,824 / 9 | 8,512 / 10 | Botanical nest; ridged volumetric fruit, increasing satellites, leaves and two orbit structures. |
| `gravity` | 3,812 / 7 | 4,592 / 8 | 5,516 / 10 | 6,856 / 12 | Dark stone supports; increasing accretion rings, void anchors and orbiting debris. |
| `book` | 2,356 / 8 | 2,932 / 9 | 3,632 / 10 | 4,004 / 11 | Octagonal lectern; curved layered pages, rune detail, candles, circle and floating pages. |
| `thunder` | 8,516 / 5 | 9,050 / 5 | 10,018 / 6 | 10,568 / 6 | Stone and porcelain anchors; fused cloud volume, more rods, capacitors, conductive halo and fins. |

Resource names are `Carrot/Models/Towers/{family}-{1..4}`. Mesh parts preserve Turret, Barrel, Core, Petals, Pages, Muzzle, rings and bells where present. Runtime animation is aim/recoil/rotation/leaf and page motion; the generated three-pose sheets are not baked into three-frame flipbook characters.

### Eight creatures and three bosses

| Kind | Visible form | CC0 animation/mesh basis | Triangles | Mesh objects | Source clips |
|---|---|---|---:|---:|---:|
| `nibble` | Mushroom-bodied walker | Mushnub | 2,280 | 1 | 9 |
| `dash` | Leaf-costumed rabbit runner | Bunny | 8,870 | 3 | 14 |
| `shell` | Acorn-armored spider/beetle silhouette | Spider | 3,604 | 1 | 5 |
| `swarm` | Small green blob | Green Blob | 2,000 | 1 | 9 |
| `moth` | Lantern-carrying winged creature | Armabee | 3,528 | 2 | 8 |
| `shaman` | Mushroom caster with staff/lantern | Mushroom King | 6,052 | 4 | 14 |
| `burrow` | Small furred digging creature | Yeti | 3,480 | 2 | 9 |
| `crystal` | Spiked crystal blob/quadruped | Spiky Blob | 4,924 | 2 | 9 |
| `garden` | Brambleback: crooked bark trunk, root arms, face plates, antlers and stone shoulders | Mushroom King rig only | 43,788 | 4 | 14 |
| `marsh` | Lantern Regent: mantle, eight curled tentacles with suckers, crown and lantern cages | Squidle rig only | 48,400 | 4 | 8 |
| `frost` | Crown of Winter: muscular yeti form, overlapping fur locks, horns and ice crown | Mushroom King rig only | 63,436 | 3 | 14 |

Ordinary creatures adapt Quaternius geometry with original costumes/details. All three boss bodies are original visible meshes bound to existing licensed skeletons; the original visible boss-base bodies were removed. Source rig actions are retained, not represented as newly authored cinematic animation. `fragment` reuses the crystal creature at smaller scale, so it is not counted as a ninth unique mob.

Carrot: **23,056 triangles / 16 mesh objects**, with modeled eyes, pupils/catchlights, brows, limbs, thick leaf blades, skin creases, root hairs, three mouth states and a separate bite patch. Eye/limb/leaf movement and facial-state changes are driven by the view code. No skeletal facial rig or simulated flesh/fur is present.

### Ten Super forms (tier 5) and three challenge bosses (branch carrot-boss)

Super forms are real fifth meshes exported by `Tools/build_carrot_models.py -- super` (manifest merged into `original-model-manifest.json`, now 51 entries). Every kind-5 carries the shared Super kit (gold `SuperPlinth`, `SuperHalo` ring on a new `Ring03` pivot, three `SuperGem` crystals, seven `CrownSpike` leaves, the whole model scaled x1.12) plus a per-kind flourish, and stays within 1.35x its kind-4 triangle count. `SuperGlow` is a new vertex-colour emissive surface (`Models/Materials/SuperGlow.mat`, emission white x2.8, `_SuperPulse` 1) whose detail map `SuperGlowDetail.png` is a 256 px tileable value-noise image written by `Tools/generate_super_glow_detail.py`, not a generated picture.

| Super form | Tier 4 tris | Tier 5 tris (budget) | Unity height tier 4 -> 5 | Flourish |
|---|---:|---:|---|---|
| `seed-5` Harvest Cannon | 12,976 | 16,220 (17,517) | 1.33 -> 1.96 | Four barrels on a wide saddle. |
| `frost-5` Glacier Bloom | 8,036 | 10,724 (10,848) | 1.30 -> 2.16 | Fourteen ice petals and a third tilted ice orbit with pearls. |
| `mortar-5` Pumpkin Howitzer | 4,570 | 5,758 (6,169) | 1.20 -> 2.00 | Six pumpkin fins around the lobed gold vessel. |
| `prism-5` Sunfocus Crystal | 6,158 | 7,968 (8,313) | 1.55 -> 2.39 | A second prism stacked above the first and a rune halo on `Ring02`. |
| `storm-5` Tempest Bell | 4,700 | 5,692 (6,345) | 1.55 -> 2.13 | Five bells (`Bell01..05`) between conductive antlers. |
| `blossom-5` Solar Blossom | 14,478 | 18,592 (19,545) | 1.17 -> 1.94 | Four petal rings. |
| `starfruit-5` Constellation | 8,512 | 10,056 (11,491) | 1.44 -> 2.00 | Seven orbit stars and the second orbit ring. |
| `gravity-5` Event Horizon | 6,856 | 8,952 (9,255) | 1.54 -> 2.18 | Six accretion rings and eleven orbiting debris stones. |
| `book-5` Grimoire | 4,004 | 5,328 (5,405) | 1.39 -> 2.02 | Three floating pages, a third candle and a rune circle on `Ring02`. |
| `thunder-5` Stormcrown | 10,568 | 12,404 (14,266) | 1.52 -> 2.09 | Five lightning rods and six storm fins. |

Heights are the `MODEL_BOUNDS` sizes logged by `CarrotBuild.Prepare` (metres, Unity Y). Prefabs: `Carrot/Models/Towers/{kind}-5`; when a `-5` FBX is missing, Prepare logs a warning and the view falls back to tier 4.

| Challenge boss | Build | Triangles (budget) | Named parts for the view | Clips |
|---|---|---:|---|---|
| `tornado` Giant Tornado (level 25) | Non-animated prop, `build_carrot_models.py -- challenge` | 9,064 (14,000) | `FunnelTier0..4` lathed hollow-mouthed frusta with a slate-to-pale vertex gradient, `DebrisRing0..2` with planks, pebbles, torn leaves and a gold pumpkin, two amber `StormEye` glows, a dark maw, 12 `LightningVein` tubes | none (spun and bobbed by the view) |
| `zombie` Gravewalker Zombie (level 26) | Mushroom King rig (CC0) with original sculpt `sculpt_challenge_bosses.py`, `build_carrot_characters.py -- zombie` | 18,292 (30,000) | `LivingTrunk`, two `TwistedArm`s with `GraspingRoot` fingers, one `HangingArm`, `LegMuscle`s, a fused and decimated pumpkin `SkullHead` with glowing green sockets, `RibPlate`s, `BurlapPanel` rags with straw tufts, a shoulder crow | 14 source clips incl. Walk, Punch, Death, HitReact |
| `eyeball` The Unknown Eyeball (level 27) | Non-animated prop, `build_carrot_models.py -- challenge` | 7,016 (16,000) | `Sclera`, `Iris` (crimson Glow dish) and `Pupil` on their own pivots, 8 `IrisFold`s, 14 `Vein`s, `UpperLid`/`LowerLid` shells, `Tentacle0..5` thorned vines, 3 trailing `NerveStalk`s | none (hovered, blinked and swung by the view) |

Prop counts are recorded in `Tools/challenge-prop-manifest.json`; the zombie row is the 13th entry of `character-model-manifest.json`. Prefabs: `Carrot/Models/Bosses/{tornado,zombie,eyeball}`. Honesty note: the ChatGPT plates `26-super-forms.jpg`, `27-super-emblems.png` (imported as `Textures/SuperEmblems.png`, the decal sprite under Super towers) and the boss sheets `35`-`37` are 2D paintings and sprite sheets used as look references and as flat surface/decal detail; they are not 3D models and the meshes above do not reproduce them.

Review plates: `docs/carrot-defense/screenshots/model-review-super.png` (each kind-4 beside its kind-5) and `model-review-challenge-bosses.png` (the three bosses at the game camera's 34 degree pitch), both rendered by `Tools/render_model_review.py -- super|challenge` from the exported FBX files with preview materials; they are Blender renders, not Unity frames.

### Geometry and rig limits relevant to fidelity

- The models remain stylized real-time forms. The generated reference sheets show richer anatomy, material transitions and detail than the implemented assets; matching visual quality has not been demonstrated.
- Bodies use a mixture of swept surfaces, remeshed anatomical masses, layered bark/fur parts and decimation. Some attachments and intersections remain visible at close range. White fur uses polygonal locks and an albedo texture, not strand grooming or cloth simulation.
- Bosses reuse existing bone layouts and clips. Added details are rigidly bound or blended to nearby bones, rather than a bespoke deformation/corrective-shape rig. Octopus tentacles do not each have a dedicated long skeletal chain; complex curling is limited.
- Tower pages/petals and mouths are discrete parts. Motion is procedural articulation, not a full authored anticipation/contact/recovery animation for every tier.
- The shader supports normal, roughness and occlusion maps plus environment reflections. Biological color is generated albedo, now supplemented by original analytic normal/roughness maps; these are authored approximations, not captured PBR scans. Ice/lantern glow does not provide offline-quality refraction, volumetric scattering or global illumination.
- Export counts are not draw-call or mobile-performance measurements. Dense bosses (43.8k–63.4k triangles), simultaneous enemies, many tower parts, alpha vegetation and transparent effects must be profiled on actual browser/device hardware. No fixed frame-rate guarantee is made.

## Generated artwork and material assets

Twenty-two numbered plates are present under the preproduction `art/` directory. They are generated visual-development artwork and illustrative pose studies, not screenshots of the Unity game. Plate 22 supersedes plate 13 for current menacing boss art direction.

| Files | Coverage and role |
|---|---|
| `01-garden-keyart`, `03-marsh-keyart`, `04-frost-keyart` | Three world/lighting/composition references. Playable terrain is real geometry. |
| `02-carrot-animation` | Twelve illustrated expression/action studies. |
| `05-seed` through `10-blossom`, `18-starfruit`, `19-gravity`, `20-book`, `21-thunder` | Ten four-tier tower sheets; twelve pose studies per sheet. Actual tier meshes are inventoried above. |
| `11-monsters-garden`, `12-monsters-advanced` | Eight creature families, four illustrative poses per family. |
| `13-boss-abilities` | Earlier boss direction, retained as historical preproduction. |
| `22-bosses-menacing` | Current boss direction: three bosses × four ability/impact studies. |
| `14-build-menu-concept`, `15-modern-ui` | Interface reference images; they are not the live UI. |
| `16-material-atlas` | Six generated material swatches, also imported as MaterialAtlas.png and processed into neutral surface detail. |
| `17-vfx-sheet` | Sixteen effect study cells, imported as VfxAtlas.png for effect textures. |

Four additional generated biological surface images are copied to `Textures/PBR/CarrotAlbedo.png`, `LeafAlbedo.png`, `FurAlbedo.png`, and `ScaleAlbedo.png`. Their preproduction originals are `art/carrot-albedo.png`, `leaf-albedo.png`, `fur-albedo.png`, `scale-albedo.png`; generation prompts are in `art/biological-texture-prompts.json`. Material/character prompt records are in `root-image-prompts.json` and `monster-animation-prompts.json`. They were generated for this project and are not attributed to CC0 scan authors. Eight additional original technical maps (`Models/Materials/{Carrot,Leaf,Fur,Scale}MicroNormal.png` and `MicroRoughness.png`) supply shallow growth creases/pores, vein relief, directional fiber relief, and soft pebbled hide. These 512px maps are deterministically authored by `Tools/bake_biological_relief.py`, not inferred from painted lighting. Normal maps use OpenGL Y+; roughness is linear. Per-file hashes and ranges are in `Models/Materials/biological-relief-provenance.json`.

The numbered plates contain **204 illustrated pose/sequence cells** when both the archived and replacement boss sheets are counted (120 tower +32 creature +12 carrot +24 boss +16 effect cells). This is a reference coverage count, not 204 runtime animation clips.

## Environmental meshes and scanned surfaces

Kenney Nature Kit contributes ten selected CC0 meshes: TreeOak, TreeAutumn, TreePine, Rock, RockTall, Pebble, FlowerWhite, FlowerPurple, Bridge and Stump. Each has a finished `Carrot/Nature/{name}` prefab; original atlas colors were sampled into vertex colors. These are stylized supporting assets, separate from the scanned set below.

Five finished `Carrot/RealNature/{name}` props come from four Poly Haven model sources:

| Resource | Source | Exported triangles | Small LOD | Shadow caster | Materials |
|---|---|---:|---:|---:|---:|
| `Fern` | `fern_02` / `fern_02_b` | 2,384 | 1,479 | 480 | 1 |
| `Stump` | `tree_stump_01` / `tree_stump_01` | 7,970 | 2,480 | 480 | 1 |
| `MossRockA` | `rock_moss_set_01` / `rock_moss_set_01_rock04` | 6,970 | 1,479 | 479 | 1 |
| `MossRockB` | `rock_moss_set_01` / `rock_moss_set_01_rock03` | 5,000 | 1,480 | 480 | 1 |
| `Shrub` | `shrub_02` / `shrub_02_a+shrub_02_b+shrub_02_d` | 18,020 | 3,979 | 780 | 1 |

The Small LOD and shadow-caster columns are the Blender collapse decimations from `Tools/decimate_carrot_scans.py` (`<Name>Small.fbx`, `<Name>Caster.fbx`, counts in `RealNature/lod-provenance.json`). A level places the full scan only on its eight hero anchors (plus the hero shrubs and the frost border rocks); the roughly one hundred other placements at 18-40 px on screen use the `<Name>Small` prefab, whose visible mesh casts no shadow and carries a shadows-only child built from the caster mesh. The decoration combiner batches these per material and shadow mode.

Scanned props use 1K source albedo/normal/roughness/occlusion (imported at 512 px, 256 px for occlusion and roughness: at 46-97 px per world unit the 1024 mip was never sampled) and foliage opacity where supplied. Stump and one rock were decimated with UVs preserved; the shrub combines three source variants. Meshes remain readable for runtime environment combining. Nature preview images were rendered from the exported assets in Blender, not copied from source websites.

Separate Poly Haven CC0 material sets: Forest Ground 04 → Soil, Lichen Rock → Stone, Bark Brown 02 → Bark, Metal Plate → Metal, and Forest Grove HDRI → Environment. See `Textures/PBR-provenance.json` for official URLs/checksums.

## Audio and provenance

Four distinct CC0 compositions are imported: Joth’s Fantasy Orchestral Theme (exploration), CodeManu’s A Legend Will Rise (garden boss), Emma_MA’s Determined Pursuit (marsh boss), and Vitalezzz’s The Ancient Legend (frost boss). These are licensed existing compositions, not an exclusive original score. Twelve selected Kenney clips provide impacts, footsteps, coins, building, book/page and knife/chop foley. Thirty-three CC0 recorded vocal excerpts from rubberduck (80 CC0 creature SFX) and Darsycho (Monster snarls) provide eight ordinary-creature Call/Hit/Attack sets and three boss Roar/Growl/Hit sets. Exact resource/source/trim/hash records are in `Audio/Licenses/creature-voices.json`, with source notice `CREATURE-VOICES.md`. Runtime synthesized stingers are separate original procedural audio.

Canonical source and license record: `unity/CarrotDefense/ASSET-CREDITS.md`; public copy: `public/assets/minigames/carrot/credits.txt`. Per-file evidence is preserved in Models/Licenses, Audio/Licenses and Audio/provenance.json, Nature/License-Kenney.txt, Nature/provenance.json, RealNature/LICENSE.md and its three provenance JSON files, and Textures/PBR-provenance.json. Quaternius records explicitly identify Quaternius, not Poly by Google. Research-only downloaded alternatives are not credited as used runtime models.

## What each image proves

- Numbered plates and biological images: generated references/surface assets. They establish art direction or supply texture color, not functioning 3D animation.
- `model-review-bosses.png`: Blender rendering of actual revised exported boss geometry with preview PBR materials. It is not a Unity frame.
- `model-review-towers.png`: actual exported tower geometry review; the saved image predates the preview script’s corrected biological albedo routing, so pale plant/carrot colors in that image are not authoritative runtime materials.
- `model-review-priority.png`, `model-review-creatures.png`: earlier modeling checkpoints, retained for comparison; they are not claims of the final runtime appearance.
- `model-review-scanned-nature.png`: four-prop Blender asset review (fern, stump, two rocks). `model-review-shrub.png` covers the fifth scanned prop separately.
- `model-relief-before.png` and `model-relief-after.png`: controlled Blender render of the same carrot, blossom, frost boss and marsh boss before/after biological normal/roughness maps. Geometry, camera and lighting are identical; the effect is deliberately subtle. This is not a live runtime comparison.
- The six Blender plates above (`model-review-{bosses,towers,priority,creatures}.png`, `model-relief-{before,after}.png`) moved from `public/assets/minigames/carrot/` to `docs/carrot-defense/screenshots/legacy/` in the giant update: no page referenced them, and they shipped about 9 MB to GitHub Pages.
- Giant-update review sheets (`docs/carrot-defense/screenshots/giant-update/`) are Unity frames of the real scene rendered by `CarrotCharacterStudio` (editor play mode, URP, the shipped materials), not Blender previews: `facing-before-after.jpg`, `models-before-after.jpg`, `portraits-vs-game.jpg`, `tornado-v2.jpg`, `walk-strips.jpg`, `mesh-lod-levels.jpg`, `detail-normals.jpg`. See `giant-update/characters.md`.
- Only captures explicitly identified as Unity/WebGL runtime screenshots establish the rendered game state. Runtime screenshots are being reviewed separately; no reference art is relabeled as gameplay.

## 3D upgrade assets (branch carrot-3d-upgrade, all generated in-repo)

Every asset below is written by `Assets/Editor/CarrotBuild.Prepare` from code; none is third-party, so no new licence applies.

- `Assets/Resources/Carrot/Textures/VfxSheet.png` (1024 px, 8x8 cells of 128 px, crunched DXT5 q90): the only effect texture. Cells 0-7 glows, stars, rings, shockwave band and hex flake; 8-23 a 16-frame smoke flipbook; 24-31 spark streaks; 32-39 ember frames; 40-47 debris silhouettes (bark, pebble, leaf, petal, husk, ice shard, acorn cap, page); 48-55 ground residues (scorch, crater, ice, pollen, crack web, mud, frost web, void); 56-63 glyphs (bolt, clock, star, chevron, warning, root curl, note, coin). Written by `CarrotVfxSheet.cs`; the former `VfxAtlas.png` is deleted at Prepare.
- `Assets/Resources/Carrot/Settings/CarrotURP-High.asset`, `CarrotURP-Low.asset` and their renderer data (`CarrotPipeline.cs`): the two quality tiers; High carries the SSAO and `Height fog` renderer features; `HeightFog.mat` is the fullscreen material for `Assets/Shaders/HeightFog.shader`.
- `Assets/Resources/Carrot/Volumes/{garden,marsh,frost}.asset`: per-biome post-processing profiles (ACES, bloom, colour adjustments, vignette, Gaussian depth of field, shadows/midtones/highlights).
- `Assets/Resources/Carrot/Cinematics/BossEntrance.playable` plus `bossDust.signal`, `bossRoar.signal`, `bossRing.signal` (`CarrotCinematicsAuthoring.cs`): the Timeline boss-entrance beat.
- Runtime-generated, not on disk: the canopy light cookie (128 px tileable noise), spline trail meshes and pebble placements, spline tubes for root snares and the rewind ribbon, ring/annulus and decal quad meshes.
- Runtime-generated border dressing (fix round): low-poly trees (cylinder trunk, sphere canopy blobs; three-tier snow pines in frost), the garden fence posts and rails, fallen logs, the flat glow-disc mesh and the per-shell glow quads. All are `CarrotMeshes` primitives with `Carrot/Storybook` or `Carrot/FxAdditive` materials; no new third-party assets. The Kenney `TreeOak`/`TreeAutumn`/`TreePine` prefabs remain available but unused.
- `VfxSheet.png` cell 60 (warning glyph) is now a filled badge; `CarrotVfxSheet.Prepare` rejects any outline-only glyph cell.
- Not produced: per-biome baked reflection cubemaps (the existing `Environment.hdr` cubemap is still the reflection source) and Blender LOD1 meshes for the scanned props.

Add-on packages (local tarballs from the editor's PackageManager folder, referenced by path in `Packages/manifest.json`): URP 17.3.0 and Shader Graph 17.3.0 (built in), Cinemachine 2.10.7, Timeline 1.8.12, Animation Rigging 1.4.1 with Burst 1.8.29, Collections 2.6.6, Splines 2.8.4 with Mathematics 1.3.3 and Settings Manager 2.1.1, plus the built-in Wind and Director modules.

## Reproducibility

Authoring sources: `Tools/build_carrot_models.py`, `sculpt_carrot_details.py`, `sculpt_challenge_bosses.py`, `build_carrot_characters.py`, `build_carrot_nature.py`, `generate_super_glow_detail.py`. Import/prefab creation: `Assets/Editor/CarrotModels.cs`. Exact model counts and source clip names: `Tools/original-model-manifest.json` and `Tools/character-model-manifest.json`. The authoring files and original licensed source records are preserved. Current axis handling bakes import conversion and keeps an identity outer prefab plus preserved native animation hierarchy. Artist-authored tower/carrot fronts map to Unity -Z; facing in View must account for that.

Generated material settings and Blender preview lighting are not interchangeable with the live Unity shader/camera. Final visual approval requires runtime review of combat, a boss encounter, carrot contact, upgraded towers, touch controls and sound.
