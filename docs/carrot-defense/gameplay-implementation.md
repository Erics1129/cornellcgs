# Carrot Defense: implemented gameplay

Audited 12 October 2026. This is the authoritative implementation record, separate from preproduction illustrations and runtime visual acceptance. [Balance evidence](balance-results.md) records the completed simulation checks and their limits.

## Sources and ownership

- [CarrotGame.cs](../../unity/CarrotDefense/Assets/Scripts/CarrotGame.cs) owns combat, enemy movement, currency, targeting, waves, statuses and outcomes.
- [CarrotData.cs](../../unity/CarrotDefense/Assets/Scripts/CarrotData.cs) contains all authored levels and tuning. [game-data.json](../../public/assets/minigames/carrot/game-data.json) exposes equivalent route, pad, blocker, wave and tower definitions to the website.
- [CarrotSimulationTests.cs](../../unity/CarrotDefense/Assets/Scripts/CarrotSimulationTests.cs) executes the shipped simulation. Effects and models consume events; they never award damage or money.
- [CarrotPage.tsx](../../src/minigames/carrot/CarrotPage.tsx) and [progress.ts](../../src/minigames/carrot/progress.ts) own the visible HUD and local campaign save.

## Campaign and placement

All 12 maps have two or three fixed routes, multiple entrances and one shared carrot. The 15 × 11 logical grid uses `[x,z]`; world position is `(x−7,0,z−5)`. Routes are 27–56 units long. The complete campaign contains 28 routes, 208 build pads and 105 waves. Routes can merge and share a tail. Ordinary enemies use the authored route at ground height; moths follow that route in flight and require an air-capable tower.

Pads remain at least 0.85 units from every logical route. Scenery occupies authored pads, must be shot to clear, and pays a one-time reward. Tapping scenery explicitly focuses available towers on it; tower purchases cannot overwrite it. The remaining open positions permit alternate coverage choices from the opening wave. Decorative plants do not alter routes or create extra legal pads.

| Level | Routes | Route lengths | Pads / blockers | Waves | Opening coins |
|---|---:|---|---:|---:|---:|
| 1 · First Sprout | 2 | 40 / 42 | 16 / 3 | 5 | 240 |
| 2 · Dewdrop Bend | 2 | 41 / 40 | 16 / 3 | 6 | 240 |
| 3 · Orchard Switchbacks | 2 | 48 / 50 | 16 / 4 | 7 | 240 |
| 4 · Hollow Oak | 2 | 49 / 56 | 16 / 4 | 8 | 240 |
| 5 · Lantern Causeway | 2 | 48 / 38 | 18 / 4 | 8 | 300 |
| 6 · Twin Reeds | 2 | 39 / 46 | 18 / 5 | 9 | 300 |
| 7 · Firefly Weave | 2 | 44 / 38 | 18 / 5 | 9 | 300 |
| 8 · Moonwell | 3 | 36 / 38 / 46 | 18 / 5 | 10 | 300 |
| 9 · Crystal Descent | 2 | 41 / 41 | 18 / 6 | 10 | 360 |
| 10 · Split Summit | 3 | 38 / 40 / 43 | 18 / 6 | 10 | 360 |
| 11 · Aurora Steps | 3 | 34 / 49 / 27 | 18 / 6 | 11 | 360 |
| 12 · Last Harvest | 3 | 34 / 40 / 44 | 18 / 7 | 12 | 360 |

First introductions are runners in level 1, swarms in 2, armor in 3, Brambleback in 4, flying moths in 5, denser mixed waves in 6, healing shamans in 7, Lantern Regent in 8, crystal shields in 9, three-route mixed pressure in 10, burrowers in 11 and Crown of Winter in 12. Every route remains available; wave packets distribute creatures across entrances instead of forcing an invisible lane switch.

The next wave starts after the previous wave's enemies, reserved summons and carrot contacts resolve, followed by a five-second breather. Calling it early awards the remaining whole seconds as coins. Normal spawns are 0.78s apart, swarms 0.24s apart; packet breaks make clustered groups legible. Bosses arrive in the final wave. The wave event names the first actual spawn entrance.

## Ten towers, four tiers

Each family has a base purchase and three paid upgrades. The cost columns are separate payments, not cumulative prices. Upgrades improve damage, cadence, range and/or the family's power. Physical model changes are owned by the model/view implementation and require visual review.

