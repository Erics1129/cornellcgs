#!/usr/bin/env node
/**
 * Ink Maze level 26 (the coding level), the pure parts: the board generator,
 * the hidden tests and the properties they claim, the stdin format, the
 * stdout parser, the answer escaping, every judge verdict, the contract's
 * constants and the sandbox CSP, and one end-to-end pass through a reference
 * harness written to rules H1-H6 (problem.ts).
 *
 *   node scripts/test-inkmaze-code.mjs        (also part of `npm test`)
 *
 * Plain Node, no browser. The sandbox host and the runtimes are tested in real
 * browsers by scripts/test-inkmaze-code-sandbox.mjs (Playwright).
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { DIRECTIONS, applyMove, initialState, isWon, parseGrid } from '../src/minigames/inkmaze/engine.ts'
import { minInk } from '../src/minigames/inkmaze/solver.ts'
import {
  ANSWER_MARKER, BOARD_SIZES, ESCAPED_AT, HIDDEN_TESTS, MAP_SIZES, MAX_FLOORS, MAX_INK, MAX_SLACK, MOVE_ORDERS, PLAIN_SEARCH_BUDGET, PROBLEM, PRUNED_SEARCH_BUDGET, SIGNATURES,
  STARTER_CODE, SUBMISSION_SEARCH_BUDGET, TIME_LIMIT_MS, VERDICT_KINDS, VISIBLE_MIN_SIZE, answerLine, boardProblems,
  describeChar, describeMoves, escapeAnswer, formatStdin, judge, judgeAll, judgeRun, parseStdin, parseStdout,
  UNPRUNED_SEARCH_FLOOR, limitText, plainSearch, plainSearchCost, prunedSearchCost, randomBoard, submissionTests, timeLimitFor,
} from '../src/minigames/inkmaze/code/problem.ts'
import {
  CDN_PREFIXES, CHILD_HELLO, CODE_BASE_PATH, CODE_PROTOCOL, CONNECT, DEFAULT_LANGUAGE, HELLO, LANGUAGES, LANGUAGE_INFO, LIMITS, OUTCOME_STATUSES, RUNTIME_IDS,
  RUNTIME_INFO, RUN_STATUSES, STATUS_TITLES, isAssetPath, isRunLanguage, runtimeFor,
} from '../src/minigames/inkmaze/code/contract.ts'
import ECHO, { escapeAnswer as echoEscape } from '../public/minigames/ink-maze-code/echo/runtime.js'

const L = { up: 'U', down: 'D', left: 'L', right: 'R' }
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' }
const parLine = (board) => minInk({ grid: board.grid }).moves.map((m) => L[m]).join('')
const floorsOf = (grid) => grid.join('').split('').filter((c) => c !== '#').length
const time = (fn) => { const t = performance.now(); const value = fn(); return [value, performance.now() - t] }

/** Exhaustive: can the game still be won from `state`? (memo on position and colors, keeping the most ink seen) */
function canWin(state, { fullRollsOnly = false, noReversal = false } = {}) {
  const best = new Map()
  const go = (s, last) => {
    if (isWon(s)) return true
    if (s.ink <= 0) return false
    const key = `${s.ball}|${s.colored}|${noReversal ? last : ''}`
    if ((best.get(key) ?? -1) >= s.ink) return false
    best.set(key, s.ink)
    for (const d of DIRECTIONS) {
      if (noReversal && last && d === OPPOSITE[last]) continue
      const full = applyMove({ ...s, ink: Number.POSITIVE_INFINITY }, d).cost
      if (!full || (fullRollsOnly && full > s.ink)) continue
      if (go(applyMove(s, d).state, d)) return true
    }
    return false
  }
  return go(state, null)
}

/** Every winning line within the ink (stopping at each win), up to `cap`. */
function countWins(board, cap = 1000) {
  let wins = 0
  const go = (s) => {
    if (wins >= cap) return
    if (isWon(s)) { wins++; return }
    for (const d of DIRECTIONS) {
      const r = applyMove(s, d)
      if (r.cost) go(r.state)
    }
  }
  go(initialState(board))
  return wins
}

