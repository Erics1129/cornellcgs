// Screenshot sets of the duo/endless presentation (maps-and-view stream), against a CARROT_QA player driven through harness.html.
//   node scripts/carrot-duo-qa/shots.mjs --solo --tag base --build output/carrot-qa-base --name carrot-qa-base     solo reference frames
//   node scripts/carrot-duo-qa/shots.mjs --solo --tag after                                                          the same with this build
//   node scripts/carrot-duo-qa/shots.mjs --compare base,after                                                        world-geometry diff
//   node scripts/carrot-duo-qa/shots.mjs --duo [--levels 4,8,...] [--sizes 1440x900,844x390,390x844] [--engine webkit] [--rm]
//   node scripts/carrot-duo-qa/shots.mjs --endless
// Frames are taken paused (the view clock, wind and particles stop with the game), on the High tier, after the level reveal.
// Output: $CARROT_DUO_QA_OUT (default <scratchpad>/carrot-duo/maps-and-view/shots).
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { serve, open, cmd, duo, send, probe, loadSolo, sleep, arg, flag, diffPng, waitFor, REPO } from './lib.mjs'

const OUT = process.env.CARROT_DUO_QA_OUT || '/private/tmp/claude-501/-Users-eric-Claude/c0f378b2-d447-4405-9fc6-aa152072f6bd/scratchpad/carrot-duo/maps-and-view/shots'
const engine = arg('engine', 'chromium'), tag = arg('tag', 'after')
const build = resolve(REPO, arg('build', 'output/carrot-qa')), name = arg('name', 'carrot-qa')
const sizes = arg('sizes', flag('solo') ? '1440x900,390x844' : '1440x900,844x390,390x844').split(',').map(s => s.split('x').map(Number))
const DUO_LEVELS = [4, 8, 12, 16, 20, 24, 25, 26, 27, 28, 29]
const levels = (arg('levels', '') || (flag('solo') ? '1,12,24,25,28,29' : DUO_LEVELS.join(','))).split(',').map(Number)
const rm = flag('rm')

async function freeze(page, settle = 3200) { await sleep(settle); await cmd(page, { type: 'setPaused', value: 1 }); await sleep(600) }
async function canvasShot(page, file) { mkdirSync(resolve(file, '..'), { recursive: true }); await page.locator('#unity').screenshot({ path: file, timeout: 60000 }) }

if (flag('compare')) {
  const [a, b] = arg('compare').split(',');const dirA = join(OUT, 'solo', a), dirB = join(OUT, 'solo', b), dirD = join(OUT, 'solo', `diff-${a}-${b}`); mkdirSync(dirD, { recursive: true })
  const rows = []
  for (const f of readdirSync(dirA).filter(f => f.endsWith('.png'))) { if (!existsSync(join(dirB, f))) { rows.push({ f, missing: true }); continue } rows.push({ f, ...diffPng(join(dirA, f), join(dirB, f), join(dirD, f)) }) }
  writeFileSync(join(dirD, 'diff.json'), JSON.stringify(rows, null, 1)); for (const r of rows) console.log(r.f, r.missing ? 'MISSING' : `diff=${(r.fraction * 100).toFixed(3)}% lumaDelta=${r.meanLumaDelta.toFixed(3)} blocksMoved=${(r.blocksMoved * 100).toFixed(3)}%`)
  process.exit(0)
}

const { server, url } = await serve(build)
const report = { engine, tag, build: name, at: new Date().toISOString(), runs: [] }
try {
  for (const size of sizes) {
    const phone = size[0] < 900
    const ctx = await open({ engine, url, name, size, phone, reducedMotion: rm })
    const { page } = ctx
    await send(page, 'Quality', 'high')
    if (flag('solo')) {
      for (const level of levels) {
        // Frozen from the first frame: load and pause land before the level's first Update, so the view clock (wind, lantern flicker
        // and the per-object light picks it drives) stays at 0 and the reveal camera settles on its pose; two players compare exactly.
        await page.evaluate(l => { window.qa.cmd({ type: 'load', level: l }); window.qa.cmd({ type: 'setPaused', value: 1 }) }, level)
        await waitFor(page, l => window.qa.state && window.qa.state.level === l && window.qa.state.paused, level, 120000); await sleep(4500)
        const file = join(OUT, 'solo', tag, `L${level}-${size[0]}x${size[1]}.png`); await canvasShot(page, file)
        report.runs.push({ level, size, file }); console.log('solo', level, size.join('x'), file)
        await cmd(page, { type: 'setPaused', value: 0 })
      }
    }
    if (flag('duo')) {
      for (const level of levels) for (const side of [0, 1]) {
        await duo(page, { t: 'duo', level, side }); await waitFor(page, l => window.qa.state && window.qa.state.level === l, level)
        await sleep(2400); await duo(page, { t: 'bot', on: 1, coins: 4000 }); await duo(page, { t: 'warp', ticks: 900 }); await sleep(1500)
        for (const mode of ['own', 'both', 'partner']) {
          await cmd(page, { type: 'setPaused', value: 0 }); await duo(page, { t: 'camera', mode }); await freeze(page, rm ? 600 : 2400)
          const file = join(OUT, 'duo', tag + (rm ? '-rm' : ''), `L${level}-s${side}-${mode}-${size[0]}x${size[1]}.png`); await canvasShot(page, file)
          const p = await probe(page, 'view')
          report.runs.push({ level, side, mode, size, file, probe: p }); console.log('duo', level, side, mode, size.join('x'), JSON.stringify(p).slice(0, 220))
        }
        await cmd(page, { type: 'setPaused', value: 0 }); await duo(page, { t: 'bot', on: 0 })
      }
      await duo(page, { t: 'solo' })
    }
    if (flag('endless')) {
      for (const seat of [0, 1]) {
        await duo(page, { t: 'endless', seat }); await sleep(2600); await duo(page, { t: 'bot', on: 1, coins: 4000 }); await duo(page, { t: 'warp', ticks: 900 }); await sleep(1200)
        await duo(page, { t: 'pending', demo: 1 }); await duo(page, { t: 'presence', seat: 1 - seat, pad: 14, tower: -1 })
        for (const mode of ['own', 'both']) {
          await cmd(page, { type: 'setPaused', value: 0 }); await duo(page, { t: 'camera', mode }); await freeze(page, rm ? 600 : 2400)
          const file = join(OUT, 'endless', tag + (rm ? '-rm' : ''), `E-seat${seat}-${mode}-${size[0]}x${size[1]}.png`); await canvasShot(page, file)
          const p = await probe(page, 'view'); const pads = await probe(page, 'pads')
          report.runs.push({ endless: true, seat, mode, size, file, probe: p, pads }); console.log('endless', seat, mode, size.join('x'), JSON.stringify(p).slice(0, 200), 'minPadPx', pads && pads.minRadiusPx)
        }
        await cmd(page, { type: 'setPaused', value: 0 }); await duo(page, { t: 'bot', on: 0 })
      }
      await duo(page, { t: 'solo' })
    }
    report.errors = (report.errors || []).concat(ctx.errors.map(e => size.join('x') + ' ' + e))
    await ctx.browser.close()
  }
} finally { server.close() }
const dir = join(OUT, flag('solo') ? 'solo' : flag('duo') ? 'duo' : 'endless'); mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, `report-${tag}-${engine}${rm ? '-rm' : ''}.json`), JSON.stringify(report, null, 1))
console.log('errors', report.errors.length, report.errors.slice(0, 8))
