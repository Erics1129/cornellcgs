// Two real browsers on the REAL Unity player (release Web build) and a real cgs-rooms Worker: the integration harness for duo boss
// fights and two-player endless. Nothing here ships in src. Every page records, from the outside:
//   - the Unity instance (the loader is wrapped so window.__unity is the live player) and every Net / Command it is sent;
//   - every 'carrot-net' message Unity emits (digests by tick, the replica clock, own ops and intents, results, desyncs, views);
//   - every 'carrot-state' snapshot (the last one, plus a few per-wave facts) and rAF frame intervals.
// A small in-page bot plays a half (or a wing of Twin Gates) through the same Command JSON the page sends.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LAN, udpProxy } from '../carrot-net-qa/impair.mjs'

const here = dirname(fileURLToPath(import.meta.url))
export const root = join(here, '..', '..')
const pw = await import(process.env.PLAYWRIGHT || '/Users/eric/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')
export const { chromium, webkit } = pw
export const gameData = JSON.parse(readFileSync(join(root, 'public/assets/minigames/carrot/game-data.json'), 'utf8'))
export const sleep = ms => new Promise(r => setTimeout(r, ms))

// Twin Gates (CarrotDuoMaps.Endless): grid points, Q(gx,gz) = (gx-14, gz-6). Kept in grid units for the bot's pad ranking.
const tg = a => { const o = []; for (let i = 0; i < a.length; i += 2) o.push([a[i], a[i + 1]]); return o }
export const TWIN_GATES = {
  id: 90,
  routes: [tg([0, 11, 8, 11, 8, 7, 3, 7, 3, 3, 10, 3, 10, 1, 14, 1, 14, 9]), tg([28, 11, 20, 11, 20, 7, 25, 7, 25, 3, 18, 3, 18, 1, 14, 1, 14, 9])],
  pads: tg([2, 10, 5, 10, 4, 8, 6, 8, 1, 6, 2, 4, 5, 5, 8, 5, 5, 2, 8, 2, 11, 2, 10, 8, 10, 10, 12, 4, 12, 7, 12, 9, 13, 0, 26, 10, 23, 10, 24, 8, 22, 8, 27, 6, 26, 4, 23, 5, 20, 5, 23, 2, 20, 2, 17, 2, 18, 8, 18, 10, 16, 4, 16, 7, 16, 9, 15, 0, 14, 11]),
  blockers: [4, 21, 12, 29, 34],
}

