# Forge or Fold

A first-person Unity 6 forging game embedded at `/minigames/forgeOrFold/`. The mini-games directory links to it alongside Ink Maze. Only this game, its route, and that directory were changed.

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

**Space** or **Start forging** prepares a blank in one action: it heats for two seconds, then moves to the anvil. Tap the blade or press Space to strike. The character approaches the anvil automatically; each strike still requires an explicit player action. **New** prepares another blank and keeps the previous blade on the rack if there is room. Tapping a knife in the inventory brings that blade to the anvil.

**Keep** puts the selected blade on the rack. **Sell** immediately sells the selected blade for the price shown on the button. **Trade / T** opens a Buy/Sell tray from anywhere. Prices, missing gold, and remaining stock are visible before buying. **Buy & forge** buys a blank, heats it, and puts it on the anvil without spending a strike. The Sell tab lists every owned knife by sale value, marks kept blades, and shows its metal’s current market rate. Expand **Today’s market** for all eight rates and changes since yesterday. A traveling buyer’s active quote appears in the tray with its premium or discount against the normal sale price. Transactions briefly lock to prevent accidental double-tap sales. **Rest** previews and saves the four most valuable knives using ordinary legal rack moves, then advances the day. It explicitly states how many lower-value blades will be cleared. Day seven scores the best held knife.

You see through the rigged blacksmith’s eyes in a walkable Unity room. **WASD / arrows** move, **Shift** runs, and dragging the scene turns the camera. Walking or dragging releases the anvil focus while keeping the camera at eye level. **E** picks up or places objects near a station; tapping the shop approaches it; E or the Trade control opens its tray. **Q / R** choose local knives, **F** activates Flow, and **1 / 2 / 3** use guard, rewind and hone. H opens help and L opens scores.

On touch screens, hold the directional pad to walk; two directions can be held together. Drag the scene to look. **Handle** performs physical interactions, and the large **Forge** control or a tap on the work area swings the hammer. The game fills the viewport by default. **V** or the expand icon requests native fullscreen where supported. Escape exits. The name field submits with Enter. Sound settings are remembered and reduced motion is respected.

## Art and presentation

The eye-level camera, human-scale workshop, animated hand grip, hammer arc, tongs, scale flakes, shatter pieces, bloom and generated surface materials are part of the actual Unity renderer (built-in render pipeline, no URP). The generated material atlas is split by `ForgeMaterialImport` and applied to 3D wood, stone, steel and leather. The room includes a curved hearth, quench barrel, bellows, chain links, offcuts and drifting dust. Generated loading and trade illustrations are separate from gameplay. See [the first-person redesign, current texture prompt, and validation](FIRST-PERSON-REDESIGN.md), plus [the earlier generated assets](GENERATED-ASSETS-V2.md).

## Source map

- `unity/ForgeOrFold/Assets/Scripts/ForgeWorld.cs`: actual Unity room, procedural knife geometry, carried-object springs, hammer, pooled sparks/shards, evolution, fire and lighting.
- `unity/ForgeOrFold/Assets/Scripts/ForgeWorkshop.cs`: human-scale room and station geometry, mixed lighting, reflection capture, and held-hammer motion.
- `unity/ForgeOrFold/Assets/Scripts/ForgeSmith.cs`: controllable human, walk/run/idle blending, hand IK, first-person camera, collision and physical station interactions.
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

Browser checks use Chromium desktop and WebKit at 390×844, with an actual Unity Web player. Physical mid-range phone performance is not certified by browser emulation. Unity follows the browser's frame rate (targetFrameRate -1 with vSync on the WebGL quality level), chooses the render resolution and anti-aliasing per quality tier, batches the static room into about 21 meshes, draws all particles in at most three batched meshes, and steps down a tier after sustained slow frames (at most one recovery per session).

## Decisions and assumptions

- The user's later Unity instruction supersedes the brief's Three.js preference. The actual 3D game runs in Unity; the shared deterministic rules remain TypeScript to avoid divergent scoring implementations and to stay callable by a future AI. No Three.js renderer is shipped for this game.
- The reference informs workshop atmosphere and a dark brass/green HUD. Workshop models, knives, text, invented items and generated textures are original; the humanoid and locomotion clips come from Unity’s official Standard Assets repository under its Companion License. No reference-site assets were copied.
- The later image-generation request permits generated workshop textures and a flame animation atlas. Knife geometry and audio remain code-built; blade surfaces use generated steel texture. No generated still image is presented as a 3D room: the playable room has real Unity geometry.
- Auricite is the invented eighth metal. New runs start with 180 gold, one guard and one rewind. Prices and twelve charms are in the shared config.
- Heat is required once per knife. Cooling is visual. Time pauses when the page is hidden. The traveling buyer arrives at the sixth and fourteenth strike each day, remains 24 visible seconds, and offers 70–170% before charm effects.
- Days 1–6 retain rack knives only; the Rest confirmation moves the best four onto the rack before ending the day. Day 7 scores every knife still owned. Rewind restores the affected knife and stamina, but does not rewind the random stream or cumulative strike count.
- With no backend URL, the game explicitly uses local scores. A world-eligible run needs a server-issued seed ticket; an old offline run cannot be submitted later as verified.
- Device identity is browser-local, not an account. Clearing storage creates another identity. Legal deterministic replay blocks invented scores and illegal ownership; it is not bot prevention or protection against searching a known seed. A competitive tournament would need server-issued per-action randomness/authentication.
- No paid assets, Unity services, external audio or new hosting plan are required. The backend account is created by the user.

