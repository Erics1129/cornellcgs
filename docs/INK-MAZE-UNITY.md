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

## Physics

- Ball: a sphere collider (radius 0.32 blocks) with a rigidbody (interpolated,
  continuous collision detection) and a bouncy physic material. During a roll
  its height and the axis across the roll are frozen; it is launched along the
  roll axis.
- Walls: one box collider per wall block. The board edge: rim colliders.
- A roll that ends at a wall or the edge hits it for real: the collision bounces
  the ball back, then a spring with damping pulls it to the block center, and it
  snaps exactly once it is close and slow.
- A roll cut short because the ink ran out has no wall to hit: the ball brakes to
  a stop on that block, with no impact.
- `Bump`: a small push into the adjacent wall, a real collision, then the spring
  brings the ball back.

## Look (the same art files)

All images come from `public/assets/minigames/ink-maze/`:

- `floor.png`: a floor block. `ink.png`: a colored block, fading in over about 260 ms
  when the ball rolls onto it.
- `wall.png`: wall blocks, raised boxes (about 0.55 blocks tall), with wall.png on every face.
- `rim.png`: the wooden frame around the board (0.46 blocks wide, slightly raised).
- `table.png`: the table under and around the board, tiled.
- `ball.png`: drawn as a sprite that always faces the camera, riding on the
  physics sphere, with a soft shadow under it.

The camera looks down with a slight tilt and frames the board, rim and table
margin (0.55 blocks) at the same aspect ratio as `boardAspect(width, height)` in
`render.ts`, so the Unity canvas can take the canvas view's place without the
layout moving. Light: one directional light with soft shadows; colors stay
close to the images. An impact gives a very small camera shake and a few ink
droplets.

## Build

- Project: `~/UnityProjects/InkMaze`, Unity 6000.5.1f1, built-in render pipeline.
  Another tool works on a different Unity project on this Mac: never open or
  change other projects, and never stop Unity processes this project did not start.
- WebGL build in batch mode (`-executeMethod InkMazeBuild.BuildWebGL`) to
  `public/minigames/ink-maze-unity/`, which contains `Build/InkMaze.loader.js`
  and the framework, wasm and data files.
- Gzip compression with Decompression Fallback on, because GitHub Pages cannot send
  a Content-Encoding header. No splash screen. Every file under 100 MB; the whole
  build should stay under about 8 MB.

## Page integration

- `src/minigames/inkmaze/unity.ts`: `UnityInkMaze implements InkMazeView`, with
  `load(canvas): Promise<void>` that adds the loader script, creates the Unity
  instance and resolves on `ready` (rejects on an error or after 20 s).
- The canvas view draws from the first frame, so the game is playable at once.
  Unity loads in the background unless WebGL2 is missing, `?renderer=canvas` is
  in the URL, or the browser asks to save data. When Unity is ready and no roll
  is running, the page calls `show(current state)` on it and fades it in over the
  canvas. If Unity fails later, the page goes back to the canvas.
- Sound: `src/minigames/inkmaze/sound.ts`, Web Audio, made in code (no audio
  files). The page plays it from view events and game results, and has a sound
  on/off button remembered in `localStorage` (`cgs-inkmaze-sound-v1`).
