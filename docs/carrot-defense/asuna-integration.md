# Official Asuna character integration

Status: the user accepted the licence and manually downloaded the official package. Offline source extraction and Unity inventory succeeded. The explicit game mapping and portrait renderer are implemented; the runtime prefab is prepared and its offline portrait is visually checked. Browser appearance, effects and performance are being validated separately. Raw licensed meshes, materials, animations and textures remain private and ignored by Git.

The requested source is MSGDI's [Free Test Character Asuna, product 205897](https://assetstore.unity.com/packages/3d/characters/humanoids/sci-fi/free-test-character-asuna-205897). The current official listing identifies version 2.2, released August 14, 2026, a 1.1 GB package, URP/HDRP support and the Standard Unity Asset Store EULA. The listing describes a Humanoid character with approximately 58,600 triangles, separate in-place animation FBXs, PBR materials, 4K body/head textures and 2K armor textures. These are publisher descriptions. The acquired archive is 1,162,676,205 bytes with SHA256 `7422b48589313e6c3ef9ade767c6556312ef5642bb4abc78efbe48e7d41d6ae9`. Its original path is the local Unity Asset Store cache; acquisition was completed by the user in Unity, not through an alternate download service.

## Private source and release boundary

The selected official meshes, textures, clips, materials and their metadata stay in `unity/CarrotDefense/Assets/Licensed/Asuna/`. This directory is ignored by Git. Raw archives and the original package inventory may be stored in the ignored `private-assets/Asuna/` outside the Unity Assets directory. Preserve all publisher notices in the private source archive.

Generated controllers and clip copies go in the ignored `Assets/Resources/Carrot/AsunaRuntime/`. The ignored runtime wrapper is `Assets/Resources/Carrot/Models/Bosses/Asuna.prefab`, exposed as `Carrot/Models/Bosses/Asuna`. Only a compiled playable game is intended for distribution; source assets must not appear in public website files, source commits, screenshots of texture sheets, or downloadable model bundles. Do not use the licensed artwork as image-generation input.

Source and runtime folders serve different purposes. Never place the entire package in a Resources directory: that would include unused demo scenes, material variants and large source textures in the WebGL player. Import only the audited dependency graph. The original-code importer and runtime animation adapter are tracked; they contain no vendor artwork or animation curves.

## Explicit integration mapping

After the authorized download, place the selected source under the ignored private directory. Run `CarrotAsunaAssets.InventorySource()` (menu: **Carrot → Asuna → Inventory downloaded source**) to write actual prefab, shader, Avatar and animation names to the private `CarrotInventory.txt`. Then copy `asuna-integration.example.json` to `Assets/Licensed/Asuna/CarrotIntegration.json`. Replace every blank path and source name with verified values. Record the acquired archive SHA256 and actual package version. Blank values are intentionally unusable and are not asset-name guesses.

The editor entry points are `CarrotAsunaAssets.AuditSource()` and `CarrotAsunaAssets.Prepare()`. They reject missing source, dependencies outside the private subtree, source Resources folders, ambiguous clip names, missing required Humanoid states and unclassified texture dependencies. `CarrotBuild.Prepare()` calls `RequirePrepared()` before changing scenes or emitting any release/QA/development player. The gate verifies the real private meshes, valid Humanoid Avatar, six playable states, material references, measured height and a receipt matching the current mapping. Simulation tests do not call this build gate. No substitute geometry is produced.

The importer preserves the original meshes, skeleton, facial blend shapes and material assignments. It removes vendor demo scripts, physics/cloth, cameras, lights and audio sources from the runtime instance; the game's existing simulation owns those systems. It applies only the explicitly configured orientation correction and measured uniform size normalization. No automatic mesh decimation or fabricated rig is applied. The runtime uses the official Humanoid Avatar, root motion disabled, and a private controller with `Idle`, `Walk`, `Attack`, `Dash`, `Hit` and `Death` states. Idle/Walk loop; other states play once. Each state must have a verified source clip, with no automatic substitution.

`CarrotAsunaMotion` exposes `SetMotion(string state, float speed = 1)` and `TriggerHit()`. Hit returns to the latest desired action after its clip completes. Death is terminal. The `chargeAnchor` and `trailAnchor` resolve the official Avatar's `HumanBodyBones.RightHand` and `LeftHand`, respectively; explicit verified source paths may override them. The outer prefab faces local +Z, is planted at y=0, and keeps a unit root scale. Target height is configurable (initial proposed value 2.1 game units). `CarrotModelMetrics.healthAnchor` uses measured visible mesh vertices rather than imported culling bounds.

## Acquired source findings

The private graph contains 144 package entries (574,350,109 bytes), preserving publisher GUIDs. Unused color variants and the nested HDRP material package are excluded. The master prefab's audited demo firearm, magazine and holster roots are removed from the runtime copy; the eight armor attachments remain. Source files themselves are not altered to remove these objects.

The base character FBX has 58,272 triangles across six meshes, before armor. The prepared runtime model measures 61,788 triangles, 43,421 vertices and 14 renderers (six skinned meshes and eight rigid armor attachments), with eight materials. Blender measured 309 bones and 78 BodyMesh shape keys including Basis; Unity imports 76 BodyMesh blend shapes. These measurements are recorded in the private runtime and bake audits. The mesh named `BodyMesh` is preserved because publisher corrective-animation tracks target it. Additional hair and soft-tissue bone curves use the shipped female AvatarMask; the Run FBX's obsolete mask GUID is remapped to that actual mask.