const browsers = {}
export async function browser(kind) {
  if (!browsers[kind]) browsers[kind] = kind === 'webkit' ? webkit.launch() : chromium.launch({ channel: 'chromium', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--disable-features=WebRtcHideLocalIpsWithMdns', '--autoplay-policy=no-user-gesture-required'] })
  return browsers[kind]
}
export async function closeBrowsers() { for (const k of Object.keys(browsers)) { try { await (await browsers[k]).close() } catch { /* gone */ } delete browsers[k] } }

// ---------------------------------------------------------------- in-page recorder (an init script; runs before the page)
const RECORDER = String.raw`(() => {
  const qa = window.__qa = { t0: Date.now(), net: { n: 0, types: {} }, d: {}, rd: {}, dd: {}, rdd: {}, rexec: [], exec: 0, own: [], intents: [], results: [], desyncs: [], errors: [], rejects: [], views: [],
    partner: null, partnerLog: [], last: null, lastAt: 0, states: 0, waves: {}, bossSeen: {}, miniSeen: {}, frames: [], lastFrame: 0, towerAt: [], hold: false, ticks: [], pendingN: 0, pendingAt: [], plan: [] }
  window.addEventListener('carrot-net', e => {
    const m = e.detail, now = Date.now(); if (!m || typeof m.t !== 'string') return
    qa.net.n++; qa.net.types[m.t] = (qa.net.types[m.t] || 0) + 1
    switch (m.t) {
      case 'tick':
        if (m.exec > qa.exec) qa.exec = m.exec
        if (m.d) qa.d[m.d[0]] = (m.d[1] >>> 0) + ':' + (m.d[2] >>> 0)
        if (m.rd) qa.rd[m.rd[0]] = (m.rd[1] >>> 0) + ':' + (m.rd[2] >>> 0)
        if (m.dh) qa.dd[m.dh[0]] = String(m.dh[1] >>> 0)
        if (m.rdh) qa.rdd[m.rdh[0]] = String(m.rdh[1] >>> 0)
        if (typeof m.rexec === 'number') { const last = qa.rexec[qa.rexec.length - 1]; if (!last || last[1] !== m.rexec) { qa.rexec.push([now, m.rexec, m.exec]); if (qa.rexec.length > 20000) qa.rexec.splice(0, 5000) } }
        if (m.hold) qa.hold = true
        if (typeof m.rate === 'number' && !m.d && !m.rd && !m.dh && !m.rdh) { qa.ticks.push([now, m.exec]); if (qa.ticks.length > 20000) qa.ticks.splice(0, 5000) }
        break
      case 'own': for (const op of m.ops || []) qa.own.push([now, op.k, op.op, op.pad ?? -1, op.s]); break
      case 'intent': qa.intents.push([now, m.op.op, m.op.pad ?? -1, m.op.s]); break
      case 'result': qa.results.push([now, m]); break
      case 'desync': qa.desyncs.push([now, m]); break
      case 'error': qa.errors.push([now, m]); break
      case 'reject': qa.rejects.push([now, m]); break
      case 'view': qa.views.push([now, m.kind]); break
      case 'partnerView': {
        const prev = qa.partner; qa.partner = m
        if (!prev || prev.wave !== m.wave || !!prev.boss !== !!m.boss || prev.health !== m.health || prev.phase !== m.phase) qa.partnerLog.push([now, m.wave, m.waves, m.health, m.phase, m.boss ? m.boss.name : '', m.coins])
        break
      }
    }
  })
  window.addEventListener('carrot-state', e => {
    const s = e.detail; if (!s || typeof s.level !== 'number') return
    const now = Date.now(), prevTowers = qa.last ? qa.last.towerCount || 0 : 0
    qa.last = s; qa.lastAt = now; qa.states++
    if ((s.towerCount || 0) !== prevTowers) qa.towerAt.push([now, s.towerCount || 0, s.net ? s.net.netTick : -1])
    const w = qa.waves[s.wave] || (qa.waves[s.wave] = { at: now, maxHp: 0, monsters: 0, enemies: 0 })
    if (Array.isArray(s.monsters)) for (const m of s.monsters) { if (m.maxHp > w.maxHp) w.maxHp = m.maxHp; }
    if (s.enemyCount > w.enemies) w.enemies = s.enemyCount
    if (s.boss && s.boss.name) qa.bossSeen[s.wave] = s.boss.name
    if (s.net && Array.isArray(s.net.pending) && s.net.pending.length !== qa.pendingN) { qa.pendingN = s.net.pending.length; qa.pendingAt.push([now, qa.pendingN]) }
    if (s.net && s.net.bossWave && qa.plan[qa.plan.length - 1]?.[1] !== s.net.bossWave) qa.plan.push([s.wave, s.net.bossWave, s.net.bossKind || s.net.bossName || '', s.net.miniWave])
    if (Array.isArray(s.minibosses) && s.minibosses.length) qa.miniSeen[s.wave] = s.minibosses.map(x => x.kind || x.name).join(',')
  })
  const frame = t => { if (qa.lastFrame) { qa.frames.push(t - qa.lastFrame); if (qa.frames.length > 20000) qa.frames.splice(0, 5000) } qa.lastFrame = t; requestAnimationFrame(frame) }
  requestAnimationFrame(frame)
  qa.send = cmd => { const u = window.__unity; if (!u) return false; u.SendMessage('CarrotGame', 'Command', JSON.stringify(cmd)); return true }
})()`

// Wraps the Unity loader so the live instance and every message it is sent are visible to the harness.
const LOADER_WRAP = `;(function(){var f=window.createUnityInstance;if(!f||f.__qa)return;var w=function(c,cfg,p){return f(c,cfg,p).then(function(inst){window.__unity=inst;var sm=inst.SendMessage.bind(inst);inst.SendMessage=function(o,m,v){if(m==='Net'||m==='Command'){var q=window.__qaSent||(window.__qaSent=[]);q.push([Date.now(),m,v]);if(q.length>30000)q.splice(0,8000)}return sm(o,m,v)};return inst})};w.__qa=1;window.createUnityInstance=w})();`

// RTCPeerConnection that routes this page's outgoing UDP host candidates through an impairment proxy (window.__proxyFor).
const RTC_PROXY = String.raw`(() => {
  const Base = window.RTCPeerConnection; if (!Base) return
  const keep = c => / udp /i.test(c) && /^candidate:\S+ 1 /.test(c) && !/\.local /.test(c) && !/:/.test(c.split(' ')[4]) && / typ (host|srflx) /.test(c)
  class QaPC extends Base {
    constructor(cfg) { super({ ...(cfg || {}), iceServers: [] }); (window.__qaPcs || (window.__qaPcs = [])).push(this) }
    set onicecandidate(fn) {
      super.onicecandidate = !fn ? null : ev => {
        if (!ev.candidate) return fn(ev)
        const c = ev.candidate.candidate; if (!keep(c)) return
        const p = c.split(' ')
        window.__proxyFor(p[4], Number(p[5]), p[7]).then(r => {
          const s = [p[0], p[1], p[2], p[3], r.ip, String(r.port), 'typ', 'host', 'generation', '0'].join(' ')
          fn({ candidate: new RTCIceCandidate({ candidate: s, sdpMid: ev.candidate.sdpMid, sdpMLineIndex: ev.candidate.sdpMLineIndex }) })
        })
      }
    }
    get onicecandidate() { return super.onicecandidate }
  }
  const orig = Object.getOwnPropertyDescriptor(Base.prototype, 'localDescription')
  Object.defineProperty(QaPC.prototype, 'localDescription', { get() { const d = orig.get.call(this); if (!d) return d; const sdp = d.sdp.split('\r\n').filter(l => !l.startsWith('a=candidate')).join('\r\n'); return { type: d.type, sdp, toJSON: () => ({ type: d.type, sdp }) } } })
  window.RTCPeerConnection = QaPC
})()`

export const seedSave = (unlocked = 5, medals = { 1: 7, 2: 3, 3: 1 }) => ({
  'cgs-carrot-defense-v1': JSON.stringify({ version: 1, unlocked, medals, sound: false }),
  'cgs-carrot-records-v1': JSON.stringify({ version: 1, levels: {}, seen: { abilities: ['uproot', 'gust', 'rally', 'burrow', 'shield', 'split', 'heal', 'haste'], creatures: ['nibble', 'dash', 'mite', 'moth', 'shell', 'swarm', 'beetle', 'slug'] }, tutorial: true }),
})

/** A game page: real player, recorder, optional UDP impairment (imp = one-way {rtt, jitter, loss} per direction). */
export async function openGame(kind, { base, viewport = { width: 1440, height: 900 }, mobile = false, storage = {}, impair = null, label = kind, context = null, hash = '' } = {}) {
  const b = await browser(kind)
  const phone = mobile || viewport.width < 700 || viewport.height < 500
  const ctx = context || await b.newContext({ viewport, deviceScaleFactor: phone ? 2 : 1, hasTouch: phone, isMobile: phone && kind === 'chromium' })
  if (!context) {
    await ctx.route('**/unity/carrot/Build/carrot.loader.js*', async r => { const resp = await r.fetch(); const body = await resp.text(); await r.fulfill({ response: resp, body: body + LOADER_WRAP, headers: { ...resp.headers(), 'content-type': 'text/javascript' } }) })
    await ctx.addInitScript(({ storage }) => { try { if (!sessionStorage.getItem('qa-seeded')) { for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v); sessionStorage.setItem('qa-seeded', '1') } } catch { /* private */ } }, { storage })
    await ctx.addInitScript(RECORDER)
    if (impair) {
      await ctx.addInitScript(RTC_PROXY)
      ctx.__proxies = []
      await ctx.exposeFunction('__proxyFor', async (ip, port, typ) => { const px = await udpProxy({ ip: typ === 'srflx' ? LAN : ip, port }, impair); ctx.__proxies.push(px); return { ip: LAN, port: px.port } })
    }
  }
  const page = await ctx.newPage()
  const log = []
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/favicon|status of 404|WebSocket connection/.test(t)) log.push(t.slice(0, 300)) })
  page.on('pageerror', e => log.push('pageerror ' + String(e).slice(0, 300)))
  await page.goto(`${base}/minigames/carrotDefense/${hash}`, { waitUntil: 'load' })
  const g = { kind, label, page, ctx, log, phone }
  g.qa = (fn, arg) => page.evaluate(fn, arg)
  g.snap = () => page.evaluate(() => window.__qa.last)
  g.duoPhase = () => page.evaluate(() => document.querySelector('.ct-page')?.dataset.duoPhase || '')
  g.sentNet = () => page.evaluate(() => (window.__qaSent || []).filter(x => x[1] === 'Net').map(x => [x[0], x[2]]))
  return g
}

