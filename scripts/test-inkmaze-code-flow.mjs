#!/usr/bin/env node
/**
 * Ink Maze's coding level end to end, every language, through the screen: the
 * real toolchains in Chromium and WebKit, on a desktop window and on a
 * 390 x 844 phone.
 *
 *   node scripts/test-inkmaze-code-flow.mjs                    everything (about half an hour)
 *   node scripts/test-inkmaze-code-flow.mjs webkit phone java  one browser, one window size, some languages
 *   CGS_TEST_URL=http://localhost:5190 node scripts/test-inkmaze-code-flow.mjs
 *   INK_CLANG_DIR=/path/to/node_modules/@yowasp/clang node ...  serve the C/C++ toolchain from a local
 *       copy (its jsDelivr URL is kept, so the sandbox's CSP still applies); otherwise it comes from the CDN
 *
 * Without CGS_TEST_URL it starts a Vite dev server of this checkout. Needs
 * Playwright (CGS_PLAYWRIGHT_MODULE, see scripts/inkmaze-code-browser.mjs) and
 * the network for Pyodide (and for C/C++ without INK_CLANG_DIR). Not part of
 * `npm test`. scripts/test-inkmaze-code-page.mjs covers the screen itself with
 * the echo test runtime; the runtimes' own suites (scripts/inkmaze-code/)
 * cover their safety in depth, CPU after a runaway included.
 *
 * In each browser and window size:
 *  - a board level fetches nothing of the coding level; opening level 26
 *    fetches Java's toolchain only (the default), and picking a language
 *    fetches that one's only: nothing from a CDN except Pyodide for Python and
 *    Clang for C and C++;
 *  - per language: the starter code compiles and returns "" (Wrong Answer:
 *    "returned no moves", the ball does not move); the reference solution
 *    (scripts/inkmaze-code/solutions) is Accepted on every board of a
 *    submission, the first time (cold) and again (warm), and so is the naive
 *    search with only the ink pruning, while the same search without it passes
 *    Run but runs out of time on Submit; a wrong answer gets the judge's verdict
 *    and the ball rolls exactly the moves it was told (one settled roll per
 *    judged move, the HUD agrees); each hostile program (scripts/inkmaze-code/
 *    flow-cases.mjs) shows its error and "The ball did not move", and on the
 *    desktop the browser's CPU is back to idle 0.3-1.8 s after a runaway
 *    (loop, recursion, output flood) hit its limit; Stop ends a
 *    runaway run at once; the limits each run got are the ones the problem
 *    states;
 *  - switching languages keeps each language's code, and so does a reload;
 *  - no console errors and no page errors.
 * On the phone it runs the starter, the reference, a wrong answer, a compile
 * error, a runaway and Stop per language. It prints the timings it saw (the
 * calibration numbers in problem.ts come from runs like these).
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { cpuMeter, devServer, launch, pause } from './inkmaze-code-browser.mjs'
import { EXPECT, LINE, program, solution } from './inkmaze-code/flow-cases.mjs'
import { LEVELS } from '../src/minigames/inkmaze/levels.ts'
import { minInk } from '../src/minigames/inkmaze/solver.ts'
import { applyMove, initialState, legalMoves, status } from '../src/minigames/inkmaze/engine.ts'
import { COMPILE_LIMIT_MS, STARTER_CODE, judge, letterOf, randomBoard, submissionTests, timeLimitFor } from '../src/minigames/inkmaze/code/problem.ts'
import { LANGUAGES, LANGUAGE_INFO, RUNTIME_INFO, STATUS_TITLES } from '../src/minigames/inkmaze/code/contract.ts'

const args = process.argv.slice(2)
const ENGINES = args.filter((a) => a === 'chromium' || a === 'webkit')
const VIEWS = args.filter((a) => a === 'desktop' || a === 'phone')
const ONLY = args.filter((a) => LANGUAGES.includes(a))
const engines = ENGINES.length ? ENGINES : ['chromium', 'webkit']
const views = VIEWS.length ? VIEWS : ['desktop', 'phone']
const languages = ONLY.length ? ONLY : [...LANGUAGES]

const CODE_NUMBER = LEVELS.length + 1
const SEED = 4242
const map = randomBoard(SEED)
const tests = submissionTests(map)
const letters = (moves) => moves.map(letterOf).join('')
const CDN_HOSTS = /^https:\/\/cdn\.jsdelivr\.net\//
const CLANG_CDN = RUNTIME_INFO.clang.cdn[0]
const LOCAL_CLANG = process.env.INK_CLANG_DIR && existsSync(`${process.env.INK_CLANG_DIR}/gen/bundle.js`) ? process.env.INK_CLANG_DIR.replace(/\/?$/, '/') : null

/** A wrong answer that rolls a while and then runs out of ink with blocks left. */
function losingLine(board) {
  let state = initialState(board)
  const line = []
  for (let turn = 0; status(state) === 'playing'; turn++) {
    const options = legalMoves(state).map((d) => [d, applyMove(state, d).state]).filter(([, after]) => status(after) !== 'won')
    assert.ok(options.length)
    const [d, after] = options[turn % options.length]
    line.push(d)
    state = after
  }
  return letters(line)
}
const wrong = losingLine(map)
const wrongVerdict = judge(map.grid, map.ink, wrong)
assert.equal(wrongVerdict.kind, 'out_of_ink', 'the wrong answer runs out of ink')
assert.ok(wrongVerdict.steps.length >= 2, 'the wrong answer rolls more than once')
assert.ok(minInk(map), 'the map can be cleared')

