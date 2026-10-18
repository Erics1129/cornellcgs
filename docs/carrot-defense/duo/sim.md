# Duo and two-player endless: simulation

Stream `sim-and-modes` (branch `duo-s-sim-and-modes`). This covers the C# rules, the net seam, the bridge session, the tests and
the bands. The view, the web net layer and the lobby are separate streams and are described in `view.md`, `netcode.md` and
`ui.md`.

## Files

| File | Compiled by carrot-sim | Role |
| --- | --- | --- |
| `CarrotDuoMaps.cs` | yes | Duo halves (`Half`, `HalfRect`, `ArenaRect`, `Wall`, `HalfAt`) and the Twin Gates endless map (id 90). FIRST COMMIT. |
| `CarrotNetContract.cs` | yes | `NetMode`, `NetOp`, op codes, `DuoViewConfig`, `CarrotNetHooks`, and the CarrotGame fields the view reads. FIRST COMMIT. |
| `CarrotTypes.cs` | yes | `TowerState.builder` (-1 outside endless). FIRST COMMIT. |
| `CarrotNetRules.cs` | yes | Net seam: netTick clock, op queue, `NetRunTo`, DuoOwn ops, lockstep intents, held win, `NetDigest`. |
| `CarrotEndless.cs` | yes | Endless generator (`CarrotEndlessGen`) and the endless rules. |
| `CarrotNetState.cs` | yes | Full-state export/import and the deep hash. |
| `CarrotNetSession.cs` | yes (explicit pickup) | Every JS-to-Unity Net message, replica pacing, lockstep driver, digests, results, replay. |
| `CarrotNetBridge.cs` | **no** | `CarrotNet` MonoBehaviour: attached at runtime to `CarrotGame`, the `CarrotPartner` replica object, view hooks, `runInBackground`. |
| `Plugins/WebGL/CarrotNet.jslib` | no | `CarrotNetOut`: one JSON array per frame, dispatched as window `carrot-net` events. |
| `CarrotNetTests.cs`, `CarrotEndlessBots.cs`, `CarrotNetDet.cs` | yes (`UNITY_EDITOR`) | Gates, ebots-v2, the cross-runtime net probe (`CarrotNetDet`, also in `CARROT_QA` Web builds). |
| `scripts/carrot-sim/endless.mjs` | n/a | `--endless-bands` and `--duo-bands` drivers. |
| `scripts/carrot-det/run-net.mjs`, `compare-net.mjs` | n/a | Browser runs and the comparator for the net scenarios. |

`CarrotData.cs` (outside the WAVES markers), `CarrotGame.cs`, `CarrotContract.cs` and `CarrotExpansion.cs` received the hook edits.
`CarrotPrism.cs` is unchanged: L29 stacks its halves in z, so `PrismPassed` (the only absolute-x rule) stays valid.

## Single player is unchanged

- `carrot-sim --digest` prints `063b791ee5860368`. `--quick` prints 36,147 assertions, the same as Unity's Quick. `--run` passes
  (4,589,398 assertions). Unity's `--test` gate passes (`CARROT_TESTS_OK 4589476 assertions`; the editor adds the audio regression).
- `carrot-game-data.mjs` reports no diff.
- The campaign `PlanWave` output is byte-identical to the pre-refactor function for every unit of levels 1-29 (11,147 units,
  `EndlessGeneratorProperties`).
- Selection and focus are split. Towers now read the focus. Single player mirrors every selection into the focus (an enemy or
  blocker focuses, anything else clears it), which is exactly the old "towers prefer the selection" rule.
- One behaviour fix applies to all modes: a dead enemy's expansion record (`extras`) is now dropped together with its actor. It
  was kept forever, so a long endless run grew without bound. Nothing reads it after death; the digest is unchanged.

## Tick model and ops

- A netTick is one 1/30 s `Step`. `NetRunTo(limit, maxTicks, silent)` executes tick `T = NetTick+1` as follows:
  1. Apply every op stamped `k <= T`, seat 0 first on even T and seat 1 first on odd T, then by seq.
  2. Set `NetTick = T`.
  3. `Tick(Step)` if the phase is `playing` and the half is not held.
  4. `NetTicked(T)` (digests).
  5. Deferred input (see below).
