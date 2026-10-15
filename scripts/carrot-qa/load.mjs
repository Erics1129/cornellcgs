// Cold-cache load over a throttled link (Chromium DevTools network emulation): bytes transferred until the first playable ready
// state, and the time from the Continue click to playable. GitHub Pages model: serve.mjs sends no Content-Encoding, so the page's
// own gzip inflation path runs.
// usage: node scripts/carrot-qa/load.mjs --mbps 10 [--tag load-10]
import * as H from './lib.mjs'
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d }
const mbps = Number(arg('mbps', 10))
const ctx = await H.open({ tag: arg('tag', 'load-' + mbps) }); const { page } = ctx
const out = { mbps }
try {
  const cdp = await ctx.context.newCDPSession(page)
  await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: mbps * 1e6 / 8, uploadThroughput: 5e6 / 8 })
  let bytes = 0; const files = {}
  cdp.on('Network.loadingFinished', e => { bytes += e.encodedDataLength || 0 })
  cdp.on('Network.responseReceived', e => { files[e.requestId] = e.response.url.replace(/^https?:\/\/[^/]+/, '').split('?')[0] })
  cdp.on('Network.loadingFinished', e => { const u = files[e.requestId]; if (u) files[e.requestId] = [u, e.encodedDataLength] })
  const t = await H.enter(ctx)
  out.tDom = t.tDom; out.tLobby = t.tLobby; out.clickToPlayableMs = t.clickToPlayable; out.bytes = bytes
  out.largest = Object.values(files).filter(Array.isArray).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([u, n]) => [u, +(n / 1e6).toFixed(2)])
  console.log(`load ${mbps} Mbps: click->playable ${(t.clickToPlayable / 1000).toFixed(1)} s, lobby ${(t.tLobby / 1000).toFixed(1)} s, transferred ${(bytes / 1e6).toFixed(1)} MB`)
  for (const [u, n] of out.largest) console.log('  ', n, 'MB', u)
} catch (e) { console.log('ERROR', e.stack); out.error = String(e) } finally { H.save(ctx, 'load.json', out); await ctx.browser.close() }
