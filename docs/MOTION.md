# Motion contract

The site speaks ONE motion language. Use nothing outside this file.

## Easing
- GSAP: `import { EASE } from '../lib/eases'` → `ease: EASE.out` (`'site.out'`) for
  every reveal/arrival/hover-driven tween; `EASE.inOut` (`'site.inOut'`) for moves
  that both leave and arrive (sheet slides, swaps). `elastic.out(1, 0.5)` is allowed
  ONLY for magnetic returns. `'none'` for scrubbed tweens.
- CSS: `var(--ease-out)` = cubic-bezier(0.16,1,0.3,1); `var(--ease-in-out)` =
  cubic-bezier(0.83,0,0.17,1). Never write a raw cubic-bezier, never leave a
  Tailwind default ease on anything that moves (add `[transition-timing-function:var(--ease-out)]`
  or a CSS class).

## Duration bands
- Hover/press: 0.25–0.35s (`var(--dur-fast)` = 0.3s)
- Reveals: 0.6–0.9s (`var(--dur)` 0.6s, `var(--dur-slow)` 0.9s); hero-scale moments up to 1.2s
- Exits: ~60% of the matching entrance
- Staggers: 0.04–0.12s

## Utilities that already exist (global.css) — use, don't re-implement
- `.link-wipe` — directional underline (in from left, out to right). Replaces every `hover:underline`.
- `.btn-label` dual-label hover — markup `<span class="btn-label"><span>Text</span><span aria-hidden="true">Text</span></span>` inside a `.btn` or any `a:hover` context.
- `.grain-light` — static paper grain for white sheets (put on the sheet root).
- `.sheet-light` — selection/focus fixes for white sheets (put on the sheet root).
- `.film-grain` — global, already mounted in App.tsx. Don't add more.
- `[data-counter]` gets tabular-nums automatically.
- `src/lib/magnetic.ts` → `attachMagnetic(el, clampPx?)` returns cleanup. Desktop-only + reduced-motion safe already.

## Hard rules (violations = regression)
- 120fps: transforms/opacity only in per-frame paths. No backdrop-filter additions, no
  View Transitions, no animating height/max-height/max-width/box-shadow/filter — use
  scaleY/clip-path/grid-template-rows(0fr→1fr)/pre-blurred layers instead.
- Never leave a leftover transform on an ancestor of position:fixed chrome (clearProps).
- ScrollTrigger pins keep their refreshPriority; call ScrollTrigger.sort() stays in scroll.ts.
- prefersReducedMotion() (src/lib/motion.ts) gates every non-essential animation.
- Free scroll stays; no scroll hijacking.
- Copy stays TBA/TBD — no invented facts.
