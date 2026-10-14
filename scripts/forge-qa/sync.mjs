// Cross-device progress in the real page, against a fake account Worker (Playwright routes; nothing leaves the machine).
// A: a fresh device signs in and the account holds a day-5 run from another device. The page must adopt it, and its
//    next strike must extend that run in the PUT (not overwrite it with the device's own fresh run). Run twice: with
//    the pull answered at once (it can land before the page subscribes) and after 400 ms.
// B: the run played on this device most recently beats an older copy on the server, which then receives it.
// usage: node scripts/forge-qa/sync.mjs --url http://127.0.0.1:4880/minigames/forgeOrFold/ [--profiles desktop,webkit-phone]
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { launch, open, sleep, press, writeJson } from './lib.mjs'
import { act, createRun } from '../../src/minigames/forge/engine.ts'

const arg = (name, d) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : d }
const url = arg('url', 'http://127.0.0.1:4880/minigames/forgeOrFold/'), profiles = arg('profiles', 'desktop,webkit-phone').split(',')
const out = path.resolve(arg('out', 'output/forge-qa/sync'))
const env = fs.readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
const API = (env.match(/^VITE_ACCOUNT_API_URL=(.*)$/m)?.[1] || '').trim().replace(/\/$/, '')
if (!API) throw new Error('.env.local has no VITE_ACCOUNT_API_URL: the account feature is off in this build')

/** A run that another device played to day 5 (a real engine log). */
function remoteRun(seed) {
  let s = createRun(seed); const actions = [{ type: 'move', id: 1, to: 'rack' }, { type: 'end' }, { type: 'end' }, { type: 'end' }, { type: 'end' }, { type: 'tick', ms: 1500 }]
  for (const a of actions) { const t = act(s, a); if (!t.ok) throw new Error(t.event.text); s = t.state }
  if (s.day !== 5) throw new Error('fixture is on day ' + s.day)
  return { version: 3, seed, actions, ticket: null }
}

