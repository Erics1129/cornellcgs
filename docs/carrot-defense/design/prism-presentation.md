# Prism runway presentation

Level 29 derives its frame from the real route and pads: world X −7 to 33, centered at X 13. It uses a continuous teal runway in a bevelled ivory/titanium sky garden, spectrum inlays, planted scanned terraces, open white orbital sculptures and self-made crystal clusters (hexagonal prisms with pyramid tips) on the beds, the far edge and the distant gardens. Existing map builders and camera framing are unchanged outside biome `prism`.

Desktop (landscape) framing uses 44° elevation / −24° yaw, so the camera looks along the 40-unit runway's diagonal and it fills the frame (it was 39° / −2°, which left the runway a thin band). Portrait framing uses 53° elevation / 90° yaw so the 40-unit route fills the tall viewport. Both fit every route endpoint, build socket and actor envelope, then pan over the same measured bounds. Existing pinch, drag and reset controls remain available.

The seven sub-pixel inlay strips on each runway and chassis edge produced moiré at every zoom. Each edge now carries one strip with a procedural 4×64 spectrum texture (`CarrotPrismView.SpectrumMaterial`: seven bands of `CarrotEffects.Spectrum`, 18% soft band edges), mip-mapped, trilinear, anisotropic level 8. The level has its own `prism` grade (it used the garden grade before), and the pan clamp is the measured bounds plus 3 u.

## Character contract

The exact resource is `Carrot/Models/Bosses/Asuna`. No proxy model is created. The importer owns the acquired official rig, materials, clips, normalized +Z forward outer root and `CarrotModelMetrics.healthAnchor`.

`CarrotAsunaMotion.SetMotion(state, speed)` receives `Idle`, `Walk`, `Attack`, `Dash` or `Death`, with zero speed while paused. Heavy hits can call `TriggerHit()` at most once per 0.9 seconds. Human models retain their original scale/rotation and do not inherit the old monster squash. Decoys reuse the official model at 76% scale.

## Timing and effects

| Event | Presentation |
|---|---|
| `telegraph` / `telegraphTarget`, `prismLances` | One reserved warning ring at each locked tower; no area-damage implication. |
| `telegraph` / `telegraphTarget`, `spectrumRain` | Exact target ring plus a narrow vertical locator. |
| `ability`, each of the six skills | One source release; audio remains the audio system's responsibility. |
| `abilityTarget`, `prismLances` / `spectrumRain` | Actual locked contacts, including the first target. No per-target sound or camera impulse. |
| `abilityTarget`, `prismDash` | Ribbon head travels departure → arrival over the event's 0.45 seconds; landing burst is delayed by that exact duration. Medium/high can add three baked afterimages. |
| `ability`, `prismaticAegis` | Three transparent spectrum bands last for the actual shield duration. |
| `ability`, `mirrorRush` | Short split trails; actual decoys come from gameplay spawn events. |
| `ability`, `prismOverdrive` | Layered release plus restrained persistent pressure motes for `event.value` seconds. |
| `ability`, `prismReinforce` | Small spawn flourish, with no large repeated cue. |

Every one of the 20 plant families gets an additional distinct impact detail. Existing projectiles, impacts, signature powers, death effects and Super effects remain intact. Tier scales are bounded; the extra detail layer admits at most four hits per 120 ms on medium/high or two per 160 ms on low. Original effects run regardless of this extra-detail budget.

Spectrum trails use only three preallocated dynamic meshes on medium/high or two on low, each containing three 24-segment strips. Positions/colors are reused. The existing effect pool reserves warning slots separately. `CarrotView.SetReducedMotion("1")` disables new sweeping trails, afterimages, spins and extra camera impulses while retaining readable warnings and contacts.

## Acquired licensed effects

All four approved Asset Store archives were acquired by the user. Eight original prefabs were extracted with their GUIDs and required dependencies, then inspected by Unity 6000.3.18f1. Source filenames and hashes are recorded in the ignored private audit. The selected originals are:

