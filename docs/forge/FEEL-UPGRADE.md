# Forge or Fold: feel upgrade (October 2026)

The owner asked for "significantly better game feel and realism". This change is presentation only. `engine.ts`, `config.ts`, `knives.ts`, `storage.ts` and `backend/forge` are byte-identical to the base (354a900). The rules, odds, prices, saves, replays and scores are unchanged, and `node scripts/forge-simulate.mjs` prints the same bytes (sha256 `03f22dd2…c2f2`).

## What changed

- **Strike.** Each press sends `Strike(seq)`; Unity answers `swing`, `impact` and `settled` with that id, and only `impact` resolves a hit. The hammer is a procedural 1 kg cross-peen on an elbow arc with a wrist snap. It lands about 190 ms after the press (215 ms from rest). Each outcome has its own hit-stop (16-130 ms, halved in Flow) and a directional camera kick on the contact frame. The cycle is 640 ms (595 ms in Flow, so a Flow window still gives 7 strikes). One press can be buffered.
- **Hearth.** Start forging is a 0.5 s step to the hearth with tongs in the left hand and a bellows pull with the right. The bar is buried in the coals, pulled out butter-yellow and laid on the anvil. Keep quenches a hot blade in the slack tub, and a sale glances at the scale. The Motion setting (Full / Reduced / Off) and the OS reduced-motion flag remove camera turns, shake, hit-stop and slow motion.
- **Hot metal.** Blackbody colour calibrated through the real lighting, bloom and tonemap. Temperature is presentation only: the edge cools first, the anvil floor is 650 C, strikes never reheat, the rack cools continuously and a quench drops to 60 C. Oxide scale grows and each strike clears a footprint. Cracks grow with the shatter risk. The knife is one mesh with a real cross-section; a Chip cuts a 7 mm notch.
- **Particles.** CPU-batched scale flakes with plane collisions replace the cube sparks, so the laser-trail bug is gone. A Perfect pops scale off the whole blade. Burning sparks appear only on evolution and Shatter. A Shatter breaks the blade into 10-16 cooling pieces. All particles cost at most 3 draw calls.
- **Room.** Closed, with a door, ceiling and sealed window; worst look-around view has 0% void. It is lit by a hanging oil lamp and a flickering hearth (8% on the anvil at 3.2 Hz; under 1% with reduced motion). The anvil is a London-pattern steel anvil (48 x 13 cm face with a chamfer highlight, a 25 cm horn) with a wear mask. Contact shading is baked per vertex and the brick is at real scale. Anti-aliasing tiers have hysteresis.
- **Web.** A strike gate that knows the risk (buffer below 20%, refuse with a ring and a dry tick above it), a HUD that no longer dims on every swing, distinct outcome labels, a Shatter hold, an honest roll needle and a phone layout. Procedural audio is rebuilt: layered strike, a ring that brightens as the steel cools, foley, fire and room beds, and energy above 300 Hz for phone speakers.
- **Tuning without a Unity rebuild.** `src/minigames/forge/feel-tuning.json` overrides the strike, metal, room and web numbers. Unity clamps them and echoes the effective values as `data-tuning`.

## Before / after

Measured with `scripts/forge-qa/run-all.mjs` on `vite preview`, Chromium GPU and WebKit on the M5 Max. Before is the phase-0 baseline (354a900). After is the final build 2. The load average when the after run started was 49 (other projects building), so frame times are pessimistic.

| | before | after |
|---|---:|---:|
| Cold transfer (desktop) | 13.41 MB | 7.98 MB |
| forge.data / forge.wasm (gzip) | 5.02 / 4.39 MB | 2.81 / 4.38 MB |
| Forge art downloaded (loading art and steel texture) | 3.55 MB | 316 KB |
| Unity ready: desktop / phone / WebKit phone / throttled | 2.78 / 2.78 / 2.55 / 11.5 s | 1.66 / 1.65 / 1.07 / 8.6 s |
| First paint luminance (0-255) | 255 | 12 |
| Press to impact, median (desktop / phone / WebKit) | 339 / 340 / 347 ms | 188 / 190 / 184 ms |
| Press to settled, median | 829 ms | 455 ms |
| Pressing every 400 ms: presses without an impact | 60% | 20% |
| Flow: impact gap / impacts in the first 4 s | 575 ms / 7 | 600 ms / 7 |
| Draw calls, desktop idle / striking median / striking p95 | 214 / 407 / 655 | 36 / 37 / 39 |
| Draw calls, phone striking median / p95 | 288 / 455 | 31 / 36 |
| Frame time, desktop 1440x900 at 120 Hz, striking p95 / p99 / max | 9.8 / 10.2 / 10.4 ms | 9.3 / 9.4 / 16.8 ms |
| Frame time, WebKit phone, striking p95 / max | 18 / 23 ms | 18 / 37 ms |
| Unity heap over a 5 min desktop / 3 min WebKit soak | n/a | 128 MB, no growth |

