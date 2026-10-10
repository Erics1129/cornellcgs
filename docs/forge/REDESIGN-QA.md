# Close-up forge redesign validation

Validated on 2026-10-10 against the built Unity player and production Vite preview.

- Unity 6000.3.18f1 Web build succeeded; version `b6b762a8a9c1013c`.
- Full site typecheck/build and focused ESLint passed. Existing solver, Ink Maze, Forge and Worker tests passed, including 501 levels of odds and deterministic replay.
- Browser: one-action preparation heated a blank and placed it on the anvil. The corrected start order produced a visible, movable knife after a fresh page load and after resuming a saved game.
- Hammer strikes changed the blade level, exact odds, stamina and value. The smith approached the anvil automatically. No application console errors in the final browser session.
- Buy Iron reduced gold by 85 and stock by one. Selling a different iron blade paid the displayed 92 gold and removed that blade. Trade required no character travel.
- Rest retained existing valuable blades, filled the rack with the best four, replenished stamina and added daily blanks. Repeated day advancement reached day seven, selected the correct 150-value masterwork, and saved a local score. New run restored day one and starter supplies.
- Phone-size 390×844: large blade fit, visible 44px directional controls, touch-pad movement and release, forging, no horizontal overflow. Landscape 844×390: blade and controls visible, no horizontal overflow. Browser viewport overrides were reset afterward.
- Fullscreen control and Escape were exercised. This in-app browser stayed in its viewport-filling fallback; native fullscreen is requested where the host supports it.

The visual checks above use the in-app browser. Prior WebKit/Chromium checks are recorded in the original implementation history; physical phone GPU performance is not certified. The optional world leaderboard still requires owner-provided Cloudflare setup. No world scores were posted by this check.