| Pack | Original prefabs | Runtime bindings |
|---|---|---|
| Magic Effects FREE (`247933`, Hovl Studio) | Charge slash blue; Star hit | Asuna charged spells and real lance/rain contacts; star/beam plant accents |
| Free Quick Effects Vol 1 (`304424`, Gabriel Aguiar Prod) | vfx_Impact_01; vfx_Implosion_01 | Brief plant impacts and inward gravity/dream/time accents |
| Buff Loop FX (`34104`, DrGame/Tazo) | L_Unity_keeper; L_Recover_hold | Real Aegis/shield durations, blossom/lotus buffs, upgrades |
| Cartoon FX Remaster Free (`109565`, Jean Moreno) | CFXR Magic Poof; CFXR3 Hit Fire B (Air) | Death/dissolve accents and mortar/chili/dragonfruit contacts |

Private acquired sources live under `Assets/Private/CarrotLicensedVFX/Source/`. The reviewed private `config.json` binds actual originals; no substitute effect is presented as package content. The native effect layer remains intact.

The inventory found no animation or motion scripts on Magic, Quick or the two selected Buff prefabs. Buff's old Unity 5 binary assets imported correctly. Cartoon has only its `CFXR_Effect` lifecycle/light controller, with camera shake already disabled. Derived playback copies remove that exact audited controller, native audio and uncontrolled lights because the game owns those budgets. Particle shapes, bursts, colors, motion curves, meshes and textures remain from the real packages. Impact copies stop looping; the two Buff copies retain looping playback bounded by the real event duration.

The Magic/Quick materials still reference `Particles/Standard Unlit`, including in Quick's official URP archive. Buff references legacy additive and premultiplied particle shaders. Private derived materials preserve their textures, UV transforms, tint and blend equation using `Universal Render Pipeline/Particles/Unlit`; legacy additive's factor of two is retained. Soft intersections are disabled in this extra layer so Low quality does not require a depth texture. Cartoon retains its official `Cartoon FX/Remaster/Particle Ubershader`, with the vendor importer explicitly set to URP. Its `BASE_URP` pass is verified rather than assuming a RenderPipeline tag. Only those two shader names need the narrow release-stripper exemption.

`CarrotLicensedFxImporter.Prepare()` writes playback copies and the ignored `Resources/Carrot/LicensedFx/Library.asset`. `RequirePrepared()` is called by release preparation and rejects a missing pack, mapping, original, shader, unmanaged script, light or over-budget effect. Raw archives/source/playback/mapping files remain private; only the compiled game may embed the licensed assets.

The adapter gives all eight effects one pool slot before adding duplicates, including on Low. It prewarms up to 16/12/8 slots and admits 12/8/4 simultaneous effects for high/medium/low, with aggregate additional particle capacities 1536/960/384. Per-effect cooldowns and viewport culling bound pressure. Game-time simulation freezes correctly during pause and clears on level changes. One licensed accent can accompany an event; original effects still run. Reduced motion suppresses this optional extra layer while keeping native warning/contact information. A target at world zero is valid and is never replaced with the source position.

Acquired shared materials join the existing four-quads-per-frame shader warmup and are never added to its temporary-material disposal list. The Prism stage also warms the official Asuna prefab’s unique shared materials before those effects. Source scripts, audio, native trails and external subemitters cannot execute in playback copies.

Giant update: the source textures of the eight effects are capped at 512 px and crunch-compressed at quality 70 (`CarrotLicensedFxImporter.CompressSourceTextures`, after the URP conversion), and the audit JSON is written to `output/carrot-licensed-fx-audit.json`. The idle-visible check (`QaDump fxIdleVisible`) is 0 on all 29 levels and three tiers: no pooled licensed effect renders while parked.

Validation: Unity imported all eight originals and successfully prepared and validated eight runtime mappings from all four packs (`CARROT_LICENSED_FX_REQUIRED_OK`). Every selected material reports a supported shader; URP compatibility checks inspect serialized SubShader declarations because the active material tag can be empty before pipeline activation. Cartoon’s explicitly unused null trail slots are accepted only when that renderer’s own trail module is disabled; missing active materials still fail. Standalone runtime/importer compilation passes, and all 20 plant IDs have native detail recipes. Actual WebGL appearance is checked separately; import and library validation alone are not visual approval.
