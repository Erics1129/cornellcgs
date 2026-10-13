# Player accounts: setup

Players can sign in with Google on `/minigames/` or in any mini-game's top bar; their progress for
Carrot Defense, Ink Maze and Forge or Fold then follows them to every device. The website stays a
static GitHub Pages site. The account service is a small **Cloudflare Worker + D1 database**,
separate from the Forge leaderboard Worker, and both Google and Cloudflare parts fit in the free tiers.

Three things are true by design:

- **Nothing secret goes in the repository.** The website only embeds two public identifiers (the
  Worker URL and the Google client ID). The one secret, `SESSION_SECRET`, lives in the Cloudflare
  dashboard as an encrypted secret.
- **Players keep playing if the service is down.** Progress is always saved in the browser first; the
  server copy is a mirror. Sign-in simply shows nothing until you finish this setup.
- **No email is stored.** See [PRIVACY.md](PRIVACY.md).

You need: a Google account, a Cloudflare account, and the repository checked out with Node.

## Part 1 – Google: an OAuth client ID

This gives the "Sign in with Google" button an identity. The client ID is public; there is no client
secret in this flow (the website never receives one).

1. Open <https://console.cloud.google.com/> and sign in.
2. Top bar → the **project picker** (next to the Google Cloud logo) → **New project**. Name:
   `Cornell CGS`. Click **Create**, wait for the notification, then pick the new project in
   the same picker.
3. Left menu → **APIs & Services** → **OAuth consent screen**. (Google is renaming this area
   **Google Auth Platform**; if you land on an **Overview** page with a **Get started** button, click
   it. Both paths ask the same questions.)
   - **App name:** `Cornell CGS`. **User support email:** your address.
   - **Audience / User type:** **External**.
   - **Contact information / Developer email:** your address.
   - Agree to the policy checkbox, **Continue**, **Create**.
   - No extra scopes are needed: the button only uses the basic `openid` and `profile` scopes.
4. **Branding** page: Google will not publish an external app until the **App domain** links are
   filled in. Set *Application home page* `https://cornellcgs.org`, *privacy policy*
   `https://cornellcgs.org/privacy/`, *terms of service* `https://cornellcgs.org/terms/` (both pages
   exist on the site, see `pages.privacy` and `pages.terms` in `src/content.ts`), add `cornellcgs.org`
   under **Authorized domains**, **Save**. Then on the **Audience** page click **Publish app** →
   **Confirm**. This moves the app from **Testing** to
   **In production**. Basic scopes need no Google verification; staying in Testing would cap
   sign-ins at 100 test users and show a scary warning to everyone.
5. Left menu → **APIs & Services** → **Credentials** (**Clients** in the new UI) → **Create
   credentials** → **OAuth client ID**.
   - **Application type:** **Web application**. **Name:** `cornellcgs.org`.
   - **Authorized JavaScript origins** → **Add URI**, one at a time:

     ```text
     https://cornellcgs.org
     https://www.cornellcgs.org
     http://localhost:5190
     ```

     (`http://localhost:5190` is the `npm run dev` origin; remove it later if you prefer.)
   - **Authorized redirect URIs:** leave empty. The button uses a popup, not a redirect.
   - Click **Create**.
6. A dialog shows **Your Client ID**, a long string ending in `.apps.googleusercontent.com`. Copy
   it; you will paste it twice (Cloudflare variable and `.env.local`). Ignore the client secret if
   one is shown; it is never used and must not be pasted anywhere.

## Part 2 – Cloudflare: the database and the Worker

1. Sign in at <https://dash.cloudflare.com/>.
2. Left menu → **Storage & Databases** → **D1 SQL Database** → **Create Database**. Name:
   `cgs-accounts`. Keep the default location. **Create**.
3. On the database page open the **Console** tab. Copy the whole contents of
   `backend/account/schema.sql`, paste it into the editor and click **Execute**. You should see two
   tables, `players` and `progress`, under the **Tables** tab. If the console accepts one statement
   at a time, run each `CREATE TABLE` separately.
4. In the repository run:

   ```sh
   npm run account:worker
   ```

   This writes a single file, `output/account-worker/worker.js`. It contains no credentials.
