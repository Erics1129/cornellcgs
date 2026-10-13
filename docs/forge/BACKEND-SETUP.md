# Enable the worldwide board

The website is static GitHub Pages. The small **Cloudflare Worker + D1** backend is separate: the Worker issues run tickets, replays every submitted action, calculates the surviving knife's score, and accesses D1 through a private binding. The public website contains only the Worker URL. Cloudflare's free tiers have quotas; request failure automatically falls back to local scores. No always-running server or database password in the browser is needed.

You create the Cloudflare account. Nothing here requires moving `cornellcgs.org` DNS.

## Dashboard setup

1. Sign in at [Cloudflare dashboard](https://dash.cloudflare.com/).
2. Open **Storage & databases → D1 SQL Database → Create database**. Name it `cgs-forge`, choose the default location and create it.
3. Open that database's **Console**. Copy the complete contents of `backend/forge/schema.sql`, paste it into the SQL editor and run it. The three tables are `players`, `runs` and `scores`. If the console accepts one statement at a time, run each semicolon-terminated statement separately.
4. In the repository run `npm run forge:worker`. This creates a single deployable file, `output/forge-worker/worker.js`; it contains no credentials.
5. Open **Workers & Pages → Create application → Create Worker** (or **Start with Hello World**). Name it `cgs-forge-leaderboard`, then deploy the starter.
6. Open **Edit code**, replace the starter file with the complete generated `output/forge-worker/worker.js`, then **Deploy**. Keep it as an ES module with its default export.
7. In the Worker's **Bindings**, choose **Add binding → D1 database**. Variable name: **`DB`**. Select the database **`cgs-forge`**, save and deploy if prompted.
8. Under the Worker's **Settings → Variables and secrets**, add a text variable named **`ALLOWED_ORIGIN`**, with this exact value:

   ```text
   https://cornellcgs.org,https://www.cornellcgs.org
   ```

   For local testing, append `,http://127.0.0.1:5212`. Origins include the scheme and port, never a trailing slash or route.
9. Copy the Worker's public `https://cgs-forge-leaderboard.<your-subdomain>.workers.dev` URL. Open `<that URL>/scores`; it should return `{"scores":[],"player":null}` after the binding and variable are set.
10. Create an untracked `.env.local` in the website repository:

    ```dotenv
    VITE_FORGE_API_URL=https://cgs-forge-leaderboard.YOUR-SUBDOMAIN.workers.dev
    ```

    Replace only the URL with your actual Worker URL. This URL is public; do not paste an API token or secret here.
11. Rebuild and publish the website (`npm run build`, `node scripts/stubs.mjs`, then the existing hosting deployment). Vite embeds the public URL during the build; setting it after building has no effect.
12. Open the game and start a **new run**. Fresh untouched runs request a ticket automatically. An already-started local run stays local. The leaderboard also offers **Start a verified run** when a backend is configured but the current run has no ticket. Finish day ten and save your score. Check the board from a second device.

The setup menu labels can vary slightly as Cloudflare updates its dashboard; the required resources and names are always one D1 database, one Worker, binding `DB`, and variable `ALLOWED_ORIGIN`.

## Optional command-line deployment

If you prefer Wrangler, replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` in `backend/forge/wrangler.jsonc` with the ID shown on the database's Overview page. Then, after `npx wrangler login`:

```sh
npx wrangler d1 execute cgs-forge --remote --config backend/forge/wrangler.jsonc --file backend/forge/schema.sql
npx wrangler deploy --config backend/forge/wrangler.jsonc
```

Do not commit Cloudflare tokens. The `.dev.vars`, `.env.local` and Wrangler local-state files are ignored.

## Checks and limits

- Server-computed value, legal ownership, day progression, inventory/resources, rule version, run expiry, and minimum elapsed hit time are validated.
- Start and submit requests are limited to one per minute per device identity. A run ticket is single-use, expires after ten days (as many as the run has), and retains only that player's highest score. Requests are capped at 600 KB and 12,000 actions.
- Clearing browser storage loses the old identity; there is no cross-device account recovery. Names are public and cleaned to letters/numbers/basic punctuation, capped at 20 characters.
- If a submission fails, the score is saved locally. Start a fresh verified run if the original ticket has expired. A local score cannot be retroactively verified.
- Worker integration is tested locally against SQLite. Production account creation, binding and live end-to-end validation require your account setup.

Sources: [D1 getting started](https://developers.cloudflare.com/d1/get-started/), [D1 pricing and free quotas](https://developers.cloudflare.com/d1/platform/pricing/), [Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/).
