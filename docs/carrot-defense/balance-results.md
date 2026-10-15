# Carrot Defense: balance and simulation results

Pass 2 (the giant update) recorded on 14 October 2026 at commit ef4ca7a (stream "balance"); the pass-1
record of 12-13 October follows below, unchanged except for its heading level. Every number comes from an executed run.
How difficulty is measured, the reference bots and every invariant are in
[giant-update/difficulty.md](giant-update/difficulty.md); the machine record is
[giant-update/difficulty-bands.json](giant-update/difficulty-bands.json).

## Pass 2: executed checks

| Run | Result | Scope |
|---|---|---|
| Unity Editor, `CarrotTD.CarrotSimulationTests.Run` (`npm run carrot:test`) | **1,886,517 assertions passed** | 29 levels; both canonical policies win all 57 runs with earned coins; six merges-off controls; poor coverage loses on 10 levels; the naive bot wins L1-L8; the Asuna stack loses 4 of 4; bridge contract v2, wave-plan parity (2,796 groups), telegraph floors at 2x, snapshot size, determinism and the level-20 digest |
| Standalone `node scripts/carrot-sim.mjs --run` | 1,886,493 assertions, same 57 victories | the same tests on .NET 6; 24 fewer assertions because two long replays end 0.2-0.7 s apart (an ulp of fused multiply-add on Mono ARM64), outcomes identical |
| Unity and standalone `Quick` | **33,955 assertions each** | unit suites without the long campaigns |
| Level-20 policy-0 discrete digest | `1566501f7e139bfe` in both, 22,421 ticks | `carrot-sim.mjs --digest` vs the Unity log |
| `node scripts/carrot-sim.mjs --bands` | 13130 runs in 49.4 s | 200 R1, 100 R1F, 100 R2, 2 x 20 R0, 10 RN and 100 RS seeds a level |
| `node scripts/carrot-sim.mjs --mute` | campaign pass (worst 9%) | each boss cast muted in turn on 200 R1 seeds |

## Pass 2: what changed

Order of application (amendment), each step measured with a full band run (table below):

1. **Telegraph floors** (T0 commit): casts that target a tower or the purse wind up >= 2.5 s and hold 1x at 2x for
   bosses (uproot 2.4/1.8 -> 2.5, tithe 1.6 -> 2.5, gaze 1.5 -> 2.5, glacier lance, portal storm, prism lances 1.6 ->
   2.5, spectrum rain 2.1 -> 2.5, miniboss locks and leech 1.25 -> 2.5); every other cast >= 1.2 s (gust 1.1 -> 1.2,
   straw heap 0.9 -> 1.2). Every simulation sort is a total order.
2. **Opening** (generator pass 2): L2-L4 join the opening ramp; waves 1-2 cap swarm at 8 (L1-L4) / 12 and air packets
   at 10 / 5 (L13-L24); the first 60% of each campaign level is smoothed to <= 1.35x the previous wave's work; removed
   units spread over the later ordinary waves by that kind's counts (chapter 0 takes them back as health); every level
   streams within 1.32x its frozen baseline (L4 was 1.37x in pass 1).
3. **Targeting**: least route left to the carrot, not the largest route fraction.
4. **Late pressure**: the last three ordinary waves of L5-L24 carry 1.10x counts (cap 110 a wave, excess as health) and
   `WaveRampTable` shapes ordinary health per wave: the first 60% ease from m0 to 1, the rest climb to 1 + a, times a
   chapter factor c (m0 = 1 / .7 / .7 / .65 / .8, a = .1 / .8 / .7 / .28 / .15, c = 1 / 1.1 / 1.2 / 1 / 1 for L1-4 /
   L5-8 / L9-12 / L13-24 / L25-28); waves 1-2 never exceed pass-1 health after the dial. Chapter 1's ordinary enemies
   walk 1.2x faster (`CarrotData.ChapterPace`). Minibosses take half the ramp; bosses and summons none.
5. **Economy**: stipends 10 / 14 / 18 / 22 by biome tier on L9-L24 (L1-L8 unchanged at 15 / 20 / 25 / 30, challenges
   30); starting gold on L13-L24 -10% (520, 570, 610, 660, 650, 690, 760, 780, 810, 860, 880, 910); calling a wave early
   pays two coins per breather second left (cap 10; it was the whole seconds, cap 6).
