# Carrot Defense: balance and simulation results

Recorded 12 October 2026. All numbers below come from executed simulation results, not estimated playthroughs.

## Executed checks

| Run | Result | Evidence and scope |
|---|---|---|
| Unity Editor, `CarrotTD.CarrotSimulationTests.Run` | **39,845 assertions passed** | Final `output/carrot-unity-test.log` success marker after all audit corrections. Runs the real C# simulation in Unity. |
| Managed harness after audit corrections | **39,845 assertions passed** | [simulation-results.txt](simulation-results.txt). Identical gameplay source with math/serialization stand-ins. Adds 23 focused warning/HP-bar/targeting checks; all campaign outputs unchanged. |

The assertion total includes repeated nonnegative-currency checks during campaign stepping; it does not mean 39,845 independent scenarios. No claim of renderer/audio/browser validation follows from a simulation pass.

Coverage includes all 12 map geometries, all 10 purchases and 30 paid upgrades, maximum-tier rejection, 70% sell refunds, locked/unaffordable/occupied purchase rejection, exactly-once carrot contacts, fatal-contact precedence, pause/resume, 2× command acceptance, actual boss abilities and adds, all ten special powers, and 24 complete campaigns with the ordinary economy. Audit checks additionally require every root/breath target to receive its matching warning/contact, only one source cue per cast, the correct first spawn entrance, HP bars for unhurt visible monsters, and selected-enemy inclusion with distinct actual damage targets for Starfruit/Thunderhead.

Isolated power/shop fixtures deliberately set large test HP or currency to inspect a mechanic. These are confined to editor tests. The campaign runs below start with ordinary level funds, use legal buy/upgrade commands, earn money from the actual simulation and never force damage, kills or outcomes.

## Two earned-coin campaign policies

Both policies evaluate legal pad coverage, compare damage/cost, limit duplicate coverage and reserve money for useful upgrades. They establish multiple viable approaches; they are not human playtest substitutes. Policy 0 favors Seed/Prism with heavier late Thunderhead. Policy 1 favors Starfruit and splash, with a distinct Seed/Frost opening on level 1. The actual final rosters are retained below instead of assuming that preference weights imply tower use.

Every level won under both policies. Each result uses 1× game time; the HUD's 2× mode can halve wall-clock simulation time. Later encounters range from roughly seven to 9.7 minutes in these runs. The lowest successful carrot health was three.

| Level | Policy 0 | Policy 1 |
|---|---|---|
| 1 · First Sprout | 10 HP · 2.66 min · 3 towers | 10 HP · 3.33 min · 3 towers |
| 2 · Dewdrop Bend | 10 HP · 3.12 min · 3 towers | 10 HP · 4.10 min · 3 towers |
| 3 · Orchard Switchbacks | 10 HP · 5.03 min · 3 towers | 10 HP · 3.37 min · 3 towers |
| 4 · Hollow Oak | 10 HP · 6.57 min · 4 towers | 10 HP · 6.19 min · 4 towers |
| 5 · Lantern Causeway | 10 HP · 5.73 min · 4 towers | 10 HP · 5.50 min · 4 towers |
| 6 · Twin Reeds | 10 HP · 6.95 min · 5 towers | 10 HP · 7.11 min · 4 towers |
| 7 · Firefly Weave | 10 HP · 6.78 min · 5 towers | 10 HP · 6.96 min · 4 towers |
| 8 · Moonwell | 10 HP · 7.57 min · 4 towers | 3 HP · 8.49 min · 4 towers |
| 9 · Crystal Descent | 7 HP · 9.02 min · 5 towers | 7 HP · 9.29 min · 5 towers |
| 10 · Split Summit | 7 HP · 7.86 min · 5 towers | 5 HP · 7.67 min · 5 towers |
| 11 · Aurora Steps | 10 HP · 9.39 min · 5 towers | 7 HP · 9.66 min · 5 towers |
| 12 · Last Harvest | 9 HP · 9.68 min · 6 towers | 10 HP · 9.40 min · 6 towers |

Policy 1 on Moonwell is the tightest observed win (3 HP), and several Frostglass runs leak enemies. Good coverage therefore has a survival margin, but these results alone cannot prove the difficulty is appropriate for a first-time player. No artificial victory or all-towers-maxed fixture is used.

## Actual paid rosters

“Coins available” is `TotalEarned`, which **includes opening funds** plus subsequent income. It is not the unspent wallet or profit. All listed upgrades were paid. A tower's tier ranges from I/base to IV/three upgrades.

