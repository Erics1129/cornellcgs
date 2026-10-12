# Carrot Defense 3D — production pipeline and acquired assets

Research date: 2026-10-12. This is preproduction research, not a claim that the game or these assets have passed an in-engine art review.

## Recommended engine and workflow

Use the installed **Unity 6000.3.18f1** for a separate project and WebGL build. Keep the existing Forge project and player files intact. A fixed three-quarter camera, authored paths, baked lighting, original generated material artwork, genuine skinned monsters, and carefully timed effects fit the chosen cinematic storybook direction.

Use **WebGL2 as the production baseline**. Unity 6.3 still marks WebGPU experimental. VFX Graph 17.3 requires compute shaders/SSBOs and does not support OpenGL ES, so it is not a reliable baseline for this browser game. Use Shuriken particles, meshes, trails, shader distortion, and generated effect flipbooks instead. [Unity Web graphics APIs](https://docs.unity3d.com/6000.3/Documentation/Manual/webgl-graphics.html), [VFX Graph requirements](https://docs.unity3d.com/Packages/com.unity.visualeffectgraph@17.3/manual/System-Requirements.html).

Unity officially lists current desktop browsers and iOS Safari 15+/Android Chrome 58+ as supported, but this is compatibility, not a performance guarantee. Test modern phone hardware and retain an automatic reduced-effects tier. [Browser compatibility](https://docs.unity.com/en-us/engine/6000.3/manual/platform-specific/webgl/intro/browsercompatibility).

### Reusable local structure

Read-only inspection of `/Users/eric/Claude/cornellcgs-forge` found:

- `unity/ForgeOrFold/Assets/Editor/ForgeBuild.cs`: reproducible editor build entry, dedicated output directory, gzip with decompression fallback for static hosting, build-content hash for caching.
- `src/minigames/forge/unity.ts`: canvas lifecycle, loader progress/error handling, queued state until ready, disposal/Quit, pixel-ratio cap, pointer capture/cancellation, pause on visibility changes.
- `unity/ForgeOrFold/Assets/Plugins/ForgeBridge.jslib`: canvas-scoped custom events from C# to the page.
- `scripts/forge-unity-build.mjs`: batch build wrapper.

Adapt the **structure**, not Forge-specific game state, keyboard handlers, materials, or first-person controls. Important improvement when two Unity games coexist: do not treat any existing global `window.createUnityInstance` as the correct game's loader; resolve/capture the factory from that game's own loader. Give this project its own event names, state keys, assets, version manifest, route and build folder.

### Model import: smallest robust route

Blender is installed at `/Applications/Blender.app/Contents/MacOS/Blender` (existence verified; **not launched**). The Forge project has no glTFast package cached and uses built-in Unity modules only.

Recommended after the art pack is complete: batch-convert the acquired GLBs to FBX through Blender, preserving named clips and skin weights, then use Unity's normal editor import with Generic or Legacy animation. Inspect the first converted creature's walk, attack, hit and death before converting the rest. Import axes/root motion deliberately; fixed-path movement owns world translation. This avoids adding a runtime parser to the shipped game.

Alternative: Unity's official `com.unity.cloud.gltfast` supports editor import, skinned meshes and animations. Use design-time import; the supported simple playback route is the legacy Animation system. Mecanim-compatible clip import requires assigning a controller separately. No package was installed. [Official glTFast docs](https://github.com/Unity-Technologies/com.unity.cloud.gltfast/blob/main/Packages/com.unity.cloud.gltfast/Documentation~/index.md), [supported features](https://github.com/Unity-Technologies/com.unity.cloud.gltfast/blob/main/Packages/com.unity.cloud.gltfast/Documentation~/features.md).

## Acquired assets: concrete files, licenses and animation inventory

All acquired sources live under `/Users/eric/Claude/carrot-defense-preproduction/source-assets/`. These are production candidates, not a mandate to use every file. Import only selected assets into the game. Preserve the source records separately from runtime payloads.

### Skinned creature candidates

**14 GLBs downloaded successfully** under `quaternius-poly-pizza/`, with all images/buffers embedded and no required extensions. Each has a companion JSON containing source URL, creator, CC0 license label, download URL, byte size, SHA-256, actual triangles, skins and exact animation names/durations. `inventory.json` collects these details. The models are all attributed to **Quaternius**, whose official pack page declares CC0; each alternate listing also identifies that author and CC0 1.0. [Official Ultimate Monsters pack](https://quaternius.com/packs/ultimatemonsters.html).

The triangle counts below come from the actual GLB index buffers, not the sometimes-incomplete website counter.

| File / source | Actual triangles | Useful existing clips | Potential role |
|---|---:|---|---|
| [mushnub.glb](https://poly.pizza/m/LWKmS30Xxl) | 1,248 | Walk, Bite_Front, HitRecieve, Death, Dance | Round mushroom grunt |
| [green-blob.glb](https://poly.pizza/m/y4kJh8EeYS) | 1,520 | Walk, Bite_Front, HitRecieve, Death | Squishy splitting slime |
| [spiky-blob.glb](https://poly.pizza/m/IoWG5F9WUc) | 4,888 | Walk, Bite_Front, HitRecieve, Death | Bristled armored creature |
| [bunny.glb](https://poly.pizza/m/irZjWFARyl) | 8,284 | Walk, Run, Jump, HitReact, Death, Punch | Long-eared fast runner |
| [frog.glb](https://poly.pizza/m/37wofOCOzG) | 5,016 | Walk, Run, Jump, HitReact, Death | Broad jumping creature |
| [armabee.glb](https://poly.pizza/m/42djT5zJnx) | 2,280 | Fast_Flying, Flying_Idle, Headbutt, HitReact, Death | Winged flying threat |
| [goleling.glb](https://poly.pizza/m/71gomWolax) | 3,696 | Flying_Idle, Fast_Flying, Headbutt, HitReact, Death | Floating stone guardian |
| [ghost.glb](https://poly.pizza/m/Iip30bDHmu) | 3,192 | Fast_Flying, Headbutt, HitReact, Death | Translucent lantern spirit |
| [squidle.glb](https://poly.pizza/m/54QyRcsogk) | 4,880 | Flying_Idle, Headbutt, HitReact, Death | Tentacled caster |
| [yeti.glb](https://poly.pizza/m/S1E7idPFhe) | 2,136 | Walk, Bite_Front, HitRecieve, Death | Small round frost creature; **not** the large biped Yeti |
| [mushroom-king.glb](https://poly.pizza/m/grnFTziU8u) | 6,044 | Walk, Run, Punch, HitReact, Death | Mushroom chapter boss |
| [dragon-evolved.glb](https://poly.pizza/m/LlwD0QNUPj) | 7,438 | Fast_Flying, Headbutt, HitReact, Death | Winged final boss |
| [spider.glb](https://poly.pizza/m/yRYJiAJyiM) | 2,712 | Spider_Walk, Spider_Attack, Spider_Death, Spider_Jump | Crawling legged rig; can support an original shell-armored variant |
| [snake.glb](https://poly.pizza/m/x9x0viZs8V) | 1,618 | Snake_Walk, Snake_Attack, Snake_Jump | Slithering alternative; **no supplied death or hit clip** |

Exact clip prefixes are `CharacterArmature|`, except `SpiderArmature|` and `SnakeArmature|`. `HitRecieve` is the source's spelling. Those details matter for actual playback.

No suitable **CC0 skinned snail** was verified. Search results included static snails by other artists; they were not downloaded or represented as animated. Make the requested snail as an original articulated model from the generated turnarounds (shell, deforming body, antennae, blink and recoil), or choose another already-supported silhouette. Do not falsely label a stock spider as a beetle; if adapting its rig, author an original six-legged shell mesh and document the derivative.

These are visibly stylized low-poly foundations. Generated texture artwork alone will not turn them into film assets. Preserve deliberate shapes, soften selected surface normals, add original painted color/roughness and detail masks, improve eyes and creature-specific appendages, and review them at the final game camera. Keep each silhouette recognizable without relying on palette swaps.

### Environment kit

`kenney-nature-kit/unpacked/` is the downloaded **Nature Kit 2.1**, with **329 FBX models**, GLB/OBJ/DAE alternatives, source textures and an included `License.txt` declaring CC0. The website rounds this to 330 assets. Actual archive SHA-256 and URL are in `provenance.json`. [Kenney Nature Kit](https://kenney.nl/assets/nature-kit).

Best candidates in `Models/FBX format/`: `tree_detailed.fbx`, `tree_oak.fbx`, `tree_pineTallB_detailed.fbx`, `bridge_woodRound.fbx`, `rock_largeA.fbx`, river/ground/path pieces, `flower_redA.fbx`, `flower_purpleB.fbx`, detailed stumps and mushrooms. Avoid block-style trees for the chosen direction. The kit supplies geometry; original generated bark, soil, moss, stone, leaf and water treatments should unify the final scene. Add original major landmarks per biome rather than assemble all chapters from the same stock tree row.

Quaternius's more detailed **Ultimate Stylized Nature** pack is a good future candidate, with 63 textured models and normal maps declared CC0, but its official Google Drive downloads returned **quota exceeded** today. Nothing from that pack was acquired. [Official source](https://quaternius.com/packs/ultimatestylizednature.html).

### Downloaded audio

| Local folder | Assets / license | Suggested use |
|---|---|---|
| `kenney-impact-sounds/` | 130 OGGs; included CC0 License.txt | Wood/metal/glass/body impacts, different footfalls |
| `kenney-rpg-audio/` | RPG foley and effects; included CC0 License.txt | `chop.ogg`, cloth, book, latch, knife and object handling layers |
| `joth-fantasy-orchestral/` | `FantasyOrchestralTheme_1.mp3`, 3.84 MB; creator's page declares CC0 | Serene opening into orchestral crescendo; title / progression candidate |
| `vitalezzz-ancient-legend/` | `the_ancient_legend_2.mp3`, 7.45 MB; creator's page declares CC0 | Fantasy orchestral candidate for late stages/boss |

[Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds), [Kenney RPG Audio](https://kenney.nl/assets/rpg-audio), [Joth's original upload and license](https://opengameart.org/content/fantasy-orchestral-theme), [Vitalezzz's original upload and license](https://opengameart.org/content/the-ancient-legend).

The music downloads were verified as available and saved with provenance; **they have not been auditioned in the game**. Their suitability, loop seams, peaks and final mix require listening, not just metadata. Scott Buckley's orchestral **Jubilee** is a strong CC BY 4.0 candidate, but the direct download returned HTTP 406; it was not acquired. Sonniss GameAudioGDC offers professional production-licensed effects, but the large archives were not downloaded. [Jubilee source](https://www.scottbuckley.com.au/library/jubilee/), [Sonniss archive/license](https://sonniss.com/gameaudiogdc/).

## Art-first gates before gameplay implementation

1. Complete and review key art, three biome environments, all level-map paintings, a carrot turnaround/expression sheet, tower upgrade sheets, distinct enemy turnarounds, hit/death/attack storyboards, and a common VFX sheet. Keep scale, camera angle, palette and lighting consistent.
2. For every family, record **generated source image → actual game use → animation**. A generated character sheet is a reference, not a 3D model. Map paintovers guide terrain/landmarks; seamless materials go onto meshes; portraits/icons go into the HUD; clean VFX keyframes become flipbooks; character movement uses real rigged clips.
3. Verify carrot reactions as a sequence: anticipatory glance at attacker → 80–120 ms compression/face change → attacker contact → leaf whip and crumbs → visible missing bite/damage state → recovery. Low health changes posture and expression. It must still be readable at phone size.
4. Validate one complete art scene with a moving enemy, firing tower, material-lit carrot, lighting and mixed audio before multiplying scenes. A still key-art image behind primitive objects is not an acceptable substitute.

## Animation, effects and audio implementation plan

- Use a shared semantic animation adapter (`idle`, `move`, `attack`, `hit`, `death`) with **per-model exact clip mappings**. Trigger game damage on the authored contact frame, not at the start of windup. Smooth locomotion transitions; allow quick hit overlays without restarting all movement. Pool enemies and effects.
- Give every tower a separate anticipation / release / impact / recovery rhythm and physical articulation: spring compression, seed recoil, spinning leaves, frost petals, mortar barrel kick, lightning charge. Selectively combine generated flipbooks with actual mesh debris, trails, flashes and localized light pulses.
- Keep spectacle at decision points: new-wave reveal, tower upgrade, large impact, carrot bite, boss phase and final victory. No continuous full-screen particles obscuring enemies and paths.
- Use layered real foley, source variation, pitch variation within a narrow range, distance attenuation, and concurrent voice limits. Carrot damage needs a crisp leafy crunch, soft body impact and short expressive reaction, with a brief music dip. Boss and win/lose outcomes need distinct musical transitions.
- Pre-bake reverb/EQ into source variations if required: Unity Web's AudioMixer support exposes group **volume**, not full mixer effects. Unlock sound on the user's first play/touch gesture. Short timing-critical sounds can decompress on load; music can remain compressed. Check AAC loop boundaries and iOS silent-mode behavior. [Unity 6.3 Web audio](https://docs.unity3d.com/6000.3/Documentation/Manual/webgl-audio.html).

## Proposed performance targets — design budgets, not verified measurements

| Budget | Desktop target | Mobile target |
|---|---:|---:|
| Frame rate | 60 fps | 30 fps sustained, 60 where stable |
| Visible enemies | 40–60 pooled | 25–40 pooled |
| Visible triangles | 300k–500k | 120k–220k |
| Draw calls | under 150 | under 90 |
| Live particles | 1,500 short bursts | 400–600 with overdraw limits |
| Dynamic shadow lights | one directional | one low-resolution or baked/blob fallback |
| Render scale / DPR cap | 1.5 DPR maximum | 1.0–1.25 DPR maximum |
| Initial compressed game payload | aim below 20–30 MB | same, stream optional chapter assets later |

Use texture atlases, instanced repeated scenery, baked occlusion/light/shadow detail, reflection probes, opaque foliage where possible, and bounded particle lifetime. Profile the worst boss wave on actual Web builds. The browser memory budget must include decoded textures/audio and loading duplication, not only download size. [Unity Web memory](https://docs.unity3d.com/6000.3/Documentation/Manual/webgl-memory.html).

Acceptance should include: every level winnable with sensible play; failure and retry; saves/unlocks; hover/touch parity; no interaction blocked by spectacle; pause/resume including sound; fullscreen and narrow view; repeated game exit/reentry; distinct bite reaction; no missing/pink/black materials; no unbounded particles or enemy allocations. Cinematic ambition is an art direction target, not an unverified “movie quality” claim.
