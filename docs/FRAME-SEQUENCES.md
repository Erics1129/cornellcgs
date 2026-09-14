# Generated scenes and animation

The September 2026 update uses **built-in `image_gen.imagegen`** for the artwork. The exact final prompt set, including the advisor cleanup edit, is in [generated-scene-prompts.json](generated-scene-prompts.json).

## Subpages

Nine generated filmstrips supply **27 scene keyframes**. Each page loads only its own three optimized WebP frames. The images retain distinct stages of an action; the browser sequences those stages with short transitions and restrained continuous motion. These are animated image compositions, not independently generated video frames.

| Page | Scene | Website assets |
|---|---|---|
| Who We Are | Ivory and navy forms interlock | `public/assets/page-scenes/who-we-are/` |
| What We Do | Game pieces assemble on branching rails | `public/assets/page-scenes/what-we-do/` |
| Our ML Process | Signals travel through glass layers | `public/assets/page-scenes/ml-process/` |
| Events | An orange domino wave | `public/assets/page-scenes/events/` |
| World | A topographic globe changes orientation | `public/assets/page-scenes/world/` |
| Our Team | Navy and ochre ribbons weave together | `public/assets/page-scenes/people/` |
| Advisors | A node structure grows and connects | `public/assets/page-scenes/advisors/` |
| Join | Doors open toward a sunlit courtyard | `public/assets/page-scenes/join/` |
| Contact | Brass signal rings turn around a light | `public/assets/page-scenes/contact/` |

Each directory contains `0.webp`, `1.webp`, and `2.webp`. Events uses wide frames; the other sequences use portrait frames. Generated masters are retained locally in `output/imagegen/`. They are not downloaded by the website.

## Eye

The eye uses **nine pose images**: center, left, right, up, down, quarter-closed, half-closed, three-quarter-closed, and closed. Seven poses were generated for this update; center and closed retain the earlier image identity. Production images live in `public/assets/sequences/eye-v5/`.

Gaze images represent actual changes within the eye socket. Runtime interpolation connects those positions, and a separate live code texture supplies the reflection. The code is rendered from real source snippets, not image-generated text. Mouse input, automatic gaze, and blinking share the same renderer.

A deterministic **120-frame preview at 30 fps** is exported in `output/eye-sequence/frames/`, with pose proofs and a manifest alongside it. `scripts/render-eye-sequence.mjs` reproduces that export against the development renderer. The website retains interactive rendering rather than replacing the eye with this fixed preview.

## City

Two generated district images provide architectural materials for a Blender scene. A real camera follows the streets, turns around corners, and enters a plaza. The numbered render frames, Blender project, camera route, and render manifest remain in `output/city-journey/`; the reproducible source is `scripts/render-city-journey.py`.

The website uses compressed movies in `public/assets/sequences/`, with a smaller version for phones. Generated district images are also retained in `public/assets/sequences/city/`. The city remains confined to the opening hero; card color changes do not recolor it.

**480 source frames at 24 fps** become a **456-frame / 19-second loop** after a one-second dissolve joins the end to the beginning. The right turn begins around 5.2 seconds; the left turn begins around 10.7 seconds. The desktop movie is 1280×720; the phone movie is 960×540.

## Playback and access

Scenes play automatically while visible, pause offscreen or in hidden tabs, and respect reduced motion. The eye and each subpage provide a pause control. Text, roster entries, email links, the coffee-chat link, and navigation remain normal page content. The existing published-content system supplies the copy before rendering.

## Reproduction

The prompt manifest records every selected source and its website destination. Original image-generation outputs remain untouched. Local `output/` contains intermediate masters and render frames and is intentionally excluded from Git; optimized website media and rendering sources are versioned.

## Validation for this release

The final production preview passed all nine subpages in Chromium desktop and WebKit phone layouts: content overrides, artwork loading, autoplay/pause, hidden-tab and offscreen suspension, reduced motion, email and coffee-chat links, responsive overflow, and exact return-to-deck position. A missing artwork frame also retains visible content and a still fallback.

The city passed desktop Chromium and phone WebKit playback, card interactions, fixed palette, hero-only placement, and reduced-motion checks. The upgraded 960×540 mobile movie passed WebKit decoding and looping. The Earth journey passed its six destinations, reverse scrolling, keyboard input, rapid scroll changes, and return-position checks.

The eye passed automatic playback, pause/resume, offscreen suspension, reduced motion and WebGL error checks in the production preview on Chromium desktop and WebKit phone. Additional development checks cover gaze poses, lid occlusion, live code, missing directional images and context restoration. These checks verify the tested browsers and viewport sizes; they do not claim a fixed frame rate on every device.
