# Difficulty pass 2: reference bots, bands and fairness

Recorded 14 October 2026 for the giant update (stream "balance"). This page says how difficulty is measured, what
the final numbers are, which goals were met and which were not, and why. Every figure comes from an executed run;
the machine-readable record is [difficulty-bands.json](difficulty-bands.json) (commit, bot hash, seed counts) and
[difficulty-single-cast.json](difficulty-single-cast.json). Balance tables live in [balance-results.md](../balance-results.md).

## What a player notices

- **Waves 1-2 teach, the rest squeeze.** Opening waves cap swarms (8 on L1-L4, 12 later) and air packets (10, or 5
  on L13-L24); after the dial they never exceed the old health. The first 60% of every campaign level is smoothed so
  no wave from 3 on carries more than 1.35x the work of the wave before; what was removed walks in later. The last
  40% of each level climbs (`WaveRampTable`), and the last three ordinary waves of L5-L24 carry 10% more enemies.
- **Losses moved late.** On the campaign, 83% of the median bot's lost hearts now fall in the final 40% of a level's
  waves, 0.1% of its defeats happen on waves 1-2 and 0.5% on wave 3 (before pass 2: 5%, 15% and 21%). The old cliffs are gone: Aurora Steps (L11) and
  Pumpkin Rows (L19) were lost on waves 2-6 by most players; L3's opening swarm no longer ends naive runs on wave 1.
- **Harder where it should be.** Mid-chapter and pre-boss levels from L6 on sit at 66-82% for the median player
  (most were 95-100%), boss levels at 62-70%; Veteran adds 10% health and a 60% refund (R1 on L16: 62% to 37%).
- **Every threat is readable.** Boss casts that target a tower or the purse (uproot, tithe, gaze, glacier lance,
  portal storm, prism lances/rain/break, miniboss locks and leeches) wind up at least 2.5 s and, for bosses, hold the
  game at 1x even at 2x speed; every other cast winds up at least 1.2 s. The next wave is previewed from the start of
  the current one, and a level's first air wave is in the preview at least 8 s of real time at 2x before it flies.
- **Smarter towers.** Towers shoot the enemy with the least route left to the carrot (not the largest route
  fraction), so lanes of different lengths are judged by what actually arrives first.

## Polish pass (15 October 2026): fairness after review

The review measured what the bands above could not see: a naive plan or one tower family won almost everything, a few late
waves were walls, guardians never cost a run, Asuna was 0% for every human model, and the novice met cliffs on L6-L10. What
changed, in the order it landed, with the certified run in [difficulty-bands.json](difficulty-bands.json) (bots-v2):

| Change | Where | Effect (R1 200 / R2 100 / RM 10 / RNH 20 seeds per level) |
|---|---|---|
| Starfruit 3/3/4/5 targets (Super 6) with 100/90/75% falloff and a 40% star; Clockwork Bloom 215 coins and 6% less damage | `CarrotGame.cs`, `CarrotData.cs` | The two strongest single families lose their solo dominance without retuning mixed play. |
| Crowded soil: from the fourth plant of a kind, every plant of that kind deals 12% less per extra plant (floor 40%); crowded blooms also thin slow, aura and pulse reach | `CarrotGame.CrowdingFor`, `CarrotExpansion.cs`, build-panel warning | (i) every family alone: L9-L24 win rate at most 14% (Thunderhead 14%, Sanctuary Lotus 6%, every other family 0%; before: 81-94% for six families). |
| Early cliffs: wave 1 of L5-L24 at most its own wave 2 and 1.15x the largest earlier wave 1; wave-1 air packets on L6-L12 at most 5; wave 2 at most 1.4x wave 1 | `scripts/carrot-waves.mjs` | (c2) 0.1% of R2's campaign losses on waves 1-3 (L6 wave 1 was 14% of R2's L6 runs). |
| Wall cap: no wave from 3 on above 1.4x the threat of the wave before; the excess moves forward toward the finale, what the last wave cannot hold moves back | `scripts/carrot-waves.mjs` (`smoothWalls`) | (k) R1 losses that start their final wave at 9-10 hearts: 21% (was 45%); the worst wave-on-wave step is now about 1.5x (was 3.9x). |
| Guardian pressure: guardian health x1.3 (L4), 2.0 (L8), 1.85 (L12), 1.75 (L16), 1.3 (L20), 1.0 (L24) | `CarrotData.BossPressure` | (l) 36% of boss-level R1 losses happen on the guardian's wave (was 0 of 900 runs on L4-L16). |
| Viability: a level is viable when either campaign policy or, where both lose, the naive rotation RN wins with earned coins | `CarrotSimulationTests.CampaignRuns`, `tune.mjs` | R0's heuristics lose to the plain rotation on several levels; the gate now asks for a legal solution, which is what invariant (a) says. |
| Ceilings in the dial fit: RNH (RN's rotation at R1's cadence) may win at most 90% of a mid-chapter, pre-boss or boss level from L9 (97% of an opener) | `scripts/carrot-sim/tune.mjs` | The novice floor (R2 >= 40%) binds first on most levels: the dials stop there and RNH stays near 100% (reported as invariant j, "floorBound"). |
| Asuna: dashes every 10 s (8 s in phase 3, were 13/11); the page briefs her counter (sell plants she has passed, replant ahead, works while paused); the challenge opens after Last Harvest or the Portal | `CarrotPrism.cs`, `ui/Onboarding.tsx`, `challenges.ts` | R1 (which, as bots-v2, relocates with p .6) wins 34%, R2 0%, R0 20/20 with lowest 6; RS still loses every seed. Without the faster dashes the briefed R1 won 90%. |
| Labels: NORMAL / HARD / EXPERT and the 1-5 pips come from the measured R2 rate, not from a stage's slot | `src/minigames/carrot/difficulty.ts` | L8 Moonwell is HARD now (R2 43%); L16, L19, L23 and L24 are EXPERT. |

