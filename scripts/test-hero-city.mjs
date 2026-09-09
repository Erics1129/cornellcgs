import assert from 'node:assert/strict'
const { chromium, webkit } = await import(process.env.CGS_PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.CGS_TEST_URL || 'http://127.0.0.1:5193'
for (const [name, engine, width, height] of [
  ['chrome-desktop', chromium, 1440, 900], ['safari-phone', webkit, 375, 667],
]) {
  const browser = await engine.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width, height }, isMobile: width < 500, hasTouch: width < 500 })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  try {
    await page.goto(base)
    await page.waitForFunction(() => window.__cgsShown === true)
    await page.waitForTimeout(1400)
    const card = page.locator('.poker-stage'), button = page.getByRole('button', { name: 'Flip the poker card', exact: true })
    const face = side => page.locator(`.poker-surface--${side}`).evaluate(e => getComputedStyle(e).visibility)
    const color = () => card.getAttribute('data-color')
    const state = await page.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      style: document.documentElement.getAttribute('style'),
    }))
    const palette = () => page.locator('.code-city canvas').evaluate(e => {
      const gl = e.getContext('webgl'), program = gl.getParameter(gl.CURRENT_PROGRAM)
      return Array.from(gl.getUniform(program, gl.getUniformLocation(program, 'u_tint')))
    })
    const tint = await palette()
    assert.equal(await page.locator('#top > .code-city').count(), 1)
    assert.equal(await page.locator('.code-city').count(), 1)
    assert.equal(await face('ace'), 'visible')
    assert.equal(await face('back'), 'hidden', 'Safari must not paint the mirrored reverse through the Ace')
    const layout = await page.evaluate(() => {
      const card = document.querySelector('.hero-poker').getBoundingClientRect(), copy = document.querySelector('h1').getBoundingClientRect(), controls = document.querySelector('.poker-controls').getBoundingClientRect()
      return { overflow: document.documentElement.scrollWidth - innerWidth, separated: innerWidth < 768 ? controls.bottom < copy.top : card.left > copy.right }
    })
    assert.equal(layout.overflow, 0); assert.ok(layout.separated, 'card controls and title have their own space')
    await page.screenshot({ path: `/tmp/cgs-hero-${name}-ace.png` })
    await button.focus(); await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.querySelector('.poker-stage').dataset.flipping === 'false')
    assert.equal(await card.getAttribute('data-face'), 'back')
    assert.equal(await face('back'), 'visible'); assert.equal(await face('ace'), 'hidden')
    await page.screenshot({ path: `/tmp/cgs-hero-${name}-back.png` })
    // Stop halfway through a second flip; resuming must continue from the same pose.
    await button.click(); await page.waitForTimeout(430)
    await page.getByRole('button', { name: 'Pause card animation' }).click()
    const pose = await page.locator('.poker-turn').getAttribute('style')
    await page.waitForTimeout(250)
    assert.equal(await page.locator('.poker-turn').getAttribute('style'), pose)
    await page.getByRole('button', { name: 'Resume card animation' }).click()
    await page.waitForFunction(() => document.querySelector('.poker-stage').dataset.flipping === 'false')
    assert.equal(await card.getAttribute('data-face'), 'ace')
    // All local colors, including wraparound, remain independent of the city/page.
    await page.getByRole('button', { name: 'Pause card animation' }).click()
    for (const next of ['violet', 'carbon', 'midnight', 'ice', 'lilac']) {
      await button.click(); assert.equal(await color(), next)
    }
    assert.deepEqual(await palette(), tint)
    assert.deepEqual(await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, style: document.documentElement.getAttribute('style') })), state)
    // The original fluid code field is mounted and animating below the city.
    await page.evaluate(() => scrollTo(0, document.querySelector('#top').clientHeight + 200))
    await page.waitForFunction(() => document.querySelector('.code-city').dataset.playback === 'offscreen')
    const code = page.locator('#code-layer-canvas')
    const a = await code.evaluate(e => e.toDataURL())
    await page.waitForTimeout(300)
    assert.notEqual(await code.evaluate(e => e.toDataURL()), a, 'restored code field moves')
    const stoppedColor = await color()
    await page.waitForTimeout(400)
    assert.equal(await color(), stoppedColor)
    await page.evaluate(() => scrollTo(0, 0))
    await page.waitForFunction(() => document.querySelector('.code-city').dataset.playback === 'playing')
    await page.getByRole('button', { name: 'Resume card animation' }).click()
    const beforeAuto = await color()
    await page.waitForFunction(previous => document.querySelector('.poker-stage').dataset.color !== previous, beforeAuto, { timeout: 12500 })
    await page.waitForFunction(() => document.querySelector('.poker-stage').dataset.flipping === 'false')
    assert.deepEqual(await palette(), tint)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.waitForFunction(() => document.querySelector('.poker-stage').dataset.playback === 'reduced')
    await button.click()
    assert.equal(await card.getAttribute('data-flipping'), 'false')
    assert.equal(await page.locator('.code-city').getAttribute('data-playback'), 'reduced')
    assert.deepEqual(errors, [])
    console.log('PASS', name, 'faces, keyboard, pause/resume, five local colors, city scope, code field, automatic flip, reduced motion; no page errors')
  } finally { await browser.close() }
}
