/**
 * Ink Maze level 26: one program per language for each kind of result the
 * screen must show, for scripts/test-inkmaze-code-flow.mjs (and handy when
 * trying the level by hand). Every program is a whole file in the player's
 * language with the signature from problem.ts SIGNATURES.
 *
 *   program(language, name, answer?)   the source text
 *   EXPECT[name]                       the status the run must end with
 *   LINE[language][name]               the line a compile or runtime error must point at, when known
 *
 * Names:
 *   answer     returns a fixed string (pass it): the judge's verdict, the ball moves as told
 *   compile    a syntax error
 *   runtime    reads past the end of an array or string
 *   spin       a loop that never ends (Time Limit Exceeded)
 *   recursion  recursion with no end (a stack overflow: Runtime Error)
 *   allocate   keeps allocating (Memory Limit Exceeded)
 *   flood      keeps printing (Output Limit Exceeded)
 *   marker     prints the harness's answer marker itself (the game's runner is broken)
 *   exit       calls exit(3) inside solve (Runtime Error: solve() must return)
 */
import { readFileSync } from 'node:fs'

export const NAMES = ['answer', 'compile', 'runtime', 'spin', 'recursion', 'allocate', 'flood', 'marker', 'exit']

export const EXPECT = {
  answer: 'ok', compile: 'compile_error', runtime: 'runtime_error', spin: 'time_limit', recursion: 'runtime_error',
  allocate: 'memory_limit', flood: 'output_limit', marker: 'crashed', exit: 'runtime_error',
}

const quote = (s) => JSON.stringify(s)

const java = (body, extra = '') => `import java.util.*;

class Solution {
${extra}    public String solve(String[] grid, int ink) {
${body}
    }
}
`
const python = (body, extra = '') => `${extra}class Solution:
    def solve(self, grid, ink):
${body}
`
const javascript = (body, extra = '') => `${extra}function solve(grid, ink) {
${body}
}
`
const c = (body, extra = '') => `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
${extra}
char *solve(char **grid, int rows, int cols, int ink) {
${body}
}
`
const cpp = (body, extra = '') => `#include <bits/stdc++.h>
using namespace std;
${extra}
class Solution {
public:
    string solve(vector<string>& grid, int ink) {
${body}
    }
};
`

const PROGRAMS = {
  java: {
    answer: (a) => java(`        return ${quote(a)};`),
    compile: () => java('        int x = 1\n        return "";'),
    runtime: () => java('        int[] a = new int[2];\n        return "" + a[grid.length + 5];'),
    spin: () => java('        long n = 0;\n        for (;;) n++;'),
    recursion: () => java('        return "" + deeper(0);', '    int deeper(int n) { return deeper(n + 1) + 1; }\n\n'),
    allocate: () => java('        List<long[]> keep = new ArrayList<>();\n        for (;;) keep.add(new long[1 << 20]);'),
    flood: () => java('        for (;;) System.out.println("ink ink ink ink ink ink ink ink");'),
    marker: () => java('        System.out.println("@@ANSWER@@ RRRR");\n        return "";'),
    exit: () => java('        System.exit(3);\n        return "";'),
  },
  python: {
    answer: (a) => python(`        return ${quote(a)}`),
    compile: () => python('        x = (1 +\n        return ""'),
    runtime: () => python('        return grid[len(grid) + 5]'),
    spin: () => python('        n = 0\n        while True:\n            n += 1'),
    recursion: () => python('        return str(deeper(0))', 'def deeper(n):\n    return deeper(n + 1) + 1\n\n'),
    allocate: () => python('        keep = []\n        while True:\n            keep.append(bytearray(1 << 22))'),
    flood: () => python('        while True:\n            print("ink ink ink ink ink ink ink ink")'),
    marker: () => python('        print("@@ANSWER@@ RRRR")\n        return ""'),
    exit: () => python('        import sys\n        sys.exit(3)'),
  },
  javascript: {
    answer: (a) => javascript(`  return ${quote(a)}`),
    compile: () => javascript('  const x = (1 +\n  return ""'),
    runtime: () => javascript('  return grid[grid.length + 5].length'),
    spin: () => javascript('  let n = 0\n  for (;;) n++'),
    recursion: () => javascript('  return String(deeper(0))', 'function deeper(n) { return deeper(n + 1) + 1 }\n\n'),
    allocate: () => javascript('  const keep = []\n  for (;;) keep.push(new Array(1 << 20).fill(7))'),
    flood: () => javascript('  for (;;) console.log("ink ink ink ink ink ink ink ink")'),
    marker: () => javascript('  console.log("@@ANSWER@@ RRRR")\n  return ""'),
    exit: null, // QuickJS has no process.exit
  },
  c: {
    answer: (a) => c(`    return ${quote(a)};`),
    compile: () => c('    int x = 1\n    return "";'),
    runtime: () => c('    int a[2] = {0, 0};\n    volatile int i = rows + 5;\n    a[i] = 1;\n    return a[0] ? "U" : "";'),
    spin: () => c('    volatile long n = 0;\n    for (;;) n++;'),
    recursion: () => c('    static char out[16];\n    snprintf(out, sizeof out, "%d", deeper(0));\n    return out;', 'static int deeper(int n) { volatile char pad[64]; pad[0] = (char)n; return deeper(n + 1) + pad[0]; }\n'),
    allocate: () => c('    for (;;) { sink = malloc(1 << 20); memset(sink, 7, 1 << 20); }', 'static char *volatile sink;\n'),
    flood: () => c('    for (;;) printf("ink ink ink ink ink ink ink ink\\n");'),
    marker: () => c('    printf("@@ANSWER@@ RRRR\\n");\n    return "";'),
    exit: () => c('    exit(3);'),
  },
  cpp: {
    answer: (a) => cpp(`        return ${quote(a)};`),
    compile: () => cpp('        int x = 1\n        return "";'),
    runtime: () => cpp('        vector<int> a(2);\n        volatile int i = grid.size() + 5;\n        return to_string(a[i]);'),
    spin: () => cpp('        volatile long n = 0;\n        for (;;) n++;'),
    recursion: () => cpp('        return to_string(deeper(0));', 'static int deeper(int n) { volatile char pad[64]; pad[0] = (char)n; return deeper(n + 1) + pad[0]; }\n'),
    allocate: () => cpp('        vector<vector<int>> keep;\n        for (;;) keep.emplace_back(1 << 18, 7);'),
    flood: () => cpp('        for (;;) cout << "ink ink ink ink ink ink ink ink\\n";'),
    marker: () => cpp('        cout << "@@ANSWER@@ RRRR" << endl;\n        return "";'),
    exit: () => cpp('        exit(3);'),
  },
}

/** the 1-based line in the player's file of each program's compile error */
export const LINE = {
  java: { compile: 5 }, python: { compile: 3 }, javascript: { compile: 3 }, c: { compile: 6 }, cpp: { compile: 7 },
}

/** The program for a case, or null when the language has no such case. */
export function program(language, name, answer = '') {
  const make = PROGRAMS[language]?.[name]
  return make ? make(answer) : null
}

const SOLUTIONS = new URL('./solutions/', import.meta.url)
const EXT = { java: 'java', python: 'py', javascript: 'js', c: 'c', cpp: 'cpp' }
/** A solution kept for the tests (scripts/inkmaze-code/solutions): 'reference' (memoized search) or 'naive' (ink pruning only). */
export const solution = (language, kind) => readFileSync(new URL(`${language}-${kind}.${EXT[language]}`, SOLUTIONS), 'utf8')
