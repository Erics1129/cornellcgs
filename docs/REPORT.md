# cornellcgs.org — build report (2026-08-30)

Live at **https://cornellcgs.org** (GitHub Pages, repo `Erics1129/cornellcgs`,
DNS at Porkbun). HTTPS certificate provisions automatically after DNS; once it
does, enforce it in the repo's Pages settings (or it happens on next deploy).

## What is done

- **Eight full-viewport chapters**, strictly paged: one wheel gesture / arrow
  key = one page; inside the pinned scenes (poker board, black hole) a gesture
  advances one beat of the timeline. A screen never rests on half of two
  chapters. Phones scroll naturally (chapters can be taller than the screen).
- **Hero (A♠)** — the provided `card.mp4` floats center, masked into the
  background; words at the sides; the typing line rotates whole phrases
  ("We do research in…", "We study…", "We build…"). Clicking the card plays
  the rotate-and-zoom and radially wipes the theme at the edge-on frame:
  World 1 is white + dark blue, World 2 light blue (the clip's baked red
  backdrop is hue-shifted to blue live).
- **Who we are (K♠)** — two portrait hole cards (words + the robot-dealer
  video), TBA counters.
- **What we do (Q♠)** — pinned poker board; five cards deal from the deck spot
  and flip flop/turn/river, scrubbed to the paging beats.
- **ML process (J♠)** — `blackhole.mp4` backdrop, contain-fit (never cropped),
  grows from tiny to full-screen on arrival; the burst (shockwave, zoom-blur
  ghosts, 300–500 equation glyphs, screen shake) fires at ~60% in view; the
  title and the five roadmap words slide in on the LEFT after the burst.
- **Events (10♠)** — fanned hand, hover spreads, click opens details;
  horizontal strip on mobile.
- **World (9♠)** — the globe video fills the entire chapter, born from a dot
  (巨物对比震惊感), seamless two-element crossfade loop, poster fallback with a
  60 s drift if the file is missing.
- **People (8♠) / Join (Joker)** — flip cards and the invitation panel, all
  arriving with the colossal-contrast reveal.
- **Effects** — WebGL gradient background (breathing glow, grain, scroll
  drift, theme lerp), code-rain layer of REAL poker/CFR/equity code with
  compile flashes and a cursor spotlight, hover-only neon comet edges,
  Citadel-style navy footer bar, dropdown corner menu, left progress rail.
- **Typography** — Hanken Grotesk (closest Google font to Citadel's Graphik)
  + JetBrains Mono. Body ≥19px desktop / ≥17px mobile.
- Reduced-motion: no burst/shake/spotlight, static neon, instant paging,
  poster stills. Keyboard: paging keys, focusable cards, menu with Esc.

## User-directed deviations from the brief

- Hero card is the provided video, not a WebGL card (user: "simple, pure
  animation in the middle, words at the side").
- Glass-shatter layer built to spec, then REMOVED at user request (the footer
  sound toggle went with it).
- Globe drag-to-scrub built to spec, then removed at user request.
- Color worlds changed from navy/red to white/light-blue (user request);
  Fraunces/Manrope → Hanken Grotesk (user wants Citadel's look).
- ML roadmap is plain words, not cards; ML/World words appear after the
  animations, positioned to never cover them.
- Forced page-per-gesture scroll replaces smooth scrolling (user: "we force
  each page").
- No Actions auto-deploy: the OAuth token lacks the `workflow` scope. Deploy
  with `npm run deploy` (builds and force-pushes `dist` to `gh-pages`). The
  original workflow lives in `docs/deploy-workflow.yml` — restore it to
  `.github/workflows/` by pushing from any client with workflow scope.

## Every TODO left in the source

All in `src/content.ts` unless noted:
- Real copy for Who we are; real member/country/project/founded numbers
  (currently TBA).
- Real threads for What we do; real ML steps.
- Real events + dates (all "Date TBA").
- Real people (six "To be added" cards); portrait photos (People.tsx).
- Join form URL (`join.cta.href`).
- Email / Instagram / WeChat (all "To be added"); official registration line
  (`site.footerLine`).
- Research topics for the typing line.
- `memberCountries` list (currently unused placeholder data).

## Asset paths

- Globe video: `public/assets/globe.mp4` (poster `globe_reference.png`)
- Black hole video: `public/assets/blackhole.mp4` (poster `blackhole_math.jpg`)
- Hero card video: `public/assets/card.mp4`
- Robot dealer video: `public/assets/robot.mp4`

## Deploying updates

```
npm run deploy
```
(Node lives at `~/.local/node/bin`; the script handles PATH itself.)