// ---------------------------------------------------------- the generator
{
  // deterministic: the same seed gives the same board
  for (const seed of [1, 7, 42, 1000, 99999, -5]) {
    const a = randomBoard(seed)
    const b = randomBoard(seed)
    assert.deepEqual(a.grid, b.grid, `seed ${seed} is deterministic`)
    assert.equal(a.ink, b.ink)
    assert.equal(a.id, `random-${seed}`)
  }
  assert.notDeepEqual(randomBoard(1).grid, randomBoard(2).grid, 'different seeds give different boards')
  // rows, columns and slack can be pinned, and are honoured
  for (const rows of [4, 5, 6]) {
    for (const cols of [4, 6]) {
      for (const slack of [0, 2]) {
        const board = randomBoard(rows * 100 + cols * 10 + slack, { rows, cols, slack })
        const { width, height } = parseGrid(board.grid)
        assert.equal(height, rows, `a ${rows} x ${cols} board has ${rows} rows`)
        assert.equal(width, cols, `a ${rows} x ${cols} board has ${cols} columns`)
        assert.equal(board.slack, slack, 'slack is honoured')
        assert.equal(board.ink, board.par + slack, 'ink is par + slack')
        assert.deepEqual(boardProblems(board), [], `a pinned ${rows} x ${cols} board is good`)
      }
    }
  }
  // a sweep of seeds: every visible map is valid, 5-6 a side, solvable at its
  // ink, needs at least two moves, and a plain search clears it in every order
  const slacks = new Set()
  const shapes = new Set()
  let cutShort = 0
  let slowest = 0
  let total = 0
  const SEEDS = 80
  for (let seed = 1; seed <= SEEDS; seed++) {
    const [board, ms] = time(() => randomBoard(seed))
    slowest = Math.max(slowest, ms)
    total += ms
    assert.deepEqual(boardProblems(board), [], `seed ${seed} is a good board`)
    const { width, height } = parseGrid(board.grid)
    assert.ok(width >= VISIBLE_MIN_SIZE && width <= MAP_SIZES.max && height >= VISIBLE_MIN_SIZE && height <= MAP_SIZES.max, `seed ${seed} is ${height} x ${width}`)
    shapes.add(`${height}x${width}`)
    slacks.add(board.slack)
    const best = minInk({ grid: board.grid })
    assert.equal(best.ink, board.par, `seed ${seed} par is minInk`)
    assert.ok(best.moves.length >= 2, `seed ${seed} needs at least two moves`)
    assert.ok(board.ink >= board.par && board.ink <= board.par + MAX_SLACK && board.ink <= MAX_INK, `seed ${seed} ink ${board.ink}`)
    assert.ok(floorsOf(board.grid) >= 0.5 * width * height, `seed ${seed} is at least half floor`)
    assert.equal(judge(board.grid, board.ink, parLine(board)).kind, 'accepted', `seed ${seed}: the par line wins`)
    assert.equal(judge(board.grid, board.par - 1, parLine(board)).kind, 'out_of_ink', `seed ${seed}: one drop under par is not enough`)
    assert.ok(!canWin(initialState({ grid: board.grid, ink: board.par - 1 })), `seed ${seed}: nothing wins under par`)
    assert.ok(Number.isFinite(plainSearchCost(board)), `seed ${seed}: plain search within ${PLAIN_SEARCH_BUDGET} calls`)
    let s = initialState({ grid: board.grid, ink: board.par })
    for (const m of best.moves.slice(0, -1)) s = applyMove(s, m).state
    if (applyMove(s, best.moves.at(-1)).cost < applyMove({ ...s, ink: Infinity }, best.moves.at(-1)).cost) cutShort++
  }
  assert.deepEqual([...slacks].sort(), [0, 1, 2], 'the sweep has every slack')
  assert.ok(shapes.size >= 3, `the sweep has several shapes (${[...shapes]})`)
  assert.ok(cutShort >= 3, `some maps end on a roll cut short by the ink (${cutShort})`)
  assert.ok(slowest < 2000, `randomBoard is quick enough for a click (slowest ${slowest.toFixed(0)} ms)`)
  console.log(`  generator: ${SEEDS} maps, mean ${(total / SEEDS).toFixed(1)} ms, slowest ${slowest.toFixed(0)} ms, shapes ${[...shapes].join(' ')}`)

  // bad options throw rather than returning a dud
  assert.throws(() => randomBoard(1.5), /integer/)
  assert.throws(() => randomBoard(1, { rows: 9 }), /rows must be/)
  assert.throws(() => randomBoard(1, { cols: 3 }), /cols must be/)
  assert.throws(() => randomBoard(1, { slack: 5 }), /slack must be/)
  // boardProblems names what is wrong
  assert.match(boardProblems({ grid: ['o..', '...', '...'], ink: 9 }).join(), /outside 4-6/)
  assert.match(boardProblems({ grid: ['o...', '####', '####', '####'], ink: 3 }).join(), /one roll clears it/)
  assert.match(boardProblems({ ...HIDDEN_TESTS[1], ink: 19 }).join(), /under par/)
  assert.match(boardProblems({ ...HIDDEN_TESTS[1], ink: 23 }).join(), /more than par/)
  assert.match(boardProblems({ grid: ['o.#.', '..#.', '####', '....'], ink: 9 }).join(), /no roll reaches/)
}

// ---------------------------------------------- the plain search is the engine
{
  // whatever it finds, the engine accepts, in every option and order
  const boards = [...HIDDEN_TESTS.slice(0, 6), randomBoard(3), randomBoard(4)]
  for (const board of boards) {
    for (const order of [MOVE_ORDERS[0], MOVE_ORDERS[23], MOVE_ORDERS[9]]) {
      for (const options of [{}, { prune: true }, { fullRollsOnly: true }, { noReversal: true }]) {
        const { nodes, moves } = plainSearch(board, { order, ...options })
        assert.ok(nodes > 0)
        if (moves !== null) assert.equal(judge(board.grid, board.ink, moves).kind, 'accepted', `${board.id} ${JSON.stringify(options)}: the search's line wins`)
      }
    }
    // pruning only ever saves calls
    assert.ok(plainSearch(board, { prune: true }).nodes <= plainSearch(board).nodes, `${board.id}: pruning saves calls`)
    // and under par it finds nothing (it searched everything)
    const under = plainSearch({ grid: board.grid, ink: board.par - 1 }, { cap: 5_000_000, prune: true })
    assert.equal(under.moves, null, `${board.id}: no line under par`)
  }
  // the cap is honoured
  assert.equal(plainSearch(HIDDEN_TESTS.at(-1), { cap: 10 }).nodes, Infinity, 'past the cap the search gives up')
  assert.equal(MOVE_ORDERS.length, 24)
  assert.equal(new Set(MOVE_ORDERS.map((o) => o.join(''))).size, 24, 'all 24 move orders')
}