const MIME = { '.js': 'text/javascript', '.wasm': 'application/wasm', '.tar': 'application/x-tar', '.json': 'application/json' }

/** phone user agents (as Playwright's device list has them), so the page and its workers know they are on a phone */
const PHONE_UA = {
  webkit: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  chromium: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36',
}

async function openContext(browser, view) {
  const context = await browser.newContext(view === 'phone'
    ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: PHONE_UA[browser.browserType().name()] }
    : { viewport: { width: 1440, height: 900 } })
  if (LOCAL_CLANG) {
    await context.route(`${CLANG_CDN}**`, (route) => {
      const rel = new URL(route.request().url()).pathname.replace(new URL(CLANG_CDN).pathname, '')
      const file = LOCAL_CLANG + rel
      if (!existsSync(file)) return route.fulfill({ status: 404, body: 'not found' })
      const ext = rel.slice(rel.lastIndexOf('.'))
      return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'cache-control': 'max-age=31536000' }, contentType: MIME[ext] || 'application/octet-stream', body: readFileSync(file) })
    })
  }
  const page = await context.newPage()
  page.setDefaultTimeout(120_000)
  page.requestsSeen = []
  page.errors = []
  page.on('request', (request) => page.requestsSeen.push(request.url()))
  page.on('pageerror', (error) => page.errors.push(`pageerror: ${error}`))
  page.on('console', (message) => { if (message.type() === 'error') page.errors.push(`console: ${message.text()}`) })
  return page
}

const runs = (page) => page.evaluate(() => window.__inkCodeLevel.runs())
const setSource = (page, text) => page.evaluate((t) => window.__inkCodeLevel.editor.setSource(t), text)
const getSource = (page) => page.evaluate(() => window.__inkCodeLevel.editor.getSource())

async function waitReady(page, language) {
  const { label } = LANGUAGE_INFO[language]
  await page.waitForFunction((l) => document.querySelector('.imc-statusbar__ready')?.textContent === `${l} ready` || document.querySelector('.imc-loadline[data-kind="failed"]'), label, { timeout: 300_000 })
  const failed = await page.locator('.imc-loadline[data-kind="failed"]').count()
  assert.equal(failed, 0, `${label} loads: ${failed ? await page.locator('.imc-loadline').textContent() : ''}`)
}

