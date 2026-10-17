# Carrot Defense duo play: net layer and rooms

This doc covers the web net layer (`src/minigames/carrot/net/**`) and the `cgs-rooms` Worker (`backend/rooms/**`). They
carry the duo boss fights and two-player endless. Nothing here has been deployed. Setting `VITE_ROOMS_URL` turns
multiplayer on; while it is empty, the site builds and runs exactly as before.

```
VITE_ROOMS_URL=            # https://cgs-rooms.<subdomain>.workers.dev once deployed (lead, at integration)
```

## 1. Shape

```
 page (React)          duo/** UI ──── DuoSession (net/session.ts) ──── EngineLink (net/bridge.ts) ──── Unity CarrotNet
                                   │                                     SendMessage('CarrotGame','Net', json)
                                   │                                     window 'carrot-net' events
        ┌──────────────────────────┴─────────────────────────────┐
   rooms.ts: room WebSocket (lobby, signalling,          rtc.ts: WebRTC DataChannels (public STUN, TURN when minted)
   presence, clock samples, relay path)                    u: unordered, maxRetransmits 0 (ticks, ops)
        │                                                  r: ordered, reliable (state chunks, controls)
        └──────── transport.ts: P2P or relay, liveness from app frames only ─────┘
                                   │
                    match.ts: one match (duo.ts | lockstep.ts, blobs.ts, ping and skew, controls, resync)
```

| File | Role |
|---|---|
| `protocol.ts` | Every frozen type and constant: ops, bridge messages, wire frames, room messages, errors and copy, storage keys, the DuoSession/DuoSnapshot/EngineLink boundary. Uses erasable TypeScript only. |
| `frames.ts` | Binary codec (LEB128, zigzag, op presence mask). Decoding never throws, and it bounds-checks every op before C# sees it. |
| `rooms.ts` | Room socket with backoff reconnect inside the grace. A `fetch` pre-check makes refusals readable. Also fetches TURN servers. |
| `rtc.ts` | Perfect negotiation (seat 0 impolite), pre-negotiated `u`/`r`, trickled ICE, `restartIce`. |
| `transport.ts` | Path choice (P2P or relay), the 250/750/3000 ms liveness thresholds, return to P2P after 2 s of clean frames. |
| `duo.ts` | Duo: relays own ops, feeds the replica, checks digests. |
| `lockstep.ts` | Endless: commits, adaptive D in wall time, slew, slow-peer policy, freeze and resume. |
| `match.ts` | One match's data plane, shared by the session and the link-model tests. |
| `blobs.ts` | State blobs: gzip, 1,100 B chunks with acks and retry, timeout. |
| `digests.ts` | Own digest ring against the partner's pending queue. Copies that are lost or evicted count as unverified. |
| `clock.ts` | Server clock from the lowest-RTT lobby sample, slewed by peer ping/pong skew. |
| `session.ts` | `createDuoSession()`: phases, page-command interception, presence, reconnect record and restore. |
| `bridge.ts` | `createUnityLink(CarrotUnity)`: validated, normalized Unity messages, the send filter, and a re-entry backstop. |
| `config.ts` | `roomsUrl()` (`VITE_ROOMS_URL`, or `?carrot-rooms=` in dev) and `netVer()` = `${unity-build version}+n${NET_VERSION}`. |
| `fakeEngine.ts` | A deterministic toy sim that speaks the Unity bridge protocol. Every Node and Playwright test here uses it. |
| `stats.ts` | RTT, input delay, stalls, path, bytes, digests and resyncs, for the HUD chip and QA. |

The only change to an existing web file is in `unity.ts`, which gains `net(json)` and `setSendFilter(fn)`. `useDuo`
(lobby stream) installs the filter through `createUnityLink(...).intercept(session.send)`. Every page command (keyboard,
HUD, results, settings restart, level-select `load`) then passes the session first, and `CarrotPage.tsx` needs no edits to
those lines.

## 2. Models

