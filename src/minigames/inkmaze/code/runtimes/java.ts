/**
 * Ink Maze level 26: the Java runtime's registration and facts (Java is the
 * default language).
 *
 * The runtime itself is public/minigames/ink-maze-code/java/runtime.js (a
 * Runtime, contract.ts), loaded into the sandbox by CodeSandbox via
 * RUNTIME_INFO.java.script. It runs OpenJDK's javac and the TeaVM compiler,
 * both compiled to WebAssembly GC and rebuilt for this site with a guard
 * (scripts/inkmaze-code/build/java/, java/PROVENANCE.txt), entirely
 * self-hosted. This module is the TypeScript side the UI and the tests can
 * import: the measured facts for an "about this language" line, how Java here
 * differs from a JVM, the guard's limits, and checkConsistency(). It imports
 * no browser APIs, so Node can import it too.
 */
import { LANGUAGE_INFO, LIMITS, RUNTIME_INFO } from '../contract.ts'
import { SIGNATURES, STARTER_CODE } from '../problem.ts'

export type JavaFacts = {
  languages: readonly ['java']
  runtime: 'java'
  engine: string
  /** what load() reports as info.version (= LANGUAGE_INFO.java.version) */
  version: string
  /** files served under public/minigames/ink-maze-code/java/ */
  files: readonly string[]
  /** CDN prefixes it loads from: none, it is self-hosted */
  cdn: readonly string[]
  /** a short note for the UI */
  about: string
  /** how Java here differs from a desktop JVM, one line each, for the problem's notes */
  differences: readonly string[]
}

/**
 * The guard's limits (they live in runtime.js and teavm-javac's Guard; the
 * values here document them and the tests read them).
 */
export const JAVA_GUARD = {
  /** ticks (loop headers, method entries, 256-instruction runs) between two calls into io.check() */
  fuel: 16_384,
  /** a program may allocate this many times LIMITS.memoryBytes in total (one allocation: 1x) */
  allocationFactor: 2,
  /** what javac, then TeaVM, may allocate for one compile (normal: javac 3-7 MiB, TeaVM 500-550 MiB) */
  javacBudgetBytes: 384 * 1024 * 1024,
  teavmBudgetBytes: 2048 * 1024 * 1024,
} as const

/** The total a program may allocate before memory_limit (the browser cannot measure what is still alive). */
export const JAVA_ALLOCATION_LIMIT_BYTES = LIMITS.memoryBytes * JAVA_GUARD.allocationFactor

/**
 * Measured with scripts/inkmaze-code/test-runtime-java.mjs (Chromium 151 and
 * WebKit 26.5 on an M5 Max, localhost, 2026-10-12; the machine was shared, so
 * times are upper bounds). Full numbers in java/PROVENANCE.txt.
 */
export const JAVA_MEASURED = {
  /** the sandbox files a first visit downloads */
  downloadBytes: 4_380_000,
  /** browser memory added by loading Java (Chromium's sandbox renderer and worker / WebKit's WebContent) */
  memoryBytes: { chromium: 310_000_000, webkit: 425_000_000 },
  /** cold load to ready, empty cache, localhost (Chromium at 20 Mbit/s + 40 ms: 2.1 s) */
  coldLoadMs: { chromium: 184, webkit: 272 },
  /** a warm Run of the reference on a full submission: javac + TeaVM, then the program */
  warmCompileMs: { chromium: 442, webkit: 705 },
  runMs: { chromium: 1, webkit: 5 },
  /** frames of a DFS-shaped method before the browser's stack runs out (LIMITS.recursionDepth is promised) */
  recursionFrames: { chromium: 2000, webkit: 300 },
} as const