- The clock also runs in prep (`ready`), so prep builds are stamped too.
- **Mid-tick input is deferred.** A command or selection that arrives while a net tick runs (an Effect handler reacting inside the
  tick: the view, or a bot answering a telegraph) waits until the tick ends. It then applies and is stamped `T+1`, the state point
  every peer applies it at. Without this, an owner could apply an op inside tick T that its replica applies before T+1. The
  DuoReplica gate found this, and also found that the deferral must run after the tick's digest hook.
- **Op JSON** is `{s, k, seat, op, pad?, kind?, id?, target?, type?, v?}`. Preconditions (critique amendment):
  - `upgrade {id, v = fromTier}` and `sell {id, v = tier}` are refused when the tower changed tier. A `v` of 0 means no check.
  - `mergeUndo {id = the merge's target id}` is refused unless that merge is the last one and it belongs to the same seat.
  - `buy {pad, kind}` needs an empty pad. `merge {id, target}` needs two tier-4 towers of one kind.
  - `focus {type: 'enemy'|'blocker'|'', id}` needs a live enemy or a standing blocker.
  - Bounds (pad, tower kind, ids, tier, speed, focus type) are checked in `EnqueueOp`, before anything reaches the rules. The Web
    build only throws explicit exceptions, so a bad index must never be read.
- **Validation reads only replicated state.** `next` ignores the pause flag in net modes, and window focus never freezes a net
  match: `backgrounded` is ignored, and the bridge sets `Application.runInBackground` for the session.
- **DuoOwn.** A command applies at once and is recorded as an op stamped `NetTick+1`, but only if it was accepted. A refused
  command takes no seq and is never sent. Duo keeps the single-player selection rules: picking a pad still clears focus fire.
  Each focus change the selection causes is sent as a focus op.
- **Replica.** It runs only the partner's ops. An op the owner accepted but the replica refuses counts as a desync at once
  (`ReplicaRefused`); so does an op for a tick it has already run (`LateOps`).
- **Lockstep.** A command becomes an intent (`PendingOps`), checked against the provisional state: the purse minus pending costs,
  tiers plus pending upgrades, and pads with pending builds.
  - The intent carries `v = fromTier`. Two quick upgrade taps therefore send 1 and then 2, and a duplicate tap is refused.
  - When the stamped op executes it leaves `PendingOps`. If it is refused, the issuer alone gets a `{t:'reject'}` and a seat notice.
  - Focus is an explicit shared op, and picking a pad never clears it.
  - When a partner sells or merges a tower you built, you get a notice: "<name> sold your Frost, +84".
- **Selection is local.** A partner's op never moves your selection. Your own op moves it only while you still point at what it
  acted on: in lockstep the op executes D ticks after the tap.
- `RequestTimeScale` returns false in every net mode, so hit-stop and slow motion are view-only.
- Replica and replay runs skip snapshots (`SnapshotEnabled`). `silent` suppresses Effect events but never digests.

## Duo

- `LoadLevel(id, "duo", side)` loads `CarrotDuoMaps.Half` and keeps the level id, so every per-level table, kit and award applies.
  `Mode` is `duo`. `LoadLevel(id, "duo:1")` is the one-string form used by tests.
- Halves:
  - Axis X: half 0 is x-8 and half 1 is 8-x, with the wall at x=0.
  - L29 (axis Z): north is z+5 and south is -(z+5).
- **Held win (critique amendment).** When a half clears its final wave and boss it enters `DuoHold`:
  - Tick no longer runs and every state-changing op is refused. The award inputs (hearts, scenery, towers, elapsed, stats) are
    therefore exactly those of the clear tick.
  - The challenge time is your own clear time, the same as a solo run. Holding for 10k ticks with a blocker focused changes
    nothing (`HeldWinTransitions` case 6).
  - `PartnerResult("cleared")` wins the match once this half holds (or at the moment it does). `PartnerResult("lost")` loses it
    at once.
