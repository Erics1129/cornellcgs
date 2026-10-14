// Carrot Defense UI acceptance suite (mock player, no Unity). Needs the site served (npm run dev, or vite preview of a build):
//   BASE=http://localhost:5291 node scripts/carrot-ui-qa/qa.mjs [chromium|webkit|all] [suite,...]
// Suites: layout, panel, scan, motion, commands, track, perf, lobby, parity. Screenshots and a JSON report go to output/carrot-ui-qa/.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, open, enter, fixture, seed, commands, clearCommands, rectsHit, report, outDir, viewports, topLimits } from './lib.mjs'
const [which = 'all', only = ''] = process.argv.slice(2)
const base = process.env.BASE || 'http://localhost:5291'
const engines = which === 'all' ? ['chromium', 'webkit'] : [which]
const suites = only ? only.split(',') : ['layout', 'panel', 'scan', 'motion', 'commands', 'track', 'lobby', 'parity', 'perf']
const results = [], data = {}
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); return ok }
/** the top HUD stack: visible [data-top] parts in the upper half of the screen (on phones some live at the bottom) */
const topStack = page => page.evaluate(() => Math.max(0, ...[...document.querySelectorAll('.ct-hud [data-top]')].map(n => n.getBoundingClientRect()).filter(r => r.height > 0 && r.height <= r.width * 1.5 && r.top < innerHeight / 2).map(r => r.bottom)) / innerHeight)
const overflow = page => page.evaluate(() => { const w = innerWidth; const bad = [...document.querySelectorAll('.ct-page *')].filter(n => { const r = n.getBoundingClientRect(); if (!r.width || !r.height) return false; const s = getComputedStyle(n); if (s.visibility === 'hidden' || s.display === 'none') return false; if (n.closest('.ct-track__rail,.ct-build__tiles,.ct-chapters,.ct-tracklist,.ct-minibars,.ct-monster-bars,.ct-sr,.ct-canvas,.ct-scene')) return false; return r.right > w + 1 || r.left < -1 }).map(n => n.className && String(n.className).slice(0, 40)); return { scroll: document.scrollingElement.scrollWidth - w, bad: bad.slice(0, 6) } })

