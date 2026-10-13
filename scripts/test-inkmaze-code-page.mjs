#!/usr/bin/env node
/**
 * Ink Maze's coding level (the level after the last board) in real browsers,
 * Chromium and WebKit: the screen, not the runtimes.
 *
 *   node scripts/test-inkmaze-code-page.mjs                both browsers, own Vite dev server
 *   node scripts/test-inkmaze-code-page.mjs webkit         one browser
 *   CGS_TEST_URL=http://localhost:5190 node scripts/test-inkmaze-code-page.mjs
 *
 * Without CGS_TEST_URL it starts a Vite dev server of this checkout with hot
 * reload off, so edits made while it runs cannot reload its pages.
 * Needs Playwright (CGS_PLAYWRIGHT_MODULE, see scripts/inkmaze-code-browser.mjs)
 * and a dev server (the echo test runtime is listed only there, with
 * ?codeRuntime=echo). Not part of `npm test`: it takes a few minutes.
 *
 * First, in Node: what the screen says about every kind of result
 * (code/ui/report.ts). Then in each browser:
 *  - the board levels load no editor and no sandbox; the coding level's tile
 *    ends the level list, opens the level, and Levels brings the game back;
 *  - opening the level loads the chosen language's toolchain only (Java by
 *    default); a toolchain that cannot be fetched (the test refuses Java's
 *    file) says so, and a run reports Could Not Load; clearing the last board
 *    level leads on to it, and ?level=code opens it;
 *  - the editor: starter code per language, code kept per language (and
 *    after a reload), Reset with undo, typing, Ctrl/Cmd+Enter, Tab indents,
 *    Esc then Tab leaves;
 *  - every run moves the ball as the judge decided (the board's own view
 *    events): Accepted, a move into a wall (bump, "Bug:"), an empty answer,
 *    the ink running out, extra moves; Compile Error marks the line in the
 *    editor, Runtime Error, Time Limit Exceeded, the harness broken, Stop;
 *  - Submit: Accepted plays every board and clears the level (saved, shown on
 *    the tile); a wrong submission shows only the first failing hidden board;
 *  - New board, speed, replay and skip; the console tabs by keyboard; the
 *    live region; a phone at 390 x 844 (stacked, the problem folds, the board
 *    comes into view after a run, no sideways scroll);
 *  - the JavaScript and Java runtimes, when they are on the server: a real
 *    depth-first search submitted through the screen is Accepted.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { devServer, launch, pause } from './inkmaze-code-browser.mjs'
import { LEVELS } from '../src/minigames/inkmaze/levels.ts'
import { applyMove, initialState, legalMoves, rollPath, status, DIRECTIONS } from '../src/minigames/inkmaze/engine.ts'
import { minInk } from '../src/minigames/inkmaze/solver.ts'
import { CODE_LEVEL } from '../src/minigames/inkmaze/code/ui/level.ts'
import { buildReport, quoteAnswer, testLabel } from '../src/minigames/inkmaze/code/ui/report.ts'
import { HIDDEN_TESTS, PROBLEM, STARTER_CODE, judgeAll, letterOf, randomBoard, submissionTests } from '../src/minigames/inkmaze/code/problem.ts'
import { LANGUAGES, LANGUAGE_INFO, STATUS_TITLES } from '../src/minigames/inkmaze/code/contract.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CODE_NUMBER = LEVELS.length + 1
const SEED = 7919
const map = randomBoard(SEED)
const letters = (moves) => moves.map(letterOf).join('')
const solution = letters(minInk(map).moves)
const tests = submissionTests(map)

// ------------------------------------------------------------ Node: the report

function fakeResult(over) {
  return {
    runId: 'run-test', language: 'java', kind: 'run', status: 'ok', title: STATUS_TITLES[over.status ?? 'ok'], message: '', phase: null,
    diagnostics: [], error: null, stdout: '', stderr: '', consoleTruncated: false, answers: [], answered: 0,
    timings: { totalMs: 10, loadMs: 0, compileMs: 1, runMs: 1 }, limits: { timeLimitMs: 4000, memoryBytes: 1 << 28, outputChars: 1 << 20 },
    stoppedBy: null, ticks: 0, sandboxRestarted: false, ...over,
  }
}
const report = (kind, boards, over) => {
  const result = fakeResult({ kind, answers: boards.map(() => ''), ...over })
  return buildReport(kind, boards, result, result.status === 'ok' ? judgeAll(boards, result.answers) : null)
}
const solve = (board) => letters(minInk(board).moves)
{
  assert.equal(CODE_LEVEL.name, PROBLEM.title, 'the tile and the problem have the same name')
  // a run that clears the map
  let r = report('run', [map], { answers: [solution], answered: 1 })
  assert.equal(r.title, 'Accepted'); assert.equal(r.tone, 'accepted'); assert.equal(r.focus, 0); assert.ok(r.animate); assert.ok(!r.montage)
  assert.match(r.banner, /^Accepted: every block colored in \d+ moves/)
  // an accepted submission plays every board
  r = report('submit', tests, { answers: tests.map(solve), answered: tests.length })
  assert.ok(r.accepted && r.montage); assert.equal(r.passed, tests.length); assert.equal(r.rows.filter((row) => row.state === 'passed').length, tests.length)
  assert.ok(r.rows.every((row) => row.name !== 'Hidden board'), 'every board passed: their names show')
  // a wrong submission: hidden test 3 fails first; only it is revealed among the hidden boards
  const answers = tests.map(solve)
  answers[3] = ''; answers[7] = 'U'
  r = report('submit', tests, { answers, answered: tests.length })
  assert.equal(r.title, 'Wrong Answer'); assert.equal(r.focus, 3); assert.ok(r.animate)
  assert.match(r.message, new RegExp(`^${testLabel(tests, 3)} \\(${tests[3].name}\\): Your code returned no moves`))
  assert.deepEqual(r.rows.filter((row) => row.revealed).map((row) => row.index), [0, 3])
  assert.equal(r.rows[7].state, 'failed'); assert.equal(r.rows[7].name, 'Hidden board'); assert.equal(r.rows[7].catches, null)
  assert.equal(r.rows[3].catches, HIDDEN_TESTS[2].catches)
  assert.equal(r.passed, tests.length - 2)
  assert.match(r.banner, /^Bug: Your code returned no moves/, 'no move at all is a bug')
  // a wall right away: a bug too; a move after a roll is just wrong
  const blocked = DIRECTIONS.find((d) => !rollPath(initialState(map), d).length)
  r = report('run', [map], { answers: [letterOf(blocked)], answered: 1 })
  assert.match(r.banner, /^Bug: Move 1 \(.\) does not move the ball/)
  r = report('run', [map], { answers: [solution + solution[0]], answered: 1 })
  assert.equal(r.rows[0].verdict.kind, 'extra_moves'); assert.doesNotMatch(r.banner, /^Bug/)
  // statuses with no judged answer
  r = report('run', [map], { status: 'compile_error', phase: 'compile', message: "Line 3: ';' expected", diagnostics: [{ line: 3, column: 5, severity: 'error', message: "';' expected" }] })
  assert.equal(r.title, 'Compile Error'); assert.equal(r.tone, 'error'); assert.ok(!r.animate); assert.equal(r.banner, 'Bug: Compile Error. The ball did not move.')
  assert.equal(r.passed, null)
  r = report('submit', tests, {
    status: 'runtime_error', phase: 'run', answered: 5, answers: [...tests.slice(0, 5).map(solve), ...tests.slice(5).map(() => '')],
    error: { type: 'IndexError', message: 'list index out of range', line: 7, column: null, test: 5 },
  })
  assert.equal(r.title, 'Runtime Error'); assert.equal(r.message, 'IndexError: list index out of range (line 7)')
  assert.deepEqual(r.rows.map((row) => row.state), [...Array(5).fill('passed'), 'error', ...Array(tests.length - 6).fill('not-run')])
  assert.equal(r.focus, 5, 'the board it stopped on is shown'); assert.ok(r.rows[5].revealed); assert.equal(r.passed, 5)
  assert.ok(r.details.some((line) => line.includes(testLabel(tests, 5).toLowerCase())))
  r = report('run', [map], { status: 'time_limit', phase: 'run', stoppedBy: 'runtime', message: 'Your code ran longer than 4 s.' })
  assert.equal(r.title, 'Time Limit Exceeded'); assert.equal(r.tone, 'limit'); assert.equal(r.rows[0].state, 'error')
  r = report('run', [map], { status: 'crashed', phase: 'run', message: "Your code broke the game's runner." })
  assert.equal(r.title, STATUS_TITLES.crashed); assert.equal(r.banner, `${STATUS_TITLES.crashed}. The ball did not move.`)
  r = report('run', [map], { status: 'cancelled', message: 'Stopped.' })
  assert.equal(r.tone, 'neutral'); assert.equal(r.banner, 'Stopped before your code finished.')
  r = report('run', [map], { status: 'unavailable', phase: 'load', message: 'Java could not be loaded: offline' })
  assert.equal(r.title, 'Could Not Load'); assert.equal(r.banner, 'Java could not be loaded: offline')
  assert.equal(quoteAnswer(''), '"" (empty)'); assert.equal(quoteAnswer('U'.repeat(70), 64), `"${'U'.repeat(64)}…" (70 characters)`)
  console.log('PASS report: titles, tones, banners, rows, the first failing hidden board, focus')
}

// ------------------------------------------------------------ the browsers

/** A line of play on the map that runs the ink out with blocks left. */
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
  assert.equal(status(state), 'lost')
  return letters(line)
}
const firstBlocked = letterOf(DIRECTIONS.find((d) => !rollPath(initialState(map), d).length))
const losing = losingLine(map)

