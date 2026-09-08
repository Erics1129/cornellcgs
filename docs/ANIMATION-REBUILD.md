# Animation rebuild — September 2026

The visual direction is a quiet scientific cinema: tactile cards and stones, photographic scene textures, cool silver light, deliberate scroll choreography, and readable stationary copy. Existing club information, editable content, real page URLs, roster photographs, and the original hero card film remain in place.

## Generated assets

Created using ChatGPT's built-in image generation tool. The full-resolution PNG originals are saved beside the compressed WebP production textures in `public/assets/scenes/`. The equirectangular Earth artwork is a decorative generated illustration, not a scientific geographic dataset.

- **black-hole**: A centered black event horizon, ivory photon ring, blue-white silver plasma filaments and lensing arc in a pure-black landscape. No text or equations. In the browser, scroll progress deforms the plasma and changes its azimuthal light.
- **earth-map**: An evenly illuminated, seamless, 2:1 equirectangular satellite-style surface, recognizable continents, polar ice and cloud systems. No labels or baked-in directional shadows. The browser wraps it around a sphere, rotates longitude and calculates lighting and atmosphere.
- **vision-eye**: A centered photoreal macro eye, blue-grey iris fibres, scleral veins, individual lashes, moist lid edges, black pupil and black surroundings. The browser displaces the cornea toward the pointer, masks natural blinks and reflects actual code from an independently drawn editor.

The `SceneCanvas` fallback keeps an image visible if WebGL cannot initialize. GPU textures initialize near the viewport. Black hole and globe request new frames only while scroll or pointer input is settling. The eye is the intentional autonomous scene; its code reflection is limited to 25 updates per second. All scenes stop rendering outside their observed region or in a hidden tab. Reduced-motion mode renders stills and readable text.

The AlphaGo background is a separate Blender render, generated from `scripts/render-go-scene.py`: a beveled dark wooden Go board, individual obsidian and porcelain stones, soft area lights and a perspective camera. Its production WebP keeps the original render available alongside it.

## Skills installed from GitHub

- [Official GSAP skills](https://github.com/greensock/gsap-skills): core, React lifecycle, ScrollTrigger, performance.
- [OpenAI frontend testing and debugging](https://github.com/openai/plugins/tree/main/plugins/build-web-apps/skills/frontend-testing-debugging).

Existing local redesign guidance was used with the user's visual and content choices taking precedence. Native scroll and CSS sticky layout drive the new flagship chapters; there is no scroll snapping or gesture lock.

## Verification flow

Home → scroll through each chapter forward and backward → interact with cards and eye focus → open a real subpage → go Back to the same position. Validate desktop, phone, tablet, large screen, reduced motion, disabled WebGL, no missing assets, and console errors. Use actual screenshots as visual evidence; a successful build alone does not validate smoothness.
