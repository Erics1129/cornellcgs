/**
 * Ink Maze level 26: the fuel pass for QuickJS (the JavaScript runtime's
 * engine), shared by the runtime (scripts/inkmaze-code/build/js-runtime.src.js,
 * bundled into public/minigames/ink-maze-code/javascript/runtime.js) and its
 * tests. No imports but fuel.ts and no side effects, so the bundle takes only
 * these two files.
 *
 * QuickJS's bytecode interpreter polls the interrupt handler on every jump
 * back and every call, so the player's own loops and recursion stop cleanly
 * at the deadline. Its C code does not: a built-in such as a string search
 * over megabytes runs for minutes inside one call. instrumentWasm() puts fuel
 * into that C code (every loop header, the entry of every function that
 * calls, bulk memory ops by length) and calls the "ink.check" import when it
 * runs out. The interpreter function itself goes without fuel: it is the hot
 * loop (a run took about 45% longer with it, about 3% without) and the
 * interrupt handler already covers it.
 */
import { instrumentWasm } from './fuel.ts'
import type { FuelReport } from './fuel.ts'

/** instruction units between two fuel checks (~1-3 ms of QuickJS's C code) */
export const QUICKJS_FUEL = 1 << 20

/** a native call is stopped this long after the deadline, so the interrupt handler (the clean stop) goes first */
export const NATIVE_GRACE_MS = 100

/**
 * QuickJS's bytecode interpreter (JS_CallInternal) in the pinned quickjs.wasm
 * (quickjs-emscripten 0.32.0 release-sync, SHA-256 105c3bed...2232): defined
 * function 202, the module's biggest body by far. If a different wasm is
 * shipped, these no longer match and nothing is exempt (slower, still safe);
 * scripts/inkmaze-code/test-runtime-javascript.mjs checks them.
 */
export const INTERPRETER = { index: 202, bodyBytes: 28980 } as const

/** quickjs.wasm with its fuel, importing ink.check (called with no arguments when the fuel runs out) */
export function instrumentQuickJS(bytes: Uint8Array): FuelReport {
  return instrumentWasm(bytes, {
    addImport: { module: 'ink', name: 'check' },
    entries: 'calls',
    fuel: QUICKJS_FUEL,
    exempt: (index, size) => index === INTERPRETER.index && size === INTERPRETER.bodyBytes,
  })
}
