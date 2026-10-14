// Screenshots of the menus (lobby, stage select, challenges, guide, settings, help) per viewport. node scripts/carrot-ui-qa/menus.mjs [engine]
import { join } from 'node:path'
import { launch, open, seed, outDir, viewports } from './lib.mjs'
const engine = process.argv[2] || 'chromium', browser = await launch(engine)
for (const vp of Object.keys(viewports)) {
  const { context, page } = await open(browser, { viewport: vp, storage: seed(14), base: process.env.BASE || 'http://localhost:5291' })
  await page.waitForSelector('.ct-lobby .ct-cta--hero:not([disabled])'); await page.waitForTimeout(900)
  const shot = n => page.screenshot({ path: join(outDir, `menu-${engine}-${vp}-${n}.png`) })
  await shot('lobby')
  await page.click('.ct-lobby .ct-ghost >> text=Stage select'); await page.waitForTimeout(900); await shot('select')
  await page.click('.ct-chapter >> text=Harvest Road'); await page.waitForTimeout(700); await shot('select-road')
  await page.keyboard.press('Escape'); await page.click('.ct-lobby .ct-ghost >> text=Boss challenges'); await page.waitForTimeout(900); await shot('challenges')
  await page.keyboard.press('Escape'); await page.click('text=Field guide'); await page.waitForTimeout(700); await shot('guide')
  await page.keyboard.press('Escape'); await page.click('[aria-label="Settings"]'); await page.waitForTimeout(500); await shot('settings')
  await page.keyboard.press('Escape'); await page.click('[aria-label="How to play"]'); await page.waitForTimeout(500); await shot('help')
  await context.close()
}
await browser.close()
