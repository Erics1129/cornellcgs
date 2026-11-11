# DOM hooks added by scroll-core (for film and interaction to style)

Style these names; do not rename them. Geometry (position, heights, overflow, contain, base
states) is in `src/styles/deck.css` and is written with chapter ids, so it outranks the class
rules that still carry the old heights. Everything in `deck.css` is scoped to
`html[data-page='deck']`.

| Hook | Where | Meaning |
|---|---|---|
| `html[data-page="deck"|"sub"|"game"]` | set in `src/main.tsx` before the first render | Scope every cinema rule with it. Mini-game routes are `game`: nothing of ours may match there. `initTier` and `initLook` are not called on `game`. |
| `html[data-scroll="rest"|"moving"|"flying"]` | deck | The page is stopped (or creeping the last pixels of a glide), moving, or above 3 viewports per second. |
| `html[data-bg="on"|"off"]` | scene manager | Whether the fixed background layers are visible behind the chapters on screen. Replaces `html.cinema-on`, `html.universe-on`, `html.eye-on`. |
| `main > section[id]`, `footer#contact` | the 16 chapter roots | Never clipped, moved or faded by script. Each has `overflow-x: clip; isolation: isolate`. |
| `.deck-stage[data-stage]` | AlphaGo, What we do, Code | Wraps all the section's children. `display: contents` until the chapter is a runway; then the sticky stage, `--stage-h` tall (100lvh). |
| `#what-we-do[data-runway="true"|"false"]` | What we do | True with 5 cards or fewer: only then is the wide layout a runway. |
| `.stage-safe` | available, not used yet | A top-anchored box of 100svh inside a stage for bottom-anchored copy. Today the same is done with `--stage-slack` (below). |
| `--stage-h`, `--stage-slack` | `html` | Stage height (100lvh) and how much taller that is than 100svh. Anything anchored to the bottom of a stage adds `var(--stage-slack)` to its `bottom`, so it stays on screen while a phone's URL bar shows. deck.css already does this for `.scene-caption`, World's figcaption, `.universe-footer`, `.soda-copy`, `.soda-sound`, `.alpha-pause`. |
| `--run-alphago`, `--run-whatwedo`, `--run-code`, `--run-ml`, `--run-world`, `--run-universe`, `--run-soda` | `html` | Runway heights. |
| `.seam[data-seam][data-from][data-to]` > `i.seam__veil`, `i.seam__light` | between every pair of chapters, in `main` | Zero-height box, z-index 5, unpainted. `data-seam` is `dip`, `soft`, `level`, `lid` or `cut` (World to Universe: no veil, a match cut). `--seam-up` and `--seam-down` are how far the two children reach into the chapter above and below (default `--seam-reach`, 14svh; 9svh for `soft`; `--seam-up: 0` under the hero). Film sets them per boundary to the empty padding available and paints the children. |
| `[data-film-enter="picture"|"copy"]` and `--e` | one inner wrapper per chapter | deck writes `--e` (0 to 1, eased; the property is removed at arrival, so the default must be 1) only under Lenis (fine pointers). `picture`: `.go-study`, `.project-table`, `.code-device-stage`, `.scroll-film`, `.earth-globe`, `.soda-canvas`, `.vision-eye-stage`. `copy` (text: no scale, at most a 16 px translate): `.identity-layout`, `.agenda-layout`, `.join-layout`. Tall text wrappers have none. |
| `[data-scene-host]`, `[data-scene-state="poster"|"live"]`, `[data-poster]` | `.soda-stage`, `.scroll-film` (and every scene film ports) | deck.css keeps a host's direct `canvas`/`video` children at opacity 0 until the state is `live`, then fades them in over 150 ms. |
| `.soda-poster[data-poster]` | soda | Empty box over the stage's own CSS composition. |
| `.scroll-film-stills[data-poster]` > `img[data-still-base]`, `img[data-still]` | ML film | The designed still (reduced motion) and the nine-step ladder. Hidden while the film is `live`. Film: give `.scroll-film` a non-flat CSS ground for the moment before any image has arrived. |
| `.earth-strip` (`.container-site`) > `p.scene-eyebrow`, `a.scene-link` | World stage, first child | The words that stay for the whole film. Needs a feathered scrim from film (it sits on bright photographs). |
| `--lqip` on `.earth-place` | World figures | A 48 px blurred copy of the photo, used as the figure's background until the photo arrives (off while `data-earth-renderer="webgl2"`). |
| `[data-phase="off"]` + `inert` | World intro copy and orbit caption after .30, World credits before the last frame, undealt What-we-do card faces, the soda invitation before .62 | Intentionally hidden at this progress. Not focusable, and not counted by the probe. |
| `#deck-dip` | appended to `body` on the first far jump | The cut overlay (z 46, `var(--film-black, #070605)`). |
| window event `cgs:settle` (`detail.reason`) | deck | Same moment as `onSettle`. |
| `window.__film.state()` (dev) | scroll.ts | `{ frame, chapters, reveals, scenes, tier, look, refreshCount }`. `window.__filmOff = true` before boot switches the deck, reveals and scenes off. |

## Module additions (all optional for callers)

- `deck.ts`: `ChapterState.stageHeight`, `DeckFrame.vhLarge`, `attachLenis`, `deckLenis`, `remeasure`, `onMeasure`, `onDeckLate`, `settleNow`, `refreshCount`, `whereAmI`, `restoreTo`, `filmOff`.
- `scenes.ts`: `SceneSpec.region` (gating box for page scenes that are not fixed, e.g. sub-page films), `warm` (cheap idle warm-up), `context` and `dropContext` (WebGL context budget).
- `reveal.ts`: `reveal(build, opts)` with `RevealOptions` `{ source, smooth, id, phaseOff, settle, latch, invalidate, onMeasure, stageRange }`, `revealReports()`. `useSectionReveals`, `useSectionDepth` unchanged in signature.
- `motion.ts`: `RUNWAY_MEDIA` (`prefers-reduced-motion: no-preference` and at least 480 px tall), `runwayAllowed()`, `animationOff()`.
- `earthJourney.ts`: `EARTH_INTRO`, `EARTH_REST_GAPS`, `EARTH_LQIP`; `EARTH_PLACES` is re-timed (Bali's start and arrival are unchanged).
