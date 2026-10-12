# Carrot Defense validation

Gameplay validation was recorded against source commit `dd42d93`. **Final Unity artifact hash: `f39491b6e2c93972`.** This artifact adds the measured imported-color correction, winter surfacing and night-path changes; it was loaded and inspected in the browser, with the loader's version verified from the DOM. These checks establish the specific observations below, not film-grade visual fidelity.

## Automated evidence

- Production build, TypeScript, lint and campaign-progression checks passed at `dd42d93`.
- Unity WebGL and website production builds passed again after the final rendering corrections.
- Unity's `CarrotTD.CarrotSimulationTests.Run` passed **39,845 assertions**, including all ten tower powers, map geometry, purchases/upgrades/refunds, boss abilities, contact/outcome rules and event contracts. Evidence: `output/carrot-unity-test.log`.
- Two policies completed all 12 levels: **24 victories using ordinary starting funds and earned coins**. Four deliberately poor-coverage controls lost. See [balance results](balance-results.md) and [retained simulation output](simulation-results.txt). The assertion total includes repeated checks during simulation; it is not a count of unique test scenarios.

## Browser observations

The root integration review verified:

| Scenario | Observed result |
|---|---|
| Level 1 completion | Victory with 10 HP, 100% progress, medals and saved unlock of level 2. |
| Level 2 upgrade/sell | Seed advanced through tiers I–IV with upgrade payments of 65, 120 and 200 coins; selling returned 325 coins. |
| Defeat and recovery | Loss at 0 HP; retry and the level picker worked. |
| Phone-sized viewport | Layout and purchasing checked at 390 × 844. Selecting Frost, then a new pad, correctly reset the menu and range preview to Seed. |
| Display and sound controls | Full-screen entry/exit and mute/enable toggles worked. |
| Level 4 boss encounter | All eight waves played; Brambleback appeared with 1,800 HP, reached phase 3 and was defeated; the level ended in victory with 9 HP. |
| Final model-color correction | On `f39491b6e2c93972`, brown creatures and dark spider limbs rendered with distinct colors; the earlier bleached palette was corrected. |
| Final frost landscape | On the same artifact, pale snow and blue packed paths replaced the dark repeating terrain; winter scatter no longer used summer ferns. |

No console errors were observed on the stable browser tab during these checks. These observations apply to the inspected build and sessions, not every device or playthrough.

Actual Unity/WebGL captures: [garden combat](screenshots/garden-runtime.png), [frost landscape](screenshots/frost-runtime.png). These are runtime captures, not generated concept artwork.

## Still unverified

- Performance and multitouch on a physical phone.
- Listening review of every boss's music, voice and sound effects; working mute controls do not establish audio quality.
- Film-grade fidelity. No such quality claim is supported by the completed checks.

The full garden boss playthrough preceded the final color-only shader correction and biome material changes. It was not repeated in full after those rendering changes; gameplay simulation source remained unchanged.
