#!/bin/sh
# Build and publish dist/ to the gh-pages branch (GitHub Pages serves it).
# The Actions workflow in docs/deploy-workflow.yml is the nicer path, but it
# needs a token with the 'workflow' scope — this script needs none.
set -e
export PATH="$HOME/.local/node/bin:$PATH"
cd "$(dirname "$0")/.."
npm run build
node scripts/stubs.mjs

# GitHub Pages caches index.html for ~10 minutes; a force-replaced bundle
# would 404 for anyone holding the cached HTML ("nothing shows" bug). Keep
# every previously deployed hashed asset alongside the new build.
rm -rf .prev-pages
if git clone -q --depth 1 --branch gh-pages https://github.com/Erics1129/cornellcgs.git .prev-pages 2>/dev/null; then
  if [ -d .prev-pages/assets ]; then
    for f in .prev-pages/assets/*; do
      b=$(basename "$f")
      [ -e "dist/assets/$b" ] || cp "$f" "dist/assets/$b"
    done
  fi
fi
rm -rf .prev-pages

cd dist
touch .nojekyll
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C .. config user.name)" -c user.email="$(git -C .. config user.email)" commit -qm "deploy $(date +%Y-%m-%d-%H%M)"
git push -f https://github.com/Erics1129/cornellcgs.git gh-pages:gh-pages
cd .. && rm -rf dist/.git
echo "deployed."
