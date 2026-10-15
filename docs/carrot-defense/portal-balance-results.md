# Portal expansion: gameplay and balance evidence

Recorded 13 October 2026 against the additive expansion of `ab5e4a7`. This supplements the earlier [balance record](balance-results.md); its 27-map numbers describe the previous release, not this expansion.

## Executed evidence

The actual C# simulation sources compiled and ran under Unity's bundled Mono compiler with a small non-rendering Unity API stub. **213,867 assertions passed**, including 56 earned-coin victories (two distinct deterministic policies over all 28 maps), 12 additional no-merge boss-map victories, 10 poor-coverage losses, and deterministic replays. The assertion count includes repeated currency checks, not that many independent scenarios. The shorter rule suite passed **4,989 assertions**. The [raw results](portal-simulation-results.txt) record each roster, earned gold, health, and time.

This is simulation evidence. It does not prove Unity asset import, rendered quality, audio quality, browser performance, physical-phone input, or human difficulty. Root integration owns those checks separately.

The website export matches the C# definitions: 20 plant families, four purchased tiers plus a merged Super per family, 12 added ordinary enemies, 15 distinct miniboss profiles, 24 preserved campaign maps plus four challenges, and 301 waves. The wave generator matches its checked-in block and the original baseline file remains unchanged.

## What was preserved and added

All existing ten plant families, Super merging/undo/refunds, seven boss kits, 24 authored maps, challenge IDs 25–27, and ordinary enemy families remain. New powers run in an additive dispatcher. Each new plant damages actual targets at all five tiers; each miniboss has a checked gameplay consequence as well as a warned event. Miniboss identity remains separate from encounter bosses and their music/progression. Main challenge bosses reaching the carrot are now fatal; campaign bosses retain the previous three-heart contact.

Every old boss also has an additional skill: Garden rallies and summons beetles; Marsh shields and summons wisps; Frost locks individually warned targets; Orchard rallies and summons mimics; Tornado summons bounded random minibosses; Zombie summons and rallies tiny zombies; Eyeball adds clones, three finite lives, and brief warned full blackouts. Portal has four distinct skills: Sentinel summons, locked-target lightning, a bounded self-blink, and bounded ally relocation. Relocation preserves each route and stops at least six units before the carrot.

Summon queues reserve completion work immediately, added summons expire, clones grant no rewards, and Eyeball gives its reward only on the third defeat. The 1.25-second full blackout has a 2.2-second warning and an 18-second recovery gate. Tower controls and status durations use simulation time and freeze with Pause. The existing event meanings are preserved; source and target positions for relocation are explicit.

## Tuning and honest limits

Movement is 0.82× the base values. Original tower damage is visibly authored at 0.82 / 0.80 / 0.70 / 0.65 / 0.65 of the former five-tier arrays. There is no hidden damage restoration. New towers have explicit arrays. All 20 Super throughput fixtures retain the previous 0.75–1.08× budget relative to two tier-IV plants in their controlled multi-target fixture.

Campaign levels 1–4 keep their 240-coin openings. Later campaign chapters receive visible opening increases of 40 / 60 / 80 / 100 / 120 coins. Challenge starting gold is 850 / 2,000 / 2,500 / 1,850 for Tornado / Zombie / Eyeball / Portal. These increases compensate for the weaker early output without changing earned-coin purchase rules.

The frozen wave-pressure proxy is normalized by movement and an approximate 0.72 mature-output ratio. Its chapter tolerance and stream-time allowance were widened for the additional enemy packets. It is a coarse comparison, **not** a proof that every map is harder. The full playthrough results, distinct powers, and poor-coverage controls are stronger evidence. Introductions preserve the original protected packets and the first two waves; new normal species and minibosses enter in later packets.

Both bots buy only available unlocked plants with real coins, upgrade through paid tiers, use normal focus/sell/merge commands, and never force damage or outcomes. Policy 0 favors direct damage and anti-armor; policy 1 favors Starfruit, splash, control, and late merge pairs. They prioritize Frost and Lotus in challenges, react to an Uproot warning by selling the actual marked plant for its ordinary refund, and focus an approaching boss. Policy 1 deliberately grows a safe merge pair after establishing broad late-game coverage; merging still requires at least 90% of the pair's union coverage. Neither is a novice player model. Policy 0 takes damage in five runs, policy 1 in seven. They produce Supers in eight and seven maps respectively.

## Portal compared with the other challenges

