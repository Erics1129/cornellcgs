// Shared plumbing for the Carrot UI QA harness: launches Chromium/WebKit, swaps the Unity player for the mock (mock-unity.js) and
// loads fixtures (fixtures.js). Never touches the real player; nothing here ships in src.
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const here = dirname(fileURLToPath(import.meta.url))
export const root = join(here, '..', '..')
const pw = await import(process.env.PLAYWRIGHT || '/Users/eric/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')
export const { chromium, webkit } = pw
export const viewports = { desktop: { width: 1440, height: 900 }, portrait: { width: 390, height: 844 }, landscape: { width: 844, height: 390 } }
export const topLimits = { desktop: .21, portrait: .22, landscape: .29 }
export const outDir = process.env.CARROT_QA_OUT || join(root, 'output', 'carrot-ui-qa')
mkdirSync(outDir, { recursive: true })
const gameData = JSON.parse(readFileSync(join(root, 'public/assets/minigames/carrot/game-data.json'), 'utf8'))
const mock = readFileSync(join(here, 'mock-unity.js'), 'utf8'), fixtures = readFileSync(join(here, 'fixtures.js'), 'utf8')

export async function launch(name) {
  if (name === 'webkit') return webkit.launch()
  return chromium.launch({ channel: 'chromium', args: ['--enable-gpu', '--ignore-gpu-blocklist'] })
}
/**
 * A page with the mock player installed. `storage` seeds localStorage (key -> JSON string); `v2` makes the mock answer `load` with
 * bridge-contract snapshots; `data` overrides game-data.json (for example to add wavePlan).
 */
export async function open(browser, { viewport = 'desktop', base = 'http://localhost:5291', reduced = false, storage = {}, v2 = true, data = null, path = '/minigames/carrotDefense/', mobile = false } = {}) {
  const vp = typeof viewport === 'string' ? viewports[viewport] : viewport
  const isPhone = mobile || vp.width < 700 || vp.height < 500
  const context = await browser.newContext({ viewport: vp, reducedMotion: reduced ? 'reduce' : 'no-preference', deviceScaleFactor: isPhone ? 2 : 1, hasTouch: isPhone, isMobile: isPhone && browser.browserType().name() === 'chromium' })
  const served = data || gameData
  await context.route('**/unity/carrot/Build/carrot.loader.js*', r => r.fulfill({ contentType: 'text/javascript', body: 'window.__qaLoader&&window.__qaLoader()' }))
  await context.route('**/unity/carrot/Build/*.unityweb*', r => r.fulfill({ contentType: 'application/octet-stream', body: 'mock' }))
  await context.route('**/assets/minigames/carrot/game-data.json*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(served) }))
  await context.addInitScript(({ data, storage, v2 }) => {
    window.__qaGameData = data
    try { for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v) } catch { /* private */ }
    window.__qaV2 = v2
  }, { data: served, storage, v2 })
  await context.addInitScript(mock)
  await context.addInitScript('window.__qa.v2=window.__qaV2')
  await context.addInitScript(fixtures)
  const page = await context.newPage()
  page.on('pageerror', e => console.log('  pageerror', e.message))
  await page.goto(base + path, { waitUntil: 'load' })
  return { context, page }
}
/** From the lobby into the first open stage (the mock loads instantly); fixtures then set the scene. */
export async function enter(page) {
  await page.waitForSelector('.ct-lobby .ct-cta--hero:not([disabled])')
  await page.click('.ct-lobby .ct-cta--hero')
  await page.waitForFunction(() => !document.querySelector('.ct-loading') && document.querySelector('.ct-hud'), null, { timeout: 20000 })
}
/** A campaign save with `unlocked` stages open (and the tutorial done), as a storage seed for open(). */
export const seed = (unlocked = 5, extra = {}) => ({ 'cgs-carrot-defense-v1': JSON.stringify({ version: 1, unlocked, medals: { 1: 7, 2: 3, 3: 1 }, sound: true }), 'cgs-carrot-records-v1': JSON.stringify({ version: 1, levels: { 1: { grade: 5, bestStreak: 5, bestSeconds: 240, vgrade: 0 }, 2: { grade: 3, bestStreak: 2, bestSeconds: 300, vgrade: 0 } }, seen: { abilities: ['uproot', 'gust', 'rally'], creatures: ['nibble', 'dash', 'mite', 'moth', 'shell', 'swarm', 'beetle', 'slug'] }, tutorial: true }), ...extra })
export async function fixture(page, name, extra = {}) {
  await page.evaluate(({ name, extra }) => { Object.assign(window.__qa, extra); window.__qa.fixture(name) }, { name, extra })
  await page.waitForTimeout(350)
}
export const commands = page => page.evaluate(() => window.__qa.commands.slice())
export const clearCommands = page => page.evaluate(() => { window.__qa.commands.length = 0 })
export const rectsHit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
export function report(results) {
  let failed = 0
  for (const r of results) { if (!r.ok) failed++; console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  — ${typeof r.detail === 'string' ? r.detail : JSON.stringify(r.detail)}` : ''}`) }
  console.log(`\n${results.length - failed}/${results.length} checks passed`)
  return failed
}