/** Clicks Run or Submit, waits for the result and for the board to finish playing it. */
async function run(page, kind) {
  const before = await runs(page)
  await page.evaluate(() => { window.__inkCodeEvents = [] })
  await page.locator(kind === 'run' ? '.imc-btn--run' : '.imc-btn--submit').click()
  await page.waitForFunction((n) => window.__inkCodeLevel.runs() > n, before, { timeout: 240_000 })
  try {
    await page.waitForSelector('.imc-banner', { timeout: 120_000 })
  } catch (error) {
    const seen = await page.evaluate(() => {
      const last = window.__inkCodeLevel.last()
      const events = window.__inkCodeEvents ?? []
      return { status: last?.result.status, title: last?.report.title, events: events.length, tail: events.slice(-6).map((e) => e.type), visible: document.visibilityState }
    })
    throw new Error(`${error.message}\n  no result line under the board: ${JSON.stringify(seen)}`)
  }
  return page.evaluate(() => {
    const last = window.__inkCodeLevel.last()
    const hud = [...document.querySelectorAll('.imc-hud dd strong')].map((n) => Number(n.textContent))
    return {
      status: last.result.status, result: last.result, report: last.report,
      title: document.querySelector('.imc-result__title strong')?.textContent ?? '',
      banner: document.querySelector('.imc-banner')?.textContent ?? '',
      hud: { ink: hud[0], moves: hud[1], left: hud[2] },
      settled: window.__inkCodeEvents.filter((e) => e.type === 'settled').length,
      bumps: window.__inkCodeEvents.filter((e) => e.type === 'bump').length,
    }
  })
}

