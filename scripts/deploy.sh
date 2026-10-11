#!/bin/sh
# Build and publish dist/ to the gh-pages branch (GitHub Pages serves it).
# The Actions workflow in docs/deploy-workflow.yml is the nicer path, but it
# needs a token with the 'workflow' scope; this script needs none.
#
# Publishing adds to what is live, it never replaces it: the script clones
# gh-pages, copies the new build over it and pushes a normal commit. Nothing
# already published is deleted, so a game built on another branch stays up,
# and a cached index.html (GitHub Pages keeps it for about 10 minutes) can
# still load the hashed bundle it names. The push is a fast-forward: if
# someone published in the meantime it fails instead of overwriting them, and
# running the script again builds on top of their publish.
set -e
export PATH="$HOME/.local/node/bin:$PATH"
cd "$(dirname "$0")/.."
REMOTE=https://github.com/Erics1129/cornellcgs.git
PAGES=.pages-publish
NAME="$(git config user.name)"
EMAIL="$(git config user.email)"

npm run build
node scripts/stubs.mjs

rm -rf "$PAGES"
git clone -q --depth 1 --branch gh-pages "$REMOTE" "$PAGES"
cp -R dist/. "$PAGES"/
touch "$PAGES/.nojekyll"

cd "$PAGES"
git add -A
if git diff --cached --quiet; then
  echo "nothing new to publish."
else
  git -c user.name="$NAME" -c user.email="$EMAIL" commit -qm "deploy $(date +%Y-%m-%d-%H%M)"
  git push -q "$REMOTE" HEAD:gh-pages
  echo "deployed."
fi
cd .. && rm -rf "$PAGES"
