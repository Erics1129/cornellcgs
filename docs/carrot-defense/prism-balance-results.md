# Prism Vanguard: gameplay and reward validation

Recorded on 2026-10-14, before the Unity presentation/build pass. These are deterministic simulation results, not human-play or visual-quality claims.

## Encounter contract

Level 29 is a separate Insane challenge with biome `prism`, boss `asuna`, one 40-unit straight lane, and 38 legal build pads. The lane runs from world (-7, 0, 0) to (33, 0, 0); every pad is at least two units from its centerline. There are no blockers. It starts with 4,500 coins and one finite encounter stream: Asuna, six nibblers, and two beetles. Asuna has 25,000 HP; phases begin at 65% and 30%. The ordinary HP scale is 5.6. The suggested medal par is 360 seconds.

Asuna is stationary between forward dashes. A dash moves 1.4 units (1.6 in phase 3) over 0.45 seconds after a 1.25-second warning. The endpoint is locked when the warning begins, so crossing the phase-3 HP threshold during a warning cannot extend that dash. The next dash is scheduled 13 seconds after commit (11 in phase 3); another cast can briefly defer it, but dash scheduling takes priority at the next free cast slot. Slows and rewinds do not reverse or permanently halt this boss. In a test that removed all escorts but never damaged Asuna, she reached the carrot and caused defeat at 432.4 seconds.

| Ability | Authoritative effect | Warning / limits |
| --- | --- | --- |
| `prismDash` | Forward displacement along the actual lane | 1.25 s warning; 0.45 s motion; no backwards movement |
| `prismLances` | Locks and briefly stuns the nearest 2 towers, or 3 in phase 3 | 1.6 s warning; 1.3/1.8 s stun; shared 7 s target recovery |
| `prismaticAegis` | Temporary shield of 7.5% maximum HP, capped at 2,600 | 1.6 s warning; expires after 4 s; shield state is real |
| `spectrumRain` | Warned, staggered strikes on 3 towers, or 4 in phase 3; brief stun and weakened output | 2.1 s warning; 0.65 s stun; 72% output for 3 s; shared target recovery |
| `mirrorRush` | Two fragile moving Asuna decoys | 1.8 s warning; maximum 2 owned decoys including pending spawns; 14 s life; no bounty |
| `prismOverdrive` | Accelerates the next reinforcement cohort and nearby creatures | 1.6 s warning; 12 s reinforcement window; nearby movement buff lasts 3 s |

Targeted strikes lock tower IDs and positions at warning time. The main `ability` event is the release cue; each actual contact, including the first, emits `abilityTarget`. The dash target event carries exact departure, arrival, and motion duration. Reinforcements rotate through nibble, beetle, moth, scarab, riftling, mimic, crystal, and shaman. Every 85 seconds their tier increases, up to V: cohort size rises from 2 to 6 and spacing falls from 16 to 8 seconds, with a temporary Overdrive multiplier. Cohorts are capped at 48 and the existing global cap of 22 living plus pending summons still applies. Defeating Asuna cancels her queued reinforcements; living survivors must resolve before victory.

The progress bar follows actual boss damage through 97%, retains 99% after her death while survivors remain, and reaches 100% on victory. It does not pretend that a single-wave countdown is boss progress. The snapshot exposes reinforcement cohort count, tier, and next-cohort delay. Pause freezes the same authoritative timeline.

## Summon reward diagnosis

The red regression invoked the existing marsh boss's actual `summon` cast, then killed a real spawned nibble through `TestDamage` and the normal death path. It failed with `expected 2, got 0`. The cause was `Spawn` assigning zero to every summoned enemy; the death-payout code itself was correct.

Real summoned creatures now pay `max(1, floor(normal bounty × 0.35))` when their normal bounty is positive. Normal enemy rewards are unchanged. Frost fragments now have a nominal bounty of 6, so a real summoned fragment pays 2. Decoys pay zero. Already-paid enemies returned by Raise Dead pay zero; newly created fallback nibblers pay the reduced bounty. Damage after death, leaks, timed expiry, and intermediate rebirth states do not pay again.

| Creature | Normal bounty | Real summoned bounty |
| --- | ---: | ---: |
| Nibble | 8 | 2 |
| Swarm | 4 | 1 |
| Moth | 11 | 3 |
| Shell | 15 | 5 |
| Portal Sentinel | 85 | 29 |
| Frost fragment | 6 | 2 |

## Earned-coin feasibility and failed alternative

The tested policies use actual buy, upgrade, select, and sell commands. Neither uses debug currency, free towers, damage injection, or Super merges. Build one of each listed family in order, then upgrade the three damage families tier by tier to IV while holding Frost and Sanctuary Lotus at II. Place on the nearest inner pads ahead of Asuna. Keep the remaining coins for movement: sell only once a plant can no longer reach her, take the normal 70% refund, and rebuild ahead. Focus Asuna while no real escort has escaped more than seven units ahead; otherwise release focus. After her death, move the defense to intercept the remaining frontmost enemies.

| Policy | Opening order and target tiers | Opening cost | Result | Time | HP left | Total received* | Sell/rebuild operations |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| 0 | Prism IV, Thunderhead IV, Eclipse Lily IV, Frost II, Sanctuary Lotus II | 3,050 | Won | 230.0 s | 4 | 5,418 | 17 |
| 1 | Prism IV, Inferno Pepper IV, Magnet Clover IV, Frost II, Sanctuary Lotus II | 2,480 | Lost | 200.9 s | 0 | 4,691 | 10 |

