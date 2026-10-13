#!/usr/bin/env node
/*
 * Ink Maze level 26: the Java runtime (TeaVM-javac on WebAssembly GC, with the
 * Ink Maze guard) in real browsers.
 *
 *   node scripts/inkmaze-code/test-runtime-java.mjs           both engines, own Vite server
 *   node scripts/inkmaze-code/test-runtime-java.mjs webkit    one engine
 *   CGS_TEST_URL=http://localhost:5190 node scripts/inkmaze-code/test-runtime-java.mjs
 *
 * Needs Playwright (CGS_PLAYWRIGHT_MODULE, see scripts/inkmaze-code-browser.mjs)
 * and the repo's Node 24. Not part of `npm test` (it drives browsers; 6-7 minutes
 * per engine on a busy machine). The toolchain files are rebuilt with
 * scripts/inkmaze-code/build/java/build.sh (see its PROVENANCE.txt).
 *
 * It proves, against sandbox.ts + problem.ts and the production runtime in
 * public/minigames/ink-maze-code/java/:
 *   - lazy cold load (no request before load(), nothing from a CDN), its
 *     download size and time, warm compile + run times, memory;
 *   - the reference and the naive solution clear a full submission (the visible
 *     map and the 12 hidden tests), accepted by the engine; the starter code
 *     gives the 'empty' verdict;
 *   - compile errors with javac's line and column, every signature / package /
 *     interop rule, library parts TeaVM cannot build;
 *   - runtime errors with the type, the board and (Chromium) the line;
 *     catchable ArrayIndexOutOfBounds / ArithmeticException; exit(); prints;
 *     the answer marker and harness tampering;
 *   - everyday Java (records, sealed types, pattern switches, streams,
 *     collections, lambdas...) prints what a JVM prints, and the class
 *     library's known gaps (%f, %n, EnumMap, Integer::sum, groupingBy with a
 *     map factory) end as clean errors;
 *   - every runaway is stopped by the program's own guard (stoppedBy
 *     'runtime', never 'host'), the next run works, and the browser's CPU is
 *     back to idle within ~1 s of the limit, WebKit included: tight loops,
 *     loops in catch / finally / deep recursion, exponential recursion, a
 *     thread, sleeping, wait() forever, threads ping-ponging, big copies, a
 *     lying comparator, output floods, allocation bombs (big, small,
 *     multi-dimensional, string doubling, clone, reflection, Base64 in the
 *     library's helper code), one long library call stopped halfway, compile
 *     bombs (javac's memory, the compile deadline), cancel;
 *   - a positive control (an unchecked WebAssembly loop, run last) shows the
 *     meter sees the sandbox's threads.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { STARTER_CODE, judgeAll, randomBoard, submissionTests } from '../../src/minigames/inkmaze/code/problem.ts'
import { LIMITS } from '../../src/minigames/inkmaze/code/contract.ts'
import { cpuMeter, devServer, launch, openCodePage, pause, runOnPage } from '../inkmaze-code-browser.mjs'
import { checkConsistency } from '../../src/minigames/inkmaze/code/runtimes/java.ts'

assert.deepEqual(checkConsistency(), [], 'contract.ts / problem.ts agree with the Java runtime')

const SOL = fileURLToPath(new URL('./solutions/', import.meta.url))
const REF = readFileSync(SOL + 'java-reference.java', 'utf8')
const NAIVE = readFileSync(SOL + 'java-naive.java', 'utf8')

const names = process.argv.slice(2).filter((a) => !a.startsWith('-'))
const BROWSERS = names.length ? names : ['chromium', 'webkit']
/** cores above the idle reading that still count as "stopped" (GC, the sandbox restarting a worker) */
const CPU_SLACK = 0.3

const visible = randomBoard(7)
const ONE = [{ grid: visible.grid, ink: visible.ink }]
const SUBMIT = submissionTests(visible).map((b) => ({ grid: b.grid, ink: b.ink }))
const THREE = SUBMIT.slice(0, 3)

/** a Solution whose solve() has this body */
const solve = (body, extra = '') => `import java.util.*;\n\nclass Solution {\n${extra}\n    public String solve(String[] grid, int ink) {\n${body}\n    }\n}\n`
/** a Solution that runs `body` (with the stream and function imports too) and returns no moves */
const snippet = (body, extra = '') => `import java.util.*;\nimport java.util.function.*;\nimport java.util.stream.*;\n\nclass Solution {\n${extra}\n    public String solve(String[] grid, int ink) {\n        ${body}\n        return "";\n    }\n}\n`