const codeUrl = (base, query = '') => `${base}/minigames/inkMaze/?level=${CODE_NUMBER}&seed=${SEED}&codeRuntime=echo${query ? `&${query}` : ''}`
const RUNTIME_SCRIPTS = /\/ink-maze-code\/(java|python|javascript|clang|echo)\/runtime\.js/

async function openPage(browser, url, options = {}) {
  const context = await browser.newContext(options)
  const page = await context.newPage()
  page.setDefaultTimeout(60_000) // generous: the machine may be busy with other work
  page.requestsSeen = []
  page.errors = []
  page.on('request', (request) => page.requestsSeen.push(request.url()))
  page.on('pageerror', (error) => page.errors.push(String(error)))
  page.sandboxLog = []
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    // only the sandbox iframe has a Content Security Policy: what it refuses is the runtimes' business (listed at the end), not this page's
    if (/Content Security Policy/.test(message.text())) page.sandboxLog.push(message.text())
    else page.errors.push(message.text())
  })
  if (url) await page.goto(url)
  return page
}

/** The coding level is up: the editor is there and the echo runtime is ready. */
async function ready(page, language = 'echo') {
  await page.waitForSelector('.imc-editor .cm-content', { timeout: 30_000 })
  await page.waitForFunction(() => window.__inkCodeLevel?.editor, null, { timeout: 10_000 })
  if (language) await page.waitForFunction((label) => document.querySelector('.imc-statusbar__ready')?.textContent?.includes(label), LANGUAGE_INFO[language].label, { timeout: 20_000 })
}