/** Requests made since `from` for code-level files, by runtime folder, and CDN prefixes. */
function fetched(page, from) {
  const urls = page.requestsSeen.slice(from)
  const runtimes = new Set()
  for (const u of urls) { const m = /\/ink-maze-code\/(java|python|javascript|clang|echo)\//.exec(u); if (m) runtimes.add(m[1]) }
  const cdn = new Set(urls.filter((u) => CDN_HOSTS.test(u)).map((u) => RUNTIME_INFO.python.cdn.concat(RUNTIME_INFO.clang.cdn).find((p) => u.startsWith(p)) ?? u))
  return { runtimes: [...runtimes].sort(), cdn: [...cdn] }
}

const timings = []

async function language(page, lang, view, notes, meter) {
  const info = LANGUAGE_INFO[lang]
  const where = `${info.label} (${view})`
  assert.equal(await getSource(page), STARTER_CODE[lang], `${where}: the editor starts with the starter code`)

  // the starter compiles and returns "": the ball does not move
  let r = await run(page, 'run')
  assert.equal(r.status, 'ok', `${where} starter: ${r.result.message}`)
  assert.equal(r.title, 'Wrong Answer', `${where} starter`)
  assert.equal(r.report.rows[0].verdict.kind, 'empty')
  assert.match(r.report.message, /returned no moves/)
  assert.match(r.banner, /^Bug: /, `${where} starter: "${r.banner}"`)
  assert.equal(r.settled, 0, `${where} starter: the ball does not move`)
  assert.equal(r.result.limits.timeLimitMs, timeLimitFor(lang, 'run'), `${where}: Run gets the stated time limit`)

  // the reference: Accepted on every board, cold (its first compile) and warm
  await setSource(page, solution(lang, 'reference'))
  for (const when of ['cold', 'warm']) {
    r = await run(page, 'submit')
    assert.equal(r.title, 'Accepted', `${where} reference (${when}): ${r.report.message} ${r.result.message}`)
    assert.equal(r.report.passed, tests.length)
    assert.equal(r.result.limits.timeLimitMs, timeLimitFor(lang, 'submit'), `${where}: Submit gets the stated time limit`)
    assert.ok(r.result.timings.runMs < timeLimitFor(lang, 'submit') / 4, `${where} reference (${when}) runs well inside the limit: ${r.result.timings.runMs} ms`)
    timings.push({ where, what: `reference ${when}`, ...r.result.timings })
  }
  if (view === 'desktop') {
    await setSource(page, solution(lang, 'naive'))
    r = await run(page, 'submit')
    assert.equal(r.title, 'Accepted', `${where} naive: ${r.report.message} ${r.result.message}`)
    assert.ok(r.result.timings.runMs < timeLimitFor(lang, 'submit') / 4, `${where} naive search runs well inside the limit: ${r.result.timings.runMs} ms`)
    timings.push({ where, what: 'naive', ...r.result.timings })
    // the same search without the ink pruning: Run passes on the map, Submit runs out of time on the larger hidden boards
    await setSource(page, solution(lang, 'unpruned'))
    r = await run(page, 'run')
    assert.equal(r.title, 'Accepted', `${where} unpruned search on the map: ${r.report.message} ${r.result.message}`)
    timings.push({ where, what: 'unpruned run', ...r.result.timings })
    r = await run(page, 'submit')
    assert.equal(r.status, 'time_limit', `${where} unpruned search: ${r.status} ${r.result.message}`)
    assert.equal(r.title, STATUS_TITLES.time_limit)
    assert.equal(r.result.stoppedBy, 'runtime', `${where} unpruned search stopped itself at its deadline`)
    assert.ok(r.result.answers.filter(Boolean).length < tests.length, `${where} unpruned search: not every board answered`)
    assert.equal(r.settled, 0, `${where} unpruned search: the ball does not move`)
    timings.push({ where, what: 'unpruned submit', ...r.result.timings })
  }
  if (view === 'phone' && info.runtime === 'clang') {
    const note = await page.locator('.imc-loadline--note').textContent().catch(() => '')
    assert.match(note, /memory/, `${where}: the phone gets the compiler's memory note`)
  }

  // a wrong answer: the judge's verdict, and the ball rolls exactly those moves
  await setSource(page, program(lang, 'answer', wrong))
  r = await run(page, 'run')
  assert.equal(r.status, 'ok')
  assert.equal(r.title, 'Wrong Answer', `${where} wrong answer`)
  assert.equal(r.report.rows[0].verdict.kind, wrongVerdict.kind)
  assert.equal(r.settled, wrongVerdict.steps.length, `${where} wrong answer: one roll per judged move`)
  assert.equal(r.hud.moves, wrongVerdict.steps.length, `${where} wrong answer: the HUD counts the moves`)
  assert.equal(r.hud.ink, 0, `${where} wrong answer: the pot is empty`)
  assert.doesNotMatch(r.banner, /^Bug/, 'the ball moved, so this is a wrong answer, not a bug')

  // what breaks: each shows its error and the ball does not move
  let idle = 0
  if (meter) { await pause(300); idle = await meter.cores(1500) }
  const cases = view === 'desktop' ? ['compile', 'runtime', 'spin', 'recursion', 'allocate', 'flood', 'marker', 'exit'] : ['compile', 'spin']
  for (const name of cases) {
    const source = program(lang, name)
    if (!source) continue
    await setSource(page, source)
    r = await run(page, 'run')
    assert.equal(r.status, EXPECT[name], `${where} ${name}: ${r.status} ${r.result.message}`)
    assert.equal(r.title, STATUS_TITLES[r.status], `${where} ${name}: the title`)
    assert.equal(r.banner, `${r.status === 'crashed' ? STATUS_TITLES.crashed : `Bug: ${STATUS_TITLES[r.status]}`}. The ball did not move.`, `${where} ${name}: "${r.banner}"`)
    assert.equal(r.settled, 0, `${where} ${name}: the ball does not move`)
    if (name === 'compile') {
      const line = r.result.diagnostics.find((d) => d.severity === 'error')?.line
      assert.equal(line, LINE[lang].compile, `${where} compile error on line ${LINE[lang].compile}, not ${line}`)
      assert.ok(await page.locator('.imc-editor .cm-lintRange-error').count(), `${where}: the error is marked in the editor`)
    }
    if (name === 'spin') {
      assert.equal(r.result.stoppedBy, 'runtime', `${where} spin: the program stopped itself at its deadline`)
      assert.ok(r.result.timings.runMs >= timeLimitFor(lang, 'run') - 50 && r.result.timings.runMs < timeLimitFor(lang, 'run') + 1500, `${where} spin stopped at the limit: ${r.result.timings.runMs} ms`)
    }
    if (meter && (name === 'spin' || name === 'flood' || name === 'recursion')) {
      // the runaway is really gone: the browser's CPU (WebKit's WebContent and GPU processes, or
      // Chromium's renderers) is back to idle in the 1.5 s from 0.3 s after the result
      // (the board has finished playing it by then; it plays nothing for a bug)
      await pause(300)
      const cores = await meter.cores(1500)
      notes.push(`${where} ${name}: ${cores.toFixed(2)} cores after the limit (idle before ${idle.toFixed(2)})`)
      // a program still running would hold a whole core
      assert.ok(cores <= Math.max(0.3, idle + 0.15), `${where} ${name}: the browser still burns ${cores.toFixed(2)} cores after the limit (idle ${idle.toFixed(2)}): ${meter.detail.join('; ')}`)
    }
    if (name === 'exit') assert.match(r.result.message, /exit\(3\)/)
  }

  // Stop ends a runaway at once
  await setSource(page, program(lang, 'spin'))
  const before = await runs(page)
  await page.locator('.imc-btn--run').click()
  await page.waitForSelector('.imc-btn--stop')
  await page.waitForFunction(() => /^Running on/.test(document.querySelector('.imc-console__waiting')?.textContent ?? ''), null, { timeout: 120_000 })
  await pause(300)
  const t0 = Date.now()
  await page.locator('.imc-btn--stop').click()
  await page.waitForFunction((n) => window.__inkCodeLevel.runs() > n, before, { timeout: 10_000 })
  const stopped = await page.evaluate(() => window.__inkCodeLevel.last().result.status)
  assert.equal(stopped, 'cancelled', `${where}: Stop`)
  assert.ok(Date.now() - t0 < 1500, `${where}: Stop answered in ${Date.now() - t0} ms`)
  await page.waitForSelector('.imc-btn--run')
  notes.push(`${where}: Stop answered in ${Date.now() - t0} ms`)

  // leave this language's code as something recognisable, for the switch test
  await setSource(page, `${solution(lang, 'reference')}\n${lang === 'python' ? '#' : '//'} kept for ${lang}\n`)
  await pause(600) // the editor saves after 400 ms
}

async function flow(browser, base, engine, view, meter) {
  const page = await openContext(browser, view)
  meter.capture()
  const notes = []
  try {
    // a board level fetches nothing of the coding level
    await page.goto(`${base}/minigames/inkMaze/?level=1&renderer=canvas`)
    await page.waitForSelector('#ink-maze-board[data-ready="true"]')
    await pause(800)
    assert.deepEqual(page.requestsSeen.filter((u) => /ink-maze-code\/|codemirror|CodeLevel|cdn\.jsdelivr/i.test(u)), [], `${engine} ${view}: a board level fetches nothing of the coding level`)

    // opening the coding level fetches Java's toolchain only
    let mark = page.requestsSeen.length
    await page.goto(`${base}/minigames/inkMaze/?level=${CODE_NUMBER}&seed=${SEED}`)
    await page.waitForSelector('.imc-editor .cm-content')
    await page.waitForFunction(() => window.__inkCodeLevel?.editor)
    assert.equal(await page.locator('.imc-lang select').inputValue(), 'java', 'Java is the default')
    await waitReady(page, 'java')
    assert.deepEqual(fetched(page, mark), { runtimes: ['java'], cdn: [] }, `${engine} ${view}: opening the level fetches Java's toolchain only, from this site`)
    await page.locator('.imc-speed__option', { hasText: '4×' }).click()
    meter.capture()

    for (const lang of languages) {
      if (lang !== 'java') {
        mark = page.requestsSeen.length
        const had = fetched(page, 0).runtimes
        await page.locator('.imc-lang select').selectOption(lang)
        await waitReady(page, lang)
        const runtime = LANGUAGE_INFO[lang].runtime
        const got = fetched(page, mark)
        const fresh = got.runtimes.filter((r) => !had.includes(r))
        if (!had.includes(runtime)) assert.deepEqual(fresh, [runtime], `${engine} ${view}: picking ${lang} fetches ${runtime} only (got ${got.runtimes})`)
        else assert.deepEqual(fresh, [], `${engine} ${view}: ${lang} reuses ${runtime}`)
        assert.deepEqual(got.cdn.filter((p) => !RUNTIME_INFO[runtime].cdn.includes(p)), [], `${engine} ${view}: ${lang} fetches only its own pinned CDN files (${got.cdn})`)
      }
      const t0 = Date.now()
      await language(page, lang, view, notes, view === 'desktop' ? meter : null)
      notes.push(`${LANGUAGE_INFO[lang].label} (${view}): ${((Date.now() - t0) / 1000).toFixed(0)} s`)
    }

    // switching languages keeps each one's code, and so does a reload
    const expected = (lang) => `${solution(lang, 'reference')}\n${lang === 'python' ? '#' : '//'} kept for ${lang}\n`
    for (const lang of [...languages].reverse()) {
      await page.locator('.imc-lang select').selectOption(lang)
      await page.waitForFunction((l) => document.querySelector('.imc-file')?.textContent === l, LANGUAGE_INFO[lang].fileName)
      assert.equal(await getSource(page), expected(lang), `${engine} ${view}: ${lang} keeps its code after switching`)
    }
    // let the last language's toolchain finish loading: WebKit reports a fetch that a reload cuts off
    // ("Fetch API cannot load ... due to access control checks") as a page error
    await waitReady(page, languages[0])
    await page.reload()
    await page.waitForFunction(() => window.__inkCodeLevel?.editor)
    assert.equal(await getSource(page), expected(languages[0]), `${engine} ${view}: the code is still there after a reload`)

    // no sideways scroll on the phone
    if (view === 'phone') assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll on a phone')
    assert.deepEqual(page.errors, [], `${engine} ${view}: no console or page errors`)
    return notes
  } finally {
    await page.context().close()
  }
}

const server = await devServer()
const failures = []
try {
  for (const engine of engines) {
    const meter = cpuMeter()
    const browser = await launch(engine)
    try {
      for (const view of views) {
        const t0 = Date.now()
        try {
          const notes = await flow(browser, server.base, engine, view, meter)
          console.log(`PASS ${engine} ${view} (${((Date.now() - t0) / 1000).toFixed(0)} s): ${languages.join(', ')}`)
          for (const n of notes) console.log(`  ${n}`)
        } catch (error) {
          failures.push(`${engine} ${view}: ${error.message}`)
          console.log(`FAIL ${engine} ${view}: ${error.stack}`)
        }
      }
    } finally {
      await browser.close()
    }
  }
} finally {
  server.stop()
}
console.log('timings (ms): where, what, compile, run, total')
for (const t of timings) console.log(`  ${t.where.padEnd(22)} ${t.what.padEnd(16)} ${String(t.compileMs).padStart(6)} ${String(t.runMs).padStart(6)} ${String(t.totalMs).padStart(6)}`)
console.log(`compile limits: ${Object.entries(COMPILE_LIMIT_MS).filter(([l]) => l !== 'echo').map(([l, ms]) => `${l} ${ms / 1000} s`).join(', ')}`)
if (failures.length) {
  console.log(`FAIL ink maze code flow:\n  ${failures.join('\n  ')}`)
  process.exit(1)
}
console.log(`PASS ink maze code flow: ${languages.length} languages in ${engines.join(' and ')}, ${views.join(' and ')}`)
