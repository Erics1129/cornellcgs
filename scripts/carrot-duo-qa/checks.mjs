// Acceptance checks of the duo/endless presentation that need a live player (maps-and-view stream), through harness.html + DuoQa:
//   camera   own-half fit within 3% of solo, drag-pan at zoom 1 reaches the partner's centre, "Both" frames the four arena corners,
//            portrait puts the own half nearest, L29 north yaws 180 degrees, reduced motion cuts in one frame
//   taps     200 real pointer taps on the partner's half: 200 partnerTap events, own state digest, coins and towers unchanged
//   spectator  no audio, Cinemachine, lights, cameras, colliders, clickables, volumes or time-scale requests on 'CarrotPartner', its
//            actor count equals the replica's enemies + towers, the host key light stays on
//   endless  844x390: every pad >= 18 px and selectable by a real tap; ghost sprouts, the presence ring and builder rings render
//   dressing every duo fight, both sides: no occluding prop within 1 u of a path (EnsureClearance's rule) or inside the wall strip, on
//            either half
//   node scripts/carrot-duo-qa/checks.mjs [--only camera,taps,spectator,endless] [--engine webkit]
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { serve, open, cmd, duo, send, probe, sleep, arg, flag, waitFor, REPO } from './lib.mjs'

const OUT = process.env.CARROT_DUO_QA_OUT || '/private/tmp/claude-501/-Users-eric-Claude/c0f378b2-d447-4405-9fc6-aa152072f6bd/scratchpad/carrot-duo/maps-and-view/checks'
const engine = arg('engine', 'chromium'), only = (arg('only', 'camera,taps,spectator,endless,dressing')).split(',')
const build = resolve(REPO, arg('build', 'output/carrot-qa')), name = arg('name', 'carrot-qa')
mkdirSync(OUT, { recursive: true })
const results = []; const check = (id, pass, detail) => { results.push({ id, pass: !!pass, detail }); console.log((pass ? 'PASS ' : 'FAIL ') + id + ' ' + JSON.stringify(detail).slice(0, 400)) }
const { server, url } = await serve(build)

async function setup(page, level, side, { bot = true, warp = 900 } = {}) {
  await duo(page, { t: 'duo', level, side }); await waitFor(page, l => window.qa.state && window.qa.state.level === l, level); await sleep(2600)
  if (bot) { await duo(page, { t: 'bot', on: 1, coins: 4000 }); await duo(page, { t: 'warp', ticks: warp }); await sleep(1500) }
}
async function settle(page, ms = 2200) { await sleep(ms); return probe(page, 'view') }
/** A real pointer drag (mouse or touch emulation through mouse events): from -> to in `steps` moves. */
async function drag(page, from, to, steps = 18) { await page.mouse.move(from[0], from[1]); await page.mouse.down(); for (let i = 1; i <= steps; i++) { await page.mouse.move(from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps); await sleep(16) } await page.mouse.up(); await sleep(60) }
async function tap(page, x, y) { await page.mouse.move(x, y); await page.mouse.down(); await sleep(40); await page.mouse.up(); await sleep(70) }

