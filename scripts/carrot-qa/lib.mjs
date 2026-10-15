// Shared Playwright harness for the world stream's visual, perf, flash and load checks against a LOCAL build served by
// scripts/carrot-qa/serve.mjs (never the live site). Saves live only in throwaway browser contexts.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const RT = '/Users/eric/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'
const { chromium, webkit, devices } = await import(RT + '/playwright/index.mjs')
const pngjs = await import(RT + '/pngjs/lib/png.js'); const PNG = pngjs.PNG || pngjs.default.PNG

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const PORT = Number(process.env.CARROT_QA_PORT || 5311)
export const URL_GAME = `http://127.0.0.1:${PORT}/minigames/carrotDefense/`
export const OUT = process.env.CARROT_QA_OUT || path.resolve(REPO, '../../world/qa')
export const DATA = JSON.parse(fs.readFileSync(path.join(REPO, 'public/assets/minigames/carrot/game-data.json'), 'utf8'))
export const sleep = ms => new Promise(r => setTimeout(r, ms))

// In-page instrumentation: the Unity instance, every state snapshot, rAF timing, WebGL draw counts and the game's console telemetry.
const INIT = `(() => {
 const W = window;
 W.__log = []; W.__states = 0; W.__state = null; W.__phase = []; W.__events = [];
 document.addEventListener('load', e => { const t = e.target; if (t && t.tagName === 'SCRIPT' && /carrot\\.loader\\.js/.test(t.src || '')) {
   const orig = W.createUnityInstance; W.__loaderAt = performance.now();
   W.createUnityInstance = function (c, cfg, p) { W.__createAt = performance.now(); return orig(c, cfg, p).then(i => { W.__inst = i; W.__instAt = performance.now(); return i; }); };
 } }, true);
 let last = null;
 W.addEventListener('carrot-state', e => { const s = e.detail; if (!s) return; W.__states++; const now = performance.now(); if (!W.__firstStateAt) W.__firstStateAt = now;
   if (!last || s.phase !== last.phase || s.level !== last.level) W.__phase.push({t: now, level: s.level, phase: s.phase, wave: s.wave, health: s.health});
   last = s; W.__state = s; });
 W.__frames = []; let prev = 0, draws = 0, tris = 0;
 const P = W.WebGL2RenderingContext && W.WebGL2RenderingContext.prototype;
 if (P) for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) { const f = P[name]; if (f) P[name] = function () { draws++; const c = name.startsWith('drawArrays') ? arguments[2] : name === 'drawRangeElements' ? arguments[3] : arguments[1]; tris += (c || 0) / 3 * (name.includes('Instanced') ? (arguments[name === 'drawArraysInstanced' ? 3 : 4] || 1) : 1); return f.apply(this, arguments); }; }
 const tick = now => { if (prev) { W.__frames.push([Math.round((now - prev) * 100) / 100, draws, Math.round(now), Math.round(tris)]); if (W.__frames.length > 60000) W.__frames.splice(0, 20000); } prev = now; draws = 0; tris = 0; requestAnimationFrame(tick); };
 requestAnimationFrame(tick);
 for (const k of ['log', 'warn', 'error']) { const o = console[k]; console[k] = function () { try { const m = Array.from(arguments).map(String).join(' '); if (/Carrot|CARROT|error|Error|WebGL|exception/i.test(m)) { W.__log.push([Math.round(performance.now()), k, /CARROT_QA_(DUMP|FX|CAMERA|RENDER)/.test(m) ? m : m.slice(0, 600)]); if (W.__log.length > 4000) W.__log.splice(0, 1500); } } catch (e) {} return o.apply(this, arguments); }; }
 W.addEventListener('error', e => W.__log.push([Math.round(performance.now()), 'pageerror', String(e.message)]));
})();`

