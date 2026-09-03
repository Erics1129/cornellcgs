#!/bin/sh
# Production preview of the built site (dist) — what the deploy serves.
export PATH="$HOME/.local/node/bin:$PATH"
cd "$(dirname "$0")" && exec npx vite preview --port 5191 --strictPort
