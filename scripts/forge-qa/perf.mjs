// Frame-time probe: where the main thread goes around each impact and on the first hearth step.
// Wraps requestAnimationFrame callbacks (Unity's main loop runs in one), the forge-unity bridge events, Unity's
// SendMessage and the MessageChannel tasks React's scheduler renders in, so a long frame can be attributed.
// usage: node scripts/forge-qa/perf.mjs --url <served page> [--profiles webkit-phone,phone,desktop,desktop-hidpi]
//          [--strikes 16] [--out output/forge-qa/perf.json] [--warm 4] [--css '<rules injected after load>'] [--query a=b&c=d]
import path from 'node:path'
import { launch, open, now, sleep, hud, press, strike, frameTimes, writeJson, stats, URL } from './lib.mjs'
/** Space on every profile (a hidden HUD cannot be tapped); true once Forge is armed. */
async function ensureForging(h, timeout = 9000) {
  if ((await hud(h)).strike === 'Forge') return true
  await press(h, 'Space')
  try { await h.page.waitForFunction(() => document.querySelector('.ff-strike')?.getAttribute('aria-label') === 'Forge', null, { timeout }) } catch { return false }
  await sleep(300); return true
}

const arg = (name, d) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : d }
const url = arg('url', URL), profiles = arg('profiles', 'webkit-phone,phone,desktop,desktop-hidpi').split(','), strikes = +arg('strikes', 16), warm = +arg('warm', 4)
const outFile = path.resolve(arg('out', 'output/forge-qa/perf.json')), css = arg('css'), query = arg('query'), nowait = process.argv.includes('--nowait')

function PROBE() {
  const P = window.__perf = { raf: [], ev: [], send: [], task: [] }, T = () => performance.now(), cap = (a, n = 20000) => { if (a.length > n) a.splice(0, a.length - n) }
  const raf = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = cb => raf(ts => { const a = T(); try { return cb(ts) } finally { P.raf.push([a, T() - a, ts]); cap(P.raf) } })
  const orig = EventTarget.prototype.dispatchEvent
  EventTarget.prototype.dispatchEvent = function (e) { if (!e || e.type !== 'forge-unity') return orig.call(this, e); const a = T(); try { return orig.call(this, e) } finally { P.ev.push([a, T() - a, e.detail?.type]); cap(P.ev) } }
  // Unity's loader is patched by a route (see run): it calls this with each new instance.
  P.wrapInstance = inst => { const sm = inst.SendMessage.bind(inst); inst.SendMessage = (o, m, v) => { const a = T(); try { return sm(o, m, v) } finally { P.send.push([a, T() - a, m, typeof v === 'string' ? v.length : 0]); cap(P.send) } }; return inst }
  // The rendering step: a message posted at the end of a frame's rAF callbacks runs after style, layout and paint.
  P.render = []
  const ch = new MessageChannel(); let mark = 0
  ch.port1.onmessage = () => { P.render.push([mark, T() - mark]); cap(P.render) }
  const tick = () => { raf(() => { mark = T(); ch.port2.postMessage(0); tick() }) }
  setTimeout(tick, 0)
  const desc = Object.getOwnPropertyDescriptor(MessagePort.prototype, 'onmessage')
  Object.defineProperty(MessagePort.prototype, 'onmessage', { configurable: true, get() { return desc.get.call(this) }, set(fn) { desc.set.call(this, fn ? function (e) { const a = T(); try { return fn.call(this, e) } finally { P.task.push([a, T() - a]); cap(P.task) } } : fn) } })
}

