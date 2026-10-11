# Ink Maze in Unity: the contract

The page keeps the rules. Unity draws the board and moves the ball with real
physics, but it never decides what a move does.

## Who decides what

- `src/minigames/inkmaze/engine.ts` and `session.ts` decide every move: the
  path, the ink, the colored blocks, win and loss. Nothing in Unity changes them.
- Unity receives the path the engine already computed, rolls a physics ball
  along it, and reports when the ball has come to rest on the last block.
- The HUD, results, level list, undo, restart, keys, swipes, saved bests and
  sound all stay in the page (React, DOM, Web Audio).

## View interface (TypeScript)

`src/minigames/inkmaze/view.ts`

```ts
export type ViewEvent =
  | { type: 'cell'; index: number; step: number; of: number } // ball center entered path block `step` of `of`
  | { type: 'impact'; strength: number; surface: 'wall' | 'rim' } // strength 0..1
  | { type: 'roll'; speed: number }                              // 0..1, about 15 times a second while moving
  | { type: 'settled' }                                           // the ball is at rest on its block

export interface InkMazeView {
  setArt(art: Art): void                                   // the canvas view uses it; Unity loads its own copy
  show(state: State): void                                 // a state at rest: new level, undo, restart
  animate(result: MoveResult, done: () => void): void      // `done` runs exactly once, when the ball has stopped
  finish(): void                                           // end any roll now; its `done` still runs, exactly once
  bump(direction: Direction): void                         // the ball knocks an adjacent wall; nothing changes
  setReducedMotion(reduced: boolean): void
  onEvent: ((event: ViewEvent) => void) | null             // sound and other listeners
  destroy(): void
}
```

`InkMazeRenderer` (canvas, `render.ts`) and `UnityInkMaze` (`unity.ts`) both
implement it. The canvas view emits `cell` events on the same timing it draws,
and an `impact` when a roll ends against a wall or the edge (not when the ink
runs out mid-roll).

## Unity bridge

### Page to Unity

`unityInstance.SendMessage('Bridge', method, argument)`, all arguments strings.

| method | argument |
|---|---|
| `Show` | state JSON: `{"width":4,"height":4,"cells":"....","ball":0,"colored":"1000","ink":15}` |
| `Animate` | `{"id":7,"path":[1,2,3],"state":{...the state after the move}}` (the state before is whatever Unity shows) |
| `Finish` | `""` |
| `Bump` | `up`, `down`, `left` or `right` |
| `SetReducedMotion` | `1` or `0` |

Block index `i` is column `i % width`, row `floor(i / width)`; row 0 is the top
row, the far side of the board.

### Unity to page

A jslib function `InkMazeEmit(type, payloadJson)` runs
`window.dispatchEvent(new CustomEvent('inkmaze:unity', { detail: { type, payload } }))`.

| type | payload |
|---|---|
| `ready` | `{}`: first frame drawn; the page then calls `Show` |
| `cell` | `{"index":5,"step":2,"of":3}` |
| `impact` | `{"strength":0.8,"surface":"wall"}` |
| `roll` | `{"speed":0.6}` |
| `settled` | `{"id":7}`: after `Finish`, sent at once for the roll that was cut short |
| `error` | `{"message":"..."}` |

## Timing

- Any roll, from the call to `Animate` until `settled`, takes at most 760 ms for
  paths of 1 to 16 blocks. The browser test waits 820 ms per move. The canvas
  view uses 90 ms + 58 ms per block, capped at 720 ms; Unity aims for the same feel.
- With reduced motion, `Animate` colors the path, places the ball and sends
  `settled` straight away.
- The page does not trust timing alone: if `settled` for a roll has not arrived
  1500 ms after `Animate`, the page calls `done` itself and calls `Show` with the
  current state.

## Exactness

- When `settled` fires, the ball's rigidbody sits exactly on the center of
  `state.ball`, and the colored blocks equal `state.colored`.
