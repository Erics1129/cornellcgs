# Portal expansion model contract

This inventory describes actual exported meshes and animations. The generated portraits and upgrade plates are art direction and interface assets; they are not screenshots of these models. The original Claude tower, creature and environment FBXs remain unchanged.

## Inventory and resources

- 50 tower FBXs: ten new families with separate tiers 1–5 (Super).
- 12 ordinary creature FBXs with original articulated rigs.
- 15 miniboss FBXs with original articulated rigs.
- One Portal model with separate mechanical motion pivots.

Unity prefabs are prepared by `CarrotModels.Prepare()` from `Assets/Resources/Carrot/Models/Source`. They are loaded as `Carrot/Models/Towers/{kind}-{tier}`, `Carrot/Models/Enemies/{kind}`, `Carrot/Models/Minibosses/{kind}`, and `Carrot/Models/Bosses/portal`.

| Family | Tier I / II / III / IV / Super triangles | Mesh renderers across tiers |
|---|---|---|
| bamboo | 16,608 / 20,382 / 23,798 / 27,572 / 36,340 | 9–11 |
| chili | 13,758 / 15,576 / 17,212 / 19,030 / 23,694 | 8–11 |
| lotus | 18,780 / 21,334 / 27,594 / 29,024 / 43,272 | 12–14 |
| magnet | 16,772 / 18,594 / 22,034 / 23,856 / 26,348 | 9–13 |
| orchid | 13,762 / 15,200 / 20,298 / 21,736 / 25,350 | 11–12 |
| mushroom | 14,468 / 20,196 / 25,134 / 30,862 / 41,206 | 8–13 |
| cactus | 16,958 / 19,800 / 23,016 / 24,046 / 29,842 | 11–13 |
| clockflower | 25,126 / 27,954 / 29,992 / 32,820 / 37,946 | 11–12 |
| dragonfruit | 18,096 / 20,406 / 21,926 / 24,236 / 29,824 | 9–12 |
| moonflower | 11,404 / 13,032 / 14,650 / 16,278 / 19,128 | 10–12 |

| Creature | Resource group | Triangles | Mesh renderers | Bones |
|---|---|---:|---:|---:|
| mite | Enemies | 10,018 | 3 | 9 |
| beetle | Enemies | 10,530 | 3 | 9 |
| slug | Enemies | 8,472 | 3 | 3 |
| wisp | Enemies | 5,844 | 3 | 2 |
| bat | Enemies | 9,830 | 4 | 5 |
| scarab | Enemies | 11,254 | 4 | 9 |
| firefly | Enemies | 12,930 | 5 | 11 |
| sporeling | Enemies | 9,732 | 5 | 5 |
| tinyZombie | Enemies | 9,736 | 4 | 7 |
| riftling | Enemies | 9,128 | 3 | 6 |
| shardling | Enemies | 7,604 | 3 | 6 |
| mimic | Enemies | 6,188 | 5 | 7 |
| warDrummer | Minibosses | 20,654 | 5 | 8 |
| frostHerald | Minibosses | 20,686 | 6 | 5 |
| witherPriest | Minibosses | 25,638 | 7 | 5 |
| stormWarden | Minibosses | 21,068 | 5 | 7 |
| graveCaller | Minibosses | 16,112 | 6 | 7 |
| mirrorKnight | Minibosses | 15,764 | 5 | 7 |
| riftStalker | Minibosses | 10,974 | 4 | 7 |
| mossGolem | Minibosses | 30,656 | 6 | 7 |
| emberBoar | Minibosses | 12,332 | 3 | 7 |
| venomQueen | Minibosses | 10,652 | 4 | 9 |
| ironSnail | Minibosses | 12,276 | 3 | 3 |
| lanternLeech | Minibosses | 7,124 | 4 | 3 |
| chronoMoth | Minibosses | 14,458 | 5 | 4 |
| thornBeast | Minibosses | 20,452 | 4 | 7 |
| portalSentinel | Minibosses | 19,220 | 5 | 7 |
| portal | Bosses | 25,740 | 18 | — |

## Motion and coordinates

New actor meshes face local **−Z in Unity** and stand on y=0. Preserve the imported root/rest rotations before applying presentation offsets. Their dimensions are already normalized for the authored tile scale; do not infer scale from the generated portrait. Ordinary creatures are about 0.55–0.72 units tall, minibosses 1.22–1.48, and Portal 2.18.

All 27 creatures carry Legacy clips named `Idle`, `Walk`, `Attack`, `Hit`, and `Death`. The exporter bakes complete takes at 24 frames per second. Typical authored durations: Idle 2s, Walk 1s, Attack 1s, Hit 0.5s, Death 1.25s. Flying species use wing motion in Walk. Rig bones include Root, Body, Head, Leg0…7, ArmL/ArmR, WingL/WingR, Jaw and Drum where applicable. Do not overwrite native bone transforms while those clips play.

These are compact articulated rigs with rigid anatomical sections assigned to individual bones. They do not provide film-character muscle deformation, facial blendshapes, motion capture or fully simulated cloth. The stylized forms and compact rigs are a real-time compromise, not an exact reproduction of the generated artwork.

Tower pivots retain the existing `Turret`, `Core`, `Barrel`, `Petals`, `Muzzle`, `Ring01` and `Ring02` names. New named parts include `Spears`, `Pods`, `Stamen`, `Coils`, `Spines`, `ClockHands`, `Orbits`, `Pendulum` and `Clover`. The mushroom cap is under `Petals`. Each tier changes geometry: added launchers/pods, petal layers, mechanisms, branching arms, satellite flowers or orbiting components. Fine leaf relief and fixed grouping were consolidated without removing those tier differences.