try {
  if (only.includes('camera')) {
    for (const size of [[1440, 900], [844, 390], [390, 844]]) {
      const ctx = await open({ engine, url, name, size, phone: size[0] < 900 }); const { page } = ctx; await send(page, 'Quality', 'high')
      for (const level of [4, 25, 29]) for (const side of [0, 1]) {
        await setup(page, level, side, { bot: false })
        let p = await settle(page)
        check(`camera.fit L${level} s${side} ${size.join('x')}`, Math.abs(p.fitRatio - 1) <= .03, { fit: p.fit, soloFit: p.soloFit })
        if (size[0] < 900 && size[1] > size[0] && level !== 29) check(`camera.portraitOwnNearer L${level} s${side}`, p.ownNearer === 1, { ownVp: p.ownVp, partnerVp: p.partnerVp })
        // L29 landscape: solo looks from the south at yaw -7; the north player looks from the north (solo + 180 = 173), the south player
        // from the mirror of that (7), so the two views are exact mirror images.
        if (level === 29 && size[0] > size[1]) { const yaw = p.angle[1], expect = side === 0 ? 173 : 7; check(`camera.L29yaw s${side} ${size.join('x')}`, Math.abs(yaw - expect) < .5, { yaw, expect, fromSolo: side === 0 ? yaw - (-7) : null }) }
        // Drag-pan at zoom 1 toward the partner (axis X): screen right-to-left for the west half, left-to-right for the east.
        if (level !== 29) {
          const w = size[0], h = size[1], dir = side === 0 ? -1 : 1, portrait = h > w
          for (let k = 0; k < 4; k++) { if (portrait) await drag(page, [w * .5, h * (side === 0 ? .3 : .3)], [w * .5, h * .85]); else await drag(page, [w * .5 - dir * w * .38, h * .55], [w * .5 + dir * w * .38, h * .55]) }
          p = await settle(page, 1200)
          check(`camera.dragReach L${level} s${side} ${size.join('x')}`, Math.abs(p.targetPan[0]) >= 15, { targetPan: p.targetPan, zoom: p.zoom })
        }
        await duo(page, { t: 'camera', mode: 'both' }); p = await settle(page)
        check(`camera.both L${level} s${side} ${size.join('x')}`, p.arenaCornersInView === 4, { corners: p.arenaCornersInView, zoom: p.zoom, bothZoom: p.bothZoom })
        await duo(page, { t: 'camera', mode: 'own' }); await sleep(300)
      }
      await duo(page, { t: 'solo' }); await ctx.browser.close()
    }
    // Reduced motion: one frame.
    const ctx = await open({ engine, url, name, size: [1440, 900], reducedMotion: true }); const { page } = ctx
    await setup(page, 25, 0, { bot: false }); await sleep(1500)
    for (const mode of ['both', 'partner', 'own']) {
      await duo(page, { t: 'camera', mode }); await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
      const p = await probe(page, 'view'); check(`camera.reducedMotionCut ${mode}`, p.settled === 1 && p.mode === mode, { zoom: p.zoom, targetZoom: p.targetZoom, pan: p.pan, targetPan: p.targetPan })
    }
    await ctx.browser.close()
  }
  if (only.includes('taps') || only.includes('spectator')) {
    for (const size of [[1440, 900], [844, 390]]) {
      const ctx = await open({ engine, url, name, size, phone: size[0] < 900 }); const { page } = ctx; await send(page, 'Quality', 'high')
      await setup(page, 25, 0)
      if (only.includes('spectator')) for (const mode of ['own', 'both', 'partner']) {
        await duo(page, { t: 'camera', mode }); const p = await settle(page); const s = p.partner
        check(`spectator.invariants ${mode} ${size.join('x')}`, s.view === 1 && s.audioSources === 0 && s.audioPlaying === 0 && s.cinemachine === 0 && s.lights === 0 && s.cameras === 0 && s.colliders === 0 && s.clickables === 0 && s.volumes === 0 && s.timeScale === 0 && s.timeScaleRequests === 0, s)
        check(`spectator.actors ${mode} ${size.join('x')}`, s.dormant === 1 || (s.actors === s.expected && s.expected > 0 && s.actorMismatchMax === 0), { actors: s.actors, expected: s.expected, dormant: s.dormant, mismatchMax: s.actorMismatchMax })
        check(`spectator.hostKeyLight ${mode} ${size.join('x')}`, p.hostSun === 1, { hostSun: p.hostSun })
      }
      if (only.includes('taps')) {
        await duo(page, { t: 'camera', mode: 'partner' }); await sleep(2200); await cmd(page, { type: 'setPaused', value: 1 }); await sleep(400)
        const before = await probe(page, 'digest'), countsBefore = (await probe(page, 'view')).counts
        const pts = (await probe(page, 'partnerPoints', { count: 200 })).points
        let events0 = await page.evaluate(() => window.qa.lines.filter(l => l[1].includes('CARROT_DUO_QA view {"kind":"partnerTap"')).length)
        for (const [x, y] of pts) await tap(page, x, y)
        await sleep(600)
        const after = await probe(page, 'digest'), countsAfter = (await probe(page, 'view')).counts
        const events = await page.evaluate(() => window.qa.lines.filter(l => l[1].includes('CARROT_DUO_QA view {"kind":"partnerTap"')).length) - events0
        check(`taps.partner ${size.join('x')}`, pts.length === 200 && events === 200 && countsAfter.partnerTap - countsBefore.partnerTap === 200 && before.digest === after.digest && before.discrete === after.discrete && before.coins === after.coins && before.towers === after.towers && after.selection === '', { taps: pts.length, events, counted: countsAfter.partnerTap - countsBefore.partnerTap, before, after })
        await cmd(page, { type: 'setPaused', value: 0 })
      }
      await duo(page, { t: 'solo' }); await ctx.browser.close()
    }
  }
  if (only.includes('endless')) {
    for (const seat of [0, 1]) {
      const ctx = await open({ engine, url, name, size: [844, 390], phone: true }); const { page } = ctx; await send(page, 'Quality', 'high')
      await duo(page, { t: 'endless', seat }); await sleep(3000)
      const pads = await probe(page, 'pads')
      check(`endless.padRadius seat${seat}`, pads.minRadiusPx >= 18, { minRadiusPx: pads.minRadiusPx, onScreen: pads.pads.filter(p => p[3]).length })
      // Every pad by a real tap (panning to the far wing first when it is off screen).
      let ok = 0, tried = 0; const missed = []
      for (let i = 0; i < pads.count; i++) {
        let p = (await probe(page, 'pads')).pads[i]
        if (!p[3]) { await duo(page, { t: 'camera', mode: 'partner' }); await sleep(1600); p = (await probe(page, 'pads')).pads[i] }
        if (!p[3]) { await duo(page, { t: 'camera', mode: 'both' }); await sleep(1600); p = (await probe(page, 'pads')).pads[i] }
        tried++; await tap(page, p[0], p[1]); await sleep(120)
        const d = await probe(page, 'digest'); if ((d.selection === 'pad' && d.selectionId === i) || d.selection === 'blocker' || d.selection === 'tower') ok++; else missed.push([i, d.selection, d.selectionId])
        await cmd(page, { type: 'clear' }); await duo(page, { t: 'camera', mode: 'own' }); await sleep(900)
      }
      check(`endless.padTap seat${seat}`, ok === pads.count, { ok, tried, missed })
      await duo(page, { t: 'bot', on: 1, coins: 700 }); await duo(page, { t: 'warp', ticks: 240 }); await sleep(1200); await duo(page, { t: 'bot', on: 0 })
      await duo(page, { t: 'builders' }); await duo(page, { t: 'pending', demo: 1 }); await duo(page, { t: 'presence', seat: 1 - seat, pad: 14, tower: -1 }); await sleep(1500)
      const v = await probe(page, 'view')
      check(`endless.overlays seat${seat}`, v.counts.pendingGhosts >= 1 && v.counts.presence === 1 && v.counts.builderTint >= 1, v.counts)
      await page.locator('#unity').screenshot({ path: join(OUT, `endless-overlays-seat${seat}.png`) })
      await duo(page, { t: 'pending', demo: 0 }); await sleep(700)
      const g = await probe(page, 'view'); check(`endless.ghostDissolve seat${seat}`, g.counts.pendingGhosts === 0, g.counts)
      await duo(page, { t: 'solo' }); await ctx.browser.close()
    }
  }
  if (only.includes('dressing')) {
    const ctx = await open({ engine, url, name, size: [1440, 900] }); const { page } = ctx; await send(page, 'Quality', 'high')
    for (const level of [4, 8, 12, 16, 20, 24, 25, 26, 27, 28, 29]) for (const side of [0, 1]) {
      await setup(page, level, side, { bot: false }); const p = await settle(page, 1200)
      // Arena stones and scanned props keep 1 u to the path centreline minus nothing; the wall strip is |c| < .5 (L28 floats: no props).
      check(`dressing L${level} s${side}`, p.propWallClearance >= .5 && p.partnerPropWallClearance >= .5 && p.propPathClearance >= .99 && p.partnerPropPathClearance >= .99, { wall: p.propWallClearance, partnerWall: p.partnerPropWallClearance, path: p.propPathClearance, partnerPath: p.partnerPropPathClearance })
    }
    await duo(page, { t: 'solo' }); await ctx.browser.close()
  }
} finally { server.close() }
writeFileSync(join(OUT, `checks-${engine}.json`), JSON.stringify({ engine, at: new Date().toISOString(), results }, null, 1))
const failed = results.filter(r => !r.pass); console.log(`CHECKS ${results.length - failed.length}/${results.length} passed`); if (failed.length) process.exitCode = 1