// The integrated page pauses on the first sight of every ability (records.seen) and runs a guided first level; the scripted
// scenarios here would stall behind those cards, so the seeded player has already met every ability and finished the tutorial.
const { abilityIds } = await import('../../src/minigames/carrot/abilities.ts')
const introduced = JSON.stringify({ version: 1, levels: {}, seen: { abilities: [...abilityIds].sort(), creatures: [] }, tutorial: true })
export function seedSave({ unlocked = 24 } = {}) {
  return `(() => { try {
   localStorage.setItem('cgs-carrot-records-v1', ${JSON.stringify(introduced)});
   localStorage.setItem('cgs-carrot-defense-v1', JSON.stringify({version:1, unlocked:${unlocked}, medals:{}, sound:false}));
   localStorage.setItem('cgs-carrot-challenges-v1', JSON.stringify({version:3, best:{tornado:{cleared:true,health:6,seconds:400,towers:8}, zombie:{cleared:true,health:5,seconds:500,towers:9}, eyeball:{cleared:true,health:4,seconds:700,towers:10}}}));
  } catch (e) {} })();`
}

export async function open({ engine = 'chromium', width = 1440, height = 900, phone = false, landscape = false, tag = 'run', reducedMotion = false, panelMs = 8.33, dpr = 1, headed = false, args = [] } = {}) {
  const type = engine === 'webkit' ? webkit : chromium
  const browser = await type.launch(engine === 'chromium' ? { channel: 'chromium', headless: !headed, args: ['--autoplay-policy=no-user-gesture-required', '--enable-gpu', '--ignore-gpu-blocklist', ...args] } : { headless: !headed })
  let ctxOpts
  if (phone) {
    const base = engine === 'webkit' ? devices['iPhone 13'] : devices['Pixel 7']
    ctxOpts = { ...base, viewport: landscape ? { width: 844, height: 390 } : { width: 390, height: 844 }, screen: landscape ? { width: 844, height: 390 } : { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: dpr || base.deviceScaleFactor }
    delete ctxOpts.defaultBrowserType
    if (engine === 'webkit') ctxOpts.isMobile = base.isMobile; else ctxOpts.isMobile = true
  } else ctxOpts = { viewport: { width, height }, deviceScaleFactor: dpr }
  if (reducedMotion) ctxOpts.reducedMotion = 'reduce'
  const context = await browser.newContext(ctxOpts)
  await context.addInitScript(INIT)
  if (panelMs) await context.addInitScript(`window.__carrotDisplayPeriod = ${panelMs};`)
  await context.addInitScript(seedSave())
  const page = await context.newPage()
  const net = { requests: [], start: Date.now(), console: [] }
  page.on('response', async res => { try { const h = await res.allHeaders(); net.requests.push({ t: Date.now() - net.start, url: res.url().replace(URL_GAME.replace('/minigames/carrotDefense/', ''), ''), status: res.status(), len: Number(h['content-length'] || 0), enc: h['content-encoding'] || '' }) } catch {} })
  page.on('pageerror', e => net.console.push([Date.now() - net.start, 'pageerror', String(e)]))
  page.on('console', m => { const t = m.text(); if (net.console.length < 4000 && (m.type() === 'error' || /CARROT|Carrot|shader|missing|exception/i.test(t))) net.console.push([Date.now() - net.start, m.type(), t.slice(0, 800)]) })
  const dir = path.join(OUT, tag); fs.mkdirSync(dir, { recursive: true })
  return { browser, context, page, net, dir, engine }
}

export const state = page => page.evaluate(() => window.__state)
export const send = (page, cmd) => page.evaluate(c => { window.__inst && window.__inst.SendMessage('CarrotGame', 'Command', JSON.stringify(c)) }, cmd)
export const message = (page, method, value = '') => page.evaluate(([m, v]) => { window.__inst && window.__inst.SendMessage('CarrotGame', m, v) }, [method, value])
export async function waitFor(page, fn, arg, timeout = 180000, every = 250) {
  const t0 = Date.now()
  for (;;) { const v = await page.evaluate(fn, arg).catch(() => null); if (v) return v; if (Date.now() - t0 > timeout) throw new Error('timeout ' + fn.toString().slice(0, 80)); await sleep(every) }
}
/** Opens the page and enters the garden; resolves once the first ready snapshot with a Unity instance arrives. */
export async function enter(ctx) {
  const { page } = ctx
  const t0 = Date.now()
  await page.goto(URL_GAME, { waitUntil: 'domcontentloaded', timeout: 120000 })
  const tDom = Date.now() - t0
  await page.waitForFunction(() => { const b = [...document.querySelectorAll('button')].find(b => /Enter the garden|Continue|Play/.test(b.textContent)); return b && !b.disabled }, null, { timeout: 120000 })
  const tLobby = Date.now() - t0
  const c0 = Date.now()
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(b => /Enter the garden|Continue|Play/.test(b.textContent)); b.click() })
  await waitFor(page, () => !!(window.__state && window.__state.phase === 'ready' && window.__inst), null, 900000, 200)
  return { tDom, tLobby, clickToPlayable: Date.now() - c0 }
}
export async function loadLevel(ctx, id, settle = 1800) {
  await send(ctx.page, { type: 'load', level: id })
  await waitFor(ctx.page, id => window.__state && window.__state.level === id && window.__state.phase === 'ready', id, 90000)
  await sleep(settle)
}
export async function hideHud(page, hide = true) {
  await page.evaluate(h => { let s = document.getElementById('__qa_hide'); if (!h) { if (s) s.remove(); return } if (!s) { s = document.createElement('style'); s.id = '__qa_hide'; document.head.append(s) } s.textContent = 'body *{visibility:hidden!important} #carrot-unity-canvas{visibility:visible!important}' }, hide)
}
export async function shot(ctx, name, { png = true, canvas = false } = {}) {
  const file = path.join(ctx.dir, name + (png ? '.png' : '.jpg'))
  const target = canvas ? ctx.page.locator('#carrot-unity-canvas') : ctx.page
  await target.screenshot({ path: file, type: png ? 'png' : 'jpeg', quality: png ? undefined : 85, timeout: 30000 }).catch(e => console.log('shot fail', name, e.message))
  return file
}
export async function frameIndex(page) { return page.evaluate(() => performance.now()) }
export async function frameStats(page, from = 0) {
  return page.evaluate(from => {
    const f = window.__frames.filter(x => x[2] >= from); if (!f.length) return null
    const iv = f.map(x => x[0]).sort((a, b) => a - b); const rendered = f.filter(x => x[1] > 0)
    const q = p => iv[Math.min(iv.length - 1, Math.floor(p * iv.length))]
    const total = f.reduce((s, x) => s + x[0], 0)
    const draws = rendered.map(x => x[1]).sort((a, b) => a - b), tris = rendered.map(x => x[3]).sort((a, b) => a - b)
    return { frames: f.length, seconds: Math.round(total) / 1000, rafFps: Math.round(f.length / (total / 1000) * 10) / 10, renderedFps: Math.round(rendered.length / (total / 1000) * 10) / 10, p50: q(.5), p95: q(.95), p99: q(.99), max: iv[iv.length - 1], drawsMedian: draws[draws.length >> 1] || 0, drawsMax: draws[draws.length - 1] || 0, trisMedian: tris[tris.length >> 1] || 0, trisMax: tris[tris.length - 1] || 0 }
  }, from)
}
export function save(ctx, name, obj) { fs.writeFileSync(path.join(ctx.dir, name), JSON.stringify(obj, null, 1)) }
export async function logs(page, re) { return page.evaluate(src => { const r = new RegExp(src); return window.__log.filter(l => r.test(l[2])).map(l => l[0] + ' ' + l[2]) }, re.source) }

