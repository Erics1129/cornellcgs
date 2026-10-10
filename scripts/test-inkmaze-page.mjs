#!/usr/bin/env node
/**
 * Ink Maze in a real browser (Chromium and WebKit): keys, swipes, undo,
 * restart, a win and a loss, saved bests, level select, the art fallback,
 * reduced motion, the /minigames/ list and the What We Do card, and no
 * sideways scroll on a phone.
 *
 *   npm run dev                                   (in another terminal)
 *   CGS_TEST_URL=http://localhost:5190 node scripts/test-inkmaze-page.mjs
 *
 * Set CGS_PLAYWRIGHT_MODULE to a Playwright module path if it is not installed locally.
 */
import assert from 'node:assert/strict'
import { LEVELS } from '../src/minigames/inkmaze/levels.ts'
import { minInk } from '../src/minigames/inkmaze/solver.ts'

const { chromium, webkit } = await import(process.env.CGS_PLAYWRIGHT_MODULE || 'playwright')
const base = (process.env.CGS_TEST_URL || 'http://localhost:5190').replace(/\/$/, '')
const KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }

const hud = (page) => page.evaluate(() => {
  const [ink, moves, left] = [...document.querySelectorAll('.im-hud dd strong')].map((n) => Number(n.textContent))
  return { ink, moves, left }
})
/** wait for the ball to stop: the HUD settles and no roll is queued */
const settle = (page) => page.waitForTimeout(820)