| Encounter | Waves | Starting gold | Policy 0 time / hearts | Policy 1 time / hearts | Route units remaining at final boss defeat, P0 / P1 |
|---|---:|---:|---|---|---|
| Tornado | 6 | 850 | 300.1 s / 10 | 299.1 s / 10 | 3.78 / 7.12 |
| Zombie | 9 | 2,000 | 544.7 s / 10 | 556.6 s / 10 | 3.15 / 2.87 |
| Eyeball | 11 | 2,500 | 721.7 s / 1 | 692.7 s / 6 | 0.92 / 1.62 |
| Portal | 12 | 1,850 | 757.9 s / 10 | 726.9 s / 10 | 1.00 / 0.80 |

Portal has 30,000 base HP, the longest challenge, an early wave-four arrival, phase acceleration, overlapping escorts, up to two live owned Sentinels, three-target tower locks, and forward relocation pressure. Both successful policies use 11 plants spanning damage, control, cleanse, and tempo, with 6,910 / 7,020 coins invested in the final planted rosters, and defeat Portal roughly one route unit before an otherwise fatal contact. Both earn 7,074 coins beyond their 1,850-coin opening. Policy 0 ends with Thunder ×2, Prism ×2, Cactus, Frost, Lotus, Clockwork Bloom, Seed, Mortar, and Starfruit; policy 1 uses Thunder ×2, Prism ×2, Starfruit ×2, Frost, Lotus, Mortar, Clockwork Bloom, and Eclipse Lily. These are demonstrated solutions, not a claim that every one of these families is mandatory. This is a tight boss damage deadline even though escort containment preserves ten hearts. A tested 32,500-HP variant made policy 0 lose with 1,739 boss HP remaining; 36,000 HP made both lose. The final 30,000-HP version keeps two demonstrated solutions.

These results support an optional endgame encounter with a severe deadline. They do **not** establish that Portal is harder than every other boss combined, or strictly harder than Eyeball for all players: Eyeball causes more heart attrition in these policies. Human playtesting remains necessary before making that claim. At 1×, later maps can take approximately 12–18 minutes in this automated run; 2× is available. Short phone sessions and novice onboarding need human validation.

## Complete earned-coin campaign results

Times are simulation seconds at 1×; the bot never uses 2× to pass a timeout. Supers count actual legal merges.

| Map | Policy 0: hearts · seconds · plants · Supers | Policy 1: hearts · seconds · plants · Supers |
|---:|---|---|
| 1 | 10 · 186.8 · 4 · 0 | 10 · 223.2 · 5 · 0 |
| 2 | 10 · 262.2 · 4 · 0 | 10 · 265.9 · 5 · 0 |
| 3 | 10 · 409.1 · 5 · 0 | 10 · 301.0 · 5 · 0 |
| 4 | 10 · 514.8 · 7 · 0 | 10 · 514.9 · 6 · 0 |
| 5 | 10 · 410.4 · 7 · 0 | 10 · 429.5 · 6 · 0 |
| 6 | 10 · 529.5 · 8 · 0 | 10 · 554.4 · 9 · 0 |
| 7 | 10 · 599.5 · 8 · 0 | 10 · 526.6 · 8 · 0 |
| 8 | 10 · 597.5 · 8 · 0 | 9 · 586.3 · 8 · 0 |
| 9 | 10 · 688.6 · 7 · 0 | 10 · 585.8 · 8 · 0 |
| 10 | 9 · 559.4 · 8 · 0 | 7 · 560.4 · 7 · 0 |
| 11 | 2 · 754.7 · 12 · 1 | 3 · 808.2 · 12 · 0 |
| 12 | 10 · 766.7 · 9 · 0 | 10 · 686.2 · 10 · 0 |
| 13 | 10 · 595.3 · 7 · 0 | 10 · 548.7 · 6 · 0 |
| 14 | 10 · 580.0 · 7 · 0 | 10 · 548.5 · 6 · 0 |
| 15 | 10 · 717.1 · 9 · 0 | 10 · 727.6 · 8 · 0 |
| 16 | 10 · 736.9 · 9 · 1 | 10 · 717.8 · 8 · 0 |
| 17 | 10 · 709.7 · 8 · 0 | 7 · 734.6 · 8 · 1 |
| 18 | 8 · 727.2 · 7 · 2 | 6 · 703.8 · 12 · 2 |
| 19 | 9 · 818.6 · 8 · 1 | 1 · 888.5 · 12 · 0 |
| 20 | 10 · 848.9 · 10 · 1 | 10 · 764.8 · 10 · 2 |
| 21 | 10 · 744.4 · 9 · 1 | 10 · 764.8 · 10 · 1 |
| 22 | 10 · 935.3 · 11 · 0 | 10 · 910.9 · 11 · 1 |
| 23 | 10 · 978.7 · 11 · 1 | 10 · 997.0 · 11 · 2 |
| 24 | 10 · 1083.6 · 11 · 3 | 10 · 1091.6 · 11 · 2 |
| 25 | 10 · 300.1 · 5 · 0 | 10 · 299.1 · 5 · 0 |
| 26 | 10 · 544.7 · 9 · 0 | 10 · 556.6 · 10 · 0 |
| 27 | 1 · 721.7 · 14 · 0 | 6 · 692.7 · 14 · 0 |
| 28 | 10 · 757.9 · 11 · 0 | 10 · 726.9 · 11 · 0 |