export async function until(g, fn, ms, label, arg) {
  const t0 = Date.now()
  for (;;) {
    let v; try { v = await g.page.evaluate(fn, arg) } catch (e) { v = undefined; if (!/Execution context|navigation/.test(String(e))) throw e }
    if (v) return v
    if (Date.now() - t0 > ms) throw new Error(`${g.label}: timeout waiting for ${label}`)
    await sleep(200)
  }
}

// ---------------------------------------------------------------- the room, through the real lobby UI
export async function openLobby(g, name) {
  await g.page.waitForSelector('.ct-duo-entry', { timeout: 30000 })
  await g.page.click('.ct-duo-entry')
  await g.page.waitForSelector('.ct-duo-home', { timeout: 15000 })
  await g.page.fill('#ct-duo-name', name)
}
export const codeOf = g => g.page.evaluate(() => [...document.querySelectorAll('.ct-duo-codecard__code span')].map(s => s.textContent).join(''))
export async function createRoom(g, name) { await openLobby(g, name); await g.page.click('text=Create room'); await g.page.waitForSelector('.ct-duo-codecard', { timeout: 20000 }); return codeOf(g) }
export async function joinRoom(g, name, code) { await openLobby(g, name); await g.page.fill('.ct-duo-codein__input', code); await g.page.click('text=Join room'); await g.page.waitForSelector('.ct-duo-codecard', { timeout: 20000 }) }
export async function waitLoaded(g, ms = 240000) { await until(g, () => !!window.__unity && !!window.__qa.last, ms, 'Unity loaded') }
export async function chooseFight(host, guest, mode, level) {
  if (mode === 'endless2p') await host.page.click('.ct-duo-seg__btn:has-text("Endless")')
  else { await host.page.click('.ct-duo-seg__btn:has-text("Boss fight")'); await host.page.click(`.ct-duo-fight[data-id="${level}"]`) }
  await guest.page.waitForTimeout(800)
}
export async function readyAndStart(host, guest) {
  for (const g of [host, guest]) { const on = await g.page.getAttribute('.ct-duo-ready', 'aria-pressed'); if (on !== 'true') await g.page.click('.ct-duo-ready') }
  await host.page.waitForFunction(() => { const x = [...document.querySelectorAll('.ct-duo-sheet__foot button')].find(e => e.textContent.includes('Start match')); return x && !x.disabled }, null, { timeout: 60000 })
  await host.page.click('text=Start match')
  await Promise.all([host, guest].map(g => g.page.waitForSelector('.ct-duo-reveal', { timeout: 15000 })))
  const reveal = await Promise.all([host, guest].map(g => g.page.textContent('#ct-duo-reveal-title')))
  await Promise.all([host, guest].map(g => g.page.waitForFunction(() => document.querySelector('.ct-page')?.dataset.duoPhase === 'prep', null, { timeout: 20000 })))
  return reveal
}
/** The 'session' message each Unity was sent (mode, level, seat, side, seed). */
export async function sessionOf(g) { const sent = await g.sentNet(); const s = sent.map(([, j]) => JSON.parse(j)).filter(m => m.t === 'session'); return s[s.length - 1] || null }
export async function pressStart(g) { await g.page.evaluate(() => document.activeElement?.blur?.()); await g.page.keyboard.press('Space') }