**Duo boss fights: your own half is authoritative and the partner's half is a replica.** Unity applies your own ops at once
and stamps them `own netTick + 1`, so input lag is zero. Each frame carries:
- your executed tick;
- a cumulative ack of the partner's ops;
- every unacknowledged own op, oldest first, up to 1,100 B;
- the latest digests.

When the backlog does not fit in one frame, the reported exec is capped below the first op left out. The replica can then
never run a tick whose ops it has not received.

The replica is fed `{t:'replica', exec, ops, b}`:
- it stays B ticks behind the partner's reported tick (3 on P2P, 5 on the relay);
- it never passes that tick;
- if frames stop, only the partner's view freezes.

Ops travel with this layer's own wire seqs (1, 2, 3, ...), because the cumulative ack needs them contiguous. Unity's `s`
only orders ops.

**Two-player endless: deterministic lockstep with an adaptive input delay D.**
- A local intent at released tick `R` is stamped `k = max(R + D, committed + 1)`.
- A frame says "committed through `R + D - 1`".
- Tick T runs only when both commits reach T and the local clock does.
- Ops of one tick are delivered in canonical order: seat 0 first on even ticks, seat 1 first on odd ticks, then by seq.

The receiver takes the seat from the transport, never from the wire. Commits count from the tick already released to Unity,
not from Unity's later report. This keeps an engine frame of latency out of the loop (measured: p99 commit delivery fell from
71 to 43 ms at 30 ms RTT).

D is held in wall time:
- **It adapts.** D = 1 + ceil((p99 delivery + 15 ms) / tick). Delivery is measured per covered tick, as the arrival of the
  commit minus the moment the partner could first commit it. A ±5 ms hysteresis band sits around the 15 ms margin.
