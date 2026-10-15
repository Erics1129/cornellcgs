# Living miniatures: characters, towers and nature

This is the record for the `characters` stream of the Neon Harvest update. It holds the contracts other streams build against, what changed and why, how each change was checked, and what is left for other streams.

Every image cited here is a Unity frame of the real scene or a prefab. They come from `CarrotCharacterStudio` in editor play mode, with URP, the shipped materials and post-processing, at 1440×900 or the stated size. None is a Blender preview. The review sheets are in `docs/carrot-defense/screenshots/giant-update/`.

## 1. T0 surface contract (Storybook)

`Carrot/Storybook` gained the material properties below. At their default values they add nothing, so an untouched material renders as it did before.

| Property | Range / default | Meaning |
|---|---|---|
| `_Subsurface` | 0-0.6, 0 | Wrap-diffuse width. Only the light gained past the Lambert terminator is added, tinted by `_SubsurfaceTint`. |
| `_SubsurfaceTint` | colour, white | Colour of the scattered terminator light (warm for skin, blue for ice). |
| `_Sheen` | 0-1, 0 | Charlie fuzz sheen (Estevez and Kulla 2017, with Neubelt visibility), for both direct and ambient light. |
| `_SheenTint` | colour, white | Sheen colour. |
| `_DetailNormal` | 2D, "bump" | Tangent-space detail normal, whiteout-blended over `_BumpMap` in the UV path. |
| `_DetailScale` | float, 6 | UV multiplier for the detail map, relative to the `_MainTex` tiling. |
| `_DetailStrength` | 0-2, 0 | Detail normal strength. At 0 the texture is not sampled. |
| `_HitFlash` | 0-1, 0 | Additive warm-white emissive. World drives it per renderer through a property block for 60 ms. |
| `_RimBoost` | 0-1, 0 | Cool silhouette rim for night biomes. World drives it per renderer. |

Storybook also reads two globals. Unset globals read as 0, which turns their terms off.

| Global | Meaning |
|---|---|
| `_CarrotGroundColor` (float4) | Biome floor colour, bounced onto faces that point down. |
| `_CarrotBounce` (float) | 0-1 weight for the hemispheric term: sky occlusion of downward normals plus ground bounce. |

The maths lives in `Assets/Shaders/CarrotSurface.hlsl`, which the Forward pass includes after URP `Lighting.hlsl`. The file declares the two globals under `#ifndef CARROT_GROUND_GLOBALS_DECLARED`. Any other include that declares them must define that macro first. World sets both globals in `CarrotWorldLighting` and does not redeclare them.

No `multi_compile` or `shader_feature` keyword was added.

T0 verification, from `CarrotCharacterStudio.ShaderCheck`:

- The shader has 0 errors, and the variant count is 724 both before and after the change. The keyword space is unchanged at 16 keywords. Properties went from 27 to 36.
- Forward, ShadowCaster and DepthOnly compile for GLES3x (WebGL 2) under four keyword sets that cover the Low, Medium and High tiers.
- Ready frames of L1, L13 and L24 were rendered with the old shader and with the new shader at default values. Mean CIE76 ΔE was 0.005, 0.33 and 0.42 (the gate is below 1). What remains is wind sway and ambient motes.

## 2. What changed

### Creatures walked backwards (fixed)

The eight original creatures and the five original guardians (garden, marsh, frost, orchard and zombie) were authored with their front at -Y in Blender. That imports as Unity -Z. The view, however, yaws an enemy root along +Z (the `LookRotation` of the path direction); only Portal-era actors get an extra 180 degrees. Every original creature therefore walked with its back to its direction of travel. From the 34 degree camera you saw the back of a nibble's cap, the tail of the bunny and the abdomen of the spider.

`CarrotModels.Make` now turns their Geometry 180 degrees inside the prefab (`PlusZFront`), so the prefab front is +Z. Their faces now lead (`facing-before-after.jpg`; the Portal-era mite is the unchanged control). The view's own lean and fall code had assumed +Z fronts all along: the zombie's "6 degree forward lean" now leans forward, and death falls go forward too. Boss cameras are world-angle based, so they are unaffected.

### Blended-realism surfaces

`CarrotModels.ApplyBlendedRealism` sets the T0 properties for every category. A new `ActorCategory` gives single-material actors their own surface:

| Category | Used by | Response |
|---|---|---|
| Carrot | hero skin | wrap .34, warm tint (cap .35), SkinPore detail |
| Leaf / Petal | leaves, petals | wrap .45 / .40 (leaf translucency .55 kept) |
| Fur / Pelt | frost guardian fur; bunny, mole | wrap .2, sheen .4 (cap), FurStrand detail. Pelt keeps the creature's painted colour. |
| Mushroom | nibble, shaman | gloss .45 (cap less glossy), sheen .2, MushroomPore detail |
| Chitin | spider, armabee | gloss .58, reflections .5 (dark legs stay dark), ChitinPlate detail |
| Gel | green blob | wrap .5, gloss .78, GelRipple detail |
| Ice | frost tower body, crystal creature | painted blue halved, gloss .9, reflections 1.4, wrap .5 blue, IceFacet detail |
| Eye | hero eyes | gloss .93, reflections 1.25 (wet eye highlight) |
| ZombieHide | Gravewalker Zombie | the grave-green tint baked as a texel (see Character fixes) |
| TornadoDust, TornadoShell1-4 | Giant Tornado v2 | see below |
| Foliage, Gourd, Straw | new trees and orchard props | wrap .3/.28/.15, leaf-splat breakup and detail |
| Bark, PortalChitin, PortalCap, PortalPeel, Scale, Organic | everything else | bark grain detail from the Poly Haven scan, plate detail, cap sheen, small wraps |

The detail normals are original work, baked by `Tools/bake_detail_normals.py` (`detail-normals.jpg`). They are 512 px and crunched.

### Character fixes

- **Nibble.** The eyes sat high on the stem, under the cap overhang. They are now re-seated 16% lower on the stem surface and tilted 12 degrees up toward the camera (`Tools/refine_carrot_characters.py`, called from `build_carrot_characters.py`). Weights, bones and clips are untouched. Cap occlusion of the eyes from the 34 degree camera dropped from 36.5% to 0%.
- **Shell spider.** Normals are recalculated at a 60 degree smoothing angle, so the flat-shaded abdomen became rounded chitin.
- **Giant Tornado v2.** The tornado was a stack of opaque white discs. It is now an opaque dust core (FunnelTier0) inside three nested translucent wind shells (FunnelTier1-3), with a rolled storm lip (FunnelTier4), the debris band (DebrisRing0-2), the storm face and lightning veins. The shells use `Carrot/FxAlpha` with an original wind-streak sheet and one render queue per layer. The view already counter-rotates every pivot name, so nothing changed on its side (`tornado-v2.jpg`).
- **Zombie.** Its albedo is fixed at material level (ZombieHide), so a property-block tint can no longer wash it out.
- **Carrot hero.** Wrap skin, wet eyes, a 4 s breath (+1.5% taller with a volume-preserving narrow; faster and shallower at 3 hearts or fewer), and blinks on an irregular 3-6 s rhythm with an occasional double blink.
- **Frost tower.** The body is ice: glassy and blue-scattering instead of white.

### Animation (CarrotViewActors.cs)

- Clips, `AnimationState` arrays and gait data are cached per Animation. Animate, the carrot face and the carrot limbs allocate nothing per frame: 0 bytes per 100 passes over 104 live actors, measured with `GC.GetAllocatedBytesForCurrentThread`.
- **Stride sync.** `CarrotGait` (new) stores each prefab's walk and run ground speed at 1x. CarrotModels measures it from a bind-pose tip point on every foot or leg bone, sampled across the clip. Playback is world ground speed divided by measured clip speed, using walk or run, whichever needs a rate closer to 1x (with a 0.15 hysteresis).
  - The rate is clamped to 0.2-3x, not 0.6-1.6x. The measured strides put small skitterers near 3x (mite) and slow guardians near 0.2x (orchard). With 0.6-1.6x, their feet would slide by up to 47%.
  - Worst foot slide is 0.2% at both 1x and 2x.
  - Legless hoppers and flyers keep the view's relative rate.
- Walk and attack blend over 0.25 s and death over 0.2 s. Two idle clips alternate every 4-7 s when an actor stands.
- The hit flinch is weighted by the blow: heavy shots 1.0, routine shots 0.55, and halved again for guardians and minibosses. `PlayHit` has no damage value, so the flinch is weighted by blow class, not damage fraction.

### Secondary motion (CarrotSecondaryMotion.cs, new)

- Damped angular springs (stiffness 120, damping 12, at most 8 degrees) on ears, antennae, wings, blob heads (Head2/Head3), jaws (a hinge), drums, abdomens, heads and arms. They run in LateUpdate at execution order 100, after animation sampling. Each frame they add an offset on top of whatever the clip or the view wrote, so native transforms are never replaced.
- Appendages follow their own pivot's acceleration, so ears flop with every step. Heads and arms follow the actor root.
- Every rigged creature, miniboss and guardian has at least one link. Bone inventory: `evidence/before/inventory.jsonl` in the scratchpad; the per-prefab links are logged as `SECONDARY_MOTION` by `CarrotModels.Prepare`.
- On the Low tier only the 40 actors nearest the camera update.