/** Programs that must be stopped by the guard (status, and the CPU back to idle after). */
const RUNAWAYS = {
  'tight loop': ['time_limit', solve('        long x = 0;\n        while (true) { x++; }')],
  'loop in catch and finally': ['time_limit', solve('        while (true) {\n            try { while (true) { } } catch (Throwable t) { while (true) { } } finally { while (true) { } }\n        }')],
  'loop that catches everything': ['time_limit', solve('        while (true) {\n            try { int[] a = new int[1]; a[5] = 1; } catch (Throwable t) { }\n        }')],
  'loop at the bottom of a recursion': ['time_limit', solve('        dive(150);\n        return "";', '    void dive(int n) { if (n == 0) { while (true) { } } dive(n - 1); }')],
  'loop in a finally after a throw': ['time_limit', solve('        try { f(); } catch (Throwable t) { }\n        return "";', '    void f() { try { throw new RuntimeException("x"); } finally { long x = 0; while (true) { x++; } } }')],
  'exponential recursion, no loop': ['time_limit', solve('        return "" + f(60);', '    long f(int n) { return n == 0 ? 1 : f(n - 1) + f(n - 1); }')],
  'a thread that spins (join)': ['time_limit', solve('        Thread t = new Thread(() -> { long x = 0; while (true) { x++; } });\n        t.start();\n        try { t.join(); } catch (InterruptedException e) { }\n        return "";')],
  'sleeping forever': ['time_limit', solve('        try { Thread.sleep(1000000); } catch (InterruptedException e) { }\n        return "";')],
  'huge array copies': ['time_limit', solve('        long[] a = new long[1 << 24];\n        while (a.length > 0) System.arraycopy(a, 0, a, 1, a.length - 1);\n        return "";')],
  // library code the player drives without bound (the class library carries the same ticks)
  'a stream over 2^63 numbers': ['time_limit', solve('        return "" + java.util.stream.LongStream.range(0, Long.MAX_VALUE).sum();')],
  'regex backtracking': ['time_limit', solve('        return "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!".matches("(a+)+b") ? "x" : "";')],
  'joining 2^31 copies': ['time_limit', solve('        return "" + String.join("", Collections.nCopies(Integer.MAX_VALUE, "x")).length();')],
  'Arrays.fill forever': ['time_limit', solve('        long[] a = new long[1 << 24];\n        while (true) Arrays.fill(a, 1L);')],
  'output flood': ['output_limit', solve('        while (true) System.out.println("flooding the console with text");')],
  'allocation bomb (8 MiB arrays)': ['memory_limit', solve('        List<long[]> keep = new ArrayList<>();\n        while (true) keep.add(new long[1 << 20]);')],
  'allocation bomb (small objects)': [['memory_limit', 'time_limit'], solve('        List<Object> keep = new ArrayList<>();\n        while (keep.size() >= 0) keep.add(new long[16]);\n        return "";')],
  'one huge multi-dimensional array': ['memory_limit', solve('        long[][][] a = new long[512][512][512];\n        return "" + a.length;')],
  'string doubling': ['memory_limit', solve('        String s = "x";\n        while (s.length() > 0) s = s + s;\n        return s;')],
  'clone bomb': ['memory_limit', solve('        long[] a = new long[1 << 20];\n        List<long[]> keep = new ArrayList<>();\n        while (keep.size() >= 0) keep.add(a.clone());\n        return "";')],
  'reflection bomb': ['memory_limit', solve('        List<Object> keep = new ArrayList<>();\n        while (keep.size() >= 0) keep.add(java.lang.reflect.Array.newInstance(long.class, 1 << 20));\n        return "";')],
  // java.util.Base64 does its work (and allocates its result) in TeaVM's helper org.teavm.classlib.impl.Base64Impl:
  // before the guard covered that package, each call was one unchecked loop and an unmetered array (4.5 GB, host stop)
  'Base64 encode bomb (library helper code)': [['memory_limit', 'time_limit'], solve('        byte[] a = new byte[180 << 20];\n        List<byte[]> keep = new ArrayList<>();\n        while (true) keep.add(Base64.getEncoder().encode(a));')],
  'Base64 decode bomb': [['memory_limit', 'time_limit'], solve('        byte[] a = new byte[200 << 20];\n        Arrays.fill(a, (byte) 65);\n        List<byte[]> keep = new ArrayList<>();\n        while (true) keep.add(Base64.getDecoder().decode(a));')],
  // objects that also hold JavaScript memory (a stack trace, a WeakRef, a fiber): charged extra
  'exception bomb': [['memory_limit', 'time_limit'], solve('        List<Throwable> keep = new ArrayList<>();\n        while (keep.size() >= 0) keep.add(new RuntimeException("kept"));\n        return "";')],
  'thread bomb': [['memory_limit', 'time_limit'], solve('        while (true) new Thread(() -> { }).start();')],
  'throwing and catching forever': ['time_limit', solve('        while (true) { try { throw new IllegalStateException("again"); } catch (IllegalStateException e) { } }')],
  // green threads: parked forever, or handing the turn back and forth forever
  'wait() with no notify': ['time_limit', solve('        Object lock = new Object();\n        synchronized (lock) { try { lock.wait(); } catch (InterruptedException e) { } }\n        return "";')],
  'two threads ping-ponging forever': ['time_limit', solve('        final Object lock = new Object();\n        Thread t = new Thread(() -> { synchronized (lock) { while (true) { lock.notify(); try { lock.wait(); } catch (InterruptedException e) { } } } });\n        t.start();\n        synchronized (lock) { while (true) { lock.notify(); try { lock.wait(); } catch (InterruptedException e) { } } }')],
  'a sort whose comparator lies': ['time_limit', solve('        Integer[] a = new Integer[100000];\n        for (int i = 0; i < a.length; i++) a[i] = i;\n        Random r = new Random(1);\n        while (true) Arrays.sort(a, (x, y) -> r.nextInt(3) - 1);')],
}

/**
 * Everyday Java a solution may use, with the exact console output a JVM prints. Each must compile and run as on
 * a JVM. (Records, sealed types, pattern switches, text blocks, local enums, streams, collections, lambdas.)
 */
const FEATURES = {
  'records as HashMap keys, toString': ['record P(int r, int c) { }\n        var map = new HashMap<P, Integer>(); map.put(new P(1, 2), 3);\n        System.out.println(map.get(new P(1, 2)) + " " + new P(1, 2));', '3 P[r=1, c=2]'],
  'sealed interface + pattern switch': ['Shape sh = ink >= 0 ? new Sq(2) : new Ci(3);\n        System.out.println(switch (sh) { case Sq s -> s.s() * s.s(); case Ci c -> 3 * c.r() * c.r(); });', '4', '    sealed interface Shape permits Sq, Ci { }\n    record Sq(int s) implements Shape { }\n    record Ci(int r) implements Shape { }'],
  'deque, priority queue, text block, instanceof pattern': ['var dq = new ArrayDeque<Integer>(); dq.push(1); dq.addLast(2);\n        var pq = new PriorityQueue<int[]>((a, b) -> Integer.compare(a[0], b[0])); pq.add(new int[]{5}); pq.add(new int[]{1});\n        String text = """\n            text block\n            """;\n        Object o = text;\n        System.out.println(dq + " " + pq.poll()[0] + " " + text.strip() + " " + (o instanceof String s && !s.isEmpty() ? s.length() : -1));', '[1, 2] 1 text block 11'],
  'local enum, switch expression, yield': ['enum Dir { U, D, L, R }\n        StringBuilder sb = new StringBuilder();\n        for (Dir d : Dir.values()) sb.append(switch (d) { case U -> \'u\'; case D -> { yield \'d\'; } default -> d.name().charAt(0); });\n        System.out.println(sb + " " + Dir.valueOf("L").ordinal());', 'udLR 2'],
  'streams and collectors': ['System.out.println(IntStream.range(0, 5).boxed().map(String::valueOf).collect(Collectors.joining(",")) + " " + Stream.of("a", "bb", "cc").collect(Collectors.groupingBy(String::length)) + " " + Arrays.stream(new int[]{5, 3, 1}).sorted().boxed().toList());', '0,1,2,3,4 {1=[a], 2=[bb, cc]} [1, 3, 5]'],
  'collections: computeIfAbsent, merge, TreeMap, BitSet, LinkedList': ['Map<String, List<Integer>> m = new HashMap<>(); m.computeIfAbsent("k", k -> new ArrayList<>()).add(1);\n        Map<Character, Integer> c = new TreeMap<>(); for (char ch : "aab".toCharArray()) c.merge(ch, 1, (x, y) -> x + y);\n        BitSet bs = new BitSet(); bs.set(3);\n        List<String> l = new LinkedList<>(List.of("a", "b")); ListIterator<String> it = l.listIterator(); while (it.hasNext()) if (it.next().equals("a")) it.set("z");\n        TreeMap<String, Integer> tm = new TreeMap<>(Comparator.reverseOrder()); tm.put("a", 1); tm.put("b", 2);\n        System.out.println(m + " " + c + " " + bs + " " + l + " " + tm.firstKey());', '{k=[1]} {a=2, b=1} {3} [z, b] b'],
  'numbers and strings': ['System.out.println(Long.bitCount(0xF0F0L) + " " + Long.toBinaryString(5) + " " + Math.floorMod(-7, 3) + " " + "abc".repeat(2) + " " + Long.parseLong("-123") + " " + Double.parseDouble("1e3") + " " + (0.1 + 0.2) + " " + String.format("%05d|%x|%s|%-3s|", 42, 255, "z", "y") + " " + "%d-%s".formatted(1, "x") + " " + Objects.hash(1, 2, 3) + " " + Arrays.deepToString(new int[][]{{1}, {2}}) + " " + String.join(",", "a,b,,c".split(",")));', '8 101 2 abcabc -123 1000.0 0.30000000000000004 00042|ff|z|y  | 1-x 30817 [[1], [2]] a,b,,c'],
  'generics, varargs, inner and anonymous classes, custom exceptions': ['Runnable r = new Runnable() { public void run() { System.out.print("ran "); } }; r.run();\n        try { throw new Oops("bad"); } catch (Oops e) { System.out.print(e.getMessage() + " "); } finally { System.out.print("fin "); }\n        System.out.println(max(List.of(3, 9, 2)) + " " + sum(1, 2, 3) + " " + new Inner().v());', 'ran bad fin 9 6 5', '    static class Oops extends Exception { Oops(String m) { super(m); } }\n    class Inner { int v() { return 5; } }\n    static <T extends Comparable<T>> T max(List<T> xs) { T best = xs.get(0); for (T x : xs) if (x.compareTo(best) > 0) best = x; return best; }\n    static int sum(int... xs) { int s = 0; for (int x : xs) s += x; return s; }'],
  'HashMap<Long, Integer> with 100,000 keys': ['HashMap<Long, Integer> best = new HashMap<>(); for (long i = 0; i < 100000; i++) best.put(i * 64 + 3, (int) i);\n        System.out.println(best.get(64L * 99999 + 3) + " " + best.size());', '99999 100000'],
}

