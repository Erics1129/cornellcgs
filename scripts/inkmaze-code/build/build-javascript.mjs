#!/usr/bin/env node
/*
 * Bundles scripts/inkmaze-code/build/js-runtime.src.js (+ quickjs-emscripten-core
 * and the release-sync wasm variant + the harness) into one ES module
 *   public/minigames/ink-maze-code/javascript/runtime.js
 * and copies the QuickJS wasm to
 *   public/minigames/ink-maze-code/javascript/quickjs.wasm
 *
 * The npm packages live in the research scratch workspace (pinned there, offline);
 * override with INK_NPM=/path/to/node_modules. Run with the repo's Node 24:
 *   export PATH="$HOME/.local/node/bin:$PATH"
 *   node scripts/inkmaze-code/build/build-javascript.mjs
 */
import { build } from 'esbuild'
import { copyFileSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const REPO = fileURLToPath(new URL('../../../', import.meta.url))
const SRC = fileURLToPath(new URL('./js-runtime.src.js', import.meta.url))
const OUT_DIR = REPO + 'public/minigames/ink-maze-code/javascript/'
const NPM = process.env.INK_NPM || '/private/tmp/claude-501/-Users-eric-Claude/c0f378b2-d447-4405-9fc6-aa152072f6bd/scratchpad/ide/python/npm/node_modules'

mkdirSync(OUT_DIR, { recursive: true })

await build({
  entryPoints: [SRC],
  bundle: true,
  format: 'esm',
  minify: true,
  outfile: OUT_DIR + 'runtime.js',
  nodePaths: [NPM],
  platform: 'browser',
  target: 'es2022',
  legalComments: 'none',
  plugins: [{
    name: 'text',
    setup(b) {
      b.onResolve({ filter: /\?text$/ }, (a) => ({ path: fileURLToPath(new URL(a.path.replace(/\?text$/, ''), 'file://' + a.resolveDir + '/')), namespace: 'text' }))
      b.onLoad({ filter: /.*/, namespace: 'text' }, (a) => ({ contents: readFileSync(a.path, 'utf8'), loader: 'text' }))
    },
  }],
  logLevel: 'warning',
})

copyFileSync(NPM + '/@jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.wasm', OUT_DIR + 'quickjs.wasm')
console.log('runtime.js', statSync(OUT_DIR + 'runtime.js').size, 'bytes; quickjs.wasm', statSync(OUT_DIR + 'quickjs.wasm').size, 'bytes')
