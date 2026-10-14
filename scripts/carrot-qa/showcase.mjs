// Deterministic showcase captures (identical command lists every run): L1 combat, the L4 garden boss with its telegraphs, the L14
// ponds, L24 with four Thunderheads, a Super forge (frame burst) and Asuna's abilities, at the chosen viewport. Writes JPEG bursts
// for the review page and before/after comparisons.
// usage: node scripts/carrot-qa/showcase.mjs --tag after [--phone] [--engine chromium] [--only merge,boss]
import * as H from './lib.mjs'
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d }
const only = (arg('only', '') || '').split(',').filter(Boolean)
const want = k => !only.length || only.includes(k)
const ctx = await H.open({ engine: arg('engine', 'chromium'), tag: 'show-' + arg('tag', 'run'), phone: process.argv.includes('--phone') })
const { page } = ctx
const burst = async (name, n, every) => { for (let i = 0; i < n; i++) { const t = Date.now(); await H.shot(ctx, `${name}-${String(i).padStart(2, '0')}`, { png: false }); const d = every - (Date.now() - t); if (d > 0) await H.sleep(d) } }
async function build(level, plan) { await H.send(page, { type: 'debugCoins', value: 30000 }); const pads = H.padScores(H.levelDef(level)).filter(p => !p.blocked); const ids = []
  for (let i = 0; i < plan.length && i < pads.length; i++) { const [kind, tier] = plan[i]; await H.send(page, { type: 'select', selectionType: 'pad', id: pads[i].pad }); await H.send(page, { type: 'buy', kind }); for (let t = 1; t < tier; t++) await H.send(page, { type: 'upgrade' }); const s = await H.state(page); ids.push(s.selection && s.selection.id) }
  await H.send(page, { type: 'clear' }); return ids }
try {
  await H.enter(ctx)
  if (want('l1')) { await H.loadLevel(ctx, 1); await build(1, [['seed', 2], ['frost', 2], ['seed', 2]]); await H.send(page, { type: 'start' }); await H.send(page, { type: 'speed', value: 2 }); await H.sleep(14000); await burst('L01-combat', 4, 250) }
  if (want('boss')) { await H.loadLevel(ctx, 4); await build(4, [['seed', 4], ['mortar', 4], ['frost', 3], ['prism', 3], ['storm', 3]]); await H.send(page, { type: 'start' }); await H.send(page, { type: 'debugEncounter', kind: 'garden' }); await H.sleep(800); await burst('L04-boss-entrance', 8, 300)
    await build(4, [['seed', 4], ['mortar', 4], ['frost', 3], ['prism', 3], ['storm', 3]]); await H.send(page, { type: 'start' }); await H.sleep(500)
    for (const k of ['root', 'bark', 'uproot']) { const s = await H.state(page); if (s && s.boss) await H.send(page, { type: 'debugCast', id: s.boss.id, kind: k }); await H.sleep(600); await burst(`L04-${k}`, 4, 350); await H.sleep(1500) }
    await H.send(page, { type: 'debugBossDamage', value: 1e7 }); await H.sleep(150); await burst('L04-boss-death', 8, 200) }
  if (want('ponds')) { await H.loadLevel(ctx, 14); await H.shot(ctx, 'L14-ponds', { png: false }) }
  if (want('thunder')) { await H.loadLevel(ctx, 24); await build(24, [['thunder', 4], ['thunder', 4], ['thunder', 4], ['thunder', 4], ['mortar', 4], ['seed', 4]]); await H.send(page, { type: 'start' }); await H.send(page, { type: 'speed', value: 2 }); await H.sleep(20000); await burst('L24-thunder', 6, 180) }
  if (want('merge')) { await H.loadLevel(ctx, 12); const ids = await build(12, [['seed', 4], ['seed', 4]]); await H.sleep(600); await H.send(page, { type: 'merge', id: ids[0], target: ids[1] }); await burst('L12-super-forge', 12, 110); await H.sleep(800); await H.shot(ctx, 'L12-super-after', { png: false }) }
  if (want('asuna')) { await H.loadLevel(ctx, 29); await build(29, [['prism', 4], ['storm', 4], ['seed', 4], ['thunder', 4]]); await H.send(page, { type: 'start' }); await H.send(page, { type: 'debugEncounter', kind: 'asuna' }); await H.sleep(3000); await H.message(page, 'FocusBoss', ''); await H.sleep(1500)
    for (const k of ['prismLances', 'spectrumRain', 'prismaticAegis']) { const s = await H.state(page); if (s && s.boss) await H.send(page, { type: 'debugCast', id: s.boss.id, kind: k }); await H.sleep(500); await burst(`L29-${k}`, 4, 400); await H.sleep(1200) } }
  H.save(ctx, 'show.json', { errors: ctx.net.console.filter(c => c[1] === 'error' || c[1] === 'pageerror').slice(0, 20) })
} catch (e) { console.log('ERROR', e.stack) } finally { await ctx.browser.close() }