| Tower | Unlock level | Targeting | Buy / II / III / IV | Total to IV |
|---|---:|---|---|---:|
| Seed | 1 | Ground + air | 80 / 65 / 120 / 200 | 465 |
| Frost | 1 | Ground | 95 / 75 / 135 / 220 | 525 |
| Mortar | 2 | Ground | 120 / 90 / 160 / 255 | 625 |
| Prism | 3 | Ground + air | 130 / 100 / 170 / 275 | 675 |
| Storm Bell | 5 | Ground + air | 145 / 110 / 185 / 295 | 735 |
| Sun Blossom | 6 | Ground | 110 / 85 / 150 / 240 | 585 |
| Starfruit | 2 | Ground + air | 125 / 90 / 160 / 260 | 635 |
| Black Hole | 7 | Ground | 185 / 130 / 220 / 340 | 875 |
| Spellbook | 4 | Ground + air | 150 / 110 / 180 / 290 | 730 |
| Thunderhead | 8 | Ground + air | 220 / 150 / 250 / 390 | 1010 |

| Tower | Automatic special power | Bounds and counterplay |
|---|---|---|
| Seed | Three successful marks trigger a damaging burst and a nearby ricochet. | Burst adds 45–75% of the shot's damage; ricochet adds 50%; burst cooldown 1.2s. |
| Frost | Slow and a visible short crystallization; higher tiers splash. | Slow 30–48%; freeze 0.40–0.64s with a per-enemy 4.5s cooldown. Bosses cannot freeze. |
| Mortar | An arcing shot commits to a ground point, then leaves burning ground for 2s. | Splash radius 0.75–1.20; outer damage 65%; burn deals 10–16% of shot damage per second. Ground only. |
| Prism | Consecutive shots at one enemy ramp to +50% damage; a live shield permits an additional 25% health bypass. | Changing targets resets the ramp. Elemental damage avoids kinetic armor. |
| Storm Bell | Lightning chains across 3 / 3 / 4 / 5 distinct nearby enemies; applies conductivity. | Each hop retains 80% damage; conductivity gives Storm and Thunder +15% damage for 2.5–4s. |
| Sun Blossom | A radial heat pulse also gives nearby other towers a 10–20% cadence aura. | Ground damage and half damage to nearby scenery; three-second aura; strongest aura wins. |
| Starfruit | Fires at 3–6 distinct enemies, with a returning star dealing 50% extra damage to each surviving target. | Real ground/air targets within range; separate projectiles, not a decorative star field. |
| Black Hole | Damages/slows nearby enemies, pulls their route position backward and visibly attracts them toward the well. | Pull is 0.35–0.80 units with a per-enemy four-second cooldown. Attraction lasts 0.65s; enemies recover to their route. Bosses cannot be pulled. |
| Spellbook | A rune reverses an enemy's actual movement along its route for one second. | Per-enemy six-second cooldown; bosses receive a brief 10% slow instead. |
| Thunderhead | Charges for 0.7s, then heavily strikes up to three distinct enemies. | 70–245 damage each, 3.2–2.6s cadence, 0.2s normal-enemy stun. Different from Storm's lighter chain. |

Explicit enemy focus is honored by all families, including one guaranteed slot among Starfruit/Thunderhead's distinct targets. There are no extra ability buttons. Slow effects use the strongest active slow and cap at 50% for ordinary enemies and 20% for bosses. Freeze, rewind and pull have per-enemy cooldowns. Projectiles normally cancel against dead, hidden or biting targets; Mortar's committed ground impact and Blossom's local pulse still resolve at their actual positions.

## Enemies and boss encounters

Eight normal families have different gameplay: `nibble` is the baseline; `dash` is fast; `shell` reduces kinetic damage by 40%; `swarm` arrives in dense fragile groups; `moth` flies; `shaman` telegraphs an 8%-max-health heal for nearby ordinary allies; `burrow` periodically hides for 1.8s after a 0.7s warning; `crystal` has a breakable shield and accelerates after its break. Normal HP/shield scales with level, from ×1 to ×3.1. Summoned enemies have no coin reward.

All living, nonhidden ordinary monsters in the viewport provide an HP bar. Boss HP, shield, actual phase and cast countdown use authoritative values. Boss phase thresholds differ; the HUD must use each boss's actual thresholds.

