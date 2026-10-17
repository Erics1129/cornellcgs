# Carrot Defense: the glass UI foundation

The shared base for the glass pass on the web UI around the Unity player: the CSS split and who owns what, the glass material and
its React primitive, the tiers that keep the HUD cheap during play, the measured text colours, and the copy rules. The surfaces
(entry page, HUD, menus) are rebuilt on top of this.

## Files and owners

| File | Owner | What it holds |
|---|---|---|
| `src/minigames/carrot/ui/glass.css` | foundation | Tokens, base resets, the glass material and every shared control, the tier and preference rules. |
| `src/minigames/carrot/ui/Glass.tsx` | foundation | `<Glass>`, `<Jelly>`, `glass()`, `jelly()`, `useGlassTier`, `usePointerLight`, `useExit`. |
| `src/minigames/carrot/ui/GlassLab.tsx` | foundation | DEV only (`?carrot-glass-lab`): every primitive over chosen backdrops. Never in production. |
| `src/minigames/carrot/copy.ts` | foundation | Names and messages shared by more than one surface; `ordinal()`, `count()`. |
| `src/minigames/carrot/ui/kit.tsx` | foundation | Medals, Grade, Pips, Counter (shared by every surface). |
| `src/minigames/carrot/ui/entry.css` | entry | Lobby, loading screen, How to play, Settings, Field guide. |
| `ui/Lobby.tsx`, `ui/Loading.tsx`, `ui/Modals.tsx` | entry | The same, markup. |
| `src/minigames/carrot/ui/hud.css` | HUD | Status, wave track, controls, bottom bar, boss bar, cast row, deadline, minibars, judgement, toasts, warning band, coach, briefing, encounter card, build menu, paused pill, cast chips (`.ct-chip`), the rolling counter (`.ct-counter`). |
| `ui/Hud.tsx`, `ui/WaveTrack.tsx`, `ui/BossBar.tsx`, `ui/BuildMenu.tsx`, `ui/Onboarding.tsx` | HUD | The same, markup (the merge tip is `MergeTip` in Onboarding). |
| `src/minigames/carrot/ui/menus.css` | menus | Stage select and challenges, results, the dialog shell (`.ct-dialog`), the restart confirm. |
| `ui/LevelSelect.tsx`, `ui/Results.tsx`, `ui/Dialog.tsx` | menus | The same, markup (`Modal` and `ConfirmModal` live in Dialog.tsx). |
| `CarrotPage.tsx` | integration | The shell. Surfaces should not need it; if one must, keep the edit to a line. |
| `unity.ts`, `progress.ts`, `types.ts`, the save and bridge code | contract | Do not change behaviour. |

`carrot.css` is gone. `CarrotPage.tsx` imports the four files in this order: `ui/glass.css`, `ui/entry.css`, `ui/hud.css`, `ui/menus.css`.
The split was checked rule for rule: in 64 mock states at three viewports (192 combinations, 34,260 elements, `::before` and `::after`
included) the computed styles with the new files equal those with the old `carrot.css`.

### Cascade layers

One order for every file (each file repeats the statement, so import order can never reshuffle it):

```
tokens < base < glass < hud < entry < menus < themes < prefs
```

A surface class always wins over a primitive's defaults (its layer comes later), so `.ct-status { padding: 10px 14px }` simply works
on a `.gl` element. The tier and accessibility rules sit in `prefs`, the last layer, so they win over every surface. Phone, reduced
motion and contrast variants of a surface go in `@layer carrot.themes` inside the surface's own file.

## The material

```
<Glass depth={1|2|3} tone="threat" clear pill blur interactive selected wash pop="rise" as="section" className=... {...any prop}>
```

| Prop | Class | Effect |
|---|---|---|
| `depth` | `.gl--1` | Thin: HUD chips and controls. Tint .66, radius 22, shadow 1, less sheen. |
|  | `.gl--2` (default) | Panel: cards, build menu, toasts. Tint .72, radius 28, shadow 2. |
|  | `.gl--3` | Sheet: dialogs, results, stage select. Tint .72, radius 36, shadow 3. |
| `tone` | `.gl--accent/ally/coin/grow/threat/leak/super` | Colour of the rim's lower bounce, the light from below, the wash, the selected ring and a nested Jelly. Default: the biome accent. |
| `clear` | `.gl--clear` | Tint .50 for icon-only controls. Never put text on it. |
| `pill` | `.gl--pill` | Fully round ends (anything 56 px tall or less). Pills never get the squircle. |
| `blur` | `.gl--blur` | Real backdrop blur (16 / 24 / 32 px by depth, saturate 170 to 180%), only in the `real` tier. |
| `interactive` | `.gl--press` | Scale .97 on press (90 ms, spring back 420 ms), a light that follows the pointer, a bloom under the finger. |
| `selected` | `.gl--on` | A 1.5 px ring and a soft glow in the tone colour (tabs, tiles, rows). |
| `wash` | `.gl--wash` | 6% of the tone mixed into the tint (warnings, guardian cards). |
| `pop` | `.gl-pop`, `.gl-pop--rise`, `.gl-pop--sheet` | Materialize on mount: scale .96 and a fade over 240 ms; rise adds 8 px; sheet uses 360 ms and the sheet curve. Add `.is-leaving` (see `useExit`) for the 180 ms exit. |

