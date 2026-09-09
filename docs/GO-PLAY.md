# Automatic Go study

The AlphaGo chapter now presents an illustrative legal Go game. It is not a reconstruction of an AlphaGo match. The same charcoal board and porcelain/obsidian materials are retained, but the stones are separate objects that can fall onto intersections and be captured.

## Rendering

`scripts/render-go-play.py` reuses the procedural Blender scene in `scripts/render-go-scene.py`. It exports an empty 1536×1024 board, two transparent 256×256 stone sprites and the exact camera projection in `public/assets/scenes/go-play-*`. PNG originals and production WebP files are retained. The three WebP materials total approximately 98 KB. No external models or images are needed.

The browser projects each intersection, stone height, contact shadow and circular wave using that exported camera matrix. A 420ms accelerated drop lands exactly on the board. Contact shadows tighten as the stone descends. Two fading rings expand along the board plane; perspective makes the circles elliptical on screen. Previously placed stones are cached and redrawn as one image, with only the current stone, captures and rings painted each frame. Drawing resolution is bounded. The phone layout gives the board its own space below the title.

## Game and impacts

`src/effects/goGame.ts` validates a 39-move alternating sequence on a 19×19 board. The first 12 stones establish the position. Subsequent moves arrive approximately every 1.72 seconds, including one real capture when a group loses its final liberty. The final position holds, fades out and restarts smoothly. Reduced motion shows the complete position.

A landing triggers a decaying 290ms camera impulse, capped at 2.5 CSS pixels on desktop and 1.25 on phone. It moves only the AlphaGo chapter's inner camera. Navigation, neighboring chapters, the document scroll position and the global shake event are untouched.

The clock runs only when the chapter occupies most of the visible viewport, the loader has finished, the document is visible, the navigation menu is closed, and the user has not paused the game. Live geometry is checked before every animation frame and on scroll. Each impact additionally checks that the just-landed stone is on screen. Leaving the chapter immediately removes its camera transform and suspends the clock; returning does not replay missed impacts. Page hiding also suspends the sequence, without accumulating elapsed time.

## Checks

Run `node scripts/test-go-game.mjs` for move legality, captures, occupied intersections, suicide rejection, unchanged input boards, exact contact timing, continuous repeat fades and the reduced-motion final position.

Chromium and WebKit checks at 1440×900 and 390×844 verified automatic progression, actual landing-linked impacts, fast scroll-away during an impact, pause/resume, navigation-menu suppression, hidden-document suppression, reduced motion, readable copy in all five themes, and no horizontal overflow. No runtime errors or missing assets were recorded. Actual contact frames were visually reviewed on desktop and phone.

Local median / p95 frame intervals were approximately 9.3 / 25ms for Chromium desktop, 8.3 / 9.3ms for Chromium phone, 17 / 19ms for WebKit desktop and 17 / 18ms for WebKit phone. These are test-host measurements, not guarantees for every device.

Additional 232×480, 820×1180 and 2560×1440 checks showed no horizontal overflow and the correct reduced-motion board. With a stone image deliberately unavailable, the original complete board remained visible and the inactive playback control stayed hidden.