- **Results.** `{t:'result', outcome:'cleared'|'won'|'lost', cause:'self'|'partner'|'team', tick, health}`. Only self-caused
  `cleared` and `lost` go to the partner, as `{t:'partner'}`.
  - The replica's own outcome must equal the owner's report (outcome and tick), or it counts as a desync.
  - When the match ends on this device (its half lost, or the team won), the replica is ended for the picture at a tick its
    owner never sees. The replica's digests after that point are not compared (`PastEnd`).

## Two-player endless (id 90, Twin Gates)

- `LoadLevel(90, "endless", seed)`. The room seed seeds the sim rng, and the wave arrays are sized 1000.
- Wave w's plan is a pure function of (seed, w). Waves are generated in order and cached, because the lead-kind and miniboss
  no-repeat rules read earlier waves.
- Plans are generated only at deterministic points: at load, and at each `BeginWave` (that wave and the next). They are never
  generated from the snapshot.
- Endless reads none of the per-level tables. In the standalone sim every guarded accessor counts and throws for id 90:
  `HPScale`, `GapScale`, `Breather`, `PacketOverlap`, `OpeningScale`, `Pressure`, `WaveRamp`, `Pace`, `WaveStipend`,
  `BossScale`, `BossPressure`, `LitPads` and `PlanWave`. `EndlessAllKits` and the 120-wave run read zero tables.
- All scaling is integer (ppm or per mille, rounded to whole HP and coins): there is no Pow, Exp or Log in new sim code.
- The miniboss curve Hm is a separate integer recurrence. At t0 it was within 1.7% of H^0.85 up to wave 80.
- **Entity cap.** Once 120 enemies are live or queued, further summons are suppressed and folded into the summoner: +3% HP per
  suppressed unit, at most +60%. This is endless only. Bots never reached it: the peak was 72 live.
- Clearing a boss wave restores 2 hearts, up to 10. Bosses bite for 3 (`IsChallenge` is now 25-29). Zombie graves are recorded in
  endless too.
- The eyeball's rebirths scale from its endless spawn HP.
- Score = waves fully cleared (`EndlessScore`, snapshot `net.score`).
- The snapshot `net` block also carries:
  - `pending`, `spent` per seat, `provisionalCoins` and `liveEnemies`;
  - the seeded preview: `bossWave`, `bossKind`, `bossName`, `miniWave` and `minis`.

### Curve of record: endless-t2

| Constant | t0 | t2 |
| --- | --- | --- |
| H(w) | 1.05 (1 + .115 (w-1)) 1.02^(w-1) | 1.05 (1 + .205 (w-1)) 1.018^(w-1) |
| Miniboss lead (Hm) | 1.042 | 0.700 |
| Boss adds / miniboss escorts | 0.4 / 0.6 of budget | 0.8 / 0.8 |
| Boss dials (garden, tornado, marsh, frost, zombie, orchard, eyeball, portal) | all 1.0 | .9 .7 .6 .6 .9 .6 .9 .9 |
| Budget, rewards, stipend, breather, starting purse 700 | as in the rules | unchanged |

### Tuning record

The constants changed only through `--endless-bands`. The bots changed between v1 and v2 for harness bugs, not difficulty.

1. **ebots-v1** was committed first (e7a53b3, `CarrotEndlessBots.cs` sha256 prefix `9682e4e07799a235`). At t0 every bot died
   near wave 35-42, and the expert lost to the median.
2. An income-elasticity probe showed that above 1.0x income, extra coins buy almost nothing (+4 waves at 2.5x). At t0 every
   garden fills all 35 pads, so the late curve, not skill, decides.
3. Three harness bugs were found and fixed in **ebots-v2** (4676b04, `623f65e00c9ec0bc`):
   - focus on scenery while enemies walked (a focused blocker pulls every tower in range off the enemies);
   - an expert that never saved for strong options (deciding every 0.3 s on "best affordable" buys only cheap things; the
     campaign R0 saving rule was missing);
   - seat 0 always spending the opening purse and winning tie-breaks, which favoured the west gate.
   v2 uses the campaign bots' focus and saving rules, and seat-symmetric order and tie-breaks.
