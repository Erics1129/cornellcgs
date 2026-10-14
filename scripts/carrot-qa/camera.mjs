// Camera rig checks on a local QA build: wheel zoom keeps the world point under the cursor (pixels of drift after the damped camera
// settles), panning works while paused, every route start is reachable at maximum zoom, Focus boss frames Asuna large enough, and
// reduced motion records no impulses, hit-stops, FOV punches or cinematic camera moves in a scripted Level 8 boss fight.
// usage: node scripts/carrot-qa/camera.mjs [--engine chromium]
import * as H from './lib.mjs'
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d }
const engine = arg('engine', 'chromium')
const out = { engine }
const sel = async page => { const s = await H.state(page); return s && s.selection ? { x: s.selection.x, y: s.selection.y, type: s.selection.type } : null }
async function canvasBox(page) { return page.evaluate(() => { const r = document.getElementById('carrot-unity-canvas').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } }) }
{
  const ctx = await H.open({ engine, tag: 'camera-' + engine }); const { page } = ctx
  try {
    await H.enter(ctx); await H.loadLevel(ctx, 1, 2500); const box = await canvasBox(page)
    // 1. zoom toward the cursor: a pad off-centre stays under the pointer
    const drift = []
    for (const pad of [2, 9, 14]) {
      await H.send(page, { type: 'load', level: 1 }); await H.sleep(2600)
      await H.send(page, { type: 'select', selectionType: 'pad', id: pad }); await H.sleep(400); const a = await sel(page)
      const px = box.x + a.x * box.w, py = box.y + a.y * box.h; await page.mouse.move(px, py)
      for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -100); await H.sleep(60) }
      await H.sleep(1800); const b = await sel(page)
      drift.push({ pad, before: [Math.round(a.x * box.w), Math.round(a.y * box.h)], after: [Math.round(b.x * box.w), Math.round(b.y * box.h)], px: Math.hypot((b.x - a.x) * box.w, (b.y - a.y) * box.h) })
    }
    out.zoomDrift = drift; console.log('zoom drift px', drift.map(d => d.px.toFixed(1)).join(' '))
    // 2. pan while paused
    await H.send(page, { type: 'load', level: 1 }); await H.sleep(2600); await H.send(page, { type: 'start' }); await H.sleep(600); await H.send(page, { type: 'pause' }); await H.sleep(300)
    await page.mouse.move(box.x + box.w * .5, box.y + box.h * .5); for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, -100); await H.sleep(60) } await H.sleep(1200)
    await H.send(page, { type: 'select', selectionType: 'pad', id: 4 }); await H.sleep(300); const p0 = await sel(page); await H.send(page, { type: 'clear' })
    await page.mouse.move(box.x + box.w * .5, box.y + box.h * .6); await page.mouse.down(); for (let i = 1; i <= 10; i++) { await page.mouse.move(box.x + box.w * .5 + i * 22, box.y + box.h * .6 + i * 6); await H.sleep(16) } await page.mouse.up(); await H.sleep(1200)
    await H.send(page, { type: 'select', selectionType: 'pad', id: 4 }); await H.sleep(300); const p1 = await sel(page); const st = await H.state(page)
    out.pausedPan = { paused: st.paused, movedPx: Math.hypot((p1.x - p0.x) * box.w, (p1.y - p0.y) * box.h) }; console.log('paused pan', JSON.stringify(out.pausedPan))
    // 3. route starts at max zoom, 4. Asuna follow-cam
    const probe = []
    for (const id of [1, 6, 10, 14, 19, 24, 25, 27, 28, 29]) { await H.loadLevel(ctx, id, 1500); await H.message(page, 'QaCameraProbe', ''); await H.sleep(250); probe.push((await H.logs(page, /CARROT_QA_CAMERA/)).pop()) }
    out.routeStarts = probe.map(l => (/level=(\d+) routeStarts=(\d+) reachableAtMaxZoom=(\d+)/.exec(l) || []).slice(1).map(Number)); console.log('route starts', JSON.stringify(out.routeStarts))
    await H.loadLevel(ctx, 29, 1500); await H.send(page, { type: 'debugEncounter', kind: 'asuna' }); await H.sleep(4500); await H.message(page, 'FocusBoss', ''); await H.sleep(2500)
    await H.message(page, 'QaCameraProbe', ''); await H.sleep(250); out.asuna = (await H.logs(page, /CARROT_QA_CAMERA/)).pop(); console.log(out.asuna)
    await H.shot(ctx, 'asuna-focus', { png: false })
  } catch (e) { console.log('ERROR', e.stack); out.error = String(e) } finally { H.save(ctx, 'camera.json', out); await ctx.browser.close() }
}
{
  const ctx = await H.open({ engine, tag: 'reduced-' + engine, reducedMotion: true }); const { page } = ctx
  try {
    await H.enter(ctx); await H.sleep(500); await H.loadLevel(ctx, 8, 2000); await H.message(page, 'QaDump', 'reset')
    await H.send(page, { type: 'debugEncounter', kind: 'marsh' }); await H.send(page, { type: 'speed', value: 2 }); await H.sleep(6000)
    for (const k of ['mist', 'summon', 'blind', 'tithe']) { const s = await H.state(page); if (s && s.boss) await H.send(page, { type: 'debugCast', id: s.boss.id, kind: k }); await H.sleep(3500) }
    await H.send(page, { type: 'debugBossDamage', value: 1e6 }); await H.sleep(4000)
    await H.message(page, 'QaDump', ''); await H.sleep(300); const dump = (await H.logs(page, /CARROT_QA_DUMP/)).pop() || ''
    const counts = Object.fromEntries((/counts=(\S*)/.exec(dump) || ['', ''])[1].split(',').filter(Boolean).map(kv => kv.split(':')).map(([k, v]) => [k, Number(v)]))
    out.reducedMotion = { impulse: counts.impulse || 0, hitstop: counts.hitstop || 0, slowmo: counts.slowmo || 0, fovPunch: counts.fovPunch || 0, cinematic: counts['camera.cinematic'] || 0, reveal: counts['camera.reveal'] || 0, suppressed: (counts['impulse.suppressed'] || 0) + (counts['hitstop.suppressed'] || 0) }
    console.log('reduced motion', JSON.stringify(out.reducedMotion))
  } catch (e) { console.log('ERROR', e.stack); out.rmError = String(e) } finally { H.save(ctx, 'reduced.json', out); await ctx.browser.close() }
}
