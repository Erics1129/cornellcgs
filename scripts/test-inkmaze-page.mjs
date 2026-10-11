#!/usr/bin/env node
/**
 * Ink Maze in a real browser (Chromium and WebKit): keys, swipes, undo,
 * restart, a win and a loss, saved bests, level select, the board's view
 * events, the sound button, the art fallback, reduced motion, the /minigames/
 * list and the What We Do card, no sideways scroll on a phone, and (when the
 * Unity build is on the server) the 3D board taking over and still winning.
 *
 *   npm run dev                                   (in another terminal)
 *   CGS_TEST_URL=http://localhost:5190 node scripts/test-inkmaze-page.mjs
 *
 * Set CGS_PLAYWRIGHT_MODULE to a Playwright module path if it is not installed locally.
 * Most pages use ?renderer=canvas so they test the 2D board whether or not the
 * Unity build exists; the Unity section runs only when it does.
 */
import assert from 'node:assert/strict'
import { LEVELS } from '../src/minigames/inkmaze/levels.ts'
import { minInk } from '../src/minigames/inkmaze/solver.ts'
import { applyMove, blocksLeft, initialState, legalMoves, rollPath, status } from '../src/minigames/inkmaze/engine.ts'
import { minigames } from '../src/content.ts'

const { chromium, webkit } = await import(process.env.CGS_PLAYWRIGHT_MODULE || 'playwright')
const base = (process.env.CGS_TEST_URL || 'http://localhost:5190').replace(/\/$/, '')
const KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }
const SOUND_KEY = 'cgs-inkmaze-sound-v1'
const game = (query = '') => `${base}/minigames/inkMaze/?renderer=canvas${query ? `&${query}` : ''}`

const hud = (page) => page.evaluate(() => {
  const [ink, moves, left] = [...document.querySelectorAll('.im-hud dd strong')].map((n) => Number(n.textContent))
  return { ink, moves, left }
})
/** wait for the ball to stop: the HUD settles and no roll is queued */
const settle = (page) => page.waitForTimeout(820)
const stage = (page) => page.locator('.im-stage')
/** the board, once keys and swipes are listened for */
const BOARD = '#ink-maze-board[data-ready="true"]'
/**
 * Press a key that starts a roll and wait until the view says the ball is at
 * rest (dev server: the page's event log), or a fixed time otherwise.
 */
async function roll(page, key) {
  if (!(await page.evaluate(() => Array.isArray(window.__inkMazeEvents)))) {
    await page.keyboard.press(key)
    return settle(page)
  }
  // the log keeps only the last 200 events, so look for a 'settled' after the last event seen before the key
  await page.evaluate(() => { window.__rollMark = window.__inkMazeEvents.at(-1) })
  await page.keyboard.press(key)
  await page.waitForFunction(() => {
    const log = window.__inkMazeEvents
    return log.slice(log.lastIndexOf(window.__rollMark) + 1).some((e) => e.type === 'settled')
  }, null, { timeout: 2500 })
  await page.waitForTimeout(60)
}

// ------------------------------------------------- what the engine says should happen
const first = LEVELS[0]
const start = initialState(first)
const right = applyMove(start, 'right')
const atStart = { ink: first.ink, moves: 0, left: blocksLeft(start) }
const afterRight = { ink: right.state.ink, moves: 1, left: blocksLeft(right.state) }
const firstLine = minInk(first).moves
const tight = LEVELS.findIndex((level) => level.slack === 0)
assert.ok(tight >= 0, 'some level has no slack')

/** A line that runs a level out of ink without clearing it: never the winning move, until the ink is gone. */
function losingLine(level) {
  const order = ['down', 'up', 'right', 'left']
  let state = initialState(level)
  const line = []
  for (let turn = 0; status(state) === 'playing'; turn++) {
    const options = legalMoves(state).map((direction) => [direction, applyMove(state, direction).state])
    const pick = options.find(([direction, after]) => status(after) !== 'won' && direction === order[turn % 4])
      ?? options.find(([, after]) => status(after) !== 'won')
    assert.ok(pick, `no losing move from ${JSON.stringify(state)}`)
    line.push(pick[0])
    state = pick[1]
  }
  assert.equal(status(state), 'lost')
  return line
}