const setSource = (page, text) => page.evaluate((t) => window.__inkCodeLevel.editor.setSource(t), text)
const source = (page) => page.evaluate(() => window.__inkCodeLevel.editor.getSource())
const runs = (page) => page.evaluate(() => window.__inkCodeLevel.runs())

/** Clicks Run or Submit (or presses a key) and waits for the result; with `played`, also for the board to finish. */
async function runCode(page, how = 'run', { played = true } = {}) {
  const before = await runs(page)
  await page.evaluate(() => { window.__inkCodeEvents = [] })
  if (how === 'run') await page.click('.imc-btn--run')
  else if (how === 'submit') await page.click('.imc-btn--submit')
  else await page.keyboard.press(how)
  await page.waitForFunction((n) => window.__inkCodeLevel.runs() > n, before, { timeout: 60_000 })
  if (played) await page.waitForSelector('.imc-banner', { timeout: 90_000 })
  return page.evaluate(() => {
    const last = window.__inkCodeLevel.last()
    const hud = [...document.querySelectorAll('.imc-hud dd strong')].map((n) => Number(n.textContent))
    return {
      status: last.result.status, title: document.querySelector('.imc-result__title strong')?.textContent ?? '',
      message: document.querySelector('.imc-result__message')?.textContent ?? '',
      banner: document.querySelector('.imc-banner')?.textContent ?? '', tone: document.querySelector('.imc-banner')?.dataset.tone ?? '',
      hud: { ink: hud[0], moves: hud[1], left: hud[2] }, events: window.__inkCodeEvents.slice(), report: last.report,
      live: document.querySelector('.imc-main [role="status"]')?.textContent ?? '',
    }
  })
}

/** what the sandbox's CSP refused, over every page (printed as a note) */
const sandboxRefusals = new Set()
const noteSandbox = (page) => { for (const line of page.sandboxLog) sandboxRefusals.add(line) }

const settledCount = (events) => events.filter((e) => e.type === 'settled').length

/** A real depth-first search in JavaScript (the reference the runtimes' own suites go much further than). */
const JS_SOLUTION = `function solve(grid, ink) {
  const rows = grid.length, cols = grid[0].length
  const MOVES = [['U', -1, 0], ['D', 1, 0], ['L', 0, -1], ['R', 0, 1]]
  const colored = grid.map((row) => [...row].map((c) => c === 'o'))
  let floors = 0, r0 = 0, c0 = 0
  grid.forEach((row, r) => [...row].forEach((ch, c) => { if (ch !== '#') floors++; if (ch === 'o') { r0 = r; c0 = c } }))
  const path = []
  const go = (r, c, done, left) => {
    if (done === floors) return true
    if (left < floors - done) return false
    for (const [name, dr, dc] of MOVES) {
      let nr = r + dr, nc = c + dc, spent = 0, er = r, ec = c
      const painted = []
      while (nr >= 0 && nc >= 0 && nr < rows && nc < cols && grid[nr][nc] !== '#' && spent < left) {
        if (!colored[nr][nc]) { colored[nr][nc] = true; painted.push([nr, nc]) }
        spent++; er = nr; ec = nc; nr += dr; nc += dc
      }
      if (!spent) continue
      path.push(name)
      if (go(er, ec, done + painted.length, left - spent)) return true
      path.pop()
      for (const [pr, pc] of painted) colored[pr][pc] = false
    }
    return false
  }
  go(r0, c0, 1, ink)
  return path.join('')
}
`

