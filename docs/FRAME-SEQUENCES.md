# Generated scenes and animation

The September 2026 update uses **built-in `image_gen.imagegen`** for the artwork. Final subpage prompts are in [generated-cinematic-prompts.json](generated-cinematic-prompts.json); eye, city and earlier reference prompts are in [generated-scene-prompts.json](generated-scene-prompts.json).

## Subpages

The final artwork is **nine new photographic masters**, generated with built-in `image_gen.imagegen`. Exact prompts, original generated paths, local masters, and public asset paths are in [generated-cinematic-prompts.json](generated-cinematic-prompts.json). These are generated images animated by a continuous camera and light pass; they are not AI-generated video clips.

| Page | Generated subject |
|---|---|
| Who We Are | Ivory and navy sculpture in a sunlit gallery |
| What We Do | Polished Go stones on a graphite table |
| Our ML Process | Glass fibres and an optical processor |
| Events | Amber dominoes and Go stones at golden hour |
| World | Earth from orbit at sunrise |
| Our Team | Woven navy and ochre silk |
| Advisors | A finely machined chrome network sculpture |
| Join | A sunlit travertine courtyard |
| Contact | A brass and glass optical instrument |

Website assets live at `public/assets/page-scenes/<page-id>/cinematic-v2.webp`. Each route requests only its own image (150–409 KB). Generated PNG masters are copied to `output/imagegen/cinematic-v2/`; `scripts/prepare-cinematic-images.mjs` reproduces the WebP encoding. The earlier `0.webp`, `1.webp`, `2.webp` remain for cache compatibility and fallback, but are not cycled as a slideshow. Events retains panoramic framing; other pages retain portrait framing.

## Eye

The eye uses **nine pose images**: center, left, right, up, down, quarter-closed, half-closed, three-quarter-closed, and closed. Seven poses were generated for this update; center and closed retain the earlier image identity. Production images live in `public/assets/sequences/eye-v5/`.

Gaze images represent actual changes within the eye socket. Runtime interpolation connects those positions, and a separate live code texture supplies the reflection. The code is rendered from real source snippets, not image-generated text. Mouse input, automatic gaze, and blinking share the same renderer.

A deterministic **120-frame preview at 30 fps** is exported in `output/eye-sequence/frames/`, with pose proofs and a manifest alongside it. `scripts/render-eye-sequence.mjs` reproduces that export against the development renderer. The website retains interactive rendering rather than replacing the eye with this fixed preview.

## City

Two generated district images provide architectural materials for a Blender scene. A real camera follows the streets, turns around corners, and enters a plaza. The numbered render frames, Blender project, camera route, and render manifest remain in `output/city-journey-v3/`; the reproducible source is `scripts/render-city-journey.py`.

The website uses compressed movies in `public/assets/sequences/`, with a smaller version for phones. Generated district images are also retained in `public/assets/sequences/city/`. The city remains confined to the opening hero; card color changes do not recolor it.

**480 source frames at 24 fps** become a **456-frame / 19-second loop** after a one-second dissolve joins the end to the beginning. The right turn begins around 5.2 seconds; the left turn begins around 10.7 seconds. The current `city-journey-v3` desktop movie is 1280×720; the phone movie is 960×540. Its actual horizontal camera field of view is 91.6° (previously 78.6°), with taller skyline landmarks. Bounded mouse look adds a damped shift while overscan keeps every viewport edge covered. The authored camera path remains continuous through both corners.

## Playback and access

Scenes play automatically and repeat continuously while visible, pause offscreen or in hidden tabs, and respect reduced motion. Subpage cameras follow a bounded, damped mouse target, retarget from their current position during rapid reversals, and return smoothly when the pointer leaves. Camera translation, zoom and lighting are harmonics of a 20-second cycle. The image is sampled once per pixel with a uniform crop: subject edges do not warp, split, or morph between poses. Extra image coverage bounds mouse motion without revealing edges. The eye and each subpage provide a pause control. Text, roster entries, email links, the coffee-chat link, and navigation remain normal page content. The existing published-content system supplies the copy before rendering.

## Reproduction

The prompt manifest records every selected source and its website destination. Original image-generation outputs remain untouched. Local `output/` contains intermediate masters and render frames and is intentionally excluded from Git; optimized website media and rendering sources are versioned.

## Validation for this release

The final subpage renderer is checked using `scripts/test-subpages.mjs` for routes, content, controls, loading and fallback, and `scripts/test-page-scene-motion.mjs` for loop continuity, mouse corners, rapid reversals, pixel coverage and resource stability. Across the final checks and targeted reruns, all nine subpages passed in Chromium desktop and WebKit phone layouts, including published-content fixtures, page links, pause/resume, offscreen/hidden suspension, reduced motion and exact Back navigation. All nine scenes passed full 20-second loop and actual desktop mouse sweeps. WebKit phone motion checks covered ML, Events and Join. Loop endpoint pixel differences were zero in the deterministic samples; every sampled crop retained source-image coverage.

The interruption test found stale GPU handles being deleted after context restoration. `PageScene` now disposes them during context loss; the final Chromium/WebKit interruption and recovery tests pass. Results: `/tmp/cgs-image-production/`, `/tmp/cgs-image-production-recheck/`, `/tmp/cgs-image-recovery-final/`, `/tmp/cgs-image-motion/`, and the targeted `motion-recheck-desktop` / `motion-recheck-phone` directories. Initial failures in those directories are retained alongside their successful targeted rechecks; cache assertions were corrected to distinguish HTTP 304 headers from duplicate image-body downloads.

City v3 passed five Chromium/WebKit viewport cases, including two uninterrupted native loops on desktop and phone, hero-only placement, fixed palette and reduced-motion checks. Local evidence lives in `output/city-journey-v3/`.

The eye passed the expanded Chromium tests and a WebKit 26.5 desktop/phone smoke: actual pointer corners, rapid reversals, full blink closure during tracking, code reflection, pause/reduced motion, and context restoration. WebKit recorded 689 pixel checks without blank eye frames or eye WebGL errors. The pre-existing external content-feed 404s are recorded separately in `/tmp/cgs-eye-webkit-smoke/assessment.json`. Browser phone viewports are emulated; physical devices were not used.

## Continuous scene implementation

`src/effects/pageSceneImage.ts` is a small raw WebGL2 image renderer, dynamically imported near the viewport. It uses one generated photograph, one draw call, a 1.6-million-pixel ceiling, and a DPR ceiling of 1.75. The light pass is restrained and follows existing image highlights. No geometry recreates the subject, and no Three.js dependency is required.

`PageScene.tsx` owns the scene clock, visibility, mouse damping, pause and teardown. It performs no recurring renderer work while offscreen, hidden, paused or under reduced motion. A necessary static redraw still occurs after resize or preference changes. Unavailable/lost WebGL retains a generated still; restoration rebuilds the image renderer. Pointer bounds refresh on entry, scrolling and resize. Touch input does not start hover movement. The camera smoothly returns when the pointer leaves or the window blurs.
