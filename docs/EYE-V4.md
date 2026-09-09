# Blue cinematic eye — September 9, 2026

The supplied screenshot is a visual reference for the eye only. The artwork is original; the desktop, interface and writing in the screenshot are not used. Both materials were created with ChatGPT's built-in image-generation tool, then losslessly retained as PNG originals and compressed to WebP for the website. No image-generation CLI or API was used.

## Saved artwork

All paths below are relative to the repository root.

- Open eye: `public/assets/scenes/eye-cinema-v4.png` and `.webp`, 1536×1024.
- Closed lid: `public/assets/scenes/eye-cinema-closed-v4.png` and `.webp`, 1536×1024.
- Desktop fallback: `public/assets/scenes/eye-still-v4.png` and `.webp`.
- Phone fallback: `public/assets/scenes/eye-still-v4-mobile.png` and `.webp`.

The fallback images are exports of the actual browser renderer with the live-code canvas at a fixed time. They are not separately generated art. The production eye materials total approximately 233 KB in WebP form.

## Generation prompt — open eye

Create ORIGINAL eye artwork for a cinematic interactive website, using ONLY the blue eye in the center-bottom of this screenshot as a STYLE REFERENCE. Ignore and do not reproduce the desktop, apps, text, subtitles, logos and interface. Landscape 1536x1024. One beautiful open human-inspired animated eye, blue-lit, with detailed blue iris, smooth softly dimensional blue eyelids, long elegant tapered upper lashes and fine lower lashes, like a high-budget animated science film. Anatomically convincing but gently stylized, no creepy skin pores, no veins, no redness. Tight closeup, deep navy shadows merging into pure black at ALL four outside edges. Eye aperture placed horizontally centered with inner corner at x=20% y=56%, outer corner at x=82% y=49%; upper lid highest at x=56% y=35%; lower lid lowest at x=52% y=70%. Calm wide eye, not angry or scared. Large blue iris centered near x=56% y=52%, partly covered by the upper lid, large dark pupil. Sclera has cool pale blue spherical shading and shadow from the upper lid. Rich icy blue iris radial detail, sapphire limbal ring. Eyelids and lashes MUST be clearly visible in cool blue directional monitor light, the skin above and below gradually disappears into black. Black left third with graceful curved inner lid sweeping up into the eye. No eyebrow necessary. No reflected writing or screen at all: pupil clean and dark, only a tiny soft catchlight, since actual animated code will be added by the web renderer. Do not draw text, words, numbers, symbols, icons, computer monitors or captions. Beautiful material and eye shape are the focus, not a diagram or isolated flat eye logo.

## Edit prompt — closed lid

Animation pose edit: create the FULLY CLOSED BLINK frame of this exact same eye. Keep the exact 1536x1024 canvas, framing, all blue lighting, identical skin shading, inner corner, outer corner, lower-lid position, and black fade at all edges. The upper eyelid descends to meet the existing curved LOWER eyelid, so the closed contact seam runs near the original bottom edge of the open aperture: approximately x20% y62%, through x52% y68%, to x81% y49%. It is a calm quick blink, not a squint; do not move the whole eye or face. All iris, pupil and sclera completely covered by a smoothly curved blue upper eyelid. The upper lashes follow the closing lid and sweep gently DOWN over the contact line, do NOT remain stretched upward. Fine graceful tapered eyelashes, softly shaded curved upper lid fold, no crease exaggeration. Preserve the lower lashes and surrounding skin. Lids genuinely touch, no bright white slit, no visible iris, no eyeball showing at the corners. No text, code, screen, eyebrow, props or new highlights.

## Motion and reflection

`cinematicEyeShader.ts` traces the material's upper, lower and closed contours. Inverse deformation moves the lid material while preserving the shape of the iris underneath. The closed material provides the contact pose and lash silhouettes. Automatic gaze, pointer tracking and the existing 130ms close / 30ms contact / 270ms open timing remain independent of scroll position. Motion stops when paused, offscreen or in a hidden tab.

`codeReflection.ts` paints three valid TypeScript algorithms: positive-regret normalization, cumulative probability sampling, and legal-move simulation. The editor types at 34 characters per second, selects and replaces code, and starts with several complete lines so movement is immediately visible. It uses five larger rows on desktop and four on phones. Glyphs remain upright inside a gently curved corneal reflection; there is no baked writing in either material. The reflection updates at most 25 times per second, independently of the eye's display-rate motion.

Reduced motion shows an open, centered still. If WebGL is unavailable, a renderer export retains both the artwork and actual code. The phone fallback preserves the phone composition. Recovered GPU contexts re-upload both eye materials and the reflection.

## Verification

The focused browser checks passed in Chromium and WebKit at 1440×900 and 390×844: automatic playback, intermediate and full-contact blink poses, pause/resume, stable paused gaze during scrolling, pointer tracking on desktop, offscreen suspension, live reduced-motion changes, zero horizontal overflow, no runtime errors and no missing assets. Chromium also passed forced GPU context loss/recovery with an identical restored still.

Actual open, partially closed and fully closed frames were inspected at desktop and phone sizes. Local moving-eye frame intervals were approximately 8.4ms median / 17.1ms p95 in Chromium desktop, 8.3 / 9.2ms in Chromium phone and 17 / 18ms in both WebKit cases. These measurements describe this test host and emulated viewports; they are not a guarantee for every physical device.

The production build passed a second Chromium desktop / WebKit phone check: both eye poses loaded, automatic motion and pause/resume worked, the shared black-hole and Earth shader still rendered, and the galaxy renderer initialized. Both desktop and phone no-WebGL fallbacks served the correct v4 renderer export. TypeScript, production compilation and the real-page stub build passed.
