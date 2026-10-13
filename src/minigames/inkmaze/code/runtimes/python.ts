/**
 * Ink Maze level 26: the Python runtime's registration and facts.
 *
 * The runtime itself is public/minigames/ink-maze-code/python/runtime.js (a
 * Runtime, contract.ts), loaded into the sandbox by CodeSandbox via
 * RUNTIME_INFO['python'].script. This module is the TypeScript side the UI and
 * the tests can import: the measured facts for an "about this language" line,
 * and checkConsistency(), which asserts that contract.ts and problem.ts agree
 * with what the runtime actually ships. It imports no browser APIs, so Node
 * (the runtime test) can import it too.
 */
import { LANGUAGE_INFO, RUNTIME_INFO } from '../contract.ts'
import { SIGNATURES, STARTER_CODE } from '../problem.ts'

/** The pinned Pyodide CDN this runtime loads from (also in sandbox.html's CSP). */
export const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/'

export type RuntimeFacts = {
  /** the Language ids this runtime serves */
  languages: readonly ('python' | 'javascript' | 'c' | 'cpp')[]
  runtime: 'python' | 'javascript' | 'clang'
  engine: string
  /** what load() reports as info.version */
  version: string
  /** files served under public/minigames/ink-maze-code/<dir>/ */
  files: readonly string[]
  /** CDN prefixes it loads from (empty when fully self-hosted) */
  cdn: readonly string[]
  /** a short note for the UI */
  about: string
}

export const PYTHON: RuntimeFacts = {
  languages: ['python'],
  runtime: 'python',
  engine: 'Pyodide (CPython 3.14 on WebAssembly)',
  version: '314.0.7',
  files: ['python/runtime.js', 'python/driver.py', 'python/harness.py', 'python/PROVENANCE.txt'],
  cdn: [PYODIDE_CDN],
  about: 'Real CPython 3.14 via Pyodide. Downloads about 6 MB the first time you pick Python; after that it is cached. Your code gets exact Python errors with line numbers.',
}

/** Problems with how contract.ts / problem.ts describe Python; [] when all is well. */
export function checkConsistency(): string[] {
  const problems: string[] = []
  const lang = LANGUAGE_INFO.python
  const rt = RUNTIME_INFO.python
  if (lang.runtime !== 'python') problems.push(`LANGUAGE_INFO.python.runtime is ${lang.runtime}`)
  if (rt.script !== 'python/runtime.js') problems.push(`RUNTIME_INFO.python.script is ${rt.script}`)
  if (!rt.heavy) problems.push('Pyodide is heavy; RUNTIME_INFO.python.heavy should be true')
  if (!rt.cdn.includes(PYODIDE_CDN)) problems.push('RUNTIME_INFO.python.cdn is missing the pinned Pyodide CDN')
  if (lang.fileName !== 'solution.py') problems.push(`LANGUAGE_INFO.python.fileName is ${lang.fileName}`)
  if (!/self, grid/.test(SIGNATURES.python)) problems.push('SIGNATURES.python should be a method of Solution')
  if (!/class Solution/.test(STARTER_CODE.python)) problems.push('STARTER_CODE.python should define class Solution')
  if (!/def solve\(self/.test(STARTER_CODE.python)) problems.push('STARTER_CODE.python should define solve(self, ...)')
  return problems
}

export default PYTHON
