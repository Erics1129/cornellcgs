# Carrot Defense 3D: duo boss fights and two-player endless

The integration record for the four streams (branch `carrot-duo`). The parts are described in their own files:

| File | What it covers |
| --- | --- |
| [sim.md](sim.md) | C# rules: duo halves, held win, net seam, two-player endless (Twin Gates, id 90), state export, gates, bands, determinism |
| [view.md](view.md) | Unity view: mirrored halves and the wall, the partner's half as a spectator, camera modes and drag, Twin Gates art |
| [netcode.md](netcode.md) | Web net layer and the `cgs-rooms` Worker: rooms, WebRTC with relay fallback, duo replica, lockstep, reconnect, desync |
| [ui.md](ui.md) | React: entry pill, lobby, side reveal, duo and endless HUD, results, endless record, page hooks |
| `bridge-golden.jsonl` | Every C# bridge message in both directions (`carrot-sim --method NetBridgeGolden`), parsed by `test-carrot-net.mjs` |

## What a player gets

- **Duo boss fights** (the six guardians 4, 8, 12, 16, 20, 24 and the five Challenges 25-29). A room code pairs two players.
  The host's room draws the sides at random. Each player defends one half of a mirrored double map, and each half has its own
  routes, pads, carrot and a full copy of the waves and the boss, so the match fields twice the creatures and two bosses.
  - Each device runs its own half and a read-only replica of the partner's. Nothing crosses the wall.
  - A player can drag or switch the camera (My side / Both / Watch partner) to watch the partner, but a tap on the partner's
    half only shows "That's Ana's side".
  - The match is won when both halves clear every wave and their boss, and lost the moment either carrot falls.
  - A duo win records the solo win for that level on both players' devices.
- **Two-player endless** on Twin Gates: a new map with two gates and wings that meet in a shared boulevard to one carrot.
  - Both players build, upgrade, merge and sell anywhere, from one shared purse (700 to start).
  - Waves never stop. Mob mixes, minibosses and bosses are drawn from the roster by the room's seed, and the difficulty curve
    rises every wave.
  - The score is the number of waves survived. The best is kept on each device (`cgs-carrot-endless2p-v1`).

## Integration fixes

The first run of the real Unity player against the net layer found the following mismatches between the C# bridge and the
web layer; they are now aligned (see netcode.md §10). The positive and negative controls are in the test lists below.

1. **Deep hashes never travelled.** Unity sends them as `dh`/`rdh`, but the web layer read `dd`/`rdd`. The bridge now maps
   them, and the golden test fails if any Unity field is dropped.
2. **Own ops could apply twice after a resync.** A DuoOwn op applies when it is issued but is stamped NetTick + 1, so a state
   exported at T can already hold it. The export now reports `seq` and the replica drops its queued copies.
   `carrot-sim --method ExportSeqImport` passes, and its negative control (no seq) shows the double apply.
3. **A rejoin replay was broken in two ways.**
   - Unity's `replay` reloads the level, but the rejoiner sent it in chunks, so each chunk lost the ops of the one before.
     It now sends one replay with the whole log and shows Unity's own `progress`.
   - An import's acknowledgement (`replayed` + `import`) could resolve the pending replay early. It is now `imported`, and
     waiters are matched by target.
4. **Endless never started.** Unity ignores a page `start` command in net modes, so it is now `{t:'go'}`, and Unity's seat 0
   issues the one start intent.
5. **A reload rejoining a running match sent its messages before Unity existed.** `useDuo` now queues them until the player
   is ready.
6. **A rematch on another fight kept the old host view.** `CarrotNet` now reconfigures the host view on every new session.
7. **Smaller fixes:**
   - Lockstep reads the boss-windup hold from `tick.rate`.
   - `result.cause`, `desync.kind`/`where` and Unity `error` are parsed and handled.
   - The endless reveal names the seat's home gate, which is the one the camera frames.
   - The endless purse split uses Unity's `net.spent`.
   - The sim's `DuoReplica`/`HeldWinTransitions` harness counted the factory's level-1 snapshot as a replica snapshot, so it
     failed on the stream's own HEAD.

## How to run it

Node 24 (`export PATH="$HOME/.local/node/bin:$PATH"`). The Playwright node is the Codex runtime's
(`/Users/eric/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`). Wrangler 4 is not a site
dependency: any install works, for example `npx wrangler@4`, or the one at
`scratchpad/carrot-duo/netcode/rooms-ref/node_modules/.bin/wrangler`.

