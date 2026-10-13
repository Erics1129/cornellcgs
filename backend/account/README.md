# Player accounts backend

A Cloudflare Worker + D1 database that lets a player sign in with Google and carry their
mini-game progress (Carrot Defense, Ink Maze, Forge or Fold) between devices.

- `schema.sql` – the two tables (`players`, `progress`). Paste into the D1 console once.
- `worker.ts` – the Worker: Google ID-token verification, signed session tokens, progress routes.
- `wrangler.jsonc` – optional command-line deployment config (placeholders only, no secrets).

Docs live in `docs/accounts/`:

- [SETUP.md](../../docs/accounts/SETUP.md) – click-by-click Google Cloud + Cloudflare setup.
- [HOOKS.md](../../docs/accounts/HOOKS.md) – how a game registers a localStorage key for sync.
- [PRIVACY.md](../../docs/accounts/PRIVACY.md) – what is stored and how a player deletes it.

Limits: 64 KB per record (400 KB for `forge:run`), gzip request bodies accepted (`Content-Type: application/gzip`),
one PUT per 2 s per record, 20 sign-ins per minute per IP, Google's keys kept up to 24 h past their max-age if
Google is unreachable. `/login` and `/me` return the hashed player id so the website can tell whose saves a
shared device holds.

Build the deployable bundle with `npm run account:worker` (writes `output/account-worker/worker.js`).
Run the local test with `node scripts/test-account-backend.mjs` (uses `node:sqlite`, no network).
