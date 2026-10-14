# Difficulty pass 2: reference bots, bands and fairness

This file records how difficulty is measured for the giant update and what each step changed. The bots and the
band rules were committed before any game value was retuned (pre-registration, below). Every band run records its
commit, the bots' hash and the seed counts in `difficulty-bands.json`.

## Pre-registration (bots-v1)

Registered at the commit that adds `unity/CarrotDefense/Assets/Scripts/CarrotBotTests.cs` with sha256 prefix
`36cc9b288c5d3419` (`shasum -a 256`), and `scripts/carrot-sim/bands.mjs`. Any later change to a bot's code or parameters
invalidates every band result; it must be noted here and all bands re-run.

| Bot | Model | Parameters |
|---|---|---|
| R0 | the two campaign policies (`BuyBest`, merges, focus, uproot sells) and the Asuna moving policy | seed 0 is the canonical policy; seeds 1-19 multiply every candidate score by 1 +- U(0.01) and draw each decision gap from U(0.25, 0.5) s |
| R1 | median player at 1x | decision gap lognormal(median 4 s, sigma 0.5), clamped 1-15 s; up to 3 actions per decision, stop after each with p 0.35; build vs upgrade 50/50 (build while under 2 towers); geometric rank choice among affordable options, top choice p 0.5; uproot/tithe/coin-leech telegraphs answered with p 0.6 after U(0.3, 1.5) s; merges from L13 with p 0.5 once per wave; preview: next wave has air and an air route's last 30% is uncovered by any air-capable tower: p 0.7 to buy the best affordable air tower for those routes; focus (root knots, graves, challenge boss) with p 0.5 per decision; policy-0 or policy-1 preferences by seed |
| R1F | R1 with full wave knowledge | as R1, preview counter at p 1.0 (invariant f) |
| R2 | novice | as R1 with telegraph p 0.2, top choice p 0.3 (rank ratio 0.7), keeps 25% of its coins idle, at most 2 actions per decision (stop p 0.5), no preview, no merges, focus p 0.25 |
| RN | naive-static: the live playtest bot (`playtest/lib.mjs playBot`) | pads ranked by route samples within 3.2 u; kind rotation seed, frost, mortar, starfruit, prism, storm, thunder, book (unlocked); 3 towers first, then lowest tier first while `towers < 4 + builds/2`; never merges, clears, focuses or calls early; one decision per game second (0.5 s real at 2x), seeds 1+ jitter it to 0.75-1.25 s |
| RS | Asuna stack exploit (L29) | six towers on the pads nearest her spawn (seed 0: prism, thunder, moonflower x2; seeds 1+: random from prism, thunder, moonflower, bamboo, dragonfruit, chili, magnet), upgraded to IV, refocus on her every 3 s, never relocated |
| R3 | poor coverage | one Seed on the worst-covering pad, upgraded (`PoorCoverage`) |

All bots issue only the page's commands and spend only coins the simulation paid them; RNG is a seeded xorshift64
(identical on Mono and .NET), never `System.Random`.

## Band rule

A row passes when the 90% Wilson interval of every member level lies inside its band. Certifying runs use at least
200 R1 and 100 R2 seeds per level (`node scripts/carrot-sim.mjs --bands`); the Unity fallback
(`carrot-unity-build.mjs --bands`, 8 R1 / 4 R2 seeds) is labelled directional and certifies nothing.