/** The shortest line on `level` whose last roll is cut short by the ink running out (or null). */
function inkOutLine(level) {
  const seen = new Set()
  let frontier = [{ state: initialState(level), line: [] }]
  while (frontier.length) {
    const next = []
    for (const { state, line } of frontier) {
      for (const direction of legalMoves(state)) {
        const result = applyMove(state, direction)
        if (result.path.length < rollPath(state, direction).length) return { line: [...line, direction], blocks: result.path.length }
        const key = `${result.state.ball}|${result.state.colored}|${result.state.ink}`
        if (status(result.state) !== 'playing' || seen.has(key)) continue
        seen.add(key)
        next.push({ state: result.state, line: [...line, direction] })
      }
    }
    frontier = next
  }
  return null
}

/** Is the Unity build on this server? (The dev server answers a missing file with the site's HTML.) */
async function unityBuildExists() {
  try {
    const response = await fetch(`${base}/minigames/ink-maze-unity/Build/InkMaze.loader.js`, { method: 'HEAD' })
    return response.ok && !/text\/html/i.test(response.headers.get('content-type') ?? '')
  } catch {
    return false
  }
}
const hasUnity = await unityBuildExists()

/**
 * A stand-in for the Unity build that keeps the bridge contract
 * (docs/INK-MAZE-UNITY.md): it records every SendMessage, draws a plain color,
 * sends 'ready', and answers Animate with cell, impact and settled on the
 * canvas view's timing. window.__fakeUnity.silent makes it ignore rolls;
 * window.__fakeUnityMode = 'reject' makes it fail to start.
 */
const FAKE_LOADER = `
window.createUnityInstance = (canvas, config) => {
  const fake = window.__fakeUnity = { config, messages: [], silent: false, quit: false }
  const emit = (type, payload) => window.dispatchEvent(new CustomEvent('inkmaze:unity', { detail: { type, payload: JSON.stringify(payload) } }))
  const gl = canvas.getContext('webgl2')
  const draw = () => { gl.clearColor(0.15, 0.45, 0.2, 1); gl.clear(gl.COLOR_BUFFER_BIT) }
  if (window.__fakeUnityMode === 'reject') return Promise.reject(new Error('stand-in refused to start'))
  let timers = []
  let rolling = null
  const instance = {
    SendMessage(object, method, argument) {
      fake.messages.push([object, method, argument])
      if (method === 'Show') draw()
      if (method === 'Animate') {
        if (fake.silent) return
        const { id, path } = JSON.parse(argument)
        const duration = Math.min(720, 90 + 58 * path.length)
        rolling = id
        path.forEach((index, i) => timers.push(setTimeout(() => emit('cell', { index, step: i + 1, of: path.length }), ((i + 0.5) / path.length) * duration * 0.8)))
        timers.push(setTimeout(() => { draw(); emit('impact', { strength: 0.5, surface: 'wall' }); emit('settled', { id }); rolling = null }, duration))
      }
      if (method === 'Finish') {
        timers.forEach(clearTimeout)
        timers = []
        if (rolling !== null) emit('settled', { id: rolling })
        rolling = null
      }
    },
    Quit() { timers.forEach(clearTimeout); fake.quit = true; return Promise.resolve() },
  }
  // 'ready' before the instance resolves: the page must wait for both
  setTimeout(() => { draw(); emit('ready', {}) }, 30)
  return new Promise((resolve) => setTimeout(() => resolve(instance), 60))
}
`
const FAKE_FILES = ['InkMaze.framework.js.unityweb', 'InkMaze.wasm.unityweb', 'InkMaze.data.unityweb']
async function withFakeUnity(page) {
  await page.route(/\/minigames\/ink-maze-unity\/Build\//, (route) => {
    const file = new URL(route.request().url()).pathname.split('/').pop()
    if (file === 'InkMaze.loader.js') return route.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE_LOADER })
    if (FAKE_FILES.includes(file)) return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: '' })
    return route.fulfill({ status: 404, contentType: 'text/plain', body: '' })
  })
}
const messages = (page, method) => page.evaluate((m) => (window.__fakeUnity?.messages ?? []).filter(([, name]) => name === m).map(([object, , argument]) => [object, argument]), method)
/** A state as the bridge sends it. */
const wire = (state) => JSON.stringify({ width: state.width, height: state.height, cells: state.cells, ball: state.ball, colored: state.colored, ink: state.ink })

