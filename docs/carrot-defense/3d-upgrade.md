# Carrot Defense 3D: visual upgrade log

Branch `carrot-3d-upgrade`. Gameplay (`CarrotGame.cs`, `CarrotData.cs`, `CarrotTypes.cs`, `CarrotSimulationTests.cs`) is untouched; every stage ends with `npm run carrot:test` at 39,845 assertions.

## Stage 0: baseline (plan-tech capture of build f39491b6e2c93972)

Measured with Playwright + headless Chromium (Metal ANGLE) on an Apple M5 Max, 1440x900 DPR1:

| Scenario | Draws p50 | Triangles p50 | Main thread p50/p95 | rAF gap p50/p95 |
|---|---|---|---|---|
| L4 idle | 665 | 3.28 M | 1.4 / 1.6 ms | 8.3 / 9.0 ms |
| L4 combat | 703 | 3.38 M | 1.8 / 2.1 ms (max 18) | 8.3 / 9.1 ms |
| L4 boss wave (speed 2) | 721 | 3.53 M | 5.5 / 6.8 ms | 9.2 / 12.6 ms |

Build: data 44.19 MB, wasm 4.85 MB, framework 0.08 MB, loader 0.05 MB (49.2 MB total). Time to HUD 0.9 s warm.

Defects confirmed in the baseline screenshots: black trail pebbles and arch stones (albedo gain on a dark stone map), pad markers reading as black flowers, flat unlit look with no bloom or tone mapping, hard sky bands, towers hovering 0.13 u above the ground, hit effects that are small puffs and line rings.