*The simulation's `TotalEarned` includes the 4,500 starting grant. The winning policy also received the 650 boss bounty and one-time 30-coin encounter-clear bonus, leaving 238 coins of escort/summon income. The failed alternative received 191 escort/summon coins and no boss/clear reward. Sell refunds are not counted as newly earned income. Policy 0 defeated Asuna with 19.4 route units still remaining, then finished the survivors; policy 1 lost with 695.7 boss HP remaining. The same fully funded policy-0 opening left stationary lost at 152.8 seconds. It is insufficient merely to buy a strong group and leave it near the entrance.

The harness responds at quarter-second intervals. The primary win establishes feasibility with earned money and meaningful placement, not that a first-time human will find the fight easy. The alternate mix had a narrow one-HP win before the dash-warning boundary correction and now loses; it is explicitly not counted as a viable strategy. The positive campaign suite therefore requires two policies for levels 1–28 and one verified Asuna policy (57 expected victories), while `PrismOnly` retains both diagnostic attempts. Further human playtesting is needed before making broader balance claims.

## Existing-boss reward impact

After the reward fix, the two existing earned-coin policies still won the relevant summon/boss levels below. No prior-boss tuning was changed for these results.

| Level | Policy 0: HP / time | Policy 1: HP / time |
| --- | --- | --- |
| 8 | 10 / 597.5 s | 9 / 586.9 s |
| 12 | 10 / 766.7 s | 10 / 686.2 s |
| 19 | 9 / 818.1 s | 6 / 773.6 s |
| 20 | 10 / 858.7 s | 10 / 764.8 s |
| 25 | 10 / 300.9 s | 10 / 299.3 s |
| 26 | 10 / 543.3 s | 10 / 555.3 s |
| 27 | 1 / 733.0 s | 6 / 696.0 s |
| 28 | 10 / 752.6 s | 10 / 735.8 s |

The full Unity campaign replay initially found an old level-19 policy failure: strategy 1 lost on wave 12 at 828.5 seconds. An isolated standalone replay reproduced the exact roster, income, and loss. Reverting only summoned rewards to zero restored the prior 1-HP win at 888.5 seconds; this rules out the new Asuna hooks as the cause. Six newly paid mite kills changed upgrade timing in a bot that stopped comparing purchase value below seven hearts. It spent on upgrades worth as little as 3% of its preferred investment. The test policy now keeps its existing 68% purchase-value floor after it has four towers, including after leaks. No runtime stats, waves, reward amounts, starting funds, or win assertions were weakened. The resulting level-19 strategy wins with 6 HP at 773.6 seconds using normal earned money.

## Checks and limitations

- After the policy correction, the complete standalone `CarrotSimulationTests.Run` passed **219,339 assertions and all 57 required earned-coin campaign victories**, plus poor-coverage defeats and deterministic replays. The isolated loss was the red regression, and the same full campaign assertion remains required. Actual Unity rerun is a separate gate.
- Standalone `CarrotSimulationTests.Quick`: **9,512 assertions passed**, including actual summon/death payouts, all six natural Asuna abilities, per-target warnings, spaced forward dashes, summon caps, pause, survivor cleanup, progress retention, one paid victory, and a stationary-defense defeat. The added boundary test proves dash endpoint stability across a phase change and exactly one `bossEnter` at the real opening spawn (~0.65 s), with no second onset when phases change.
- `carrot-waves.mjs` and `carrot-game-data.mjs` match the source: **29 levels / 302 authored wave arrays** (level 29 has one encounter stream plus bounded timed reinforcements).
- Normal Unity test entrypoints also call `CarrotAudio.MusicTransitionRegression`; the standalone simulation build explicitly excludes that audio test with `CARROT_STANDALONE_TEST`. Audio, model, camera, render performance, and physical touch interaction require the separate Unity/browser checks.
- Web integration checks passed: challenge unlock/award/v1-v2-to-v3 migration, account sync preservation/future-format protection, full-track music lifecycle, and data-export parity. Music onset is wired from `bossEnter` through the View to the Asuna theme; actual browser listening remains separate.
- No Unity Editor or WebGL build was launched for these simulation results. No claim of final visuals, audio listening, or release artifact validation is made here.


## Pass 2 (giant update, 14 October 2026)

Measured with the reference bots of [giant-update/difficulty.md](giant-update/difficulty.md) at commit ef4ca7a.
The plan expected a six-tower stack near her spawn to beat Asuna; it never did: the stack exploit (RS) lost every seed
before any change and still loses 100 of 100. The changes therefore aim at the expert's margin and at readability.

| Change | Before | Pass 2 | Why |
|---|---|---|---|
| Dash length (phase 1-2 / 3) | 1.4 / 1.6 u | 1.8 / 2.2 u | the duel is a race; longer dashes shorten it |
| HP breaks | none | 66% and 33%: a guaranteed Prism Break (a dash plus a spectrum rain on 3-4 towers) behind a 2.5 s actionable warning held at 1x; marks crossed in one burst share one break; shown as `thresholds` on the boss bar | fixed, visible milestones instead of the plan's reaction to the player's damage rate (amendment) |
| Lances / rain windups | 1.6 / 2.1 s | 2.5 / 2.5 s | actionable telegraph floor |
| Health | 25,000 | 20,000 | with the longer dashes, 22,000 HP let the expert win only 11 of 20 seeds |
| Opening coins | 4,500 | 4,500 (the planned 3,600 measured: the expert won 0 of 10) | |
| Opening escorts from the lane's start | none | measured and left out: even three nibbles behind her let the expert leak (0 of 20) | |

Result: the expert's moving policy wins all 20 seed variants with a median lowest of 5.5 hearts (goal 2-6); the canonical run
wins with 2 hearts in 183.9 s; the stationary opening still loses (139.4 s); the ignored boss reaches the carrot at
347.1 s. The median bot R1 never relocates and loses every seed (band 8-20% unreachable for that bot). `eta` stays
finite between dashes (her dash clock), so no snapshot carries Infinity.