for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch({ headless: true })
  try {
    // ------------------------------------------------------------- desktop
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`${base}/minigames/inkMaze/`)
    await page.waitForSelector('#ink-maze-board')
    await page.evaluate(() => localStorage.removeItem('cgs-inkmaze-best-v1'))
    await page.goto(`${base}/minigames/inkMaze/?level=1`)
    await page.waitForSelector('#ink-maze-board')
    assert.equal(await page.locator('h1').textContent(), 'Ink Maze')
    assert.match(await page.title(), /Ink Maze/)
    const first = LEVELS[0]
    assert.deepEqual(await hud(page), { ink: first.ink, moves: 0, left: 12 })

    // a move into the edge does nothing and costs nothing
    const scroll = await page.evaluate(() => scrollY)
    await page.keyboard.press('ArrowUp'); await settle(page)
    assert.deepEqual(await hud(page), { ink: first.ink, moves: 0, left: 12 }, 'blocked move is free')
    await page.keyboard.press('d'); await settle(page) // WASD
    assert.deepEqual(await hud(page), { ink: first.ink - 3, moves: 1, left: 9 })
    assert.equal(await page.evaluate(() => scrollY), scroll, 'arrow keys roll the ball, not the page')
    await page.keyboard.press('z'); await settle(page)
    assert.deepEqual(await hud(page), { ink: first.ink, moves: 0, left: 12 }, 'undo gives the ink back')
    await page.keyboard.press('ArrowRight'); await settle(page)
    await page.keyboard.press('r'); await settle(page)
    assert.equal((await hud(page)).moves, 0, 'restart')

    // win with the solver's own line: the result appears and the best is kept
    for (const move of minInk(first).moves) { await page.keyboard.press(KEY[move]); await settle(page) }
    await page.waitForSelector('.im-result[data-kind="won"]')
    assert.match(await page.locator('.im-result').textContent(), /Level cleared/)
    assert.match(await page.locator('.im-result').textContent(), /least this level needs/)
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Next level →', 'Next level has focus')
    const best = await page.evaluate(() => JSON.parse(localStorage.getItem('cgs-inkmaze-best-v1')))
    assert.deepEqual(best[first.id], { ink: first.par, moves: minInk(first).moves.length })
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => !document.querySelector('.im-result'))
    assert.match(await page.locator('.im-level h2').textContent(), new RegExp(LEVELS[1].name))
    assert.equal((await hud(page)).ink, LEVELS[1].ink)
    assert.match(page.url(), /level=2/)
    await page.reload(); await page.waitForSelector('#ink-maze-board')
    assert.equal(await page.locator('.im-levels__item').first().locator('[data-state="perfect"]').count(), 1, 'the best survives a reload')

    // a loss on a level with no slack: waste ink, then undo out of it
    const tight = LEVELS.findIndex((level) => level.slack === 0)
    await page.locator('.im-levels__item').nth(tight).click()
    for (let i = 0; i < 40 && !(await page.locator('.im-result').count()); i++) {
      await page.keyboard.press(i % 2 ? 'ArrowUp' : 'ArrowDown'); await page.waitForTimeout(260)
      await page.keyboard.press(i % 2 ? 'ArrowLeft' : 'ArrowRight'); await page.waitForTimeout(260)
    }
    await page.waitForSelector('.im-result[data-kind="lost"]')
    assert.equal((await hud(page)).ink, 0)
    await page.getByRole('button', { name: 'Undo last move' }).click(); await settle(page)
    assert.equal(await page.locator('.im-result').count(), 0, 'undo leaves the lost screen')
    assert.ok((await hud(page)).ink > 0)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0)
    assert.deepEqual(errors, [])
    await page.close()

    // ------------------------------------------------- phone: swipe the board
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true })
    await phone.goto(`${base}/minigames/inkMaze/?level=1`)
    await phone.waitForSelector('#ink-maze-board')
    const box = await phone.locator('#ink-maze-board').boundingBox()
    await phone.evaluate(([x, y]) => {
      const board = document.querySelector('#ink-maze-board')
      const at = (type, dx) => board.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: x + dx, clientY: y }))
      at('pointerdown', 0); at('pointermove', 12); at('pointermove', 60); at('pointerup', 60)
    }, [box.x + box.width / 2, box.y + box.height / 2])
    await settle(phone)
    assert.deepEqual(await hud(phone), { ink: first.ink - 3, moves: 1, left: 9 }, 'a swipe right rolls right')
    assert.equal(await phone.locator('#ink-maze-board').evaluate((e) => getComputedStyle(e).touchAction), 'none')
    await phone.getByRole('button', { name: 'Roll down' }).click(); await settle(phone)
    assert.equal((await hud(phone)).moves, 2, 'the roll pad works')
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, 'no sideways scroll on a phone')
    await phone.close()

    // --------------------------------- no art at all: plain colors, still playable
    const bare = await browser.newPage({ viewport: { width: 1024, height: 768 } })
    await bare.route(/\/assets\/minigames\/ink-maze\//, (route) => route.fulfill({ status: 404, body: '' }))
    await bare.goto(`${base}/minigames/inkMaze/?level=1`)
    await bare.waitForSelector('#ink-maze-board'); await bare.waitForTimeout(400)
    const floor = await bare.locator('#ink-maze-board').evaluate((canvas) => {
      const ctx = canvas.getContext('2d'), r = canvas.getBoundingClientRect(), k = canvas.width / r.width
      // the middle of the lower-right floor block of level 1 (row 4, col 4)
      return [...ctx.getImageData(Math.round(canvas.width * 0.66), Math.round(canvas.height * 0.68), 1, 1).data]
    })
    assert.ok(floor[0] > 180 && floor[2] < 200, `plain-color floor is drawn: ${floor}`)
    await bare.keyboard.press('ArrowRight'); await settle(bare)
    assert.equal((await hud(bare)).moves, 1)
    await bare.close()

    // ------------------------------------------- reduced motion: rolls land at once
    const calm = await browser.newPage({ viewport: { width: 1024, height: 768 }, reducedMotion: 'reduce' })
    await calm.goto(`${base}/minigames/inkMaze/?level=1`)
    await calm.waitForSelector('#ink-maze-board')
    await calm.keyboard.press('ArrowRight'); await calm.keyboard.press('ArrowDown'); await calm.waitForTimeout(120)
    assert.equal((await hud(calm)).moves, 2, 'no animation holds moves back')
    await calm.close()

    // ------------------------------- /minigames/, and the card on What We Do
    const card = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await card.goto(`${base}/whatWeDo/`)
    const link = card.locator('a.sp-play-card')
    await link.waitFor()
    // each page here is a fresh browser profile: save one cleared level for the list to show
    await card.evaluate(([id, run]) => localStorage.setItem('cgs-inkmaze-best-v1', JSON.stringify({ [id]: run })), [first.id, { ink: first.par, moves: 5 }])
    assert.equal(await link.getAttribute('href'), '/minigames/')
    assert.match(await link.textContent(), /Mini Games/)
    await link.click()
    await card.waitForURL(/\/minigames\/$/)
    assert.equal(await card.locator('h1').textContent(), 'Mini Games')
    assert.match(await card.title(), /Mini Games/)
    const game = card.locator('.mg-games a.sp-play-card')
    assert.equal(await game.getAttribute('href'), '/minigames/inkMaze/')
    assert.match(await game.textContent(), /Play Ink Maze/)
    assert.match(await game.textContent(), /cleared 1 of 10/, 'the list shows saved progress')
    await game.click()
    await card.waitForSelector('#ink-maze-board')
    assert.equal(await card.locator('a.sp-back').getAttribute('href'), '/minigames/', 'Back goes to the list')
    await card.close()

    console.log(`PASS ${name}: keys, swipe, undo, restart, win, loss, bests, level select, art fallback, reduced motion, minigames list, card`)
  } finally {
    await browser.close()
  }
}
