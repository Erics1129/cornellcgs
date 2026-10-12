# Carrot defense — combat and economy specification

Status: original first-pass tuning, 12 October 2026. Not commercial 保卫萝卜 balance data. Validate in simulation and actual Unity play before treating any values as final. This document defines behavior; it is not implementation.

## Shared rules

- Campaign: 12 original levels, four in each of Garden, Marsh and Frost. Finales at 4, 8 and 12. Fixed authored ground paths; airborne enemies have an explicitly previewed flight path. No energy, entry fee, advertising, purchases or retry limit.
- Carrot: 10 health. Ordinary arrivals cost one; a boss arrival costs three. Each offender performs one readable windup/contact/recovery bite and resolves exactly once. A boss that arrives then exits; it cannot repeatedly drain health. Zero health ends the level immediately. Surviving all enemies wins even if the carrot was damaged.
- Distance: one unit means one build-grid tile. Damage is per hit. Cooldowns and durations are game-time seconds and respect pause/speed. Each tower has **four total tiers: initial purchase + three upgrades**. Upgrades are permanent for that run; no branches or hidden random bonuses.
- Ordinary targeting: eligible enemy furthest along its route; distance and stable spawn order break ties. Tapping a visible enemy or breakable obstacle focuses that target, with a clear target ring. Repeated tap clears focus. Towers resume ordinary targeting when focus dies or leaves range. Cleared scenery cannot steal shots after it disappears.
- Damage: kinetic is reduced by the listed armor fraction; elemental ignores kinetic armor. Shield is a separate damage pool consumed before health. Prism pierces shields at 25% effectiveness into health while dealing its normal damage to the shield; unshielded targets take its ordinary damage once. No double hit on the same target from one projectile.
- Control: strongest slow wins; slows never multiply. Maximum slow on regular enemies is 50%, elites 35%, bosses 20%. Bosses cannot be stunned or knocked off-route. Frost has no hidden full-freeze proc.
- Each projectile resolves on impact; a dead target cancels a single-target projectile without changing targets midflight. Mortar shells still explode at their committed landing location. Damage/coins resolve once even if a defeat effect remains onscreen.

## Tower purchase and inspection

Tap an empty available pad to open one illustrated purchase sheet, anchored beside the pad on desktop and above the safe bottom edge on a phone. It contains the six generated tower portraits, price, range and one role icon. The selected tower shows its larger illustration and a real range preview on the board. A second deliberate **Build** action spends coins; hovering/selecting a portrait never purchases. Dismiss by tapping empty space. The world keeps running unless explicitly paused; no popup opens on every hit or wave.

Tap an owned tower to show its illustration, `I / II / III / IV` tier indicator, next upgrade price and before→after damage/range/cadence. Three small upgrade nodes light sequentially. **Upgrade** and **Sell** stay visible, with the exact refund. At IV display a restrained `MAX` label and remove the purchase action. The range preview follows the actual combat values. Insufficient funds dim only the action, leaving the information readable. Buttons use ≥48 CSS-pixel touch targets; game UI uses artwork/icons and short labels, without generation or production terminology.

### Numeric tuning

Costs are incremental; tiers II–IV show the price of that upgrade, not cumulative cost. Range is measured from the tower pivot to the enemy's ground projection, so tall models do not accidentally gain range. Airborne targets still require an air-capable tower.

| ID / role | Tier | Cost | Damage | Interval | Range | Other combat properties |
|---|---:|---:|---:|---:|---:|---|
| `seed` / rapid kinetic; ground + air | I | 80 | 10 | 0.60 | 3.0 | One target |
| | II | 65 | 15 | 0.55 | 3.2 | One target |
| | III | 120 | 23 | 0.50 | 3.4 | One target |
| | IV | 200 | 34 | 0.45 | 3.6 | One target |
| `frost` / elemental slow; ground | I | 95 | 6 | 1.20 | 2.8 | 30% slow, 1.6 s; one target |
| | II | 75 | 9 | 1.10 | 3.0 | 36% slow, 1.8 s; splash radius 0.45 |
| | III | 135 | 14 | 1.00 | 3.2 | 42% slow, 2.0 s; splash radius 0.60 |
| | IV | 220 | 21 | 0.90 | 3.4 | 48% slow, 2.2 s; splash radius 0.80 |
| `mortar` / kinetic splash; ground | I | 120 | 34 | 1.80 | 3.8 | Explosion radius 0.75 |
| | II | 90 | 52 | 1.70 | 4.0 | Radius 0.90 |
| | III | 160 | 78 | 1.60 | 4.2 | Radius 1.05 |
| | IV | 255 | 118 | 1.50 | 4.5 | Radius 1.20 |
| `prism` / elemental precision; ground + air | I | 130 | 34 | 1.50 | 4.4 | Shield bypass rule above; one target |
| | II | 100 | 52 | 1.40 | 4.7 | Same |
| | III | 170 | 78 | 1.30 | 5.0 | Same |
| | IV | 275 | 114 | 1.20 | 5.3 | Same |
| `storm` / elemental chain; ground + air | I | 145 | 14 | 1.20 | 3.0 | 3 targets, hop radius 1.5 |
| | II | 110 | 21 | 1.10 | 3.2 | 3 targets, hop radius 1.6 |
| | III | 185 | 30 | 1.00 | 3.4 | 4 targets, hop radius 1.7 |
| | IV | 295 | 43 | 0.90 | 3.6 | 5 targets, hop radius 1.8 |
| `blossom` / elemental radial pulse; ground | I | 110 | 12 | 1.50 | 2.0 | Hits every eligible enemy in radius |
| | II | 85 | 19 | 1.40 | 2.2 | Same |
| | III | 150 | 29 | 1.30 | 2.4 | Same |
| | IV | 240 | 44 | 1.20 | 2.6 | Same |

