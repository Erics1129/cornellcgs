#!/bin/sh
# Local content API for the admin page: wrangler dev with a local KV store.
export PATH="$HOME/.local/node/bin:$PATH"
cd "$(dirname "$0")"
exec npm run api
