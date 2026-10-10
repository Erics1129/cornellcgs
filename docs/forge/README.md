# Forge or Fold

A Unity 6 forging game embedded at `/minigames/forgeOrFold/`. The mini-games directory links to it alongside Ink Maze. Only this game, its route, and that directory were changed.

## Run locally

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 5212
```

Open `http://127.0.0.1:5212/minigames/forgeOrFold/`. The checked-in Unity Web build is ready to play; Unity is not needed to run the website.

To change and rebuild the Unity scene, open `unity/ForgeOrFold` in Unity **6000.3.18f1**, with **Web Build Support** installed. Open `Assets/Scenes/Forge.unity`. The workshop is constructed by `ForgeWorld` when play begins. The website supplies the saved knives and game actions.

```sh
npm run forge:unity
npm run build
node scripts/stubs.mjs
```

`UNITY_EDITOR` can override the editor executable path. Close the Unity editor before using the batch build on the same project. `ForgeBuild.Web` creates the scene and emits the Web player to `public/unity/forge`. The web build uses gzip with JavaScript decompression fallback, so GitHub Pages needs no custom response headers. Run `npm run build` after any Unity rebuild.

## Controls

You control a rigged blacksmith in a walkable Unity room. **WASD / arrows** move, **Shift** runs, and dragging the scene turns the camera. Walk up to a station and press **E** to handle it. Pick up a crate blank, carry it to the furnace, place it in the fire, wait two seconds, pick it up, then carry it to the anvil. **Space** swings the character's hammer. **F** activates Flow. **1 / 2 / 3 / 4** use guard, rewind, hone stone, and stamina.

At the shop **Q / R** browse stock and **E** buys. At a crate or rack Q/R choose a knife. Carry knives to the scale to sell or the rack to keep them. Hold E beside the lantern to finish the day. The next-hit board appears beside the anvil. The core loop requires no on-screen action buttons.

On touch screens, hold the Minecraft-style directional pad to walk; release to stop. Two directions can be held together. Near a crate, rack or shop, the ‹ / › thumb controls browse knives or stock. At the anvil, available one-use items appear above the movement pad. Drag the scene's right side to look, and use the thumb controls **Handle**, **Hammer**, and **Flow**. The left-side drag gesture remains available. Tap a station to walk to it and interact; tap the anvil to hammer, or hold it to pick up the knife. H opens instructions and L opens scores.

**V** or the expand icon enters native full screen where supported. On iPhone browsers without that API, it fills the available viewport. The same icon exits, and Escape returns to the page. Portrait and landscape touch controls respect screen safe areas. Enter submits the smith name on the final score screen. Audio settings are remembered and reduced motion is respected.

## Source map

- `unity/ForgeOrFold/Assets/Scripts/ForgeWorld.cs`: actual Unity room, procedural knife geometry, carried-object springs, hammer, pooled sparks/shards, evolution, fire and lighting.
- `unity/ForgeOrFold/Assets/Scripts/ForgeSmith.cs`: controllable human, walk/run/idle blending, hand IK, camera orbit, collision and physical station interactions.
- `unity/ForgeOrFold/Assets/Shaders`: physically based blade heat/material shader, animated generated flame, additive ring.
- `unity/ForgeOrFold/Assets/Editor/ForgeBuild.cs`: reproducible Web player build.
- `src/minigames/forge/unity.ts`: Unity loading, pointer input and state/event bridge, lifecycle cleanup.
- `src/minigames/forge/engine.ts`: deterministic, browser-free rules, also used by the server and simulations. Unity never decides a score.
- `src/minigames/forge/config.ts`: all gameplay numbers, metals, charms and prices.
- `src/minigames/forge/ForgePage.tsx`, `forge.css`: accessible HUD, shop, tutorial, market, winner and scores.
- `src/minigames/forge/audio.ts`: procedural Web Audio, no sound files.
- `src/minigames/forge/storage.ts`: replay-based save/resume, device identity and score/API fallback.
- `src/minigames/forge/knives.ts`, `KnifePortrait.tsx`: eight shared knife silhouettes and score portraits.
- `backend/forge`: Cloudflare Worker + D1 schema and config. See [backend setup](BACKEND-SETUP.md).
- `public/unity/forge`: compiled Unity Web player, served on the existing host.
- `scripts/test-forge*.mjs`, `forge-simulate.mjs`: rules, server integration and seeded strategies.