6. **Pressure dial**, the only per-level knob, fitted by `carrot-sim.mjs --tune-dials` (below).

Challenges: Tornado 4,500 HP (was 4,200) and lift-off at most twice (was 3); Unknown Eyeball 16,000 (was 14,000);
Portal 31,000 (was 30,000) walking 0.18 (was 0.21); Asuna 20,000 (was 25,000) with dashes of 1.8 / 2.2 units (were
1.4 / 1.6) and authored HP breaks at 66% and 33% (a Prism Break: dash plus a spectrum rain behind an actionable 2.5 s
warning held at 1x). Veteran ships: +10% ordinary health and a 60% sell refund on L1-L24.

### Steps record (one band run each; R1 rates in %)

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

### Pressure dial (fitted; the novice keeps >= 40% on L1-L24, the naive bot wins L1-L8 and the expert wins every seed)

| Level | Dial |
|---|---:|
| 1 · First Sprout | 1 |
| 2 · Dewdrop Bend | 1 |
| 3 · Orchard Switchbacks | 1.1 |
| 4 · Hollow Oak | 1.2 |
| 5 · Lantern Causeway | 1.46 |
| 6 · Twin Reeds | 1.6 |
| 7 · Firefly Weave | 1.148 |
| 8 · Moonwell | 0.9 |
| 9 · Crystal Descent | 0.863 |
| 10 · Split Summit | 1.237 |
| 11 · Aurora Steps | 1.022 |
| 12 · Last Harvest | 0.816 |
| 13 · Late Bloom Terrace | 1.003 |
| 14 · Heron Shallows | 1.041 |
| 15 · Frozen Falls | 1.075 |
| 16 · Cider Gate | 0.855 |
| 17 · Beehive Hollow | 0.976 |
| 18 · Bogfire Crossing | 0.983 |
| 19 · Pumpkin Rows | 0.696 |
| 20 · Scarecrow Field | 0.82 |
| 21 · Glacier Stair | 1.165 |
| 22 · Windfall Grove | 1.035 |
| 23 · Lantern Harvest | 0.829 |
| 24 · The Last Light | 0.69 |
| 25 · Giant Tornado | 1.25 |
| 26 · Zombie | 0.94 |
| 27 · Unknown Eyeball | 0.8 |
| 28 · Portal | 0.85 |
| 29 · Asuna — Prism Vanguard | 1 |

### Final bands

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

### Pass 2 generator table (`node scripts/carrot-waves.mjs --pressure`)

Pressure is HP-weighted spawn work per stream second of the generated waves; it excludes the ramp table and the dial,
which multiply at spawn.

