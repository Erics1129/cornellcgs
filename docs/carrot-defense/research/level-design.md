> **Implementation update:** The single-route sketches below are retained as preproduction research history. The shipped design now uses **12 multiple-route maps, 28 routes, 208 pads and 105 waves**. Current exact geometry, costs and compositions are in `cornellcgs-carrot/public/assets/minigames/carrot/game-data.json`; see [implemented gameplay and test results](../design/gameplay-implementation.md). Those sources supersede earlier map sketches and six-tower assumptions.

# Carrot Defense 3D — primary-source map research and original campaign plan

Research checked 2026-10-12. This document separates observed source facts from proposed original game design. It is a production blueprint, not a statement that these systems have been built or balanced.

## User-approved direction

A recognizable carrot-defense fan project, using original artwork and original maps. Cinematic storybook presentation: expressive carrot, playful monsters, physically convincing materials, classic fixed-path tower defense, usable on desktop and touch devices. The proposed campaign contains 12 authored levels across Sunlit Garden, Moonlit Marsh, and Frostglass Highlands. Each fourth level has a distinct boss. The visual language must carry gameplay: real enemy health, a level progress bar, a boss health bar and abilities, illustrated contextual purchase choices, and four visibly different tiers per tower.

## What the original actually does — verified first-party evidence

