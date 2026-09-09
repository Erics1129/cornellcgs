# Animation rebuild — September 2026

The visual direction is stylized scientific cinema: sculpted game pieces, luminous space, an animated glass eye, cool silver light and varied scroll typography. Earth retains its realistic surface and atmosphere. Existing club information, real page URLs, roster photographs, and the original hero card film remain in place.

## Generated assets

Created using ChatGPT's built-in image generation tool. The full-resolution PNG originals are saved beside the compressed WebP production textures in `public/assets/scenes/`. The earlier generated Earth map is retained as an unused asset. The live globe now uses NASA Blue Marble data; it is documented separately from generated assets.

- **black-hole**: A centered black event horizon, ivory photon ring, blue-white silver plasma filaments and lensing arc in a pure-black landscape. No text or equations. In the browser, scroll progress deforms the plasma and changes its azimuthal light.
- **Earth**: The live 4096×2048 texture is NASA Blue Marble: Next Generation, July 2004 with topography and bathymetry, at `public/assets/earth-journey/earth-nasa-july-4096.webp`. Latitude is applied before longitude so the close-up lands over North America and New York. Runtime lighting and atmosphere are illustrative; this is a satellite-data composite, not live weather. The generated `earth-map` predecessor remains unused.
- **galaxies**: The first destination uses blue/cyan/lavender spiral arms (`galaxy-stylized.png` / `galaxy.webp`). The second uses sculptural violet/magenta arms around an amber core (`galaxy-violet.png` / `galaxy-violet.webp`). Both were generated and art-directed with the built-in image generation tool. `galaxy.png` retains the predecessor for provenance.
- **eye v4**: Two generated blue-lit eye materials supply the open eye and closed lid, including tapered lashes and softly dimensional skin. The shader moves the lids and lashes around an uncompressed cornea, dilates the pupil, and reflects a separate canvas that types real TypeScript algorithms. Gaze and blinking start automatically. Desktop and phone renderer exports provide the no-WebGL fallback. Full prompts, assets and verification are in [EYE-V4.md](EYE-V4.md); previous eye materials remain unused.

The `SceneCanvas` fallback keeps an image visible if WebGL cannot initialize. GPU textures initialize near the viewport. Black hole and globe request new frames only while scroll or pointer input is settling. The eye is the intentional autonomous scene; its code reflection is limited to 25 updates per second. All scenes stop rendering outside their observed region or in a hidden tab. Reduced-motion mode renders stills and readable text.

The AlphaGo background uses a Blender board and separate porcelain/obsidian stone sprites. `scripts/render-go-play.py` reuses the materials and camera from `scripts/render-go-scene.py`, and exports the camera projection so animated stones and contact waves align with the actual intersections. A legal sequence plays automatically only while the chapter is visible. Stone landings cause a small, local camera impulse that stops immediately on leaving the chapter. See [GO-PLAY.md](GO-PLAY.md) for assets, timing, visibility guards and verification. The earlier still is retained as a loading/failure fallback.

## Automatic scenes and scroll choreography

- The eye starts on arrival, looks around autonomously, follows the pointer, and blinks using a 130ms eased close, 30ms contact and 270ms eased opening. Its simulation clock stops offscreen and in hidden tabs. A discreet pause control is optional; there is no play gate or zoom button.
- Advisor network flow, graph algorithms and the node sphere start automatically when visible and repeat with deliberate holds. Explicit pause is retained across visibility changes. Reduced motion renders a completed, readable still.
- The dice logo is a six-face CSS 3D cube with correct opposing pips, a slow 22-second tumble and pointer/focus response. It pauses offscreen and in hidden tabs. The navbar mark is 28px; subpage marks are 26px.
- `UniverseJourney` follows Earth over 650svh on desktop / 550svh on phone. Three overlapping camera legs cover a blue galaxy flyby, a warped spacetime passage and an immense violet galaxy arrival. Camera position is a pure function of scroll position, so reverse scrolling retraces the journey. Two GPU draws, 640 phone / 1040 desktop stars, bounded render resolution, no idle simulation. Streaks settle when scrolling stops; full detail returns at rest. Reduced motion and missing WebGL use the second destination still without a long sticky section.
- Earth uses a 700svh desktop / 600svh portrait journey: longer orbit, a North America approach, then real photographs of the Statue of Liberty, Jatiluwih in Bali and the Nā Pali Coast in Hawaiʻi. Native sticky layout, opacity dissolves and transform-only photo moves share one reversible scroll timeline. The globe stops rendering when photos cover it. Reduced motion presents the photos in normal document order. Sources, licenses and transformations are documented in [EARTH-MEDIA.md](EARTH-MEDIA.md) and credited on each image.
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

## Eye material and second destination prompts

**Iris material.** Square, straight-on orthographic iris texture, black exterior and concentric black pupil; irregular muted slate-blue, grey-teal and silver radial fibres, subtle amber collar. Diffuse even lighting, gently painterly material, no sclera, lids, skin, veins, screen reflection, catchlights, text, mechanical lens or neon rings. Generated at 1280px, resized to 1024px and encoded as WebP. Pupil and corneal reflection are constructed separately in the shader, so the raster does not dictate the animation.

**Second galaxy.** A centered slightly inclined spiral, broad violet, mauve and magenta arms, soft amber-white core, black edges and a crescent of negative space between arms. Restyled with image generation into smooth layered ribbons and billowing nebula clouds like an animated science film, without photographic grit, lens flare, text, planets or spacecraft. Final 1536×1024 PNG is retained beside the optimized WebP.

## Extended journeys and eye v3 verification

The combined production check passed in Chromium and WebKit at 1440×900 and 390×844: real photo assets loaded, Earth stopped after scrolling settled, photo transforms reversed to the same pose, both galaxy textures loaded, the eye started automatically and paused/resumed, all sampled headings remained visible, subpage return offset was zero, and live reduced-motion changes preserved position. There were no runtime errors, missing same-origin assets or horizontal overflow in those cases. Disabled WebGL showed the new eye still and galaxy fallback. A focused eye review also verified that context restoration reuploads the reflection in reduced motion and paused gaze no longer drifts during scrolling.

Recorded moving-corridor frame intervals on this test host were approximately 25ms median / 33.4ms p95 for headless Chromium desktop, 15.7 / 17.6ms for Chromium phone, 17 / 23ms for WebKit desktop and 16 / 21ms for WebKit phone. These are local browser measurements under test load, not a universal frame-rate guarantee. Rendering stops at rest/offscreen; the corridor uses two GPU draws and reduced drawing resolution during motion on larger viewports.