Other results on build 2:
- strike.mjs passes every check on phone, landscape, WebKit phone and reduced. On desktop it lost two checks to its own reading of the page, not to the game. Its outcome reader picked up stale Shatter labels, which the callout-key fix below removes. One rhythm impact came from a press held during heating.
- web.mjs passes 78/81. The three misses expect phones to start at tier 1, and they start at tier 2 on purpose. The 200-press fuzz gives no Unity refusals.
- audio.mjs passes 27/27.
- room.mjs passes 10/10 in the editor.
- A scripted day passes 7/7: Guard, Rewind, Hone, Keep, Sell, Trade, Rest to day 2, reload restore and engine replay.

## Integration decisions

- **Merge.** strike, metal, room and web merged with no git conflicts. One semantic collision: room and metal both added `EmissionId` to the partial `ForgeWorld`. The room copy is now `AtmosEmissionId`; same value, both intents kept.
- **Build diet.** Unused Resources textures moved to `Assets/ArtSource/Unused` with their GUIDs kept: Stone, Wood, StoneV2, WoodV2, LeatherV2 and Smith Normal/Albedo. Other changes: no skybox in the scene, no splash, IL2CPP OptimizeSize, and the new shaders always included. The WebGL 'High' quality level keeps vSyncCount 1. `loading-v3.webp` is a 2560x1440 render of the real hearth (243 KB). The page's first paint is dark (#0d0c0b).
- **Fire.shader.** Flame quads now fade at the top too. The atlas has no mipmaps, so the next frame's bright base bled in as thin red bars across the hearth when the new hearth camera looks down into the firepot.
- **ForgeWarmup.cs.** Compiles the Forge shader programs during loading, plus one small off-screen frame of the hearth. The first Start forging used to stall the GPU for 35-90 ms. It costs 110-140 ms of loading time.
- **ForgePage.tsx.** The Heating span and the outcome callout share a parent, and their keys could collide: a knife id against a hit count. Their keys are now prefixed. The collision left invisible Shatter callouts in the `aria-live` region after a Shatter during fast pressing.
- **`feel-tuning.json`:**
  - `strike.ringAlpha` 0: the flat evolution ring read as a target reticle over the work. Evolution shows through the blade's glow, flakes and label.
  - `web.render.phoneStartTier` 2, as the room already does: phones stay at tier 2 until a real phone passes.
  - `web.gate.frameSlackMs` 90 (was 50): one buffered press in 109 was refused by Unity on WebKit under load. This costs nothing while the 640 / 595 ms cycle binds.

## Polish after critique

Three critics (feel, realism, regression) reviewed integration build 2. Their high and medium issues were worked in two more Web builds (builds 3 and 4). Every number below comes from the served final build (4), compared with the critics' captures of build 2.