for (const engine of engines) {
  const browser = await launch(engine)
  const E = s => `[${engine}] ${s}`
  // ---------------------------------------------------------------- layout: overflow and the top stack per viewport
  if (suites.includes('layout')) for (const vp of Object.keys(viewports)) {
    const { context, page } = await open(browser, { viewport: vp, storage: seed(8), base })
    await enter(page)
    let worst = 0
    for (const name of ['ready', 'waveAir', 'bossUproot', 'challengeDeadline', 'tower', 'won', 'lost', 'v1-bossUproot']) {
      await fixture(page, name)
      if (name === 'won' || name === 'lost') await page.waitForTimeout(1700)
      const o = await overflow(page)
      check(E(`${vp} ${name}: no horizontal overflow`), o.scroll <= 0 && !o.bad.length, o.bad.length ? o : '')
      if (!['won', 'lost', 'tower'].includes(name)) { const t = await topStack(page); worst = Math.max(worst, t) }
      await page.screenshot({ path: join(outDir, `qa-${engine}-${vp}-${name}.png`) })
    }
    check(E(`${vp}: top HUD stack ${(worst * 100).toFixed(1)}% <= ${topLimits[vp] * 100}%`), worst <= topLimits[vp])
    await context.close()
  }
  // ---------------------------------------------------------------- panel: placement at 9 pad positions
  if (suites.includes('panel')) for (const vp of Object.keys(viewports)) {
    const { context, page } = await open(browser, { viewport: vp, storage: seed(8), base })
    await enter(page)
    for (let i = 0; i < 9; i++) {
      await fixture(page, 'ready'); await page.waitForTimeout(150)
      await fixture(page, 'pad', { padIndex: i })
      await page.waitForSelector('.ct-build.is-placed', { timeout: 4000 })
      const m = await page.evaluate(() => { const st = window.__qa.state, w = innerWidth, h = innerHeight, r = document.querySelector('.ct-build').getBoundingClientRect(), cta = document.querySelector('.ct-build__go')?.getBoundingClientRect()
        return { panel: { x: r.x, y: r.y, w: r.width, h: r.height }, pad: { x: st.selection.x * w - 38, y: st.selection.y * h - 30, w: 76, h: 60 }, carrot: { x: st.carrotX * w - 58, y: st.carrotY * h - 96, w: 116, h: 128 }, cta: cta && { x: cta.x, y: cta.y, w: cta.width, h: cta.height }, vw: w, vh: h } })
      const clear = !rectsHit(m.panel, m.pad) && !rectsHit(m.panel, m.carrot)
      check(E(`${vp} pad ${i}: panel clear of pad and carrot`), clear, clear ? '' : m)
      if (vp === 'portrait') check(E(`${vp} pad ${i}: sheet <= 200 px tall (${Math.round(m.panel.h)})`), m.panel.h <= 200.5)
      if (vp === 'landscape') check(E(`${vp} pad ${i}: Build CTA fully on screen`), m.cta && m.cta.x >= 0 && m.cta.y >= 0 && m.cta.x + m.cta.w <= m.vw && m.cta.y + m.cta.h <= m.vh, m.cta)
      if (vp === 'desktop') check(E(`${vp} pad ${i}: panel <= 280x190 (${Math.round(m.panel.w)}x${Math.round(m.panel.h)})`), m.panel.w <= 280.5 && m.panel.h <= 190.5)
      if (i === 4) await page.screenshot({ path: join(outDir, `qa-${engine}-${vp}-panel.png`) })
    }
    await context.close()
  }
  // ---------------------------------------------------------------- scan: type sizes, targets, backdrop-filter, contrast
  if (suites.includes('scan')) for (const vp of ['desktop', 'portrait']) {
    const { context, page } = await open(browser, { viewport: vp, storage: seed(8), base })
    await enter(page)
    for (const name of ['waveAir', 'bossUproot', 'pad', 'tower']) {
      await fixture(page, name, { padIndex: 4 }); await page.waitForTimeout(400)
      const r = await page.evaluate(() => {
        const out = { small: [], targets: [], blur: [], contrast: [], icons: [] }
        const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 } }
        const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4) }; return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b) }
        const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05) }
        // the colour behind an element: its nearest painted ancestor (panel gradients resolve to their darker stop, #070b12)
        const bgOf = n => { for (let e = n; e && e !== document.documentElement; e = e.parentElement) { const s = getComputedStyle(e); const c = parse(s.backgroundColor); if (c && c.a > .5) return c; if (s.backgroundImage.includes('gradient')) { const stops = [...s.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map(m => parse(m[0])).filter(Boolean); if (stops.length) return stops.reduce((a, b) => lum(a) > lum(b) ? a : b) } } return null }
        const visible = n => { const r = n.getBoundingClientRect(); if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) return false; for (let e = n; e; e = e.parentElement) { const s = getComputedStyle(e); if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) < .05) return false } return true }
        for (const n of document.querySelectorAll('.ct-page *')) {
          const s = getComputedStyle(n)
          if (s.backdropFilter && s.backdropFilter !== 'none' || s.webkitBackdropFilter && s.webkitBackdropFilter !== 'none') out.blur.push(String(n.className).slice(0, 30))
          if (!visible(n) || n.closest('.ct-sr,.ct-review,.ct-counter__ghost,[aria-hidden="true"] .ct-route-drawing')) continue
          const own = [...n.childNodes].some(c => c.nodeType === 3 && c.textContent.trim())
          if (own && parseFloat(s.fontSize) < 11) out.small.push(`${String(n.className).slice(0, 30)} ${s.fontSize} "${n.textContent.trim().slice(0, 16)}"`)
          if (own && !n.closest('.ct-minibars,.ct-monster-bars,.ct-judge')) { const fg = parse(s.color), bg = bgOf(n); if (fg && bg && fg.a > .6) { const k = ratio(fg, bg); if (k < 4.5) out.contrast.push(`${String(n.className || n.tagName).slice(0, 26)} "${n.textContent.trim().slice(0, 12)}" ${k.toFixed(2)}`) } }
          if (n.matches('button,a[href],input,select,[role=option]') && !n.closest('.ct-review')) { const r = n.getBoundingClientRect(); const target = n.matches('input[type=checkbox]') ? n.closest('label').getBoundingClientRect() : n.matches('input[type=range]') ? n.getBoundingClientRect() : r; if ((target.width < 43.5 || target.height < 43.5) && !n.closest('.ct-minibars')) out.targets.push(`${String(n.className).slice(0, 30)} ${Math.round(target.width)}x${Math.round(target.height)}`) }
          if (n.matches('.ct-medals i,.ct-note__badges i,.ct-badge svg,.ct-icon-btn svg')) { const fg = parse(s.color), bg = bgOf(n); if (fg && bg) { const k = ratio(fg, bg); if (k < 3) out.icons.push(`${String(n.className?.baseVal ?? n.className).slice(0, 20)} ${k.toFixed(2)}`) } }
        }
        return out })
      check(E(`${vp} ${name}: text >= 11 px`), !r.small.length, r.small.slice(0, 5))
      check(E(`${vp} ${name}: targets >= 44x44`), !r.targets.length, r.targets.slice(0, 5))
      check(E(`${vp} ${name}: no backdrop-filter`), !r.blur.length, r.blur.slice(0, 5))
      check(E(`${vp} ${name}: text contrast >= 4.5:1`), !r.contrast.length, r.contrast.slice(0, 6))
      check(E(`${vp} ${name}: icons and medals >= 3:1`), !r.icons.length, r.icons.slice(0, 6))
    }
    await context.close()
  }
  // ---------------------------------------------------------------- motion: reduced motion is opacity-only, 250 ms or less, no beat glow
  if (suites.includes('motion')) {
    const { context, page } = await open(browser, { viewport: 'desktop', storage: seed(8), base, reduced: true })
    await page.addInitScript(() => { window.carrotAudioBus = { analyser: null, bpm: 120, beatPhase: () => (performance.now() / 500) % 1, level: () => .2 } })
    await page.reload(); await enter(page)
    await fixture(page, 'waveAir')
    const seen = []
    for (const step of [{ coins: 900 }, { health: 8 }, { judgement: { seq: 6, kind: 'flawless', wave: 3, value: 0 } }, { mergeUndo: 4 }, { coins: 400, health: 6 }]) {
      await page.evaluate(p => window.__qa.patch(p), step); await page.waitForTimeout(60)
      seen.push(...await page.evaluate(() => document.getAnimations().map(a => { const k = a.effect?.getKeyframes?.() || []; const props = [...new Set(k.flatMap(f => Object.keys(f).filter(x => !['offset', 'easing', 'composite', 'computedOffset'].includes(x))))]; return { props, ms: a.effect?.getComputedTiming?.().duration, name: a.animationName || a.id || '', target: String(a.effect?.target?.className || '').slice(0, 30) } })))
    }
    const bad = seen.filter(a => a.props.some(p => p !== 'opacity') || !(a.ms <= 250))
    check(E('reduced motion: only opacity animations of 250 ms or less'), !bad.length, bad.slice(0, 6))
    const beat = await page.evaluate(() => getComputedStyle(document.querySelector('.ct-hud__track')).getPropertyValue('--beat').trim())
    check(E(`reduced motion: no beat glow (--beat ${beat || '0'})`), !beat || Number(beat) === 0)
    await context.close()
  }
  // ---------------------------------------------------------------- commands from the HUD
  if (suites.includes('commands')) {
    for (const v2 of [true, false]) {
      const tag = v2 ? 'v2' : 'v1'
      const { context, page } = await open(browser, { viewport: 'desktop', storage: seed(8), base, v2 })
      await enter(page)
      // first-encounter card: pause, then unpause on dismiss, once, persisted
      await fixture(page, v2 ? 'bossUproot' : 'v1-bossUproot'); await clearCommands(page)
      await page.evaluate(() => { const s = window.__qa.state; s.boss.ability = 'bark'; s.boss.castRemaining = 1.2; s.speed = 1; s.paused = false; window.__qa.publish() })
      const card = await page.waitForSelector('.ct-encounter', { timeout: 3000 }).catch(() => null)
      check(E(`${tag} first-encounter card appears`), !!card)
      const pauseCmd = (await commands(page)).find(c => c.type === 'setPaused' || c.type === 'pause')
      check(E(`${tag} card sends ${v2 ? 'setPaused 1' : 'pause'}`), v2 ? pauseCmd?.type === 'setPaused' && pauseCmd.value === 1 : pauseCmd?.type === 'pause', pauseCmd)
      await clearCommands(page); await page.click('.ct-encounter .ct-cta'); await page.waitForTimeout(250)
      const resume = (await commands(page)).find(c => c.type === 'setPaused' || c.type === 'pause')
      check(E(`${tag} dismiss sends ${v2 ? 'setPaused 0' : 'pause (resume)'}`), v2 ? resume?.type === 'setPaused' && resume.value === 0 : resume?.type === 'pause', resume)
      await page.evaluate(() => { const s = window.__qa.state; s.paused = false; s.boss.ability = ''; s.boss.castRemaining = 0; window.__qa.publish() }); await page.waitForTimeout(150)
      await page.evaluate(() => { const s = window.__qa.state; s.boss.ability = 'bark'; s.boss.castRemaining = 1.2; window.__qa.publish() }); await page.waitForTimeout(500)
      check(E(`${tag} card shows once`), !(await page.$('.ct-encounter')))
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('cgs-carrot-records-v1') || 'null'))
      check(E(`${tag} seen ability persisted in cgs-carrot-records-v1`), stored?.seen?.abilities?.includes('bark'), stored?.seen)
      if (v2) {
        // SELL NOW: select the marked tower (selectionType 'tower'), then sell
        await fixture(page, 'bossUproot'); await clearCommands(page)
        await page.click('.ct-chip.is-action'); await page.waitForTimeout(500)
        const seq = (await commands(page)).filter(c => ['select', 'sell'].includes(c.type))
        check(E('uproot chip: select tower abilityTarget, then sell'), seq[0]?.type === 'select' && seq[0].selectionType === 'tower' && seq[0].id === 101 && seq[1]?.type === 'sell', seq)
      }
      // miniboss bar focuses with selectionType 'enemy'
      await fixture(page, v2 ? 'bossUproot' : 'v1-bossUproot'); await page.evaluate(() => { const s = window.__qa.state; s.boss.ability = ''; s.boss.castRemaining = 0; window.__qa.publish() }); await clearCommands(page)
      await page.click('.ct-minibar'); await page.waitForTimeout(200)
      const focus = (await commands(page)).find(c => c.type === 'select')
      check(E(`${tag} miniboss bar sends selectionType enemy`), focus?.selectionType === 'enemy' && focus.id === 81, focus)
      // Restart really restarts (after a confirm)
      await fixture(page, v2 ? 'waveAir' : 'v1-waveAir'); await clearCommands(page)
      await page.click('.ct-controls [aria-label="Settings"]'); await page.click('text=Restart stage'); await page.waitForSelector('.ct-confirm')
      await page.click('.ct-confirm .ct-cta'); await page.waitForTimeout(250)
      const load = (await commands(page)).find(c => c.type === 'load')
      check(E(`${tag} restart sends load with the current level`), load?.level === 6, load)
      await context.close()
    }
  }
  // ---------------------------------------------------------------- wave track: notes reach the line at their spawn time; one judgement at a time
  if (suites.includes('track')) {
    const { context, page } = await open(browser, { viewport: 'desktop', storage: seed(8), base })
    await enter(page)
    const plan = [['nibble', 6, 0, 2.0, 3], ['moth', 4, 1, 3.5, 2, { air: true }], ['shell', 5, 0, 5.0, 2.5, { armor: true }], ['crystal', 3, 1, 6.5, 1.5, { shield: true }]]
    await page.evaluate(plan => { const qa = window.__qa; const s = qa.base(6, { v: 2, runId: 9, phase: 'playing', wave: 3, elapsed: 60, waveElapsed: 0, incoming: plan.map(([kind, count, route, at, span, t = {}]) => ({ kind, count, route, at, span, air: !!t.air, armor: !!t.armor, shield: !!t.shield, heal: false, mini: false })) })
      window.__qaTrackT0 = performance.now(); qa.set(s)
      // sample head centres against the judgement line every frame and note the crossing times
      const cross = window.__qaCross = {}, prev = {}
      const tick = () => { const judge = document.querySelector('.ct-track__judge')?.getBoundingClientRect(); if (judge) for (const el of document.querySelectorAll('.ct-note')) { const h = el.querySelector('.ct-note__head').getBoundingClientRect(), x = h.left + h.width / 2 - (judge.left + judge.width / 2), k = el.dataset.kind, t = performance.now(); if (prev[k] && prev[k].x > 0 && x <= 0 && !cross[k]) cross[k] = prev[k].t + (t - prev[k].t) * prev[k].x / (prev[k].x - x) - window.__qaTrackT0; prev[k] = { x, t } } if (performance.now() - window.__qaTrackT0 < 8000) requestAnimationFrame(tick) }
      requestAnimationFrame(tick) }, plan)
    await page.waitForTimeout(8300)
    const cross = await page.evaluate(() => window.__qaCross)
    for (const [kind, , , at] of plan) { const t = cross[kind]; check(E(`track: ${kind} reaches the line at ${at}s (${t ? (t / 1000).toFixed(3) : 'never'}s)`), t && Math.abs(t - at * 1000) <= 100) }
    const lanes = await page.evaluate(() => [...document.querySelectorAll('.ct-track .ct-lane')].length)
    check(E(`track: one lane per route (${lanes})`), lanes === 2)
    await fixture(page, 'bossUproot')
    const badges = await page.evaluate(() => ({ boss: !!document.querySelector('.ct-note.is-boss .ct-note__badges .is-boss'), lanes: document.querySelectorAll('.ct-track .ct-lane').length }))
    await fixture(page, 'waveAir')
    const air = await page.evaluate(() => ({ air: !!document.querySelector('.ct-note.is-air .ct-note__badges .is-air'), shield: !!document.querySelector('.ct-note .ct-note__badges [title="Shielded"]'), count: [...document.querySelectorAll('.ct-note__label b')].map(b => b.textContent) }))
    check(E('track: AIR, SHIELD and BOSS badges and counts render'), badges.boss && air.air && air.shield && air.count.includes('×8'), { badges, air })
    for (const [i, kind] of ['flawless', 'leak', 'phaseBreak'].entries()) await page.evaluate(([i, kind]) => window.__qa.patch({ judgement: { seq: 20 + i, kind, wave: 3, value: 2 } }), [i, kind])
    await page.waitForTimeout(300)
    const words = await page.evaluate(() => [...document.querySelectorAll('.ct-judge__word')].map(w => ({ text: w.textContent, opacity: getComputedStyle(w).opacity })))
    check(E(`judgement: one word at a time (${words.map(w => w.text).join('|')})`), words.length === 1 && /phase break/i.test(words[0].text), words)
    await context.close()
  }
  // ---------------------------------------------------------------- lobby: image bytes and no UI .ogg requests
  if (suites.includes('lobby')) {
    const context = await browser.newContext({ viewport: viewports.desktop }), page = await context.newPage()
    let images = 0; const oggs = [], list = []
    page.on('response', async r => { const u = r.url(); if (/ui-.*\.ogg/.test(u)) oggs.push(u); if (r.request().resourceType() === 'image') { try { const b = await r.body(); images += b.length; list.push([u.split('/').pop(), b.length]) } catch { /* redirect */ } } })
    await page.goto(base + '/minigames/carrotDefense/', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500)
    data.lobbyImages = list
    check(E(`lobby: images ${(images / 1048576).toFixed(2)} MB <= 4 MB`), images <= 4 * 1048576, list)
    check(E('lobby: no ui-*.ogg request'), !oggs.length, oggs)
    await context.close()
  }
  // ---------------------------------------------------------------- parity with the old UI's features
  if (suites.includes('parity')) {
    const { context, page } = await open(browser, { viewport: 'desktop', storage: seed(8), base })
    const has = async (sel, name) => check(E(`parity: ${name}`), !!(await page.$(sel)))
    await page.waitForSelector('.ct-lobby .ct-cta--hero:not([disabled])')
    await page.click('[aria-label="How to play"]'); await has('.ct-help .ct-help-steps article', 'help steps'); await has('.ct-help details summary', 'credits'); await page.keyboard.press('Escape')
    await page.click('text=Field guide'); await page.waitForSelector('.ct-collection'); const towers = await page.$$eval('.ct-guide-grid article', a => a.length); check(E(`parity: field guide lists 20 defenses (${towers})`), towers === 20)
    await page.click('.ct-segment >> text=Creatures'); const creatures = await page.$$eval('.ct-guide-grid article', a => a.length); check(E(`parity: field guide lists 27 creatures (${creatures})`), creatures === 27); await page.keyboard.press('Escape')
    await page.click('text=Boss challenges'); await page.waitForSelector('.ct-select'); const ch = await page.$$eval('.ct-trackrow', a => a.length); check(E(`parity: 5 boss challenges listed (${ch})`), ch === 5); await page.keyboard.press('Escape')
    await page.click('text=Stage select'); await page.waitForSelector('.ct-select'); await page.click('.ct-chapter >> text=Harvest Road'); const road = await page.$$eval('.ct-trackrow', a => a.length); check(E(`parity: harvest road lists 12 stages (${road})`), road === 12); await page.keyboard.press('Escape')
    await enter(page)
    await fixture(page, 'tower'); await has('[aria-label^="Sell for"]', 'sell with refund'); await has('.ct-tiers', 'tier strip with Super cell'); await has('.ct-stats', 'power and reach')
    await page.evaluate(() => { window.__qa.patch({ mergeUndo: 3.9, selection: { ...window.__qa.state.selection, tier: 5, superName: 'Harvest Cannon' } }) }); await page.waitForTimeout(300)
    await has('.ct-forge', 'Super forged toast with undo'); await clearCommands(page); await page.click('.ct-forge button'); check(E('parity: undo sends mergeUndo'), (await commands(page)).some(c => c.type === 'mergeUndo'))
    await fixture(page, 'waveAir'); await clearCommands(page); await page.click('[aria-label="Mute sound"]'); check(E('parity: mute sends mute'), (await commands(page)).some(c => c.type === 'mute' && c.value === 1))
    await page.evaluate(() => document.activeElement?.blur()); await clearCommands(page); await page.keyboard.press('Space'); check(E('parity: Space pauses'), (await commands(page)).some(c => c.type === 'pause'))
    await page.evaluate(() => window.__qa.patch({ paused: true })); await page.waitForTimeout(250); await has('.ct-paused', 'paused card'); await page.evaluate(() => window.__qa.patch({ paused: false }))
    await page.evaluate(() => { const qa = window.__qa; qa.set(qa.base(29, { phase: 'playing', wave: 1, elapsed: 90, reinforcementTier: 2, reinforcementIn: 14, boss: { id: 3, kind: 'asuna', name: 'Asuna', hp: 30000, maxHp: 38000, shield: 0, maxShield: 0, phase: 1, ability: '', castRemaining: 0, stage: 1 } })) }); await page.waitForTimeout(300)
    await has('.ct-reinforcements', 'Asuna reinforcements panel'); await page.screenshot({ path: join(outDir, `qa-${engine}-asuna.png`) })
    await page.evaluate(() => window.__qa.patch({ blind: 2.5, blindAlpha: .985, blindTint: 0 })); await page.waitForTimeout(250)
    const dim = await page.evaluate(() => Number(getComputedStyle(document.querySelector('.ct-hud')).opacity)); check(E(`parity: blindness dims the HUD to >= .7 (${dim})`), dim >= .7 && dim < 1)
    await context.close()
  }
  // ---------------------------------------------------------------- perf: HUD scripting per snapshot (and per frame) over 60 s of replay
  if (suites.includes('perf')) for (const throttle of engine === 'chromium' ? [1, 4] : [1]) {
    const { context, page } = await open(browser, { viewport: 'desktop', storage: seed(8), base })
    await enter(page)
    if (throttle > 1) { const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle }) }
    await fixture(page, 'bossUproot')
    const seconds = Number(process.env.PERF_SECONDS || 60)
    const r = await page.evaluate(async seconds => {
      const qa = window.__qa, base = qa.state, times = [], frames = []
      // 50 moving monsters and a ticking boss, so every publish changes bars, coins, the boss bar and the track
      base.monsters = Array.from({ length: 50 }, (_, i) => ({ id: 200 + i, kind: 'nibble', hp: 30 + i, maxHp: 80, shield: i % 5 ? 0 : 10, maxShield: 20, x: .1 + (i % 10) * .08, y: .3 + Math.floor(i / 10) * .1, visible: true }))
      const raf = window.requestAnimationFrame.bind(window)
      window.requestAnimationFrame = cb => raf(t => { const a = performance.now(); cb(t); frames.push(performance.now() - a) })
      qa.clockPaused = false
      const publish = qa.publish
      qa.publish = () => { const s = qa.state; if (!s) return; for (const m of s.monsters) { m.x = (m.x + .002) % .95; m.hp = Math.max(1, m.hp - .3) } s.coins += 3; if (s.boss) { s.boss.hp = Math.max(100, s.boss.hp - 7); if (s.boss.castRemaining <= 0) { s.boss.ability = 'uproot'; s.boss.castRemaining = 2.5 } } const t0 = performance.now(); publish(); queueMicrotask(() => times.push(performance.now() - t0)) }
      await new Promise(r => setTimeout(r, seconds * 1000))
      qa.publish = publish; window.requestAnimationFrame = raf
      const p = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))] }
      return { publishes: times.length, p50: p(times, .5), p95: p(times, .95), max: Math.max(...times), frameP95: p(frames, .95), frameCalls: frames.length }
    }, seconds)
    data[`perf-${engine}-x${throttle}`] = r
    const limit = throttle > 1 ? 6 : 2
    check(E(`perf x${throttle}: snapshot p95 ${r.p95.toFixed(2)} ms <= ${limit} ms (${r.publishes} publishes, rAF callbacks p95 ${r.frameP95.toFixed(2)} ms)`), r.p95 <= limit, r)
    await context.close()
  }
  await browser.close()
}
writeFileSync(join(outDir, 'qa-report.json'), JSON.stringify({ base, engines, suites, results, data }, null, 1))
process.exitCode = report(results) ? 1 : 0