export const JAVA: JavaFacts = {
  languages: ['java'],
  runtime: 'java',
  engine: 'OpenJDK javac 25 + TeaVM 0.13.1, compiled to WebAssembly GC',
  version: 'Java 25 (javac + TeaVM 0.13.1, WebAssembly)',
  files: [
    'java/runtime.js', 'java/teavm-runtime.js', 'java/compiler.gz.bin', 'java/compile-classlib.bin', 'java/runtime-classlib.bin',
    'java/deobfuscator.wasm', 'java/InkMazeHarness.class', 'java/PROVENANCE.txt', 'java/LICENSE-Apache-2.0.txt', 'java/LICENSE-OpenJDK-GPL-2.0-CE.txt',
    'java/NOTICE-third-party.txt',
  ],
  cdn: [],
  about: 'Real javac (Java 25) compiles your code in the browser and TeaVM turns it into WebAssembly. Self-hosted, about 4.4 MB the first time you open the coding level; each Run compiles in well under a second.',
  differences: [
    'A null dereference stops the program with NullPointerException (it cannot be caught here); array bounds, / by zero and negative array sizes throw exceptions you can catch, as on a JVM.',
    'StackOverflowError cannot be caught. Recursion 200 calls deep is safe in every browser (Safari allows about 300 frames of a typical search, Chrome thousands).',
    'Runtime errors show the line in Chrome and Edge; Safari shows the method only.',
    'There is no keyboard input (System.in, Scanner) and no text encodings (PrintStream, PrintWriter, readers and writers, String.getBytes): print with System.out.',
    'System.exit() is reported as an error: solve() must return its answer.',
    `Memory: one array may use at most ${LIMITS.memoryBytes / 1024 / 1024} MiB, and a run may allocate ${JAVA_ALLOCATION_LIMIT_BYTES / 1024 / 1024} MiB in total (every object and array counts, garbage too).`,
    'Threads work, but they take turns on one thread (Thread.sleep and join are fine); a thread still running when solve() returns is stopped.',
  ],
}

/** Problems with how contract.ts / problem.ts describe Java; [] when all is well. */
export function checkConsistency(): string[] {
  const problems: string[] = []
  const lang = LANGUAGE_INFO.java
  const rt = RUNTIME_INFO.java
  if (lang.runtime !== 'java') problems.push(`LANGUAGE_INFO.java.runtime is ${lang.runtime}`)
  if (lang.version !== JAVA.version) problems.push(`LANGUAGE_INFO.java.version is ${lang.version}, the runtime reports ${JAVA.version}`)
  if (lang.fileName !== 'Solution.java') problems.push(`LANGUAGE_INFO.java.fileName is ${lang.fileName} (diagnostics refer to Solution.java)`)
  if (rt.script !== 'java/runtime.js') problems.push(`RUNTIME_INFO.java.script is ${rt.script}`)
  if (!rt.heavy) problems.push('javac + TeaVM are heavy; RUNTIME_INFO.java.heavy should be true')
  if (rt.cdn.length) problems.push('Java is self-hosted; RUNTIME_INFO.java.cdn should be empty')
  if (Math.abs(rt.downloadBytes - JAVA_MEASURED.downloadBytes) > 300_000) problems.push(`RUNTIME_INFO.java.downloadBytes is ${rt.downloadBytes}, the files are ${JAVA_MEASURED.downloadBytes}`)
  if (SIGNATURES.java !== 'public String solve(String[] grid, int ink)') problems.push(`SIGNATURES.java is ${SIGNATURES.java}; the harness calls solve(String[], int) returning String`)
  if (!/class Solution\b/.test(STARTER_CODE.java)) problems.push('STARTER_CODE.java should define class Solution')
  if (!/public String solve\(String\[\] grid, int ink\)/.test(STARTER_CODE.java)) problems.push('STARTER_CODE.java should keep public String solve(String[] grid, int ink)')
  if (/^\s*package\s/m.test(STARTER_CODE.java)) problems.push('STARTER_CODE.java must not declare a package (the runtime refuses one)')
  if (/@SuppressWarnings\s*\(|org\.teavm/.test(STARTER_CODE.java)) problems.push('STARTER_CODE.java should not need annotation values or org.teavm')
  return problems
}

export default JAVA
