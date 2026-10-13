// A full ten-day run through the real page: heat, push a blade, see a Chip, Guard, Undo, Hone, Flow, Sell, Keep,
// Trade, Rest every day, a reload that must restore the run, Finish on day 10 and a saved score. Fails on any console
// error. Serve the build on an origin the Google client allows (http://localhost:5190) or Sign-In logs its own error.
// usage: node scripts/forge-qa/run10.mjs --url http://localhost:5190/minigames/forgeOrFold/ [--profiles desktop,webkit-phone] [--out <dir>]
import path from 'node:path'
import { launch, open, sleep, press, waitEvent, writeJson } from './lib.mjs'

const arg = (name, d) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : d }
const url = arg('url', 'http://localhost:5190/minigames/forgeOrFold/'), out = path.resolve(arg('out', 'output/forge-qa/run10'))
const profiles = arg('profiles', 'desktop,webkit-phone').split(',')

async function play(kind) {
  const h = await launch(kind, { out: path.join(out, kind) }), p = h.page, failed = []
  p.on('response', r => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url().slice(0, 120)) })
  const seen = { heat: false, push: 0, chip: false, guard: false, rewind: false, hone: false, flow: false, sell: false, keep: false, trade: false, rests: 0, reload: false, finished: false, score: null, outcomes: {} }
  const hud = () => p.evaluate(() => {
    const q = s => document.querySelector(s), day = q('.ff-stats [title=Day] b')
    return { day: +(day?.firstChild?.textContent || 0), last: +(q('.ff-stats [title=Day] em')?.textContent || '/0').slice(1), gold: (q('.ff-stats .ff-wallet')?.getAttribute('aria-label') || '').replace(/[^\d]/g, ''), strike: q('.ff-strike')?.getAttribute('aria-label'), level: +(q('.ff-blade-title em')?.textContent || '+0').slice(1), cards: [...document.querySelectorAll('.ff-knife-card')].map(b => b.getAttribute('aria-label')), flow: q('.ff-flow')?.className || '', dialog: q('dialog[open] h2')?.textContent || null, tools: Object.fromEntries([...document.querySelectorAll('.ff-quick-tools button')].map(b => [b.getAttribute('aria-label')?.split(' (')[0], { n: +(b.getAttribute('aria-label')?.match(/\((\d+)\)/)?.[1] || 0), enabled: !b.disabled }])) }
  })
  const armed = async (timeout = 9000) => { try { await p.waitForFunction(() => document.querySelector('.ff-strike')?.getAttribute('aria-label') === 'Forge', null, { timeout }); return true } catch { return false } }
  /** Start forging (heats for two seconds) when no heated blade is on the anvil. */
  const forge = async () => { if ((await hud()).strike === 'Forge') return true; await press(h, 'Space'); const ok = await armed(); if (ok) { seen.heat = true; await sleep(250) } return ok }
  /** One strike; returns the outcome callout kind. */
  const hit = async () => {
    const t = await press(h, 'Space'); const done = await waitEvent(h, 'settled', t, 4000); await sleep(90)
    const kind = await p.evaluate(() => [...(document.querySelector('.ff-callout')?.classList || [])].find(c => c.startsWith('ff-outcome-'))?.slice(11) || null)
    if (kind) seen.outcomes[kind] = (seen.outcomes[kind] || 0) + 1
    if (kind === 'chip') seen.chip = true
    if (kind === 'shatter') await sleep(1600)   // the Shatter hold
    return done ? kind : null
  }
  const tool = async name => { const b = p.locator(`.ff-quick-tools button[aria-label^="${name} ("]`); if (!(await b.count()) || await b.isDisabled()) return false; await b.click(); await sleep(260); return true }
  const closeDialog = async () => { if (await p.locator('dialog[open] .ff-return').count()) await p.locator('dialog[open] .ff-return').click(); else if (await p.locator('dialog[open] .ff-modal-head button').count()) await p.locator('dialog[open] .ff-modal-head button').click(); await sleep(300) }
  const buy = async (category, name) => {
    await p.locator('.ff-trade').click(); await sleep(400)
    await p.locator('dialog[open] .ff-categories button', { hasText: category }).click(); await sleep(200)
    const b = p.locator(`dialog[open] button[aria-label^="Buy ${name} for"]`).first()
    const ok = (await b.count()) > 0 && !(await b.isDisabled()); if (ok) { await b.click(); await sleep(700) }
    await closeDialog(); return ok
  }
  const rest = async () => { await sleep(600); await p.locator('.ff-rest').click(); await sleep(400); await p.locator('dialog[open] .ff-primary').click(); await sleep(900) }
  try {
    await open(h, url); await sleep(1200)
    let s = await hud()
    if (s.last !== 10) throw new Error('the HUD shows DAY ' + s.day + '/' + s.last + ', expected a ten-day run')
    for (let day = 1; day <= 10; day++) {
      s = await hud(); if (s.day !== day) throw new Error(`expected day ${day}, HUD shows ${s.day}`)
      // Day 2: buy a Hone stone (Trade); day 4: a steel or bronze bar to push further.
      if (day === 2 && await buy('Tools', 'Hone stone')) seen.trade = true
      if (day === 4) await buy('Metal', 'Steel') || await buy('Metal', 'Bronze')
      // Flow takes ten strikes on one blade: from day 3, guards keep the blade alive until a Flow window has run.
      if (day >= 3 && !seen.flow) for (let g = 0; g < 2; g++) await buy('Tools', 'Quench guard')
      let blades = 0
      while (blades < 6) {
        const before = await hud(); if (!before.cards.some(c => /, (crate|furnace|anvil)$/.test(c))) break
        if (!(await forge())) break
        blades++
        const chase = day >= 3 && !seen.flow, target = chase ? 99 : day >= 5 && blades === 1 ? 7 : 3
        for (let i = 0; i < 26; i++) {
          s = await hud(); if (s.strike !== 'Forge') break
          if (s.level >= target && !(day >= 3 && !seen.flow)) break
          if (day >= 3 && !seen.flow && s.level >= 2 && s.tools.Guard?.n > 0 && s.tools.Guard.enabled && !(await p.locator('.ff-status-marks', { hasText: 'Guarded' }).count())) await tool('Guard')
          // Guard before a risky strike, once a day from day 1.
          if (!seen.guard && s.level >= 2 && s.tools.Guard?.n > 0 && s.tools.Guard.enabled) { if (await tool('Guard')) seen.guard = true }
          if (s.level >= 3 && day >= 2 && s.tools.Guard?.n > 0 && s.tools.Guard.enabled && i % 5 === 0) await tool('Guard')
          // Flow: once charged, F starts it; strike through the window.
          if (/is-ready/.test(s.flow)) { await press(h, 'KeyF'); await sleep(200); if (/is-active/.test((await hud()).flow)) { seen.flow = true; for (let k = 0; k < 5; k++) await hit() } continue }
          const out = await hit(); if (!out) break
          seen.push = Math.max(seen.push, (await hud()).level)
          // Undo the first strike after day 1 begins, so the run exercises Rewind.
          if (!seen.rewind && day >= 1 && out !== 'shatter' && (await hud()).tools.Undo?.enabled) { if (await tool('Undo')) seen.rewind = true }
          if (out === 'shatter') break
        }
        s = await hud(); if (s.strike !== 'Forge') continue
        if (!seen.hone && s.tools.Hone?.n > 0 && s.tools.Hone.enabled) { if (await tool('Hone')) seen.hone = true }
        // Keep the first blade of the day, sell the rest from the anvil.
        if (blades === 1 || s.level >= 6) { await p.locator('.ff-keep').click(); await sleep(500); seen.keep = true }
        else { const g = +(await hud()).gold; await p.locator('.ff-quick-sell').click(); await sleep(900); if (+(await hud()).gold > g) seen.sell = true }
      }
      // Day 5: reload in the middle of the run; the same day and gold must come back.
      if (day === 5) {
        const a = await hud(); await sleep(400); await p.reload({ waitUntil: 'domcontentloaded' })
        await p.waitForFunction(() => document.querySelector('.ff-strike') && !document.querySelector('.ff-strike').disabled, null, { timeout: 60000 }); await sleep(1200)
        const b = await hud(); seen.reload = a.day === b.day && a.gold === b.gold && b.last === 10
        if (!seen.reload) throw new Error(`reload lost the run: ${JSON.stringify([a.day, a.gold])} -> ${JSON.stringify([b.day, b.gold, b.last])}`)
      }
      if (day < 10) { await rest(); seen.rests++ }
    }
    // Day 10: the Rest tray says Finish; the masterwork result takes a name and saves the score.
    await sleep(600); await p.locator('.ff-rest').click(); await sleep(400)
    const title = await p.locator('dialog[open] h2').textContent()
    if (title !== 'Finish your run?') throw new Error('day 10 Rest tray title: ' + title)
    await p.locator('dialog[open] .ff-primary').click(); await sleep(900)
    if ((await hud()).dialog !== 'Your masterwork') throw new Error('no masterwork dialog after Finish')
    seen.finished = true
    const value = await p.locator('dialog[open] .ff-pedestal strong').textContent()
    await p.locator('dialog[open] .ff-name input').fill('Ten-day QA'); await p.keyboard.press('Enter'); await sleep(1200)
    const row = await p.evaluate(() => [...document.querySelectorAll('dialog[open] .ff-scores li')].map(l => l.textContent).find(t => /Ten-day QA/.test(t)) || null)
    seen.score = { shown: value, board: row }
  } catch (e) { seen.error = String(e.stack || e).slice(0, 800); await h.shot('error').catch(() => {}) }
  seen.final = await hud().catch(() => null)
  // Google Sign-In refuses origins its OAuth client does not list (only the production site): a 403 from
  // accounts.google.com and its logger line. They are reported, not counted; every other error fails the run.
  const gsiOnly = failed.length > 0 && failed.every(f => /accounts\.google\.com\/gsi\//.test(f))
  seen.signInOrigin = h.consoleLines.filter(l => /GSI_LOGGER\]: The given origin is not allowed/.test(l) || (gsiOnly && /status of 403/.test(l))).length
  seen.failedRequests = failed
  seen.consoleErrors = h.consoleLines.filter(l => (/^\[(error|pageerror)\]/.test(l) || /pageerror/.test(l)) && !/GSI_LOGGER\]: The given origin is not allowed/.test(l) && !(gsiOnly && /status of 403/.test(l)))
  await h.shot('end').catch(() => {}); await h.close()
  const pass = !seen.error && seen.heat && seen.push >= 6 && seen.chip && seen.guard && seen.rewind && seen.hone && seen.flow && seen.sell && seen.keep && seen.trade && seen.rests === 9 && seen.reload && seen.finished && !!seen.score?.board && seen.consoleErrors.length === 0
  return { kind, pass, ...seen }
}
const results = []
for (const kind of profiles) { const r = await play(kind); results.push(r); console.log(`${r.pass ? 'PASS' : 'FAIL'} ten-day run (${kind}): ${JSON.stringify({ push: r.push, chip: r.chip, guard: r.guard, rewind: r.rewind, hone: r.hone, flow: r.flow, sell: r.sell, keep: r.keep, trade: r.trade, rests: r.rests, reload: r.reload, finished: r.finished, score: r.score, outcomes: r.outcomes, console: r.consoleErrors, signInOrigin: r.signInOrigin, error: r.error?.split('\n')[0] })}`) }
writeJson(path.join(out, 'run10.json'), results)
process.exitCode = results.every(r => r.pass) ? 0 : 1