| Official evidence | Observation / fact | Design implication (our inference) |
|---|---|---|
| [Official developer map-design post, 2024-02-28](https://www.taptap.cn/moment/511847528409337718) | The developer explicitly discusses heart-shaped and character-shaped routes; its illustrated map collection includes a small tree, double musical notes, a crab, and a rabbit. It also discusses paired surface/underwater layouts that echo one another. | Maps should have memorable silhouettes and environmental identities. Twelve small changes to one zigzag are insufficient. |
| [The map collection image embedded in that official post](https://img2-tc.tapimg.com/moment/etag/Fiuq2lITRW3B4tclV_AQteNxViOX.png/_tap_ugc.jpg) | Visually inspected: compact, largely top-down boards, highly readable continuous paths, objects arranged inside bends and in negative space, and spatially separated entry/goal points. The water-map tracks and land-map tracks differ visibly. | Keep a stable strategic camera; reserve ornamental depth for the perimeter. Place desirable build space behind removable obstacles. Preserve strong path contrast through all biomes. |
| [Official chapter showcase](https://luobo4.737.com/) | The chapter showcase lists treasure chests; lamps charged by tower fire; ship-cabin and underwater settings; torpedoes and mines; fire traps and reversible conveyors; rivers and gold-producing pots. It also describes enemies that temporarily disable towers. | A biome needs a play-relevant spatial feature in addition to a texture swap. Introduce one feature at a time; repeat it in a later combination. |
| [Official chapter showcase — tower descriptions](https://luobo4.737.com/) | Missile towers cover ground and air; bubbles slow enemies; lightning bounces between enemies; firecracker projectiles spread to nearby enemies. | Silhouette, projectile, sound, targeting, and effect should distinguish towers. Towers should solve different problems rather than being linear damage upgrades. |
| [Official weekly-race promotional image](https://luobo4.737.com/img/wt4.png) | Visually inspected: a winding lane wraps islands of obstacles and towers, with a very large central boss silhouette and small regular enemies. This is promotional imagery, not proof of exact simulation rules or level numbers. | Boss scale can be theatrical while preserving the path and tower targeting. Use one readable event at a time, not a persistent opaque effects cloud. |
| [Official milestone post, 2025-01-16](https://www.taptap.cn/moment/628688464157609298) | The developer identifies theme 13's episode 60 as the 1,000th theme stage and describes ongoing introductions of towers and supporting characters. This is a dated milestone, not a current total. | A short web campaign should imitate structured introduction and variation, not the original game's enormous quantity. |
| [Publisher's App Store listing](https://apps.apple.com/cn/app/%E4%BF%9D%E5%8D%AB%E8%90%9D%E5%8D%9C4/id1123876959?platform=ipad) | The official description positions it as accessible, playful tower defense and organizes play around themed chapters. | Keep the fan project's touch interaction fast and clear, even with richer 3D materials and animation. |

No source examined exposes authoritative enemy HP tables, exact tower DPS tables, or wave scripts. All quantities below are original provisional balancing values. No official map is traced or reproduced. Community walkthrough snippets were found but are not used as proof of official stats or mechanics.

## Original spatial rules

- Each map uses an original **15 × 11 logical grid**, coordinates `[x,z]` from `[0,0]` to `[14,10]`, north at `z=0`. One logical grid tile is one gameplay distance unit; world position is `(x-7, 0, z-5)`. Keep combat ranges in these same units.
- Paths are ordered, axis-aligned polylines; traverse points in the specified order. Ground lanes are approximately 0.8 grid units wide. Rounded visual bends must not change logical path lengths unpredictably. A route's final point is the carrot position.
- Listed build pads are exact authored legal positions. Obstacles occupy specified pads; destroying one unlocks that pad. Decorative scenery never creates an unexpected hidden build pad. Every level begins with enough unobstructed positions to survive the opening waves.
- Two routes may merge and share an ordered tail. They never change after play starts. Entry arrows and 1.5-second dotted previews identify which entrance the next wave uses.
- For these twelve authored maps, the separately previewed air-route polyline initially follows the ground-route footprint at increased altitude. This deliberate choice preserves readability and makes existing coverage useful. Store an explicit air path so later levels can vary it without an invisible shortcut.
- Camera: stable elevated three-quarter view, approximately 58 degrees downward, no compulsory rotation. Carrot, spawn portals, pads, paths, and tap targets all remain within the safe play rectangle. Boss introduction may ease out slightly, never hide the board behind a modal.
- No mandatory drag. Tap a pad to open an illustrated purchase sheet anchored to that pad (above the safe bottom edge on phones), with six generated tower portraits, cost, range, and a simple role glyph. Selecting a portrait previews; a second deliberate Build action buys. Unaffordable towers remain legible and muted. Dragging the camera must never buy. The sheet should avoid covering the carrot or selected lane.
- Tap a tower for upgrade and sell. An upgrade preview shows the next physical form and its cost. Long paragraphs and technical generation labels have no place in the HUD.

## Campaign at a glance — original design proposal

Durations exclude pre-wave preparation, pause, and optional inspection. The first two levels should be welcoming; later boards should reach about 5–8 minutes without padding every wave with extra HP. Final tuning requires playtests.

| # | Level / biome | Path identity and pressure | New lesson | Waves | Target |
|---|---|---|---|---:|---:|
| 1 | First Sprout / Sunlit Garden | Gentle S through vegetable beds | Buy, upgrade, select a removable blocker | 5 | 2:30–3:15 |
| 2 | Dewdrop Bend / Sunlit Garden | Broad inverted U around a reflective pond | Fast enemies; slow + damage pairing | 6 | 3:00–3:45 |
| 3 | Orchard Switchbacks / Sunlit Garden | Three long parallel lanes | Swarms, splash, valuable inner clearing | 7 | 3:30–4:15 |
| 4 | Hollow Oak / Sunlit Garden | Long curl ending inside the hollow | Armor, boss telegraph and focus fire | 8 | 4:15–5:15 |
| 5 | Lantern Causeway / Moonlit Marsh | Staggered raised crossings over water | Flying enemies; mixed coverage | 8 | 4:00–5:00 |
| 6 | Twin Reeds / Moonlit Marsh | Two mirrored entrances merge early | Economy split between entrances | 9 | 4:30–5:30 |
| 7 | Firefly Weave / Moonlit Marsh | Tall alternating loops like a reed lattice | Support enemies; chain damage | 9 | 4:30–5:30 |
| 8 | Moonwell / Moonlit Marsh | Two mouths converge on a hooked causeway | Boss protection aura and finite summons | 10 | 5:00–6:30 |
| 9 | Crystal Descent / Frostglass Highlands | Outer ridge curls to an inner lower shelf | Shield breaks; balanced damage types | 10 | 5:00–6:00 |
| 10 | Split Summit / Frostglass Highlands | Opposing entrances meet at a narrow saddle | Alternating split waves; coverage gaps | 10 | 5:00–6:15 |
| 11 | Aurora Steps / Frostglass Highlands | Two deep vertical runs and a short exit | Evasive burrowers; layered defense | 11 | 5:30–6:45 |
| 12 | Last Harvest / Frostglass Highlands | Three announced entrances; late merge | Whole roster, final boss phases | 12 | 6:30–8:00 |

## Exact original map blueprints

`pads` are initially empty unless listed in `blockers`. A blocker record is `x,z,type`. Types: `hedge` = small obstacle, `stump` = medium obstacle, `crystal` = large obstacle; their HP, rewards, and biome scaling are defined by the linked combat specification. These are coordinates, not copied source-game data. Props can change appearance by biome while preserving health class. All route arrays end at the same goal within a given level.

```json
[
  {
    "id": 1,
    "name": "First Sprout",
    "biome": "garden",
    "routes": [[[0,6],[3,6],[3,3],[8,3],[8,7],[14,7]]],
    "pads": [[2,5],[4,5],[4,2],[6,2],[7,4],[9,4],[7,6],[9,6],[11,6],[12,8]],
    "blockers": [[4,2,"hedge"],[9,4,"hedge"],[11,6,"stump"]],
    "startingGold": 240,
    "waves": 5
  },
  {
    "id": 2,
    "name": "Dewdrop Bend",
    "biome": "garden",
    "routes": [[[0,8],[4,8],[4,2],[10,2],[10,8],[14,8]]],
    "pads": [[2,7],[3,4],[5,3],[6,1],[8,3],[9,5],[11,3],[11,7],[13,7],[6,7],[8,7]],
    "blockers": [[5,3,"hedge"],[8,3,"stump"],[9,5,"hedge"],[13,7,"stump"]],
    "startingGold": 240,
    "waves": 6
  },
  {
    "id": 3,
    "name": "Orchard Switchbacks",
    "biome": "garden",
    "routes": [[[0,2],[11,2],[11,5],[3,5],[3,8],[14,8]]],
    "pads": [[2,1],[5,1],[8,1],[2,3],[5,3],[8,3],[10,3],[12,4],[4,6],[7,6],[10,6],[12,7],[6,9]],
    "blockers": [[5,3,"stump"],[8,3,"stump"],[7,6,"hedge"],[10,6,"hedge"],[6,9,"stump"]],
    "startingGold": 240,
    "waves": 7
  },
  {
    "id": 4,
    "name": "Hollow Oak",
    "biome": "garden",
    "routes": [[[0,8],[12,8],[12,2],[3,2],[3,5],[8,5]]],
    "pads": [[2,7],[5,7],[8,7],[11,7],[13,5],[11,3],[8,3],[5,3],[2,4],[4,4],[6,4],[7,6],[10,5]],
    "blockers": [[5,7,"hedge"],[11,7,"stump"],[8,3,"stump"],[5,3,"stump"],[6,4,"hedge"]],
    "startingGold": 240,
    "waves": 8,
    "boss": "garden"
  },
  {
    "id": 5,
    "name": "Lantern Causeway",
    "biome": "marsh",
    "routes": [[[0,5],[3,5],[3,2],[7,2],[7,8],[11,8],[11,5],[14,5]]],
    "pads": [[2,4],[4,4],[4,1],[6,3],[8,3],[6,5],[8,5],[6,7],[8,7],[10,7],[12,6],[13,4]],
    "blockers": [[4,1,"hedge"],[6,5,"stump"],[8,5,"stump"],[10,7,"hedge"],[13,4,"stump"]],
    "startingGold": 300,
    "waves": 8
  },
  {
    "id": 6,
    "name": "Twin Reeds",
    "biome": "marsh",
    "routes": [[[0,2],[5,2],[5,5],[11,5],[11,7],[14,7]],[[0,8],[5,8],[5,5],[11,5],[11,7],[14,7]]],
    "pads": [[2,1],[2,3],[4,3],[6,3],[2,7],[4,7],[6,7],[4,5],[6,4],[8,4],[10,4],[10,6],[12,6],[13,8]],
    "blockers": [[4,3,"hedge"],[4,7,"hedge"],[4,5,"crystal"],[8,4,"stump"],[10,6,"stump"]],
    "startingGold": 300,
    "waves": 9
  },
  {
    "id": 7,
    "name": "Firefly Weave",
    "biome": "marsh",
    "routes": [[[0,8],[2,8],[2,2],[6,2],[6,8],[10,8],[10,2],[14,2]]],
    "pads": [[1,5],[3,3],[3,6],[4,1],[5,4],[7,3],[7,6],[8,9],[9,4],[11,3],[11,6],[12,1],[13,3]],
    "blockers": [[3,6,"stump"],[5,4,"crystal"],[7,3,"hedge"],[7,6,"stump"],[9,4,"crystal"]],
    "startingGold": 300,
    "waves": 9
  },
  {
    "id": 8,
    "name": "Moonwell",
    "biome": "marsh",
    "routes": [[[0,2],[3,2],[3,5],[8,5],[8,8],[14,8]],[[0,8],[3,8],[3,5],[8,5],[8,8],[14,8]]],
    "pads": [[2,1],[2,3],[2,7],[4,7],[4,3],[4,4],[5,6],[7,4],[7,7],[9,6],[9,9],[11,7],[13,7]],
    "blockers": [[4,3,"stump"],[4,7,"stump"],[5,6,"crystal"],[7,4,"hedge"],[9,6,"stump"],[11,7,"hedge"]],
    "startingGold": 300,
    "waves": 10,
    "boss": "marsh"
  },
  {
    "id": 9,
    "name": "Crystal Descent",
    "biome": "frost",
    "routes": [[[0,2],[12,2],[12,8],[7,8],[7,5],[3,5],[3,9]]],
    "pads": [[2,1],[5,1],[8,1],[11,3],[13,5],[11,7],[9,7],[8,5],[6,6],[5,4],[2,6],[4,7],[2,8]],
    "blockers": [[5,1,"hedge"],[11,3,"crystal"],[9,7,"stump"],[6,6,"crystal"],[4,7,"hedge"]],
    "startingGold": 360,
    "waves": 10
  },
  {
    "id": 10,
    "name": "Split Summit",
    "biome": "frost",
    "routes": [[[0,2],[4,2],[4,5],[8,5],[8,8],[14,8]],[[14,2],[10,2],[10,5],[8,5],[8,8],[14,8]]],
    "pads": [[2,1],[3,3],[5,3],[6,4],[8,4],[9,3],[11,3],[12,1],[5,6],[7,7],[9,6],[10,7],[12,7]],
    "blockers": [[5,3,"stump"],[9,3,"stump"],[8,4,"crystal"],[5,6,"hedge"],[9,6,"crystal"],[12,7,"hedge"]],
    "startingGold": 360,
    "waves": 10
  },
  {
    "id": 11,
    "name": "Aurora Steps",
    "biome": "frost",
    "routes": [[[0,8],[3,8],[3,2],[7,2],[7,8],[11,8],[11,4],[14,4]]],
    "pads": [[2,7],[2,4],[4,3],[4,6],[5,1],[6,4],[8,3],[8,6],[9,9],[10,5],[12,5],[13,3],[6,7]],
    "blockers": [[4,3,"stump"],[4,6,"crystal"],[6,4,"stump"],[8,6,"crystal"],[10,5,"hedge"],[13,3,"stump"]],
    "startingGold": 360,
    "waves": 11
  },
  {
    "id": 12,
    "name": "Last Harvest",
    "biome": "frost",
    "routes": [[[0,2],[4,2],[4,5],[7,5],[7,8],[12,8],[12,5],[14,5]],[[0,8],[2,8],[2,5],[4,5],[7,5],[7,8],[12,8],[12,5],[14,5]],[[14,2],[12,2],[12,5],[14,5]]],
    "pads": [[2,1],[3,3],[5,3],[3,6],[1,7],[5,6],[6,7],[8,6],[9,9],[11,7],[13,7],[11,4],[13,3],[9,4],[6,4]],
    "blockers": [[5,3,"stump"],[3,6,"stump"],[5,6,"crystal"],[8,6,"crystal"],[11,7,"stump"],[11,4,"crystal"],[9,4,"hedge"]],
    "startingGold": 360,
    "waves": 12,
    "boss": "frost"
  }
]
```

### Why these pads and blockers exist

1. **First Sprout:** two starting pads cover the first bend. The hedge at `[4,2]` offers a cheap first clearing action. Clearing `[9,4]` creates a second line of defense. Do not force the introductory blocker target while a leak is imminent.
2. **Dewdrop Bend:** placing everything near the entrance leaves the final bend weak against dashers. The inner stumps reward preparing a central slow/damage combination; pond-center scenery is not buildable.
3. **Orchard Switchbacks:** inner pads can cover two adjacent lanes. Opening them costs firing time, while exposed outer pads are cheaper to access but cover one lane. Announce the first swarm before it spawns.
4. **Hollow Oak:** a long outer opening lets the player attack the boss several times before the protected carrot. Central clearings enable repeated coverage; the expensive shell should not merely demand one huge DPS tower.
5. **Lantern Causeway:** alternating causeways naturally divide single-target and area coverage. Bright lanterns are decorative/navigation here; no unannounced darkness immunity. The first flying group is telegraphed when suitable towers are affordable.
6. **Twin Reeds:** both entrances are visible. Waves initially alternate, then synchronize. A central crystal holds a valuable merged-lane pad; clearing it is an investment, not an obligatory tax before the first wave.
7. **Firefly Weave:** tall repeated lanes make chain/splash coverage attractive, but widely spaced support enemies frustrate one-tower solutions. Fireflies stay above the play plane and never resemble projectiles.
8. **Moonwell:** two entrances feed a clear shared fight zone. The marsh boss appears only from the top entrance. Extra final pads preserve damage coverage when its mist protects allies and its finite summons increase local density.
9. **Crystal Descent:** exposed ridge pads have long lines of sight. The inner shelf catches crystal enemies accelerating after their shields break. Crystals occupy strategic positions, not every open tile.
10. **Split Summit:** opposing entrances make front-loading all defenses on one side unsafe. The central saddle remains readable; both routes merge rather than cross ambiguously.
11. **Aurora Steps:** burrowers emerge before the next corner, providing a readable chance to react. Place damage across two runs; one expensive entrance nest should not trivialize the board.
12. **Last Harvest:** the short third entrance stays sealed until wave 6 and receives a 6-second reveal cue; its first group is deliberately small. The boss always takes the long first route. The third entrance does not spawn a boss directly beside the carrot.

## Combat and economy authority

The companion [combat specification](../design/combat-spec.md) is authoritative for all tower costs, damage, ranges, tier models, status durations, enemy HP/speed/rewards, obstacle HP/rewards, starting coins, boss abilities, progress calculation, and win/loss rules. Do not implement the following map designs using alternate guessed stat tables. Map-specific difficulty changes must be authored and documented after playtesting, not silently applied.

Its shared role IDs are `seed`, `frost`, `mortar`, `prism`, `storm`, `blossom`; enemy IDs are `nibble`, `dash`, `shell`, `swarm`, `moth`, `shaman`, `burrow`, `crystal`; finale boss IDs are `garden`, `marsh`, `frost`. Boss names are Brambleback, Lantern Regent, and Crown of Winter. Their casts must change real combat state, following that document's timers, telegraphs, phases and finite summon caps.

Tower unlocks: Seed + Frost at 1, Mortar at 2, Prism at 3, Storm at 5, Blossom at 6. Four total physical tiers each: base plus three upgrades, with a different generated portrait/model form and readable attack effect per tier. Later towers remain inspectable but cannot be purchased before unlock. No level demands a locked counter.

Campaign wave counts now match the combat specification: Garden 5 / 6 / 7 / 8; Marsh 8 / 9 / 9 / 10; Frost 10 / 10 / 11 / 12. Starting coins also match: 240 Garden / 300 Marsh / 360 Frost. This is the single agreed preproduction schedule; numeric tuning still needs actual playtests.

## Wave pacing and authored introductions

Prepare freely before first wave; a deliberate start action begins the run. Further waves arrive automatically after a visible countdown; tapping the next-wave control may accelerate but is optional. Pause must stop enemies, projectiles, cooldowns, boss phase timers, VFX simulation, and elapsed run time consistently.

Within a normal wave, use 2–4 packets separated by 2.5–5 s, not an unbroken stream. Use roughly 22–30 s between early wave starts and 27–35 s late; final cleanup and boss phases extend the stage. Do not add idle waiting to reach a duration target. Finish only after all scheduled enemies, boss summons, and living enemies are resolved. Never infer victory from the last spawn alone.

| Level | Opening / teaching waves | Middle variation | Closing test |
|---|---|---|---|
| 1 | W1–2: nibble groups of 4/5 with generous gaps | W3: nibbles and two clearly announced dashers | W4–5: mixed nibbles/dashers, max 8 active; no new rule in final wave |
| 2 | W1–2: lone fast runner paired with slow nibbles; introduce Mortar | W3–4: alternating fast packets and close nibbles | W5–6: groups reach the late bend while a new entrance group appears |
| 3 | W1–2: one swarm group, then a recovery packet; Prism unlock is optional precision | W3–5: swarm/nibble alternation; encourage the Mortar already unlocked at 2 | W6–7: two swarms separated by durable nibbles |
| 4 | W1–2: shell introduction with visible armor | W3–6: armored front, fast tail, then a low-pressure clearing interval | W7: familiar compact test; W8: Brambleback with a finite escort |
| 5 | W1–2: two moths alone; flight preview and Storm introduction | W3–5: ground groups followed by air groups | W6–8: mixed air/ground, without excessive concurrent targets |
| 6 | W1–3: entrances alternate with six-second notice; Blossom available | W4–6: double entrance staggered by four seconds | W7–9: synchronized waves with deliberately different lane strengths |
| 7 | W1–2: one shaman with two nibbles | W3–6: separated shamans and dense swarms | W7–9: healer behind shell groups, then moths exploiting poor coverage |
| 8 | W1–3: reinforce focus-fire and broad coverage | W4–7: alternating entrances and a recovery interval | W8–9: final mixed test; W10: Lantern Regent plus sparse support; no healer heals a boss |
| 9 | W1–2: one crystal enemy; show shield break and speed change | W3–7: crystal/shell alternation invites precision and control | W8–10: shield groups with short fast tails |
| 10 | W1–3: opposing entrances alternate clearly | W4–7: one armored lane, one fast lane | W8–10: mixed synchronized attacks; left/right strength swaps once |
| 11 | W1–2: burrower alone; emerge well before carrot | W3–7: burrowers within ordinary packets, not all evasive simultaneously | W8–11: shaman + burrower + moth layering, no new rules |
| 12 | W1–5: two known entrances, modest HP increase | W6: third entrance unlock with 6-second warning; W7–9 combine roster | W10–11: mixed roster test; W12: Crown of Winter on long route, finite summons, last wave clearly labeled |

Use the combat specification’s explicit per-level HP multipliers; never silently scale against player skill. A new mechanic’s first wave reduces other pressures rather than introducing a counter on the largest swarm. Bosses use the specification’s fixed HP and phase scripts without normal-enemy multipliers.

## Progress, results, and carrot reactions

Use the authoritative progress formula and acceptance cases in the [combat specification](../design/combat-spec.md#progress-and-outcome-truth). Keep a visible **level progress bar**, `wave / total`, ordinary enemy health bars, and a separate persistent boss HP/shield bar. A dispatched final wave is not victory: living enemies, finite pending summons, and unresolved carrot-contact animations must all resolve. Loss wins any same-frame tie with the final enemy.

The visible carrot-contact choreography is a design requirement: offender approaches, winds up, makes a readable bite/contact, carrot visibly flinches with leaf recoil, then recovers as the offender exits. Apply damage once at contact. Do not remove an enemy before the player can see its attack. Use original generated healthy/worried/hurt/recover/victory/defeat expressions and small non-gory orange flecks or cosmetic bite notches. Ordinary/boss health loss is defined in the combat specification, not by animation length.

Victory choreography: carrot bounces and its leaves spin; surviving towers bloom; a short petal spiral and musical cadence resolve the battle. Show the result after about 1.4 seconds, with Next and Replay. Defeat: carrot slumps and leaves wilt, music softens, immediate free retry. No long unskippable sequence. Persistent medals and unlock rules follow the combat specification; later imperfect replays must not erase prior achievements.

## Required art/animation coverage before implementation

- Twelve map compositions and path overlay plans; three material/palette boards, including wetness/reflection/night readability.
- Six tower families × four tiers = 24 distinct model concept sheets; each tier front/side/three-quarter view, active/idle/fire anticipation/fire release/recovery key poses, purchase portrait, upgrade portrait.
- Eight normal enemy turnarounds and locomotion/contact sheets; hurt/death/counter-state variations. Swarm bodies may share one asset within the swarm family, not across all monster families.
- Three boss turnarounds; locomotion, intro, each listed cast, phase change, hurt, death, and bite keyframes.
- Carrot expressions and healthy/worn/hurt/bite/recover/victory/defeat poses; consistent proportions between sheets.
- VFX references for all six weapons, blocker break types, five status effects (slow, burn, armor, freeze, shield), three boss casts, phase bursts, carrot bite, coins, and victory. Every effect includes anticipation, contact, expansion, and dissipation frames rather than one static flash.
- Music: one coherent theme with three biome orchestrations, three boss layers, victory/defeat stingers. Sound: tower identities, material impacts, creature footsteps/voices, carrot bite/flinch, water/frost/leaf foley. Mix must duck sustained battle ambience under clear important warnings; avoid identical clicks for every event.

## Validation gates after building

1. Geometry check: every pad off every route; blocker coordinate appears in pads; route endpoints agree; no accidental non-merge crossing; adequate safe opening pads; no unannounced short route to carrot.
2. Economy check: each level can win from its authored starting gold without perfect tapping or premium items; each new enemy has an available and affordable counter. Run deterministic authored-strategy checks and human playtests; these numbers are not considered balanced until then.
3. Progress and result checks: leaked last enemy, last boss summon, boss threshold crossed by burst damage, simultaneous carrot hits, pause during cast, retry during VFX, losing at the last wave, last enemy killed by delayed burn.
4. Touch check: illustrated buy menu stays within safe screen bounds; target minimum 44–48 px; tapping a monster shows/focuses it rather than buying underneath; dragging/canceling buys nothing.
5. Visual check: actual model change at every tier; all normal HP bars and persistent boss health are accurate; projectiles never hit an already removed target; carrot bite contact remains visible on mobile; action remains readable with worst-case towers + boss + swarm active.
6. Scope honesty: a screenshot/animation reference is not a finished 3D animated asset. Do not call the art pack complete until each required family/state has the production reference needed by the Unity implementation.
