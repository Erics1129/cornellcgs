import assert from 'node:assert/strict'
const { chromium, webkit } = await import(process.env.CGS_PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.CGS_TEST_URL || 'http://127.0.0.1:5198'

for (const [name, engine] of [['chromium-desktop', chromium], ['safari-desktop', webkit]]) {
  const browser = await engine.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route(/(?:raw\.githubusercontent\.com|cdn\.jsdelivr\.net).*content\.json|\/api\/content/, route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.addInitScript(() => sessionStorage.setItem('cgs-seen', '1'))
  try {
    await page.goto(base)
    await page.waitForFunction(() => window.__cgsShown && document.querySelector('#code')?.closest('.pin-spacer'))
    await page.evaluate(() => document.fonts.ready)
    const panels = page.locator('#code .showcase-code-panel')
    const source = panels.first().locator('.showcase-code-source')
    const body = panels.first().locator('.showcase-code-viewport')
    const seek = async progress => {
      // Use the actual pinned chapter's geometry, including on production builds.
      await page.evaluate(progress => {
        const section = document.querySelector('#code'), pin = section.closest('.pin-spacer')
        if (pin) {
          scrollTo(0, pin.getBoundingClientRect().top + scrollY + (pin.offsetHeight - section.offsetHeight) * progress)
        } else {
          const device = section.querySelector('.code-workspace'), box = device.getBoundingClientRect()
          const start = box.top + scrollY - innerHeight * .85
          scrollTo(0, start + (box.height + innerHeight * .15) * progress)
        }
      }, progress)
      await page.waitForTimeout(650)
    }
    const snapshots = () => panels.evaluateAll(panels => panels.map(panel => {
      const viewport = panel.querySelector('.showcase-code-viewport'), box = viewport.getBoundingClientRect()
      const allRows = [...panel.querySelectorAll('[data-code-row]')]
      const reference = panel.querySelector('pre code').textContent.split('\n')
      const rows = allRows.filter(row => {
        const rect = row.getBoundingClientRect()
        return rect.bottom > box.top && rect.top < box.bottom
      })
      return { title: panel.getAttribute('aria-label'), typed: panel.dataset.typedChars,
        top: viewport.scrollTop, rows: rows.map(row => row.querySelector('.showcase-code-gutter').textContent),
        emptySourceRows: rows.filter(row => reference[allRows.indexOf(row)].trim() && !row.querySelector('[data-code-text]').textContent.trim()).map(row => allRows.indexOf(row) + 1),
        text: rows.map(row => row.querySelector('[data-code-text]').textContent).join('\n') }
    }))
    const readable = async label => {
      const snapshot = await snapshots()
      for (const panel of snapshot) assert.ok(panel.text.trim().length > 0,
        `${name} ${label}: ${panel.title} shows gutters ${panel.rows.join(',')} with no readable source`)
      for (const panel of snapshot) assert.deepEqual(panel.emptySourceRows, [],
        `${name} ${label}: ${panel.title} has blank rows where the supplied snippet contains source`)
      return snapshot
    }
    const release = async () => {
      await page.evaluate(() => { getSelection().removeAllRanges(); document.activeElement?.blur() })
      await page.waitForTimeout(30)
    }

    await seek(0)
    await readable('initial chapter, before either typing window starts')
    for (const panel of await panels.all()) {
      assert.deepEqual(await panel.locator('[data-code-text]').allTextContents(),
        (await panel.locator('pre code').textContent()).split('\n'), 'initial document is fully readable')
    }

    // Original failure: only rows 1–4 have typed, while all 24 gutters scroll.
    // Wheel inspection used to freeze the viewport on empty rows 13–24.
    await seek(.28)
    const box = await body.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, 900)
    await page.waitForTimeout(400)
    await page.screenshot({ path: `/tmp/cgs-source-${name}.png` })
    await readable('wheel into the lower rows during typing')

    // Entry, completion, exit and reverse scroll always retain a populated source
    // and terminal, including before their illustrated typing windows begin.
    await release()
    const typedCounts = new Set()
    for (const progress of [0, .04, .15, .4, .75, 1, 1.12, .95, .2, .65, .12, .5]) {
      await seek(progress)
      const snapshot = await readable(`chapter progress ${progress}`)
      typedCounts.add(snapshot[0].typed)
    }
    assert.ok(typedCounts.size > 3, 'the typing demonstration still follows the chapter')

    // A real text selection must survive forward and reverse chapter movement.
    await body.evaluate(el => { el.scrollTop = 0 })
    const first = panels.first().locator('[data-code-text]').first(), textBox = await first.boundingBox()
    await page.mouse.move(textBox.x + 2, textBox.y + 8)
    await page.mouse.down(); await page.mouse.move(textBox.x + 160, textBox.y + 8, { steps: 10 }); await page.mouse.up()
    const selected = await page.evaluate(() => getSelection().toString())
    assert.ok(selected.includes('Pot'), `native source selection: ${selected}`)
    const frozen = await source.innerHTML()
    await seek(.9); await seek(.2)
    assert.equal(await source.innerHTML(), frozen, 'real selection freezes the code DOM')
    assert.equal(await page.evaluate(() => getSelection().toString()), selected)
    await readable('selection held while reversing')
    await release()

    // Keyboard inspection freezes the source too; Copy still supplies the full
    // snippet even when the illustrated editing frame is incomplete.
    await body.focus(); await page.keyboard.press('ArrowDown')
    const inspected = await source.innerHTML()
    await seek(.8); assert.equal(await source.innerHTML(), inspected)
    await page.evaluate(() => {
      window.__sourceCopied = []
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => window.__sourceCopied.push(text) } })
    })
    const expected = await panels.first().locator('pre code').textContent()
    await panels.first().getByRole('button', { name: 'Copy code from equity.ts' }).click()
    await page.waitForFunction(() => window.__sourceCopied.length === 1)
    assert.deepEqual(await page.evaluate(() => window.__sourceCopied), [expected])
    await release()
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(250)
    await readable('reduced motion')
    assert.deepEqual(await panels.first().locator('[data-code-text]').allTextContents(), expected.split('\n'))
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(450)
    for (const progress of [0, .28, .95, .2]) {
      await release(); await seek(progress)
      await readable(`phone resize at chapter progress ${progress}`)
      for (const panel of await panels.all()) {
        const viewport = panel.locator('.showcase-code-viewport'), phoneBox = await viewport.boundingBox()
        await page.mouse.move(phoneBox.x + phoneBox.width / 2, phoneBox.y + phoneBox.height / 2)
        await page.mouse.wheel(0, 900); await page.waitForTimeout(180)
        await readable(`phone lower rows at chapter progress ${progress}`)
        await release()
      }
    }
    assert.deepEqual(errors, [])
    console.log('PASS', name, 'actual Source chapter: no blank initial/future rows, forward/back/focus, native selection, complete copy, reduced motion, phone resize')
  } finally { await browser.close() }
}
