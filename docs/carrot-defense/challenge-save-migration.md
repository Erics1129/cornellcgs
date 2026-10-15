# Challenge save format 3

Asuna adds the fifth boss to the challenge record. Pre-Asuna version-2 clients recognize Tornado, Zombie, Eyeball and Portal; their cleaner drops unknown bosses. Format 3 activates those clients' existing newer-format sync freeze, protecting Asuna records after an older client receives them.

The game page and account merger emit `{ version: 3, best: ... }`. Both accept versions 1, 2 and 3, retaining valid wins for all five guardians. Per boss, merging keeps the highest health and fastest time, with the tower count from the faster run. Ties keep the left record's tower count. Asuna is level 29 and is always unlocked, independently of campaign and earlier challenge progress. Portal's Eyeball gate remains unchanged.

The localStorage key stays `cgs-carrot-challenges-v1` and account record ID stays `carrot:challenges`. Reads remain side-effect free; an award persists format 3, and account sync uploads a normalized record when its readable cloud copy differs. Campaign and Super remain format 1.

Old clients pass the higher-format record through untouched. Their strict reader rejects it, so sync restores the readable local copy, freezes uploads for this record and asks for a refresh. Current clients similarly reject formats above 3. The backend remains timestamp-based: this is not a server-side guarantee against an already in-flight stale request.

## Regression evidence

The frozen `scripts/fixtures/carrot-challenges-v1.mjs` reproduces the old Portal-loss behavior. `scripts/fixtures/carrot-challenges-v2.mjs` preserves the production merger from commit `7522e5638`, with only TypeScript annotations removed and its cleaner exported. Tests execute both older implementations and verify preservation of higher-format records.

Current tests cover v1/v2 migrations, mixed-device unions, all older wins, Asuna unlock and awards, Portal's existing gate, corrupt/blocked storage and future-format freezing. Both account and page mergers are exercised. The pre-existing sync harness also covers early/late page registration, cloud-only adoption, repeated pulls, zero uploads after freezing, and independent campaign/Super progress.

## Records format 1 (giant update)

The giant update adds no field to the campaign, Super or challenge records. Its new progression data lives in a separate synced record,
`carrot:records` under the localStorage key `cgs-carrot-records-v1`:

```
{ version: 1,
  levels: { '1'..'29': { grade: 0-5, bestStreak, bestSeconds, vgrade } },
  seen: { abilities: string[], creatures: string[] },
  tutorial: boolean }
```

Grades run 0 (none), then D, C, B, A, S. `bestStreak` is the longest defense chain and `bestSeconds` the fastest win (0 means none). `vgrade` is the
grade in Veteran mode, and challenge levels 25-29 have entries too. Merging takes the maximum of every numeric field and the fastest positive
time. `seen` is a sorted union capped at 128 ids per list, and `tutorial` is an OR. A record with a version above 1 passes through untouched, and the current
reader rejects it, so the sync freeze protects it from older rules. The page owns the original rules in `src/minigames/carrot/progress.ts`; a
verbatim copy sits in `src/lib/account/merges.ts`, with `KNOWN_KEYS` and `MERGES` entries.

An old save loads unchanged: a device with only the three earlier records simply has no records entry yet. Its first finished run or
first-encounter card writes one.

### Regression evidence

`scripts/fixtures/carrot-saves-golden.json` holds the outputs of the campaign, Super and challenge code paths at 48d1336: reads of corrupt,
odd and future records, award sequences, and both merge directions. `scripts/fixtures/carrot-saves-cases.mjs` regenerates the outputs from
any source tree, and `test-carrot-progress` asserts that the current code reproduces the golden file byte for byte. The same test runs the
records merge over 200 random triples for commutativity, associativity and idempotence, checks the 8 KB budget for a full 29-level record,
and confirms that the copy in `merges.ts` matches the page's.