Mortar: full damage inside 50% of blast radius, 65% damage outside that core; no damage beyond radius. Storm: subsequent hops multiply damage by 0.8, cannot revisit an enemy, and choose the nearest eligible unvisited target. Blossom pulses only while an enemy is in range; scenery receives 50% of pulse damage to avoid effortless map clearance. Every tower can focus reachable scenery; frost deals only 25% damage to scenery.

### Four-tier artwork and animation contract

| ID | I: purchase | II: first upgrade | III: second upgrade | IV: third upgrade |
|---|---|---|---|---|
| `seed` | Single seed pod on wood collar; short recoil | Paired side leaves and brass collar; snappier recoil | Triple petal crown; internal chamber rotation | Broad golden crown and three visible pods; staggered muzzle puffs, same one-shot damage event |
| `frost` | Dewdrop bud; gentle mist breath | Split crystal petals; opening bloom at launch | Six-point flower; orbiting frost motes | Full ice-lotus silhouette; expanding impact petals and falling ice dust |
| `mortar` | Hollow terracotta gourd; weighted barrel kick | Reinforced rim and leaf fins; dust puff on recoil | Twin support braces; visibly larger ammunition | Carved bronze pumpkin bowl; heavy compression/recovery and bright launch plume |
| `prism` | Single suspended quartz; charge then narrow beam | Forked crystal frame; stronger charge glint | Three crystal spires; small convergence rays | Tall faceted crown; refracted launch halo, narrow readable impact |
| `storm` | Small hanging storm bell; coil shake | Two side chimes; arcs gather around bell | Three tiered bells; staggered ringing | Broad antler-like conductor; branches light before the chain, then fade promptly |
| `blossom` | Closed five-petal warm blossom; short pulse opening | Two petal rings; larger opening | Three rings and luminous center; rolling petal wave | Wide sun-flower crown; layered radial pulse with warm airborne pollen |

Each tier needs a generated portrait and consistent front/side/three-quarter reference before implementation. Generate at least anticipation, emission/contact and recovery keyframes for each tower family; the Unity motion must interpolate through actual geometry/rig states, not pan a still picture. Upgrade morph takes about 0.7 s without disabling already purchased combat longer than one attack interval. Keep tier IV effects small enough that enemies and health bars remain legible.

## Enemy roster

These are base stats at introduction. Per-level multipliers are explicit authored data, never silently based on player skill: suggested HP scale 1.00/1.15/1.30/1.45 for Garden; 1.55/1.75/1.95/2.15 for Marsh; 2.30/2.55/2.80/3.10 for Frost. Speed and rewards stay fixed unless a specific elite is previewed. Boss stats below already include their finale tuning and do not receive these multipliers.

| ID / silhouette | Base HP | Speed | Coins | Behavior and counter |
|---|---:|---:|---:|---|
| `nibble` / soft round hopper | 55 | 0.90 | 8 | Ordinary ground enemy; clear hop-and-squash locomotion. Baseline target for seed. |
| `dash` / long-eared leaf mouse | 38 | 1.65 | 9 | Fast ground runner, always visibly leans forward; frost plus seed counters it. No untelegraphed acceleration. |
| `shell` / low acorn beetle | 125 | 0.62 | 15 | 40% kinetic armor; chipped-shell hit reaction. Prism/elemental towers counter armor. |
| `swarm` / tiny three-legged spore | 24 | 1.08 | 4 | Authored clusters of 4–6, each is a real enemy with its own arrival/damage. Mortar, storm and blossom counter density. |
| `moth` / wide winged lantern moth | 65 | 1.10 | 11 | Air path; cannot be hit by ground-only towers. Seed, prism or storm counters it. Preview its flight line before its first wave. |
| `shaman` / tall mushroom with lantern staff | 130 | 0.70 | 18 | Every 7 s heals nearby non-boss allies by 8% maximum HP, radius 1.7; 1.0 s green lantern telegraph. Cannot heal itself, shields or dead units. Focus fire counters it. |
| `burrow` / pointed mole with digging claws | 80 | 0.90 | 12 | Every 7 s dives for 1.8 s after a 0.7 s dirt windup; cannot be targeted underground, but follows the same path at unchanged speed with a visible mound. Cannot dive within 2 tiles of carrot. Rear coverage counters it. |
| `crystal` / angular four-legged crystal crab | 110 + 70 shield | 0.70 | 17 | When shield breaks, pauses 0.35 s with a distinct crack, then moves at 1.20. No invulnerability. Prism bypass or a slow at the shield-break zone counters it. |

