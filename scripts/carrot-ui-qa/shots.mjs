// Screenshots of every fixture in every viewport (mock player). node scripts/carrot-ui-qa/shots.mjs [chromium|webkit] [fixture,...] [viewport,...]
import { join } from 'node:path'
import { launch, open, enter, fixture, seed, outDir, viewports } from './lib.mjs'
const [engine = 'chromium', only = '', vps = ''] = process.argv.slice(2)
const names = only ? only.split(',') : ['ready', 'pad', 'tower', 'waveAir', 'bossUproot', 'challengeDeadline', 'won', 'lost', 'v1-waveAir', 'v1-bossUproot']
const browser = await launch(engine)
for (const vp of vps ? vps.split(',') : Object.keys(viewports)) {
  const { context, page } = await open(browser, { viewport: vp, storage: seed(8), base: process.env.BASE || 'http://localhost:5291' })
  await enter(page)
  for (const name of names) {
    await fixture(page, name, name === 'pad' ? { padIndex: 4 } : {})
    await page.waitForTimeout(name === 'won' || name === 'lost' ? 1900 : 500)
    await page.screenshot({ path: join(outDir, `${engine}-${vp}-${name}.png`) })
  }
  await context.close()
}
await browser.close()
console.log('shots in', outDir)
