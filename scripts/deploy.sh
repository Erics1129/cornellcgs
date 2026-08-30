#!/bin/sh
# Build and publish dist/ to the gh-pages branch (GitHub Pages serves it).
# The Actions workflow in docs/deploy-workflow.yml is the nicer path, but it
# needs a token with the 'workflow' scope — this script needs none.
set -e
export PATH="$HOME/.local/node/bin:$PATH"
cd "$(dirname "$0")/.."
npm run build
cd dist
touch .nojekyll
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C .. config user.name)" -c user.email="$(git -C .. config user.email)" commit -qm "deploy $(date +%Y-%m-%d-%H%M)"
git push -f https://github.com/Erics1129/cornellcgs.git gh-pages:gh-pages
cd .. && rm -rf dist/.git
echo "deployed."