/**
 * A legitimate program that pulls in most of the class library a solution could touch: TeaVM allocates about
 * 2.7 GiB (garbage included) to build it, which the old 2 GiB compile budget refused.
 */
const LIBRARY_HEAVY = snippet(`System.out.println(String.format("%05d|%x|%s|%-3s|%o|%c|%b|%,d|%+d", 42, 255, "z", "y", 8, 'q', true, 1234567, 5));
        System.out.println(String.valueOf(3.25f) + Double.toString(1e-9) + Float.parseFloat("2.5") + Math.sqrt(2) + Math.pow(2, 0.5) + Math.atan2(1, 2));
        System.out.println(new java.math.BigInteger("123456789012345678901234567890").pow(3).mod(java.math.BigInteger.valueOf(97)));
        System.out.println(new java.math.BigDecimal("1.25").multiply(new java.math.BigDecimal("3")).toPlainString());
        System.out.println("a1b22c333".replaceAll("[0-9]+", "#") + java.util.regex.Pattern.compile("(\\\\w)(\\\\d)").matcher("x1").matches());
        System.out.println(IntStream.range(0, 9).boxed().collect(Collectors.groupingBy(i -> i % 3)) + "" + Stream.of("b", "a").sorted().collect(Collectors.toList()) + LongStream.rangeClosed(1, 5).reduce(1, (a, b) -> a * b));
        System.out.println(new TreeMap<>(Map.of(1, 2)) + "" + new LinkedHashMap<>(Map.of(3, 4)) + new TreeSet<>(Set.of(5)) + new ArrayDeque<>(List.of(6)) + new PriorityQueue<>(List.of(7)) + new Hashtable<>(Map.of(8, 9)) + new Vector<>(List.of(1)) + new Stack<Integer>());
        System.out.println(Arrays.deepToString(new int[][]{{1}}) + Arrays.toString("a,b".split(",")) + Arrays.asList(1, 2) + Collections.nCopies(2, "x") + Objects.hash(1, 2) + Optional.of(3).map(x -> x + 1).get());
        System.out.println(new StringBuilder("abc").reverse() + "x".repeat(3) + "  t ".strip() + String.join("-", List.of("a", "b")) + "abc".chars().sum() + Character.toUpperCase('a') + Integer.toHexString(255) + Long.toBinaryString(5) + Integer.parseInt("-42") + Boolean.parseBoolean("true"));
        System.out.println(new Random(1).nextInt(10) + " " + new java.util.concurrent.atomic.AtomicInteger(3).incrementAndGet() + " " + new java.util.concurrent.ConcurrentHashMap<>(Map.of(1, 1)) + new BitSet().cardinality());`)

/**
 * Parts of the JDK that TeaVM 0.13.1's class library gets wrong or lacks (the same before and after the guard):
 * each must end as a clean compile_error or runtime_error the player can read, never a crash or a hang. If one
 * starts to work after a rebuild, move it to FEATURES and drop it from java.ts JAVA.differences.
 */
const KNOWN_GAPS = {
  'String.format %f / %.2f': ['System.out.println(String.format("%.2f", 3.14159));', 'runtime_error', /NullPointerException/],
  'printf %n': ['System.out.printf("%d%n", 1);', 'runtime_error', /UnknownFormatConversionException/],
  'EnumMap / EnumSet': ['EnumMap<Dir, Integer> m = new EnumMap<>(Dir.class); m.put(Dir.R, 4);\n        System.out.println(m);', 'runtime_error', /NullPointerException/, '    enum Dir { U, D, L, R }'],
  'Integer::sum': ['Map<Character, Integer> c = new HashMap<>(); c.merge(\'a\', 1, Integer::sum);', 'compile_error', /cannot find symbol/],
  'Collectors.groupingBy with a map factory': ['System.out.println(Stream.of("a").collect(Collectors.groupingBy(String::length, TreeMap::new, Collectors.counting())));', 'compile_error', /incompatible types/],
}

