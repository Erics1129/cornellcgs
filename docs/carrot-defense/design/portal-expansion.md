# Portal expansion contract

Base: origin/main `ab5e4a7`, containing Claude's 24 campaign maps, four biome bosses, three challenge bosses, Super forms/merging, current effects, quality pipeline and account saves. Preserve these features and assets. Additive expansion; no replacement with the earlier Codex prototype.

## Content identifiers

Ten new tower families, each with four purchased tiers plus a distinct merged Super form:

| ID | Name | Signature |
| --- | --- | --- |
| bamboo | Bamboo Lancer | Piercing spear volley through a line of enemies. |
| chili | Inferno Pepper | A fire trail and short damage vulnerability. |
| lotus | Sanctuary Lotus | Cleanses nearby disabled/stunned towers with a bounded cooldown; water pulse damage. |
| magnet | Magnet Clover | Armor-shredding magnetic chain pulses. |
| orchid | Venom Orchid | Stacking capped poison with a lingering spore cloud. |
| mushroom | Dreamcap | Sleep/slow pulse and a damage burst when control expires. |
| cactus | Thorn Cactus | Ricocheting thorns and bleed. |
| clockflower | Clockwork Bloom | Local attack cadence aura plus an enemy slow; aura bonuses do not multiply without a cap. |
| dragonfruit | Dragonfruit | Meteor clusters with clearly warned impact and splash. |
| moonflower | Eclipse Lily | Lunar beam, shield pressure and extra damage against clones. |

Fifteen new minibosses, all with distinct silhouette, warning, visible HP, named ability and regular-campaign appearances:

| ID | Name | Signature |
| --- | --- | --- |
| warDrummer | War Drummer | Death rally speeds nearby living enemies briefly. |
| frostHerald | Frost Herald | Telegraphs a short field-wide attack freeze. |
| witherPriest | Wither Priest | Temporary field-wide tower-damage reduction. |
| stormWarden | Storm Warden | Lightning disables a few nearby towers briefly. |
| graveCaller | Grave Caller | Summons tiny zombies. |
| mirrorKnight | Mirror Knight | Bounded lower-health decoys. |
| riftStalker | Rift Stalker | Short forward blink on its route. |
| mossGolem | Moss Golem | Shields nearby enemies. |
| emberBoar | Ember Boar | Charge and localized tower-cadence penalty. |
| venomQueen | Venom Queen | Poison mist reduces nearby tower output. |
| ironSnail | Iron Snail | Heavy shell alternates with a vulnerable window. |
| lanternLeech | Lantern Leech | Bounded coin theft, refunded on defeat. |
| chronoMoth | Chrono Moth | Local cadence distortion. |
| thornBeast | Thorn Beast | Temporary thorns around a few towers. |
| portalSentinel | Portal Sentinel | Portal's signature miniboss: blink, phase shield and riftling support. Also appears late in the campaign. |

Twelve added regular enemy IDs: `mite`, `beetle`, `slug`, `wisp`, `bat`, `scarab`, `firefly`, `sporeling`, `tinyZombie`, `riftling`, `shardling`, `mimic`. Give them differentiated speed/armor/shield/healing/flight/death mechanics and silhouettes. Spread introductions across all 24 existing maps; retain the original eight enemies.

## Boss changes

- Tornado keeps its current kit and summons a deterministic random miniboss while moving, with a cooldown and active-summon cap.
- Zombie keeps its current kit, summons tiny zombies and temporarily rallies enemies.
- Eyeball keeps its current kit, makes lower-health clones, has staged lower-health reincarnations, and gains abilities by stage. Brief full-black battlefield blindness is warned in advance. Pause and essential controls remain usable; blackouts cannot chain into permanent blindness.
- Portal is challenge level 28, title `BossFight - Portal`, difficulty `????`, on a new multi-route arena. Separate challenge records; campaign remains 24 levels. It is the hardest encounter, with explicit telegraphs and recovery windows.
- Portal blinks forward on its own route by a small bounded distance, clamped before the final approach. It may relocate other enemies a similarly bounded distance forward; never directly to the carrot or to an invalid/off-route point. It also casts lightning tower stuns and summons Portal Sentinels.
- Each boss kind has its own music file/theme. Existing effects and music assets are retained.

## Balance and presentation contract

Start from a roughly 15–20% global movement reduction and 15–25% tier-I/II damage reduction, increasing to roughly 30–40% for upgraded/Super damage. These are starting points for measured tuning, not promises of final percentages. Existing abilities remain; do not silently compensate by restoring their old damage through hidden multipliers. Normal campaign should be harder but winnable with several sensible mixed strategies. Challenges should require stronger placement and ability counters; Portal is optional endgame.

Preserve existing `shot`, `impact`, `telegraph`, `ability`, `death`, `bossEnter` event semantics. New handlers must be additive. Use stable IDs above. Presentation owner and simulation owner coordinate exact ability event names and fields directly. Minibosses must not be treated as encounter bosses in progression/music accounting; expose miniboss information in snapshots for visible HP/ability UI. All summons/clones need bounded life/count and correct wave completion. Base behavior, saves, merge/undo, pause, retry and account syncing must continue to work.

Verify actual Unity imports, visible models, effects and browser gameplay. Generated illustrations are portraits/reference art, not substitutes for playable geometry. Keep audio concurrency caps and performance budgets.
