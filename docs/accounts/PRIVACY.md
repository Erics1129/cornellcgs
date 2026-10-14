# Player accounts: privacy

Signing in is optional. Every mini-game works signed out exactly as before, saving only in the
browser. Signing in with Google adds a server copy of that same progress so it follows the player to
other devices. This page says precisely what that server copy contains and how to remove it.

## What is stored

In one Cloudflare D1 database owned by the club, two tables:

| Table | Column | Content |
|---|---|---|
| `players` | `id` | the SHA-256 hash of the Google account id (`sub`). The id itself is not stored, and the hash cannot be turned back into it or looked up at Google. |
| | `name`, `picture` | the display name and profile-picture URL Google sends with the sign-in, refreshed on every sign-in. Shown only to the player, in the sign-in menu. |
| | `created`, `last_login` | timestamps (ms). |
| | `session_version` | a counter that invalidates old sign-ins (see below). |
| `progress` | `game` | which save it is, e.g. `carrot:campaign`, `inkmaze:best`, `forge:run`. |
| | `data` | the game's save as JSON, the same bytes the game keeps in the browser: unlocked levels, medals, best ink/moves per maze, the current Forge run and its local score list, a sound on/off preference. |
| | `updated`, `version`, `last_put` | timestamps and a write counter used for merging and rate limiting. |

A record is at most 64 KB (400 KB for the Forge run, an action log), 32 records per player; records are
deleted with the player (`ON DELETE CASCADE`).

## What is not stored

- **Email address.** The Google token contains it; the Worker never reads that field and no column
  exists for it. The club cannot email a player from this data.
- **The Google token.** It is verified once at sign-in and discarded. The website keeps only a session
  token minted by the club's own Worker.
- **Passwords.** There are none; Google handles authentication.
- **IP addresses, analytics, browsing.** The Worker keeps no logs of its own; it counts sign-in
  attempts per IP address in memory for one minute to blunt abuse and never writes them anywhere.
  Cloudflare's standard platform logs apply to any Worker and are not read by the club.
- **Anything from the home page or the rest of the site.** The sign-in control exists only on
  `/minigames/` and in the mini-game top bar.

The database is reachable only through the Worker, which answers only to the club's website origins.
There is no public database endpoint and no credential in the website.

## Sessions

Signing in creates a signed session token stored in that browser (localStorage) for 30 days. **Signing
out signs out every device** on which the account is signed in: the Worker increments a per-player
counter and every older token stops working. This is deliberate so that a sign-out on a shared lab
computer is complete.

## Shared computers

The saves in a browser stay there after a sign-out, so the website remembers (in `cgs-account-meta-v1`,
in that browser only) which account they were last merged with. It uses the hashed player id the
Worker returns on sign-in; nothing else about the account is kept in the browser besides the session.

- **Sign out and clear this device…** in the sign-in menu signs out and removes every game save from
  that browser. Use it on a computer other people use.
- If someone signs in with a **different** account while the previous player's saves are still there,
  nothing is merged or sent. A small panel asks the new player to choose: *use my account's progress*
  (the device's saves are removed and replaced by the account's copy) or *merge this device's saves
  in* (they are combined as on a first sign-in). In both cases the previous player's Forge leaderboard
  identity and proof are removed, never carried into the other account.
- The first sign-in on a device merges whatever the browser holds (guest progress) into the account:
  that is the expected path for a player who starts without an account.

## Deleting the data

In the sign-in menu (click the avatar on `/minigames/` or in a game's top bar) choose **Delete
account…** and confirm. The Worker deletes the player's `progress` rows and `players` row in one
transaction, immediately and without a grace period. Nothing remains to recover.

The delete first invalidates every session token, in the same transaction, so a save request that was
already in flight from another tab cannot recreate anything afterwards.

Deleting the account does **not** touch the saves in the browser: the player keeps playing with
their local progress, exactly as a signed-out player. Signing in again later starts a fresh, empty
server account that is filled from whatever the browser has at that moment.

A player who cannot use the menu (for example, lost access to the Google account) can ask the club;
with the Google account id (`sub`) or by signing in once, a maintainer can run the same deletion in
the D1 console (`DELETE FROM progress WHERE player_id = ?; DELETE FROM players WHERE id = ?;`).

## Google's side

Google records that the player used "Sign in with Google" on `Cornell CGS games`. The player can
review and remove that at <https://myaccount.google.com/connections>. Removing it there does not
delete the club's copy; use the menu above for that.
