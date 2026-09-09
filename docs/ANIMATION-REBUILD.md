# Animation rebuild — September 2026

The visual direction is stylized scientific cinema: sculpted game pieces, luminous space, an animated glass eye, cool silver light and varied scroll typography. Earth retains its realistic surface and atmosphere. Existing club information, real page URLs, roster photographs, and the original hero card film remain in place.

## Generated assets

Created using ChatGPT's built-in image generation tool. The full-resolution PNG originals are saved beside the compressed WebP production textures in `public/assets/scenes/`. The equirectangular Earth artwork is a decorative generated illustration, not a scientific geographic dataset.

- **black-hole**: A centered black event horizon, ivory photon ring, blue-white silver plasma filaments and lensing arc in a pure-black landscape. No text or equations. In the browser, scroll progress deforms the plasma and changes its azimuthal light.
- **earth-map**: An evenly illuminated, seamless, 2:1 equirectangular satellite-style surface, recognizable continents, polar ice and cloud systems. No labels or baked-in directional shadows. The browser wraps it around a sphere, rotates longitude and calculates lighting and atmosphere.
- **galaxy**: A generated spiral destination with blue/cyan/lavender arms on black. The accepted artwork is `galaxy-stylized.png`, compressed to `galaxy.webp` (105KB). Its predecessor remains in `galaxy.png` for provenance.
- **eye**: The live eye is now procedural, with a pearl almond, a smooth sapphire iris, a curved code reflection and eased animated lids. It has no skin, veins or photographic iris. `eye-still.svg` supplies the same stylized direction without WebGL. The earlier `vision-eye` generated image is retained as an unused original.

The `SceneCanvas` fallback keeps an image visible if WebGL cannot initialize. GPU textures initialize near the viewport. Black hole and globe request new frames only while scroll or pointer input is settling. The eye is the intentional autonomous scene; its code reflection is limited to 25 updates per second. All scenes stop rendering outside their observed region or in a hidden tab. Reduced-motion mode renders stills and readable text.

The AlphaGo background is a separate Blender render, generated from `scripts/render-go-scene.py`: a beveled dark wooden Go board, individual obsidian and porcelain stones, soft area lights and a perspective camera. Its production WebP keeps the original render available alongside it.

## Automatic scenes and scroll choreography

- The eye starts on arrival, looks around autonomously, follows the pointer, and blinks using a 130ms eased close, 30ms contact and 270ms eased opening. Its simulation clock stops offscreen and in hidden tabs. A discreet pause control is optional; there is no play gate or zoom button.
- Advisor network flow, graph algorithms and the node sphere start automatically when visible and repeat with deliberate holds. Explicit pause is retained across visibility changes. Reduced motion renders a completed, readable still.
- The dice logo is a six-face CSS 3D cube with correct opposing pips, a slow 22-second tumble and pointer/focus response. It pauses offscreen and in hidden tabs. The navbar mark is 28px; subpage marks are 26px.
- `UniverseJourney` follows Earth: a native sticky first-person star flight with perspective acceleration, star streaks and an immense galaxy arrival. Camera position is a pure function of scroll position, so reverse scrolling retraces the journey. Two GPU draws, 640 phone / 1040 desktop stars, bounded render resolution, no idle simulation. Streaks settle when scrolling stops. Reduced motion and missing WebGL use the destination still without a long pinned section.
- `ScrollWords` uses masked word arrivals, alternating cascades, gentle gathering and sequential illumination across the main headings. Text stays real and selectable, retains emphasis and has no duplicate screen-reader copy. Timelines scrub backward as well as forward; no additional typing effects are added. AlphaGo's large-to-small word, the project title reveal, code typing and numeric scenes retain their distinct choreography.
- Motion-preference changes preserve the reader's current chapter and relative position while pin heights rebuild; reduced motion also disables scroll inertia. The scroll timelines follow [GSAP's media-query lifecycle](https://gsap.com/docs/v3/GSAP/gsap.matchMedia%28%29/).

## Galaxy generation prompt

Generated with ChatGPT's built-in image generation, then restyled with the same tool. Final edit prompt: "Restyle this exact composition into an elegant stylized 3D animated galaxy for an interactive website. Keep the center, spiral orientation and pure black edges exactly, 1536x1024. Replace gritty photographic dust and dense tiny stars with exquisitely smooth flowing spiral ribbons of blue, icy cyan and restrained lavender light, soft dimensional billows, like a sophisticated animated science film or sculptural generative art. The galaxy should be visibly stylized, not photorealistic, still beautiful and immense, not cartoon clipart. Warm ivory core smoothly glowing with no solid overexposed white disc. Readable layered spiral arms, silky shading, sparse crisp tiny stars, dark negative space and pure black at all outer edges. No planet, no spaceship, no writing, no interface, no badges. Subtle luminous material with dark gaps between spiral arms; cinematic restrained color. Preserve the tilted oval silhouette but make detail cleaner and less realistic."

## Skills installed from GitHub

- [Official GSAP skills](https://github.com/greensock/gsap-skills): core, React lifecycle, ScrollTrigger, performance.
- [OpenAI frontend testing and debugging](https://github.com/openai/plugins/tree/main/plugins/build-web-apps/skills/frontend-testing-debugging).

Existing local redesign guidance was used with the user's visual and content choices taking precedence. Native scroll and CSS sticky layout drive the new flagship chapters; there is no scroll snapping or gesture lock.

## Verification flow

Home → scroll through each chapter forward and backward → observe eye, dice and algorithms without clicking → pause/resume → open a real subpage → go Back to the same position. Validate desktop, phone, tablet, large screen, reduced motion, disabled WebGL, missing assets and console errors. Use actual screenshots as visual evidence; a successful build alone does not validate smoothness.

The September 8 follow-up was rendered in Chromium and WebKit, at 1440×900 and 390×844. Automatic eye playback, pause/resume, headline visibility, forward/back scroll, real-page return and live reduced-motion changes passed in all four cases, with zero runtime errors or missing same-origin assets. The return-to-page offset was zero pixels. Additional viewport checks at 232, 820 and 2560px found zero horizontal overflow. The advisor/algorithm pass covered 24 desktop/phone/motion combinations. GPU context restoration, missing galaxy texture and disabled WebGL were also checked. These are browser and emulated-viewport checks, not a claim of tests on every physical device.