- `Show` replaces everything. It rebuilds the board when the size or the walls
  change; otherwise it recolors the blocks and moves the ball with no animation.
- The last levels allow zero wasted ink, so a ball that drifts, stops between
  blocks or bounces into another block would make the page wrong. Physics shapes
  the motion; the engine decides where the ball ends.
- `Show`: the rigidbody and the colors are exact at once; only the visuals may
  ease, for at most 0.2 s (the marble glides back after an undo or a restart,
  stains retract). The drawn marble is a separate object from the physics body,
  and visual code never writes a rigidbody, a collider or the colored blocks.
- `ready` is sent after the warm-up frames: Unity draws every material, the
  particles and the post-processing once in hidden form during its first three
  frames, then sends `ready` in frame 4, so the first roll does not stall on
  shader compiles.

## Physics

- Ball: a sphere collider (radius 0.32 blocks) with a rigidbody (interpolated,
  continuous collision detection) and a bouncy physic material. During a roll
  its height and the axis across the roll are frozen; it is launched along the
  roll axis.
- Walls: one box collider per wall block. The board edge: rim colliders.
- A roll that ends at a wall or the edge hits it for real. The roll follows a
  planned speed profile (a short spin-up, then braking to an arrive speed that
  sets the impact strength, the same strength the sound used before). The
  collision bounces the ball back; then a planned return (not a spring) brings
  it to the block center along a curve that ends at rest, and it snaps exactly
  at the end. The slowest roll is about 0.54 s.
- A roll cut short because the ink ran out has no wall to hit: the ball brakes to
  a stop on that block, with no impact.
- `Bump`: a small push into the adjacent wall, a real collision, then the same
  planned return brings the ball back (about 0.14 s).

## Look (the same art files)

All images come from `public/assets/minigames/ink-maze/`:

- `floor.png`: a floor block. `ink.png`: a colored block, fading in over about 260 ms
  when the ball rolls onto it.
- `wall.png`: wall blocks, raised boxes (about 0.55 blocks tall), with wall.png on every face.
- `rim.png`: the wooden frame around the board (0.46 blocks wide, slightly raised).
- `table.png`: the table under and around the board, tiled.
- `ball.png`: the marble is a real 3D glass sphere. ball.png is its base color,
  mapped as a matcap facing the camera, so at rest it looks like the image; an
  inner vane and bubbles turn with the rolling, and it casts a real shadow.

Wood and ink get their relief and gloss from the same images: at load the GPU
derives a slope and a grain map from each PNG (no extra downloads). Walls have
chamfered edges, floor tiles have beveled grooves, the rim is a raised tray with
rounded, mitered corners, and the ink is wet and glossy while it spreads, then
dries.

The Unity canvas has the same aspect ratio as `boardAspect(width, height)` in
`render.ts`, so it takes the canvas view's place without the layout moving.
Inside that box the camera looks down at 24 degrees with a 20 degree field of
view and no yaw. On the takeover it starts from a top-down framing that matches
the 2D canvas and lifts into the 3D view; a new level settles in while its walls
rise and the marble drops onto its block.