5. Left menu → **Workers & Pages** → **Create** → under **Workers** choose **Start with Hello
   World!** (or **Create Worker**). Name: `cgs-accounts`. Click **Deploy** to create the starter.
6. On the Worker page click **Edit code**. Select everything in the editor, delete it, paste the
   whole generated `output/account-worker/worker.js`, then **Deploy** (top right). Keep it as an ES
   module with a default export, which the generated file already is.
7. Back on the Worker page → **Settings** → **Bindings** → **Add** → **D1 database**.
   - **Variable name:** `DB` (exactly, capitals).
   - **D1 database:** `cgs-accounts`.
   - **Deploy** / **Save**.
8. **Settings** → **Variables and Secrets** → **Add**, three times:

   | Type | Variable name | Value |
   |---|---|---|
   | **Text** | `ALLOWED_ORIGIN` | `https://cornellcgs.org,https://www.cornellcgs.org` |
   | **Text** | `GOOGLE_CLIENT_ID` | the Client ID from Part 1, step 6 |
   | **Secret** | `SESSION_SECRET` | a fresh random string, see below |

   For `SESSION_SECRET`, generate the value in a terminal and paste the output:

   ```sh
   openssl rand -base64 48
   ```

   Choose type **Secret** (older dashboards: type **Text** and click **Encrypt**). After saving,
   Cloudflare never shows it again, which is correct. Do not paste it into the repo, a chat, a
   note or `.env.local`. If it ever leaks, add a new one here: every player is signed out once and
   signs in again; no progress is lost. Minimum length is 32 characters; the Worker refuses to run
   with a shorter one.

   For local development append `,http://localhost:5190` to `ALLOWED_ORIGIN`. Origins include the
   scheme and port and never a trailing slash or path.

   Click **Deploy** after adding the variables.
9. Copy the Worker's public URL from its page: `https://cgs-accounts.<your-subdomain>.workers.dev`.
   Open it in a browser. You should see:

   ```json
   {"ok":true,"service":"cgs-account"}
   ```

   If you instead see `{"ok":false,"error":"..."}` the message names the missing binding, variable
   or secret from steps 7 and 8.

### Recommended: a rate-limiting rule for sign-in

Each `POST /login` costs the Worker a signature check and three database queries, and the free plan
counts every request. The Worker itself allows 20 sign-in attempts per minute per IP address, but one
rule at the edge keeps a script from burning the daily budget at all. The free plan includes one
rate-limiting rule:

1. Left menu → **Security** → **WAF** → **Rate limiting rules** → **Create rule** (on a zone-less
   account the Worker's own page has **Settings** → **Security** → **Rate limiting**; the fields are
   the same).
2. **Rule name:** `cgs-account sign-in`.
3. **If incoming requests match:** field **URI Path**, operator **equals**, value `/login`; **And**
   field **Request Method**, operator **equals**, value `POST`. (Or use the **Hostname** of the Worker,
   `cgs-account.<your-subdomain>.workers.dev`, to cover every route.)
4. **With the same characteristics:** **IP**. **When rate exceeds:** `20` requests per `1 minute`.
5. **Then take action:** **Block**, for `1 minute`. **Deploy**.

If the rule editor is not offered for `workers.dev` on your plan, skip this: the in-Worker limit
still applies and players are never affected by it (one sign-in is one request).

## Part 3 – Website

1. In the repository create (or extend) the untracked file `.env.local`:

   ```dotenv
   VITE_ACCOUNT_API_URL=https://cgs-accounts.YOUR-SUBDOMAIN.workers.dev
   VITE_GOOGLE_CLIENT_ID=YOUR-CLIENT-ID.apps.googleusercontent.com
   ```

   Both values are public identifiers, not secrets, but `.env.local` is git-ignored all the same.
   `.env.example` lists the names.
2. Rebuild and publish the site as usual (`npm run build`, `node scripts/stubs.mjs`, then the
   existing deployment). Vite embeds the two values at build time; setting them after building has
   no effect. The sign-in control renders only when both are set, so nothing changes for players
   until this deploy.

## Part 4 – Verify

1. Open `https://cornellcgs.org/minigames/`. A **Sign in with Google** button sits at the right of
   the top bar. Sign in; it turns into your avatar.
