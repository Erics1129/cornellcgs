// Duo UI acceptance suite: the multiplayer lobby, side reveal, HUD banners and results, driven by the scripted mockSession (no
// network) on the mock Unity player of scripts/carrot-ui-qa. Needs the site served by `npm run dev` (any port):
//   BASE=http://localhost:5190 node scripts/carrot-duo-ui-qa/ui.mjs [chromium|webkit|all] [viewport,...]
// Viewports: p320 (320x640), portrait (390x844), landscape (844x390), desktop (1440x900). On every screen it checks: no horizontal
// scroll or overflow, every control at least 44x44 CSS px, aria-live regions present; per flow: a visible focus ring and a logical
// tab order, reduced motion uses no transform animation, no backdrop-filter while playing (at most one in the lobby), the page's own
// Results stay hidden and a duo win records through the page's award path. Screenshots and report.json go to CARROT_DUO_QA_OUT
// (default output/carrot-duo-ui-qa/).
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, open, seed, root } from '../carrot-ui-qa/lib.mjs'
const [which = 'all', only = ''] = process.argv.slice(2)
const base = process.env.BASE || 'http://localhost:5190'
const out = process.env.CARROT_DUO_QA_OUT || join(root, 'output', 'carrot-duo-ui-qa')
mkdirSync(out, { recursive: true })
const viewports = { p320: { width: 320, height: 640 }, portrait: { width: 390, height: 844 }, landscape: { width: 844, height: 390 }, desktop: { width: 1440, height: 900 } }
const engines = which === 'all' ? ['chromium', 'webkit'] : [which]
const sizes = only ? only.split(',') : Object.keys(viewports)
const results = []
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail: ok ? undefined : detail }); return ok }
const mockPath = (extra = '') => `/minigames/carrotDefense/?carrot-duo-mock&carrot-duo-fast${extra}`
const sleep = ms => new Promise(r => setTimeout(r, ms))

/** Overflow, 44 px targets and the live regions, for whatever duo screen is showing. */
const auditScreen = page => page.evaluate(() => {
  const w = innerWidth
  const visible = el => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none' }
  const name = el => `${el.tagName.toLowerCase()}.${String(el.className || '').split(' ').filter(Boolean).slice(0, 2).join('.')}${el.textContent ? ` "${el.textContent.trim().slice(0, 24)}"` : ''}`
  const all = [...document.querySelectorAll('.ct-duo, .ct-duo *')].filter(visible)
  const overflow = all.filter(el => { if (el.closest('.ct-duo-sr')) return false; const r = el.getBoundingClientRect(); return r.right > w + 1 || r.left < -1 }).map(name)
  const controls = [...document.querySelectorAll('.ct-duo button, .ct-duo input, .ct-duo [role="radio"], .ct-duo a[href]')].filter(visible)
  const small = controls.filter(el => { const r = el.getBoundingClientRect(); return r.width < 43.5 || r.height < 43.5 }).map(el => `${name(el)} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`)
  const live = !!document.querySelector('.ct-duo-sr [aria-live="polite"]') && !!document.querySelector('.ct-duo-sr [aria-live="assertive"]')
  return { scroll: document.scrollingElement.scrollWidth - w, overflow: overflow.slice(0, 5), small: small.slice(0, 5), controls: controls.length, live }
})
/** Tab through the duo controls: each one shows a ring (outline at least 2 px) and the order follows the document. */
// WebKit on macOS moves Tab between text fields only (Full Keyboard Access off); Option+Tab reaches every control, as Safari users do
let tabKey = 'Tab'
async function tabAudit(page, start, steps = 10) {
  await page.evaluate(sel => { const el = document.querySelector(sel); if (el) { el.setAttribute('tabindex', el.getAttribute('tabindex') ?? '-1'); el.focus() } }, start)
  const seen = []
  // one full cycle: stop when focus comes back to a control already visited (a dialog's focus trap) or leaves the duo layer
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press(tabKey)
    const f = await page.evaluate(() => {
      const el = document.activeElement; if (!el || el === document.body) return null
      const inside = !!el.closest('.ct-duo')
      const ring = el.closest('.ct-duo-switch') || el
      const s = getComputedStyle(ring)
      const all = [...document.querySelectorAll('*')]
      return { inside, ring: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2, index: all.indexOf(el), label: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 30) }
    })
    if (!f || !f.inside || seen.some(x => x.index === f.index)) break
    seen.push(f)
  }
  let wraps = 0; for (let i = 1; i < seen.length; i++) if (seen[i].index < seen[i - 1].index) wraps++
  return { count: seen.length, rings: seen.every(f => f.ring), noRing: seen.filter(f => !f.ring).map(f => f.label), wraps, order: seen.map(f => f.label) }
}
const transformAnimations = page => page.evaluate(() => document.getAnimations().filter(a => a.effect?.target?.closest?.('.ct-duo')).flatMap(a => {
  const props = (a.effect.getKeyframes?.() || []).flatMap(k => Object.keys(k)).filter(k => /transform|translate|scale|rotate/.test(k))
  const prop = a.transitionProperty || ''
  return props.length || /transform|translate|scale|rotate/.test(prop) ? [`${a.animationName || prop} on ${a.effect.target.className}`] : []
}))
const blurred = page => page.evaluate(() => [...document.querySelectorAll('*')].filter(el => { const s = getComputedStyle(el); const b = s.backdropFilter || s.webkitBackdropFilter; return b && b !== 'none' }).map(el => String(el.className).slice(0, 40)))
const mock = (page, fn, arg) => page.evaluate(([f, a]) => { const m = window.__duoMock; return new Function('m', 'a', `return (${f})(m,a)`)(m, a) }, [fn.toString(), arg])
const phase = page => page.evaluate(() => window.__duoMock?.session.get().phase)
const waitPhase = (page, p, timeout = 8000) => page.waitForFunction(p => window.__duoMock?.session.get().phase === p, p, { timeout })
const bannerText = page => page.evaluate(() => document.querySelector('.ct-duo-banner')?.textContent?.trim() || '')