// --------------------------------------------------------- the hidden tests
{
  const tests = HIDDEN_TESTS
  assert.ok(tests.length >= 10, `at least ten hidden tests (${tests.length})`)
  assert.ok(Object.isFrozen(tests) && tests.every((t) => Object.isFrozen(t) && Object.isFrozen(t.grid)), 'the hidden tests are frozen')
  assert.equal(new Set(tests.map((t) => t.id)).size, tests.length, 'hidden ids are unique')
  assert.equal(new Set(tests.map((t) => t.grid.join('/'))).size, tests.length, 'hidden boards are all different')
  let budget = 0
  let pruned = 0
  for (const board of tests) {
    assert.deepEqual(boardProblems(board), [], `${board.id} is a good board (par ${board.par} is minInk, ink par + 0-2)`)
    assert.ok(board.catches && board.name, `${board.id} says what it catches`)
    if (board.large) pruned += prunedSearchCost(board)
    else budget += plainSearchCost(board)
  }
  const byId = Object.fromEntries(tests.map((b) => [b.id.replace('hidden-', ''), b]))
  const shape = (b) => { const { width, height } = parseGrid(b.grid); return { width, height } }
  // the property each one claims
  assert.equal(minInk({ grid: byId['two-moves'].grid }).moves.length, 2, 'two-moves: exactly two moves')
  assert.equal(byId.corridor.slack, 0, 'corridor: exact ink')
  assert.equal(countWins(byId.corridor), 1, 'corridor: a single line of play wins')
  assert.ok(shape(byId.wide).width > shape(byId.wide).height, 'wide: more columns than rows')
  assert.ok(shape(byId.tall).height > shape(byId.tall).width, 'tall: more rows than columns')
  {
    const s = initialState(byId.corner)
    const edges = DIRECTIONS.filter((d) => { const [x, y] = [s.ball % s.width, Math.floor(s.ball / s.width)]; return (d === 'up' && y === 0) || (d === 'down' && y === s.height - 1) || (d === 'left' && x === 0) || (d === 'right' && x === s.width - 1) })
    assert.equal(edges.length, 2, 'corner: two of the four moves hit the edge')
  }
  {
    const b = byId['last-drop']
    assert.equal(b.slack, 0, 'last-drop: exact ink')
    assert.ok(canWin(initialState(b)), 'last-drop: it can be won')
    assert.ok(!canWin(initialState(b), { fullRollsOnly: true }), 'last-drop: no win without a roll cut short by the ink')
  }
  {
    const b = byId['trap-roll']
    const s = initialState(b)
    const first = DIRECTIONS.find((d) => applyMove(s, d).cost)
    assert.ok(!canWin(applyMove(s, first).state), `trap-roll: the first legal move (${L[first]}) never leads to a win`)
  }
  assert.ok(!canWin(initialState(byId['dead-ends']), { noReversal: true }), 'dead-ends: no win without rolling straight back')
  assert.ok(byId.backtrack.par / (floorsOf(byId.backtrack.grid) - 1) >= 1.7, 'backtrack: most ink goes on colored blocks')
  {
    const b = byId['open-floor']
    const { width, height } = shape(b)
    assert.ok(width * height - floorsOf(b.grid) <= 4 && b.slack === 2, 'open-floor: at most 4 walls, 2 ink to spare')
  }
  assert.ok(minInk({ grid: byId['long-way'].grid }).moves.length >= 18, 'long-way: at least 18 moves')
  {
    const b = byId['exact-ink']
    const { width, height } = shape(b)
    assert.ok(width === 6 && height === 6 && b.slack === 0, 'exact-ink: 6 x 6 on exact ink')
    assert.ok(plainSearchCost(b) >= 100_000, 'exact-ink: a plain search must look hard')
  }
  // the larger boards: the ink pruning is what clears them in time
  const large = tests.filter((b) => b.large)
  assert.deepEqual(large.map((b) => b.id), ['hidden-big-room', 'hidden-wide-hall', 'hidden-tall-tower', 'hidden-great-hall'], 'four larger boards, last')
  assert.deepEqual(tests.slice(-large.length), large, 'the larger boards run after the small ones')
  assert.deepEqual(large.map((b) => { const { width, height } = shape(b); return `${height}x${width}` }), ['7x7', '7x8', '8x7', '8x8'])
  for (const b of large) {
    assert.equal(b.slack, 0, `${b.id}: exact ink`)
    assert.ok(Number.isFinite(prunedSearchCost(b)), `${b.id}: a search with the ink pruning clears it within ${PRUNED_SEARCH_BUDGET} calls in every order`)
    assert.ok(!Number.isFinite(plainSearchCost(b, 400_000)), `${b.id}: a plain search does not clear it within 400,000 calls in any order`)
    for (const order of MOVE_ORDERS) assert.equal(plainSearch(b, { order, cap: 400_000 }).moves, null, `${b.id}: no order gets lucky`)
    assert.ok(floorsOf(b.grid) <= MAX_FLOORS)
  }
  assert.ok(UNPRUNED_SEARCH_FLOOR >= 1_000_000_000, 'the native measure behind the larger boards (scripts/inkmaze-code/plain-search.c) is over a billion calls')
  for (const b of tests.filter((t) => !t.large)) {
    const { width, height } = shape(b)
    assert.ok(Math.max(width, height) <= MAP_SIZES.max, `${b.id} is a small board`)
  }
  // every size of the range is used
  const sizes = new Set(tests.flatMap((b) => { const { width, height } = shape(b); return [width, height] }))
  assert.deepEqual([...sizes].sort(), [4, 5, 6, 7, 8], 'the hidden tests use 4 to 8 rows and columns')
  assert.ok(new Set(tests.map((b) => b.slack)).size === 3, 'the hidden tests use every slack')
  // the small boards of a submission stay a plain search's job, in every order
  assert.ok(budget + PLAIN_SEARCH_BUDGET <= SUBMISSION_SEARCH_BUDGET, `a submission's plain search cost ${budget} + the map's stays under ${SUBMISSION_SEARCH_BUDGET}`)
  console.log(`  hidden tests: ${tests.length}; small boards: plain search cost ${budget} calls; larger boards: ${pruned} calls with the ink pruning (worst order per board)`)
  // a submission runs the visible map first, then every hidden test
  const visible = randomBoard(2026)
  const subs = submissionTests(visible)
  assert.equal(subs.length, tests.length + 1)
  assert.equal(subs[0], visible, 'the visible map runs first')
}

// --------------------------------------------------------- the problem text
{
  assert.ok(PROBLEM.title && PROBLEM.statement.length >= 4, 'the problem has a title and a statement')
  assert.ok(PROBLEM.constraints.some((c) => c.includes(String(MAX_INK))), 'the constraints give the ink bound')
  assert.ok(PROBLEM.constraints.some((c) => c.includes(limitText('run')) && c.includes(limitText('submit'))), 'the constraints give the time limits')
  assert.equal(limitText('submit'), '8 seconds (Python and JavaScript: 12 seconds)', 'the submit limit, per language')
  assert.ok(PROBLEM.constraints.some((c) => c.includes(String(MAX_FLOORS))), 'the constraints give the floor bound')
  assert.ok(PROBLEM.constraints.some((c) => c.includes(`${BOARD_SIZES.min} <= rows, columns <= ${BOARD_SIZES.max}`)), 'the constraints give the sizes')
  assert.deepEqual(Object.keys(SIGNATURES).sort(), [...LANGUAGES].sort(), 'a signature per language')
  assert.deepEqual(Object.keys(STARTER_CODE).sort(), [...LANGUAGES].sort(), 'starter code per language')
  for (const language of LANGUAGES) {
    assert.ok(STARTER_CODE[language].includes('solve'), `${language} starter code defines solve`)
    assert.ok(/return ""|moves\[0\] = '\\0'/.test(STARTER_CODE[language]), `${language} starter code returns no moves`)
    assert.ok(STARTER_CODE[language].length < 2000, `${language} starter code is short`)
  }
  // the JavaScript starter really runs and returns ''
  const starter = new Function(`${STARTER_CODE.javascript}\nreturn solve`)()
  assert.equal(starter(['o...', '###.', '###.', '###.'], 6), '', 'the JavaScript starter returns no moves')
  // every example is real: the engine accepts its output on its board
  assert.ok(PROBLEM.examples.length >= 2, 'at least two worked examples')
  for (const example of PROBLEM.examples) {
    assert.equal(judge(example.grid, example.ink, example.output).kind, 'accepted', `example ${example.output} wins on its board`)
    assert.equal(example.explanation.length, example.output.length, 'the explanation has a line per move')
  }
  // describeMoves stops at the first move that goes nowhere
  const d = describeMoves({ grid: ['o...', '####', '####', '####'], ink: 9 }, 'RU')
  assert.equal(d.length, 1, 'describeMoves stops at the blocked move')
  assert.match(d[0], /^R: rolls 3 blocks right \(all new\), 6 ink left: every block is colored$/)
}