`glass(options, ...extraClasses)` returns the same class string for native elements:
`<button className={glass({depth:1,pill:true,interactive:true},'gl-icon')}>`.

Every layer, back to front: two-part outer shadow; the backdrop blur (real tier); the tint `rgb(12 18 32 / a)`, the only layer that
guarantees contrast; the tone light from below; a lens hot spot; light entering the top; SVG frost grain (soft light, 160 px tile, painted
once); inner lips and thickness (inset shadows); the 1 px specular rim (`::before`, a masked gradient, so it follows any radius and never
bleeds through the tint); the hover and press light (`::after` on pressables). In Chromium 139+ panels, sheets, fills, wells and thumbs
get `corner-shape: superellipse(1.6)` with the radius scaled 1.3x (`--gl-sq`); WebKit and Firefox keep round corners.

### Controls

| Class | Use |
|---|---|
| `<Jelly size="sm|md|lg" tone idle>` / `.gl-jelly` | The primary action: a tinted, opaque pill with dark text (about 10:1). 44 / 48 / 60 px. `idle` adds a shine every 7 s (entry page only; off under reduced motion). The hover shine is a transform sweep. |
| `.gl-btn` (+ `.gl .gl--1 .gl--pill .gl--press`) | Glass text button, 44 px (`.gl-btn--lg` 52 px). |
| `.gl-icon` (+ the same) | 44 px icon button. Hover light is 12% here (glyphs need 3:1), 6% on everything with text. |
| `.gl-tag` | Solid colour pill, 22 px, dark text (bands, "New best"). Tone sets the colour. |
| `.gl-chip` | Soft pill on a light fill (Tier II, Phase 1, Air). |
| `.gl-fill` / `.gl-well` | Raised / recessed areas inside glass. Radius is concentric: set `--gl-pad` to the parent's padding. |
| `.gl-meter > i` | Rounded progress bar; set `--v` (0 to 1) on the `<i>`. The fill slides, so its leading edge stays round. |
| `.gl-seg`, `.gl-switch`, `.gl-range` | Segmented control (pressed option is a lifted fill), switch on `<input type=checkbox>` (52x32, the knob stretches while pressed), slider on `<input type=range>` (set `--v` as a percentage inline). |
| `.gl-thumb` | Image corners inside glass (concentric). |
| `.gl-label` | 11 px uppercase overline in `--ink-2`. |
| `.gl-num` | Mono, tabular figures. |
| `.gl-text` | A 1 px text shadow on glass (a legibility aid; contrast still comes from the tint). |
| `.gl-scroll`, `.gl-scroll--x` | Content fades out where it meets floating chrome, instead of a divider line. |

### Legacy classes render the new recipes

So existing markup upgraded in place; new markup should use the `gl-*` names.

| Legacy | Renders as |
|---|---|
| `.ct-icon-btn` | 44 px thin glass circle, pressable (`.gl .gl--1 .gl--pill .gl--press .gl-icon`) |
| `.ct-ghost` | Thin glass pill button (`.gl .gl--1 .gl--pill .gl--press .gl-btn`), sentence case 14 px |
| `.ct-cta`, `.ct-cta--hero` | Jelly, 48 px; hero 60 px. `--cta` still sets its colour. |
| `.ct-tag`, `.ct-badge` | Soft pill (`.gl-chip`) |
| `.ct-band` | Solid pill (`.gl-tag`) in the band colour |
| `.ct-switch input`, `.ct-segment`, `.ct-slider input` | `.gl-switch`, `.gl-seg`, `.gl-range` |
| `.ct-pips`, `.ct-medals`, `.ct-grade.is-empty` | Round dots, round medals without hairlines, a dot for "no grade" |
| `.ct-panel` | Unchanged (chamfered, opaque). Replace it with `.gl` per surface; adding `gl gl--N` to an element that also has `ct-panel` works (`.gl` clears the border and the clip-path). |

## Tiers: where real blur is allowed

The page root carries `data-glass`, from `useGlassTier({reducedEffects, live, still})` in `CarrotPage.tsx`:

| Tier | When | Effect |
|---|---|---|
| `solid` | the page's Reduced effects toggle (the only route in Safari, which has no `prefers-reduced-transparency`), `prefers-reduced-transparency`, `prefers-contrast: more`, `forced-colors` | Tint .94, no blur, an even rim, no pointer hot spot. |
| `lite` | a wave is running and the game is not paused (every device); weak devices (4 GB or less where Chromium reports memory, 2 cores or less, or no backdrop-filter); phones (coarse pointer, short side under 600 px) whenever the Unity board renders | Same look, no `backdrop-filter`. |
| `real` | everything else: the entry page (phones too, its backdrop is a still image), paused, results, menus over the board on desktop | `.gl--blur` surfaces blur. |

Budget, enforced by the tier and by review (Glass warns in DEV when more are mounted): at most three blurred surfaces on screen, one
on phones; never `backdrop-filter` on HUD chips, toasts or the build menu. Every blurred element is its own render pass, so the count
matters more than the area.

## Rules

1. **Never glass on glass.** A `.gl` (or `.ct-icon-btn`, `.ct-ghost`) inside a `.gl` renders as a fill automatically. Use `.gl-fill` and `.gl-well` inside.
2. **Pseudo-elements are taken.** `.gl::before` is the rim; `::after` is the light on pressables, and the shine plus light on jelly. Put decorations in child elements.
3. **Fade the blurred element itself.** A wrapper with opacity below 1, a filter, a mask or a clip-path becomes the blur's backdrop root and cuts the page out of the blur (it pops in when the wrapper's fade ends). Never animate the blur radius.
4. **Press uses the `scale` property**, materialize uses `opacity` and `scale` (`translate` for `--rise`). Do not set `scale` on a pressable, and do not use `.gl-pop--rise` on an element positioned with `translate`.
5. **Focus ring.** The ring follows the focused element's own shape through the non-inherited `--gl-radius`, which every primitive sets. To round a custom focusable element, set `--gl-radius` on it (the site's global `:focus-visible` radius would otherwise win).
6. **Text colours on glass** (measured below). Inside `.gl`, `--ink-2` and `--ink-3` are remapped automatically to greys that pass. Coloured small text only through the `-text` tokens on depth 2 and 3; on depth 1, small text is `--ink` or `--ink-2` and colour goes to icons, large numbers, meters and tags:

| Token | Value | Use |
|---|---|---|
| `--ink` | #f2f6ff | Body text on any glass. |
| `--ink-glass-2` (what `--ink-2` becomes in depth 2/3) | #dde3ed | Secondary text, depth 2 and 3. |
| `--ink-on-1` (what `--ink-2` becomes in depth 1) | #e9eef6 | Secondary text, depth 1. |
| `--coin-text`, `--ally-text`, `--grow-text`, `--threat-text`, `--leak-text`, `--super-text`, `--accent-text` | luminance 0.77 or more | Small coloured text on depth 2/3. `--accent-text` follows the biome and the guardian. |
| `--coin-mark` ... `--accent-mark` | luminance 0.565 or more | Icons, and text at 19 px bold or 24 px and up, on any depth. Raw `--accent` fails as text or icon in some biomes (prism purple is 2.7:1). |

7. **Hover light** is 6% white on text-bearing glass and 12% on icon-only buttons; more would push `--ink` below 4.5:1 at the worst spot (the light composites in sRGB).
8. **Two lines of text in a 44 px circle touch the rim** (the probe caught "1× HOLD" at 1.5:1 at the edge). Make a two-part label a pill.
9. **Reduced motion** keeps short fades: `.gl-pop` becomes a 140 ms opacity fade, the pointer light a 120 ms fade, the idle shine stops. Press feedback stays.

## Measurements

Contrast (rendered, not modelled): the lab (`?carrot-glass-lab`) over five key arts (garden, frost, marsh, orchard, prism) and two
real game frames, each at three image offsets, in every tier, at 1440x900 and 390x844, in Chromium and WebKit. For each text run the
text is hidden, the page captured, and every pixel under the run compared with the text colour. The worst background behind text
(1st percentile of the run) is luminance 0.143 on depth 1 and 0.125 on depth 2/3 (it is brighter near the top of a surface, where the
sheen, the hot spot and the inner top light sit; those were lowered to .05 / .05 / .12 after the first pass). With the tokens above,
0 of 333 text runs fall below 4.5:1 (3:1 for large text) in Chromium and 0 of 222 in WebKit. Solid tier: 8.47:1 or more.

Frame cost over the live board (release player, production build, a bot playing at 2x; every variant between two plain windows; M5
Max, headless; Chromium paces at 120 Hz, WebKit at 60 Hz). "glass" adds lite glass to every HUD panel, toast, hint, minibar and the
build menu (the fully migrated HUD); "glass + blur" forces real blur on them during play (what the tier forbids).