| Game state | Official FBX / clip | Imported duration |
| --- | --- | --- |
| Idle | 001Idle / Idle1 | 2.500 s |
| Walk | 002Walk / Walk | 1.333 s |
| Attack | 023OneHandMeleeWeapon / AttackRightHand | 0.833 s |
| Dash | 003Run / Run | 1.500 s |
| Hit | 008Damage / HitFront | 0.333 s |
| Death | 006Death / Death1 | 1.667 s |

Dash is a short gameplay movement using the acquired Run motion; it is not a new authored dash clip. Death overrides all actions; Dash interrupts Hit immediately, and repeated projectiles cannot continually restart Hit. Root motion remains disabled.

The game keeps the publisher's URP/Lit material graph, including two-sided cutout hair and transparent corneas. Its release shader is narrowly retained by `CarrotShaderStripper`; unrelated URP shader families remain stripped. All 40 source texture dependencies have explicit color-space and size mappings. The first mapping used up to 2048 pixels for body/head/hair, 1024 for armor and 512 for eyes/teeth/microdetail or unused firearm dependencies, uncompressed. The giant update's restored mapping (below) caps the 12 body, head and hair maps at 1024 and the other 28 at 512, all crunch-compressed (quality 75, normal maps 80; `CarrotAsunaAssets.ConfigureTextures` through `CarrotBuild.WebTexture`). AO and metalness/smoothness data are linear, albedo/emission are sRGB, and normal maps use the normal importer. Together with the licensed effect textures (512 px, crunch 70) this took the gzip data file from 64.66 MB to 42.61 MB (`giant-update/render-vfx.md`). No visual quality claim is based on these caps alone.

`CarrotAsunaPoseExport.Export()` samples the exact prepared Idle1 pose and writes private geometry, UVs, normals and material texture references to ignored `private-assets/Asuna/portrait-pose.json`. `Tools/render_asuna_portrait.py` renders that pose using Blender Cycles CPU, the original publisher PBR textures, 96 samples and a soft daylight setup. The inspected 1024×1024 three-quarter bust is `public/assets/minigames/carrot/46-asuna-portrait.png`. Private `.blend` and geometry intermediates are not distributed.

The first Unity Editor portrait was rejected because this machine's missing Metal toolchain produced shader artifacts. The final portrait is the actual official character rendered offline, not a screenshot demonstrating browser rendering quality. `CarrotAsunaPreview.RenderPortrait()` now writes only `output/asuna-editor-diagnostic.png`, so future verification cannot overwrite the inspected public Blender portrait.

A vertex-level audit compared both `BakeMesh` overloads with CPU skinning plus active corrective shape weights at the same Idle pose. `BakeMesh(mesh, true)` exactly matched the official character's world bounds for all six skinned meshes. `false` made them approximately 10% larger under the normalized hierarchy. The existing measured-rig Echo path therefore stays unchanged.

## Giant update restore (branch carrot-s-world)

The private folders were empty on the giant-update checkout, so every web build was blocked by `RequirePrepared()`. The owner's acquired archive in the local Unity Asset Store cache (SHA256 `7422b485...6ae9`, the value above) was extracted into an empty scratch folder and a dependency walker copied only the audited graph with the original `.meta` files: the master prefab, meshes, materials, textures, the six clip FBXs, the female AvatarMask and the publisher readme, 112 files and 574,350,109 bytes (the byte count recorded above). `CarrotIntegration.json` was rebuilt from `asuna-integration.example.json` and the clip table above; the clip names were verified in the FBX metas. `CarrotBuild.PreparePrivate` then logged `ASUNA_PREPARED ... height=2.100 forward=+Z` with 14 renderers and eight materials. `git ls-files` lists no private path. Full steps: `giant-update/render-vfx.md`, "Private restore".

Browser checks on the giant-update QA build (headless Chromium and WebKit, level 29): the Focus-boss camera frames her 120-135 px tall at 1440x900; the six abilities run without console errors; the WCAG flash sampler records 0 flashes in any second across her ability set. Physical-phone appearance and frame time with her on screen are still unverified.

## Required source and runtime audit

Before declaring this integration ready:

- Verify the official archive version, SHA256, material dependency graph, shader names and exact source clip names. Confirm that scripts/materials needed for visual fidelity are either retained deliberately or replaced with compatible original game code.
- Check actual triangles, vertices, renderer/material count, bone count and blend shapes. The listing's triangle count is suitable for a single boss as a starting point; measured browser performance determines whether an official lower LOD is needed.
- Classify every referenced texture as color, normal or linear packed data. Start at 2K for face/body maps and 1K for armor/secondary maps where appropriate; preserve alpha cutouts, normal-map import settings and the publisher's channel packing. Texture caps are explicit per asset, not inferred from filenames.
- Verify face/hair transparency and double-sided needs in URP. Inspect skin and eyes under the actual game's lighting. Avoid generic replacement with the game's vertex-color materials.
- Verify all six states at game speed, pause, root-motion suppression, +Z facing and floor contact. Measure attack/dash clip timing against gameplay. Confirm hit cannot cancel a completed death.
- Confirm the measured HP anchor and rewind/echo `BakeMesh` behavior on this official rig; the existing expansion rig's scale workaround is not automatically evidence for this asset.
- Inspect desktop and phone gameplay with one active character, effects, shadows and music. Record actual memory, draw calls and frame time. Record the completed checks before changing this document's pending visual-validation status.
- Run `git ls-files` against all private paths and verify no licensed source is staged or tracked. Check generated WebGL outputs separately for normal compiled-game distribution.