Rendering: URP 17.5 (Forward, Linear color) with hand-written HLSL shaders
(`InkMaze/Floor`, `Wood`, `Marble`, `Fx`). One sun with soft realtime shadows, a
per-level baked ambient-occlusion texture, a small generated studio cubemap for
reflections, and post-processing (bloom, vignette, color adjustments, dithering;
no tonemapping curve, so lit surfaces keep the images' colors). Impacts jolt the
toy on the table (the camera stays still), make the struck wall twitch and
splash ink drops; a bump puffs a little wood dust. Dry ink has a clear coat: a
long studio strip light reflects in it as a soft band that moves with the
camera. A win makes the marble hop almost half a block and land with a burst of
ink while a glossy sheen sweeps over the board (twice on the big 9 x 9 boards)
and the camera leans in 3%; a loss pulses the blocks still dry. Undo and restart
fade the stains they take back toward each block's centre. With reduced motion,
none of the motion effects run; the look stays the same.

Quality tiers: High (desktop), Medium (phones, iPads, and Safari on a desktop,
whose GPU process costs it about twice what Chromium pays per frame) and Low (weak
or software GPUs: no post-processing, flat relief, fewer particles). Unity picks
the tier itself; `?inkq=low`, `?inkq=medium` or `?inkq=high` in the page's URL
forces one. While playing, a governor lowers the tier (never raises it) when the
90th percentile of 45 moving frames is over 17.5 ms. When nothing moves, Unity
draws about one frame a second. `?inkdebug` lets Unity's start-up log and the
chosen tier reach the console; without it the console stays quiet.

## Build

- Project: `~/UnityProjects/InkMaze`, Unity 6000.5.1f1, Universal Render Pipeline 17.5.
  Another tool works on a different Unity project on this Mac: never open or
  change other projects, and never stop Unity processes this project did not start.
- WebGL build in batch mode (`-executeMethod InkMazeBuild.BuildWebGL`) to
  `public/minigames/ink-maze-unity/`, which contains `Build/InkMaze.loader.js`
  and the framework, wasm and data files.
- Gzip compression with Decompression Fallback on, because GitHub Pages cannot send
  a Content-Encoding header. No splash screen. Every file under 100 MB; the whole
  build targets 8.0 MB or less (about 7.7 MB today). The build warns above
  8.5 MB and fails above 12 MB.
- The build writes `src/minigames/inkmaze/unityBuildVersion.ts` (a hash of the
  build) and `unity.ts` adds it to the file URLs as `?v=`, so a browser never
  mixes a cached old build with a new one.
- Self-test: `Tools/selftest.sh` plays all 20 levels (844 moves) in batch mode
  and checks that every move settles exactly on the engine's block within
  0.76 s of simulated time.

## Page integration

- On the 3D board (reduced motion off), the result screen waits for Unity's
  beat: 700 ms after a win, 450 ms after a loss. The sound and the announcement
  do not wait, and an undo or restart in that moment cancels the screen.
- `src/minigames/inkmaze/unity.ts`: `UnityInkMaze implements InkMazeView`, with
  `load(canvas, whenQuiet?): Promise<void>` that adds the loader script, creates
  the Unity instance and resolves on `ready` (rejects on an error or after 20 s).
  It fetches the three build files itself and inflates the gzip ones with the
  browser's `DecompressionStream` (off the main thread), handing the loader
  `blob:` URLs; on a failure or the timeout it aborts the downloads, so nothing
  keeps running. Unity itself starts only when `whenQuiet` resolves: the page
  waits for the ball to rest and the browser to idle (at most 6 s), because
  starting Unity holds the main thread for a few hundred milliseconds on a phone.
- On Unity's canvas only, WebGL fences are answered at once as signaled. Unity
  polls one twice a frame to limit frames in flight; in Safari each poll is a
  synchronous trip to the GPU process (about 6 ms). WebGL has no mapped buffers,
  so the fences guard nothing, and the browser paces frames itself.
- Keys pressed during a roll wait their turn, up to two, in order.
- The canvas view draws from the first frame, so the game is playable at once.
  Unity loads in the background unless WebGL2 or WebAssembly SIMD and exceptions are missing, `?renderer=canvas` is
  in the URL, or the browser asks to save data. When Unity is ready and no roll
  is running, the page calls `show(current state)` on it and fades it in over the
  canvas. If Unity fails later, the page goes back to the canvas.
- Sound: `src/minigames/inkmaze/sound.ts`, Web Audio, made in code (no audio
  files). The page plays it from view events and game results, and has a sound
  on/off button remembered in `localStorage` (`cgs-inkmaze-sound-v1`).
