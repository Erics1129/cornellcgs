/**
 * Ink Maze level 26: the C and C++ runtime (runtime id 'clang').
 *
 * Built into public/minigames/ink-maze-code/clang/runtime.js (one ES module, no
 * imports) by scripts/inkmaze-code/build/build-clang.mjs; Node imports this
 * file directly for tests. It implements contract.ts's `Runtime`.
 *
 * The toolchain is @yowasp/clang (Clang/LLD 22, wasm32-wasip1, wasi-libc and
 * libc++), loaded from a pinned jsDelivr URL, so nothing big is self-hosted.
 * One worker (the sandbox's runtime worker) holds the compiler and runs the
 * player's program too:
 *
 *   load   import the bundle, fetch the compiler (23 MB over the wire), run the
 *          fuel pass on its 75 MB core module (see below), compile the hidden
 *          harness for C and C++ (clang/harness.c, harness.cpp), lock down.
 *   run    1. compile the player's file as its OWN translation unit, with only a
 *             pre-include in front of it (clang/ink-pre.h or ink-pre.hpp) and
 *             nothing after it, so every error stays at the player's line;
 *          2. refuse a player object that defines a symbol the harness uses;
 *          3. link it with the harness object (wasm-ld);
 *          4. run the fuel pass on the linked program and compile it;
 *          5. io.started(), then run it on a tiny WASI shim whose only extra
 *             doors are the harness's "ink" imports (check, phase, answer, fault).
 *
 * The cooperative deadline (contract D1-D9): a fuel pass
 * ------------------------------------------------------
 * WebKit's worker.terminate() does not stop a thread that runs WebAssembly,
 * so every program must stop itself. Sanitizer coverage (the earlier idea)
 * covers only code the player's compiler flags instrument and can be switched
 * off from the source (no_sanitize, #pragma clang attribute, inline asm,
 * macros that spell them). Instead, instrumentWasm() (fuel.ts) rewrites the final
 * binary: at every function entry and every loop header it subtracts the
 * static size of that region from a fuel counter, and every bulk memory op
 * subtracts length/16; when the fuel runs out it calls the "ink.check" import,
 * which is io.check() and throws past the deadline. WebAssembly cannot catch a
 * JavaScript exception without the exception-handling feature, which the pass
 * refuses, so the stop is sticky. It covers the C library, libc++ and anything
 * the player wrote, attributes or not: at most about FUEL instruction units
 * (~1-3 ms) or one bulk copy (<= 256 MiB, ~30 ms) run between two checks.
 * The compiler itself gets the same pass at load time (loops only, which costs
 * little), so a compile bomb (a macro that expands to millions of tokens)
 * stops at the compile deadline as well, and its memory is capped at
 * COMPILER_MEMORY_BYTES (a 600 MB static initializer fails at once).
 *
 * Compiler output never touches yowasp's virtual file system (a file there is
 * copied whole on every write, so a 300 MB object took minutes and 9 GB):
 * cc1 and wasm-ld write to stdout (-o -) into a chunked sink capped at
 * COMPILER_OUTPUT_BYTES.
 *
 * Limits the player sees (also in the problem's notes)
 *  - recursion: the program's C stack is STACK_BYTES (8 MiB), but the browser's
 *    own stack (every wasm frame also lives there) is the tighter limit, and it
 *    does not depend on the size of the C locals: measured by scripts/inkmaze-
 *    code/test-runtime-c.mjs, about 700 nested calls in WebKit 26.5 and about
 *    5,200 in Chromium 151 (a one-function recursion, M5 Max). The problem
 *    promises LIMITS.recursionDepth (200); a search here needs at most 61.
 *    Past the limit: runtime_error "Stack overflow ... in dive()".
 *  - phones: the compiler needs about 1.5 GB in Safari (CLANG_PHONE_NOTE), so on a
 *    phone every load label carries that note and load info has `warning`.
 *  - memory: 256 MiB in all (stack, globals and heap); static arrays above
 *    about 60 MB do not compile here (allocate big arrays with malloc/vector).
 *  - no C++ exceptions (the sysroot has no unwinder): `throw` is a compile error.
 */
import type { Diagnostic, ErrorInfo, LimitKind, RunIO, Runtime, RuntimeHost, RuntimeJob, RuntimeOutcome } from '../contract.ts'
import { WasmError, instrumentWasm } from './fuel.ts'
import type { FuelOptions, FuelReport } from './fuel.ts'

// ================================================================= constants

export const CLANG_VERSION = '22.0.0-git20542-10'
/** must equal RUNTIME_INFO.clang.cdn[0] in contract.ts (and the sandbox CSP) */
export const CLANG_CDN = `https://cdn.jsdelivr.net/npm/@yowasp/clang@${CLANG_VERSION}/`
export const CLANG_BUNDLE_URL = `${CLANG_CDN}gen/bundle.js`

/** instruction units between two deadline checks in the player's program */
export const PROGRAM_FUEL = 1 << 20
/** and in the compiler (loops only) */
export const COMPILER_FUEL = 1 << 20
/** the compiler's own memory (clang and wasm-ld) */
export const COMPILER_MEMORY_BYTES = 512 * 1024 * 1024
/** the most one compiler step may write (an object file, the linked program) */
export const COMPILER_OUTPUT_BYTES = 64 * 1024 * 1024
/** what the compiler may say on stderr that we keep */
const COMPILER_TEXT_CHARS = 256 * 1024
/** the program's C stack (shadow stack), first in memory so an overflow traps */
export const STACK_BYTES = 8 * 1024 * 1024
/** the compiler's text shown in stderr on a compile error */
const STDERR_COMPILER_CHARS = 16 * 1024

const WARNINGS = ['-Wall', '-Wno-unused-variable', '-Wno-unused-but-set-variable', '-Wno-unused-function', '-Wno-unused-const-variable']
const COMMON = ['-O2', '-ferror-limit=20', '-fno-color-diagnostics', '-fmessage-length=0', ...WARNINGS]
/** undefined behaviour that reports the player's line (handlers in clang/ink-harness.h) */
const SANITIZE = ['-fsanitize=null,array-bounds,vla-bound,integer-divide-by-zero,unreachable,local-bounds', '-fno-sanitize-recover=all']
export const C_FLAGS = ['-std=gnu17', ...COMMON]
// DEBUG hardening routes a failed container check through __libcpp_verbose_abort
// (clang/harness.cpp overrides it to name the player's line), where EXTENSIVE
// would trap bare with no message. The extra checks cost little at these sizes.
export const CXX_FLAGS = ['-std=gnu++20', '-fno-exceptions', '-D_LIBCPP_HARDENING_MODE=_LIBCPP_HARDENING_MODE_DEBUG', ...COMMON]
export const LINK_FLAGS = [
  '-Wl,--stack-first', `-Wl,-z,stack-size=${STACK_BYTES}`, '-Wl,--export=__stack_pointer',
  ...['malloc', 'calloc', 'realloc', 'aligned_alloc', 'posix_memalign'].map((f) => `-Wl,--wrap=${f}`),
]

type Lang = 'c' | 'cpp'
const FILE: Record<Lang, string> = { c: 'solution.c', cpp: 'solution.cpp' }
const LABEL: Record<Lang, string> = { c: 'C', cpp: 'C++' }

/** the self-hosted files this runtime reads (under the code base) */
export const ASSETS = {
  harnessH: 'clang/ink-harness.h',
  harnessC: 'clang/harness.c',
  harnessCpp: 'clang/harness.cpp',
  preC: 'clang/ink-pre.h',
  preCpp: 'clang/ink-pre.hpp',
  // served under a '+'-free path (isAssetPath forbids '+'); the compiler still sees it as <bits/stdc++.h>
  stdcxx: 'clang/stdcxx.h',
} as const

// ===================================================== WebAssembly: the fuel pass

// in fuel.ts (the JavaScript runtime uses it too); re-exported for the tests
export { WasmError, instrumentWasm }
export type { FuelOptions, FuelReport }

// ============================================ WebAssembly: an object's symbols

export type ObjectSymbol = {
  name: string
  kind: 'function' | 'data' | 'global' | 'section' | 'tag' | 'table'
  defined: boolean
  weak: boolean
  local: boolean
}

