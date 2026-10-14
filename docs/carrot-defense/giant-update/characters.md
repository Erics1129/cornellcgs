# Living miniatures: characters, towers and nature

Stream `characters` of the Neon Harvest update. This file is the contract other streams build against and the record of what changed and how it was checked.

## T0 surface contract (Storybook)

`Carrot/Storybook` gained these material properties. Every default adds exactly nothing, so untouched materials render as before.

| Property | Range / default | Meaning |
|---|---|---|
| `_Subsurface` | 0-0.6, 0 | Wrap-diffuse width. Only light gained past the Lambert terminator is added, tinted by `_SubsurfaceTint`. |
| `_SubsurfaceTint` | colour, white | Colour of the scattered terminator light (warm for skin, blue for ice). |
| `_Sheen` | 0-1, 0 | Charlie fuzz sheen (Estevez and Kulla 2017, Neubelt visibility), direct and ambient. |
| `_SheenTint` | colour, white | Sheen colour. |
| `_DetailNormal` | 2D, "bump" | Tangent-space detail normal, whiteout-blended on top of `_BumpMap` in the UV path. |
| `_DetailScale` | float, 6 | UV multiplier for the detail map (relative to the `_MainTex` tiling). |
| `_DetailStrength` | 0-2, 0 | Detail normal strength. 0 skips the texture sample. |
| `_HitFlash` | 0-1, 0 | Additive warm-white emissive. World drives it per renderer through a MaterialPropertyBlock for 60 ms. |
| `_RimBoost` | 0-1, 0 | Cool silhouette rim for night biomes. World drives it (0.35 on enemies at night). |

Globals read by Storybook (unset globals read as 0, which turns the terms off):

| Global | Meaning |
|---|---|
| `_CarrotGroundColor` (float4) | Biome floor colour bounced onto downward-facing surfaces. |
| `_CarrotBounce` (float) | 0-1 weight for the hemispheric term: sky occlusion of downward normals plus ground bounce. |

The maths lives in `Assets/Shaders/CarrotSurface.hlsl`, included by the Forward pass after URP `Lighting.hlsl`. It declares the two globals under `#ifndef CARROT_GROUND_GLOBALS_DECLARED`. Any other include that declares them (for example `CarrotCommon.hlsl`) must `#define CARROT_GROUND_GLOBALS_DECLARED` before its declaration, or the Forward pass gets a redefinition error.

No `multi_compile` or `shader_feature` keyword was added.

### T0 verification

- `CarrotTD.CarrotCharacterStudio.ShaderCheck` (Unity batch, graphics on): Storybook imports with 0 errors; variant count 724 before and 724 after; the keyword space is identical (16 keywords); properties 27 → 36. Forward, ShadowCaster and DepthOnly compile for GLES3x (WebGL 2) under four keyword sets covering Low, Medium and High.
- Ready-frame captures of L1, L13 and L24 from the real scene (play mode, 1440×900, fixed 30 fps capture clock, HUD absent), old shader vs new shader with default values: mean CIE76 ΔE 0.005 (L1), 0.33 (L13), 0.42 (L24). The residue in L13/L24 is wind sway and ambient motes, not shading.

## Review tooling

`Assets/Editor/CarrotCharacterStudio.cs` (Editor only, never ships):

- `Play()` enters play mode on `Assets/Scenes/Carrot.unity` and runs a shot list (`-studioPlan`) against the real `CarrotGame`/`CarrotView`: `load`, `cmd {json}`, `wait`, `step`, `quality`, `spawn`, `look enemy|tower|carrot|point`, `gamecam`, `shot`, `exit`. This renders the actual game, lighting and post-processing without a web build.
- `Models()` renders every actor prefab alone under the garden rig at the game camera pitch.
- `Portraits()` renders transparent portraits with the real Storybook shader.
- `Inventory()` dumps triangles, materials, mesh names, bones and clips per prefab.
- `ShaderCheck()` is the compile and variant check above.

Run them with Unity in batch mode without `-nographics` (they render).