2. Play a Carrot Defense level and earn a medal.
3. On a second device (or a private window) sign in with the same Google account and open Carrot
   Defense: the medal is there. Sign out from the menu on one device; the other device is signed
   out too the next time it talks to the server (this is intentional, see PRIVACY.md).

### Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Button shows an error `The given origin is not allowed for the given client ID` (browser console: `[GSI_LOGGER]`) | The page origin is missing from the client | Part 1 step 5: add the exact origin, including `www.` or the port. Changes take a few minutes. |
| Sign-in popup works but the control says it could not sign in; Worker answers **401** on `/login` | `GOOGLE_CLIENT_ID` in Cloudflare differs from `VITE_GOOGLE_CLIENT_ID` in the build | Paste the same Client ID in both places; redeploy the Worker or rebuild the site. |
| Worker URL shows `{"ok":false,...}` or every request is **503** | `DB` binding, `GOOGLE_CLIENT_ID` or `SESSION_SECRET` missing | Part 2 steps 7–8; the message says which. |
| Browser console shows a CORS error and requests fail | `ALLOWED_ORIGIN` does not contain the page origin | Part 2 step 8; no trailing slash; `www` and non-`www` are different origins. |
| Nothing appears at all | The build has no `VITE_ACCOUNT_API_URL` / `VITE_GOOGLE_CLIENT_ID` | Part 3; rebuild. |
| `Please sign in again.` after being signed in | The session expired (30 days), or a sign-out happened on another device, or `SESSION_SECRET` was changed | Sign in again; local progress is untouched. |
| A panel says the device holds saves from a different account | Someone else was signed in on this browser and did not use **Sign out and clear this device** | Pick **Use my account's progress** (replaces the device's saves) or **Merge this device's saves in**; see PRIVACY.md. |

## Optional: deploy from the command line

If you prefer Wrangler to the dashboard: put the database ID from the D1 **Overview** page into
`backend/account/wrangler.jsonc` (replace `REPLACE_WITH_YOUR_D1_DATABASE_ID`) and your Client ID
(replace `REPLACE_WITH_YOUR_GOOGLE_CLIENT_ID...`). Then:

```sh
npx wrangler login
npx wrangler d1 execute cgs-accounts --remote --config backend/account/wrangler.jsonc --file backend/account/schema.sql
npx wrangler secret put SESSION_SECRET --config backend/account/wrangler.jsonc   # paste `openssl rand -base64 48` output when prompted
npx wrangler deploy --config backend/account/wrangler.jsonc
```

Wrangler is not a project dependency; `npx` fetches it. Do not commit Cloudflare tokens; `.dev.vars`,
`.env.local` and Wrangler state are git-ignored.

## Limits and what is stored

- One progress record per game key, at most 32 records per player, 64 KB each (400 KB for the Forge
  run, which is an action log; the website gzips large saves on the wire), one save per 2 seconds per
  record (the website waits longer than that on its own). Sign-in attempts are limited to 20 per
  minute per IP address. Sessions last 30 days and are renewed on every sign-in.
- The Worker verifies Google ID tokens itself (signature against Google's published keys, audience,
  issuer, expiry) and then issues its own signed session token. The Google token is used once and
  never stored. Google's keys are cached for their published max-age and, if Google cannot be
  reached when they expire, kept for up to 24 more hours so a hiccup there does not block sign-in.
- Cloudflare's free tier allows 100,000 Worker requests and 5 million D1 row reads per day, far
  above a club site's needs. If a quota is hit, players see nothing: saves stay in the browser and
  are pushed later.
- Stored data and how a player deletes it: [PRIVACY.md](PRIVACY.md). How a game hooks its saves in:
  [HOOKS.md](HOOKS.md).
- The Worker is tested locally against SQLite (`node scripts/test-account-backend.mjs`, part of
  `npm test`) with a locally generated RSA key pair standing in for Google. Live end-to-end checks
  need the real accounts above.

Sources: [Google Identity Services, Sign in with Google for Web](https://developers.google.com/identity/gsi/web/guides/overview),
[Verify the Google ID token](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token),
[Cloudflare D1 getting started](https://developers.cloudflare.com/d1/get-started/),
[Workers environment variables and secrets](https://developers.cloudflare.com/workers/configuration/environment-variables/),
[Workers free plan limits](https://developers.cloudflare.com/workers/platform/limits/).
