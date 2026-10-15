// WCAG 2.3.1 sampler on the composited page: every animation frame the page (canvas plus DOM HUD) is not readable, so the Unity
// canvas is copied into an 8x5 grid of cells; a cell transition is a change of relative luminance >= 0.10 where the darker state
// is below 0.80; a general transition is one frame in which cells covering >= 11% of the frame (25% of a 10 degree field at
// 1024x768) transition in the same direction; a flash is a pair of opposing general transitions. Reports the most flashes in any
// rolling second for each scenario.
// usage: node scripts/carrot-qa/flash.mjs [--engine chromium] [--scenario thunder|boss8|asuna|merge|all] [--seconds 40]
import * as H from './lib.mjs'
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d }
const engine = arg('engine', 'chromium'), scenario = arg('scenario', 'all'), seconds = Number(arg('seconds', 40))
const SAMPLER = `(() => { if (window.__flash) return; const c = document.createElement('canvas'); c.width = 64; c.height = 40; const g = c.getContext('2d', { willReadFrequently: true });
 const F = window.__flash = { frames: 0, events: [], lastDir: new Int8Array(40), base: null, on: true, worst: 0, log: [] };
 const lin = v => { v /= 255; return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4) };
 const LUT = new Float32Array(256); for (let i = 0; i < 256; i++) LUT[i] = lin(i);
 let ref = new Float32Array(40); let primed = false;
 const tick = now => { requestAnimationFrame(tick); if (!F.on) return; const src = document.getElementById('carrot-unity-canvas'); if (!src || !src.width) return;
  try { g.drawImage(src, 0, 0, 64, 40); } catch (e) { return }
  const d = g.getImageData(0, 0, 64, 40).data; const cell = new Float32Array(40);
  for (let y = 0; y < 40; y++) for (let x = 0; x < 64; x++) { const k = (y * 64 + x) * 4; const Y = .2126 * LUT[d[k]] + .7152 * LUT[d[k + 1]] + .0722 * LUT[d[k + 2]]; cell[Math.floor(y / 8) * 8 + Math.floor(x / 8)] += Y / 64 }
  F.frames++; if (!primed) { ref = cell; primed = true; return }
  let up = 0, down = 0; for (let i = 0; i < 40; i++) { const a = cell[i], b = ref[i]; if (Math.abs(a - b) >= .1 && Math.min(a, b) < .8) { if (a > b) up++; else down++; ref[i] = a } else if (Math.abs(a - b) < .02) ref[i] = ref[i] * .9 + a * .1 }
  const area = 40 * .11; if (up >= area) F.events.push([now, 1]); else if (down >= area) F.events.push([now, -1]);
  if (F.events.length > 4000) F.events.splice(0, 2000);
 }; requestAnimationFrame(tick);
 F.flashesPerSecond = () => { const ev = F.events; let worst = 0; for (let i = 0; i < ev.length; i++) { let n = 0, last = 0; for (let j = i; j < ev.length && ev[j][0] - ev[i][0] < 1000; j++) { if (last && ev[j][1] !== last) n++; last = ev[j][1] } worst = Math.max(worst, Math.floor((n + 1) / 2)) } return worst };
})();`
const ctx = await H.open({ engine, tag: 'flash-' + engine })
const { page } = ctx
const out = { engine, scenarios: {} }
async function measure(name, fn) {
  await page.evaluate(() => { window.__flash.events = []; window.__flash.frames = 0 })
  await H.message(page, 'QaDump', 'reset')
  await fn()
  const r = await page.evaluate(() => ({ frames: window.__flash.frames, transitions: window.__flash.events.length, worst: window.__flash.flashesPerSecond() }))
  await H.message(page, 'QaDump', ''); await H.sleep(300)
  const dump = (await H.logs(page, /CARROT_QA_DUMP/)).pop() || ''
  r.flashGranted = Number((/flashGranted=(\d+)/.exec(dump) || [])[1]); r.flashCoalesced = Number((/flashCoalesced=(\d+)/.exec(dump) || [])[1])
  out.scenarios[name] = r; console.log(name, JSON.stringify(r))
}
try {
  await H.enter(ctx); await page.evaluate(SAMPLER)
  if (scenario === 'all' || scenario === 'thunder') await measure('L24-four-thunderheads', async () => {
    await H.loadLevel(ctx, 24); await H.send(page, { type: 'debugCoins', value: 20000 })
    const pads = H.padScores(H.levelDef(24)).filter(p => !p.blocked).slice(0, 4)
    for (const p of pads) { await H.send(page, { type: 'select', selectionType: 'pad', id: p.pad }); await H.send(page, { type: 'buy', kind: 'thunder' }); for (let i = 0; i < 3; i++) await H.send(page, { type: 'upgrade' }) }
    await H.send(page, { type: 'clear' }); await H.send(page, { type: 'start' }); await H.send(page, { type: 'speed', value: 2 })
    await H.sleep(seconds * 1000)
  })
  if (scenario === 'all' || scenario === 'boss8') await measure('L8-boss-casts', async () => {
    await H.loadLevel(ctx, 8); await H.send(page, { type: 'debugCoins', value: 8000 }); await H.send(page, { type: 'start' })
    await H.send(page, { type: 'debugEncounter', kind: 'marsh' }); await H.send(page, { type: 'speed', value: 2 })
    for (const k of ['mist', 'summon', 'blind', 'tithe', 'lanternFlood']) { await H.sleep(3500); const s = await H.state(page); if (s.boss) await H.send(page, { type: 'debugCast', id: s.boss.id, kind: k }) }
    await H.sleep(6000); await H.send(page, { type: 'debugBossDamage', value: 1e6 }); await H.sleep(5000)
  })
  if (scenario === 'all' || scenario === 'asuna') await measure('L29-asuna-abilities', async () => {
    await H.loadLevel(ctx, 29); await H.send(page, { type: 'debugCoins', value: 8000 }); await H.send(page, { type: 'start' })
    await H.send(page, { type: 'debugEncounter', kind: 'asuna' }); await H.sleep(2500)
    for (const k of ['prismLances', 'spectrumRain', 'prismDash', 'prismaticAegis', 'mirrorRush', 'prismOverdrive']) { const s = await H.state(page); if (s.boss) await H.send(page, { type: 'debugCast', id: s.boss.id, kind: k }); await H.sleep(3000) }
  })
  if (scenario === 'all' || scenario === 'merge') await measure('L12-super-merge', async () => {
    await H.loadLevel(ctx, 12); await H.send(page, { type: 'debugCoins', value: 20000 })
    const pads = H.padScores(H.levelDef(12)).filter(p => !p.blocked).slice(0, 2); const ids = []
    for (const p of pads) { await H.send(page, { type: 'select', selectionType: 'pad', id: p.pad }); await H.send(page, { type: 'buy', kind: 'seed' }); for (let i = 0; i < 3; i++) await H.send(page, { type: 'upgrade' }); const s = await H.state(page); ids.push(s.selection && s.selection.id) }
    await H.send(page, { type: 'clear' }); await H.sleep(500); await H.send(page, { type: 'merge', id: ids[0], target: ids[1] }); await H.sleep(4000)
  })
  out.errors = ctx.net.console.filter(c => c[1] === 'error' || c[1] === 'pageerror').slice(0, 20)
} catch (e) { console.log('ERROR', e.stack); out.error = String(e) }
finally { H.save(ctx, 'flash.json', out); await ctx.browser.close() }