Enemy bar: show a short world-anchored health bar when damaged, targeted or near the carrot; a separate thin pale shield strip for `crystal`. Background remains high contrast. Hide ordinary bars after 2 s without damage if not focused. Health changes use an immediate fill with a short trailing damage segment; no long easing that misrepresents lethal damage. Ground/air icon appears only on inspection and first introduction.

## Bosses

One boss at a time. A persistent top-center boss portrait/name/HP bar appears from its entrance until defeat/arrival. Show real current/max health and phase markers; shield is a separate strip and never masquerades as health. Ability windups are indicated by the actual model, sound and a small icon near the bar. No unavoidable full-screen blast. One major ability may be active at once; cooldowns restart when its effect finishes. Boss damage reduces health during windups; no invulnerable phase-transition cinematics. A phase transition cancels a windup for an ability that the new phase disables. Defeat/arrival cancels uncommitted abilities and their pending-spawn reservations; already spawned adds remain and must resolve.

### Garden / `garden`: Brambleback — 1,800 HP, speed 0.36, reward 120

- **Bark Guard:** first cast 6 s after entry, then 14 s cooldown. Raises shoulders and grows visible bark for 1.2 s; gains 35% kinetic reduction for 5 s. No effect on elemental damage. Counter: frost holds it in a prism/blossom zone; focus before the bark settles. This armor does not stack with other armor.
- **Root Snare:** first cast 11 s after entry, then 13 s cooldown. Marks the nearest two towers in range 4.0 with thin ground vines for 1.3 s; their attack cadence becomes 40% slower for 3.5 s. The root knot is a 70-HP focusable target at the boss's feet; destroying it ends all current snares. No menu tapping/minigame required.
- **Phases:** >60% HP: guard only. At ≤60%, one 0.8 s roar introduces snare; regular movement continues afterward. At ≤25%, bark guard ends, movement increases to 0.48, and snare cooldown becomes 10 s. Its exposed amber center makes the final phase visibly vulnerable.

### Marsh / `marsh`: Lantern Regent — 3,400 HP, speed 0.32, reward 180

- **Mist Veil:** first cast 7 s after entry, then 16 s cooldown. Lantern inhales teal vapor for 1.4 s; creates a moving mist patch of radius 1.7 for 5 s, reducing damage received by ordinary allies inside by 30%. Boss receives no veil reduction. Enemies and bars stay visible. Counter: concentrate on the boss or clear allies before they enter; wide-area damage is useful at the edge.
- **Bog Call:** first cast 12 s after entry, then 17 s cooldown, maximum three casts. Three lit reed circles appear at the current boss route position for 1.5 s; spawn three ordinary `nibble` adds at that position. Adds have Marsh-level HP, pay zero coins, count as live enemies for victory, and never spawn beyond a point 4 tiles from the carrot. Counter: retain splash coverage instead of spending every coin on single-target damage.
- **Phases:** >55%: veil only. At ≤55%: its crown opens and Bog Call becomes available; veil cooldown becomes 14 s. At ≤25%: stop summoning, speed becomes 0.46, and the last veil lasts only 3 s. This final phase cannot indefinitely stall victory.

### Frost / `frost`: Crown of Winter — 5,600 HP, speed 0.30, reward 250