4. With v2 frozen, the curve search found the late curve too steep (it compresses skill) and the boss and miniboss waves
   off-trend. Their dips made the following wave the deadliest and broke hazard monotonicity. The boss-pair dials were balanced
   to cut seed variance.
5. The hazard checks are judged only where at least `max(30, 25%)` of a bot's runs reached the wave. With 200 runs that is 50, a
   standard error of about 0.05 on one wave. The tail is reported, never judged.

### Endless bands (`--endless-bands --r0 50 --r1 200 --r2 200 --solo 50`): every target met

| Bot | n | Median waves | IQR | First 4 waves | Gate share (west) | Peak live |
| --- | --- | --- | --- | --- | --- | --- |
| E-R2 | 200 | 20 (target 12-20) | 9.25 | 1.00 (target >= .98) | .528 | 66 |
| E-R1 | 200 | 27 (target 25-35) | 7 (target <= 10) | 1.00 | .523 | 72 |
| E-R0 | 50 | 41 (target 40-60) | 2.75 | 1.00 | .566 | 72 |
| E-solo | 50 | 32.5 | 8 | 1.00 | .501 | 69 |

- The smoothed hazard never falls by more than .03: the worst drop is .017.
- No boss or miniboss spike.
- E-R1's hazard below its median peaks at .129.

The file of record is `endless-bands.json`.

Robustness on larger and independent samples (all with the frozen defaults):
- 200/400/400: every check passes.
- Seeds 1000-1299: every check passes.
- Seeds 2000-2299: one boss-wave spike check misses (w30, 2.1x against the 2.0 limit).

Several targets sit at the edge of sampling noise. E-R2's median sits on its upper bound (20) and E-R0's near its lower one (41),
on every sample.

## Duo bands (`--duo-bands --r1 1000 --variants 20`): every gate met

- R1 plays half 0 with seed s and half 1 with seed 1000+s. A duo match is won when both halves win.
- p_solo comes from R1 on the solo map with the same seeds.
- The mirror gate runs five bot variants (R0p0, R0p1, R1, R2, RN) x 20 seeds on the solo map and on half 0.

| Level | p_solo | p_half | p_duo | p_solo^2 | gap | half/solo agreement |
| --- | --- | --- | --- | --- | --- | --- |
| 4 | 1.000 | 1.000 | 1.000 | 1.000 | 0 | 1.00 |
| 8 | .645 | .642 | .400 | .416 | -.016 | 1.00 |
| 12 | .773 | .773 | .575 | .597 | -.021 | 1.00 |
| 16 | .783 | .784 | .587 | .614 | -.026 | 1.00 |
| 20 | .679 | .678 | .482 | .462 | +.021 | 1.00 |
| 24 | .485 | .485 | .205 | .236 | -.031 | 1.00 |
| 25 | .781 | .781 | .587 | .611 | -.023 | 1.00 |
| 26 | .675 | .675 | .454 | .455 | -.001 | 1.00 |
| 27 | .417 | .417 | .172 | .174 | -.002 | 1.00 |
| 28 | .268 | .268 | .061 | .072 | -.011 | 1.00 |
| 29 | .305 | .305 | .095 | .093 | +.002 | 1.00 (R0p0 reported, not judged) |

- The halves are independent: p_duo is within .031 of p_solo^2 everywhere.
- A half plays exactly like the solo level for these bots: outcome agreement is 1.00, and R1's win rate moves by .003 at most.
  The offset-8 rounding never flipped an outcome here. Fairness between the halves still rests on `DuoMirrorExact`, which is
  bit-exact.
- On L29 the Asuna expert policy (`RunPrismCampaign`) scores pads by `|z|`, taking the solo lane to be z=0. On the north half
  (lane z=5) it is therefore a different policy: agreement .40, reported but not judged. R1 and R2 agree 100%.

Duo difficulty is therefore roughly the square of solo difficulty. Two average players clear L24 together 21% of the time, against
49% alone. Both halves must win.