All no-merge controls on levels 4, 8, 12, 16, 20, and 24 won under both policies. Single badly placed, undercovered defenses lost on levels 1, 4, 8, 12, 16, 20, 24, 25, 27, and 28. This shows that a minimal poor placement is punished; it is not a statistical human win-rate estimate.

## Review-only commands

`debugEncounter`, `debugMini`, `debugCast`, `debugGarden`, and `debugBossDamage` are enclosed with their handlers in `UNITY_EDITOR || DEVELOPMENT_BUILD || CARROT_QA`. A separate no-symbol player compilation verified that their methods and dispatch do not exist; a `DEVELOPMENT_BUILD` compilation verified staging works. The review commands use a real boss home level, valid route entrances, real actor/wave accounting, and the actual warned cast dispatcher with a per-creature ability allowlist. They do not alter production gameplay. QA staging rebuilds the real view before emitting the boss entrance, so a later scene rebuild cannot clear its cinematic or overwrite its theme. The shorter rule suite and release/development gate checks were repeated after that review-only ordering correction. Root's review UI disables progression awards during review.

The ordinary/miniboss HP anchors use current model bounds, and meteor impact events use the same locked ground position as their splash damage. Runtime appearance and audio must still be reviewed in the integrated build.

## Final regression review

Three independently reported cases were reproduced with failing real-tick tests before correction, then rechecked in the full suite:

- Poison or bleeding could defeat an Eyeball life and then continue its same update into a new legacy cast. A rebirth transition now stops that update; its 2.2-second reforming state remains authoritative.
- Two Frost Heralds could begin warnings before either claimed the shared freeze recovery. The commit rechecks recovery; a deferred Herald must issue a fresh warning after the shared gate, rather than extending the freeze.
- Moss Shield, Lantern Flood, or Sentinel protection could make an existing innate shield expire. Temporary grants now record only their extra portion, consume that portion first on damage or stripping, and remove only the unspent remainder on expiry. Tests cover stronger innate shields, damaged innate shields, partial absorption, full absorption into the native layer, and Magnet stripping; expiry does not restore already absorbed native shield.

The final full run above includes these fixes. `debugGarden` displays either group of ten plants at a chosen tier on the current map's valid pads, clears replaced tower references and projectiles, and uses fresh IDs. `debugBossDamage` goes through actual damage/rebirth rules and respects untargetable states. Both remain excluded from release compilation. These review tools do not form part of the earned-coin campaign tests.


## Pass 2 (giant update, 14 October 2026)

Measured with the reference bots of [giant-update/difficulty.md](giant-update/difficulty.md) at commit ef4ca7a.

- **Targeting changed the fight.** Towers now shoot the enemy with the least route left (pass-2 step 3). With that
  rule canonical policy 1 lost the Portal at every ordinary-health dial from 0.70 to 0.85 and at boss health 23,000 to
  30,000 (1 of 10 seeds won), while policy 0 and the median bot kept winning: the old fraction rule had preferred the
  boss on the long route.
- **Resolution.** The Portal walks at 0.18 (was 0.21) with 31,000 HP (was 30,000); its phase-3 pace stays 0.28. At
  0.18 both canonical policies win (policy 0: 10 HP in 12.05 min; policy 1: 10 HP in 11.15 min) and the expert wins all
  20 seed variants; 32,000 HP already costs policy 1 its seed-0 win. Ordinary adds use dial 0.85 and the pass-2 ramp
  (challenges: early waves 0.8x easing to 1, the rest climbing to 1.15x).
- **Bands.** Median bot R1 60% (band 15-30%), novice R2 35%; the band is out of reach while the
  expert must win every seed (at 34,000 HP R1 falls to 21% and the expert to 12 of 20 seeds).
- **Telegraphs.** Portal Storm locks towers and is actionable: its windup is at least 2.5 s and holds 1x at 2x speed.
  `bossDeadline` fires once at 50%, 75% and 90% of the route; the snapshot carries `remaining`, `eta`, `routeFraction`.
- **Single-cast check.** Muting one cast on 200 R1 seeds flips Portal Blink 73%, Summon 38%, Shift 19% and Storm 18% of
  R1's losses into wins: the guardian's kit is the fight (difficulty-single-cast.json).