Character source and license are recorded in `public/unity/forge/THIRD-PARTY-NOTICES.txt`. The Unity-only assets must retain that license notice. Holding a knife is a visual interaction state; reloading returns it to its last saved station.


## October 10 rules and HUD update

Energy is unlimited. Rest remains a deliberate choice to advance the market/day and retain the four best knives. Obsolete energy items are no longer sold; migration refunds unused tea and the energy charm at their base prices.

Flow now charges over 10 strikes on the same knife (8 with Copper rhythm). The next strike automatically starts a 4-second window with no shatter risk, a 1.5× hammer animation and a visible countdown. Quiet tide extends it to 5 seconds. Players may also activate a charged blade using F or the Flow control. Chip and Dull remain possible. One press can be held during a swing and lands on the next beat (below 20% shatter risk, or in Flow); at 20% or more, presses within 250 ms of a result are refused with a dry tick and a small ring on the blade, so you see the result first. No strike repeats without input. The bar above the anvil uses the exact modified next-hit probabilities, including charged/active Flow and Guard.

Rules version 2 records integer millisecond clock actions and rejects strikes closer than 350 ms during replay. The animation is slower than that bound. Old action logs replay under version 1 before a deterministic upgrade preserves knives, market, day and gold; old world tickets become local runs rather than being submitted under different rules. Existing local scores remain. The backend must use the current shared rules when configured.

Panels open only through intentional controls. Empty inventory produces a small prompt instead of opening Trade. Looking toward the shop or lantern approaches the station; interaction is separate. The masterwork view can close without reopening Scores or another result dialog.

For development QA only, `?forge-qa=flow`, `?forge-qa=ended`, and `?forge-qa=empty` load actual seed-1 action replays and do not write a run save. The fixture branch is removed from production builds. `test-forge-input.mjs` covers drag-return and shortcut regressions; `test-forge-flow.mjs` covers timing, unlimited energy, odds, cooldown, migration and deterministic replay.

## October 12 feel upgrade

Everything below is presentation; the rules, odds, prices, Flow strike count (7 protected strikes in 4 s, about 595 ms apart), saves, replays and scores are unchanged, and `node scripts/forge-simulate.mjs` prints the same bytes as before.

- Each strike carries a sequence id (Strike(seq) -> swing, impact, settled with that id). Only Unity's `impact` resolves a hit. The hammer lands about 190 ms after the press (215 ms from rest), each outcome has its own hit-stop and directional camera kick, and the swing cycle is 640 ms (595 ms in Flow).
- Start forging is a short step to the hearth with tongs, a bellows pull and a return; the Motion setting (Full / Reduced / Off) and the OS reduced-motion flag turn off camera turns, shake, hit-stop and slow motion.
- Temperature is presentation only: blackbody colour calibrated through the real lighting and tonemap, edge-first cooling to a 650 C floor on the anvil, no reheat dip, quench on Keep, continuous cooling on the rack. Heat is still required once per knife.
- Scale flakes (CPU batched billboards with plane collisions) replace the cube sparks, which removes the old laser-trail bug. A Chip cuts a visible notch; a Shatter breaks the blade into 10-16 pieces and the HUD holds what was lost.
- The room is closed (door, ceiling, sealed window), lit by a hanging oil lamp and a flickering hearth, with a lofted steel anvil, baked contact shading and properly scaled brick.
- Feel numbers live in `src/minigames/forge/feel-tuning.json` (sections strike, metal, room and web). Unity clamps them and echoes the effective values as `data-tuning`; changing them needs only `npm run build`, not a Unity rebuild. Shipped overrides: phones start at quality tier 2 until a real-phone run passes, and the evolution ring is off (`strike.ringAlpha` 0).
- QA: `node scripts/forge-qa/run-all.mjs --url <served page> --baseline <baseline.json>` runs the baseline metrics and every stream's live checks; `scripts/forge-qa/sheets.mjs` films live contact sheets; `node scripts/forge-cs-check.mjs` compiles the Unity C# and runs its pure tests without the editor. See [FEEL-UPGRADE.md](FEEL-UPGRADE.md) for the before/after numbers.