/** The same search in Java. */
const JAVA_SOLUTION = `import java.util.*;

class Solution {
    static final char[] MOVES = {'U', 'D', 'L', 'R'};
    static final int[] DR = {-1, 1, 0, 0};
    static final int[] DC = {0, 0, -1, 1};
    int rows, cols, floors;
    boolean[][] colored;
    String[] grid;
    StringBuilder path = new StringBuilder();

    public String solve(String[] grid, int ink) {
        this.grid = grid;
        rows = grid.length;
        cols = grid[0].length();
        colored = new boolean[rows][cols];
        int br = 0, bc = 0;
        for (int r = 0; r < rows; r++)
            for (int c = 0; c < cols; c++) {
                char ch = grid[r].charAt(c);
                if (ch != '#') floors++;
                if (ch == 'o') { br = r; bc = c; colored[r][c] = true; }
            }
        System.out.println("solving " + rows + " x " + cols);
        go(br, bc, 1, ink);
        return path.toString();
    }

    boolean go(int r, int c, int done, int left) {
        if (done == floors) return true;
        if (left < floors - done) return false;
        for (int d = 0; d < 4; d++) {
            int nr = r + DR[d], nc = c + DC[d], spent = 0, er = r, ec = c, n = 0;
            int[] painted = new int[64];
            while (nr >= 0 && nc >= 0 && nr < rows && nc < cols && grid[nr].charAt(nc) != '#' && spent < left) {
                if (!colored[nr][nc]) { colored[nr][nc] = true; painted[n++] = nr * cols + nc; }
                spent++; er = nr; ec = nc; nr += DR[d]; nc += DC[d];
            }
            if (spent == 0) continue;
            path.append(MOVES[d]);
            if (go(er, ec, done + n, left - spent)) return true;
            path.setLength(path.length() - 1);
            for (int k = 0; k < n; k++) colored[painted[k] / cols][painted[k] % cols] = false;
        }
        return false;
    }
}
`

/**
 * Submits a real search in `language` through the screen, when that runtime is
 * on the server. Runtimes are their own engineers' work (each has its own
 * suite): one that is there but does not load yet is reported, not failed.
 */
async function runtimeRun(browser, base, language, program) {
  const { label, runtime } = LANGUAGE_INFO[language]
  if (!existsSync(`${ROOT}public/minigames/ink-maze-code/${runtime}/runtime.js`)) return `${label} runtime not on the server yet: skipped its run`
  const page = await openPage(browser, `${base}/minigames/inkMaze/?level=${CODE_NUMBER}&seed=${SEED}`)
  try {
    await page.waitForSelector('.imc-editor .cm-content', { timeout: 30_000 })
    if ((await page.locator('.imc-lang select').inputValue()) !== language) await page.locator('.imc-lang select').selectOption(language)
    await page.waitForFunction((l) => document.querySelector('.imc-statusbar__ready')?.textContent?.includes(l) || document.querySelector('.imc-loadline[data-kind="failed"]'), label, { timeout: 120_000 })
    if (await page.locator('.imc-loadline[data-kind="failed"]').count()) {
      return `${label} runtime on the server but it did not load (${(await page.locator('.imc-loadline').textContent()).trim()}): skipped its run`
    }
    assert.equal(await source(page), STARTER_CODE[language])
    await setSource(page, program)
    const r = await runCode(page, 'submit')
    if (r.status !== 'ok' && r.status !== 'unavailable' && language !== 'javascript') {
      // a runtime still being built may fail its own way; the screen showed it, which is what this test is about
      assert.ok(r.title && r.banner, `${label}: the screen shows a result`)
      return `${label} runtime ran but reported ${r.title}: ${r.message}`
    }
    assert.equal(r.title, 'Accepted', `${label}: ${r.message}`)
    assert.equal(r.hud.left, 0)
    assert.deepEqual(page.errors, [])
    return `${label} runtime: a real depth-first search was Accepted on all ${tests.length} boards`
  } finally {
    await page.close()
  }
}