Portal has no skeletal clip. Animate `Core`, `Ring01`, `Ring02`, `Ring03`, `Eyeball`, and `Claw0`…`Claw3`. Core/rings/Eyeball pivots share Unity position (0,1.17,0). The root-child shader aperture disk uses position (0,1.17,−0.009), diameter 0.878. Clear inner radius is about 0.444; inward teeth extend toward −Z. Claw pivots are (±0.46,0.82,−0.04). The carved arch, inner brass rotor, teeth, root cables and talons are geometry; the swirling aperture is a runtime shader.

## Surfaces and provenance

All 78 expansion meshes and their new rig clips were authored for this project with the Blender scripts `build_portal_towers.py`, `build_portal_creatures.py` and `sculpt_portal_minibosses.py`. They reuse the project’s original modeling utilities, not downloaded character geometry. No new third-party creature mesh or animation was imported.

Meshes carry UVs and authored vertex palettes. Blender exports FBX colors as sRGB. The existing `Carrot/Storybook` material flag `_VertexColorSRGB=1` converts these colors for the linear-light Unity project; runtime-generated geometry retains its separate established treatment.

The root-generated `PortalBioAtlas.png` supplies four 627×627 regions: teal chitin, indigo mushroom velvet, jade bamboo fibers and crimson fruit peel. `CarrotModels` converts them into four 512² neutral detail textures so generated color does not multiply unrelated species palettes. Separate tileable analytic normal and roughness maps describe chitin relief, fine cap pores, longitudinal bamboo fibers and fruit micrograin. These are authored approximations, not measured scans or normals derived from physical capture. They are named `Portal{Chitin,Cap,Bamboo,Peel}{Detail,Normal,Roughness}` under Models/Materials.

New material categories use non-readable mipmapped 512² textures. Normals import as NormalMap; normal and roughness data are linear; color detail imports as sRGB. The retained source atlas is non-readable with a 1K runtime import limit. Existing bark, stone and metal categories reuse the credited Poly Haven PBR maps; exact source and license records remain in `Textures/PBR-provenance.json` and the published asset credits. Generated atlas provenance is in `design/portal-art-provenance.md`.

## Verification and limits

`Tools/portal-model-audit.json` records SHA-256, file size, vertices, triangles, UV/color presence and clip checks for all 78 final FBXs. Read-back completed in Blender 4.5.1: all meshes have UVs and colors; all 27 rigs have exactly five expected clips and no unweighted vertices. Evaluated Walk animation moves actual mesh vertices (smallest measured displacement 0.006552 units). The audit explicitly binds Blender 4.5 imported action slots.

The 78 raw FBXs total 43.94 MiB. The 50 tower forms contain 1,146,270 triangles across the inventory; only the selected tier is displayed per tower. This is not a frame triangle count. The highest tier is lotus Super at 43,272 triangles. Runtime renderer count, shadows, concurrent enemies, frame timing and decoded memory require Unity/browser verification. There are no distance LOD variants in this export set.

Actual exported-model previews:

- [All 50 tower tiers](screenshots/portal-review-tiers.png)
- [15 revised minibosses](screenshots/portal-review-minibosses.png)
- [12 ordinary creatures](screenshots/portal-review-mobs.png)
- [Portal](screenshots/portal-review-portal.png)

These review images reimport the FBXs and render them in Blender with original vertex palettes, PBR surface detail and neutral studio lighting. The biological preview bump is an approximation of the Unity material. They validate shape and material identity; they do not verify the final game camera, postprocessing, animation playback, collision or mobile performance. The 50-tier and miniboss sheets reflect the final anatomy/detail pass; the separate ten-family overview predates the final cap/clock detail and is superseded by the tier sheet.

## Runtime integration corrections

The new static motion pivots now have unit-scale parents. The original FBX hierarchy retains 100× Geometry transforms; inverse-scaling a nested wrapper corrected its mesh size but did not correct local movement units. A 0.035-unit Spears charge offset consequently moved the launcher 3.5 units. The expansion-only normalization reparents each motion wrapper to its nearest normalized motion ancestor (or prefab root), preserving the complete geometry transform. `CarrotPortalModelChecks.Run` verified unchanged bounds for all 50 towers and exact 0.035-unit movement. Old model normalization remains unchanged.

Unity's imported skinned culling bounds for the 27 new native rigs also retain a 100× scale, while explicit bone-weighted vertices render at the intended scale. Example: Portal Sentinel reports a 148-unit renderer top, but its weighted mesh top is 1.48 units. `CarrotModelMetrics.healthAnchor` records the measured top in the outer prefab root's local space; the presentation transforms it with the model and adds a small world-space margin. This handles phone scale, flight and clones without altering visible geometry, animation or culling.

Rewind silhouettes of these new rigs use `BakeMesh(mesh, true)` with the existing renderer transform. An editor test placed Sentinel at (3,1,4), scale 1.2, in a walking pose: the default overload produced an approximately 222-unit ghost, while `useScale=true` matched the roughly 1.856-unit weighted silhouette. A hard-coded 0.01 vertex multiplier would incorrectly double-count actor scaling and is not used. Only the Portal static model is additionally readable for its own blink/rewind silhouette; tower readability stays unchanged to avoid multiplying CPU mesh memory.

New `EVoice` cues now receive the same 32 kHz/quality-0.5 import treatment as existing creature voices, and short clips preload their audio data. These corrections are covered by the bounded editor audit methods in `Assets/Editor/CarrotPortalModelChecks.cs`; actual browser replay remains the final check.
