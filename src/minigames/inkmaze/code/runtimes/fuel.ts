/**
 * Ink Maze level 26: the fuel pass, a cooperative deadline built into a
 * compiled WebAssembly module (contract.ts D2-D3).
 *
 * WebKit's worker.terminate() does not stop a thread that runs WebAssembly,
 * so code that can run without bound must stop itself. instrumentWasm()
 * rewrites a module: at every function entry and every loop header it
 * subtracts the static size of that region from a fuel counter, and every
 * bulk memory op subtracts length/16; when the fuel runs out it calls a check
 * function import ([] -> []), which throws a JavaScript exception past the
 * deadline. WebAssembly cannot catch a JavaScript exception without the
 * exception-handling feature, which the pass refuses, so the throw unwinds
 * every wasm frame back to the caller. At most about `fuel` instruction units
 * (~1-3 ms at 1 << 20) or one bulk copy run between two checks.
 *
 * Users: the C and C++ runtime (c.ts: the player's linked program, and the
 * compiler at load time, loops only) and the JavaScript runtime
 * (scripts/inkmaze-code/build/js-runtime.src.js: QuickJS's own C code, so a
 * long built-in call such as a string search stops at the deadline too).
 * No imports and no side effects, so a bundle takes only this file.
 */

/** instruction units between two checks unless the caller says otherwise */
export const DEFAULT_FUEL = 1 << 20

export class WasmError extends Error {
  constructor(message: string) { super(message); this.name = 'WasmError' }
}

export type FuelOptions = {
  /** call this existing function import ([] -> []) when the fuel runs out */
  checkImport?: { module: string; name: string }
  /** or add this import ([] -> []) at the end of the import list (defined function indices shift by 1) */
  addImport?: { module: string; name: string }
  /** instruction units between two checks */
  fuel?: number
  /** which function entries get a check: all (the player), only those that make calls, or none (loops only: the compiler) */
  entries?: 'all' | 'calls' | 'none'
  /** cap the defined memory's maximum, in 64 KiB pages */
  memoryMaxPages?: number
  /** which imports may stay; any other is a WasmError */
  allowImport?: (module: string, name: string, kind: number) => boolean
  /**
   * Functions to leave without fuel (no entry or loop checks, bulk ops not
   * metered; calls are still remapped), by defined-function index and body
   * size in bytes. Only for code that stops itself another way: the
   * JavaScript runtime exempts QuickJS's bytecode interpreter, which polls its
   * own interrupt handler on every jump back and every call.
   */
  exempt?: (index: number, bodyBytes: number) => boolean
}

export type FuelReport = {
  bytes: Uint8Array
  functions: number
  /** functions whose entry check was left out (leaves with entries 'calls', all with 'none') */
  skipped: number
  /** functions left without any fuel (options.exempt) */
  exempted: number
  loops: number
  bulk: number
  checkIndex: number
  fuelGlobal: number
  memoryMaxPages: number | null
  imports: Array<{ module: string; name: string; kind: number }>
}

function uleb(n: number, out: number[] = []): number[] {
  do {
    let b = n & 0x7f
    n = Math.floor(n / 128)
    if (n) b |= 0x80
    out.push(b)
  } while (n)
  return out
}
function sleb32(n: number, out: number[] = []): number[] {
  for (;;) {
    const b = n & 0x7f
    n >>= 7
    if ((n === 0 && (b & 0x40) === 0) || (n === -1 && (b & 0x40) !== 0)) { out.push(b); return out }
    out.push(b | 0x80)
  }
}

/**
 * Instruments a WebAssembly module so it cannot run unchecked: see the header.
 * Fails closed: an instruction, section or type it does not know is a
 * WasmError, as are exception handling (it could catch the check's throw),
 * 64-bit memories and imports `allowImport` refuses. DWARF sections are
 * dropped (their code offsets would be stale); the name section is kept
 * unless an import is added.
 */
