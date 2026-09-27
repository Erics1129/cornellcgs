import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

// Production smoke tests; none of these helpers require window.__pageScene.
// The DEV-only motion suite imports the same browser/GL/HMR harness below.
const require = createRequire(import.meta.url)
const ts = require('typescript')
const { outputText } = ts.transpileModule(await readFile(new URL('../src/content.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } })
export const content = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
const bundled = '/Users/eric/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
const playwrightModule = process.env.CGS_PLAYWRIGHT_MODULE || bundled
export const { chromium, webkit } = await import(playwrightModule)
export const { PNG } = createRequire(require.resolve(playwrightModule))('pngjs')
const isProductionSuite = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
export const base = (process.env.CGS_TEST_URL || `http://127.0.0.1:${isProductionSuite ? 5193 : 5190}`).replace(/\/$/, '')
export const output = process.env.CGS_SCREENSHOTS || '/tmp/cgs-subpages'
export const path = id => `/${content.pageSlugs[id]}/`
export const ids = Object.keys(content.pages)
export const artwork = id => `/assets/page-scenes/${id}/motion-v3.webp`
export const imageDimensions = id => id === 'events' ? [3840, 2160] : [2160, 3840]
const graphIds = ['what-we-do', 'ml-process', 'world', 'people', 'advisors']
export const selectedIds = () => {
  const selected = ids.filter(id => !process.env.CGS_TEST_PAGE || id.match(process.env.CGS_TEST_PAGE))
  assert.ok(selected.length, 'page filter must select at least one route')
  return selected
}

// Count real WebGL commands, including renders outside the component's RAF
// counter (e.g. ResizeObserver). This also works against a production build.
export function installGLProbe() {
  const original = HTMLCanvasElement.prototype.getContext
  const probes = new WeakMap()
  HTMLCanvasElement.prototype.getContext = function (type, ...args) {
    const gl = original.call(this, type, ...args)
    if (!gl || !/^webgl/.test(type) || !this.matches('.page-scene__canvas') || probes.has(this)) return gl
    const p = { context: type, clears: 0, draws: 0, uploads: 0, image: null, crop: null, created: {}, live: {} }
    probes.set(this, { gl, p })
    const upload = gl.texImage2D
    gl.texImage2D = function (...values) {
      p.uploads++
      const image = values.at(-1)
      if (image instanceof HTMLImageElement) p.image = { url: image.currentSrc || image.src, width: image.naturalWidth, height: image.naturalHeight }
      return upload.apply(this, values)
    }
    // Observe the crop sent to the real shader, rather than duplicating its
    // motion formula. Pixel sampling separately checks the rendered result.
    const locations = new WeakMap(), getLocation = gl.getUniformLocation, uniform4f = gl.uniform4f
    gl.getUniformLocation = function (program, name) {
      const location = getLocation.call(this, program, name)
      if (location) locations.set(location, name)
      return location
    }
    gl.uniform4f = function (location, ...values) {
      if (locations.get(location) === 'uCrop') p.crop = [...values]
      return uniform4f.call(this, location, ...values)
    }
    for (const [method, counter] of [['clear', 'clears'], ['drawArrays', 'draws'], ['drawElements', 'draws'], ['drawArraysInstanced', 'draws'], ['drawElementsInstanced', 'draws']]) {
      const originalMethod = gl[method]
      if (originalMethod) gl[method] = function (...values) { p[counter]++; return originalMethod.apply(this, values) }
    }
    for (const resource of ['Buffer', 'Texture', 'Framebuffer', 'Renderbuffer', 'Program', 'Shader', 'VertexArray']) {
      const create = gl[`create${resource}`], remove = gl[`delete${resource}`], live = new Set()
      p.created[resource] = p.live[resource] = 0
      if (!create || !remove) continue
      gl[`create${resource}`] = function (...values) {
        const value = create.apply(this, values)
        if (value) { live.add(value); p.created[resource]++; p.live[resource] = live.size }
        return value
      }
      gl[`delete${resource}`] = function (value) { live.delete(value); p.live[resource] = live.size; return remove.call(this, value) }
    }
    return gl
  }
  window.__pageSceneTest = () => {
    const canvas = document.querySelector('.page-scene__canvas'), entry = probes.get(canvas)
    return entry ? { ...entry.p, created: { ...entry.p.created }, live: { ...entry.p.live }, error: entry.gl.getError(), lost: entry.gl.isContextLost(), canvases: document.querySelectorAll('.page-scene canvas').length } : null
  }
}
export const probe = page => page.evaluate(() => window.__pageSceneTest())
export const playback = (page, state) => page.waitForFunction(state => document.querySelector('.page-scene')?.dataset.playback === state, state)
export const frame = page => page.locator('.page-scene__window').screenshot()
export function pixels(buffer) { return PNG.sync.read(buffer) }
export function difference(a, b) {
  assert.equal(a.width, b.width); assert.equal(a.height, b.height)
  let total = 0, changed = 0
  for (let i = 0; i < a.data.length; i += 4) {
    let delta = 0
    for (let c = 0; c < 3; c++) delta += Math.abs(a.data[i + c] - b.data[i + c])
    total += delta
    if (delta > 12) changed++
  }
  return { mean: total / (a.width * a.height * 3), changed: changed / (a.width * a.height) }
}
export function assertRendered(buffer) {
  const image = pixels(buffer), colors = new Set()
  for (let i = 0; i < image.data.length; i += 4 * 11) colors.add(`${image.data[i] >> 3},${image.data[i + 1] >> 3},${image.data[i + 2] >> 3}`)
  assert.ok(colors.size > 30, `scene must contain a detailed rendered image (${colors.size} colors)`)
}
export const visibleCopy = async locator => {
  await locator.evaluate(async el => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const animations = []
    for (let node = el; node && node !== document.body; node = node.parentElement) animations.push(...node.getAnimations().filter(a => a.effect.getTiming().iterations !== Infinity))
    await Promise.allSettled(animations.map(animation => animation.finished))
  })
  assert.ok(await locator.isVisible(), 'copy must be visible')
  assert.ok(await locator.evaluate(el => {
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node)
      if (Number(style.opacity) < .99 || style.visibility !== 'visible') return false
    }
    return true
  }), 'copy and its ancestors stay fully opaque')
}
export const mediaState = page => page.locator('.page-scene video').evaluate(video => ({
  time: video.currentTime, paused: video.paused, readyState: video.readyState,
  source: video.currentSrc, width: video.videoWidth, height: video.videoHeight,
  duration: video.duration, error: video.error?.message || null,
}))
export async function sceneReady(page, id) {
  await page.waitForSelector(`[data-subpage="${id}"]`)
  await page.evaluate(() => document.fonts.ready)
  const scene = page.locator('.page-scene')
  await scene.locator('.page-scene__window').scrollIntoViewIfNeeded()
  await page.waitForFunction(() => document.querySelector('.page-scene')?.dataset.renderer === 'video')
  await playback(page, 'playing')
  assert.equal(await scene.locator('video').count(), 1, 'one native video decoder')
  assert.equal(await scene.locator('canvas').count(), 0, 'scene renders the film directly')
  assert.equal(await scene.locator('img').count(), 1, 'single matching poster')
  await page.waitForFunction(() => { const img = document.querySelector('.page-scene__poster'); return img?.complete && img.naturalWidth > 0 })
  assert.equal(await scene.locator('img').getAttribute('src'), artwork(id))
  assert.deepEqual(await scene.locator('img').evaluate(img => [img.naturalWidth, img.naturalHeight]), imageDimensions(id), 'matching 4K poster dimensions')
  assert.equal(await scene.locator('.page-scene__poster').isVisible(), false)
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.page-scene video')).opacity === '1')
  assert.ok((await scene.getByRole('img').getAttribute('aria-label')).length > 15, 'scene has an accessible description')
  const state = await mediaState(page)
  assert.equal(state.duration, 8, 'eight-second object animation')
  assert.equal(state.error, null, 'native decoder is healthy')
  return scene
}
export async function assertImageResource(page, id, requests) {
  const state = await mediaState(page), poster = artwork(id)
  const expectedFilm = `/assets/page-scenes/${id}/motion-v3-${await page.locator('.page-scene').getAttribute('data-quality')}.mp4`
  assert.equal(new URL(state.source).pathname, expectedFilm, 'chosen native stream')
  assert.ok(requests.length > 0 && requests.every(url => [poster, expectedFilm].includes(new URL(url).pathname)), 'only this page requests its poster and selected stream')
  assert.equal(new Set(requests.filter(url => /\.mp4(?:\?|$)/.test(url))).size, 1, 'one stream tier is requested')
  const quality = expectedFilm.includes('-mobile.') ? 'mobile' : expectedFilm.includes('-4k.') ? '4k' : '1080'
  const short = { mobile: 720, '1080': 1080, '4k': 2160 }[quality], long = { mobile: 1280, '1080': 1920, '4k': 3840 }[quality]
  assert.deepEqual([state.width, state.height], id === 'events' ? [long, short] : [short, long], 'native stream dimensions')
}
export async function assertNoFrames(page, label, ms = 250) {
  await page.waitForTimeout(80)
  const before = await mediaState(page)
  assert.equal(before.paused, true, `${label}: decoder is paused`)
  await page.waitForTimeout(ms)
  const after = await mediaState(page)
  assert.equal(after.time, before.time, `${label}: native playhead is stable`)
  assert.equal(after.source, before.source, `${label}: source remains stable`)
  return after
}
export async function setHidden(page, hidden) {
  // Synthetic document visibility is portable to WebKit. Do not claim this
  // emulates browser/OS tab scheduling; it exercises the real visibility handler.
  await page.evaluate(hidden => {
    if (hidden) Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    else delete document.hidden
    document.dispatchEvent(new Event('visibilitychange'))
  }, hidden)
}
export async function createHarness(browser, width, height) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 500, hasTouch: width < 500 })
  await context.addInitScript(installGLProbe)
  let overrides = {}
  // Playwright routing disables HTTP caching for the entire context. Intercept
  // only the published-content fetch in-page so image caching remains real.
  await context.exposeBinding('__pageScenePublishedContent', () => overrides)
  await context.addInitScript(() => {
    const original = window.fetch
    window.fetch = async function (input, init) {
      const url = input instanceof Request ? input.url : String(input)
      if (/(?:raw\.githubusercontent\.com|cdn\.jsdelivr\.net).*cornellcgs-content.*content\.json/.test(url)) {
        return new Response(JSON.stringify(await window.__pageScenePublishedContent()), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return original.call(this, input, init)
    }
  })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  const errors = [], requests = [], hmr = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    // Chromium reports this performance notice when the test reads pixels;
    // it is not a WebGL error. All shader/context/GL errors still fail.
    if (message.type() === 'error' || (/webgl|GL_INVALID|context lost|shader error/i.test(message.text()) && message.type() === 'warning' && !/GPU stall due to ReadPixels/.test(message.text()))) errors.push(message.text())
  })
  page.on('request', request => { if (request.url().includes('/assets/page-scenes/')) requests.push(request.url()) })
  page.on('websocket', socket => socket.on('framereceived', ({ payload }) => {
    try { const message = JSON.parse(String(payload)); if (['update', 'full-reload'].includes(message.type)) hmr.push(message) } catch { /* Not a Vite frame. */ }
  }))
  const health = async () => {
    assert.equal(await page.locator('vite-error-overlay, nextjs-portal').count(), 0, 'no framework error overlay')
    assert.deepEqual(errors, [], 'no runtime, console, or WebGL errors')
    const gl = await probe(page)
    if (gl) { assert.equal(gl.error, 0, 'WebGL NO_ERROR'); assert.equal(gl.lost, false, 'context stays alive'); assert.equal(gl.canvases, 1) }
  }
  const clean = async (label, run) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const epoch = hmr.length
      errors.length = 0; requests.length = 0
      let failure
      try { await run(); await health() } catch (error) { failure = error }
      // Assertion failures are never retried, even when an edit also happened.
      if (failure?.code === 'ERR_ASSERTION') throw failure
      const changed = hmr.length !== epoch
      if (!changed) { if (failure) throw failure; return }
      if (attempt === 2) throw new Error(`${label}: interrupted by known Vite HMR on three runs; rerun once editing stops`, { cause: failure })
      console.log('HMR CLEAN RESTART', label, hmr.slice(epoch).map(m => `${m.type}:${m.path || m.updates?.map(u => u.path).join(',') || ''}`).join(';'))
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await page.setViewportSize({ width, height })
      // The supplied run starts with navigation, creating a fresh document.
    }
  }
  return { page, context, errors, requests, health, clean, setOverrides: value => { overrides = value } }
}
export async function runMatrix(name, run) {
  await mkdir(output, { recursive: true })
  const results = [], failures = []
  // The agreed matrix covers desktop Chromium and touch WebKit without
  // repeating the two redundant browser/viewport combinations.
  for (const [engine, type, device, width, height] of [
    ['Chromium', chromium, 'desktop', 1440, 960],
    ['WebKit', webkit, 'phone', 375, 812],
  ]) {
      const testCase = `${engine}-${device}`
      if (process.env.CGS_TEST_CASE && !testCase.match(process.env.CGS_TEST_CASE)) continue
      let browser
      try { browser = await type.launch({ headless: true }) }
      catch (error) {
        if (/Executable doesn't exist|Please run.*playwright install|ENOENT/.test(error.message)) { failures.push(error); results.push({ testCase, status: 'unavailable', reason: error.message.split('\n')[0] }); console.log('UNAVAILABLE', testCase, error.message.split('\n')[0]); continue }
        throw error
      }
      try {
        const result = await run(browser, { testCase, width, height, device, engine })
        results.push({ testCase, status: 'passed', ...result })
      } catch (error) {
        failures.push(error); results.push({ testCase, status: 'failed', error: error.message })
        console.error('FAIL', testCase, error.stack)
      } finally { await browser.close() }
  }
  await writeFile(`${output}/${name}-results.json`, JSON.stringify(results, null, 2))
  assert.ok(results.some(r => r.status !== 'unavailable'), 'at least one selected browser/device must run')
  if (failures.length) throw new AggregateError(failures, `${name}: ${failures.length} browser/device case(s) failed; ${output}/${name}-results.json`)
  console.log('PASS', name, results.filter(r => r.status === 'passed').length, 'browser/device cases;', `${output}/${name}-results.json`)
}

async function testSubpages(browser, { testCase, width, height }) {
  const h = await createHarness(browser, width, height), { page } = h
  const results = [], failures = []
  const clean = async (label, run) => {
    if (process.env.CGS_TEST_FLOW && !label.match(process.env.CGS_TEST_FLOW)) return false
    try {
      await h.clean(label, run)
      results.push({ label, status: 'passed' })
      return true
    } catch (error) {
      failures.push(error); results.push({ label, status: 'failed', error: error.message })
      console.error('FAIL FLOW', label, error.stack)
      await page.screenshot({ path: `${output}/${label.replaceAll('/', '-')}-FAIL.png` }).catch(() => {})
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await page.setViewportSize({ width, height })
      return false
    }
  }
  for (const id of process.env.CGS_TEST_ONLY_RETURN ? [] : selectedIds()) {
    const passed = await clean(`${testCase}/${id}`, async () => {
      await page.goto(base + path(id))
      const def = content.pages[id]
      await page.waitForSelector(`[data-subpage="${id}"]`)
      assert.equal(new URL(page.url()).pathname, path(id))
      assert.ok((await page.title()).length > 0)
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
      assert.equal(await page.locator('.page-navigator__link').count(), 9)
      assert.equal(await page.locator('.page-navigator__link[aria-current=page]').getAttribute('href'), path(id))
      const scene = await sceneReady(page, id)
      assert.equal(await page.evaluate(() => '__pageScene' in window), false, 'production does not expose the DEV motion hook')
      await assertImageResource(page, id, h.requests)
      const moving = await frame(page), before = await mediaState(page)
      assertRendered(moving)
      await page.waitForTimeout(300)
      assert.ok(!moving.equals(await frame(page)), 'autoplay changes the rendered film')
      assert.notEqual((await mediaState(page)).time, before.time, 'autoplay advances the native playhead')
      await page.getByRole('button', { name: 'Pause scene animation', exact: true }).click()
      await playback(page, 'paused')
      await assertNoFrames(page, 'paused')
      const stopped = await frame(page)
      await page.waitForTimeout(150)
      assert.ok(stopped.equals(await frame(page)), 'pause freezes the actual film pixels')
      assert.equal(await scene.getByRole('button').getAttribute('aria-pressed'), 'true')
      await page.getByRole('button', { name: 'Resume scene animation', exact: true }).click()
      await playback(page, 'playing')
      await page.waitForTimeout(250)
      assert.ok(!stopped.equals(await frame(page)), 'resume continues visible image motion')
      await page.setViewportSize({ width, height: 300 })
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
      await playback(page, 'offscreen')
      await assertNoFrames(page, 'offscreen')
      await page.setViewportSize({ width, height })
      if (graphIds.includes(id)) {
        const study = page.locator('.sp-study')
        await study.scrollIntoViewIfNeeded()
        await study.locator('canvas').waitFor()
        assert.ok(await study.locator('canvas').evaluate(el => el.width > 50 && el.height > 50))
        assert.equal(await study.getByRole('button').count(), 0, 'study shares the page pause control')
        await scene.scrollIntoViewIfNeeded()
        await page.getByRole('button', { name: 'Pause scene animation', exact: true }).click()
        await study.scrollIntoViewIfNeeded()
        const canvas = study.locator('canvas'), stillCanvas = await canvas.evaluate(el => el.toDataURL())
        await page.waitForTimeout(550)
        assert.equal(await canvas.evaluate(el => el.toDataURL()), stillCanvas, 'page pause freezes the separate graph')
        await scene.scrollIntoViewIfNeeded()
        await page.getByRole('button', { name: 'Resume scene animation', exact: true }).click()
      }
      if (id === 'people') {
        const rows = page.locator('.sp-roster li'), people = content.team.flatMap(group => group.people)
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
        assert.ok(await page.evaluate(() => document.querySelector('.sp-study').getBoundingClientRect().top >= document.querySelector('.sp-faculty').getBoundingClientRect().bottom), 'network is below all portraits')
      }
      if (id === 'join') {
        assert.equal(await page.getByRole('link', { name: 'Book a coffee chat' }).getAttribute('href'), content.pages.join.sections.at(-1).link.href)
        assert.equal(await page.locator('main a[href="mailto:recruitment@cornellcgs.org"]').count(), 1)
      }
      if (id === 'contact') for (const section of def.sections) assert.equal(await page.getByRole('link', { name: section.body, exact: true }).getAttribute('href'), `mailto:${section.body}`)
      await scene.scrollIntoViewIfNeeded()
      await setHidden(page, true)
      await playback(page, 'hidden')
      await assertNoFrames(page, 'hidden visibility event')
      await setHidden(page, false)
      await playback(page, 'playing')
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await playback(page, 'reduced')
      await assertNoFrames(page, 'reduced motion')
      const reduced = await frame(page)
      assertRendered(reduced)
      assert.equal(await page.getByRole('button', { name: 'Scene animation is static' }).isDisabled(), true)
      await page.mouse.move(5, 5); await page.mouse.move(width / 2, height / 2)
      await page.waitForTimeout(150)
      assert.ok(reduced.equals(await frame(page)), 'reduced motion keeps the photograph static after mouse input')
      const afterLifecycle = await mediaState(page)
      assert.equal(afterLifecycle.source, before.source, 'playback and resize keep the selected stream')
      assert.equal(await scene.locator('video').count(), 1, 'one decoder after lifecycle changes')
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, `${id} no horizontal overflow`)
      await page.evaluate(() => scrollTo(0, 0))
      await page.screenshot({ path: `${output}/${testCase}-${id}.png`, fullPage: true })
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      const next = ids[(ids.indexOf(id) + 1) % ids.length]
      await page.getByRole('button', { name: 'Explore other pages' }).click()
      await page.locator(`.page-navigator__link[href="${path(next)}"]`).click()
      await page.waitForURL(base + path(next))
      await page.waitForSelector(`[data-subpage="${next}"]`)
    })
    if (passed) console.log('PASS', testCase, id, 'content, route, single film, autoplay, pause/resume, offscreen/hidden pause, RM, navigation')
  }
  h.setOverrides({ pages: Object.fromEntries(ids.map(id => [id, { ...content.pages[id], title: `Edited ${content.pages[id].title}`, sections: [...content.pages[id].sections, { heading: 'Admin addition', body: 'A published extra section.', link: { label: 'Open contact', href: '/contact/' } }] }])), site: { credit: 'Edited website credit' }, team: [{ label: 'Updated roster', alt: 'Roster detail', people: [{ name: 'Published member', major: 'Published major' }] }], advisors: [{ ...content.advisors[0], name: 'Published advisor', photo: '/assets/team/elsie-lu.jpg' }] })
  for (const id of ids) await clean(`${testCase}/admin/${id}`, async () => {
    await page.goto(base + path(id))
    await page.waitForSelector('h1')
    assert.equal(await page.locator('h1').textContent(), `Edited ${content.pages[id].title}`)
    await visibleCopy(page.getByRole('heading', { name: 'Admin addition' }))
    assert.equal(await page.getByRole('link', { name: 'Open contact', exact: true }).getAttribute('href'), '/contact/')
    assert.equal(await page.locator('.sp-footer__bottom p').textContent(), 'Edited website credit')
    if (id === 'people') assert.deepEqual(await page.locator('.sp-roster li p').allTextContents(), ['Published member', 'Published major'])
    if (id === 'advisors') assert.equal(await page.locator('.sp-advisor__photo').getAttribute('src'), '/assets/team/elsie-lu.jpg')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0)
  })
  h.setOverrides({})
  await clean(`${testCase}/fallback`, () => testFallback(browser, { testCase, width, height }))
  await clean(`${testCase}/Back`, async () => {
    await page.goto(base)
    await page.waitForFunction(() => window.__cgsShown === true)
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(700)
    const deckLink = page.locator('.earth-intro-copy a[href="/world/"]')
    await deckLink.focus(); await page.waitForTimeout(400)
    await page.evaluate(() => window.addEventListener('pagehide', () => sessionStorage.setItem('cgs-test-exit', String(scrollY)), { once: true }))
    await deckLink.click()
    await page.waitForURL(base + path('world'))
    const before = Number(await page.evaluate(() => sessionStorage.getItem('cgs-test-exit')))
    await page.getByRole('link', { name: 'Back', exact: true }).click()
    await page.waitForFunction(() => window.__cgsShown === true)
    await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(600)
    const after = await page.evaluate(() => scrollY)
    assert.ok(Math.abs(before - after) <= 3, `Back restores exact deck position ${before} → ${after}`)
    await page.locator('.earth-intro-copy a[href="/world/"]').click()
    await page.waitForURL(base + path('world'))
    await page.getByRole('button', { name: 'Explore other pages' }).click()
    await page.locator(`.page-navigator__link[href="${path('contact')}"]`).click()
    await page.waitForURL(base + path('contact'))
    await page.getByRole('link', { name: 'Back', exact: true }).click()
    await page.waitForFunction(() => window.__cgsShown === true)
    await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(600)
    assert.ok(Math.abs(before - await page.evaluate(() => scrollY)) <= 3, 'cross-page exploration retains original deck bookmark')
  })
  await writeFile(`${output}/${testCase}-subpages-details.json`, JSON.stringify(results, null, 2))
  await h.context.close()
  assert.ok(results.length, `${testCase}: flow filter must select at least one check`)
  if (failures.length) throw new AggregateError(failures, failures.map(error => error.message).join('\n'))
  console.log('PASS', testCase, `${results.length} selected content/admin/fallback/Back flows; no page errors`)
  return { flows: results.length, details: `${output}/${testCase}-subpages-details.json` }
}
async function testFallback(browser, { testCase, width, height }) {
  // Failed media requests are isolated from the normal console-health checks.
  for (const mode of ['film-error', 'poster-error']) {
    const h = await createHarness(browser, width, height), { page } = h
    try {
      await page.route('**/assets/page-scenes/**/*.mp4', route => route.abort())
      if (mode === 'poster-error') await page.route('**/assets/page-scenes/**/motion-v3.webp', route => route.abort())
      await page.goto(base + path('who-we-are'))
      await page.locator('.page-scene__window').scrollIntoViewIfNeeded()
      await playback(page, 'fallback')
      assert.equal(await page.locator('.page-scene').getAttribute('data-renderer'), 'fallback')
      const poster = page.locator('.page-scene__poster')
      await poster.waitFor({ state: 'visible' })
      await page.waitForFunction(() => { const img = document.querySelector('.page-scene__poster'); return img.complete && img.naturalWidth > 0 })
      assert.equal(await page.locator('.page-scene img').count(), 1)
      const expected = mode === 'poster-error' ? '/assets/page-scenes/who-we-are/cinematic-v2.webp' : artwork('who-we-are')
      assert.equal(await poster.getAttribute('src'), expected, 'failed poster uses the existing image fallback')
      await assertNoFrames(page, mode)
      const still = await frame(page)
      await page.waitForTimeout(200)
      assert.ok(still.equals(await frame(page)), 'fallback remains visibly static')
      await setHidden(page, true)
      await page.waitForTimeout(100)
      await playback(page, 'fallback')
      await setHidden(page, false)
      await page.getByRole('button', { name: 'Pause scene animation', exact: true }).click()
      await playback(page, 'fallback')
      await page.getByRole('button', { name: 'Resume scene animation', exact: true }).click()
      await playback(page, 'fallback')
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.waitForTimeout(100)
      await playback(page, 'fallback')
      await visibleCopy(page.locator('h1'))
      assert.equal(await page.locator('vite-error-overlay, nextjs-portal').count(), 0)
      await page.screenshot({ path: `${output}/${testCase}-fallback-${mode}.png` })
      assert.ok(h.errors.every(message => /Failed to load resource|Load failed|cancelled|aborted|ERR_FAILED/i.test(message)), `only deliberately failed media requests are allowed: ${h.errors.join('; ')}`)
    } finally { await h.context.close() }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runMatrix('subpages', testSubpages)
