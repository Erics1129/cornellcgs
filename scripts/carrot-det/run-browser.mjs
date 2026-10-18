// Runs replay specs in the Unity Web player (a CARROT_QA build with CarrotDeterminismProbe, e.g. CarrotTD.CarrotDetBuild.WebDet)
// inside a Playwright browser and saves each probe result JSON (per-tick digests, deep-hash checkpoints, outcome).
//   node run-browser.mjs <chromium|webkit> <url> <outDir> <order:fwd|rev> <spec...>
// env: CHUNK ticks per animation frame (90), VIEWPORT WxH, DPR, MOBILE=1, THROTTLE (Chromium CPU slowdown), HEADED=1, PLAYWRIGHT module path.
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { basename, join } from 'node:path'
const pw = await import(process.env.PLAYWRIGHT || '/Users/eric/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')
const [engine, url, outDir, order, ...specs0] = process.argv.slice(2)
const specs = order === 'rev' ? [...specs0].reverse() : specs0
mkdirSync(outDir, { recursive: true })
const headless = process.env.HEADED !== '1'
const browser = engine === 'webkit' ? await pw.webkit.launch({ headless }) : await pw.chromium.launch({ channel: 'chromium', headless })
const [vw, vh] = (process.env.VIEWPORT || '660x440').split('x').map(Number)
const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: Number(process.env.DPR || 1), isMobile: engine === 'chromium' && process.env.MOBILE === '1', hasTouch: process.env.MOBILE === '1' })
const page = await context.newPage()
const log = [], waiters = []
let chunks = null
page.on('console', msg => {
  const t = msg.text()
  if (t.startsWith('CARROT_DET_RESULT ')) { const m = /^CARROT_DET_RESULT (\d+)\/(\d+) /.exec(t); const i = +m[1], n = +m[2]; chunks ??= new Array(n); chunks[i] = t.slice(m[0].length).split('\n')[0] }
  else if (/CARROT_|rror|xception/.test(t)) log.push(t.slice(0, 400))
  for (const w of waiters.splice(0)) w(t)
})
page.on('pageerror', e => log.push('PAGEERROR ' + String(e).slice(0, 400)))
const waitFor = (re, ms) => new Promise((res, rej) => {
  const timer = setTimeout(() => rej(new Error('timeout waiting for ' + re)), ms)
  const hook = t => { if (re.test(t)) { clearTimeout(timer); res(t) } else waiters.push(hook) }
  waiters.push(hook)
})
const t0 = Date.now()
if (engine === 'chromium' && process.env.THROTTLE) { const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.THROTTLE) }) }
await page.goto(url)
await page.waitForFunction(() => window.det && (window.det.ready || window.det.error), null, { timeout: 180000 })
const err = await page.evaluate(() => window.det.error)
if (err) throw new Error('unity failed: ' + err)
const ua = await page.evaluate(() => navigator.userAgent)
const gl = await page.evaluate(() => { const c = document.createElement('canvas').getContext('webgl2'); if (!c) return 'no webgl2'; const x = c.getExtension('WEBGL_debug_renderer_info'); return x ? c.getParameter(x.UNMASKED_RENDERER_WEBGL) : c.getParameter(c.RENDERER) })
console.log(`${engine} ready in ${((Date.now() - t0) / 1000).toFixed(1)} s ua=${ua} gl=${gl}`)
await page.evaluate(c => { window.detChunk = c }, Number(process.env.CHUNK || 90))
const summary = { engine, ua, gl, version: browser.version(), order, chunk: Number(process.env.CHUNK || 90), viewport: [vw, vh], dpr: Number(process.env.DPR || 1), throttle: Number(process.env.THROTTLE || 1), runs: [] }
// Math fingerprints: the wasm libm (inside Unity) and the browser's own JS Math over the same inputs.
const mathDone = waitFor(/^CARROT_DET_MATH /, 60000)
await page.evaluate(() => window.det.send('MathProbe', ''))
summary.wasmMath = JSON.parse((await mathDone).slice('CARROT_DET_MATH '.length).split('\n')[0])
summary.jsMath = await page.evaluate(() => window.det.jsMath())
for (const spec of specs) {
  const id = basename(spec, '.txt'), text = readFileSync(spec, 'utf8')
  chunks = null
  const began = waitFor(/^CARROT_DET_BEGIN /, 60000)
  await page.evaluate(t => { window.det.done = false; window.det.send('Begin', t) }, text)
  await began
  const started = Date.now()
  const done = waitFor(/^CARROT_DET_DONE /, 1800000).then(t => page.evaluate(() => { window.det.done = true }).then(() => t))
  let finished = null; done.then(t => { finished = t })
  while (!finished) { await page.evaluate(() => window.det.pump(Number(window.detChunk || 90), 20)); }
  const seconds = (Date.now() - started) / 1000
  const resultDone = waitFor(/^CARROT_DET_RESULT (\d+)\/\1 /, 1).catch(() => null)
  await page.evaluate(() => window.det.send('Result', ''))
  for (let i = 0; i < 100 && (!chunks || chunks.some(c => c === undefined)); i++) await new Promise(r => setTimeout(r, 50))
  const result = JSON.parse(chunks.join(''))
  result.browser = engine; result.wallSeconds = seconds; result.ua = ua
  writeFileSync(join(outDir, id + '.json'), JSON.stringify(result))
  summary.runs.push({ id, ticks: result.ticks, phase: result.phase, chainDigest: result.chainDigest, chainDeep: result.chainDeep, seconds, ticksPerSecond: Math.round(result.ticks / seconds), deepMsAvg: result.deepMsAvg })
  console.log(`${engine} ${id} ticks=${result.ticks} ${result.phase} chain=${result.chainDigest} deep=${result.chainDeep} ${seconds.toFixed(1)} s (${Math.round(result.ticks / seconds)} ticks/s, deep ${result.deepMsAvg} ms)`)
  void resultDone
}
summary.log = log.slice(-200)
writeFileSync(join(outDir, '_summary.json'), JSON.stringify(summary, null, 1))
await browser.close()