/** javac doubles its work for every nested finally (16 levels: 4 GB in 11 s without the budget) */
const COMPILE_BOMB = (() => {
  let body = 'x++;'
  for (let i = 0; i < 16; i++) body = `try { x++; } finally { ${body} }`
  return `class Solution {\n    static int x;\n    void t() { ${body} }\n    public String solve(String[] grid, int ink) { return ""; }\n}\n`
})()
/** javac re-attributes every nested generic conditional: exponential */
const COMPILE_BOMB_TERNARY = (() => {
  let e = 'g(1)'
  for (let i = 0; i < 8; i++) e = `b ? g(${e}) : g(${e})`
  return `class Solution {\n    static boolean b;\n    static <T> T g(T t) { return t; }\n    int x = ${e};\n    public String solve(String[] grid, int ink) { return ""; }\n}\n`
})()

const median = (values) => { const s = [...values].sort((a, b) => a - b); return s[s.length >> 1] }
const mib = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MiB`

/** resident memory of the given processes, in bytes */
function rss(pids) {
  if (!pids.length) return 0
  const out = spawnSync('ps', ['-o', 'rss=', '-p', pids.join(',')], { encoding: 'utf8' }).stdout
  return out.split('\n').map(Number).filter(Boolean).reduce((a, b) => a + b, 0) * 1024
}
/** every process this Node process started, recursively (all of Chromium's) */
function descendants() {
  const rows = spawnSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8' }).stdout.trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number))
  const kids = new Map()
  for (const [pid, ppid] of rows) { if (!kids.has(ppid)) kids.set(ppid, []); kids.get(ppid).push(pid) }
  const out = []
  const walk = (pid) => { for (const kid of kids.get(pid) || []) { out.push(kid); walk(kid) } }
  walk(process.pid)
  return out
}

const server = await devServer()
console.log(`ink maze java runtime: ${server.base}`)
const report = {}
try {
  for (const name of BROWSERS) await suite(name)
} finally {
  server.stop()
}
console.log(JSON.stringify(report, null, 1))
console.log(`PASS ink maze java runtime (${BROWSERS.join(', ')})`)

async function suite(name) {
  const meter = cpuMeter()
  const browser = await launch(name)
  const log = (m) => console.log(`  ${name}: ${m}`)
  const facts = (report[name] = {})
  try {
    const page = await openCodePage(browser, server.base)
    page.on('crash', () => log('THE PAGE CRASHED'))
    browser.on('disconnected', () => log('the browser disconnected'))
    // capture() once, right after the page opens: it adopts the WebKit processes started since cpuMeter(), and a
    // later call could adopt another Playwright run's WebKit. Chromium's processes are this process's descendants.
    const webkitPids = meter.capture().filter((pid) => !descendants().includes(pid))
    const browserPids = () => [...descendants(), ...webkitPids]
    let pids = browserPids()
    const run = (source, tests = ONE, extra = {}) => runOnPage(page, { language: 'java', source, tests, kind: tests.length > 1 ? 'submit' : 'run', ...extra })
    const cpuAfter = async (label, idle) => {
      const cores = await meter.cores(1500)
      log(`${label}: ${cores.toFixed(2)} cores (idle ${idle.toFixed(2)})${cores > idle + CPU_SLACK ? `\n      ${meter.detail.join('\n      ')}` : ''}`)
      return cores
    }

    // ------------------------------------------------ lazy cold load
    const javaRequests = () => page.requests.filter((u) => u.includes('/ink-maze-code/java/'))
    assert.equal(await page.evaluate(() => document.querySelectorAll('iframe').length), 0, 'no iframe before load()')
    assert.deepEqual(javaRequests(), [], 'nothing of Java loads before load()')
    const rssBefore = rss(pids)
    const tLoad = Date.now()
    await page.evaluate(() => window.sb.load('java'))
    const loadMs = Date.now() - tLoad
    const info = await page.evaluate(() => window.sb.runtimeInfo('java'))
    assert.equal(info.status, 'ready')
    assert.equal(info.info.engine, 'teavm-javac')
    for (const file of ['runtime.js', 'teavm-runtime.js', 'compiler.gz.bin', 'compile-classlib.bin', 'runtime-classlib.bin', 'InkMazeHarness.class', 'deobfuscator.wasm']) {
      assert.ok(javaRequests().some((u) => u.endsWith(`/java/${file}`)), `${file} was fetched`)
    }
    assert.ok(!page.requests.some((u) => /cdn\.jsdelivr|unpkg|teavm\.org/.test(u)), 'Java needs nothing from a CDN')
    const transfer = await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.name.includes('/ink-maze-code/'))
      .reduce((sum, e) => ({ transfer: sum.transfer + (e.transferSize || 0), encoded: sum.encoded + (e.encodedBodySize || 0) }), { transfer: 0, encoded: 0 }))
    facts.coldLoadMs = loadMs
    facts.downloadBytes = transfer.encoded
    log(`cold load (empty cache, localhost): ready in ${loadMs} ms (runtime's own ${info.info.loadMs} ms); ${(transfer.encoded / 1e6).toFixed(2)} MB of sandbox files (transferSize ${(transfer.transfer / 1e6).toFixed(2)} MB)`)
    if (name === 'chromium') {
      // the same cold load on a 20 Mbit/s link with 40 ms latency (Chromium's network emulation)
      const slow = await openCodePage(browser, server.base)
      const cdp = await slow.context().newCDPSession(slow)
      await cdp.send('Network.enable')
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: 20e6 / 8, uploadThroughput: 5e6 / 8 })
      const t = Date.now()
      await slow.evaluate(() => window.sb.load('java'))
      facts.coldLoad20MbitMs = Date.now() - t
      const tRun = Date.now()
      const r = await runOnPage(slow, { language: 'java', source: REF, tests: SUBMIT, kind: 'submit' })
      assert.equal(r.status, 'ok')
      facts.firstResult20MbitMs = facts.coldLoad20MbitMs + (Date.now() - tRun)
      log(`cold load at 20 Mbit/s + 40 ms: ready in ${facts.coldLoad20MbitMs} ms, first accepted submission at ${facts.firstResult20MbitMs} ms`)
      await slow.evaluate(() => window.sb.dispose())
      await slow.context().close()
    }

    // the first run waits for warm(); the starter code compiles and gives the 'empty' verdict
    const tFirst = Date.now()
    const starter = await run(STARTER_CODE.java)
    facts.firstRunMs = Date.now() - tFirst
    assert.equal(starter.status, 'ok', starter.message)
    assert.deepEqual(starter.answers, [''])
    assert.equal(judgeAll(ONE, starter.answers).verdicts[0].kind, 'empty', 'the starter code returns no moves')
    log(`first run (starter code, after warm-up): ${facts.firstRunMs} ms`)
    pids = browserPids()
    facts.rssLoadedBytes = rss(pids)
    log(`memory: browser processes ${mib(rssBefore)} before load, ${mib(facts.rssLoadedBytes)} with Java loaded`)
    await pause(500)
    const idle = await cpuAfter('idle, Java loaded', 0)
    assert.ok(idle < 0.5, `the machine is quiet enough to measure (${idle.toFixed(2)} cores idle: ${meter.detail.join('; ')})`)

    // ------------------------------------------------ reference and naive on a full submission
    for (const [label, source] of [['reference', REF], ['naive', NAIVE]]) {
      const first = await run(source, SUBMIT)
      assert.equal(first.status, 'ok', `${label}: ${first.message}`)
      const judged = judgeAll(SUBMIT, first.answers)
      assert.ok(judged.accepted, `${label}: accepted on all ${SUBMIT.length} boards (${judged.passed}/${judged.total})`)
      const compile = []
      const runs = []
      for (let i = 0; i < 5; i++) {
        const r = await run(`${source}\n// run ${i}\n`, SUBMIT) // a new text each time: no compile cache
        assert.equal(r.status, 'ok')
        compile.push(r.timings.compileMs)
        runs.push(r.timings.runMs)
      }
      const cached = await run(`${source}\n// run 4\n`, SUBMIT)
      facts[label] = { firstCompileMs: first.timings.compileMs, compileMs: median(compile), runMs: median(runs), cachedCompileMs: cached.timings.compileMs }
      log(`${label}: accepted ${judged.passed}/${judged.total}; first compile ${first.timings.compileMs} ms; warm compile (javac + TeaVM) median ${median(compile)} ms, run median ${median(runs)} ms; same text again ${cached.timings.compileMs} ms`)
    }
    pids = browserPids()
    facts.rssAfterRunsBytes = rss(pids)
    log(`memory after the submissions: ${mib(facts.rssAfterRunsBytes)}`)

    // ------------------------------------------------ compile errors (javac's own words, the player's lines)
    const semicolon = await run('class Solution {\n    public String solve(String[] grid, int ink) {\n        int x = 1\n        return "";\n    }\n}\n')
    assert.equal(semicolon.status, 'compile_error')
    assert.equal(semicolon.phase, 'compile')
    assert.deepEqual([semicolon.diagnostics[0].line, semicolon.diagnostics[0].column], [3, 18])
    assert.match(semicolon.message, /^Line 3: ';' expected/)
    const types = await run(solve('        int x = "a string";\n        return "";'))
    assert.equal(types.status, 'compile_error')
    assert.equal(types.diagnostics[0].line, 6)
    assert.match(types.diagnostics[0].message, /incompatible types: java.lang.String cannot be converted to int/)
    assert.ok(types.diagnostics[0].endColumn > types.diagnostics[0].column, 'a range for the squiggle')
    for (const [source, pattern, line, what] of [
      ['class Solution {\n    public String solve(String[] grid, Integer ink) { return ""; }\n}\n', /must keep the method public String solve\(String\[\] grid, int ink\) \(yours: String solve\(String\[\], Integer\)\)/, 2, 'a changed signature'],
      ['class Solution {\n    public static String solve(String[] grid, int ink) { return ""; }\n}\n', /must not be static/, 2, 'a static solve'],
      ['class Solution {\n    private Solution(int x) { }\n    public String solve(String[] grid, int ink) { return ""; }\n}\n', /constructor with no arguments/, 2, 'no usable constructor'],
      ['class Main {\n    public String solve(String[] grid, int ink) { return ""; }\n}\n', /must define a class named Solution/, 1, 'no Solution class'],
      ['package foo;\n\nclass Solution {\n    public String solve(String[] grid, int ink) { return ""; }\n}\n', /Remove the package declaration/, 1, 'a package'],
      ['class Solution {\n    public String solve(String[] grid, int ink) { Object o = new org.teavm.jso.core.JSString[0]; return ""; }\n}\n', /org\.teavm\.\* .* not available/, 2, 'TeaVM interop'],
      ['class Solution {\n    public String solve(String[] grid, int ink) { return ""; }\n}\nclass InkMazeHarness { }\n', /reserved/, 4, 'the harness name'],
      [solve('        java.io.PrintStream quiet = new java.io.PrintStream(new java.io.ByteArrayOutputStream());\n        quiet.println("x");\n        return "";'), /cannot build: text encodings/, 6, 'a library part TeaVM cannot build'],
      [solve('        Scanner in = new Scanner(System.in);\n        return in.next();'), /cannot find symbol/, 6, 'a class the library does not have'],
    ]) {
      const r = await run(source)
      assert.equal(r.status, 'compile_error', `${what}: compile_error (${r.status}: ${r.message})`)
      assert.match(r.diagnostics.map((d) => d.message).join('\n'), pattern, what)
      assert.equal(r.diagnostics[0].line, line, `${what}: on line ${line}`)
    }
    const weak = await run(solve('        List<Object> keep = new ArrayList<>();\n        keep.add(new java.lang.ref.WeakReference<Object>(keep));\n        return "";'))
    assert.equal(weak.status, 'compile_error', `java.lang.ref crashes TeaVM's compiler: a clear compile error (${weak.message})`)
    assert.match(weak.message, /java\.lang\.ref \(WeakReference\) is not available/)
    assert.equal(weak.diagnostics[0].line, 7)
    const annotations = await run(solve('        @SuppressWarnings("unchecked") List<Integer>[] a = new ArrayList[3];\n        return "";', '    @Deprecated(since = "9") int old;\n    @SafeVarargs final void f(String... s) { }'))
    assert.equal(annotations.status, 'ok', `@SuppressWarnings / @Deprecated with values compile (${annotations.message})`)
    const jsbody = await run('import org.teavm.jso.JSBody;\nclass Solution {\n    @JSBody(script = "return 1;")\n    static native int one();\n    public String solve(String[] grid, int ink) { return "" + one(); }\n}\n')
    assert.equal(jsbody.status, 'compile_error', `@JSBody: ${jsbody.message}`)
    assert.equal(jsbody.diagnostics[0].line, 3)
    assert.equal((await run(STARTER_CODE.java)).status, 'ok', 'the compiler works after it crashed on @JSBody')
    log('compile errors: javac lines and columns, every signature and package rule, interop, library parts')

    // ------------------------------------------------ runtime errors, semantics, prints
    const bounds = await run(solve('        int[] a = new int[3];\n        return "" + a[grid.length + 10];'), THREE)
    assert.equal(bounds.status, 'runtime_error')
    assert.equal(bounds.error.type, 'java.lang.ArrayIndexOutOfBoundsException')
    assert.match(bounds.error.message, /^Index 1\d out of bounds for length 3$/)
    assert.equal(bounds.error.test, 0)
    if (name === 'chromium') assert.equal(bounds.error.line, 7, 'Chromium: the line of the bad index')
    assert.deepEqual(bounds.answers, ['', '', ''])
    const board2 = await run(solve('        if (grid[0].equals("o...") && grid.length == 4) throw new IllegalStateException("gave up");\n        return "";'), THREE)
    assert.equal(board2.status, 'runtime_error')
    assert.deepEqual([board2.error.type, board2.error.message, board2.error.test], ['java.lang.IllegalStateException', 'gave up', 1])
    assert.equal(board2.answered, 1, 'the board before it was answered, no later one')
    if (name === 'chromium') assert.equal(board2.error.line, 6)
    const npe = await run(solve('        String s = grid.length > 100 ? "" : null;\n        return "" + s.length();'))
    assert.equal(npe.status, 'runtime_error')
    assert.equal(npe.error.type, 'java.lang.NullPointerException')
    if (name === 'chromium') assert.equal(npe.error.line, 7)
    const overflow = await run(solve('        return "" + depth(1000000);', '    int depth(int n) { return n == 0 ? 0 : 1 + depth(n - 1); }'))
    assert.equal(overflow.status, 'runtime_error')
    assert.equal(overflow.error.type, 'java.lang.StackOverflowError')
    assert.match(overflow.error.trace, /Solution\.depth/)
    // the browser's stack overflow cannot be caught by Java code (a JVM would let catch (Throwable) run on)
    const caught = await run(solve('        g(0);\n        return "";', '    void g(int n) { try { g(n + 1); } catch (Throwable t) { g(n + 1); } }'))
    assert.equal(caught.status, 'runtime_error')
    assert.equal(caught.error.type, 'java.lang.StackOverflowError')
    const deep = await run(solve('        return dfs(0, 0, ink, 200, new boolean[6][6]) == 200 ? "" : "x";',
      '    int dfs(int r, int c, int ink, int depth, boolean[][] seen) {\n        if (depth == 0) return 0;\n        int best = 0;\n        for (int d = 0; d < 1; d++) best = Math.max(best, 1 + dfs(r, c, ink - 1, depth - 1, seen));\n        return best;\n    }'))
    assert.equal(deep.status, 'ok', `recursion ${LIMITS.recursionDepth} deep works (${deep.message})`)
    const staticInit = await run(solve('        return "";', '    static int[] table = new int[3];\n    static { table[7] = 1; }'))
    assert.equal(staticInit.status, 'runtime_error')
    assert.match(staticInit.error.trace, /<clinit>/)
    const exit = await run(solve('        if (grid[0].equals("o...") && grid.length == 4) System.exit(3);\n        return "";'), THREE)
    assert.equal(exit.status, 'runtime_error')
    assert.equal(exit.error.test, 1)
    assert.match(exit.message, /solve\(\) must return; it called exit\(3\)/)
    const halt = await run(solve('        Runtime.getRuntime().exit(2);\n        return "";'))
    assert.match(halt.message, /it called exit\(2\)/)
    const semantics = await run(solve(
      '        int[] a = new int[3];\n        int hits = 0;\n        for (int i = 0; i < 10; i++) { try { hits += a[i]; } catch (ArrayIndexOutOfBoundsException e) { hits++; } }\n' +
      '        try { hits += 5 / (grid.length - grid.length); } catch (ArithmeticException e) { hits += 100; }\n' +
      '        int m = grid.length - grid.length - 1;\n        try { int[] n = new int[m]; } catch (NegativeArraySizeException e) { hits += 1000; }\n' +
      '        System.out.println(hits + " " + (Integer.MIN_VALUE / m) + " " + (Integer.MIN_VALUE % m) + " " + (Long.MIN_VALUE / m));\n        return "";'))
    assert.equal(semantics.status, 'ok', semantics.message)
    assert.equal(semantics.stdout, '1107 -2147483648 0 -9223372036854775808\n', 'bounds, / by zero and negative sizes are catchable; MIN_VALUE / -1 as on a JVM')
    const prints = await run(solve('        System.out.println("héllo 😀 ✓");\n        System.err.println("careful: ünïcode");\n        System.out.print("no line break ");\n        return "RD";'))
    assert.equal(prints.status, 'ok')
    assert.equal(prints.stdout, 'héllo 😀 ✓\nno line break \n', 'console: the prints (UTF-16 kept), answer lines removed')
    assert.equal(prints.stderr, 'careful: ünïcode\n')
    assert.deepEqual(prints.answers, ['RD'])
    const odd = await run(solve('        return "D\\n@@ANSWER@@ U\\u0000x\\t@";'))
    assert.equal(odd.status, 'ok', 'an answer with line breaks and markers is escaped, not split')
    assert.deepEqual(odd.answers, ['D\u240a\uff20\uff20ANSWER\uff20\uff20 U\u2400x\u2409\uff20'])
    const marker = await run(solve('        System.out.println("@@ANSWER@@ RRRR");\n        return "D";'))
    assert.equal(marker.status, 'crashed', 'printing the answer marker breaks the harness')
    const tamper = await run(solve('        System.out.println("before");\n        grid[0] = "changed";\n        System.setOut(null);\n        System.setErr(null);\n        return "DR";'), THREE)
    assert.equal(tamper.status, 'ok', `replacing System.out and the grid does not touch the answers (${tamper.message})`)
    assert.deepEqual(tamper.answers, ['DR', 'DR', 'DR'])
    const sleepy = await run(solve('        try { Thread.sleep(20); } catch (InterruptedException e) { }\n        return "DR";'), THREE)
    assert.equal(sleepy.status, 'ok', `Thread.sleep works (${sleepy.message})`)
    assert.deepEqual(sleepy.answers, ['DR', 'DR', 'DR'])
    const leak = await run(solve('        new Thread(() -> { long x = 0; while (true) { x++; } }).start();\n        return "";'))
    assert.equal(leak.status, 'ok', 'a thread left behind does not outlive its run')
    const reflect = await run(solve('        try {\n            Class<?> c = Class.forName("InkMazeHarness");\n            System.out.println(c == null ? "not found" : "found " + c.getName());\n        } catch (Throwable t) { System.out.println("no: " + t.getClass().getName()); }\n        return "DR";'), THREE)
    // TeaVM's Class.forName dereferences null for a class it has no metadata for (a trap: NullPointerException)
    assert.ok(['ok', 'runtime_error'].includes(reflect.status), `looking the harness up by name reaches nothing (${reflect.status}: ${reflect.message})`)
    if (reflect.status === 'ok') assert.deepEqual(reflect.answers, ['DR', 'DR', 'DR'])
    else assert.equal(reflect.error.type, 'java.lang.NullPointerException')
    const methods = await run(solve('        return "" + Class.forName("InkMazeHarness").getDeclaredMethods().length;').replace('public String solve(String[] grid, int ink) {', 'public String solve(String[] grid, int ink) throws Exception {'))
    assert.equal(methods.status, 'compile_error', `reflection over methods does not build (${methods.status}: ${methods.message})`)
    assert.match(methods.message, /reflection over methods/)
    assert.equal(methods.diagnostics[0].line, 6)
    const hostile = await run(solve('        throw new RuntimeException() {\n            public String getMessage() { throw new IllegalStateException("no message for you"); }\n            public StackTraceElement[] getStackTrace() { return null; }\n        };'))
    assert.equal(hostile.status, 'runtime_error', `an exception that fights the harness is still reported (${hostile.message})`)
    assert.match(hostile.error.type, /^Solution\$\d+$/)
    const initLoop = await run(solve('        return "";', '    static long spins;\n    static { while (spins >= 0) spins++; }'), ONE, { timeLimitMs: 1200 })
    assert.deepEqual([initLoop.status, initLoop.stoppedBy], ['time_limit', 'runtime'], 'a static initializer that never ends')
    log('runtime errors (types, boards, lines), catchable bounds and arithmetic, exit(), prints, marker, tampering, threads')

    // ------------------------------------------------ everyday Java works as on a JVM; the library's known gaps fail cleanly
    for (const [label, [body, expected, extra]] of Object.entries(FEATURES)) {
      const r = await run(snippet(body, extra || ''))
      assert.equal(r.status, 'ok', `${label}: ${r.status} (${r.message})`)
      assert.equal(r.stdout, `${expected}\n`, `${label}: prints what a JVM prints`)
    }
    for (const [label, [body, status, pattern, extra]] of Object.entries(KNOWN_GAPS)) {
      const r = await run(snippet(body, extra || ''))
      assert.equal(r.status, status, `${label}: still a clean ${status} (${r.status}: ${r.message})`)
      assert.match(r.status === 'runtime_error' ? `${r.error.type}: ${r.error.message}` : r.message, pattern, label)
      assert.equal(r.sandboxRestarted, false, `${label}: the sandbox keeps going`)
    }
    assert.equal((await run(STARTER_CODE.java)).status, 'ok', 'a run after the library gaps works')
    facts.features = `${Object.keys(FEATURES).length} everyday-Java programs as on a JVM; ${Object.keys(KNOWN_GAPS).length} known library gaps end as clean errors`
    log(facts.features)
    {
      const counted = browserPids()
      let peak = rss(counted)
      let sampling = true
      const sampler = (async () => { while (sampling) { peak = Math.max(peak, rss(counted)); await pause(40) } })()
      const heavy = await run(LIBRARY_HEAVY)
      sampling = false
      await sampler
      assert.equal(heavy.status, 'ok', `a program that pulls in most of the class library compiles and runs (${heavy.status}: ${heavy.message})`)
      assert.ok(heavy.timings.compileMs < LIMITS.compileMs / 2, `it compiles well inside the compile limit (${heavy.timings.compileMs} ms)`)
      facts.libraryHeavy = { compileMs: heavy.timings.compileMs, peakRssBytes: peak }
      log(`library-heavy program (TeaVM allocates ~2.7 GiB): ok, compile ${heavy.timings.compileMs} ms, browser memory peaked at ${mib(peak)}`)
    }

    // ------------------------------------------------ runaways: the guard stops them, the CPU goes idle (D2-D9)
    /** the most resident memory the browser's processes reach while `promise` runs */
    const peakRss = async (promise) => {
      const counted = browserPids()
      let peak = rss(counted)
      let done = false
      const sampler = (async () => { while (!done) { peak = Math.max(peak, rss(counted)); await pause(40) } })()
      try { return [await promise, () => peak] } finally { done = true; await sampler }
    }
    /**
     * A run the guard must stop; then the CPU must be idle. After memory_limit the runtime asks for a fresh
     * worker (the quickest way to give the garbage back), so the first reading shows that worker loading and
     * the idle check comes once it is ready.
     */
    const runaway = async (label, source, status, { timeLimitMs = 1200, extra = {}, settleMs = 300, tests = ONE } = {}) => {
      const [r, peak] = await peakRss(run(source, tests, { timeLimitMs, ...extra }))
      if ([status].flat().includes('memory_limit')) log(`${label}: the browser's memory peaked at ${mib(peak())} (${mib(facts.rssAfterRunsBytes)} before)`)
      const allowed = [status].flat()
      assert.ok(allowed.includes(r.status), `${label}: ${allowed.join(' or ')} (${r.status}: ${r.message})`)
      assert.equal(r.stoppedBy, 'runtime', `${label}: stopped by the program's own guard (${r.stoppedBy})`)
      await pause(settleMs)
      if (r.status === 'memory_limit' || r.phase === 'compile') {
        await cpuAfter(`${label}, 0.3-1.8 s after (a fresh worker loading)`, idle)
        assert.equal((await run(NAIVE, ONE)).status, 'ok', `${label}: the next run works`)
        await pause(300)
        const cores = await cpuAfter(`${label}, once the fresh worker is ready`, idle)
        assert.ok(cores < idle + CPU_SLACK, `${label}: nothing keeps running (${cores.toFixed(2)} cores)`)
        return r
      }
      const cores = await cpuAfter(`after ${label}`, idle)
      assert.ok(cores < idle + CPU_SLACK, `${label}: the CPU is back to idle within ~1 s of the limit (${cores.toFixed(2)} cores)`)
      assert.equal((await run(NAIVE, ONE)).status, 'ok', `${label}: the next run works`)
      return r
    }
    const runawayFacts = (facts.runaways = {})
    for (const [label, [status, source]] of Object.entries(RUNAWAYS)) {
      if (process.env.JAVA_TEST_VERBOSE) log(`runaway: ${label}`)
      const r = await runaway(label, source, status)
      if (r.status === 'time_limit') assert.ok(r.timings.runMs >= 1150 && r.timings.runMs <= 1200 + LIMITS.selfStopSlackMs + 200, `${label}: stopped at its deadline (${r.timings.runMs} ms)`)
      runawayFacts[label] = `${r.status} after ${r.timings.runMs} ms, ${r.ticks} ticks, stopped by ${r.stoppedBy}`
    }
    // one call into the library's helper code that would run past the deadline is stopped inside it (Base64Impl
    // used to be left out of the guard: a single decode of a 200 MiB array ran half a second past any deadline)
    {
      const decode = solve('        byte[] a = new byte[200 << 20];\n        Arrays.fill(a, (byte) 65);\n        long t = System.currentTimeMillis();\n        System.out.println("decode starts");\n        byte[] b = Base64.getDecoder().decode(a);\n        System.out.println("decode took " + (System.currentTimeMillis() - t) + " ms");\n        return "";')
      // a deadline inside the decode (timed on warm runs of the same program): the guard must stop it there, not
      // when the call returns. An 'ok' past the deadline is what an unchecked call looks like (a failure); an 'ok'
      // inside it, or a stop before the decode began, only means this machine's timing moved: time it again.
      let stopped = null
      for (let attempt = 0; attempt < 4 && !stopped; attempt++) {
        let timed = null
        for (let i = 0; i < 2; i++) timed = await run(decode, ONE, { timeLimitMs: 8000 })
        assert.equal(timed.status, 'ok', `a 200 MiB decode fits the budget (${timed.message})`)
        const took = Number(/decode took (\d+) ms/.exec(timed.stdout)[1])
        const limit = Math.round(timed.timings.runMs - took + took * 0.4)
        const r = await run(decode, ONE, { timeLimitMs: limit })
        if (r.status === 'ok') {
          assert.ok(r.timings.runMs <= limit, `an ok run ended before its deadline (${r.timings.runMs} ms, limit ${limit} ms): nothing ran unchecked past it`)
          continue
        }
        assert.deepEqual([r.status, r.stoppedBy], ['time_limit', 'runtime'], `one long Base64 decode stops at the deadline (${r.status}: ${r.message})`)
        assert.ok(r.timings.runMs <= limit + 100, `stopped close to its deadline (${r.timings.runMs} ms, limit ${limit} ms, the call alone takes ${took} ms)`)
        if (r.stdout === 'decode starts\n') stopped = { r, took, limit }
      }
      assert.ok(stopped, 'a deadline landed inside the decode and the guard stopped the call there')
      runawayFacts[`one Base64 decode of 200 MiB (takes ${stopped.took} ms), deadline inside it`] = `${stopped.r.status} after ${stopped.r.timings.runMs} ms (limit ${stopped.limit}), stopped by ${stopped.r.stoppedBy}`
      assert.equal((await run(NAIVE, ONE)).status, 'ok', 'the next run works')
    }

    // the page keeps running its timers while a Java loop spins in the worker
    const responsive = await page.evaluate(async ({ source, tests }) => {
      let last = performance.now()
      let worst = 0
      const timer = setInterval(() => { const t = performance.now(); worst = Math.max(worst, t - last); last = t }, 50)
      const r = await window.sb.run({ language: 'java', source, tests, kind: 'run', timeLimitMs: 1200 })
      clearInterval(timer)
      return { status: r.status, stoppedBy: r.stoppedBy, worst }
    }, { source: RUNAWAYS['tight loop'][1], tests: ONE })
    assert.deepEqual([responsive.status, responsive.stoppedBy], ['time_limit', 'runtime'])
    assert.ok(responsive.worst < 300, `the page kept running its timers (largest gap ${responsive.worst.toFixed(0)} ms)`)
    facts.pageTimerGapMs = Math.round(responsive.worst)

    // compiles that never end: the compile deadline (a new text: the same one again would come from the
    // compile cache), and javac's memory budget. The guard stops javac / TeaVM wherever they are, so the runtime
    // asks for a fresh worker: the first reading shows it loading, the second that nothing else runs on.
    for (const [label, source, status, extra] of [
      ['a compile past its deadline', `${RUNAWAYS['tight loop'][1]}// not cached\n`, 'time_limit', { compileLimitMs: 80 }],
      ['compile bomb (nested finally)', COMPILE_BOMB, 'memory_limit', {}],
      ['compile bomb (nested generic conditionals)', COMPILE_BOMB_TERNARY, 'memory_limit', {}],
    ]) {
      const r = await runaway(label, source, status, { extra })
      assert.equal(r.phase, 'compile')
      assert.match(r.message, status === 'time_limit' ? /Compiling your code took longer than/ : /Compiling your code used too much memory/)
      runawayFacts[label] = `${r.status} in the compile after ${r.timings.compileMs} ms`
    }

    // ------------------------------------------------ cancel
    const tCancel = Date.now()
    const cancelled = await page.evaluate(async ({ source, tests }) => {
      const sb = window.sb
      const p = sb.run({ language: 'java', source, tests, kind: 'run', timeLimitMs: 2500 })
      await new Promise((resolve) => {
        if (sb.state.phase === 'running') return resolve()
        const off = sb.subscribe(() => { if (sb.state.phase === 'running') { off(); resolve() } })
      })
      const since = performance.now()
      await new Promise((resolve) => setTimeout(resolve, 400))
      const t = performance.now()
      sb.cancel()
      const r = await p
      return { status: r.status, cancelMs: performance.now() - t, runningFor: t - since }
    }, { source: RUNAWAYS['tight loop'][1], tests: ONE })
    assert.equal(cancelled.status, 'cancelled')
    assert.ok(cancelled.cancelMs < 500, `cancel answers at once (${cancelled.cancelMs.toFixed(0)} ms)`)
    await cpuAfter('0-1.5 s after cancel (terminate() alone; in WebKit the program runs on to its own deadline)', idle)
    const deadlineIn = 2500 - cancelled.runningFor - (Date.now() - tCancel)
    await pause(Math.max(0, deadlineIn) + 300)
    assert.ok((await cpuAfter('cancelled program, from 0.3 s past its own deadline', idle)) < idle + CPU_SLACK, 'a cancelled program stops at its own deadline')
    assert.equal((await run(NAIVE, SUBMIT)).status, 'ok', 'the next run after a cancel works')

    if (page.errors.length) log(`page errors: ${page.errors.slice(0, 5).join(' | ')}`)
    await page.evaluate(() => window.sb.dispose())
    await page.context().close()

    // ------------------------------------------------ positive control (last): an unchecked wasm loop
    {
      meter.mark()
      const page2 = await openCodePage(browser, server.base)
      meter.capture()
      await page2.evaluate(() => window.sb.load('echo'))
      const r = await runOnPage(page2, { language: 'echo', source: 'spin-wasm-hot', tests: ONE, kind: 'run', timeLimitMs: 800 })
      assert.equal(r.stoppedBy, 'host')
      const soon = await cpuAfter('positive control: WebAssembly with no check, 0-1.5 s after terminate()', idle)
      assert.ok(soon > idle + 0.6, `the meter sees the sandbox's threads (${soon.toFixed(2)} cores); without this the readings above prove nothing`)
      facts.positiveControlCores = Number(soon.toFixed(2))
    }
    log('pass')
  } finally {
    await browser.close()
  }
}