## Gates (`node scripts/carrot-sim.mjs --method <Name>`)

| Gate | Result |
| --- | --- |
| `DuoMirrorExact` | 11 fights x 2 policies, 405,679 ticks: Digest, DiscreteDigest, mirror-normalised NetDigest and every position bit (-x, or -z on L29) identical on every tick. |
| `SelectionFreeEquivalence` | Levels 1-29 x 2 policies, 1,048,584 ticks: legacy commands vs DuoOwn ops (plus sales, early calls, undo, blocker focus) with 0 mismatching ticks. The zero-delay replica equals its owner on every tick, and the held half resolves at the solo outcome tick. |
| `DuoReplica` | 11 fights x 2 seeds through two real sessions: delays 0-500 ms, a 3-10 s stall, a 2x window and a pause. 0 desyncs, 40,000 digests compared (at least `ticks/30 - 2` per device), 0 unverified, silent fast-forward exercised. Positive control: one coin on a replica is caught at tick 930 (perturbed at 900). |
| `LockstepPeers` | 20 seeds x D {2,4,8} x loss {0,5,10}% x 25 waves (180 runs, ebots-v2, endless-t2): 0 desyncs, 650,875 digests compared, equal scores. Positive control: one coin on one peer is caught within 30 ticks. |
| `PausedOps` | Bursts of early calls, builds, upgrades, sales, merges and undos issued while paused (L16, L27) keep owner and replica equal at every tick boundary. In lockstep a partner's build never moves the local selection, and two same-tick upgrades of one tier pay once. |
| `HeldWinTransitions` | The 8 scripted cases, plus a session match. |
| `StateCopy` | L27, L28, L29 and endless at wave 15: 0 mismatches after import. Blobs are 1.2, 1.8, 1.4 and 3.6 KB (zigzag varints, trimmed per-wave arrays). |
| `SilentReplayEquivalence` | 11 fights and 30 endless waves: live run vs silent replay from tick 0 agree on every 30th tick. Replay runs at 0.6-2.2 M ticks/s in .NET. |
| `EndlessGeneratorProperties` | Plans are a pure function of (seed, w) in and out of order. At most 70 ordinary units; all 8 bosses by wave 80, never Asuna, never the same twice running; valid packets; a 120-wave run never fields two bosses (peak 87 live). |
| `EndlessAllKits` | 8 bosses, 15 minibosses and 20 kinds at waves 1, 10, 30, 60, 90 and 120 on Twin Gates (every kit casts), plus every duo half played out: 0 exceptions, 0 table reads. |
| `NaNDigest` | NaN payloads fold in NetDigest and in the deep hash. `Digest()` is unchanged. |
| `NetBridgeGolden` | Writes the bridge fixture (see below). |
| `NetPerf` | See Performance. |

## Bridge contract notes for integration

All additions are optional fields. The frozen shapes are unchanged.

**Inbound (JS to Unity):**
- `{t:'replica', exec, ops, b?, d?:[tick,disc,float,...], dh?:[tick,deep,...]}`. `b` is the replica buffer in ticks (3 on P2P,
  5 on the relay). `d` and `dh` are the partner's own digests, compared in C# through a pending-remote queue, so the replica can
  be any number of ticks behind.
- `{t:'step', to, ops, d?, dh?}`. In lockstep, `d` and `dh` carry the partner's digests.
- `{t:'partner', outcome, tick}`. Send it only for the partner's self-caused results.
- `{t:'solo', on}` switches lockstep to Continue solo: own clock, ops stamped `NetTick+1`.
- `{t:'export', target?}` and `{t:'import', target, tick, b64}`, with targets `self` or `replica`.

