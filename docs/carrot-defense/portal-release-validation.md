# Portal expansion release validation

Reviewed against `ab5e4a7` (Claude's current campaign, bosses, Supers and site/account work). Original maps, plants, models and effects remain; no tracked source or asset is deleted.

## Shipped scope

- Ten added plant families, each with four purchased tiers and a merged Super: 50 new modeled forms; 20 families total.
- Fifteen minibosses and twelve regular creatures, with individual rigs, portraits, sounds and abilities. New creatures appear through the 24-map campaign as well as challenges.
- Eight boss kits, including the new Portal observatory with three routes, bounded forward blinks, ally relocation, lightning stuns and Portal Sentinels. The existing Tornado, Zombie and Eyeball gain additional attacks. Eyeball has three lives, clones and warned complete battlefield blindness.
- Separate themes for all eight bosses; quiet, capped combat/creature voices and interface cues. Portraits and tier sheets use generated artwork; playable objects are Unity geometry with materials and animation.
- Borderless glass HUD and selection surfaces; sharp gradient progress, health, miniboss and shield bars. Eight boss palettes, retained phase ticks, 140ms interruptible fill transitions and reduced-motion support.

## Verification

- Actual Unity simulation: **213,867 assertions**, including 56 earned-coin victories over 28 maps, 12 no-merge boss-map wins, 10 poor-coverage losses and deterministic replays. See [balance results](portal-balance-results.md); assertion count includes repeated invariants, not that many distinct scenarios.
- Unity model import and animation audits: 50 tower forms, 27 creature rigs with five clips each, and Portal geometry. Measured anchors fix new skinned-model health bars; normalized static pivots fix the bamboo's formerly detached moving parts. See [model evidence](portal-model-integration-results.txt).
- Browser interaction with the actual optimized QA Unity player: Portal entry/summons/telegraphs and damage, Sentinel health labels, Eye lives 1→2→3, visible smaller clones, warned full blackout with working pause/resume, Tornado miniboss cast, Zombie march, and distinct music loads.
- Desktop 1440×900 and phone-sized 390×844: HUD, boss/miniboss bars, all 20 generated plant choices, actual Clockwork Bloom purchase and tier detail. Earlier actual Bamboo purchases/upgrades I→IV also passed. New tier-IV models were inspected together during combat. CSS checks in Chromium/WebKit cover all eight palettes, fill percentages, shield override, phase ticks and reduced motion.
- Full website regression suite and account sync/backend checks passed. Challenge/account/progression checks, TypeScript and lint passed again after the final save migration. Exported game data matches all 28 Unity maps. The final production build also passed, loaded its release Unity player, started an ordinary campaign wave and rendered the HUD without the review drawer or runtime errors.
- Review commands are excluded from the release simulation; the visible review drawer is development-only. Both local QA and preview modes suppress progression writes. Challenge format 2 migrates legacy wins and activates the old-client upload freeze; the regression executes the actual previous merger to reproduce and prevent Portal loss. See [save migration](challenge-save-migration.md).

## Limits and follow-up

The art direction is textured storybook 3D, not photoreal human/creature anatomy. Browser checks used a desktop machine and a phone-sized viewport; physical-phone thermal/performance testing remains outstanding. Automated balance runs establish legal winning strategies and punish poor coverage, but cannot establish every human's difficulty or that Portal is harder than all other levels combined. Portal is tuned as an optional endgame time-pressure encounter.

Unity emits a brief pending-audio-length message while its WebGL decoder prepares preloaded clips. Recorded playback and boss music subsequently work; gameplay reported no runtime errors. Playback guards skip cues whose audio is not ready, and new voices/effects retain concurrency and gain limits. A pre-existing Unity persistent-data synchronization deprecation is also present.