| Level | C | gap | overlap | breather | HP old->new | count old->new | stream s old->new | pressure old->new | ratio |
| 1 | 1.10 | 1 | 1 | 5 | 1->1.05 | 58->68 | 72->83 | 42->41 | 0.99 |
| 2 | 1.15 | 1 | 1 | 5 | 1.15->1.23 | 100->111 | 106->121 | 50->55 | 1.10 |
| 3 | 1.25 | 1 | 1 | 5 | 1.3->1.35 | 143->164 | 121->145 | 70->74 | 1.06 |
| 4 | 1.35 | 1 | 1 | 5 | 1.45->1.65 | 156->215 | 154->203 | 81->95 | 1.18 |
| 5 | 1.17 | 0.95 | 1 | 5 | 1.55->1.67 | 172->211 | 161->188 | 94->106 | 1.12 |
| 6 | 1.22 | 0.95 | 1 | 5 | 1.75->1.93 | 239->304 | 203->245 | 113->143 | 1.27 |
| 7 | 1.32 | 0.95 | 0.85 | 5 | 1.95->2.18 | 201->278 | 175->205 | 132->183 | 1.39 |
| 8 | 1.42 | 0.95 | 0.85 | 5 | 2.15->2.62 | 244->373 | 226->277 | 145->226 | 1.56 |
| 9 | 1.19 | 1 | 1 | 4 | 2.3->2.67 | 230->287 | 212->252 | 202->245 | 1.22 |
| 10 | 1.24 | 0.9 | 1 | 4 | 2.55->3.01 | 310->395 | 258->288 | 223->291 | 1.31 |
| 11 | 1.34 | 0.9 | 0.85 | 4 | 2.8->3.36 | 275->390 | 250->284 | 240->366 | 1.53 |
| 12 | 1.44 | 0.9 | 0.85 | 4 | 3.1->4.03 | 335->536 | 302->379 | 279->468 | 1.68 |
| 13 | 1.21 | 0.85 | 1 | 3 | 3.25->4.03 | 257->328 | 231->244 | 236->361 | 1.53 |
| 14 | 1.26 | 0.85 | 1 | 3 | 3.4->4.28 | 277->368 | 243->266 | 254->399 | 1.57 |
| 15 | 1.36 | 0.85 | 0.85 | 3 | 3.55->4.54 | 313->456 | 280->297 | 280->515 | 1.84 |
| 16 | 1.46 | 0.85 | 0.85 | 3 | 3.7->5.11 | 317->529 | 283->333 | 276->565 | 2.05 |
| 17 | 1.21 | 0.8 | 1 | 3 | 3.85->5.08 | 348->440 | 303->309 | 316->522 | 1.65 |
| 18 | 1.26 | 0.8 | 1 | 3 | 4->5.36 | 376->501 | 335->355 | 334->571 | 1.71 |
| 19 | 1.36 | 0.8 | 0.85 | 3 | 4.15->5.64 | 398->578 | 350->360 | 352->696 | 1.98 |
| 20 | 1.46 | 0.8 | 0.85 | 3 | 4.3->6.28 | 408->678 | 370->404 | 366->832 | 2.27 |
| 21 | 1.21 | 0.78 | 1 | 3 | 4.45->6.23 | 446->562 | 396->387 | 377->697 | 1.85 |
| 22 | 1.26 | 0.78 | 1 | 3 | 4.6->6.53 | 503->667 | 449->458 | 396->742 | 1.87 |
| 23 | 1.36 | 0.78 | 0.85 | 3 | 4.75->6.84 | 517->744 | 459->445 | 413->913 | 2.21 |
| 24 | 1.46 | 0.78 | 0.85 | 3 | 4.9->7.55 | 526->835 | 477->494 | 428->1027 | 2.40 |
| 25 | authored | 0.95 | 1 | 5 | -->2.62 | -->161 | -->135 | -->178 | - |
| 26 | authored | 0.85 | 1 | 4 | -->6.28 | -->297 | -->221 | -->649 | - |
| 27 | authored | 0.8 | 1 | 3 | -->8.68 | -->419 | -->293 | -->1012 | - |
| 28 | authored | 0.82 | 1 | 4 | -->9.25 | -->324 | -->283 | -->973 | - |
| 29 | authored | 0.88 | 1 | 4 | -->5.6 | -->8 | -->11 | -->272 | - |

### Canonical policies (seed 0), Unity run