// ---------------------------------------------------------------- the in-page bot
/** Pads ranked by how much route lies within reach (grid units); blockers excluded. */
export function rankPads(def, { range = 3.1, only = null } = {}) {
  const samples = []
  for (const r of def.routes) for (let i = 0; i + 1 < r.length; i++) { const [ax, az] = r[i], [bx, bz] = r[i + 1], len = Math.hypot(bx - ax, bz - az); for (let s = 0; s < len; s += 0.25) samples.push([ax + (bx - ax) * s / len, az + (bz - az) * s / len]) }
  const blocked = new Set(def.blockers)
  return def.pads.map(([x, z], id) => ({ id, x, z, score: samples.filter(([sx, sz]) => Math.hypot(sx - x, sz - z) <= range).length }))
    .filter(p => !blocked.has(p.id) && p.score > 0 && (!only || only(p))).sort((a, b) => b.score - a.score)
}
export function levelDef(id) {
  if (id === 90) return TWIN_GATES
  const l = gameData.levels.find(x => x.id === id)
  return { id, routes: l.routes, pads: l.pads, blockers: l.blockers.map(b => b.pad) }
}
export const towerCosts = Object.fromEntries(gameData.towers.map(t => [t.id, t.cost]))

/** Starts the bot inside the page: buys on the ranked pads (cycling kinds), then upgrades; every 250 ms, one action. */
export async function startBot(g, { pads, kinds = ['seed', 'mortar', 'frost'], maxTowers = 99, upgradeFrom = 4, label = g.label }) {
  await g.page.evaluate(({ pads, kinds, maxTowers, upgradeFrom, costs, label }) => {
    const qa = window.__qa
    if (qa.bot) clearInterval(qa.bot.timer)
    const bot = qa.bot = { pads, kinds, towers: {}, tried: {}, pending: null, actions: 0, label, log: [] }
    const send = c => qa.send(c)
    bot.timer = setInterval(() => {
      const s = qa.last; if (!s || !window.__unity || bot.paused) return
      if (s.phase !== 'ready' && s.phase !== 'playing') return
      if (s.net && s.net.hold) return
      const now = Date.now()
      // the last buy: learn the tower id from the selection it moved to
      if (bot.pending) {
        const sel = s.selection
        if (sel && sel.type === 'tower' && !Object.values(bot.towers).some(t => t.id === sel.id)) { bot.towers[bot.pending.pad] = { id: sel.id, tier: sel.tier || 1, kind: bot.pending.kind }; bot.pending = null }
        else if (now - bot.pending.at > 2500) { bot.tried[bot.pending.pad] = now + 20000; bot.pending = null }
        else return
      }
      const coins = s.net && typeof s.net.provisionalCoins === 'number' ? s.net.provisionalCoins : s.coins
      const built = Object.keys(bot.towers).length
      const nextPad = pads.find(p => !bot.towers[p] && !(bot.tried[p] > now))
      const kind = kinds[built % kinds.length]
      const cost = costs[kind][0]
      const wantBuild = nextPad !== undefined && built < maxTowers && (built < upgradeFrom || Object.values(bot.towers).every(t => t.tier >= 3))
      if (wantBuild && coins >= cost) {
        send({ type: 'select', selectionType: 'pad', id: nextPad }); send({ type: 'buy', kind })
        bot.pending = { pad: nextPad, kind, at: now }; bot.actions++; bot.log.push([now, 'buy', nextPad, kind]); return
      }
      // upgrade the lowest tier first, in pad rank order
      let best = null
      for (const p of pads) { const t = bot.towers[p]; if (t && t.tier < 4 && (!best || t.tier < best.tier)) best = t }
      if (best) {
        const c = costs[best.kind][best.tier]
        if (coins >= c) { send({ type: 'select', selectionType: 'tower', id: best.id }); send({ type: 'upgrade' }); best.tier++; bot.actions++; bot.log.push([now, 'upgrade', best.id, best.tier]) }
      }
    }, 250)
  }, { pads, kinds, maxTowers, upgradeFrom, costs: towerCosts, label })
}
export const stopBot = g => g.page.evaluate(() => { if (window.__qa.bot) clearInterval(window.__qa.bot.timer) })

