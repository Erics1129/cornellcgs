import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'

const modulePath = process.env.CGS_PLAYWRIGHT_MODULE || '/Users/eric/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
const { chromium, webkit } = await import(modulePath)
const base = (process.env.CGS_TEST_URL || 'http://127.0.0.1:5197').replace(/\/$/, '')
const output = process.env.CGS_SCREENSHOTS || '/tmp/cgs-cinematic-films'
const routes = {
  'who-we-are': 'whoWeAre', 'what-we-do': 'whatWeDo', 'ml-process': 'mlProcess',
  events: 'events', world: 'world', people: 'ourTeam', advisors: 'advisors', join: 'join', contact: 'contact',
}
const ids = Object.keys(routes).filter(id => !process.env.CGS_TEST_PAGE || id.match(process.env.CGS_TEST_PAGE))
assert(ids.length, 'page filter must select a route')
await mkdir(output, { recursive: true })
const reports = []
const failures = []

async function posterFallback(browser, name, options, id) {
  // A fresh context prevents a successfully cached film hiding failed-load behavior.
  for (const legacy of [false, true]) {
    const context = await browser.newContext(options)
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      await page.route('**/assets/page-scenes/**/*.mp4', route => route.abort())
      if (legacy) await page.route('**/assets/page-scenes/**/motion-v3.webp', route => route.abort())
      await page.goto(`${base}/${routes[id]}/`)
      await page.locator('.page-scene__window').scrollIntoViewIfNeeded()
      await page.waitForFunction(() => document.querySelector('.page-scene')?.dataset.renderer === 'fallback')
      const poster = page.locator('.page-scene__poster')
      await page.waitForFunction(() => {
        const poster = document.querySelector('.page-scene__poster')
        return poster?.complete && poster.naturalWidth > 0
      })
      assert(await poster.isVisible(), `${id}: failed media retains a visible poster`)
      assert.equal(await poster.getAttribute('src'), `/assets/page-scenes/${id}/${legacy ? 'cinematic-v2' : 'motion-v3'}.webp`)
      assert(await page.locator('.page-scene video').evaluate(video => video.paused), `${id}: failed decoder stays paused`)
      await page.getByRole('button', { name: 'Pause scene animation' }).click()
      await page.getByRole('button', { name: 'Resume scene animation' }).click()
      assert.equal(await page.locator('.page-scene').getAttribute('data-playback'), 'fallback')
      assert.deepEqual(errors, [], `${id}: fallback runtime errors`)
      if (legacy) await page.screenshot({ path: `${output}/${name}-${id}-fallback.png` })
    } finally { await context.close() }
  }
}

