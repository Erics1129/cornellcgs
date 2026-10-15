// Frame pacing, draws and triangles over a scripted combat run on a local build, plus the governor's tier/scale/interval log.
// usage: node scripts/carrot-qa/perf.mjs [--engine chromium|webkit] [--level 24] [--minutes 3] [--phone] [--landscape] [--throttle 6]
//        [--headed] [--panel 8.33] [--quality high|medium|low] [--dpr 2]
import * as H from './lib.mjs'
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d }
const flag = n => process.argv.includes('--' + n)
const engine = arg('engine', 'chromium'), level = Number(arg('level', 24)), minutes = Number(arg('minutes', 3)), throttle = Number(arg('throttle', 0)), panel = Number(arg('panel', 8.33)), quality = arg('quality', '')
const tag = `perf-${engine}-${flag('phone') ? 'phone' : 'desk'}-L${level}${throttle ? '-cpu' + throttle : ''}${quality ? '-' + quality : ''}`
const ctx = await H.open({ engine, tag, phone: flag('phone'), landscape: flag('landscape'), headed: flag('headed'), panelMs: panel, dpr: Number(arg('dpr', flag('phone') ? 2 : 1)) })
const { page } = ctx
const out = { engine, level, minutes, throttle, phone: flag('phone') }
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
try {
  if (throttle && engine === 'chromium') { const cdp = await ctx.context.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle }) }
  out.enter = await H.enter(ctx); log('enter', JSON.stringify(out.enter))
  if (quality) { await H.message(page, 'Quality', quality); await H.sleep(500) }
  await H.loadLevel(ctx, level, 2500)
  const i0 = await H.frameIndex(page); await H.sleep(6000); out.idle = await H.frameStats(page, i0); log('idle', JSON.stringify(out.idle))
  await H.message(page, 'QaDump', 'reset')
  const f0 = await H.frameIndex(page)
  const r = await H.playBot(ctx, level, { speed: 2, maxMinutes: minutes, coinsBoost: 3000 })
  out.combat = await H.frameStats(page, f0); out.result = r
  out.quality = await H.logs(page, /CarrotQuality (tier|renderScale|interval|panel)/)
  await H.message(page, 'QaDump', ''); await H.sleep(300); out.dump = ((await H.logs(page, /CARROT_QA_DUMP/)).pop() || '').replace(/route=\S+ ground=\S+ /, '')
  out.perf = await H.logs(page, /CARROT_QA_PERF/)
  log('combat', JSON.stringify(out.combat)); log('result', r.phase, 'wave', r.wave, '/', r.waves); for (const q of out.quality) log(q)
  out.errors = ctx.net.console.filter(c => c[1] === 'error' || c[1] === 'pageerror').slice(0, 20)
} catch (e) { log('ERROR', e.stack); out.error = String(e) }
finally { H.save(ctx, 'perf.json', out); await ctx.browser.close() }
