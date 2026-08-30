#!/bin/sh
# Dev server launcher — puts the local Node install on PATH first.
export PATH="$HOME/.local/node/bin:$PATH"
cd "$(dirname "$0")"
exec npm run dev
