# Challenge save format 2

Portal adds a fourth boss to the challenge record. Pre-Portal clients only recognize `tornado`, `zombie`, and `eyeball`: their version-1 cleaner deletes an unknown `portal` entry before merging. Keeping the new record at version 1 would allow an older open page to upload that stripped copy over the cloud save.

The current page and account merger therefore emit `{ version: 2, best: ... }`. Both read versions 1 and 2, retaining valid wins for all four bosses. Merging still takes each boss's highest health and fastest time, with the tower count from the faster run. A tie keeps the left record's tower count. Version-1 local or cloud records migrate through the same rules; Portal records from a version-1 preview also survive.

The localStorage key stays `cgs-carrot-challenges-v1` and the account record ID stays `carrot:challenges`. Changing either would split existing progress. Reading local storage remains side-effect free; the next award writes format 2, and account sync uploads the normalized format when the cloud copy differs. Campaign and Super records remain format 1.

Old clients already pass a higher-format record through untouched. Their strict game reader cannot read format 2, so the existing sync engine restores their readable local copy, freezes uploads for this record, and asks for a refresh. The new reader likewise rejects formats above 2; those records pass through the merger unchanged and activate the same protection. This protects a newer record after an older client receives it; the backend remains timestamp-based, so this is not a server-side guarantee against an already in-flight stale request.

## Regression evidence

`scripts/fixtures/carrot-challenges-v1.mjs` preserves the relevant implementation from commit `ab5e4a7`, with only TypeScript annotations removed and the cleaner exported for testing. Tests execute it to reproduce the version-1 Portal loss, then verify that it preserves the migrated version-2 record. The sync harness confirms zero uploads after the old reader freezes, with and without existing local wins, including later touches and repeated pulls.

Current-client tests cover local and cloud migration, mixed version-1/version-2 unions, late page registration, all legacy wins, Portal unlock and awards, blocked/corrupt storage, and a future version-3 freeze. The affected challenge, account-sync, and campaign/Super progression suites pass; TypeScript checks also pass.