// --------------------------------------------------------- the contract
{
  assert.equal(DEFAULT_LANGUAGE, 'java', 'Java is the default')
  assert.deepEqual([...LANGUAGES], ['java', 'python', 'javascript', 'c', 'cpp'])
  for (const language of [...LANGUAGES, 'echo']) {
    const info = LANGUAGE_INFO[language]
    assert.equal(info.id, language)
    assert.ok(RUNTIME_IDS.includes(info.runtime), `${language} runs on a known runtime`)
    assert.equal(runtimeFor(language), info.runtime)
    assert.ok(isRunLanguage(language))
    assert.ok(info.timeFactor >= 1)
    assert.equal(timeLimitFor(language, 'submit'), TIME_LIMIT_MS.submit * info.timeFactor)
  }
  assert.equal(runtimeFor('c'), runtimeFor('cpp'), 'C and C++ share a toolchain')
  assert.ok(!isRunLanguage('ruby') && !isRunLanguage('__proto__') && !isRunLanguage(undefined))
  for (const runtime of Object.values(RUNTIME_INFO)) {
    assert.ok(isAssetPath(runtime.script), `${runtime.id}'s script is a clean path`)
    for (const cdn of runtime.cdn) {
      assert.ok(CDN_PREFIXES.includes(cdn), `${runtime.id}'s CDN ${cdn} is in CDN_PREFIXES`)
      assert.match(cdn, /^https:\/\/[^/]+\/.+@?\d[^/]*\/(full\/)?$/, `${cdn} pins a version in its path`)
    }
  }
  assert.ok(existsSync(new URL(`../public/${CODE_BASE_PATH}echo/runtime.js`, import.meta.url)), 'the echo runtime exists')
  assert.deepEqual(Object.keys(STATUS_TITLES).sort(), [...RUN_STATUSES].sort(), 'every status has a title')
  assert.ok(OUTCOME_STATUSES.every((s) => RUN_STATUSES.includes(s)))
  // the sandbox.html CSP lists exactly the pinned prefixes, in script-src and connect-src
  const html = readFileSync(new URL(`../public/${CODE_BASE_PATH}sandbox.html`, import.meta.url), 'utf8')
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)?.[1]
  assert.ok(csp, 'sandbox.html has a CSP')
  const directives = Object.fromEntries(csp.split(';').map((d) => d.trim().split(/\s+/)).filter((d) => d[0]).map(([name, ...values]) => [name, values]))
  assert.deepEqual(directives['default-src'], ["'none'"], "default-src 'none'")
  for (const name of ['script-src', 'connect-src']) {
    const hosts = directives[name].filter((v) => v.startsWith('https:'))
    assert.deepEqual(hosts.sort(), [...CDN_PREFIXES].sort(), `${name} allows exactly the pinned CDN prefixes`)
    assert.ok(!directives[name].some((v) => v === '*' || v === 'https:' || v === 'data:' || /\*/.test(v)), `${name} has no wildcard`)
  }
  assert.ok(directives['connect-src'].includes("'self'"), "connect-src allows 'self'")
  assert.deepEqual(directives['worker-src'], ['blob:'], 'workers only from blob:')
  assert.ok(html.includes('sandbox.js'), 'sandbox.html loads sandbox.js')
  // sandbox.js is plain JavaScript in the iframe: its copies of the contract's constants must match
  const host = readFileSync(new URL(`../public/${CODE_BASE_PATH}sandbox.js`, import.meta.url), 'utf8')
  const hostVar = (name) => host.match(new RegExp(`var ${name} = ([^\\n]+)`))?.[1]
  assert.equal(Number(hostVar('PROTOCOL')), CODE_PROTOCOL, 'sandbox.js speaks CODE_PROTOCOL')
  assert.equal(Number(hostVar('HEARTBEAT_MS')), LIMITS.heartbeatMs)
  assert.equal(Number(hostVar('HOST_GRACE_MS')), LIMITS.hostGraceMs)
  assert.equal(Number(hostVar('TICK_MS')), LIMITS.tickMs)
  assert.deepEqual(JSON.parse(hostVar('RUNTIMES').replace(/'/g, '"')), [...RUNTIME_IDS], 'sandbox.js knows every runtime id')
  assert.deepEqual(JSON.parse(hostVar('STATUSES').replace(/'/g, '"')), [...OUTCOME_STATUSES], 'sandbox.js accepts exactly the outcome statuses')
  assert.equal(JSON.parse(hostVar('CHILD_HELLO').replace(/'/g, '"')), CHILD_HELLO)
  assert.ok(host.includes(`'${HELLO}'`) && host.includes(`'${CONNECT}'`), 'sandbox.js uses the HELLO / CONNECT message types')
  assert.ok(html.includes(`sandbox.js?v=${CODE_PROTOCOL}`), 'sandbox.html loads the sandbox.js of this protocol')
  assert.ok(existsSync(new URL(`../public/${CODE_BASE_PATH}LICENSES.txt`, import.meta.url)), 'the licence notices are served with the sandbox')
  // asset paths: clean relative paths only
  for (const good of ['java/compiler.wasm', 'echo/runtime.js', 'python/harness.py', 'a-b_c.d']) assert.ok(isAssetPath(good), good)
  for (const bad of ['../secret', '/etc/passwd', 'a/../../b', '', 'a//b', './x', 'x/', 'https://evil.example/x.js', 'a\\b', 'a?b', 'x'.repeat(201), 7, null]) assert.ok(!isAssetPath(bad), String(bad))
  assert.ok(LIMITS.tests >= HIDDEN_TESTS.length + 1, 'a submission fits in one run')
  assert.ok(LIMITS.answerChars > MAX_INK + 1, 'an answer cut to answerChars is judged the same')
  assert.ok(LIMITS.recursionDepth > MAX_INK + 1, 'the recursion every runtime supports covers the deepest search')
  assert.ok(LIMITS.selfStopSlackMs < LIMITS.hostGraceMs, 'runtimes stop themselves before the host steps in')
  assert.ok(LIMITS.hostGraceMs <= 1000, 'the host steps in within 1 s of the limit')
}

// --------------------------------------------------------- stdin formatting
{
  const tests = [{ grid: ['o..#', '##.#', '....', '.###'], ink: 7 }, { grid: ['o.', '..'], ink: 3 }]
  const stdin = formatStdin(tests)
  assert.equal(stdin, '2\n4 4 7\no..#\n##.#\n....\n.###\n2 2 3\no.\n..\n', 'stdin is T, then per board "H W INK" and H rows')
  const back = parseStdin(stdin)
  assert.deepEqual(back.map((b) => b.grid), tests.map((b) => b.grid), 'round trip: grids')
  assert.deepEqual(back.map((b) => b.ink), [7, 3], 'round trip: ink')
  // H before W: a non-square board
  const wide = HIDDEN_TESTS.find((b) => b.id === 'hidden-wide')
  assert.ok(formatStdin([wide]).startsWith(`1\n4 6 ${wide.ink}\n`), 'the header is rows, then columns, then ink')
  // a whole submission round-trips
  const subs = submissionTests(randomBoard(5))
  assert.deepEqual(parseStdin(formatStdin(subs)).map((b) => [b.grid, b.ink]), subs.map((b) => [[...b.grid], b.ink]))
  // bad input
  assert.throws(() => formatStdin([]), /1-/)
  assert.throws(() => formatStdin(Array(LIMITS.tests + 1).fill({ grid: ['o.', '..'], ink: 1 })), /1-/)
  assert.throws(() => formatStdin([{ grid: ['o.', '..'], ink: 0 }]), /ink/)
  assert.throws(() => formatStdin([{ grid: ['o.', '..'], ink: 1.5 }]), /ink/)
  assert.throws(() => formatStdin([{ grid: ['o.', '.'], ink: 2 }]), /row 2/)
  assert.throws(() => formatStdin([{ grid: ['..', '..'], ink: 2 }]), /no ball/)
  assert.throws(() => formatStdin([{ grid: ['o'.padEnd(13, '.')], ink: 2 }]), /larger than 12/)
  assert.throws(() => parseStdin('2\n2 2 3\no.\n..\n'), /ended early/)
  assert.throws(() => parseStdin('1\n2 2 3\no.\n..'), /line break/)
  assert.throws(() => parseStdin('1\n2 2 3\noX\n..\n'), /bad row/)
  assert.throws(() => parseStdin('1\n2 2 3\no.\n..\nextra\n'), /extra lines/)
  assert.throws(() => parseStdin('1\n2  2 3\no.\n..\n'), /bad board header/)
}

// --------------------------------------------------------- answers and stdout
{
  // escaping (H3): control characters become visible symbols, so they can never end or cut an answer line
  assert.equal(escapeAnswer('RD\nLU'), 'RD\u240aLU', 'a line break inside an answer becomes U+240A')
  assert.equal(escapeAnswer('R\0U'), 'R\u2400U', 'NUL becomes U+2400')
  assert.equal(escapeAnswer('R\r\t\x7f'), 'R\u240d\u2409\u2421')
  assert.equal(escapeAnswer('R\ud800U\udc00'), 'R\ufffdU\ufffd', 'lone surrogates become U+FFFD')
  assert.equal(escapeAnswer('R\u{1F600}'), 'R\u{1F600}', 'a real emoji survives')
  assert.equal(escapeAnswer('R'.repeat(LIMITS.answerChars + 5)).length, LIMITS.answerChars, 'cut to answerChars')
  assert.equal(answerLine('RD\nLU'), '@@ANSWER@@ RD\u240aLU\n', 'one line per answer, always')
  assert.equal(escapeAnswer('R@@ANSWER@@ U'), `R${ESCAPED_AT}${ESCAPED_AT}ANSWER${ESCAPED_AT}${ESCAPED_AT} U`, "'@' is escaped, so an answer never holds the marker")
  assert.ok(!escapeAnswer('@@ANSWER@@').includes(ANSWER_MARKER))
  assert.equal(escapeAnswer('UDLR'), 'UDLR', 'a real answer is never changed')
  assert.match(describeChar(ESCAPED_AT), /^'@'$/, "the escaped '@' is named as '@'")
  assert.match(judge(['o...', '....', '....', '....'], 9, escapeAnswer('R@')).message, /^Move 2 is '@'/)
  // the echo runtime's harness escapes exactly like problem.ts (it is the model the runtimes copy)
  for (const sample of ['UDLR', 'R\nD', '\0', '@@ANSWER@@', 'x\ud800y', '\u{1F600}', '\x7f\x1b', 'R'.repeat(LIMITS.answerChars + 3)]) {
    assert.equal(echoEscape(sample, LIMITS.answerChars), escapeAnswer(sample), `echo escapes ${JSON.stringify(sample.slice(0, 20))} like problem.ts`)
  }

  // the plain case: one answer per board, plus the player's own prints
  const out = 'thinking...\n' + answerLine('RDLU') + 'board two\n' + answerLine('UUDD') + answerLine('')
  const p = parseStdout(out, 3)
  assert.deepEqual(p.answers, ['RDLU', 'UUDD', ''], 'answers are read in order')
  assert.equal(p.answered, 3)
  assert.equal(p.found, 3)
  assert.equal(p.console, 'thinking...\nboard two\n', 'the player prints go to the console, answer lines removed')
  assert.ok(!p.consoleTruncated && !p.answerTruncated)
  assert.equal(ANSWER_MARKER, '@@ANSWER@@')

  // player text with no line break of its own, then the harness's answer on the same line
  const p2 = parseStdout('progress' + answerLine('RD'), 1)
  assert.equal(p2.answers[0], 'RD')
  assert.equal(p2.console, 'progress\n', 'text before the marker on its line is console output')

  // too few answers: missing ones are '' and answered < expected
  const p3 = parseStdout(answerLine('RD'), 3)
  assert.deepEqual(p3.answers, ['RD', '', ''])
  assert.equal(p3.answered, 1)
  assert.equal(p3.found, 1)

  // too many answers: the extra are counted in `found` but not kept
  const p4 = parseStdout(answerLine('A') + answerLine('B') + answerLine('C'), 2)
  assert.deepEqual(p4.answers, ['A', 'B'])
  assert.equal(p4.answered, 2)
  assert.equal(p4.found, 3, 'found counts every marker line (the page flags found > T)')

  // the player printing the marker without a line break before the harness's own
  const p4b = parseStdout('@@ANSWER@@ fake' + answerLine('RD'), 1)
  assert.equal(p4b.found, 2, 'two markers on one line count twice')
  assert.equal(p4b.answers[0], 'RD', "the answer follows the last marker on a line (the harness's)")
  const p4c = parseStdout('debug: ' + '@@ANSWER@@ x'.repeat(3) + answerLine('UD'), 1)
  assert.equal(p4c.found, 4)
  assert.equal(p4c.answers[0], 'UD')
  assert.equal(p4c.console, 'debug: \n', 'text before the first marker on the line is console output')

  // NUL bytes in the console are made visible; a raw NUL in an answer stays (the judge points at it)
  const p5 = parseStdout('before\0after\n' + '@@ANSWER@@ RD\0LU\n', 1)
  assert.equal(p5.answers[0], 'RD\0LU', 'NUL stays in the answer')
  assert.equal(p5.console, 'before\u2400after\n', 'a NUL in console output is shown as U+2400')
  assert.match(judge(['o...', '....', '....', '....'], 9, p5.answers[0]).message, /NUL/)
  assert.match(judge(['o...', '....', '....', '....'], 9, escapeAnswer('RD\0')).message, /NUL/, 'the escaped NUL is still named')
  assert.match(judge(['o...', '....', '....', '....'], 9, escapeAnswer('RD\n')).message, /line break/)

  // a carriage return before the line break is dropped, in answers and in the console
  assert.equal(parseStdout('@@ANSWER@@ RDLU\r\n', 1).answers[0], 'RDLU', 'a trailing CR is dropped')
  assert.equal(parseStdout('hello\r\n', 1).console, 'hello\n')
  // a marker without the space, and a near-miss that is just text
  assert.equal(parseStdout('@@ANSWER@@RD\n', 1).answers[0], 'RD')
  const p9 = parseStdout('@@ANSWER but not\n' + answerLine('RD'), 1)
  assert.equal(p9.answers[0], 'RD')
  assert.equal(p9.found, 1)
  assert.ok(p9.console.includes('@@ANSWER but not'))
  // empty stdout: all answers empty, nothing answered
  const p10 = parseStdout('', 2)
  assert.deepEqual(p10.answers, ['', ''])
  assert.equal(p10.answered, 0)
  assert.equal(p10.found, 0)
  assert.equal(p10.console, '')
  // the last line may lack its line break
  assert.equal(parseStdout(answerLine('RD') + 'tail', 1).console, 'tail')

  // floods: a huge single line, a million short lines, a million fake markers; all linear and capped
  const huge = 'x'.repeat(5 * 1024 * 1024)
  const [p6, ms6] = time(() => parseStdout(answerLine('RD') + huge, 1))
  assert.equal(p6.answers[0], 'RD', 'the answer before a flood is kept')
  assert.ok(p6.consoleTruncated, 'a flood truncates the console')
  assert.equal(p6.console.length, LIMITS.consoleChars, 'the console is capped')
  const [p7, ms7] = time(() => parseStdout('line\n'.repeat(1_000_000) + answerLine('RD'), 1))
  assert.equal(p7.answers[0], 'RD', 'an answer after a million console lines is found')
  assert.ok(p7.consoleTruncated && p7.console.length <= LIMITS.consoleChars)
  const [p8, ms8] = time(() => parseStdout(answerLine('RD') + answerLine('UU').repeat(500_000), 1))
  assert.equal(p8.answers[0], 'RD')
  assert.equal(p8.found, 500_001)
  const [p11, ms11] = time(() => parseStdout('@@ANSWER@@ ' + 'R'.repeat(3_000_000), 1))
  assert.equal(p11.answers[0].length, LIMITS.answerChars, 'a very long answer is cut')
  assert.ok(p11.answerTruncated)
  for (const [name, ms] of [['huge line', ms6], ['1M lines', ms7], ['500k markers', ms8], ['3M answer', ms11]]) assert.ok(ms < 1500, `${name} parses in ${ms.toFixed(0)} ms`)
}

// --------------------------------------------------------- the judge
{
  const board = HIDDEN_TESTS.find((b) => b.id === 'hidden-last-drop')
  const line = parLine(board)
  const verdicts = new Set()
  const check = (v) => { verdicts.add(v.kind); assert.ok(v.message.length > 10, `${v.kind} has a message`); return v }

  // accepted, and the steps are the engine's own moves
  const ok = check(judge(board.grid, board.ink, line))
  assert.equal(ok.kind, 'accepted')
  assert.equal(ok.moves, line.length)
  assert.equal(ok.steps.length, line.length, 'every move is a step')
  let s = initialState(board)
  for (const step of ok.steps) {
    const r = applyMove(s, step.direction)
    assert.deepEqual(step.result, r, 'each step is applyMove')
    assert.equal(L[step.direction], step.letter)
    s = r.state
  }
  assert.ok(isWon(ok.final) && ok.blocksLeft === 0 && ok.inkUsed === board.ink)
  assert.match(ok.message, /^Accepted/)

  // empty
  const empty = check(judge(board.grid, board.ink, ''))
  assert.equal(empty.kind, 'empty')
  assert.equal(empty.message, 'Your code returned no moves, so the ball never moved.')
  assert.equal(empty.steps.length, 0)
  assert.equal(empty.inkUsed, 0)

  // bad_char: checked over the whole answer before any move is played
  const bad = check(judge(board.grid, board.ink, line[0] + 'x' + line.slice(1)))
  assert.equal(bad.kind, 'bad_char')
  assert.equal(bad.index, 1)
  assert.equal(bad.char, 'x')
  assert.equal(bad.steps.length, 0, 'no move is played when a character is bad')
  assert.match(bad.message, /^Move 2 is 'x'/)
  assert.match(judge(board.grid, board.ink, 'r').message, /capital/)
  assert.match(judge(board.grid, board.ink, 'R U').message, /a space/)
  assert.match(judge(board.grid, board.ink, 'R\tU').message, /tab/)
  assert.equal(judge(board.grid, board.ink, 'R\u{1F600}').char, '\u{1F600}', 'an emoji is one character')
  assert.match(describeChar('\u0085'), /control character U\+0085/)
  assert.match(describeChar('\u2401'), /U\+0001/)
  assert.match(describeChar('\ufffd'), /invalid/)
  assert.equal(describeChar('"'), `'"'`)

  // blocked: a move that does not move the ball, against a wall or the edge
  const wallBoard = ['o...', '####', '....', '....']
  const blocked = check(judge(wallBoard, 20, 'D'))
  assert.equal(blocked.kind, 'blocked')
  assert.equal(blocked.index, 0)
  assert.equal(blocked.letter, 'D')
  assert.equal(blocked.against, 'wall')
  assert.equal(blocked.message, 'Move 1 (D) does not move the ball: the block below it is a wall.')
  const edge = check(judge(['o...', '....', '....', '....'], 20, 'RU'))
  assert.equal(edge.kind, 'blocked')
  assert.equal(edge.index, 1, 'the second move is the blocked one')
  assert.equal(edge.against, 'edge')
  assert.equal(edge.steps.length, 1, 'the first move was played')
  assert.match(edge.message, /^Move 2 \(U\) does not move the ball: the edge of the board is above it/)

  // out_of_ink: the ink runs out with blocks left, at the end of a roll or in the middle
  const short = check(judge(board.grid, 3, line))
  assert.equal(short.kind, 'out_of_ink')
  assert.ok(short.blocksLeft > 0)
  assert.equal(short.final.ink, 0)
  const atEnd = check(judge(['o...', '....', '....', '....'], 3, 'RD'))
  assert.equal(atEnd.kind, 'out_of_ink')
  assert.equal(atEnd.index, 0)
  assert.equal(atEnd.cutShort, false, 'a full roll that empties the pot')
  assert.match(atEnd.message, /at the end of move 1 \(R\)/)
  const midRoll = check(judge(['o...', '....', '....', '....'], 2, 'R'))
  assert.equal(midRoll.kind, 'out_of_ink')
  assert.equal(midRoll.cutShort, true, 'a roll cut short by the ink is flagged')
  assert.match(midRoll.message, /in the middle of move 1/)

  // unfinished: every move played, ink left, blocks still uncolored
  const unfinished = check(judge(board.grid, board.ink, line[0]))
  assert.equal(unfinished.kind, 'unfinished')
  assert.ok(unfinished.inkLeft > 0 && unfinished.blocksLeft > 0)
  assert.equal(unfinished.inkLeft, unfinished.final.ink)

  // extra_moves: moves after the floor is fully colored
  const extra = check(judge(board.grid, board.ink + 10, line + 'UD'))
  assert.equal(extra.kind, 'extra_moves')
  assert.equal(extra.index, line.length)
  assert.equal(extra.extra, 2)
  assert.match(extra.message, /2 more moves/)
  assert.equal(extra.steps.length, line.length, 'the winning moves were played')

  // the last block colored with the last drop wins (not out_of_ink)
  assert.equal(judge(['o..#', '####', '####', '####'], 2, 'R').kind, 'accepted', 'coloring the last block with the last drop wins')
  assert.deepEqual([...verdicts].sort(), [...VERDICT_KINDS].sort(), 'every verdict kind was produced')
}

// --------------------------------------------------------- judgeAll / judgeRun
{
  const tests = HIDDEN_TESTS.slice(0, 4)
  const good = tests.map(parLine)
  const all = judgeAll(tests, good)
  assert.ok(all.accepted)
  assert.equal(all.passed, tests.length)
  assert.equal(all.total, tests.length)
  assert.equal(all.firstFailure, -1)
  const mixed = [...good]
  mixed[2] = ''
  const some = judgeAll(tests, mixed)
  assert.ok(!some.accepted)
  assert.equal(some.passed, tests.length - 1)
  assert.equal(some.firstFailure, 2, 'the first failing board is reported')
  assert.equal(some.verdicts[2].kind, 'empty')
  assert.equal(judgeAll(tests, good.slice(0, 2)).verdicts[3].kind, 'empty', 'a missing answer is judged empty')
  assert.equal(judgeRun(tests, { status: 'ok', answers: good }).accepted, true)
  assert.equal(judgeRun(tests, { status: 'runtime_error', answers: good }), null, 'a run that did not finish is not judged')
}

// ------------------------------------------- end to end: a harness to H1-H6
{
  /** A reference harness, written to problem.ts's rules H1-H6, for JavaScript. */
  function harness(Solve, stdin, write) {
    const boards = parseStdin(stdin) // H1: all of stdin first
    boards.forEach((board, t) => {
      const grid = [...board.grid] // H2: a private copy
      const moves = Solve(grid, board.ink)
      if (moves !== null && moves !== undefined && typeof moves !== 'string') {
        throw Object.assign(new TypeError(`solve() must return a string, not ${typeof moves}`), { test: t })
      }
      write(answerLine(moves ?? '')) // H3
    })
  }
  /** What a player writes: a depth-first search with the ink pruning (the hint the larger hidden boards need), no memo. */
  function playerSolve(grid, ink) {
    const rows = grid.length
    const cols = grid[0].length
    const colored = grid.map((row) => [...row].map((c) => c === 'o'))
    let floors = 0
    let r0 = 0
    let c0 = 0
    grid.forEach((row, r) => [...row].forEach((ch, c) => { if (ch !== '#') floors++; if (ch === 'o') { r0 = r; c0 = c } }))
    const moves = []
    const dfs = (r, c, count, left) => {
      if (count === floors) return true
      if (left <= 0 || left < floors - count) return false
      for (const [name, dr, dc] of [['U', -1, 0], ['D', 1, 0], ['L', 0, -1], ['R', 0, 1]]) {
        let nr = r + dr
        let nc = c + dc
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols || grid[nr][nc] === '#') continue
        const painted = []
        let spent = 0
        let er = r
        let ec = c
        while (nr >= 0 && nc >= 0 && nr < rows && nc < cols && grid[nr][nc] !== '#' && spent < left) {
          if (!colored[nr][nc]) { colored[nr][nc] = true; painted.push([nr, nc]) }
          spent++
          er = nr
          ec = nc
          nr += dr
          nc += dc
        }
        moves.push(name)
        if (dfs(er, ec, count + painted.length, left - spent)) return true
        moves.pop()
        for (const [pr, pc] of painted) colored[pr][pc] = false
      }
      return false
    }
    return dfs(r0, c0, 1, ink) ? moves.join('') : ''
  }
  const tests = submissionTests(randomBoard(77))
  let stdout = ''
  const [, ms] = time(() => harness(playerSolve, formatStdin(tests), (text) => { stdout += text }))
  const parsed = parseStdout(stdout, tests.length)
  assert.equal(parsed.found, tests.length, 'one answer line per board')
  const verdict = judgeAll(tests, parsed.answers)
  assert.ok(verdict.accepted, `a brute force with the ink pruning passes every board (${verdict.verdicts.map((v) => v.kind).join(' ')})`)
  console.log(`  end to end: a JavaScript search with the ink pruning clears the ${tests.length} boards of a submission in ${ms.toFixed(0)} ms (V8)`)

  // the starter code: every board 'empty'
  let starterOut = ''
  const starter = new Function(`${STARTER_CODE.javascript}\nreturn solve`)()
  harness(starter, formatStdin(tests), (text) => { starterOut += text })
  const starterVerdict = judgeAll(tests, parseStdout(starterOut, tests.length).answers)
  assert.ok(starterVerdict.verdicts.every((v) => v.kind === 'empty'), 'the starter code makes no move on any board')
  // a solve that returns a line break inside its answer cannot fake two answers
  let tricky = ''
  harness(() => 'RD\n@@ANSWER@@ UU', formatStdin(tests.slice(0, 1)), (text) => { tricky += text })
  const trickyParsed = parseStdout(tricky, 1)
  assert.equal(trickyParsed.found, 1, 'an answer with a line break stays one answer')
  assert.equal(judge(tests[0].grid, tests[0].ink, trickyParsed.answers[0]).kind, 'bad_char')
  // a non-string return is the harness's TypeError
  assert.throws(() => harness(() => 42, formatStdin(tests.slice(0, 1)), () => {}), /must return a string, not number/)
}

// ------------------------- the echo runtime in Node, against a minimal RunIO
{
  /** The smallest RunIO that follows contract.ts (D1-D6), for driving a runtime's run() outside a browser. */
  function nodeIO(job) {
    class LimitError extends Error { constructor(limit, message) { super(message || limit); this.name = 'LimitError'; this.limit = limit } }
    const t0 = performance.now()
    let runDeadline = Infinity
    let started = false
    let limit = null
    let chars = 0
    const streams = { stdout: '', stderr: '' }
    const deadline = () => (started ? runDeadline : t0 + job.compileLimitMs)
    const write = (stream, text) => {
      if (limit) throw new LimitError(limit)
      if (chars + text.length > job.outputLimit) { limit = 'output_limit'; throw new LimitError(limit) }
      chars += text.length
      streams[stream] += text
    }
    const io = {
      job, LimitError, streams,
      stdout: (t) => write('stdout', String(t)), stderr: (t) => write('stderr', String(t)),
      started() { if (!started) { started = true; runDeadline = performance.now() + job.timeLimitMs } },
      check() { if (limit) throw new LimitError(limit); if (performance.now() > deadline()) { limit = 'time_limit'; throw new LimitError(limit) } },
      now: () => performance.now(), timeLeft: () => deadline() - performance.now(),
      hit(l) { limit ??= l },
      get deadline() { return deadline() }, get deadlineEpochMs() { return performance.timeOrigin + deadline() }, get limit() { return limit },
    }
    return io
  }
  const job = (source, tests, extra = {}) => ({
    runId: 'node', language: 'echo', kind: 'run', source, stdin: formatStdin(tests), tests: tests.length,
    timeLimitMs: 4000, compileLimitMs: LIMITS.compileMs, memoryLimitBytes: LIMITS.memoryBytes, outputLimit: LIMITS.outputChars,
    answerChars: LIMITS.answerChars, recursionDepth: LIMITS.recursionDepth, ...extra,
  })
  const run = async (source, tests, extra) => {
    const j = job(source, tests, extra)
    const io = nodeIO(j)
    let outcome
    try { outcome = await ECHO.run(j, io) } catch (error) { outcome = { status: error.limit ?? 'crashed', thrown: error } }
    return { outcome, parsed: parseStdout(io.streams.stdout, tests.length), io }
  }
  const tests = submissionTests(randomBoard(31))
  const solved = await run('solve', tests)
  assert.equal(solved.outcome.status, 'ok')
  assert.equal(solved.parsed.found, tests.length, 'the echo harness prints one answer line per board')
  assert.ok(judgeAll(tests, solved.parsed.answers).accepted, "the echo runtime's reference search passes a whole submission")
  const blank = await run('', tests.slice(0, 2))
  assert.deepEqual(blank.parsed.answers, ['', ''], 'a blank echo program answers every board with no moves')
  const printed = await run('print hello\nwarn careful\nanswer-each RD', tests.slice(0, 2))
  assert.equal(printed.parsed.console, 'hello\n')
  assert.equal(printed.io.streams.stderr, 'careful\n')
  const fake = await run('fake-answer RD\nsolve', tests.slice(0, 1))
  assert.equal(fake.parsed.found, 2, 'a printed marker is counted (the page calls this crashed)')
  const early = await run('exit-early', tests.slice(0, 3))
  assert.equal(early.outcome.status, 'ok')
  assert.equal(early.parsed.answered, 2, 'exit-early answers one board too few (the page calls this crashed)')
  const spin = await run('spin', tests.slice(0, 1), { timeLimitMs: 60 })
  assert.equal(spin.outcome.status, 'time_limit', 'spin stops at its own deadline through io.check()')
  const caught = await run('spin-catch', tests.slice(0, 1), { timeLimitMs: 60 })
  assert.equal(caught.outcome.status, 'time_limit', 'a swallowed LimitError comes back at the next check (sticky)')
  const wasm = await run('spin-wasm', tests.slice(0, 1), { timeLimitMs: 60 })
  assert.equal(wasm.outcome.status, 'time_limit', 'a WebAssembly loop that calls io.check() stops itself')
  const flood = await run('flood', tests.slice(0, 1), { outputLimit: 10_000 })
  assert.equal(flood.outcome.status, 'output_limit')
  const compile = await run('compile-error missing semicolon', tests.slice(0, 1))
  assert.equal(compile.outcome.status, 'compile_error')
  assert.equal(compile.outcome.diagnostics[0].line, 1)
}

console.log(`PASS ink maze code: generator, ${HIDDEN_TESTS.length} hidden tests and their claims, stdin, stdout parsing, escaping, all ${VERDICT_KINDS.length} verdicts, contract, end to end`)
