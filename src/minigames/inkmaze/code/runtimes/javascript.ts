/**
 * Ink Maze level 26: the JavaScript runtime's registration and facts.
 *
 * The runtime itself is public/minigames/ink-maze-code/javascript/runtime.js (a
 * Runtime, contract.ts): the player's JavaScript runs inside QuickJS on
 * WebAssembly, fully self-hosted (no CDN). This module is the TypeScript side
 * the UI and the tests can import. It imports no browser APIs.
 */
import { LANGUAGE_INFO, RUNTIME_INFO } from '../contract.ts'
import { SIGNATURES, STARTER_CODE } from '../problem.ts'
import type { RuntimeFacts } from './python.ts'

export const JAVASCRIPT: RuntimeFacts = {
  languages: ['javascript'],
  runtime: 'javascript',
  engine: 'QuickJS on WebAssembly (quickjs-emscripten)',
  version: 'quickjs-emscripten 0.32.0',
  files: ['javascript/runtime.js', 'javascript/quickjs.wasm', 'javascript/LICENSE-quickjs.txt', 'javascript/PROVENANCE.txt'],
  cdn: [],
  about: 'Your JavaScript runs inside QuickJS, a small engine sandboxed on WebAssembly: a hard memory cap, a time limit it enforces itself, and no way to reach the page. Self-hosted, about 0.56 MB, loaded the first time you pick JavaScript.',
}

/** Problems with how contract.ts / problem.ts describe JavaScript; [] when all is well. */
export function checkConsistency(): string[] {
  const problems: string[] = []
  const lang = LANGUAGE_INFO.javascript
  const rt = RUNTIME_INFO.javascript
  if (lang.runtime !== 'javascript') problems.push(`LANGUAGE_INFO.javascript.runtime is ${lang.runtime}`)
  if (rt.script !== 'javascript/runtime.js') problems.push(`RUNTIME_INFO.javascript.script is ${rt.script}`)
  if (rt.heavy) problems.push('QuickJS is light; RUNTIME_INFO.javascript.heavy should be false')
  if (rt.cdn.length) problems.push('JavaScript is self-hosted; RUNTIME_INFO.javascript.cdn should be empty')
  if (lang.fileName !== 'solution.js') problems.push(`LANGUAGE_INFO.javascript.fileName is ${lang.fileName}`)
  if (!/function solve\(grid, ink\)/.test(SIGNATURES.javascript)) problems.push('SIGNATURES.javascript should be a top-level solve(grid, ink)')
  if (!/function solve\(grid, ink\)/.test(STARTER_CODE.javascript)) problems.push('STARTER_CODE.javascript should define function solve(grid, ink)')
  return problems
}

export default JAVASCRIPT
