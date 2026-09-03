# Motion contract

The site speaks ONE motion language. Use nothing outside this file.

## Easing
- GSAP: `import { EASE } from '../lib/eases'` → `ease: EASE.out` (`'site.out'`) for
  every reveal/arrival/hover-driven tween; `EASE.inOut` (`'site.inOut'`) for moves
  that both leave and arrive (sheet slides, swaps). `elastic.out(1, 0.5)` is allowed
  ONLY for magnetic returns. `'none'` for scrubbed tweens.
- CSS: `var(--ease-out)` = cubic-bezier(0.16,1,0.3,1); `var(--ease-in-out)` =
  cubic-bezier(0.83,0,0.17,1). Never write a raw cubic-bezier, never leave a
  Tailwind default ease on anything that moves (add `[transition-timing-function:var(--ease-out)]`
  or a CSS class).

## Duration bands
- Hover/press: 0.25–0.35s (`var(--dur-fast)` = 0.3s)
- Reveals: 0.6–0.9s (`var(--dur)` 0.6s, `var(--dur-slow)` 0.9s); hero-scale moments up to 1.2s
- Exits: ~60% of the matching entrance
- Staggers: 0.04–0.12s

## Utilities that already exist (global.css) — use, don't re-implement
- `.link-wipe` — directional underline (in from left, out to right). Replaces every `hover:underline`.
- `.btn-label` dual-label hover — markup `<span class="btn-label"><span>Text</span><span aria-hidden="true">Text</span></span>` inside a `.btn` or any `a:hover` context.
- `.grain-light` — static paper grain for white sheets (put on the sheet root).
- `.sheet-light` — selection/focus fixes for white sheets (put on the sheet root).
- `.film-grain` — global, already mounted in App.tsx. Don't add more.
- `[data-counter]` gets tabular-nums automatically.
- `src/lib/magnetic.ts` → `attachMagnetic(el, clampPx?)` returns cleanup. Desktop-only + reduced-motion safe already.

## Hard rules (violations = regression)
- 120fps: transforms/opacity only in per-frame paths. No backdrop-filter additions, no
  View Transitions, no animating height/max-height/max-width/box-shadow/filter — use
  scaleY/clip-path/grid-template-rows(0fr→1fr)/pre-blurred layers instead.
- Never leave a leftover transform on an ancestor of position:fixed chrome (clearProps).
- ScrollTrigger pins keep their refreshPriority; call ScrollTrigger.sort() stays in scroll.ts.
- prefersReducedMotion() (src/lib/motion.ts) gates every non-essential animation.
- Free scroll stays; no scroll hijacking.
- Copy stays TBA/TBD — no invented facts.

---

# Systems reference (as built, 2026-09-02)

## Page themes — `src/lib/pageTheme.ts`, `src/components/themes/*.tsx`
Every standalone page (`SubPage.tsx`, a real route at `/<slug>/`) wears ONE personality.
Same white/navy sheet everywhere; only the backdrop and the way content arrives change.

