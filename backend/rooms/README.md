# cgs-rooms: Carrot Defense duo rooms

A Cloudflare Worker with one SQLite-backed Durable Object per room code. It runs the lobby, the side draw, start and go
stamps, WebRTC signalling, the gameplay relay (the fallback path when the DataChannel is down), pause/resume/speed
serialization, results and the reconnect grace. It is a new Worker: `backend/account` and `backend/forge` are untouched.

- `room-core.ts`: the room state machine. It has no Cloudflare types and no timers, and every entry point returns actions.
- `worker.ts`: the Durable Object adapter. It uses WebSocket hibernation (`ctx.acceptWebSocket`, `serializeAttachment`, a
  runtime auto-response for `ping`), alarms for the grace, empty-room and TTL cleanups, and the HTTP routes. A Worker
  module may export only handlers and classes.
- `wrangler.jsonc`: `name: cgs-rooms`, `new_sqlite_classes: ["Room"]` (the only kind the Free plan allows), `workers_dev`.
  `env.dev` also allows localhost and private LAN origins.
- `runtime.d.ts` + `tsconfig.json`: the subset of the Workers runtime used here, so `tsc -p backend/rooms` type-checks with
  the site's own TypeScript. `node scripts/rooms-worker-build.mjs --check-types <worker-configuration.d.ts>` also compiles
  the Worker against a full `wrangler types` output.

The protocol is the room section of `src/minigames/carrot/net/protocol.ts`, explained in
[docs/carrot-defense/duo/netcode.md](../../docs/carrot-defense/duo/netcode.md).

## Routes

| Route | Answer |
|---|---|
| `OPTIONS *` | CORS preflight |
| `POST /rooms {ver}` | `{code}`. Returns 429 or 503 `busy` when the Durable Object quota is used up. |
| `GET /rooms/:code[?ver&pid&stats]` | `RoomPeek`. Returns 404, 409 or 403 with an `error` code when a join would be refused, so it can be read by `fetch`. |
| `GET /rooms/:code/ws?pid&name&ver` | WebSocket. On a refusal the server accepts the socket, sends `{t:'error', code}` and closes with 44xx, because a browser cannot read the HTTP status of a refused upgrade. |
| `GET /turn` | `{iceServers}` from Cloudflare Realtime TURN when `TURN_KEY_ID` and `TURN_KEY_API_TOKEN` are set, otherwise `[]`. |
| `GET /health` | `ok` |

Limits, enforced per socket (excess messages are dropped and counted):
- text messages: 4 KB, 50 per second;
- binary frames: 1,200 B, 64 per second;
- state chunks (kind 3): their own budget of 32 KB/s.

The grace is 60 s. Empty rooms are deleted after 10 min, and every room has a 3 h TTL.

## Commands

```
node scripts/test-rooms-backend.mjs                     # 69 in-process checks on a fake Workers runtime (no wrangler)
node scripts/rooms-worker-build.mjs                     # esbuild bundle (output/rooms-worker/worker.js, ~28 KiB) + tsc -p backend/rooms
WRANGLER=<wrangler 4> node scripts/rooms-dev-check.mjs  # against wrangler dev --local: refusals, hibernation and wake, relay RTT, rejoin, cleanup
npx wrangler deploy --dry-run --config backend/rooms/wrangler.jsonc --env ""
```

wrangler is not a dependency of the site. Any wrangler 4 install works; the netcode probe's install is at
`scratchpad/carrot-duo/netcode/rooms-ref/node_modules/.bin/wrangler`.

## Deploy (owner, at integration)

1. `npx wrangler login`, then `npx wrangler whoami` to confirm the account.
2. `npx wrangler deploy --config backend/rooms/wrangler.jsonc --env ""`. A Free account accepts only SQLite-backed classes,
   so a successful deploy also confirms that Durable Objects work on this plan. If the deploy is refused, the fallback is
   Workers Paid at $5/month; the multiplayer entry stays hidden until then.
3. Optional TURN: create a Realtime TURN key in the dashboard, then
   `npx wrangler secret put TURN_KEY_ID --config backend/rooms/wrangler.jsonc` and the same for `TURN_KEY_API_TOKEN`.
4. Put `VITE_ROOMS_URL=https://cgs-rooms.<subdomain>.workers.dev` in `.env.local` (the existing convention) and record it in
   `docs/carrot-defense/duo/netcode.md`.

Deploying disconnects every socket, so deploy outside play hours.
