# Carrot Defense: balance and simulation results

Recorded 12 October 2026; re-run for the 24-level campaign and then for the difficulty pass, the Super tier, the seven boss kits and the three challenges on 13 October 2026. All numbers below come from executed simulation results, not estimated playthroughs.

## Executed checks

| Run | Result | Evidence and scope |
|---|---|---|
| Unity Editor, `CarrotTD.CarrotSimulationTests.Run` (27 levels, final sources) | **177,371 assertions passed** | `output/carrot-unity-test.log` success marker; raw result lines in [simulation-results.txt](simulation-results.txt). Runs the real C# simulation in Unity in about 24 s of wall clock. |
| `CarrotSimulationTests.Baselines` on the pre-pass waves (stage 1–3 record) | 48 legacy-kit campaigns, 48 full-kit campaigns and 6 merges-off controls won; policy 0 lost the Zombie and the Eyeball | The two "old waves" baselines below (recorded with the original bots, before the opening fixes). |
| Unity Editor, 24-level campaign (previous record) | 97,831 assertions passed | Superseded. |

The assertion total includes repeated nonnegative-currency checks during campaign stepping; it does not mean 177,371 independent scenarios. No claim of renderer/audio/browser validation follows from a simulation pass.

Coverage: all 27 map geometries, the generated wave arrays and their difficulty invariants (below), all 10 purchases and 30 paid upgrades, the merge contract (rejections, the single `merge` event, the 4 s undo, tap-tap arming, 465+465 → 930 spent and a 651 sell), the ten Super traits and their throughput budget, exactly-once carrot contacts, fatal-contact precedence, pause/resume, 2× command acceptance, all seven bosses (Brambleback with Root-Tear, Lantern Regent with Lantern Snuff and Tithe, Crown of Winter with Whiteout, Old Hollowhead with Reap and Dusk, the Giant Tornado's Gust and Lift-off, the Zombie's Uproot, grave knots and Raise Dead, the Unknown Eyeball's three blind forms, windup shave and Gaze), every cast cap over 150 s and kit purity (each boss emits only its own kinds), the challenge wave gate, the HP-bar cap, two tick-by-tick deterministic replays, 54 complete campaigns, six merges-off controls and nine poor-coverage losses.

Isolated power/shop fixtures deliberately set large test HP or currency to inspect a mechanic. These are confined to editor tests. The campaign runs below start with ordinary level funds, use legal buy/upgrade/merge/sell commands, earn money from the actual simulation and never force damage, kills or outcomes.

## The difficulty pass and its invariants

`scripts/carrot-waves.mjs` generates levels 1–24 from the frozen pre-pass strings (`scripts/carrot-waves.baseline.json`); the per-level table below is the script's `--pressure` output (C = count multiplier, gap = spawn-gap scale, overlap = packet overlap, breather in seconds; pressure = HP-weighted spawn work per stream second, crystal counting its shield). `Geometry` asserts against the frozen arrays printed by `--baseline`: BaselinePressure {42,50,70,81,94,113,132,145,202,223,240,279,236,254,280,276,316,334,352,366,377,396,413,428} and BaselineStream {72,106,121,154,161,203,175,226,212,258,250,302,231,243,280,283,303,335,350,370,396,449,459,477}; every campaign level's pressure is at least 1.08× its baseline, each boss level is its chapter's maximum, each pre-boss level is at least 1.2× its chapter opener, no stream time exceeds 1.32× its baseline, the HPScale table equals {1.05, 1.23, 1.35, 1.65, 1.67, 1.93, 2.18, 2.62, 2.67, 3.01, 3.36, 4.03, 4.03, 4.28, 4.54, 5.11, 5.08, 5.36, 5.64, 6.28, 6.23, 6.53, 6.84, 7.55, 2.62, 6.28, 8.68} and exceeds the old table on every campaign level, the five introduction packets are byte-identical, every boss wave carries at least three escort kinds with the swarm surge two waves earlier, peak enemies per wave stay at or under 110, and every Pressure dial entry lies in [0.80, 1.0].

| Level | C | gap | overlap | breather | HP old→new | count old→new | stream s old→new | pressure old→new | ratio |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1.10 | 1 | 1 | 5 | 1→1.05 | 58→66 | 72→78 | 42→46 | 1.09 |
| 2 | 1.15 | 1 | 1 | 5 | 1.15→1.23 | 100→116 | 106→118 | 50→56 | 1.12 |
| 3 | 1.25 | 1 | 1 | 5 | 1.3→1.35 | 143→179 | 121→141 | 70→77 | 1.10 |
| 4 | 1.35 | 1 | 1 | 5 | 1.45→1.65 | 156→226 | 154→199 | 81→101 | 1.26 |
| 5 | 1.17 | 0.95 | 1 | 5 | 1.55→1.67 | 172→200 | 161→174 | 94→111 | 1.18 |
| 6 | 1.22 | 0.95 | 1 | 5 | 1.75→1.93 | 239→287 | 203→225 | 113→138 | 1.22 |
| 7 | 1.32 | 0.95 | 0.85 | 5 | 1.95→2.18 | 201→265 | 175→184 | 132→190 | 1.44 |
| 8 | 1.42 | 0.95 | 0.85 | 5 | 2.15→2.62 | 244→359 | 226→258 | 145→228 | 1.57 |
| 9 | 1.19 | 1.00 (0.90 + 0.10) | 1 | 4 | 2.3→2.67 | 230→277 | 212→234 | 202→258 | 1.28 |
| 10 | 1.24 | 0.9 | 1 | 4 | 2.55→3.01 | 310→379 | 258→268 | 223→310 | 1.39 |
| 11 | 1.34 | 0.9 | 0.85 | 4 | 2.8→3.36 | 275→372 | 250→252 | 240→399 | 1.66 |
| 12 | 1.44 | 0.9 | 0.85 | 4 | 3.1→4.03 | 335→512 | 302→334 | 279→504 | 1.81 |
| 13 | 1.21 | 0.85 | 1 | 3 | 3.25→4.03 | 257→314 | 231→217 | 236→387 | 1.64 |
| 14 | 1.26 | 0.85 | 1 | 3 | 3.4→4.28 | 277→352 | 243→238 | 254→423 | 1.66 |
| 15 | 1.36 | 0.85 | 0.85 | 3 | 3.55→4.54 | 313→436 | 280→266 | 280→545 | 1.95 |
| 16 | 1.46 | 0.85 | 0.85 | 3 | 3.7→5.11 | 317→509 | 283→298 | 276→604 | 2.19 |
| 17 | 1.21 | 0.8 | 1 | 3 | 3.85→5.08 | 348→420 | 303→274 | 316→561 | 1.78 |
| 18 | 1.26 | 0.8 | 1 | 3 | 4→5.36 | 376→481 | 335→319 | 334→607 | 1.82 |
| 19 | 1.36 | 0.8 | 0.85 | 3 | 4.15→5.64 | 398→554 | 350→316 | 352→764 | 2.17 |
| 20 | 1.46 | 0.8 | 0.85 | 3 | 4.3→6.28 | 408→654 | 370→372 | 366→871 | 2.38 |
| 21 | 1.21 | 0.78 | 1 | 3 | 4.45→6.23 | 446→542 | 396→355 | 377→721 | 1.91 |
| 22 | 1.26 | 0.78 | 1 | 3 | 4.6→6.53 | 503→643 | 449→422 | 396→771 | 1.95 |
| 23 | 1.36 | 0.78 | 0.85 | 3 | 4.75→6.84 | 517→720 | 459→408 | 413→955 | 2.32 |
| 24 | 1.46 | 0.78 | 0.85 | 3 | 4.9→7.55 | 526→839 | 477→469 | 428→1083 | 2.53 |
| 25 | authored | 0.95 | 1 | 5 | →2.62 | 161 | 135 | 178 | – |
| 26 | authored | 0.85 | 1 | 4 | →6.28 | 297 | 221 | 649 | – |
| 27 | authored (×0.9 from wave 2) | 0.8 | 1 | 3 | →8.68 | 419 | 293 | 1012 | – |

Pressure is the level-wide metric; the Pressure dial and the opening grace (next section) multiply at spawn and are not part of it.

### Tuning record: dial entries and deviations from the plan

The plan's fallback loop (Pressure dial in 0.05 steps, then a multiplier slot drop, then +0.05 gap scale) was run automatically (`CarrotSimulationTests.Tune`, one 15 s Unity run per step). With the plan's arrays exactly as listed, the loop did **not** converge: 13 of 24 levels (policy 0) and 5 (policy 1) were lost inside waves 1–2, and Moonwell, Last Harvest, Lantern Harvest and The Last Light stayed red with every knob exhausted (dial 0.80, every slot dropped, gap +0.15). A logged replay showed why: the retune made wave 1 of chapter-1+ levels 1.5–1.9× heavier while the opening fund is unchanged, and a tier-1 opening cannot absorb that regardless of the bot's choices (the old wave 1 of Last Harvest was already a knife edge: two towers at the lane's tail kill one nibble every 5–8 s). Three changes were made and are the deviations to review:

1. **Opening ramp in the generator** (levels 5–24): wave 1 keeps its baseline counts, wave 2 takes half the count multiplier, and `CarrotData.OpeningScale` plays wave 1 at the pre-pass health (the HPScale entry divided by the pass multiplier) and wave 2 at the square root of that; the pass is in full force from wave 3. Chapter 0 has no grace (its arrays are byte-identical to the plan's). The 24 campaign pressures above include this ramp and still satisfy every invariant.
2. **Bots:** when the top-scoring purchase is unaffordable and fewer than four towers stand, both policies now take the best affordable option instead of idling (the old bots held 146 coins for 50 s while wave 1 walked past); on challenge levels both policies open with at least five towers before upgrading. These are legal purchases with earned coins; no outcome shortcut.
3. **Challenges:** opening gold 1,500 (Zombie) and 2,000 (Eyeball) instead of 760 / 980 (the plan's first challenge knob; the loop's +360 was not enough), and the Eyeball's waves 2–11 at ×0.9 counts (second knob); the HP anchors 2.62 / 6.28 / 8.68 and the boss HP table are the plan's. The Tornado is untouched (520 gold, authored counts).

Pressure dial entries (all others 1): level 9 **0.80**, level 11 **0.95**, level 19 **0.95**, level 23 **0.95**, level 24 **0.85**, level 26 **0.85**, level 27 **0.85**. Gap-scale fallback: level 9 **+0.10** (0.90 → 1.00). Multiplier slot drops: none.

## Two earned-coin campaign policies (final sources)

Both policies evaluate legal pad coverage, compare damage/cost, limit duplicate coverage and reserve money for useful upgrades; both merge a same-kind tier-4 pair at most once per wave when the target alone keeps at least 90% of the pair's union coverage. Policy 0 favors Seed/Prism with heavier late Thunderhead. Policy 1 favors Starfruit and splash, with a distinct Seed/Frost opening on level 1. Every run uses 1× game time and a 1,200 s cap. "Lowest" is the lowest carrot health seen during the run (both policies); "Supers" counts the Supers forged (policy 0 / policy 1). Policy 0 fields a Super in 13 of 27 runs and policy 1 in 10.

| Level | Policy 0 | Policy 1 | Lowest | Supers (p0 / p1) |
|---|---|---|---:|---|
| 1 · First Sprout | 10 HP · 2.79 min · 4 towers | 10 HP · 3.38 min · 4 towers | 10 | 0 / 0 |
| 2 · Dewdrop Bend | 10 HP · 3.32 min · 4 towers | 10 HP · 3.46 min · 5 towers | 10 | 0 / 0 |
| 3 · Orchard Switchbacks | 10 HP · 5.71 min · 5 towers | 10 HP · 3.94 min · 5 towers | 10 | 0 / 0 |
| 4 · Hollow Oak | 10 HP · 7.38 min · 5 towers | 10 HP · 6.47 min · 5 towers | 10 | 0 / 0 |
| 5 · Lantern Causeway | 10 HP · 6.17 min · 5 towers | 10 HP · 6.03 min · 5 towers | 10 | 0 / 0 |
| 6 · Twin Reeds | 10 HP · 7.63 min · 5 towers | 10 HP · 7.58 min · 6 towers | 10 | 1 / 0 |
| 7 · Firefly Weave | 10 HP · 7.60 min · 5 towers | 10 HP · 7.77 min · 5 towers | 10 | 0 / 0 |
| 8 · Moonwell | 10 HP · 8.79 min · 6 towers | 1 HP · 9.31 min · 6 towers | 1 | 0 / 0 |
| 9 · Crystal Descent | 10 HP · 8.97 min · 6 towers | 7 HP · 9.61 min · 6 towers | 7 | 0 / 0 |
| 10 · Split Summit | 7 HP · 8.59 min · 6 towers | 8 HP · 8.06 min · 7 towers | 7 | 0 / 0 |
| 11 · Aurora Steps | 1 HP · 11.55 min · 7 towers | 5 HP · 10.65 min · 7 towers | 1 | 0 / 0 |
| 12 · Last Harvest | 3 HP · 11.34 min · 9 towers | 8 HP · 10.21 min · 10 towers | 3 | 0 / 0 |
| 13 · Late Bloom Terrace | 10 HP · 8.11 min · 4 towers | 10 HP · 7.46 min · 6 towers | 10 | 1 / 0 |
| 14 · Heron Shallows | 9 HP · 8.10 min · 5 towers | 10 HP · 7.59 min · 6 towers | 9 | 1 / 0 |
| 15 · Frozen Falls | 10 HP · 10.63 min · 6 towers | 10 HP · 10.10 min · 8 towers | 10 | 1 / 0 |
| 16 · Cider Gate | 7 HP · 10.63 min · 7 towers | 9 HP · 9.96 min · 6 towers | 7 | 0 / 2 |
| 17 · Beehive Hollow | 10 HP · 9.56 min · 7 towers | 10 HP · 9.50 min · 7 towers | 10 | 0 / 1 |
| 18 · Bogfire Crossing | 9 HP · 9.57 min · 8 towers | 10 HP · 9.74 min · 8 towers | 9 | 0 / 1 |
| 19 · Pumpkin Rows | 1 HP · 12.05 min · 8 towers | 10 HP · 11.16 min · 10 towers | 1 | 1 / 0 |
| 20 · Scarecrow Field | 7 HP · 12.44 min · 10 towers | 10 HP · 10.52 min · 10 towers | 7 | 1 / 2 |
| 21 · Glacier Stair | 10 HP · 11.57 min · 7 towers | 10 HP · 10.52 min · 8 towers | 10 | 2 / 1 |
| 22 · Windfall Grove | 10 HP · 13.40 min · 10 towers | 10 HP · 12.76 min · 10 towers | 10 | 1 / 1 |
| 23 · Lantern Harvest | 1 HP · 14.19 min · 10 towers | 10 HP · 13.67 min · 11 towers | 1 | 2 / 2 |
| 24 · The Last Light | 10 HP · 15.47 min · 10 towers | 10 HP · 14.27 min · 11 towers | 10 | 3 / 3 |
| 25 · Giant Tornado (Easy) | 8 HP · 4.39 min · 5 towers | 6 HP · 4.53 min · 5 towers | 6 | 0 / 0 |
| 26 · Zombie (Hard) | 8 HP · 7.83 min · 5 towers | 6 HP · 7.83 min · 6 towers | 6 | 0 / 0 |
| 27 · Unknown Eyeball (Insane) | 4 HP · 9.44 min · 10 towers | 10 HP · 8.82 min · 10 towers | 4 | 0 / 0 |

The tightest wins are Moonwell (policy 1, 1 HP), Aurora Steps, Pumpkin Rows and Lantern Harvest (policy 0, 1 HP each): the pass now bites on the pre-boss and boss levels of chapters 1–5, as designed. The challenges finish inside their budgets (Easy ≤ 420 s: 264–272 s; Hard ≤ 780 s: 470 s; Insane ≤ 1,100 s: 529–566 s). The bots never merge on the arena (the coverage rule finds no pair worth folding), so the Hard and Insane wins stand without Supers; the plan's "expects Super merges" is a player expectation, not a bot requirement. Good coverage therefore has a survival margin, but these results alone cannot prove the difficulty is appropriate for a first-time player.

### Fairness contract: merges off

Merging is optional through Last Harvest and expected from level 13 on and in the Hard/Insane challenges. The bots with `policyMerges` off must still win the boss levels 4, 8 and 12; 16, 20 and 24 are logged.

| Level | Policy 0 (merges off) | Policy 1 (merges off) |
|---|---|---|
| 4 · Hollow Oak | won · 10 HP · 7.38 min · 5 towers | won · 10 HP · 6.47 min · 5 towers |
| 8 · Moonwell | won · 10 HP · 8.79 min · 6 towers | won · 1 HP · 9.31 min · 6 towers |
| 12 · Last Harvest | won · 3 HP · 11.34 min · 9 towers | won · 8 HP · 10.21 min · 10 towers |
| 16 · Cider Gate | won · 7 HP · 10.63 min · 7 towers | won · 9 HP · 9.87 min · 8 towers |
| 20 · Scarecrow Field | won · 7 HP · 12.25 min · 11 towers | won · 10 HP · 10.55 min · 11 towers |
| 24 · The Last Light | won · 10 HP · 15.51 min · 11 towers | won · 10 HP · 14.34 min · 11 towers |

### Super throughput budget

`SuperBudget` measures total damage over 20 s against eight stationary targets with one helper Seed beside the pad, a Super against the same two tier-4s on one pad (bound 0.75–1.08×): seed 0.974, frost 0.963, mortar 0.931, prism 0.900, storm 0.973, blossom 0.810, starfruit 0.966, gravity 0.873, book 0.941, thunder 0.890. The Sun Blossom Super runs at interval 1.00 (not the plan's 1.10) because two tier-4 Blossoms buff each other and the plan's figure ignored that mutual aura.

## Actual paid rosters

"Coins available" is `TotalEarned`, which **includes opening funds** plus subsequent income and uproot refunds. It is not the unspent wallet or profit. All listed upgrades were paid; tier 5 is a free merge of two tier-4s.

| Policy | Level | Coins available | Final roster |
|---:|---:|---:|---|
| 0 | 1 | 858 | seed tier 4, seed tier 2, seed tier 2, seed tier 1 |
| 0 | 2 | 1239 | mortar tier 4, seed tier 3, seed tier 2, seed tier 1 |
| 0 | 3 | 1611 | prism tier 4, seed tier 2, seed tier 2, seed tier 1, starfruit tier 3 |
| 0 | 4 | 2620 | prism tier 4, seed tier 4, seed tier 4, mortar tier 1, starfruit tier 3 |
| 0 | 5 | 2241 | prism tier 4, starfruit tier 4, seed tier 2, seed tier 1, mortar tier 4 |
| 0 | 6 | 2942 | prism tier 5, starfruit tier 4, seed tier 4, seed tier 1, prism tier 2 |
| 0 | 7 | 2854 | prism tier 4, starfruit tier 4, seed tier 4, seed tier 3, mortar tier 4 |
| 0 | 8 | 4050 | thunder tier 4, seed tier 4, seed tier 4, seed tier 4, prism tier 4, thunder tier 3 |
| 0 | 9 | 3586 | thunder tier 4, prism tier 4, seed tier 4, seed tier 4, mortar tier 4, thunder tier 1 |
| 0 | 10 | 4322 | thunder tier 4, prism tier 4, seed tier 4, seed tier 4, thunder tier 4, mortar tier 4 |
| 0 | 11 | 4570 | thunder tier 4, prism tier 4, seed tier 4, seed tier 4, thunder tier 4, starfruit tier 4, mortar tier 2 |
| 0 | 12 | 6339 | thunder tier 4, prism tier 4, seed tier 4, seed tier 4, thunder tier 4, mortar tier 4, starfruit tier 4, prism tier 4, thunder tier 3 |
| 0 | 13 | 3614 | thunder tier 5, prism tier 4, mortar tier 4, seed tier 2 |
| 0 | 14 | 4094 | thunder tier 5, prism tier 4, mortar tier 4, seed tier 1, thunder tier 3 |
| 0 | 15 | 5304 | prism tier 4, thunder tier 5, seed tier 4, seed tier 4, thunder tier 4, mortar tier 4 |
| 0 | 16 | 6720 | thunder tier 4, prism tier 4, seed tier 4, thunder tier 4, prism tier 4, starfruit tier 4, thunder tier 3 |
| 0 | 17 | 4998 | thunder tier 4, prism tier 4, mortar tier 4, seed tier 4, thunder tier 4, starfruit tier 4, prism tier 3 |
| 0 | 18 | 5883 | thunder tier 4, prism tier 4, starfruit tier 4, seed tier 4, mortar tier 4, thunder tier 4, prism tier 4, thunder tier 3 |
| 0 | 19 | 6878 | thunder tier 4, prism tier 5, thunder tier 4, seed tier 4, mortar tier 4, prism tier 4, starfruit tier 4, thunder tier 4 |
| 0 | 20 | 8694 | thunder tier 5, prism tier 4, mortar tier 4, thunder tier 4, prism tier 4, thunder tier 4, starfruit tier 4, prism tier 4, seed tier 4, thunder tier 2 |
| 0 | 21 | 6764 | thunder tier 5, prism tier 5, seed tier 4, seed tier 4, thunder tier 4, mortar tier 4, prism tier 4 |
| 0 | 22 | 8146 | thunder tier 5, prism tier 4, mortar tier 4, seed tier 4, thunder tier 4, prism tier 4, thunder tier 4, starfruit tier 4, prism tier 4, thunder tier 1 |
| 0 | 23 | 9001 | thunder tier 5, prism tier 5, starfruit tier 4, seed tier 4, mortar tier 4, thunder tier 4, prism tier 4, thunder tier 4, book tier 4, mortar tier 3 |
| 0 | 24 | 11962 | thunder tier 5, prism tier 4, starfruit tier 4, thunder tier 4, prism tier 4, thunder tier 5, prism tier 4, seed tier 4, mortar tier 4, thunder tier 4 |
| 0 | 25 | 2268 | thunder tier 4, prism tier 1, mortar tier 1, seed tier 1, thunder tier 3 |
| 0 | 26 | 6593 | prism tier 4, prism tier 4, mortar tier 3, thunder tier 4, thunder tier 4 |
| 0 | 27 | 7292 | thunder tier 4, prism tier 4, thunder tier 4, prism tier 4, mortar tier 4, starfruit tier 4, thunder tier 4, seed tier 4, prism tier 4, thunder tier 2 |
| 1 | 1 | 858 | seed tier 4, frost tier 1, seed tier 2, seed tier 1 |
| 1 | 2 | 1239 | starfruit tier 4, seed tier 2, seed tier 2, seed tier 1, starfruit tier 1 |
| 1 | 3 | 1611 | starfruit tier 4, seed tier 2, seed tier 2, seed tier 1, starfruit tier 3 |
| 1 | 4 | 2722 | starfruit tier 4, seed tier 3, seed tier 2, seed tier 4, starfruit tier 3 |
| 1 | 5 | 2241 | starfruit tier 4, starfruit tier 4, seed tier 2, seed tier 1, mortar tier 4 |
| 1 | 6 | 2942 | starfruit tier 4, starfruit tier 4, seed tier 4, seed tier 1, mortar tier 4, prism tier 3 |
| 1 | 7 | 2854 | starfruit tier 4, starfruit tier 4, seed tier 4, seed tier 3, mortar tier 4 |
| 1 | 8 | 3959 | starfruit tier 4, starfruit tier 4, seed tier 4, seed tier 4, thunder tier 4, mortar tier 4 |
| 1 | 9 | 3537 | starfruit tier 4, starfruit tier 4, seed tier 2, seed tier 3, thunder tier 4, mortar tier 4 |
| 1 | 10 | 4326 | starfruit tier 4, thunder tier 4, seed tier 4, seed tier 4, mortar tier 4, starfruit tier 4, prism tier 3 |
| 1 | 11 | 4610 | starfruit tier 4, starfruit tier 4, seed tier 4, seed tier 4, thunder tier 4, mortar tier 4, prism tier 4 |
| 1 | 12 | 6426 | starfruit tier 4, starfruit tier 4, seed tier 4, seed tier 4, thunder tier 4, mortar tier 4, starfruit tier 4, prism tier 4, thunder tier 4, starfruit tier 2 |
| 1 | 13 | 3614 | starfruit tier 4, mortar tier 4, thunder tier 4, seed tier 4, starfruit tier 4, prism tier 1 |
| 1 | 14 | 4105 | thunder tier 4, starfruit tier 4, mortar tier 4, seed tier 4, starfruit tier 4, prism tier 4 |
| 1 | 15 | 5304 | starfruit tier 4, thunder tier 4, mortar tier 4, seed tier 4, starfruit tier 4, starfruit tier 4, prism tier 4, thunder tier 2 |
| 1 | 16 | 6427 | starfruit tier 5, thunder tier 5, mortar tier 4, seed tier 4, starfruit tier 4, starfruit tier 4 |
| 1 | 17 | 4998 | starfruit tier 5, mortar tier 4, thunder tier 4, seed tier 4, starfruit tier 4, starfruit tier 4, prism tier 2 |
| 1 | 18 | 5894 | starfruit tier 5, mortar tier 4, starfruit tier 4, seed tier 4, thunder tier 4, prism tier 4, thunder tier 4, starfruit tier 1 |
| 1 | 19 | 6959 | starfruit tier 4, thunder tier 4, mortar tier 4, seed tier 4, starfruit tier 4, prism tier 4, starfruit tier 4, thunder tier 4, mortar tier 4, thunder tier 2 |
| 1 | 20 | 8727 | starfruit tier 5, starfruit tier 4, thunder tier 4, mortar tier 5, prism tier 4, thunder tier 4, mortar tier 4, thunder tier 4, prism tier 1, starfruit tier 3 |
| 1 | 21 | 6764 | starfruit tier 4, mortar tier 4, thunder tier 5, seed tier 4, starfruit tier 4, starfruit tier 4, prism tier 4, thunder tier 4 |
| 1 | 22 | 8146 | starfruit tier 4, starfruit tier 4, mortar tier 4, seed tier 4, thunder tier 5, prism tier 4, thunder tier 4, starfruit tier 4, mortar tier 4, thunder tier 3 |
| 1 | 23 | 9088 | starfruit tier 5, mortar tier 4, thunder tier 5, seed tier 4, starfruit tier 4, prism tier 4, thunder tier 4, mortar tier 4, book tier 4, mortar tier 4, starfruit tier 2 |
| 1 | 24 | 11756 | starfruit tier 4, thunder tier 5, starfruit tier 4, prism tier 4, starfruit tier 4, thunder tier 5, mortar tier 4, thunder tier 4, starfruit tier 4, mortar tier 4, seed tier 4 |
| 1 | 25 | 2062 | thunder tier 2, starfruit tier 4, mortar tier 1, seed tier 1, starfruit tier 4 |
| 1 | 26 | 6080 | starfruit tier 4, mortar tier 4, starfruit tier 4, thunder tier 4, prism tier 4, starfruit tier 4 |
| 1 | 27 | 7366 | thunder tier 4, starfruit tier 4, mortar tier 4, starfruit tier 4, prism tier 4, starfruit tier 4, thunder tier 4, mortar tier 4, thunder tier 4, prism tier 3 |

These campaign runs use Seed, Frost, Mortar, Prism, Starfruit, Spellbook and Thunderhead. Storm Bell, Sun Blossom and Black Hole have direct power, Super-trait and budget tests but do not appear in the final automated campaign rosters. Their campaign usefulness is therefore not established by these two policies.

## Poor coverage control

A deliberately weak policy buys one Seed on the lowest measured coverage pad and spends its genuinely earned coins upgrading that same position. It never expands to cover the other routes.

| Level | Outcome | Carrot HP | Coins invested |
|---:|---|---:|---:|
| 1 | Lost | 0 | 265 |
| 4 | Lost | 0 | 145 |
| 8 | Lost | 0 | 265 |
| 12 | Lost | 0 | 265 |
| 16 | Lost | 0 | 465 |
| 20 | Lost | 0 | 465 |
| 24 | Lost | 0 | 465 |
| 25 | Lost | 0 | 465 |
| 27 | Lost | 0 | 465 |

## Recorded baselines

Three baselines frame the final table. The first two were recorded in the stage 1–3 run (`Baselines`) on the **pre-pass waves and the old HPScale**, with the original bots (before the affordable fallback and the five-tower challenge opening), merges on; both show the same 48 wins as the 24-level record, so the merge contract and the new boss kits alone did not break any campaign level.

| Level | Old waves, legacy kits (policy 0 / policy 1) | Old waves, full kits (policy 0 / policy 1) |
|---|---|---|
| 1 | 10 HP · 2.66 min · 3 / 10 HP · 3.33 min · 3 | 10 HP · 2.66 min · 3 / 10 HP · 3.33 min · 3 |
| 2 | 10 HP · 3.12 min · 3 / 10 HP · 4.10 min · 3 | 10 HP · 3.12 min · 3 / 10 HP · 4.10 min · 3 |
| 3 | 10 HP · 5.03 min · 3 / 10 HP · 3.37 min · 3 | 10 HP · 5.03 min · 3 / 10 HP · 3.37 min · 3 |
| 4 | 10 HP · 6.62 min · 4 / 10 HP · 6.47 min · 4 | 10 HP · 6.62 min · 4 / 10 HP · 6.65 min · 4 |
| 5 | 10 HP · 5.73 min · 4 / 10 HP · 5.50 min · 4 | 10 HP · 5.73 min · 4 / 10 HP · 5.50 min · 4 |
| 6 | 10 HP · 6.95 min · 5 / 10 HP · 7.11 min · 4 | 10 HP · 6.95 min · 5 / 10 HP · 7.11 min · 4 |
| 7 | 10 HP · 6.78 min · 5 / 10 HP · 6.96 min · 4 | 10 HP · 6.78 min · 5 / 10 HP · 6.96 min · 4 |
| 8 | 10 HP · 7.69 min · 4 / 3 HP · 8.62 min · 4 | 10 HP · 7.71 min · 4 / 3 HP · 8.66 min · 4 |
| 9 | 7 HP · 9.02 min · 4 (1 Super) / 7 HP · 9.29 min · 5 | 7 HP · 9.02 min · 4 (1 Super) / 7 HP · 9.29 min · 5 |
| 10 | 7 HP · 7.86 min · 5 / 5 HP · 7.67 min · 5 | 7 HP · 7.86 min · 5 / 5 HP · 7.67 min · 5 |
| 11 | 10 HP · 9.39 min · 5 / 7 HP · 9.66 min · 5 | 10 HP · 9.39 min · 5 / 7 HP · 9.66 min · 5 |
| 12 | 9 HP · 9.99 min · 5 (1 Super) / 10 HP · 9.52 min · 6 | 9 HP · 9.99 min · 5 (1 Super) / 10 HP · 9.52 min · 6 |
| 13 | 10 HP · 7.21 min · 4 / 10 HP · 7.04 min · 4 | 10 HP · 7.21 min · 4 / 10 HP · 7.04 min · 4 |
| 14 | 10 HP · 7.18 min · 4 (1 Super) / 10 HP · 7.09 min · 5 | 10 HP · 7.18 min · 4 (1 Super) / 10 HP · 7.09 min · 5 |
| 15 | 10 HP · 9.70 min · 4 (1 Super) / 10 HP · 9.85 min · 6 | 10 HP · 9.70 min · 4 (1 Super) / 10 HP · 9.85 min · 6 |
| 16 | 10 HP · 8.63 min · 5 / 10 HP · 8.58 min · 5 (1 Super) | 10 HP · 8.62 min · 5 / 10 HP · 8.70 min · 5 (1 Super) |
| 17 | 10 HP · 9.46 min · 6 / 10 HP · 8.98 min · 5 (1 Super) | 10 HP · 9.46 min · 6 / 10 HP · 8.98 min · 5 (1 Super) |
| 18 | 10 HP · 8.84 min · 5 (1 Super) / 10 HP · 9.10 min · 7 | 10 HP · 8.84 min · 5 (1 Super) / 10 HP · 9.10 min · 7 |
| 19 | 10 HP · 10.17 min · 7 / 9 HP · 10.29 min · 7 | 10 HP · 10.17 min · 7 / 9 HP · 10.29 min · 7 |
| 20 | 10 HP · 9.72 min · 6 (1 Super) / 10 HP · 9.65 min · 7 (1 Super) | 10 HP · 9.70 min · 6 (2 Supers) / 10 HP · 9.80 min · 7 (1 Super) |
| 21 | 10 HP · 9.89 min · 6 (1 Super) / 10 HP · 9.86 min · 8 | 10 HP · 9.89 min · 6 (1 Super) / 10 HP · 9.86 min · 8 |
| 22 | 10 HP · 12.14 min · 9 / 10 HP · 12.29 min · 9 | 10 HP · 12.14 min · 9 / 10 HP · 12.29 min · 9 |
| 23 | 10 HP · 12.48 min · 6 (2 Supers) / 10 HP · 12.88 min · 8 (1 Super) | 10 HP · 12.48 min · 6 (2 Supers) / 10 HP · 12.88 min · 8 (1 Super) |
| 24 | 8 HP · 13.66 min · 9 (1 Super) / 10 HP · 13.24 min · 8 (1 Super) | 8 HP · 13.80 min · 7 (2 Supers) / 10 HP · 13.28 min · 7 (2 Supers) |
| 25 | – | 10 HP · 4.44 min · 3 / 7 HP · 4.38 min · 3 |
| 26 | – | lost (wave 5) / 1 HP · 8.41 min · 4 |
| 27 | – | lost (wave 2) / 9 HP · 9.42 min · 9 |

The third baseline is the pre-pass pressure and stream arrays printed by `node scripts/carrot-waves.mjs --baseline` and frozen in `Geometry` (listed at the top of the difficulty section).

## Audit follow-through

The audit corrected incomplete multi-target boss warnings, the first wave entrance event, HP bars hidden on unhurt ordinary monsters, and ignored enemy focus in multi-target towers. Combat tuning and all campaign outputs for levels 1–12 stayed unchanged through the 24-level extension; the difficulty pass changed them deliberately (see the table above). The root integration also corrected React's scenery medal to require zero remaining blockers and the boss-bar phase ticks to match each boss's actual thresholds. Mutation checks made during this pass: reverting one wave array fails Geometry naming the level, lowering a boss HP constant fails the boss base-health check naming the boss, allowing a 3+4 merge fails `Super` ("a tier-3 partner is rejected with a notice"), giving a Super extra range fails Geometry naming the kind, and removing the telegraph before an uproot commit fails `PresentationEvents` ("every locked uproot target receives warning and contact").

## Rendering speed plan (no gameplay change)

The speed plan on branch `carrot-3d-upgrade` (three URP tiers, after-opaques depth copy, one shadow cascade, decimated scan props, shader warm-up, streamed music, render-scale governor and frame pacer; see `validation.md`) touches only `CarrotView`, `CarrotEffects`, `CarrotAudio`, `CarrotQuality` and the Editor preparation scripts.

Run `node scripts/carrot-unity-build.mjs --test` to execute `CarrotTD.CarrotSimulationTests.Run` with the configured Unity Editor (about 25 s on the recorded machine); `-executeMethod CarrotTD.CarrotSimulationTests.Quick` runs the unit suites alone, `Tune` only the bot campaigns for the retune loop, and `Probe` one logged replay (`CARROT_PROBE="level,policy"`). Do not open a second Editor while an import/build is already running. The raw final harness result is [simulation-results.txt](simulation-results.txt).