export function instrumentWasm(input: Uint8Array, options: FuelOptions = {}): FuelReport {
  const buf = input
  const FUEL = options.fuel ?? DEFAULT_FUEL
  const entries = options.entries ?? 'all'
  let p = 0
  const fail = (message: string): never => { throw new WasmError(`${message} (at byte ${p})`) }
  const u32 = (): number => {
    let b = buf[p++]
    if (b < 0x80) return b
    let result = b & 0x7f
    b = buf[p++]; result |= (b & 0x7f) << 7; if (b < 0x80) return result
    b = buf[p++]; result |= (b & 0x7f) << 14; if (b < 0x80) return result
    b = buf[p++]; result |= (b & 0x7f) << 21; if (b < 0x80) return result
    b = buf[p++]
    if (b === undefined || b > 0x0f) fail('bad LEB128')
    return (result | (b << 28)) >>> 0
  }
  const skipLeb = () => { let n = 0; while (buf[p++] & 0x80) { if (++n > 10) fail('bad LEB128') } }
  const decoder = new TextDecoder()
  const name = (): string => {
    const len = u32()
    const s = decoder.decode(buf.subarray(p, p + len))
    p += len
    return s
  }
  const valtype = () => {
    const t = buf[p++]
    if (t === 0x7f || t === 0x7e || t === 0x7d || t === 0x7c || t === 0x7b || t === 0x70 || t === 0x6f) return
    if (t === 0x63 || t === 0x64) { heaptype(); return }
    fail(`unsupported value type 0x${t.toString(16)}`)
  }
  const heaptype = () => {
    const t = buf[p]
    if (t >= 0x69 && t <= 0x74) { p++; return }
    skipLeb()
  }
  const limits = () => {
    const flags = buf[p++]
    if (flags > 3) fail('64-bit memories are not supported')
    skipLeb()
    if (flags & 1) skipLeb()
  }

  if (buf.length < 8 || buf[0] !== 0 || buf[1] !== 0x61 || buf[2] !== 0x73 || buf[3] !== 0x6d || buf[4] !== 1 || buf[5] !== 0 || buf[6] !== 0 || buf[7] !== 0) fail('not a WebAssembly module')

  type Section = { id: number; start: number; end: number; name?: string }
  const sections: Section[] = []
  p = 8
  while (p < buf.length) {
    const id = buf[p++]
    const size = u32()
    const start = p
    const end = p + size
    if (end > buf.length) fail('a section runs past the end')
    const s: Section = { id, start, end }
    if (id === 0) s.name = name()
    sections.push(s)
    p = end
  }
  const find = (id: number) => sections.find((s) => s.id === id)

  const types: Array<{ params: number; results: number }> = []
  const typeSec = find(1)
  if (typeSec) {
    p = typeSec.start
    const n = u32()
    for (let i = 0; i < n; i++) {
      const form = buf[p++]
      if (form !== 0x60) fail(`unsupported type form 0x${form.toString(16)}`)
      const params = u32(); for (let k = 0; k < params; k++) valtype()
      const results = u32(); for (let k = 0; k < results; k++) valtype()
      types.push({ params, results })
    }
  }

  const imports: Array<{ module: string; name: string; kind: number; type: number }> = []
  let funcImports = 0
  let globalImports = 0
  const importSec = find(2)
  if (importSec) {
    p = importSec.start
    const n = u32()
    for (let i = 0; i < n; i++) {
      const module = name()
      const field = name()
      const kind = buf[p++]
      let type = -1
      if (kind === 0) { type = u32(); funcImports++ }
      else if (kind === 1) { valtype(); limits() }
      else if (kind === 2) limits()
      else if (kind === 3) { valtype(); p++; globalImports++ }
      else fail(`unsupported import kind ${kind}`)
      if (options.allowImport && !options.allowImport(module, field, kind)) throw new WasmError(`imports ${module}.${field}`)
      imports.push({ module, name: field, kind, type })
    }
  }

  const funcTypes: number[] = []
  const funcSec = find(3)
  if (funcSec) {
    p = funcSec.start
    const n = u32()
    for (let i = 0; i < n; i++) funcTypes.push(u32())
  }

  const adding = !!options.addImport
  let checkIndex = -1
  let addedType = -1
  if (options.checkImport) {
    let f = 0
    for (const imp of imports) {
      if (imp.kind !== 0) continue
      if (imp.module === options.checkImport.module && imp.name === options.checkImport.name) {
        const t = types[imp.type]
        if (!t || t.params || t.results) fail('the check import must take and return nothing')
        checkIndex = f
      }
      f++
    }
    if (checkIndex < 0) throw new WasmError(`the program does not import ${options.checkImport.module}.${options.checkImport.name}`)
  } else if (adding) {
    checkIndex = funcImports
    addedType = types.findIndex((t) => t.params === 0 && t.results === 0)
  } else {
    fail('instrumentWasm needs checkImport or addImport')
  }
  const remap = (f: number) => (adding && f >= funcImports ? f + 1 : f)

  const globalSec = find(6)
  if (!globalSec) fail('the module has no globals')
  p = globalSec!.start
  const fuelGlobal = globalImports + u32()

  // ---- output: one pass; sizes are 5-byte (padded) LEB128s patched afterwards
  let out = new Uint8Array(Math.ceil(buf.length * 1.12) + 65536)
  let o = 0
  const ensure = (n: number) => {
    if (o + n <= out.length) return
    const bigger = new Uint8Array(Math.max(Math.floor(out.length * 1.5), o + n + 65536))
    bigger.set(out.subarray(0, o))
    out = bigger
  }
  const emit = (b: number) => { ensure(1); out[o++] = b }
  const emitBytes = (bytes: ArrayLike<number>) => { ensure(bytes.length); for (let i = 0; i < bytes.length; i++) out[o++] = bytes[i] }
  const copy = (from: number, to: number) => { if (to <= from) return; ensure(to - from); out.set(buf.subarray(from, to), o); o += to - from }
  const placeholder = () => { ensure(5); const at = o; out[o++] = 0x80; out[o++] = 0x80; out[o++] = 0x80; out[o++] = 0x80; out[o++] = 0; return at }
  const patch5 = (at: number, n: number) => {
    out[at] = (n & 0x7f) | 0x80
    out[at + 1] = ((n >>> 7) & 0x7f) | 0x80
    out[at + 2] = ((n >>> 14) & 0x7f) | 0x80
    out[at + 3] = ((n >>> 21) & 0x7f) | 0x80
    out[at + 4] = (n >>> 28) & 0x0f
  }
  const section = (id: number, write: () => void) => {
    emit(id)
    const at = placeholder()
    const start = o
    write()
    patch5(at, o - start)
  }
  const verbatim = (s: Section) => { emit(s.id); emitBytes(uleb(s.end - s.start)); copy(s.start, s.end) }

  const g = uleb(fuelGlobal)
  const c = uleb(checkIndex)
  const fuelBytes = sleb32(FUEL)
  /** fuel -= W; if (fuel <= 0) { fuel = FUEL; check() }; W (a padded i32.const) is patched when the region closes */
  const fuelSnippet = (): number => {
    emit(0x23); emitBytes(g)
    emit(0x41); const at = placeholder()
    emit(0x6b)
    emit(0x24); emitBytes(g)
    emit(0x23); emitBytes(g)
    emit(0x41); emit(0)
    emit(0x4c)
    emit(0x04); emit(0x40)
    emit(0x41); emitBytes(fuelBytes)
    emit(0x24); emitBytes(g)
    emit(0x10); emitBytes(c)
    emit(0x0b)
    return at
  }
  /** before memory.copy/fill/init (operands d, s|v, n): fuel -= n >> 4, then the same test */
  const bulkSnippet = (scratch: number[]) => {
    emit(0x22); emitBytes(scratch)
    emit(0x23); emitBytes(g)
    emit(0x20); emitBytes(scratch)
    emit(0x41); emit(4)
    emit(0x76)
    emit(0x6b)
    emit(0x24); emitBytes(g)
    emit(0x23); emitBytes(g)
    emit(0x41); emit(0)
    emit(0x4c)
    emit(0x04); emit(0x40)
    emit(0x41); emitBytes(fuelBytes)
    emit(0x24); emitBytes(g)
    emit(0x10); emitBytes(c)
    emit(0x0b)
  }

  let loops = 0
  let bulk = 0
  let functions = 0
  let skipped = 0
  let exempted = 0
  let memoryMaxPages: number | null = null

  const blocktype = () => {
    const b = buf[p]
    if (b === 0x40 || b === 0x7f || b === 0x7e || b === 0x7d || b === 0x7c || b === 0x7b || b === 0x70 || b === 0x6f) { p++; return }
    if (b === 0x63 || b === 0x64) { p++; heaptype(); return }
    skipLeb()
  }
  const memarg = () => {
    const align = u32()
    if (align & 0x40) skipLeb()
    skipLeb()
  }
  const simd = () => {
    const sub = u32()
    if (sub <= 0x0b || sub === 0x5c || sub === 0x5d) { memarg(); return }
    if (sub === 0x0c || sub === 0x0d) { p += 16; return }
    if (sub >= 0x15 && sub <= 0x22) { p += 1; return }
    if (sub >= 0x54 && sub <= 0x5b) { memarg(); p += 1; return }
    if (sub <= 0x113) return
    fail(`unsupported instruction 0xfd ${sub}`)
  }
  const atomic = () => {
    const sub = u32()
    if (sub === 0x03) { p += 1; return }
    if (sub <= 0x02 || (sub >= 0x10 && sub <= 0x4e)) { memarg(); return }
    fail(`unsupported instruction 0xfe ${sub}`)
  }
  /** skips the immediates of a plain instruction */
  const immediates = (op: number) => {
    if (op >= 0x45 && op <= 0xc4) return
    switch (op) {
      case 0x00: case 0x01: case 0x0f: case 0x1a: case 0x1b: case 0xd1: case 0xd3: case 0xd5: return
      case 0x0c: case 0x0d: case 0xd4: case 0xd6: skipLeb(); return
      case 0x0e: { const n = u32(); for (let i = 0; i <= n; i++) skipLeb(); return }
      case 0x11: case 0x13: skipLeb(); skipLeb(); return
      case 0x14: case 0x15: skipLeb(); return
      case 0x1c: { const n = u32(); for (let i = 0; i < n; i++) valtype(); return }
      case 0x20: case 0x21: case 0x22: case 0x23: case 0x24: case 0x25: case 0x26: skipLeb(); return
      case 0x3f: case 0x40: skipLeb(); return
      case 0x41: case 0x42: skipLeb(); return
      case 0x43: p += 4; return
      case 0x44: p += 8; return
      case 0xd0: heaptype(); return
      case 0xfd: simd(); return
      case 0xfe: atomic(); return
    }
    if (op >= 0x28 && op <= 0x3e) { memarg(); return }
    fail(`unsupported instruction 0x${op.toString(16)}`)
  }
  /** a constant expression, copied with ref.func remapped */
  const constExpr = () => {
    for (;;) {
      const op = buf[p++]
      emit(op)
      switch (op) {
        case 0x0b: return
        case 0x41: case 0x42: case 0x23: { const a = p; skipLeb(); copy(a, p); break }
        case 0x43: copy(p, p + 4); p += 4; break
        case 0x44: copy(p, p + 8); p += 8; break
        case 0xd0: { const a = p; heaptype(); copy(a, p); break }
        case 0xd2: emitBytes(uleb(remap(u32()))); break
        case 0x6a: case 0x6b: case 0x6c: case 0x7c: case 0x7d: case 0x7e: break
        default: fail(`unsupported constant expression opcode 0x${op.toString(16)}`)
      }
    }
  }

  /** one function body: fuel checks at its entry and loops, bulk ops metered, calls remapped */
  const body = (index: number, end: number) => {
    const sizeAt = placeholder()
    const bodyStart = o
    const t = types[funcTypes[index]]
    if (!t) fail('a function has an unknown type')
    // an exempt function keeps its code as it is (only calls are remapped)
    const plain = !!options.exempt?.(index, end - p)
    if (plain) exempted++
    const localsStart = p
    const groups = u32()
    const groupsStart = p
    let declared = 0
    for (let k = 0; k < groups; k++) { declared += u32(); valtype() }
    // a bulk memory op needs one scratch i32 local; any 0xfc byte is a cheap over-estimate
    let needsScratch = false
    for (let k = p; k < end; k++) if (buf[k] === 0xfc) { needsScratch = true; break }
    let scratch: number[] = []
    if (needsScratch) {
      scratch = uleb(t.params + declared)
      emitBytes(uleb(groups + 1))
      copy(groupsStart, p)
      emitBytes([1, 0x7f])
    } else {
      copy(localsStart, p)
    }
    // regions (the body, each loop) and their weights; bytes are copied lazily from `pending`
    let pending = p
    const flush = (upTo: number) => { copy(pending, upTo); pending = upTo }
    const frames: number[] = []
    const weightAt: number[] = []
    const weight: number[] = []
    const regions: number[] = [0]
    let region = 0
    const entryStart = o
    weightAt.push(plain ? -1 : fuelSnippet()); weight.push(0)
    const entryEnd = o
    let depth = 1
    let calls = false
    while (p < end) {
      const op = buf[p]
      weight[region]++
      if (op === 0x0b) {
        p++
        if (--depth === 0) {
          if (p !== end) fail('code after the end of a function')
          break
        }
        if (frames.pop()! >= 0) { regions.pop(); region = regions[regions.length - 1] }
        continue
      }
      if (op === 0x02 || op === 0x04) { p++; blocktype(); frames.push(-1); depth++; continue }
      if (op === 0x03) {
        p++; blocktype()
        flush(p)
        const r = weight.length
        weightAt.push(plain ? -1 : fuelSnippet()); weight.push(0)
        regions.push(r); region = r
        frames.push(r); depth++
        if (!plain) loops++
        continue
      }
      if (op === 0x10 || op === 0x12 || op === 0xd2) {
        if (op !== 0xd2) calls = true
        if (!adding) { p++; skipLeb(); continue }
        flush(p)
        p++
        const f = u32()
        emit(op); emitBytes(uleb(remap(f)))
        pending = p
        continue
      }
      if (op === 0x11 || op === 0x13 || op === 0x14 || op === 0x15) calls = true
      if (op === 0xfc) {
        const a = p
        p++
        const sub = u32()
        if (!plain && (sub === 8 || sub === 10 || sub === 11)) {
          if (!needsScratch) fail('internal: a bulk op without a scratch local')
          flush(a)
          bulkSnippet(scratch)
          bulk++
        }
        if (sub <= 7) { /* saturating truncation */ }
        else if (sub === 8 || sub === 10 || sub === 12 || sub === 14) { skipLeb(); skipLeb() }
        else if (sub === 9 || sub === 11 || sub === 13 || sub === 15 || sub === 16 || sub === 17) skipLeb()
        else fail(`unsupported instruction 0xfc ${sub}`)
        continue
      }
      if (op === 0x05) { p++; continue }
      if (op === 0x06 || op === 0x07 || op === 0x08 || op === 0x09 || op === 0x0a || op === 0x18 || op === 0x19 || op === 0x1f) {
        fail('exception handling is not supported')
      }
      p++
      immediates(op)
    }
    if (depth !== 0) fail('a function body is not closed')
    flush(end)
    if (entries === 'none' || (entries === 'calls' && !calls)) {
      // a leaf cannot recurse, and its loops carry their own checks
      const len = entryEnd - entryStart
      out.copyWithin(entryStart, entryEnd, o)
      o -= len
      weightAt[0] = -1
      for (let k = 1; k < weightAt.length; k++) weightAt[k] -= len
      skipped++
    }
    for (let k = 0; k < weightAt.length; k++) if (weightAt[k] >= 0) patch5(weightAt[k], Math.max(1, Math.min(weight[k], FUEL)))
    patch5(sizeAt, o - bodyStart)
  }

  emitBytes([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0])
  for (const s of sections) {
    switch (s.id) {
      case 0: {
        const nm = s.name!
        if (nm.startsWith('.debug') || nm === 'sourceMappingURL' || nm === 'external_debug_info') break
        if (nm === 'name' && adding) break
        if (nm === 'linking' || nm.startsWith('reloc.')) fail('a relocatable object cannot be instrumented')
        verbatim(s)
        break
      }
      case 1:
        if (adding && addedType < 0) {
          section(1, () => { p = s.start; const n = u32(); emitBytes(uleb(n + 1)); copy(p, s.end); emitBytes([0x60, 0, 0]) })
          addedType = types.length
        } else verbatim(s)
        break
      case 2:
        if (!adding) { verbatim(s); break }
        section(2, () => {
          p = s.start
          const n = u32()
          emitBytes(uleb(n + 1)); copy(p, s.end)
          const enc = new TextEncoder()
          const m = enc.encode(options.addImport!.module)
          const nm = enc.encode(options.addImport!.name)
          emitBytes(uleb(m.length)); emitBytes(m); emitBytes(uleb(nm.length)); emitBytes(nm)
          emit(0); emitBytes(uleb(addedType))
        })
        break
      case 5:
        section(5, () => {
          p = s.start
          const n = u32()
          emitBytes(uleb(n))
          for (let i = 0; i < n; i++) {
            const flags = buf[p++]
            if (flags > 3) fail('64-bit memories are not supported')
            const min = u32()
            let max = flags & 1 ? u32() : 65536
            if (options.memoryMaxPages !== undefined) {
              if (min > options.memoryMaxPages) throw new WasmError(`needs ${min * 64} KiB of memory at start, more than ${options.memoryMaxPages * 64} KiB`)
              max = Math.min(max, options.memoryMaxPages)
            }
            memoryMaxPages = max
            emit(flags | 1); emitBytes(uleb(min)); emitBytes(uleb(max))
          }
        })
        break
      case 6:
        section(6, () => {
          p = s.start
          const n = u32()
          emitBytes(uleb(n + 1)); copy(p, s.end)
          emitBytes([0x7f, 0x01, 0x41]); emitBytes(fuelBytes); emit(0x0b)
        })
        break
      case 7:
        if (!adding) { verbatim(s); break }
        section(7, () => {
          p = s.start
          const n = u32()
          emitBytes(uleb(n))
          for (let i = 0; i < n; i++) {
            const nameStart = p
            const len = u32(); p += len
            copy(nameStart, p)
            const kind = buf[p++]
            const idx = u32()
            emit(kind); emitBytes(uleb(kind === 0 ? remap(idx) : idx))
          }
        })
        break
      case 8: {
        p = s.start
        const idx = u32()
        section(8, () => emitBytes(uleb(remap(idx))))
        break
      }
      case 9:
        if (!adding) { verbatim(s); break }
        section(9, () => {
          p = s.start
          const n = u32()
          emitBytes(uleb(n))
          for (let i = 0; i < n; i++) {
            const flags = u32()
            emitBytes(uleb(flags))
            if (flags > 7) fail(`unsupported element segment ${flags}`)
            if (flags === 2 || flags === 6) emitBytes(uleb(u32()))
            if (!(flags & 1)) constExpr()
            if (flags & 4) {
              if (flags & 3) { const t0 = p; valtype(); copy(t0, p) }
              const count = u32(); emitBytes(uleb(count))
              for (let k = 0; k < count; k++) constExpr()
            } else {
              if (flags & 3) emit(buf[p++])
              const count = u32(); emitBytes(uleb(count))
              for (let k = 0; k < count; k++) emitBytes(uleb(remap(u32())))
            }
          }
        })
        break
      case 10:
        section(10, () => {
          p = s.start
          const n = u32()
          if (n !== funcTypes.length) fail('the function and code sections disagree')
          emitBytes(uleb(n))
          for (let i = 0; i < n; i++) {
            const size = u32()
            const end = p + size
            if (end > s.end) fail('a function body runs past its section')
            body(i, end)
            p = end
          }
          functions = n
        })
        break
      case 13:
        fail('exception handling is not supported')
        break
      default:
        verbatim(s)
    }
  }

  return {
    bytes: out.subarray(0, o),
    functions, skipped, exempted, loops, bulk, checkIndex, fuelGlobal, memoryMaxPages,
    imports: imports.map(({ module, name: n, kind }) => ({ module, name: n, kind })),
  }
}