for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch({ headless: true })
  const notes = []
  try {
    // ------------------------------------------------------------- desktop
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(game())
    await page.waitForSelector(BOARD)
    await page.evaluate((key) => { localStorage.removeItem('cgs-inkmaze-best-v1'); localStorage.removeItem(key) }, SOUND_KEY)
    await page.goto(game('level=1'))
    await page.waitForSelector(BOARD)
    assert.equal(await page.locator('h1').textContent(), minigames.inkMaze.title)
    assert.ok((await page.title()).includes(minigames.inkMaze.title))
    assert.deepEqual(await hud(page), atStart)
    assert.equal(await stage(page).getAttribute('data-renderer'), 'canvas', 'the stage says which view is showing')
    assert.equal(await stage(page).getAttribute('data-unity'), 'off', '?renderer=canvas keeps the 3D board from loading')
    const boardEl = page.locator('#ink-maze-board')
    assert.equal(await boardEl.getAttribute('role'), 'img')
    assert.match(await boardEl.getAttribute('aria-label'), /Level 1, .*: a \d+ by \d+ board/)
    assert.equal(await boardEl.getAttribute('tabindex'), '0')

    // a move into the edge does nothing and costs nothing
    const scroll = await page.evaluate(() => scrollY)
    await page.keyboard.press('ArrowUp'); await settle(page)
    assert.deepEqual(await hud(page), atStart, 'blocked move is free')
    await page.keyboard.press('d'); await settle(page) // WASD
    assert.deepEqual(await hud(page), afterRight)
    assert.equal(await page.evaluate(() => scrollY), scroll, 'arrow keys roll the ball, not the page')
    await page.keyboard.press('z'); await settle(page)
    assert.deepEqual(await hud(page), atStart, 'undo gives the ink back')
    await page.keyboard.press('ArrowRight'); await settle(page)
    await page.keyboard.press('r'); await settle(page)
    assert.equal((await hud(page)).moves, 0, 'restart')

    // the board's events: a block-by-block tick, a knock at the end, then rest
    if (await page.evaluate(() => Array.isArray(window.__inkMazeEvents))) {
      await page.evaluate(() => { window.__inkMazeEvents.length = 0 })
      await page.keyboard.press('ArrowRight'); await settle(page)
      const events = await page.evaluate(() => window.__inkMazeEvents.splice(0))
      const cells = events.filter((e) => e.type === 'cell')
      assert.deepEqual(cells.map((e) => [e.index, e.step, e.of]), right.path.map((index, i) => [index, i + 1, right.path.length]), 'one cell event per block, in order')
      const impacts = events.filter((e) => e.type === 'impact')
      assert.equal(impacts.length, 1, 'one knock where the roll ends')
      assert.ok(impacts[0].strength > 0 && impacts[0].strength <= 1)
      assert.ok(['wall', 'rim'].includes(impacts[0].surface))
      assert.ok(events.some((e) => e.type === 'roll' && e.speed > 0 && e.speed <= 1), 'roll speed while moving')
      assert.equal(events.at(-1).type, 'settled', 'settled comes last')
      assert.ok(events.every((e) => e.view === 'canvas'))
      // a bump: no event (the page sounds it), nothing changes
      await page.keyboard.press('ArrowRight'); await settle(page)
      assert.deepEqual(await page.evaluate(() => window.__inkMazeEvents.splice(0)), [], 'a bump is not a roll')
      assert.deepEqual(await hud(page), afterRight)
      await page.keyboard.press('r'); await settle(page)

      // a roll the ink cuts short stops with no knock
      const cut = inkOutLine(first)
      assert.ok(cut, 'level 1 has a roll the ink can cut short')
      for (const [i, move] of cut.line.entries()) {
        if (i === cut.line.length - 1) await page.evaluate(() => { window.__inkMazeEvents.length = 0 })
        await page.keyboard.press(KEY[move]); await settle(page)
      }
      const last = await page.evaluate(() => window.__inkMazeEvents.splice(0))
      assert.equal(last.filter((e) => e.type === 'cell').length, cut.blocks)
      assert.equal(last.filter((e) => e.type === 'impact').length, 0, 'no knock when the ink runs out mid-roll')
      assert.equal(last.at(-1).type, 'settled')
      await page.getByRole('button', { name: 'Restart', exact: true }).first().click(); await settle(page)
      assert.equal((await hud(page)).moves, 0)
    } else {
      notes.push('view events (not a dev server)')
    }

    // win with the solver's own line: the result appears and the best is kept
    for (const move of firstLine) { await page.keyboard.press(KEY[move]); await settle(page) }
    await page.waitForSelector('.im-result[data-kind="won"]')
    assert.match(await page.locator('.im-result').textContent(), /Level cleared/)
    assert.match(await page.locator('.im-result').textContent(), /least this level needs/)
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Next level →', 'Next level has focus')
    const best = await page.evaluate(() => JSON.parse(localStorage.getItem('cgs-inkmaze-best-v1')))
    assert.deepEqual(best[first.id], { ink: first.par, moves: firstLine.length })
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => !document.querySelector('.im-result'))
    assert.match(await page.locator('.im-level h2').textContent(), new RegExp(LEVELS[1].name))
    assert.equal((await hud(page)).ink, LEVELS[1].ink)
    assert.match(page.url(), /level=2/)
    await page.reload(); await page.waitForSelector(BOARD)
    assert.equal(await page.locator('.im-levels__item').first().locator('[data-state="perfect"]').count(), 1, 'the best survives a reload')

    // the level list: one button per level, every one on screen and reachable
    const items = page.locator('.im-levels__item')
    assert.equal(await items.count(), LEVELS.length)
    for (let i = 0; i < LEVELS.length; i++) {
      const box = await items.nth(i).boundingBox()
      assert.ok(box && box.width >= 44 && box.height >= 44, `level ${i + 1} is a 44px target`)
    }

    // a loss on a level with no slack: waste ink, then undo out of it
    await items.nth(tight).click()
    assert.equal((await hud(page)).ink, LEVELS[tight].ink)
    for (const move of losingLine(LEVELS[tight])) { await page.keyboard.press(KEY[move]); await settle(page) }
    await page.waitForSelector('.im-result[data-kind="lost"]')
    assert.equal((await hud(page)).ink, 0)
    await page.getByRole('button', { name: 'Undo last move' }).click(); await settle(page)
    assert.equal(await page.locator('.im-result').count(), 0, 'undo leaves the lost screen')
    assert.ok((await hud(page)).ink > 0)

    // sound: on by default, the button and M switch it, and the choice is kept
    const soundButton = page.locator('.im-actions .im-button--sound')
    assert.equal((await soundButton.textContent()).trim(), 'Sound on')
    assert.equal(await soundButton.getAttribute('aria-pressed'), 'true')
    await soundButton.click()
    assert.equal((await soundButton.textContent()).trim(), 'Sound off')
    assert.equal(await soundButton.getAttribute('aria-pressed'), 'false')
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), SOUND_KEY), 'off')
    await page.reload(); await page.waitForSelector(BOARD)
    assert.equal((await soundButton.textContent()).trim(), 'Sound off', 'sound off is remembered')
    await page.locator('#ink-maze-board').focus()
    await page.keyboard.press('m')
    assert.equal((await soundButton.textContent()).trim(), 'Sound on', 'M turns it back on')
    assert.equal(await soundButton.getAttribute('aria-pressed'), 'true')
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), SOUND_KEY), 'on')
    // moves still play with sound on (the audio is made in code; it must not break anything)
    await page.keyboard.press('ArrowDown'); await settle(page)
    await page.keyboard.press('ArrowLeft'); await settle(page)

    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0)
    assert.deepEqual(errors, [])
    await page.close()

    // ------------------------------------------------- phone: swipe the board
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true })
    await phone.goto(game('level=1'))
    await phone.waitForSelector(BOARD)
    const box = await phone.locator('#ink-maze-board').boundingBox()
    await phone.evaluate(([x, y]) => {
      const board = document.querySelector('#ink-maze-board')
      const at = (type, dx) => board.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: x + dx, clientY: y }))
      at('pointerdown', 0); at('pointermove', 12); at('pointermove', 60); at('pointerup', 60)
    }, [box.x + box.width / 2, box.y + box.height / 2])
    await settle(phone)
    assert.deepEqual(await hud(phone), afterRight, 'a swipe right rolls right')
    assert.equal(await phone.locator('#ink-maze-board').evaluate((e) => getComputedStyle(e).touchAction), 'none')
    await phone.getByRole('button', { name: 'Roll down' }).click(); await settle(phone)
    assert.equal((await hud(phone)).moves, 2, 'the roll pad works')
    for (const button of await phone.locator('.im-actions button').all()) {
      const b = await button.boundingBox()
      assert.ok(b.height >= 44 && b.x >= 0 && b.x + b.width <= 390, 'the action buttons fit on a phone')
    }
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, 'no sideways scroll on a phone')
    await phone.close()

    // --------------------------------- no art at all: plain colors, still playable
    const bare = await browser.newPage({ viewport: { width: 1024, height: 768 } })
    await bare.route(/\/assets\/minigames\/ink-maze\//, (route) => route.fulfill({ status: 404, body: '' }))
    await bare.goto(game('level=1'))
    await bare.waitForSelector(BOARD); await bare.waitForTimeout(400)
    assert.equal(await stage(bare).getAttribute('data-renderer'), 'canvas')
    const floor = await bare.locator('#ink-maze-board canvas.im-canvas--flat').evaluate((canvas) => {
      const ctx = canvas.getContext('2d')
      // the middle of the lower-right floor block of level 1 (row 4, col 4)
      return [...ctx.getImageData(Math.round(canvas.width * 0.66), Math.round(canvas.height * 0.68), 1, 1).data]
    })
    assert.ok(floor[0] > 180 && floor[2] < 200, `plain-color floor is drawn: ${floor}`)
    await bare.keyboard.press('ArrowRight'); await settle(bare)
    assert.equal((await hud(bare)).moves, 1)
    await bare.close()

    // ------------------------------------------- reduced motion: rolls land at once
    const calm = await browser.newPage({ viewport: { width: 1024, height: 768 }, reducedMotion: 'reduce' })
    await calm.goto(game('level=1'))
    await calm.waitForSelector(BOARD)
    await calm.keyboard.press('ArrowRight'); await calm.keyboard.press('ArrowDown'); await calm.waitForTimeout(120)
    assert.equal((await hud(calm)).moves, 2, 'no animation holds moves back')
    await calm.close()

    // ------------- the 3D board's contract, with a stand-in for the Unity build
    {
      const fake = await browser.newPage({ viewport: { width: 1280, height: 860 } })
      const fakeErrors = []
      fake.on('pageerror', (error) => fakeErrors.push(error.message))
      await withFakeUnity(fake)
      await fake.goto(`${base}/minigames/inkMaze/?level=1`)
      await fake.waitForSelector(BOARD)
      await fake.waitForFunction(() => document.querySelector('.im-stage')?.dataset.renderer === 'unity', null, { timeout: 10000 })
      assert.equal(await stage(fake).getAttribute('data-unity'), 'on')
      const config = await fake.evaluate(() => window.__fakeUnity.config)
      assert.match(config.frameworkUrl, /InkMaze\.framework\.js\.unityweb\?v=[0-9a-f]{10}$/)
      assert.match(config.codeUrl, /InkMaze\.wasm\.unityweb\?v=[0-9a-f]{10}$/)
      assert.match(config.dataUrl, /InkMaze\.data\.unityweb\?v=[0-9a-f]{10}$/)
      assert.ok(config.devicePixelRatio >= 1 && config.devicePixelRatio <= 2, 'device pixel ratio capped at 2')
      assert.deepEqual(await messages(fake, 'SetReducedMotion'), [['Bridge', '0']], 'reduced motion is sent once Unity is ready')
      assert.deepEqual(await messages(fake, 'Show'), [['Bridge', wire(start)]], 'Unity is shown the current position')
      await fake.waitForTimeout(450) // the fade
      assert.equal(await fake.locator('.im-canvas--flat').evaluate((e) => getComputedStyle(e).visibility), 'hidden')
      assert.equal(await fake.locator('.im-canvas--unity').evaluate((e) => getComputedStyle(e).opacity), '1')
      const fit = await fake.evaluate(() => [document.querySelector('.im-canvas--unity'), document.querySelector('#ink-maze-board')].map((e) => JSON.stringify(e.getBoundingClientRect())))
      assert.equal(fit[0], fit[1], 'the 3D canvas covers the board exactly')

      // a bump, a roll, an undo in the middle of a roll
      await fake.keyboard.press('ArrowUp'); await fake.waitForTimeout(100)
      assert.deepEqual(await messages(fake, 'Bump'), [['Bridge', 'up']])
      await fake.evaluate(() => window.__inkMazeEvents?.splice(0))
      await roll(fake, 'ArrowRight')
      assert.deepEqual(await hud(fake), afterRight)
      const animate = JSON.parse((await messages(fake, 'Animate'))[0][1])
      assert.deepEqual(animate.path, right.path, 'Unity rolls the path the engine chose')
      assert.equal(JSON.stringify(animate.state), wire(right.state))
      const forwarded = await fake.evaluate(() => window.__inkMazeEvents?.splice(0))
      if (forwarded) {
        assert.deepEqual(forwarded.filter((e) => e.type === 'cell').map((e) => e.step), right.path.map((_, i) => i + 1), 'cell events come through')
        assert.ok(forwarded.every((e) => e.view === 'unity'))
      }
      await fake.keyboard.press('ArrowLeft'); await fake.waitForTimeout(60); await fake.keyboard.press('z'); await fake.waitForTimeout(200)
      assert.equal((await messages(fake, 'Finish')).length, 1, 'undo mid-roll ends the roll')
      assert.equal((await messages(fake, 'Show')).at(-1)[1], wire(right.state), '...and shows the position before it')
      assert.deepEqual(await hud(fake), afterRight)
      await fake.keyboard.press('z'); await fake.waitForTimeout(100)

      // the solver's line still wins
      for (const move of firstLine) await roll(fake, KEY[move])
      await fake.waitForSelector('.im-result[data-kind="won"]')
      await fake.getByRole('button', { name: 'Play again' }).click()

      // rolls that never settle: the page finishes them itself, then gives up on Unity
      await fake.evaluate(() => { window.__fakeUnity.silent = true })
      const shows = (await messages(fake, 'Show')).length
      await fake.evaluate(() => window.__inkMazeEvents?.splice(0))
      const t0 = Date.now()
      await fake.keyboard.press('ArrowRight')
      await fake.waitForFunction((n) => window.__fakeUnity.messages.filter(([, m]) => m === 'Show').length > n, shows, { timeout: 3000 })
      assert.ok(Date.now() - t0 >= 1400, 'the safety net waits 1.5 s')
      assert.equal((await messages(fake, 'Show')).at(-1)[1], wire(right.state), 'after a missed roll Unity is shown the position again')
      assert.equal(await stage(fake).getAttribute('data-renderer'), 'unity', 'one miss is forgiven')
      const settledCount = () => fake.evaluate(() => window.__inkMazeEvents?.filter((e) => e.type === 'settled').length ?? -1)
      const afterMiss = await settledCount()
      if (afterMiss >= 0) {
        assert.equal(afterMiss, 1, 'the safety net tells listeners (the rolling sound) that the ball is at rest')
        // a 'settled' that turns up late, for the roll the safety net already finished, is not passed on
        const missedId = JSON.parse((await messages(fake, 'Animate')).at(-1)[1]).id
        await fake.evaluate((id) => window.dispatchEvent(new CustomEvent('inkmaze:unity', { detail: { type: 'settled', payload: JSON.stringify({ id }) } })), missedId)
        assert.equal(await settledCount(), 1, 'a late settled is dropped')
      }
      await fake.keyboard.press('ArrowDown')
      await fake.waitForFunction(() => document.querySelector('.im-stage')?.dataset.renderer === 'canvas', null, { timeout: 3000 })
      assert.equal(await stage(fake).getAttribute('data-unity'), 'failed')
      assert.equal(await fake.evaluate(() => window.__fakeUnity.quit), true, 'the Unity instance is shut down')
      assert.equal(await fake.locator('.im-canvas--flat').evaluate((e) => getComputedStyle(e).visibility), 'visible')
      assert.equal((await hud(fake)).moves, 2)
      await fake.keyboard.press('ArrowLeft'); await settle(fake)
      assert.equal((await hud(fake)).moves, 3, 'play goes on, on the 2D board')
      assert.deepEqual(fakeErrors, [])
      await fake.close()
    }
    {
      // an error from Unity puts the 2D board back at once, with the same position
      const broken = await browser.newPage({ viewport: { width: 1280, height: 860 } })
      await withFakeUnity(broken)
      await broken.goto(`${base}/minigames/inkMaze/?level=1`)
      await broken.waitForFunction(() => document.querySelector('.im-stage')?.dataset.renderer === 'unity', null, { timeout: 10000 })
      await roll(broken, 'ArrowRight')
      await broken.evaluate(() => window.dispatchEvent(new CustomEvent('inkmaze:unity', { detail: { type: 'error', payload: '{"message":"test"}' } })))
      await broken.waitForFunction(() => document.querySelector('.im-stage')?.dataset.renderer === 'canvas')
      assert.deepEqual(await hud(broken), afterRight)
      await broken.keyboard.press('ArrowDown'); await settle(broken)
      assert.equal((await hud(broken)).moves, 2)
      await broken.close()

      // a build that will not start leaves the 2D board in place
      const refused = await browser.newPage({ viewport: { width: 1280, height: 860 } })
      await refused.addInitScript(() => { window.__fakeUnityMode = 'reject' })
      await withFakeUnity(refused)
      await refused.goto(`${base}/minigames/inkMaze/?level=1`)
      await refused.waitForFunction(() => document.querySelector('.im-stage')?.dataset.unity === 'failed', null, { timeout: 10000 })
      assert.equal(await stage(refused).getAttribute('data-renderer'), 'canvas')
      await refused.keyboard.press('ArrowRight'); await settle(refused)
      assert.deepEqual(await hud(refused), afterRight)
      await refused.close()
    }

    // -------------------------- the 3D board: takes over, keeps the layout, still wins
    if (hasUnity) {
      const deep = await browser.newPage({ viewport: { width: 1280, height: 860 } })
      const deepErrors = []
      deep.on('pageerror', (error) => deepErrors.push(error.message))
      await deep.goto(`${base}/minigames/inkMaze/?level=1`)
      await deep.waitForSelector(BOARD)
      await deep.evaluate(() => document.fonts.ready)
      const before = await deep.locator('#ink-maze-board').boundingBox()
      // playable on the 2D board while the 3D one loads
      await deep.keyboard.press('ArrowRight'); await settle(deep)
      assert.deepEqual(await hud(deep), afterRight)
      await deep.keyboard.press('z'); await settle(deep)
      const phase = await stage(deep).getAttribute('data-unity')
      if (phase === 'off') {
        notes.push('3D board (this browser has no WebGL2)')
      } else {
        await deep.waitForFunction(() => document.querySelector('.im-stage')?.dataset.unity !== 'loading', null, { timeout: 30000 })
        assert.equal(await stage(deep).getAttribute('data-unity'), 'on', 'the 3D board loaded')
        assert.equal(await stage(deep).getAttribute('data-renderer'), 'unity', 'the 3D board took over')
        await deep.waitForTimeout(500) // the fade
        const after = await deep.locator('#ink-maze-board').boundingBox()
        assert.deepEqual(after, before, 'the layout does not move when the 3D board takes over')
        const fit = await deep.evaluate(() => {
          const rect = (selector) => JSON.stringify(document.querySelector(selector).getBoundingClientRect())
          return { flat: rect('.im-canvas--flat'), unity: rect('.im-canvas--unity'), board: rect('#ink-maze-board') }
        })
        assert.equal(fit.unity, fit.board, 'the 3D canvas fills the board')
        assert.equal(fit.flat, fit.board, 'the 2D canvas still holds the same place')
        const aspect = await deep.locator('#ink-maze-board').evaluate((e) => { const [w, h = 1] = e.style.aspectRatio.split('/').map(Number); return w / h })
        assert.ok(Math.abs(after.width / after.height - aspect) < 0.01, 'the board keeps its aspect ratio')
        assert.equal(await deep.locator('.im-canvas--flat').evaluate((e) => getComputedStyle(e).visibility), 'hidden')
        assert.equal(await deep.locator('.im-canvas--flat').getAttribute('aria-hidden'), 'true')
        assert.equal(await deep.locator('.im-canvas--unity').evaluate((e) => getComputedStyle(e).opacity), '1')
        // the board element is still the one that is focused, labelled and swiped
        await deep.locator('#ink-maze-board').focus()
        assert.equal(await deep.evaluate(() => document.activeElement?.id), 'ink-maze-board')
        if (name === 'chromium') {
          // Unity must not keep the keyboard: Tab still moves focus on
          await deep.keyboard.press('Tab')
          assert.notEqual(await deep.evaluate(() => document.activeElement?.id), 'ink-maze-board', 'Tab leaves the board')
          await deep.locator('#ink-maze-board').focus()
        }
        // a blocked move, an undo, then the solver's line wins on the 3D board
        await deep.keyboard.press('ArrowUp'); await settle(deep)
        assert.deepEqual(await hud(deep), atStart)
        await roll(deep, 'ArrowRight')
        assert.deepEqual(await hud(deep), afterRight)
        await deep.keyboard.press('z'); await settle(deep)
        assert.deepEqual(await hud(deep), atStart)
        if (await deep.evaluate(() => Array.isArray(window.__inkMazeEvents))) await deep.evaluate(() => { window.__inkMazeEvents.length = 0 })
        for (const move of firstLine) await roll(deep, KEY[move])
        await deep.waitForSelector('.im-result[data-kind="won"]', { timeout: 3000 })
        assert.equal(await stage(deep).getAttribute('data-renderer'), 'unity', 'still the 3D board at the end')
        if (await deep.evaluate(() => Array.isArray(window.__inkMazeEvents))) {
          const events = await deep.evaluate(() => window.__inkMazeEvents.splice(0))
          assert.equal(events.filter((e) => e.type === 'settled' && e.view === 'unity').length >= firstLine.length, true, 'Unity settled every roll')
        }
        // a level with no ink to spare: the solver's line still wins on the 3D board, to the last drop
        await deep.getByRole('button', { name: 'Play again' }).click()
        await deep.locator('.im-levels__item').nth(tight).click()
        assert.equal((await hud(deep)).ink, LEVELS[tight].par)
        for (const move of minInk(LEVELS[tight]).moves) await roll(deep, KEY[move])
        await deep.waitForSelector('.im-result[data-kind="won"]', { timeout: 3000 })
        assert.deepEqual(await hud(deep), { ink: 0, moves: minInk(LEVELS[tight]).moves.length, left: 0 })
        assert.equal(await stage(deep).getAttribute('data-renderer'), 'unity', 'the 3D board kept the zero-slack level to the end')
        assert.deepEqual(deepErrors, [])
      }
      await deep.close()
    } else {
      notes.push('3D board (no Unity build on the server)')
    }

    // ------------------------------- /minigames/, and the card on What We Do
    const card = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await card.goto(`${base}/whatWeDo/`)
    const link = card.locator('a.sp-play-card')
    await link.waitFor()
    // each page here is a fresh browser profile: save one cleared level for the list to show
    await card.evaluate(([id, run]) => localStorage.setItem('cgs-inkmaze-best-v1', JSON.stringify({ [id]: run })), [first.id, { ink: first.par, moves: 5 }])
    assert.equal(await link.getAttribute('href'), '/minigames/')
    assert.ok((await link.textContent()).includes(minigames.card.title))
    await link.click()
    await card.waitForURL(/\/minigames\/$/)
    assert.equal(await card.locator('h1').textContent(), minigames.title)
    assert.ok((await card.title()).includes(minigames.title))
    // the list holds more than one game: pick Ink Maze's card by its link
    const gameCard = card.locator('.mg-games a.sp-play-card[href="/minigames/inkMaze/"]')
    assert.equal(await gameCard.count(), 1, 'one Ink Maze card on the list')
    assert.ok((await gameCard.textContent()).includes(minigames.inkMaze.cta))
    assert.match(await gameCard.textContent(), new RegExp(`cleared 1 of ${LEVELS.length}`), 'the list shows saved progress')
    await gameCard.click()
    await card.waitForSelector(BOARD)
    assert.equal(await card.locator('a.sp-back').getAttribute('href'), '/minigames/', 'Back goes to the list')
    await card.close()

    console.log(`PASS ${name}: keys, swipe, undo, restart, win, loss, bests, level select, view events, sound button, art fallback, reduced motion, 3D contract with a stand-in, minigames list, card${hasUnity && !notes.some((n) => n.startsWith('3D')) ? ', 3D board' : ''}`)
    if (notes.length) console.log(`  skipped in ${name}: ${notes.join('; ')}`)
  } finally {
    await browser.close()
  }
}