// ---------------------------------------------------------------- digests and timing
/** Duo: my own digests against the partner's replica of my half (and the reverse). Lockstep: both own digests. */
/** before: only ticks below it (a duo loss: a half the partner's carrot ended is ended on that device alone, "for the picture",
 *  at a tick its replica elsewhere never sees, so the end tick's own digest is not comparable; CarrotNetSession.PastEnd). */
export async function compareDigests(a, b, mode, before = Infinity) {
  const [qa, qb] = await Promise.all([a, b].map(g => g.page.evaluate(() => ({ d: window.__qa.d, rd: window.__qa.rd, dd: window.__qa.dd, rdd: window.__qa.rdd }))))
  const pair = (x, y) => { let n = 0, bad = 0; const badTicks = []; for (const t of Object.keys(x)) if (+t < before && t in y) { n++; if (x[t] !== y[t]) { bad++; if (badTicks.length < 5) badTicks.push(+t) } } return { compared: n, mismatches: bad, badTicks } }
  if (mode === 'duo') return { aOwnVsBReplica: pair(qa.d, qb.rd), bOwnVsAReplica: pair(qb.d, qa.rd), aDeepVsBReplica: pair(qa.dd, qb.rdd), bDeepVsAReplica: pair(qb.dd, qa.rdd) }
  return { own: pair(qa.d, qb.d), deep: pair(qa.dd, qb.dd) }
}
export const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }
export const stat = arr => arr.length ? { n: arr.length, p50: +pct(arr, 0.5).toFixed(1), p90: +pct(arr, 0.9).toFixed(1), p99: +pct(arr, 0.99).toFixed(1), max: +Math.max(...arr).toFixed(1) } : { n: 0 }