- **Crystal Mantle:** first cast 6 s after entry, then 18 s cooldown, maximum three casts. Facets gather for 1.5 s; gain 360 shield, lasting until broken or 7 s. New shield cannot stack or refresh an existing shield. Counter: prism bypass plus sustained elemental damage; the separate bar shows exactly what remains.
- **Frost Breath:** first cast 11 s after entry, then 15 s cooldown. Raises head and marks a narrow 3-tile cone toward the closest tower for 1.5 s. Up to three towers in that cone fire 50% slower for 4 s; they remain selectable and operable. Counter: spread towers across both sides of the route, upgrade a rear firing line, or concentrate damage before breath. Cone direction locks at telegraph start.
- **Shatter March:** only below 30% health, once per 12 s. Crown brightens for 1.2 s, then three 90-HP crystal fragments spawn ahead at authored valid ground-route positions no closer than 3 tiles to carrot. They have speed 0.75, no shield, zero reward and one-point bites. Counter: reserve chain/splash coverage. Maximum two casts, then ability is spent.
- **Phases:** >65%: mantle only. At ≤65%: two crown petals break off; breath enabled. At ≤30%: remove remaining shield, stop mantle casts, speed becomes 0.42 and shatter begins. The last phase has no healing, shield regeneration or infinite summons.

## Economy, campaign pacing and rewards

- Initial coins: Garden 240, Marsh 300, Frost 360. Every level can be completed without scenery rewards; optional clearance creates alternate strategies and faster upgrades, not a mandatory hidden purchase.
- Small obstacle: 70 HP / 15 coins. Medium: 160 HP / 30 coins. Large: 300 HP / 50 coins. Scale scenery HP by biome (1.0 / 1.5 / 2.0), but keep payout fixed. At least one inexpensive expansion target must be reachable from an initial pad.
- Completion stipend per wave: 15 / 20 / 25 coins by biome. Pay only once after that wave's scheduled enemies have spawned and resolved. A previewed early-wave send can award 1 coin per skipped preparation second, capped at 6; it never bypasses an unresolved boss phase.
- Selling returns 70% of all actual purchase/upgrade coins spent, rounded down. Show the amount. No refund for an unbuilt portrait selection. A run restart resets run coins/towers/enemies, not campaign progress.
- Tower access: seed + frost from level 1, mortar at 2, prism at 3, storm at 5, blossom at 6. New tower unlock is a single illustrated reveal with one short role label. Players may inspect later tower illustrations, but cannot accidentally spend on a locked tower.
- Tentative waves: Garden 5 / 6 / 7 / 8; Marsh 8 / 9 / 9 / 10; Frost 10 / 10 / 11 / 12. Begin with low-pressure introductions; alternate density, speed and armor before mixing them. Boss arrives in the final wave with a finite escort. Budget enemy coin income plus stipends/starting coins to approximately 700–1,000 Garden, 1,200–1,700 Marsh and 1,800–2,400 Frost before optional scenery; revise only after testing.
- Persistent rewards are campaign medals: survive, finish at full carrot health, clear all optional scenery. Save each achievement independently so a later imperfect run cannot erase a previous medal. Unlock next level on any victory; chapter boss victory unlocks the next biome. No permanent combat-stat grind is needed to finish the campaign.

## Progress and outcome truth

Keep separate fields for scheduled spawns remaining, living enemies, pending summoned additions, and unresolved carrot-contact animations. A defeated enemy is resolved at its lethal damage event; a leaking enemy is resolved at its one carrot-contact event. Visual defeat particles do not count as living.

The ordinary level progress fill uses **resolved authored enemy work / total authored enemy work**, with weight 1 per ordinary enemy and weight 8 per boss. The boss contributes up to 8 × (1 − current HP / initial HP) while alive, then the full 8 when defeated or after its carrot contact. Shield never increases the denominator. Clamp visible progress to 99% while any scheduled spawn, live enemy, pending summon or unresolved contact remains. Summoned adds do not change the denominator (so progress never jumps backward), but they must resolve before 100%. Their spawn caps are authored and finite.

Show a separate concise `wave / total waves` label and a small current-wave preview; neither alone drives victory. Victory requires: last scheduled wave dispatched, no scheduled spawns remaining, no living enemies, no pending summons, no unresolved contacts, carrot health above zero. Set the outcome once, award/save rewards once, stop new spawns/abilities, play carrot celebration, then show the result. Loss takes precedence if a contact reduces carrot health to zero in the same update as the final enemy resolves. Pause and background-tab suspension must freeze combat, countdowns, audio progression and ability timers consistently.

## Acceptance checks for the first playable

- Buy each of six towers, apply all three upgrades and confirm costs, bar values, model tier, cadence, range and refund match.
- Each enemy role visibly differs in movement and forces its advertised counter; every health/shield bar follows actual damage.
- Every boss actually executes each reachable phase/ability and produces the specified effects on real gameplay; a decorative attack animation is insufficient.
- Let every enemy class reach the carrot once: exactly one health event and visible contact reaction; no repeat bite or silent disappearance.
- Final boss dying while adds are alive must not win. Final wave announced while enemies remain must not win. Final contact killing carrot must lose. Retry must restore a clean playable state.
- Complete all 12 levels with at least two plausible tower mixes where available. Test phone touch, desktop pointer, pause, 2× speed, refresh/save and replaying an already-medaled level.