/** The symbol table of a relocatable wasm object (its "linking" custom section). */
export function objectSymbols(bytes: Uint8Array): ObjectSymbol[] {
  let p = 8
  const u32 = (): number => {
    let result = 0
    let shift = 0
    for (;;) {
      const b = bytes[p++]
      if (b === undefined) throw new WasmError('unexpected end of the object')
      result += (b & 0x7f) * 2 ** shift
      if (!(b & 0x80)) return result
      shift += 7
    }
  }
  const decoder = new TextDecoder()
  const str = () => { const n = u32(); const s = decoder.decode(bytes.subarray(p, p + n)); p += n; return s }
  const importNames: string[][] = [[], [], [], [], []] // function, table, memory, global, tag
  let linking: [number, number] | null = null
  while (p < bytes.length) {
    const id = bytes[p++]
    const size = u32()
    const start = p
    const end = p + size
    if (id === 2) {
      const n = u32()
      for (let i = 0; i < n; i++) {
        str()
        const field = str()
        const kind = bytes[p++]
        if (kind === 0) u32()
        else if (kind === 1) { p++; const f = bytes[p++]; u32(); if (f & 1) u32() }
        else if (kind === 2) { const f = bytes[p++]; u32(); if (f & 1) u32() }
        else if (kind === 3) p += 2
        else if (kind === 4) { p++; u32() }
        importNames[kind]?.push(field)
      }
    } else if (id === 0) {
      if (str() === 'linking') linking = [p, end]
    }
    p = start + size
  }
  if (!linking) throw new WasmError('not a relocatable object (no linking section)')
  p = linking[0]
  const out: ObjectSymbol[] = []
  if (u32() !== 2) throw new WasmError('unknown linking section version')
  const KINDS = ['function', 'data', 'global', 'section', 'tag', 'table'] as const
  const IMPORT_KIND: Record<number, number> = { 0: 0, 2: 3, 4: 4, 5: 1 }
  while (p < linking[1]) {
    const type = bytes[p++]
    const size = u32()
    const next = p + size
    if (type === 8) {
      const count = u32()
      for (let i = 0; i < count; i++) {
        const kind = bytes[p++]
        const flags = u32()
        const undefined = (flags & 0x10) !== 0
        let name = ''
        if (kind === 0 || kind === 2 || kind === 4 || kind === 5) {
          const index = u32()
          if (!undefined || flags & 0x40) name = str()
          else name = importNames[IMPORT_KIND[kind]][index] ?? ''
        } else if (kind === 1) {
          name = str()
          if (!undefined) { u32(); u32(); u32() }
        } else if (kind === 3) {
          u32()
        } else throw new WasmError(`unknown symbol kind ${kind}`)
        out.push({ name, kind: KINDS[kind] ?? 'function', defined: !undefined, weak: (flags & 1) !== 0, local: (flags & 2) !== 0 })
      }
    }
    p = next
  }
  return out
}

// ======================================================== answers (problem.ts H3)

/** problem.ts escapeAnswer, for the harness's answer line (the Node test checks they agree). */
export function escapeAnswer(moves: string, max: number): string {
  let out = ''
  for (let i = 0; i < moves.length && out.length < max; i++) {
    const code = moves.charCodeAt(i)
    if (code < 0x20) out += String.fromCharCode(0x2400 + code)
    else if (code === 0x7f) out += '\u2421'
    else if (code === 0x40) out += '\uff20'
    else if (code >= 0xd800 && code <= 0xdbff) {
      const low = moves.charCodeAt(i + 1)
      if (low >= 0xdc00 && low <= 0xdfff) { out += moves[i] + moves[i + 1]; i++ } else out += '\ufffd'
    } else if (code >= 0xdc00 && code <= 0xdfff) out += '\ufffd'
    else out += moves[i]
  }
  return out.slice(0, max)
}

// =============================================================== diagnostics

type Raw = { file: string | null; line: number; column: number; severity: 'error' | 'warning' | 'note'; message: string }

const DIAGNOSTIC = /^(.*?):(\d+):(\d+): (fatal error|error|warning|note): (.*)$/
const BARE = /^(?:clang(?:\+\+)?|wasm-ld|clang-\d+): (fatal error|error|warning|note): (.*)$/

const isPlayer = (file: string | null, lang: Lang) => !!file && (file === FILE[lang] || file === `./${FILE[lang]}` || file === `/${FILE[lang]}`)
const isGlue = (file: string | null) => !!file && /(^|\/)ink\/pre\.hpp?$/.test(file)

/** clang's text, with the harness's paths named for what they are */
export function cleanCompilerText(text: string): string {
  return text
    .split('\n')
    .filter((line) => !/^In file included from <built-in>:1:$/.test(line))
    .map((line) => line.replace(/(?:\.\/|\/)?ink\/pre\.hpp?(?=:)/g, '(game harness)'))
    .join('\n')
}