## Balance

`npm run forge:simulate` runs 2,000 fixed seeds for each of three policies, plus prints exact odds and expected value for levels 0–20. Policies earn income from level-three iron, invest in bronze/steel/silver, keep a masterwork across days, and purchase available protection. They never inspect future random outcomes.

| Policy | Median level | Median score | 90th-percentile score | Maximum score |
|---|---:|---:|---:|---:|
| Careful, stop at 9 and wait overnight without protection | 9 | 22,547 | 46,420 | 69,631 |
| Balanced, target 11 | 11 | 50,731 | 104,446 | 156,669 |
| Bold, target 18 | 8 | 15,031 | 866,784 | 2,676,832 |

The bold policy finished without a surviving knife in 598/2,000 runs. Careful survivors were predominantly steel (1,246), then silver (391) and bronze (338). These describe the supplied strategies, not guaranteed player outcomes. The requested base odds, seven days, free iron, stamina and 1.5 level multiplier are unchanged.

## Validation

`npm test` covers existing solver and Ink Maze, 501 levels of normalized forge odds, value/EV, guards, rewind with fresh RNG, Flow, ownership, day transitions and deterministic replay. It also runs the actual Worker against an in-memory SQLite implementation of D1: tampered/unfinished runs, identity proof, cooldown, one-use tickets, name cleaning, top 50 and an own rank outside the top 50. `npm run lint` checks the new game and backend; `npm run build` typechecks the entire site.

Browser checks use Chromium desktop and WebKit at 390×844, with an actual Unity Web player. Physical mid-range phone performance is not certified by browser emulation. Unity targets 60 fps, caps web rendering resolution, batches the static room, reuses impact particles and disables shadows on narrow screens or sustained slow frames.

## Decisions and assumptions

- The user's later Unity instruction supersedes the brief's Three.js preference. The actual 3D game runs in Unity; the shared deterministic rules remain TypeScript to avoid divergent scoring implementations and to stay callable by a future AI. No Three.js renderer is shipped for this game.
- The reference informs workshop atmosphere and a dark brass/green HUD. Workshop models, knives, text, invented items and generated textures are original; the humanoid and locomotion clips come from Unity’s official Standard Assets repository under its Companion License. No reference-site assets were copied.
- The later image-generation request permits generated workshop textures and a flame animation atlas. Knives and audio remain code-built as originally requested. No generated still image is presented as a 3D room: the playable room has real Unity geometry.
- Auricite is the invented eighth metal. New runs start with 180 gold, one guard and one rewind. Prices and twelve charms are in the shared config.
- Heat is required once per knife. Cooling is visual. Time pauses when the page is hidden. The traveling buyer arrives at the sixth and fourteenth strike each day, remains 24 visible seconds, and offers 70–170% before charm effects.
- Days 1–6 retain rack knives only; holding Handle/E at the lantern deliberately clears the others. Day 7 scores every knife still owned. Rewind restores the affected knife and stamina, but does not rewind the random stream or cumulative strike count.
- With no backend URL, the game explicitly uses local scores. A world-eligible run needs a server-issued seed ticket; an old offline run cannot be submitted later as verified.
- Device identity is browser-local, not an account. Clearing storage creates another identity. Legal deterministic replay blocks invented scores and illegal ownership; it is not bot prevention or protection against searching a known seed. A competitive tournament would need server-issued per-action randomness/authentication.
- No paid assets, Unity services, external audio or new hosting plan are required. The backend account is created by the user.

Character source and license are recorded in `public/unity/forge/THIRD-PARTY-NOTICES.txt`. The Unity-only assets must retain that license notice. Holding a knife is a visual interaction state; reloading returns it to its last saved station.