for (const engine of engines) {
  const browser = await launch(engine)
  tabKey = engine === 'webkit' ? 'Alt+Tab' : 'Tab'
  for (const vp of sizes) {
    const E = s => `[${engine} ${vp}] ${s}`
    let n = 0
    const shot = async (page, name) => { await page.screenshot({ path: join(out, `${engine}-${vp}-${String(++n).padStart(2, '0')}-${name}.png`) }) }
    const screen = async (page, name) => {
      await sleep(engine === 'webkit' ? 420 : 320)
      const a = await auditScreen(page)
      check(E(`${name}: no horizontal scroll or overflow`), a.scroll <= 0 && !a.overflow.length, a)
      check(E(`${name}: every control at least 44x44`), !a.small.length, a.small)
      check(E(`${name}: aria-live regions present`), a.live)
      await shot(page, name)
      return a
    }
    // ------------------------------------------------ 1. title, home, wrong code, every join error
    {
      const { context, page } = await open(browser, { viewport: viewports[vp], storage: seed(14), base, path: mockPath() })
      await page.waitForSelector('.ct-duo-entry')
      await screen(page, 'title')
      await page.click('.ct-duo-entry')
      await page.waitForSelector('.ct-duo-home')
      await screen(page, 'home')
      const t = await tabAudit(page, '#ct-duo-title', 9)
      check(E('home: focus rings on every control'), t.count >= 4 && t.rings, t)
      check(E('home: tab order follows the page (one cycle, document order)'), t.wraps === 0, t.order)
      // wrong code
      await page.fill('.ct-duo-codein__input', 'k7m0q')
      const wrong = await page.evaluate(() => ({ hint: document.querySelector('.ct-duo-codein__hint')?.textContent, invalid: document.querySelector('.ct-duo-codein__input')?.getAttribute('aria-invalid'), value: document.querySelector('.ct-duo-codein__input')?.value }))
      check(E('wrong code: ambiguous characters refused with the message'), wrong.hint === 'Codes never use 0, O, 1, I or L' && wrong.invalid === 'true' && wrong.value === 'K7MQ', wrong)
      await screen(page, 'home-wrong-code')
      await page.fill('.ct-duo-codein__input', ' zz-zzz ')
      check(E('code field normalizes case, spaces and dashes'), await page.inputValue('.ct-duo-codein__input') === 'ZZZZZ')
      const errors = { ZZZZZ: 'room-not-found', FFFFF: 'room-full', VVVVV: 'version-mismatch', NNNNN: 'network', BBBBB: 'busy', PPPPP: 'in-progress' }
      for (const [code, kind] of Object.entries(errors)) {
        await page.fill('.ct-duo-codein__input', code)
        await page.click('text=Join room')
        if (kind === 'room-not-found') { await page.waitForSelector('.ct-duo-wait'); await screen(page, 'connecting') }
        await page.waitForSelector('.ct-duo-error', { timeout: 5000 })
        const e = await page.evaluate(() => ({ title: document.querySelector('.ct-duo-error h3')?.textContent, body: document.querySelector('.ct-duo-error p')?.textContent, retry: !!document.querySelector('.ct-duo-error .ct-duo-btn--primary') }))
        check(E(`error ${kind}: headline, the protocol copy and Back`), e.title && e.body && e.body.length > 10, e)
        if (kind === 'busy') check(E('busy names the local time of the reset'), /after \d/.test(e.body), e.body)
        if (kind === 'version-mismatch') check(E('version mismatch asks for a reload'), /reload/i.test(e.body), e.body)
        if (kind === 'network' || kind === 'busy') check(E(`${kind} offers Retry`), e.retry)
        await screen(page, `error-${kind}`)
        await page.click('.ct-duo-error >> text=Back')
        await page.waitForSelector('.ct-duo-home')
      }
      // partner left (after joining a room as the guest)
      await page.fill('.ct-duo-codein__input', 'K7M2Q')
      await page.click('text=Join room')
      await page.waitForSelector('.ct-duo-room')
      await sleep(600)
      await screen(page, 'room-guest')
      check(E('guest: no Start button, the host picks'), await page.evaluate(() => !document.querySelector('.ct-duo-sheet__foot .ct-duo-btn--primary') && /host picks/i.test(document.querySelector('.ct-duo-mode')?.textContent || '')))
      await mock(page, m => m.error('partner-left'))
      await page.waitForSelector('.ct-duo-error')
      await screen(page, 'error-partner-left')
      // Escape closes the overlay from the error screen; the entry pill returns on the title screen
      await page.keyboard.press('Escape')
      await sleep(300)
      check(E('Escape closes the multiplayer overlay from an error'), await page.evaluate(() => !document.querySelector('.ct-duo-lobby')))
      await context.close()
    }
    // ------------------------------------------------ 2. host: gating, reveal, prep, HUD banners and toasts, every duo result
    {
      const { context, page } = await open(browser, { viewport: viewports[vp], storage: seed(14), base, path: mockPath('&carrot-duo-manual') })
      await page.waitForSelector('.ct-duo-entry'); await page.click('.ct-duo-entry')
      await page.fill('#ct-duo-name', 'Mia')
      await page.click('text=Create room')
      await page.waitForSelector('.ct-duo-codecard')
      const ann = await page.evaluate(() => document.querySelector('.ct-duo-sr [aria-live="polite"]')?.textContent || '')
      check(E('creating a room is announced with its code'), /K7M2Q/.test(ann), ann)
      await sleep(500)
      const start = () => page.evaluate(() => { const b = [...document.querySelectorAll('.ct-duo-sheet__foot button')].find(x => x.textContent.includes('Start match')); return b ? !b.disabled : null })
      check(E('Start is disabled before anyone is ready'), await start() === false)
      await screen(page, 'room-host')
      const tr = await tabAudit(page, '#ct-duo-title', 14)
      check(E('room: focus rings on every control'), tr.count >= 6 && tr.rings, tr)
      check(E('room: tab order follows the page (one cycle, document order)'), tr.wraps === 0, tr.order)
      await page.click('.ct-duo-ready')
      await sleep(200)
      check(E('Start stays disabled while the partner is not ready'), await start() === false)
      check(E('the hint names who is not ready'), /Waiting for Ana to be ready/.test(await page.textContent('.ct-duo-foot__hint')))
      await mock(page, m => m.partnerReady(true))
      await sleep(200)
      check(E('Start is enabled once both are ready and loaded'), await start() === true)
      await screen(page, 'room-ready')
      // endless choice and back (the host's mode switch), then the union toggle
      await page.click('.ct-duo-seg__btn >> text=Endless (2 players)')
      await page.waitForSelector('.ct-duo-endless-card')
      await screen(page, 'room-endless')
      await page.click('.ct-duo-seg__btn >> text=Boss fight')
      await page.waitForSelector('.ct-duo-fights')
      const locked = await page.evaluate(() => [...document.querySelectorAll('.ct-duo-fight[aria-disabled]')].length)
      check(E('intersection by default: fights only one player has are locked'), locked >= 5, locked)
      await page.click('.ct-duo-switch')
      await sleep(250)
      const union = await page.evaluate(() => [...document.querySelectorAll('.ct-duo-fight')].filter(b => !b.hasAttribute('aria-disabled')).length)
      check(E('union toggle opens fights either player has'), union > 11 - locked, union)
      await page.click('.ct-duo-switch')
      await mock(page, m => m.partnerReady(true)); await page.evaluate(() => { const me = window.__duoMock.session.get().peers.find(p => p.me); if (!me.ready) window.__duoMock.session.setReady(true) })
      await sleep(250)
      // reduced-motion contexts get the reveal check below; here the normal reveal
      await page.click('text=Start match')
      await page.waitForSelector('.ct-duo-reveal')
      const rv = await page.evaluate(() => ({ title: document.querySelector('#ct-duo-reveal-title')?.textContent, count: document.querySelector('.ct-duo-reveal__count b')?.textContent }))
      check(E('side reveal names the garden and counts down'), /You defend the (WEST|EAST) garden/.test(rv.title) && /^[123]$/.test(rv.count), rv)
      await screen(page, 'reveal')
      await waitPhase(page, 'prep')
      await sleep(300)
      await screen(page, 'prep')
      check(E('prep: the rail shows the partner'), await page.evaluate(() => !!document.querySelector('.ct-duo-partner')))
      await page.click('.ct-start')
      await sleep(150)
      check(E('prep: pressing Start waits for the partner'), /Waiting for Ana to start/.test(await bannerText(page)), await bannerText(page))
      await screen(page, 'prep-waiting')
      await mock(page, m => m.partnerStart())
      await page.waitForSelector('.ct-duo-count')
      check(E('wave 1 countdown shows'), /Wave 1 in/.test(await page.textContent('.ct-duo-count')))
      await screen(page, 'go-countdown')
      await waitPhase(page, 'playing')
      await sleep(700)
      await screen(page, 'playing')
      const blurPlay = await blurred(page)
      check(E('playing: no element has a backdrop-filter'), !blurPlay.length, blurPlay)
      // phones show one camera button that opens the three views beside the rail
      const openCamera = async () => { if (await page.isVisible('.ct-duo-camera__toggle')) { await page.click('.ct-duo-camera__toggle'); await sleep(200) } }
      await openCamera()
      if (await page.isVisible('.ct-duo-camera__toggle')) await screen(page, 'camera-open')
      const tp = await tabAudit(page, '.ct-duo-rail', 6)
      check(E('HUD rail: focus rings on the camera buttons'), tp.count >= 3 && tp.rings, tp)
      // the camera switch reaches the session (and the phone popover closes after the pick)
      await page.click('.ct-duo-camera__btn >> nth=2')
      check(E('Watch <name> sends the partner camera'), await page.evaluate(() => window.__duoMock.camera === 'partner'))
      check(E('the camera choice closes the phone popover'), await page.evaluate(() => !document.querySelector('.ct-duo-camera[data-open]')))
      await openCamera()
      await page.click('.ct-duo-camera__btn >> nth=0')
      // banners
      const banners = [
        ['hold', m => m.set({ hold: true }), /Your garden is safe, waiting for Ana/],
        ['partner-paused', m => { m.set({ hold: false }); m.partnerPause(true) }, /Ana paused/],
        ['away', m => { m.partnerPause(false); m.partnerAway(true) }, /Ana stepped away\s*[01]:[0-5]\d/],
        ['restoring', m => { m.partnerAway(false); m.set({ restoring: { seat: 1, progress: .43 } }) }, /Restoring Ana's garden 43%/],
        ['waiting', m => m.set({ restoring: null, waiting: true }), /Waiting for Ana/],
      ]
      for (const [name, fn, re] of banners) {
        await mock(page, fn); await sleep(150)
        const text = await bannerText(page)
        check(E(`banner ${name}`), re.test(text), text)
        await screen(page, `banner-${name}`)
      }
      await mock(page, m => m.set({ waiting: false }))
      await waitPhase(page, 'playing', 6000).catch(() => {})
      // toasts: a partner tap toast is debounced to one per second
      await mock(page, m => { for (let i = 0; i < 5; i++) m.emit({ type: 'partnerTap' }) })
      await sleep(120)
      const taps = await page.evaluate(() => [...document.querySelectorAll('.ct-duo-toast')].filter(t => t.textContent === "That's Ana's side").length)
      check(E("partner taps: one \"That's Ana's side\" toast"), taps === 1, taps)
      await mock(page, m => m.emit({ type: 'resynced', seat: 1 }))
      await sleep(120)
      check(E('Resynced toast'), await page.evaluate(() => [...document.querySelectorAll('.ct-duo-toast')].some(t => t.textContent === 'Resynced')))
      await screen(page, 'toasts')
      // the page's commands go through the filter: Space pauses the match (explicit), a second Space resumes, a third waits out the cooldown
      if (vp === 'desktop') {
        await page.waitForTimeout(3300)
        await waitPhase(page, 'playing', 6000).catch(() => {})
        await page.evaluate(() => document.activeElement?.blur?.())
        await page.keyboard.press('Space'); await sleep(150)
        check(E('Space pauses the match through the session'), await phase(page) === 'paused')
        await page.keyboard.press('Space'); await sleep(1100)
        check(E('Space resumes (3-2-1)'), await phase(page) === 'playing')
        await page.keyboard.press('Space'); await sleep(150)
        const cool = await page.evaluate(() => [...document.querySelectorAll('.ct-duo-toast')].map(t => t.textContent).join('|'))
        check(E('a pause right after resuming waits out the cooldown'), await phase(page) === 'playing' && /pause again in/.test(cool), cool)
        // Settings > Restart stage sends 'load': blocked in a room
        await page.evaluate(() => { window.__qa.commands.length = 0 })
        await page.click('[aria-label="Settings"]')
        await page.click('text=Restart stage')
        await page.click('.ct-confirm >> text=Restart').catch(async () => { await page.click('dialog >> text=Restart >> nth=-1') })
        await sleep(200)
        const loads = await page.evaluate(() => window.__qa.commands.filter(c => c.type === 'load').length)
        check(E('a stage load from the page never reaches Unity in a room'), loads === 0, loads)
        await page.keyboard.press('Escape').catch(() => {})
        await sleep(300)
      }
      // results: the page's own Results stay hidden; a duo win records through the page's award path
      const outcomes = [
        ['win', { kind: 'duoWin', level: 25, tick: 9000, health: 9, partnerHealth: 7 }, /Both gardens held/, /Win recorded for both players/],
        ['loss-partner', { kind: 'duoLoss', level: 25, tick: 4000, fell: 1, fellName: 'Ana', wave: 5 }, /Ana's carrot fell/, /solo loss/],
        ['loss-mine', { kind: 'duoLoss', level: 25, tick: 4000, fell: 0, fellName: 'Mia', wave: 3 }, /Your carrot fell/, /solo loss/],
        ['unfinished-left', { kind: 'unfinished', level: 25, reason: 'left', by: 1 }, /Match unfinished/, /Nothing was recorded/],
        ['unfinished-grace', { kind: 'unfinished', level: 25, reason: 'grace', by: 1 }, /Match unfinished/, /Nothing was recorded/],
        ['unfinished-desync', { kind: 'unfinished', level: 25, reason: 'desync', by: -1 }, /Match unfinished/, /Nothing was recorded/],
      ]
      let first = true
      for (const [name, result, title, recorded] of outcomes) {
        if (first) await page.evaluate(() => window.__qa.patch({ phase: 'won', paused: false, health: 9, elapsed: 252.4 }))
        await mock(page, (m, r) => m.result(r), result)
        await page.waitForSelector('.ct-duo-results')
        if (first) { await sleep(1900); first = false }
        const r = await page.evaluate(() => ({ title: document.querySelector('#ct-duo-results-title')?.textContent, rec: document.querySelector('.ct-duo-results__recorded')?.textContent, page: !!document.querySelector('.ct-results'), focus: document.activeElement?.textContent }))
        check(E(`results ${name}: headline and what was recorded`), title.test(r.title) && recorded.test(r.rec), r)
        check(E(`results ${name}: the page's own Results stay hidden`), !r.page)
        check(E(`results ${name}: the primary action has focus`), r.focus === 'Rematch', r.focus)
        await screen(page, `results-${name}`)
        if (name === 'win') {
          const saved = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('cgs-carrot-challenges-v1') || 'null') } catch { return null } })
          check(E('a duo win on L25 recorded the Tornado challenge through the page award path'), saved?.best?.tornado?.cleared === true, saved)
          await page.click('text=View the garden'); await sleep(200)
          check(E('View the garden collapses the card to a pill'), await page.evaluate(() => !!document.querySelector('.ct-duo-results-pill') && !document.querySelector('.ct-duo-results')))
          await screen(page, 'results-collapsed')
          await page.click('.ct-duo-results-pill button')
        }
      }
      // Rematch goes back to the room with this player ready again
      await page.click('text=Rematch')
      await waitPhase(page, 'lobby')
      await sleep(200)
      check(E('Rematch returns to the room and marks you ready'), await page.evaluate(() => window.__duoMock.session.get().peers.find(p => p.me)?.ready === true))
      await page.click('.ct-duo-sheet__foot >> text=Leave')
      await page.waitForSelector('.ct-duo-home')
      check(E('Leave returns to the multiplayer home screen'), true)
      await context.close()
    }
    // ------------------------------------------------ 3. endless: HUD over the stock track, sell confirm, solo choice, endless results
    {
      const { context, page } = await open(browser, { viewport: viewports[vp], storage: seed(14), base, path: mockPath() })
      await page.waitForSelector('.ct-duo-entry'); await page.click('.ct-duo-entry')
      await page.fill('#ct-duo-name', 'Mia')
      await page.click('text=Create room')
      await page.waitForSelector('.ct-duo-codecard')
      await page.click('.ct-duo-seg__btn >> text=Endless (2 players)')
      await page.click('.ct-duo-ready')
      await page.waitForFunction(() => { const b = [...document.querySelectorAll('.ct-duo-sheet__foot button')].find(x => x.textContent.includes('Start match')); return b && !b.disabled }, null, { timeout: 6000 })
      await page.click('text=Start match')
      await page.waitForSelector('.ct-duo-reveal')
      check(E('endless reveal names the home wing'), /You start at the (WEST|EAST) gate/.test(await page.textContent('#ct-duo-reveal-title')))
      await screen(page, 'endless-reveal')
      await waitPhase(page, 'prep')
      await page.evaluate(() => window.__qa.patch({ name: 'Twin Gates', waves: 999, coins: 700, net: { mode: 'endless', seat: 0, side: 0, hold: false, netTick: 0, matchPaused: false, pausedBy: -1, pending: [], score: 0 } }))
      await page.click('.ct-start')
      await waitPhase(page, 'playing')
      await page.evaluate(() => window.__qa.patch({ phase: 'playing', wave: 12, nextWave: 0, enemyCount: 30, net: { mode: 'endless', seat: 0, side: 0, hold: false, netTick: 9000, matchPaused: false, pausedBy: -1, pending: [], score: 11, seats: [{ built: 9, spent: 2140 }, { built: 7, spent: 1680 }] } }))
      await sleep(400)
      const e = await page.evaluate(() => ({ wave: getComputedStyle(document.querySelector('.ct-track__wave') || document.body).display, hidden: document.querySelector('.ct-hud__track')?.getAttribute('aria-hidden'), label: document.querySelector('.ct-duo-endless')?.getAttribute('aria-label') || '', next: document.querySelector('.ct-duo-endless__next')?.textContent }))
      check(E('endless: the stock "Wave 12/999" is hidden and the track leaves the accessibility tree'), e.wave === 'none' && e.hidden === 'true', e)
      check(E('endless: the HUD names the wave and the score'), /Wave 12\. Score: 11 waves survived/.test(e.label), e.label)
      check(E('endless: next miniboss or boss'), /Miniboss in 3 waves/.test(e.next), e.next)
      await screen(page, 'endless-playing')
      const blurE = await blurred(page)
      check(E('endless playing: no backdrop-filter'), !blurE.length, blurE)
      // selling a tower the partner built needs a second tap
      await page.evaluate(() => { window.__qa.towers = [{ id: 101, kind: 'seed', tier: 2, spent: 145, x: .42, y: .52 }]; window.__qa.patch({ selection: { type: 'tower', id: 101, kind: 'seed', tier: 2, hp: 0, maxHp: 0, refund: 101, x: .42, y: .52, partners: 0, superName: '', spent: 145, builder: 1 } }); window.__qa.commands.length = 0 })
      await page.waitForSelector('.ct-sell', { timeout: 4000 })
      await page.click('.ct-sell')
      await sleep(150)
      const first = await page.evaluate(() => ({ sells: window.__qa.commands.filter(c => c.type === 'sell').length, toast: [...document.querySelectorAll('.ct-duo-toast')].map(t => t.textContent).join('|') }))
      check(E("sell a partner's tower: the first tap asks again"), first.sells === 0 && /Built by Ana, tap again to sell/.test(first.toast), first)
      await screen(page, 'endless-sell-confirm')
      await page.click('.ct-sell').catch(() => {})
      await sleep(150)
      check(E("sell a partner's tower: the second tap sells"), await page.evaluate(() => window.__qa.commands.filter(c => c.type === 'sell').length) === 1)
      await mock(page, m => m.set({ canContinueSolo: true, partnerAway: null }))
      await sleep(150)
      check(E('endless: Continue solo or End run after the grace'), /Ana didn't come back/.test(await bannerText(page)) && await page.evaluate(() => document.querySelectorAll('.ct-duo-banner button').length === 2))
      await screen(page, 'endless-solo-choice')
      await mock(page, m => m.set({ canContinueSolo: false, stats: { ...m.session.get().stats, slowedFor: 1 } }))
      await sleep(120)
      check(E('banner slowed'), /Slowed for Ana/.test(await bannerText(page)))
      await mock(page, m => m.set({ stats: { ...m.session.get().stats, slowedFor: -1 } }))
      // endless results: the run is recorded on this device (new best), then a solo run
      await page.evaluate(() => window.__qa.patch({ phase: 'lost', health: 0, elapsed: 1342, stats: { kills: 1204, leaks: 30, earned: 0, streak: 0, bestStreak: 4, perfectWaves: 2, waveLeaks: [], leakKinds: [], leakCounts: [], dmgKinds: [], dmgValues: [] } }))
      await mock(page, m => m.result({ kind: 'endless', waves: 23, tick: 40000, solo: false, endedBy: 'carrot' }))
      await page.waitForSelector('.ct-duo-results')
      await sleep(1900)
      const r = await page.evaluate(() => ({ title: document.querySelector('#ct-duo-results-title')?.textContent, rec: document.querySelector('.ct-duo-results__recorded')?.textContent, page: !!document.querySelector('.ct-results'), saved: JSON.parse(localStorage.getItem('cgs-carrot-endless2p-v1') || 'null') }))
      check(E('endless results: waves survived and a new best'), r.title === '23 waves survived' && r.rec === 'New best on this device' && !r.page, r)
      check(E('endless results: cgs-carrot-endless2p-v1 holds the best'), r.saved?.version === 1 && r.saved.best?.waves === 23 && r.saved.best.partner === 'Ana' && r.saved.runs === 1, r.saved)
      check(E('endless results: no campaign, challenge or records write for level 90'), await page.evaluate(() => { const rec = JSON.parse(localStorage.getItem('cgs-carrot-records-v1') || '{}'); return !rec.levels?.['90'] && !JSON.parse(localStorage.getItem('cgs-carrot-defense-v1') || '{}').medals?.['90'] }))
      await screen(page, 'results-endless')
      await mock(page, m => m.result({ kind: 'endless', waves: 6, tick: 50000, solo: true, endedBy: 'player' }))
      await sleep(250)
      check(E('endless results: a solo run keeps the best'), /Best on this device: 23 waves/.test(await page.textContent('.ct-duo-results__recorded')))
      await screen(page, 'results-endless-solo')
      await context.close()
    }
    // ------------------------------------------------ 4. reduced motion: reveal, countdown and banners animate opacity only
    {
      const { context, page } = await open(browser, { viewport: viewports[vp], storage: seed(14), base, path: mockPath(), reduced: true })
      await page.waitForSelector('.ct-duo-entry')
      let bad = await transformAnimations(page)
      await page.click('.ct-duo-entry'); await page.click('text=Create room'); await page.waitForSelector('.ct-duo-codecard')
      bad = bad.concat(await transformAnimations(page))
      await page.click('.ct-duo-ready')
      await page.waitForFunction(() => { const b = [...document.querySelectorAll('.ct-duo-sheet__foot button')].find(x => x.textContent.includes('Start match')); return b && !b.disabled }, null, { timeout: 6000 })
      // the lobby's one blur, on the real-glass tier
      await page.evaluate(() => { document.querySelector('.ct-page').dataset.glass = 'real' })
      const lobbyBlur = await blurred(page)
      check(E('lobby: at most one blurred surface (real-glass tier)'), lobbyBlur.length <= 1, lobbyBlur)
      await page.evaluate(() => { delete document.querySelector('.ct-page').dataset.glass })
      await page.click('text=Start match')
      await page.waitForSelector('.ct-duo-reveal')
      for (let i = 0; i < 3; i++) { await sleep(120); bad = bad.concat(await transformAnimations(page)) }
      await waitPhase(page, 'prep'); await page.click('.ct-start')
      await page.waitForSelector('.ct-duo-count', { timeout: 6000 }).catch(() => {})
      bad = bad.concat(await transformAnimations(page))
      await mock(page, m => m.set({ hold: true })); await sleep(60)
      bad = bad.concat(await transformAnimations(page))
      await mock(page, m => m.emit({ type: 'resynced', seat: 1 })); await sleep(60)
      bad = bad.concat(await transformAnimations(page))
      check(E('reduced motion: countdown, side reveal, banners and toasts use no transform animation'), !bad.length, [...new Set(bad)])
      await context.close()
    }
  }
  // ------------------------------------------------ 5. without multiplayer configured the entry never renders
  {
    const { context, page } = await open(browser, { viewport: viewports.desktop, storage: seed(14), base })
    await page.waitForSelector('.ct-lobby .ct-cta--hero')
    await sleep(800)
    check(`[${engine}] no rooms URL: no "Play with a friend" entry and no duo layer content`, await page.evaluate(() => !document.querySelector('.ct-duo-entry') && !document.querySelector('.ct-duo-lobby') && !document.querySelector('.ct-page')?.dataset.duo))
    await context.close()
  }
  await browser.close()
}
let failed = 0
for (const r of results) { if (!r.ok) failed++; if (!r.ok || process.env.VERBOSE) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  — ${JSON.stringify(r.detail).slice(0, 400)}` : ''}`) }
console.log(`\ncarrot-duo-ui-qa: ${results.length - failed}/${results.length} checks passed (${engines.join(', ')}; ${sizes.join(', ')})`)
writeFileSync(join(out, 'report.json'), JSON.stringify({ base, engines, sizes, passed: results.length - failed, total: results.length, results }, null, 1))
process.exit(failed ? 1 : 0)
