# Interaction stream: assets and hand-off

Stream "interaction" of the cinema build (branch `cinema-s-interaction`).

## Assets

None. This stream generated no images, video, audio, fonts or textures and added no npm
dependency. Everything it ships is code and CSS.

## What other streams can rely on

### `src/lib/tier.ts` (contract file, every stub export kept)

- `tier()`, `onTier()`, `reportFrame(dtMs, continuous)`, `initTier()` as in the stub.
- Added fields on `Tier`:
  - `continuous: boolean`: false under reduced motion, Low Power Mode or governor level 4.
    A scene with its own clock must not run a loop while it is false; it still draws on
    input, on scroll and on settle.
  - `slowNetwork: boolean`: save-data or a 2g/3g connection. The warm-up queue should skip
    heavy downloads while it is true.
- Added functions:
  - `excuseFrames(ms = 250)`: the scene manager calls it in a frame where `prepare()`, a
    texture upload or a decode ran, so the governor does not judge those frames.
  - `governorState()`: for `window.__film.state()` and the probe.
- Table change from the spec (its critique asked for it): `contextsAlive` is 4 on `low`,
  `phone` and `tablet` (was 2, 2, 3).
- The governor only moves when somebody calls `reportFrame`. The stub scene manager never
  does, so on this branch the level stays 0 unless forced with `?fx=`.
- A level change is published only while `deckFrame().idle && rest >= 1`; otherwise it waits
  for the `cgs:settle` window event.
- Level 4 reports `name: 'low'` and mirrors `html[data-tier='low']`; the memory-shaped
  values (contexts, texture size, sequence window) stay those of the real device so a
  governor step never forces re-uploads.
- Dev: `?tier=phone`, `?fx=3`, and `window.__tier` (`tier`, `state`, `report`, `setLevel`,
  `measure`).

### `src/lib/look.ts` (contract file, every stub export kept)

- `look()`, `onLook()`, `tiltState()`, `requestTilt()`, `initLook()` as in the stub.
- Added: `LOOK_TARGETS`, `LOOK_STAGES`, `lookState()`.
- `--lx` / `--ly` are written on `LOOK_TARGETS` inside every chapter that is in view (a
  superset of "the active chapter", so a neighbour on screen is never stale), never on
  `:root`. Two targets are added to the spec's six so film can light them from CSS alone:
  `.identity-figure` (the Who-we-are cube) and `.stats-scene > .container-site` (the Stats
  rows). Any other element can opt in with `[data-look]`.
- With a pointer on the page, `--lx/--ly` are the pointer. With none (every phone), `--ly` is
  where the container sits in the viewport (-1 top, 1 bottom) and `--lx` leans toward the
  last touch plus a slow wander tied to the scroll position. So one lamp fixed in the room
  lights the cards as they scroll past, with no sensor and no permission.
- A finger on a stage in `LOOK_STAGES` (`.poker-location`, `.vision-eye-stage`,
  `.soda-stage`, `.earth-globe`, or anything with `[data-look-stage]`) drives the vector with
  `source: 'touch'`. Listeners are passive; scrolling is never blocked.
- The idle drift (amplitude 0.15) runs only while `tier().continuous`, at least one
  `onLook` listener exists, nothing else is driving the vector and the active chapter is one
  of `top`, `world`, `anyone`, `join`, `vision`.
- Tilt is opt-in. Nothing in the site prompts for it. `requestTilt()` works when called from
  a tap; on Android (no permission step) it starts on the first touch. Not tested on a
  device.

### `src/components/InputLayer.tsx`

Renders nothing. Press feedback (0.97 in 80 ms after an 80 ms wait, called off by 8 px of
movement) through the Web Animations API on the `scale` property, and swipe-to-flip on
`.people-slot` by clicking that card's own `.people-flip-control`. To give any new element
press feedback add `data-press`.

### CSS hooks this stream owns

- `--safe-top/right/bottom/left`, `--nav-bar` (the bar: 4rem, 48 px on a phone on its side),
  `--nav-h` (bar plus top inset). Defined on `html[data-page='deck'|'sub']`.
- `html[data-page]` is set in `index.html` before any style applies: `deck`, `sub` or `game`.
  `initTier` and `initLook` do nothing on `game`. `SubPage.tsx` calls `initDeck()`.
- `html[data-tier]`, `html[data-fx-level]`.
- `--rail-surface: light | dark` on a chapter root tells the side rail which ink to use over
  that chapter. With nothing declared, Events is treated as the one light sheet (today's
  look). If Events goes dark, film sets `#events { --rail-surface: dark }`.
- `.cgs-nav-bar`, `.cgs-nav-row`, `.cgs-nav-progress` (the 2 px progress line under the bar
  below the `lg` breakpoint), `.hero-magnet` (wrapper the magnetic pull moves),
  `[data-hero-hint-fade]`.

## For integration

1. `deck.css` must remove the stage min-heights (`.scene-stage` 640/730/810 px,
   `.earth-intro`, `.earth-place`). The phone-landscape and short-phone layouts here were
   built and checked against that promise with a test-only style
   (`.scene-stage,.earth-intro,.earth-place{min-height:0}`), which is not in the repo.
   Without it a phone on its side gets a 730 px stage in a 390 px screen.
2. ML on phones: `responsive.css` moves `.scroll-film` itself (bottom-anchored box, or the
   right 48% in landscape) and makes the image and video fill it. It also adds one black
   feather overlay (`.scene-chapter--ml .scroll-film::before`) and removes the old
   `mask-image` there, because the box now has a visible edge. That overlay is paint; film
   owns its final look and may replace it.
3. Film: the ML copy scrim on phones (`.scene-chapter--ml .scene-content` gradient) should
   cover the whole step list; step 5 can sit over the brightest part of the glyph burst on
   a 390x664 screen.
4. `main.tsx` calls `initTier()` and `initLook()` on every route; both return early on the
   mini-game routes because of `html[data-page='game']`. If scroll-core changes how the page
   kind is set, keep that attribute or pass the kind in.
5. `scroll.ts` (scroll-core) still owns the card flex with scroll speed. `cardMotion.ts`
   keeps `dealCard`, `flipCard`, `hoverLift`, `observeCardLayout`, `fanLayout` and
   `shadowStyle` with the same signatures; `observeCardLayout` now calls
   `requestRefresh('cards')`.
6. Entry bundle, measured with `vite build` against d74af70: JS 207.1 to 213.4 kB gzip
   (tier 2.4, look 2.4, InputLayer 1.2, the stub deck 1.6, small deltas), CSS 38.2 to 41.1 kB
   gzip. The JS budget of 215 kB is nearly used; the stub deck is replaced by the real one
   and scroll-core's deletions (transitions, textFx) have to pay for it.
7. Not checked on a real device: safe-area insets with `viewport-fit=cover`, the URL bar,
   tilt, Low Power Mode detection, 120 Hz. In headless Chromium the refresh probe read 120 Hz.
