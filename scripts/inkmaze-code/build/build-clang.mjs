#!/usr/bin/env node
/*
 * Bundles src/minigames/inkmaze/code/runtimes/c.ts into the one ES module the
 * sandbox loads for C and C++:
 *   public/minigames/ink-maze-code/clang/runtime.js
 *
 * The runtime imports only types from contract.ts (erased), and loads the big
 * Clang/LLD toolchain from the pinned jsDelivr URL at run time (a dynamic
 * import of a URL variable, which esbuild leaves in place), so this bundle is
 * tiny and self-hosts nothing but the harness sources already in clang/.
 *
 * Run with the repo's Node 24:
 *   export PATH="$HOME/.local/node/bin:$PATH"
 *   node scripts/inkmaze-code/build/build-clang.mjs
 */
import { build } from 'esbuild'
import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const REPO = fileURLToPath(new URL('../../../', import.meta.url))
const SRC = REPO + 'src/minigames/inkmaze/code/runtimes/c.ts'
const OUT = REPO + 'public/minigames/ink-maze-code/clang/runtime.js'

const result = await build({
  entryPoints: [SRC],
  bundle: true,
  format: 'esm',
  minify: true,
  outfile: OUT,
  platform: 'browser',
  target: 'es2022',
  legalComments: 'none',
  // the only import is `import type ... from '../contract.ts'` (erased); nothing else is pulled in
  external: ['../contract.ts', './contract.ts'],
  logLevel: 'warning',
})
for (const w of result.warnings) console.warn(w.text)

const text = readFileSync(OUT, 'utf8')
if (!/export\{[^}]*\bas default\b|export default/.test(text) && !/\bas default\}/.test(text)) {
  throw new Error('runtime.js has no default export')
}
if (/from"\.\.?\/contract/.test(text)) throw new Error('runtime.js still imports contract.ts at runtime (should be type-only)')
console.log('runtime.js', statSync(OUT).size, 'bytes')
