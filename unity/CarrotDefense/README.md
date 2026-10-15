# Carrot Defense 3D

Unity 6000.3.18f1 project for `/minigames/carrotDefense/`. The React page supplies the accessible campaign, purchase menu and HUD; Unity owns simulation, scene, animation, effects and audio.

## Build and verify

Install Web Build Support for the pinned Unity version. From the repository root:

```sh
npm run carrot:test
npm run carrot:unity
npm run build
node scripts/stubs.mjs
```

Set `UNITY_EDITOR` when Unity is installed elsewhere. The build script prepares model/material imports and the scene, creates `public/unity/carrot/`, and updates the content hash consumed by the website loader. Commit the Unity source and rebuilt web output together. Imported Library/Temp caches are not source.

The build gate needs the private licensed inputs (Asuna and the four effect packs, git-ignored); see `docs/carrot-defense/asuna-integration.md` and `docs/carrot-defense/design/prism-presentation.md`. Every build writes its packed-asset breakdown to `output/carrot-build-report-{qa|release}.txt`.

### Browser QA (`scripts/carrot-qa`)

`CarrotTD.CarrotBuild.WebQa` builds a release-settings player with the `CARROT_QA` telemetry into `output/carrot-qa/`. `node scripts/carrot-qa/unity.mjs --method <method>` runs one serialized Unity process on this checkout; `cs-check.mjs` is a 1-2 s compile check. `serve.mjs` serves `dist/` plus a chosen Unity build in the GitHub Pages model (no Content-Encoding). Then `capture.mjs` (ready frames, luminance, path contrast, idle effects), `flash.mjs` (WCAG 2.3.1 sampler), `perf.mjs` (frame pacing, draws, governor log), `camera.mjs` (zoom, pan, reach, reduced motion), `showcase.mjs` (signature-moment bursts) and `load.mjs` (cold load over an emulated link). Playwright comes from the Codex runtime; set `CARROT_QA_PORT` / `CARROT_QA_OUT` to change the server port and evidence folder. Results: `docs/carrot-defense/giant-update/render-vfx.md` and `docs/carrot-defense/validation.md`.

Development-only `?carrot-preview=1` through `12` selects a campaign map without granting saved progress. It is excluded from production builds. Normal play uses earned coins, authored waves and persistent unlocks.

## Assets and scope

- 12 maps across three biomes, with multiple entrances and routes.
- 10 tower families with four physical forms each.
- Eight ordinary enemy families and three biome guardians.
- Original generated artwork, modeled actors, scanned scenery/materials and licensed music/voices.

See [asset credits](ASSET-CREDITS.md), [asset inventory](../../docs/carrot-defense/asset-manifest.md), [gameplay](../../docs/carrot-defense/gameplay-implementation.md) and [balance evidence](../../docs/carrot-defense/balance-results.md).

Generated reference plates are concept art, not screenshots. Runtime actors remain stylized: procedural tower motion, reused creature rigs and polygonal fur are documented in the [model audit](../../docs/carrot-defense/model-runtime-audit.md). Browser/device rendering and performance must be assessed separately from simulation tests.
