# Film stream: assets, how each was made, and what the look expects from the other streams

Every file below was generated in this repo by a script that is checked in. Nothing was downloaded.

## New assets

| File | Size | Made by | Notes |
|---|---|---|---|
| `public/assets/film/grain-256.png` | 32 kB | `node scripts/cinema/make-noise.mjs` (defaults: size 256, seed `0xC65F11A`) | Indexed PNG, 16 palette entries with alpha. White or black speckle whose alpha is the noise amplitude; dark speckle held at 60 % so ivory stock and white type stay clean. Pure white noise from a seeded mulberry32 generator, so the tile has no seam. Drawn at 256 px on 1x screens and 128 px on 2x and 3x (one speckle is 1 to 1.5 device pixels). Used by `.film-lens__grain` in `src/styles/film.css`. |
| `public/assets/film/posters/universe-0.webp`, `-1.webp`, `-2.webp` | 40, 29, 59 kB | dev server on 5712, then `<node with playwright> scripts/cinema/universe-posters.mjs http://127.0.0.1:5712/` | One 1280x800 still per leg of the Universe run (progress 0.20, 0.52, 0.93), exported from the real shader through the dev-only hook `window.__filmShots.universe(p)`. Re-run after any change to `src/effects/universeShader.ts` or the universe grade. |
| `public/assets/film/earth-nasa-july-2048.webp` | 233 kB | `<node with playwright> scripts/cinema/earth-2048.mjs` | Half-size copy of `public/assets/earth-journey/earth-nasa-july-4096.webp` (NASA, credit unchanged in `public/assets/earth-journey/credits.json`). Used on tiers whose `textureMax` is 2048 (phone, tablet, low): a quarter of the upload and of the GPU memory. |

`<node with playwright>` on this machine is `/Users/eric/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`; the scripts take the path of Playwright's `index.mjs` as their last argument.

## Not made in this pass

- Hero clips at a lower bitrate (targets 9 MB and 4 MB) with the grade baked in. The hero is a plain `<video>` (there is no city shader in use; `codeCityShader.ts` was dead code and is deleted). Until the re-encode, the hero keeps its CSS filter on `.code-city__view` (`src/styles/global.css`). The 4K file is no longer selected automatically.
- Go board re-render, Display P3 output, halation.

## What film styles in other streams' markup (names it relies on)

| Hook | Owner | Film's use |
|---|---|---|
| `.seam[data-seam][data-from][data-to] > i.seam__veil, i.seam__light` | scroll-core | Paint only (film.css section 5). The paint assumes both `<i>` boxes start `--seam-up` (or `--seam-reach`) above the boundary and end `--seam-down` (or `--seam-reach`) below it. A veil never reaches farther than 9svh, whatever the box. |
| `html[data-page='deck' | 'sub']` | scroll-core (main.tsx) | `html[data-page] { background-color: var(--film-black) }`. Until main.tsx sets it, `FilmLens` sets it on mount. |
| `html[data-scroll='moving' | 'flying']` | scroll-core (deck) | Pauses the grain's 12 fps stepping while the page moves. |
| `[data-film-enter]` + `--e` | scroll-core | Styled only on picture layers: `.scroll-film`, `.earth-globe`, `.soda-canvas`, `.vision-eye-stage`, `.universe-plate`. Text wrappers get nothing. |
| `--run-universe` | scroll-core (deck.css) | `universe.css` reads it with fallbacks 520svh and 440svh (under 768 px). The old 650svh / 550svh are gone. |
| `--lx`, `--ly` on `.community-board`, `.project-table`, `.people-grid`, `.join-stage`, `.agenda-list` | interaction (look.ts) | Card highlights slide with them; with no value the highlight sits at the key light's rest position. |
| `html[data-film-events='ivory' | 'tickets']` | film (`FilmLens.tsx`, constant `EVENTS_STOCK`) | Chooses the Events look. `ivory` is the default. With `tickets` the side rail must keep light inks on Events (film.css already forces that if the rail still sets `data-surface='light'`). |
| `<meta name="theme-color">` in `index.html` | interaction | Should be `#070605` (`--film-black`). |

Rules still living in film's files that deck.css must outrank or that integration should delete: `.scene-chapter { min-height: 220svh }`, `.scene-chapter--ml { min-height: 240svh }`, `.scene-stage { min-height: 640px / 730px / 810px }` (scenes.css); `.earth-journey[data-earth-motion="scroll"] { min-height: 900svh / 780svh }`, `.earth-intro { min-height: 640px / 720px }`, `.earth-place { min-height: 540px / 530px }` (earth-journey.css); `.section.support-scene.soda-scene { height: 340svh }` (soda.css). They are left in place so this branch still runs on its own.