**bots-v2.** RNH and RM-<kind> are new ceilings; on L29 R1 and R2 act on the briefing (sell each passed plant with p .6 / .25
per decision and, with the same p, build only ahead of Asuna). Every other decision is bots-v1 unchanged, including the
towers' estimated power (the bots still overrate the nerfed families, which keeps the measurement conservative).

**What did not move, and why.** The median-player R1 sits at 60-97% on L5-L23 and 54% on L24, above several of its bands,
because the novice floor binds first: raising a dial further takes R2 under 40% per attempt. RNH, the plain rotation at a
human cadence, still wins nearly every campaign level from L9, so a player who spends steadily on the best-covering pads will
find the campaign easier than the R1 numbers say; those levels are flagged floor-bound in (j). Overall-difficulty invariant (h)
still fails (R0 ends 84% of runs flawless). L24's three-attempt progression is 58% (R2 31%) at the lowest legal dial.

**Reproduce.** `node scripts/carrot-sim.mjs --tune-dials --levels 1-28 --iters 8`, copy the FITTED dials into
`CarrotData.Pressure`, `node scripts/carrot-waves.mjs --write && node scripts/carrot-game-data.mjs --write`, then
`node scripts/carrot-sim.mjs --run` and `node scripts/carrot-sim.mjs --bands`; copy the R2 rates into `difficulty.ts`.

## Measurement

| Tool | What it is |
|---|---|
| `node scripts/carrot-sim.mjs` | The authoritative C# simulation and tests compiled with Unity's bundled Roslyn against `scripts/carrot-sim/UnityEngineShim.cs` and run on Unity's bundled .NET 6 (`--quick`, `--run`, `--digest`, `--method`). |
| `--bands` | Every reference bot in parallel slices (about 13,500 runs in 50 s on 16 jobs), the band rule and invariants, written to difficulty-bands.json. |
| `--tune-dials` | The Pressure-dial fit (logit bisection per level under the hard limits below). Prints; never edits sources. |
| `--mute` | Invariant (d): each boss cast muted in turn on the same R1 seeds. |
| `npm run carrot:test` | The authoritative gate: cs-check, web tests, wave and game-data drift checks, then Unity `CarrotSimulationTests.Run`. |