| Level | Policy 0 | Policy 1 | Lowest | Supers (p0 / p1) |
|---|---|---|---:|---|
| 1 · First Sprout | 10 HP · 3.13 min · 4 towers | 9 HP · 3.99 min · 5 towers | 9 | 0 / 0 |
| 2 · Dewdrop Bend | 10 HP · 4.31 min · 4 towers | 10 HP · 4.42 min · 5 towers | 10 | 0 / 0 |
| 3 · Orchard Switchbacks | 10 HP · 6.99 min · 5 towers | 10 HP · 5.32 min · 6 towers | 10 | 0 / 0 |
| 4 · Hollow Oak | 10 HP · 8.54 min · 6 towers | 10 HP · 8.62 min · 7 towers | 10 | 0 / 0 |
| 5 · Lantern Causeway | 10 HP · 7.33 min · 7 towers | 10 HP · 7.15 min · 7 towers | 10 | 0 / 0 |
| 6 · Twin Reeds | 5 HP · 10.71 min · 7 towers | 10 HP · 10.14 min · 8 towers | 5 | 1 / 0 |
| 7 · Firefly Weave | 4 HP · 10.74 min · 8 towers | 10 HP · 8.65 min · 8 towers | 4 | 0 / 0 |
| 8 · Moonwell | 10 HP · 9.17 min · 8 towers | 10 HP · 9.45 min · 8 towers | 10 | 0 / 0 |
| 9 · Crystal Descent | 10 HP · 12.11 min · 7 towers | 10 HP · 12.37 min · 8 towers | 10 | 0 / 0 |
| 10 · Split Summit | 9 HP · 11.24 min · 8 towers | 7 HP · 10.17 min · 7 towers | 7 | 0 / 0 |
| 11 · Aurora Steps | 10 HP · 14.32 min · 9 towers | 10 HP · 14.63 min · 8 towers | 10 | 0 / 0 |
| 12 · Last Harvest | 10 HP · 12.95 min · 9 towers | 10 HP · 11.90 min · 10 towers | 10 | 0 / 0 |
| 13 · Late Bloom Terrace | 10 HP · 10.46 min · 7 towers | 10 HP · 8.81 min · 7 towers | 10 | 0 / 0 |
| 14 · Heron Shallows | 10 HP · 10.60 min · 8 towers | 10 HP · 9.37 min · 8 towers | 10 | 0 / 0 |
| 15 · Frozen Falls | 10 HP · 12.47 min · 9 towers | 10 HP · 12.70 min · 8 towers | 10 | 0 / 0 |
| 16 · Cider Gate | 10 HP · 11.95 min · 9 towers | 10 HP · 11.73 min · 9 towers | 10 | 1 / 0 |
| 17 · Beehive Hollow | 10 HP · 11.38 min · 8 towers | 10 HP · 11.52 min · 8 towers | 10 | 0 / 1 |
| 18 · Bogfire Crossing | 10 HP · 12.72 min · 8 towers | 10 HP · 10.78 min · 10 towers | 10 | 1 / 0 |
| 19 · Pumpkin Rows | 10 HP · 12.65 min · 11 towers | 10 HP · 11.38 min · 11 towers | 10 | 0 / 0 |
| 20 · Scarecrow Field | 10 HP · 12.33 min · 10 towers | 10 HP · 11.74 min · 10 towers | 10 | 1 / 2 |
| 21 · Glacier Stair | 10 HP · 13.48 min · 9 towers | 10 HP · 13.82 min · 10 towers | 10 | 1 / 1 |
| 22 · Windfall Grove | 10 HP · 15.95 min · 11 towers | 10 HP · 15.75 min · 11 towers | 10 | 0 / 1 |
| 23 · Lantern Harvest | 10 HP · 15.78 min · 10 towers | 10 HP · 15.43 min · 11 towers | 10 | 1 / 1 |
| 24 · The Last Light | 10 HP · 16.68 min · 11 towers | 10 HP · 16.50 min · 11 towers | 10 | 1 / 3 |
| 25 · Giant Tornado | 5 HP · 5.54 min · 5 towers | 6 HP · 5.51 min · 6 towers | 5 | 0 / 0 |
| 26 · Zombie | 10 HP · 9.30 min · 10 towers | 10 HP · 9.19 min · 10 towers | 10 | 0 / 0 |
| 27 · Unknown Eyeball | 4 HP · 11.63 min · 13 towers | 10 HP · 11.13 min · 12 towers | 4 | 0 / 0 |
| 28 · Portal | 10 HP · 12.05 min · 11 towers | 10 HP · 11.15 min · 11 towers | 10 | 0 / 1 |
| 29 · Asuna — Prism Vanguard | 2 HP · 3.06 min · 5 towers | - | 2 | 0 / - |

| Level | Policy 0 (merges off) | Policy 1 (merges off) |
|---|---|---|
| 4 · Hollow Oak | won · 10 HP · 8.54 min · 6 towers | won · 10 HP · 8.62 min · 7 towers |
| 8 · Moonwell | won · 10 HP · 9.17 min · 8 towers | won · 10 HP · 9.45 min · 8 towers |
| 12 · Last Harvest | won · 10 HP · 12.95 min · 9 towers | won · 10 HP · 11.90 min · 10 towers |
| 16 · Cider Gate | won · 10 HP · 12.00 min · 9 towers | won · 10 HP · 11.73 min · 9 towers |
| 20 · Scarecrow Field | won · 10 HP · 12.39 min · 11 towers | won · 10 HP · 12.36 min · 11 towers |
| 24 · The Last Light | won · 10 HP · 16.86 min · 11 towers | won · 10 HP · 16.72 min · 11 towers |

