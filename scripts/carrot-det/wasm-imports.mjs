// Lists a wasm module's imports/features and flags any import that could inject host (browser) dependent math or time.
import { readFileSync } from 'node:fs'
const file = process.argv[2]
const bytes = readFileSync(file)
const mod = new WebAssembly.Module(bytes)
const imports = WebAssembly.Module.imports(mod)
const exports = WebAssembly.Module.exports(mod)
const fns = imports.filter(i => i.kind === 'function').map(i => i.name)
const suspicious = fns.filter(n => /sin|cos|tan|pow|exp|log|sqrt|atan|acos|asin|fmod|floor|ceil|round|math|random|now|time|date|clock|perf/i.test(n))
console.log(JSON.stringify({ file, bytes: bytes.length, imports: imports.length, functionImports: fns.length, byKind: imports.reduce((a, i) => (a[i.kind] = (a[i.kind] || 0) + 1, a), {}), exports: exports.length, suspicious }, null, 1))
// Scan the code section for opcodes: relaxed-simd (0xfd 0x100+), simd prefix 0xfd, atomics 0xfe, fma-like are only in relaxed simd.
let simd = 0, atomics = 0
for (let i = 0; i < bytes.length - 1; i++) { if (bytes[i] === 0xfd) simd++; if (bytes[i] === 0xfe) atomics++ }
console.log('raw byte counts (upper bound, not decoded): 0xfd', simd, '0xfe', atomics)