**Parity.** Unity and the standalone build report the same Quick count (37,074 assertions) and the same level-20
policy-0 replay digest over 22,421 ticks (`1566501f7e139bfe`, hashing the discrete state each tick). Raw float
bits differ by an ulp (Unity's Mono JIT on ARM64 fuses multiply-add, .NET 6 rounds twice), which very rarely moves a
discrete decision: the full Run differs by 57 assertions (4,435,962 Unity, 4,436,019 standalone) and two campaign
replays end 0.2-0.7 s apart with identical outcomes. Run by run, Unity's directional band fallback and the standalone
build agree on 493 of 495 bot outcomes (489 identical in outcome, hearts and wave; the two flips are knife-edge Tornado
runs). Bands are therefore statistical, which is how they are read.

## Pre-registration (bots-v1)

Registered in commit 3f0debd (`CarrotBotTests.cs` sha256 prefix `36cc9b288c5d3419`) before any game value was retuned.
Later commits only added job arguments to `BandJobs` (`dial=`, `mode=` and `mute=`) and print its lines through
`Debug.Log`; every
bot's decisions are unchanged (`git diff 3f0debd HEAD -- CarrotBotTests.cs`), current prefix `dd8d76478c15707c`.

| Bot | Model | Parameters |
|---|---|---|
| R0 | the two campaign policies (`BuyBest`, merges, focus, uproot sells) and the Asuna moving policy | seed 0 is the canonical policy; seeds 1-19 multiply every candidate score by 1 +- U(0.01) and draw each decision gap from U(0.25, 0.5) s |
| R1 | median player at 1x | decision gap lognormal(median 4 s, sigma 0.5), clamped 1-15 s; up to 3 actions per decision, stop after each with p 0.35; build vs upgrade 50/50 (build while under 2 towers); geometric rank choice among affordable options, top choice p 0.5; uproot/tithe/coin-leech telegraphs answered with p 0.6 after U(0.3, 1.5) s; merges from L13 with p 0.5 once per wave; preview: next wave has air and an air route's last 30% is uncovered: p 0.7 to buy the best affordable air tower; focus with p 0.5 per decision; policy-0 or policy-1 preferences by seed |
| R1F | R1 with full wave knowledge | as R1, preview counter at p 1.0 (invariant f) |
| R2 | novice | as R1 with telegraph p 0.2, top choice p 0.3, keeps 25% of its coins idle, at most 2 actions per decision (stop p 0.5), no preview, no merges, focus p 0.25 |
| RN | naive-static: the live playtest bot (`playtest/lib.mjs playBot`) | pads ranked by route samples within 3.2 u; kind rotation seed, frost, mortar, starfruit, prism, storm, thunder, book; 3 towers first, then lowest tier first while `towers < 4 + builds/2`; never merges, clears, focuses or calls early; one decision per game second (seeds jitter 0.75-1.25 s) |
| RS | Asuna stack exploit (L29) | six towers on the pads nearest her spawn, upgraded to IV, refocused every 3 s, never relocated |
| R3 | poor coverage | one Seed on the worst-covering pad, upgraded |

All bots issue only the page's commands and spend only coins the simulation paid; RNG is a seeded xorshift64.

**Band rule.** A row passes when the 90% Wilson interval of every member level lies inside its band (200 R1 and 100
R2 seeds a level; the Unity fallback `carrot-unity-build.mjs --bands` is directional only). With 200 seeds the
interval is about +-6 points, so a 15-point band certifies only a point estimate within about 2 points of its centre;
the table therefore also reports whether the point estimate is inside.

## Final results (commit in difficulty-bands.json: 200 R1, 100 R1F, 100 R2, 20 x 2 R0, 10 RN, 100 RS seeds)

| Level | Dial | R0 best-of | R1 win [90% CI] | R1 band | R2 win | R2 band | RN | Limit that binds |
|---|---:|---:|---|---|---:|---|---:|---|
| 1 · First Sprout | 1 | 20/20 | 100% [99%, 100%] | 98-100% | 100% | 90-100% | 100% | none (R1 inside its band) |
| 2 · Dewdrop Bend | 1 | 20/20 | 100% [99%, 100%] | 98-100% | 100% | 90-100% | 100% | none (R1 inside its band) |
| 3 · Orchard Switchbacks | 1.1 | 20/20 | 100% [99%, 100%] | 90-100% | 100% | - | 100% | none (R1 inside its band) |
| 4 · Hollow Oak | 1.2 | 20/20 | 100% [99%, 100%] | 80-100% | 100% | - | 100% | none (R1 inside its band) |
| 5 · Lantern Causeway | 1.46 | 20/20 | 100% [99%, 100%] | 85-95% | 100% | 60-80% | 100% | RN must win L1-L8 |
| 6 · Twin Reeds | 1.6 | 20/20 | 82% [78%, 86%] | 70-85% | 54% | 40-65% | 100% | none (R1 inside its band) |
| 7 · Firefly Weave | 1.15 | 20/20 | 76% [71%, 81%] | 60-75% | 57% | 30-50% | 100% | RN (razor edge at +1%) |
| 8 · Moonwell | 0.9 | 20/20 | 100% [99%, 100%] | 50-65% | 100% | 20-40% | 100% | RN must win L1-L8 |
| 9 · Crystal Descent | 0.863 | 20/20 | 89% [85%, 92%] | 85-95% | 80% | 60-80% | 100% | none (R1 inside its band) |
| 10 · Split Summit | 1.24 | 20/20 | 74% [68%, 78%] | 70-85% | 46% | 40-65% | 100% | none (R1 inside its band) |
| 11 · Aurora Steps | 1.02 | 20/20 | 78% [73%, 83%] | 60-75% | 41% | 30-50% | 100% | R2 progression floor |
| 12 · Last Harvest | 0.816 | 20/20 | 70% [64%, 75%] | 50-65% | 41% | 20-40% | 100% | R2 progression floor |
| 13 · Late Bloom Terrace | 1 | 20/20 | 90% [86%, 93%] | 85-95% | 66% | 60-80% | 100% | none (R1 inside its band) |
| 14 · Heron Shallows | 1.04 | 20/20 | 80% [74%, 84%] | 70-85% | 41% | 40-65% | 100% | none (R1 inside its band) |
| 15 · Frozen Falls | 1.07 | 20/20 | 66% [60%, 71%] | 60-75% | 38% | 30-50% | 100% | none (R1 inside its band) |
| 16 · Cider Gate | 0.855 | 20/20 | 62% [56%, 67%] | 50-65% | 48% | 20-40% | 100% | none (R1 inside its band) |
| 17 · Beehive Hollow | 0.976 | 20/20 | 90% [85%, 93%] | 85-95% | 76% | 60-80% | 100% | none (R1 inside its band) |
| 18 · Bogfire Crossing | 0.983 | 20/20 | 76% [71%, 81%] | 70-85% | 48% | 40-65% | 100% | none (R1 inside its band) |
| 19 · Pumpkin Rows | 0.696 | 20/20 | 68% [62%, 73%] | 60-75% | 42% | 30-50% | 100% | none (R1 inside its band) |
| 20 · Scarecrow Field | 0.82 | 20/20 | 62% [57%, 68%] | 50-65% | 48% | 20-40% | 100% | none (R1 inside its band) |
| 21 · Glacier Stair | 1.17 | 20/20 | 92% [88%, 94%] | 85-95% | 62% | 60-80% | 100% | none (R1 inside its band) |
| 22 · Windfall Grove | 1.03 | 20/20 | 77% [72%, 82%] | 70-85% | 60% | 40-65% | 70% | none (R1 inside its band) |
| 23 · Lantern Harvest | 0.829 | 20/20 | 73% [68%, 78%] | 60-75% | 46% | 30-50% | 100% | none (R1 inside its band) |
| 24 · The Last Light | 0.69 | 20/20 | 65% [59%, 70%] | 50-65% | 45% | 20-40% | 0% | none (R1 inside its band) |
| 25 · Giant Tornado | 1.25 | 20/20 | 84% [80%, 88%] | 60-75% | 62% | - | 0% | expert (best of two) must win every seed |
| 26 · Zombie | 0.94 | 20/20 | 92% [88%, 95%] | 25-40% | 73% | - | 0% | expert (best of two) must win every seed |
| 27 · Unknown Eyeball | 0.8 | 20/20 | 32% [27%, 38%] | 8-20% | 24% | - | 0% | canonical policy 0 must win |
| 28 · Portal | 0.85 | 20/20 | 60% [54%, 66%] | 15-30% | 35% | - | 0% | canonical policy 1 must win |
| 29 · Asuna — Prism Vanguard | 1 | 20/20 | 0% [0%, 1%] | 8-20% | 0% | - | - | R1 never relocates (lane duel) |

R1's point estimate is inside its band on 19 of 24 campaign levels; L5, L7 and L8 are held below their target by the
naive-bot gate and L11 and L12 by the novice progression floor. No challenge reaches its band (the expert's limit binds,
below). Under the strict interval rule only the L1-L4 rows (lower bounds) certify.

## Invariants

| | Invariant | Result |
|---|---|---|
| a | A legal solution always exists | **pass**: on every level and every one of 20 seed variants at least one expert policy wins (both canonical seed-0 policies win all 57 runs; 22 of 1,140 single-policy runs lose) |
| b | Poor coverage loses on 1, 4, 8, 12, 16, 20, 24, 25, 27, 28 | **pass** |
| c | No early cliff (judged on the campaign, L1-L24) | **pass**: 82.8% of R1's lost hearts in the final 40% of waves (goal 70%), 0.1% of R1 defeats on waves 1-2 and 0.5% on wave 3 (goals 15%). Counting the challenges too: 63.8%, 15.2%, 0.3%; the early share is Asuna's single-wave duel, where every loss is "wave 1" |
| d | No single-event deaths | **campaign pass, challenges fail by design**: muting one campaign boss cast flips at most 9% of R1's losses (Harvest Rush, L20); the challenge guardians' kits are the fight (muting Gust flips 87%, Raise Dead 88%, Portal Blink 73%) |
| e | Stable expert outcome (lowest-HP sd <= 1.5) | **28 of 29 levels**: worst 1.65 on the Zombie (best policy per seed); a single policy's worst is 4.3 |
| f | Preview knowledge helps (R1F - R1 >= 10 points where R1 < 75%) | **fails**: the air-counter rule changes outcomes by -11 to +8 points; air coverage is not what decides these levels for R1 |
| g | Asuna stack loses >= 90%; the moving policy wins with lowest HP 2-6 | **pass**: RS loses 100 of 100; R0 wins 20 of 20, median lowest HP 5.5 |
| h | Overall difficulty rises | **mixed**: RN wins L1-L8 and only 23% of its hearts fall in waves 1-2 (goal <= 35%); but R0 still ends 83% of campaign runs with 10 hearts (goal <= 40%) and RN leaks in 3% of waves 3+ (goal 30%); R1 idles above 600 coins only on L22-L24, where it has nothing left to buy |
| i | Session length | **pass**: every level streams within 1.32x its baseline with <= 110 enemies a wave, and the expert's median clear time is <= 1.15x the pre-change value on every level (closest: L9 1.148, L10 1.147, L6 1.145) |
| j | Real-time telegraphs | **pass** (Contract tests at 2x through the real-time accumulator) |
| k | Determinism | **pass** |
| l | Challenge deadlines | **pass**: boss `remaining`, `eta` (finite, Asuna from her dash clock), `routeFraction`; `bossDeadline` once at .5/.75/.9 on L25-L28 |
| - | Progression: R2 clears every campaign level within 3 tries on >= 75% of seeds; RN wins L1-L8 | **pass** |

## Limits and findings

- **The median bot plays about as well as the expert.** R1 chooses among the expert's own scored options and spends
  every coin, so where the expert starts to fail R1 is still winning 85-100% (L5, L8, the Tornado and the Zombie).
  The expert must win every seed, so on those levels the dial stops at the expert's limit and R1 stays above its
  band. The Unknown Eyeball (32%) and Portal (60%) are the closest the challenges get; Asuna's lane duel needs
  relocation, which R1 never does (0%).
- **Hard limits outrank the R1 band.** The dial fit treats three rules as hard: the expert wins every seed, the novice
  keeps at least 40% on L1-L24 (so three attempts clear 75% of seeds, amendment), and the naive bot wins L1-L8. Where
  they bind (L5, L7, L8, L11, L12, the challenges) R1 sits above its band; this is the cost of not stalling players.
- **R2 versus its bands.** R2 is inside its band on 15 of 22 graded campaign levels; on the boss levels L12-L24 it sits
  at 41-48% (band 20-40%) because the progression floor keeps it there, and on L5, L7 and L8 above its band.
- **Response is steep.** Some levels swing 40 points between dials 10% apart (L11: 91% at 1.00, 47% at 1.12): a
  single key tower either kills a packet or does not. The fit therefore uses 150-200 R1 seeds per point.

## Steps (amendment order, one band run each)

| run | R0 best-of losses | R1 in band (campaign L5-L24) | R1 late-heart share (campaign) | R1 losses in waves 1-2 (campaign) | RN wins L1-L8 | R2 progression fails | R1 on L5 L6 L7 L8 L11 L12 L16 L19 L20 L23 L24 L25 L26 L27 L28 |
|---|---:|---:|---:|---:|---|---:|---|
| 1 floors | 3 | 5/20 | 0.052 | 0.146 | no | 6 | 100 100 100 97 47 47 60 11 44 60 52 98 95 85 24 |
| 2 opening | 3 | 3/20 | 0.145 | 0.071 | no | 3 | 100 100 100 97 99 87 74 18 52 71 51 98 95 85 24 |
| 3 targeting | 3 | 2/20 | 0.149 | 0.066 | no | 4 | 100 100 100 99 99 87 72 24 47 70 52 98 95 85 19 |
| 4 plan ramp (rejected) | 4 | 4/20 | 0.284 | 0.034 | no | 6 | 100 100 100 99 99 85 22 3 21 38 23 96 96 80 22 |
| 4 threat curve A (rejected) | 42 | 2/20 | 0.213 | 0.095 | yes | 6 | 100 100 100 100 100 93 22 0 7 15 1 97 92 61 33 |
| 4 relief B | 2 | 2/20 | 0.671 | 0.01 | yes | 5 | 100 100 100 100 100 94 37 11 45 61 43 94 93 85 25 |
| 4 relief C | 5 | 4/20 | 0.793 | 0.001 | yes | 5 | 100 100 100 100 100 96 28 4 33 48 36 93 95 87 28 |
| 5 economy (relief C) | 1 | 2/20 | 0.704 | 0.001 | yes | 6 | 100 100 100 100 100 95 13 3 20 32 26 93 95 87 28 |
| 5 economy (relief D) | 0 | 1/20 | 0.762 | 0 | yes | 9 | 100 100 100 100 100 95 12 2 19 28 22 97 94 87 24 |
| 6 dial fit, first | 1 | 17/20 | 0.591 | 0.197 | no | 6 | 100 92 65 54 74 67 63 68 60 72 62 89 92 73 24 |
| 6 constrained fit | 0 | 13/20 | 0.827 | 0.002 | yes | 0 | 100 88 71 100 87 64 63 79 60 77 67 92 92 81 24 |
| 6 final | 0 | 15/20 | 0.828 | 0.001 | yes | 0 | 100 83 76 100 79 70 62 68 63 73 65 85 92 32 60 |

Rejected variants: the plan's linear ramp (1 + a min(1, (w - 2)/(E - 2))) kept the wave-5 cliffs of L16-L24 and
made L19 unwinnable (3%); a curve derived from threat per coin (variant A) misjudged the early waves of late levels
and lost the expert 42 seed runs. The shipped curve ("relief") eases the first 60% of each level and lifts the rest.

## Deviations from the plan, with evidence

- Pressure dial range [0.65, 1.60] instead of [0.80, 1.30]: the fit needs 0.69-0.70 on L19 and L24 and 1.46-1.60 on
  L5-L6 once the novice and naive-bot limits apply.
- Late ramp parameters and chapter factors (m0, a, c in carrot-waves.mjs) replace the plan's a = .10/.18/.22/.26,
  and chapter 1 walks 1.2x faster (`CarrotData.ChapterPace`) so its levels do not run long (L6 went from 1.33x to
  1.145x the old expert time).
- Asuna: 20,000 HP (plan: 25-38k), 4,500 opening coins (plan: 3,600) and no opening escorts. The stack exploit
  already lost every seed before any change; the plan's cuts made the expert lose (3,600 coins: 0 of 10 seeds; even
  three nibbles from the lane's start let both the expert and the stack leak).
- Tornado: lift-off cap 2 as planned, but 4,500 HP (+7%) instead of 3,800: R1 won 91% (band 60-75); 5,000 HP brought
  R1 to 66% but cost the expert 6 seeds. Eyeball +14% (16,000). Portal 31,000 HP walking .18 instead of .21: the
  remaining-distance targeting cost canonical policy 1 its Portal win at every dial; slower and 3% tougher restores it.
- Early-call bonus: two coins per breather second (cap 10) instead of the plan's no-op cap change (amendment).
- Stipend cut applies to L9-L24 only; challenges keep 30 a wave (amendment).
- Veteran is the amended mode (+10% health, 60% refund) and ships: the expert wins all 24 campaign levels on 20 of 20
  seeds in it.

## Reproduce

```
node scripts/carrot-cs-check.mjs                 # every assembly compiles (about 1.5 s)
node scripts/carrot-waves.mjs                    # CarrotData.cs holds the generated pass-2 block
node scripts/carrot-game-data.mjs                # game-data.json (wavePlan, par, modes) matches
node scripts/carrot-sim.mjs --run                # the full gate in about 12 s
node scripts/carrot-sim.mjs --bands              # writes difficulty-bands.json
node scripts/carrot-sim.mjs --mute               # writes difficulty-single-cast.json
npm run carrot:test                              # the authoritative Unity gate
```
