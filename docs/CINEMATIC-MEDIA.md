# Cinematic media

The nine information pages use films of animated geometry, rendered in Blender. Their motion includes moving Go stones, falling dominoes, articulated bearings, deforming cloth, opening doors and travelling light. These are not still images displaced by a shader.

## Sources and quality

- `scripts/render-page-films.py` builds the scenes in `scripts/cinematic/`. The master is rendered at 2160 × 3840 (portrait), or 3840 × 2160 for Events, at 30 fps. An eight-second loop contains 240 distinct frames; the duplicate endpoint is excluded.
- The matching poster is rendered with the same camera and lighting. 1080 and mobile encodes are derived from the native master, with MP4 metadata moved before media data for prompt playback.
- Smaller encodes scale the entire frame; a center crop is not a valid rendition. The city exports 19 seconds at 24 fps, including the loop transition, in native 4K, 1080 and 960 × 540 streams.
- Earth uses NASA's Blue Marble land texture and cloud imagery. The cloud source is recorded beside the image in `public/assets/earth-journey/nasa-clouds-credits.json` and credited on the World page.
- The city is a separate native 3840 × 2160 Blender camera journey. Its renderer and loop assembly live in `scripts/render-city-journey.py`.
- Existing user-supplied videos retain their source resolution. In particular, the main-page black-hole clip is 1280 × 720; displaying it on a 4K screen does not make it native 4K.

## Playback

`PageScene` chooses one stream before fetching it. Films start automatically when their picture is visible. Scrolling temporarily controls the film's playhead in either direction; releasing the scroll resumes the loop. Pointer movement is damped and bounded inside an overscanned image, so moving to a corner cannot reveal an edge.

Pause, page visibility and reduced-motion preferences take priority over playback and scrolling. Reduced-motion visitors receive the poster without downloading the film. The main-page black-hole film is strictly scroll-controlled.

## Text and interaction

The editor opens with a complete readable snippet. An immutable sequence illustrates keystrokes, corrections, drag selections, replacements and paste operations over that baseline; rows not yet reached by the animation remain populated, including the terminal. This prevents internal scrolling or inspection from exposing empty future rows. It seeks deterministically in either direction with scroll. Its illustrated selection never changes the browser's real selection. Actual selection pauses the demonstration; Copy code writes only after the user activates that button. Headline treatments share their chapter's scroll timeline and revert cleanly for reduced motion.

## Identity and localized effects

The CGS voxel identity is original Blender geometry: 278 independently moving, bevelled metallic blocks. `scripts/render-voxel-logo.py` produces a seamless four-second, 96-frame loop with transparency. The large identity chapter uses a 640 px animation; navigation uses a separate 160 px rendition. Static posters cover reduced motion, paused or hidden marks, and failed animation loads. Blue/cyan and violet regions coexist across the block surfaces; a spatially phased wave blends their material colors through the loop, while sparse amber cores remain distinct.

The homepage title samples a 64 × 36 copy of the already-decoded city frame roughly six times per second. Three local color bands tint the glass letters, with bright edges and a stable readable fallback. Sampling stops when the city is paused, hidden, offscreen or reduced motion is requested; it does not fetch or decode another film.

Violet particles and procedural smoke appear around the homepage card for 5.6 seconds on arrival or a flip, then clear and stop. They are not added to the other chapters. Card pause also pauses the city, reflections and violet effects.

The About chapter presents the cube as a sculpture; Events uses an expandable editorial agenda. Subpages share a slide-down Explore disclosure with keyboard navigation, current-page state and reduced-motion support.

## Reproduce and verify

Run Blender with `--background --python scripts/render-page-films.py -- --scene all --samples 16`. Scene files, render timings and manifests are saved under ignored `output/cinematic-v3/`; only optimized website assets are published.

`scripts/test-cinematic-films.mjs` checks rendered media, autoplay, loop rollover, pointer coverage, pause, scroll takeover, reduced motion and route layouts. Set `CGS_TEST_URL` to a frozen production preview and `CGS_PLAYWRIGHT_MODULE` to an installed Playwright module. `CGS_TEST_PAGE` optionally filters page ids. Runtime checks supplement visual inspection; browser emulation is not a claim that every physical device has been tested.

`scripts/test-subpages.mjs` covers published content, admin overrides, navigation, native-video lifecycle and poster fallback. The older `test-page-scene-motion.mjs` and `test-visible-motion.mjs` target the retired WebGL photograph renderer; use the cinematic suite for this version. `scripts/test-hero-city.mjs` covers card controls, the city and its offscreen/reduced-motion lifecycle.

`scripts/test-source-panel.mjs` exercises the real Source chapter in Chromium and WebKit: initial content, scrolling into future lines, reversing the chapter, selecting text, keyboard inspection, copying, reduced motion and resizing to a phone viewport. It asserts that every visible nonempty source row stays readable. Use the same `CGS_TEST_URL` and `CGS_PLAYWRIGHT_MODULE` settings as the film suite.