| Policy | Level | Coins available | Final roster |
|---:|---:|---:|---|
| 0 | 1 | 791 | seed tier 4, seed tier 2, seed tier 1 |
| 0 | 2 | 1114 | mortar tier 3, seed tier 1, starfruit tier 4 |
| 0 | 3 | 1363 | prism tier 3, seed tier 1, starfruit tier 4 |
| 0 | 4 | 1776 | prism tier 4, seed tier 1, starfruit tier 4, mortar tier 2 |
| 0 | 5 | 1974 | prism tier 4, starfruit tier 4, mortar tier 3, seed tier 1 |
| 0 | 6 | 2497 | prism tier 4, starfruit tier 4, seed tier 4, mortar tier 1, prism tier 3 |
| 0 | 7 | 2243 | prism tier 4, starfruit tier 4, seed tier 2, mortar tier 1, prism tier 3 |
| 0 | 8 | 2974 | thunder tier 4, seed tier 1, prism tier 4, thunder tier 3 |
| 0 | 9 | 3020 | thunder tier 4, prism tier 4, mortar tier 1, thunder tier 4, starfruit tier 1 |
| 0 | 10 | 3624 | thunder tier 4, prism tier 4, starfruit tier 4, mortar tier 2, thunder tier 4 |
| 0 | 11 | 3566 | thunder tier 4, prism tier 4, thunder tier 4, starfruit tier 4, mortar tier 1 |
| 0 | 12 | 4511 | thunder tier 4, prism tier 4, thunder tier 4, starfruit tier 4, mortar tier 4, seed tier 3 |
| 1 | 1 | 791 | seed tier 4, frost tier 1, seed tier 2 |
| 1 | 2 | 1114 | starfruit tier 4, seed tier 1, starfruit tier 3 |
| 1 | 3 | 1363 | starfruit tier 4, seed tier 1, starfruit tier 3 |
| 1 | 4 | 1776 | starfruit tier 4, seed tier 1, starfruit tier 4, mortar tier 2 |
| 1 | 5 | 1974 | starfruit tier 4, starfruit tier 4, mortar tier 2, starfruit tier 3 |
| 1 | 6 | 2497 | starfruit tier 4, starfruit tier 4, mortar tier 4, starfruit tier 3 |
| 1 | 7 | 2243 | starfruit tier 4, starfruit tier 4, mortar tier 2, starfruit tier 4 |
| 1 | 8 | 2906 | starfruit tier 4, starfruit tier 4, thunder tier 4, mortar tier 3 |
| 1 | 9 | 3011 | starfruit tier 4, starfruit tier 4, mortar tier 1, thunder tier 4, starfruit tier 3 |
| 1 | 10 | 3590 | starfruit tier 4, thunder tier 4, mortar tier 4, starfruit tier 4, prism tier 3 |
| 1 | 11 | 3524 | starfruit tier 4, starfruit tier 4, thunder tier 4, mortar tier 4, starfruit tier 3 |
| 1 | 12 | 4526 | starfruit tier 4, starfruit tier 4, thunder tier 4, mortar tier 4, prism tier 4, starfruit tier 4 |

These campaign runs use Seed, Frost, Mortar, Prism, Starfruit and Thunderhead. Storm Bell, Sun Blossom, Black Hole and Spellbook have direct power/cooldown tests but do not appear in the final automated campaign rosters. Their campaign usefulness is therefore not established by these two policies. That remains a targeted human-play and strategy-coverage task; this report does not claim all ten families are equally balanced.

## Poor coverage control

A deliberately weak policy buys one Seed on the lowest measured coverage pad and spends its genuinely earned coins upgrading that same position. It never expands to cover the other routes.

| Level | Outcome | Carrot HP | Coins invested |
|---:|---|---:|---:|
| 1 | Lost | 0 | 265 |
| 4 | Lost | 0 | 145 |
| 8 | Lost | 0 | 265 |
| 12 | Lost | 0 | 265 |

This demonstrates that an isolated, upgraded position is insufficient on representative early and boss maps. It does not establish that every bad strategy loses or every sensible strategy wins.

## Audit follow-through

The audit corrected incomplete multi-target boss warnings, the first wave entrance event, HP bars hidden on unhurt ordinary monsters, and ignored enemy focus in multi-target towers. Combat tuning and all 24 campaign outputs stayed unchanged. The root integration also corrected React's scenery medal to require zero remaining blockers and the boss-bar phase ticks to match each boss's actual thresholds. These are integration checks separate from the simulation balance results.

Run `node scripts/carrot-unity-build.mjs --test` to execute `CarrotTD.CarrotSimulationTests.Run` with the configured Unity Editor. Do not open a second Editor while an import/build is already running. The raw final harness result is [simulation-results.txt](simulation-results.txt).