**Outbound (Unity to JS):**
- `{t:'tick'}` adds `rate` (1 or 2, with the speed hold applied), `rexec` (the replica's tick), `hold`, `dh` (own deep hash every
  300 ticks and at wave starts) and `rd`/`rdh` (the replica's digests).
- `{t:'result'}` adds `cause`.
- `{t:'desync'}` adds `kind` (`digest`, `deep`, `refused`, `late` or `outcome`) and `where`.
- New messages: `{t:'progress', target, tick, to}` (chunked replay, at most 30 ms per frame) and
  `{t:'error', code, message?}` (`version-mismatch`, `bad-session`, `import`).

**Flush order and re-entry:**
- Outbound messages are flushed once per frame (LateUpdate) as one array, in this order: own ops and intents, rejects, ticks,
  results, everything else.
- A Net message that arrives during a flush or a frame is deferred to the next frame and counted (`Session.Reentries`). Every
  test run reported 0.

**Golden fixture:** `carrot-sim --method NetBridgeGolden out=...` writes the real session traffic of a duo match, a lockstep match
and export/import/replay, in both directions, as JSONL. It belongs at `docs/carrot-defense/duo/bridge-golden.jsonl` (lead-owned).

## Performance

`NetPerf` (.NET, after a warm-up pass):

| Level | Solo (µs/tick) | Own half + replica (µs/tick) | Ratio (limit 2.1) |
| --- | --- | --- | --- |
| 8 | 1.05 | 1.82 | 1.74 |
| 16 | 1.40 | 2.22 | 1.59 |
| 24 | 1.30 | 2.54 | 1.96 |
| 28 | 1.31 | 2.13 | 1.62 |

- An endless tick around wave 60 (26 towers, peak 72 live) costs 3.1 µs. The limit is 250 µs.
- Silent replay runs at 0.6-2.2 M ticks/s in .NET.
- In Chromium wasm (WebDet, CARROT_QA, shipped settings), silent replay runs at 19.8k ticks/s (L24 duo) and 20.7k ticks/s
  (endless). The target is 5k. A full L24 rebuild takes 1.7 s; the session chunks it at 30 ms per frame.
- The replica never builds a snapshot (`SnapshotEnabled=false`, `EnableBridge=false`). `DuoReplica` fails if a replica's
  `LastSnapshot` is ever set.

## Cross-runtime determinism

The scenarios:
- `NetDetSpecs` records four duo replica op logs (L24, L27, L28, L29: guardian, eyeball, portal and prism kits) and two 15-wave
  two-seat endless logs (seeds 4242 and 777), and replays them on .NET.
- `run-net.mjs` replays them in the `WebDet` player: release settings plus CARROT_QA (gzip with the decompression fallback,
  IL2CPP OptimizeSize, Medium stripping), built from this branch.
- `compare-net.mjs` compares every 30th-tick NetDigest, every deep-hash checkpoint and the outcome.

Results:

| Runtime | Scenarios | Result |
| --- | --- | --- |
| Chromium 151 desktop (90 ticks/frame) | 6 / 6 | identical to .NET |
| WebKit 26.5 desktop (90 ticks/frame) | 6 / 6 | identical |
| Chromium mobile emulation, 390x844 at DPR 3 (7 ticks/frame) | 6 / 6 | identical |
| Chromium mobile emulation at 4x CPU throttle (13 ticks/frame) | 6 / 6 | identical |
| WebKit 390x844 at DPR 3 (1 tick/frame) | L29, L27 | identical |
| Chromium silent replay (600 ticks/frame) | L24 duo, endless 4242 | same chain as the non-silent run |

In total that is 4,702 digests and 539 deep checkpoints per runtime. Because endless scaling is integer, .NET agrees with the
browsers exactly. The bands, computed in .NET, therefore describe exactly what browsers play.

How to reproduce:

    node scripts/carrot-sim.mjs --method NetDetSpecs <dir>
    node scripts/carrot-unity-build.mjs --method CarrotTD.CarrotDetBuild.WebDet
    node scripts/carrot-det/server.mjs output/carrot-det 8791 &
    <playwright node> scripts/carrot-det/run-net.mjs chromium "http://127.0.0.1:8791/?name=carrot-det" <dir>/chromium <dir>/specs/*.txt
    node scripts/carrot-det/compare-net.mjs <dir> dotnet chromium webkit ...

The release build (licensed checkout) must repeat this run before `VITE_ROOMS_URL` is set (critique amendment).
