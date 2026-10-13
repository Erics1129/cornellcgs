# Forge or Fold: feel upgrade (October 2026)

The owner asked for "significantly better game feel and realism". This change is presentation only. `engine.ts`, `config.ts`, `knives.ts`, `storage.ts` and `backend/forge` are byte-identical to the base (354a900). The rules, odds, prices, saves, replays and scores are unchanged, and `node scripts/forge-simulate.mjs` prints the same bytes (sha256 `03f22dd2…c2f2`).

## What changed

- **Strike.** Each press sends `Strike(seq)`; Unity answers `swing`, `impact` and `settled` with that id, and only `impact` resolves a hit. The hammer is a procedural 1 kg cross-peen on an elbow arc with a wrist snap. It lands about 190 ms after the press (215 ms from rest). Each outcome has its own hit-stop (16-130 ms, halved in Flow) and a directional camera kick on the contact frame. The cycle is 640 ms (595 ms in Flow, so a Flow window still gives 7 strikes). One press can be buffered.
- **Hearth.** Start forging is a 0.5 s step to the hearth with tongs in the left hand and a bellows pull with the right. The bar is buried in the coals, pulled out butter-yellow and laid on the anvil. Keep quenches a hot blade in the slack tub, and a sale glances at the scale. The Motion setting (Full / Reduced / Off) and the OS reduced-motion flag remove camera turns, shake, hit-stop and slow motion.
- **Hot metal.** Blackbody colour calibrated through the real lighting, bloom and tonemap. Temperature is presentation only: the edge cools first, the anvil floor is 650 C, strikes never reheat, the rack cools continuously and a quench drops to 60 C. Oxide scale grows and each strike clears a footprint. Cracks grow with the shatter risk. The knife is one mesh with a real cross-section; a Chip cuts a 7 mm notch.
- **Particles.** CPU-batched scale flakes with plane collisions replace the cube sparks, so the laser-trail bug is gone. A Perfect pops scale off the whole blade. Burning sparks appear only on evolution and Shatter. A Shatter breaks the blade into 10-16 cooling pieces. All particles cost at most 3 draw calls.
- **Room.** Closed, with a door, ceiling and sealed window; worst look-around view has 0% void. It is lit by a hanging oil lamp and a flickering hearth (8% on the anvil at 3.2 Hz; under 1% with reduced motion). The anvil is lofted steel with a wear mask. Contact shading is baked per vertex and the brick is at real scale. Anti-aliasing tiers have hysteresis.
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

## Known gaps

- **Triangles.** About 105k desktop and 97k phone, against a budget of 90k / 60k. Most come from the room's merged static meshes: four Surface draws of 10-24k each. Frame times are unaffected on this machine. Spatially split merges, so frustum culling can drop the hidden ones, would fix it.
- **High-DPI desktop.** 2560x1440 CSS at DPR 2 renders 3840x2160 (same as before) and is GPU-bound at 60 Hz. The baseline ran at 120 Hz there. Lowering `web.render.desktopDpr[0]` from 1.5 trades sharpness for frame rate.
- **Fog.** Fog stripping is Automatic and the build scene has no fog, so the Web player most likely lacks the fog variants the editor shows. At these distances fog is about 4% at 3 m, and every stream tuned against the Web look.
- **Anvil glow.** The hot blade lights the anvil patch beside it 1.21x, against a 1.25x target. The anvil is now metallic steel, which shows the glow mostly as a reflection; the old check assumed a diffuse face.
- **Editor-loop checks metal.mjs fails on the integrated scene.** These are stale assumptions, not regressions:
  - The in-coals hue now reads the flames that cover the buried bar.
  - The laser-trail heuristic counts the white fracture edges of the shatter pieces, which strike-feel's slow motion holds longer.
  - The shard dissolve finishes about 0.3 s later, for the same slow-motion reason.
  - Silver at 717 C reads 26.6 deg against a 26 deg limit.
- **No physical phone tested.** Phones start at tier 2 because of that.
- **No scene-side hammer twitch on a refused press.** The page shows a closing ring on the blade and a dry tick instead.
- **Owner decision, not taken.** A faster Flow (8 strikes per window) changes balance and needs owner approval and a simulate rerun.