- **Each side tells the other what it needs.** A peer measures what its *partner's* D must be, from the delivery of the
  partner's commits plus its own stalls of 8 ms or more, and sends it as `CONTROL.delay`. Each side uses
  max(the partner's request, its own measure), so an asymmetric path is covered.
- **It rises and falls at limited speed.** Two frame-sized stalls in 2 s raise the request at once. D drops by at most one
  tick per 10 s, and only by letting commits idle; a commit never moves backwards.
- **It follows speed.** On a speed op or a SpeedHold change, D is rescaled: at 2x a tick is 16.7 ms, so the same delay is
  twice the ticks.

**Clock, slew and slow peers.** The clock is anchored on the room's `startAt`/`resumeAt`. It slews by ±3% from the measured
advantage over the partner and never jumps. Slow-peer policy: if a peer's engine cannot execute the ticks it is allowed for
5 s, it announces a factor. Both clocks slow to that rate (the measured case dropped to 0.69), and the slow device drops to
the Low view tier once. The HUD shows `stats.slowedFor`. After 5 s of keeping up, the rate steps back up by 5%.

**Pause** is serialized by the room and has a 5 s manual-pause cooldown after your own resume. Lockstep freezes commits, so
both peers stop at min(commits), the same tick, and resume at the room-stamped `resumeAt`. Duo stops the own-half clock.
**Continue solo** switches lockstep to local mode: D=0 and no partner commits.

## 3. Wire format

Frames are little-endian; v is unsigned LEB128 and zv is zigzag LEB128. The format is identical on DataChannel `u`/`r` and
on the room relay.

```
header  u8 kind, u8 flags (bit0 digest, bit1 via relay, bit2 paused, bit3 away, bit4 deep), u16 seq
kind 1  duo        v exec, v ackCmd, u8 n, cmd*, [digest], [deep]
kind 2  lockstep   v committedThrough, v exec (released), v ackCmd, u8 n, cmd*, [digest], [deep]
        cmd    = v seq, v tick, u8 code, u8 mask, fields   (mask: pad v | kind u8 towerIndex | id zv | target zv | type u8 | v zv)
        digest = v tick, u32 disc, u32 float               deep = v tick, u32 deep (reflective full-state hash, every 300 ticks)
kind 3  chunk      v resyncId, v tick, u16 index, u16 count, u8 purpose (1 resync, 2 restore, 3 oplog), bytes (<= 1,100)
kind 4/5 ping/pong u32 id, f64 sender server-time [, f64 responder server-time]   (RTT and clock skew)
kind 6  control    u8 code, u8 mask, [a zv] [b zv] [c zv] [f f64]
        1 away  2 back  5 speed  6 startReady  7 resyncRequest  8 resyncDone  9 leave  10 presence  11 chunkAck
        12 restoring (a %)  13 restoreInfo (a replicaExec, b ownExec)  14 slowed (a seat, b factor x1000)
        15 delay (a ms)  16 restoreRequest (a id)
```

Op fields follow C# `NetOp` (`CarrotNetContract.cs`):
- `upgrade` and `sell` carry `v` = the precondition tier;
- `mergeUndo` carries `id` = the merge's target;
- an absent field means the C# default.

A new digest rides 6 consecutive frames and then frames go without it, saving about 18 B per frame. Every frame stays at
1,200 B or less: the largest seen in 100k fuzzed frames was 1,115 B, and the largest with 300 queued ops was 1,122 B.

Version gate: the room refuses a different `ver`, which is `${unity-build version}+n${NET_VERSION}`. The error names who is
outdated when the net versions differ. `scripts/carrot-net-protocol.lock.json` pins the sha256 of `protocol.ts`, and
`test-carrot-net.mjs` fails if the file changes without a `NET_VERSION` bump. Before the first deploy,
`--update-lock` refreshes the lock.

## 4. Room protocol (cgs-rooms)

The room protocol is the room section of `protocol.ts`; [backend/rooms/README.md](../../../backend/rooms/README.md) covers
routes and limits. Points worth knowing:

- **Refusals are readable.** `GET /rooms/:code?ver&pid` returns 404/409/403 with a code before the socket opens. A refused
  socket gets `{t:'error'}` and then a 44xx close: 4404 not found, 4409 full, 4426 version, 4403 origin, 4429 busy.
  The busy copy names 00:00 UTC in the player's own time zone (Intl).
- **Pause, resume and speed go through the room.** The room serializes them (toggles crossing in flight cannot flip the
  match the wrong way) and stamps `resumeAt = now + 3 s`. A resume request while already running is answered with the
  current `resumeAt`, so no one is left waiting.
- **Presence and the grace:**
  - A hidden tab, `pagehide` or `freeze` sends `away` at once and pauses after 1 s. `pageshow`/`online` reconnect.
  - After 3 s of silence the survivor pauses, sends `peer-silent` (the room marks a half-open socket away and arms the grace
    alarm) and runs its own 60 s timer.
  - A same-pid rejoin replaces an old socket, even a half-open one, instead of getting 409.
  - When the host leaves, the remaining player is promoted to host.
- **Results.** `cleared` is relayed and not final. `won`, `lost`, `ended` and `unfinished` return the room to the lobby. If
  the partner cleared first, the session re-sends `partner: cleared` once our own half holds (C# should also remember it).

## 5. Reconnect and restore

- The reconnect record is `{code, pid, seat, match, own op log, lastExec at 1 Hz}`, kept for 3 h:
  - **With Web Locks:** it lives in localStorage, and a lock on `cgs-carrot-duo:<code>:<pid>` keeps a second tab off the seat
    ("This room is already open in another tab.").
  - **Without them** (an insecure context): it lives in this tab's sessionStorage.
- **Duo reload.** The rejoiner sends `restoreRequest` until the survivor answers. The survivor sends three things:
  `restoreInfo` (its replica's view of our tick), its copy of our op log (used only if our record has none), and its own
  half's state. The rejoiner then:
  - replays its own half silently to max(record lastExec, the survivor's replica exec), in chunks kept under 30 ms per frame,
    while heartbeats keep flowing and the partner sees "Restoring 43%";
  - sends a fresh blob of that half to the survivor's replica;
  - imports the survivor's half into its own replica;
  - asks the room to resume.

  While this runs, the rejoiner's replica holds (no feed, no digest checks), and the survivor does not resume its silence
  pause.
- **Endless reload.** The survivor freezes, exports the shared state at its released tick and resets its view of the
  partner's ops. The rejoiner imports the state, restarts its wire seqs at 1 and resumes. Intents the rejoiner made in its
  last ~100-400 ms that never reached the survivor are dropped.
- **Grace ended.** Duo ends unfinished and nothing is recorded. In endless the survivor chooses **Continue solo** or
  **End run**.

## 6. Desync (never silent)

- **Duo:**
  - The replica's digests (`rd`, plus `rdd` deep every 300 ticks) are compared with the owner's `d`/`dd` through a pending
    queue, because the replica can be 60+ ticks behind.
  - A mismatch makes the replica request a blob from its owner. The owner's own half never changes.
- **Endless:**
  - Both peers' `d`/`dd` are compared.
  - A mismatch pauses the room with reason `resync`. Both freeze; the host exports when both are converged; the guest imports
    and resumes.
- **Both modes:**
  - Every comparison is counted (`digestsCompared`), and lost or evicted digests count as `unverified`, never as a pass.
  - Two resyncs within 60 s end the match: duo as unfinished ("Connection problem: ... Nothing was recorded"), endless with
    the score marked as ended by connection.
  - Unity's own `{t:'desync'}`, for example when the replica rejects an op its owner accepted, takes the same path.
- **Positive controls:**
  - Node: a one-coin `debugCoins` on one side was caught within 1 tick of the next digest (injected after 179, caught at
    180) and resynced.
  - Browsers (Chromium↔WebKit): duo and endless were each caught and resynced 617-647 ms after injection.

## 7. Measurements

All runs were on the owner's M5 Max on 2026-10-17. Raw results are in
`scratchpad/carrot-duo/netcode-and-relay/` (`test-carrot-net.json`, `carrot-net-qa-results.json` and the logs).

### 7.1 Lockstep input delay (Node link models, real controllers and transport, 10 seeds × 2 peers each)

| Link (RTT / jitter / loss) | Path | D at 10 s | Input delay | Stalls ≥ 1 frame per 20 s, settled | Sub-frame stalls per 20 s | Digest mismatches |
|---|---|---|---|---|---|---|
| 30 ms / ±5 / 1% | P2P | 3 (20 of 20) | 83 ms | 0 | 0 to 0.5 | 0 |
| 60 ms / ±10 / 2% | P2P | 4 (16 of 20; 5 or 6 after an early stall bump) | 117 ms | 0 | 0 to 1.0 | 0 |
| 150 ms / ±30 / 5% | P2P | 6 (14 of 20; 7 in the rest) | 183 ms | ≤ 1 over 200 s | 0 to 1.0 | 0 |
| 60 ms / ±10 / 2%, TCP fast recovery | relay (10 Hz) | 9 to 12 | 250 to 317 ms | 0 | 0 to 1.0 | 0 |
| same, 2x speed, 30 ms | P2P | 5 (wall-time D) | 83 ms | 0 | | 0 |

Relay at a fixed D (stalls per 20 s, 3 seeds): D=6: 2.7, D=8: 0.5, D=10: 0.

The plan's "stall-free at D=6 on the relay" was measured with 15 Hz relay frames. The critique coalesces relay frames to
10 Hz for billing and raises D to match, which costs about 2 to 4 more ticks there. TURN (`/turn`) keeps campus pairs on UDP
when the owner adds a key.

A frame-sized stall needs a lost frame plus jitter at the minimum D; the rate measured was 0 to 1 per 200 s. A sub-frame
stall only moves a tick within one rendered frame.

### 7.2 Real browsers (Playwright: fake-engine pages, real WebRTC, wrangler dev rooms)

| Scenario | Result |
|---|---|
| LAN duo, Chromium↔Chromium | P2P open 600 ms after the join (host/host); 1.7 KB/s per direction (RTCStats bytesSent, 20 Hz frames + pings); duo win on both; 9/9 replica digests verified |
| LAN duo, Chromium↔WebKit | P2P open 545 ms; 1.8 to 1.9 KB/s per direction; duo win on both |
| LAN endless, Chromium↔WebKit | D=3 (83 ms); 2.6 KB/s per direction; same towers on both; pause froze both on the same tick; 0 resyncs |
| srflx-only (Cornell NAT does not hairpin) | P2P never comes up (ICE still `checking`); play on the relay at once; replica verified over the relay |
| Mid-match UDP blackhole, Chromium↔WebKit via UDP proxies | relay after 744 / 747 ms; no op lost (the replica has every build); P2P back 2.0 to 2.1 s after the restore; 0 resyncs |
| Reload and rejoin, Chromium↔WebKit | back in the seat 5.1 s after `reload()`; own half rebuilt by silent replay (same towers); 0 resyncs; the match still ended in a duo win |
| Explicit leave | partner sees it 4 ms later; duo result unfinished |
| Lockstep at 60 ms / ±10 / 2%, Chromium↔WebKit via UDP proxies | measured RTT 65 ms; D=4 on both (117 ms); 0 stalls in 20 s; 34 digests verified |
| Relay budget (forced relay, 30 s windows) | duo 1x 66, endless 1x 66, endless 2x 68 billed DO requests per relayed match-minute (limit 70) |
| Error copy, Chromium and WebKit | room-not-found, bad-code, room-full, version-mismatch ("you" detail) and origin (Chromium, mapped host) show the protocol's copy |
| Positive control | duo resynced 617 ms after a one-coin divergence; endless 647 ms |

### 7.3 Duo replica buffer (Node link models)

| Path | Lag behind the partner's reported tick, p10 / p50 / p90 | Mismatches |
|---|---|---|
| P2P 30 ms | 2 / 3 / 4 | 0 |
| P2P 60 ms | 2 / 3 / 3 | 0 |
| Relay 60 ms (10 Hz) | 4 / 5 / 6 | 0 |

### 7.4 Transport and blobs (Node link models)

- UDP blackhole: the relay takes over in 730 ms and P2P returns in about 2.03 s (2 s of clean frames).
- A 30 s outage on both paths with 300 ops queued: all of them arrived after the outage, oldest first in bounded frames;
  the largest frame was 1,116 to 1,122 B.
- A 37 KB incompressible state blob over the relay at 60 ms / ±10 / 2% took 1.4 to 1.6 s (1,100 B chunks, acks, retry,
  sent under the room's 32 KB/s chunk budget).

### 7.5 Rooms on workerd (`rooms-dev-check.mjs`, wrangler 4.149.0 `dev --local`)

- A third player gets HTTP 409 room-full on the pre-check, and on the socket an error followed by close 4409.
- A version mismatch gets 409, and on the socket close 4426.
- Relay round trip A → room → B → room → A: p50 0.45 ms, p95 1.84 ms.
- After 30 s idle with only auto-answered pings, the room was rebuilt (hibernated); the first message after that was
  answered in 1.8 ms.
- A rejoin inside the grace keeps seat, seed and sides.
- Storage is empty after the last player leaves.

The bundle is 28.4 KiB (8.2 KiB gzipped); `wrangler deploy --dry-run` passes for both the top-level and `dev` environments.

## 8. Tests

| Command | What it checks |
|---|---|
| `node scripts/test-rooms-backend.mjs` | 69 checks: worker.ts and room-core.ts in process (the 23 reference checks plus profile, whitelist, caps, chunk budget, peer-silent, host promotion, go stamping, pause cooldown, results, TTL, empty cleanup, hibernation rebuild, counters, quota errors, origin socket refusal) |
| `node scripts/test-carrot-net.mjs` | 44 checks in virtual time (tables above), plus the protocol lock and the golden bridge fixture when it exists |
| `node scripts/test-carrot-session.mjs` | 46 checks: two DuoSessions against the in-process Worker. Lobby, sides, prep/go, zero-lag own actions, shared speed, pause and cooldown, duo win and loss, resync, leave, duo and endless reload, the two-tab guard, endless shared loss and conflicts, continue solo |
| `WRANGLER=… node scripts/rooms-dev-check.mjs` | 15 checks against real workerd |
| `WRANGLER=… <codex node> scripts/carrot-net-qa/run.mjs` | the Playwright scenarios above (Codex runtime node: it has Playwright) |
| `node scripts/rooms-worker-build.mjs [--check-types F]` | the bundle and `tsc -p backend/rooms` |
| `node scripts/carrot-net-sim.mjs stalls` | stall tables at fixed D |

## 9. Lead and owner steps (not done here)

- `package.json` (lead):
  - `rooms:worker` → `node scripts/rooms-worker-build.mjs`;
  - `rooms:test` → `node scripts/test-rooms-backend.mjs && node scripts/rooms-worker-build.mjs`;
  - `carrot:net-test` → `node scripts/test-carrot-net.mjs && node scripts/test-carrot-session.mjs`;
  - append those to `test`/`carrot:test`;
  - add `backend/rooms/worker.ts backend/rooms/room-core.ts` to `lint`. Both are lint-clean today.
- `.env.example` already exists (Forge and account vars). The lead appends `VITE_ROOMS_URL=` with a comment; this stream
  did not touch the file.
- The golden bridge fixture `docs/carrot-defense/duo/bridge-golden.jsonl` belongs to the lead and is generated by the sim
  stream's `NetBridgeGolden`. `test-carrot-net.mjs` parses every Unity → JS line with `bridge.ts` once the file exists.
- Owner: `npx wrangler login`, then whoami, deploy, optional TURN key (see the backend README). Then re-run
  `rooms-dev-check.mjs --url https://cgs-rooms.<subdomain>.workers.dev --quick` from two networks, and test an iPhone with
  desktop Chrome on campus Wi-Fi and on cellular. Record the URL in `.env.local` and here.

## 10. What the net layer expects from CarrotNetBridge.cs

These are the bridge semantics this side relies on. The golden fixture should pin them.

- `replica.b` is the buffer to keep behind `exec`; if it is absent, use 3. `exec` is a ceiling.
- `import` replaces the instance's state *and clears its queued ops*. The caller re-sends every op with `k > tick`.
- `replay {target, ops, to}` runs silently from the instance's current tick to `to`, applying the given ops on the way,
  and answers `{t:'replayed'}`. The JS side sends it in chunks of 30 ms or less.
- `export {target}` answers `{t:'state', target, tick, b64}`. `target` defaults to `'self'`.
- `tick` may carry `rexec`, the replica's executed tick, which restore uses. Without it the layer falls back to `rd[0]`.
- `partner: cleared` that arrives before our own hold must be remembered (the session also re-sends it).
- `go` applies the own `start` op now (duo). In endless the host's session sends the page command `start`, unfiltered, at
  `goAt`, and it becomes a lockstep intent.
- Digests may be signed 32-bit ints; `bridge.ts` makes them unsigned. NetOp JSON with every field present is normalized.
- `quality('low')` is used once by the slow-peer policy (the existing debug entry).

## 11. Known limits

- iOS Safari, cellular CGNAT and Wi-Fi client isolation could not be tested from one machine. The owner checklist covers
  them. Without a TURN key such pairs play on the relay.
- The relay costs about 66 to 68 billed requests per match-minute, so the Free plan's 100k per day is about 24 relayed
  match-hours per day. P2P matches cost about 10 requests each.
- Endless reload drops intents the rejoiner made in the last few hundred ms before its tab died.