### LOD and geometry budget

- **Mesh LOD.** Importer-generated index ranges (no extra vertices) cover the crowd. `CarrotTierLod` (new) forces the level per quality tier:

  | Group | High | Medium | Low |
  |---|---|---|---|
  | Creatures | 0 (1 above 6k triangles) | 1 | 2 |
  | Minibosses | 0 | 1 | 1 |
  | Guardians and hero | 0 | 0 | 1 |

  Skinned meshes are never swapped, only the index range they draw. LOD3 tore thin legs, so it is never used (`mesh-lod-levels.jpg`).
- **Towers.** Tower tiers were brought to a 12k-triangle budget (`Tools/decimate_carrot_towers.py`, 53 tiers): 1.47M → 0.92M triangles, worst bounds shift 6 mm, no visible change at 640 px (`tower-decimation.jpg`, `towers-in-game.jpg`).
- **Scans.** The scanned-nature Small levels were cut to about 60% and the casters to 300 triangles.

### Nature (blended realness)

- **Trees.** `TreeAutumn`, the tree the orchard border loads, was a blocky, white-trunked Kenney mesh. It is now an original tree: a flared, curved trunk with three branches under seven opaque, lumpy leaf clumps (2.7k triangles). Its Foliage material has a leaf-splat albedo breakup, a matching detail normal, wrap, translucency and a little sheen. There are no alpha cards (MSAA 1 and no TAA would shimmer). See `orchard-trees.jpg`.
- **Unused tree slots.** `TreeOak` (garden and marsh) and `TreePine` (frost) replace the Kenney meshes that sat unused under those names.
- **Orchard props.** `Pumpkin`, `HayBale` and `CrateStack` are ready meshes for props the view still builds from primitives.
- **Scans.** RealNature ferns and shrubs gained wrap and the stump gained bark grain.

### Portraits

- `public/assets/minigames/carrot/portraits/` holds one WebP sheet per tower family (tiers I-V) plus `creatures`, `minibosses` and `bosses` (eight guardians and the carrot). Cells are 256 px; the total is 684 KB.
- `portraits.json` maps `{kind: {tier: [sheet, x, y, w, h]}}` with paths relative to the json, which is the format the page reads. It covers all 20 towers × 5 tiers, all 20 creatures, all 15 minibosses and all 9 guardians. Asuna points at the approved `../46-asuna-portrait.png`.
- The portraits are rendered by `CarrotCharacterStudio.Portraits` with the shipped Storybook materials under a 3/4 key, a fill and a rim light. Each is rendered twice, over black and over white, so translucent wind shells keep their true alpha.
- `Tools/pack_carrot_portraits.py` packs the sheets: ACES, 2× supersampling, WebP q80, and `portraits-provenance.json`.
- `portraits-vs-game.jpg` sets the portraits of Seed IV, Frost, the Tornado and the nibble beside their in-game models.

## 3. Acceptance

| Check | Result |
|---|---|
| C# compiles (player, editor) | CSC_OK on every commit (scratch compiler check, same Unity Roslyn and DLLs as `carrot-cs-check`) |
| Storybook variant count unchanged | 724 → 724, identical keyword space |
| Default properties, L1 ΔE | 0.005 (L13 0.33, L24 0.42) |
| `npm run carrot:test` parts | `test-carrot-progress` passes, `carrot-game-data` matches CarrotData, Unity `CarrotSimulationTests.Run` CARROT_TESTS_OK (219,339 assertions, 57 campaign victories) |
| portraits.json coverage | every tower, creature, miniboss and guardian id in game-data.json plus the 8 original creatures; 0 missing |
| Portrait size | 684 KB of 3 MB |
| Nibble eyes from the 34 degree camera | 42 pupil vertices, 0 occluded (`CarrotPortalModelChecks.GiantUpdate`) |
| Spider normals | 0 split normals above 30 degrees without a 60-degree-plus crease (1,868 positions) |
| Tornado / zombie baked albedo vs old lerp | OKLab ΔE 0.0037 / 0.0007 (gate 0.03; `Tools/check_baked_albedo.py`) |
| Part names the view finds | all present in 144 prefabs (`Tools/check_view_part_names.py`); `PORTAL_MOTION_CHECK` passes |
| Secondary-motion cost, 104 actors / 229 links, High | mean 0.10 ms per frame in the editor (worst frame 0.21 ms); Low 0.03 ms. Editor Mono timing is an upper bound; the WebGL build was not profiled. |
| Largest bone offset | 8.0 degrees (cap 10) |
| Animate / UpdateCarrot / SetFace allocations | 0 bytes |
| Foot slide at 1x and 2x | 0.2% |
| Triangles, crowded L20 board (104 mobs, 9 tier-IV towers, guardian), High | 0.87M (budget 1.0M) |
| Same board, Low | **0.56M (budget 0.45M, not met)**: actors 0.33M, world-placed decoration batch 0.20M, terrain 0.03M; see 4 |
| New textures | ten, each 512 px or smaller, crunched (the 4×4 zombie tint is uncompressed): 0.72 MB storage |
| Mesh data | Mesh LOD index data +2.24 MB raw; tower vertex data -19.4 MB raw and tower indices about -3.3 MB raw. The net raw change is about -20 MB before build compression. The web data file was not rebuilt in this stream (see 4). |
| Provenance | every new texture, mesh and render is listed in ASSET-CREDITS.md and credits.txt (kept in sync), detail-normal-provenance.json, living-nature-manifest.json, tower-decimation-manifest.json and portraits-provenance.json. No image-model output was used (`design/giant-update-art-provenance.md`). |