```sh
npm test                 # every Node suite, including the net layer, sessions, rooms Worker and duo UI
npm run carrot:test      # C# compile check, sim, waves, UI unit, net, session, duo UI, and Unity's CarrotSimulationTests.Run
npx tsc --noEmit && npm run lint
node scripts/carrot-sim.mjs --method DuoReplica          # also DuoMirrorExact, SelectionFreeEquivalence, LockstepPeers,
                                                         # HeldWinTransitions, StateCopy, ExportSeqImport, ...
```

Two players by hand (two browsers on one machine, or two devices on one LAN):

```sh
npx wrangler@4 dev --config backend/rooms/wrangler.jsonc --env dev --local --port 8795 --ip 127.0.0.1
VITE_ROOMS_URL=http://127.0.0.1:8795 npx vite build --outDir /tmp/cgs-duo     # the release Unity player is in public/unity/carrot
npx vite preview --outDir /tmp/cgs-duo --port 4890 --strictPort --host 127.0.0.1
# open http://127.0.0.1:4890/minigames/carrotDefense/ in Chrome and in Safari: "Play with a friend" -> Create room / Join
```

In development: `npm run dev`, then `/minigames/carrotDefense/?carrot-rooms=http://127.0.0.1:8795`. The mock session without
a Worker is `?carrot-duo-mock`. Boss fights are offered when both players have unlocked them; the Giant Tornado (25) is
always open.

The automated two-browser run (it drives the real player with an in-page bot, reads every bridge message and snapshot, and
can put 100 ms / 30 ms / 2% on the DataChannel through UDP proxies):

```sh
BASE=http://127.0.0.1:4890 <playwright node> scripts/carrot-duo-e2e/run.mjs \
  solo win winCrWk lossA lossB lossPhones endless reconnect blur latency latencyCr latencyEndless latencyEndlessCr --out DIR
```

## Results (2026-10-17, release player with the licensed assets, local workerd relay)

All on the owner's M5 Max. The browsers were Chromium 151 and WebKit 26.5 (headless, Playwright). The rooms Worker ran on
workerd through `wrangler dev --local`, because the deploy is waiting on `wrangler login` (see Deploy below).

| Scenario | Browsers and sizes | Result |
| --- | --- | --- |
| Pairing | all runs | Five-letter code; the guest joins by typing it; the lobby shows both seats, ready, loaded and "Direct · 33 ms". The sides were drawn at random (seat 0 got the east half in one run and the west in another) and were always opposite, with the same level and seed. |
| Duo win, L4 | Chromium + Chromium 1440x900; Chromium + WebKit | Both halves won (8/8 waves, both Bramblebacks killed). The card says "Win recorded for both players", and L4's medal was written to both devices' campaign saves. 502-504 + 502-504 replica digests and 58 + 58 deep hashes compared: 0 mismatches, 0 desyncs, 0 bridge errors. |
| The wall | same | 6 taps on the partner's half while watching it: 6 `partnerTap`, no op, no selection, the tower count unchanged. "Both" frames the two halves with the wall between them, and a drag pans across. |
| Duo loss | A's carrot (Chromium + WebKit desktop); B's carrot (Chromium 390x844 phone + WebKit 844x390); A's carrot (WebKit 844x390 + Chromium 390x844) | Both lost on wave 1. The idle half's result is `cause: self` and the builder's `cause: partner` with 10 hearts left; both cards name whose carrot fell; no medal was recorded. 91-92 + 92 digests: 0 mismatches before the end tick. |
| Endless | Chromium + WebKit, twice (two seeds) | Seed 3724155359: 13 waves survived (died on 14); bosses Giant Tornado at wave 10 and Lantern Regent planned for 20; minibosses at 5 (frostHerald) and 10 (graveCaller); 950 digests + 108 deep, 0 mismatches. Seed 3583241136: 13 waves; Brambleback at 10, then frost planned for 20; miniboss warDrummer at 5; 864 + 100 deep, 0 mismatches. The strongest creature's HP rose from 25 on wave 1 to 510-534 on wave 14. Both devices saved the record (13) and the results card showed each seat's spend. Shared editing: B upgraded a tower A built (tier 2 -> 3, seen on both), and A sold one B built (6 -> 5 towers on both). |
| Reconnect | Chromium + Chromium | B's tab closed on wave 2. A paused with "Bo stepped away 0:55". B reopened the room link, reloaded the player, replayed its half and was back in its seat 11.8 s after the close (5 s of that is the harness waiting), with the same 3 towers. Afterwards 25 + 92 digests compared: 0 mismatches, 0 desyncs. |
| Window blur | Chromium + WebKit | After a blur, both halves ran on (121 ticks in 4 s). Only a hidden tab pauses a match. |
| Single player | Chromium | An old-format save loaded. L1 played to a win, and the save advanced to unlocked 2 with its medal and grade. The stock results card showed. The production build without `VITE_ROOMS_URL` hides multiplayer entirely. |