/** `log` continues `base`: the same actions, except that the page merges consecutive clock ticks (base's last tick may have grown). */
function extendsLog(log, base) {
  for (let i = 0; i < base.length; i++) {
    const a = log[i], b = base[i]; if (!a) return false
    if (i === base.length - 1 && b.type === 'tick' && a.type === 'tick') return a.ms >= b.ms
    if (JSON.stringify(a) !== JSON.stringify(b)) return false
  }
  return log.length >= base.length
}
async function scenario(kind, delay) {
  const h = await launch(kind, { out: path.join(out, `${kind}-${delay}`) }), p = h.page, r = { kind, delay }
  const server = { 'forge:run': { data: remoteRun(424242), updated: Date.now() - 60_000, version: 1 } }, puts = []
  const cors = req => ({ 'Access-Control-Allow-Origin': req.headers().origin || '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS', 'Content-Type': 'application/json' })
  await p.route(API + '/**', async route => {
    const req = route.request(), path_ = new URL(req.url()).pathname, json = (status, body) => route.fulfill({ status, headers: cors(req), body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors(req) })
    if (path_ === '/me' || path_ === '/progress') { if (delay) await sleep(delay); return json(200, { player: { id: 'qa-player', name: 'QA', picture: '' }, progress: server }) }
    if (req.method() === 'PUT' && path_.startsWith('/progress/')) {
      const id = decodeURIComponent(path_.slice(10)), raw = req.postDataBuffer(), gz = /gzip/.test(req.headers()['content-type'] || '')
      const body = JSON.parse((gz ? zlib.gunzipSync(raw) : raw).toString('utf8'))
      const v = (server[id]?.version || 0) + 1; server[id] = { data: body.data, updated: body.updated, version: v }; puts.push({ id, at: Date.now(), data: body.data })
      return json(200, { stored: true, updated: body.updated, version: v })
    }
    return json(200, {})
  })
  // Signed in on this device (the session is the Worker's token; Google is not involved after login).
  await h.context.addInitScript(() => { if (!localStorage.getItem('cgs-account-session-v1')) localStorage.setItem('cgs-account-session-v1', JSON.stringify({ token: 'cgs1.qa', expires: Date.now() + 864e5, name: 'QA', picture: '' })) })
  const day = () => p.evaluate(() => +(document.querySelector('.ff-stats [title=Day] b')?.firstChild?.textContent || 0))
  try {
    await open(h, url); await sleep(1500)
    r.adoptedDay = await day()
    r.stored = await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('cgs-forge-run-v1') || 'null'); return s && { seed: s.seed, n: s.actions.length, version: s.version } })
    // Strike on the adopted run: heat, then two strikes, then wait out the debounce and the PUT floor.
    await press(h, 'Space'); await p.waitForFunction(() => document.querySelector('.ff-strike')?.getAttribute('aria-label') === 'Forge', null, { timeout: 12000 }); await sleep(400)
    for (let i = 0; i < 2; i++) { await press(h, 'Space'); await sleep(900) }
    await sleep(4500)
    const run = puts.filter(x => x.id === 'forge:run').at(-1)?.data, remote = remoteRun(424242)
    r.pushed = run ? { seed: run.seed, n: run.actions.length, version: run.version, extendsRemote: extendsLog(run.actions, remote.actions) } : null
    r.player = puts.some(x => x.id === 'forge:player'), r.meta = await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('cgs-account-meta-v1') || '{}').keys || {}).filter(k => k.startsWith('forge:')).sort())
    r.passA = r.adoptedDay === 5 && r.stored?.seed === 424242 && !!r.pushed && r.pushed.seed === 424242 && r.pushed.extendsRemote && r.pushed.n > remote.actions.length && r.pushed.version === 3 && r.player && r.meta.join() === 'forge:player,forge:run,forge:scores'
    // B: the server now holds an older, different run (another device's, stamped an hour ago). This device played last.
    const local = puts.filter(x => x.id === 'forge:run').at(-1).data, before = puts.length
    server['forge:run'] = { data: remoteRun(777), updated: Date.now() - 3_600_000, version: 99 }
    await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForFunction(() => document.querySelector('.ff-strike') && !document.querySelector('.ff-strike').disabled, null, { timeout: 60000 }); await sleep(4500)
    r.keptDay = await day(); r.keptSeed = await p.evaluate(() => JSON.parse(localStorage.getItem('cgs-forge-run-v1') || 'null')?.seed)
    const re = puts.slice(before).filter(x => x.id === 'forge:run').at(-1)?.data
    r.repushed = re ? { seed: re.seed, n: re.actions.length, extendsLocal: extendsLog(re.actions, local.actions) } : null
    r.passB = r.keptDay === 5 && r.keptSeed === 424242 && !!r.repushed && r.repushed.seed === 424242 && r.repushed.extendsLocal
  } catch (e) { r.error = String(e.stack || e).slice(0, 600) }
  r.console = h.consoleLines.filter(l => /^\[(error|pageerror)\]/.test(l) && !/GSI_LOGGER|status of 403/.test(l))
  await h.close()
  r.pass = !!r.passA && !!r.passB && !r.error && r.console.length === 0
  return r
}
const results = []
for (const kind of profiles) for (const delay of [0, 400]) { const r = await scenario(kind, delay); results.push(r); console.log(`${r.pass ? 'PASS' : 'FAIL'} sync (${kind}, pull after ${delay} ms): ${JSON.stringify({ adoptedDay: r.adoptedDay, stored: r.stored, pushed: r.pushed, player: r.player, meta: r.meta, keptDay: r.keptDay, keptSeed: r.keptSeed, repushed: r.repushed, console: r.console, error: r.error?.split('\n')[0] })}`) }
writeJson(path.join(out, 'sync.json'), results)
process.exitCode = results.every(r => r.pass) ? 0 : 1
