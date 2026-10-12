# Model import and runtime audit

Latest source exports: 41 original models (carrot plus 40 tower tiers), 11 skeletal creature models, 10 curated Nature meshes and five scanned RealNature props from four Poly Haven source models.

The mesh totals below count every alternative tier and creature at once; they are not the on-screen budget. Real browser hardware remains the authority for frame time.

| Model | Triangles | Exported mesh objects |
|---|---:|---:|
| Carrot | 23,056 | 16 |
| seed-1 | 8,424 | 8 |
| seed-2 | 8,880 | 8 |
| seed-3 | 10,688 | 8 |
| seed-4 | 12,976 | 9 |
| frost-1 | 4,980 | 7 |
| frost-2 | 5,420 | 7 |
| frost-3 | 6,440 | 8 |
| frost-4 | 8,036 | 9 |
| mortar-1 | 2,998 | 4 |
| mortar-2 | 3,662 | 4 |
| mortar-3 | 4,186 | 5 |
| mortar-4 | 4,570 | 6 |
| prism-1 | 4,408 | 5 |
| prism-2 | 4,590 | 6 |
| prism-3 | 5,316 | 7 |
| prism-4 | 6,158 | 8 |
| storm-1 | 2,896 | 6 |
| storm-2 | 4,516 | 10 |
| storm-3 | 4,552 | 11 |
| storm-4 | 4,700 | 12 |
| blossom-1 | 8,436 | 8 |
| blossom-2 | 10,154 | 8 |
| blossom-3 | 11,008 | 8 |
| blossom-4 | 14,478 | 9 |
| starfruit-1 | 6,812 | 8 |
| starfruit-2 | 7,500 | 9 |
| starfruit-3 | 7,824 | 9 |
| starfruit-4 | 8,512 | 10 |
| gravity-1 | 3,812 | 7 |
| gravity-2 | 4,592 | 8 |
| gravity-3 | 5,516 | 10 |
| gravity-4 | 6,856 | 12 |
| book-1 | 2,356 | 8 |
| book-2 | 2,932 | 9 |
| book-3 | 3,632 | 10 |
| book-4 | 4,004 | 11 |
| thunder-1 | 8,516 | 5 |
| thunder-2 | 9,050 | 5 |
| thunder-3 | 10,018 | 6 |
| thunder-4 | 10,568 | 6 |
| nibble | 2,280 | 1 |
| dash | 8,870 | 3 |
| shell | 3,604 | 1 |
| swarm | 2,000 | 1 |
| moth | 3,528 | 2 |
| shaman | 6,052 | 4 |
| burrow | 3,480 | 2 |
| crystal | 4,924 | 2 |
| garden | 43,788 | 4 |
| marsh | 48,400 | 4 |
| frost | 63,436 | 3 |

## Verified integration risks and fixes

- Four music clips total 555.5 seconds (~196 MB float PCM if decoded together). Audio owner now lazily loads the requested score and unloads the old score after crossfade.
- Nature meshes are readable for runtime scenery combining; actors and towers are non-readable to avoid duplicate CPU geometry.
- Nature loads explicit final prefab names; recursive Resources.LoadAll would also load raw FBX models.
- Actor prefabs have identity outer roots. Native FBX transform and skeletal clip paths stay inside. ModelImporter.bakeAxisConversion is enabled and static animation pivots expose predictable Unity-space axes.
- Generated biological albedos carry their own color. Carrot/Leaf/Fur/Scale geometry uses neutral vertex tint to avoid multiplying two dark palettes. Cream and gold petals have a separate material category.
- Bosses are now 43.8k, 48.4k and 63.4k triangles. There is only one encounter boss at a time; evaluate in-game shadows and effects before raising these budgets.
- Physics and game state do not use artwork triangles: gameplay owner provides simple entity collider proxies.
- Original CC0 source provenance remains in Models/Licenses, Nature and Audio/Licenses.
- Blender asset previews are visual checks, not proof of Unity/WebGL correctness. Root owns Unity bounds logs, runtime orientation, skeletal playback, camera and performance validation.


## Inspected inventory and remaining limits — 12 October 2026

All 52 inventoried source FBXs and all 52 finished prefab paths exist. All 33 imported voice WAV hashes match Audio/Licenses/creature-voices.json. The 22 numbered reference images exist; every local image/document link in the original preproduction gallery resolves. The public credits copy matches ASSET-CREDITS.md.

Baked Carrot prefab face orientation was checked through its hierarchy: eyes at (±0.12, 0.69, -0.275), leaves at (0, 0.92, 0). Its visible front is Unity -Z. A root yaw of 180° shows its back to the camera, which is on the -Z side. View owner was notified to use yaw0/camera-relative correction, and apply the same -Z firing convention to tower aim/recoil. Upright axis conversion is separate from front-facing orientation.

Geometry remains stylized. Extra bark plates, fur locks and skin detail do not imply a film-production mesh, groom or rig. Boss skeletons/clip timing are reused licensed animation. Tentacles are bound to the available skeleton, without eight long independently authored deform chains. Some added parts are rigidly weighted; muscle/facial corrective shapes are absent. Tower firing uses procedural part movement rather than bespoke authored tier-specific animation clips. Biological surfaces now combine generated color/albedo with original analytic normal and roughness data. They remain authored approximations rather than measured PBR sets. The mesh/material inventory is complete; requested visual fidelity remains subject to live review.

The saved tower preview is a geometry checkpoint that predates corrected biological albedo selection in the preview script; use live Unity output for its plant/carrot colors. Actual-asset Blender renders and generated references are explicitly labeled in the gallery and manifest. No reference image is presented as gameplay.


### Biological surface refinement

A bounded surfacing pass adds eight 512px technical normal/roughness textures without altering meshes, rigs, shader code or color artwork. Pattern identity is specific: shallow broken carrot growth creases, raised branching leaf veins, directional long fur fibers, soft irregular cephalopod dermal bumps. Roughness ranges: carrot0.621–0.771, leaf0.391–0.548, fur0.841–0.938, wet hide0.274–0.415. Strength stays restrained; no category borrows a stone normal. Mips, repeat wrapping, normal-map import and linear roughness are explicitly configured. Surface heightfields tile continuously (edge mismatch below1e-9), all output hashes were checked, and CarrotModels.cs compiled against installed Unity assemblies. Runtime visual confirmation remains separate from this data/compile check.