## 4. Hand-offs and open items

- **World: drop the tint lerps.** `CarrotView.UpdateActors` still lerps the tornado's tint toward (.58,.64,.76) by .75 and the zombie's toward (.46,.55,.38) by .7, every frame. Both colours are now baked (see Character fixes, and the albedo row in the Acceptance table), so those two `Color.Lerp` calls must go. Until they do, the two bosses are tinted twice and read darker than intended. The character captures were taken with the lerps removed locally.
- **World: adopt the new meshes.** `Tree()` still builds blob trees from primitive spheres, and `Pumpkin()`, `HayBale()` and `CrateStack()` still build from primitives. The replacements are ready: `Resources/Carrot/Nature/TreeOak` (garden and marsh), `TreePine` (frost), `Pumpkin`, `HayBale` and `CrateStack`. Each stands on its pivot, base at y = 0, centred, front -Z, and the trees are unit height, so `PlaceNature(prefab, p, height, yaw)` places them as it places `TreeAutumn`. Until adopted, about 0.1 MB of mesh ships unused.
- **World: Low triangle budget.** With actors at 0.33M after the Low LODs, reaching 0.45M on Low needs about 0.11M fewer triangles in the decoration batch. Lowering `BuildDecoration`'s Low budget from 90 to 60 and switching Low-tier border trees to `TreeOak` and `TreePine` would roughly cover it. Re-adding tower LODs would save only about 40k triangles, for about 1.8 MB of index data.
- **World and release: data size.** Measure the data-file change in the next web build. This stream's ledger predicts a net shrink: tower geometry -37%, against +0.72 MB of textures and +2.24 MB raw of LOD indices. The private Asuna and effect inputs are not in this worktree, so `CarrotBuild.Prepare` (and therefore any web build here) refuses to run, as designed.
- **Audio: move ConfigureAudio.** `CarrotModels.Prepare` still calls `ConfigureAudio`, which is non-recursive. It is left for the audio stream's `CarrotAudioImport.cs`.
- **Not done.** The secondary-motion cost was not measured inside the WebGL player. Alpha leaf cards and LODs for guardians on High were deliberately not made.

## 5. Review tooling

`Assets/Editor/CarrotCharacterStudio.cs` is Editor-only and never ships. Run it with Unity in batch mode without `-nographics`, because it renders.

- `Play()` enters play mode on `Assets/Scenes/Carrot.unity` and runs a shot list (`-studioPlan`) against the real CarrotGame and CarrotView.
  - Ops: `load`, `cmd {json}`, `wait`, `step`, `quality`, `spawn`, `look enemy|along|tower|carrot|point`, `gamecam`, `shot`, `burst`, `lod`, `stats`, `resetstats`, `exit`.
  - `stats` appends LOD-aware visible triangles, spring cost, foot slide and actor allocations to `stats.jsonl`.
- `Models()` renders every actor prefab alone under the garden rig at the game camera pitch.
- `Portraits()` renders the portrait frames.
- `Inventory()` dumps triangles, bounds, materials, meshes, bones and clips.
- `SizeLedger()` reports LOD index bytes, per-prefab vertex bytes and new-texture storage.
- `ShaderCheck()` runs the compile and variant check.
- `LodProbe()` lists the Mesh LOD API.

`CarrotPortalModelChecks.GiantUpdate()` runs the model acceptance checks.
