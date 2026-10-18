# Carrot Defense: the entry page and its dialogs

The title screen, the loading screen and what opens from the title screen (How to play, Settings, Field guide, Credits), on the glass
foundation (`docs/carrot-defense/glass-ui.md`). Files: `ui/Lobby.tsx`, `ui/useLobbyDepth.ts`, `ui/Loading.tsx`, `ui/Modals.tsx`,
`ui/entry.css`; `ui/Onboarding.tsx` (the tutorial coach, briefing, encounter card and toasts; their layout CSS is in `ui/hud.css`).

## The title screen

Back to front, all `pointer-events: none` except the controls:

| Layer | What | Depth (px the layer slides with the pointer) |
|---|---|---|
| Art | The key art of the chapter the next stage belongs to (garden, marsh, frost, orchard), so the screen follows the campaign. The page's accent follows it too (`CarrotPage` sets `data-biome` from that stage before the game starts). 40 px of overscan on every side. | -16 |
| Light | A glow and soft rays from the art's own sun or moon (`--sun-x/--sun-y/--sun`, per chapter), screen-blended. | -24 |
| Motes | 18 drifting points of light (pollen, fireflies, snow, embers by chapter), transform and opacity only; 10 on phones, none under reduced motion, paused while a dialog is open. | -34 |
| Scrim | Carries the type's contrast: dark on the left and the bottom, a veil at the top. Phones and landscape phones have their own. | - |
| Rays | The same rays, faint, in front of the scrim. | -28 |
| Glass | Nav (All games, Cornell CGS, a capsule with Settings and How to play), the title block, Play or Continue (jelly, 64 px), a capsule with Stage select and Boss challenges, the numbers strip, the next-stage card, the footer (Field guide, Credits). | title +5, numbers +4, card +9 |

Blur (real tier; the backdrop is a still image): the card, the action capsule and the numbers strip on desktop; only the card on
coarse pointers. While a dialog is open (`.ct-page[data-panel]`) the title screen's glass stops blurring and the motes hold still: the
dialog sheet is the one blurred surface.

**Light on the glass.** Each glass surface on the page carries a `.ct-rimlight`: a ring masked to the surface's own shape with one soft
spot of light inside. `useLobbyDepth` moves the spot along the rim toward the pointer (transform and opacity on its own layer) and
brightens it as the pointer comes closer; without a fine pointer it rests where the chapter's light is. The first version turned the rim
gradient itself through `--gl-rim-angle`; that repainted every glass surface and its soft shadows each frame and cost 120 to about
80 fps in Chromium, so the glint is a separate composited layer.

**The card** leans up to 4 degrees toward the pointer (Chromium and Firefox; WebKit draws seams through a translucent, blurred layer
under a 3D rotation, so Safari keeps it flat), and its board image slides the other way like a view through a window.

**Entrance** (about 1.5 s, nothing waits for it): the art settles from 1.14x and fades in, the light and motes follow, the nav and the
overline rise, the two title words come in out of a blur, the 3D badge springs in, then the actions, the card and the numbers; one band
of light crosses the title once. Everything enters with `translate` and `opacity`, filled backwards only, so press (`scale`), parallax
(`translate` on wrappers) and tilt (`transform`) own their properties afterwards. **Play**: the glass clears in 220 ms while the art
leans in and dims nearly to black in 260 ms, then the game starts; the loading screen rises from black, so there is no cut.
Reduced motion: no parallax, motes, tilt, sweep or dive; things appear with a 200 ms fade.

Big screens scale the whole lobby (`zoom` 1.16 from 1700x960, 1.45 from 2300x1300).

## Loading screen

The stage's own board (its jacket capture), out of focus behind one glass sheet: the jacket with the stage number, the kind of load
(`copy.ts loading`), the stage name, band, pips, chapter and waves, a rounded meter with a light sweeping along it, percent and
megabytes, a tip that changes every 4.5 s and one tower you can build there. Errors keep the sheet and offer Try again.

## Dialogs

Content only; the shell (`.ct-dialog`, `Modal`) is the menus surface's. Inside the sheet everything is fills and wells (no glass on
glass): How to play has four step cards, a drawing of the wave track next to its explanation, gestures and the keyboard keys as keycaps,
and Credits at the bottom. Settings groups its rows on a recessed well with the switch on the right, no dividers. The Field guide is two
columns of tower and creature cards; a forged Super gets a violet ring. Credits (new, from the footer) lists who made what, from
`public/assets/minigames/carrot/credits.txt`; the same list sits at the bottom of How to play.

## Measured

Contrast, rendered (text hidden, page captured, every pixel under each text run compared with its colour, 1st percentile; gradient title
scored with its darkest stop; text covered by something else, such as a sticky header, skipped): the lobby, How to play, Settings,
Field guide (both tabs), Credits and loading, over all four chapter arts, at 1440x900, 390x844 and 844x390, every scroll position of
the dialogs. Chromium 0 of 803 text runs and WebKit 0 of 805 below 4.5:1 (3:1 for large text). The dialog contents inside the menus
surface's glass shell (its work in progress, real blur, Chromium): 0 of 594. The tightest runs are the stage numbers on the board
images (large text, 3.4:1 at the 1st percentile).

Frame pacing with the pointer moving (paired and rotated with the same lobby under reduced motion and with a blank page, 3 cycles of
4 s; headless, shared machine, load 10 to 25):

| Engine, viewport | Lobby | Reduced motion | Blank page | How to play open |
|---|---|---|---|---|
| Chromium 1440x900 1x | 119.3 fps, p99 9.3 ms | 119.5, 9.2 | 120, 9.2 | 120, 9.2 |
| Chromium 1440x900 2x | 119.5, 9.3 | 119.5, 9.3 | 120, 9.3 | 120, 9.2 |
| Chromium 390x844 3x (touch) | 120, 10.0 | 120, 9.2 | 120, 9.2 | 120, 9.3 |
| Chromium 844x390 3x (touch) | 120, 10.0 | 120, 10.1 | 120, 10.2 | 120, 10.1 |
| WebKit 1440x900 | 60, 19 | 60, 21 | 60, 18 | 60, 18 |
| WebKit iPhone 13 (touch, 1 blurred surface) | 60, 18 | 60, 18 | 60, 18 | 60, 18 |

Playwright WebKit captures never show `backdrop-filter`, and its frame timing does not include the compositor, so the WebKit rows
say nothing about blur cost; check Safari by hand (Web Inspector, Timelines, Rendering Frames) with the pointer moving over the title
screen.