async function run(kind) {
  const h = await launch(kind, { out: path.join(path.dirname(outFile), 'perf', kind) })
  await h.context.addInitScript(PROBE)
  // Experiment: answer Unity's per-frame fence waits without the GPU-process round trip.
  if (nowait) await h.context.addInitScript(() => { for (const P of [window.WebGL2RenderingContext?.prototype].filter(Boolean)) P.clientWaitSync = function () { return 0x911A } })
  await h.page.route('**/forge.loader.js*', async route => { const res = await route.fetch(); const body = await res.text(); await route.fulfill({ response: res, body: body + '\n;(()=>{const c=createUnityInstance;createUnityInstance=function(...a){return c.apply(this,a).then(i=>window.__perf?window.__perf.wrapInstance(i):i)}})();' }) })
  const r = { profile: kind }
  try {
    const u = new globalThis.URL(url); if (query) for (const [k, v] of new URLSearchParams(query)) u.searchParams.set(k, v)
    await open(h, u.toString()); if (css) await h.page.addStyleTag({ content: css }); await sleep(1500)
    r.canvas = (await hud(h)).canvas; r.dpr = await h.page.evaluate(() => document.querySelector('[data-testid=forge-scene]')?.dataset.renderDpr)
    let a = await now(h); await sleep(1500); r.idle = await frameTimes(h, a, await now(h))
    a = await now(h); await ensureForging(h, 12000); const b = await now(h)
    r.heating = { ...(await frameTimes(h, a, b)), long: await long(h, a, b) }
    await sleep(600)
    const rows = []
    for (let i = 0; i < strikes; i++) {
      if ((await hud(h)).strike !== 'Forge' && !(await ensureForging(h))) break
      const s = await strike(h, 'key'); rows.push(s); await sleep(260)
    }
    const end = await now(h)
    const after = rows[Math.min(warm, rows.length - 1)]?.inputT ?? a
    r.striking = { ...(await frameTimes(h, rows[0]?.inputT ?? b, end)), afterWarm: await frameTimes(h, after, end) }
    r.impacts = await h.page.evaluate(([from]) => {
      const P = window.__perf, imp = P.ev.filter(e => e[2] === 'impact' && e[0] >= from)
      return imp.map(e => {
        const frame = P.raf.filter(f => f[0] <= e[0] && f[0] + f[1] >= e[0]).at(-1) || null
        const next = frame ? P.raf.filter(f => f[0] > frame[0]).slice(0, 3) : []
        const evs = P.ev.filter(x => frame && x[0] >= frame[0] && x[0] <= frame[0] + frame[1]).map(x => [x[2], +x[1].toFixed(2)])
        const sends = P.send.filter(x => x[0] >= e[0] - 1 && x[0] <= e[0] + 60).map(x => [x[2], +x[1].toFixed(2), x[3]])
        const tasks = P.task.filter(x => x[0] >= e[0] && x[0] <= e[0] + 80).map(x => +x[1].toFixed(2))
        const gaps = frame ? [frame, ...next].map(f => f[2]).map((t, i, arr) => i ? +(t - arr[i - 1]).toFixed(1) : null).slice(1) : []
        return { t: +e[0].toFixed(1), dispatchMs: +e[1].toFixed(2), unityFrameMs: frame ? +frame[1].toFixed(2) : null, nextFramesMs: next.map(f => +f[1].toFixed(2)), rafGaps: gaps, events: evs, sends, reactTasks: tasks }
      })
    }, [rows[0]?.inputT ?? 0])
    const sum = k => r.impacts.map(x => x[k]).filter(x => x != null)
    r.impactSummary = { n: r.impacts.length, unityFrame: { median: stats.median(sum('unityFrameMs')), max: Math.max(...sum('unityFrameMs')) }, dispatch: { median: stats.median(sum('dispatchMs')), max: Math.max(...sum('dispatchMs')) }, maxGapAfter: r.impacts.map(x => Math.max(...x.rafGaps)) }
    r.longFrames = await long(h, rows[0]?.inputT ?? b, end)
    // Main-thread split per phase: Unity's rAF callback (the longest callback of each frame) and the rendering step after it.
    r.split = await h.page.evaluate(([phases]) => {
      const P = window.__perf, q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1) : null }
      const out = {}
      for (const [name, a, b] of phases) {
        const unity = P.raf.filter(x => x[0] >= a && x[0] <= b && x[1] > 2).map(x => x[1]), render = P.render.filter(x => x[0] >= a && x[0] <= b).map(x => x[1])
        out[name] = { unity: { p50: q(unity, .5), p95: q(unity, .95), max: q(unity, 1) }, render: { p50: q(render, .5), p95: q(render, .95), max: q(render, 1) } }
      }
      return out
    }, [[['idle', a - 1500, a], ['heating', a, b], ['striking', rows[0]?.inputT ?? b, end]]])
    r.console = h.consoleLines.filter(l => /error|pageerror/i.test(l)).slice(0, 10)
  } catch (e) { r.error = String(e.stack || e).slice(0, 1500) }
  finally { await h.close() }
  return r
}
/** Frames over 20 ms between a and b, each with what ran in it. */
function long(h, a, b) {
  return h.page.evaluate(([a, b]) => {
    const P = window.__perf, F = window.__forge.raf.filter(t => t >= a && t <= b), out = []
    for (let i = 1; i < F.length; i++) {
      const d = F[i] - F[i - 1]; if (d <= 20) continue
      const lo = F[i - 1], hi = F[i]
      const raf = P.raf.filter(x => x[0] >= lo - 1 && x[0] < hi).map(x => +x[1].toFixed(1)).filter(x => x > .5)
      const render = P.render.filter(x => x[0] >= lo - 1 && x[0] < hi).map(x => +x[1].toFixed(1))
      const ev = P.ev.filter(x => x[0] >= lo - 20 && x[0] < hi).map(x => x[2] + ':' + x[1].toFixed(1))
      const send = P.send.filter(x => x[0] >= lo - 20 && x[0] < hi).map(x => x[2] + ':' + x[1].toFixed(1))
      const task = P.task.filter(x => x[0] >= lo - 20 && x[0] < hi).map(x => +x[1].toFixed(1)).filter(x => x > .3)
      out.push({ at: +lo.toFixed(1), ms: +d.toFixed(1), raf, render, ev, send, task })
    }
    return out
  }, [a, b])
}
const result = { url, date: new Date().toISOString(), profiles: {} }
for (const kind of profiles) { console.log('perf:', kind); result.profiles[kind] = await run(kind); writeJson(outFile, result); const p = result.profiles[kind]; console.log(JSON.stringify({ kind, idle: p.idle, heating: p.heating && { p95: p.heating.p95, max: p.heating.max, long: p.heating.long?.length }, split: p.split, striking: p.striking && { p95: p.striking.p95, max: p.striking.max, afterWarm: { p95: p.striking.afterWarm.p95, max: p.striking.afterWarm.max, over33: p.striking.afterWarm.over33 } }, impact: p.impactSummary, error: p.error?.split('\n')[0] })) }
console.log('wrote', outFile)
