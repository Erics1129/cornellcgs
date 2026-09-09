# Homepage code city

Only `App.tsx` mounts `CodeCity`, replacing `GradientBG` and `CodeLayer`. Standalone information pages retain their own themes. Opaque Earth, universe, Go, ML and eye chapters keep their original scenes and suspend the hidden city.

## Artwork

- Mode: built-in OpenAI image generation tool (`image_gen.imagegen`), new image, no reference image.
- Generated master: `/Users/eric/.codex/generated_images/01a082a0-c123-7ba2-8933-135c9dd2ab62/exec-2b7203f1-a65b-4d2a-9c52-af5da4a02bfd.png`.
- Shipped asset: `public/assets/scenes/code-city-v1.webp`, 1536×1024, WebP quality 86. Original master retained.
- This is fictional city artwork. Destination photographs in the Earth journey are real and separately credited.

Exact generation prompt:

> Create one premium cinematic website background artwork, landscape 1536x1024. A futuristic neon CODE CITY viewed in first person from a low camera gliding forward along a broad empty avenue. Precise architectural composition with a central vanishing point at 52 percent width and 48 percent height, very deep perspective. Monolithic translucent dark glass towers on both sides, intricate illuminated vertical circuit patterns and tiny abstract code glyphs embedded in facades, elevated thin light bridges, long cyan lane lights receding to a distant skyline. Near-black midnight navy, electric cyan, cobalt blue and subtle ultraviolet neon, restrained bright mint highlights. Photographic-quality atmospheric light, fine architectural detail, wet obsidian reflections, soft luminous haze far away, no harsh bloom. The central 35 percent must be calm, mostly dark negative space for a foreground hero card and text. Outer side thirds hold the interesting detailed towers; do NOT fill center with a focal object. Elegant clean science-fiction concept art, premium film production design, sophisticated not a game UI, no people, no vehicles, no logos, no giant text, no UI, no frames, no titles, no watermark. Clear single continuous scene, eye-level immersive viewpoint. This is the distant city plate for an interactive web animation; preserve straight vertical architecture and consistent perspective.

## Motion and fallback

The artwork is the distant plate. A low-cost rasterized 3D city supplies actual forward travel, recycled nearby buildings, moving road lines and code-lit facades. Four real source fragments are rendered once into an atlas. Pointer movement adjusts the camera gently; scrolling adds bounded momentum. No per-frame React rendering or canvas text painting is needed.

The five color worlds retain their foreground colors. Light blue and lilac add a pale city mist; dark worlds retain the midnight atmosphere. No backdrop is applied to subpages. Reduced motion displays the still artwork. GPU failure or loss retains that artwork; restoring the context rebuilds the renderer. Visibility, section coverage, resizing and disposal are managed by the component.

## Verification

`scripts/test-earth-city.mjs` covers Chromium and WebKit, desktop and phone viewports, automatic city travel, light themes, all six Earth destinations, exact reverse/stop behavior, keyboard credits, rapid scroll reversals, return-to-spot navigation, and reduced-motion fallback. Run against a built preview with `CGS_TEST_URL`; `CGS_PLAYWRIGHT_MODULE` can point to an existing Playwright installation. No new runtime dependencies were added.

The renderer aligns its camera intrinsics to the generated plate's measured vanishing point (50.7% across, 70.5% down), recalculating for cover cropping. It draws at native requestAnimationFrame cadence, with a bounded pixel budget instead of frame skipping.

Production-preview checks on September 9, 2026 passed at 1440×900 and 390×844 in Chromium and WebKit. All six photos loaded; reverse/stop image comparisons, short-stop keyboard focus, exact return position and reduced motion passed. Scroll sample median/p95 frame intervals were 16.6/17.5 ms (Chromium desktop), 8.3/9.3 ms (Chromium phone viewport), 17/18 ms (WebKit desktop), and 17/19 ms (WebKit phone viewport), with no frames above 50 ms in those samples. These are local browser measurements, not a frame-rate guarantee for every physical device.