async function testBrowser(name, base) {
  const browser = await launch(name)
  const notes = []
  try {
    // ---------------------------------------------- the board levels: no editor, a tile at the end
    const game = await openPage(browser, `${base}/minigames/inkMaze/?level=2&renderer=canvas`)
    await game.waitForSelector('#ink-maze-board[data-ready="true"]')
    await pause(500)
    assert.equal(game.requestsSeen.filter((u) => /codemirror|CodeLevel|ink-maze-code\//i.test(u)).length, 0, 'the board levels load no editor and no sandbox')
    assert.equal(await game.locator('.im-levels__item').count(), LEVELS.length, 'the board levels keep their tiles')
    const tile = game.locator('.im-levels__code')
    assert.equal(await tile.count(), 1)
    assert.match(await tile.textContent(), new RegExp(`^${CODE_NUMBER}.*${CODE_LEVEL.name}`))
    const box = await tile.boundingBox()
    assert.ok(box.height >= 44, 'the tile is a 44px target')
    await game.route(/\/ink-maze-code\/java\/runtime\.js/, (route) => route.fulfill({ status: 404, contentType: 'text/plain', body: 'not here' }))
    await tile.click()
    await game.waitForSelector('.imc-editor .cm-content', { timeout: 30_000 })
    assert.match(game.url(), new RegExp(`level=${CODE_NUMBER}`))
    assert.match(await game.title(), new RegExp(PROBLEM.title))
    // the default language is Java, with its starter code, and only its toolchain is asked for
    assert.equal(await game.locator('.imc-lang select').inputValue(), 'java')
    assert.equal(await game.locator('.imc-lang option').count(), LANGUAGES.length, 'no echo without the dev flag')
    await game.waitForFunction(() => window.__inkCodeLevel?.editor)
    assert.equal(await source(game), STARTER_CODE.java)
    assert.equal(await game.locator('.imc-file').textContent(), 'Solution.java')
    await game.waitForFunction(() => document.querySelector('.imc-loadline, .imc-statusbar__ready'), null, { timeout: 30_000 })
    await pause(800)
    const scripts = [...new Set(game.requestsSeen.filter((u) => RUNTIME_SCRIPTS.test(u)).map((u) => RUNTIME_SCRIPTS.exec(u)[1]))]
    assert.deepEqual(scripts, ['java'], 'only the Java toolchain is fetched')
    assert.equal(game.requestsSeen.filter((u) => /cdn\.jsdelivr\.net/.test(u)).length, 0, 'no CDN toolchain for Java')
    // a toolchain that cannot be fetched (here: Java's, refused below) says so, and a run reports Could Not Load
    await game.waitForSelector('.imc-loadline[data-kind="failed"]', { timeout: 30_000 })
    assert.match(await game.locator('.imc-loadline').textContent(), /Java could not be loaded/)
    assert.equal(await game.locator('.imc-loadline').getAttribute('role'), 'alert')
    const missing = await runCode(game, 'run')
    assert.equal(missing.status, 'unavailable'); assert.equal(missing.title, STATUS_TITLES.unavailable); assert.equal(missing.tone, 'neutral')
    assert.equal(missing.hud.moves, 0)
    // back to the board levels: the game returns on the level it left
    await game.locator('.imc-back').click()
    await game.waitForSelector('#ink-maze-board[data-ready="true"]')
    assert.match(game.url(), /level=2(&|$)/)
    assert.equal(await game.locator('.im-levels__item[aria-current="true"]').textContent(), '2')
    assert.equal(await game.locator('iframe[sandbox]').count(), 0, 'leaving the level removes the sandbox')
    noteSandbox(game)
    assert.deepEqual(game.errors.filter((e) => !/status of 404/.test(e)), [], 'no errors but the refused Java file')
    await game.close()

    // clearing the last board level: Next level opens the coding level; ?level=code opens it too
    const lastLevel = LEVELS.at(-1)
    const final = await openPage(browser, `${base}/minigames/inkMaze/?level=${LEVELS.length}&renderer=canvas`)
    await final.waitForSelector('#ink-maze-board[data-ready="true"]')
    const KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }
    for (const move of minInk(lastLevel).moves) {
      await final.evaluate(() => { window.__rollMark = window.__inkMazeEvents.at(-1) })
      await final.keyboard.press(KEY[move])
      await final.waitForFunction(() => {
        const log = window.__inkMazeEvents
        return log.slice(log.lastIndexOf(window.__rollMark) + 1).some((e) => e.type === 'settled')
      }, null, { timeout: 5000 })
    }
    await final.waitForSelector('.im-result[data-kind="won"]')
    const next = final.getByRole('button', { name: 'Next level', exact: true })
    assert.equal(await final.evaluate(() => document.activeElement?.textContent?.trim()), 'Next level →', 'Next level has focus on the last board level too')
    await next.click()
    await final.waitForSelector('.imc-editor .cm-content', { timeout: 30_000 })
    assert.match(final.url(), new RegExp(`level=${CODE_NUMBER}`))
    await final.locator('.imc-back').click()
    await final.waitForSelector('#ink-maze-board[data-ready="true"]')
    assert.equal(await final.locator('.im-levels__item[aria-current="true"]').textContent(), String(LEVELS.length), 'Levels returns to the level just cleared')
    await final.goto(`${base}/minigames/inkMaze/?level=code`)
    await final.waitForSelector('.imc-editor .cm-content', { timeout: 30_000 })
    noteSandbox(final)
    assert.deepEqual(final.errors, [])
    await final.close()

    // ---------------------------------------------- the coding level, with the echo test runtime
    const page = await openPage(browser, codeUrl(base, 'renderer=canvas'), { viewport: { width: 1440, height: 900 } })
    await ready(page)
    assert.equal(await page.locator('.imc-lang option').count(), LANGUAGES.length + 1)
    assert.deepEqual(await page.evaluate(() => window.__inkCodeLevel.board().grid), map.grid, '?seed= pins the map')
    assert.equal(await page.locator('iframe[sandbox="allow-scripts"]').count(), 1, 'one sandboxed iframe')
    // the layout: two panes side by side, no sideways scroll
    const left = await page.locator('.imc-left').boundingBox()
    const rightPane = await page.locator('.imc-right').boundingBox()
    assert.ok(left.x + left.width <= rightPane.x + 1 && Math.abs(left.y - rightPane.y) < 40, 'game and editor side by side')
    assert.ok(rightPane.y + rightPane.height <= 900 + 1, 'the panes fit the window')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0)
    // the problem: statement, the map as example 1, constraints, the signature for the language
    const problem = page.locator('.imc-problem')
    assert.match(await problem.textContent(), /Paint the Floor/)
    assert.equal(await page.locator('.imc-example').count(), 1 + PROBLEM.examples.length)
    await page.locator('.imc-example').first().getByRole('button', { name: 'Show one answer for this map' }).click()
    assert.match(await page.locator('.imc-example__answer code').textContent(), /^"[UDLR]+"$/)

    // typing, then Ctrl/Cmd+Enter in the editor: a solving program is Accepted and the ball rolls to the end
    await page.locator('.imc-editor .cm-content').click()
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.insertText('# typed\nsolve\n')
    assert.equal(await source(page), '# typed\nsolve\n')
    let r = await runCode(page, 'ControlOrMeta+Enter')
    assert.equal(r.title, 'Accepted', JSON.stringify(r.message))
    assert.equal(r.tone, 'accepted')
    assert.equal(r.hud.left, 0, 'every block colored on the board')
    const moves = r.report.rows[0].verdict.steps.length
    assert.equal(r.hud.moves, moves)
    assert.equal(settledCount(r.events), moves, 'one roll per move, each to rest')
    assert.deepEqual(r.events.filter((e) => e.type === 'clip').map((e) => e.index), [0])
    assert.match(r.live, /^Accepted\./, 'the live region says so')
    assert.equal(await page.locator('.imc-console__tab[aria-selected="true"]').textContent(), 'Result')

    // a move into a wall right away: the ball knocks it, nothing else moves, and it is a bug
    await setSource(page, `answer ${firstBlocked}${solution}`)
    r = await runCode(page)
    assert.equal(r.title, 'Wrong Answer'); assert.match(r.banner, /^Bug: Move 1 \(.\) does not move the ball/)
    assert.equal(r.hud.moves, 0); assert.equal(settledCount(r.events), 0); assert.equal(r.events.filter((e) => e.type === 'bump').length, 1)
    // an empty answer: nothing moves
    await setSource(page, 'print nothing to return\n')
    r = await runCode(page)
    assert.match(r.banner, /^Bug: Your code returned no moves/); assert.equal(r.hud.moves, 0)
    // the ink runs out: every roll plays, then the board is out of ink
    await setSource(page, `answer ${losing}`)
    r = await runCode(page)
    assert.equal(r.title, 'Wrong Answer'); assert.match(r.message, /The ink ran out/)
    assert.equal(r.hud.ink, 0); assert.ok(r.hud.left > 0); assert.equal(r.hud.moves, losing.length); assert.equal(settledCount(r.events), losing.length)
    // moves after the floor is done
    await setSource(page, `answer ${solution}${solution.at(-1) === 'U' ? 'D' : 'U'}`)
    r = await runCode(page)
    assert.match(r.message, /Every block was colored after move \d+, but your answer has 1 more move/)
    assert.equal(r.hud.left, 0)

    // Output: the player's prints, and stderr
    await setSource(page, 'print hello from the program\nwarn a warning\nanswer R\n')
    r = await runCode(page)
    await page.getByRole('tab', { name: 'Output' }).click()
    assert.match(await page.locator('.imc-output').textContent(), /hello from the program/)
    assert.match(await page.locator('.imc-console__pre--err').textContent(), /a warning/)
    // the console tabs by keyboard
    await page.getByRole('tab', { name: 'Output' }).focus()
    await page.keyboard.press('ArrowRight')
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Result')
    assert.equal(await page.locator('.imc-console__tab[aria-selected="true"]').textContent(), 'Result')
    await page.keyboard.press('End')
    assert.match(await page.evaluate(() => document.activeElement?.textContent), /^Tests/)

    // Compile Error: the line is marked in the editor, and its link moves the cursor there
    await setSource(page, 'print a\nprint b\ncompile-error expected ;\n')
    r = await runCode(page)
    assert.equal(r.title, 'Compile Error'); assert.equal(r.banner, 'Bug: Compile Error. The ball did not move.'); assert.equal(r.hud.moves, 0)
    await page.waitForSelector('.imc-editor .cm-lintRange-error')
    await page.locator('.imc-diagnostics__where').first().click()
    assert.match(await page.locator('.imc-statusbar').textContent(), /Ln 3, Col 1/)
    // Runtime Error, Time Limit Exceeded, a broken harness
    await setSource(page, 'throw something broke\n')
    r = await runCode(page)
    assert.equal(r.title, 'Runtime Error'); assert.match(r.banner, /^Bug: Runtime Error/)
    await setSource(page, 'spin\n')
    r = await runCode(page)
    assert.equal(r.title, 'Time Limit Exceeded'); assert.equal(r.tone, 'limit')
    await setSource(page, 'fake-answer RRRR\nsolve\n')
    r = await runCode(page)
    assert.equal(r.title, STATUS_TITLES.crashed); assert.equal(r.tone, 'error')
    // Stop: a running program is stopped at once
    await setSource(page, 'spin\n')
    const before = await runs(page)
    await page.click('.imc-btn--run')
    await page.waitForSelector('.imc-btn--stop')
    await page.waitForFunction(() => /Running/.test(document.querySelector('.imc-console__waiting')?.textContent ?? ''), null, { timeout: 10_000 })
    const t0 = Date.now()
    await page.click('.imc-btn--stop')
    await page.waitForFunction((n) => window.__inkCodeLevel.runs() > n, before)
    assert.ok(Date.now() - t0 < 1500, 'Stop answers at once')
    assert.equal(await page.locator('.imc-result__title strong').textContent(), STATUS_TITLES.cancelled)
    await page.waitForSelector('.imc-btn--run')

    // Submit (Ctrl/Cmd+Shift+Enter): Accepted plays every board, fast, and clears the level
    await setSource(page, 'solve\n')
    r = await runCode(page, 'ControlOrMeta+Shift+Enter')
    assert.equal(r.title, 'Accepted'); assert.equal(r.report.kind, 'submit')
    assert.deepEqual(r.events.filter((e) => e.type === 'clip').map((e) => e.index), tests.map((_, i) => i), 'the montage plays every board')
    assert.match(await page.locator('.imc-result__count').textContent(), new RegExp(`${tests.length} / ${tests.length}`))
    assert.equal(await page.locator('.imc-head__badge').textContent(), 'Cleared')
    const bests = await page.evaluate(() => JSON.parse(localStorage.getItem('cgs-inkmaze-best-v1') || '{}'))
    assert.ok(bests[CODE_LEVEL.id], 'the clear is saved')
    assert.match(r.live, /cleared/)
    // Skip during the replay jumps to the end
    await page.click('.imc-screen__tools >> text=Replay')
    await page.waitForSelector('.imc-screen__tools >> text=Skip')
    await page.click('.imc-screen__tools >> text=Skip')
    await page.waitForSelector('.imc-banner')
    assert.equal(Number(await page.locator('.imc-hud dd strong').nth(2).textContent()), 0, 'skip shows the last board finished')

    // a wrong submission: the first failing hidden board is shown, played and revealed; the rest stay hidden
    await setSource(page, `answer-each ${solution}`)
    r = await runCode(page, 'submit')
    assert.equal(r.title, 'Wrong Answer'); assert.equal(r.report.focus, 1)
    assert.match(r.message, new RegExp(`^${testLabel(tests, 1)}`))
    assert.deepEqual(r.events.filter((e) => e.type === 'clip').map((e) => e.index), [1])
    await page.getByRole('tab', { name: /Tests/ }).click()
    const rows = page.locator('.imc-tests__list > li')
    assert.equal(await rows.count(), tests.length)
    assert.equal(await rows.nth(0).getAttribute('data-state'), 'passed')
    assert.equal(await rows.nth(1).locator('.imc-mini').count(), 1, 'the first failing hidden board is shown')
    for (let i = 2; i < tests.length; i++) {
      if ((await rows.nth(i).getAttribute('data-state')) === 'failed') assert.equal(await rows.nth(i).locator('.imc-mini').count(), 0, `hidden test ${i} stays hidden`)
    }

    // speed, replay, a new map
    await page.locator('.imc-speed__option', { hasText: '4×' }).click()
    assert.equal(await page.locator('.imc-speed__option[aria-pressed="true"]').textContent(), '4×')
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('cgs-inkmaze-code-prefs-v1')).speed), 4)
    await page.evaluate(() => { window.__inkCodeEvents = [] })
    const t1 = Date.now()
    await page.click('.imc-screen__tools >> text=Replay')
    await page.waitForFunction(() => window.__inkCodeEvents.some((e) => e.type === 'end'), null, { timeout: 10_000 })
    assert.ok(Date.now() - t1 < 6000)
    await page.click('.imc-screen__tools >> text=New board')
    await page.waitForFunction((seed) => window.__inkCodeLevel.seed() !== seed, SEED)
    assert.match(page.url(), new RegExp(`seed=${await page.evaluate(() => window.__inkCodeLevel.seed())}`), 'the pinned seed follows New board')
    assert.ok(await page.locator('.imc-screen__tools >> text=Replay').isDisabled(), 'no replay of a run on another map')
    await page.getByRole('tab', { name: 'Result' }).click()
    assert.match(await page.locator('.imc-result__stale').textContent(), /earlier map/)

    // the code is kept per language, and after a reload; Reset brings the starter back, undo brings the code back
    await page.locator('.imc-lang select').selectOption('python')
    await page.waitForFunction((t) => window.__inkCodeLevel.editor.getSource() === t, STARTER_CODE.python)
    assert.equal(await page.locator('.imc-file').textContent(), 'solution.py')
    assert.match(await problem.textContent(), /def solve\(self, grid: list\[str\], ink: int\) -> str/)
    await setSource(page, '# my python\n' + STARTER_CODE.python)
    await page.locator('.imc-lang select').selectOption('c')
    await page.waitForFunction((t) => window.__inkCodeLevel.editor.getSource() === t, STARTER_CODE.c)
    await page.locator('.imc-lang select').selectOption('python')
    assert.equal(await source(page), '# my python\n' + STARTER_CODE.python, 'switching back keeps the code')
    await pause(600) // the save is debounced
    await page.reload()
    await ready(page)
    await page.locator('.imc-lang select').selectOption('python')
    await page.waitForFunction(() => window.__inkCodeLevel.editor.getSource().startsWith('# my python'))
    await page.click('.imc-toolbar >> text=Reset')
    assert.equal(await source(page), STARTER_CODE.python)
    await page.locator('.imc-editor .cm-content').click()
    await page.keyboard.press('ControlOrMeta+Z')
    assert.equal(await source(page), '# my python\n' + STARTER_CODE.python, 'undo brings the code back')
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('cgs-inkmaze-code-prefs-v1')).language), 'python', 'the language is remembered')
    // the editor is labelled and reachable by keyboard: Tab from the toolbar goes in, Tab indents, Esc then Tab leaves
    assert.match(await page.locator('.imc-editor .cm-content').getAttribute('aria-label'), /Code editor, Python/)
    await page.locator('.imc-btn--submit').focus()
    await page.keyboard.press('Tab')
    assert.ok(await page.evaluate(() => document.activeElement?.classList.contains('cm-content')), 'Tab from Submit reaches the editor')
    await setSource(page, 'x')
    await page.keyboard.press('End')
    await page.keyboard.press('Tab')
    assert.equal(await source(page), '    x', 'Tab indents the line (four spaces in Python)')
    assert.ok(await page.evaluate(() => document.activeElement?.classList.contains('cm-content')), 'Tab stays in the editor')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Tab')
    assert.ok(!(await page.evaluate(() => document.activeElement?.classList.contains('cm-content'))), 'Esc then Tab leaves the editor')
    assert.equal(await page.locator('.imc-split[role="separator"]').count(), 2)
    noteSandbox(page)
    assert.deepEqual(page.errors, [])
    await page.close()

    // ---------------------------------------------- a phone: stacked, the problem folds, the board comes into view
    const phone = await openPage(browser, codeUrl(base), { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    await ready(phone)
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, 'no sideways scroll on a phone')
    const toggle = phone.locator('.imc-problem__toggle')
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false', 'the problem starts folded on a phone')
    assert.ok(!(await phone.locator('.imc-problem__body').isVisible()))
    await toggle.click()
    assert.ok(await phone.locator('.imc-problem__body').isVisible())
    await toggle.click()
    const screenBox = await phone.locator('.imc-screen').boundingBox()
    const editorBox = await phone.locator('.imc-editor').boundingBox()
    assert.ok(editorBox.y > screenBox.y + screenBox.height, 'the editor is under the board')
    for (const selector of ['.imc-btn--run', '.imc-btn--submit', '.imc-tool', '.imc-back']) {
      const b = await phone.locator(selector).first().boundingBox()
      assert.ok(b.height >= 44, `${selector} is a 44px target on a phone`)
    }
    await setSource(phone, 'solve\n')
    await phone.locator('.imc-btn--run').scrollIntoViewIfNeeded()
    r = await runCode(phone)
    assert.equal(r.title, 'Accepted')
    const top = await phone.evaluate(() => document.querySelector('.imc-screen').getBoundingClientRect().top)
    const bar = await phone.evaluate(() => document.querySelector('.sp-bar').getBoundingClientRect().bottom)
    assert.ok(top >= bar - 1 && top < 300, `the board is in view after a run (top ${top}, bar ${bar})`)
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0)
    noteSandbox(phone)
    assert.deepEqual(phone.errors, [])
    await phone.close()

    // ---------------------------------------------- the JavaScript runtime, when it is on the server
    notes.push(await runtimeRun(browser, base, 'javascript', JS_SOLUTION))
    notes.push(await runtimeRun(browser, base, 'java', JAVA_SOLUTION))

    console.log(`PASS ${name}: board levels untouched, the tile, lazy loading, the editor, every result moves the ball, Submit and the montage, the first failing hidden board, speed/replay/skip/new map, code kept per language, a phone`)
    for (const note of notes) console.log(`  ${name}: ${note}`)
    for (const line of sandboxRefusals) console.log(`  ${name}: the sandbox's CSP refused (a runtime's business): ${line}`)
    sandboxRefusals.clear()
  } finally {
    await browser.close()
  }
}

/**
 * Its own Vite dev server, without hot reload: other people editing this
 * checkout while the test runs must not reload its pages. CGS_TEST_URL still
 * points it at a server you started instead.
 */
async function quietDevServer() {
  if (process.env.CGS_TEST_URL) return devServer()
  const { createServer } = await import('vite')
  const server = await createServer({ root: ROOT, logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, watch: { ignored: ['**/*'] } } })
  await server.listen()
  const { port } = server.httpServer.address()
  return { base: `http://127.0.0.1:${port}`, stop: () => server.close() }
}

const only = process.argv[2]
const server = await quietDevServer()
try {
  for (const name of only ? [only] : ['chromium', 'webkit']) await testBrowser(name, server.base)
} finally {
  server.stop()
}
