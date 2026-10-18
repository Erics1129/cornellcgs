// Runs multiplayer net-det specs (scripts/carrot-det: carrot-sim --method NetDetSpecs) in the Unity Web player (a CARROT_QA build,
// CarrotTD.CarrotDetBuild.WebDet) inside Playwright and saves each CarrotNetDet result (NetDigest every 30 netTicks, deep hash every
// 300 and at wave starts) for compare-net.mjs.
//   node run-net.mjs <chromium|webkit> <url> <outDir> <spec...>
// env: CHUNK ticks per animation frame (90), VIEWPORT WxH, DPR, MOBILE=1, THROTTLE (Chromium CPU slowdown), PLAYWRIGHT module path.
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { basename, join } from 'node:path'
const pw = await import(process.env.PLAYWRIGHT || '/Users/eric/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')
const [engine, url, outDir, ...specs] = process.argv.slice(2)
mkdirSync(outDir, { recursive: true })
const browser = engine === 'webkit' ? await pw.webkit.launch() : await pw.chromium.launch({ channel: 'chromium' })
const [vw, vh] = (process.env.VIEWPORT || '660x440').split('x').map(Number)
const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: Number(process.env.DPR || 1), isMobile: engine === 'chromium' && process.env.MOBILE === '1', hasTouch: process.env.MOBILE === '1' })
const page = await context.newPage()
const log = [], waiters = []; let chunks = null
page.on('console', msg => {
  const t = msg.text()
  if (t.startsWith('CARROT_NETDET_RESULT ')) { const m = /^CARROT_NETDET_RESULT (\d+)\/(\d+) /.exec(t); chunks ??= new Array(+m[2]); chunks[+m[1]] = t.slice(m[0].length).split('\n')[0] }
  else if (/CARROT_|rror|xception/.test(t)) log.push(t.slice(0, 400))
  for (const w of waiters.splice(0)) w(t)
})
page.on('pageerror', e => log.push('PAGEERROR ' + String(e).slice(0, 400)))
const waitFor = (re, ms) => new Promise((res, rej) => { const timer = setTimeout(() => rej(new Error('timeout waiting for ' + re)), ms); const hook = t => { if (re.test(t)) { clearTimeout(timer); res(t) } else waiters.push(hook) }; waiters.push(hook) })
if (engine === 'chromium' && process.env.THROTTLE) { const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.THROTTLE) }) }
const t0 = Date.now()
await page.goto(url)
await page.waitForFunction(() => window.det && (window.det.ready || window.det.error), null, { timeout: 240000 })
const err = await page.evaluate(() => window.det.error); if (err) throw new Error('unity failed: ' + err)
const ua = await page.evaluate(() => navigator.userAgent)
console.log(`${engine} ready in ${((Date.now() - t0) / 1000).toFixed(1)} s ua=${ua}`)
const chunk = Number(process.env.CHUNK || 90), summary = { engine, ua, version: browser.version(), chunk, viewport: [vw, vh], throttle: Number(process.env.THROTTLE || 1), mobile: process.env.MOBILE === '1', runs: [] }
for (const spec of specs) {
  const id = basename(spec, '.txt'), text = readFileSync(spec, 'utf8'); chunks = null
  const began = waitFor(/^CARROT_NETDET_BEGIN /, 60000)
  await page.evaluate(t => { window.det.done = false; window.det.sendTo('CarrotNetDet', 'Begin', t) }, text); await began
  const started = Date.now(); let finished = null
  waitFor(/^CARROT_NETDET_DONE /, 1800000).then(t => page.evaluate(() => { window.det.done = true }).then(() => { finished = t }))
  while (!finished) await page.evaluate(c => window.det.pumpTo('CarrotNetDet', c, 20), chunk)
  const seconds = (Date.now() - started) / 1000
  await page.evaluate(() => window.det.sendTo('CarrotNetDet', 'Result', ''))
  for (let i = 0; i < 200 && (!chunks || chunks.some(c => c === undefined)); i++) await new Promise(r => setTimeout(r, 50))
  const result = JSON.parse(chunks.join('')); result.browser = engine; result.wallSeconds = seconds; result.ua = ua
  writeFileSync(join(outDir, id + '.json'), JSON.stringify(result))
  summary.runs.push({ id, ticks: result.ticks, phase: result.phase, chain: result.chain, seconds, ticksPerSecond: Math.round(result.ticks / seconds) })
  console.log(`${engine} ${id} ticks=${result.ticks} ${result.phase} chain=${result.chain} digests=${result.digests} ${seconds.toFixed(1)} s (${Math.round(result.ticks / seconds)} ticks/s)`)
}
summary.log = log.slice(-200); writeFileSync(join(outDir, '_summary.json'), JSON.stringify(summary, null, 1)); await browser.close()