Latency at 100 ms RTT, ±30 ms jitter and 2% loss (both directions of the DataChannel; the room socket was not impaired):

| | Duo, Chromium + WebKit | Duo, Chromium + Chromium | Endless, Chromium + WebKit | Endless, Chromium + Chromium |
| --- | --- | --- | --- | --- |
| Own action, to the next snapshot | p50 1 ms, p90 1-3 ms | p50 1 ms, p90 2 ms | ghost sprout p90 2 ms; tower p50 240, p90 281 ms | ghost p90 2 ms; tower p50 264, p90 297 ms |
| Partner's action, on this screen | p50 191-192, p90 214-216 ms | p50 198, p90 213 ms | p50 257, p90 302 ms | p50 247, p90 295 ms |
| Replica / lockstep pacing | 29.96-29.97 ticks/s; the replica stays 5-6 ticks behind | 29.99 ticks/s; a replica tick every 33 ms (p99 49, max 100 ms) | tick release p50 8 ms (Chromium) | tick release p50 8 ms, p99 10 ms |
| Desync hashes | 33-34 + 33-34, 0 mismatches | 33 + 33, 0 mismatches | 46 + 5 deep, 0 | 46 + 5 deep, 0 |

- **Duo:** the own half has zero input lag. The partner's view lags by the link plus the replica's three-tick buffer.
- **Endless:** lockstep's adaptive input delay is about 7-8 ticks at this link. A pending ghost sprout shows the own build at
  once.
- **WebKit frame rate:** headless WebKit drew the duo frame at 16-29 fps (frame p50 34-60 ms) on this machine, which is a
  software-rendering limit of headless WebKit. The replica's tick rate was exact anyway.

The same day:
- `npm test` passes, including the net (49), session (46), rooms backend (69) and duo UI (148) suites.
- `npm run carrot:test` passes: `CARROT_TESTS_OK 4589476 assertions`.
- `carrot-sim --digest` is still `063b791ee5860368`, and `--quick` passes 36,147 assertions.
- These gates pass: DuoMirrorExact (405,679 ticks), SelectionFreeEquivalence (1,048,584), DuoReplica (27,251 digests),
  HeldWinTransitions, StateCopy, PausedOps, SilentReplayEquivalence, EndlessGeneratorProperties, NaNDigest, ExportSeqImport
  and LockstepPeers (seeds 0-3, 36 runs, 130,024 digests).
- The Web build keeps gzip with the decompression fallback (`.unityweb` files, gzip magic).
- `scripts/carrot-duo-ui-qa/ui.mjs` on the mock session: 1580/1580 (Chromium and WebKit, 320x640, 390x844, 844x390,
  1440x900). The single-player `scripts/carrot-ui-qa/qa.mjs` passed 181/182 in Chromium. The one miss was a snapshot-time
  check at 4x throttle (p95 6.1 ms against 6 ms) while the duo suite ran beside it. Rerun alone, the perf suite missed the 1x
  check once by 0.1 ms (machine load average about 10) and then passed both (p95 1.0 ms and 4.4 ms).

## Deploy (not done: waiting on the owner's login)

`npx wrangler whoami` says "You are not authenticated", and the login is a browser OAuth grant that only the owner can give.
The account already serves `cgs-accounts.wuyutingfengdahao.workers.dev`. Deploy steps:

```sh
npx wrangler@4 login && npx wrangler@4 whoami
npx wrangler@4 deploy --config backend/rooms/wrangler.jsonc --env ""     # only the new cgs-rooms Worker
node scripts/rooms-dev-check.mjs --url https://cgs-rooms.wuyutingfengdahao.workers.dev --quick
echo 'VITE_ROOMS_URL=https://cgs-rooms.wuyutingfengdahao.workers.dev' >> .env.local   # use the URL wrangler printed
npm run build && node scripts/stubs.mjs
```

On the Free plan the deploy only goes through with a SQLite-backed Durable Object, so a successful deploy also confirms that
Durable Objects work on this account; a refused one means Workers Paid. Until `VITE_ROOMS_URL` is set, the site builds and
runs exactly as before.

## Known limits

- No physical phone, iOS Safari, cellular or campus-NAT test was possible from one machine. Without a TURN key, such pairs
  play over the relay (netcode.md §11).
- The view stream's own QA (`scripts/carrot-duo-qa/checks.mjs`, `perf.mjs`) needs its QA player (`WebQaDuo`), which was not
  rebuilt on the licensed checkout. The release player's camera, taps and spectator were checked here by the e2e run
  instead.
- Endless: if seat 0 leaves before wave 1 and seat 1 continues solo, the start intent is never issued (Unity issues it from
  seat 0 only).
