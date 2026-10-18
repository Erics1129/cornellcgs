// Bundles the cgs-rooms Worker (backend/rooms) with esbuild into output/rooms-worker/worker.js and type-checks it.
//   node scripts/rooms-worker-build.mjs                    bundle + tsc -p backend/rooms (the committed runtime subset)
//   node scripts/rooms-worker-build.mjs --check-types F    also compile the Worker against a full `wrangler types` output F
// Deploying is `npx wrangler deploy --config backend/rooms/wrangler.jsonc` (wrangler bundles the same sources itself).
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { dirname, join, relative, resolve } from 'node:path'

const root = resolve(dirname(new URL(import.meta.url).pathname), '..')
const out = join(root, 'output/rooms-worker/worker.js')
await build({ entryPoints: [join(root, 'backend/rooms/worker.ts')], outfile: out, bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: false, external: ['cloudflare:workers'], logLevel: 'warning' })
const size = statSync(out).size, gz = gzipSync(readFileSync(out)).length
console.log(`Worker bundle ready: ${relative(root, out)} (${(size / 1024).toFixed(1)} KiB, ${(gz / 1024).toFixed(1)} KiB gzipped)`)
if (size > 50 * 1024) { console.error('bundle over the 50 KB budget'); process.exit(1) }
const tsc = join(root, 'node_modules/.bin/tsc')
execFileSync(tsc, ['-p', join(root, 'backend/rooms')], { stdio: 'inherit' })
console.log('tsc -p backend/rooms: clean')
const i = process.argv.indexOf('--check-types')
if (i > 0) {
  const types = resolve(process.argv[i + 1])
  const dir = join(root, 'output/rooms-types'); mkdirSync(dir, { recursive: true })
  const cfg = { compilerOptions: { target: 'es2022', module: 'es2022', moduleResolution: 'bundler', strict: true, noEmit: true, lib: ['es2022'], types: [], skipLibCheck: true, allowImportingTsExtensions: true, isolatedModules: true }, files: [join(root, 'backend/rooms/worker.ts'), types] }
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify(cfg, null, 1))
  execFileSync(tsc, ['-p', dir], { stdio: 'inherit' })
  console.log('Worker compiles against the full wrangler types:', types)
}