## Pass 1 record (12-13 October 2026; superseded by pass 2 above)

### Executed checks

| Run | Result | Evidence and scope |
|---|---|---|
| Unity Editor, `CarrotTD.CarrotSimulationTests.Run` (27 levels, final sources) | **177,371 assertions passed** | `output/carrot-unity-test.log` success marker; raw result lines in [simulation-results.txt](simulation-results.txt). Runs the real C# simulation in Unity in about 24 s of wall clock. |
| `CarrotSimulationTests.Baselines` on the pre-pass waves (stage 1–3 record) | 48 legacy-kit campaigns, 48 full-kit campaigns and 6 merges-off controls won; policy 0 lost the Zombie and the Eyeball | The two "old waves" baselines below (recorded with the original bots, before the opening fixes). |
| Unity Editor, 24-level campaign (previous record) | 97,831 assertions passed | Superseded. |

The assertion total includes repeated nonnegative-currency checks during campaign stepping; it does not mean 177,371 independent scenarios. No claim of renderer/audio/browser validation follows from a simulation pass.

Coverage: all 27 map geometries, the generated wave arrays and their difficulty invariants (below), all 10 purchases and 30 paid upgrades, the merge contract (rejections, the single `merge` event, the 4 s undo, tap-tap arming, 465+465 → 930 spent and a 651 sell), the ten Super traits and their throughput budget, exactly-once carrot contacts, fatal-contact precedence, pause/resume, 2× command acceptance, all seven bosses (Brambleback with Root-Tear, Lantern Regent with Lantern Snuff and Tithe, Crown of Winter with Whiteout, Old Hollowhead with Reap and Dusk, the Giant Tornado's Gust and Lift-off, the Zombie's Uproot, grave knots and Raise Dead, the Unknown Eyeball's three blind forms, windup shave and Gaze), every cast cap over 150 s and kit purity (each boss emits only its own kinds), the challenge wave gate, the HP-bar cap, two tick-by-tick deterministic replays, 54 complete campaigns, six merges-off controls and nine poor-coverage losses.

Isolated power/shop fixtures deliberately set large test HP or currency to inspect a mechanic. These are confined to editor tests. The campaign runs below start with ordinary level funds, use legal buy/upgrade/merge/sell commands, earn money from the actual simulation and never force damage, kills or outcomes.

### The difficulty pass and its invariants

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

#### Tuning record: dial entries and deviations from the plan

The plan's fallback loop (Pressure dial in 0.05 steps, then a multiplier slot drop, then +0.05 gap scale) was run automatically (`CarrotSimulationTests.Tune`, one 15 s Unity run per step). With the plan's arrays exactly as listed, the loop did **not** converge: 13 of 24 levels (policy 0) and 5 (policy 1) were lost inside waves 1–2, and Moonwell, Last Harvest, Lantern Harvest and The Last Light stayed red with every knob exhausted (dial 0.80, every slot dropped, gap +0.15). A logged replay showed why: the retune made wave 1 of chapter-1+ levels 1.5–1.9× heavier while the opening fund is unchanged, and a tier-1 opening cannot absorb that regardless of the bot's choices (the old wave 1 of Last Harvest was already a knife edge: two towers at the lane's tail kill one nibble every 5–8 s). Three changes were made and are the deviations to review:

1. **Opening ramp in the generator** (levels 5–24): wave 1 keeps its baseline counts, wave 2 takes half the count multiplier, and `CarrotData.OpeningScale` plays wave 1 at the pre-pass health (the HPScale entry divided by the pass multiplier) and wave 2 at the square root of that; the pass is in full force from wave 3. Chapter 0 has no grace (its arrays are byte-identical to the plan's). The 24 campaign pressures above include this ramp and still satisfy every invariant.
2. **Bots:** when the top-scoring purchase is unaffordable and fewer than four towers stand, both policies now take the best affordable option instead of idling (the old bots held 146 coins for 50 s while wave 1 walked past); on challenge levels both policies open with at least five towers before upgrading. These are legal purchases with earned coins; no outcome shortcut.
3. **Challenges:** opening gold 1,500 (Zombie) and 2,000 (Eyeball) instead of 760 / 980 (the plan's first challenge knob; the loop's +360 was not enough), and the Eyeball's waves 2–11 at ×0.9 counts (second knob); the HP anchors 2.62 / 6.28 / 8.68 and the boss HP table are the plan's. The Tornado is untouched (520 gold, authored counts).

Pressure dial entries (all others 1): level 9 **0.80**, level 11 **0.95**, level 19 **0.95**, level 23 **0.95**, level 24 **0.85**, level 26 **0.85**, level 27 **0.85**. Gap-scale fallback: level 9 **+0.10** (0.90 → 1.00). Multiplier slot drops: none.

### Two earned-coin campaign policies (final sources)

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

#### Fairness contract: merges off

Merging is optional through Last Harvest and expected from level 13 on and in the Hard/Insane challenges. The bots with `policyMerges` off must still win the boss levels 4, 8 and 12; 16, 20 and 24 are logged.

| Level | Policy 0 (merges off) | Policy 1 (merges off) |
|---|---|---|
| 4 · Hollow Oak | won · 10 HP · 7.38 min · 5 towers | won · 10 HP · 6.47 min · 5 towers |
| 8 · Moonwell | won · 10 HP · 8.79 min · 6 towers | won · 1 HP · 9.31 min · 6 towers |
| 12 · Last Harvest | won · 3 HP · 11.34 min · 9 towers | won · 8 HP · 10.21 min · 10 towers |
| 16 · Cider Gate | won · 7 HP · 10.63 min · 7 towers | won · 9 HP · 9.87 min · 8 towers |
| 20 · Scarecrow Field | won · 7 HP · 12.25 min · 11 towers | won · 10 HP · 10.55 min · 11 towers |
| 24 · The Last Light | won · 10 HP · 15.51 min · 11 towers | won · 10 HP · 14.34 min · 11 towers |

#### Super throughput budget

`SuperBudget` measures total damage over 20 s against eight stationary targets with one helper Seed beside the pad, a Super against the same two tier-4s on one pad (bound 0.75–1.08×): seed 0.974, frost 0.963, mortar 0.931, prism 0.900, storm 0.973, blossom 0.810, starfruit 0.966, gravity 0.873, book 0.941, thunder 0.890. The Sun Blossom Super runs at interval 1.00 (not the plan's 1.10) because two tier-4 Blossoms buff each other and the plan's figure ignored that mutual aura.

### Actual paid rosters

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

### Poor coverage control

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

### Recorded baselines

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

### Audit follow-through

The audit corrected incomplete multi-target boss warnings, the first wave entrance event, HP bars hidden on unhurt ordinary monsters, and ignored enemy focus in multi-target towers. Combat tuning and all campaign outputs for levels 1–12 stayed unchanged through the 24-level extension; the difficulty pass changed them deliberately (see the table above). The root integration also corrected React's scenery medal to require zero remaining blockers and the boss-bar phase ticks to match each boss's actual thresholds. Mutation checks made during this pass: reverting one wave array fails Geometry naming the level, lowering a boss HP constant fails the boss base-health check naming the boss, allowing a 3+4 merge fails `Super` ("a tier-3 partner is rejected with a notice"), giving a Super extra range fails Geometry naming the kind, and removing the telegraph before an uproot commit fails `PresentationEvents` ("every locked uproot target receives warning and contact").

### Rendering speed plan (no gameplay change)

The speed plan on branch `carrot-3d-upgrade` (three URP tiers, after-opaques depth copy, one shadow cascade, decimated scan props, shader warm-up, streamed music, render-scale governor and frame pacer; see `validation.md`) touches only `CarrotView`, `CarrotEffects`, `CarrotAudio`, `CarrotQuality` and the Editor preparation scripts.

Run `node scripts/carrot-unity-build.mjs --test` to execute `CarrotTD.CarrotSimulationTests.Run` with the configured Unity Editor (about 25 s on the recorded machine); `-executeMethod CarrotTD.CarrotSimulationTests.Quick` runs the unit suites alone, `Tune` only the bot campaigns for the retune loop, and `Probe` one logged replay (`CARROT_PROBE="level,policy"`). Do not open a second Editor while an import/build is already running. The raw final harness result is [simulation-results.txt](simulation-results.txt).