Contract (`PageTheme`):
- `name`
- `Backdrop(): ReactElement | null` — `absolute inset-0 z-0`, `pointer-events:none`,
  `aria-hidden`. Must never paint anything opaque: page content is in-flow and is NOT
  lifted above it (Technical's vignette is a mask on the grid, not a white overlay).
  Theme CSS lives in a `<style>` inside the backdrop, class-prefixed `<theme>-`;
  global.css is off-limits to themes.
- `enter(root): () => void` — runs once from SubPage's mount effect (deps `[]`), returns
  cleanup. Targets: `[data-page-item]` = eyebrow, h1, lead, (advisors page: the
  "Faculty Advisors" h2 and each advisor row), each section block; the h1 also carries
  `[data-page-title]`. The navy foot is NOT an item (the pageTheme.ts docstring still says
  "navy band" — stale). Reduced motion inside `enter` = one 0.5 s fade of the items and
  nothing else. Everything is built in `gsap.context(root)` and reverted; hand-made DOM
  splits are restored on cleanup.

Map (`PAGE_THEME`; unknown id → `cinematic`):

| theme | pages (route) | backdrop | arrival | after arrival |
|---|---|---|---|---|
| technical | what-we-do (`/whatWeDo/`), ml-process (`/mlProcess/`) | 40 px blueprint grid under side + end masks; one 120 px blue scan band, `position:fixed`, 7 s loop (not rendered under RM) | title decodes with ScrambleTextPlugin (1.1 s, chars `{}[]()<>=+*/;:#01`); the rest rises 14 px, 0.5 s, stagger 0.06, delay 0.35 | each h2 block gets a 1 px `outline` (offset 12 px, no layout cost) + a blue caret after the h2; outline turns blue under a fine pointer |
| organic | people (`/ourTeam/`), advisors, world | three blurred oklch blobs on transform-only keyframe loops (15/13/17 s; the blur is static) | bloom: autoAlpha + scale 0.94 (title) / 0.96 → 1 + y 14/10 → 0, 0.9 s title / 0.7 s rest, each 0.08 s; full-bleed items skip the scale | h2 blocks breathe ±4 px on a 12 s sine (phases spread by 0.382) and lean ≤ 6 px toward a fine pointer — ONE quickSetter writer for both, snapped to device pixels |
| kinetic | events, join | 8 suit marks drifting up 34 vh at opacity 0.06 (18–30 s, negative delays); a 120 px dial turning top-right, 24 s | deal: autoAlpha, y −56 (title) / −40, rotation −3° about 50% 120%, 0.75 s, `back.out(1.6)`, stagger 0.07 | h2 blocks tilt ±5° under a fine pointer; links/buttons press to 0.96 and release with `back.out(2)` (skips inline boxes and anything whose CSS already transitions transform) |
| cinematic | who-we-are (`/whoWeAre/`), contact | "CGS" serif-italic watermark (clamp(12rem,30vw,26rem), navy at 4.5%) bottom-right of the FIRST viewport; parallax `y = −0.12 · scrollY` | title words rise out of inline masks (yPercent 112, 2.5°, 1.1 s, stagger 0.1); the lead (the `<p data-page-item>` right after the h1) arrives a word at a time (0.5 s, stagger 0.035, from 0.5 s); the rest at 0.8 s; watermark develops over 1.6 s | — |

Adding a page: `content.pages` + `pageSlugs`, one line in `PAGE_THEME`, and the stub list in
`scripts/stubs.mjs` (must mirror `pageSlugs`).

## Scroll-scrubbed video — `src/lib/videoScrub.ts`
`attachVideoScrub(video, { trigger, start='top bottom', end='bottom top', from=0,
to=duration||8, onProgress })` → cleanup. Reduced motion → no-op. A `scrub:true`
ScrollTrigger only records the target time; a `gsap.ticker` tick does the seeking:
- skips while `readyState < 2` or `video.seeking` (never queue a seek behind a seek)
- ≥ 40 ms between seeks (≤ 25/s) and ≥ 1/30 s of change (no sub-frame seeks)
- pauses the clip if it is playing, then `video.currentTime = target` — an EXACT seek.
  `fastSeek()` is banned: it snaps to the nearest keyframe, these clips carry almost
  none, so on Safari every long jump would land on frame 0.

Lenis' inertia is the smoothing; seeks measured 10–19 ms on our clips. The video stays
paused for the life of the scrub; cleanup removes the tick and kills the trigger, nothing else.

Where it is used:
- `GlobeVideo` (World) — trigger = the chapter `<section>`, top-bottom → bottom-top,
  0 → `duration − 0.2 s` (the 8 s loop must never wrap to frame 0). Attaches on
  `loadedmetadata`; lazy-mounts a viewport early (IO rootMargin 100%); one
  `play().then(pause)` so iOS honours `preload=auto`. Missing file → poster with a 60 s
  xPercent drift; reduced motion → poster.
- `WhoWeAre` robot card — trigger = chapter, `top 90%` → `bottom 10%`, whole clip.
  Lazy-mounts a viewport early. Reduced motion → `preload=metadata` and
  `currentTime = 0.04` so the first frame paints; missing file → plain card back.
- `MLProcess` approach — trigger = chapter, `top bottom` → `top top`, 0 → `min(duration, 4)` s,
  attached only while the burst is armed. `fire()` detaches and hands the playhead to the
  looping autoplay; `reset()` (scrolled fully away) re-attaches; `loadedmetadata` re-ranges
  only if the 4 s cap actually moves.

## Cursor-reactive field
- `effects/GradientBG.tsx` — uniforms `u_pointer` (vec2 in uv space, y flipped) and
  `u_pstr` (0..1). Shader: `pf = exp(−|pd|² · 14) · u_pstr` with `pd = uv − u_pointer`
  aspect-corrected; `uv −= pd · pf · 0.16` bends the gradient toward the pointer and
  `col = 1 − (1 − col)(1 − glow · pf · 0.35)` pools the glow there (screen blend).
  JS: fine pointer AND not reduced motion only. Raw target from `pointermove`; position
  smoothed 0.1/frame (~180 ms), strength eased 0.06/frame (~400 ms) to 1 on move and back
  to 0 on `document` `pointerleave`, so leaving the window never snaps the sky. The rAF loop
  keeps running while `pstr > 0.005`.
- `effects/CodeLayer.tsx` — the rain parts around the lens: `PART_R = 260` px,
  `PART_PX = 30` px. Per drawn line, `dist = hypot(col.x + 90 − sx, lineMidY − sy)` against the
  SMOOTHED lens position (0.22/frame); inside the radius `f = 1 − dist/PART_R`, the line
  shifts `sign(dx) · f² · PART_PX` away from the lens and its alpha rises to
  `alpha · (1 + 1.6 f)`. The lens (and the parting) switches off while `isPaging()`
  (Lenis |velocity| > 0.6) and when the pointer leaves. Nothing is re-rasterised — it is a
  per-line `drawImage` x offset. Reduced motion draws one static frame, no lens.

## Deck slides — `StatementSlides.tsx`, `ShowcaseSlides.tsx`
Five pinned, scrubbed interludes between chapters. App.tsx order: WhoWeAre → **AlphaGo** →
WhatWeDo → **Project** → **Lab** → MLProcess → Events → World → People → **Stats** →
**Anyone** → Join. Ids `alphago / project / lab / stats / anyone`; not in `content.nav`
(no rail dot, no SectionIndex) and skipped by `useChapterTransitions` (pinned). Transforms,
opacity, clip-path and gradient position only.

Shared pin config (identical in both files):
```
PIN = { start: 'top top', pin: true, scrub: 0.4, anticipatePin: 1, invalidateOnRefresh: true, refreshPriority: 1 }
```
Ends: AlphaGo `+=160%`, Project / Anyone / Lab `+=150%`, Stats `+=180%`. Timelines are ~1 unit
long so positions read as fractions of the pin.

One mechanic each — **the zoom belongs to AlphaGo alone**:

| slide | mechanic | type | gradient |
|---|---|---|---|
| AlphaGo | THE zoom: the word starts centered and huge (`travel()`) and shrinks into its sentence (`power1.inOut`, 0 → 0.62) while a 9×9 Go board of dots draws in from the center; sentence and lead rise after | `var(--font-serif)` = STIX Two Text, italic, 500, tracking −0.01em, `padding-right: 0.06em` for the italic overhang | ICE |
| Throwing Eggs (`ProjectSlide`) | light sweep: the headline clip-wipes on (0 → 0.42), a highlight travels through its gradient (`background-size 300% 100%`, position 100% → 0%), two card backs fly in from ±0.7 vw to ±0.34 vw, the line arrives a word at a time (stagger 0.012), the counter deals to 108. Nothing scales | Bricolage Grotesque 800, `opsz 96`, clamp(3.4rem,10vw,10rem), leading 0.92, tracking −0.03em | WARM |
| Anyone | gathering: letter-spacing 0.55em → −0.01em (`power2.inOut`), the gradient fill fades up through a 1 px text-stroke outline, a hairline rule draws, lines rise | Instrument Serif italic (fallback STIX Two Text), 400, clamp(3.8rem,11vw,11rem) | ICE |
| Lab | laptop dolly: scale 1.5 → 1 from x −0.12 vw; each code row clip-reveals left → right on a character budget (the club's CFR update), the caret follows the last live row | Hanken (`font-display`) + JetBrains Mono | `linear-gradient(90deg, #e8fbff, #7a9dff)` on the two display lines |
| Stats | strip pan: the track moves to `−(scrollWidth − vw + 0.06 vw)`; each hairline draws as its card arrives | Hanken 700, clamp(3.6rem,9vw,8.5rem) | ICE, inlined as a Tailwind arbitrary value |

Gradient tokens (StatementSlides):
`GRADIENT_ICE = linear-gradient(100deg, #f2f5ff 0%, #cfe0ff 45%, #7a9dff 100%)`,
`GRADIENT_WARM = linear-gradient(100deg, #ffe3b0 0%, #fff5e1 35%, #9fc3ff 100%)`, applied with
`gradientText(image, extra)` (background-clip:text + transparent color).

Only the loaded font axes exist (index.html): Bricolage Grotesque wght 800 / opsz 12..96 ONLY;
Instrument Serif italic ONLY; STIX Two Text 400..700 both styles; Hanken Grotesk 400..800
(italic 400..700); JetBrains Mono 500/600/700. Any other weight or style falls back silently.

Pin refresh order: `scroll.ts` calls `ScrollTrigger.sort()` + `refresh()` 60 ms after mount and
again on `fonts.ready`. Priorities as built: WhatWeDo board 2, ML pin 1, all five slides 1.
Sort key is priority first, document position second (see REPORT.md 2026-09-02, open risks).

## Chapter hand-offs — `useChapterTransitions` (reveal.ts), on `<main>` in App.tsx
For every direct `<section>` child of `<main>` (a pinned chapter sits inside a `.pin-spacer`,
so it is skipped either way), its `.container-site` scrubs `scale 1 → 0.94, opacity 1 → 0.45,
y 0 → −40` (origin 50% 30%, ease none) from `bottom 72%` to `bottom top` of the section — the
leaving chapter settles back and dims while the next arrives over it. Built once at mount;
reduced motion → none. Only the container moves, so full-bleed backdrops (globe, black hole)
never dim.

Word-by-word leads: `data-reveal="para"` (not a counter panel) → SplitText words
(`autoSplit`), autoAlpha 0 → 1 + y 10 → 0, 0.55 s, stagger amount `min(0.6, words · 0.028)`.
Inside a `.section` it rides the section timeline (heading lines at 0, paras at 0.12 + 0.1·i,
counters / cards / rest at 0.2; trigger `top 78%`, once, fastScrollEnd); outside, per element at
`top 86%`. Cinematic pages do the same by hand (`splitWords`, restored on cleanup); the Project
slide pre-splits its line into inline-block spans and scrubs them.

## Returning visitors and Back links
- `App.tsx`: `sessionStorage['cgs-seen'] = '1'` is written the moment the curtain lifts.
  `returning` is read once at module load; when true the `Loader` renders nothing, the readiness
  race is capped at 400 ms (not 2400) with no 950 ms minimum, and `BOOTED_EVENT`
  (`cgs:shown`, plus `window.__cgsShown`) fires almost at once — the hero entrance still keys
  off it. Per tab; private mode (storage throws) → the curtain every visit.
- `SubPage.tsx`: `back = /#${CHAPTER[id] ?? id}` with `CHAPTER = { advisors: 'people',
  contact: 'join' }` — the "← Back" link and the top-right × both use it; the wordmark goes to `/`.
- `main.tsx`: a deck load addressed to `#<chapter>` glides there with `scrollToId` 650 ms after
  `BOOTED_EVENT` (at once if already shown). `scrollToId` uses the pin-aware chapter top
  (`scroll.ts chapterTop`: a pinned chapter starts at its trigger start) on Lenis (1.2 s, 1.6 s
  when > 1.5 vh away, easeOutExpo). Legacy `#p/<id>` hashes forward to the real path.

## As-built exceptions to the easing rule (a closed list, not a licence)
- Kinetic: `back.out(1.6)` on the deal, `back.out(2)` on the press release — the theme's one accent.
- Technical: ScrambleTextPlugin title (ease `none`).
- Scrubbed slide timelines shape their internal curve with `power1/2.inOut` (AlphaGo zoom,
  Anyone gather, Lab dolly) and `EASE.out` on arrivals; the scrub itself is `scrub: 0.4`.
- MLProcess burst: `power4.out` family per the brief; WhatWeDo deal: `power3.out`.
Do not add to this list.

## How to add a new slide
1. Component next to the others (`StatementSlides.tsx` / `ShowcaseSlides.tsx`). Markup:
   `<section ref={root} id="…" className="section overflow-x-clip" aria-label="…">` with a
   `.container-site relative` inside. Mount it in App.tsx `<main>` between two chapters. Leave it
   out of `content.nav` unless it should own a rail dot.
2. Pin with `{ trigger: section, end: '+=150%', ...PIN }` inside `useLayoutEffect` +
   `gsap.context(…, section)` so the pin exists before scroll.ts sorts and refreshes at 60 ms.
   Keep `refreshPriority: 1` and the rest of `PIN` untouched. In StatementSlides use the local
   `usePinned(root, end, build, statics)`; it is module-local, so a new file copies the pattern.
3. Measure inside functions — `x: () => -window.innerWidth * 0.34` — so `invalidateOnRefresh`
   re-derives them on resize. For a word that must start centered and huge use
   `travel(word, section, maxW = 0.84, maxH = 0.42)`: it sums `offsetLeft/offsetTop` up to the
   section and returns `{ x, y, scale }` (scale ≥ 1.6, capped at 84% vw / 42% vh). Never read
   `getBoundingClientRect` on pinned content mid-refresh — it reads garbage. Set
   `transformOrigin` and `willChange: 'transform'` on anything that scales.
4. Timeline positions are fractions of the pin (0–1); keep the total ≈ 1. Hide start states with
   `gsap.set` inside `build`, not with CSS classes.
5. `statics()` returns every element `build` hides. Under reduced motion `usePinned` sets them
   `opacity: 1`, clears `transform,clipPath`, and creates no pin at all — anything missing from
   the list is invisible to reduced-motion readers.
6. Pick a verb that is not the zoom (wipe, gather, pan, dolly, deal). Reuse `GRADIENT_ICE`
   (`GRADIENT_WARM` only with a reason) via `gradientText`; use only the loaded font axes above.
7. `export PATH="$HOME/.local/node/bin:$PATH" && npx tsc --noEmit`, then scroll both ways,
   resize across 768 px, and check `prefers-reduced-motion`.

## Idle life (as built, 2026-09-03)
Nothing sits still. `global.css` "Idle life" block: `.life-float` (±5 px, 7 s), `.life-bob` (2 px + ±1.2°, 6 s),
`.life-sway` (±1.4° about the bottom, 9 s), `.life-breathe` (scale 1→1.015, 8 s), `.life-glow` (opacity 0.72↔1, 4 s),
`.life-shimmer` (background-position sweep for gradient text, 7 s), `.neon-idle` (a low neon lap on resting `.neon`
controls). Phase every sibling with `--life-delay: -Ns`; vary `--life-dur` ±20 %. The class rides a WRAPPER whenever GSAP
transforms the element itself (never compose transforms on one node). Scrubbed films drift forward at 0.35× after 900 ms
without scroll (`videoScrub` `idle` option) and snap back to the scroll target on the next update. All of it stops under
reduced motion.

## Live words, algorithms, the die, device classes (2026-09-03)
- **Typing** lives in exactly three places: the hero line (TypeLine), the ML chapter's step words (TypedHeading,
  title ↔ meaning), and the laptop's editor + terminal (CodePanel, scrubbed; on phones it drives itself off the laptop).
- **Every other page has its own word design** (`LiveText.tsx`, `SubPage.tsx` WORDS): whoWeAre flip · whatWeDo scramble
  · mlProcess converge · events ticker · world wave · ourTeam weight · advisors outline · join glitch · contact tilt; bodies
  shimmer / glow / underline / focus. Headings alternate between `heading` and `alt` (content.ts) forever.
- **Algorithms run under the words** (`GraphAlgo.tsx`: kruskal · prim · dijkstra · astar · bfs · dfs; `NetworkFlow.tsx`
  for advisors/join). Canvases are `-z-10` backdrops inside an `isolate` sheet — people and copy always on top, no captions.
- **Neon words**: `.neon.neon-word` — hover runs the comet lap around the word; any press on `.neon` fires `.neon-burst`
  (installNeonClick, delegated).
- **The mark is a die** (`Dice.tsx`): a CSS cube that tumbles forever; hover/press throws it. `--dice-face/--dice-pip`.
- **Device classes** (`lib/device.ts`): phone/tablet/laptop/desktop/tv from width, pointer, DPR, UA → one reference width
  per class (430/1024/1440/1920/1920); the root font-size is scaled by viewport/reference (clamped), so every device in a
  class renders the same page resized. The design is rem-based (px in Tailwind arbitrary values were converted); `?device=`
  or `__cgsDevice.force()` in dev.
- **Lesson**: a child's `useLayoutEffect` runs before its PARENT's ref is attached — a prop ref from a parent is null there
  (StrictMode's double run hid it in dev; production never typed). CodePanel builds in `useEffect`.
