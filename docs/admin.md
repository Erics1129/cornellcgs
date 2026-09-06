# The admin page

`https://cornellcgs.org/admin/` — edit every word and photo on the site. It is
not linked from anywhere; you have to type the address. One passcode for the
whole board.

## How it works

GitHub is the server. The published words and photos live in the public repo
**Erics1129/cornellcgs-content**:

- `content.json` — the sections that differ from the site's built-in words
- `images/` — portraits, cropped square, named by content hash
- `admin-key.json` — the admin's GitHub connection, encrypted under the passcode

The site fetches `content.json` from GitHub when it loads and lays it over its
built-in words (`src/lib/liveContent.ts`). Publishing from the admin commits
to that repo through the GitHub API with a fine-grained token that can write
to that one repo and nothing else. Nothing here can change the site's code.

## Connecting (once)

1. Make a token: <https://github.com/settings/personal-access-tokens/new>
   - Repository access: *Only select repositories* → `cornellcgs-content`
   - Repository permissions: *Contents* → *Read and write* (nothing else)
   - Expiration: as long as GitHub allows; run the step below again when it expires
2. In the site repo, with the GitHub CLI signed in:

   ```bash
   npm run admin:connect
   ```

   Paste the token, choose the passcode (default 1234). The script encrypts the
   token and commits `admin-key.json`. Run it again any time to change the
   passcode or the token.

## Using it

Pick a section, change the words or drop a photo, **Preview** to see it on
the real site, **Publish**. The live site picks a publish up within about a
minute. Photos are cropped to a square automatically (top, middle or bottom
of the picture).

## Security, plainly

`admin-key.json` is public. Anyone who downloads it and guesses the passcode
gets the token, which can only edit the words and photos in the content repo
— never the site's code. A four-digit passcode can be guessed by a program in
minutes; a sentence-length one cannot. Change it with `npm run admin:connect`.
If a token ever leaks, revoke it at <https://github.com/settings/tokens> and
connect again.