// ---- image analysis (pngjs) ----
const lin = c => { c /= 255; return c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4) }
const LIN = new Float32Array(256); for (let i = 0; i < 256; i++) LIN[i] = lin(i)
export function readPng(file) { return PNG.sync.read(fs.readFileSync(file)) }
/** Relative luminance (WCAG) per pixel; returns {mean, w, h, Y:Float32Array}. */
export function luminance(file) {
  const png = readPng(file); const n = png.width * png.height; const Y = new Float32Array(n); let sum = 0
  for (let i = 0; i < n; i++) { const k = i * 4; const y = .2126 * LIN[png.data[k]] + .7152 * LIN[png.data[k + 1]] + .0722 * LIN[png.data[k + 2]]; Y[i] = y; sum += y }
  return { mean: sum / n, w: png.width, h: png.height, Y }
}
export function meanIn(L, pts, r = 3) { let s = 0, n = 0; for (const [x, y] of pts) { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const px = Math.round(x + dx), py = Math.round(y + dy); if (px < 0 || py < 0 || px >= L.w || py >= L.h) continue; s += L.Y[py * L.w + px]; n++ } } return n ? s / n : 0 }

// ---- a compact competent bot (pads by route coverage, mixed kinds, upgrades) ----
function routeSamples(level, step = .25) { const pts = []; for (const r of level.routes) for (let i = 0; i + 1 < r.length; i++) { const [ax, az] = Array.isArray(r[i]) ? r[i] : [r[i].x, r[i].z]; const [bx, bz] = Array.isArray(r[i + 1]) ? r[i + 1] : [r[i + 1].x, r[i + 1].z]; const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / step)); for (let k = 0; k < n; k++) pts.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]) } return pts }
export function padScores(level, radius = 3.2) { const pts = routeSamples(level); const blocked = new Set((level.blockers || []).map(b => b.pad)); return level.pads.map((p, i) => { const [x, z] = Array.isArray(p) ? p : [p.x, p.z]; let s = 0; for (const [a, b] of pts) if (Math.hypot(a - x, b - z) <= radius) s++; return { pad: i, x, z, score: s * .25, blocked: blocked.has(i) } }).sort((a, b) => b.score - a.score) }
export const levelDef = id => DATA.levels.find(l => l.id === id)
export const towerDef = id => DATA.towers.find(t => t.id === id)
export async function playBot(ctx, levelId, { kinds = null, speed = 2, log = () => {}, maxMinutes = 25, onTick = null, until = null, coinsBoost = 0 } = {}) {
  const { page } = ctx; const L = levelDef(levelId)
  const unlocked = DATA.towers.filter(t => t.unlock <= levelId || levelId > 24)
  const mix = (kinds || ['seed', 'frost', 'mortar', 'starfruit', 'prism', 'storm', 'thunder', 'book']).filter(k => unlocked.find(t => t.id === k))
  const pads = padScores(L); const towers = new Map(); let s = await state(page); const t0 = Date.now(); let builds = 0
  if (coinsBoost) await send(page, { type: 'debugCoins', value: coinsBoost })
  async function buy(pad, kind) { await send(page, { type: 'select', selectionType: 'pad', id: pad }); await send(page, { type: 'buy', kind }); s = await state(page); if (s.selection && s.selection.type === 'tower' && s.selection.kind === kind) { towers.set(pad, { kind, tier: 1, id: s.selection.id }); builds++; return true } return false }
  async function upgrade(pad) { await send(page, { type: 'select', selectionType: 'pad', id: pad }); const before = s.coins; await send(page, { type: 'upgrade' }); s = await state(page); if (s.coins < before) { towers.get(pad).tier++; return true } return false }
  async function spend() {
    s = await state(page); if (!s || (s.phase !== 'ready' && s.phase !== 'playing')) return
    for (let guard = 0; guard < 12; guard++) {
      const open = pads.filter(p => !p.blocked && !towers.has(p.pad) && p.score > 0); const n = towers.size; const nextKind = mix[n % mix.length]; const buildCost = towerDef(nextKind).cost[0]
      const up = [...towers.entries()].filter(([, t]) => t.tier < 4).map(([pad, t]) => ({ pad, t, cost: towerDef(t.kind).cost[t.tier] })).sort((a, b) => a.t.tier - b.t.tier)[0]
      const want = n < 3 || (open.length && n < 4 + Math.floor(builds / 2))
      if (want && open.length && s.coins >= buildCost) { if (!(await buy(open[0].pad, nextKind))) break; continue }
      if (up && s.coins >= up.cost) { if (!(await upgrade(up.pad))) break; continue }
      break
    }
    await send(page, { type: 'clear' })
  }
  await spend(); if (s.phase === 'ready') await send(page, { type: 'start' }); await sleep(300); await send(page, { type: 'speed', value: speed })
  for (;;) {
    await sleep(500); s = await state(page); if (!s) continue
    if (s.phase === 'won' || s.phase === 'lost') break
    await spend(); if (onTick) await onTick(s)
    if (until && until(s)) break
    if (Date.now() - t0 > maxMinutes * 60000) break
  }
  return { level: levelId, phase: s.phase, health: s.health, wave: s.wave, waves: s.waves, realSeconds: Math.round((Date.now() - t0) / 1000), towers: [...towers.values()].map(t => t.kind + t.tier) }
}
