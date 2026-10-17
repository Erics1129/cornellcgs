// The duo UI over the REAL net layer and a real cgs-rooms Worker, in two browsers, on the mock Unity player (so it checks the lobby,
// the side draw, prep, pause and away; the duo sim itself is Unity's). Needs the net layer merged in, a dev server, and the Worker:
//   npx wrangler dev --config backend/rooms/wrangler.jsonc --env dev --local --port 8797 --ip 127.0.0.1
//   BASE=http://localhost:5190 ROOMS=http://127.0.0.1:8797 node scripts/carrot-duo-ui-qa/rooms-e2e.mjs [chromium|webkit] [chromium|webkit]
import { launch, open, seed } from '../carrot-ui-qa/lib.mjs'
const [ea = 'chromium', eb = 'webkit'] = process.argv.slice(2)
const base = process.env.BASE || 'http://localhost:5190', rooms = process.env.ROOMS || 'http://127.0.0.1:8797'
const path = `/minigames/carrotDefense/?carrot-rooms=${encodeURIComponent(rooms)}`
const results = []
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? `  — ${JSON.stringify(detail)}` : ''}`); return ok }
const A = await launch(ea), B = eb === ea ? A : await launch(eb)
const phase = p => p.evaluate(() => document.querySelector('.ct-page')?.dataset.duoPhase || '')
const banner = p => p.evaluate(() => document.querySelector('.ct-duo-banner')?.textContent || '')
const home = async p => { await p.waitForSelector('.ct-duo-entry', { timeout: 15000 }); await p.click('.ct-duo-entry'); await p.waitForSelector('.ct-duo-home') }
const errorText = async p => { await p.waitForSelector('.ct-duo-error', { timeout: 15000 }); return p.evaluate(() => `${document.querySelector('.ct-duo-error h3')?.textContent} / ${document.querySelector('.ct-duo-error p')?.textContent}`) }
const codeOf = p => p.evaluate(() => [...document.querySelectorAll('.ct-duo-codecard__code span')].map(s => s.textContent).join(''))
const startEnabled = p => p.evaluate(() => { const x = [...document.querySelectorAll('.ct-duo-sheet__foot button')].find(e => e.textContent.includes('Start match')); return !!x && !x.disabled })

// ---- refusals read as words, not "network"
{
  const x = await open(A, { viewport: { width: 1280, height: 800 }, storage: seed(14), base, path })
  await home(x.page); await x.page.fill('.ct-duo-codein__input', 'ZZZZZ'); await x.page.click('text=Join room')
  check(`[${ea}] an unknown code reads "Room not found"`, /^Room not found/.test(await errorText(x.page)))
  await x.context.close()
}
// ---- a room end to end: create, join with a typed lowercase spaced code, seats, ready, start, opposite sides, prep, go, pause, away
const a = await open(A, { viewport: { width: 1280, height: 800 }, storage: seed(14), base, path })
const b = await open(B, { viewport: { width: 390, height: 844 }, storage: seed(3), base, path })
await home(a.page); await a.page.fill('#ct-duo-name', 'Mia'); await a.page.click('text=Create room')
await a.page.waitForSelector('.ct-duo-codecard', { timeout: 15000 })
const code = await codeOf(a.page)
check(`[${ea}] the room code is five symbols of the alphabet`, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/.test(code), code)
await home(b.page); await b.page.fill('#ct-duo-name', 'Ana'); await b.page.fill('.ct-duo-codein__input', code.toLowerCase().split('').join(' ')); await b.page.click('text=Join room')
await b.page.waitForSelector('.ct-duo-codecard', { timeout: 15000 })
await a.page.waitForFunction(() => document.querySelectorAll('.ct-duo-seat:not(.is-empty)').length === 2, null, { timeout: 15000 })
await a.page.waitForTimeout(1500)
const seats = await a.page.evaluate(() => [...document.querySelectorAll('.ct-duo-seat')].map(s => s.getAttribute('aria-label')))
check(`[${eb}] joins with "${code.toLowerCase().split('').join(' ')}"; the host sees both seats with a ping`, seats.length === 2 && /Ana: .*(Direct|Relay), \d+ ms/.test(seats[1] || ''), seats)
check('the fresh guest only has the Tornado: intersection offers just that fight', await a.page.evaluate(() => [...document.querySelectorAll('.ct-duo-fight')].filter(f => !f.hasAttribute('aria-disabled')).map(f => f.dataset.id).join(',')) === '25')
{
  const c = await open(A, { viewport: { width: 1280, height: 800 }, storage: seed(14), base, path })
  await home(c.page); await c.page.fill('.ct-duo-codein__input', code); await c.page.click('text=Join room')
  check('a third player reads "Room full"', /^Room full/.test(await errorText(c.page)))
  await c.context.close()
}
check('Start is disabled before both are ready', !(await startEnabled(a.page)))
await a.page.click('.ct-duo-ready'); await b.page.click('.ct-duo-ready')
await a.page.waitForFunction(() => { const x = [...document.querySelectorAll('.ct-duo-sheet__foot button')].find(e => e.textContent.includes('Start match')); return x && !x.disabled }, null, { timeout: 10000 }).catch(() => {})
check('Start is enabled once both are ready and loaded', await startEnabled(a.page))
await a.page.click('text=Start match')
await Promise.all([a.page.waitForSelector('.ct-duo-reveal', { timeout: 8000 }), b.page.waitForSelector('.ct-duo-reveal', { timeout: 8000 })])
const ra = await a.page.textContent('#ct-duo-reveal-title'), rb = await b.page.textContent('#ct-duo-reveal-title')
check('the side reveal draws opposite gardens', /WEST|EAST/.test(ra) && /WEST|EAST/.test(rb) && ra !== rb, [ra, rb])
await Promise.all([a.page, b.page].map(p => p.waitForFunction(() => document.querySelector('.ct-page')?.dataset.duoPhase === 'prep', null, { timeout: 10000 })))
await a.page.click('.ct-start'); await a.page.waitForTimeout(500)
check('prep: the presser waits, the partner is told', /Waiting for Ana to start/.test(await banner(a.page)) && /Mia is ready for wave 1/.test(await banner(b.page)), [await banner(a.page), await banner(b.page)])
await b.page.click('.ct-start')
await Promise.all([a.page, b.page].map(p => p.waitForFunction(() => document.querySelector('.ct-page')?.dataset.duoPhase === 'playing', null, { timeout: 10000 })))
check('both reach wave 1 after the shared countdown', true)
// the mock player has no duo sim: put both stages into play the way Unity's own half would
for (const p of [a.page, b.page]) await p.evaluate(() => window.__qa.patch({ phase: 'playing', wave: 1 }))
await a.page.waitForTimeout(300)
await a.page.evaluate(() => document.activeElement?.blur?.()); await a.page.keyboard.press('Space'); await a.page.waitForTimeout(900)
check('Space on one device pauses both, and says who', await phase(a.page) === 'paused' && await phase(b.page) === 'paused' && /You paused/.test(await banner(a.page)) && /Mia paused/.test(await banner(b.page)), [await banner(a.page), await banner(b.page)])
await b.page.keyboard.press('Space'); await b.page.waitForTimeout(400)
check('either player resumes, with a shared 3-2-1', /Resuming in/.test(await a.page.evaluate(() => document.querySelector('.ct-duo-count')?.textContent || '')))
await a.page.waitForTimeout(3500)
await a.page.keyboard.press('Space'); await a.page.waitForTimeout(400)
check('the pause cooldown binds only the player who resumed', await phase(a.page) === 'paused')
await a.page.keyboard.press('Space'); await a.page.waitForTimeout(3700)
await a.page.keyboard.press('Space'); await a.page.waitForTimeout(300)
check('a pause right after your own resume waits', await phase(a.page) === 'playing' && /pause again in/.test(await a.page.evaluate(() => [...document.querySelectorAll('.ct-duo-toast')].map(t => t.textContent).join('|'))))
await a.context.close()
await b.page.waitForTimeout(4500)
check('a partner who vanishes pauses the match with the grace clock', await phase(b.page) === 'paused' && /Mia stepped away\s*\d:\d\d/.test(await banner(b.page)), await banner(b.page))
await b.context.close(); await A.close(); if (B !== A) await B.close()
const failed = results.filter(r => !r.ok).length
console.log(`\nrooms-e2e: ${results.length - failed}/${results.length} checks passed (${ea} + ${eb})`)
process.exit(failed ? 1 : 0)
