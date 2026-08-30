# Module contracts — cornellcgs

Read this before writing any module. The full design brief is in `docs/brief.md`.
The user has overridden the brief in three ways:
1. The hero card is the provided `public/assets/card.mp4` video (already built, do not touch).
2. Every section is a full-viewport "chapter" (`.section` is `min-height: 100svh`).
3. The World section is one ENTIRE page: the globe video full-bleed across the whole viewport.

## Toolchain
- Node lives at `~/.local/node/bin` — every shell command needs
  `export PATH="$HOME/.local/node/bin:$PATH"` first.
- Typecheck with `cd /Users/eric/Claude/cornellcgs && npx tsc --noEmit`. It must pass.
- Do NOT run the dev server, do NOT run git commands, do NOT touch files outside the ones
  assigned to you.
- React 18 + TypeScript strict + Tailwind v4 (utility classes available). GSAP 3.15 with
  ScrollTrigger and free SplitText. Lenis drives smooth scroll (already wired).
- NO three.js / react-three-fiber — they were removed. WebGL is raw WebGL where specified.

## Shared systems (already implemented — use, don't reinvent)
- **Theme**: `src/lib/theme.ts`. `currentTheme(): 'blue'|'red'`, `onTheme(cb)` subscribe,
  `cssVar('--neon-mid')` reads current CSS custom property values off `<html>`.
  Theme swaps happen instantly under a view-transition wipe — canvas/WebGL layers should
  smoothly lerp their own colors over ~0.8 s when `onTheme` fires (or read `cssVar` each
  frame; the CSS vars themselves do NOT animate, only the DOM wipe reveals them).
- **Design tokens**: CSS vars on `<html>`: `--bg-top --bg-mid --bg-bot --glow --text
  --muted --neon-core --neon-mid --neon-dim --ivory --ink --silver --cornell-red
  --accent-amber`. Values in `src/styles/global.css`.
- **Motion helpers**: `src/lib/motion.ts`. `prefersReducedMotion()`,
  `onReducedMotionChange(cb)`, `isTouchDevice()`, `shake(intensity 0..1)` (fires the
  page-wrapper screen shake), `SOUND_EVENT`/`soundEnabled()` (footer glass-sound toggle
  dispatches `cgs:sound` CustomEvent<{on:boolean}> and persists in localStorage).
- **Reveals**: `src/lib/reveal.ts` — `useSectionReveals(ref)` powers `data-reveal`
  attributes (`heading` = masked line rise, `para` = fade up, `card` = tilt settle).
- **Shared UI**: `SectionIndex` (card corner rank+suit), `CardShell` (cursor-tilt card),
  classes `.neon` (hover comet edge), `.panel`, `.glass`, `.card-face-surface`,
  `.card-back-surface`, `.h-section`, `.h-card`, `.mono`, `.eyebrow`, `.container-site`,
  `.section`, `.body-muted`. Copy lives in `src/content.ts`.
- **Interactivity guard**: interactive elements carry `data-interactive`. The glass
  shatter layer must never start on them, on links/buttons/inputs, or on text content.

## Fixed layer stack (App.tsx)
z-0 GradientBG (fixed canvas) → z-1 CodeLayer (fixed canvas) → z-2 ShatterLayer (fixed
canvas) → z-10 page content (inside the shake wrapper) → z-50 nav.
Layer components are mounted once in App and must render a `fixed inset-0` element with
`pointer-events-none` (ShatterLayer listens on `window`, not on its canvas).

## Performance rules (§7 of the brief)
- DPR cap: 1.75 for WebGL, 2 for 2D canvas.
- Pause all rAF loops when `document.hidden`, and pause offscreen work.
- Respect `prefersReducedMotion()` exactly as the brief says (§7).
- 60 fps with everything running on a recent laptop.

## Videos
- `public/assets/globe.mp4` — 720×1280 portrait, 8 s, 24 fps. Poster/fallback:
  `public/assets/globe_reference.png`.
- `public/assets/blackhole.mp4` — 1280×720, 8 s, 24 fps. Poster/fallback:
  `public/assets/blackhole_math.jpg`.
- `public/assets/card.mp4` — hero, already integrated.