for (const [name, engine, options] of [
  ['desktop', chromium, { viewport: { width: 1440, height: 1000 } }],
  ['phone', webkit, { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
]) {
  if (process.env.CGS_TEST_CASE && !name.match(process.env.CGS_TEST_CASE)) continue
  const browser = await engine.launch({ headless: true })
  const context = await browser.newContext(options)
  try {
    for (const id of ids) {
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      try {
      await page.goto(`${base}/${routes[id]}/`)
      assert.equal(new URL(page.url()).pathname, `/${routes[id]}/`, `${id}: canonical route`)
      assert((await page.title()).length > 0, `${id}: page title`)
      assert((await page.locator('h1').innerText()).trim().length > 0, `${id}: meaningful initial content`)
      assert.equal(await page.locator('vite-error-overlay, nextjs-portal').count(), 0, `${id}: framework overlay`)
      const scene = page.locator('.page-scene')
      await page.locator('.page-scene__window').scrollIntoViewIfNeeded()
      await page.waitForFunction(() => document.querySelector('.page-scene')?.dataset.renderer === 'video', null, { timeout: 45000 })
      if (['who-we-are', 'ml-process'].includes(id)) {
        await page.evaluate(async () => { await document.fonts.ready; scrollTo(0, 0) })
        await page.waitForTimeout(400)
        await page.screenshot({ path: `${output}/${name}-${id}-initial.png` })
        await page.locator('.page-scene__window').scrollIntoViewIfNeeded()
        await page.waitForTimeout(300)
      }
      const film = page.locator('.page-scene video')
      const state = () => film.evaluate(video => ({
        time: video.currentTime, paused: video.paused, width: video.videoWidth, height: video.videoHeight,
        duration: video.duration, source: video.currentSrc, error: video.error?.message,
      }))
      await page.waitForTimeout(450)
      const first = await state()
      await page.waitForTimeout(350)
      assert.notEqual((await state()).time, first.time, `${id}: automatic internal motion`)
      assert.equal(first.duration, 8, `${id}: eight-second film`)
      assert(!first.error, `${id}: decoder error`)
      const mobile = name === 'phone', landscape = id === 'events'
      const expected = mobile ? (landscape ? [1280, 720] : [720, 1280]) :
        first.source.includes('-4k.') ? (landscape ? [3840, 2160] : [2160, 3840]) :
          (landscape ? [1920, 1080] : [1080, 1920])
      assert.deepEqual([first.width, first.height], expected, `${id}: native stream dimensions`)
      const sources = await page.evaluate(() => [...new Set(performance.getEntriesByType('resource').filter(entry => /motion-v3-.*\.mp4/.test(entry.name)).map(entry => entry.name))])
      assert.equal(sources.length, 1, `${id}: one requested stream`)
      // Exercise the real loop boundary, without a test-only animation hook.
      await film.evaluate(video => { video.currentTime = video.duration - .15 })
      await page.waitForFunction(() => {
        const video = document.querySelector('.page-scene video')
        return !video.paused && video.currentTime < 2
      }, null, { timeout: 10000 })

      await page.getByRole('button', { name: 'Pause scene animation' }).click()
      await page.waitForTimeout(180)
      const paused = await state()
      await page.evaluate(() => window.scrollBy(0, 60))
      await page.waitForTimeout(200)
      assert.equal((await state()).time, paused.time, `${id}: scroll respects pause`)
      assert((await state()).paused)
      await page.getByRole('button', { name: 'Resume scene animation' }).click()
      await page.waitForTimeout(300)
      assert(!(await state()).paused)

      if (!mobile) {
        const bounds = await page.locator('.page-scene__window').boundingBox()
        for (const [x, y] of [[1, 1], [bounds.width - 1, 1], [bounds.width - 1, bounds.height - 1], [1, bounds.height - 1]]) {
          await page.mouse.move(bounds.x + x, Math.max(1, Math.min(options.viewport.height - 1, bounds.y + y)))
          await page.waitForTimeout(90)
        }
        assert(await page.evaluate(() => {
          const box = document.querySelector('.page-scene__window').getBoundingClientRect()
          const video = document.querySelector('.page-scene video').getBoundingClientRect()
          return video.left <= box.left && video.top <= box.top && video.right >= box.right && video.bottom >= box.bottom
        }), `${id}: picture covers all pointer extremes`)
      }
      for (const delta of [55, -55]) {
        // Start away from the loop seam so playhead direction is unambiguous.
        await film.evaluate(video => { video.currentTime = 3 })
        await page.waitForFunction(() => !document.querySelector('.page-scene video').seeking)
        await page.evaluate(delta => window.scrollBy(0, delta), delta)
        await page.waitForTimeout(60)
        assert.equal(await scene.getAttribute('data-playback'), 'scrubbing', `${id}: scroll takes control`)
        const scrubbed = await state()
        assert(scrubbed.paused, `${id}: scrolling owns the paused decoder`)
        assert(delta > 0 ? scrubbed.time > 3.1 : scrubbed.time < 2.9, `${id}: ${delta > 0 ? 'forward' : 'reverse'} scroll moves the film playhead`)
        await page.waitForTimeout(700)
        assert(!(await state()).paused, `${id}: automatic resume`)
      }
      assert.equal(await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth)), 0, `${id}: no horizontal overflow`)
      await page.screenshot({ path: `${output}/${name}-${id}.png` })
      await page.setViewportSize({ width: options.viewport.width, height: 300 })
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
      await page.waitForFunction(() => document.querySelector('.page-scene')?.dataset.playback === 'offscreen')
      assert((await state()).paused, `${id}: offscreen pause`)
      await page.setViewportSize(options.viewport)
      await page.locator('.page-scene__window').scrollIntoViewIfNeeded()
      await page.waitForTimeout(400)
      assert(!(await state()).paused, `${id}: return without click`)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.waitForTimeout(200)
      assert((await state()).paused, `${id}: live reduced motion`)
      assert.equal(await scene.getAttribute('data-playback'), 'reduced')
      assert(await page.locator('.page-scene__poster').isVisible(), `${id}: reduced motion shows matching still`)
      assert(await page.getByRole('button', { name: 'Scene animation is static' }).isDisabled())
      await page.reload()
      await page.locator('.page-scene__window').scrollIntoViewIfNeeded()
      await page.waitForTimeout(250)
      assert.equal(await film.getAttribute('src'), null, `${id}: no media fetch for reduced motion`)
      assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').filter(entry => /motion-v3-.*\.mp4/.test(entry.name)).length), 0, `${id}: reduced-motion navigation requests no film`)
      assert.deepEqual(errors, [], `${id}: runtime errors`)
      await posterFallback(browser, name, options, id)
      reports.push({ browser: name, id, dimensions: expected, source: first.source, passed: true })
      console.log(`PASS ${name} ${id} ${expected.join('×')}`)
      } catch (error) {
        failures.push(error)
        reports.push({ browser: name, id, passed: false, error: error.message })
        console.error(`FAIL ${name} ${id}: ${error.stack}`)
        await page.screenshot({ path: `${output}/${name}-${id}-FAIL.png` }).catch(() => {})
      } finally { await page.close() }
    }
  } finally { await browser.close() }
}
await writeFile(`${output}/results.json`, JSON.stringify(reports, null, 2))
if (failures.length) throw new AggregateError(failures, `${failures.length} cinematic page/browser combinations failed`)
console.log(`${reports.length} page/browser combinations passed`)
