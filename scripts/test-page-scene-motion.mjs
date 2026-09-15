import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import {
  base, output, path, selectedIds, runMatrix, createHarness, sceneReady,
  artwork, imageDimensions, assertImageResource,
  probe, frame, pixels, difference, assertRendered, playback, assertNoFrames, setHidden,
} from './test-subpages.mjs'

// DEV only: deterministic image sampling uses renderAt/resume/snapshot.
// Exhaustive crop coverage supplies pointer extremes through renderAt; actual
// interaction/damping tests separately use real Playwright mouse/touch input.
const PERIOD = 20
const phoneIds = new Set(['ml-process', 'join', 'events'])
const snap = page => page.evaluate(() => window.__pageScene.snapshot())
const manual = (page, time, x = 0, y = 0) => page.evaluate(({ time, x, y }) => window.__pageScene.renderAt(time, x, y), { time, x, y })
const resume = page => page.evaluate(() => window.__pageScene.resume())
const resumeFrames = async page => {
  const before = await snap(page)
  await resume(page)
  await page.waitForFunction(frames => window.__pageScene.snapshot().frames > frames + 2, before.frames)
}
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
function bounded(s, label) {
  for (const key of ['x', 'y', 'tx', 'ty', 'time', 'frames']) assert.ok(Number.isFinite(s[key]), `${label}: finite ${key}`)
  for (const key of ['x', 'y', 'tx', 'ty']) assert.ok(Math.abs(s[key]) <= 1.00001, `${label}: bounded ${key}=${s[key]}`)
}
function budget(s, label) {
  assert.ok(s.stats, `${label}: renderer stats available`)
  assert.equal(s.stats.period, PERIOD, `${label}: every image cycle lasts 20 seconds`)
  assert.equal(new URL(s.stats.imageUrl, base).pathname, artwork(label), `${label}: stats identify the master`)
  assert.deepEqual([s.stats.imageWidth, s.stats.imageHeight], imageDimensions(label), `${label}: full master dimensions`)
  assert.equal(s.stats.drawCalls, 1, `${label}: one image draw per frame`)
  assert.equal(s.stats.textures, 1, `${label}: one photograph texture`)
  assert.equal(s.stats.disposed, false, `${label}: active renderer is alive`)
  assert.ok(s.stats.width > 50 && s.stats.height > 50, `${label}: valid backing size`)
  assert.equal(s.stats.pixels, s.stats.width * s.stats.height, `${label}: accurate pixel count`)
  assert.ok(s.stats.pixels <= 1_600_000 && s.stats.pixelRatio > 0 && s.stats.pixelRatio <= 1.75, `${label}: bounded rendering resolution`)
}
function coverage(gl, label) {
  assert.ok(gl?.crop?.length === 4 && gl.image, `${label}: actual crop and source available`)
  const [sx, sy, cx, cy] = gl.crop
  assert.ok(gl.crop.every(Number.isFinite) && sx > 0 && sy > 0, `${label}: finite positive crop`)
  const margins = [cx - sx / 2, 1 - cx - sx / 2, cy - sy / 2, 1 - cy - sy / 2]
  // Require a source-texel guard, not merely CLAMP_TO_EDGE hiding an exposed
  // edge by smearing the last row or column of the photograph.
  const texels = margins.map((margin, i) => margin * (i < 2 ? gl.image.width : gl.image.height))
  assert.ok(texels.every(value => value >= 1 - 1e-4), `${label}: no exposed or clamped image edge (${texels.join(', ')} source texels)`)
  assert.equal(gl.error, 0, `${label}: WebGL NO_ERROR`)
  assert.equal(gl.lost, false, `${label}: context stays alive`)
  return Math.min(...texels)
}
// Capture within the same JS task as renderAt, before the browser clears a
// non-preserved WebGL buffer. A small 2D copy makes dense cycle sampling cheap;
// separate native-resolution screenshots check the exact seam and pointer view.
async function sample(page, time, { x = 0, y = 0, native = false } = {}) {
  const result = await page.evaluate(({ time, x, y, native }) => {
    window.__pageScene.renderAt(time, x, y)
    const source = document.querySelector('.page-scene__canvas')
    const copy = document.createElement('canvas'), scale = Math.min(1, 192 / Math.max(source.width, source.height))
    copy.width = Math.max(1, Math.round(source.width * scale)); copy.height = Math.max(1, Math.round(source.height * scale))
    const ctx = copy.getContext('2d')
    ctx.drawImage(source, 0, 0, copy.width, copy.height)
    return { width: copy.width, height: copy.height, data: Array.from(ctx.getImageData(0, 0, copy.width, copy.height).data),
      gl: window.__pageSceneTest(), snapshot: window.__pageScene.snapshot(), native: native ? source.toDataURL('image/png').split(',')[1] : null }
  }, { time, x, y, native })
  for (let i = 3; i < result.data.length; i += 4) assert.equal(result.data[i], 255, 'shader covers every canvas pixel, including corners')
  result.edgeGuard = coverage(result.gl, `t=${time}, pointer=${x},${y}`)
  return result
}
async function continuousCycle(page, id, testCase) {
  const period = PERIOD, steps = 48, samples = [], deltas = []
  const first = await sample(page, 0, { native: true })
  const original = Buffer.from(first.native, 'base64')
  assertRendered(original)
  await writeFile(`${output}/${testCase}-${id}-motion-0.png`, original)
  samples.push(first)
  let maxCalls = 0
  for (let i = 1; i <= steps; i++) {
    const next = await sample(page, period * i / steps, { native: i === steps / 2 || i === steps }), d = difference(samples.at(-1), next)
    assert.ok(d.mean > .002, `${id} cycle ${i - 1}→${i}: photograph must keep moving, no discrete holds (${d.mean})`)
    deltas.push(d.mean); samples.push(next)
    budget(next.snapshot, id); maxCalls = Math.max(maxCalls, next.snapshot.stats.drawCalls)
    assert.equal(next.gl.draws - samples.at(-2).gl.draws, 1, 'each deterministic image frame submits exactly one actual GL draw')
    if (i === steps / 2) await writeFile(`${output}/${testCase}-${id}-motion-half.png`, Buffer.from(next.native, 'base64'))
  }
  const exact = difference(first, samples.at(-1))
  assert.ok(exact.mean <= .01 && exact.changed <= .0005, `${id}: full cycle returns to its first pixels ${JSON.stringify(exact)}`)
  const fullSeam = difference(pixels(original), pixels(Buffer.from(samples.at(-1).native, 'base64')))
  // Native backing pixels are read in the same JS task as draw, avoiding a
  // cleared non-preserved buffer or unrelated compositor/rounded-clip noise.
  assert.ok(fullSeam.mean <= .05 && fullSeam.changed <= .001, `${id}: native-resolution seam ${JSON.stringify(fullSeam)}`)
  // Equal tiny time steps on BOTH sides test continuity through the wrap, not
  // just equality of two endpoints that might conceal a discontinuous reset.
  const epsilon = period / 6000, times = [period - 2 * epsilon, period - epsilon, period, period + epsilon, period + 2 * epsilon]
  const seam = []
  for (const time of times) seam.push(pixels(Buffer.from((await sample(page, time, { native: true })).native, 'base64')))
  const seams = seam.slice(1).map((value, i) => difference(seam[i], value))
  const local = Math.max(seams[0].mean, seams[3].mean)
  for (const d of seams.slice(1, 3)) {
    assert.ok(d.mean <= local * 3 + .03 && d.mean <= .35 && d.changed <= .02, `${id}: seam must be as continuous as neighbouring frames ${JSON.stringify({ seams, local })}`)
  }
  // A late/early/late seek rejects history-dependent transforms. Repeat wraps
  // after warmup to catch accumulated objects or per-frame GPU allocations.
  const late = await sample(page, period * .73)
  await sample(page, period * .13)
  assert.ok(difference(late, await sample(page, period * .73)).mean <= .01, `${id}: reverse seek is deterministic`)
  const warm = await probe(page), warmStats = (await snap(page)).stats
  const repeat = await sample(page, period * .37)
  for (let cycle = 1; cycle <= 6; cycle++) {
    const repeated = await sample(page, period * (cycle + .37))
    assert.ok(difference(repeat, repeated).mean <= .02, `${id}: cycle ${cycle} repeats without transform drift`)
    const stats = (await snap(page)).stats
    assert.equal(stats.textures, warmStats.textures, 'no extra textures after repeated wraps')
    assert.equal(stats.drawCalls, 1, 'repeated wraps keep one draw per frame')
  }
  const after = await probe(page)
  assert.deepEqual(after.created, warm.created, `${id}: no new GPU objects across repeat cycles`)
  assert.deepEqual(after.live, warm.live, `${id}: no accumulated GPU objects across repeat cycles`)
  assert.equal(after.uploads, warm.uploads, `${id}: no repeated photograph uploads`)
  assert.equal(after.canvases, 1)
  // Cross all four exact pointer extremes with the entire cycle. These are
  // shader coverage probes, distinct from real-pointer hit testing below.
  let minEdgeGuard = Math.min(...samples.map(value => value.edgeGuard))
  for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    for (let i = 0; i <= steps; i++) {
      const extreme = await sample(page, period * i / steps, { x, y })
      minEdgeGuard = Math.min(minEdgeGuard, extreme.edgeGuard)
    }
  }
  await manual(page, 0)
  return { period, samples: steps + 1, coverageSamples: (steps + 1) * 5, minEdgeGuardTexels: minEdgeGuard, minStepPixelDelta: Math.min(...deltas), maxStepPixelDelta: Math.max(...deltas), exactSeam: fullSeam, seamDeltas: seams, maxCalls, imageUrl: warmStats.imageUrl, imageDimensions: [warmStats.imageWidth, warmStats.imageHeight], textures: warmStats.textures, gpuObjects: warm.live }
}
async function pointerSweep(page, id, testCase) {
  const fine = await page.evaluate(() => matchMedia('(hover:hover) and (pointer:fine)').matches)
  const stage = page.locator('.page-scene__window')
  await stage.scrollIntoViewIfNeeded()
  let box = await stage.boundingBox()
  const viewport = page.viewportSize()
  assert.ok(box && box.height > 0 && box.width > 0 && box.width <= viewport.width, 'pointer surface has valid in-page bounds')
  const point = (u, v) => ({ x: box.x + box.width * u, y: box.y + box.height * v })
  const move = async (u, v, steps = 1) => {
    box = await stage.boundingBox()
    const top = await page.evaluate(() => Math.max(0, document.querySelector('.sp-bar')?.getBoundingClientRect().bottom || 0) + 4)
    const target = point(u, v)
    if (target.y < top || target.y > viewport.height - 8) {
      await page.evaluate(delta => scrollBy(0, delta), target.y - Math.max(top, Math.min(viewport.height - 8, target.y)))
      await page.waitForTimeout(60)
      box = await stage.boundingBox()
    }
    const p = point(u, v); await page.mouse.move(p.x, p.y, { steps })
  }
  await page.mouse.move(1, 1)
  await manual(page, 3)
  const neutral = await frame(page)
  await resumeFrames(page)
  const start = await snap(page)
  if (!fine) {
    // Emulated phone has touch/coarse media, so real touch and mouse input must
    // leave the camera neutral while autonomous image motion continues.
    await move(.92, .92, 8)
    const p = point(.5, .5); await page.touchscreen.tap(p.x, p.y)
    await page.waitForTimeout(180)
    const after = await snap(page)
    assert.deepEqual([after.x, after.y, after.tx, after.ty], [0, 0, 0, 0], `${id}: coarse input never enables hover motion`)
    assert.equal(after.pointer, false)
    assert.ok(after.frames > start.frames && after.time > start.time, 'phone still autoplays')
    return { mode: 'coarse', touchAndMouseIgnored: true }
  }
  // Corners stay within curved clip boundaries (join/contact use arches).
  // Top corners on those shapes are outside the interactive painted surface.
  const curved = ['join', 'contact'].includes(id)
  const corners = curved ? [[.22, .22], [.78, .22], [.92, .92], [.08, .92]] : [[.08, .08], [.92, .08], [.92, .92], [.08, .92]]
  if (curved) {
    for (const u of [.01, .99]) {
      await move(u, .01)
      assert.equal((await snap(page)).pointer, false, 'clipped top corner does not capture the pointer')
    }
  }
  const traces = []
  for (const [index, [u, v]] of corners.entries()) {
    await move(u, v, 8)
    await page.waitForFunction(({ x, y }) => { const s = window.__pageScene.snapshot(); return Math.abs(s.x - x) < .055 && Math.abs(s.y - y) < .055 }, { x: u * 2 - 1, y: v * 2 - 1 })
    const s = await snap(page); bounded(s, `corner ${index}`)
    coverage(await probe(page), `${id}: real pointer corner ${index}`)
    assert.equal(s.pointer, true)
    assert.ok(Math.abs(s.tx - (u * 2 - 1)) < .015 && Math.abs(s.ty - (v * 2 - 1)) < .015, `${id}: corner ${index} actual mouse target`)
    traces.push({ corner: index, ...s })
  }
  // Both diagonals, sampled throughout, establish correct target mapping and
  // bounded camera motion at intermediate coordinates.
  for (const [a, b] of [[corners[0], corners[2]], [corners[1], corners[3]]]) {
    await move(...a)
    for (let i = 1; i <= 8; i++) {
      const u = a[0] + (b[0] - a[0]) * i / 8, v = a[1] + (b[1] - a[1]) * i / 8
      await move(u, v)
      const s = await snap(page); bounded(s, 'diagonal')
      assert.ok(Math.abs(s.tx - (u * 2 - 1)) < .015 && Math.abs(s.ty - (v * 2 - 1)) < .015, `${id}: diagonal target follows the actual pointer`)
    }
  }
  // Capture rendered pixels at an identical scene time with the actual
  // pointer response held via the public Pause button (renderAt never supplies
  // a test pointer). Compare later with a neutral deterministic pose at time t.
  await move(.9, .9)
  await page.waitForFunction(() => { const s = window.__pageScene.snapshot(); return s.x > .73 && s.y > .73 })
  await page.getByRole('button', { name: 'Pause scene animation', exact: true }).focus()
  await page.keyboard.press('Enter')
  await playback(page, 'paused')
  const frozen = await snap(page), hovered = await frame(page)
  assert.ok(Math.hypot(frozen.x, frozen.y) > .6, 'real pointer changed the camera before pause')
  await manual(page, frozen.time)
  const neutralAtSameTime = await frame(page), response = difference(pixels(hovered), pixels(neutralAtSameTime))
  assert.ok(response.mean > .1 && response.changed > .002, `${id}: real pointer visibly shifts the image crop ${JSON.stringify(response)}`)
  await writeFile(`${output}/${testCase}-${id}-pointer.png`, hovered)
  // Start fresh at neutral then exercise twelve fast alternating reversals.
  await page.getByRole('button', { name: 'Resume scene animation', exact: true }).click()
  await resumeFrames(page)
  await move(.9, .9)
  await page.waitForFunction(() => window.__pageScene.snapshot().x > .72)
  let previous = await snap(page), retargeted = false
  for (let i = 0; i < 12; i++) {
    const u = i % 2 ? .9 : .1, v = i % 2 ? .9 : .3
    await move(u, v)
    const s = await snap(page); bounded(s, `reversal ${i}`)
    coverage(await probe(page), `${id}: rapid reversal ${i}`)
    assert.ok(Math.abs(s.tx - (u * 2 - 1)) < .015, 'rapid reversals retarget the same camera')
    // Damping limits displacement by actual elapsed scene time, so this stays
    // meaningful under slow CI and catches a pointer handler that teleports.
    const elapsed = Math.max(0, s.time - previous.time), limit = Math.sqrt(8) * (1 - Math.exp(-9 * elapsed)) + .025
    assert.ok(distance(s, previous) <= limit, `${id}: no teleport on reversal (${distance(s, previous)} > ${limit})`)
    if (Math.abs(s.x - s.tx) > .2) retargeted = true
    previous = s
  }
  assert.equal(retargeted, true, 'fast reversals retain damping instead of snapping to targets')
  await move(.9, .9)
  await page.waitForFunction(() => window.__pageScene.snapshot().x > .72)
  const beforeLeave = await snap(page)
  await page.mouse.move(1, 1)
  const leave = await snap(page)
  assert.equal(leave.pointer, false); assert.deepEqual([leave.tx, leave.ty], [0, 0], 'leave resets targets')
  assert.ok(distance(leave, beforeLeave) <= Math.sqrt(8) * (1 - Math.exp(-9 * Math.max(0, leave.time - beforeLeave.time))) + .025, 'leave does not teleport')
  await page.waitForFunction(() => { const s = window.__pageScene.snapshot(); return Math.abs(s.x) < .01 && Math.abs(s.y) < .01 })
  const afterLeave = await snap(page)
  assert.ok(afterLeave.frames > start.frames && afterLeave.time > start.time, 'autoplay continues through all mouse interactions')
  assert.ok(!neutral.equals(await frame(page)), 'image motion continues after mouse leave')
  // Scroll under a stationary pointer: the new target must be projected from
  // the new bounds even if the browser does not emit another pointermove.
  await move(.5, .5)
  const stationary = point(.5, .5)
  await page.evaluate(() => scrollBy(0, 35))
  await page.waitForTimeout(100)
  box = await stage.boundingBox()
  const projected = { x: (stationary.x - box.x) / box.width * 2 - 1, y: (stationary.y - box.y) / box.height * 2 - 1 }
  const scrolled = await snap(page)
  assert.ok(Math.abs(scrolled.tx - projected.x) < .025 && Math.abs(scrolled.ty - projected.y) < .025, 'scroll reprojects stationary pointer into current canvas bounds')
  await page.mouse.move(1, 1)
  return { mode: 'fine', corners: corners.length, diagonals: 2, reversals: 12, scrollReprojection: true, pointerPixelDelta: response, leave: { x: afterLeave.x, y: afterLeave.y } }
}
async function suspension(page, width, height) {
  const scene = page.locator('.page-scene')
  // In every suspended mode pointer input also must not schedule paint work.
  const stopped = async (label, input = true) => {
    await assertNoFrames(page, label)
    const before = await snap(page)
    if (input) { await page.mouse.move(5, 5); await page.mouse.move(width / 2, height / 2) }
    await page.waitForTimeout(180)
    const after = await snap(page)
    assert.equal(after.frames, before.frames, `${label}: zero component frames after input`)
    assert.equal(after.time, before.time, `${label}: frozen scene clock`)
    assert.deepEqual([after.x, after.y], [before.x, before.y], `${label}: frozen camera`)
    await assertNoFrames(page, `${label} after input`)
  }
  await scene.scrollIntoViewIfNeeded()
  await page.getByRole('button', { name: 'Pause scene animation', exact: true }).click()
  await playback(page, 'paused'); await stopped('paused')
  await page.getByRole('button', { name: 'Resume scene animation', exact: true }).click()
  await playback(page, 'playing'); await resumeFrames(page)
  await page.setViewportSize({ width, height: 300 })
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
  await playback(page, 'offscreen'); await stopped('offscreen')
  await page.setViewportSize({ width, height })
  await scene.scrollIntoViewIfNeeded()
  await playback(page, 'playing'); await resumeFrames(page)
  await setHidden(page, true)
  await playback(page, 'hidden'); await stopped('hidden')
  await setHidden(page, false)
  await playback(page, 'playing'); await resumeFrames(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await playback(page, 'reduced'); await stopped('reduced motion')
  const reduced = await snap(page)
  assert.deepEqual([reduced.time, reduced.x, reduced.y, reduced.tx, reduced.ty], [0, 0, 0, 0, 0], 'RM resets to a neutral static pose')
  assert.equal(await page.getByRole('button', { name: 'Scene animation is static' }).isDisabled(), true)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await playback(page, 'playing'); await resumeFrames(page)
}
await runMatrix('page-scene-motion', async (browser, { testCase, width, height, device }) => {
  const h = await createHarness(browser, width, height), { page } = h, results = [], failures = []
  const routes = selectedIds().filter(id => device !== 'phone' || phoneIds.has(id))
  assert.ok(routes.length, `${testCase}: filter must select one of the agreed motion routes`)
  for (const id of routes) {
    try {
      let result
      await h.clean(`${testCase}/${id}/motion`, async () => {
        await page.goto(base + path(id))
        await sceneReady(page, id)
        await assertImageResource(page, id, h.requests)
        assert.equal(await page.evaluate(() => typeof window.__pageScene?.renderAt === 'function' && typeof window.__pageScene?.resume === 'function' && typeof window.__pageScene?.snapshot === 'function'), true, 'test-page-scene-motion requires a DEV server exposing __pageScene (use test-subpages for production)')
        // Exercise actual autoplay first: static deterministic screenshots alone
        // cannot establish that the animation is running between sampled poses.
        await page.mouse.move(1, 1)
        const first = await snap(page), image = await frame(page)
        await page.waitForTimeout(220)
        const second = await snap(page)
        assert.ok(second.frames > first.frames + 1 && second.time > first.time, 'autoplay advances its clock and paints continuously')
        assert.ok(!image.equals(await frame(page)), 'autoplay visibly changes the photograph')
        const cycle = await continuousCycle(page, id, testCase)
        const warmed = await probe(page)
        const pointer = await pointerSweep(page, id, testCase)
        await suspension(page, width, height)
        const after = await probe(page), stats = await snap(page)
        budget(stats, id)
        assert.deepEqual(after.live, warmed.live, `${id}: no GPU objects accumulated after pointer/playback lifecycle`)
        assert.deepEqual(after.created, warmed.created, `${id}: no GPU objects allocated after pointer/playback lifecycle`)
        assert.equal(after.uploads, warmed.uploads, `${id}: image texture is reused through pointer/playback lifecycle`)
        assert.equal(after.canvases, 1)
        await h.health()
        result = { id, cycle, pointer, suspension: ['paused', 'offscreen', 'hidden (visibility handler)', 'reduced motion'], stats: stats.stats }
      })
      results.push(result)
      console.log('PASS', testCase, id, JSON.stringify({ period: result.cycle.period, calls: result.cycle.maxCalls, image: result.cycle.imageUrl, edgeGuard: result.cycle.minEdgeGuardTexels, seam: result.cycle.exactSeam, pointer: result.pointer }))
    } catch (error) {
      // Record every route failure without rerunning the failed assertion.
      failures.push(error); results.push({ id, failed: error.message })
      console.error('FAIL ROUTE', testCase, id, error.stack)
      await page.screenshot({ path: `${output}/${testCase}-${id}-FAIL.png` }).catch(() => {})
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await page.setViewportSize({ width, height })
    }
  }
  await writeFile(`${output}/${testCase}-motion-details.json`, JSON.stringify(results, null, 2))
  await h.context.close()
  if (failures.length) throw new AggregateError(failures, failures.map(e => e.message).join('\n'))
  return { routes: results.length, details: `${output}/${testCase}-motion-details.json` }
})