| Boss | HP; phase transitions | Real abilities and readable windups | Finite limits |
|---|---|---|---|
| Brambleback · level 4 | 1,800; 60% / 25% | Bark: 1.2s warning, 35% kinetic protection for 5s. Roots: 1.3s warning, up to two nearby towers slowed to 60% cadence for 3.5s. | Roots expose a 70-HP knot; breaking it releases the snare. Final phase drops bark and moves faster. |
| Lantern Regent · level 8 | 3,400; 55% / 25% | Mist: 1.4s warning, nearby ordinary allies take 30% less damage for 5s. Summon: 1.5s warning, three actual minions. | At most three summon casts, phase 2 only; final mist lasts 3s. No self-heal. |
| Crown of Winter · level 12 | 5,600; 65% / 30% | Mantle: 1.5s warning, 360 shield for up to 7s. Breath: 1.5s warning, up to three towers in a three-unit cone reduced to 50% cadence for 4s. Shatter: 1.2s warning, three actual fragments. | At most three mantles; final phase drops shielding and can cast shatter at most twice. |

Boss casts serialize. Root/breath choose and lock their target IDs when the windup begins. Every affected tower receives a warning and committed target event; selling it before commitment prevents that target's effect. Primary `telegraph`/`ability` events drive the boss source effect/audio once, and `telegraphTarget`/`abilityTarget` cover additional targets without repeating those cues. Boss death and contact cancel uncommitted casts and release reserved summon counts. Spawned adds must still resolve before victory.

## Economy, outcomes and progress

Each level starts with 240 / 300 / 360 coins by biome. Kills, one-time scenery rewards, wave stipends (15 / 20 / 25) and the small early-call bonus are the only new currency sources. Selling returns `floor(totalSpent × 0.70)`; buying and selling cannot create money. Purchases reject locked families, insufficient funds, invalid pads and occupied pads. There are exactly three upgrades, with no fifth tier.

The carrot begins at 10 HP. An ordinary arrival costs one HP, a boss arrival three. The 0.65s bite animation applies its single deduction near the middle. The encounter resolves after the contact finishes; a fatal last bite takes precedence over final-wave victory. A surviving carrot may win after a boss reaches it, with the corresponding three-HP loss. Enemies that bite pay no kill bounty.

Progress uses scheduled enemy resolution plus fractional boss HP, weighting a boss as eight ordinary enemies. It remains below 100% until all waves, living enemies, reserved adds and contacts have resolved. A summon does not inflate the progress denominator, but it still blocks victory. On a win progress becomes exactly 1; loss never grants completion.

The simulation runs at 30 fixed steps per game second. Pause freezes movement, cooldowns, statuses, projectiles and progress. The 2× control scales game time; leaving the page/focus suspends simulation. No idle gap grants free catch-up attacks. Purchases remain available while planning or paused.

## Browser contract and save boundary

Commands are `load`, `start`, `next`, `preview`, `buy`, `upgrade`, `sell`, `pause`, `speed`, `select`, `mute`, `clear`. `clear` deselects; it does not destroy scenery. `preview` changes the displayed base tower range. The scene raycast selects real pad/entity IDs; selections publish normalized viewport coordinates with top-origin y.

Snapshots include live coins, health, waves, phase, progress, boss/monster HP, selection, plus `towerCount`, `cleared`, `blockersRemaining` and `muted`. **`cleared` is the number of destroyed authored blockers**, excluding temporary boss root knots; it is not a boolean. Clearing all scenery is `blockersRemaining === 0`.

Campaign progression is local and single-player: victories unlock the next level; completion, an unharmed carrot and cleared scenery are separate medals. Replaying a level merges earned medals. Browser development preview is gated by `import.meta.env.DEV` and does not award campaign results. Simulation test helpers compile only under `UNITY_EDITOR`; production's JSON command switch has no free currency, forced damage, unlock-all or forced-win command. Client saves are not a competitive anti-cheat boundary.

## Verification boundary

The 39,822-assertion Unity run validates the original finished campaign and ten powers. The subsequent managed run passes 39,845 assertions, adding 23 checks for all locked boss targets, one source cue per cast, correct entrance reporting, ordinary HP visibility and multi-target focus precedence; the 24 campaign results remain identical. See [balance-results.md](balance-results.md) and the retained [raw result log](simulation-results.txt).

These checks establish simulation behavior and legal economy. They do not certify rendering quality, phone frame rate, touch usability, music quality or every possible tower strategy. Runtime visual acceptance is a separate gate.