/** What the glue errors mean, in plain words (C++: class Solution as the game calls it). */
function glueMessage(message: string): string {
  if (/incomplete type 'Solution'/.test(message)) return 'Your code must define class Solution with a public method string solve(vector<string>& grid, int ink).'
  if (/no member named 'solve' in 'Solution'/.test(message)) return 'class Solution has no method solve(vector<string>& grid, int ink).'
  if (/'solve' is a (private|protected) member/.test(message)) return 'solve() must be public: put it after `public:` in class Solution.'
  if (/(default constructor|no matching constructor for initialization of 'Solution'|constructor of 'Solution')/.test(message)) return 'class Solution needs a constructor that takes no arguments.'
  if (/no viable conversion from .* to '(std::)?(__2::)?(basic_string|string)/.test(message)) return 'solve() must return a string.'
  if (/no matching member function for call to 'solve'|cannot bind|candidate function not viable/.test(message)) return 'solve() must take (vector<string>& grid, int ink).'
  return `The game could not call your solve(): ${message}`
}

/**
 * clang's diagnostics as contract Diagnostics, lines in the player's file. An
 * error outside it (a libc++ template, the game's glue) takes the location of
 * the first of its notes that is in the player's file ("requested here",
 * "to match this '{'", "previous declaration is here").
 */
export function parseCompilerOutput(text: string, lang: Lang): Diagnostic[] {
  const raws: Raw[] = []
  for (const line of text.split('\n')) {
    const m = DIAGNOSTIC.exec(line)
    if (m) {
      raws.push({ file: m[1], line: Number(m[2]), column: Number(m[3]), severity: m[4] === 'fatal error' ? 'error' : (m[4] as Raw['severity']), message: m[5] })
      continue
    }
    const b = BARE.exec(line)
    if (b) raws.push({ file: null, line: 0, column: 0, severity: b[1] === 'fatal error' ? 'error' : (b[1] as Raw['severity']), message: b[2] })
  }
  const out: Diagnostic[] = []
  for (let i = 0; i < raws.length; i++) {
    const r = raws[i]
    if (r.severity === 'note') continue
    const notes: Raw[] = []
    for (let k = i + 1; k < raws.length && raws[k].severity === 'note'; k++) notes.push(raws[k])
    let line: number | null = null
    let column: number | null = null
    let message = r.message
    if (isPlayer(r.file, lang)) {
      line = r.line
      column = r.column || null
    } else {
      const at = notes.find((n) => isPlayer(n.file, lang))
      if (at) { line = at.line; column = at.column || null }
      if (isGlue(r.file)) message = glueMessage(r.message)
      else if (r.file) message = `${r.message} (in ${r.file.replace(/^\/usr\/include\/(c\+\+\/v1\/)?/, '<').replace(/^(<.*)$/, '$1>')})`
    }
    out.push({ line, column, severity: r.severity, message })
    for (const n of notes) {
      if (!isPlayer(n.file, lang)) continue
      if (/previous declaration is here/.test(n.message) && isGlue(n.file)) continue
      out.push({ line: n.line, column: n.column || null, severity: 'note', message: n.message })
    }
    if (out.length >= 60) break
  }
  return out
}

const SIGNATURE: Record<Lang, string> = {
  c: 'char *solve(char **grid, int rows, int cols, int ink)',
  cpp: 'class Solution { public: string solve(vector<string>& grid, int ink); }',
}

/** wasm-ld's errors, in the player's terms */
export function parseLinkerOutput(text: string, lang: Lang): Diagnostic[] {
  const out: Diagnostic[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = /^wasm-ld: (error|warning): (.*)$/.exec(lines[i])
    if (!m) continue
    const severity = m[1] === 'error' ? 'error' : 'warning'
    let message = m[2].replace(/^[^:]*\.o: /, '')
    let sym: RegExpExecArray | null
    if ((sym = /^undefined symbol: (.*)$/.exec(message))) {
      const name = sym[1]
      if (/^solve\b|__ink_call_solve/.test(name)) message = `Your code does not define solve(): it must be ${SIGNATURE[lang]}.`
      else message = `\`${name}\` is used but never defined.`
    } else if ((sym = /^duplicate symbol: (.*)$/.exec(message))) {
      const name = sym[1]
      if (name === 'main' || name === '__main_argc_argv' || name === '__main_void') message = 'Your code defines main(); the game has its own, so remove yours (solve() is all it needs).'
      else message = `\`${name}\` is defined twice: the C library or the game already has it. Rename yours.`
    } else if (/(initial memory too large|maximum memory too small|memory too large)/.test(message)) {
      message = 'Your global and static arrays need more memory than the limit (256 MiB).'
    } else if (/function signature mismatch: solve/.test(message)) {
      message = `solve() has the wrong parameters: it must be ${SIGNATURE[lang]}.`
    }
    // ">>> defined in" / ">>> referenced by" lines follow; they name objects, not lines
    out.push({ line: null, column: null, severity, message })
  }
  return out
}

// ============================================================ the program run

export class ProcExit extends Error {
  readonly code: number
  constructor(code: number) { super(`exit(${code})`); this.name = 'ProcExit'; this.code = code }
}
/** thrown by the harness's ink.fault import */
export class Fault extends Error {
  readonly kind: number
  readonly file: string
  readonly line: number
  readonly column: number
  readonly value: bigint
  readonly detail: string
  constructor(kind: number, file: string, line: number, column: number, value: bigint, detail: string) {
    super(`fault ${kind}`)
    this.name = 'Fault'
    this.kind = kind
    this.file = file
    this.line = line
    this.column = column
    this.value = value
    this.detail = detail
  }
}
/** solve() returned a pointer that is not in memory */
export class BadAnswer extends Error {
  constructor(message: string) { super(message); this.name = 'BadAnswer' }
}
/** the program called the harness's imports out of order (it broke the game's runner) */
export class Tamper extends Error {
  constructor(message: string) { super(message); this.name = 'Tamper' }
}

const FAULT = { NULL: 1, INDEX: 2, DIVIDE: 3, VLA: 4, RETURN: 5, UNREACHABLE: 6, MEMORY: 7, LIBCXX: 8, INPUT: 9, TAMPERED: 10 } as const
const PHASE = { READ: 1, SOLVE: 2, AFTER: 3, DONE: 4 } as const
type Phase = 'init' | 'read' | 'solve' | 'after' | 'done'

const E = { SUCCESS: 0, BADF: 8, FAULT: 21, INVAL: 28, NOSYS: 52, SPIPE: 70, NOTCAPABLE: 76 } as const

/** What one program run needs besides the job and io. */
export type ProgramContext = {
  lang: Lang
  /** function names the player's object defines (for "in function dfs") */
  playerFunctions: Set<string>
  /** the real WebAssembly.Instance (the compiler hooks replace the global one) */
  Instance: typeof WebAssembly.Instance
}

type ProgramState = {
  memory: WebAssembly.Memory | null
  phase: Phase
  board: number
  answered: number
  stdinAt: number
  stdin: Uint8Array
  outChars: number
}

const looksLikeStackOverflow = (e: unknown) => e instanceof RangeError && /call stack|stack size|recursion/i.test(String(e.message))

/**
 * The player's frames in an engine stack trace, innermost first. The game's
 * glue in the player's unit (ink-pre.hpp: __ink_call_solve, __ink_call<>)
 * only calls Solution::solve, so a frame there is solve() inlined into it.
 */
export function playerFrames(error: unknown, names: Set<string>): string[] {
  const stack = String((error as { stack?: unknown })?.stack ?? '')
  const plain = new Map<string, string>()
  for (const n of names) plain.set(demangleSimple(n), demangleSimple(n))
  const frames: string[] = []
  for (const line of stack.split('\n')) {
    // V8: "    at dfs (wasm://wasm/1a2b3c4d:wasm-function[12]:0x1a2)" (Chromium 151), or
    // "    at -.dfs (wasm:..." (Node 24's V8 puts the module's name, "-" when it has none, in
    // front). JavaScriptCore (WebKit 26.5): "dfs@-:wasm-function[12]", C++ names demangled by
    // the engine ("Solution::dfs(int, int)@-:wasm-function[14]"); older JavaScriptCore:
    // "dfs@wasm-function[12]", "dfs@[wasm code]" or "<?>.wasm-function[dfs]@[wasm code]"
    const m = /^\s*at (.+?) \(wasm:/.exec(line) || /^\s*(.+)@(?:[^\s@]*:)?wasm-function\[\d+\]\s*$/.exec(line) ||
      /wasm-function\[([^\]]+)\]@\[wasm code\]/.exec(line) || /^\s*([^@\s]+)@\[wasm code\]/.exec(line)
    if (!m) continue
    const name = frameName(m[1])
    let hit = plain.get(name) ?? (names.has(name) ? demangleSimple(name) : undefined)
    if (hit?.startsWith('__ink_call')) {
      // the glue (two frames when not inlined) is Solution::solve, once
      if (frames[frames.length - 1] === 'Solution::solve') continue
      hit = 'Solution::solve'
    }
    if (hit) frames.push(hit)
    if (frames.length >= 12) break
  }
  return frames
}

/** "-.dfs", "<?>.dfs", "void __ink_call<Solution>(std::vector<...>&, int)" -> "dfs", "__ink_call" */
function frameName(raw: string): string {
  let s = raw.trim().replace(/^(?:<\?>|-)\./, '')
  const paren = s.indexOf('(')
  if (paren > 0) s = s.slice(0, paren)
  for (let i = 0; i < 20 && /<[^<>]*>/.test(s); i++) s = s.replace(/<[^<>]*>/g, '')
  const space = s.lastIndexOf(' ')
  if (space >= 0) s = s.slice(space + 1)
  return s.trim()
}

/** "at dfs (x10)\nat Solution::solve": the frames, a run of the same function (recursion) as one line */
export function traceText(frames: string[]): string {
  const lines: string[] = []
  for (let i = 0; i < frames.length;) {
    let k = i
    while (k < frames.length && frames[k] === frames[i]) k++
    lines.push(`at ${frames[i]}${k - i > 1 ? ` (x${k - i})` : ''}`)
    i = k
  }
  return lines.join('\n')
}

/** _Z3dfsii -> dfs, _ZN8Solution5solveE... -> Solution::solve (names only, no parameters) */
export function demangleSimple(name: string): string {
  if (!name.startsWith('_Z')) return name
  let p = 2
  const parts: string[] = []
  const take = () => {
    let n = 0
    while (p < name.length && name[p] >= '0' && name[p] <= '9') n = n * 10 + Number(name[p++])
    if (!n) return false
    parts.push(name.slice(p, p + n))
    p += n
    return true
  }
  if (name[p] === 'N') {
    p++
    while (p < name.length && name[p] !== 'E') {
      if (name[p] === 'K' || name[p] === 'V') { p++; continue }
      if (!take()) break
    }
  } else take()
  return parts.length ? parts.join('::') : name
}

/**
 * Runs the linked, instrumented program on job.stdin through io. Never
 * throws for anything the program does: every outcome is a RuntimeOutcome
 * (a LimitError from io becomes { status: limit, healthy: true }: the program
 * stopped itself and nothing of it is left running).
 */
export function runProgram(module: WebAssembly.Module, job: RuntimeJob, io: RunIO, ctx: ProgramContext): RuntimeOutcome {
  const state: ProgramState = { memory: null, phase: 'init', board: -1, answered: 0, stdinAt: 0, stdin: new TextEncoder().encode(job.stdin), outChars: 0 }
  const outDecoder = new TextDecoder()
  const errDecoder = new TextDecoder()
  const bytes = () => new Uint8Array(state.memory!.buffer)
  const view = () => new DataView(state.memory!.buffer)
  const inRange = (ptr: number, len: number) => ptr >= 0 && len >= 0 && ptr + len <= state.memory!.buffer.byteLength
  const cString = (ptr: number, max: number): string => {
    if (!ptr || !inRange(ptr, 0)) return ''
    const b = bytes()
    let end = ptr
    const stop = Math.min(b.length, ptr + max)
    while (end < stop && b[end] !== 0) end++
    return new TextDecoder().decode(b.subarray(ptr, end))
  }
  const write = (fd: 1 | 2, chunk: Uint8Array) => {
    // never decode more than can still be printed (a 256 MiB write would cost seconds)
    const room = job.outputLimit - state.outChars + 16
    const part = chunk.length > room ? chunk.subarray(0, Math.max(0, room)) : chunk
    const text = (fd === 1 ? outDecoder : errDecoder).decode(part, { stream: true })
    if (!text) return
    state.outChars += text.length
    if (fd === 1) io.stdout(text)
    else io.stderr(text)
  }

  const wasi: Record<string, (...args: never[]) => number | void> = {
    args_sizes_get: (argc: number, size: number) => { const v = view(); v.setUint32(argc, 1, true); v.setUint32(size, 9, true); return E.SUCCESS },
    args_get: (argv: number, buf: number) => { view().setUint32(argv, buf, true); bytes().set(new TextEncoder().encode('solution\0'), buf); return E.SUCCESS },
    environ_sizes_get: (count: number, size: number) => { const v = view(); v.setUint32(count, 0, true); v.setUint32(size, 0, true); return E.SUCCESS },
    environ_get: () => E.SUCCESS,
    fd_write: (fd: number, iovs: number, n: number, written: number) => {
      if (fd !== 1 && fd !== 2) return E.BADF
      if (!inRange(iovs, n * 8) || !inRange(written, 4)) return E.FAULT
      let total = 0
      for (let i = 0; i < n; i++) {
        const v = view()
        const ptr = v.getUint32(iovs + i * 8, true)
        const len = v.getUint32(iovs + i * 8 + 4, true)
        if (!inRange(ptr, len)) return E.FAULT
        write(fd, bytes().subarray(ptr, ptr + len))
        total += len
      }
      view().setUint32(written, total, true)
      return E.SUCCESS
    },
    fd_read: (fd: number, iovs: number, n: number, read: number) => {
      if (fd !== 0) return E.BADF
      if (!inRange(iovs, n * 8) || !inRange(read, 4)) return E.FAULT
      let total = 0
      for (let i = 0; i < n && state.stdinAt < state.stdin.length; i++) {
        const v = view()
        const ptr = v.getUint32(iovs + i * 8, true)
        const len = v.getUint32(iovs + i * 8 + 4, true)
        if (!inRange(ptr, len)) return E.FAULT
        const take = Math.min(len, state.stdin.length - state.stdinAt)
        bytes().set(state.stdin.subarray(state.stdinAt, state.stdinAt + take), ptr)
        state.stdinAt += take
        total += take
      }
      view().setUint32(read, total, true)
      return E.SUCCESS
    },
    fd_close: (fd: number) => (fd <= 2 ? E.SUCCESS : E.BADF),
    fd_seek: (fd: number) => (fd <= 2 ? E.SPIPE : E.BADF),
    fd_tell: (fd: number) => (fd <= 2 ? E.SPIPE : E.BADF),
    fd_sync: (fd: number) => (fd <= 2 ? E.SUCCESS : E.BADF),
    fd_datasync: (fd: number) => (fd <= 2 ? E.SUCCESS : E.BADF),
    fd_fdstat_get: (fd: number, ptr: number) => {
      if (fd > 2) return E.BADF
      if (!inRange(ptr, 24)) return E.FAULT
      const v = view()
      // a character device without seek/tell rights: isatty(), so stdout is line buffered
      v.setUint8(ptr, 2)
      v.setUint16(ptr + 2, 0, true)
      v.setBigUint64(ptr + 8, fd === 0 ? 2n : 64n, true)
      v.setBigUint64(ptr + 16, 0n, true)
      return E.SUCCESS
    },
    fd_fdstat_set_flags: (fd: number) => (fd <= 2 ? E.SUCCESS : E.BADF),
    fd_filestat_get: (fd: number, ptr: number) => {
      if (fd > 2) return E.BADF
      if (!inRange(ptr, 64)) return E.FAULT
      bytes().fill(0, ptr, ptr + 64)
      view().setUint8(ptr + 16, 2)
      return E.SUCCESS
    },
    // no preopened directories: no file system at all
    fd_prestat_get: () => E.BADF,
    fd_prestat_dir_name: () => E.BADF,
    path_open: () => E.NOTCAPABLE,
    clock_res_get: (id: number, ptr: number) => { if (!inRange(ptr, 8)) return E.FAULT; view().setBigUint64(ptr, 1000n, true); return E.SUCCESS },
    clock_time_get: (id: number, _precision: bigint, ptr: number) => {
      if (!inRange(ptr, 8)) return E.FAULT
      const ms = id === 0 ? performance.timeOrigin + io.now() : io.now()
      view().setBigUint64(ptr, BigInt(Math.round(ms * 1e6)), true)
      return E.SUCCESS
    },
    random_get: (ptr: number, len: number) => {
      if (!inRange(ptr, len)) return E.FAULT
      for (let i = 0; i < len; i += 65536) {
        io.check()
        crypto.getRandomValues(bytes().subarray(ptr + i, ptr + Math.min(len, i + 65536)))
      }
      return E.SUCCESS
    },
    poll_oneoff: (inPtr: number, outPtr: number, n: number, neventsPtr: number) => {
      if (!inRange(inPtr, n * 48) || !inRange(outPtr, n * 32) || !inRange(neventsPtr, 4)) return E.FAULT
      // sleep(): wait out the earliest clock, checking the deadline (no Atomics.wait without SharedArrayBuffer)
      let wait = Infinity
      const v = view()
      for (let i = 0; i < n; i++) {
        const s = inPtr + i * 48
        if (v.getUint8(s + 8) === 0) {
          const ns = Number(v.getBigUint64(s + 24, true))
          const absolute = (v.getUint16(s + 40, true) & 1) !== 0
          const ms = absolute ? ns / 1e6 - io.now() : ns / 1e6
          wait = Math.min(wait, Math.max(0, ms))
        }
      }
      if (Number.isFinite(wait)) { const until = io.now() + wait; while (io.now() < until) io.check() }
      for (let i = 0; i < n; i++) {
        const s = inPtr + i * 48
        const e = outPtr + i * 32
        const w = view()
        w.setBigUint64(e, w.getBigUint64(s, true), true)
        w.setUint16(e + 8, 0, true)
        w.setUint8(e + 10, w.getUint8(s + 8))
        w.setBigUint64(e + 16, 0n, true)
        w.setUint16(e + 24, 0, true)
      }
      view().setUint32(neventsPtr, n, true)
      return E.SUCCESS
    },
    sched_yield: () => E.SUCCESS,
    proc_exit: (code: number) => { throw new ProcExit(code) },
    proc_raise: () => E.NOSYS,
  }

  const flushOut = () => {
    const rest = outDecoder.decode()
    if (rest) { state.outChars += rest.length; io.stdout(rest) }
  }
  const ink = {
    check: () => io.check(),
    phase: (code: number, board: number) => {
      const s = state
      if (code === PHASE.READ && s.phase === 'init') { s.phase = 'read'; return }
      if (code === PHASE.SOLVE && (s.phase === 'read' || s.phase === 'after') && board === s.answered && board < job.tests) { s.phase = 'solve'; s.board = board; return }
      if (code === PHASE.AFTER && s.phase === 'solve' && board === s.board) { s.phase = 'after'; return }
      if (code === PHASE.DONE && (s.phase === 'after' || s.phase === 'read') && board === s.answered && s.answered === job.tests) { s.phase = 'done'; return }
      throw new Tamper('Your code called the game\'s hidden harness functions.')
    },
    answer: (board: number, ptr: number, length: number) => {
      if (state.phase !== 'after' || board !== state.board || board !== state.answered) throw new Tamper('Your code called the game\'s hidden harness functions.')
      let text = ''
      if (ptr) {
        if (!inRange(ptr, 0)) throw new BadAnswer(`solve() returned a pointer outside memory (${ptr >>> 0})`)
        if (length < 0) text = cString(ptr, job.answerChars * 4 + 4)
        else if (inRange(ptr, Math.min(length, job.answerChars * 4 + 4))) text = new TextDecoder().decode(bytes().subarray(ptr, ptr + Math.min(length, job.answerChars * 4 + 4)))
      }
      flushOut()
      io.stdout(`@@ANSWER@@ ${escapeAnswer(text, job.answerChars)}\n`)
      state.answered++
    },
    fault: (kind: number, file: number, line: number, column: number, value: bigint, detail: number) => {
      throw new Fault(kind, cString(file, 300), line, column, typeof value === 'bigint' ? value : BigInt(value ?? 0), cString(detail, 2000))
    },
  }

  // imports: the shim's functions, ENOSYS for any other WASI call; nothing else exists
  const wasiImports: Record<string, unknown> = {}
  for (const imp of WebAssembly.Module.imports(module)) {
    if (imp.module === 'wasi_snapshot_preview1' && imp.kind === 'function') wasiImports[imp.name] = wasi[imp.name] ?? (() => E.NOSYS)
  }
  let instance: WebAssembly.Instance
  try {
    instance = new ctx.Instance(module, { wasi_snapshot_preview1: wasiImports as WebAssembly.ModuleImports, ink })
  } catch (e) {
    return { status: 'crashed', message: `The program could not start: ${String((e as Error)?.message ?? e).slice(0, 200)}`, healthy: true }
  }
  state.memory = instance.exports.memory as WebAssembly.Memory
  if (!(state.memory instanceof WebAssembly.Memory)) return { status: 'crashed', message: 'The program has no memory.', healthy: true }
  const start = instance.exports._start
  if (typeof start !== 'function') return { status: 'crashed', message: 'The program has no entry point.', healthy: true }

  let error: unknown = null
  try {
    ;(start as () => void)()
  } catch (e) {
    error = e
  }
  try { flushOut(); const rest = errDecoder.decode(); if (rest) io.stderr(rest) } catch { /* a limit: reported below */ }

  // ---- what happened
  const testIndex = state.phase === 'solve' || state.phase === 'after' ? state.board : null
  const inPlayer = state.phase === 'solve' || state.phase === 'init' || state.phase === 'done'
  const limit = io.limit
  if (limit) return { status: limit, message: (error as Error)?.message || undefined, error: limitError(limit, testIndex), healthy: true }
  if (error === null || (error instanceof ProcExit && error.code === 0 && state.phase === 'done')) {
    if (state.phase !== 'done' || state.answered !== job.tests) {
      return { status: 'crashed', message: `The program ended after ${state.answered} of ${job.tests} boards without an error.`, healthy: true }
    }
    return { status: 'ok' }
  }
  const where = (file: string, line: number, column: number) => (isPlayer(file, ctx.lang) || isPlayer(file.replace(/^.*\//, ''), ctx.lang) ? { line: line || null, column: column || null } : { line: null, column: null })
  const frames = playerFrames(error, ctx.playerFunctions)
  const trace = frames.length ? traceText(frames) : undefined
  const inFunction = frames.length ? ` in ${frames[0]}()` : ''
  const runtimeError = (type: string, message: string, line: number | null = null, column: number | null = null): RuntimeOutcome => ({
    status: 'runtime_error',
    message: `${type}: ${message}${line ? ` (line ${line}${testIndex !== null ? `, board ${testIndex + 1}` : ''})` : testIndex !== null ? ` (board ${testIndex + 1})` : ''}`,
    error: { type, message, line, column, test: testIndex, trace },
  })
  const crashed = (message: string): RuntimeOutcome => ({ status: 'crashed', message, error: { type: 'Harness', message, line: null, column: null, test: testIndex, trace }, healthy: true })

  if (error instanceof Tamper) return crashed(error.message)
  if (error instanceof BadAnswer) return runtimeError('Segmentation fault', error.message)
  if (error instanceof ProcExit) {
    if (state.phase === 'solve') return runtimeError('exit', `solve() must return; it called exit(${error.code})`)
    if (state.phase === 'done') return runtimeError('exit', `The program exited with status ${error.code} after the last board (an atexit handler?)`)
    if (state.phase === 'init') return runtimeError('exit', `Your code called exit(${error.code}) before the first board (a constructor?)`)
    return crashed(`The program exited (status ${error.code}) inside the game's harness.`)
  }
  if (error instanceof Fault) {
    const at = where(error.file, error.line, error.column)
    switch (error.kind) {
      case FAULT.NULL: return runtimeError('Null pointer', `${capitalize(error.detail || 'access through')} a null pointer${inFunction}`, at.line, at.column)
      case FAULT.INDEX: return runtimeError('Index out of bounds', `index ${error.value}${error.detail ? ` is out of bounds for type '${error.detail.replace(/^'(.*)'$/s, '$1')}'` : ' is out of bounds'}${inFunction}`, at.line, at.column)
      case FAULT.DIVIDE: return runtimeError('Division by zero', error.detail === 'overflow' ? `integer division overflow (INT_MIN / -1)${inFunction}` : `division by zero${inFunction}`, at.line, at.column)
      case FAULT.VLA: return runtimeError('Bad array size', `a variable-length array needs a positive size, not ${error.value}${inFunction}`, at.line, at.column)
      case FAULT.RETURN: return runtimeError('Missing return', `a function that returns a value ended without a return statement${inFunction}`, at.line, at.column)
      case FAULT.UNREACHABLE: return runtimeError('Unreachable', `__builtin_unreachable() was reached${inFunction}`, at.line, at.column)
      case FAULT.MEMORY: {
        const message = `Your code asked for ${formatBytes(Number(error.value))} more (${error.detail}), past the ${job.memoryLimitBytes >> 20} MiB limit.`
        io.hit('memory_limit', message)
        return { status: 'memory_limit', message, error: { type: 'Out of memory', message, line: null, column: null, test: testIndex, trace }, healthy: true }
      }
      case FAULT.LIBCXX: {
        const m = /assertion (.*?) failed: (.*)$/s.exec(error.detail.trim())
        return runtimeError('libc++', `${m ? m[2].trim() : error.detail.trim() || 'a library check failed'}${inFunction}`)
      }
      case FAULT.INPUT: return crashed(`The game's input could not be read (${error.detail}). Does your code read stdin before solve() is called, in a constructor?`)
      case FAULT.TAMPERED: return crashed(`Your code wrote over the game's copy of the input (before board ${Number(error.value) + 1}).`)
      default: return crashed(error.message || 'The game\'s harness stopped.')
    }
  }
  if (looksLikeStackOverflow(error)) {
    if (!inPlayer) return crashed('The program ran out of stack inside the game\'s harness.')
    return runtimeError('Stack overflow', `recursion too deep${inFunction}: this browser allows a limited number of nested calls`)
  }
  if (error instanceof WebAssembly.RuntimeError) {
    const text = String(error.message)
    const sp = stackPointer(instance)
    const memoryBytes = state.memory.buffer.byteLength
    if (memoryBytes >= job.memoryLimitBytes - (16 << 20) && /out of bounds|unreachable/i.test(text)) {
      const message = `Your code used all ${job.memoryLimitBytes >> 20} MiB of memory.`
      io.hit('memory_limit', message)
      return { status: 'memory_limit', message, error: { type: 'Out of memory', message, line: null, column: null, test: testIndex, trace }, healthy: true }
    }
    if (!inPlayer) return crashed(`The program crashed inside the game's harness (${trapName(text, sp, memoryBytes)}): did your code write past the end of an array or a string?`)
    return runtimeError(trapName(text, sp, memoryBytes), `${trapDetail(text, sp, memoryBytes)}${inFunction}`)
  }
  return { status: 'crashed', message: `The C runtime failed: ${String((error as Error)?.message ?? error).slice(0, 300)}`, healthy: false }
}

function limitError(limit: LimitKind, test: number | null): ErrorInfo {
  const type = limit === 'time_limit' ? 'Time limit' : limit === 'memory_limit' ? 'Out of memory' : 'Output limit'
  return { type, message: '', line: null, column: null, test }
}

function stackPointer(instance: WebAssembly.Instance): number | null {
  const g = instance.exports.__stack_pointer
  return g instanceof WebAssembly.Global ? Number(g.value) >>> 0 : null
}

/** the C stack ran past its start (it grows down from STACK_BYTES; --stack-first puts nothing below it) */
const stackOverflowed = (sp: number | null, memoryBytes: number) => sp !== null && (sp > memoryBytes || sp < 64)

function trapName(text: string, sp: number | null, memoryBytes: number): string {
  if (/out of bounds memory|memory access out of bounds/i.test(text)) return stackOverflowed(sp, memoryBytes) ? 'Stack overflow' : 'Segmentation fault'
  if (/unreachable/i.test(text)) return 'Aborted'
  if (/divi(de|sion) by zero/i.test(text)) return 'Division by zero'
  if (/integer overflow/i.test(text)) return 'Integer overflow'
  if (/call_indirect|indirect call|function signature|null function|table index/i.test(text)) return 'Bad function pointer'
  if (/trunc|unrepresentable|conversion/i.test(text)) return 'Bad conversion'
  return 'Trap'
}
function trapDetail(text: string, sp: number | null, memoryBytes: number): string {
  if (/out of bounds memory|memory access out of bounds/i.test(text)) {
    return stackOverflowed(sp, memoryBytes) ? `recursion too deep (the C stack is ${STACK_BYTES >> 20} MiB: big local arrays fill it fast)` : 'invalid memory access (a bad pointer, or an index past the end of an array)'
  }
  if (/unreachable/i.test(text)) return 'abort() was called, or a check failed'
  if (/divi(de|sion) by zero/i.test(text)) return 'division by zero'
  if (/integer overflow/i.test(text)) return 'integer overflow in a division (INT_MIN / -1)'
  if (/call_indirect|indirect call|function signature|null function|table index/i.test(text)) return 'called a function through a bad or null function pointer'
  if (/trunc|unrepresentable|conversion/i.test(text)) return 'a floating-point value does not fit in the integer type'
  return text
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const formatBytes = (n: number) => (n >= 1 << 20 ? `${Math.round(n / (1 << 20))} MiB` : n >= 1024 ? `${Math.round(n / 1024)} KiB` : `${n} bytes`)

// ================================================================= the compiler

/** The parts of @yowasp/clang's bundle this runtime uses. */
export type ClangBundle = {
  runLLVM: (args: string[] | null, files?: Record<string, unknown>, options?: Record<string, unknown>) => unknown
  Exit: new (...args: never[]) => Error & { code: number }
  version?: string
}

/** One compiler step's result. */
type StepResult = { ok: true; out: Uint8Array; text: string } | { ok: false; code: number; text: string; reason: 'exit' | 'too_big' | 'out_of_memory' | 'stack' | 'crash' }

class OutputTooBig extends Error {}

/** Splits `clang -###` output into the commands it would run (as yowasp's runClang does). */
export function parseDriverCommands(output: string): string[][] {
  const commands: string[][] = []
  let started = false
  for (const line of output.split('\n')) {
    if (!started) {
      if (/^(clang|Target:|Thread model:|InstalledDir:|Build config:)/.test(line) || line === '') continue
      started = true
    }
    if (line === ' (in-process)') continue
    if (!line.startsWith(' "')) { if (started && commands.length) break; continue }
    const args = Array.from(line.matchAll(/ (?:([^ "]+)|"((?:[^"\\$]|\\["\\$])+)"|"")/g), (m) => (m[1] ?? (m[2] !== undefined ? m[2].replace(/\\(["$\\])/g, '$1') : '')))
    if (args[0] === '') args.shift()
    commands.push(args)
  }
  return commands
}

export type ClangRuntimeOptions = {
  /** the bundle to import (default CLANG_BUNDLE_URL); Node tests pass a local copy */
  bundleUrl?: string
  /** how to import it (default: import()) */
  importBundle?: (url: string) => Promise<ClangBundle>
  /** read a self-hosted file (default host.assetText) */
  readAsset?: (path: string) => Promise<string>
}

type Toolchain = {
  clang: ClangBundle
  /** per language: the cc1 command (compile solution.* to stdout) and the wasm-ld command (link to stdout) */
  compile: Record<Lang, string[]>
  link: Record<Lang, string[]>
  harness: Record<Lang, Uint8Array>
  /** symbols the player's object must not define, per language */
  reserved: Record<Lang, Set<string>>
  files: { pre: Record<Lang, string>; stdcxx: string }
}

/** the compiler's fuel check: io.check() during a run, nothing otherwise */
let compilerCheck: () => void = () => {}

export function makeClangRuntime(options: ClangRuntimeOptions = {}): Runtime {
  let host: RuntimeHost | null = null
  let tools: Toolchain | null = null
  let realInstance: typeof WebAssembly.Instance = WebAssembly.Instance
  let compilerModule: WebAssembly.Module | null = null
  let fuelReport: Omit<FuelReport, 'bytes'> | null = null
  const timings: Record<string, number> = {}

  /** the compileStreaming and Instance hooks that put the fuel pass into the compiler (see the header) */
  function installHooks(progress: (label: string) => void) {
    const W = WebAssembly as unknown as Record<string, unknown>
    if ((W.Instance as { __ink?: boolean }).__ink) return
    realInstance = WebAssembly.Instance
    const realCompile = WebAssembly.compile.bind(WebAssembly)
    W.compileStreaming = async (source: Response | Promise<Response>) => {
      const response = await source
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.length < 8 * 1024 * 1024) return realCompile(bytes)
      progress('Preparing the compiler')
      const t0 = performance.now()
      const report = instrumentWasm(bytes, { addImport: { module: 'ink', name: 'check' }, entries: 'none', fuel: COMPILER_FUEL, memoryMaxPages: COMPILER_MEMORY_BYTES / 65536 })
      timings.instrumentMs = Math.round(performance.now() - t0)
      const { bytes: instrumented, ...rest } = report
      fuelReport = rest
      progress('Compiling the compiler')
      const t1 = performance.now()
      compilerModule = await realCompile(instrumented as BufferSource)
      timings.compileModuleMs = Math.round(performance.now() - t1)
      return compilerModule
    }
    const real = realInstance
    const Hooked = function (module: WebAssembly.Module, imports?: WebAssembly.Imports) {
      if (module === compilerModule) imports = { ...imports, ink: { check: () => compilerCheck() } }
      return new real(module, imports)
    } as unknown as typeof WebAssembly.Instance & { __ink?: boolean }
    Hooked.prototype = real.prototype
    Hooked.__ink = true
    W.Instance = Hooked
  }

  /** runs one LLVM tool synchronously; its stdout is the output file (-o -) */
  function step(clang: ClangBundle, args: string[], files: Record<string, unknown>): StepResult {
    const chunks: Uint8Array[] = []
    let size = 0
    let text = ''
    let textDropped = false
    const stdout = (b: Uint8Array | null) => {
      if (!b) return
      size += b.length
      if (size > COMPILER_OUTPUT_BYTES) throw new OutputTooBig()
      chunks.push(b.slice())
    }
    const decoder = new TextDecoder()
    const stderr = (b: Uint8Array | null) => {
      if (!b) return
      if (text.length < COMPILER_TEXT_CHARS) text += decoder.decode(b, { stream: true })
      else textDropped = true
    }
    try {
      clang.runLLVM(args, files, { stdout, stderr, synchronously: true, decodeASCII: false })
    } catch (e) {
      if (e instanceof OutputTooBig) return { ok: false, code: -1, text, reason: 'too_big' }
      if (e && typeof e === 'object' && 'limit' in e) throw e // io's LimitError: the deadline
      if (e instanceof clang.Exit) return { ok: false, code: (e as { code: number }).code, text: text + (textDropped ? '\n…' : ''), reason: 'exit' }
      if (looksLikeStackOverflow(e)) return { ok: false, code: -1, text, reason: 'stack' }
      if (/out of memory|Allocation failed/i.test(text)) return { ok: false, code: -1, text, reason: 'out_of_memory' }
      return { ok: false, code: -1, text: `${text}\n${String((e as Error)?.message ?? e)}`, reason: 'crash' }
    }
    const out = new Uint8Array(size)
    let at = 0
    for (const c of chunks) { out.set(c, at); at += c.length }
    return { ok: true, out, text }
  }

  /** `clang -###` for these arguments: the commands it would run */
  function driver(clang: ClangBundle, args: string[], files: Record<string, unknown>): string[][] {
    let text = ''
    const collect = (b: Uint8Array | null) => { if (b) text += new TextDecoder().decode(b) }
    try { clang.runLLVM([args[0], '-###', ...args.slice(1)], files, { stdout: collect, stderr: collect, synchronously: true }) } catch { /* -### exits 1 on some inputs; the commands are printed anyway */ }
    const commands = parseDriverCommands(text)
    if (!commands.length) throw new Error(`the compiler driver printed no commands: ${text.slice(0, 300)}`)
    return commands
  }

  function compileFiles(lang: Lang, source: string, t: Toolchain): Record<string, unknown> {
    const ink: Record<string, unknown> = lang === 'c' ? { 'pre.h': t.files.pre.c } : { 'pre.hpp': t.files.pre.cpp, include: { bits: { 'stdc++.h': t.files.stdcxx } } }
    return { [FILE[lang]]: source, ink }
  }

  function compileArgs(lang: Lang, file: string, player: boolean): string[] {
    const flags = lang === 'c' ? C_FLAGS : CXX_FLAGS
    const extra = player ? [...SANITIZE, ...(lang === 'cpp' ? ['-fsanitize=return'] : []), '-include', lang === 'c' ? 'ink/pre.h' : 'ink/pre.hpp', ...(lang === 'cpp' ? ['-I', 'ink/include'] : [])] : []
    return [lang === 'c' ? 'clang' : 'clang++', ...flags, ...extra, '-c', file, '-o', '-']
  }

  async function prepare(clang: ClangBundle, read: (p: string) => Promise<string>, progress: (label: string) => void): Promise<Toolchain> {
    const [harnessH, harnessC, harnessCpp, preC, preCpp, stdcxx] = await Promise.all([ASSETS.harnessH, ASSETS.harnessC, ASSETS.harnessCpp, ASSETS.preC, ASSETS.preCpp, ASSETS.stdcxx].map(read))
    const t: Toolchain = {
      clang,
      compile: { c: [], cpp: [] }, link: { c: [], cpp: [] },
      harness: { c: new Uint8Array(), cpp: new Uint8Array() },
      reserved: { c: new Set(), cpp: new Set() },
      files: { pre: { c: preC, cpp: preCpp }, stdcxx },
    }
    for (const lang of ['c', 'cpp'] as const) {
      progress(`Preparing the ${LABEL[lang]} harness`)
      const t0 = performance.now()
      const harnessFile = lang === 'c' ? 'ink/harness.c' : 'ink/harness.cpp'
      const files = { ink: { 'ink-harness.h': harnessH, [lang === 'c' ? 'harness.c' : 'harness.cpp']: lang === 'c' ? harnessC : harnessCpp } }
      const commands = driver(clang, compileArgs(lang, harnessFile, false), files)
      let obj: Uint8Array | null = null
      for (const command of commands) {
        const r = step(clang, command, files)
        if (!r.ok) throw new Error(`the ${LABEL[lang]} harness did not compile: ${r.text.slice(0, 600)}`)
        obj = r.out
      }
      t.harness[lang] = obj!
      timings[`harness_${lang}_ms`] = Math.round(performance.now() - t0)
      // the player's compile and link commands, captured once
      const cc = driver(clang, compileArgs(lang, FILE[lang], true), compileFiles(lang, '', t))
      if (cc.length !== 1) throw new Error(`expected one compiler command, got ${cc.length}`)
      t.compile[lang] = cc[0]
      const ld = driver(clang, [lang === 'c' ? 'clang' : 'clang++', 'solution.o', 'harness.o', '-o', '-', `-Wl,--max-memory=268435456`, ...LINK_FLAGS], { 'solution.o': new Uint8Array(), 'harness.o': new Uint8Array() })
      if (ld.length !== 1) throw new Error(`expected one linker command, got ${ld.length}`)
      t.link[lang] = ld[0]
      // what the harness defines or needs: the player's object may define none of it
      const reserved = new Set<string>()
      for (const s of objectSymbols(obj!)) {
        if (s.local || !s.name) continue
        if (!s.defined || !s.weak) reserved.add(s.name)
      }
      for (const name of ['main', '__main_void', '__main_argc_argv', '_start', '__ink_call_solve']) reserved.add(name)
      reserved.delete(lang === 'c' ? 'solve' : '__ink_call_solve')
      t.reserved[lang] = reserved
    }
    return t
  }

  const runtime: Runtime = {
    id: 'clang',
    version: `Clang/LLD 22 (@yowasp/clang ${CLANG_VERSION}), wasm32-wasip1, wasi-libc, libc++`,

    async load(h: RuntimeHost) {
      host = h
      const t0 = performance.now()
      // on a phone every load label carries the memory note (the page shows the label while it waits)
      const phone = looksLikePhone()
      const progress = (label: string, done = 0, total = 0) => h.progress(phone ? `${label}. ${CLANG_PHONE_NOTE}` : label, done, total)
      installHooks((label) => progress(label))
      const downloading = 'Downloading the C/C++ compiler'
      progress(downloading, 0, 23_100_000)
      const url = options.bundleUrl ?? CLANG_BUNDLE_URL
      const clang = await (options.importBundle ?? ((u: string) => import(/* @vite-ignore */ u) as Promise<ClangBundle>))(url)
      if (typeof clang.runLLVM !== 'function' || typeof clang.Exit !== 'function') throw new Error('the compiler bundle has no runLLVM')
      // fetch the toolchain (llvm.core.wasm goes through the fuel pass in the compileStreaming hook)
      await clang.runLLVM(null, {}, {
        fetchProgress: ({ totalLength, doneLength }: { totalLength: number; doneLength: number }) => progress(downloading, doneLength, totalLength),
      })
      timings.downloadMs = Math.round(performance.now() - t0)
      if (!compilerModule) throw new Error('the compiler module was not prepared (the fuel pass did not run)')
      const read = options.readAsset ?? ((p: string) => h.assetText(p))
      tools = await prepare(clang, read, (label) => progress(label))
      // nothing more to fetch: the program never reaches JavaScript anyway, but leave no network behind
      h.lockdown()
      timings.loadMs = Math.round(performance.now() - t0)
      return {
        version: runtime.version,
        clang: clang.version ?? CLANG_VERSION,
        languages: { c: 'C17 (gnu17)', cpp: 'C++20 (gnu++20, no exceptions)' },
        flags: { c: [...C_FLAGS, ...SANITIZE].join(' '), cpp: [...CXX_FLAGS, ...SANITIZE, '-fsanitize=return'].join(' ') },
        limits: { stackBytes: STACK_BYTES, memoryBytes: 256 * 1024 * 1024, staticArraysBytes: COMPILER_OUTPUT_BYTES },
        fuel: fuelReport ? { functions: fuelReport.functions, loops: fuelReport.loops } : null,
        timings: { ...timings },
        ...(phone ? { warning: CLANG_PHONE_WARNING } : {}),
      }
    },

    async run(job: RuntimeJob, io: RunIO): Promise<RuntimeOutcome> {
      const t = tools
      if (!t || !host) return { status: 'crashed', message: 'The C/C++ compiler is not loaded.', healthy: false }
      if (job.language !== 'c' && job.language !== 'cpp') return { status: 'crashed', message: `clang runs C and C++, not ${job.language}.`, healthy: true }
      const lang: Lang = job.language
      compilerCheck = () => io.check()
      try {
        return compileAndRun(lang, job, io, t)
      } catch (e) {
        if (e && typeof e === 'object' && 'limit' in e) {
          // the compile deadline (io.check() inside the instrumented compiler): it stopped itself
          const limit = io.limit ?? (e as { limit: LimitKind }).limit
          return { status: limit, message: (e as unknown as Error).message, healthy: false }
        }
        throw e
      } finally {
        compilerCheck = () => {}
      }
    },

    dispose() { tools = null; host = null; built.clear() },
  }

  /**
   * The last few programs that compiled, by language and source: Run and then
   * Submit with the same code (the usual order) compiles once. A Module holds
   * no state; runProgram instantiates it afresh for every run.
   */
  const built = new Map<string, { program: WebAssembly.Module; playerFunctions: Set<string>; warnings: Diagnostic[] }>()
  const BUILT_KEPT = 4

  function compileAndRun(lang: Lang, job: RuntimeJob, io: RunIO, t: Toolchain): RuntimeOutcome {
    io.check()
    const key = `${lang}\u0000${job.memoryLimitBytes}\u0000${job.source}`
    const hit = built.get(key)
    if (hit) {
      built.delete(key)
      built.set(key, hit)
      io.started()
      const outcome = runProgram(hit.program, job, io, { lang, playerFunctions: hit.playerFunctions, Instance: realInstance })
      if (hit.warnings.length && (outcome.status === 'ok' || !outcome.diagnostics)) outcome.diagnostics = hit.warnings
      return outcome
    }
    // 1. the player's translation unit
    const compiled = step(t.clang, t.compile[lang], compileFiles(lang, job.source, t))
    const warnings = parseCompilerOutput(compiled.text, lang).filter((d) => d.severity !== 'error')
    if (!compiled.ok) return compileFailure(lang, compiled, io)
    io.check()
    // 2. no hijacking: the player's object may not define what the harness defines or uses
    let symbols: ObjectSymbol[]
    try { symbols = objectSymbols(compiled.out) } catch (e) { return { status: 'compile_error', diagnostics: [{ line: null, column: null, severity: 'error', message: `The compiler produced an unreadable object (${(e as Error).message}).` }] } }
    const clashes = symbols.filter((s) => s.defined && !s.local && t.reserved[lang].has(s.name)).map((s) => s.name)
    if (clashes.some((n) => n === 'main' || n === '__main_void' || n === '__main_argc_argv' || n === '__original_main')) {
      const message = 'Your code defines main(); the game has its own, so remove yours. Write only solve() (and any helpers it calls).'
      return { status: 'compile_error', message, diagnostics: [{ line: null, column: null, severity: 'error', message }, ...warnings] }
    }
    if (clashes.length) {
      return {
        status: 'compile_error',
        message: `Your code defines ${clashes.slice(0, 3).map((n) => `\`${demangleSimple(n)}\``).join(', ')}, which the game's harness uses. Rename ${clashes.length > 1 ? 'them' : 'it'}.`,
        diagnostics: [...clashes.slice(0, 10).map((n): Diagnostic => ({ line: null, column: null, severity: 'error', message: `\`${demangleSimple(n)}\` is used by the game's hidden harness (or the C library it calls); your code may not define it.` })), ...warnings],
      }
    }
    const playerFunctions = new Set(symbols.filter((s) => s.kind === 'function' && s.defined && s.name).map((s) => s.name))
    // 3. link
    const linked = step(t.clang, t.link[lang], { 'solution.o': compiled.out, 'harness.o': t.harness[lang] })
    if (!linked.ok) {
      if (linked.reason === 'too_big') return compileTooBig()
      if (linked.reason === 'out_of_memory') return compilerOutOfMemory(io)
      const diagnostics = parseLinkerOutput(linked.text, lang)
      if (!diagnostics.length) diagnostics.push({ line: null, column: null, severity: 'error', message: `Linking failed: ${linked.text.trim().slice(0, 500) || linked.reason}` })
      return { status: 'compile_error', diagnostics: [...diagnostics, ...warnings] }
    }
    io.check()
    // 4. the fuel pass, and nothing but the shim's imports
    let program: WebAssembly.Module
    try {
      const fueled = instrumentWasm(linked.out, {
        checkImport: { module: 'ink', name: 'check' }, entries: 'all', fuel: PROGRAM_FUEL,
        memoryMaxPages: Math.floor(job.memoryLimitBytes / 65536),
        allowImport: (module, name, kind) => kind === 0 && (module === 'wasi_snapshot_preview1' || (module === 'ink' && ['check', 'phase', 'answer', 'fault'].includes(name))),
      })
      program = new WebAssembly.Module(fueled.bytes as BufferSource)
    } catch (e) {
      const why = e instanceof WasmError ? e.message.replace(/ \(at byte \d+\)$/, '') : String((e as Error)?.message ?? e)
      const message = /^imports /.test(why) ? `Your program ${why}, which this sandbox does not provide.` : `This sandbox cannot run your program: ${why}.`
      return { status: 'compile_error', message, diagnostics: [{ line: null, column: null, severity: 'error', message }, ...warnings] }
    }
    built.set(key, { program, playerFunctions, warnings })
    while (built.size > BUILT_KEPT) built.delete(built.keys().next().value as string)
    // 5. run: the time limit starts now (D1)
    io.started()
    const outcome = runProgram(program, job, io, { lang, playerFunctions, Instance: realInstance })
    if (warnings.length && (outcome.status === 'ok' || !outcome.diagnostics)) outcome.diagnostics = warnings
    return outcome
  }

  function compileTooBig(): RuntimeOutcome {
    const message = `Your global or static arrays are too large to compile here (over ${COMPILER_OUTPUT_BYTES >> 20} MB). Allocate big arrays with malloc (C) or a vector (C++).`
    return { status: 'compile_error', message, diagnostics: [{ line: null, column: null, severity: 'error', message }] }
  }
  function compilerOutOfMemory(io: RunIO): RuntimeOutcome {
    const message = `Compiling your code needed more than the compiler's ${COMPILER_MEMORY_BYTES >> 20} MiB: is there a huge static array? Allocate big arrays with malloc (C) or a vector (C++).`
    io.hit('memory_limit', message)
    return { status: 'memory_limit', message, healthy: false }
  }
  function compileFailure(lang: Lang, r: Extract<StepResult, { ok: false }>, io: RunIO): RuntimeOutcome {
    if (r.reason === 'too_big') return compileTooBig()
    if (r.reason === 'out_of_memory') return compilerOutOfMemory(io)
    if (r.reason === 'stack') {
      const message = 'The compiler ran out of stack: your code is nested too deeply (brackets, templates or macros).'
      return { status: 'compile_error', message, diagnostics: [{ line: null, column: null, severity: 'error', message }], healthy: false }
    }
    const diagnostics = parseCompilerOutput(r.text, lang)
    if (r.reason === 'crash' || !diagnostics.some((d) => d.severity === 'error')) {
      diagnostics.unshift({ line: null, column: null, severity: 'error', message: r.reason === 'crash' ? 'The compiler crashed on this code.' : `The compiler stopped (status ${r.code}).` })
    }
    const text = cleanCompilerText(r.text).trim()
    try { if (text) io.stderr(text.length > STDERR_COMPILER_CHARS ? `${text.slice(0, STDERR_COMPILER_CHARS)}\n…\n` : `${text}\n`) } catch { /* the output limit: the diagnostics still say it */ }
    return { status: 'compile_error', diagnostics, healthy: r.reason !== 'crash' }
  }

  return runtime
}

/**
 * The memory note for phones (load info `warning`, and part of the download
 * label there). Measured by scripts/inkmaze-code/test-runtime-c.mjs (resident
 * memory of the process the sandbox runs in, M5 Max, macOS 26.5): WebKit's
 * WebContent grows by about 1.5 GB (to about 1.6-1.7 GB while compiling C++),
 * Chromium's renderer by about 0.5 GB (to about 0.7 GB). A phone's browser
 * closes or reloads a tab long before a desktop does.
 */
export const CLANG_PHONE_NOTE = 'C and C++ run a full compiler in this tab: it needs about 1.5 GB of memory, and on a phone the browser may reload the page. Python, JavaScript and Java need far less.'
export const CLANG_PHONE_WARNING = `${CLANG_PHONE_NOTE} (About 25 MB to download.)`

/**
 * A phone or a small tablet, as a worker can tell: the mobile UA hint
 * (Chromium), a mobile user agent, or at most 4 GB of device memory
 * (navigator.deviceMemory, Chromium). An iPad that asks for desktop sites
 * says "Macintosh" and has no other sign inside a worker, so it gets no note.
 */
export function looksLikePhone(nav: { userAgent?: string; deviceMemory?: number; userAgentData?: { mobile?: boolean } } | undefined = typeof navigator !== 'undefined' ? (navigator as never) : undefined): boolean {
  if (!nav) return false
  if (nav.userAgentData?.mobile === true) return true
  if (/iPhone|iPad|iPod|Android|Mobile/i.test(nav.userAgent ?? '')) return true
  return typeof nav.deviceMemory === 'number' && nav.deviceMemory > 0 && nav.deviceMemory <= 4
}

export default makeClangRuntime()
