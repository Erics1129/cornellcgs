import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const { outputText } = ts.transpileModule(await readFile(new URL('../src/content.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } })
const content = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
const bundled = '/Users/eric/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
const { chromium, webkit } = await import(process.env.CGS_PLAYWRIGHT_MODULE || bundled)
const base = process.env.CGS_TEST_URL || 'http://127.0.0.1:5190'
const output = process.env.CGS_SCREENSHOTS || '/tmp/cgs-subpages'
await mkdir(output, { recursive: true })
const path = id => `/${content.pageSlugs[id]}/`
const ids = Object.keys(content.pages)
const graphIds = ['what-we-do', 'ml-process', 'world', 'people', 'advisors']

const visibleCopy = async locator => {
  await locator.evaluate(async el => {
    // IntersectionObserver delivers after layout. Let an initial entrance
    // register before awaiting its finite animation (including Safari).
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const animations = []
    for (let node = el; node && node !== document.body; node = node.parentElement) animations.push(...node.getAnimations())
    await Promise.allSettled(animations.map(animation => animation.finished))
  })
  assert.ok(await locator.isVisible(), 'copy must be visible without an entrance animation')
  assert.ok(await locator.evaluate(el => {
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node)
      if (Number(style.opacity) < .99 || style.visibility !== 'visible') return false
    }
    return true
  }), 'copy and its ancestors stay fully opaque')
}
const pose = page => page.locator('.page-scene__frame').evaluateAll(images => images.map(img => ({ opacity: getComputedStyle(img).opacity, transform: getComputedStyle(img).transform })))

for (const [engine, browserType] of [['Chromium', chromium], ['WebKit', webkit]]) {
  for (const [device, width, height] of [['desktop', 1440, 960], ['phone', 375, 812]]) {
    const testCase = `${engine}-${device}`
    if (process.env.CGS_TEST_CASE && !testCase.match(process.env.CGS_TEST_CASE)) continue
    const browser = await browserType.launch({ headless: true })
    const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 500, hasTouch: width < 500 })
    let overrides = {}
    // Deterministic content also exercises the real admin override loader.
    await context.route(/(?:raw\.githubusercontent\.com|cdn\.jsdelivr\.net).*cornellcgs-content.*content\.json/, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(overrides) }))
    const page = await context.newPage()
    const errors = [], sceneRequests = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => { if (request.url().includes('/assets/page-scenes/')) sceneRequests.push(request.url()) })
    try {
      for (const id of process.env.CGS_TEST_ONLY_RETURN ? [] : ids.filter(id => !process.env.CGS_TEST_PAGE || id.match(process.env.CGS_TEST_PAGE))) {
        sceneRequests.length = 0
        await page.goto(base + path(id))
        const def = content.pages[id]
        await page.waitForSelector(`[data-subpage="${id}"]`)
        await page.evaluate(() => document.fonts.ready)
        assert.equal(new URL(page.url()).pathname, path(id))
        assert.equal(await page.locator('h1').textContent(), def.title)
        await visibleCopy(page.locator('h1'))
        assert.equal(await page.locator('.sp-lead').textContent(), def.lead)
        assert.equal(await page.locator('[data-content-section]').count(), def.sections.length)
        for (const [i, section] of def.sections.entries()) {
          const block = page.locator(`[data-content-section="${i}"]`)
          assert.equal(await block.locator('h2').textContent(), section.heading)
          assert.equal(await block.locator('.sp-body').textContent(), section.body)
          assert.equal(await block.locator('h2').getAttribute('title'), section.alt || null)
          await visibleCopy(block)
          if (section.link) assert.equal(await block.getByRole('link', { name: section.link.label }).getAttribute('href'), section.link.href)
        }
        assert.equal(await page.locator('.sp-footer__bottom p').textContent(), content.site.credit)
        assert.equal(await page.locator('.sp-section__aside').count(), 0, 'one heading per section')
        assert.equal(await page.locator('.code-city, #code-layer-canvas, .poker-stage, .life-float, .life-breathe').count(), 0)
        assert.equal(await page.locator('.sp-brand .cgs-brand-die').count(), 1)
        assert.equal(await page.getByRole('combobox', { name: 'Explore other pages' }).locator('option').count(), 10)
        const scene = page.locator('.page-scene')
        await scene.scrollIntoViewIfNeeded()
        await page.waitForFunction(() => document.querySelector('.page-scene')?.dataset.playback === 'playing')
        assert.equal(await scene.locator('img').count(), 3)
        assert.ok(await scene.locator('img').evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0)))
        assert.equal(new Set(sceneRequests).size, 3)
        assert.ok(sceneRequests.every(url => url.includes(`/page-scenes/${id}/`)), 'only this page loads art')
        const moving = await pose(page)
        await page.waitForTimeout(180)
        assert.notDeepEqual(await pose(page), moving, 'autoplay changes the image transforms')
        await page.getByRole('button', { name: 'Pause scene animation', exact: true }).click()
        await page.waitForFunction(() => document.querySelector('.page-scene').dataset.playback === 'paused')
        await scene.locator('img').evaluateAll(images => Promise.all(images.flatMap(img => img.getAnimations().map(animation => animation.ready))))
        const stopped = await pose(page)
        await page.waitForTimeout(180)
        assert.deepEqual(await pose(page), stopped, 'one button freezes every artwork plane')
        // Seek the actual compositor animations through the five clean states.
        for (const [phase, expected] of [[0,[1,0,0]], [.25,[1,1,0]], [.5,[1,1,1]], [.75,[1,1,0]], [1,[1,0,0]]]) {
          const opacities = await scene.locator('img').evaluateAll((images, phase) => {
            images.forEach(img => img.getAnimations().forEach(animation => { animation.currentTime = Number(animation.effect.getTiming().duration) * phase }))
            return images.map(img => Number(getComputedStyle(img).opacity))
          }, phase)
          assert.deepEqual(opacities, expected, `${id} clean 0→1→2→1→0 holds`)
        }
        await page.getByRole('button', { name: 'Resume scene animation', exact: true }).click()
        // Short pages may keep their artwork in a tall viewport even at the
        // footer. A small viewport makes the offscreen boundary unambiguous.
        await page.setViewportSize({ width, height: 300 })
        await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
        await page.waitForFunction(() => document.querySelector('.page-scene').dataset.playback === 'offscreen')
        const offscreen = await pose(page)
        await page.waitForTimeout(100)
        assert.deepEqual(await pose(page), offscreen)
        await page.setViewportSize({ width, height })
        if (graphIds.includes(id)) {
          const study = page.locator('.sp-study')
          await study.scrollIntoViewIfNeeded()
          await study.locator('canvas').waitFor()
          assert.ok(await study.locator('canvas').evaluate(el => el.width > 50 && el.height > 50))
          assert.equal(await study.getByRole('button').count(), 0, 'study shares one visible pause control')
          await scene.scrollIntoViewIfNeeded()
          await page.getByRole('button', { name: 'Pause scene animation', exact: true }).click()
          await study.scrollIntoViewIfNeeded()
          const canvas = study.locator('canvas')
          const stillCanvas = await canvas.evaluate(el => el.toDataURL())
          await page.waitForTimeout(550)
          assert.equal(await canvas.evaluate(el => el.toDataURL()), stillCanvas, 'page pause freezes the separate graph')
          await scene.scrollIntoViewIfNeeded()
          await page.getByRole('button', { name: 'Resume scene animation', exact: true }).click()
        }
        if (id === 'people') {
          const rows = page.locator('.sp-roster li')
          const people = content.team.flatMap(group => group.people)
          assert.equal(await rows.count(), people.length)
          for (const [i, person] of people.entries()) {
            assert.deepEqual(await rows.nth(i).locator('p').allTextContents(), [person.name, person.major])
            assert.equal(await rows.nth(i).locator('img').count(), 0)
          }
        }
        if (id === 'advisors') {
          await page.locator('.sp-advisor__photo').first().scrollIntoViewIfNeeded()
          await page.waitForFunction(() => [...document.querySelectorAll('.sp-advisor__photo')].every(img => img.complete && img.naturalWidth > 0))
          assert.equal(await page.locator('.sp-advisor__photo').first().getAttribute('alt'), content.advisors[0].name)
          assert.ok(await page.evaluate(() => document.querySelector('.sp-study').getBoundingClientRect().top >= document.querySelector('.sp-faculty').getBoundingClientRect().bottom), 'network has its own area below all portraits')
        }
        if (id === 'join') {
          assert.equal(await page.getByRole('link', { name: 'Book a coffee chat' }).getAttribute('href'), content.pages.join.sections.at(-1).link.href)
          assert.equal(await page.locator('main a[href="mailto:recruitment@cornellcgs.org"]').count(), 1)
        }
        if (id === 'contact') for (const section of def.sections) assert.equal(await page.getByRole('link', { name: section.body, exact: true }).getAttribute('href'), `mailto:${section.body}`)
        await scene.scrollIntoViewIfNeeded()
        await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')) })
        await page.waitForFunction(() => document.querySelector('.page-scene').dataset.playback === 'hidden')
        const hiddenPose = await pose(page)
        await page.waitForTimeout(100)
        assert.deepEqual(await pose(page), hiddenPose, 'hidden tabs suspend the image clock')
        await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')) })
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await scene.scrollIntoViewIfNeeded()
        await page.waitForFunction(() => document.querySelector('.page-scene').dataset.playback === 'reduced')
        assert.deepEqual((await pose(page)).map(p => Number(p.opacity)), [1,0,0])
        const reduced = await pose(page)
        await page.waitForTimeout(120)
        assert.deepEqual(await pose(page), reduced)
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, `${id} no horizontal overflow`)
        await page.evaluate(() => scrollTo(0, 0))
        await page.screenshot({ path: `${output}/${testCase}-${id}.png`, fullPage: true })
        await page.emulateMedia({ reducedMotion: 'no-preference' })
        const next = ids[(ids.indexOf(id) + 1) % ids.length]
        await page.getByRole('combobox', { name: 'Explore other pages' }).selectOption(next)
        await page.waitForURL(base + path(next))
        await page.waitForSelector(`[data-subpage="${next}"]`)
        console.log('PASS', testCase, id, 'content, route, art, pause, RM, navigation, overflow')
      }

      // Published changes replace short defaults, including arbitrary extra sections.
      overrides = { pages: Object.fromEntries(ids.map(id => [id, { ...content.pages[id], title: `Edited ${content.pages[id].title}`, sections: [...content.pages[id].sections, { heading: 'Admin addition', body: 'A published extra section.', link: { label: 'Open contact', href: '/contact/' } }] }])), site: { credit: 'Edited website credit' }, team: [{ label: 'Updated roster', alt: 'Roster detail', people: [{ name: 'Published member', major: 'Published major' }] }], advisors: [{ ...content.advisors[0], name: 'Published advisor', photo: '/assets/team/elsie-lu.jpg' }] }
      for (const id of ids) {
        await page.goto(base + path(id))
        await page.waitForSelector('h1')
        assert.equal(await page.locator('h1').textContent(), overrides.pages[id].title)
        await visibleCopy(page.getByRole('heading', { name: 'Admin addition' }))
        assert.equal(await page.getByRole('link', { name: 'Open contact', exact: true }).getAttribute('href'), '/contact/')
        assert.equal(await page.locator('.sp-footer__bottom p').textContent(), 'Edited website credit')
        if (id === 'people') assert.deepEqual(await page.locator('.sp-roster li p').allTextContents(), ['Published member', 'Published major'])
        if (id === 'advisors') assert.equal(await page.locator('.sp-advisor__photo').getAttribute('src'), '/assets/team/elsie-lu.jpg')
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0)
      }
      overrides = {}

      // Missing later artwork leaves frame zero visible and readable content intact.
      await page.route('**/assets/page-scenes/who-we-are/2.webp', route => route.abort())
      await page.goto(base + path('who-we-are'))
      await page.waitForFunction(() => document.querySelector('.page-scene')?.dataset.playback === 'fallback')
      assert.equal(await page.locator('.page-scene img:visible').count(), 1)
      assert.equal(await page.locator('.page-scene img:visible').getAttribute('data-frame'), '0')
      await visibleCopy(page.locator('h1'))
      await page.unroute('**/assets/page-scenes/who-we-are/2.webp')

      // A real deck visit, including an intervening subpage, retains its exact scroll bookmark.
      await page.goto(base)
      await page.waitForFunction(() => window.__cgsShown === true)
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(700)
      const deckLink = page.locator('.earth-intro-copy a[href="/world/"]')
      await deckLink.focus()
      await page.waitForTimeout(400)
      await page.evaluate(() => window.addEventListener('pagehide', () => sessionStorage.setItem('cgs-test-exit', String(scrollY)), { once: true }))
      await deckLink.click()
      await page.waitForURL(base + path('world'))
      const before = Number(await page.evaluate(() => sessionStorage.getItem('cgs-test-exit')))
      await page.getByRole('link', { name: 'Back', exact: true }).click()
      await page.waitForFunction(() => window.__cgsShown === true)
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(600)
      const after = await page.evaluate(() => scrollY)
      assert.ok(Math.abs(before - after) <= 3, `Back restores exact deck position ${before} → ${after}`)
      await page.locator('.earth-intro-copy a[href="/world/"]').click()
      await page.waitForURL(base + path('world'))
      await page.getByRole('combobox', { name: 'Explore other pages' }).selectOption('contact')
      await page.waitForURL(base + path('contact'))
      await page.getByRole('link', { name: 'Back', exact: true }).click()
      await page.waitForFunction(() => window.__cgsShown === true)
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(600)
      assert.ok(Math.abs(before - await page.evaluate(() => scrollY)) <= 3, 'cross-page exploration retains original deck bookmark')
      assert.deepEqual(errors, [])
      console.log('PASS', testCase, 'all nine admin overrides, fallback, exact Back and cross-page Back; no page errors')
    } finally { await browser.close() }
  }
}