| Issue | Fix | Before | After |
|---|---|---|---|
| Frame stalls of 25-108 ms on the first strike of a session and the first of each outcome | `ForgeWarmup.cs` renders off-screen frames of every impact path during loading: a hot knife with a Chip notch, a footprint and a Perfect flash, every particle kind with velocity stretch, a shatter piece set, smear ghosts, a coin, the contact flash and the glow lamp. It warms again once if a phone's start tier changes MSAA or `FORGE_LITE` (45-50 ms) | 1-2 frames over 20 ms in the first 8 strikes of each fresh session (24.8-41.6 ms) | 0 frames over 20 ms in 48 desktop strikes (6 fresh sessions, GPU Chromium and headless shell) and 16 phone strikes. Warm-up is 107-117 ms; desktop Unity ready is 1.30 s |
| Dull throws a 40-50 cm cream cloud over the blade | No puff. 4 dark flakes (at most 560 C) and 2 dust bits of 3-5 cm, at most 16% opaque for 0.45 s, and never more than 4 dust bits alive near the anvil | Mean luma above the blade rises 36 → 122-128 | 25.4 → 25.2 → 25.1 (no change) |
| Keep: the blade goes cold and gets its handle in the tongs before the water | `quenchHold`: no rack cooling and the forging mesh is kept until the blade has dissolved out after the quench | Cold, polished, with a handle by +298 ms; the quench sound came at +568 ms | Still orange at +300 ms and dull red at the dip (+536 ms, quench sound); steam rises off hot steel |
| Left upper arm becomes a spiked fin during the hearth step | A hearth elbow hint below and outside the reach line, the shoulder-cap skin dropped, arm-only weights, and `Forge/Glove` culls upper-arm fragments within 42 cm of the camera during the reach | Spike plus a stretched sheet across the lower-left quarter | Gone at heat 600 / 1200 ms on desktop and phone |
| Anvil face 78 x 30 cm reads as a table | 48 x 13 cm face, 6 cm step, 25 cm horn (about 76 cm long), smaller stump, edge chamfer highlight. The parked hammer rests on the step or horn for long blades | The bar covers about 28% of the face's length on screen | About 53%; the FOV fit is unchanged (desktop median 61.2 deg) |
| Hammer head renders black | Albedo #6e7275, metallic .58 (was .86), fresnel edge sheen; face #b4b7b4 at .88 | Head luma 1-16 (mean 11) | Mean 29, max 125; at contact the side next to the bar is #952905 |
| Cream spot on the anvil in front of the contact | The impact lamp is diffuse only (its specular image on the polished face was the spot), 3 cm over the contact, tinted by the steel's heat | Face below the contact 74 → 179 (#cfaf7c) | 85-117 before → 75-94 (#a63304) at contact: orange, no brighter |
| 1-px white line through the flames | `Fire.shader` fades each non-billboard flame quad by its view angle | A ridge at x 703-708 in 16-24% of rows of every heating frame | No such ridge in any heating frame |
| Mid-forge blades look like carrots and gourds | The point forms over the first 1.2 levels; the outline is kept monotone past the ricasso while it draws out; the bevel thins ahead of the outline; `metal.floorEdgeC` 520 | Rounded tips, mid-blade bulges, rim about 25 luma below the centre | Straight spine and a defined point from level 1; at 22 s on the anvil the rim is about 50 luma below the centre (#710904) |
| Tongs are wire-thin and vanish | 12 x 9 mm reins in #5c5f62 (metallic .5, edge sheen), a riveted boss, a tighter left-hand curl | Reins 2-3 px and near-black; the hot bar seems to float | The reins clearly join hand and bar at the hearth; the fingers close round them |
| Triangles over budget | The static room is merged per material and per 1.5 m cell (110 meshes), so frustum culling drops what the work view cannot see. `web.render.phoneDpr` [2, 1.5, 1, 1] | 107k desktop, 97k phone (488x1055 canvas) | 66k desktop, 32k phone (390x844, the live pixel count). Draw calls 56 desktop, 29 phone |

The gates still pass: forge-cs-check (3 compiles, 6 suites), npm test 9/9, lint, tsc and the vite build. strike.mjs passes 65/65 checks on five profiles. web.mjs passes 78/81 (the same three tier-1 checks miss by design) and audio.mjs 27/27. room.mjs passes 10/10, and metal.mjs passes 36/41 (the five misses are listed below). The scripted day passes 7/7. A 3 min desktop soak holds the heap flat at 154 MB (it was 128 MB) with no frame over 100 ms. On a quieter run, desktop striking p95 / p99 / max is 9.2 / 9.3 / 16.6 ms, and WebKit phone p95 / max is 18 / 37 ms. The machine was on battery and shared with other projects' browsers, so frame times are noisy.

## Known gaps

- **Right sleeve edge on desktop.** The left-arm fix drops the shoulder-cap skin on both arms. On wide desktop views the cut edge of the right upper arm now shows a small pointed corner at the lower-right screen edge in work frames. It does not show on phone portrait or landscape. Fix for the next build: drop the shoulder cap only for the left arm, or keep triangles that have more than 20% arm weight (with the arm-only weights).
- **WebKit drops one frame per impact.** At 60 Hz the frame after nearly every impact takes 23-36 ms, on build 4 and the same on build 2. It repeats on every strike, so it is per-impact work (most likely the flake burst and the knife mesh rebuild), not warm-up. WebKit's first hearth step also has two frames of 54-65 ms, as before.
- **Narrow face and curved blades.** A Karambit's hook now reaches past the near edge of the 13 cm face. Real smiths work like that too, but it reads as overhang.
- **High-DPI desktop.** 2560x1440 CSS at DPR 2 renders 3840x2160 (same as before) and is GPU-bound at 60 Hz. The baseline ran at 120 Hz there. Lowering `web.render.desktopDpr[0]` from 1.5 trades sharpness for frame rate.
- **Fog.** Fog stripping is Automatic and the build scene has no fog, so the Web player most likely lacks the fog variants the editor shows. At these distances fog is about 4% at 3 m, and every stream tuned against the Web look.
- **Anvil glow.** The hot blade lights the anvil patch beside it 1.23x (1.21x on build 2), against a 1.25x target. The anvil is now metallic steel, which shows the glow mostly as a reflection; the old check assumed a diffuse face.
- **Editor-loop checks metal.mjs fails on the integrated scene.** These are stale assumptions, not regressions:
  - The in-coals hue now reads the flames that cover the buried bar.
  - The laser-trail heuristic counts the white fracture edges of the shatter pieces, which strike-feel's slow motion holds longer.
  - The shard dissolve finishes about 0.3 s later, for the same slow-motion reason.
  - Silver at 717 C reads 26.6 deg against a 26 deg limit.
- **No physical phone tested.** Phones start at tier 2 because of that.
- **No scene-side hammer twitch on a refused press.** The page shows a closing ring on the blade and a dry tick instead.
- **Owner decision, not taken.** A faster Flow (8 strikes per window) changes balance and needs owner approval and a simulate rerun.