| Engine, viewport, stage | HUD (median) | HUD hidden | glass | glass + blur | paused, 1 blurred sheet |
|---|---|---|---|---|---|
| Chromium 1440x900 1x, L5 | 120 fps, p95 9.3 ms | 120, 9.2 | 120, 9.3 | 118.2, 9.2 | 120, 9.3 |
| Chromium 1440x900 2x, L5 | 120, 9.3 | 120, 9.3 | 120, 9.3 | 120, 9.3 | 120, 9.3 |
| Chromium 1440x900 2x, L25 (guardian fight) | 120, 10.3 | 120, 10.3 | 119.9 to 120, 10.0 to 10.2 | 120, 10.3 | 120, 10.2 |
| Chromium 390x844 2x, L5 | 120, 10.3 | 120, 10.3 | 120, 10.2 to 10.3 | 119.8, 10.3 | 120, 10.3 |
| Chromium 844x390 2x, L5 | 120, 10.3 | 120, 10.3 | 120, 10.0 | 120, 10.0 | 120, 10.3 |
| WebKit 1440x900, L25 | 60, 18 | 60, 18 | 59.4 to 60, 19 | 60, 19 | 60, 18 |
| WebKit iPhone 13, L5 (tier stays lite) | 60, 19 | 60, 19 | 60, 19 | 60, 19 | 60, 19 (no blur: phone rule) |

WebKit desktop at L5 drifts between 45 and 60 fps as waves fill (the game's governor moves render scale between 0.70 and 0.95, as
in the inventory), so it was also measured paired: nine rotated cycles of plain, glass and flat glass, 6 s each, with the harness's
class observer running in all three. Glass minus plain: +0.4 fps (sd 2.9), p99 +1.9 ms (sd 2.6); flat glass (tint only) minus
plain: +1.5 fps, p99 +0.8 ms (sd 3.9). No frame-rate cost; any slow-frame cost in WebKit is at most 1 to 2 ms and within the spread.
In Chromium the paired run held 118.7 to 120.1 fps in every window. Lite glass costs nothing measurable; the tier rule (no blur
during play) stands on the earlier inventory runs, where 13 to 18 blurred HUD panels cost 6 to 10% and pushed the governor to a
lower render scale, and on the bench, where every blurred element is its own render pass.

Re-run:

```
npm run dev -- --port 5480 --strictPort --host 127.0.0.1
# the lab: http://127.0.0.1:5480/minigames/carrotDefense/?carrot-glass-lab&biome=frost&glass=real   (glass=real|lite|solid, bg=<url>, pos=<object-position>, motion=reduce)
BASE=http://127.0.0.1:5480 node scripts/carrot-ui-qa/glass-contrast.mjs chromium      # contrast probe over the key arts (add BACKDROPS=<dir of PNG frames>)
```

Safari: Playwright WebKit screenshots never show `backdrop-filter`, and WebKit's requestAnimationFrame does not wait for the compositor, so
neither a page frame meter nor the game's quality governor sees blur cost there. Check real Safari by hand with Web Inspector >
Timelines > Rendering Frames while a blurred sheet is open over the moving board.

## Copy

Say what it is or what it does, in the player's words. No hype, no drama, no filler kickers, no exclamation marks, no em or en dashes
(a colon, a comma, a period, or ` · ` between facts; an empty value is a muted dot with an accessible name). Sentence case in the
source; CSS uppercases 11 px overlines. Numerals with units (`Wave 4 of 8`, `+15%`, `1×`). Ordinals through `ordinal()`.
Typographic apostrophes.

One name per thing: **tower** (not plant or defense), **creature** (not enemy, foe, mob or minion), **guardian** (a stage's boss; "boss
bar" and "Boss challenges" stay), **miniboss**, **clearing** (where a tower goes), **stage** (not level or landscape), **hearts** (carrot
health), **coins**. Game terms stay: Flawless, Clear, Leak, Phase break, Super forged, Saved, chain, Tier I to IV, Super, Veteran,
Crowded, DPS, Power, Reach, every ability, tower, creature and chapter name, the difficulty bands.

Names that code matches (rename only together with it): the click-sound rule in `CarrotPage.tsx` (`Close`/`Back`, and `Stage select`,
`Stages`, `Choose`, `How to`, `Challenges`, `Settings`, `Field guide`), the entry button text in `scripts/carrot-qa/lib.mjs`
(`Continue|Play`), the `text=` and `aria-label` selectors in `scripts/carrot-ui-qa/qa.mjs` and `menus.mjs`, and the ability card limits
in `scripts/carrot-ui-qa/unit.mjs` (cards 12 words or fewer, verbs exactly two words).
