// Regenerates every derived asset of the scroll-core stream, in dependency order.
// (Wire it as `npm run cinema:assets` -> `node scripts/cinema/assets.mjs` in package.json at integration.)
// The black-hole re-encode itself needs Blender and is a separate, slow step: see scripts/cinema/assets-scroll-core.md.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
const here = path.dirname(new URL(import.meta.url).pathname)
for (const script of ['stills.mjs', 'soda-proxy.mjs', 'lqip.mjs']) {
  console.log(`\n== ${script}`)
  const r = spawnSync(process.execPath, [path.join(here, script)], { stdio: 'inherit' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}
